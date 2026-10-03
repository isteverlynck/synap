"""Endpoint del dashboard de KPIs para jefatura.

Calcula, EN TIEMPO REAL (cada vez que se pide), los indicadores del anteproyecto
más los estándar de la industria (MTTR, MTBF):

  1. Cumplimiento de mantenimiento preventivo (% realizados vs total).
  2. Tiempo de inactividad del equipamiento (tiempo de parada REAL medido a
     mano con "Iniciar parada"/"Finalizar parada", no una resta de fechas).
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

Filtros (grupo_id / tipo_equipo_id): opcionales, se pueden combinar. Cuando se
pasan, TODOS los KPIs se recalculan solo sobre los activos que matchean ese
filtro (y lo que cuelga de ellos — sus OT, sus MP, sus solicitudes). Sin
filtro, es la vista global de siempre. Las opciones para los desplegables del
frontend son las mismas que ya usa la pantalla de activos: GET /activos/filtros
(devuelve tipos y grupos existentes).

Filtro de mes (anio / mes): opcional, van siempre juntos. A diferencia del de
grupo/tipo, este SOLO afecta al cumplimiento de MP (KPI 1) — ver el porqué en
el docstring del endpoint.
"""

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import OrdenTrabajo, MantenimientoPreventivo, SolicitudServicio, Activo, Usuario, GrupoTecnico
from ..schemas import (
    DashboardKPIs,
    FallasPorEquipo,
    FallasPorTipo,
    MTBFItem,
    ConteoEstadoOT,
    ConteoVidaUtil,
    CargaGrupoItem,
    FallasTrimestreItem,
)
from ..security import get_current_user, requiere_rol

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _dias_entre(desde, hasta):
    """Días (float) entre dos datetimes/dates. None si falta alguno."""
    if desde is None or hasta is None:
        return None
    return (hasta - desde).total_seconds() / 86400.0



