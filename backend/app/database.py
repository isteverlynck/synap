"""Conexión a la base de datos (PostgreSQL en Supabase).

Este módulo arma el "motor" de conexión y la fábrica de sesiones. El resto del
backend no toca la base directamente: pide una sesión con get_db() y trabaja
con eso.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings


# El "engine" es el motor de conexión. Lee la dirección de la base desde
# settings.database_url (que viene del .env con la connection string de Supabase).
#
# pool_pre_ping=True: antes de usar una conexión del pool, SQLAlchemy le manda
# un "ping" liviano para chequear que sigue viva. Si Supabase la cerró por
# estar mucho tiempo sin uso (esto pasa con conexiones idle), SQLAlchemy la
# descarta sola y abre una nueva, en vez de romper con un error 500.
#
# pool_recycle=1800: además, descarta y renueva cualquier conexión que lleve
# más de 30 minutos abierta, aunque parezca estar viva, para no depender de
# que Supabase la cierre justo antes de que la volvamos a usar.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_recycle=1800,
)

# Fábrica de sesiones: cada request abre una y la cierra al terminar.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Clase base de la que heredan todos los modelos ORM (las tablas)."""


def get_db():
    """Dependencia de FastAPI: abre una sesión de base por cada request y la
    cierra al final, pase lo que pase."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()