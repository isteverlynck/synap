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
from ..schemas import UsuarioOut
from ..security import requiere_rol

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


@router.get("/tecnicos", response_model=list[UsuarioOut])
def listar_tecnicos(
    grupo: str | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("coordinacion")),
):
    """Técnicos que este coordinador puede asignar.

    Devuelve solo los de SUS grupos: es el mismo criterio que ya usa
    /solicitudes/aceptar para validar. Así el desplegable nunca ofrece a alguien
    que después el backend va a rechazar con un 400.

    - grupo (opcional): filtra a un grupo puntual, útil en las solicitudes de
      'cosa', donde el coordinador primero elige el grupo destino.
    - Jefatura ve todos los técnicos (no coordina grupos, pero tiene visión global).
    """
    q = db.query(Usuario).filter(Usuario.rol.in_(["tecnico", "junior"]))

    if current_user.rol != "jefatura":
        # Los grupos que coordina esta persona.
        mis_grupos = [
            g.id for g in db.query(GrupoTecnico).filter(
                GrupoTecnico.coordinador_id == current_user.id
            ).all()
        ]
        q = q.filter(Usuario.grupo.in_(mis_grupos))

    if grupo is not None:
        q = q.filter(Usuario.grupo == grupo)

    return q.order_by(Usuario.apellido, Usuario.nombre).all()