# Criterio del Hospital Alemán para la vida útil de un equipo, SOLO según su
# antigüedad (no depende del PRIUX ni de si es equipo médico, a diferencia
# de "antiguedad"/"fuera_de_vida_util" en criticidad.py, que son otra cosa:
# un nivel de 1 a 5 que alimenta la fórmula de riesgo, y solo se calcula para
# equipos médicos con datos PRIUX cargados). Esto aplica a CUALQUIER equipo
# que tenga fecha de instalación. Confirmado con Cami (03/10):
#   menos de 5 años     → Moderno
#   de 5 a 10 años       → Aceptable
#   de 10 a 15 años      → Medianamente aceptable
#   más de 15 años       → Obsoleto
# Los bordes (5, 10 y 15 años exactos) se asignaron al tramo de ARRIBA
# (ej: exactamente 10 años → Medianamente aceptable, no Aceptable) — si Cami
# prefiere otro criterio en esos bordes puntuales, se ajusta acá nomás.
def _estado_vida_util(anios: float) -> str:
    if anios < 5:
        return "MODERNO"
    if anios < 10:
        return "ACEPTABLE"
    if anios < 15:
        return "MEDIANAMENTE_ACEPTABLE"
    return "OBSOLETO"


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
    grupo_id: str | None = None,
    tipo_equipo_id: str | None = None,
    anio: int | None = None,
    mes: int | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("jefatura")),
):
    """Devuelve todos los KPIs del panel de jefatura en una sola respuesta.

    grupo_id / tipo_equipo_id: filtros opcionales y combinables (ver nota del
    módulo).

    anio / mes: van siempre juntos (si falta uno de los dos, se ignoran).
    A diferencia de grupo/tipo, este filtro NO afecta a todos los KPIs: solo
    al cumplimiento de MP (KPI 1), sobre el mes de `fecha_programada`. Se
    decidió así porque el resto (fallas, MTTR, MTBF) son indicadores que
    necesitan varios eventos para tener sentido, y acotarlos a un solo mes
    los deja casi siempre en "sin datos"."""

    # ─── Filtro por grupo/tipo de equipo (aplica a TODOS los KPIs) ───
    activos_q = db.query(Activo)
    if grupo_id:
        activos_q = activos_q.filter(Activo.grupo_id == grupo_id)
    if tipo_equipo_id:
        activos_q = activos_q.filter(Activo.tipo_equipo_id == tipo_equipo_id)
    activos_filtrados = activos_q.all()
    codigos_filtrados = {a.codigo for a in activos_filtrados}
    hay_filtro = bool(grupo_id or tipo_equipo_id)

    def filtrar(items, obtener_codigo):
        """Si hay un filtro de grupo/tipo activo, deja solo los items cuyo
        activo cae dentro del subconjunto filtrado. Sin filtro, no toca nada
        (mismo comportamiento que antes de que existiera este filtro)."""
        if not hay_filtro:
            return items
        return [i for i in items if obtener_codigo(i) in codigos_filtrados]

        # ─── KPI 1: cumplimiento de MP ───
    # Definición (con Cami): un MP se cumplió "en tiempo y forma" si se
    # realizó Y la OT se cerró dentro del mismo mes en que se abrió (el mes
    # de fecha_programada). Si se cerró en un mes posterior, hubo un desvío
    # (queda registrado en justificacion_retraso) y NO cuenta como cumplido
    # para este %, aunque sí quede como 'realizado'. Se marca en
    # ordenes_trabajo.cerrar_orden al cerrar la OT preventiva.
    mps_todos = filtrar(db.query(MantenimientoPreventivo).all(), lambda m: m.activo_codigo)
    mps = mps_todos
    if anio and mes:
        mps = [
            m for m in mps
            if m.fecha_programada and m.fecha_programada.year == anio and m.fecha_programada.month == mes
        ]
    mp_totales = len(mps)
    mp_realizados = sum(1 for m in mps if m.fecha_realizada is not None)
    mp_cumplidos_en_tiempo = sum(
        1 for m in mps
        if m.fecha_realizada is not None
        and (m.fecha_realizada.year, m.fecha_realizada.month) == (m.fecha_programada.year, m.fecha_programada.month)
    )
    cumplimiento = round(100 * mp_cumplidos_en_tiempo / mp_totales, 1) if mp_totales else None

    # ─── KPI 2: tiempo de inactividad (correctivas) ───
    correctivas = filtrar(
        db.query(OrdenTrabajo).filter(OrdenTrabajo.tipo == "CORRECTIVA").all(),
        lambda o: o.activo_codigo,
    )
    # Antes esto se ESTIMABA restando fechas (notificación → cierre). Eso no
    # reflejaba cuánto tiempo estuvo el equipo REALMENTE parado: una OT puede
    # tardar en tramitarse sin que el equipo esté fuera de servicio todo ese
    # tiempo. Ahora usamos tiempo_parada_segundos, que es el dato medido a
    # mano con los botones "Iniciar parada"/"Finalizar parada".
    #
    # Solo cuentan correctivas CERRADAS con parada medida (> 0 segundos): al
    # cerrar una OT, si había una parada corriendo se cierra sola (ver
    # _cerrar_parada_si_quedo_abierta en ordenes_trabajo.py), así que en toda
    # OT cerrada el acumulado ya está completo. Un 0 no significa "no estuvo
    # parado": significa "nadie lo midió" (ej. OT de antes de que existiera
    # esta función) — incluirlo ensuciaría el promedio hacia abajo sin que
    # sea un dato real.
    inactividades = [
        o.tiempo_parada_segundos / 86400.0
        for o in correctivas
        if o.estado == "CERRADA" and o.tiempo_parada_segundos and o.tiempo_parada_segundos > 0
    ]
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
    todas_ot = filtrar(db.query(OrdenTrabajo).all(), lambda o: o.activo_codigo)
    reparaciones = []
    for o in correctivas:
        d = _dias_entre(o.fecha_apertura, o.fecha_cierre)
        if d is not None and d >= 0:
            reparaciones.append(d)
    mttr = round(sum(reparaciones) / len(reparaciones), 1) if reparaciones else None

    # ─── KPI 5: MTBF — tiempo medio entre fallas ───
    # Necesitamos las fechas de cada falla, agrupadas por equipo y por tipo.
    # Para el tipo, mapeamos cada activo a su tipo_equipo_id.
    tipo_de_activo = {a.codigo: a.tipo_equipo_id for a in activos_filtrados}

    # La fecha de "cuándo pasó la falla" es la de la SOLICITUD que la originó
    # (si vino de una), no la de la OT — así lo pidió Cami: es el momento real
    # en que se avisó el problema, antes de que coordinación la acepte.
    fecha_solicitud_por_ot = {
        s.ot_id: s.created_at
        for s in db.query(SolicitudServicio).filter(SolicitudServicio.ot_id.isnot(None)).all()
    }

    # Los últimos 4 trimestres (el actual + los 3 anteriores), calculados a
    # partir de hoy — se arman ANTES del loop y con 0 de entrada, así el
    # gráfico de barras "fallas por trimestre" siempre muestra las 4
    # columnas aunque alguna no tenga ninguna falla (mismo criterio que
    # "Mantenimientos planeados").
    hoy = date.today()

    def _trimestre_anterior(t):
        anio, trimestre = t
        return (anio, trimestre - 1) if trimestre > 1 else (anio - 1, 4)

    trimestres_recientes = [(hoy.year, (hoy.month - 1) // 3 + 1)]
    for _ in range(3):
        trimestres_recientes.append(_trimestre_anterior(trimestres_recientes[-1]))
    trimestres_recientes.reverse()  # del más viejo al más nuevo
    cuenta_trimestre = {t: 0 for t in trimestres_recientes}

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
        clave_trimestre = (fecha.year, (fecha.month - 1) // 3 + 1)
        if clave_trimestre in cuenta_trimestre:
            cuenta_trimestre[clave_trimestre] += 1

    fallas_por_trimestre = [
        FallasTrimestreItem(anio=a, trimestre=t, cantidad=cuenta_trimestre[(a, t)])
        for (a, t) in trimestres_recientes
    ]

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
        1 for a in activos_filtrados if str(a.estado).upper() == "BAJA"
    )

    # ─── KPI 6: OT por estado (torta del dashboard) ───
    # Mismos 4 estados que usa el resto de la app (ver CalendarioMP.jsx):
    # ABIERTA, EN_PROGRESO, PENDIENTE_CIERRE, CERRADA. Se omite un estado de
    # la lista si no tiene ninguna OT — así la torta no muestra una porción
    # vacía.
    ESTADOS_OT = ["ABIERTA", "EN_PROGRESO", "PENDIENTE_CIERRE", "CERRADA"]
    cuenta_estado = {e: 0 for e in ESTADOS_OT}
    for o in todas_ot:
        cuenta_estado[o.estado] = cuenta_estado.get(o.estado, 0) + 1
    ot_por_estado = [
        ConteoEstadoOT(estado=e, cantidad=cuenta_estado[e])
        for e in ESTADOS_OT
        if cuenta_estado[e] > 0
    ]

    # ─── KPI 7: carga laboral por grupo técnico ───
    # Cuenta las OT ABIERTAS AHORA (no cerradas) de cada grupo — es la carga
    # de trabajo actual de cada equipo técnico, no el historial completo (una
    # OT ya cerrada no pesa en la carga de hoy). Se ordena de mayor a menor
    # carga, así el grupo más exigido queda primero.
    nombre_de_grupo = {g.id: (g.descripcion or g.id) for g in db.query(GrupoTecnico).all()}
    cuenta_grupo = {}
    for o in todas_ot:
        if o.estado == "CERRADA":
            continue
        clave = o.grupo_id or "SIN_GRUPO"
        cuenta_grupo[clave] = cuenta_grupo.get(clave, 0) + 1
    carga_por_grupo = [
        CargaGrupoItem(
            grupo_id=g,
            grupo_nombre="Sin grupo asignado" if g == "SIN_GRUPO" else nombre_de_grupo.get(g, g),
            cantidad=c,
        )
        for g, c in sorted(cuenta_grupo.items(), key=lambda x: x[1], reverse=True)
    ]

    # ─── KPI 8b: alertas — sin asignar / preventivos vencidos ───
    # "Sin asignar": cualquier OT ABIERTA (no cerrada, correctiva o
    # preventiva) sin técnico asignado — usa tecnico_id, que es el campo de
    # asignación a una PERSONA (grupo_id es el equipo dueño, no quién la
    # tiene tomada). "Vencido" SOLO aplica a preventivos (definición
    # acordada con Cami): el mes de fecha_programada ya pasó y todavía no
    # tiene fecha_realizada — sin importar si generó o no una OT. Usa
    # mps_todos (no el filtro anio/mes de KPI 1: acá siempre se mira el
    # estado actual completo, no un mes puntual).
    ot_sin_asignar = sum(
        1 for o in todas_ot if o.estado != "CERRADA" and o.tecnico_id is None
    )
    preventivos_vencidos = sum(
        1 for m in mps_todos
        if m.fecha_realizada is None
        and (m.fecha_programada.year, m.fecha_programada.month) < (hoy.year, hoy.month)
    )

    # ─── KPI 9: vida útil de los equipos, según antigüedad (torta) ───
    # Respeta el mismo filtro de grupo/tipo que el resto (activos_filtrados).
    # Los equipos sin fecha de instalación no entran en ningún estado (no se
    # puede calcular su antigüedad) — mismo criterio que el resto de los KPI
    # que dependen de un dato que puede faltar.
    ESTADOS_VIDA_UTIL = ["MODERNO", "ACEPTABLE", "MEDIANAMENTE_ACEPTABLE", "OBSOLETO"]
    cuenta_vida_util = {e: 0 for e in ESTADOS_VIDA_UTIL}
    for a in activos_filtrados:
        if a.fecha_instalacion is None:
            continue
        anios = (hoy - a.fecha_instalacion).days / 365.25
        cuenta_vida_util[_estado_vida_util(anios)] += 1
    vida_util_por_estado = [
        ConteoVidaUtil(estado=e, cantidad=cuenta_vida_util[e])
        for e in ESTADOS_VIDA_UTIL
        if cuenta_vida_util[e] > 0
    ]

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
        ot_por_estado=ot_por_estado,
        carga_por_grupo=carga_por_grupo,
        fallas_por_trimestre=fallas_por_trimestre,
        ot_sin_asignar=ot_sin_asignar,
        preventivos_vencidos=preventivos_vencidos,
        vida_util_por_estado=vida_util_por_estado,
    )