"""Endpoints de checklists de mantenimiento.

Dos conceptos distintos (importante no confundirlos):

  PLANTILLA (checklist_items): qué hay que revisar para cada tipo de MP. Es fijo.
    Ej: "MP anual de monitor" tiene 6 pasos: inspección visual, verificar alarmas...

  RESPUESTAS (checklist_respuestas): qué se cumplió en UN mantenimiento concreto.
    Ej: en el MP del 15/03 del monitor X, el paso 1 se completó, el paso 2 no...

Por eso hay dos tipos de endpoint:
  - GET: ver el checklist de una plantilla, y ver las respuestas de un MP.
  - POST: registrar la respuesta a un ítem (lo que llena el técnico).

Todos protegidos con login (get_current_user).

Estado:
  - GET: funcionando.
  - POST: escrito y ACTIVO (ya hay datos para probarlo). Registra una respuesta.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    ChecklistItem,
    ChecklistRespuesta,
    PlantillaMP,
    MantenimientoPreventivo,
    OrdenTrabajo,
    Activo,
    Usuario,
)
from ..schemas import (
    ChecklistItemOut,
    ChecklistRespuestaOut,
    ChecklistRespuestaCreate,
    GenerarCorrectivaDesdeChecklist,
    OrdenTrabajoOut,
)

from ..security import get_current_user, requiere_rol, grupos_del_coordinador


def _validar_permiso_sobre_mp(db: Session, current_user: Usuario, mp: MantenimientoPreventivo) -> None:
    """Valida que el usuario pueda tocar el checklist de este MP.

    Mismo criterio que en el resto de las acciones sobre una OT (bitácora,
    reasignar, correctiva asociada): técnico/junior del grupo de la OT
    preventiva, o coordinación de ese grupo. Jefatura pasa siempre (lo
    resuelve requiere_rol antes de llegar acá). Si el MP no está enganchado
    a ninguna OT (no debería pasar con los generados por /preventivas/generar,
    pero por las dudas), no se restringe por grupo.
    """
    if not mp.ot_id:
        return
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == mp.ot_id).first()
    if orden is None or orden.grupo_id is None:
        return
    if current_user.rol in ("tecnico", "junior") and current_user.grupo != orden.grupo_id:
        raise HTTPException(
            status_code=403,
            detail="Solo podés completar el checklist de OT de tu propio grupo.",
        )
    if current_user.rol == "coordinacion" and orden.grupo_id not in grupos_del_coordinador(db, current_user):
        raise HTTPException(
            status_code=403,
            detail="Solo podés completar el checklist de OT de los grupos que coordinás.",
        )

router = APIRouter(prefix="/checklists", tags=["checklists"])


# ═══════════════════════════════════════════════════════════════════════════
# VER LA PLANTILLA (GET) — qué hay que revisar
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/plantilla/{plantilla_mp_id}", response_model=list[ChecklistItemOut])
def ver_checklist_de_plantilla(
    plantilla_mp_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Ver los ítems de checklist de una plantilla de MP, ordenados por paso.

    Esto es lo que se le muestra al técnico como guía cuando va a hacer el MP:
    la lista de puntos a revisar, en orden.
    """
    items = (
        db.query(ChecklistItem)
        .filter(ChecklistItem.plantilla_mp_id == plantilla_mp_id)
        .order_by(ChecklistItem.orden)
        .all()
    )
    return items


