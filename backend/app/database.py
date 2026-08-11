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
engine = create_engine(settings.database_url)

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