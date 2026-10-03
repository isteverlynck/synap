import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { logout, rolActual } from "../api/auth";
import { verActivoDetalle, catalogosParaAlta, editarActivo, descargarInformeActivo } from "../api/activos";
import { listarSiglas, listarUbicaciones } from "../api/catalogos";
import Encabezado from "../componentes/Encabezado";
import CodigoConGlosario from "../componentes/CodigoConGlosario";
import { armarDiccionarioSiglas } from "../utiles/codigos";
import { color, cs, boton, insignia, estadoDelEquipo, tonoRiesgo } from "../tema";
import VentanaRiesgo from "../componentes/VentanaRiesgo";
import { Info, Pencil, FileDown } from "lucide-react";
import Volver from "../componentes/Volver";
import { diasHasta, parsearFecha, formatearFechaOT } from "../utiles/fechas";
import { programarSegunPlan, verCriticidad } from "../api/activos";
import { toast } from "sonner";

// Mismas opciones que en el alta (NuevoActivo.jsx) — se repiten acá porque
// ese archivo no las exporta, y son 4 líneas, no vale la pena acoplar los
// dos archivos por esto.
const ESTADOS = [
  { valor: "ACTIVO", texto: "Activo / operativo" },
  { valor: "EN_REPARACION", texto: "En reparación" },
  { valor: "DE_BAJA", texto: "De baja" },
  { valor: "FUERA_DE_SERVICIO", texto: "Fuera de servicio" },
];

// Roles que pueden editar la ficha de un equipo (pedido de Cami: que
// coordinación, jefatura Y técnico puedan corregir los datos de un equipo,
// no solo darlo de alta). Enfermería queda afuera, como en el resto del
// sistema.
const PUEDE_EDITAR = ["tecnico", "junior", "coordinacion", "jefatura"];

