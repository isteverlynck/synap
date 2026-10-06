// Ordenes.jsx — el listado de órdenes de trabajo.
//
// Una pantalla, tres recortes distintos según el rol:
//   técnico      → las asignadas a él, MÁS las de su propio grupo que todavía
//                  no tienen un técnico puntual (típicamente preventivas
//                  recién generadas: son del grupo entero, no de una persona)
//   coordinación → las de los grupos que coordina, con foco en las que
//                  todavía no tienen técnico
//   jefatura     → todas
//
// El filtro por estado es el mismo para los tres. Coordinación tiene uno más
// ("Sin asignar"), porque es su tarea propia: repartir el trabajo.
//
// Preventiva vs correctiva: son OT distintas en la práctica (una es una
// rutina programada, la otra una falla puntual), así que además del filtro
// por estado hay uno por tipo — y cada tarjeta de una preventiva lleva una
// etiqueta violeta + un borde de color para que se distinga de un vistazo,
// incluso mirando "Todas" mezcladas.
//
// Prioridad: un recorte más (baja / media / alta / crítica), pedido al backend
// igual que el estado y el tipo, y que también respeta el CSV.
//
// Fecha de notificación: dos casilleros "Desde" y "Hasta" (días de Argentina,
// los dos incluidos) que recortan la lista y también el CSV. Se piden al
// backend, no se filtran acá, para que valgan sobre TODAS las órdenes y no
// solo sobre las que ya se trajeron. Las OT sin fecha de notificación
// (típicamente las preventivas) cuentan con su fecha de apertura.
//
// Formato: igual que Activos y Accesorios — el buscador arriba con un botón
// "Filtros" que despliega (y esconde) los filtros de estado, tipo y fecha, y
// las flechas de página ("Anterior / Siguiente") arriba de la lista. La
// paginación es de a 50 sobre lo que ya se trajo del backend.
//
// Buscador: filtra, sobre lo que ya se trajo del backend, por número de OT o
// por código de equipo. El número de OT es flexible en el formato — "037",
// "37", "OT 37", "OT-037", etc. todos encuentran la OT-0037 — porque en el
// piso nadie se acuerda si va con guión, con espacio o con los ceros.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { misOrdenes, listarOrdenes } from "../api/ordenes";
import { tecnicosDisponibles } from "../api/coordinacion";
import { obtenerPerfil } from "../api/auth";
import { descargarCSV } from "../api/exportar";
import { agruparPorFecha, formatearFechaOT } from "../utiles/fechas";
import Encabezado from "../componentes/Encabezado";
import BarraFiltros, { GrupoFiltro } from "../componentes/BarraFiltros";
import Paginador from "../componentes/Paginador";
import { color, cs, insignia, boton } from "../tema";
import { AlertTriangle, CalendarClock, Download } from "lucide-react";

// ¿La OT coincide con lo que se escribió en el buscador? Dos formas de
// coincidir, cualquiera alcanza:
//   - Número de OT: se le saca el prefijo "OT" (si lo tiene) y cualquier
//     espacio o guión: lo que queda, si es puro número, se compara contra
//     numero_ot ignorando ceros a la izquierda.
//   - Código de equipo: substring, sin importar mayúsculas ni si los
//     espacios/guiones no coinciden exactamente con los del código real.
function coincideBusqueda(ot, textoBusqueda) {
  const texto = textoBusqueda.trim();
  if (!texto) return true;

  const soloDigitos = texto.replace(/^ot[\s-]*/i, "").replace(/[\s-]+/g, "");
  if (soloDigitos && /^\d+$/.test(soloDigitos) && Number(soloDigitos) === ot.numero_ot) {
    return true;
  }

  const comoCodigo = texto.toUpperCase().replace(/[\s-]+/g, "-").replace(/^-+|-+$/g, "");
  if (comoCodigo && ot.activo_codigo?.toUpperCase().includes(comoCodigo)) {
    return true;
  }

  return false;
}

