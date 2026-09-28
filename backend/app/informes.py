"""Generación de informes en PDF.

Por ahora hay uno solo: el informe de un mantenimiento preventivo ya
CERRADO (ver ordenes_trabajo.py::informe_pdf), que junta en una sola hoja:
  - los datos del equipo,
  - los datos de la orden (fechas, quién la inició, quién la cerró),
  - el resultado de cada punto del checklist,
  - y qué se hizo (las observaciones del cierre).

Se arma con reportlab (agregado a requirements.txt) porque es puro Python
—no necesita ninguna librería del sistema operativo instalada aparte—, a
diferencia de otras opciones como weasyprint que piden Cairo/Pango.
"""

from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

_ESTILOS = getSampleStyleSheet()
_TITULO = ParagraphStyle(
    "TituloSynap", parent=_ESTILOS["Heading1"], fontSize=16, spaceAfter=2,
)
_SUBTITULO = ParagraphStyle(
    "SubtituloSynap", parent=_ESTILOS["Normal"], fontSize=10,
    textColor=colors.HexColor("#555555"), spaceAfter=14,
)
_SECCION = ParagraphStyle(
    "SeccionSynap", parent=_ESTILOS["Heading2"], fontSize=12,
    spaceBefore=14, spaceAfter=6,
)
_TEXTO = ParagraphStyle("TextoSynap", parent=_ESTILOS["Normal"], fontSize=9.5, leading=13)
# Para las celdas de la tabla del checklist: más chico, y clave que sea un
# Paragraph (no un string suelto) para que el texto largo haga salto de línea
# dentro de la celda en vez de superponerse con la columna de al lado.
_CELDA = ParagraphStyle("CeldaSynap", parent=_ESTILOS["Normal"], fontSize=8.5, leading=11)
_CELDA_CABECERA = ParagraphStyle(
    "CeldaCabeceraSynap", parent=_CELDA, textColor=colors.white, fontName="Helvetica-Bold",
)
# Resultado "No pasa": en rojo y negrita para que salte a la vista sin tener
# que leer la tabla entera. Va en un ParagraphStyle propio (no alcanza con
# el TEXTCOLOR de la tabla) porque el contenido de la celda ahora es un
# Paragraph, no un string suelto.
_CELDA_NO_PASA = ParagraphStyle(
    "CeldaNoPasaSynap", parent=_CELDA, textColor=colors.HexColor("#b3261e"), fontName="Helvetica-Bold",
)


def _dato(etiqueta: str, valor) -> str:
    """Una línea 'Etiqueta: valor', lista para meter en un Paragraph.
    '—' cuando no hay dato, para no dejar la línea vacía.

    La negrita se arma por código (chr(60)/chr(62) en vez de escribir el
    símbolo menor-que directo) para que este archivo no tenga ninguna
    secuencia parecida a una etiqueta HTML — eso es justo lo que venía
    rompiendo DetalleOrden.jsx al copiar/pegar desde el chat."""
    ab, cb = chr(60), chr(62)
    negrita_abre = ab + "b" + cb
    negrita_cierra = ab + "/b" + cb
    return f"{negrita_abre}{etiqueta}:{negrita_cierra} {valor if valor not in (None, '') else '—'}"


def _fecha(valor: datetime | None) -> str:
    if valor is None:
        return "—"
    return valor.strftime("%d/%m/%Y %H:%M") if isinstance(valor, datetime) else valor.strftime("%d/%m/%Y")


