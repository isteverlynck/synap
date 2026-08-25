"""Modelos ORM de SQLAlchemy — la traducción de las tablas de Supabase a Python.

Por ahora solo está 'usuarios' (la tabla del login). Las demás tablas del
sistema (activos, órdenes de trabajo, stock, etc.) se irán agregando acá a
medida que las necesitemos.

IMPORTANTE: estos modelos tienen que coincidir con las columnas reales que ya
existen en Supabase. Si en algún momento cambiás una tabla en Supabase, hay que
reflejar el cambio acá también.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    # id: identificador único de cada usuario. En Supabase es de tipo uuid.
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Datos que el hospital ya tiene cargados de cada empleado.
    nombre: Mapped[str] = mapped_column(String, nullable=False)
    apellido: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False)

    # rol define los accesos dentro del sistema (enfermería / técnico / jefatura).
    rol: Mapped[str] = mapped_column(String, nullable=False)

    # grupo: opcional, para agrupar técnicos (se relaciona con grupos_tecnicos).
    grupo: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=datetime.utcnow)

    # ─── Columnas que agregamos para el login ───
    # numero_identificacion: el número del hospital con el que la persona entra.
    numero_identificacion: Mapped[str | None] = mapped_column(
        String, unique=True, nullable=True
    )

    # hashed_password: la contraseña guardada de forma segura (hasheada, nunca
    # en texto plano). Queda vacía hasta que la persona activa su cuenta en el
    # primer ingreso creando su contraseña.
    hashed_password: Mapped[str | None] = mapped_column(String, nullable=True)
    
    
class Servicio(Base):
    """Catálogo de servicios/sectores del hospital (ej: Anestesia, Terapia).

    Es una tabla chica de referencia. Los activos apuntan acá con sector_id.
    """
    __tablename__ = "servicios"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    nombre: Mapped[str] = mapped_column(String, nullable=False)
    centro_costos: Mapped[str] = mapped_column(String, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=datetime.utcnow)


class TipoEquipo(Base):
    """Catálogo de tipos de equipo (ej: desfibrilador, bomba de infusión).

    Los activos apuntan acá con tipo_equipo_id.
    """
    __tablename__ = "tipos_equipo"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    nombre: Mapped[str] = mapped_column(String, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)


class Activo(Base):
    """Un equipo médico. Es la tabla central del sistema.

    IMPORTANTE: la clave primaria es 'codigo' (un texto tipo 'B-ANES-AGME-001'),
    NO un id numérico. Todas las demás tablas se conectan al activo por su código
    (columna activo_codigo en ellas → codigo acá).
    """
    __tablename__ = "activos"

    codigo: Mapped[str] = mapped_column(String, primary_key=True)

    # codigo_qr: lo que está pegado físicamente en el equipo. Se usa para el
    # escaneo (buscar el activo por su QR). No es la clave de relación.
    codigo_qr: Mapped[str | None] = mapped_column(String, nullable=True, index=True)

    # Referencias a catálogos (por ahora las guardamos como texto; las relaciones
    # navegables se agregan en el próximo paso).
    tipo_equipo_id: Mapped[str] = mapped_column(String, ForeignKey("tipos_equipo.id"), nullable=False)
    sector_id: Mapped[str] = mapped_column(String, ForeignKey("servicios.id"), nullable=False)
    grupo_id: Mapped[str | None] = mapped_column(String, nullable=True)

    # Datos identificatorios del equipo.
    descripcion: Mapped[str] = mapped_column(String, nullable=False)
    ubicacion: Mapped[str | None] = mapped_column(String, nullable=True)
    marca: Mapped[str | None] = mapped_column(String, nullable=True)
    modelo: Mapped[str | None] = mapped_column(String, nullable=True)
    numero_serie: Mapped[str | None] = mapped_column(String, nullable=True)
    fecha_instalacion: Mapped[date | None] = mapped_column(Date, nullable=True)
    estado: Mapped[str] = mapped_column(String, nullable=False)
    numero_orden_compra: Mapped[str | None] = mapped_column(String, nullable=True)

    # Mantenimiento preventivo.
    plantilla_mp_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    ultima_fecha_mp: Mapped[date | None] = mapped_column(Date, nullable=True)
    proxima_fecha_mp: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Trazabilidad de préstamos temporales entre sectores.
    en_prestamo_temporal: Mapped[bool | None] = mapped_column(default=False, nullable=True)
    sector_original_id: Mapped[str | None] = mapped_column(String, nullable=True)
    ubicacion_original: Mapped[str | None] = mapped_column(String, nullable=True)
    grupo_original_id: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=datetime.utcnow)
    criticidad: Mapped[str | None] = mapped_column(String, nullable=True)
    
    # ─── Relaciones (navegar desde el activo hacia lo que le pertenece) ───
    ordenes_de_trabajo: Mapped[list["OrdenTrabajo"]] = relationship(back_populates="activo")
    fallas: Mapped[list["Falla"]] = relationship(back_populates="activo")
    mantenimientos: Mapped[list["MantenimientoPreventivo"]] = relationship(back_populates="activo")
    movimientos: Mapped[list["MovimientoActivo"]] = relationship(back_populates="activo")
    

class OrdenTrabajo(Base):
    """Orden de trabajo: el corazón operativo del sistema.

    Puede ser correctiva (por una falla) o preventiva. Se abre, se asigna a un
    técnico, se sigue y se cierra. Pertenece a un activo (activo_codigo).
    """
    __tablename__ = "ordenes_de_trabajo"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    numero_ot: Mapped[int] = mapped_column(Integer, nullable=False)
    activo_codigo: Mapped[str] = mapped_column(String, ForeignKey("activos.codigo"), nullable=False)
    tipo: Mapped[str] = mapped_column(String, nullable=False)          # correctiva / preventiva
    estado: Mapped[str] = mapped_column(String, nullable=False)        # abierta / en curso / cerrada
    prioridad: Mapped[str | None] = mapped_column(String, nullable=True)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    tecnico_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    grupo_id: Mapped[str | None] = mapped_column(String, nullable=True)
    sector_solicitante_id: Mapped[str | None] = mapped_column(String, nullable=True)
    fecha_apertura: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    fecha_cierre: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    fecha_notificacion: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notificado_por: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=datetime.utcnow)
    
    # ─── Relaciones ───
    activo: Mapped["Activo"] = relationship(back_populates="ordenes_de_trabajo")
    fallas: Mapped[list["Falla"]] = relationship(back_populates="orden")
    mantenimientos: Mapped[list["MantenimientoPreventivo"]] = relationship(back_populates="orden")
    consumos: Mapped[list["ConsumoInsumo"]] = relationship(back_populates="orden")
    adjuntos: Mapped[list["Adjunto"]] = relationship(back_populates="orden")


class Falla(Base):
    """Una falla reportada sobre un activo. Puede derivar en una orden de trabajo."""
    __tablename__ = "fallas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    activo_codigo: Mapped[str] = mapped_column(String, ForeignKey("activos.codigo"), nullable=False)
    ot_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ordenes_de_trabajo.id"), nullable=True)
    reportado_por: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    tipo_falla: Mapped[str | None] = mapped_column(String, nullable=True)
    severidad: Mapped[str | None] = mapped_column(String, nullable=True)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    estado: Mapped[str] = mapped_column(String, nullable=False)
    fecha_reporte: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    
    # ─── Relaciones ───
    activo: Mapped["Activo"] = relationship(back_populates="fallas")
    orden: Mapped["OrdenTrabajo | None"] = relationship(back_populates="fallas")


class MantenimientoPreventivo(Base):
    """Un mantenimiento preventivo programado (o realizado) sobre un activo."""
    __tablename__ = "mantenimientos_preventivos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    activo_codigo: Mapped[str] = mapped_column(String, ForeignKey("activos.codigo"), nullable=False)
    plantilla_mp_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    ot_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ordenes_de_trabajo.id"), nullable=True)
    fecha_programada: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_realizada: Mapped[date | None] = mapped_column(Date, nullable=True)
    tecnico_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    estado: Mapped[str] = mapped_column(String, nullable=False)
    generado_automaticamente: Mapped[bool | None] = mapped_column(default=False, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=datetime.utcnow)
    
    # ─── Relaciones ───
    activo: Mapped["Activo"] = relationship(back_populates="mantenimientos")
    orden: Mapped["OrdenTrabajo | None"] = relationship(back_populates="mantenimientos")
    respuestas: Mapped[list["ChecklistRespuesta"]] = relationship(back_populates="mantenimiento")
    
    
class Insumo(Base):
    """Un insumo o repuesto del stock. Tiene compras (entradas) y consumos (salidas)."""
    __tablename__ = "insumos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre: Mapped[str] = mapped_column(String, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    unidad: Mapped[str | None] = mapped_column(String, nullable=True)
    stock_actual: Mapped[int | None] = mapped_column(Integer, default=0, nullable=True)
    stock_minimo: Mapped[int | None] = mapped_column(Integer, default=0, nullable=True)
    punto_reorden: Mapped[int | None] = mapped_column(Integer, default=0, nullable=True)
    tipo_equipo_id: Mapped[str | None] = mapped_column(String, ForeignKey("tipos_equipo.id"), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=datetime.utcnow)

    # ─── Relaciones ───
    compras: Mapped[list["Compra"]] = relationship(back_populates="insumo")
    consumos: Mapped[list["ConsumoInsumo"]] = relationship(back_populates="insumo")


class Compra(Base):
    """Una compra de insumos (entrada de stock)."""
    __tablename__ = "compras"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    insumo_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("insumos.id"), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    estado: Mapped[str | None] = mapped_column(String, default="pedida", nullable=True)
    fecha_recepcion: Mapped[date | None] = mapped_column(Date, nullable=True)
    proveedor: Mapped[str | None] = mapped_column(String, nullable=True)
    numero_orden: Mapped[str | None] = mapped_column(String, nullable=True)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)
    registrado_por: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=datetime.utcnow)

    # ─── Relaciones ───
    insumo: Mapped["Insumo"] = relationship(back_populates="compras")


class ConsumoInsumo(Base):
    """Un consumo de insumo (salida de stock), vinculado a una orden de trabajo.

    Este es el 'descuento automático de stock al usar un repuesto en una OT' que
    menciona el anteproyecto: cada consumo apunta a la OT donde se usó.
    """
    __tablename__ = "consumos_insumos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ot_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ordenes_de_trabajo.id"), nullable=False)
    insumo_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("insumos.id"), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    fecha: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    tecnico_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # ─── Relaciones ───
    insumo: Mapped["Insumo"] = relationship(back_populates="consumos")
    orden: Mapped["OrdenTrabajo"] = relationship(back_populates="consumos")
    

class PlantillaMP(Base):
    """Plantilla de mantenimiento preventivo: define qué se revisa para un tipo
    de equipo y cada cuántos días. Tiene muchos ítems de checklist."""
    __tablename__ = "plantillas_mp"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tipo_equipo_id: Mapped[str | None] = mapped_column(String, ForeignKey("tipos_equipo.id"), nullable=True)
    nombre: Mapped[str] = mapped_column(String, nullable=False)
    frecuencia_dias: Mapped[int] = mapped_column(Integer, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=datetime.utcnow)
    es_generica: Mapped[bool | None] = mapped_column(default=False, nullable=True)
    

    # ─── Relaciones ───
    items: Mapped[list["ChecklistItem"]] = relationship(back_populates="plantilla")


class ChecklistItem(Base):
    """Un punto a revisar dentro de una plantilla de MP (ej: 'verificar batería')."""
    __tablename__ = "checklist_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plantilla_mp_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("plantillas_mp.id"), nullable=False)
    orden: Mapped[int] = mapped_column(Integer, nullable=False)   # número de paso en el checklist
    descripcion: Mapped[str] = mapped_column(String, nullable=False)
    obligatorio: Mapped[bool | None] = mapped_column(default=True, nullable=True)

    # ─── Relaciones ───
    plantilla: Mapped["PlantillaMP"] = relationship(back_populates="items")
    respuestas: Mapped[list["ChecklistRespuesta"]] = relationship(back_populates="item")


class ChecklistRespuesta(Base):
    """La respuesta a un ítem del checklist en un mantenimiento concreto.

    Conecta un mantenimiento (mp_id) con un ítem del checklist (checklist_item_id)
    y registra si se completó."""
    __tablename__ = "checklist_respuestas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mp_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("mantenimientos_preventivos.id"), nullable=False)
    checklist_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("checklist_items.id"), nullable=False)
    completado: Mapped[bool | None] = mapped_column(default=False, nullable=True)
    observacion: Mapped[str | None] = mapped_column(Text, nullable=True)
    completado_por: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    resultado: Mapped[str | None] = mapped_column(String, nullable=True)  # PASA / NO_PASA

    # ─── Relaciones ───
    item: Mapped["ChecklistItem"] = relationship(back_populates="respuestas")
    mantenimiento: Mapped["MantenimientoPreventivo"] = relationship(back_populates="respuestas")
    
class MovimientoActivo(Base):
    """Registro de un movimiento de un activo entre sectores (trazabilidad).

    Guarda de dónde a dónde se movió, cuándo, y si es un préstamo temporal,
    la fecha estimada y real de devolución."""
    __tablename__ = "movimientos_activos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    activo_codigo_actual: Mapped[str] = mapped_column(String, ForeignKey("activos.codigo"), nullable=False)
    activo_codigo_anterior: Mapped[str | None] = mapped_column(String, nullable=True)
    tipo: Mapped[str] = mapped_column(String, nullable=False)
    sector_origen_id: Mapped[str] = mapped_column(String, ForeignKey("servicios.id"), nullable=False)
    sector_destino_id: Mapped[str] = mapped_column(String, ForeignKey("servicios.id"), nullable=False)
    ubicacion_destino: Mapped[str | None] = mapped_column(String, nullable=True)
    grupo_origen_id: Mapped[str | None] = mapped_column(String, nullable=True)
    grupo_destino_id: Mapped[str | None] = mapped_column(String, nullable=True)
    fecha_movimiento: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    fecha_devolucion_estimada: Mapped[date | None] = mapped_column(Date, nullable=True)
    fecha_devolucion_real: Mapped[date | None] = mapped_column(Date, nullable=True)
    registrado_por: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)
    estado: Mapped[str | None] = mapped_column(String, nullable=True)

    # ─── Relaciones ───
    activo: Mapped["Activo"] = relationship(back_populates="movimientos")


class Adjunto(Base):
    """Un archivo (imagen, PDF) adjunto a una orden de trabajo."""
    __tablename__ = "adjuntos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ot_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ordenes_de_trabajo.id"), nullable=False)
    nombre_archivo: Mapped[str] = mapped_column(String, nullable=False)
    url: Mapped[str] = mapped_column(String, nullable=False)
    tipo: Mapped[str | None] = mapped_column(String, nullable=True)
    subido_por: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=datetime.utcnow)

    # ─── Relaciones ───
    orden: Mapped["OrdenTrabajo"] = relationship(back_populates="adjuntos")

class GrupoTecnico(Base):
    """Catálogo de grupos técnicos (equipos de trabajo de Bioingeniería)."""
    __tablename__ = "grupos_tecnicos"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    descripcion: Mapped[str | None] = mapped_column(String, nullable=True)


class GrupoTipoEquipo(Base):
    """Tabla de enlace: qué tipos de equipo maneja cada grupo técnico.

    No tiene id propio; su clave primaria son las dos columnas juntas
    (grupo_id + tipo_equipo_id)."""
    __tablename__ = "grupo_tipo_equipo"

    grupo_id: Mapped[str] = mapped_column(String, ForeignKey("grupos_tecnicos.id"), primary_key=True)
    tipo_equipo_id: Mapped[str] = mapped_column(String, ForeignKey("tipos_equipo.id"), primary_key=True)


class Notificacion(Base):
    """Notificación del sistema para un usuario (ej: OT correctiva asignada)."""
    __tablename__ = "notificaciones"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=False)
    tipo: Mapped[str] = mapped_column(String, nullable=False)
    titulo: Mapped[str] = mapped_column(String, nullable=False)
    mensaje: Mapped[str] = mapped_column(Text, nullable=False)
    leida: Mapped[bool | None] = mapped_column(default=False, nullable=True)
    referencia_tipo: Mapped[str | None] = mapped_column(String, nullable=True)
    referencia_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=datetime.utcnow)


class Auditoria(Base):
    """Registro de auditoría: quién cambió qué y cuándo. Guarda los datos
    anteriores y nuevos en formato JSON."""
    __tablename__ = "auditoria"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True)
    tabla: Mapped[str] = mapped_column(String, nullable=False)
    registro_id: Mapped[str] = mapped_column(String, nullable=False)
    accion: Mapped[str] = mapped_column(String, nullable=False)
    datos_anteriores: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    datos_nuevos: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=datetime.utcnow)