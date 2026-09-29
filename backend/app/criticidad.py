"""Criticidad y riesgo de un equipo según el PRIUX (las tablas de riesgo que
usa hoy el Hospital Alemán).

Fórmula del PRIUX:

    R = α0 · Criticidad  +  α1 · Tipo de mantenimiento  +  α2 · Antigüedad

    Criticidad = Función del equipo + Riesgo en la aplicación clínica  (2 a 10)

    α0 = U + VU + 1
    α1 = VU + FSR + FSMO + P + 1
    α2 = VU + FF + FSR + FSMO + P + 1

Correcciones acordadas al documento original:
  - Las preguntas de soporte, proveedor y fabricación están dadas vuelta:
    suman cuando NO hay (en el original sumaban cuando sí había, lo que
    hacía más riesgoso a un equipo con soporte que a uno abandonado).
  - Antigüedad nivel 1 = menos de 1 año (el original decía "> 1 año").

De dónde sale cada dato:
  - Función, riesgo clínico, tipo de mantenimiento, vida útil → CriticidadTipo
  - Soporte, proveedor local, fabricación                     → CriticidadModelo
  - U (sin backup)                                            → Activo.sin_backup
  - Antigüedad y VU                  → se calculan con Activo.fecha_instalacion
  - Antecedentes de averías          → se calculan con las OT correctivas

El archivo tiene dos partes:
  1. calcular_criticidad(): la cuenta pura, sin tocar la base. Recibe los
     datos ya buscados y devuelve el resultado. Así se puede probar sola.
  2. Las funciones que buscan los datos en la base y llaman a la anterior:
     criticidad_de_varios() para listas, criticidad_de_activo() para un solo
     equipo, y agregar_criticidad_a_ordenes() para las OT.
"""

from datetime import date, datetime, time

from sqlalchemy.orm import Session

from .fechas import sumar_meses
from .models import Activo, CriticidadModelo, CriticidadTipo, OrdenTrabajo


# ─── Parámetros provisorios (hasta que confirme Cami) ───

# Cortes de nivel de riesgo: los del Anexo II del Alemán (50 y 25 sobre 100),
# llevados en proporción al máximo posible del PRIUX, que es 75.
CORTE_ALTO = 37.5
CORTE_MEDIO = 18.75

# El puntaje más alto posible: 3 × 10 + 4 × 5 + 5 × 5 (todos los pesos y
# todos los niveles al máximo). Se usa para dibujar la barra completa.
PUNTAJE_MAXIMO = 75

# Ventana para contar averías. Es la franja más larga de la tabla de
# antecedentes del PRIUX ("menos de 1 cada 30 meses").
VENTANA_ANTECEDENTES_MESES = 30


# ─── Tablas del PRIUX que dependen de un número ───

def nivel_antiguedad(anios: float) -> int:
    """Tabla 'Antigüedad del equipo' (1 a 5)."""
    if anios < 1:
        return 1   # G: menos de 1 año
    if anios < 5:
        return 2   # M: entre 1 y 5 años
    if anios < 10:
        return 3   # A: entre 5 y 10 años
    if anios <= 15:
        return 4   # A/O: entre 10 y 15 años
    return 5       # O: más de 15 años


def nivel_antecedentes(correctivas_en_ventana: int) -> int:
    """Tabla 'Antecedentes (averías técnicas)' (1 a 5).

    La tabla habla de "una avería cada X meses". Con N correctivas en los
    últimos 30 meses, el intervalo promedio es 30 / N meses:
      N ≥ 6  → menos de 6 meses entre averías   → 5
      N = 4-5 → entre 6 y 9 meses                → 4
      N = 2-3 → entre 9 y 18 meses               → 3
      N = 1  → entre 18 y 30 meses               → 2
      N = 0  → menos de 1 cada 30 meses          → 1
    """
    n = correctivas_en_ventana
    if n >= 6:
        return 5
    if n >= 4:
        return 4
    if n >= 2:
        return 3
    if n == 1:
        return 2
    return 1


def nivel_riesgo(puntaje: float) -> str:
    """Pasa el puntaje R a ALTO / MEDIO / BAJO con los cortes provisorios."""
    if puntaje >= CORTE_ALTO:
        return "ALTO"
    if puntaje >= CORTE_MEDIO:
        return "MEDIO"
    return "BAJO"


# ─── 1. La cuenta pura ───

