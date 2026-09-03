"""Endpoints de autenticación de SYNAP.

Implementa el flujo que definimos:
  1. La persona escribe su número de identificación → GET /auth/estado/{numero}
     nos dice si existe en el padrón y si ya activó su cuenta.
  2. Si no activó → POST /auth/activar : crea su contraseña (primer ingreso).
  3. Si ya activó → POST /auth/login : entra con número + contraseña.

El alta de personas la hace el hospital (cargando la fila en 'usuarios' con su
número, mail y rol). Nadie se auto-registra desde afuera.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import hashlib
import secrets
from datetime import datetime, timedelta, timezone


from ..database import get_db
from ..models import Usuario, PasswordResetToken
from ..notificaciones import mail_recuperacion
from ..schemas import (
    ActivarCuentaRequest,
    EstadoUsuario,
    Token,
    UsuarioOut,
    validar_numero_identificacion,
    MensajeGenerico,
    RecuperarPasswordRequest,
    RestablecerPasswordRequest,
)
from ..security import create_access_token, get_current_user, hash_password, verify_password, buscar_usuario_por_numero

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UsuarioOut)
def mi_perfil(current_user: Usuario = Depends(get_current_user)):
    """Datos del usuario logueado (según el token). El frontend lo usa justo
    después del login para saber el rol y decidir a qué pantalla mandarlo."""
    return current_user


@router.get("/estado/{numero}", response_model=EstadoUsuario)
def estado_usuario(numero: str, db: Session = Depends(get_db)):
    """La persona escribe su número: ¿existe en el padrón? ¿ya tiene contraseña?

    El frontend usa esto para decidir si mostrar 'creá tu contraseña' (activar)
    o 'poné tu contraseña' (login normal).
    """
    try:
        numero = validar_numero_identificacion(numero)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    user = buscar_usuario_por_numero(db, numero)
    if user is None:
        return EstadoUsuario(existe=False, activado=False)
    return EstadoUsuario(existe=True, activado=user.hashed_password is not None)


@router.post("/activar", response_model=UsuarioOut)
def activar_cuenta(payload: ActivarCuentaRequest, db: Session = Depends(get_db)):
    """Primer ingreso: la persona crea su contraseña y activa la cuenta."""
    user = buscar_usuario_por_numero(db, payload.numero_identificacion)

    # No está en el padrón del hospital.
    if user is None:
        raise HTTPException(
            status_code=404,
            detail="No encontramos ese número de identificación. Contactá a Bioingeniería.",
        )

    # Ya tenía contraseña: no puede volver a activar (tiene que ir al login).
    if user.hashed_password is not None:
        raise HTTPException(
            status_code=400,
            detail="Esta cuenta ya está activada. Iniciá sesión con tu contraseña.",
        )

    # Las dos contraseñas tienen que coincidir.
    if payload.password != payload.password_confirmacion:
        raise HTTPException(status_code=400, detail="Las contraseñas no coinciden.")

    # Largo mínimo (regla simple de seguridad).
    if len(payload.password) < 8:
        raise HTTPException(
            status_code=400, detail="La contraseña debe tener al menos 8 caracteres."
        )

    # Guardar la contraseña hasheada → cuenta activada.
    user.hashed_password = hash_password(payload.password)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Ingreso normal: número + contraseña → devuelve el token de sesión.

    OAuth2PasswordRequestForm usa un campo llamado 'username'; nosotras metemos
    ahí el número de identificación (normalizado a minúsculas: "U123" y "u123"
    entran igual).
    """
    user = buscar_usuario_por_numero(db, form_data.username)

    # Usuario inexistente, o sin activar, o contraseña incorrecta → mismo error
    # genérico (no conviene revelar cuál de las tres falló, por seguridad).
    if (
        user is None
        or user.hashed_password is None
        or not verify_password(form_data.password, user.hashed_password)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Número o contraseña incorrectos.",
        )

    # Emitir el token con el número de la persona adentro (campo 'sub').
    token = create_access_token({"sub": user.numero_identificacion})
    return Token(access_token=token)

# ═══════════════════════════════════════════════════════════════════════════
# RECUPERAR CONTRASEÑA
# ═══════════════════════════════════════════════════════════════════════════

# Cuánto vive el enlace desde que se genera.
DURACION_TOKEN = timedelta(hours=1)

# Respuesta única del pedido de recuperación (ver comentario en el endpoint).
RESPUESTA_NEUTRA = (
    "Si el número corresponde a una cuenta activa, te enviamos un mail con "
    "las instrucciones para restablecer tu contraseña."
)


def _hashear_token(token: str) -> str:
    """Hash del token para guardar en la base.

    Acá usamos SHA-256 y no bcrypt (como en las contraseñas) porque el token lo
    generamos nosotras al azar y es largo: no hay nada que "adivinar" a fuerza
    de probar, así que no hace falta un hash lento a propósito.
    """
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/recuperar", response_model=MensajeGenerico)
def recuperar_password(payload: RecuperarPasswordRequest, db: Session = Depends(get_db)):
    """Genera un enlace de recuperación y lo manda por mail.

    IMPORTANTE: la respuesta es SIEMPRE la misma, exista o no el usuario. Si
    contestáramos distinto, cualquiera podría ir probando números para averiguar
    quién trabaja en el hospital.
    """
    user = buscar_usuario_por_numero(db, payload.numero_identificacion)

    # Solo tiene sentido para cuentas ya activadas: si nunca creó contraseña,
    # el camino que le corresponde es /auth/activar.
    if user is not None and user.hashed_password is not None:
        # Invalidar los tokens anteriores sin usar: si pidió el enlace tres
        # veces, que sirva solo el último.
        db.query(PasswordResetToken).filter(
            PasswordResetToken.usuario_id == user.id,
            PasswordResetToken.usado_en.is_(None),
        ).update({"usado_en": datetime.now(timezone.utc)})

        # Token al azar, imposible de adivinar. Este valor solo viaja en el mail.
        token = secrets.token_urlsafe(32)
        db.add(PasswordResetToken(
            usuario_id=user.id,
            token_hash=_hashear_token(token),
            expira_en=datetime.now(timezone.utc) + DURACION_TOKEN,
            created_at=datetime.now(timezone.utc),
        ))
        db.commit()

        mail_recuperacion(user, token)

    return MensajeGenerico(mensaje=RESPUESTA_NEUTRA)


@router.post("/restablecer", response_model=MensajeGenerico)
def restablecer_password(payload: RestablecerPasswordRequest, db: Session = Depends(get_db)):
    """Cambia la contraseña usando el token que llegó por mail."""
    if payload.password != payload.password_confirmacion:
        raise HTTPException(status_code=400, detail="Las contraseñas no coinciden.")
    if len(payload.password) < 8:
        raise HTTPException(
            status_code=400, detail="La contraseña debe tener al menos 8 caracteres."
        )

    # Buscamos por el hash: el token en limpio nunca estuvo guardado.
    registro = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == _hashear_token(payload.token)
    ).first()

    # Token inexistente, ya usado o vencido → mismo error para los tres casos.
    if (
        registro is None
        or registro.usado_en is not None
        or registro.expira_en < datetime.now(timezone.utc)
    ):
        raise HTTPException(
            status_code=400,
            detail="El enlace no es válido o ya venció. Pedí uno nuevo.",
        )

    user = db.query(Usuario).filter(Usuario.id == registro.usuario_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    user.hashed_password = hash_password(payload.password)
    registro.usado_en = datetime.now(timezone.utc)   # quemar el token
    db.commit()

    return MensajeGenerico(mensaje="Listo, ya podés entrar con tu contraseña nueva.")