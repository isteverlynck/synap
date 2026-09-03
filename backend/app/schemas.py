"""Schemas Pydantic — los contratos de entrada/salida de la API.

Diferencia clave con models.py:
  - models.py describe cómo son las tablas EN LA BASE de datos.
  - schemas.py describe qué datos ENTRAN y SALEN por la API (lo que el frontend
    manda y recibe).

Ejemplo importante: la contraseña ENTRA (cuando la persona activa su cuenta o se
loguea) pero NUNCA SALE (UsuarioOut no la incluye). Los schemas son el filtro
que controla qué se expone.
"""

import re
import uuid
from datetime import datetime, date

from pydantic import BaseModel, ConfigDict, field_validator


# ─── Número de identificación: siempre "u" + DNI (ej: DNI 44.324.107 → u44324107) ───
NUMERO_IDENTIFICACION_REGEX = re.compile(r"^u\d{6,10}$")


def validar_numero_identificacion(v: str) -> str:
    """Normaliza (minúsculas, sin espacios) y valida el formato 'u' + DNI.

    Lanza ValueError si no cumple el formato — lo usan tanto los schemas (donde
    Pydantic lo convierte en un 422 automático) como el endpoint /auth/estado,
    que lo captura a mano para devolver un 400 con el mismo mensaje.
    """
    v = v.strip().lower()
    if not NUMERO_IDENTIFICACION_REGEX.match(v):
        raise ValueError(
            "El número de identificación debe ser 'u' seguido del DNI, sin "
            "puntos ni espacios (ej: DNI 44.324.107 → u44324107)."
        )
    return v


# ─── Login / activación ───
class LoginRequest(BaseModel):
    """Lo que manda la persona para entrar (ingresos normales)."""
    numero_identificacion: str
    password: str

    @field_validator("numero_identificacion")
    @classmethod
    def _validar_numero(cls, v: str) -> str:
        return validar_numero_identificacion(v)


class ActivarCuentaRequest(BaseModel):
    """Primer ingreso: la persona crea su contraseña.

    Pedimos la contraseña dos veces (password y password_confirmacion) para
    validar en el backend que coinciden, igual que en cualquier alta de cuenta.
    """
    numero_identificacion: str
    password: str
    password_confirmacion: str

    @field_validator("numero_identificacion")
    @classmethod
    def _validar_numero(cls, v: str) -> str:
        return validar_numero_identificacion(v)


# ─── Respuestas ───
class EstadoUsuario(BaseModel):
    """Cuando la persona escribe su número, le decimos en qué estado está:
    - existe: ¿está en el padrón del hospital?
    - activado: ¿ya creó su contraseña? (si no, hay que mandarla a activar)
    """
    existe: bool
    activado: bool


class UsuarioOut(BaseModel):
    """Datos del usuario que SÍ devolvemos al frontend. Fijate que NO está
    hashed_password: la contraseña nunca sale de la API."""
    id: uuid.UUID
    nombre: str
    apellido: str
    email: str
    rol: str
    grupo: str | None = None
    numero_identificacion: str | None = None
    created_at: datetime | None = None

    # Permite construir este schema directamente desde un objeto Usuario del ORM.
    model_config = ConfigDict(from_attributes=True)


# ─── Token de sesión ───
class Token(BaseModel):
    """Lo que devuelve el login: el token que la app guarda para pedidos futuros."""
    access_token: str
    token_type: str = "bearer"
    
# ─── Activos ───
class ActivoOut(BaseModel):
    """Datos de un activo que devolvemos al frontend."""
    codigo: str
    codigo_qr: str | None = None
    tipo_equipo_id: str
    sector_id: str
    descripcion: str
    ubicacion: str | None = None
    marca: str | None = None
    modelo: str | None = None
    numero_serie: str | None = None
    estado: str

    model_config = ConfigDict(from_attributes=True)
    
# ─── Schemas resumidos para anidar en la ficha del activo ───
class OrdenTrabajoResumen(BaseModel):
    id: uuid.UUID
    numero_ot: int
    tipo: str
    estado: str
    prioridad: str | None = None
    model_config = ConfigDict(from_attributes=True)


class FallaResumen(BaseModel):
    id: uuid.UUID
    tipo_falla: str | None = None
    severidad: str | None = None
    estado: str
    model_config = ConfigDict(from_attributes=True)


class MantenimientoResumen(BaseModel):
    id: uuid.UUID
    fecha_programada: date
    fecha_realizada: date | None = None
    estado: str
    model_config = ConfigDict(from_attributes=True)


