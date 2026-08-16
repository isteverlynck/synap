"""Entry point del backend de SYNAP.

Este es el archivo que 'enciende' el backend. Junta todas las piezas y arranca
el servidor.

Para correrlo en desarrollo, parada en la carpeta backend/:
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

Docs interactivas (la 'carta' de endpoints para probar a mano):
    http://localhost:8000/docs

NOTA: a diferencia de proyectos que arrancan de cero, acá NO creamos las tablas
desde el código (no usamos Base.metadata.create_all): las tablas ya existen en
Supabase. El backend solo se conecta a ellas.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import auth, activos, ordenes_trabajo, fallas, mantenimientos, stock


app = FastAPI(
    title="SYNAP API",
    description="Backend del sistema de gestión de equipamiento médico (PFC Bioingeniería).",
    version="0.1.0",
)

# CORS: define desde qué direcciones el frontend puede hablarle al backend.
# Los orígenes permitidos están en config.py (cors_origins).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Conectar los endpoints de autenticación (login, activar, estado).
app.include_router(auth.router)
app.include_router(activos.router)
app.include_router(ordenes_trabajo.router)
app.include_router(fallas.router)
app.include_router(mantenimientos.router)  
app.include_router(stock.router)


@app.get("/health", tags=["health"])
def health():
    """Endpoint simple para chequear que el backend está vivo."""
    return {"status": "ok"}