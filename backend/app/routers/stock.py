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

Estado: todo funcionando (GET de seguimiento/alertas, alta de insumo, pedido y
recepción de compra, consumo vinculado a OT, ajustes manuales y el historial
unificado de movimientos).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, date

from ..database import get_db
from ..models import Insumo, Compra, ConsumoInsumo, AjusteInventario, OrdenTrabajo, Usuario
from ..notificaciones import notificar_bioingenieria
from ..schemas import (
    InsumoOut,
    InsumoCreate,
    InsumoConAlerta,
    CompraOut,
    CompraCreate,
    ConsumoOut,
    ConsumoCreate,
    ConsumoResultado,
    AjusteCreate,
    AjusteOut,
    MovimientoOut,
)
from ..security import get_current_user, requiere_rol, validar_a_cargo_de_preventiva

router = APIRouter(prefix="/stock", tags=["stock"])


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


def _siguiente_codigo_insumo(db: Session) -> str:
    """Arma el próximo código correlativo de insumo (INS-0001, INS-0002...)."""
    existentes = db.query(Insumo.codigo).filter(Insumo.codigo.like("INS-%")).all()
    maximo = 0
    for (codigo,) in existentes:
        try:
            numero = int(codigo.split("-", 1)[1])
        except (ValueError, IndexError):
            continue
        maximo = max(maximo, numero)
    return f"INS-{maximo + 1:04d}"


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
        raise HTTPException(status_code=404, detail="Accesorio no encontrado")
    return insumo


@router.post("/insumos", response_model=InsumoOut, status_code=201)
def crear_insumo(
    payload: InsumoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("coordinacion")),
):
    """Dar de alta un insumo/repuesto nuevo en el catálogo de stock.

    Solo coordinación (y jefatura, que siempre pasa). El código lo asigna
    el backend solo (correlativo INS-0001, INS-0002...).
    """
    if payload.stock_minimo < 0 or payload.punto_reorden < 0 or payload.stock_actual < 0:
        raise HTTPException(status_code=400, detail="Las cantidades no pueden ser negativas.")
    insumo = Insumo(
        codigo=_siguiente_codigo_insumo(db),
        nombre=payload.nombre,
        descripcion=payload.descripcion,
        unidad=payload.unidad,
        stock_actual=payload.stock_actual,
        stock_minimo=payload.stock_minimo,
        punto_reorden=payload.punto_reorden,
        tipo_equipo_id=payload.tipo_equipo_id or None,
    )
    db.add(insumo)
    db.commit()
    db.refresh(insumo)
    return insumo


@router.delete("/insumos/{insumo_id}", status_code=204)
def eliminar_insumo(
    insumo_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("coordinacion")),
):
    """Sacar un insumo del catálogo de stock (ej: se cargó mal, o no era en
    realidad un insumo/accesorio del servicio). Mismo permiso que darlo de
    alta: coordinación (y jefatura, que siempre pasa).

    Si el insumo ya tiene movimientos registrados (una compra, un consumo
    vinculado a una OT, o un ajuste manual) NO se puede eliminar: borrarlo
    rompería ese historial. En ese caso conviene dejarlo con stock en 0 en
    vez de eliminarlo. Un insumo recién cargado, sin ningún movimiento
    todavía, se puede eliminar sin problema.
    """
    insumo = db.query(Insumo).filter(Insumo.id == insumo_id).first()
    if insumo is None:
        raise HTTPException(status_code=404, detail="Accesorio no encontrado.")

    tiene_compras = db.query(Compra).filter(Compra.insumo_id == insumo_id).first() is not None
    tiene_consumos = db.query(ConsumoInsumo).filter(ConsumoInsumo.insumo_id == insumo_id).first() is not None
    tiene_ajustes = db.query(AjusteInventario).filter(AjusteInventario.insumo_id == insumo_id).first() is not None
    if tiene_compras or tiene_consumos or tiene_ajustes:
        raise HTTPException(
            status_code=400,
            detail=(
                "Este accesorio ya tiene movimientos registrados (compra, consumo o "
                "ajuste) y no se puede eliminar, porque se perdería ese historial. "
                "Si ya no se usa, lo podés dejar con stock en 0."
            ),
        )

    db.delete(insumo)
    db.commit()


@router.get("/alertas", response_model=list[InsumoConAlerta])
def alertas_reposicion(
    solo_alertas: bool = True,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Estado de stock de los insumos, con su nivel (ok / reponer / critico)."""
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


@router.get("/compras", response_model=list[CompraOut])
def listar_compras(
    insumo_id: str | None = None,
    estado: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Historial de compras. Filtrable por insumo y por estado (pedida/recibida)."""
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


@router.post("/compras", response_model=CompraOut, status_code=201)
def registrar_pedido_compra(
    payload: CompraCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "junior", "coordinacion")),
):
    insumo = db.query(Insumo).filter(Insumo.id == payload.insumo_id).first()
    if insumo is None:
        raise HTTPException(status_code=404, detail="Accesorio no encontrado.")
    if payload.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0.")

    compra = Compra(
        insumo_id=payload.insumo_id,
        cantidad=payload.cantidad,
        fecha=payload.fecha,
        estado="pedida",
        proveedor=payload.proveedor,
        numero_orden=payload.numero_orden,
        observaciones=payload.observaciones,
        registrado_por=payload.registrado_por,
    )
    db.add(compra)
    db.commit()
    db.refresh(compra)
    return compra


