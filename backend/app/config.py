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

    # ─── Notificaciones por mail ───
    # Credenciales SMTP (hoy: relay gratuito de Brevo) para mandar mails de
    # verdad. Si smtp_user o smtp_password quedan vacíos (no hay .env con
    # estos datos, ej. en la compu de una compañera que todavía no los
    # configuró), notificaciones.py cae solo al modo simulado — no explota.
    smtp_host: str = "smtp-relay.brevo.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    # Dirección que aparece como remitente ("From") en el mail. TIENE que ser
    # una dirección verificada como remitente en tu cuenta de Brevo (pestaña
    # "Remitentes, dominios e IP" → Remitentes) — si no está verificada, Brevo
    # bloquea el envío sin devolver ningún error acá. Es distinta de
    # smtp_user (que es solo la credencial de login SMTP). Si la dejás
    # vacía, se usa smtp_user como remitente de respaldo.
    smtp_remitente: str = ""

    # Casilla FIJA que recibe las notificaciones automáticas del sistema (OT
    # correctiva creada, stock crítico, MP por vencer) — no es el mail de
    # ningún usuario en particular, es la casilla que revisa Bioingeniería.
    email_notificaciones: str = ""

    # ─── Dirección del frontend ───
    # Dirección pública desde la que se abre SYNAP en el navegador. La usan los
    # links de los mails (ej. recuperar contraseña). Hoy corre en la compu de
    # cada una; cuando se despliegue de verdad, poner acá la dirección real en
    # el .env (URL_FRONTEND=https://...).
    url_frontend: str = "http://localhost:5173"

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