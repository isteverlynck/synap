"""Endpoints de órdenes de trabajo (OT) — el corazón operativo del sistema.

Una OT puede ser correctiva (por una falla) o preventiva. Se abre, se asigna a
un técnico, se sigue y se cierra. Siempre pertenece a un activo (activo_codigo).

Flujo de fechas (según el uso real del hospital):
  - fecha_notificacion: cuando el servicio avisa del problema (opcional; a veces
    se conoce, a veces no).
  - fecha_apertura: cuando bioingeniería abre la OT. La pone el backend al crear.
  - fecha_cierre: cuando se cierra. Se completa al cerrar la OT (otro endpoint).

Todos los endpoints están protegidos con login (get_current_user).
"""

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session

from ..database import get_db
from ..fechas import hoy_argentina
from ..models import OrdenTrabajo, NotaOT, Usuario, MantenimientoPreventivo, Activo
from ..notificaciones import notificar_bioingenieria
from ..schemas import (
    OrdenTrabajoOut,
    OrdenTrabajoAsignar,
    OrdenTrabajoCambioEstado,
    OrdenTrabajoCierre,
    OrdenTrabajoAutorizar,
    OrdenTrabajoDevolver,
    OrdenTrabajoCorrectivaCreate,
    OrdenTrabajoUpdate,
    NotaOTOut,
    NotaOTCrear,
)
from ..security import get_current_user, requiere_rol, grupos_del_coordinador, requiere_rol_estricto, validar_a_cargo_de_preventiva
from ..criticidad import agregar_criticidad_a_ordenes

router = APIRouter(prefix="/ordenes-trabajo", tags=["ordenes_de_trabajo"])

_TZ_ARGENTINA = ZoneInfo("America/Argentina/Buenos_Aires")


def filtrar_por_fecha_notificacion(q, desde: date | None, hasta: date | None):
    """Recorta una consulta de OT a las notificadas entre dos días (inclusive).

    Lo usan el listado, "Mis órdenes" y el CSV de órdenes, para que los tres
    entiendan igual el filtro "Notificada desde / hasta".

    - La fecha de notificación se guarda en UTC; los días que elige la persona
      son días de Argentina. Por eso se convierte el límite de cada día a UTC:
      una falla avisada a las 22 hs de Argentina ya es "mañana" en UTC, y sin
      esta conversión caería en el día equivocado.
    - Las OT que no tienen fecha de notificación (típicamente las preventivas,
      que las genera el sistema solo) cuentan con su fecha de apertura, mismo
      criterio que usa el dashboard.
    - "hasta" es inclusive: pedir hasta el 10/10 trae también lo del 10/10.
    """
    if desde is None and hasta is None:
        return q
    if desde is not None and hasta is not None and desde > hasta:
        raise HTTPException(
            status_code=400,
            detail="La fecha \"desde\" no puede ser posterior a la fecha \"hasta\".",
        )
    fecha = func.coalesce(OrdenTrabajo.fecha_notificacion, OrdenTrabajo.fecha_apertura)
    if desde is not None:
        inicio = datetime.combine(desde, time.min, tzinfo=_TZ_ARGENTINA)
        q = q.filter(fecha >= inicio.astimezone(timezone.utc).replace(tzinfo=None))
    if hasta is not None:
        fin = datetime.combine(hasta + timedelta(days=1), time.min, tzinfo=_TZ_ARGENTINA)
        q = q.filter(fecha < fin.astimezone(timezone.utc).replace(tzinfo=None))
    return q


def _validar_permiso_sobre_ot(current_user: Usuario, db: Session, orden: OrdenTrabajo) -> None:
    """Mismo criterio que en el resto de las acciones sobre una OT (bitácora,
    reasignar, correctiva asociada): técnico/junior de su propio grupo, o
    coordinación de los grupos que coordina.

    Jefatura no entra en ninguna de las dos condiciones de abajo, así que esta
    función la deja pasar sin recortar nada — correcto en los endpoints de
    LECTURA (ve todas las OT, sin excepción) pero irrelevante en los de
    ESCRITURA: esos usan requiere_rol_estricto en el Depends, que corta a
    jefatura antes de llegar hasta acá (confirmado con Cami, 03/10: jefatura
    ve las OT pero no las opera).
    """
    if current_user.rol in ("tecnico", "junior") and current_user.grupo != orden.grupo_id:
        raise HTTPException(
            status_code=403,
            detail="Solo podés hacer esto en órdenes de tu propio grupo.",
        )
    if current_user.rol == "coordinacion" and orden.grupo_id not in grupos_del_coordinador(db, current_user):
        raise HTTPException(
            status_code=403,
            detail="Solo podés hacer esto en órdenes de los grupos que coordinás.",
        )


# ═══════════════════════════════════════════════════════════════════════════
# LECTURA (GET) — funcionando
# ═══════════════════════════════════════════════════════════════════════════

# @router.get("", response_model=list[OrdenTrabajoOut])
# def listar_ordenes(
#     estado: str | None = None,
#     tipo: str | None = None,
#     activo_codigo: str | None = None,
#     limit: int = 50,
#     db: Session = Depends(get_db),
#     current_user: Usuario = Depends(get_current_user),
# ):
#     """Listar OTs (hasta 'limit'), con filtros opcionales.

