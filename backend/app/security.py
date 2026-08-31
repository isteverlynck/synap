"""Hashing de contraseñas y emisión/validación de tokens JWT.

Dos responsabilidades:
  1. Contraseñas: hash_password guarda de forma segura (bcrypt), verify_password
     compara. NUNCA se guarda la contraseña en texto plano.
  2. Tokens (JWT): create_access_token emite el token de sesión al loguearse;
     get_current_user lo valida en cada pedido protegido y devuelve al usuario.
"""

from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import Usuario


# Contexto de hashing con bcrypt (el algoritmo estándar para contraseñas).
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Le dice a FastAPI de dónde sacar el token en los pedidos protegidos.
# tokenUrl apunta al endpoint de login (lo creamos en el próximo archivo).
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_password(password: str) -> str:
    """Convierte una contraseña en su hash seguro (para guardar en la base)."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Compara una contraseña escrita contra el hash guardado. True si coinciden."""
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Genera un token JWT firmado. 'data' lleva la identidad del usuario."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Usuario:
    """Valida el token de un pedido y devuelve el usuario correspondiente.

    Los endpoints protegidos van a pedir este 'get_current_user': si el token
    es válido, reciben al usuario; si no, FastAPI corta con un 401.
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        # 'sub' (subject) es donde guardamos el número de identificación.
        numero: str | None = payload.get("sub")
        if numero is None:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    user = db.query(Usuario).filter(Usuario.numero_identificacion == numero).first()
    if user is None:
        raise credentials_exc
    return user


def requiere_rol(*roles_permitidos: str):
    """Genera una dependencia que exige que el usuario tenga uno de los roles dados.

    Uso en un endpoint:
        current_user: Usuario = Depends(requiere_rol("coordinacion", "jefatura"))
    Si el usuario logueado no tiene ninguno de esos roles, corta con 403.
    Jefatura siempre pasa (tiene visión global de todo el sistema).
    """
    def verificar(current_user: Usuario = Depends(get_current_user)) -> Usuario:
        # Jefatura puede todo.
        if current_user.rol == "jefatura":
            return current_user
        if current_user.rol not in roles_permitidos:
            raise HTTPException(
                status_code=403,
                detail=f"Esta acción requiere rol: {', '.join(roles_permitidos)}.",
            )
        return current_user
    return verificar