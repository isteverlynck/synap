"""Generar y consultar las OT preventivas según la próxima fecha de MP de
cada equipo.

Etapa 5 del rediseño. Cada equipo tiene una 'proxima_fecha_mp' (cuándo le toca
el próximo mantenimiento preventivo). generar_preventivas_core busca los
equipos cuya próxima MP cae en el mes indicado y genera una OT preventiva por
cada uno, asignada al grupo que atiende ese equipo. No duplica: si un equipo
ya tiene una OT preventiva ese mes, no crea otra.

Quién la dispara: el backend la corre SOLO — ver app/scheduler.py, que la
llama al arrancar (por si el backend estuvo apagado el día 1) y todos los
días a la madrugada (por si hoy es día 1). El POST /generar de acá abajo
queda como resguardo manual, para forzar un re-chequeo o generar un mes
puntual sin esperar.

GET /calendario es la otra mitad: dejar que cualquiera vea, de cualquier mes
(pasado, actual o futuro), qué mantenimientos hay — generados o todavía en
pronóstico — para poder organizarse.
"""

import re
from datetime import datetime, date
from calendar import monthrange

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, extract
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..fechas import sumar_meses
from ..models import Activo, OrdenTrabajo, GrupoTipoEquipo, MantenimientoPreventivo, Usuario
from ..schemas import (
    GenerarPreventivasRequest,
    PreventivasGeneradas,
    CalendarioPreventivas,
    ItemCalendarioPreventiva,
    ResumenCalendarioMeses,
    ItemResumenMes,
)
from ..security import get_current_user, requiere_rol

router = APIRouter(prefix="/preventivas", tags=["preventivas"])


def _grupo_de_activo(db, activo):
    """Grupo que atiende un activo, vía su tipo. None si no se puede deducir."""
    if activo.tipo_equipo_id is None:
        return None
    rel = db.query(GrupoTipoEquipo).filter(
        GrupoTipoEquipo.tipo_equipo_id == activo.tipo_equipo_id
    ).first()
    return rel.grupo_id if rel else None


def _descripcion_mp(anio: int, mes: int) -> str:
    """El texto de descripción que identifica 'la OT preventiva de ESTE
    equipo para ESTE mes'. Se usa tanto para no duplicar al generar como
    para reconocer, al armar el calendario, qué OT corresponde a qué mes."""
    return f"Mantenimiento preventivo programado ({anio}-{mes:02d})"


