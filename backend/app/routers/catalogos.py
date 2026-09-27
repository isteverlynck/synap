"""Glosario de siglas: decodifica los segmentos de un código de ubicación o
de equipo (ej: E01-1SS-IMAG-RMG → "Edificio 1 · Primer subsuelo · Imágenes ·
Resonancia Magnética"). No reemplaza a los catálogos de tipos de equipo ni
servicios/áreas (esos siguen en /activos) — es un diccionario aparte, chico,
para las siglas que no tienen catálogo propio (edificio, piso/subsuelo, sala).

El frontend arma la decodificación completa combinando este glosario con el
catálogo de tipos de equipo (que ya trae su propio nombre) — ver
`synap-frontend/src/utiles/siglas.js`.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import SiglaUbicacion, Usuario
from ..schemas import SiglaUbicacionCreate, SiglaUbicacionOut
from ..security import get_current_user, requiere_rol

router = APIRouter(prefix="/catalogos", tags=["catalogos"])


@router.get("/siglas", response_model=list[SiglaUbicacionOut])
def listar_siglas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Todo el glosario, para decodificar códigos en cualquier pantalla."""
    return db.query(SiglaUbicacion).order_by(SiglaUbicacion.id).all()


@router.post("/siglas", response_model=SiglaUbicacionOut, status_code=201)
def crear_sigla(
    payload: SiglaUbicacionCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("coordinacion")),
):
    """Agregar una sigla nueva al glosario. Mismo criterio de permisos que
    los catálogos de tipos de equipo/servicios: solo coordinación (y
    jefatura, que siempre pasa) — es carga de catálogo."""
    existente = db.query(SiglaUbicacion).filter(SiglaUbicacion.id == payload.id).first()
    if existente:
        raise HTTPException(status_code=400, detail=f"Ya existe la sigla '{payload.id}' en el glosario.")
    sigla = SiglaUbicacion(id=payload.id, nombre=payload.nombre, categoria=payload.categoria)
    db.add(sigla)
    db.commit()
    db.refresh(sigla)
    return sigla


@router.delete("/siglas/{sigla_id}", status_code=204)
def eliminar_sigla(
    sigla_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("coordinacion")),
):
    """Sacar una sigla del glosario (ej: se cargó con un error de tipeo)."""
    sigla = db.query(SiglaUbicacion).filter(SiglaUbicacion.id == sigla_id.upper()).first()
    if sigla is None:
        raise HTTPException(status_code=404, detail="Esa sigla no está en el glosario.")
    db.delete(sigla)
    db.commit()