"""Endpoints de órdenes de trabajo (OT) — el corazón operativo del sistema.

Una OT puede ser correctiva (por una falla) o preventiva. Se abre, se asigna a
un técnico, se sigue y se cierra. Siempre pertenece a un activo (activo_codigo).

Estado actual del archivo:
  - GET (lectura): funcionando. Listar, ver una, filtrar por activo/estado.
  - POST (crear): ESCRITO PERO DESACTIVADO. Ver el bloque TODO más abajo.
    Lo dejamos listo para no olvidarnos; se activa cuando haya datos cargados.

Todos los endpoints están protegidos con login (get_current_user): sin token
válido, FastAPI corta con 401.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Activo, OrdenTrabajo, Usuario
from ..schemas import OrdenTrabajoOut, OrdenTrabajoCreate
from ..security import get_current_user

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
    Se pueden combinar (ej: estado='abierta' + tipo='correctiva').
      - estado: abierta / en curso / cerrada
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
# CREACIÓN (POST) — TODO: ACTIVAR CUANDO HAYA DATOS CARGADOS
# ═══════════════════════════════════════════════════════════════════════════
# Este endpoint YA ESTÁ ESCRITO pero comentado a propósito. No lo borres.
# Cuando cargues los datos de ejemplo en Supabase, hacé esto para activarlo:
#   1. Descomentá el bloque de abajo (sacá las triples comillas de arriba y abajo).
#   2. Resolvé el punto de numero_ot (ver nota adentro).
#   3. Probalo en /docs abriendo una OT de prueba.
#
# Por qué lo dejamos desactivado: sin activos cargados, crear una OT falla igual
# (no existe el activo al que apuntar), así que no se puede probar de verdad todavía.
# ═══════════════════════════════════════════════════════════════════════════
"""
from datetime import datetime
from sqlalchemy import func

@router.post("", response_model=OrdenTrabajoOut, status_code=201)
def crear_orden(
    payload: OrdenTrabajoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    # 1. Verificar que el activo exista (no se puede abrir OT de un equipo fantasma).
    activo = db.query(Activo).filter(Activo.codigo == payload.activo_codigo).first()
    if activo is None:
        raise HTTPException(
            status_code=404,
            detail=f"No existe el activo {payload.activo_codigo}.",
        )

    # 2. numero_ot: número correlativo legible para humanos (OT #1, #2, #3...).
    #    TODO decidir con Cami: ¿correlativo global o por año? Por ahora, global:
    #    tomamos el máximo actual y le sumamos 1. (Cuando haya muchos usuarios
    #    concurrentes conviene revisarlo, pero para el prototipo alcanza.)
    ultimo = db.query(func.max(OrdenTrabajo.numero_ot)).scalar()
    numero_ot = (ultimo or 0) + 1

    # 3. Crear la orden. El backend completa lo automático; el resto viene del payload.
    orden = OrdenTrabajo(
        numero_ot=numero_ot,
        activo_codigo=payload.activo_codigo,
        tipo=payload.tipo,
        estado="abierta",                      # toda OT nace abierta
        prioridad=payload.prioridad,
        descripcion=payload.descripcion,
        tecnico_id=payload.tecnico_id,
        grupo_id=payload.grupo_id,
        sector_solicitante_id=payload.sector_solicitante_id,
        observaciones=payload.observaciones,
        fecha_apertura=datetime.utcnow(),
    )
    db.add(orden)
    db.commit()
    db.refresh(orden)
    return orden
"""