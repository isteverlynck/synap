"""Endpoint del dashboard de KPIs para jefatura.

Calcula, EN TIEMPO REAL (cada vez que se pide), los indicadores del anteproyecto
más los estándar de la industria (MTTR, MTBF):

  1. Cumplimiento de mantenimiento preventivo (% realizados vs total).
  2. Tiempo de inactividad del equipamiento (cierre - notificación, correctivas).
  3. Frecuencia y tipo de fallas por equipo.
  4. MTTR — tiempo medio de reparación (apertura - cierre).
  5. MTBF — tiempo medio entre fallas (confiabilidad), por equipo y por tipo.

Es solo LECTURA: no modifica nada. Se calcula bajo demanda, apropiado para la
escala del servicio (decenas/cientos de equipos). A mayor escala se migraría a
un cálculo programado (ej: nocturno).

Protegido con login. (Pendiente: restringir a rol jefatura con permisos por rol.)
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import OrdenTrabajo, MantenimientoPreventivo, Falla, Activo, Usuario
from ..schemas import (
    DashboardKPIs,
    FallasPorEquipo,
    FallasPorTipo,
    MTBFItem,
)
from ..security import get_current_user

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
    current_user: Usuario = Depends(get_current_user),
):
    """Devuelve todos los KPIs del panel de jefatura en una sola respuesta."""

    # ─── KPI 1: cumplimiento de MP ───
    # Criterio ACTUAL: 'realizado' = tiene fecha_realizada (se hizo alguna vez).
    # TODO (con Cami): decidir si 'cumplido' es "se hizo" o "se hizo a tiempo"
    #                  (fecha_realizada <= fecha_programada), o mostrar ambos.
    mps = db.query(MantenimientoPreventivo).all()
    mp_totales = len(mps)
    mp_realizados = sum(1 for m in mps if m.fecha_realizada is not None)
    cumplimiento = round(100 * mp_realizados / mp_totales, 1) if mp_totales else None

    # ─── KPI 2: tiempo de inactividad (correctivas: cierre - notificación) ───
    correctivas = db.query(OrdenTrabajo).filter(OrdenTrabajo.tipo == "CORRECTIVA").all()
    inactividades = []
    for o in correctivas:
        d = _dias_entre(o.fecha_notificacion, o.fecha_cierre)
        if d is not None and d >= 0:
            inactividades.append(d)
    inactividad_prom = round(sum(inactividades) / len(inactividades), 1) if inactividades else None

    # ─── KPI 3: fallas ───
    fallas = db.query(Falla).all()
    fallas_totales = len(fallas)
    cuenta_equipo = {}
    cuenta_tipo = {}
    for f in fallas:
        cuenta_equipo[f.activo_codigo] = cuenta_equipo.get(f.activo_codigo, 0) + 1
        t = f.tipo_falla or "SIN_TIPO"
        cuenta_tipo[t] = cuenta_tipo.get(t, 0) + 1
    top_equipos = sorted(cuenta_equipo.items(), key=lambda x: x[1], reverse=True)[:10]
    fallas_por_equipo = [FallasPorEquipo(activo_codigo=k, cantidad=v) for k, v in top_equipos]
    fallas_por_tipo = [
        FallasPorTipo(tipo_falla=k, cantidad=v)
        for k, v in sorted(cuenta_tipo.items(), key=lambda x: x[1], reverse=True)
    ]

    # ─── KPI 4: MTTR — tiempo medio de reparación (apertura - cierre) ───
    todas_ot = db.query(OrdenTrabajo).all()
    reparaciones = []
    for o in todas_ot:
        d = _dias_entre(o.fecha_apertura, o.fecha_cierre)
        if d is not None and d >= 0:
            reparaciones.append(d)
    mttr = round(sum(reparaciones) / len(reparaciones), 1) if reparaciones else None

    # ─── KPI 5: MTBF — tiempo medio entre fallas ───
    # Necesitamos las fechas de cada falla, agrupadas por equipo y por tipo.
    # Para el tipo, mapeamos cada activo a su tipo_equipo_id.
    tipo_de_activo = {a.codigo: a.tipo_equipo_id for a in db.query(Activo).all()}

    fechas_por_equipo = {}
    fechas_por_tipo = {}
    for f in fallas:
        fecha = f.fecha_reporte
        if fecha is None:
            continue
        fechas_por_equipo.setdefault(f.activo_codigo, []).append(fecha)
        tipo = tipo_de_activo.get(f.activo_codigo, "SIN_TIPO")
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