def generar_preventivas_core(db: Session, anio: int, mes: int) -> PreventivasGeneradas:
    """La lógica de generar las OT preventivas de un mes, sin Depends de
    FastAPI — así la puede llamar tanto el endpoint POST /generar (a mano)
    como el scheduler automático (app/scheduler.py, sin request HTTP de por
    medio).

    Idempotente: si para un equipo ya existe la OT de ese mes, no crea otra.
    Por eso es seguro llamarla de más (al arrancar el backend, todos los días
    a la madrugada, o a mano): nunca duplica.
    """
    # Equipos cuya próxima MP cae en ese mes/año O ya venció antes. Comparar
    # por mes exacto dejaba huérfano a cualquier equipo que se saltease un mes:
    # su proxima_fecha_mp quedaba en el pasado y ninguna corrida posterior
    # volvía a preguntar por él.
    ultimo_dia = date(anio, mes, monthrange(anio, mes)[1])
    equipos = (
        db.query(Activo)
        .filter(
            Activo.proxima_fecha_mp.isnot(None),
            Activo.proxima_fecha_mp <= ultimo_dia,
            # Un equipo dado de baja no genera preventivas. Se busca "BAJA"
            # adentro del texto (y no una igualdad exacta) porque en la base
            # conviven dos formas de escribirlo: "DE_BAJA", que es la que
            # guarda la app al dar de alta o editar un equipo, y "BAJA", la
            # de los datos cargados a mano. notilike no distingue mayúsculas.
            Activo.estado.notilike("%BAJA%"),
        )
        .all()
    )

    generadas = 0
    ya_existian = 0
    codigos = []
    descripcion_mp = _descripcion_mp(anio, mes)
        
    for activo in equipos:
        # ¿ya hay una OT preventiva para este equipo en ese mes? (no duplicar)
        # o una preventiva de un mes anterior que todavía sigue abierta: un
        # equipo no puede tener dos preventivas abiertas a la vez.
        existente = (
            db.query(OrdenTrabajo)
            .filter(
                OrdenTrabajo.activo_codigo == activo.codigo,
                OrdenTrabajo.tipo == "PREVENTIVA",
                or_(
                    OrdenTrabajo.descripcion == descripcion_mp,
                    OrdenTrabajo.estado != "CERRADA",
                ),
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
            descripcion=descripcion_mp,
            grupo_id=grupo,
            fecha_apertura=datetime.utcnow(),
        )
        db.add(orden)
        # flush (no commit): necesitamos orden.id ya asignado para engancharle
        # el MantenimientoPreventivo de abajo, sin cerrar la transacción.
        db.flush()

        # Si el equipo tiene un checklist vinculado, generamos también el
        # registro de MantenimientoPreventivo: es lo que conecta esta OT con
        # su checklist (plantilla_mp_id) para que la pantalla de la OT pueda
        # mostrarlo y la persona lo vaya completando ítem por ítem. Sin este
        # registro, la OT preventiva queda sin checklist para completar (les
        # pasa a los equipos que no tienen plantilla_mp_id cargada).
        if activo.plantilla_mp_id:
            mp = MantenimientoPreventivo(
                activo_codigo=activo.codigo,
                plantilla_mp_id=activo.plantilla_mp_id,
                ot_id=orden.id,
                fecha_programada=date(anio, mes, 1),
                # OJO: la base tiene una restricción (CHECK) sobre este campo
                # que NO acepta "PROGRAMADO" — los valores reales que usa el
                # resto del sistema (ver bases/mantenimientos_preventivos_rows.csv
                # y mantenimientos.py) son PENDIENTE / VENCIDO / REALIZADO.
                # Este MP recién nace, todavía no se hizo: PENDIENTE.
                estado="PENDIENTE",
                generado_automaticamente=True,
            )
            db.add(mp)

        generadas += 1
        codigos.append(activo.codigo)

        # Reprogramar el ciclo siguiente: fecha fija, avanza apenas se genera
        # la OT (no cuando se cierra) — así el 1° de junio de todos los años
        # siguientes vuelve a dispararse sola, se haya cerrado a tiempo la
        # anterior o no. Los equipos sin frecuencia cargada (los que ya
        # existían antes de esta función, o los que se crearon sin programarles
        # mantenimiento) no se tocan: no hay forma de saber cada cuánto repetir.
        if activo.frecuencia_mp_meses:
            activo.proxima_fecha_mp = sumar_meses(activo.proxima_fecha_mp, activo.frecuencia_mp_meses)

    db.commit()

    return PreventivasGeneradas(
        mes=f"{anio}-{mes:02d}",
        cantidad_generada=generadas,
        ya_existian=ya_existian,
        equipos=codigos,
    )


@router.post("/generar", response_model=PreventivasGeneradas)
def generar_preventivas(
    payload: GenerarPreventivasRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("coordinacion")),
):
    """Generar (o re-chequear) las OT preventivas de un mes, a mano.

    Ya no hace falta usar esto en el uso normal: el backend genera las
    preventivas solo (ver app/scheduler.py — corre al arrancar y todos los
    días a la madrugada). Este endpoint queda como resguardo manual: por
    ejemplo si el backend estuvo apagado varios días y coordinación quiere
    forzar el chequeo ya mismo, o para generar/probar un mes puntual
    (anio/mes) distinto del actual.

    Sin parámetros usa el mes actual.
    """
    hoy = date.today()
    anio = payload.anio or hoy.year
    mes = payload.mes or hoy.month
    return generar_preventivas_core(db, anio, mes)


def _proxima_cae_en_mes(activo: Activo, anio: int, mes: int) -> bool:
    """¿La próxima MP programada de este equipo (o alguna de sus repeticiones
    futuras, si tiene frecuencia) cae en año/mes?

    proxima_fecha_mp solo guarda la SIGUIENTE fecha pendiente — recién se
    reprograma cuando esa OT se genera (ver generar_preventivas_core). Para
    poder mostrar el pronóstico de meses más lejanos (ej. dentro de un año)
    hay que proyectar hacia adelante sumando la frecuencia las veces que
    hagan falta, sin esperar a que cada ciclo intermedio se haya generado.
    """
    if activo.proxima_fecha_mp is None:
        return False
    base = activo.proxima_fecha_mp
    diferencia_meses = (anio - base.year) * 12 + (mes - base.month)
    if diferencia_meses < 0:
        return False
    if not activo.frecuencia_mp_meses or activo.frecuencia_mp_meses <= 0:
        return diferencia_meses == 0
    return diferencia_meses % activo.frecuencia_mp_meses == 0


