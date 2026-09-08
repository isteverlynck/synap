"""Utilidades de fechas compartidas entre routers.

Por ahora solo tiene 'sumar_meses', que usan tanto la creación de un activo
(para calcular su primera 'próxima fecha de mantenimiento') como
/preventivas/generar (para reprogramar el ciclo siguiente).
"""

from calendar import monthrange
from datetime import date


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