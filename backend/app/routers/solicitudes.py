"""Endpoints de solicitudes de servicio.

Etapa 2 — lo que hace el USUARIO (enfermería/médico):
  - Crear una solicitud de servicio.
  - Ver las suyas (y su estado).

(Los endpoints del coordinador —aceptar/rechazar/modificar— son la Etapa 3.)

Solo pueden crear y ver sus solicitudes los usuarios con rol "enfermeria"
(el rol que agrupa a médicos y enfermeros de piso en este sistema — son
quienes usan los equipos, a diferencia de "tecnico", que los repara).
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import SolicitudServicio, Activo, Usuario
from ..schemas import SolicitudCrear, SolicitudOut
from ..security import get_current_user, requiere_rol

router = APIRouter(prefix="/solicitudes", tags=["solicitudes_servicio"])


# ═══════════════════════════════════════════════════════════════════════════
# CREAR SOLICITUD (POST) — la hace el usuario
# ═══════════════════════════════════════════════════════════════════════════

@router.post("", response_model=SolicitudOut, status_code=201)
def crear_solicitud(
    payload: SolicitudCrear,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("enfermeria")),
):
    """Crear una solicitud de servicio.

    El solicitante es el usuario logueado (no se manda, se toma de current_user).

    Regla "equipo o cosa" (según es_equipo_medico):
      - es_equipo_medico=True  → activo_codigo obligatorio.
      - es_equipo_medico=False → descripcion_cosa obligatoria.
    El campo que no corresponde se ignora aunque venga cargado, para que no
    quede una solicitud ambigua (con los dos, o con ninguno).
    """
    # 1. Validar la regla "equipo o cosa" según lo que eligió el usuario.
    if payload.es_equipo_medico:
        if not payload.activo_codigo:
            raise HTTPException(
                status_code=400,
                detail="Es un equipo médico: indicá el ID del equipo (activo_codigo).",
            )
        activo_codigo = payload.activo_codigo
        descripcion_cosa = None

        # Si mandó un activo, verificar que exista.
        activo = db.query(Activo).filter(Activo.codigo == activo_codigo).first()
        if activo is None:
            raise HTTPException(
                status_code=404,
                detail=f"No existe el activo {activo_codigo}.",
            )
    else:
        if not payload.descripcion_cosa:
            raise HTTPException(
                status_code=400,
                detail="No es un equipo médico: describí qué es (descripcion_cosa).",
            )
        activo_codigo = None
        descripcion_cosa = payload.descripcion_cosa

    # 2. La persona afectada: si no la indican, es el propio solicitante.
    persona_afectada = payload.persona_afectada_id or current_user.id

    # 3. Título: si no lo mandaron, se genera uno automático y legible.
    titulo = payload.titulo or f"Solicitud de servicio — {activo_codigo or descripcion_cosa}"

    # 4. Crear la solicitud. Nace PENDIENTE, esperando que un coordinador la revise.
    solicitud = SolicitudServicio(
        solicitante_id=current_user.id,
        persona_afectada_id=persona_afectada,
        activo_codigo=activo_codigo,
        descripcion_cosa=descripcion_cosa,
        titulo=titulo,
        descripcion_problema=payload.descripcion_problema,
        ubicacion=payload.ubicacion,
        estado="PENDIENTE",
        created_at=datetime.utcnow(),
    )
    db.add(solicitud)
    db.commit()
    db.refresh(solicitud)
    return solicitud


# ═══════════════════════════════════════════════════════════════════════════
# VER MIS SOLICITUDES (GET) — las que creó el usuario logueado
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/mias", response_model=list[SolicitudOut])
def mis_solicitudes(
    estado: str | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("enfermeria")),
):
    """Las solicitudes que creó el usuario logueado.

    Opcional: filtrar por estado (PENDIENTE / ACEPTADA / RECHAZADA) para armar
    las vistas 'en curso / rechazadas / resueltas' del panel del usuario.
    """
    q = db.query(SolicitudServicio).filter(
        SolicitudServicio.solicitante_id == current_user.id
    )
    if estado is not None:
        q = q.filter(SolicitudServicio.estado == estado)
    return q.order_by(SolicitudServicio.created_at.desc()).all()


@router.get("/pendientes", response_model=list[SolicitudOut])
def solicitudes_pendientes(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("coordinacion")),
):
    """Solicitudes PENDIENTES que le corresponden a este coordinador.

    Incluye: las de equipos cuyos grupos coordina, MÁS las de 'cosa' (sin equipo),
    que se muestran a todos los coordinadores para que alguno las tome (esas no
    tienen grupo hasta que el coordinador se lo asigne a mano).
    """
    mis_grupos = _grupos_del_coordinador(db, current_user.id)

    pendientes = db.query(SolicitudServicio).filter(
        SolicitudServicio.estado == "PENDIENTE"
    ).all()

    resultado = []
    for s in pendientes:
        if s.activo_codigo:
            grupo = _grupo_de_activo(db, s.activo_codigo)
            if grupo in mis_grupos:
                resultado.append(s)
        else:
            # solicitud de 'cosa': sin grupo deducible, la ven todos los coord.
            resultado.append(s)
    return resultado


@router.get("/{solicitud_id}", response_model=SolicitudOut)
def ver_solicitud(
    solicitud_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Ver una solicitud puntual por su id."""
    sol = db.query(SolicitudServicio).filter(
        SolicitudServicio.id == solicitud_id
    ).first()
    if sol is None:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    return sol


