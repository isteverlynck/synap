"""Endpoints de stock: insumos, compras y consumos.

Cubre el objetivo de MÍNIMA 'módulo de gestión de stock vinculado a las OT'.

Reglas de negocio (definidas con el equipo, reflejan el flujo real del hospital):

  COMPRA EN DOS PASOS
    - POST /stock/compras          -> registra el PEDIDO (estado 'pedida'). NO sube stock.
    - PATCH /stock/compras/{id}/recibir -> marca 'recibida' y RECIÉN AHÍ sube el stock.
    Motivo: no contar como disponible algo que todavía no llegó, y que se vea
    que un insumo ya está encargado (para no pedirlo dos veces).

  CONSUMO SIEMPRE PERMITIDO
    - POST /stock/consumos descuenta stock y NUNCA se rechaza. Si el stock queda
      por debajo del mínimo, se registra igual y se AVISA (situación crítica).
    Motivo: la necesidad clínica es real y no puede quedar bloqueada por un umbral.

  DOS UMBRALES / TRES NIVELES DE ALERTA
    - punto_reorden: nivel preventivo (conviene encargar antes de tocar el mínimo).
    - stock_minimo: nivel crítico.
    - nivel 'ok' (verde) > punto_reorden ; 'reponer' (amarillo) <= punto_reorden ;
      'critico' (rojo) <= stock_minimo.

Todos los endpoints están protegidos con login (get_current_user).

Estado:
  - GET (seguimiento + alertas de 3 niveles): funcionando.
  - POST/PATCH (que tocan la base): ESCRITOS PERO DESACTIVADOS hasta cargar datos.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from ..database import get_db
from ..models import Insumo, Compra, ConsumoInsumo, OrdenTrabajo, Usuario
from ..schemas import (
    InsumoOut,
    InsumoConAlerta,
    CompraOut,
    CompraCreate,
    ConsumoOut,
    ConsumoCreate,
    ConsumoResultado,
)
from ..security import get_current_user

router = APIRouter(prefix="/stock", tags=["stock"])


# ───────────────────────────────────────────────────────────────────────────
# Helper compartido: dado un insumo, calcula en qué nivel de stock está.
# Lo usan tanto el endpoint de alertas como el de consumo, así la regla vive
# en UN solo lugar (si algún día cambia, se cambia acá y listo).
# ───────────────────────────────────────────────────────────────────────────
def calcular_nivel(stock_actual: int | None,
                   stock_minimo: int | None,
                   punto_reorden: int | None) -> str:
    """Devuelve 'ok', 'reponer' o 'critico' según los umbrales."""
    actual = stock_actual if stock_actual is not None else 0
    minimo = stock_minimo if stock_minimo is not None else 0
    reorden = punto_reorden if punto_reorden is not None else 0
    if actual <= minimo:
        return "critico"
    if actual <= reorden:
        return "reponer"
    return "ok"


def _tiene_compra_pedida(db: Session, insumo_id) -> bool:
    """True si el insumo ya tiene alguna compra encargada sin recibir."""
    pendiente = (
        db.query(Compra)
        .filter(Compra.insumo_id == insumo_id, Compra.estado == "pedida")
        .first()
    )
    return pendiente is not None


# ═══════════════════════════════════════════════════════════════════════════
# SEGUIMIENTO DE STOCK (GET) — funcionando
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/insumos", response_model=list[InsumoOut])
def listar_insumos(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Listar insumos/repuestos con sus existencias actuales."""
    return db.query(Insumo).limit(limit).all()


