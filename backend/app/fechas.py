"""Utilidades de fechas compartidas entre routers.

Tiene 'sumar_meses', que usan tanto la creación de un activo (para calcular
su primera 'próxima fecha de mantenimiento') como /preventivas/generar (para
reprogramar el ciclo siguiente); y 'hoy_argentina', para decisiones de
negocio que dependen del día/mes calendario real en Argentina (no en UTC).
"""

from calendar import monthrange
from datetime import date, datetime
from zoneinfo import ZoneInfo

_TZ_ARGENTINA = ZoneInfo("America/Argentina/Buenos_Aires")


def hoy_argentina() -> datetime:
    """Fecha y hora actual en horario de Argentina (America/Argentina/Buenos_Aires).

    El backend usa datetime.utcnow() para timestamps (cuándo pasó algo en
    términos absolutos: fecha_completada, duración de una parada, etc.) — para
    eso UTC está bien, y conviene mantenerlo así para que todos los timestamps
    guardados sean comparables entre sí.

    Pero hay decisiones de negocio que dependen del día/mes CALENDARIO según
    lo vive el hospital (ej: "¿este mantenimiento se completó en el mes en que
    se programó?"). Para esas, hay que usar la hora de Argentina: cerca de la
    medianoche, UTC ya puede estar en el día/mes siguiente mientras acá
    todavía no (UTC-3). Usar utcnow() para esa comparación hace que, de
    22 a 00 hs aprox., el sistema "crea" que ya es el mes/día siguiente
    cuando en Argentina todavía no lo es.

    Mismo huso horario que ya usa el scheduler (backend/app/scheduler.py).
    """
    return datetime.now(_TZ_ARGENTINA)


def sumar_meses(fecha: date, meses: int) -> date:
    """Suma 'meses' a una fecha, respetando el fin de mes.

    Ej: 31 de enero + 1 mes = 28 (o 29) de febrero, nunca "31 de febrero"
    (que no existe). Sin esto, un mantenimiento programado el 31 podría hacer
    explotar el cálculo en meses más cortos.

    No usamos python-dateutil (que resuelve esto con relativedelta) para no
    sumar una dependencia nueva solo para esta cuenta; es un cálculo chico.
    """
    mes_total = fecha.month - 1 + meses
    anio = fecha.year + mes_total // 12
    mes = mes_total % 12 + 1
    dia = min(fecha.day, monthrange(anio, mes)[1])
    return date(anio, mes, dia)