class ActivoDetalle(ActivoOut):
    """La ficha completa del activo: sus datos + su historial relacionado."""
    ordenes_de_trabajo: list[OrdenTrabajoResumen] = []
    fallas: list[FallaResumen] = []
    mantenimientos: list[MantenimientoResumen] = []
    
# ─── Órdenes de trabajo ───
class OrdenTrabajoOut(BaseModel):
    """Datos completos de una OT que devolvemos al frontend.
    Es la versión 'grande' (a diferencia de OrdenTrabajoResumen, que ya tenías
    para anidar dentro de la ficha del activo). Esta se usa en el listado y en
    el detalle de una orden puntual.
    """
    id: uuid.UUID
    numero_ot: int
    activo_codigo: str
    tipo: str
    estado: str
    prioridad: str | None = None
    descripcion: str | None = None
    tecnico_id: uuid.UUID | None = None
    grupo_id: str | None = None
    sector_solicitante_id: str | None = None
    fecha_apertura: datetime | None = None
    fecha_cierre: datetime | None = None
    observaciones: str | None = None
    created_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)

class OrdenTrabajoCreate(BaseModel):
    """Lo que el frontend manda para ABRIR una OT nueva (POST).
    Ojo: acá NO pedimos id, numero_ot, fecha_apertura ni created_at. Esos los
    genera el backend (ver TODO en el router). El frontend solo manda lo que la
    persona realmente elige/escribe al abrir la orden.
    """
    activo_codigo: str
    tipo: str                              # correctiva / preventiva
    prioridad: str | None = None
    descripcion: str | None = None
    tecnico_id: uuid.UUID | None = None
    grupo_id: str | None = None
    sector_solicitante_id: str | None = None
    observaciones: str | None = None
    fecha_notificacion: datetime | None = None   # cuándo avisó el servicio (opcional)

# ─── Fallas ───
class FallaOut(BaseModel):
    """Datos completos de una falla que devolvemos al frontend.

    Versión 'grande' (a diferencia de FallaResumen, que ya tenías para anidar
    en la ficha del activo). Se usa en el listado y en el detalle de una falla.
    """
    id: uuid.UUID
    activo_codigo: str
    ot_id: uuid.UUID | None = None
    reportado_por: uuid.UUID | None = None
    tipo_falla: str | None = None
    severidad: str | None = None
    descripcion: str
    estado: str
    fecha_reporte: datetime | None = None

    model_config = ConfigDict(from_attributes=True)

class FallaCreate(BaseModel):
    """Lo que el frontend manda para REPORTAR una falla nueva (POST).

    No pedimos id ni fecha_reporte: los pone el backend. ot_id queda opcional
    porque una falla puede reportarse sola (antes de que exista la OT); después
    se vincula a la orden correctiva que la resuelve.
    """
    activo_codigo: str
    descripcion: str
    tipo_falla: str | None = None
    severidad: str | None = None
    reportado_por: uuid.UUID | None = None

# ─── Mantenimientos preventivos ───
class MantenimientoPreventivoOut(BaseModel):
    """Datos completos de un mantenimiento preventivo (MP) para el frontend.

    Versión 'grande' (a diferencia de MantenimientoResumen, que ya tenías para
    anidar en la ficha del activo). Sostiene el entregable de CONSULTA de MPs
    programados del anteproyecto.
    """
    id: uuid.UUID
    activo_codigo: str
    plantilla_mp_id: uuid.UUID
    ot_id: uuid.UUID | None = None
    fecha_programada: date
    fecha_realizada: date | None = None
    tecnico_id: uuid.UUID | None = None
    estado: str
    generado_automaticamente: bool | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class MantenimientoPreventivoCreate(BaseModel):
    """Lo que el frontend manda para PROGRAMAR un MP nuevo (POST).

    El objetivo de mínima del anteproyecto pide CONSULTA de MPs (los GET). La
    creación es un extra que dejamos listo pero desactivado.
    """
    activo_codigo: str
    plantilla_mp_id: uuid.UUID
    fecha_programada: date
    tecnico_id: uuid.UUID | None = None
    
