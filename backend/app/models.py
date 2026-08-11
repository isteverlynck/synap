"""Modelos ORM de SQLAlchemy — la traducción de las tablas de Supabase a Python.

Por ahora solo está 'usuarios' (la tabla del login). Las demás tablas del
sistema (activos, órdenes de trabajo, stock, etc.) se irán agregando acá a
medida que las necesitemos.

IMPORTANTE: estos modelos tienen que coincidir con las columnas reales que ya
existen en Supabase. Si en algún momento cambiás una tabla en Supabase, hay que
reflejar el cambio acá también.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String
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