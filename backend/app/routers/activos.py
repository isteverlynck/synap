"""Endpoints de activos (equipos médicos)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Activo, Usuario, GrupoTipoEquipo, GrupoTecnico, Usuario
from ..schemas import ActivoOut, ActivoDetalle
from ..security import get_current_user

router = APIRouter(prefix="/activos", tags=["activos"])


@router.get("", response_model=list[ActivoOut])
def listar_activos(limit: int = 50, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """Listar activos (hasta 'limit'). Después le agregamos filtros y búsqueda."""
    return db.query(Activo).limit(limit).all()


@router.get("/{codigo}", response_model=ActivoOut)
def ver_activo(codigo: str, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """Ver un activo puntual por su código (ej: B-ANES-AGME-001)."""
    activo = db.query(Activo).filter(Activo.codigo == codigo).first()
    if activo is None:
        raise HTTPException(status_code=404, detail="Activo no encontrado")
    return activo

@router.get("/{codigo}/detalle", response_model=ActivoDetalle)
def ver_activo_detalle(codigo: str, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """Ficha completa del activo: sus datos + órdenes, fallas y mantenimientos."""
    activo = db.query(Activo).filter(Activo.codigo == codigo).first()
    if activo is None:
        raise HTTPException(status_code=404, detail="Activo no encontrado")
    
    # Cadena para llegar al responsable: activo → tipo de equipo → grupo →
    # coordinador del grupo. Es la misma que usa solicitudes para el ruteo.
    detalle = ActivoDetalle.model_validate(activo)

    rel = db.query(GrupoTipoEquipo).filter(
        GrupoTipoEquipo.tipo_equipo_id == activo.tipo_equipo_id
    ).first()
    if rel:
        grupo = db.query(GrupoTecnico).filter(GrupoTecnico.id == rel.grupo_id).first()
        if grupo and grupo.coordinador_id:
            responsable = db.query(Usuario).filter(
                Usuario.id == grupo.coordinador_id
            ).first()
            if responsable:
                detalle.responsable_nombre = f"{responsable.nombre} {responsable.apellido}"
                detalle.responsable_email = responsable.email

    return detalle
    
    return activo