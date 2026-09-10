"""Endpoints de órdenes de trabajo (OT) — el corazón operativo del sistema.

Una OT puede ser correctiva (por una falla) o preventiva. Se abre, se asigna a
un técnico, se sigue y se cierra. Siempre pertenece a un activo (activo_codigo).

Flujo de fechas (según el uso real del hospital):
  - fecha_notificacion: cuando el servicio avisa del problema (opcional; a veces
    se conoce, a veces no).
  - fecha_apertura: cuando bioingeniería abre la OT. La pone el backend al crear.
  - fecha_cierre: cuando se cierra. Se completa al cerrar la OT (otro endpoint).

Todos los endpoints están protegidos con login (get_current_user).
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Activo, OrdenTrabajo, NotaOT, Usuario
from ..schemas import (
    OrdenTrabajoOut,
    OrdenTrabajoCreate,
    OrdenTrabajoAsignar,
    OrdenTrabajoCambioEstado,
    OrdenTrabajoCierre,
    OrdenTrabajoCorrectivaCreate,
    NotaOTOut,
    NotaOTCrear,
)
from ..security import get_current_user, requiere_rol, grupos_del_coordinador

router = APIRouter(prefix="/ordenes-trabajo", tags=["ordenes_de_trabajo"])


def _validar_permiso_sobre_ot(current_user: Usuario, db: Session, orden: OrdenTrabajo) -> None:
    """Mismo criterio que en el resto de las acciones sobre una OT (bitácora,
    reasignar, correctiva asociada): técnico/junior de su propio grupo, o
    coordinación de los grupos que coordina. Jefatura ya pasó por requiere_rol
    antes de llegar acá.
    """
    if current_user.rol in ("tecnico", "junior") and current_user.grupo != orden.grupo_id:
        raise HTTPException(
            status_code=403,
            detail="Solo podés hacer esto en órdenes de tu propio grupo.",
        )
    if current_user.rol == "coordinacion" and orden.grupo_id not in grupos_del_coordinador(db, current_user):
        raise HTTPException(
            status_code=403,
            detail="Solo podés hacer esto en órdenes de los grupos que coordinás.",
        )


# ═══════════════════════════════════════════════════════════════════════════
# LECTURA (GET) — funcionando
# ═══════════════════════════════════════════════════════════════════════════

# @router.get("", response_model=list[OrdenTrabajoOut])
# def listar_ordenes(
#     estado: str | None = None,
#     tipo: str | None = None,
#     activo_codigo: str | None = None,
#     limit: int = 50,
#     db: Session = Depends(get_db),
#     current_user: Usuario = Depends(get_current_user),
# ):
#     """Listar OTs (hasta 'limit'), con filtros opcionales.

#     Los filtros son opcionales: si no mandás ninguno, trae las últimas 'limit'.
#     Se pueden combinar (ej: estado='ABIERTA' + tipo='correctiva').
#       - estado: ABIERTA / EN_PROGRESO / CERRADA
#       - tipo: correctiva / preventiva
#       - activo_codigo: todas las OT de un equipo puntual
#     """
#     q = db.query(OrdenTrabajo)
#     if estado is not None:
#         q = q.filter(OrdenTrabajo.estado == estado)
#     if tipo is not None:
#         q = q.filter(OrdenTrabajo.tipo == tipo)
#     if activo_codigo is not None:
#         q = q.filter(OrdenTrabajo.activo_codigo == activo_codigo)
#     return q.limit(limit).all()