# ═══════════════════════════════════════════════════════════════════════════
# ETAPA 3 — LADO DEL COORDINADOR
# ═══════════════════════════════════════════════════════════════════════════
# Un coordinador ve y gestiona las solicitudes de SUS grupos. La cadena es:
#   solicitud → activo → tipo de equipo → grupo → coordinador
# Para solicitudes de 'cosa' (sin equipo) el grupo no se deduce; el coordinador
# lo elige a mano al aceptar.
# ═══════════════════════════════════════════════════════════════════════════

from datetime import datetime as _dt
from sqlalchemy import func as _func
from ..models import (
    GrupoTecnico,
    GrupoTipoEquipo,
    OrdenTrabajo,
)
from ..schemas import SolicitudAceptar, SolicitudRechazar, SolicitudModificar


def _grupos_del_coordinador(db, coordinador_id):
    """Lista de ids de grupos que coordina este usuario."""
    grupos = db.query(GrupoTecnico).filter(
        GrupoTecnico.coordinador_id == coordinador_id
    ).all()
    return [g.id for g in grupos]


def _grupo_de_activo(db, activo_codigo):
    """Qué grupo atiende el equipo (vía su tipo). None si no se puede deducir."""
    activo = db.query(Activo).filter(Activo.codigo == activo_codigo).first()
    if activo is None or activo.tipo_equipo_id is None:
        return None
    rel = db.query(GrupoTipoEquipo).filter(
        GrupoTipoEquipo.tipo_equipo_id == activo.tipo_equipo_id
    ).first()
    return rel.grupo_id if rel else None