// Los filtros de arriba. "sin_asignar" no es un estado real de la base: es un
// recorte (OT abiertas sin técnico), por eso se trata aparte.
const FILTROS_BASE = [
  { id: "", texto: "Todas" },
  { id: "ABIERTA", texto: "Abiertas" },
  { id: "EN_PROGRESO", texto: "En progreso" },
  { id: "PENDIENTE_CIERRE", texto: "Pendientes de cierre" },
  { id: "CERRADA", texto: "Cerradas" },
];

// El recorte por tipo: preventiva (rutina programada) vs correctiva (falla
// puntual). Es un "apartado" más dentro de la misma pantalla, sin duplicar
// la lógica de agrupado por fecha que ya tiene el listado.
const FILTROS_TIPO = [
  { id: "", texto: "Todas" },
  { id: "PREVENTIVA", texto: "Preventivas" },
  { id: "CORRECTIVA", texto: "Correctivas" },
];

// El recorte por prioridad. Los valores son los que guarda el backend.
const FILTROS_PRIORIDAD = [
  { id: "", texto: "Todas" },
  { id: "CRITICA", texto: "Crítica" },
  { id: "ALTA", texto: "Alta" },
  { id: "MEDIA", texto: "Media" },
  { id: "BAJA", texto: "Baja" },
];

// Cuántas órdenes se muestran por página.
const POR_PAGINA = 50;

// Cuántas se le piden al backend como máximo en cada carga (el técnico, con
// "mis órdenes", ya recibe todas). Las páginas se arman acá sobre esa lista.
const LIMITE_CARGA = 1000;