#     Los filtros son opcionales: si no mandás ninguno, trae las últimas 'limit'.
#     Se pueden combinar (ej: estado='ABIERTA' + tipo='correctiva').
#       - estado: ABIERTA / EN_PROGRESO / CERRADA
#       - tipo: correctiva / preventiva
#       - activo_codigo: todas las OT de un equipo puntual
#     """
#     q = db.query(OrdenTrabajo)
#     if estado is not None:
#         q = q.filter(OrdenTrabajo.estado == estado)
#     if tipo is not None:
#         q = q.filter(OrdenTrabajo.tipo == tipo)
#     if activo_codigo is not None:
#         q = q.filter(OrdenTrabajo.activo_codigo == activo_codigo)
#     return q.limit(limit).all()

@router.get("", response_model=list[OrdenTrabajoOut])
def listar_ordenes(
    estado: str | None = None,
    tipo: str | None = None,
    activo_codigo: str | None = None,
    grupo_id: str | None = None,
    sin_asignar: bool | None = None,
    mis_grupos: bool = False,
    notificada_desde: date | None = None,
    notificada_hasta: date | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "junior", "coordinacion")),
):
    """Listar OTs (hasta 'limit'), con filtros opcionales y combinables.

      - estado: ABIERTA / EN_PROGRESO / CERRADA
      - tipo: CORRECTIVA / PREVENTIVA
      - activo_codigo: todas las OT de un equipo puntual
      - grupo_id: las de un grupo técnico puntual
      - sin_asignar=true: solo las que todavía no tienen técnico. Es la bandeja
        de pendientes del coordinador después de aceptar solicitudes.
      - mis_grupos=true: las de los grupos que coordina el usuario logueado
        (jefatura las ve todas, no filtra).
      - notificada_desde / notificada_hasta (AAAA-MM-DD): las notificadas en
        ese rango de días, ambos extremos incluidos (ver
        filtrar_por_fecha_notificacion).
    """
    q = db.query(OrdenTrabajo)

    # estado y tipo se guardan en mayúsculas: normalizamos lo que llega para
    # que 'abierta' y 'ABIERTA' funcionen igual.
    if estado is not None:
        q = q.filter(OrdenTrabajo.estado == estado.upper())
    if tipo is not None:
        q = q.filter(OrdenTrabajo.tipo == tipo.upper())
    if activo_codigo is not None:
        q = q.filter(OrdenTrabajo.activo_codigo == activo_codigo)
    if grupo_id is not None:
        q = q.filter(OrdenTrabajo.grupo_id == grupo_id)

    # sin_asignar=true → sin técnico; false → solo las ya asignadas.
    if sin_asignar is True:
        q = q.filter(OrdenTrabajo.tecnico_id.is_(None))
    elif sin_asignar is False:
        q = q.filter(OrdenTrabajo.tecnico_id.isnot(None))

    if mis_grupos and current_user.rol != "jefatura":
        q = q.filter(OrdenTrabajo.grupo_id.in_(grupos_del_coordinador(db, current_user)))

    q = filtrar_por_fecha_notificacion(q, notificada_desde, notificada_hasta)

    # Orden fijo: las más nuevas primero. Sin esto la lista puede cambiar de
    # orden entre recargas y confunde al usuario.
    return q.order_by(OrdenTrabajo.fecha_apertura.desc().nullslast()).limit(limit).all()


