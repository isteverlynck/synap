"""Endpoints de activos (equipos médicos)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import re
from sqlalchemy import or_

from ..database import get_db
from ..models import Activo, Usuario, GrupoTipoEquipo, GrupoTecnico, Usuario, TipoEquipo, Servicio
from ..schemas import ActivoOut, ActivoDetalle
from ..security import get_current_user

router = APIRouter(prefix="/activos", tags=["activos"])


@router.get("", response_model=list[ActivoOut])
def listar_activos(
    buscar: str | None = None,
    estado: str | None = None,
    tipo_equipo_id: str | None = None,
    sector_id: str | None = None,
    grupo_id: str | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Listar activos con búsqueda y filtros opcionales, combinables.

    - buscar: texto libre sobre código, descripción, marca, modelo y número de
      serie. Acepta el código con espacios (B TERA MOMU 001) o con guiones,
      porque las etiquetas del hospital usan espacios y la base guarda guiones.
    - estado / tipo_equipo_id / sector_id / grupo_id: filtros exactos.
    """
    q = db.query(Activo)

    if buscar:
        texto = buscar.strip()
        # Para el código normalizamos igual que el frontend: espacios a guiones
        # y mayúsculas. Para el resto de los campos buscamos el texto tal cual.
        como_codigo = re.sub(r"[\s-]+", "-", texto.upper()).strip("-")
        patron = f"%{texto}%"
        q = q.filter(
            or_(
                Activo.codigo.ilike(f"%{como_codigo}%"),
                Activo.descripcion.ilike(patron),
                Activo.marca.ilike(patron),
                Activo.modelo.ilike(patron),
                Activo.numero_serie.ilike(patron),
            )
        )

    if estado:
        q = q.filter(Activo.estado.ilike(estado))
    if tipo_equipo_id:
        q = q.filter(Activo.tipo_equipo_id == tipo_equipo_id)
    if sector_id:
        q = q.filter(Activo.sector_id == sector_id)
    if grupo_id:
        q = q.filter(Activo.grupo_id == grupo_id)

    return q.order_by(Activo.descripcion, Activo.codigo).limit(limit).all()

@router.get("/filtros")
def opciones_de_filtro(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Opciones para los desplegables de la pantalla de activos.

    Devolvemos solo los valores que EXISTEN en los activos cargados, no los
    catálogos completos: un filtro que ofrece "Hemodinamia" y devuelve cero
    resultados hace dudar de que el sistema funcione.
    """
    tipos_usados = {a.tipo_equipo_id for a in db.query(Activo.tipo_equipo_id).all()}
    sectores_usados = {a.sector_id for a in db.query(Activo.sector_id).all()}
    estados = sorted({
        (a.estado or "").strip() for a in db.query(Activo.estado).all() if a.estado
    })

    tipos = [
        {"id": t.id, "nombre": t.nombre}
        for t in db.query(TipoEquipo).order_by(TipoEquipo.nombre).all()
        if t.id in tipos_usados
    ]
    sectores = [
        {"id": s.id, "nombre": s.nombre}
        for s in db.query(Servicio).order_by(Servicio.nombre).all()
        if s.id in sectores_usados
    ]
    grupos = [
        {"nombre": f"{g.id} — {g.descripcion}"}
        for g in db.query(GrupoTecnico).order_by(GrupoTecnico.id).all()
    ]

    return {"tipos": tipos, "sectores": sectores, "grupos": grupos, "estados": estados}

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