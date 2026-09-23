"""Endpoint del dashboard de KPIs para jefatura.

Calcula, EN TIEMPO REAL (cada vez que se pide), los indicadores del anteproyecto
más los estándar de la industria (MTTR, MTBF):

  1. Cumplimiento de mantenimiento preventivo (% realizados vs total).
  2. Tiempo de inactividad del equipamiento (cierre - notificación, correctivas).
  3. Frecuencia y tipo de fallas por equipo.
  4. MTTR — tiempo medio de reparación (apertura - cierre), solo correctivas.
  5. MTBF — tiempo medio entre fallas (confiabilidad), por equipo y por tipo.

Es solo LECTURA: no modifica nada. Se calcula bajo demanda, apropiado para la
escala del servicio (decenas/cientos de equipos). A mayor escala se migraría a
un cálculo programado (ej: nocturno).

Sobre "fallas" (KPI 3 y 5): el reporte de fallas del anteproyecto lo cubre el
flujo de solicitudes de servicio (una solicitud aceptada por coordinación se
convierte en OT correctiva) — la tabla `Falla` quedó sin usar, nada la
escribe. Por eso estos dos KPI leen de OT tipo CORRECTIVA, no de `Falla`:
"por tipo" agrupa por `prioridad` (baja/media/alta/urgente), que es la
clasificación que sí existe en el sistema. Para el MTBF, la fecha del evento
es la de la SOLICITUD que originó la correctiva (cuándo se avisó del
problema) — no la de la OT — y cuenta apenas esa solicitud fue ACEPTADA, sin
importar si la OT sigue abierta o ya se cerró (una rechazada no cuenta: nunca
llega a tener OT asociada). Si la correctiva no vino de una solicitud (ej:
salió de un ítem de checklist en una preventiva), se usa la fecha de
notificación/apertura de la OT como fallback.

Protegido con login. (Pendiente: restringir a rol jefatura con permisos por rol.)
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import OrdenTrabajo, MantenimientoPreventivo, SolicitudServicio, Activo, Usuario
from ..schemas import (
    DashboardKPIs,
    FallasPorEquipo,
    FallasPorTipo,
    MTBFItem,
)
from ..security import get_current_user, requiere_rol

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _dias_entre(desde, hasta):
    """Días (float) entre dos datetimes/dates. None si falta alguno."""
    if desde is None or hasta is None:
        return None
    return (hasta - desde).total_seconds() / 86400.0


def _mtbf_de_fechas(fechas):
    """Dada una lista de fechas de fallas, devuelve el MTBF en días.

    MTBF = promedio de los intervalos entre fallas sucesivas. Necesita 2+ fechas
    (con 1 sola falla no hay ningún intervalo que medir). Devuelve None si no.
    """
    fechas = sorted([f for f in fechas if f is not None])
    if len(fechas) < 2:
        return None
    intervalos = [
        (fechas[i + 1] - fechas[i]).total_seconds() / 86400.0
        for i in range(len(fechas) - 1)
    ]
    return round(sum(intervalos) / len(intervalos), 1)


@router.get("/kpis", response_model=DashboardKPIs)
def obtener_kpis(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("jefatura")),
):
    """Devuelve todos los KPIs del panel de jefatura en una sola respuesta."""

        # ─── KPI 1: cumplimiento de MP ───
    # Definición (con Cami): un MP se cumplió "en tiempo y forma" si se
    # realizó Y la OT se cerró dentro del mismo mes en que se abrió (el mes
    # de fecha_programada). Si se cerró en un mes posterior, hubo un desvío
    # (queda registrado en justificacion_retraso) y NO cuenta como cumplido
    # para este %, aunque sí quede como 'realizado'. Se marca en
    # ordenes_trabajo.cerrar_orden al cerrar la OT preventiva.
    mps = db.query(MantenimientoPreventivo).all()
    mp_totales = len(mps)
    mp_realizados = sum(1 for m in mps if m.fecha_realizada is not None)
    mp_cumplidos_en_tiempo = sum(
        1 for m in mps
        if m.fecha_realizada is not None
        and (m.fecha_realizada.year, m.fecha_realizada.month) == (m.fecha_programada.year, m.fecha_programada.month)
    )
    cumplimiento = round(100 * mp_cumplidos_en_tiempo / mp_totales, 1) if mp_totales else None

    # ─── KPI 2: tiempo de inactividad (correctivas: cierre - notificación) ───
    correctivas = db.query(OrdenTrabajo).filter(OrdenTrabajo.tipo == "CORRECTIVA").all()
    inactividades = []
    for o in correctivas:
        d = _dias_entre(o.fecha_notificacion, o.fecha_cierre)
        if d is not None and d >= 0:
            inactividades.append(d)
    inactividad_prom = round(sum(inactividades) / len(inactividades), 1) if inactividades else None

    # ─── KPI 3: fallas (= OT correctivas; ver nota del módulo) ───
    fallas_totales = len(correctivas)
    cuenta_equipo = {}
    cuenta_tipo = {}
    for o in correctivas:
        cuenta_equipo[o.activo_codigo] = cuenta_equipo.get(o.activo_codigo, 0) + 1
        t = o.prioridad or "SIN_PRIORIDAD"
        cuenta_tipo[t] = cuenta_tipo.get(t, 0) + 1
    top_equipos = sorted(cuenta_equipo.items(), key=lambda x: x[1], reverse=True)[:10]
    fallas_por_equipo = [FallasPorEquipo(activo_codigo=k, cantidad=v) for k, v in top_equipos]
    # El campo se sigue llamando "tipo_falla" en el schema para no tocar el
    # frontend, pero ahora trae la prioridad de la correctiva.
    fallas_por_tipo = [
        FallasPorTipo(tipo_falla=k, cantidad=v)
        for k, v in sorted(cuenta_tipo.items(), key=lambda x: x[1], reverse=True)
    ]

    # ─── KPI 4: MTTR — tiempo medio de reparación (apertura - cierre) ───
    # Solo correctivas: mide cuánto se tarda en resolver una FALLA, y una
    # preventiva no es una falla (es mantenimiento programado) — mezclarlas
    # infla o achica el promedio sin reflejar la capacidad de respuesta real.
    todas_ot = db.query(OrdenTrabajo).all()
    reparaciones = []
    for o in correctivas:
        d = _dias_entre(o.fecha_apertura, o.fecha_cierre)
        if d is not None and d >= 0:
            reparaciones.append(d)
    mttr = round(sum(reparaciones) / len(reparaciones), 1) if reparaciones else None

    # ─── KPI 5: MTBF — tiempo medio entre fallas ───
    # Necesitamos las fechas de cada falla, agrupadas por equipo y por tipo.
    # Para el tipo, mapeamos cada activo a su tipo_equipo_id.
    tipo_de_activo = {a.codigo: a.tipo_equipo_id for a in db.query(Activo).all()}

    # La fecha de "cuándo pasó la falla" es la de la SOLICITUD que la originó
    # (si vino de una), no la de la OT — así lo pidió Cami: es el momento real
    # en que se avisó el problema, antes de que coordinación la acepte.
    fecha_solicitud_por_ot = {
        s.ot_id: s.created_at
        for s in db.query(SolicitudServicio).filter(SolicitudServicio.ot_id.isnot(None)).all()
    }

    fechas_por_equipo = {}
    fechas_por_tipo = {}
    for o in correctivas:
        # Cuenta apenas la solicitud que la originó fue ACEPTADA (no importa
        # si la OT sigue abierta o ya se cerró) — una rechazada nunca llega
        # a tener ot_id, así que ya queda afuera de fecha_solicitud_por_ot.
        # Si nació de una solicitud, la fecha del evento es cuándo se mandó
        # esa solicitud. Si no (ej: salió de un ítem de checklist en una
        # preventiva), fallback a la fecha de notificación/apertura de la OT.
        fecha = fecha_solicitud_por_ot.get(o.id) or o.fecha_notificacion or o.fecha_apertura
        if fecha is None:
            continue
        fechas_por_equipo.setdefault(o.activo_codigo, []).append(fecha)
        tipo = tipo_de_activo.get(o.activo_codigo, "SIN_TIPO")
        fechas_por_tipo.setdefault(tipo, []).append(fecha)

    mtbf_por_equipo = []
    for cod, fechas in fechas_por_equipo.items():
        m = _mtbf_de_fechas(fechas)
        if m is not None:
            mtbf_por_equipo.append(MTBFItem(clave=cod, cantidad_fallas=len(fechas), mtbf_dias=m))
    mtbf_por_equipo.sort(key=lambda x: x.mtbf_dias)  # menor MTBF primero (menos confiable)

    mtbf_por_tipo = []
    for tipo, fechas in fechas_por_tipo.items():
        m = _mtbf_de_fechas(fechas)
        if m is not None:
            mtbf_por_tipo.append(MTBFItem(clave=tipo, cantidad_fallas=len(fechas), mtbf_dias=m))
    mtbf_por_tipo.sort(key=lambda x: x.mtbf_dias)

    # ─── extras de contexto ───
    ot_totales = len(todas_ot)
    ot_abiertas = sum(1 for o in todas_ot if o.estado != "CERRADA")
    activos = list(tipo_de_activo.keys())
    activos_totales = len(activos)
    activos_en_baja = sum(
        1 for a in db.query(Activo).all() if str(a.estado).upper() == "BAJA"
    )

    return DashboardKPIs(
        mp_totales=mp_totales,
        mp_realizados=mp_realizados,
        cumplimiento_mp_pct=cumplimiento,
        inactividad_promedio_dias=inactividad_prom,
        correctivas_evaluadas=len(inactividades),
        fallas_totales=fallas_totales,
        fallas_por_equipo=fallas_por_equipo,
        fallas_por_tipo=fallas_por_tipo,
        mttr_dias=mttr,
        ot_cerradas=len(reparaciones),
        mtbf_por_equipo=mtbf_por_equipo,
        mtbf_por_tipo=mtbf_por_tipo,
        ot_totales=ot_totales,
        ot_abiertas=ot_abiertas,
        activos_totales=activos_totales,
        activos_en_baja=activos_en_baja,
    )