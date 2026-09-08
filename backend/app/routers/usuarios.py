"""Endpoints de lectura de usuarios.

Las acciones que ya teníamos (aceptar una solicitud asignando técnico, asignar
una OT) esperan que el frontend les mande el id de la persona. Este router es lo
que le permite al frontend saber QUÉ personas hay para elegir: es el que llena
el desplegable de "asignar a...".
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Usuario, GrupoTecnico
from ..schemas import UsuarioOut, GrupoTecnicoOut
from ..security import requiere_rol

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


@router.get("/tecnicos", response_model=list[UsuarioOut])
def listar_tecnicos(
    grupo: str | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("coordinacion", "tecnico", "junior")),
):
    """Técnicos que esta persona puede ver para asignar o reasignar una OT.

    - Coordinación: los de LOS GRUPOS QUE COORDINA — es el mismo criterio que
      ya usa /solicitudes/aceptar para validar. Así el desplegable nunca ofrece
      a alguien que después el backend va a rechazar con un 400.
    - Técnico (o junior): solo sus propios compañeros de grupo — es lo que
      necesita para pasarle una OT a alguien del equipo.
    - Jefatura: ve a todos (no coordina grupos, pero tiene visión global).

    - grupo (opcional): filtra a un grupo puntual, útil en las solicitudes de
      'cosa', donde el coordinador primero elige el grupo destino.
    """
    q = db.query(Usuario).filter(Usuario.rol.in_(["tecnico", "junior"]))

    if current_user.rol == "coordinacion":
        mis_grupos = [
            g.id for g in db.query(GrupoTecnico).filter(
                GrupoTecnico.coordinador_id == current_user.id
            ).all()
        ]
        q = q.filter(Usuario.grupo.in_(mis_grupos))
    elif current_user.rol in ("tecnico", "junior"):
        q = q.filter(Usuario.grupo == current_user.grupo)
    # jefatura: sin filtro extra, ve a todos.

    if grupo is not None:
        q = q.filter(Usuario.grupo == grupo)

    return q.order_by(Usuario.apellido, Usuario.nombre).all()


@router.get("/grupos", response_model=list[GrupoTecnicoOut])
def listar_grupos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("coordinacion")),
):
    """Los grupos técnicos que existen.

    Lo usa el coordinador para elegir a cuál mandar una solicitud que no es de
    un equipo médico — ahí el grupo no se puede deducir de ningún activo, así
    que lo tiene que elegir a mano al aceptarla."""
    return db.query(GrupoTecnico).order_by(GrupoTecnico.id).all()