@router.get("/mias", response_model=list[OrdenTrabajoOut])
def mis_ordenes(
    estado: str | None = None,
    tipo: str | None = None,
    notificada_desde: date | None = None,
    notificada_hasta: date | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Las OT que le tocan al técnico logueado ("Mis OT asignadas"): las que
    tiene asignadas a su nombre, MÁS las de su propio grupo que todavía no
    tienen un técnico puntual — esas últimas son del grupo entero, no de una
    persona en concreto.

    Esto es clave para las preventivas: se generan automáticamente para el
    GRUPO que atiende el equipo (ver preventivas.py), sin asignarle un
    técnico puntual a ninguna — así que sin este agregado, una preventiva
    recién generada no le aparecía a NADIE en "Mis órdenes" hasta que alguien
    la asignara a mano desde otro lado. Con esto, cualquier persona del grupo
    la ve y la puede tomar (el botón de asignar ya lo permite: cualquier
    técnico del mismo grupo se puede autoasignar una OT sin técnico).

    Filtros opcionales:
      - tipo: CORRECTIVA / PREVENTIVA (para separar las secciones del panel del
        técnico: "OT asignadas" vs "OT preventivas").
      - estado: ABIERTA / EN_PROGRESO / CERRADA.
      - notificada_desde / notificada_hasta (AAAA-MM-DD): rango de días en que
        se notificó la OT, ambos extremos incluidos.
    """
    q = db.query(OrdenTrabajo).filter(
        or_(
            OrdenTrabajo.tecnico_id == current_user.id,
            and_(
                OrdenTrabajo.tecnico_id.is_(None),
                OrdenTrabajo.grupo_id == current_user.grupo,
            ),
        )
    )
    if estado is not None:
        q = q.filter(OrdenTrabajo.estado == estado)
    if tipo is not None:
        q = q.filter(OrdenTrabajo.tipo == tipo.upper())
    q = filtrar_por_fecha_notificacion(q, notificada_desde, notificada_hasta)
    return q.order_by(OrdenTrabajo.fecha_apertura.desc()).all()


@router.get("/{ot_id}", response_model=OrdenTrabajoOut)
def ver_orden(
    ot_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "junior", "coordinacion")),
):
    """Ver una OT puntual por su id (el uuid de la orden).

    Enfermería no entra: sigue el servicio por sus solicitudes. Jefatura SÍ
    entra (pedido de Cami, 03/10: recuperar la pestaña de Órdenes que tenía
    antes) pero en modo lectura — ve el detalle completo (notas, adjuntos,
    checklist) pero ninguna acción de la pantalla le va a aparecer, porque
    todas están condicionadas a esMiOrden/esDeMiGrupo/esCoordinacion/
    puedeAsignar, que para jefatura son siempre false. El backend es quien
    de verdad lo impide: todos los endpoints que escriben sobre una OT usan
    requiere_rol_estricto, sin la excepción de jefatura.
    """
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    _validar_permiso_sobre_ot(current_user, db, orden)
    agregar_criticidad_a_ordenes(db, [orden])
    return orden
# ═══════════════════════════════════════════════════════════════════════════
# EDICIÓN (PATCH) — corregir descripción, prioridad y/o equipo de una OT
# que todavía no está cerrada (pedido de Cami)
# ═══════════════════════════════════════════════════════════════════════════

@router.patch("/{ot_id}", response_model=OrdenTrabajoOut)
def editar_orden(
    ot_id: str,
    payload: OrdenTrabajoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol_estricto("tecnico", "junior", "coordinacion")),
):
    """Editar una OT que todavía no está cerrada.

    Mismo permiso que el resto de las acciones sobre una OT
    (_validar_permiso_sobre_ot): técnico/junior de su propio grupo, o
    coordinación de los grupos que coordina. Sin excepción de jefatura
    (requiere_rol_estricto): puede ver cualquier OT, pero no editarla.

    Es un PATCH parcial (exclude_unset): solo se tocan los campos que vengan
    en el pedido. Ver el docstring de OrdenTrabajoUpdate en schemas.py para
    el detalle de qué significa reasignar el equipo.
    """
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    if orden.estado == "CERRADA":
        raise HTTPException(
            status_code=400,
            detail="Esta orden ya está cerrada: no se puede editar.",
        )

    _validar_permiso_sobre_ot(current_user, db, orden)

    datos = payload.model_dump(exclude_unset=True)

    # Clasificación de la falla (técnica / de usuario): decide si la falla
    # cuenta en los KPIs del dashboard, así que solo la corrige coordinación
    # (un técnico podría, sin querer o queriendo, sacar sus propias fallas de
    # las estadísticas) y solo tiene sentido en correctivas.
    if "origen_falla" in datos:
        if current_user.rol != "coordinacion":
            raise HTTPException(
                status_code=403,
                detail="Solo coordinación puede cambiar la clasificación de la falla.",
            )
        if orden.tipo != "CORRECTIVA":
            raise HTTPException(
                status_code=400,
                detail="Solo las órdenes correctivas tienen clasificación de falla.",
            )

    # Reasignar el equipo: recalculamos el grupo a partir del nuevo activo
    # (mismo criterio que al crear una OT) y, si el técnico ya asignado no
    # pertenece a ese grupo nuevo, lo desasignamos — mismo invariante que ya
    # exige asignar_tecnico (nadie queda con una OT de un grupo que no es
    # el suyo).
    if "activo_codigo" in datos and datos["activo_codigo"] != orden.activo_codigo:
        nuevo_activo = db.query(Activo).filter(Activo.codigo == datos["activo_codigo"]).first()
        if nuevo_activo is None:
            raise HTTPException(status_code=404, detail="El equipo elegido no existe.")
        orden.activo_codigo = nuevo_activo.codigo
        orden.grupo_id = nuevo_activo.grupo_id
        if orden.tecnico_id is not None:
            tecnico = db.query(Usuario).filter(Usuario.id == orden.tecnico_id).first()
            if tecnico is None or tecnico.grupo != orden.grupo_id:
                orden.tecnico_id = None
        datos.pop("activo_codigo")

    if "prioridad" in datos:
        datos["prioridad"] = datos["prioridad"].upper() if datos["prioridad"] else None

    if "descripcion" in datos:
        descripcion = (datos["descripcion"] or "").strip()
        datos["descripcion"] = descripcion or None

    for campo, valor in datos.items():
        setattr(orden, campo, valor)

    db.commit()
    db.refresh(orden)
    return orden


# ═══════════════════════════════════════════════════════════════════════════
# ASIGNACIÓN (PATCH) — asignar el técnico de una OT "sin asignar"
# ═══════════════════════════════════════════════════════════════════════════

@router.patch("/{ot_id}/asignar", response_model=OrdenTrabajoOut)
def asignar_tecnico(
    ot_id: str,
    payload: OrdenTrabajoAsignar,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol_estricto("coordinacion", "tecnico", "junior")),
):
    """Asignar (o reasignar) el técnico de una OT.

    Lo puede hacer el coordinador (sobre cualquiera de sus OT), o cualquier
    técnico del MISMO grupo de la orden — así el grupo se reparte el trabajo
    entre ellos sin depender de que el coordinador haga cada pase a mano. El
    destino siempre tiene que ser alguien de ese mismo grupo (eso ya se
    validaba); ahora también se valida quién puede iniciar el pase.
    """
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")

    # Un técnico (o junior) solo puede reasignar OT de su propio grupo, nunca
    # las de otro. El coordinador puede sobre cualquiera (no restringimos acá
    # a "sus" grupos, igual que ya era el comportamiento de este endpoint).
    if current_user.rol in ("tecnico", "junior") and current_user.grupo != orden.grupo_id:
        raise HTTPException(
            status_code=403,
            detail="Solo podés reasignar órdenes de tu propio grupo.",
        )

    tecnico = db.query(Usuario).filter(Usuario.id == payload.tecnico_id).first()
    if tecnico is None:
        raise HTTPException(status_code=404, detail="La persona a asignar no existe.")
    if orden.grupo_id and tecnico.grupo != orden.grupo_id:
        raise HTTPException(
            status_code=400,
            detail=f"La persona no pertenece al grupo {orden.grupo_id}.",
        )

    orden.tecnico_id = payload.tecnico_id
    db.commit()
    db.refresh(orden)
    return orden


# ═══════════════════════════════════════════════════════════════════════════
# SEGUIMIENTO (PATCH) — cambiar el estado de una OT
# ═══════════════════════════════════════════════════════════════════════════

ESTADOS_VALIDOS = {"ABIERTA", "EN_PROGRESO", "PENDIENTE_CIERRE", "CERRADA"}


@router.patch("/{ot_id}/estado", response_model=OrdenTrabajoOut)
def cambiar_estado(
    ot_id: str,
    payload: OrdenTrabajoCambioEstado,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol_estricto("tecnico", "coordinacion")),
):
    """Cambiar el estado de una OT (parte del 'seguimiento').

    Ej: pasar de ABIERTA a EN_PROGRESO cuando el técnico empieza a trabajar.
    Para CERRAR conviene usar /cerrar (que además pone la fecha de cierre).
    """
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")

    nuevo = payload.estado.upper()
    if nuevo not in ESTADOS_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Estado inválido. Valores: {', '.join(sorted(ESTADOS_VALIDOS))}.",
        )

    orden.estado = nuevo
    if nuevo == "EN_PROGRESO" and orden.iniciada_por is None:
        orden.iniciada_por = current_user.id
    # Si se cierra por esta vía, igual completamos la fecha de cierre.
    if nuevo == "CERRADA" and orden.fecha_cierre is None:
        orden.fecha_cierre = datetime.utcnow()
        _cerrar_parada_si_quedo_abierta(orden, orden.fecha_cierre)

    db.commit()
    db.refresh(orden)
    return orden


# ═══════════════════════════════════════════════════════════════════════════
# CIERRE (PATCH) — cerrar una OT y registrar la fecha de cierre
# ═══════════════════════════════════════════════════════════════════════════

def _cerrar_parada_si_quedo_abierta(orden: OrdenTrabajo, hasta: datetime) -> None:
    """Si la OT se cierra con una parada corriendo (se olvidaron de apretar
    "Finalizar parada"), la cerramos acá mismo — así el acumulado de tiempo
    parado siempre queda completo, nunca colgado a mitad de camino."""
    if orden.parada_iniciada_en is None:
        return
    transcurrido = (hasta - orden.parada_iniciada_en).total_seconds()
    orden.tiempo_parada_segundos += max(0, int(transcurrido))
    orden.parada_iniciada_en = None


@router.patch("/{ot_id}/cerrar", response_model=OrdenTrabajoOut)
def cerrar_orden(
    ot_id: str,
    payload: OrdenTrabajoCierre,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol_estricto("tecnico", "coordinacion")),
):
    """Cerrar una OT CORRECTIVA: la marca como CERRADA y le pone la fecha de
    cierre (ahora). Con esto quedan completas las 3 fechas (notificacion ->
    apertura -> cierre). Si quedaba una parada del equipo corriendo, se cierra
    sola acá (ver _cerrar_parada_si_quedo_abierta) para que el tiempo de
    parada no quede incompleto.

    Las PREVENTIVAS ya no se cierran por acá: el técnico las completa
    (/completar) y coordinación autoriza el cierre (/autorizar-cierre) o las
    devuelve (/devolver). Ver esa sección más abajo.
    """
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")

    if orden.tipo == "PREVENTIVA":
        raise HTTPException(
            status_code=400,
            detail="Las preventivas no se cierran directo: primero se completan y coordinación autoriza el cierre.",
        )

    if orden.estado == "CERRADA":
        raise HTTPException(status_code=400, detail="Esta OT ya está cerrada.")

    validar_a_cargo_de_preventiva(current_user, orden)
    # Nadie cierra OT de otro grupo (mismo chequeo que ya usan las paradas).
    _validar_permiso_sobre_ot(current_user, db, orden)

    # Correctiva: un técnico solo cierra las que tiene asignadas.
    if (
        orden.tipo == "CORRECTIVA"
        and current_user.rol == "tecnico"
        and orden.tecnico_id != current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="Solo podés cerrar las órdenes que tenés asignadas.",
        )

    ahora = datetime.utcnow()

    orden.estado = "CERRADA"
    orden.fecha_cierre = ahora
    orden.cerrado_por = current_user.id
    _cerrar_parada_si_quedo_abierta(orden, orden.fecha_cierre)
    # si mandan observaciones del cierre, las sumamos (sin pisar las que hubiera)
    if payload.observaciones:
        if orden.observaciones:
            orden.observaciones = orden.observaciones + " | Cierre: " + payload.observaciones
        else:
            orden.observaciones = payload.observaciones

    db.commit()
    db.refresh(orden)
    return orden
# ═══════════════════════════════════════════════════════════════════════════
# COMPLETAR / AUTORIZAR CIERRE / DEVOLVER — circuito de cierre de preventivas
# ═══════════════════════════════════════════════════════════════════════════
# Dinámica real del hospital: el técnico completa el checklist y aprieta
# "Completar orden de trabajo" — la OT NO se cierra todavía, queda
# PENDIENTE_CIERRE. Coordinación es quien revisa esa OT completada y o bien
# autoriza el cierre (ahí sí queda CERRADA, con fecha_cierre y cerrado_por),
# o la devuelve al técnico con un motivo (vuelve a EN_PROGRESO) si encuentra
# algo mal. Solo aplica a preventivas — las correctivas se siguen cerrando
# directo por /cerrar.
# ═══════════════════════════════════════════════════════════════════════════

@router.patch("/{ot_id}/completar", response_model=OrdenTrabajoOut)
def completar_orden(
    ot_id: str,
    payload: OrdenTrabajoCierre,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol_estricto("tecnico", "coordinacion")),
):
    """El técnico termina de trabajar una preventiva: registra qué se hizo y
    la deja PENDIENTE_CIERRE, a la espera de que coordinación la autorice.

    Acá se resuelve el desvío del MP (mismo criterio que antes tenía el
    cierre directo): si se completa fuera del mes programado, hace falta
    justificación. También se cierra sola una parada que hubiera quedado
    corriendo, porque en la práctica el trabajo ya terminó.
    """
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")

    if orden.tipo != "PREVENTIVA":
        raise HTTPException(
            status_code=400,
            detail="Completar (a la espera de autorización) solo aplica a órdenes preventivas.",
        )
    if orden.estado != "EN_PROGRESO":
        raise HTTPException(
            status_code=400,
            detail="Esta orden no está en progreso: no se puede completar.",
        )

    validar_a_cargo_de_preventiva(current_user, orden)
    _validar_permiso_sobre_ot(current_user, db, orden)

    ahora = datetime.utcnow()
    # Para decidir "¿se completó en el mes en que se programó?" usamos la hora
    # de Argentina, no UTC: cerca de la medianoche, UTC puede estar ya en el
    # día/mes siguiente mientras en Argentina todavía no (UTC-3). Eso hacía
    # que el backend a veces considerara "fuera de mes" (y pidiera motivo de
    # retraso) cuando en Argentina todavía era el mes programado — el bug que
    # reportó Cami: el frontend, con la hora local correcta, no mostraba el
    # campo de motivo porque no esperaba que hiciera falta. Ver
    # fechas.hoy_argentina(). ahora (UTC) se sigue usando para los timestamps
    # de abajo (fecha_completada, duración de la parada): ahí lo que importa
    # es comparar entre sí timestamps absolutos, no el día calendario.
    hoy = hoy_argentina()

    # Si tiene MP enganchado, resolvemos el desvío ANTES de tocar nada más:
    # si hace falta justificación y no vino, cortamos acá con el 400 sin
    # haber marcado nada.
    mp = db.query(MantenimientoPreventivo).filter(
        MantenimientoPreventivo.ot_id == orden.id
    ).first()
    if mp is not None:
        a_tiempo = (hoy.year, hoy.month) == (mp.fecha_programada.year, mp.fecha_programada.month)
        if not a_tiempo and not (payload.justificacion_retraso and payload.justificacion_retraso.strip()):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Esta orden se está completando fuera del mes en que se programó "
                    f"({mp.fecha_programada.strftime('%m/%Y')}). Contá el motivo del "
                    "retraso para poder completarla."
                ),
            )
        mp.fecha_realizada = hoy.date()
        mp.estado = "REALIZADO"
        mp.justificacion_retraso = payload.justificacion_retraso.strip() if not a_tiempo else None

    if orden.activo is not None:
        orden.activo.ultima_fecha_mp = hoy.date()

    orden.estado = "PENDIENTE_CIERRE"
    orden.completada_por = current_user.id
    orden.fecha_completada = ahora
    _cerrar_parada_si_quedo_abierta(orden, ahora)
    if payload.observaciones:
        if orden.observaciones:
            orden.observaciones = orden.observaciones + " | Cierre: " + payload.observaciones
        else:
            orden.observaciones = payload.observaciones

    db.commit()
    db.refresh(orden)
    return orden


@router.patch("/{ot_id}/autorizar-cierre", response_model=OrdenTrabajoOut)
def autorizar_cierre(
    ot_id: str,
    payload: OrdenTrabajoAutorizar,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol_estricto("coordinacion")),
):
    """Coordinación autoriza el cierre de una preventiva ya completada por
    el técnico: recién acá queda CERRADA de verdad, con fecha_cierre y
    cerrado_por."""
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")

    if orden.tipo != "PREVENTIVA":
        raise HTTPException(status_code=400, detail="Autorizar cierre solo aplica a órdenes preventivas.")
    if orden.estado != "PENDIENTE_CIERRE":
        raise HTTPException(
            status_code=400,
            detail="Esta orden no está pendiente de cierre: no hay nada para autorizar.",
        )
    # Solo coordinación de ESE grupo (requiere_rol_estricto en el Depends ya
    # deja afuera a jefatura, así que acá no hace falta chequearla aparte).
    _validar_permiso_sobre_ot(current_user, db, orden)

    ahora = datetime.utcnow()
    orden.estado = "CERRADA"
    orden.fecha_cierre = ahora
    orden.cerrado_por = current_user.id
    if payload.comentario and payload.comentario.strip():
        comentario = payload.comentario.strip()
        if orden.observaciones:
            orden.observaciones = orden.observaciones + " | Autorización: " + comentario
        else:
            orden.observaciones = comentario

    db.commit()
    db.refresh(orden)
    return orden


@router.patch("/{ot_id}/devolver", response_model=OrdenTrabajoOut)
def devolver_orden(
    ot_id: str,
    payload: OrdenTrabajoDevolver,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol_estricto("coordinacion")),
):
    """Coordinación devuelve al técnico una preventiva completada, en vez de
    autorizar el cierre (ej: falta un dato, el checklist quedó mal cargado).

    Vuelve a EN_PROGRESO y el motivo queda como entrada de la bitácora, para
    que el técnico lo vea apenas entra a la OT — no hace falta un campo
    aparte, la bitácora ya está pensada justo para esto."""
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")

    if orden.tipo != "PREVENTIVA":
        raise HTTPException(status_code=400, detail="Devolver solo aplica a órdenes preventivas.")
    if orden.estado != "PENDIENTE_CIERRE":
        raise HTTPException(
            status_code=400,
            detail="Esta orden no está pendiente de cierre: no hay nada para devolver.",
        )
    _validar_permiso_sobre_ot(current_user, db, orden)

    motivo = payload.motivo.strip()
    if not motivo:
        raise HTTPException(status_code=400, detail="Contá el motivo por el que devolvés la orden.")

    orden.estado = "EN_PROGRESO"
    orden.completada_por = None
    orden.fecha_completada = None

    nota = NotaOT(
        ot_id=orden.id,
        autor_id=current_user.id,
        texto="Coordinación devolvió la orden para corregir: " + motivo,
    )
    db.add(nota)

    db.commit()
    db.refresh(orden)
    return orden
# ═══════════════════════════════════════════════════════════════════════════
# TIEMPO DE PARADA — medido a mano, no calculado a partir de otras fechas
# ═══════════════════════════════════════════════════════════════════════════

@router.patch("/{ot_id}/iniciar-parada", response_model=OrdenTrabajoOut)
def iniciar_parada(
    ot_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol_estricto("tecnico", "junior", "coordinacion")),
):
    """Marca que el equipo ACABA de quedar fuera de servicio, a partir de
    ahora mismo. Es el arranque real del tiempo de parada — no se calcula
    solo, lo dispara quien está con el equipo.
    """
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    if orden.estado == "CERRADA":
        raise HTTPException(status_code=400, detail="Esta OT ya está cerrada.")
    _validar_permiso_sobre_ot(current_user, db, orden)
    validar_a_cargo_de_preventiva(current_user, orden)
    if orden.parada_iniciada_en is not None:
        raise HTTPException(status_code=400, detail="Ya hay una parada en curso para esta orden.")

    orden.parada_iniciada_en = datetime.utcnow()
    db.commit()
    db.refresh(orden)
    return orden


@router.patch("/{ot_id}/finalizar-parada", response_model=OrdenTrabajoOut)
def finalizar_parada(
    ot_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol_estricto("tecnico", "junior", "coordinacion")),
):
    """Marca que el equipo VOLVIÓ a estar en servicio. Suma el tiempo que
    duró esta parada al acumulado total de la OT (tiempo_parada_segundos).
    """
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    _validar_permiso_sobre_ot(current_user, db, orden)
    validar_a_cargo_de_preventiva(current_user, orden)
    if orden.parada_iniciada_en is None:
        raise HTTPException(status_code=400, detail="No hay ninguna parada en curso para esta orden.")

    transcurrido = (datetime.utcnow() - orden.parada_iniciada_en).total_seconds()
    orden.tiempo_parada_segundos += max(0, int(transcurrido))
    orden.parada_iniciada_en = None
    db.commit()
    db.refresh(orden)
    return orden


# ═══════════════════════════════════════════════════════════════════════════
# CORRECTIVA ASOCIADA — cuando durante un preventivo se encuentra algo roto
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/{ot_id}/correctiva", response_model=OrdenTrabajoOut, status_code=201)
def crear_correctiva_asociada(
    ot_id: str,
    payload: OrdenTrabajoCorrectivaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol_estricto("tecnico", "junior", "coordinacion")),
):
    """Abrir una OT correctiva a partir de una preventiva.

    Durante un mantenimiento programado se puede encontrar que algo no
    funciona: esto abre una correctiva aparte (sin mezclarla con la bitácora
    de la preventiva) pero dejando el rastro de por qué se generó
    (ot_origen_id apunta a la preventiva). Nace en el mismo equipo y grupo que
    la preventiva, sin técnico asignado — se asigna después, como cualquier
    otra OT nueva.
    """
    origen = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if origen is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    if origen.tipo != "PREVENTIVA":
        raise HTTPException(
            status_code=400,
            detail="Solo se puede generar una correctiva asociada desde una OT preventiva.",
        )

    if current_user.rol in ("tecnico", "junior") and current_user.grupo != origen.grupo_id:
        raise HTTPException(
            status_code=403,
            detail="Solo podés generar correctivas de OT de tu propio grupo.",
        )
    if current_user.rol == "coordinacion" and origen.grupo_id not in grupos_del_coordinador(db, current_user):
        raise HTTPException(
            status_code=403,
            detail="Solo podés generar correctivas de OT de los grupos que coordinás.",
        )
    
    validar_a_cargo_de_preventiva(current_user, origen)
    descripcion = payload.descripcion.strip()
    if not descripcion:
        raise HTTPException(status_code=400, detail="Contá qué se encontró para generar la correctiva.")

    ultimo = db.query(func.max(OrdenTrabajo.numero_ot)).scalar()
    numero_ot = (ultimo or 0) + 1

    correctiva = OrdenTrabajo(
        numero_ot=numero_ot,
        activo_codigo=origen.activo_codigo,
        tipo="CORRECTIVA",
        estado="ABIERTA",
        prioridad=(payload.prioridad.upper() if payload.prioridad else None),
        descripcion=descripcion,
        grupo_id=origen.grupo_id,
        ot_origen_id=origen.id,
        fecha_apertura=datetime.utcnow(),
    )
    db.add(correctiva)
    db.commit()
    db.refresh(correctiva)

    # Avisar a bioingeniería que se abrió una OT correctiva (uno de los 3
    # disparadores de notificación automática). Si el mail falla, no rompe
    # la creación de la correctiva: enviar_mail ya loguea el error y sigue.
    notificar_bioingenieria(
        "OT correctiva creada",
        (
            f"Se abrió la OT correctiva #{numero_ot}, generada durante el "
            f"mantenimiento preventivo (OT #{origen.numero_ot}).\n\n"
            f"Equipo: {origen.activo_codigo}\n"
            f"Descripción: {descripcion}\n\n"
            f"Grupo asignado: {origen.grupo_id}\n"
        ),
    )
    return correctiva


@router.get("/{ot_id}/correctivas", response_model=list[OrdenTrabajoOut])
def listar_correctivas_asociadas(
    ot_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Las OT correctivas que se generaron a partir de esta preventiva."""
    return (
        db.query(OrdenTrabajo)
        .filter(OrdenTrabajo.ot_origen_id == ot_id)
        .order_by(OrdenTrabajo.fecha_apertura)
        .all()
    )


# ═══════════════════════════════════════════════════════════════════════════
# BITÁCORA — el registro de lo que se va haciendo mientras la OT está abierta
# ═══════════════════════════════════════════════════════════════════════════
# A diferencia de 'observaciones' (un solo texto que se completa al cerrar),
# acá se van sumando entradas con fecha y quién las escribió, mientras la OT
# está en curso. Es lo que permite que, si más de una persona del grupo toca
# la misma orden, quede un historial real de todo lo que se hizo.
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/{ot_id}/notas", response_model=list[NotaOTOut])
def listar_notas(
    ot_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """La bitácora de una OT, de la entrada más vieja a la más nueva (se lee
    como una historia, de arriba hacia abajo)."""
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    return (
        db.query(NotaOT)
        .filter(NotaOT.ot_id == ot_id)
        .order_by(NotaOT.created_at)
        .all()
    )


@router.post("/{ot_id}/notas", response_model=NotaOTOut, status_code=201)
def agregar_nota(
    ot_id: str,
    payload: NotaOTCrear,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol_estricto("tecnico", "junior", "coordinacion")),
):
    """Sumar una entrada a la bitácora: qué se hizo, se encontró o se necesita.

    Puede escribir cualquiera de la OT: el técnico asignado, cualquier técnico
    del grupo (por si otro compañero también le puso mano), o el coordinador
    del grupo. No se puede agregar en una OT ya cerrada — en ese punto lo que
    queda es el resumen final en 'observaciones' del cierre.
    """
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    if orden.estado == "CERRADA":
        raise HTTPException(status_code=400, detail="Esta OT ya está cerrada.")

    if current_user.rol in ("tecnico", "junior") and current_user.grupo != orden.grupo_id:
        raise HTTPException(
            status_code=403,
            detail="Solo podés agregar notas en órdenes de tu propio grupo.",
        )
    if current_user.rol == "coordinacion" and orden.grupo_id not in grupos_del_coordinador(db, current_user):
        raise HTTPException(
            status_code=403,
            detail="Solo podés agregar notas en órdenes de los grupos que coordinás.",
        )

    texto = payload.texto.strip()
    if not texto:
        raise HTTPException(status_code=400, detail="Escribí algo para guardar en la bitácora.")

    nota = NotaOT(ot_id=ot_id, autor_id=current_user.id, texto=texto)
    db.add(nota)
    db.commit()
    db.refresh(nota)
    return nota

# ═══════════════════════════════════════════════════════════════════════════
# ADJUNTOS — los archivos de la solicitud que originó esta OT
# ═══════════════════════════════════════════════════════════════════════════
# Los sube enfermería al crear la solicitud; acá los ve cualquiera que tenga
# acceso a la OT (mismo permiso que para abrir su detalle).
# ═══════════════════════════════════════════════════════════════════════════

from urllib.parse import quote

from fastapi.responses import Response
from sqlalchemy.orm import defer

from ..models import AdjuntoSolicitud, SolicitudServicio
from ..schemas import AdjuntoOut


@router.get("/{ot_id}/adjuntos", response_model=list[AdjuntoOut])
def listar_adjuntos(
    ot_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "coordinacion")),
):
    """Nombres de los archivos adjuntos (sin el archivo en sí)."""
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    _validar_permiso_sobre_ot(current_user, db, orden)

    return (
        db.query(AdjuntoSolicitud)
        # defer: no traer el archivo en sí, que puede pesar varios MB y para
        # la lista solo hace falta el nombre.
        .options(defer(AdjuntoSolicitud.contenido))
        .join(SolicitudServicio, SolicitudServicio.id == AdjuntoSolicitud.solicitud_id)
        .filter(SolicitudServicio.ot_id == orden.id)
        .order_by(AdjuntoSolicitud.created_at)
        .all()
    )


