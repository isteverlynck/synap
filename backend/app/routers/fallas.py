"""Endpoints de fallas — el reporte de problemas sobre un activo.

Una falla es un problema reportado sobre un equipo. Puede derivar en una orden
de trabajo correctiva (ot_id apunta a la OT que la resuelve). El reporte y
clasificación de fallas por severidad es uno de los objetivos de mínima del
anteproyecto.

Estado actual del archivo:
  - GET (lectura): funcionando. Listar, ver una, filtrar por activo/estado/severidad.
  - POST (reportar): ESCRITO PERO DESACTIVADO. Ver el bloque TODO más abajo.

Todos los endpoints están protegidos con login (get_current_user).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Activo, Falla, Usuario
from ..schemas import FallaOut, FallaCreate
from ..security import get_current_user

router = APIRouter(prefix="/fallas", tags=["fallas"])


# ═══════════════════════════════════════════════════════════════════════════
# LECTURA (GET) — funcionando
# ═══════════════════════════════════════════════════════════════════════════

@router.get("", response_model=list[FallaOut])
def listar_fallas(
    estado: str | None = None,
    severidad: str | None = None,
    activo_codigo: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Listar fallas (hasta 'limit'), con filtros opcionales combinables.

      - estado: el estado de la falla (ej: reportada / en revisión / resuelta)
      - severidad: para el módulo de clasificación por severidad del anteproyecto
      - activo_codigo: todas las fallas de un equipo puntual
    """
    q = db.query(Falla)
    if estado is not None:
        q = q.filter(Falla.estado == estado)
    if severidad is not None:
        q = q.filter(Falla.severidad == severidad)
    if activo_codigo is not None:
        q = q.filter(Falla.activo_codigo == activo_codigo)
    return q.limit(limit).all()


@router.get("/{falla_id}", response_model=FallaOut)
def ver_falla(
    falla_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Ver una falla puntual por su id (el uuid de la falla)."""
    falla = db.query(Falla).filter(Falla.id == falla_id).first()
    if falla is None:
        raise HTTPException(status_code=404, detail="Falla no encontrada")
    return falla


# ═══════════════════════════════════════════════════════════════════════════
# CREACIÓN (POST) — TODO: ACTIVAR CUANDO HAYA DATOS CARGADOS
# ═══════════════════════════════════════════════════════════════════════════
# Este endpoint YA ESTÁ ESCRITO pero comentado a propósito. No lo borres.
# Cuando cargues los datos de ejemplo en Supabase, hacé esto para activarlo:
#   1. Descomentá el bloque de abajo (sacá las triples comillas de arriba y abajo).
#   2. Probalo en /docs reportando una falla de prueba sobre un activo existente.
#
# Por qué lo dejamos desactivado: sin activos cargados, reportar una falla falla
# igual (no existe el activo al que apuntar), así que no se puede probar todavía.
# ═══════════════════════════════════════════════════════════════════════════
"""
from datetime import datetime

@router.post("", response_model=FallaOut, status_code=201)
def reportar_falla(
    payload: FallaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    # 1. Verificar que el activo exista (no se puede reportar falla de un equipo fantasma).
    activo = db.query(Activo).filter(Activo.codigo == payload.activo_codigo).first()
    if activo is None:
        raise HTTPException(
            status_code=404,
            detail=f"No existe el activo {payload.activo_codigo}.",
        )

    # 2. Crear la falla. Nace 'reportada'; el backend pone la fecha.
    #    TODO decidir con Cami los valores de estado (reportada / en revisión /
    #    resuelta) y de severidad (baja / media / alta / crítica), para que
    #    coincidan con lo que muestre el frontend en el módulo de clasificación.
    falla = Falla(
        activo_codigo=payload.activo_codigo,
        descripcion=payload.descripcion,
        tipo_falla=payload.tipo_falla,
        severidad=payload.severidad,
        reportado_por=payload.reportado_por,
        estado="reportada",
        fecha_reporte=datetime.utcnow(),
    )
    db.add(falla)
    db.commit()
    db.refresh(falla)
    return falla
"""