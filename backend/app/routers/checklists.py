"""Endpoints de checklists de mantenimiento.

Dos conceptos distintos (importante no confundirlos):

  PLANTILLA (checklist_items): qué hay que revisar para cada tipo de MP. Es fijo.
    Ej: "MP anual de monitor" tiene 6 pasos: inspección visual, verificar alarmas...

  RESPUESTAS (checklist_respuestas): qué se cumplió en UN mantenimiento concreto.
    Ej: en el MP del 15/03 del monitor X, el paso 1 se completó, el paso 2 no...

Por eso hay dos tipos de endpoint:
  - GET: ver el checklist de una plantilla, y ver las respuestas de un MP.
  - POST: registrar la respuesta a un ítem (lo que llena el técnico).

Todos protegidos con login (get_current_user).

Estado:
  - GET: funcionando.
  - POST: escrito y ACTIVO (ya hay datos para probarlo). Registra una respuesta.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    ChecklistItem,
    ChecklistRespuesta,
    PlantillaMP,
    MantenimientoPreventivo,
    Usuario,
)
from ..schemas import (
    ChecklistItemOut,
    ChecklistRespuestaOut,
    ChecklistRespuestaCreate,
)
from ..security import get_current_user

router = APIRouter(prefix="/checklists", tags=["checklists"])


# ═══════════════════════════════════════════════════════════════════════════
# VER LA PLANTILLA (GET) — qué hay que revisar
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/plantilla/{plantilla_mp_id}", response_model=list[ChecklistItemOut])
def ver_checklist_de_plantilla(
    plantilla_mp_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Ver los ítems de checklist de una plantilla de MP, ordenados por paso.

    Esto es lo que se le muestra al técnico como guía cuando va a hacer el MP:
    la lista de puntos a revisar, en orden.
    """
    items = (
        db.query(ChecklistItem)
        .filter(ChecklistItem.plantilla_mp_id == plantilla_mp_id)
        .order_by(ChecklistItem.orden)
        .all()
    )
    return items


# ═══════════════════════════════════════════════════════════════════════════
# VER LAS RESPUESTAS DE UN MP (GET) — qué se cumplió en un mantenimiento
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/respuestas/{mp_id}", response_model=list[ChecklistRespuestaOut])
def ver_respuestas_de_mp(
    mp_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Ver las respuestas registradas en un mantenimiento concreto.

    Muestra, para ese MP, qué puntos del checklist se marcaron como completados.
    """
    respuestas = (
        db.query(ChecklistRespuesta)
        .filter(ChecklistRespuesta.mp_id == mp_id)
        .all()
    )
    return respuestas


# ═══════════════════════════════════════════════════════════════════════════
# REGISTRAR UNA RESPUESTA (POST) — lo que llena el técnico
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/respuestas", response_model=ChecklistRespuestaOut, status_code=201)
def registrar_respuesta(
    payload: ChecklistRespuestaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Registrar la respuesta a un ítem del checklist en un MP concreto.

    Verifica que el MP y el ítem existan antes de guardar (para no dejar
    respuestas colgadas que apunten a cosas que no existen).
    """
    # 1. El MP tiene que existir.
    mp = db.query(MantenimientoPreventivo).filter(
        MantenimientoPreventivo.id == payload.mp_id
    ).first()
    if mp is None:
        raise HTTPException(status_code=404, detail="El mantenimiento no existe.")

    # 2. El ítem de checklist tiene que existir.
    item = db.query(ChecklistItem).filter(
        ChecklistItem.id == payload.checklist_item_id
    ).first()
    if item is None:
        raise HTTPException(status_code=404, detail="El ítem de checklist no existe.")

    # 3. Crear la respuesta.
    respuesta = ChecklistRespuesta(
        mp_id=payload.mp_id,
        checklist_item_id=payload.checklist_item_id,
        completado=payload.completado,
        observacion=payload.observacion,
        completado_por=payload.completado_por,
    )
    db.add(respuesta)
    db.commit()
    db.refresh(respuesta)
    return respuesta