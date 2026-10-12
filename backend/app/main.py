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

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from .config import settings
from .routers import auth, activos, ordenes_trabajo, fallas, mantenimientos, stock, checklists, planes_mantenimiento, dashboard, exportar, solicitudes, preventivas, usuarios, catalogos, tareas
from .scheduler import iniciar_scheduler, detener_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    # En Vercel el backend no queda prendido todo el tiempo: se despierta con
    # cada pedido y se apaga solo, así que un scheduler adentro del proceso
    # no serviría (se apagaría con todo lo demás). Por eso en Vercel no lo
    # prendemos: esas tareas las dispara un Cron de Vercel una vez por día
    # (ver backend/vercel.json y routers/tareas.py).
    # Vercel define sola la variable VERCEL=1. En tu compu no existe, así que
    # localmente el scheduler sigue funcionando igual que antes.
    en_vercel = os.environ.get("VERCEL") == "1"
    if not en_vercel:
        iniciar_scheduler()
    yield
    if not en_vercel:
        detener_scheduler()


app = FastAPI(
    title="SYNAP API",
    description="Backend del sistema de gestión de equipamiento médico (PFC Bioingeniería).",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS: define desde qué direcciones el frontend puede hablarle al backend.
# Antes había DOS CORSMiddleware, y el segundo tenía el puerto de Vite
# hardcodeado a 5173 — el día que ese puerto estaba ocupado (Vite se corría
# solo a 5174) el navegador bloqueaba todos los pedidos al backend, y el login
# mostraba "Número o contraseña incorrectos" aunque el problema no tuviera
# nada que ver con la contraseña (Login.jsx muestra ese mismo texto para
# CUALQUIER error, incluido un bloqueo de CORS).
#
# Con allow_origin_regex alcanza un solo middleware: deja pasar cualquier
# puerto de localhost/127.0.0.1 (el que sea que Vite elija) más lo que venga
# de config.py, así no vuelve a pasar.
#
# expose_headers=["X-Total-Count"]: por defecto el navegador le esconde a
# JavaScript cualquier header que no sea uno de los "básicos", así que sin
# esto el frontend no podía leer el total de activos que manda /activos para
# el botón "Cargar más" (quedaba undefined aunque el header sí viajaba).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

# Conectar los endpoints de autenticación (login, activar, estado).
app.include_router(auth.router)
app.include_router(activos.router)
app.include_router(ordenes_trabajo.router)
app.include_router(fallas.router)
app.include_router(mantenimientos.router)
app.include_router(stock.router)
app.include_router(checklists.router)
app.include_router(planes_mantenimiento.router)
app.include_router(dashboard.router)
app.include_router(solicitudes.router)
app.include_router(preventivas.router)
app.include_router(usuarios.router)
app.include_router(exportar.router)
app.include_router(catalogos.router)
app.include_router(tareas.router)


@app.get("/health", tags=["health"])
def health():
    """Endpoint simple para chequear que el backend está vivo."""
    return {"status": "ok"}