def _items_del_mes(db: Session, anio: int, mes: int) -> list[ItemCalendarioPreventiva]:
    """La lista de mantenimientos preventivos de un mes puntual (generados +
    pronóstico), sin envolver en el schema de respuesta — es el cuerpo que
    antes vivía directo en GET /calendario. Se separó para que también lo
    pueda usar GET /calendario/resumen (el gráfico de carga por mes), que
    necesita esta misma cuenta para varios meses seguidos sin repetir la
    lógica de qué cuenta como "mantenimiento de ese mes"."""
    descripcion_mp = _descripcion_mp(anio, mes)

    # Las que ya son OT reales de este mes.
    ordenes = (
        db.query(OrdenTrabajo)
        .filter(OrdenTrabajo.tipo == "PREVENTIVA", OrdenTrabajo.descripcion == descripcion_mp)
        .all()
    )
    codigos_generados = {o.activo_codigo for o in ordenes}
    activos_generados = (
        {a.codigo: a for a in db.query(Activo).filter(Activo.codigo.in_(codigos_generados)).all()}
        if codigos_generados else {}
    )

    items = []
    for orden in ordenes:
        activo = activos_generados.get(orden.activo_codigo)
        items.append(ItemCalendarioPreventiva(
            activo_codigo=orden.activo_codigo,
            activo_descripcion=activo.descripcion if activo else orden.activo_codigo,
            activo_ubicacion=activo.ubicacion if activo else None,
            grupo_id=orden.grupo_id,
            generada=True,
            orden_id=orden.id,
            numero_ot=orden.numero_ot,
            estado=orden.estado,
        ))

    equipos_con_mp = (
        db.query(Activo)
        .filter(
            Activo.proxima_fecha_mp.isnot(None),
            Activo.estado.notilike("%BAJA%"),
        )
        .all()
    )
    for activo in equipos_con_mp:
        if activo.codigo in codigos_generados:
            continue
        if _proxima_cae_en_mes(activo, anio, mes):
            items.append(ItemCalendarioPreventiva(
                activo_codigo=activo.codigo,
                activo_descripcion=activo.descripcion,
                activo_ubicacion=activo.ubicacion,
                grupo_id=activo.grupo_id,
                generada=False,
            ))

    items.sort(key=lambda i: i.activo_descripcion)
    return items


@router.get("/calendario", response_model=CalendarioPreventivas)
def calendario_preventivas(
    anio: int | None = None,
    mes: int | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Los mantenimientos preventivos de un mes puntual (por defecto, el
    actual) — pasado, presente o futuro, el que se pida.

    Junta dos cosas en una sola lista:
      - Los que YA son una OT real (generada por generar_preventivas_core,
        a mano o sola).
      - Los que todavía son un PRONÓSTICO: la próxima MP del equipo cae en
        ese mes, pero la OT no se generó todavía (típicamente, meses
        futuros: el generador automático recién los va a crear cuando
        llegue ese mes).

    Sin restricción de rol: es información de planificación para
    organizarse, no una acción — la puede ver cualquier persona logueada
    (jefatura, coordinación o técnicos).
    """
    hoy = date.today()
    anio = anio or hoy.year
    mes = mes or hoy.month
    items = _items_del_mes(db, anio, mes)
    return CalendarioPreventivas(anio=anio, mes=mes, items=items)


_MES_REGEX = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


def _parsear_mes(valor: str, nombre_campo: str) -> tuple[int, int]:
    """Convierte "YYYY-MM" en (año, mes). 400 si no viene en ese formato."""
    m = _MES_REGEX.match(valor or "")
    if not m:
        raise HTTPException(
            status_code=400,
            detail=f"'{nombre_campo}' tiene que tener el formato YYYY-MM (ej: 2026-03).",
        )
    return int(m.group(1)), int(m.group(2))


@router.get("/calendario/resumen", response_model=ResumenCalendarioMeses)
def resumen_calendario(
    desde: str,
    hasta: str,
    grupo_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Cuántos mantenimientos preventivos hay programados en cada mes de un
    rango (generados + pronóstico, mismo criterio que GET /calendario) — es
    el dato del gráfico de barras "carga por mes" del calendario, para ver
    de un vistazo qué mes tiene más mantenimientos encima.

    desde/hasta: "YYYY-MM", los dos inclusive. grupo_id: opcional, para ver
    la carga de un solo grupo técnico en vez de todos mezclados. Igual que
    /calendario, sin restricción de rol — es información de planificación.
    """
    anio_desde, mes_desde = _parsear_mes(desde, "desde")
    anio_hasta, mes_hasta = _parsear_mes(hasta, "hasta")

    # Índice absoluto de mes (0 = enero del año 0) para poder recorrer el
    # rango sumando de a uno sin manejar a mano el "diciembre → enero".
    idx_desde = anio_desde * 12 + (mes_desde - 1)
    idx_hasta = anio_hasta * 12 + (mes_hasta - 1)
    cantidad_meses = idx_hasta - idx_desde + 1

    if cantidad_meses <= 0:
        raise HTTPException(status_code=400, detail="'hasta' tiene que ser igual o posterior a 'desde'.")
    if cantidad_meses > 36:
        raise HTTPException(status_code=400, detail="El rango no puede superar los 36 meses.")

    resumen = []
    for i in range(cantidad_meses):
        idx = idx_desde + i
        anio, mes = divmod(idx, 12)
        mes += 1
        items = _items_del_mes(db, anio, mes)
        if grupo_id:
            items = [it for it in items if it.grupo_id == grupo_id]
        resumen.append(ItemResumenMes(anio=anio, mes=mes, cantidad=len(items)))

    return ResumenCalendarioMeses(items=resumen)