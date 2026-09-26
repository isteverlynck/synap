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
from datetime import date

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Activo, TipoEquipo, Servicio, Usuario
from ..security import requiere_rol

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
# EQUIPOS — técnicos, coordinación y jefatura (los que tienen la pantalla)
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/activos")
def exportar_activos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "coordinacion")),
):
    """Todos los equipos, con los nombres de tipo y servicio ya resueltos."""
    tipos = {t.id: t.nombre for t in db.query(TipoEquipo).all()}
    servicios = {s.id: s.nombre for s in db.query(Servicio).all()}

    encabezados = [
        "Código", "Código QR", "Descripción", "Tipo de equipo", "Servicio",
        "Ubicación", "Marca", "Modelo", "N° de serie", "N° orden de compra",
        "Fecha de instalación", "Estado", "Criticidad", "Grupo",
        "Frecuencia MP (meses)", "Último MP", "Próximo MP",
    ]
    filas = [
        [
            a.codigo, a.codigo_qr, a.descripcion,
            tipos.get(a.tipo_equipo_id, a.tipo_equipo_id),
            servicios.get(a.sector_id, a.sector_id),
            a.ubicacion, a.marca, a.modelo, a.numero_serie, a.numero_orden_compra,
            _fecha(a.fecha_instalacion), a.estado, a.criticidad, a.grupo_id,
            a.frecuencia_mp_meses, _fecha(a.ultima_fecha_mp), _fecha(a.proxima_fecha_mp),
        ]
        for a in db.query(Activo).order_by(Activo.codigo).all()
    ]
    return respuesta_csv("equipos", encabezados, filas)



# ═══════════════════════════════════════════════════════════════════════════
# ÓRDENES DE TRABAJO — técnicos y coordinación (jefatura NO: no ve el detalle
# de las OT, solo los indicadores del dashboard)
# ═══════════════════════════════════════════════════════════════════════════

from sqlalchemy import or_, and_

from ..models import OrdenTrabajo
from ..security import requiere_rol_estricto, grupos_del_coordinador


def _fecha_hora(valor) -> str:
    """Fecha y hora como dd/mm/aaaa hh:mm (vacío si no hay)."""
    return valor.strftime("%d/%m/%Y %H:%M") if valor else ""


@router.get("/ordenes")
def exportar_ordenes(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol_estricto("tecnico", "coordinacion")),
):
    """Las OT que esta persona ve en su pantalla de Órdenes:
      - Técnico: las asignadas a él, más las de su grupo sin técnico (mismo
        criterio que "Mis órdenes").
      - Coordinación: todas las de los grupos que coordina.
    """
    q = db.query(OrdenTrabajo)
    if current_user.rol == "coordinacion":
        q = q.filter(OrdenTrabajo.grupo_id.in_(grupos_del_coordinador(db, current_user)))
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
# INSUMOS — técnicos, coordinación y jefatura (los que tienen la pantalla)
# ═══════════════════════════════════════════════════════════════════════════

from ..models import Insumo, Compra
from .stock import calcular_nivel


@router.get("/insumos")
def exportar_insumos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "coordinacion")),
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
    current_user: Usuario = Depends(requiere_rol("tecnico", "coordinacion")),
):
    # De qué grupos puede bajar esta persona (None = todos, para jefatura).
    if current_user.rol == "coordinacion":
        grupos = set(grupos_del_coordinador(db, current_user))
    elif current_user.rol == "tecnico":
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