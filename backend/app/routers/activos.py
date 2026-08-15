"""Endpoints de activos (equipos médicos)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Activo
from ..schemas import ActivoOut

router = APIRouter(prefix="/activos", tags=["activos"])


@router.get("", response_model=list[ActivoOut])
def listar_activos(limit: int = 50, db: Session = Depends(get_db)):
    """Listar activos (hasta 'limit'). Después le agregamos filtros y búsqueda."""
    return db.query(Activo).limit(limit).all()


@router.get("/{codigo}", response_model=ActivoOut)
def ver_activo(codigo: str, db: Session = Depends(get_db)):
    """Ver un activo puntual por su código (ej: B-ANES-AGME-001)."""
    activo = db.query(Activo).filter(Activo.codigo == codigo).first()
    if activo is None:
        raise HTTPException(status_code=404, detail="Activo no encontrado")
    return activo