@router.patch("/{solicitud_id}/aceptar", response_model=SolicitudOut)
def aceptar_solicitud(
    solicitud_id: str,
    payload: SolicitudAceptar,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("coordinacion")),
):
    """Aceptar una solicitud: genera la OT, asignada a una persona o "sin asignar".

    Reglas:
      - Si se manda asignar_a_id, la persona debe ser de un grupo que coordine
        el coordinador. Si no se manda, la OT nace ABIERTA sin técnico (se
        asigna después con PATCH /ordenes-trabajo/{id}/asignar).
      - Para solicitudes de equipo, el grupo sale del equipo. Para las de 'cosa',
        el coordinador manda grupo_id.
    """
    sol = db.query(SolicitudServicio).filter(
        SolicitudServicio.id == solicitud_id
    ).first()
    if sol is None:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if sol.estado != "PENDIENTE":
        raise HTTPException(status_code=400, detail=f"La solicitud ya está {sol.estado}.")

    mis_grupos = _grupos_del_coordinador(db, current_user.id)

    # Determinar el grupo destino.
    if sol.activo_codigo:
        grupo_destino = _grupo_de_activo(db, sol.activo_codigo)
    else:
        # solicitud de cosa: el coordinador tiene que indicar el grupo
        if not payload.grupo_id:
            raise HTTPException(
                status_code=400,
                detail="Esta solicitud no es de un equipo: indicá grupo_id.",
            )
        grupo_destino = payload.grupo_id

    if grupo_destino not in mis_grupos:
        raise HTTPException(
            status_code=403,
            detail="Solo podés aceptar solicitudes de los grupos que coordinás.",
        )

    # Si se indicó a quién asignarla, verificar que exista y sea del grupo destino.
    # Si no se indicó, la OT nace "sin asignar" (tecnico_id None) y se asigna después.
    tecnico_id = None
    if payload.asignar_a_id:
        persona = db.query(Usuario).filter(Usuario.id == payload.asignar_a_id).first()
        if persona is None:
            raise HTTPException(status_code=404, detail="La persona a asignar no existe.")
        if persona.grupo != grupo_destino:
            raise HTTPException(
                status_code=400,
                detail=f"La persona no pertenece al grupo {grupo_destino}.",
            )
        tecnico_id = payload.asignar_a_id

    # Crear la OT correctiva. ABIERTA es el estado de nacimiento de toda OT
    # (igual que en /ordenes-trabajo); "sin asignar" se distingue por tecnico_id=None.
    ultimo = db.query(_func.max(OrdenTrabajo.numero_ot)).scalar()
    numero_ot = (ultimo or 0) + 1
    orden = OrdenTrabajo(
        numero_ot=numero_ot,
        activo_codigo=sol.activo_codigo,
        tipo="CORRECTIVA",
        estado="ABIERTA",
        prioridad=(payload.prioridad.upper() if payload.prioridad else None),
        descripcion=f"{sol.titulo}: {sol.descripcion_problema}",
        tecnico_id=tecnico_id,
        grupo_id=grupo_destino,
        fecha_notificacion=sol.created_at,   # cuándo se avisó (creación de la solicitud)
        fecha_apertura=_dt.utcnow(),         # cuándo se abre la OT (ahora)
    )
    db.add(orden)
    db.flush()   # para obtener el id de la OT

    # Marcar la solicitud como aceptada y vincular la OT.
    sol.estado = "ACEPTADA"
    sol.ot_id = orden.id

    db.commit()
    db.refresh(sol)
    return sol


@router.patch("/{solicitud_id}/rechazar", response_model=SolicitudOut)
def rechazar_solicitud(
    solicitud_id: str,
    payload: SolicitudRechazar,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("coordinacion")),
):
    """Rechazar una solicitud, con un motivo. Queda registrada como RECHAZADA."""
    sol = db.query(SolicitudServicio).filter(
        SolicitudServicio.id == solicitud_id
    ).first()
    if sol is None:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if sol.estado != "PENDIENTE":
        raise HTTPException(status_code=400, detail=f"La solicitud ya está {sol.estado}.")

    sol.estado = "RECHAZADA"
    sol.motivo_rechazo = payload.motivo_rechazo
    db.commit()
    db.refresh(sol)
    return sol


@router.patch("/{solicitud_id}/modificar", response_model=SolicitudOut)
def modificar_solicitud(
    solicitud_id: str,
    payload: SolicitudModificar,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("coordinacion")),
):
    """Corregir una solicitud mal hecha antes de aceptarla. Solo cambia los
    campos que se manden; los demás quedan igual."""
    sol = db.query(SolicitudServicio).filter(
        SolicitudServicio.id == solicitud_id
    ).first()
    if sol is None:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if sol.estado != "PENDIENTE":
        raise HTTPException(status_code=400, detail="Solo se modifican solicitudes pendientes.")

    if payload.titulo is not None:
        sol.titulo = payload.titulo
    if payload.descripcion_problema is not None:
        sol.descripcion_problema = payload.descripcion_problema
    if payload.activo_codigo is not None:
        # validar que el activo exista
        if db.query(Activo).filter(Activo.codigo == payload.activo_codigo).first() is None:
            raise HTTPException(status_code=404, detail=f"No existe el activo {payload.activo_codigo}.")
        sol.activo_codigo = payload.activo_codigo
    if payload.descripcion_cosa is not None:
        sol.descripcion_cosa = payload.descripcion_cosa

    db.commit()
    db.refresh(sol)
    return sol