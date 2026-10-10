"""Tareas automáticas que corren solas, dentro del propio proceso del backend
(APScheduler): generar las OT preventivas del mes, y avisar por mail los MP
que están por vencer.

  1. PREVENTIVAS DEL MES
     Antes esto se generaba solo a mano (por Swagger — no había ni botón en
     la app), y era fácil que se olvidara: un equipo podía tener su
     'próxima fecha de MP' guardada y nunca terminar generando la orden.
       a. Al arrancar el backend, genera de una las preventivas del MES
          ACTUAL — así, si el backend estuvo apagado justo el día 1 (algo
          común en desarrollo, donde no queda corriendo todo el tiempo), se
          pone al día apenas se prende, sin esperar al próximo día 1.
       b. Todos los días a la madrugada revisa si es día 1 del mes y, si lo
          es, genera las preventivas de ese mes.
     generar_preventivas_core (ver routers/preventivas.py) es idempotente: si
     la OT de un equipo para ese mes ya existe, no la duplica. Por eso no hay
     problema en llamarla de más — ni al arrancar, ni un día que no es el 1.

  2. MP PRÓXIMO A VENCER (aviso por mail a bioingeniería)
     Uno de los 3 disparadores de notificación automática (ver
     notificaciones.py). A diferencia de "OT correctiva creada" o "stock
     crítico" — que los dispara una acción puntual del usuario — este hay
     que ir a buscarlo: todos los días revisa si ya entramos en la ÚLTIMA
     SEMANA del mes (últimos 7 días) y, si es así, avisa los MP programados
     para ESE mes que todavía no se hicieron (estado != REALIZADO). Todos
     los que hay en ese momento van en UN solo mail con la lista (no uno por
     mantenimiento, para no llenar la casilla). Cada MP se marca con
     aviso_vencimiento_enviado=True apenas se avisa una vez, para no mandar
     el mismo mail todos los días de esa semana; si más tarde aparece uno
     nuevo, sale en otro mail aparte.

Nota para producción real: esto alcanza porque el backend queda corriendo
todo el tiempo en un servidor. El propio código de preventivas.py ya lo
dejaba anotado como trabajo futuro (haría falta un programador de tareas) —
esto lo resuelve mientras el proceso del backend esté vivo. Si algún día se
despliega de una forma donde el proceso NO queda siempre encendido (por
ejemplo, alguna plataforma serverless), este scheduler no alcanzaría y
habría que moverlo a un cron externo que le pegue a un endpoint equivalente.
"""

import calendar
import logging
from datetime import date

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .database import SessionLocal
from .models import Activo, MantenimientoPreventivo
from .notificaciones import notificar_bioingenieria
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


def _en_ultima_semana_del_mes(hoy: date) -> bool:
    """True si 'hoy' cae en los últimos 7 días del mes en curso — 'la semana
    antes de que termine el mes', que es cuando se avisan los MP que vencen
    ese mes."""
    _, ultimo_dia = calendar.monthrange(hoy.year, hoy.month)
    return hoy.day > ultimo_dia - 7


def _job_avisar_mp_por_vencer() -> None:
    """Si estamos en la última semana del mes, avisa a bioingeniería de los
    MP programados para ESTE mes que todavía no se hicieron y todavía no se
    avisaron. No hace nada el resto del mes."""
    hoy = date.today()
    if not _en_ultima_semana_del_mes(hoy):
        return

    db = SessionLocal()
    try:
        # generado_automaticamente y demás no importan acá: cualquier MP de
        # este mes que no esté REALIZADO ni avisado todavía cuenta.
        candidatos = (
            db.query(MantenimientoPreventivo)
            .filter(
                MantenimientoPreventivo.estado != "REALIZADO",
                MantenimientoPreventivo.aviso_vencimiento_enviado.isnot(True),
            )
            .all()
        )
        # El mes se compara en Python (año Y mes), no en SQL: mismo criterio
        # que ya usa ordenes_trabajo.cerrar_orden para "a tiempo".
        pendientes = [
            mp for mp in candidatos
            if (mp.fecha_programada.year, mp.fecha_programada.month) == (hoy.year, hoy.month)
        ]

        # UN solo correo con la lista completa (en vez de uno por
        # mantenimiento): a fin de mes pueden ser decenas y llenarían la casilla.
        if pendientes:
            renglones = []
            for mp in sorted(pendientes, key=lambda x: x.fecha_programada):
                activo = db.query(Activo).filter(Activo.codigo == mp.activo_codigo).first()
                descripcion = activo.descripcion if activo else mp.activo_codigo
                renglones.append(
                    f"  - {descripcion} ({mp.activo_codigo}) — programado para "
                    f"{mp.fecha_programada.strftime('%d/%m/%Y')}"
                )
                mp.aviso_vencimiento_enviado = True

            cantidad = len(pendientes)
            notificar_bioingenieria(
                "MP próximos a vencer" if cantidad > 1 else "MP próximo a vencer",
                (
                    (
                        "Hay 1 mantenimiento preventivo programado para este mes "
                        if cantidad == 1 else
                        f"Hay {cantidad} mantenimientos preventivos programados para este mes "
                    )
                    + f"({hoy.strftime('%m/%Y')}) que todavía no se realizaron:\n\n"
                    + "\n".join(renglones)
                    + "\n\nQueda poco para que termine el mes: conviene programarlos "
                    "antes de que se pasen.\n"
                ),
            )

        if pendientes:
            db.commit()
            logger.info("MP por vencer: se avisaron %s.", len(pendientes))
    except Exception:
        db.rollback()
        logger.exception("Error avisando los MP próximos a vencer.")
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
    # Ídem para los avisos de MP por vencer: si arrancamos ya en la última
    # semana del mes, no esperamos a la corrida de mañana para avisar.
    _job_avisar_mp_por_vencer()

    # Todos los días a las 00:05, por si hoy es día 1 del mes.
    _scheduler.add_job(
        _job_generar_mes_actual,
        CronTrigger(hour=0, minute=5),
        id="preventivas_diario",
        replace_existing=True,
    )
    # Todos los días a las 00:10 (después de la de arriba, sin pisarse),
    # revisa si hay que avisar MP por vencer.
    _scheduler.add_job(
        _job_avisar_mp_por_vencer,
        CronTrigger(hour=0, minute=10),
        id="mp_por_vencer_diario",
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