@router.get("/insumos/{insumo_id}", response_model=InsumoOut)
def ver_insumo(
    insumo_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Ver un insumo puntual por su id."""
    insumo = db.query(Insumo).filter(Insumo.id == insumo_id).first()
    if insumo is None:
        raise HTTPException(status_code=404, detail="Insumo no encontrado")
    return insumo


# ═══════════════════════════════════════════════════════════════════════════
# ALERTAS DE REPOSICIÓN (GET) — funcionando · 3 NIVELES
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/alertas", response_model=list[InsumoConAlerta])
def alertas_reposicion(
    solo_alertas: bool = True,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Estado de stock de los insumos, con su nivel (ok / reponer / critico).

    Por defecto (solo_alertas=True) devuelve solo los que necesitan atención
    (nivel 'reponer' o 'critico'). Con solo_alertas=False devuelve todos, cada
    uno con su nivel — útil para pintar toda la tabla de stock por color.

    Cada insumo trae además tiene_compra_pedida: si ya está encargado, el
    frontend puede mostrar 'reposición en camino' y evitar pedidos duplicados.
    """
    insumos = db.query(Insumo).all()
    resultado = []
    for i in insumos:
        nivel = calcular_nivel(i.stock_actual, i.stock_minimo, i.punto_reorden)
        if solo_alertas and nivel == "ok":
            continue
        resultado.append(
            InsumoConAlerta(
                **InsumoOut.model_validate(i).model_dump(),
                nivel=nivel,
                tiene_compra_pedida=_tiene_compra_pedida(db, i.id),
            )
        )
    return resultado


# ═══════════════════════════════════════════════════════════════════════════
# CONSULTA DE COMPRAS Y CONSUMOS (GET) — funcionando
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/compras", response_model=list[CompraOut])
def listar_compras(
    insumo_id: str | None = None,
    estado: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Historial de compras. Filtrable por insumo y por estado (pedida/recibida).

    Filtrar estado='pedida' muestra lo que está encargado y todavía no llegó.
    """
    q = db.query(Compra)
    if insumo_id is not None:
        q = q.filter(Compra.insumo_id == insumo_id)
    if estado is not None:
        q = q.filter(Compra.estado == estado)
    return q.limit(limit).all()


@router.get("/consumos", response_model=list[ConsumoOut])
def listar_consumos(
    ot_id: str | None = None,
    insumo_id: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Historial de consumos (salidas de stock), por OT o por insumo."""
    q = db.query(ConsumoInsumo)
    if ot_id is not None:
        q = q.filter(ConsumoInsumo.ot_id == ot_id)
    if insumo_id is not None:
        q = q.filter(ConsumoInsumo.insumo_id == insumo_id)
    return q.limit(limit).all()


# ═══════════════════════════════════════════════════════════════════════════
# REGISTRAR PEDIDO DE COMPRA (POST) — TODO: ACTIVAR CON DATOS
# ═══════════════════════════════════════════════════════════════════════════
# Crea la compra como 'pedida'. NO toca el stock (el insumo todavía no llegó).
# Para activar: descomentá el bloque y probá en /docs con un insumo existente.
# ═══════════════════════════════════════════════════════════════════════════
"""
@router.post("/compras", response_model=CompraOut, status_code=201)
def registrar_pedido_compra(
    payload: CompraCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    insumo = db.query(Insumo).filter(Insumo.id == payload.insumo_id).first()
    if insumo is None:
        raise HTTPException(status_code=404, detail="Insumo no encontrado.")
    if payload.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0.")

    compra = Compra(
        insumo_id=payload.insumo_id,
        cantidad=payload.cantidad,
        fecha=payload.fecha,
        estado="pedida",              # nace pedida; NO suma stock todavía
        proveedor=payload.proveedor,
        numero_orden=payload.numero_orden,
        observaciones=payload.observaciones,
        registrado_por=payload.registrado_por,
    )
    db.add(compra)
    db.commit()
    db.refresh(compra)
    return compra
"""


# ═══════════════════════════════════════════════════════════════════════════
# RECIBIR UNA COMPRA (PATCH) — TODO: ACTIVAR CON DATOS
# ═══════════════════════════════════════════════════════════════════════════
# Marca la compra como 'recibida' y RECIÉN AHÍ sube el stock. Es el momento en
# que el insumo llegó físicamente y el encargado lo confirma.
# Para activar: descomentá el bloque.
# ═══════════════════════════════════════════════════════════════════════════
"""
from datetime import date as _date

@router.patch("/compras/{compra_id}/recibir", response_model=CompraOut)
def recibir_compra(
    compra_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    compra = db.query(Compra).filter(Compra.id == compra_id).first()
    if compra is None:
        raise HTTPException(status_code=404, detail="Compra no encontrada.")
    if compra.estado == "recibida":
        raise HTTPException(status_code=400, detail="Esta compra ya fue recibida.")

    insumo = db.query(Insumo).filter(Insumo.id == compra.insumo_id).first()
    if insumo is None:
        raise HTTPException(status_code=404, detail="El insumo de la compra no existe.")

    # Marcar recibida y subir el stock, juntos (un solo commit).
    compra.estado = "recibida"
    compra.fecha_recepcion = _date.today()
    insumo.stock_actual = (insumo.stock_actual or 0) + compra.cantidad

    db.commit()
    db.refresh(compra)
    return compra
"""


# ═══════════════════════════════════════════════════════════════════════════
# REGISTRAR CONSUMO (POST) — TODO: ACTIVAR CON DATOS · NUNCA SE RECHAZA
# ═══════════════════════════════════════════════════════════════════════════
# Descuento automático vinculado a OT. Siempre descuenta y devuelve un aviso con
# el nivel resultante. Si queda bajo el mínimo, se registra igual y avisa crítico.
# Para activar: descomentá el bloque y probá con OT + insumo existentes.
# ═══════════════════════════════════════════════════════════════════════════



@router.post("/consumos", response_model=ConsumoResultado, status_code=201)
def registrar_consumo(
    payload: ConsumoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == payload.ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="La orden de trabajo no existe.")
    insumo = db.query(Insumo).filter(Insumo.id == payload.insumo_id).first()
    if insumo is None:
        raise HTTPException(status_code=404, detail="Insumo no encontrado.")
    if payload.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0.")

    # Descontar SIEMPRE (nunca se rechaza por falta de stock).
    consumo = ConsumoInsumo(
        ot_id=payload.ot_id,
        insumo_id=payload.insumo_id,
        cantidad=payload.cantidad,
        tecnico_id=payload.tecnico_id,
        fecha=datetime.utcnow(),
    )
    db.add(consumo)
    insumo.stock_actual = (insumo.stock_actual or 0) - payload.cantidad
    db.commit()
    db.refresh(consumo)

    # Evaluar cómo quedó el stock y armar el aviso legible.
    nivel = calcular_nivel(insumo.stock_actual, insumo.stock_minimo, insumo.punto_reorden)
    aviso = None
    if nivel == "critico":
        aviso = (
            f"Stock crítico de '{insumo.nombre}': quedan {insumo.stock_actual}, "
            f"el mínimo es {insumo.stock_minimo}. Reponer con urgencia."
        )
    elif nivel == "reponer":
        aviso = (
            f"Conviene reponer '{insumo.nombre}': quedan {insumo.stock_actual}, "
            f"punto de reorden {insumo.punto_reorden}."
        )

    return ConsumoResultado(
        consumo=ConsumoOut.model_validate(consumo),
        stock_resultante=insumo.stock_actual,
        nivel=nivel,
        aviso=aviso,
    )
