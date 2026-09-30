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
# EQUIPOS — técnicos, coordinación y jefatura (los que tienen la pantalla)
# ═══════════════════════════════════════════════════════════════════════════

_NOMBRE_NIVEL_RIESGO = {"ALTO": "Alto", "MEDIO": "Medio", "BAJO": "Bajo"}


@router.get("/activos")
def exportar_activos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "coordinacion")),
):
    """Todos los equipos, con los nombres de tipo y servicio ya resueltos."""
    tipos = {t.id: t.nombre for t in db.query(TipoEquipo).all()}
    servicios = {s.id: s.nombre for s in db.query(Servicio).all()}
    activos = db.query(Activo).order_by(Activo.codigo).all()

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