@router.get("", response_model=list[OrdenTrabajoOut])
def listar_ordenes(
    estado: str | None = None,
    tipo: str | None = None,
    activo_codigo: str | None = None,
    grupo_id: str | None = None,
    sin_asignar: bool | None = None,
    mis_grupos: bool = False,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Listar OTs (hasta 'limit'), con filtros opcionales y combinables.

      - estado: ABIERTA / EN_PROGRESO / CERRADA
      - tipo: CORRECTIVA / PREVENTIVA
      - activo_codigo: todas las OT de un equipo puntual
      - grupo_id: las de un grupo técnico puntual
      - sin_asignar=true: solo las que todavía no tienen técnico. Es la bandeja
        de pendientes del coordinador después de aceptar solicitudes.
      - mis_grupos=true: las de los grupos que coordina el usuario logueado
        (jefatura las ve todas, no filtra).
    """
    q = db.query(OrdenTrabajo)

    # estado y tipo se guardan en mayúsculas: normalizamos lo que llega para
    # que 'abierta' y 'ABIERTA' funcionen igual.
    if estado is not None:
        q = q.filter(OrdenTrabajo.estado == estado.upper())
    if tipo is not None:
        q = q.filter(OrdenTrabajo.tipo == tipo.upper())
    if activo_codigo is not None:
        q = q.filter(OrdenTrabajo.activo_codigo == activo_codigo)
    if grupo_id is not None:
        q = q.filter(OrdenTrabajo.grupo_id == grupo_id)

    # sin_asignar=true → sin técnico; false → solo las ya asignadas.
    if sin_asignar is True:
        q = q.filter(OrdenTrabajo.tecnico_id.is_(None))
    elif sin_asignar is False:
        q = q.filter(OrdenTrabajo.tecnico_id.isnot(None))

    if mis_grupos and current_user.rol != "jefatura":
        q = q.filter(OrdenTrabajo.grupo_id.in_(grupos_del_coordinador(db, current_user)))

    # Orden fijo: las más nuevas primero. Sin esto la lista puede cambiar de
    # orden entre recargas y confunde al usuario.
    return q.order_by(OrdenTrabajo.fecha_apertura.desc().nullslast()).limit(limit).all()

@router.get("/mias", response_model=list[OrdenTrabajoOut])
def mis_ordenes(
    estado: str | None = None,
    tipo: str | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Las OT que le tocan al técnico logueado ("Mis OT asignadas"): las que
    tiene asignadas a su nombre, MÁS las de su propio grupo que todavía no
    tienen un técnico puntual — esas últimas son del grupo entero, no de una
    persona en concreto.

    Esto es clave para las preventivas: se generan automáticamente para el
    GRUPO que atiende el equipo (ver preventivas.py), sin asignarle un
    técnico puntual a ninguna — así que sin este agregado, una preventiva
    recién generada no le aparecía a NADIE en "Mis órdenes" hasta que alguien
    la asignara a mano desde otro lado. Con esto, cualquier persona del grupo
    la ve y la puede tomar (el botón de asignar ya lo permite: cualquier
    técnico del mismo grupo se puede autoasignar una OT sin técnico).

    Filtros opcionales:
      - tipo: CORRECTIVA / PREVENTIVA (para separar las secciones del panel del
        técnico: "OT asignadas" vs "OT preventivas").
      - estado: ABIERTA / EN_PROGRESO / CERRADA.
    """
    q = db.query(OrdenTrabajo).filter(
        or_(
            OrdenTrabajo.tecnico_id == current_user.id,
            and_(
                OrdenTrabajo.tecnico_id.is_(None),
                OrdenTrabajo.grupo_id == current_user.grupo,
            ),
        )
    )
    if estado is not None:
        q = q.filter(OrdenTrabajo.estado == estado)
    if tipo is not None:
        q = q.filter(OrdenTrabajo.tipo == tipo.upper())
    return q.order_by(OrdenTrabajo.fecha_apertura.desc()).all()


@router.get("/{ot_id}", response_model=OrdenTrabajoOut)
def ver_orden(
    ot_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Ver una OT puntual por su id (el uuid de la orden)."""
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    return orden


# ═══════════════════════════════════════════════════════════════════════════
# CREACIÓN (POST) — abrir una OT nueva
# ═══════════════════════════════════════════════════════════════════════════

@router.post("", response_model=OrdenTrabajoOut, status_code=201)
def crear_orden(
    payload: OrdenTrabajoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("coordinacion")),
):
    """Abrir una orden de trabajo nueva.

    Sirve para el objetivo de mínima 'apertura de OT'. También es lo que se
    llama cuando, desde un checklist, un ítem da NO_PASA y se quiere generar una
    OT correctiva para ese equipo (activo_codigo + tipo='correctiva' + la falla
    en la descripción).
    """
    # 1. El activo tiene que existir (no se abre OT de un equipo fantasma).
    activo = db.query(Activo).filter(Activo.codigo == payload.activo_codigo).first()
    if activo is None:
        raise HTTPException(
            status_code=404,
            detail=f"No existe el activo {payload.activo_codigo}.",
        )

    # 2. numero_ot: número correlativo legible (OT #1, #2, #3...).
    #    Tomamos el máximo actual y sumamos 1. Alcanza para el prototipo.
    ultimo = db.query(func.max(OrdenTrabajo.numero_ot)).scalar()
    numero_ot = (ultimo or 0) + 1

    # 3. Crear la orden. El backend completa lo automático; el resto del payload.
    orden = OrdenTrabajo(
        numero_ot=numero_ot,
        activo_codigo=payload.activo_codigo,
        tipo=payload.tipo,
        estado="ABIERTA",                      # toda OT nace abierta
        prioridad=payload.prioridad,
        descripcion=payload.descripcion,
        tecnico_id=payload.tecnico_id,
        grupo_id=payload.grupo_id,
        sector_solicitante_id=payload.sector_solicitante_id,
        observaciones=payload.observaciones,
        fecha_notificacion=payload.fecha_notificacion,   # opcional
        fecha_apertura=datetime.utcnow(),                # ahora
    )
    db.add(orden)
    db.commit()
    db.refresh(orden)
    return orden


# ═══════════════════════════════════════════════════════════════════════════
# ASIGNACIÓN (PATCH) — asignar el técnico de una OT "sin asignar"
# ═══════════════════════════════════════════════════════════════════════════

@router.patch("/{ot_id}/asignar", response_model=OrdenTrabajoOut)
def asignar_tecnico(
    ot_id: str,
    payload: OrdenTrabajoAsignar,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("coordinacion", "tecnico", "junior")),
):
    """Asignar (o reasignar) el técnico de una OT.

    Lo puede hacer el coordinador (sobre cualquiera de sus OT), o cualquier
    técnico del MISMO grupo de la orden — así el grupo se reparte el trabajo
    entre ellos sin depender de que el coordinador haga cada pase a mano. El
    destino siempre tiene que ser alguien de ese mismo grupo (eso ya se
    validaba); ahora también se valida quién puede iniciar el pase.
    """
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")

    # Un técnico (o junior) solo puede reasignar OT de su propio grupo, nunca
    # las de otro. El coordinador puede sobre cualquiera (no restringimos acá
    # a "sus" grupos, igual que ya era el comportamiento de este endpoint).
    if current_user.rol in ("tecnico", "junior") and current_user.grupo != orden.grupo_id:
        raise HTTPException(
            status_code=403,
            detail="Solo podés reasignar órdenes de tu propio grupo.",
        )

    tecnico = db.query(Usuario).filter(Usuario.id == payload.tecnico_id).first()
    if tecnico is None:
        raise HTTPException(status_code=404, detail="La persona a asignar no existe.")
    if orden.grupo_id and tecnico.grupo != orden.grupo_id:
        raise HTTPException(
            status_code=400,
            detail=f"La persona no pertenece al grupo {orden.grupo_id}.",
        )

    orden.tecnico_id = payload.tecnico_id
    db.commit()
    db.refresh(orden)
    return orden


# ═══════════════════════════════════════════════════════════════════════════
# SEGUIMIENTO (PATCH) — cambiar el estado de una OT
# ═══════════════════════════════════════════════════════════════════════════

ESTADOS_VALIDOS = {"ABIERTA", "EN_PROGRESO", "CERRADA"}


@router.patch("/{ot_id}/estado", response_model=OrdenTrabajoOut)
def cambiar_estado(
    ot_id: str,
    payload: OrdenTrabajoCambioEstado,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "coordinacion")),
):
    """Cambiar el estado de una OT (parte del 'seguimiento').

    Ej: pasar de ABIERTA a EN_PROGRESO cuando el técnico empieza a trabajar.
    Para CERRAR conviene usar /cerrar (que además pone la fecha de cierre).
    """
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")

    nuevo = payload.estado.upper()
    if nuevo not in ESTADOS_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Estado inválido. Valores: {', '.join(sorted(ESTADOS_VALIDOS))}.",
        )

    orden.estado = nuevo
    # Si se cierra por esta vía, igual completamos la fecha de cierre.
    if nuevo == "CERRADA" and orden.fecha_cierre is None:
        orden.fecha_cierre = datetime.utcnow()
        _cerrar_parada_si_quedo_abierta(orden, orden.fecha_cierre)

    db.commit()
    db.refresh(orden)
    return orden


# ═══════════════════════════════════════════════════════════════════════════
# CIERRE (PATCH) — cerrar una OT y registrar la fecha de cierre
# ═══════════════════════════════════════════════════════════════════════════

def _cerrar_parada_si_quedo_abierta(orden: OrdenTrabajo, hasta: datetime) -> None:
    """Si la OT se cierra con una parada corriendo (se olvidaron de apretar
    "Finalizar parada"), la cerramos acá mismo — así el acumulado de tiempo
    parado siempre queda completo, nunca colgado a mitad de camino."""
    if orden.parada_iniciada_en is None:
        return
    transcurrido = (hasta - orden.parada_iniciada_en).total_seconds()
    orden.tiempo_parada_segundos += max(0, int(transcurrido))
    orden.parada_iniciada_en = None


@router.patch("/{ot_id}/cerrar", response_model=OrdenTrabajoOut)
def cerrar_orden(
    ot_id: str,
    payload: OrdenTrabajoCierre,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "coordinacion")),
):
    """Cerrar una OT: la marca como CERRADA y le pone la fecha de cierre (ahora).

    Con esto quedan completas las 3 fechas (notificacion -> apertura -> cierre).
    Si quedaba una parada del equipo corriendo, se cierra sola acá (ver
    _cerrar_parada_si_quedo_abierta) para que el tiempo de parada no quede
    incompleto.
    """
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")

    if orden.estado == "CERRADA":
        raise HTTPException(status_code=400, detail="Esta OT ya está cerrada.")

    orden.estado = "CERRADA"
    orden.fecha_cierre = datetime.utcnow()
    _cerrar_parada_si_quedo_abierta(orden, orden.fecha_cierre)
    # si mandan observaciones del cierre, las sumamos (sin pisar las que hubiera)
    if payload.observaciones:
        if orden.observaciones:
            orden.observaciones = orden.observaciones + " | Cierre: " + payload.observaciones
        else:
            orden.observaciones = payload.observaciones

    db.commit()
    db.refresh(orden)
    return orden


# ═══════════════════════════════════════════════════════════════════════════
# TIEMPO DE PARADA — medido a mano, no calculado a partir de otras fechas
# ═══════════════════════════════════════════════════════════════════════════

@router.patch("/{ot_id}/iniciar-parada", response_model=OrdenTrabajoOut)
def iniciar_parada(
    ot_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "junior", "coordinacion")),
):
    """Marca que el equipo ACABA de quedar fuera de servicio, a partir de
    ahora mismo. Es el arranque real del tiempo de parada — no se calcula
    solo, lo dispara quien está con el equipo.
    """
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    if orden.estado == "CERRADA":
        raise HTTPException(status_code=400, detail="Esta OT ya está cerrada.")
    _validar_permiso_sobre_ot(current_user, db, orden)
    if orden.parada_iniciada_en is not None:
        raise HTTPException(status_code=400, detail="Ya hay una parada en curso para esta orden.")

    orden.parada_iniciada_en = datetime.utcnow()
    db.commit()
    db.refresh(orden)
    return orden


@router.patch("/{ot_id}/finalizar-parada", response_model=OrdenTrabajoOut)
def finalizar_parada(
    ot_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "junior", "coordinacion")),
):
    """Marca que el equipo VOLVIÓ a estar en servicio. Suma el tiempo que
    duró esta parada al acumulado total de la OT (tiempo_parada_segundos).
    """
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    _validar_permiso_sobre_ot(current_user, db, orden)
    if orden.parada_iniciada_en is None:
        raise HTTPException(status_code=400, detail="No hay ninguna parada en curso para esta orden.")

    transcurrido = (datetime.utcnow() - orden.parada_iniciada_en).total_seconds()
    orden.tiempo_parada_segundos += max(0, int(transcurrido))
    orden.parada_iniciada_en = None
    db.commit()
    db.refresh(orden)
    return orden


# ═══════════════════════════════════════════════════════════════════════════
# CORRECTIVA ASOCIADA — cuando durante un preventivo se encuentra algo roto
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/{ot_id}/correctiva", response_model=OrdenTrabajoOut, status_code=201)
def crear_correctiva_asociada(
    ot_id: str,
    payload: OrdenTrabajoCorrectivaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "junior", "coordinacion")),
):
    """Abrir una OT correctiva a partir de una preventiva.

    Durante un mantenimiento programado se puede encontrar que algo no
    funciona: esto abre una correctiva aparte (sin mezclarla con la bitácora
    de la preventiva) pero dejando el rastro de por qué se generó
    (ot_origen_id apunta a la preventiva). Nace en el mismo equipo y grupo que
    la preventiva, sin técnico asignado — se asigna después, como cualquier
    otra OT nueva.
    """
    origen = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if origen is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    if origen.tipo != "PREVENTIVA":
        raise HTTPException(
            status_code=400,
            detail="Solo se puede generar una correctiva asociada desde una OT preventiva.",
        )

    if current_user.rol in ("tecnico", "junior") and current_user.grupo != origen.grupo_id:
        raise HTTPException(
            status_code=403,
            detail="Solo podés generar correctivas de OT de tu propio grupo.",
        )
    if current_user.rol == "coordinacion" and origen.grupo_id not in grupos_del_coordinador(db, current_user):
        raise HTTPException(
            status_code=403,
            detail="Solo podés generar correctivas de OT de los grupos que coordinás.",
        )

    descripcion = payload.descripcion.strip()
    if not descripcion:
        raise HTTPException(status_code=400, detail="Contá qué se encontró para generar la correctiva.")

    ultimo = db.query(func.max(OrdenTrabajo.numero_ot)).scalar()
    numero_ot = (ultimo or 0) + 1

    correctiva = OrdenTrabajo(
        numero_ot=numero_ot,
        activo_codigo=origen.activo_codigo,
        tipo="CORRECTIVA",
        estado="ABIERTA",
        prioridad=(payload.prioridad.upper() if payload.prioridad else None),
        descripcion=descripcion,
        grupo_id=origen.grupo_id,
        ot_origen_id=origen.id,
        fecha_apertura=datetime.utcnow(),
    )
    db.add(correctiva)
    db.commit()
    db.refresh(correctiva)
    return correctiva


@router.get("/{ot_id}/correctivas", response_model=list[OrdenTrabajoOut])
def listar_correctivas_asociadas(
    ot_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Las OT correctivas que se generaron a partir de esta preventiva."""
    return (
        db.query(OrdenTrabajo)
        .filter(OrdenTrabajo.ot_origen_id == ot_id)
        .order_by(OrdenTrabajo.fecha_apertura)
        .all()
    )


# ═══════════════════════════════════════════════════════════════════════════
# BITÁCORA — el registro de lo que se va haciendo mientras la OT está abierta
# ═══════════════════════════════════════════════════════════════════════════
# A diferencia de 'observaciones' (un solo texto que se completa al cerrar),
# acá se van sumando entradas con fecha y quién las escribió, mientras la OT
# está en curso. Es lo que permite que, si más de una persona del grupo toca
# la misma orden, quede un historial real de todo lo que se hizo.
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/{ot_id}/notas", response_model=list[NotaOTOut])
def listar_notas(
    ot_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """La bitácora de una OT, de la entrada más vieja a la más nueva (se lee
    como una historia, de arriba hacia abajo)."""
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    return (
        db.query(NotaOT)
        .filter(NotaOT.ot_id == ot_id)
        .order_by(NotaOT.created_at)
        .all()
    )


@router.post("/{ot_id}/notas", response_model=NotaOTOut, status_code=201)
def agregar_nota(
    ot_id: str,
    payload: NotaOTCrear,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "junior", "coordinacion")),
):
    """Sumar una entrada a la bitácora: qué se hizo, se encontró o se necesita.

    Puede escribir cualquiera de la OT: el técnico asignado, cualquier técnico
    del grupo (por si otro compañero también le puso mano), o el coordinador
    del grupo. No se puede agregar en una OT ya cerrada — en ese punto lo que
    queda es el resumen final en 'observaciones' del cierre.
    """
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    if orden.estado == "CERRADA":
        raise HTTPException(status_code=400, detail="Esta OT ya está cerrada.")

    if current_user.rol in ("tecnico", "junior") and current_user.grupo != orden.grupo_id:
        raise HTTPException(
            status_code=403,
            detail="Solo podés agregar notas en órdenes de tu propio grupo.",
        )
    if current_user.rol == "coordinacion" and orden.grupo_id not in grupos_del_coordinador(db, current_user):
        raise HTTPException(
            status_code=403,
            detail="Solo podés agregar notas en órdenes de los grupos que coordinás.",
        )

    texto = payload.texto.strip()
    if not texto:
        raise HTTPException(status_code=400, detail="Escribí algo para guardar en la bitácora.")

    nota = NotaOT(ot_id=ot_id, autor_id=current_user.id, texto=texto)
    db.add(nota)
    db.commit()
    db.refresh(nota)
    return nota