function Ordenes() {
  const navegar = useNavigate();
  const [perfil, setPerfil] = useState(null);
  const [ordenes, setOrdenes] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [prioridadFiltro, setPrioridadFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [notifDesde, setNotifDesde] = useState("");   // "AAAA-MM-DD" o ""
  const [notifHasta, setNotifHasta] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [descargando, setDescargando] = useState(false);

  // Página actual (0 = la primera), guardada junto con la búsqueda y los
  // filtros a los que corresponde: si cambia cualquiera de ellos, vuelve sola
  // a la primera.
  const clavePagina = JSON.stringify([busqueda, filtro, tipoFiltro, prioridadFiltro, notifDesde, notifHasta]);
  const [paginaGuardada, setPaginaGuardada] = useState({ clave: clavePagina, pagina: 0 });
  // Si cambió la búsqueda o algún filtro, la página guardada ya no corresponde:
  // se vuelve a la primera (así, al limpiar los filtros, tampoco reaparece una
  // página vieja).
  if (paginaGuardada.clave !== clavePagina) {
    setPaginaGuardada({ clave: clavePagina, pagina: 0 });
  }

  useEffect(() => {
    obtenerPerfil().then(setPerfil).catch(() => setPerfil(null));
  }, []);

  // Cada vez que cambia algún filtro (o cuando ya sabemos el rol), recargamos.
  useEffect(() => {
    if (!perfil) return;
    cargar();
  }, [perfil, filtro, tipoFiltro, prioridadFiltro, notifDesde, notifHasta]);

  // "Desde" posterior a "Hasta": no tiene sentido, no se pide nada hasta que
  // se corrija (las fechas ISO se pueden comparar como texto).
  const rangoInvalido = !!notifDesde && !!notifHasta && notifDesde > notifHasta;
  const hayFiltroFecha = !!notifDesde || !!notifHasta;
  // Cuántos filtros hay puestos (las dos fechas cuentan como uno solo).
  const filtrosActivos = (filtro ? 1 : 0) + (tipoFiltro ? 1 : 0) + (prioridadFiltro ? 1 : 0) + (hayFiltroFecha ? 1 : 0);

  function limpiarFiltros() {
    setFiltro("");
    setTipoFiltro("");
    setPrioridadFiltro("");
    setNotifDesde("");
    setNotifHasta("");
  }

  const rol = perfil?.rol === "junior" ? "tecnico" : perfil?.rol;
  const esCoordinacion = rol === "coordinacion";
  const esTecnico = rol === "tecnico";

  async function cargar() {
    if (rangoInvalido) {
      setOrdenes([]);
      setCargando(false);
      setError("La fecha \"Desde\" no puede ser posterior a la fecha \"Hasta\".");
      return;
    }
    setCargando(true);
    setError("");
    const fechas = { prioridad: prioridadFiltro || undefined, notificadaDesde: notifDesde || undefined, notificadaHasta: notifHasta || undefined };
    try {
      // limite más alto que el default (50): el buscador y las páginas
      // trabajan sobre esta misma lista sin volver a pedirle nada al backend,
      // así que conviene traer de entrada un margen mayor (misOrdenes, la del
      // técnico, ya trae todas sin límite).
      let lista;
      if (rol === "tecnico") {
        lista = await misOrdenes({ estado: filtro || undefined, tipo: tipoFiltro || undefined, ...fechas });
      } else if (esCoordinacion) {
        // "sin_asignar" se pide como recorte, no como estado.
        lista = filtro === "SIN_ASIGNAR"
          ? await listarOrdenes({ misGrupos: true, sinAsignar: true, tipo: tipoFiltro || "CORRECTIVA", limite: LIMITE_CARGA, ...fechas })
          : await listarOrdenes({ misGrupos: true, estado: filtro || undefined, tipo: tipoFiltro || undefined, limite: LIMITE_CARGA, ...fechas });
      } else {
        lista = await listarOrdenes({ estado: filtro || undefined, tipo: tipoFiltro || undefined, limite: LIMITE_CARGA, ...fechas });
      }
      setOrdenes(lista);
    } catch {
      setError("No pudimos cargar las órdenes de trabajo.");
    } finally {
      setCargando(false);
    }
  }

  // Descarga el CSV de OT respetando los mismos filtros que están puestos
  // en esta pantalla (estado, tipo, prioridad, fecha de notificación, y "sin
  // asignar" para coordinación) — si no hay ningún filtro activo ("Todas"),
  // descarga todo lo que este rol puede ver, igual que antes.
  async function descargarOrdenes() {
    if (descargando) return;
    if (rangoInvalido) {
      toast.error("Corregí las fechas: \"Desde\" no puede ser posterior a \"Hasta\".");
      return;
    }
    setDescargando(true);
    try {
      const params = new URLSearchParams();
      if (filtro === "SIN_ASIGNAR") {
        params.set("sin_asignar", "true");
        if (tipoFiltro) params.set("tipo", tipoFiltro);
      } else {
        if (filtro) params.set("estado", filtro);
        if (tipoFiltro) params.set("tipo", tipoFiltro);
      }
      if (prioridadFiltro) params.set("prioridad", prioridadFiltro);
      if (notifDesde) params.set("notificada_desde", notifDesde);
      if (notifHasta) params.set("notificada_hasta", notifHasta);
      const query = params.toString();
      await descargarCSV(query ? `/exportar/ordenes?${query}` : "/exportar/ordenes", "ordenes");
    } catch {
      toast.error("No pudimos descargar el CSV. Probá de nuevo.");
    } finally {
      setDescargando(false);
    }
  }

  // Coordinación necesita ver a quién está asignada cada OT, así que traemos
  // la gente una sola vez y mapeamos el id al nombre acá, sin pedirle más al
  // backend.
  useEffect(() => {
    if (!esCoordinacion) return;
    tecnicosDisponibles().then(setTecnicos).catch(() => setTecnicos([]));
  }, [esCoordinacion]);

  function nombreTecnico(ot) {
    const t = tecnicos.find((x) => x.id === ot.tecnico_id);
    if (t) return `${t.nombre} ${t.apellido}`;
    return ot.tecnico_nombre || "Técnico no identificado";
  }

  const filtros = esCoordinacion
    ? [...FILTROS_BASE, { id: "SIN_ASIGNAR", texto: "Sin asignar" }]
    : FILTROS_BASE;

  const ordenesFiltradas = busqueda ? ordenes.filter((ot) => coincideBusqueda(ot, busqueda)) : ordenes;

  const totalPaginas = Math.max(1, Math.ceil(ordenesFiltradas.length / POR_PAGINA));
  const pagina = Math.min(paginaGuardada.clave === clavePagina ? paginaGuardada.pagina : 0, totalPaginas - 1);
  const primera = pagina * POR_PAGINA;
  const ordenesPagina = ordenesFiltradas.slice(primera, primera + POR_PAGINA);
  const grupos = agruparPorFecha(ordenesPagina, (o) => o.fecha_apertura, formatearFechaOT);

  const subtitulo = cargando
    ? "Cargando..."
    : totalPaginas > 1
      ? `Mostrando ${primera + 1}–${primera + ordenesPagina.length} de ${ordenesFiltradas.length}`
      : `${ordenesFiltradas.length} en esta vista`;

  return (
    <>
      <Encabezado
        titulo={rol === "tecnico" ? "Mis órdenes de trabajo" : "Órdenes de trabajo"}
        subtitulo={subtitulo}
      >
        <button style={{ ...boton("secundario"), gap: 6 }} onClick={descargarOrdenes} disabled={descargando}>
          <Download size={15} strokeWidth={2} aria-hidden="true" />
          {descargando ? "Generando..." : "Descargar CSV"}
        </button>
      </Encabezado>

      {/* ─── Buscador (por número de OT o código de equipo) + filtros plegables ─── */}
      <BarraFiltros
        placeholder="Buscar por número de OT (ej: 37, OT-037) o código de equipo"
        texto={busqueda}
        onTexto={setBusqueda}
        filtrosActivos={filtrosActivos}
        onLimpiar={limpiarFiltros}
      >
        <GrupoFiltro etiqueta="Estado">
          {filtros.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              style={{
                ...estilos.filtro,
                ...(filtro === f.id ? estilos.filtroActivo : {}),
              }}
            >
              {f.texto}
            </button>
          ))}
        </GrupoFiltro>

        {/* Recorte por tipo, aparte del de estado: preventivas vs correctivas
        son dos tipos de trabajo distintos (rutina programada vs falla puntual). */}
        <GrupoFiltro etiqueta="Tipo">
          {FILTROS_TIPO.map((f) => (
            <button
              key={f.id}
              onClick={() => setTipoFiltro(f.id)}
              style={{
                ...estilos.filtroTipo,
                ...(tipoFiltro === f.id ? estilos.filtroTipoActivo : {}),
              }}
            >
              {f.texto}
            </button>
          ))}
        </GrupoFiltro>

        <GrupoFiltro etiqueta="Prioridad">
          {FILTROS_PRIORIDAD.map((f) => (
            <button
              key={f.id}
              onClick={() => setPrioridadFiltro(f.id)}
              style={{
                ...estilos.filtro,
                ...(prioridadFiltro === f.id ? estilos.filtroActivo : {}),
              }}
            >
              {f.texto}
            </button>
          ))}
        </GrupoFiltro>

        {/* Fecha de notificación: rango de días, los dos extremos incluidos. */}
        <GrupoFiltro etiqueta="Notificada">
          <label style={estilos.campoFecha}>
            Desde
            <input
              type="date"
              style={estilos.inputFecha}
              value={notifDesde}
              max={notifHasta || undefined}
              onChange={(e) => setNotifDesde(e.target.value)}
            />
          </label>
          <label style={estilos.campoFecha}>
            Hasta
            <input
              type="date"
              style={estilos.inputFecha}
              value={notifHasta}
              min={notifDesde || undefined}
              onChange={(e) => setNotifHasta(e.target.value)}
            />
          </label>
        </GrupoFiltro>
      </BarraFiltros>

      {error && <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>}

      {!cargando && ordenesFiltradas.length === 0 && !error && (
        <p style={estilos.mensaje}>
          {busqueda
            ? "No encontramos ninguna OT con esa búsqueda."
            : hayFiltroFecha
            ? "No hay órdenes notificadas en ese rango de fechas."
            : prioridadFiltro
            ? "No hay órdenes con esa prioridad en esta vista."
            : filtro === "SIN_ASIGNAR"
            ? "No hay órdenes esperando técnico."
            : "No hay órdenes en esta vista."}
        </p>
      )}

      {/* ─── Páginas: flechas arriba de la lista ─── */}
      <Paginador
        pagina={pagina}
        totalPaginas={totalPaginas}
        onCambiar={(n) => setPaginaGuardada({ clave: clavePagina, pagina: n })}
        deshabilitado={cargando}
      />

      {grupos.map((grupo) => (
        <div key={grupo.fecha} style={{ marginBottom: 20 }}>
          <p style={estilos.fecha}>{grupo.fecha}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {grupo.items.map((ot) => (
              <div
                key={ot.id}
                className="sy-clickeable"
                style={{
                  ...estilos.tarjeta,
                  ...(ot.tipo === "PREVENTIVA" ? estilos.tarjetaPreventiva : {}),
                }}
                onClick={() => navegar(`/ordenes/${ot.id}`)}
              >

                <div style={{ minWidth: 0, flex: 1 }}>
                  {/* Primero el número de OT y el código del equipo, grandes:
                  son los identificadores con los que se ubica una orden o un
                  equipo puntual. El nombre queda abajo, como dato secundario
                  (mismo criterio que en la lista de Equipos). */}
                  {/* Título y etiqueta de tipo en una misma fila. Si entran,
                  van uno al lado del otro; si no (pantalla angosta o código
                  largo), la etiqueta baja sola, alineada a la izquierda.
                  La etiqueta es solo para preventivas: así la vista "Todas"
                  deja ver de un vistazo cuáles son rutina programada. */}
                  <div style={estilos.lineaTitulo}>
                    <p style={estilos.titulo}>
                      OT-{String(ot.numero_ot).padStart(4, "0")} · {ot.activo_codigo}
                    </p>
                    {ot.tipo === "PREVENTIVA" && (
                      <span style={estilos.etiquetaPreventiva}>
                        <CalendarClock size={12} strokeWidth={2.2} aria-hidden="true" />
                        Preventiva
                      </span>
                    )}
                  </div>
                  <p style={estilos.codigo}>
                    {ot.activo_descripcion || "Equipo sin descripción"}
                    {ot.activo_ubicacion ? ` · ${ot.activo_ubicacion}` : ""}
                  </p>
                  {/* Con el filtro de fechas puesto, mostramos la fecha por la
                  que se filtró: la lista sigue agrupada por fecha de apertura
                  y, sin esto, no se entendería por qué entró cada orden. */}
                  {hayFiltroFecha && (
                    <p style={estilos.asignacion}>
                      Notificada: {formatearFechaOT(ot.fecha_notificacion || ot.fecha_apertura)}
                    </p>
                  )}

                  {esCoordinacion && (
                    <p style={ot.tecnico_id || ot.tipo === "PREVENTIVA" ? estilos.asignacion : estilos.sinAsignar}>
                      {ot.tecnico_id
                        ? nombreTecnico(ot)
                        : ot.tipo === "PREVENTIVA"
                          ? `Asignada al grupo ${ot.grupo_id || "sin definir"}`
                          : "Sin técnico asignado"}
                    </p>
                  )}

                  {/* Al técnico solo le mostramos la aclaración cuando la OT
                  todavía no es "suya": es del grupo entero (ej. una
                  preventiva recién generada) y la puede tomar cualquiera. */}
                  {esTecnico && !ot.tecnico_id && (
                    <p style={ot.tipo === "PREVENTIVA" ? estilos.asignacion : estilos.sinAsignar}>
                      {ot.tipo === "PREVENTIVA" ? "Asignada al grupo" : "Sin asignar · disponible para tu grupo"}
                    </p>
                  )}
                </div>

                <div style={estilos.columnaEstado}>
                  <span style={insignia(tonoEstadoOT(ot.estado))}>
                    {textoEstado(ot.estado)}
                  </span>
                  {ot.prioridad && (
                    <span
                      className={`sy-prioridad sy-prioridad-${ot.prioridad.toLowerCase()}`}
                      style={estilos.prioridad}
                    >
                      {/* Crítica lleva triángulo en vez de punto: un cuarto
                      color de rojo no se distinguiría del rojo de "alta". */}
                      {ot.prioridad === "CRITICA"
                        ? <AlertTriangle size={12} strokeWidth={2.4} style={{ marginRight: 4, flexShrink: 0 }} aria-hidden="true" />
                        : <span className="sy-prioridad-punto" />}
                      Prioridad {ot.prioridad.toLowerCase()}
                    </span>
                  )}
                </div>

              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

// Azul = hay que hacerla. Violeta = alguien la está haciendo. Gris = terminada,
// ya no pide atención. Nada de rojo: si toda OT abierta fuera roja, el rojo
// dejaría de significar "urgente".
function tonoEstadoOT(estado) {
  if (estado === "CERRADA") return "apagado";
  if (estado === "PENDIENTE_CIERRE") return "advertencia";
  if (estado === "EN_PROGRESO") return "proceso";
  return "pendiente";
}

function textoEstado(estado) {
  const nombres = {
    ABIERTA: "Abierta",
    EN_PROGRESO: "En progreso",
    PENDIENTE_CIERRE: "Pendiente de cierre",
    CERRADA: "Cerrada",
  };
  return nombres[estado] || estado;
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "18px 0" },
  filtro: {
    padding: "4px 11px", borderRadius: 999,
    // Separadas y no el atajo `border`: mezclarlo con el `borderColor` de
    // filtroActivo hace que al desactivarse quede el borde oscuro.
    borderWidth: 1, borderStyle: "solid", borderColor: color.borde,
    background: color.tarjeta, color: color.textoSuave, fontSize: "0.78rem",
    cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
  },
  filtroActivo: {
    background: color.primarioClaro, color: color.primarioOscuro,
    borderColor: color.primarioClaro,
  },
  filtroTipo: {
    padding: "4px 11px", borderRadius: 999,
    borderWidth: 1, borderStyle: "solid", borderColor: color.borde,
    background: color.tarjeta, color: color.textoSuave, fontSize: "0.78rem",
    cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
  },
  filtroTipoActivo: {
    background: "#EFE9FA", color: "#5A3E9E", borderColor: "#EFE9FA",
  },
  campoFecha: {
    display: "flex", alignItems: "center", gap: 5,
    fontSize: "0.78rem", color: color.textoSuave,
  },
  inputFecha: { ...cs.input, width: "auto", padding: "3px 8px", fontSize: "0.78rem" },
  fecha: {
    margin: "0 0 8px", fontSize: "0.72rem", color: color.textoDebil,
    textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600,
  },
  tarjeta: {
    ...cs.tarjeta, padding: "13px 16px", display: "flex",
    alignItems: "flex-start", gap: 12, cursor: "pointer",
    borderLeft: `3px solid transparent`,
  },
  // Mismo violeta que el filtro de tipo: un borde a la izquierda alcanza para
  // que se note incluso mirando la lista de reojo, sin cambiar la estructura
  // de tarjeta que ya usan las correctivas.
  tarjetaPreventiva: { borderLeftColor: color.primario },
  // El número de OT + el código del equipo van grandes y en monoespaciada
  // (son identificadores, mismo criterio que el código en la lista de
  // Equipos); el nombre del equipo abajo queda en "codigo" pese al nombre
  // del estilo, como dato secundario.
  lineaTitulo: {
    display: "flex", flexWrap: "wrap", alignItems: "center",
    columnGap: 8, rowGap: 5,
  },
  titulo: {
    margin: 0, fontSize: "0.95rem", color: color.texto, fontWeight: 700,
    fontFamily: "ui-monospace, monospace",
  },
  etiquetaPreventiva: {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "2px 8px", borderRadius: 999,
    background: color.primarioClaro, color: color.primarioOscuro,
    fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.02em",
  },
  codigo: { margin: "3px 0 0", fontSize: "0.85rem", color: color.textoSuave },
  columnaEstado: {
    display: "flex", flexDirection: "column", alignItems: "flex-end",
    gap: 20, flexShrink: 0,
  },
  prioridad: {
    fontSize: "0.72rem", marginLeft: 0, whiteSpace: "nowrap",
  },
  asignacion: { margin: "4px 0 0", fontSize: "0.82rem", color: color.textoDebil },
  sinAsignar: {
    margin: "4px 0 0", fontSize: "0.82rem",
    color: color.advertencia, fontWeight: 700,
  },
};

export default Ordenes;