def generar_informe_preventiva_pdf(
    *,
    orden,
    activo,
    mp,
    respuestas,
    tipo_equipo_nombre: str | None,
    sector_nombre: str | None,
) -> bytes:
    """Arma el PDF y devuelve los bytes listos para mandar en la respuesta.

    - orden: la OrdenTrabajo (ya CERRADA).
    - activo: el Activo de esa orden (puede ser None si se borró, aunque no
      debería pasar).
    - mp: el MantenimientoPreventivo enganchado a la orden (None si por algún
      motivo no se encuentra, ej. datos viejos migrados a mano).
    - respuestas: lista de tuplas (ChecklistRespuesta, ChecklistItem), ya
      ordenadas por el 'orden' del ítem. Vacía si el MP no tiene checklist
      cargado.
    - tipo_equipo_nombre / sector_nombre: ya resueltos aparte (el modelo
      Activo solo guarda el id de cada catálogo, no el nombre).
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=18 * mm, bottomMargin=16 * mm, leftMargin=18 * mm, rightMargin=18 * mm,
    )
    cuerpo = []

    numero_ot = f"OT-{str(orden.numero_ot).zfill(4)}"
    cuerpo.append(Paragraph("Informe de mantenimiento preventivo", _TITULO))
    cuerpo.append(Paragraph(f"{numero_ot} · SYNAP — Bioingeniería, Hospital Alemán", _SUBTITULO))

    # ─── Datos del equipo ───
    cuerpo.append(Paragraph("Equipo", _SECCION))
    cuerpo.append(Paragraph(_dato("Código", activo.codigo if activo else orden.activo_codigo), _TEXTO))
    cuerpo.append(Paragraph(_dato("Descripción", activo.descripcion if activo else None), _TEXTO))
    cuerpo.append(Paragraph(_dato("Tipo de equipo", tipo_equipo_nombre), _TEXTO))
    cuerpo.append(Paragraph(_dato("Marca", activo.marca if activo else None), _TEXTO))
    cuerpo.append(Paragraph(_dato("Modelo", activo.modelo if activo else None), _TEXTO))
    cuerpo.append(Paragraph(_dato("Número de serie", activo.numero_serie if activo else None), _TEXTO))
    cuerpo.append(Paragraph(_dato("Ubicación", activo.ubicacion if activo else None), _TEXTO))
    cuerpo.append(Paragraph(_dato("Sector / Servicio", sector_nombre), _TEXTO))

    # ─── Datos de la orden ───
    cuerpo.append(Paragraph("Orden de trabajo", _SECCION))
    if mp is not None:
        cuerpo.append(Paragraph(_dato("Programado para", mp.fecha_programada.strftime("%m/%Y")), _TEXTO))
        cuerpo.append(Paragraph(_dato("Realizado", _fecha(mp.fecha_realizada)), _TEXTO))
    cuerpo.append(Paragraph(_dato("Abierta", _fecha(orden.fecha_apertura)), _TEXTO))
    cuerpo.append(Paragraph(_dato("Cerrada", _fecha(orden.fecha_cierre)), _TEXTO))
    cuerpo.append(Paragraph(_dato("Iniciada por", orden.iniciada_por_nombre), _TEXTO))
    cuerpo.append(Paragraph(_dato("Cerrada por", orden.cerrado_por_nombre), _TEXTO))
    if mp is not None and mp.justificacion_retraso:
        cuerpo.append(Paragraph(_dato("Motivo del retraso", mp.justificacion_retraso), _TEXTO))
    if orden.observaciones:
        cuerpo.append(Paragraph(_dato("Qué se hizo", orden.observaciones), _TEXTO))

    # ─── Checklist ───
    cuerpo.append(Paragraph("Checklist", _SECCION))
    if not respuestas:
        cuerpo.append(Paragraph("Este mantenimiento no tiene checklist cargado.", _TEXTO))
    else:
        # Cada celda es un Paragraph (no un string suelto): así el texto largo
        # hace salto de línea dentro de la celda en vez de superponerse con la
        # columna de al lado, que es lo que pasaba con las descripciones más
        # largas del checklist.
        filas = [[
            Paragraph("#", _CELDA_CABECERA),
            Paragraph("Punto revisado", _CELDA_CABECERA),
            Paragraph("Resultado", _CELDA_CABECERA),
            Paragraph("Observación", _CELDA_CABECERA),
        ]]
        for respuesta, item in respuestas:
            estilo_resultado = _CELDA_NO_PASA if respuesta.resultado == "NO_PASA" else _CELDA
            filas.append([
                Paragraph(str(item.orden), _CELDA),
                Paragraph(item.descripcion, _CELDA),
                Paragraph(_texto_resultado(respuesta.resultado), estilo_resultado),
                Paragraph(respuesta.observacion or "—", _CELDA),
            ])
        tabla = Table(filas, colWidths=[12 * mm, 68 * mm, 24 * mm, 66 * mm], repeatRows=1)
        estilo = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2f3b52")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f5f7")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]
        tabla.setStyle(TableStyle(estilo))
        cuerpo.append(tabla)

    cuerpo.append(Spacer(1, 18))
    cuerpo.append(Paragraph(
        f"Generado automáticamente por SYNAP el {datetime.utcnow().strftime('%d/%m/%Y %H:%M')} UTC.",
        ParagraphStyle("Pie", parent=_ESTILOS["Normal"], fontSize=7.5, textColor=colors.HexColor("#888888")),
    ))

    doc.build(cuerpo)
    return buffer.getvalue()


def _texto_resultado(resultado: str | None) -> str:
    if resultado == "PASA":
        return "Pasa"
    if resultado == "NO_PASA":
        return "No pasa"
    return "Sin registrar"