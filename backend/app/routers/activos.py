"""Endpoints de activos (equipos médicos)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import re
from sqlalchemy import or_

from ..database import get_db
from ..models import Activo, Usuario, GrupoTipoEquipo, GrupoTecnico, Usuario, TipoEquipo, Servicio, PlantillaMP
from ..schemas import (
    ActivoOut,
    ActivoDetalle,
    ActivoCreate,
    TipoEquipoCreate,
    TipoEquipoOut,
    ServicioCreate,
    ServicioOut,
)
from ..security import get_current_user, requiere_rol

router = APIRouter(prefix="/activos", tags=["activos"])


@router.get("", response_model=list[ActivoOut])
def listar_activos(
    buscar: str | None = None,
    estado: str | None = None,
    tipo_equipo_id: str | None = None,
    sector_id: str | None = None,
    grupo_id: str | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Listar activos con búsqueda y filtros opcionales, combinables.

    - buscar: texto libre sobre código, descripción, marca, modelo y número de
      serie. Acepta el código con espacios (B TERA MOMU 001) o con guiones,
      porque las etiquetas del hospital usan espacios y la base guarda guiones.
    - estado / tipo_equipo_id / sector_id / grupo_id: filtros exactos.
    """
    q = db.query(Activo)

    if buscar:
        texto = buscar.strip()
        # Para el código normalizamos igual que el frontend: espacios a guiones
        # y mayúsculas. Para el resto de los campos buscamos el texto tal cual.
        como_codigo = re.sub(r"[\s-]+", "-", texto.upper()).strip("-")
        patron = f"%{texto}%"
        q = q.filter(
            or_(
                Activo.codigo.ilike(f"%{como_codigo}%"),
                Activo.descripcion.ilike(patron),
                Activo.marca.ilike(patron),
                Activo.modelo.ilike(patron),
                Activo.numero_serie.ilike(patron),
            )
        )

    if estado:
        q = q.filter(Activo.estado.ilike(estado))
    if tipo_equipo_id:
        q = q.filter(Activo.tipo_equipo_id == tipo_equipo_id)
    if sector_id:
        q = q.filter(Activo.sector_id == sector_id)
    if grupo_id:
        q = q.filter(Activo.grupo_id == grupo_id)

    # Ordenado por código: es el identificador que se usa para ubicar un
    # equipo puntual (QR, etiqueta física), así que conviene que la lista
    # quede en ese orden en vez de por nombre.
    return q.order_by(Activo.codigo).limit(limit).all()

@router.get("/filtros")
def opciones_de_filtro(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Opciones para los desplegables de la pantalla de activos.

    Devolvemos solo los valores que EXISTEN en los activos cargados, no los
    catálogos completos: un filtro que ofrece "Hemodinamia" y devuelve cero
    resultados hace dudar de que el sistema funcione.
    """
    tipos_usados = {a.tipo_equipo_id for a in db.query(Activo.tipo_equipo_id).all()}
    sectores_usados = {a.sector_id for a in db.query(Activo.sector_id).all()}
    estados = sorted({
        (a.estado or "").strip() for a in db.query(Activo.estado).all() if a.estado
    })

    tipos = [
        {"id": t.id, "nombre": t.nombre}
        for t in db.query(TipoEquipo).order_by(TipoEquipo.nombre).all()
        if t.id in tipos_usados
    ]
    sectores = [
        {"id": s.id, "nombre": s.nombre}
        for s in db.query(Servicio).order_by(Servicio.nombre).all()
        if s.id in sectores_usados
    ]
    grupos = [
        {"nombre": f"{g.id} — {g.descripcion}"}
        for g in db.query(GrupoTecnico).order_by(GrupoTecnico.id).all()
    ]

    return {"tipos": tipos, "sectores": sectores, "grupos": grupos, "estados": estados}


@router.get("/catalogos")
def catalogos_para_alta(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Catálogos COMPLETOS de tipos de equipo y servicios, para el formulario
    de 'nuevo activo'.

    A diferencia de /filtros (que solo devuelve lo que YA está en uso, para no
    ofrecer filtros que dan cero resultados), acá hace falta la lista entera:
    un tipo de equipo que todavía no tiene ningún activo cargado tiene que
    poder elegirse igual al dar de alta el primero.
    """
    tipos = [
        {"id": t.id, "nombre": t.nombre, "descripcion": t.descripcion}
        for t in db.query(TipoEquipo).order_by(TipoEquipo.nombre).all()
    ]
    sectores = [
        {"id": s.id, "nombre": s.nombre, "centro_costos": s.centro_costos, "descripcion": s.descripcion}
        for s in db.query(Servicio).order_by(Servicio.nombre).all()
    ]
    return {"tipos": tipos, "sectores": sectores}


@router.post("/tipos-equipo", response_model=TipoEquipoOut, status_code=201)
def crear_tipo_equipo(
    payload: TipoEquipoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("coordinacion")),
):
    """Dar de alta un tipo de equipo nuevo en el catálogo (ej: llegó un robot
    quirúrgico y todavía no había un tipo para eso). Lo hace coordinación
    (jefatura también, por requiere_rol), para no depender de tocar la base a
    mano cada vez que aparece un tipo de equipo nuevo en el hospital.
    """
    if db.query(TipoEquipo).filter(TipoEquipo.id == payload.id).first():
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe un tipo de equipo con el código {payload.id}.",
        )
    tipo = TipoEquipo(id=payload.id, nombre=payload.nombre, descripcion=payload.descripcion)
    db.add(tipo)
    db.commit()
    db.refresh(tipo)
    return tipo


