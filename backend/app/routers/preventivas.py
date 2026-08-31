"""Endpoint para generar las OT preventivas del mes.

Etapa 5 del rediseño. Cada equipo tiene una 'proxima_fecha_mp' (cuándo le toca
el próximo mantenimiento preventivo). Este endpoint busca los equipos cuya
próxima MP cae en el mes indicado y genera una OT preventiva por cada uno,
asignada al grupo que atiende ese equipo.

Sobre lo "automático el 1° de cada mes": la LÓGICA de qué generar está acá y es
lo importante. Para que se dispare solo el día 1 se usaría un programador de
tareas (scheduler/cron) en producción — se menciona como trabajo futuro. En el
prototipo se dispara llamando a este endpoint.

Protegido: pensado para jefatura/coordinación (los permisos finos vienen luego).

No duplica: si un equipo ya tiene una OT preventiva ese mes, no crea otra.
"""

from datetime import datetime, date

from fastapi import APIRouter, Depends
from sqlalchemy import func, extract
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Activo, OrdenTrabajo, GrupoTipoEquipo, Usuario
from ..schemas import GenerarPreventivasRequest, PreventivasGeneradas
from ..security import get_current_user

router = APIRouter(prefix="/preventivas", tags=["preventivas"])


def _grupo_de_activo(db, activo):
    """Grupo que atiende un activo, vía su tipo. None si no se puede deducir."""
    if activo.tipo_equipo_id is None:
        return None
    rel = db.query(GrupoTipoEquipo).filter(
        GrupoTipoEquipo.tipo_equipo_id == activo.tipo_equipo_id
    ).first()
    return rel.grupo_id if rel else None


@router.post("/generar", response_model=PreventivasGeneradas)
def generar_preventivas(
    payload: GenerarPreventivasRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Generar las OT preventivas de un mes.

    Sin parámetros usa el mes actual. Con anio/mes genera las de ese mes.
    Busca equipos cuya proxima_fecha_mp cae en el mes, y crea una OT preventiva
    por cada uno (sin duplicar las que ya existan).
    """
    hoy = date.today()
    anio = payload.anio or hoy.year
    mes = payload.mes or hoy.month

    # Equipos cuya próxima MP cae en ese mes/año.
    equipos = (
        db.query(Activo)
        .filter(
            extract("year", Activo.proxima_fecha_mp) == anio,
            extract("month", Activo.proxima_fecha_mp) == mes,
        )
        .all()
    )

    generadas = 0
    ya_existian = 0
    codigos = []

    for activo in equipos:
        # ¿ya hay una OT preventiva para este equipo en ese mes? (no duplicar)
        # existente = (
        #     db.query(OrdenTrabajo)
        #     .filter(
        #         OrdenTrabajo.activo_codigo == activo.codigo,
        #         OrdenTrabajo.tipo == "PREVENTIVA",
        #         extract("year", OrdenTrabajo.fecha_apertura) == anio,
        #         extract("month", OrdenTrabajo.fecha_apertura) == mes,
        #     )
        #     .first()
        # )
        descripcion_mp = f"Mantenimiento preventivo programado ({anio}-{mes:02d})"
        existente = (
            db.query(OrdenTrabajo)
            .filter(
                OrdenTrabajo.activo_codigo == activo.codigo,
                OrdenTrabajo.tipo == "PREVENTIVA",
                OrdenTrabajo.descripcion == descripcion_mp,
            )
            .first()
        )
        if existente:
            ya_existian += 1
            continue

        grupo = _grupo_de_activo(db, activo)

        ultimo = db.query(func.max(OrdenTrabajo.numero_ot)).scalar()
        numero_ot = (ultimo or 0) + 1

        orden = OrdenTrabajo(
            numero_ot=numero_ot,
            activo_codigo=activo.codigo,
            tipo="PREVENTIVA",
            estado="ABIERTA",   # las preventivas del grupo nacen abiertas (las toma el grupo)
            # descripcion=f"Mantenimiento preventivo programado ({anio}-{mes:02d})",
            descripcion=descripcion_mp,
            grupo_id=grupo,
            fecha_apertura=datetime.utcnow(),
        )
        db.add(orden)
        generadas += 1
        codigos.append(activo.codigo)

    db.commit()

    return PreventivasGeneradas(
        mes=f"{anio}-{mes:02d}",
        cantidad_generada=generadas,
        ya_existian=ya_existian,
        equipos=codigos,
    )