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
// Buscador: filtra, sobre lo que ya se trajo del backend, por número de OT o
// por código de equipo. El número de OT es flexible en el formato — "037",
// "37", "OT 37", "OT-037", etc. todos encuentran la OT-0037 — porque en el
// piso nadie se acuerda si va con guión, con espacio o con los ceros.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { misOrdenes, listarOrdenes } from "../api/ordenes";
import { tecnicosDisponibles } from "../api/coordinacion";
import { obtenerPerfil } from "../api/auth";
import { agruparPorFecha } from "../utiles/fechas";
import Encabezado from "../componentes/Encabezado";
import { color, cs, insignia } from "../tema";
import { AlertTriangle, CalendarClock, Search, X } from "lucide-react";

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

function Ordenes() {
  const navegar = useNavigate();
  const [perfil, setPerfil] = useState(null);
  const [ordenes, setOrdenes] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    obtenerPerfil().then(setPerfil).catch(() => setPerfil(null));
  }, []);

  // Cada vez que cambia algún filtro (o cuando ya sabemos el rol), recargamos.
  useEffect(() => {
    if (!perfil) return;
    cargar();
  }, [perfil, filtro, tipoFiltro]);

  const rol = perfil?.rol === "junior" ? "tecnico" : perfil?.rol;
  const esCoordinacion = rol === "coordinacion";
  const esTecnico = rol === "tecnico";

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      // limite más alto que el default (50): el buscador filtra sobre esta
      // misma lista sin volver a pedirle nada al backend, así que conviene
      // traer de entrada un margen mayor (misOrdenes, la del técnico, ya
      // trae todas sin límite).
      let lista;
      if (rol === "tecnico") {
        lista = await misOrdenes({ estado: filtro || undefined, tipo: tipoFiltro || undefined });
      } else if (esCoordinacion) {
        // "sin_asignar" se pide como recorte, no como estado.
        lista = filtro === "SIN_ASIGNAR"
          ? await listarOrdenes({ misGrupos: true, sinAsignar: true, tipo: tipoFiltro || undefined, limite: 200 })
          : await listarOrdenes({ misGrupos: true, estado: filtro || undefined, tipo: tipoFiltro || undefined, limite: 200 });
      } else {
        lista = await listarOrdenes({ estado: filtro || undefined, tipo: tipoFiltro || undefined, limite: 200 });
      }
      setOrdenes(lista);
    } catch {
      setError("No pudimos cargar las órdenes de trabajo.");
    } finally {
      setCargando(false);
    }
  }

  // Coordinación necesita ver a quién está asignada cada OT, así que traemos
  // la gente una sola vez y mapeamos el id al nombre acá, sin pedirle más al
  // backend.
  useEffect(() => {
    if (!esCoordinacion) return;
    tecnicosDisponibles().then(setTecnicos).catch(() => setTecnicos([]));
  }, [esCoordinacion]);

  function nombreTecnico(id) {
    if (!id) return null;
    const t = tecnicos.find((x) => x.id === id);
    return t ? `${t.nombre} ${t.apellido}` : "Asignada";
  }

  const filtros = esCoordinacion
    ? [...FILTROS_BASE, { id: "SIN_ASIGNAR", texto: "Sin asignar" }]
    : FILTROS_BASE;

  const ordenesFiltradas = busqueda ? ordenes.filter((ot) => coincideBusqueda(ot, busqueda)) : ordenes;
  const grupos = agruparPorFecha(ordenesFiltradas, (o) => o.fecha_apertura);

  return (
    <>
      <Encabezado
        titulo={rol === "tecnico" ? "Mis órdenes de trabajo" : "Órdenes de trabajo"}
        subtitulo={cargando ? "Cargando..." : `${ordenesFiltradas.length} en esta vista`}
      />

      {/* ─── Buscador: por número de OT o código de equipo ─── */}
      <div style={estilos.campoBusqueda}>
        <Search size={17} strokeWidth={1.9} color={color.textoDebil} aria-hidden="true" />
        <input
          style={estilos.inputBusqueda}
          placeholder="Buscar por número de OT (ej: 37, OT-037) o código de equipo"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        {busqueda && (
          <button style={estilos.limpiarBusqueda} onClick={() => setBusqueda("")} title="Limpiar">
            <X size={15} strokeWidth={2.2} aria-hidden="true" />
          </button>
        )}
      </div>

      <div style={estilos.filtros}>
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
      </div>

      {/* Recorte por tipo, aparte del de estado: preventivas vs correctivas
      son dos tipos de trabajo distintos (rutina programada vs falla puntual). */}
      <div style={estilos.filtros}>
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
      </div>

      {error && <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>}

      {!cargando && ordenesFiltradas.length === 0 && !error && (
        <p style={estilos.mensaje}>
          {busqueda
            ? "No encontramos ninguna OT con esa búsqueda."
            : filtro === "SIN_ASIGNAR"
            ? "No hay órdenes esperando técnico."
            : "No hay órdenes en esta vista."}
        </p>
      )}

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
                  <p style={estilos.titulo}>
                    OT-{String(ot.numero_ot).padStart(4, "0")} · {ot.activo_codigo}
                    {/* Etiqueta de tipo: solo en las preventivas (son la
                    excepción a "OT normal, por una falla") — así la vista
                    "Todas" deja ver de un vistazo cuáles son rutina programada. */}
                    {ot.tipo === "PREVENTIVA" && (
                      <span style={estilos.etiquetaPreventiva}>
                        <CalendarClock size={12} strokeWidth={2.2} aria-hidden="true" />
                        Preventiva
                      </span>
                    )}
                  </p>
                  <p style={estilos.codigo}>
                    {ot.activo_descripcion || "Equipo sin descripción"}
                    {ot.activo_ubicacion ? ` · ${ot.activo_ubicacion}` : ""}
                    {ot.prioridad && (
                      <span className={`sy-prioridad sy-prioridad-${ot.prioridad.toLowerCase()}`}>
                        {/* Crítica lleva triángulo en vez de punto: un cuarto
                        color de rojo no se distinguiría del rojo de "alta". */}
                        {ot.prioridad === "CRITICA"
                          ? <AlertTriangle size={13} strokeWidth={2.4} style={{ marginRight: 5, flexShrink: 0 }} aria-hidden="true" />
                          : <span className="sy-prioridad-punto" />}
                        Prioridad {ot.prioridad.toLowerCase()}
                      </span>
                    )}
                  </p>

                  {esCoordinacion && (
                    <p style={ot.tecnico_id ? estilos.asignacion : estilos.sinAsignar}>
                      {ot.tecnico_id
                        ? nombreTecnico(ot.tecnico_id)
                        : "Sin técnico asignado"}
                    </p>
                  )}

                  {/* Al técnico solo le mostramos la aclaración cuando la OT
                  todavía no es "suya": es del grupo entero (ej. una
                  preventiva recién generada) y la puede tomar cualquiera. */}
                  {esTecnico && !ot.tecnico_id && (
                    <p style={estilos.sinAsignar}>Sin asignar · disponible para tu grupo</p>
                  )}
                </div>

                <span style={insignia(tonoEstadoOT(ot.estado))}>
                  {textoEstado(ot.estado)}
                </span>
                
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
  if (estado === "EN_PROGRESO") return "proceso";
  return "pendiente";
}