@router.post("/servicios", response_model=ServicioOut, status_code=201)
def crear_servicio(
    payload: ServicioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("coordinacion")),
):
    """Dar de alta un servicio/área nueva del hospital en el catálogo (mismo
    caso que crear_tipo_equipo, pero para servicios)."""
    if db.query(Servicio).filter(Servicio.id == payload.id).first():
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe un servicio con el código {payload.id}.",
        )
    servicio = Servicio(
        id=payload.id,
        nombre=payload.nombre,
        centro_costos=payload.centro_costos,
        descripcion=payload.descripcion,
    )
    db.add(servicio)
    db.commit()
    db.refresh(servicio)
    return servicio


@router.post("", response_model=ActivoOut, status_code=201)
def crear_activo(
    payload: ActivoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(requiere_rol("coordinacion", "tecnico", "junior")),
):
    """Dar de alta un equipo nuevo.

    El código lo arma el backend (no lo manda el frontend): B-<area>-<tipo de
    equipo>-<número>. El área es la que eligió la persona (ActivoCreate.area);
    el número es el siguiente correlativo PARA ESE TIPO DE EQUIPO, contando en
    todo el hospital sin importar el área — así el próximo desfibrilador sigue
    la numeración de los desfibriladores, no la del área donde va a estar.

    La descripción tampoco la escribe la persona: queda igual al nombre del
    tipo de equipo elegido (ej. tipo "Monitor multiparamétrico" → descripción
    "Monitor multiparamétrico"). Antes era un texto libre y terminaba siendo
    casi lo mismo pero escrito distinto en cada alta.

    Si vino crear_mantenimiento=True, además:
      1. Busca el plan de mantenimiento (checklist) de este tipo de equipo (o
         el genérico, si no hay uno específico para el tipo).
      2. Usa el mes que eligió la persona (payload.proxima_fecha_mp) como la
         fecha de la primera orden — no se calcula sola a partir de la fecha
         de instalación. La OT siempre se abre el día 1 de ese mes.
      3. Guarda la frecuencia en el activo: es lo que usa /preventivas/generar
         para reprogramar el ciclo siguiente cada vez que dispara la OT.
    """
    tipo = db.query(TipoEquipo).filter(TipoEquipo.id == payload.tipo_equipo_id).first()
    if tipo is None:
        raise HTTPException(status_code=404, detail="El tipo de equipo no existe.")
    sector = db.query(Servicio).filter(Servicio.id == payload.sector_id).first()
    if sector is None:
        raise HTTPException(status_code=404, detail="El servicio/sector no existe.")

    # 1. Número correlativo para este tipo de equipo (el máximo actual + 1).
    #    Se busca por tipo_equipo_id (la columna), no adivinando el número
    #    dentro del texto del código de otros equipos con formatos viejos.
    maximo = 0
    for a in db.query(Activo.codigo).filter(Activo.tipo_equipo_id == payload.tipo_equipo_id).all():
        sufijo = a.codigo.rsplit("-", 1)[-1]
        if sufijo.isdigit():
            maximo = max(maximo, int(sufijo))
    numero = maximo + 1
    codigo = f"B-{payload.area}-{payload.tipo_equipo_id}-{numero:03d}"

    # Por las dudas (formato manual antiguo que pisara el que armamos ahora).
    if db.query(Activo).filter(Activo.codigo == codigo).first():
        raise HTTPException(
            status_code=409,
            detail=f"El código {codigo} ya existe. Probá de nuevo (puede haberse creado otro equipo del mismo tipo justo ahora).",
        )

    # 2. Grupo técnico: se deduce del tipo de equipo, igual que en el resto
    #    del sistema (no lo elige la persona a mano).
    rel_grupo = db.query(GrupoTipoEquipo).filter(
        GrupoTipoEquipo.tipo_equipo_id == payload.tipo_equipo_id
    ).first()
    grupo_id = rel_grupo.grupo_id if rel_grupo else None

    # 3. Mantenimiento preventivo (opcional).
    plantilla_mp_id = None
    proxima_fecha_mp = None
    frecuencia_mp_meses = None
    if payload.crear_mantenimiento:
        if not payload.frecuencia_meses or payload.frecuencia_meses <= 0:
            raise HTTPException(
                status_code=400,
                detail="Indicá cada cuántos meses se repite el mantenimiento.",
            )
        if not payload.proxima_fecha_mp:
            raise HTTPException(
                status_code=400,
                detail="Indicá en qué mes debería abrirse la primera orden de este mantenimiento.",
            )
        plan = db.query(PlantillaMP).filter(
            PlantillaMP.tipo_equipo_id == payload.tipo_equipo_id
        ).first()
        if plan is None:
            plan = db.query(PlantillaMP).filter(PlantillaMP.es_generica == True).first()  # noqa: E712
        if plan is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    "No hay un checklist de mantenimiento para este tipo de equipo "
                    "ni uno genérico. Pedile a coordinación que cargue un plan antes "
                    "de programarle el mantenimiento a este equipo."
                ),
            )
        plantilla_mp_id = plan.id
        # El validador del schema ya normalizó el día a 1; el .replace de acá
        # es solo un resguardo por si algún día se llama a este endpoint sin
        # pasar por el schema (ej. un script).
        proxima_fecha_mp = payload.proxima_fecha_mp.replace(day=1)
        frecuencia_mp_meses = payload.frecuencia_meses

    activo = Activo(
        codigo=codigo,
        codigo_qr=payload.codigo_qr,
        tipo_equipo_id=payload.tipo_equipo_id,
        sector_id=payload.sector_id,
        grupo_id=grupo_id,
        descripcion=tipo.nombre,
        ubicacion=payload.ubicacion,
        marca=payload.marca,
        modelo=payload.modelo,
        numero_serie=payload.numero_serie,
        numero_orden_compra=payload.numero_orden_compra,
        fecha_instalacion=payload.fecha_instalacion,
        estado=payload.estado,
        criticidad=payload.criticidad,
        plantilla_mp_id=plantilla_mp_id,
        proxima_fecha_mp=proxima_fecha_mp,
        frecuencia_mp_meses=frecuencia_mp_meses,
    )
    db.add(activo)
    db.commit()
    db.refresh(activo)
    return activo


