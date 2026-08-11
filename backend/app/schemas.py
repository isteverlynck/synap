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
from datetime import datetime

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