# ═══════════════════════════════════════════════════════════════════════════
# VER LAS RESPUESTAS DE UN MP (GET) — qué se cumplió en un mantenimiento
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/respuestas/{mp_id}", response_model=list[ChecklistRespuestaOut])
def ver_respuestas_de_mp(
    mp_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Ver las respuestas registradas en un mantenimiento concreto.

    Muestra, para ese MP, qué puntos del checklist se marcaron como completados.
    """
    respuestas = (
        db.query(ChecklistRespuesta)
        .filter(ChecklistRespuesta.mp_id == mp_id)
        .all()
    )
    return respuestas


# ═══════════════════════════════════════════════════════════════════════════
# REGISTRAR UNA RESPUESTA (POST) — lo que llena el técnico
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/respuestas", response_model=ChecklistRespuestaOut, status_code=201)
def registrar_respuesta(
    payload: ChecklistRespuestaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "junior", "coordinacion")),
):
    """Registrar la respuesta a un ítem del checklist en un MP concreto.

    Verifica que el MP y el ítem existan antes de guardar (para no dejar
    respuestas colgadas que apunten a cosas que no existen).
    """
    # 1. El MP tiene que existir.
    mp = db.query(MantenimientoPreventivo).filter(
        MantenimientoPreventivo.id == payload.mp_id
    ).first()
    if mp is None:
        raise HTTPException(status_code=404, detail="El mantenimiento no existe.")
    _validar_permiso_sobre_mp(db, current_user, mp)

    # 2. El ítem de checklist tiene que existir.
    item = db.query(ChecklistItem).filter(
        ChecklistItem.id == payload.checklist_item_id
    ).first()
    if item is None:
        raise HTTPException(status_code=404, detail="El ítem de checklist no existe.")

    # 3. Crear la respuesta.
    respuesta = ChecklistRespuesta(
        mp_id=payload.mp_id,
        checklist_item_id=payload.checklist_item_id,
        completado=payload.completado,
        observacion=payload.observacion,
        completado_por=payload.completado_por,
    )
    db.add(respuesta)
    db.commit()
    db.refresh(respuesta)
    return respuesta


# ═══════════════════════════════════════════════════════════════════════════
# COMBO: registrar NO_PASA + generar OT correctiva (opcional, elige la persona)
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/generar-correctiva", response_model=OrdenTrabajoOut, status_code=201)
def generar_correctiva_desde_checklist(
    payload: GenerarCorrectivaDesdeChecklist,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "junior", "coordinacion")),
):
    """Registra un ítem como NO_PASA y crea la OT correctiva para ese equipo.

    Se usa SOLO cuando la persona elige generar la correctiva (ej: el equipo se
    puede reparar). Si en cambio decide NO generarla (ej: se da de baja), el
    frontend usa POST /checklists/respuestas y no llama a este endpoint.

    Hace todo junto (una sola transacción):
      1. Verifica que el mantenimiento y el ítem existan.
      2. Registra la respuesta NO_PASA (con la descripción como observación).
      3. Crea la OT correctiva enganchada al MISMO activo del mantenimiento,
         en el mismo grupo, y con ot_origen_id apuntando a la OT preventiva de
         la que salió — así aparece junto con las que se generan a mano desde
         el botón "Algo no funciona" de esa misma OT (ver
         POST /ordenes-trabajo/{id}/correctiva), en un solo listado.
    """
    # 1. El mantenimiento tiene que existir (de él sacamos el equipo).
    mp = db.query(MantenimientoPreventivo).filter(
        MantenimientoPreventivo.id == payload.mp_id
    ).first()
    if mp is None:
        raise HTTPException(status_code=404, detail="El mantenimiento no existe.")
    _validar_permiso_sobre_mp(db, current_user, mp)

    # 2. El ítem de checklist tiene que existir.
    item = db.query(ChecklistItem).filter(
        ChecklistItem.id == payload.checklist_item_id
    ).first()
    if item is None:
        raise HTTPException(status_code=404, detail="El ítem de checklist no existe.")

    # 3. El activo del mantenimiento (a él se le abre la correctiva).
    activo = db.query(Activo).filter(Activo.codigo == mp.activo_codigo).first()
    if activo is None:
        raise HTTPException(status_code=404, detail="El activo del mantenimiento no existe.")

    # 4. Registrar la respuesta NO_PASA.
    respuesta = ChecklistRespuesta(
        mp_id=payload.mp_id,
        checklist_item_id=payload.checklist_item_id,
        completado=True,
        resultado="NO_PASA",
        observacion=payload.descripcion,
        completado_por=payload.tecnico_id,
    )
    db.add(respuesta)

    # 5. Crear la OT correctiva para el mismo equipo, heredando el grupo y el
    #    ot_origen_id de la preventiva (si el MP está enganchado a una OT).
    grupo_id = None
    ot_origen_id = None
    if mp.ot_id:
        origen = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == mp.ot_id).first()
        if origen is not None:
            grupo_id = origen.grupo_id
            ot_origen_id = origen.id

    ultimo = db.query(func.max(OrdenTrabajo.numero_ot)).scalar()
    numero_ot = (ultimo or 0) + 1
    orden = OrdenTrabajo(
        numero_ot=numero_ot,
        activo_codigo=mp.activo_codigo,
        tipo="CORRECTIVA",
        estado="ABIERTA",
        prioridad=(payload.prioridad.upper() if payload.prioridad else None),
        descripcion=f"[Generada desde checklist: {item.descripcion}] {payload.descripcion}",
        tecnico_id=payload.tecnico_id,
        grupo_id=grupo_id,
        ot_origen_id=ot_origen_id,
        fecha_apertura=datetime.utcnow(),
    )
    db.add(orden)

    # 6. Un solo commit: la respuesta NO_PASA y la OT se guardan juntas.
    db.commit()
    db.refresh(orden)
    return orden