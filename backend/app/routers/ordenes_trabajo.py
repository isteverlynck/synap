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
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Activo, OrdenTrabajo, Usuario
from ..schemas import (
    OrdenTrabajoOut,
    OrdenTrabajoCreate,
    OrdenTrabajoCambioEstado,
    OrdenTrabajoCierre,
)
from ..security import get_current_user, requiere_rol

router = APIRouter(prefix="/ordenes-trabajo", tags=["ordenes_de_trabajo"])


# ═══════════════════════════════════════════════════════════════════════════
# LECTURA (GET) — funcionando
# ═══════════════════════════════════════════════════════════════════════════

@router.get("", response_model=list[OrdenTrabajoOut])
def listar_ordenes(
    estado: str | None = None,
    tipo: str | None = None,
    activo_codigo: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Listar OTs (hasta 'limit'), con filtros opcionales.

    Los filtros son opcionales: si no mandás ninguno, trae las últimas 'limit'.
    Se pueden combinar (ej: estado='ABIERTA' + tipo='correctiva').
      - estado: ABIERTA / EN_PROGRESO / CERRADA
      - tipo: correctiva / preventiva
      - activo_codigo: todas las OT de un equipo puntual
    """
    q = db.query(OrdenTrabajo)
    if estado is not None:
        q = q.filter(OrdenTrabajo.estado == estado)
    if tipo is not None:
        q = q.filter(OrdenTrabajo.tipo == tipo)
    if activo_codigo is not None:
        q = q.filter(OrdenTrabajo.activo_codigo == activo_codigo)
    return q.limit(limit).all()


@router.get("/mias", response_model=list[OrdenTrabajoOut])
def mis_ordenes(
    estado: str | None = None,
    tipo: str | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Las OT asignadas al técnico logueado ("Mis OT asignadas").

    Filtros opcionales:
      - tipo: CORRECTIVA / PREVENTIVA (para separar las secciones del panel del
        técnico: "OT asignadas" vs "OT preventivas").
      - estado: ASIGNADA / EN_PROGRESO / CERRADA.
    """
    q = db.query(OrdenTrabajo).filter(OrdenTrabajo.tecnico_id == current_user.id)
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

    db.commit()
    db.refresh(orden)
    return orden


# ═══════════════════════════════════════════════════════════════════════════
# CIERRE (PATCH) — cerrar una OT y registrar la fecha de cierre
# ═══════════════════════════════════════════════════════════════════════════

@router.patch("/{ot_id}/cerrar", response_model=OrdenTrabajoOut)
def cerrar_orden(
    ot_id: str,
    payload: OrdenTrabajoCierre,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "coordinacion")),
):
    """Cerrar una OT: la marca como CERRADA y le pone la fecha de cierre (ahora).

    Con esto quedan completas las 3 fechas (notificacion -> apertura -> cierre),
    que son las que alimentan el KPI de tiempo de inactividad.
    """
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")

    if orden.estado == "CERRADA":
        raise HTTPException(status_code=400, detail="Esta OT ya está cerrada.")

    orden.estado = "CERRADA"
    orden.fecha_cierre = datetime.utcnow()
    # si mandan observaciones del cierre, las sumamos (sin pisar las que hubiera)
    if payload.observaciones:
        if orden.observaciones:
            orden.observaciones = orden.observaciones + " | Cierre: " + payload.observaciones
        else:
            orden.observaciones = payload.observaciones

    db.commit()
    db.refresh(orden)
    return orden