def calcular_criticidad(
    activo: Activo,
    tipo: CriticidadTipo | None,
    modelo: CriticidadModelo | None,
    correctivas_en_ventana: int,
    hoy: date,
) -> dict:
    """Calcula todo el PRIUX para un equipo con los datos ya buscados.

    Devuelve siempre las mismas claves; lo que no se puede calcular va en
    None, y 'motivo' explica por qué (para mostrarlo en pantalla).
    """
    resultado = {
        "evaluado": False,        # ¿se le aplica el PRIUX a este equipo?
        "motivo": None,           # por qué falta algo, en texto para mostrar
        "funcion": None,
        "riesgo_clinico": None,
        "criticidad": None,       # función + riesgo clínico (2 a 10)
        "tipo_mantenimiento": None,
        "antiguedad_anios": None,
        "antiguedad": None,       # nivel 1 a 5
        "fuera_de_vida_util": None,
        "alfa0": None,
        "alfa1": None,
        "alfa2": None,
        "puntaje": None,          # R
        "nivel": None,            # ALTO / MEDIO / BAJO
        "correctivas_ultimos_30_meses": correctivas_en_ventana,
        "antecedentes": nivel_antecedentes(correctivas_en_ventana),
        # Para la ventanita que explica el cálculo en la ficha:
        "vida_util_anios": None,
        "motivos_peso": [],       # qué hizo subir los pesos (texto para mostrar)
        "cortes": {               # dónde empieza cada nivel, para dibujar la barra
            "medio": CORTE_MEDIO,
            "alto": CORTE_ALTO,
            "maximo": PUNTAJE_MAXIMO,
        },
    }

    # Solo se evalúan los equipos que el Alemán marca como médicos.
    if not activo.es_equipo_medico:
        resultado["motivo"] = "No es equipo médico"
        return resultado
    resultado["evaluado"] = True

    # Sin valores cargados para su tipo, no hay ni criticidad ni puntaje.
    if tipo is None:
        resultado["motivo"] = "Sin valores PRIUX cargados para este tipo de equipo"
        return resultado

    # Criticidad: no depende de la fecha, así que se muestra siempre.
    resultado["funcion"] = tipo.funcion
    resultado["riesgo_clinico"] = tipo.riesgo_clinico
    resultado["criticidad"] = tipo.funcion + tipo.riesgo_clinico
    resultado["tipo_mantenimiento"] = tipo.tipo_mantenimiento

    # Sin fecha de instalación no hay antigüedad ni vida útil → sin puntaje.
    if activo.fecha_instalacion is None:
        resultado["motivo"] = "Sin fecha de instalación: no se puede calcular el puntaje"
        return resultado

    anios = (hoy - activo.fecha_instalacion).days / 365.25
    resultado["antiguedad_anios"] = round(anios, 1)
    resultado["antiguedad"] = nivel_antiguedad(anios)

    # Las preguntas del PRIUX, pasadas a números.
    U = 1 if activo.sin_backup else 0
    VU = 1 if anios > tipo.vida_util_anios else 0
    resultado["fuera_de_vida_util"] = bool(VU)

    # Si el modelo no está cargado, se toma como que tiene todo el soporte.
    FSR = 0.5 if (modelo and modelo.sin_soporte_repuestos) else 0
    FSMO = 0.5 if (modelo and modelo.sin_soporte_mano_obra) else 0
    P = 1 if (modelo and modelo.sin_proveedor_local) else 0
    FF = 1 if (modelo and modelo.fuera_de_fabricacion) else 0

    # Qué hizo subir los pesos, en palabras, para explicarlo en pantalla.
    motivos = []
    if U:
        motivos.append("No tiene reemplazo (es único o se usa mucho)")
    if VU:
        motivos.append(f"Superó su vida útil de {tipo.vida_util_anios} años")
    if FSR:
        motivos.append("No tiene soporte de repuestos")
    if FSMO:
        motivos.append("No tiene soporte de mano de obra")
    if P:
        motivos.append("No tiene proveedor local")
    if FF:
        motivos.append("Se dejó de fabricar")
    resultado["motivos_peso"] = motivos
    resultado["vida_util_anios"] = tipo.vida_util_anios

    alfa0 = U + VU + 1
    alfa1 = VU + FSR + FSMO + P + 1
    alfa2 = VU + FF + FSR + FSMO + P + 1

    puntaje = (
        alfa0 * resultado["criticidad"]
        + alfa1 * tipo.tipo_mantenimiento
        + alfa2 * resultado["antiguedad"]
    )

    resultado["alfa0"] = alfa0
    resultado["alfa1"] = alfa1
    resultado["alfa2"] = alfa2
    resultado["puntaje"] = round(puntaje, 2)
    resultado["nivel"] = nivel_riesgo(puntaje)
    return resultado


