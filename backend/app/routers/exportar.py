"""Descarga de tablas en CSV (para abrir en Excel o Google Sheets).

Cada descarga respeta lo mismo que el rol puede ver en pantalla: si una tabla
no aparece en el menú de un rol, tampoco la puede descargar.

Los archivos se arman para que Excel en español los abra bien de una:
  - separador punto y coma (;), que es el que espera Excel con configuración
    regional de Argentina (con coma, mete todo en una sola columna);
  - una marca al principio del archivo (BOM) para que Excel lea bien las
    tildes y las eñes;
  - fechas en formato dd/mm/aaaa, que Excel reconoce como fecha y deja ordenar.
"""

import csv
import io
import re
from datetime import date

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Activo, TipoEquipo, Servicio, Usuario
from ..security import requiere_rol
from ..criticidad import criticidad_de_varios

router = APIRouter(prefix="/exportar", tags=["exportar"])


def _fecha(valor) -> str:
    """Fecha como dd/mm/aaaa (vacío si no hay)."""
    return valor.strftime("%d/%m/%Y") if valor else ""


def respuesta_csv(nombre_base: str, encabezados: list[str], filas: list[list]) -> Response:
    """Arma el CSV y lo devuelve como archivo para descargar.

    El nombre lleva la fecha del día (ej. equipos_2026-09-25.csv), así si se
    bajan varias veces no se pisan entre sí.
    """
    salida = io.StringIO()
    salida.write("\ufeff")  # BOM: para que Excel lea bien las tildes
    escritor = csv.writer(salida, delimiter=";")
    escritor.writerow(encabezados)
    for fila in filas:
        escritor.writerow(["" if v is None else v for v in fila])

    nombre = f"{nombre_base}_{date.today().isoformat()}.csv"
    return Response(
        content=salida.getvalue().encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


# ═══════════════════════════════════════════════════════════════════════════
# EQUIPOS — técnicos (y junior), coordinación y jefatura (los que tienen la pantalla)
# ═══════════════════════════════════════════════════════════════════════════

_NOMBRE_NIVEL_RIESGO = {"ALTO": "Alto", "MEDIO": "Medio", "BAJO": "Bajo"}


@router.get("/activos")
def exportar_activos(
    buscar: str | None = None,
    estado: str | None = None,
    tipo_equipo_id: str | None = None,
    sector_id: str | None = None,
    grupo_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "junior", "coordinacion")),
):
    """Los equipos, con los nombres de tipo y servicio ya resueltos.

    Sin parámetros baja TODOS. Con parámetros baja solo los que coinciden: son
    los mismos filtros que la pantalla de Activos (buscar, estado, tipo de
    equipo, servicio y grupo técnico), con la misma lógica que GET /activos,
    así que lo que se descarga es lo que se ve con esos filtros puestos —
    completo, no solo la página que está en pantalla.
    """
    tipos = {t.id: t.nombre for t in db.query(TipoEquipo).all()}
    servicios = {s.id: s.nombre for s in db.query(Servicio).all()}

    q = db.query(Activo)
    if buscar:
        texto = buscar.strip()
        como_codigo = re.sub(r"[\s-]+", "-", texto.upper()).strip("-")
        patron = f"%{texto}%"
        q = q.filter(
            or_(
                Activo.codigo.ilike(f"%{como_codigo}%"),
                Activo.descripcion.ilike(patron),
                Activo.marca.ilike(patron),
                Activo.modelo.ilike(patron),
                Activo.numero_serie.ilike(patron),
            )
        )
    if estado:
        q = q.filter(Activo.estado.ilike(estado))
    if tipo_equipo_id:
        q = q.filter(Activo.tipo_equipo_id == tipo_equipo_id)
    if sector_id:
        q = q.filter(Activo.sector_id == sector_id)
    if grupo_id:
        q = q.filter(Activo.grupo_id == grupo_id)
    activos = q.order_by(Activo.codigo).all()

    # Criticidad y nivel de riesgo, calculados con el PRIUX (ver
    # backend/app/criticidad.py) — la columna vieja (cargada a mano) se había
    # sacado hasta que estuviera este cálculo; ya está, así que vuelve.
    # criticidad_de_varios trae todo en pocas consultas en vez de una por
    # equipo. Los que no son equipo médico o les falta algún dato quedan con
    # estas columnas vacías (mismo criterio que la ficha del equipo).
    criticidad_por_codigo = criticidad_de_varios(db, activos)

    encabezados = [
        "Código", "Código QR", "Descripción", "Tipo de equipo", "Servicio",
        "Ubicación", "Marca", "Modelo", "N° de serie", "N° orden de compra",
        "Fecha de instalación", "Estado", "Grupo",
        "Frecuencia MP (meses)", "Último MP", "Próximo MP",
        "Criticidad (2-10)", "Nivel de riesgo", "Puntaje PRIUX",
    ]
    filas = [
        [
            a.codigo, a.codigo_qr, a.descripcion,
            tipos.get(a.tipo_equipo_id, a.tipo_equipo_id),
            servicios.get(a.sector_id, a.sector_id),
            a.ubicacion, a.marca, a.modelo, a.numero_serie, a.numero_orden_compra,
            _fecha(a.fecha_instalacion), a.estado, a.grupo_id,
            a.frecuencia_mp_meses, _fecha(a.ultima_fecha_mp), _fecha(a.proxima_fecha_mp),
            criticidad_por_codigo[a.codigo]["criticidad"],
            _NOMBRE_NIVEL_RIESGO.get(criticidad_por_codigo[a.codigo]["nivel"]),
            criticidad_por_codigo[a.codigo]["puntaje"],
        ]
        for a in activos
    ]
    return respuesta_csv("equipos", encabezados, filas)



