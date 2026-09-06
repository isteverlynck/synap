// Ordenes.jsx — el listado de órdenes de trabajo.
//
// Una pantalla, tres recortes distintos según el rol:
//   técnico      → solo las asignadas a él ("mis órdenes")
//   coordinación → las de los grupos que coordina, con foco en las que
//                  todavía no tienen técnico
//   jefatura     → todas
//
// El filtro por estado es el mismo para los tres. Coordinación tiene uno más
// ("Sin asignar"), porque es su tarea propia: repartir el trabajo.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { misOrdenes, listarOrdenes } from "../api/ordenes";
import { tecnicosDisponibles } from "../api/coordinacion";
import { obtenerPerfil } from "../api/auth";
import { agruparPorFecha } from "../utiles/fechas";
import Encabezado from "../componentes/Encabezado";
import { color, cs, insignia } from "../tema";
import { AlertTriangle } from "lucide-react";

// Los filtros de arriba. "sin_asignar" no es un estado real de la base: es un
// recorte (OT abiertas sin técnico), por eso se trata aparte.
const FILTROS_BASE = [
  { id: "", texto: "Todas" },
  { id: "ABIERTA", texto: "Abiertas" },
  { id: "EN_PROGRESO", texto: "En progreso" },
  { id: "CERRADA", texto: "Cerradas" },
];

function Ordenes() {
  const navegar = useNavigate();
  const [perfil, setPerfil] = useState(null);
  const [ordenes, setOrdenes] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    obtenerPerfil().then(setPerfil).catch(() => setPerfil(null));
  }, []);

  // Cada vez que cambia el filtro (o cuando ya sabemos el rol), recargamos.
  useEffect(() => {
    if (!perfil) return;
    cargar();
  }, [perfil, filtro]);

  const rol = perfil?.rol === "junior" ? "tecnico" : perfil?.rol;
  const esCoordinacion = rol === "coordinacion";

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      let lista;
      if (rol === "tecnico") {
        lista = await misOrdenes(filtro || undefined);
      } else if (esCoordinacion) {
        // "sin_asignar" se pide como recorte, no como estado.
        lista = filtro === "SIN_ASIGNAR"
          ? await listarOrdenes({ misGrupos: true, sinAsignar: true })
          : await listarOrdenes({ misGrupos: true, estado: filtro || undefined });
      } else {
        lista = await listarOrdenes({ estado: filtro || undefined });
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

  const grupos = agruparPorFecha(ordenes, (o) => o.fecha_apertura);

  return (
    <>
      <Encabezado
        titulo={rol === "tecnico" ? "Mis órdenes de trabajo" : "Órdenes de trabajo"}
        subtitulo={cargando ? "Cargando..." : `${ordenes.length} en esta vista`}
      />

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

      {error && <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>}

      {!cargando && ordenes.length === 0 && !error && (
        <p style={estilos.mensaje}>
          {filtro === "SIN_ASIGNAR"
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
                style={estilos.tarjeta}
                onClick={() => navegar(`/ordenes/${ot.id}`)}
              >
                
                <div style={{ minWidth: 0, flex: 1 }}>
                  {/* Primero el nombre del equipo, que es lo que se lee. */}
                  <p style={estilos.titulo}>
                    OT-{String(ot.numero_ot).padStart(4, "0")} · {ot.activo_descripcion || "Equipo sin descripción"}
                  </p>
                  {/* El código abajo, en gris: identifica sin ambigüedad. */}
                  <p style={estilos.codigo}>
                    {ot.activo_codigo}
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
  fecha: {
    margin: "0 0 8px", fontSize: "0.72rem", color: color.textoDebil,
    textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600,
  },
  tarjeta: {
    ...cs.tarjeta, padding: "13px 16px", display: "flex",
    alignItems: "flex-start", gap: 12, cursor: "pointer",
  },
  titulo: { margin: 0, fontSize: "0.95rem", color: color.texto, fontWeight: 600 },
  codigo: {
    margin: "3px 0 0", fontSize: "0.8rem", color: color.textoSuave,
    fontFamily: "ui-monospace, monospace",
  },
  asignacion: { margin: "4px 0 0", fontSize: "0.82rem", color: color.textoDebil },
  sinAsignar: {
    margin: "4px 0 0", fontSize: "0.82rem",
    color: color.advertencia, fontWeight: 700,
  },
};

export default Ordenes;