# ─── 2. Buscar los datos en la base y calcular ───

def _normalizar(texto: str | None) -> str:
    """Mayúsculas y sin espacios al principio ni al final, para comparar
    marca y modelo sin que una minúscula o un espacio suelto hagan que no se
    encuentre el modelo. Es la misma limpieza que hace la consulta de abajo
    del lado de la base (upper + trim), así las dos puntas comparan igual."""
    return (texto or "").strip().upper()


def criticidad_de_varios(db: Session, activos: list[Activo], hoy: date | None = None) -> dict:
    """Calcula el PRIUX para muchos equipos de una sola vez.

    Devuelve un diccionario {código del activo: resultado}. Sirve para listas
    (por ejemplo, la lista de OT): en vez de ir a la base 3 veces POR equipo,
    trae todo lo que necesita en 3 consultas en total y después hace las
    cuentas en Python. Con 50 OT en la lista, son 3 consultas en vez de 150.
    """
    hoy = hoy or date.today()
    activos = [a for a in activos if a is not None]
    if not activos:
        return {}
    codigos = {a.codigo for a in activos}

    # 1. Valores del PRIUX de los tipos que aparecen, indexados por sigla.
    tipos = {
        t.tipo_equipo_id: t
        for t in db.query(CriticidadTipo).filter(
            CriticidadTipo.tipo_equipo_id.in_({a.tipo_equipo_id for a in activos})
        ).all()
    }

    # 2. Soporte por modelo, indexado por (marca, modelo) ya normalizados.
    #    Es una tabla chica, así que se trae entera.
    modelos = {
        (_normalizar(m.marca), _normalizar(m.modelo)): m
        for m in db.query(CriticidadModelo).all()
    }

    # 3. Correctivas de los últimos 30 meses, contadas por equipo. Se usa la
    #    fecha de apertura y, si una OT vieja no la tiene, la de creación.
    desde = datetime.combine(sumar_meses(hoy, -VENTANA_ANTECEDENTES_MESES), time.min)
    en_ventana = {codigo: 0 for codigo in codigos}
    correctivas = db.query(
        OrdenTrabajo.activo_codigo, OrdenTrabajo.fecha_apertura, OrdenTrabajo.created_at
    ).filter(
        OrdenTrabajo.activo_codigo.in_(codigos),
        OrdenTrabajo.tipo == "CORRECTIVA",
    ).all()
    for codigo, apertura, creada in correctivas:
        fecha = apertura or creada
        if fecha and fecha >= desde:
            en_ventana[codigo] += 1

    # Con todo en memoria, la cuenta de cada equipo es la de siempre.
    return {
        a.codigo: calcular_criticidad(
            a,
            tipos.get(a.tipo_equipo_id),
            modelos.get((_normalizar(a.marca), _normalizar(a.modelo))),
            en_ventana[a.codigo],
            hoy,
        )
        for a in activos
    }


def criticidad_de_activo(db: Session, activo: Activo, hoy: date | None = None) -> dict:
    """El PRIUX de un solo equipo (lo usa la ficha del activo). Es el mismo
    cálculo que para muchos, con una lista de uno."""
    return criticidad_de_varios(db, [activo], hoy)[activo.codigo]


def agregar_criticidad_a_ordenes(db: Session, ordenes: list[OrdenTrabajo]) -> list[OrdenTrabajo]:
    """Le pega a cada OT la criticidad y el nivel de riesgo de SU equipo, para
    que viajen al frontend junto con la orden (ver OrdenTrabajoOut).

    No se guarda nada en la base: son atributos que se agregan al objeto solo
    para esta respuesta, igual que activo_descripcion o activo_ubicacion.
    """
    resultados = criticidad_de_varios(db, [o.activo for o in ordenes])
    for o in ordenes:
        r = resultados.get(o.activo_codigo)
        o.activo_criticidad = r["criticidad"] if r else None
        o.activo_nivel_riesgo = r["nivel"] if r else None
        o.activo_puntaje = r["puntaje"] if r else None
    return ordenes