# ═══════════════════════════════════════════════════════════════════════════
# ÓRDENES DE TRABAJO — técnicos (y junior), coordinación y (desde 03/10) jefatura
# ═══════════════════════════════════════════════════════════════════════════
# Jefatura ve la pantalla de Órdenes en modo solo lectura (no opera ninguna
# OT) y puede bajar este CSV con el historial completo — mismo criterio que el
# CSV de mantenimientos. A diferencia de técnico/coordinación, jefatura ve
# TODAS las OT, sin recorte por grupo ni por asignación.

from sqlalchemy import or_, and_

from ..models import OrdenTrabajo
from ..security import requiere_rol, grupos_del_coordinador
from .ordenes_trabajo import filtrar_por_fecha_notificacion


def _fecha_hora(valor) -> str:
    """Fecha y hora como dd/mm/aaaa hh:mm (vacío si no hay)."""
    return valor.strftime("%d/%m/%Y %H:%M") if valor else ""


@router.get("/ordenes")
def exportar_ordenes(
    estado: str | None = None,
    tipo: str | None = None,
    sin_asignar: bool | None = None,
    notificada_desde: date | None = None,
    notificada_hasta: date | None = None,
    prioridad: str | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "junior", "coordinacion")),
):
    """Las OT que esta persona ve en su pantalla de Órdenes, respetando los
    mismos filtros que ya tiene esa pantalla (estado, tipo, prioridad, "sin
    asignar" para coordinación, y el rango de fecha de notificación:
    notificada_desde / notificada_hasta, AAAA-MM-DD) si se los pasan por query string; si no se pasa
    ninguno, descarga todo lo que ese rol puede ver:
      - Técnico (y junior): las asignadas a él, más las de su grupo sin
        técnico (mismo criterio que "Mis órdenes").
      - Coordinación: todas las de los grupos que coordina.
      - Jefatura: todas, sin recorte (requiere_rol la deja pasar siempre).
    """
    q = db.query(OrdenTrabajo)
    if current_user.rol == "coordinacion":
        q = q.filter(OrdenTrabajo.grupo_id.in_(grupos_del_coordinador(db, current_user)))
    elif current_user.rol == "jefatura":
        pass  # ve todas, sin recorte
    else:
        q = q.filter(
            or_(
                OrdenTrabajo.tecnico_id == current_user.id,
                and_(
                    OrdenTrabajo.tecnico_id.is_(None),
                    OrdenTrabajo.grupo_id == current_user.grupo,
                ),
            )
        )

    # Filtros opcionales, iguales a los que ya usa /ordenes-trabajo (estado y
    # tipo se guardan en mayúsculas, se normaliza lo que llega).
    if estado is not None:
        q = q.filter(OrdenTrabajo.estado == estado.upper())
    if tipo is not None:
        q = q.filter(OrdenTrabajo.tipo == tipo.upper())
    if prioridad is not None:
        q = q.filter(OrdenTrabajo.prioridad == prioridad.upper())
    if sin_asignar is True:
        q = q.filter(OrdenTrabajo.tecnico_id.is_(None))
    elif sin_asignar is False:
        q = q.filter(OrdenTrabajo.tecnico_id.isnot(None))
    q = filtrar_por_fecha_notificacion(q, notificada_desde, notificada_hasta)

    ordenes = q.order_by(OrdenTrabajo.numero_ot).all()

    # Nombres de las personas, para no mostrar ids.
    nombres = {u.id: f"{u.nombre} {u.apellido}" for u in db.query(Usuario).all()}

    def iniciada_por(o):
        # Es un dato de las preventivas; en las correctivas va una raya.
        if o.tipo != "PREVENTIVA":
            return "—"
        if o.iniciada_por:
            return nombres.get(o.iniciada_por, "")
        return "Todavía no se empezó" if o.estado == "ABIERTA" else "Sin registro"

    def horas_parada(o):
        # En horas con coma decimal (ej. "2,5"), que es como Excel en español
        # entiende los números con decimales.
        if not o.tiempo_parada_segundos:
            return ""
        return f"{o.tiempo_parada_segundos / 3600:.1f}".replace(".", ",")

    encabezados = [
        "N° OT", "Tipo", "Estado", "Prioridad", "Equipo", "Descripción del equipo",
        "Ubicación", "Grupo", "Técnico asignado", "Iniciada por", "Descripción",
        "Notificada", "Abierta", "Cerrada", "Tiempo de parada (h)", "Observaciones",
    ]
    filas = [
        [
            o.numero_ot, o.tipo, o.estado, o.prioridad, o.activo_codigo,
            o.activo_descripcion, o.activo_ubicacion, o.grupo_id,
            nombres.get(o.tecnico_id, "") if o.tecnico_id else "",
            iniciada_por(o), o.descripcion,
            _fecha_hora(o.fecha_notificacion), _fecha_hora(o.fecha_apertura),
            _fecha_hora(o.fecha_cierre), horas_parada(o), o.observaciones,
        ]
        for o in ordenes
    ]
    return respuesta_csv("ordenes", encabezados, filas)
