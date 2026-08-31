"""Endpoints de planes de mantenimiento (las plantillas de MP y sus checklists).

Un "plan de mantenimiento" = una plantilla_mp + sus checklist_items. Define qué
se revisa para un tipo de equipo (o el plan genérico base) y cada cuántos días.

Flujo que soporta (lo que pidió Cami):
  - Crear un plan por tipo de equipo (ej: plan de desfibriladores).
  - Crear un plan GENÉRICO (es_generica=True): el básico para equipos sin plan
    propio (estado externo, verificación funcional, seguridad eléctrica).
  - Buscar qué plan le corresponde a un activo: primero el de su tipo; si no
    tiene, el genérico. Esto es lo que permite asociar el plan automáticamente
    al crear un MP.

Protegido con login. (Más adelante: restringir crear-plan a jefatura/técnicos
cuando sumemos permisos por rol — anotado como pendiente aparte.)
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import PlantillaMP, ChecklistItem, Activo, Usuario
from ..schemas import (
    PlanMantenimientoCreate,
    PlanMantenimientoOut,
    PlanMantenimientoDetalle,
)
from ..security import get_current_user, requiere_rol

router = APIRouter(prefix="/planes-mantenimiento", tags=["planes_mantenimiento"])


# ═══════════════════════════════════════════════════════════════════════════
# LISTAR PLANES (GET)
# ═══════════════════════════════════════════════════════════════════════════

@router.get("", response_model=list[PlanMantenimientoOut])
def listar_planes(
    solo_genericas: bool = False,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Listar los planes de mantenimiento. Con solo_genericas=True, solo el/los genéricos."""
    q = db.query(PlantillaMP)
    if solo_genericas:
        q = q.filter(PlantillaMP.es_generica == True)  # noqa: E712
    return q.all()


@router.get("/{plan_id}", response_model=PlanMantenimientoDetalle)
def ver_plan(
    plan_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Ver un plan con todos sus ítems de checklist, ordenados."""
    plan = db.query(PlantillaMP).filter(PlantillaMP.id == plan_id).first()
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan de mantenimiento no encontrado")
    # ordenar los items por su campo 'orden' para mostrarlos como checklist
    plan.items.sort(key=lambda it: it.orden)
    return plan


# ═══════════════════════════════════════════════════════════════════════════
# QUÉ PLAN LE CORRESPONDE A UN ACTIVO (GET)
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/para-activo/{activo_codigo}", response_model=PlanMantenimientoDetalle)
def plan_para_activo(
    activo_codigo: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Devuelve el plan que le corresponde a un activo.

    Lógica: primero busca un plan del TIPO del activo. Si no hay, cae al plan
    GENÉRICO. Esto es lo que permite asociar el plan automáticamente cuando se
    crea un MP para ese equipo.
    """
    activo = db.query(Activo).filter(Activo.codigo == activo_codigo).first()
    if activo is None:
        raise HTTPException(status_code=404, detail="Activo no encontrado")

    # 1. ¿Hay plan para el tipo de este activo?
    plan = (
        db.query(PlantillaMP)
        .filter(PlantillaMP.tipo_equipo_id == activo.tipo_equipo_id)
        .first()
    )
    # 2. Si no, usar el genérico.
    if plan is None:
        plan = db.query(PlantillaMP).filter(PlantillaMP.es_generica == True).first()  # noqa: E712
    if plan is None:
        raise HTTPException(
            status_code=404,
            detail="No hay plan para este tipo de equipo ni plan genérico definido.",
        )

    plan.items.sort(key=lambda it: it.orden)
    return plan


# ═══════════════════════════════════════════════════════════════════════════
# CREAR UN PLAN (POST) — plantilla + sus checklists de una
# ═══════════════════════════════════════════════════════════════════════════

@router.post("", response_model=PlanMantenimientoDetalle, status_code=201)
def crear_plan(
    payload: PlanMantenimientoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("coordinacion")),
):
    """Crear un plan de mantenimiento con todos sus ítems de checklist.

    Reglas:
      - Si NO es genérica, tiene que venir tipo_equipo_id (para qué tipo es).
      - Si es genérica, tipo_equipo_id se ignora (el plan sirve para cualquiera).
    """
    # Validar coherencia genérica / tipo.
    if not payload.es_generica and not payload.tipo_equipo_id:
        raise HTTPException(
            status_code=400,
            detail="Un plan no genérico necesita tipo_equipo_id.",
        )

    # 1. Crear la plantilla.
    plan = PlantillaMP(
        nombre=payload.nombre,
        frecuencia_dias=payload.frecuencia_dias,
        descripcion=payload.descripcion,
        es_generica=payload.es_generica,
        # si es genérica, no atamos a un tipo
        tipo_equipo_id=None if payload.es_generica else payload.tipo_equipo_id,
    )
    db.add(plan)
    db.flush()   # flush (no commit): consigue el id del plan sin cerrar la transacción

    # 2. Crear cada ítem del checklist, colgado de este plan.
    for it in payload.items:
        item = ChecklistItem(
            plantilla_mp_id=plan.id,
            orden=it.orden,
            descripcion=it.descripcion,
            obligatorio=it.obligatorio,
        )
        db.add(item)

    # 3. Un solo commit: el plan y todos sus ítems se guardan juntos.
    db.commit()
    db.refresh(plan)
    plan.items.sort(key=lambda it: it.orden)
    return plan