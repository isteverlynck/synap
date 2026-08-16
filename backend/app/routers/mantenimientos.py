"""Endpoints de mantenimientos preventivos (MP).

Un MP es una revisión programada sobre un activo, definida por una plantilla
(cada cuántos días, qué se revisa). El objetivo de MÍNIMA del anteproyecto pide
la CONSULTA de los MP programados: eso lo sostienen los GET de este archivo.

Estado actual del archivo:
  - GET (lectura/consulta): funcionando. Es lo que cumple el objetivo de mínima.
  - POST (programar): ESCRITO PERO DESACTIVADO. Extra, no requerido por el
    objetivo de mínima (que pide consulta, no gestión completa de MP).

Todos los endpoints están protegidos con login (get_current_user).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Activo, MantenimientoPreventivo, Usuario
from ..schemas import MantenimientoPreventivoOut, MantenimientoPreventivoCreate
from ..security import get_current_user

router = APIRouter(prefix="/mantenimientos", tags=["mantenimientos_preventivos"])


# ═══════════════════════════════════════════════════════════════════════════
# LECTURA / CONSULTA (GET) — funcionando · CUMPLE EL OBJETIVO DE MÍNIMA
# ═══════════════════════════════════════════════════════════════════════════

@router.get("", response_model=list[MantenimientoPreventivoOut])
def listar_mantenimientos(
    estado: str | None = None,
    activo_codigo: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Consultar los MP programados (hasta 'limit'), con filtros opcionales.

      - estado: ej. programado / realizado / vencido
      - activo_codigo: todos los MP de un equipo puntual

    Este es el entregable de 'consulta de mantenimientos preventivos programados'
    del objetivo de mínima.
    """
    q = db.query(MantenimientoPreventivo)
    if estado is not None:
        q = q.filter(MantenimientoPreventivo.estado == estado)
    if activo_codigo is not None:
        q = q.filter(MantenimientoPreventivo.activo_codigo == activo_codigo)
    return q.limit(limit).all()


@router.get("/{mp_id}", response_model=MantenimientoPreventivoOut)
def ver_mantenimiento(
    mp_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Ver un MP puntual por su id."""
    mp = db.query(MantenimientoPreventivo).filter(
        MantenimientoPreventivo.id == mp_id
    ).first()
    if mp is None:
        raise HTTPException(status_code=404, detail="Mantenimiento no encontrado")
    return mp


# ═══════════════════════════════════════════════════════════════════════════
# CREACIÓN (POST) — TODO: ACTIVAR CUANDO HAYA DATOS · EXTRA (no es de mínima)
# ═══════════════════════════════════════════════════════════════════════════
# El objetivo de mínima pide CONSULTA de MP (los GET de arriba ya lo cumplen).
# Este POST para programar un MP nuevo es un extra. Queda listo por si lo suman.
# Para activarlo: descomentá el bloque y probalo en /docs con un activo existente.
# ═══════════════════════════════════════════════════════════════════════════
"""
@router.post("", response_model=MantenimientoPreventivoOut, status_code=201)
def programar_mantenimiento(
    payload: MantenimientoPreventivoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    # Verificar que el activo exista.
    activo = db.query(Activo).filter(Activo.codigo == payload.activo_codigo).first()
    if activo is None:
        raise HTTPException(
            status_code=404,
            detail=f"No existe el activo {payload.activo_codigo}.",
        )

    mp = MantenimientoPreventivo(
        activo_codigo=payload.activo_codigo,
        plantilla_mp_id=payload.plantilla_mp_id,
        fecha_programada=payload.fecha_programada,
        tecnico_id=payload.tecnico_id,
        estado="programado",
        generado_automaticamente=False,
    )
    db.add(mp)
    db.commit()
    db.refresh(mp)
    return mp
"""