# ─── Insumos / stock ───
class InsumoOut(BaseModel):
    """Datos de un insumo/repuesto del stock para el frontend."""
    id: uuid.UUID
    nombre: str
    descripcion: str | None = None
    unidad: str | None = None
    stock_actual: int | None = None
    stock_minimo: int | None = None
    punto_reorden: int | None = None
    tipo_equipo_id: str | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class InsumoConAlerta(InsumoOut):
    """Insumo + estado de stock calculado por el backend.

    - nivel: 'ok' | 'reponer' | 'critico' (los 3 niveles del anteproyecto).
    - tiene_compra_pedida: True si ya hay una compra encargada sin recibir, para
    que nadie vuelva a pedir lo mismo.
    """
    nivel: str
    tiene_compra_pedida: bool


class CompraOut(BaseModel):
    """Una compra registrada. Puede estar 'pedida' (encargada, sin llegar) o
    'recibida' (llegó y ya sumó al stock)."""
    id: uuid.UUID
    insumo_id: uuid.UUID
    cantidad: int
    fecha: date
    estado: str | None = None
    fecha_recepcion: date | None = None
    proveedor: str | None = None
    numero_orden: str | None = None
    observaciones: str | None = None
    registrado_por: uuid.UUID | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class CompraCreate(BaseModel):
    """Registrar un PEDIDO de compra (POST). Nace 'pedida' y NO toca stock:
    el stock recién sube cuando la compra se recibe."""
    insumo_id: uuid.UUID
    cantidad: int
    fecha: date
    proveedor: str | None = None
    numero_orden: str | None = None
    observaciones: str | None = None
    registrado_por: uuid.UUID | None = None


class ConsumoOut(BaseModel):
    """Un consumo registrado (salida de stock), vinculado a una OT."""
    id: uuid.UUID
    ot_id: uuid.UUID
    insumo_id: uuid.UUID
    cantidad: int
    fecha: datetime | None = None
    tecnico_id: uuid.UUID | None = None

    model_config = ConfigDict(from_attributes=True)


class ConsumoCreate(BaseModel):
    """Registrar un consumo de repuesto en una OT (descuento automático).
    NUNCA se rechaza: siempre descuenta y el backend avisa el nivel resultante."""
    ot_id: uuid.UUID
    insumo_id: uuid.UUID
    cantidad: int
    tecnico_id: uuid.UUID | None = None


class ConsumoResultado(BaseModel):
    """Respuesta al registrar un consumo: el consumo + cómo quedó el stock.

    'aviso' trae el mensaje legible para mostrarle al usuario (ej: 'Stock crítico
    de jeringas: quedan 5, el mínimo es 10'). Así el consumo se registra siempre
    y la persona ve la advertencia sin que el sistema la frene."""
    consumo: ConsumoOut
    stock_resultante: int
    nivel: str
    aviso: str | None = None
    

class ChecklistItemOut(BaseModel):
    """Un punto a revisar dentro de una plantilla de MP (ej: 'verificar batería').

    Es la PLANTILLA: qué hay que revisar. Se muestra cuando el técnico va a hacer
    un mantenimiento, como guía de los pasos.
    """
    id: uuid.UUID
    plantilla_mp_id: uuid.UUID
    orden: int
    descripcion: str
    obligatorio: bool | None = None

    model_config = ConfigDict(from_attributes=True)

class ChecklistRespuestaOut(BaseModel):
    """La respuesta a un ítem en un mantenimiento concreto (qué se cumplió)."""
    id: uuid.UUID
    mp_id: uuid.UUID
    checklist_item_id: uuid.UUID
    completado: bool | None = None
    observacion: str | None = None
    completado_por: uuid.UUID | None = None
    resultado: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ChecklistRespuestaCreate(BaseModel):
    """Lo que el frontend manda para registrar la respuesta a UN ítem.

    Cuando el técnico marca un punto del checklist como hecho (o no), manda esto.
    """
    mp_id: uuid.UUID
    checklist_item_id: uuid.UUID
    completado: bool = False
    observacion: str | None = None
    completado_por: uuid.UUID | None = None
    resultado: str | None = None
    

class ChecklistItemCreate(BaseModel):
    """Un ítem del checklist al crear un plan (ej: 'verificación funcional').

    No lleva id ni plantilla_mp_id: el id lo genera la base, y el plantilla_mp_id
    lo completa el backend al crear el plan (ver router).
    """
    orden: int
    descripcion: str
    obligatorio: bool = True


class PlanMantenimientoCreate(BaseModel):
    """Crear un plan de mantenimiento completo: la plantilla + todos sus ítems.

    Si es_generica=True, es el plan base para equipos sin plan propio (el que
    describió Cami: estado externo, verificación funcional, seguridad eléctrica).
    Si es_generica=False, tipo_equipo_id dice para qué tipo de equipo es.
    """
    nombre: str
    frecuencia_dias: int
    descripcion: str | None = None
    es_generica: bool = False
    tipo_equipo_id: str | None = None      # obligatorio solo si NO es genérica
    items: list[ChecklistItemCreate]        # los pasos del checklist