@router.get("/{ot_id}/adjuntos/{adjunto_id}")
def ver_adjunto(
    ot_id: str,
    adjunto_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "coordinacion")),
):
    """Devuelve el archivo en sí, para abrirlo o descargarlo."""
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    _validar_permiso_sobre_ot(current_user, db, orden)

    # El adjunto tiene que ser de la solicitud de ESTA OT (no de cualquier otra).
    adjunto = (
        db.query(AdjuntoSolicitud)
        .join(SolicitudServicio, SolicitudServicio.id == AdjuntoSolicitud.solicitud_id)
        .filter(AdjuntoSolicitud.id == adjunto_id, SolicitudServicio.ot_id == orden.id)
        .first()
    )
    if adjunto is None:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

    return Response(
        content=adjunto.contenido,
        media_type=adjunto.tipo_mime,
        # inline: que el navegador lo abra (foto o PDF) en vez de forzar la descarga.
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(adjunto.nombre_archivo)}"},
    )


# ═══════════════════════════════════════════════════════════════════════════
# INFORME EN PDF — solo para preventivas ya CERRADAS
# ═══════════════════════════════════════════════════════════════════════════
# Junta en una hoja los datos del equipo, los de la orden (fechas, quién la
# inició, quién la cerró) y el resultado de cada punto del checklist. La
# armamos siempre al vuelo (no se guarda en ningún lado): si algo del
# checklist se corrige después de cerrada, el próximo PDF que se pida ya
# sale actualizado.
# ═══════════════════════════════════════════════════════════════════════════