@router.get("/{codigo}", response_model=ActivoOut)
def ver_activo(codigo: str, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """Ver un activo puntual por su código (ej: B-ANES-AGME-001)."""
    activo = db.query(Activo).filter(Activo.codigo == codigo).first()
    if activo is None:
        raise HTTPException(status_code=404, detail="Activo no encontrado")
    return activo

@router.get("/{codigo}/detalle", response_model=ActivoDetalle)
def ver_activo_detalle(codigo: str, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """Ficha completa del activo: sus datos + órdenes, fallas y mantenimientos."""
    activo = db.query(Activo).filter(Activo.codigo == codigo).first()
    if activo is None:
        raise HTTPException(status_code=404, detail="Activo no encontrado")
    
    # Cadena para llegar al responsable: activo → tipo de equipo → grupo →
    # coordinador del grupo. Es la misma que usa solicitudes para el ruteo.
    detalle = ActivoDetalle.model_validate(activo)

    rel = db.query(GrupoTipoEquipo).filter(
        GrupoTipoEquipo.tipo_equipo_id == activo.tipo_equipo_id
    ).first()
    if rel:
        grupo = db.query(GrupoTecnico).filter(GrupoTecnico.id == rel.grupo_id).first()
        if grupo and grupo.coordinador_id:
            responsable = db.query(Usuario).filter(
                Usuario.id == grupo.coordinador_id
            ).first()
            if responsable:
                detalle.responsable_nombre = f"{responsable.nombre} {responsable.apellido}"
                detalle.responsable_email = responsable.email

    return detalle
    
    return activo