class PlanMantenimientoOut(BaseModel):
    """Un plan de mantenimiento con sus datos (sin los ítems, para listar)."""
    id: uuid.UUID
    nombre: str
    frecuencia_dias: int
    descripcion: str | None = None
    es_generica: bool | None = None
    tipo_equipo_id: str | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class PlanMantenimientoDetalle(PlanMantenimientoOut):
    """Un plan con TODOS sus ítems de checklist adentro (para ver el detalle)."""
    items: list["ChecklistItemOut"] = []
    

PlanMantenimientoDetalle.model_rebuild()

# ─── Seguimiento y cierre de OT ───
class OrdenTrabajoAsignar(BaseModel):
    """Asignar (o reasignar) el técnico de una OT que nació sin técnico
    ('sin asignar'). El técnico debe pertenecer al grupo de la OT."""
    tecnico_id: uuid.UUID


class OrdenTrabajoCambioEstado(BaseModel):
    """Para cambiar el estado de una OT (seguimiento).

    estado: ABIERTA / EN_PROGRESO / CERRADA
    Si el nuevo estado es CERRADA, conviene usar el endpoint /cerrar en su lugar,
    que además pone la fecha de cierre.
    """
    estado: str


class OrdenTrabajoCierre(BaseModel):
    """Para cerrar una OT. observaciones es opcional (ej: qué se hizo)."""
    observaciones: str | None = None
    
class GenerarCorrectivaDesdeChecklist(BaseModel):
    """Registrar un ítem NO_PASA y generar la OT correctiva asociada, de una.
 
    Se usa SOLO cuando la persona elige 'generar correctiva'. Si elige NO
    generarla, el frontend usa el registro simple de respuesta (no este).
 
    - mp_id: el mantenimiento donde se detectó la falla (de ahí sacamos el equipo).
    - checklist_item_id: el ítem que falló.
    - descripcion: qué falló (va como descripción de la OT y como observación).
    - prioridad: opcional, para que una falla grave nazca priorizada.
    - tecnico_id: opcional, quién detectó / a quién se asigna.
    """
    mp_id: uuid.UUID
    checklist_item_id: uuid.UUID
    descripcion: str
    prioridad: str | None = None
    tecnico_id: uuid.UUID | None = None
    

# ─── Dashboard / KPIs ───
class FallasPorEquipo(BaseModel):
    activo_codigo: str
    cantidad: int


class FallasPorTipo(BaseModel):
    tipo_falla: str
    cantidad: int


class MTBFItem(BaseModel):
    """Tiempo medio entre fallas de un equipo o tipo (en días).

    clave = el equipo (código) o el tipo de equipo, según el listado.
    Solo aparece si hay al menos 2 fallas (si no, no hay intervalo que medir).
    """
    clave: str
    cantidad_fallas: int
    mtbf_dias: float


class DashboardKPIs(BaseModel):
    """Todos los indicadores del panel de jefatura, en una sola respuesta.

    Se calcula en el momento en que se pide (tiempo real). Los KPIs que dependen
    de datos que pueden faltar devuelven None / lista vacía, para que el frontend
    muestre 'sin datos' en vez de romperse.
    """
    # KPI 1 — cumplimiento de MP
    mp_totales: int
    mp_realizados: int
    cumplimiento_mp_pct: float | None = None

    # KPI 2 — tiempo de inactividad (cierre - notificacion) de correctivas
    inactividad_promedio_dias: float | None = None
    correctivas_evaluadas: int = 0

    # KPI 3 — fallas
    fallas_totales: int
    fallas_por_equipo: list[FallasPorEquipo] = []
    fallas_por_tipo: list[FallasPorTipo] = []

    # KPI 4 — MTTR: tiempo medio de reparación (apertura - cierre)
    mttr_dias: float | None = None
    ot_cerradas: int = 0

    # KPI 5 — MTBF: tiempo medio entre fallas (confiabilidad)
    mtbf_por_equipo: list[MTBFItem] = []
    mtbf_por_tipo: list[MTBFItem] = []

    # extras de contexto para el panel
    ot_totales: int = 0
    ot_abiertas: int = 0
    activos_totales: int = 0
    activos_en_baja: int = 0
    