function textoEstado(estado) {
  const nombres = { ABIERTA: "Abierta", EN_PROGRESO: "En progreso", CERRADA: "Cerrada" };
  return nombres[estado] || estado;
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "18px 0" },
  // Mismo aspecto que el buscador de la lista de Equipos, para que las dos
  // pantallas se sientan consistentes.
  campoBusqueda: {
    ...cs.input,
    display: "flex", alignItems: "center", gap: 9,
    padding: "0 12px", marginBottom: 14,
  },
  inputBusqueda: {
    flex: 1, border: "none", outline: "none", background: "transparent",
    fontFamily: "inherit", fontSize: "0.92rem", color: color.texto,
    padding: "11px 0", minWidth: 0,
  },
  limpiarBusqueda: {
    background: "transparent", border: "none", cursor: "pointer",
    color: color.textoDebil, display: "flex", padding: 2,
  },
  filtros: { display: "flex", gap: 7, marginBottom: 18, flexWrap: "wrap" },
  filtro: {
    padding: "6px 14px", borderRadius: 999, border: `1px solid ${color.borde}`,
    background: color.tarjeta, color: color.textoSuave, fontSize: "0.83rem",
    cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
  },
  filtroActivo: {
    background: color.primarioClaro, color: color.primarioOscuro,
    borderColor: color.primarioClaro,
  },
  // Mismo aspecto que el filtro de estado, pero en violeta — para que el ojo
  // separe "en qué estado está" de "qué tipo de OT es": son dos preguntas
  // distintas, no queremos que parezcan la misma fila de opciones.
  filtroTipo: {
    padding: "6px 14px", borderRadius: 999, border: `1px solid ${color.borde}`,
    background: color.tarjeta, color: color.textoSuave, fontSize: "0.83rem",
    cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
  },
  filtroTipoActivo: {
    background: "#EFE9FA", color: "#5A3E9E", borderColor: "#EFE9FA",
  },
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
  tarjetaPreventiva: { borderLeftColor: "#8B6CC9" },
  // El número de OT + el código del equipo van grandes y en monoespaciada
  // (son identificadores, mismo criterio que el código en la lista de
  // Equipos); el nombre del equipo abajo queda en "codigo" pese al nombre
  // del estilo, como dato secundario.
  titulo: {
    margin: 0, fontSize: "0.95rem", color: color.texto, fontWeight: 700,
    fontFamily: "ui-monospace, monospace",
  },
  etiquetaPreventiva: {
    display: "inline-flex", alignItems: "center", gap: 4,
    marginLeft: 8, padding: "2px 8px", borderRadius: 999,
    background: "#EFE9FA", color: "#5A3E9E",
    fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.02em",
    verticalAlign: "middle",
  },
  codigo: { margin: "3px 0 0", fontSize: "0.85rem", color: color.textoSuave },
  asignacion: { margin: "4px 0 0", fontSize: "0.82rem", color: color.textoDebil },
  sinAsignar: {
    margin: "4px 0 0", fontSize: "0.82rem",
    color: color.advertencia, fontWeight: 700,
  },
};

export default Ordenes;