"""Schemas Pydantic — los contratos de entrada/salida de la API.

Diferencia clave con models.py:
  - models.py describe cómo son las tablas EN LA BASE de datos.
  - schemas.py describe qué datos ENTRAN y SALEN por la API (lo que el frontend
    manda y recibe).

Ejemplo importante: la contraseña ENTRA (cuando la persona activa su cuenta o se
loguea) pero NUNCA SALE (UsuarioOut no la incluye). Los schemas son el filtro
que controla qué se expone.
"""

import uuid
from datetime import datetime, date

from pydantic import BaseModel, ConfigDict


# ─── Login / activación ───
class LoginRequest(BaseModel):
    """Lo que manda la persona para entrar (ingresos normales)."""
    numero_identificacion: str
    password: str


class ActivarCuentaRequest(BaseModel):
    """Primer ingreso: la persona crea su contraseña.

    Pedimos la contraseña dos veces (password y password_confirmacion) para
    validar en el backend que coinciden, igual que en cualquier alta de cuenta.
    """
    numero_identificacion: str
    password: str
    password_confirmacion: str


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