function FichaActivo() {
  const { codigo } = useParams();
  const navegar = useNavigate();
  const rol = rolActual();
  const [activo, setActivo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [programando, setProgramando] = useState(false);
  const [avisoRestringido, setAvisoRestringido] = useState(false);
  const [diccionarioSiglas, setDiccionarioSiglas] = useState({});
  const [diccionarioUbicaciones, setDiccionarioUbicaciones] = useState({});
  const [criticidad, setCriticidad] = useState(null);
  const [verCalculo, setVerCalculo] = useState(false);
  const [descargandoInforme, setDescargandoInforme] = useState(false);

  async function descargarReporte() {
    if (descargandoInforme) return;
    setDescargandoInforme(true);
    try {
      await descargarInformeActivo(codigo);
    } catch (e) {
      toast.error("No pudimos generar el informe. Probá de nuevo.");
    } finally {
      setDescargandoInforme(false);
    }
  }

  // ─── Edición de la ficha ───
  const [modoEdicion, setModoEdicion] = useState(false);
  const [catalogos, setCatalogos] = useState({ tipos: [], sectores: [] });
  const [ubicacionesCatalogo, setUbicacionesCatalogo] = useState([]);

  async function programarMP() {
    if (programando) return;
    setProgramando(true);
    try {
      const actualizado = await programarSegunPlan(activo.codigo);
      setActivo({ ...activo, frecuencia_mp_meses: actualizado.frecuencia_mp_meses });
      toast.success(`Queda programado cada ${actualizado.frecuencia_mp_meses} meses.`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "No pudimos programarlo.");
    } finally {
      setProgramando(false);
    }
  }

  useEffect(() => {
    setCargando(true);
    setError("");
    verActivoDetalle(codigo)
      .then(setActivo)
      .catch(() => setError(`No encontramos el equipo "${codigo}".`))
      .finally(() => setCargando(false));
  }, [codigo]);

  // Glosario para el cartelito del código/ubicación al pasar el mouse, y de
  // paso los catálogos de tipo de equipo/servicio para el formulario de
  // edición — no bloquean la carga de la ficha si fallan, son un extra.
  useEffect(() => {
    Promise.all([listarSiglas(), catalogosParaAlta()])
      .then(([siglas, cat]) => {
        setDiccionarioSiglas(armarDiccionarioSiglas(siglas, cat.tipos));
        setCatalogos(cat);
      })
      .catch(() => {});
  }, []);

  // Código de ubicación exacto → descripción completa (catálogo relevado del
  // hospital), prioritaria sobre el glosario de siglas en el cartelito de
  // "Ubicación" — ver CodigoConGlosario.jsx. La lista completa también sirve
  // para el buscador de ubicación del formulario de edición.
  useEffect(() => {
    listarUbicaciones()
      .then((ubicaciones) => {
        setUbicacionesCatalogo(ubicaciones);
        setDiccionarioUbicaciones(Object.fromEntries(ubicaciones.map((u) => [u.codigo, u.descripcion])));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    verCriticidad(codigo).then(setCriticidad).catch(() => setCriticidad(null));
  }, [codigo]);

  function cerrarSesion() {
    logout();
    navegar("/");
  }

  if (cargando) {
    return (
      <div style={cs.pagina}>
        <div style={cs.contenido}><p style={estilos.mensaje}>Cargando ficha del equipo...</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={cs.pagina}>
        <div style={cs.contenido}>
          <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>
          <button style={boton("secundario")} onClick={() => navegar("/escanear")}>
            Escanear de nuevo
          </button>
        </div>
      </div>
    );
  }

  // Todo lo del cartel de estado sale de una sola función (ver tema.js): qué
  // color, qué dice, y qué acción ofrecer.
  const situacion = estadoDelEquipo(activo);
  const abiertas = activo.ordenes_de_trabajo.filter((ot) => ot.estado !== "CERRADA");
  const cerradas = activo.ordenes_de_trabajo.filter((ot) => ot.estado === "CERRADA");
  // Mismo criterio que en Acciones: jefatura y enfermería no entran al detalle
  // de una OT, así que para ellas el historial no es clickeable.
  const veOrdenes = rol === "tecnico" || rol === "junior" || rol === "coordinacion";
  const puedeEditar = PUEDE_EDITAR.includes(rol);

  function actualizarActivoEditado(nuevo) {
    // El backend devuelve la ficha "chica" (ActivoOut); la ficha completa
    // (ActivoDetalle) tiene además el historial, que no cambia al editar —
    // lo conservamos y solo pisamos los campos que sí pudieron cambiar.
    setActivo((antes) => ({ ...antes, ...nuevo }));
  }

  return (
    <div style={cs.pagina}>
      <div style={cs.contenido}>
        <Volver />
        <Encabezado titulo="Ficha del equipo">
          <button
            style={{ ...boton("secundario"), gap: 6 }}
            onClick={descargarReporte}
            disabled={descargandoInforme}
          >
            <FileDown size={15} strokeWidth={2} aria-hidden="true" />
            {descargandoInforme ? "Generando..." : "Descargar reporte"}
          </button>
        </Encabezado>

        {/* Aviso de estado: ancho completo y ANTES del nombre del equipo, para
        que alguien apurado en un pasillo lo vea sin leer. */}
        <AvisoEstado situacion={situacion} />

        <div style={estilos.filaTitulo}>
          <div>
            <h2 style={estilos.nombreEquipo}>{activo.descripcion}</h2>
            <p style={estilos.codigo}>
              <CodigoConGlosario codigo={activo.codigo} diccionario={diccionarioSiglas} />
            </p>
          </div>
          {puedeEditar && !modoEdicion && (
            <button
              style={{ ...boton("secundario"), gap: 6, flexShrink: 0 }}
              onClick={() => setModoEdicion(true)}
            >
              <Pencil size={14} strokeWidth={2.4} aria-hidden="true" />
              Editar ficha
            </button>
          )}
        </div>
                {rol === "coordinacion" && activo.proxima_fecha_mp && !activo.frecuencia_mp_meses && (
          <div style={{ ...cs.tarjeta, padding: "14px 18px", marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: "0.88rem", color: color.texto }}>
              Este equipo tiene mantenimiento programado pero no tiene definido cada
              cuánto se repite. Sin eso, la próxima fecha no avanza y el equipo
              queda vencido de forma permanente.
            </p>
            <button
              style={{ ...boton("primario"), marginTop: 12 }}
              onClick={programarMP}
              disabled={programando}
            >
              {programando ? "Programando..." : "Programar según su plan"}
            </button>
          </div>
        )}

        {modoEdicion ? (
          <EditarFicha
            activo={activo}
            catalogos={catalogos}
            ubicacionesCatalogo={ubicacionesCatalogo}
            diccionarioUbicaciones={diccionarioUbicaciones}
            onGuardado={(nuevo) => {
              actualizarActivoEditado(nuevo);
              setModoEdicion(false);
            }}
            onCancelar={() => setModoEdicion(false)}
          />
        ) : (
          <div style={estilos.tarjetaDatos}>
            <Dato etiqueta="Marca y modelo" valor={[activo.marca, activo.modelo].filter(Boolean).join(" ") || "—"} />
            <Dato
              etiqueta="Ubicación"
              valor={activo.ubicacion
                ? (
                  <CodigoConGlosario
                    codigo={activo.ubicacion}
                    diccionario={diccionarioSiglas}
                    descripcionExacta={diccionarioUbicaciones[activo.ubicacion]}
                  />
                )
                : "—"}
            />
            <Dato etiqueta="N° de serie" valor={activo.numero_serie || "—"} />
            <Dato etiqueta="Próximo preventivo" valor={textoProximoMP(activo.proxima_fecha_mp)} />
            {/* Vida útil y Criticidad/riesgo PRIUX: información interna de
            Bioingeniería, enfermería no la ve. Vida útil se calcula acá
            mismo según la antigüedad (criterio del Hospital Alemán) y no
            depende del PRIUX, a diferencia de Criticidad/Nivel de riesgo de
            abajo — por eso se muestra aunque el equipo no sea médico o no
            tenga datos PRIUX cargados (alcanza con la fecha de instalación). */}
            {rol !== "enfermeria" && (
              <Dato etiqueta="Vida útil" valor={<VidaUtil fechaInstalacion={activo.fecha_instalacion} />} />
            )}
            {rol !== "enfermeria" && criticidad && (
              <>
                <Dato etiqueta="Criticidad" valor={textoCriticidad(criticidad)} />
                <Dato
                  etiqueta="Nivel de riesgo"
                  valor={<NivelRiesgo datos={criticidad} alTocar={() => setVerCalculo(true)} />}
                />
              </>
            )}
          </div>
        )}

                {/* El responsable no es un dato más: es una acción. Cumple el objetivo
        de contacto directo con el bioingeniero. Es TODO el grupo a cargo del
        equipo, no una sola persona — cualquiera de ellos puede atender. */}
        {activo.responsables && activo.responsables.length > 0 && (
          <div style={estilos.responsable}>
            <div style={estilos.datoEtiqueta}>Bioingeniería responsable</div>
            {activo.responsables.map((r, i) => (
              <div key={i} style={estilos.filaResponsable}>
                <div style={estilos.datoValor}>{r.nombre}</div>
                {r.email && (
                  <a href={`mailto:${r.email}`} style={{ ...boton("secundario"), textDecoration: "none" }}>
                    Contactar
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        <Acciones
          rol={rol}
          situacion={situacion}
          activo={activo}
          navegar={navegar}
        />

        <Seccion titulo="Historial">
          {abiertas.map((ot) => (
            <ItemHistorial
              key={ot.id}
              titulo={`OT-${String(ot.numero_ot).padStart(4, "0")} · ${ot.tipo}`}
              detalle={`Abierta el ${formatearFechaOT(ot.fecha_apertura)}`}
              tono="advertencia"
              estado={ot.estado}
              onClick={veOrdenes ? () => (ot.puedo_abrir ? navegar(`/ordenes/${ot.id}`) : setAvisoRestringido(true)) : undefined}
            />
          ))}
          {cerradas.slice(0, 5).map((ot) => (
            <ItemHistorial
              key={ot.id}
              titulo={`OT-${String(ot.numero_ot).padStart(4, "0")} · ${ot.tipo}`}
              detalle={`Cerrada`}
              tono="neutro"
              estado={ot.estado}
              onClick={veOrdenes ? () => (ot.puedo_abrir ? navegar(`/ordenes/${ot.id}`) : setAvisoRestringido(true)) : undefined}
            />
          ))}
          {activo.mantenimientos.slice(0, 5).map((m) => (
            <ItemHistorial
              key={m.id}
              titulo="Mantenimiento preventivo"
              detalle={`Programado: ${formatearFecha(m.fecha_programada)}`}
              tono="neutro"
              estado={m.estado}
            />
          ))}
          {activo.ordenes_de_trabajo.length === 0 && activo.mantenimientos.length === 0 && (
            <p style={estilos.vacio}>Este equipo todavía no tiene historial registrado.</p>
          )}
        </Seccion>
      </div>

      {/* Ventanita que explica cómo se calculó el nivel de riesgo. */}
      {verCalculo && criticidad?.nivel && (
        <VentanaRiesgo datos={criticidad} alCerrar={() => setVerCalculo(false)} />
      )}
      {avisoRestringido && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(15, 23, 32, 0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, zIndex: 50,
          }}
          onClick={() => setAvisoRestringido(false)}
        >
          <div
            style={{ ...cs.tarjeta, padding: 22, width: "100%", maxWidth: 380 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: 0, fontWeight: 700, fontSize: "1rem", color: color.texto }}>
              Acceso restringido
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "0.88rem", color: color.textoSuave }}>
              Esta orden pertenece a otro grupo técnico. Podés ver que existe en el
              historial del equipo, pero no su detalle.
            </p>
            <button
              style={{ ...boton("primario"), marginTop: 16, width: "100%" }}
              onClick={() => setAvisoRestringido(false)}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Edición de la ficha
// ─────────────────────────────────────────────────────────────────────────

function EditarFicha({ activo, catalogos, ubicacionesCatalogo, diccionarioUbicaciones, onGuardado, onCancelar }) {
  const [tipoEquipoId, setTipoEquipoId] = useState(activo.tipo_equipo_id || "");
  const [sectorId, setSectorId] = useState(activo.sector_id || "");
  const [estado, setEstado] = useState(activo.estado || "ACTIVO");
  const [marca, setMarca] = useState(activo.marca || "");
  const [modelo, setModelo] = useState(activo.modelo || "");
  const [numeroSerie, setNumeroSerie] = useState(activo.numero_serie || "");
  const [numeroOrdenCompra, setNumeroOrdenCompra] = useState(activo.numero_orden_compra || "");
  const [codigoQr, setCodigoQr] = useState(activo.codigo_qr || "");
  const [fechaInstalacion, setFechaInstalacion] = useState(activo.fecha_instalacion || "");
  const [esEquipoMedico, setEsEquipoMedico] = useState(activo.es_equipo_medico !== false);
  const [sinBackup, setSinBackup] = useState(!!activo.sin_backup);
  const [frecuenciaMpMeses, setFrecuenciaMpMeses] = useState(
    activo.frecuencia_mp_meses != null ? String(activo.frecuencia_mp_meses) : ""
  );

  // Ubicación: mismo patrón de búsqueda que al dar de alta un equipo
  // (NuevoActivo.jsx). Arranca con la ubicación actual ya "elegida" (si
  // existe en el catálogo relevado; si no, se muestra igual con el código
  // que ya tenía cargado, para no perderlo si se guarda sin tocar el campo).
  const ubicacionActualEnCatalogo = activo.ubicacion
    ? ubicacionesCatalogo.find((u) => u.codigo === activo.ubicacion)
    : null;
  const [ubicacionElegida, setUbicacionElegida] = useState(
    activo.ubicacion
      ? ubicacionActualEnCatalogo || { codigo: activo.ubicacion, descripcion: diccionarioUbicaciones[activo.ubicacion] || "" }
      : null
  );
  const [ubicacionTexto, setUbicacionTexto] = useState("");

  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const textoBusquedaUbicacion = ubicacionTexto.trim().toLowerCase();
  const ubicacionesFiltradas = !ubicacionElegida && textoBusquedaUbicacion
    ? ubicacionesCatalogo
        .filter(
          (u) =>
            u.codigo.toLowerCase().includes(textoBusquedaUbicacion) ||
            u.descripcion.toLowerCase().includes(textoBusquedaUbicacion)
        )
        .slice(0, 30)
    : [];

  function elegirUbicacion(u) {
    setUbicacionElegida(u);
    setUbicacionTexto("");
  }

  function cambiarUbicacion() {
    setUbicacionElegida(null);
    setUbicacionTexto("");
  }
    // Solo se manda lo que realmente cambió respecto de la ficha actual — un
  // PATCH parcial de verdad, no todos los campos de nuevo cada vez.
  function armarCambios() {
    const cambios = {};
    if (tipoEquipoId !== activo.tipo_equipo_id) cambios.tipo_equipo_id = tipoEquipoId;
    if (sectorId !== activo.sector_id) cambios.sector_id = sectorId;
    if (estado !== activo.estado) cambios.estado = estado;
    const nuevaUbicacion = ubicacionElegida?.codigo || null;
    if (nuevaUbicacion !== (activo.ubicacion || null)) cambios.ubicacion = nuevaUbicacion;
    if (marca.trim() !== (activo.marca || "")) cambios.marca = marca.trim() || null;
    if (modelo.trim() !== (activo.modelo || "")) cambios.modelo = modelo.trim() || null;
    if (numeroSerie.trim() !== (activo.numero_serie || "")) cambios.numero_serie = numeroSerie.trim() || null;
    if (numeroOrdenCompra.trim() !== (activo.numero_orden_compra || "")) {
      cambios.numero_orden_compra = numeroOrdenCompra.trim() || null;
    }
    if (codigoQr.trim() !== (activo.codigo_qr || "")) cambios.codigo_qr = codigoQr.trim() || null;
    if (fechaInstalacion !== (activo.fecha_instalacion || "")) cambios.fecha_instalacion = fechaInstalacion || null;
    if (esEquipoMedico !== (activo.es_equipo_medico !== false)) cambios.es_equipo_medico = esEquipoMedico;
    const sinBackupEfectivo = esEquipoMedico ? sinBackup : false;
    if (sinBackupEfectivo !== !!activo.sin_backup) cambios.sin_backup = sinBackupEfectivo;
    const frecuenciaNueva = frecuenciaMpMeses.trim() ? Number(frecuenciaMpMeses) : null;
    if (frecuenciaNueva !== (activo.frecuencia_mp_meses ?? null)) cambios.frecuencia_mp_meses = frecuenciaNueva;
    return cambios;
  }

  function pedirConfirmacion() {
    setError("");
    if (!tipoEquipoId) return setError("Elegí el tipo de equipo.");
    if (!sectorId) return setError("Elegí el servicio/sector.");
    if (ubicacionTexto.trim() && !ubicacionElegida) {
      return setError("Elegí la ubicación de la lista, o borrá lo que escribiste si no aplica.");
    }
    const cambios = armarCambios();
    if (Object.keys(cambios).length === 0) {
      return setError("No cambiaste nada todavía.");
    }
    setConfirmando(true);
  }

  async function confirmarGuardado() {
    setGuardando(true);
    try {
      const actualizado = await editarActivo(activo.codigo, armarCambios());
      toast.success("Cambios guardados.");
      onGuardado(actualizado);
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudieron guardar los cambios.");
      setConfirmando(false);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={{ ...cs.tarjeta, padding: 20, marginBottom: 16 }}>
      <div style={estilosEdicion.grilla2}>
        <Campo etiqueta="Tipo de equipo">
          <select style={cs.input} value={tipoEquipoId} onChange={(e) => setTipoEquipoId(e.target.value)}>
            <option value="">Elegí un tipo</option>
            {catalogos.tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Servicio / sector">
          <select style={cs.input} value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
            <option value="">Elegí un servicio</option>
            {catalogos.sectores.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Estado">
          <select style={cs.input} value={estado} onChange={(e) => setEstado(e.target.value)}>
            {ESTADOS.map((e) => (
              <option key={e.valor} value={e.valor}>{e.texto}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Ubicación">
          {ubicacionElegida ? (
            <div style={estilosEdicion.ubicacionElegida}>
              <span>
                <strong>{ubicacionElegida.codigo}</strong>
                {ubicacionElegida.descripcion ? ` — ${ubicacionElegida.descripcion}` : ""}
              </span>
              <button type="button" style={estilosEdicion.linkCambiar} onClick={cambiarUbicacion}>
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <input
                style={cs.input}
                placeholder="Buscá por código o descripción, ej: UTI, quirófano"
                value={ubicacionTexto}
                onChange={(e) => setUbicacionTexto(e.target.value)}
              />
              {textoBusquedaUbicacion && ubicacionesFiltradas.length === 0 && (
                <p style={estilosEdicion.ayuda}>No encontramos ninguna ubicación con eso.</p>
              )}
              {ubicacionesFiltradas.length > 0 && (
                <div style={estilosEdicion.listaSugerencias}>
                  {ubicacionesFiltradas.map((u) => (
                    <div
                      key={u.codigo}
                      style={estilosEdicion.sugerencia}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        elegirUbicacion(u);
                      }}
                    >
                      <strong>{u.codigo}</strong> — {u.descripcion}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Campo>
        <Campo etiqueta="Marca">
          <input style={cs.input} value={marca} onChange={(e) => setMarca(e.target.value)} />
        </Campo>
        <Campo etiqueta="Modelo">
          <input style={cs.input} value={modelo} onChange={(e) => setModelo(e.target.value)} />
        </Campo>
        <Campo etiqueta="Número de serie">
          <input style={cs.input} value={numeroSerie} onChange={(e) => setNumeroSerie(e.target.value)} />
        </Campo>
        <Campo etiqueta="N° de orden de compra">
          <input style={cs.input} value={numeroOrdenCompra} onChange={(e) => setNumeroOrdenCompra(e.target.value)} />
        </Campo>
        <Campo etiqueta="Código QR">
          <input style={cs.input} value={codigoQr} onChange={(e) => setCodigoQr(e.target.value)} />
        </Campo>
        <Campo etiqueta="Fecha de instalación">
          <input type="date" style={cs.input} value={fechaInstalacion} onChange={(e) => setFechaInstalacion(e.target.value)} />
        </Campo>
        <Campo etiqueta="Frecuencia de MP (meses)" ayuda="Dejalo vacío si el equipo no tiene mantenimiento programado.">
          <input
            type="number"
            min="1"
            style={cs.input}
            value={frecuenciaMpMeses}
            onChange={(e) => setFrecuenciaMpMeses(e.target.value)}
          />
        </Campo>
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={estilosEdicion.checkboxFila}>
          <input type="checkbox" checked={esEquipoMedico} onChange={(e) => setEsEquipoMedico(e.target.checked)} />
          <span style={estilosEdicion.checkboxTexto}>Es equipo médico</span>
        </label>
        {esEquipoMedico && (
          <label style={{ ...estilosEdicion.checkboxFila, marginTop: 10 }}>
            <input type="checkbox" checked={sinBackup} onChange={(e) => setSinBackup(e.target.checked)} />
            <span style={estilosEdicion.checkboxTexto}>No tiene backup</span>
          </label>
        )}
      </div>

      {error && <p style={estilosEdicion.error}>{error}</p>}

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button style={boton("primario")} onClick={pedirConfirmacion} disabled={guardando}>
          Guardar cambios
        </button>
        <button style={boton("secundario")} onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
      </div>

      {confirmando && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(15, 23, 32, 0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, zIndex: 50,
          }}
          onClick={() => !guardando && setConfirmando(false)}
        >
          <div
            style={{ ...cs.tarjeta, padding: 22, width: "100%", maxWidth: 380 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: 0, fontWeight: 700, fontSize: "1rem", color: color.texto }}>
              ¿Confirmás que querés modificar este equipo?
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "0.88rem", color: color.textoSuave }}>
              Se van a guardar los cambios en la ficha de {activo.codigo}. Esto no se puede deshacer solo.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button style={boton("primario")} onClick={confirmarGuardado} disabled={guardando}>
                {guardando ? "Guardando..." : "Sí, guardar cambios"}
              </button>
              <button style={boton("secundario")} onClick={() => setConfirmando(false)} disabled={guardando}>
                Seguir editando
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ etiqueta, ayuda, children }) {
  return (
    <div>
      <label style={cs.label}>{etiqueta}</label>
      {children}
      {ayuda && <p style={estilosEdicion.ayuda}>{ayuda}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Aviso de estado
// ─────────────────────────────────────────────────────────────────────────

function AvisoEstado({ situacion }) {
  const fondos = {
    exito: color.exitoFondo,
    advertencia: color.advertenciaFondo,
    peligro: color.peligroFondo,
    neutro: color.bordeSuave,
  };
  const textos = {
    exito: color.exito,
    advertencia: color.advertencia,
    peligro: color.peligro,
    neutro: color.textoSuave,
  };

  // El de baja va más grande a propósito: no puede leerse igual que los otros.
  const esBaja = situacion.tono === "peligro";

  return (
    <div style={{ ...estilos.aviso, background: fondos[situacion.tono] }}>
      <div style={{
        ...estilos.avisoTitulo,
        color: textos[situacion.tono],
        fontSize: esBaja ? "1.1rem" : "0.98rem",
      }}>
        {situacion.titulo}
      </div>
      <div style={{ ...estilos.avisoDetalle, color: textos[situacion.tono] }}>
        {situacion.detalle}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Acciones según rol y estado
// ─────────────────────────────────────────────────────────────────────────

function Acciones({ rol, situacion, activo, navegar }) {
  const acciones = [];
  const veOrdenes = rol === "tecnico" || rol === "junior" || rol === "coordinacion";
  // La acción principal la manda el ESTADO, no el rol: si el equipo está de
  // baja o ya tiene una OT abierta, nadie reporta un problema nuevo. Así no se
  // juntan cinco solicitudes del mismo monitor el mismo día.
  if (situacion.accion === "reportar" && rol === "enfermeria") {
    acciones.push({
      texto: "Reportar un problema",
      variante: "primario",
      onClick: () => navegar(`/solicitudes?activo=${activo.codigo}`),
    });
  }
  if (situacion.accion === "ver_ot" && veOrdenes) {
    acciones.push({
      texto: "Ver estado de la reparación",
      variante: "secundario",
      onClick: () => navegar(`/ordenes/${situacion.otId}`),
    });
  }

  if (rol === "coordinacion" || rol === "jefatura") {
    acciones.push({ texto: "Ver plan de mantenimiento", variante: "secundario", onClick: () => navegar(`/mantenimientos?tipo=${activo.tipo_equipo_id}`) });
  }


  if (acciones.length === 0) return null;

  return (
    <div style={estilos.acciones}>
      {acciones.map((a) => (
        <button key={a.texto} style={{ ...boton(a.variante), flex: 1 }} onClick={a.onClick}>
          {a.texto}
        </button>
      ))}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────
// Piezas chicas
// ─────────────────────────────────────────────────────────────────────────

// Las fechas vienen del backend en UTC: las mostramos en formato local.
function formatearFecha(valor) {
  if (!valor) return "—";
  const f = parsearFecha(valor);
  if (isNaN(f)) return "—";
  return f.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

function textoProximoMP(fecha) {
  const base = formatearFecha(fecha);
  const dias = diasHasta(fecha);
  if (dias === null) return base;
  if (dias < 0) return `${base} · vencido hace ${Math.abs(dias)} días`;
  if (dias === 0) return `${base} · es hoy`;
  if (dias === 1) return `${base} · mañana`;
  return `${base} · en ${dias} días`;
}

// Los estados se guardan en mayúsculas y con guión bajo (así los espera el
// backend). Para mostrar, los pasamos a texto legible.
function textoEstado(estado) {
  const nombres = {
    ABIERTA: "Abierta",
    EN_PROGRESO: "En progreso",
    CERRADA: "Cerrada",
    PENDIENTE: "Pendiente",
    CUMPLIDO: "Cumplido",
  };
  return nombres[estado] || estado;
}

// ─────────────────────────────────────────────────────────────────────────
// Criticidad PRIUX
// ─────────────────────────────────────────────────────────────────────────

// Criticidad = función + riesgo clínico (de 2 a 10). No depende de la fecha
// de instalación, así que se muestra aunque falte el puntaje.
function textoCriticidad(datos) {
  if (!datos.evaluado) return "No aplica (no es equipo médico)";
  if (datos.criticidad == null) return "Sin dato";
  return `${datos.criticidad}/10`;
}

// Nivel de riesgo: la pastilla de color con el puntaje. Es un botón: al
// tocarla se abre la ventanita que explica el cálculo (VentanaRiesgo). Si no
// se pudo calcular, muestra por qué (ej. falta la fecha de instalación).
function NivelRiesgo({ datos, alTocar }) {
  if (!datos.evaluado) return "No aplica";
  if (!datos.nivel) {
    return <span style={{ color: color.textoSuave }}>Sin dato — {datos.motivo}</span>;
  }
  return (
    <button
      type="button"
      onClick={alTocar}
      title="Ver cómo se calcula"
      style={{
        ...insignia(tonoRiesgo(datos.nivel)),
        border: "none", cursor: "pointer", fontFamily: "inherit",
        display: "inline-flex", alignItems: "center", gap: 5,
      }}
    >
      {datos.nivel} - {datos.puntaje} pts
      <Info size={12} strokeWidth={2.4} aria-hidden="true" />
    </button>
  );
}

// Vida útil del equipo, SOLO según su antigüedad (criterio del Hospital
// Alemán, confirmado por Cami el 03/10 — mismos bordes que
// dashboard.py::_estado_vida_util, mantené los dos en sync si cambian):
//   menos de 5 años  → Moderno
//   de 5 a 10 años    → Aceptable
//   de 10 a 15 años   → Medianamente aceptable
//   más de 15 años    → Obsoleto
// A diferencia de Criticidad/Nivel de riesgo (que dependen del PRIUX y solo
// se calculan para equipos médicos con esos datos cargados), esto alcanza
// con la fecha de instalación y aplica a cualquier equipo.
function estadoVidaUtil(fechaInstalacion) {
  if (!fechaInstalacion) return null;
  const anios = (Date.now() - new Date(fechaInstalacion).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (anios < 5) return { texto: "Moderno", tono: "exito" };
  if (anios < 10) return { texto: "Aceptable", tono: "primario" };
  if (anios < 15) return { texto: "Medianamente aceptable", tono: "advertencia" };
  return { texto: "Obsoleto", tono: "peligro" };
}

function VidaUtil({ fechaInstalacion }) {
  const estado = estadoVidaUtil(fechaInstalacion);
  if (!estado) {
    return <span style={{ color: color.textoSuave }}>Sin dato — falta la fecha de instalación</span>;
  }
  return <span style={insignia(estado.tono)}>{estado.texto}</span>;
}

function Dato({ etiqueta, valor }) {
  return (
    <div>
      <div style={estilos.datoEtiqueta}>{etiqueta}</div>
      <div style={estilos.datoValor}>{valor}</div>
    </div>
  );
}

function Seccion({ titulo, children }) {
  return (
    <div style={{ marginTop: 26 }}>
      <h2 style={estilos.tituloSeccion}>{titulo}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function ItemHistorial({ titulo, detalle, tono, estado, onClick }) {
  return (
    <div
      style={onClick ? { ...estilos.item, cursor: "pointer" } : estilos.item}
      onClick={onClick}
      className={onClick ? "sy-clickeable" : undefined}
    >
      <div>
        <div style={{ color: color.texto, fontWeight: 500 }}>{titulo}</div>
        <div style={estilos.detalle}>{detalle}</div>
      </div>
      <span style={{ ...insignia(tono), marginLeft: "auto" }}>{textoEstado(estado)}</span>
    </div>
  );
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "20px 0" },
  aviso: { borderRadius: 12, padding: "14px 16px", marginBottom: 20 },
  avisoTitulo: { fontWeight: 700, marginBottom: 2 },
  avisoDetalle: { fontSize: "0.85rem" },
  filaTitulo: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  nombreEquipo: { margin: "0 0 2px", fontSize: "1.3rem", color: color.texto, fontWeight: 700 },
  codigo: { margin: 0, fontSize: "0.85rem", color: color.textoSuave, fontFamily: "ui-monospace, monospace" },
  tarjetaDatos: {
    ...cs.tarjeta,
    padding: 20,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 18,
  },
    responsable: {
    ...cs.tarjeta,
    padding: "14px 20px",
    marginTop: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  filaResponsable: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  acciones: { display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" },
  datoEtiqueta: { fontSize: "0.72rem", color: color.textoDebil, textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 4, fontWeight: 600 },
  datoValor: { color: color.texto, fontWeight: 500, fontSize: "0.95rem" },
  tituloSeccion: { fontSize: "1rem", color: color.texto, marginBottom: 10, fontWeight: 700 },
  item: { ...cs.tarjeta, padding: "12px 16px", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 12 },
  detalle: { color: color.textoSuave, fontSize: "0.82rem", marginTop: 2 },
  vacio: { color: color.textoSuave, fontSize: "0.9rem" },
};

const estilosEdicion = {
  grilla2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },
  ayuda: { fontSize: "0.78rem", color: color.textoDebil, margin: "6px 0 0" },
  error: { fontSize: "0.85rem", color: color.peligro, margin: "12px 0 0" },
  checkboxFila: { display: "flex", alignItems: "center", gap: 10, cursor: "pointer" },
  checkboxTexto: { fontSize: "0.92rem", color: color.texto, fontWeight: 600 },
  ubicacionElegida: {
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
    padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${color.borde}`, background: color.fondo,
  },
  linkCambiar: {
    border: "none", background: "none", color: color.primario, cursor: "pointer",
    fontSize: "0.85rem", fontWeight: 600, padding: 0, fontFamily: "inherit", flexShrink: 0,
  },
  listaSugerencias: {
    marginTop: 6, maxHeight: 220, overflowY: "auto", border: `1px solid ${color.borde}`,
    borderRadius: 10, background: color.tarjeta,
  },
  sugerencia: {
    padding: "10px 12px", cursor: "pointer", borderBottom: `1px solid ${color.bordeSuave}`, fontSize: "0.88rem", color: color.texto,
  },
};

export default FichaActivo;