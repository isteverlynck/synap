"""Configuración central del backend de SYNAP.

Las variables sensibles (como la conexión a la base de datos de Supabase) NO se
escriben acá: se leen desde un archivo .env que vive solo en tu compu y que
nunca se sube a GitHub (está protegido por el .gitignore).

Los valores que ves abajo son valores POR DEFECTO. Si existe un .env con la
variable correspondiente, ese valor pisa al de acá. Ejemplo: database_url tiene
un default inofensivo, pero en tu .env vas a poner la connection string real de
Supabase, y esa es la que se usa.

Tener un .env.example en el repo con valores de ejemplo (sin datos reales) para
que tu compañera sepa qué variables necesita cargar en su propio .env.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ─── Base de datos ───
    # En producción/desarrollo real esto se sobrescribe desde el .env con la
    # connection string de Supabase (postgresql://postgres...). El default es
    # solo para que el archivo no explote si todavía no cargaste el .env.
    database_url: str = "postgresql://user:password@localhost:5432/synap"

    # ─── JWT (tokens de login) ───
    # secret_key es la clave con la que se firman los tokens de sesión. En el
    # .env se pone una clave larga y aleatoria. NUNCA usar el default en serio.
    secret_key: str = "cambiar-esta-clave-en-produccion"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 1 día

    # ─── Debug ───
    # Habilita endpoints de demo/prueba. Poner en False en producción.
    debug: bool = True

    # ─── CORS ───
    # Orígenes (direcciones) desde los que el frontend puede hablarle al backend.
    # Cuando definamos cómo corre el front, ajustamos estos valores.
    cors_origins: list[str] = [
        "http://localhost",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


# Instancia única que importa el resto del backend: `from .config import settings`
settings = Settings()