from ..models import ChecklistItem, ChecklistRespuesta, Servicio, TipoEquipo
from ..informes import generar_informe_preventiva_pdf


@router.get("/{ot_id}/informe-pdf")
def informe_pdf(
    ot_id: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("tecnico", "junior", "coordinacion")),
):
    """Descargar el informe en PDF de una preventiva ya cerrada."""
    orden = db.query(OrdenTrabajo).filter(OrdenTrabajo.id == ot_id).first()
    if orden is None:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    _validar_permiso_sobre_ot(current_user, db, orden)

    if orden.tipo != "PREVENTIVA":
        raise HTTPException(
            status_code=400,
            detail="El informe en PDF solo está disponible para órdenes preventivas.",
        )
    if orden.estado != "CERRADA":
        raise HTTPException(
            status_code=400,
            detail="El informe se genera cuando la orden ya está cerrada.",
        )

    activo = db.query(Activo).filter(Activo.codigo == orden.activo_codigo).first()
    tipo_equipo = (
        db.query(TipoEquipo).filter(TipoEquipo.id == activo.tipo_equipo_id).first()
        if activo else None
    )
    sector = (
        db.query(Servicio).filter(Servicio.id == activo.sector_id).first()
        if activo else None
    )

    mp = db.query(MantenimientoPreventivo).filter(MantenimientoPreventivo.ot_id == orden.id).first()
    respuestas = []
    if mp is not None:
        respuestas = (
            db.query(ChecklistRespuesta, ChecklistItem)
            .join(ChecklistItem, ChecklistItem.id == ChecklistRespuesta.checklist_item_id)
            .filter(ChecklistRespuesta.mp_id == mp.id)
            .order_by(ChecklistItem.orden)
            .all()
        )

    pdf_bytes = generar_informe_preventiva_pdf(
        orden=orden,
        activo=activo,
        mp=mp,
        respuestas=respuestas,
        tipo_equipo_nombre=tipo_equipo.nombre if tipo_equipo else None,
        sector_nombre=sector.nombre if sector else None,
    )

    nombre_archivo = f"Informe_OT-{str(orden.numero_ot).zfill(4)}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        # attachment (no inline, a diferencia de los adjuntos de arriba): esto
        # es un informe que se genera al vuelo, tiene sentido que se descargue
        # derecho en vez de intentar mostrarlo en la misma pestaña.
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(nombre_archivo)}"},
    )