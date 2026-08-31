"""Endpoints de solicitudes de servicio.

Etapa 2 — lo que hace el USUARIO (enfermería/médico):
  - Crear una solicitud de servicio.
  - Ver las suyas (y su estado).

(Los endpoints del coordinador —aceptar/rechazar/modificar— son la Etapa 3.)

Protegido con login. Por ahora cualquier usuario logueado puede crear/ver sus
solicitudes; los permisos finos por rol vienen en la etapa de permisos.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import SolicitudServicio, Activo, Usuario
from ..schemas import SolicitudCrear, SolicitudOut
from ..security import get_current_user

router = APIRouter(prefix="/solicitudes", tags=["solicitudes_servicio"])


# ═══════════════════════════════════════════════════════════════════════════
# CREAR SOLICITUD (POST) — la hace el usuario
# ═══════════════════════════════════════════════════════════════════════════

@router.post("", response_model=SolicitudOut, status_code=201)
def crear_solicitud(
    payload: SolicitudCrear,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Crear una solicitud de servicio.

    El solicitante es el usuario logueado (no se manda, se toma de current_user).
    Regla: tiene que venir activo_codigo O descripcion_cosa (al menos uno).
    """
    # 1. Validar la regla "equipo o cosa": al menos uno de los dos.
    if not payload.activo_codigo and not payload.descripcion_cosa:
        raise HTTPException(
            status_code=400,
            detail="Indicá el equipo (activo_codigo) o, si no es un equipo, "
                   "describí la cosa (descripcion_cosa).",
        )

    # 2. Si mandó un activo, verificar que exista (si no, cruz roja como en Máximo).
    if payload.activo_codigo:
        activo = db.query(Activo).filter(Activo.codigo == payload.activo_codigo).first()
        if activo is None:
            raise HTTPException(
                status_code=404,
                detail=f"No existe el activo {payload.activo_codigo}.",
            )

    # 3. La persona afectada: si no la indican, es el propio solicitante (como Máximo).
    persona_afectada = payload.persona_afectada_id or current_user.id

    # 4. Crear la solicitud. Nace PENDIENTE, esperando que un coordinador la revise.
    solicitud = SolicitudServicio(
        solicitante_id=current_user.id,
        persona_afectada_id=persona_afectada,
        activo_codigo=payload.activo_codigo,
        descripcion_cosa=payload.descripcion_cosa,
        titulo=payload.titulo,
        descripcion_problema=payload.descripcion_problema,
        estado="PENDIENTE",
        created_at=datetime.utcnow(),
    )
    db.add(solicitud)
    db.commit()
    db.refresh(solicitud)
    return solicitud


# ═══════════════════════════════════════════════════════════════════════════
# VER MIS SOLICITUDES (GET) — las que creó el usuario logueado
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/mias", response_model=list[SolicitudOut])
def mis_solicitudes(
    estado: str | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Las solicitudes que creó el usuario logueado.

    Opcional: filtrar por estado (PENDIENTE / ACEPTADA / RECHAZADA) para armar
    las vistas 'en curso / rechazadas / resueltas' del panel del usuario.
    """
    q = db.query(SolicitudServicio).filter(
        SolicitudServicio.solicitante_id == current_user.id
    )
    if estado is not None:
        q = q.filter(SolicitudServicio.estado == estado)
    return q.order_by(SolicitudServicio.created_at.desc()).all()


@router.get("/{solicitud_id}", response_model=SolicitudOut)
def ver_solicitud(
    solicitud_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Ver una solicitud puntual por su id."""
    sol = db.query(SolicitudServicio).filter(
        SolicitudServicio.id == solicitud_id
    ).first()
    if sol is None:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    return sol