# ═══════════════════════════════════════════════════════════════════════════
# INSUMOS — técnicos (y junior), coordinación y jefatura (los que tienen la pantalla)
# ═══════════════════════════════════════════════════════════════════════════

from ..models import Insumo, Compra
from .stock import calcular_nivel


@router.get("/insumos")
def exportar_insumos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "junior", "coordinacion")),
):
    """Estado actual del stock: cada insumo con sus cantidades, su nivel
    (OK / Reponer / Crítico, la misma regla que usa la pantalla) y si ya
    tiene una compra pedida que todavía no llegó."""
    tipos = {t.id: t.nombre for t in db.query(TipoEquipo).all()}
    con_compra_pedida = {
        c.insumo_id for c in db.query(Compra.insumo_id).filter(Compra.estado == "pedida").all()
    }
    texto_nivel = {"ok": "OK", "reponer": "Reponer", "critico": "Crítico"}

    encabezados = [
        "Código", "Nombre", "Descripción", "Unidad", "Tipo de equipo",
        "Stock actual", "Stock mínimo", "Punto de reorden", "Nivel", "Compra pedida",
    ]
    filas = [
        [
            i.codigo, i.nombre, i.descripcion, i.unidad,
            tipos.get(i.tipo_equipo_id, i.tipo_equipo_id) if i.tipo_equipo_id else "",
            i.stock_actual, i.stock_minimo, i.punto_reorden,
            texto_nivel[calcular_nivel(i.stock_actual, i.stock_minimo, i.punto_reorden)],
            "Sí" if i.id in con_compra_pedida else "No",
        ]
        for i in db.query(Insumo).order_by(Insumo.nombre).all()
    ]
    return respuesta_csv("insumos", encabezados, filas)



