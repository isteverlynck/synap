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

from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

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