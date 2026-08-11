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

from ..database import get_db
from ..models import Usuario
from ..schemas import ActivarCuentaRequest, EstadoUsuario, Token, UsuarioOut
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/estado/{numero}", response_model=EstadoUsuario)
def estado_usuario(numero: str, db: Session = Depends(get_db)):
    """La persona escribe su número: ¿existe en el padrón? ¿ya tiene contraseña?

    El frontend usa esto para decidir si mostrar 'creá tu contraseña' (activar)
    o 'poné tu contraseña' (login normal).
    """
    user = db.query(Usuario).filter(Usuario.numero_identificacion == numero).first()
    if user is None:
        return EstadoUsuario(existe=False, activado=False)
    return EstadoUsuario(existe=True, activado=user.hashed_password is not None)


@router.post("/activar", response_model=UsuarioOut)
def activar_cuenta(payload: ActivarCuentaRequest, db: Session = Depends(get_db)):
    """Primer ingreso: la persona crea su contraseña y activa la cuenta."""
    user = db.query(Usuario).filter(
        Usuario.numero_identificacion == payload.numero_identificacion
    ).first()

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
    ahí el número de identificación.
    """
    user = db.query(Usuario).filter(
        Usuario.numero_identificacion == form_data.username
    ).first()

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