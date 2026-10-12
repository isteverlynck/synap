"""Tareas automáticas disparadas desde afuera (Cron de Vercel).

En la compu (o en un servidor que queda siempre prendido) estas tareas las
corre solo el scheduler que vive dentro del backend (ver app/scheduler.py).
En Vercel eso no sirve: el backend se enciende con cada pedido y se apaga
después, así que el scheduler no está prendido a la hora en que tendría que
correr (por eso main.py no lo arranca cuando VERCEL=1).

La solución es que Vercel "despierte" al backend una vez por día llamando a
GET /tareas/diarias (está configurado en backend/vercel.json). Ese pedido hace
exactamente lo mismo que el scheduler:
  1. Genera las OT preventivas del mes en curso (no duplica nada, así que da
     igual si corre de más).
  2. Si estamos en la última semana del mes, manda el mail con los MP que
     todavía no se hicieron (cada uno se avisa una sola vez).

Seguridad: no cualquiera puede llamarlo. Vercel manda en el pedido el header
"Authorization: Bearer <CRON_SECRET>", con la clave que se carga en sus
variables de entorno; si no coincide con la de este backend, se rechaza. Si
CRON_SECRET no está configurada, el endpoint queda apagado.
"""

import secrets

from fastapi import APIRouter, Header, HTTPException

from ..config import settings
from ..scheduler import _job_avisar_mp_por_vencer, _job_generar_mes_actual

router = APIRouter(prefix="/tareas", tags=["tareas"])


@router.get("/diarias")
def correr_tareas_diarias(authorization: str | None = Header(default=None)):
    """Lo llama el Cron de Vercel una vez por día (ver backend/vercel.json)."""
    if not settings.cron_secret:
        raise HTTPException(
            status_code=503,
            detail="Las tareas programadas no están configuradas (falta CRON_SECRET).",
        )
    esperado = f"Bearer {settings.cron_secret}"
    if not authorization or not secrets.compare_digest(authorization, esperado):
        raise HTTPException(status_code=401, detail="No autorizado.")

    # Son las mismas funciones que usa el scheduler local: cada una abre su
    # propia conexión a la base y, si algo falla, lo deja anotado en el log
    # sin cortar la otra.
    _job_generar_mes_actual()
    _job_avisar_mp_por_vencer()
    return {"ok": True}