# ─── Solicitudes de servicio ───
class SolicitudCrear(BaseModel):
    """Lo que manda un usuario (enfermería/médico) para crear una solicitud.

    Flujo del frontend: primero elige si es un equipo médico o no
    (es_equipo_medico). Según eso:
      - es_equipo_medico=True  → activo_codigo obligatorio (descripcion_cosa se
        ignora si viene).
      - es_equipo_medico=False → descripcion_cosa obligatoria (ej: "pinza de
        oftalmología"; no es un equipo médico, así sabe el coordinador a qué
        grupo asignarla). activo_codigo se ignora si viene.
    descripcion_problema y ubicacion son obligatorias siempre. Esa validación
    la hace el endpoint (acá solo se declara la forma de los datos).

    NO se manda solicitante_id: lo pone el backend con el usuario logueado.
    persona_afectada_id es opcional (si no viene, se asume que es el solicitante).
    titulo es opcional: si no se manda, el backend genera uno automáticamente.
    """
    es_equipo_medico: bool
    descripcion_problema: str
    ubicacion: str
    activo_codigo: str | None = None
    descripcion_cosa: str | None = None
    titulo: str | None = None
    persona_afectada_id: uuid.UUID | None = None


class SolicitudOut(BaseModel):
    """Datos de una solicitud que devolvemos al frontend."""
    id: uuid.UUID
    numero_solicitud: int
    solicitante_id: uuid.UUID | None = None
    persona_afectada_id: uuid.UUID | None = None
    activo_codigo: str | None = None
    descripcion_cosa: str | None = None
    titulo: str
    descripcion_problema: str
    ubicacion: str
    estado: str
    ot_id: uuid.UUID | None = None
    motivo_rechazo: str | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


# ─── Acciones del coordinador sobre solicitudes ───
class SolicitudAceptar(BaseModel):
    """Datos para aceptar una solicitud y convertirla en OT.

    - asignar_a_id: opcional. La persona (técnico) a la que se asigna la OT de
      una. Si no se manda, la OT nace ABIERTA sin técnico ("sin asignar"); se
      asigna después con PATCH /ordenes-trabajo/{id}/asignar. Si se manda, debe
      ser de un grupo que coordine el coordinador.
    - grupo_id: solo necesario para solicitudes de 'cosa' (sin equipo), donde el
      grupo no se puede deducir del activo. Para solicitudes de equipo se ignora
      (el grupo sale del equipo).
    - prioridad: opcional, para la OT que se genera.
    """
    asignar_a_id: uuid.UUID | None = None
    grupo_id: str | None = None
    prioridad: str | None = None


class SolicitudRechazar(BaseModel):
    """Datos para rechazar una solicitud."""
    motivo_rechazo: str


class SolicitudModificar(BaseModel):
    """Campos que el coordinador puede corregir antes de aceptar (si estaba mal
    hecha). Todos opcionales: solo se cambia lo que se manda.

    es_equipo_medico es especial: si se manda, cambia el "tipo" de la
    solicitud (equipo médico ↔ otra cosa) y limpia el campo que ya no
    corresponde. Se puede mandar junto con activo_codigo/descripcion_cosa
    (el valor nuevo) o dejar que tome el que ya tenía la solicitud."""
    titulo: str | None = None
    descripcion_problema: str | None = None
    ubicacion: str | None = None
    activo_codigo: str | None = None
    descripcion_cosa: str | None = None
    es_equipo_medico: bool | None = None
    
# ─── Generación de preventivas del mes ───
class GenerarPreventivasRequest(BaseModel):
    """Para disparar la generación de OT preventivas de un mes.
 
    Si no se manda nada, usa el mes actual. Se puede especificar anio/mes para
    generar las de un mes puntual (útil para la demo).
    """
    anio: int | None = None
    mes: int | None = None
 
 
class PreventivasGeneradas(BaseModel):
    """Resultado de generar preventivas: cuántas se crearon y para qué equipos."""
    mes: str
    cantidad_generada: int
    ya_existian: int
    equipos: list[str]
    
class RecuperarPasswordRequest(BaseModel):
    """Pedido de recuperación: solo el número de identificación."""
    numero_identificacion: str


class RestablecerPasswordRequest(BaseModel):
    """Cambio efectivo: el token que llegó por mail + la contraseña nueva."""
    token: str
    password: str
    password_confirmacion: str


class MensajeGenerico(BaseModel):
    """Respuesta neutra, sin datos del usuario."""
    mensaje: str