# ═══════════════════════════════════════════════════════════════════════════
# MANTENIMIENTOS — preventivos y correctivos, sin el detalle del trabajo
# ═══════════════════════════════════════════════════════════════════════════
# Una fila por mantenimiento, con datos de gestión (equipo, fechas, estado,
# quién, a término o no, tiempo de parada) y SIN descripciones ni
# observaciones: así jefatura también lo puede bajar sin ver el detalle de
# las OT. Cada rol baja lo de sus grupos; jefatura, todo.
# ═══════════════════════════════════════════════════════════════════════════

from ..models import OrdenTrabajo, MantenimientoPreventivo
from ..security import grupos_del_coordinador


@router.get("/mantenimientos")
def exportar_mantenimientos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "junior", "coordinacion")),
):
    # De qué grupos puede bajar esta persona (None = todos, para jefatura).
    if current_user.rol == "coordinacion":
        grupos = set(grupos_del_coordinador(db, current_user))
    elif current_user.rol in ("tecnico", "junior"):
        grupos = {current_user.grupo}
    else:
        grupos = None

    def visible(orden):
        return grupos is None or orden.grupo_id in grupos

    nombres = {u.id: f"{u.nombre} {u.apellido}" for u in db.query(Usuario).all()}
    ordenes = {o.id: o for o in db.query(OrdenTrabajo).all()}

    def horas_parada(o):
        if not o or not o.tiempo_parada_segundos:
            return ""
        return f"{o.tiempo_parada_segundos / 3600:.1f}".replace(".", ",")

    filas = []

    # ── Preventivos: uno por cada MP, con su OT ──
    for mp in db.query(MantenimientoPreventivo).all():
        o = ordenes.get(mp.ot_id)
        if o is None or not visible(o):
            continue
        if mp.fecha_realizada:
            a_termino = (mp.fecha_realizada.year, mp.fecha_realizada.month) == (
                mp.fecha_programada.year, mp.fecha_programada.month)
            en_termino = "Sí" if a_termino else "No"
        else:
            en_termino = ""
        realizado_por = nombres.get(o.iniciada_por) or nombres.get(mp.tecnico_id) or ""
        filas.append([
            "Preventivo", o.numero_ot, o.activo_codigo, o.activo_descripcion, o.grupo_id,
            mp.fecha_programada.strftime("%m/%Y") if mp.fecha_programada else "",
            mp.estado, _fecha(mp.fecha_realizada), realizado_por, en_termino,
            mp.justificacion_retraso, horas_parada(o),
        ])

    # ── Correctivos: uno por cada OT correctiva ──
    for o in ordenes.values():
        if o.tipo != "CORRECTIVA" or not visible(o):
            continue
        filas.append([
            "Correctivo", o.numero_ot, o.activo_codigo, o.activo_descripcion, o.grupo_id,
            "", o.estado, _fecha(o.fecha_cierre), nombres.get(o.tecnico_id, ""),
            "", "", horas_parada(o),
        ])

    filas.sort(key=lambda f: f[1])   # por número de OT
    encabezados = [
        "Tipo", "N° OT", "Equipo", "Descripción del equipo", "Grupo",
        "Mes programado", "Estado", "Fecha de realización", "Realizado por",
        "En término", "Motivo del retraso", "Tiempo de parada (h)",
    ]
    return respuesta_csv("mantenimientos", encabezados, filas)