@router.patch("/compras/{compra_id}/recibir", response_model=CompraOut)
def recibir_compra(
    compra_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "junior", "coordinacion")),
):
    compra = db.query(Compra).filter(Compra.id == compra_id).first()
    if compra is None:
        raise HTTPException(status_code=404, detail="Compra no encontrada.")
    if compra.estado == "recibida":
        raise HTTPException(status_code=400, detail="Esta compra ya fue recibida.")

    insumo = db.query(Insumo).filter(Insumo.id == compra.insumo_id).first()
    if insumo is None:
        raise HTTPException(status_code=404, detail="El accesorio de la compra no existe.")

    compra.estado = "recibida"
    compra.fecha_recepcion = date.today()
    insumo.stock_actual = (insumo.stock_actual or 0) + compra.cantidad

    db.commit()
    db.refresh(compra)
    return compra


@router.post("/consumos", response_model=ConsumoResultado, status_code=201)
def registrar_consumo(
    payload: ConsumoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "junior", "coordinacion")),
):
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == payload.ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="La orden de trabajo no existe.")
    validar_a_cargo_de_preventiva(current_user, orden)
    insumo = db.query(Insumo).filter(Insumo.id == payload.insumo_id).first()
    if insumo is None:
        raise HTTPException(status_code=404, detail="Accesorio no encontrado.")
    if payload.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0.")

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

    if nivel == "critico":
        notificar_bioingenieria(
            "Stock crítico",
            (
                f"{aviso}\n\n"
                f"Consumo registrado: {payload.cantidad} unidad(es), en la OT #{orden.numero_ot}.\n"
            ),
        )

    return ConsumoResultado(
        consumo=ConsumoOut.model_validate(consumo),
        stock_resultante=insumo.stock_actual,
        nivel=nivel,
        aviso=aviso,
    )


@router.post("/ajustes", response_model=AjusteOut, status_code=201)
def registrar_ajuste(
    payload: AjusteCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "junior", "coordinacion")),
):
    """Corregir el stock de un insumo a mano (merma, rotura, conteo físico,
    stock encontrado sin registrar)."""
    if payload.tipo not in ("entrada", "salida"):
        raise HTTPException(status_code=400, detail="El tipo debe ser 'entrada' o 'salida'.")
    if payload.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0.")
    if not payload.motivo.strip():
        raise HTTPException(status_code=400, detail="Indicá el motivo del ajuste.")

    insumo = db.query(Insumo).filter(Insumo.id == payload.insumo_id).first()
    if insumo is None:
        raise HTTPException(status_code=404, detail="Accesorio no encontrado.")

    ajuste = AjusteInventario(
        insumo_id=payload.insumo_id,
        tipo=payload.tipo,
        cantidad=payload.cantidad,
        motivo=payload.motivo.strip(),
        registrado_por=payload.registrado_por,
    )
    db.add(ajuste)
    if payload.tipo == "entrada":
        insumo.stock_actual = (insumo.stock_actual or 0) + payload.cantidad
    else:
        insumo.stock_actual = (insumo.stock_actual or 0) - payload.cantidad
    db.commit()
    db.refresh(ajuste)

    if payload.tipo == "salida":
        nivel = calcular_nivel(insumo.stock_actual, insumo.stock_minimo, insumo.punto_reorden)
        if nivel == "critico":
            notificar_bioingenieria(
                "Stock crítico",
                (
                    f"Stock crítico de '{insumo.nombre}': quedan {insumo.stock_actual}, "
                    f"el mínimo es {insumo.stock_minimo}. Reponer con urgencia.\n\n"
                    f"Ajuste manual: -{payload.cantidad} unidad(es). Motivo: {payload.motivo}\n"
                ),
            )
    return ajuste


@router.get("/movimientos", response_model=list[MovimientoOut])
def listar_movimientos(
    insumo_id: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Historial de TODO lo que mueve stock: compras ya recibidas, consumos
    en OT y ajustes manuales, ordenado del más reciente al más viejo."""
    movimientos = []

    compras_q = db.query(Compra).filter(Compra.estado == "recibida")
    if insumo_id is not None:
        compras_q = compras_q.filter(Compra.insumo_id == insumo_id)
    for c in compras_q.all():
        movimientos.append(MovimientoOut(
            id=c.id,
            origen="compra",
            sentido="entrada",
            insumo_id=c.insumo_id,
            cantidad=c.cantidad,
            fecha=datetime.combine(c.fecha_recepcion, datetime.min.time()) if c.fecha_recepcion else None,
            referencia=c.proveedor or c.numero_orden,
        ))

    consumos_q = db.query(ConsumoInsumo)
    if insumo_id is not None:
        consumos_q = consumos_q.filter(ConsumoInsumo.insumo_id == insumo_id)
    ots_por_id = {o.id: o for o in db.query(OrdenTrabajo).all()}
    for co in consumos_q.all():
        ot = ots_por_id.get(co.ot_id)
        referencia = f"OT #{ot.numero_ot} · {ot.activo_codigo}" if ot else None
        movimientos.append(MovimientoOut(
            id=co.id,
            origen="consumo",
            sentido="salida",
            insumo_id=co.insumo_id,
            cantidad=co.cantidad,
            fecha=co.fecha,
            referencia=referencia,
        ))

    ajustes_q = db.query(AjusteInventario)
    if insumo_id is not None:
        ajustes_q = ajustes_q.filter(AjusteInventario.insumo_id == insumo_id)
    for a in ajustes_q.all():
        movimientos.append(MovimientoOut(
            id=a.id,
            origen="ajuste",
            sentido=a.tipo,
            insumo_id=a.insumo_id,
            cantidad=a.cantidad,
            fecha=a.fecha,
            referencia=a.motivo,
        ))

    movimientos.sort(key=lambda m: m.fecha or datetime.min, reverse=True)
    return movimientos[:limit]