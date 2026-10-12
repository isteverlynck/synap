"""Puerta de entrada para Vercel.

Vercel busca una app de FastAPI llamada 'app' en un archivo index.py. La
nuestra vive en app/main.py, así que acá solo la importamos. En tu compu
seguís corriendo el backend igual que siempre (uvicorn app.main:app).
"""
from app.main import app  # noqa: F401