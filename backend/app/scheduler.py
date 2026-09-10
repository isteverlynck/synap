"""Disparador automático de las OT preventivas.

Antes esto se generaba solo a mano (por Swagger — no había ni botón en la
app), y era fácil que se olvidara: un equipo podía tener su
'próxima fecha de MP' guardada y nunca terminar generando la orden.

Acá levantamos un scheduler DENTRO del propio proceso del backend
(APScheduler) que:

  1. Al arrancar el backend, genera de una las preventivas del MES ACTUAL —
     así, si el backend estuvo apagado justo el día 1 (algo común en
     desarrollo, donde no queda corriendo todo el tiempo), se pone al día
     apenas se prende, sin esperar al próximo día 1.
  2. Todos los días a la madrugada revisa si es día 1 del mes y, si lo es,
     genera las preventivas de ese mes.

generar_preventivas_core (ver routers/preventivas.py) es idempotente: si la
OT de un equipo para ese mes ya existe, no la duplica. Por eso no hay
problema en llamarla de más — ni al arrancar, ni un día que no es el 1.

Nota para producción real: esto alcanza porque el backend queda corriendo
todo el tiempo en un servidor. El propio código de preventivas.py ya lo
dejaba anotado como trabajo futuro (haría falta un programador de tareas) —
esto lo resuelve mientras el proceso del backend esté vivo. Si algún día se
despliega de una forma donde el proceso NO queda siempre encendido (por
ejemplo, alguna plataforma serverless), este scheduler no alcanzaría y
habría que moverlo a un cron externo que le pegue a POST /preventivas/generar.
"""

import logging
from datetime import date

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .database import SessionLocal
from .routers.preventivas import generar_preventivas_core

logger = logging.getLogger("synap.preventivas")

_scheduler: BackgroundScheduler | None = None


def _job_generar_mes_actual() -> None:
    """Genera (o re-chequea, sin duplicar) las preventivas del mes actual.
    Abre y cierra su propia sesión de base porque, a diferencia de un
    endpoint, no hay un request de FastAPI que se la dé con get_db()."""
    hoy = date.today()
    db = SessionLocal()
    try:
        resultado = generar_preventivas_core(db, hoy.year, hoy.month)
        if resultado.cantidad_generada:
            logger.info(
                "Preventivas %s: %s OT generadas (%s), %s ya existían.",
                resultado.mes, resultado.cantidad_generada,
                ", ".join(resultado.equipos), resultado.ya_existian,
            )
        else:
            logger.info(
                "Preventivas %s: nada nuevo que generar (%s ya existían).",
                resultado.mes, resultado.ya_existian,
            )
    except Exception:
        # Un error acá (ej. la base momentáneamente caída) no puede tirar
        # abajo el backend entero: se loguea y se reintenta en la próxima
        # corrida (mañana a la madrugada, o el próximo reinicio).
        logger.exception("Error generando las preventivas automáticas del mes.")
    finally:
        db.close()


def iniciar_scheduler() -> BackgroundScheduler:
    """Arranca el scheduler. Se llama una vez, al levantar el backend
    (ver main.py). Devuelve la instancia por si hiciera falta pararla."""
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    _scheduler = BackgroundScheduler(timezone="America/Argentina/Buenos_Aires")

    # Al arrancar: pone al día el mes actual. Cubre el caso típico de
    # desarrollo (el backend no estaba prendido justo el día 1) y también
    # sirve para que, si alguien recién cargó un equipo con la próxima MP en
    # el mes en curso, la OT aparezca ya mismo sin esperar a mañana.
    _job_generar_mes_actual()

    # Todos los días a las 00:05, por si hoy es día 1 del mes.
    _scheduler.add_job(
        _job_generar_mes_actual,
        CronTrigger(hour=0, minute=5),
        id="preventivas_diario",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("Scheduler de preventivas iniciado.")
    return _scheduler


def detener_scheduler() -> None:
    """Apaga el scheduler prolijamente al cerrar el backend."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None