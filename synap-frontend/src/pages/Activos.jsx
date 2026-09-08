// Activos.jsx — el listado de equipos, con búsqueda y filtros.
//
// La búsqueda y los filtros los resuelve el BACKEND, no el navegador: filtrar
// una lista que ya está en pantalla solo alcanzaría si estuvieran todos los
// equipos cargados, y traemos hasta 200. Con los datos reales del hospital eso
// dejaría equipos afuera sin que nadie se entere.

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, SlidersHorizontal, X, Plus } from "lucide-react";
import { listarActivos, opcionesDeFiltro } from "../api/activos";
import { rolActual } from "../api/auth";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton, insignia, tonoEstadoActivo } from "../tema";

// Quién puede dar de alta un equipo nuevo. Enfermería no: para ellos "Activos"
// es solo consulta (reportan un problema desde la ficha, no cargan equipos).
const PUEDE_CREAR = ["coordinacion", "tecnico", "junior", "jefatura"];

function Activos() {
  const navegar = useNavigate();
  const puedeCrear = PUEDE_CREAR.includes(rolActual());
  const [activos, setActivos] = useState([]);
  const [opciones, setOpciones] = useState({ tipos: [], sectores: [], grupos: [], estados: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [verFiltros, setVerFiltros] = useState(false);

  // Lo que escribe la persona y lo que efectivamente se busca son dos cosas
  // distintas: sin eso, cada tecla dispararía una llamada al backend.
  const [textoEscrito, setTextoEscrito] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtros, setFiltros] = useState({ estado: "", tipoEquipoId: "", sectorId: "", grupoId: "" });

  useEffect(() => {
    opcionesDeFiltro().then(setOpciones).catch(() => {});
  }, []);

  // Esperamos 350 ms sin que teclee antes de buscar. Es lo que hace que se
  // sienta instantáneo sin castigar al servidor con una consulta por letra.
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(textoEscrito), 350);
    return () => clearTimeout(t);
  }, [textoEscrito]);

  useEffect(() => {
    setCargando(true);
    setError("");
    listarActivos({ buscar: busqueda, ...filtros })
      .then(setActivos)
      .catch(() => setError("No se pudieron cargar los activos."))
      .finally(() => setCargando(false));
  }, [busqueda, filtros]);

  const filtrosActivos = Object.values(filtros).filter(Boolean).length;

  function limpiarFiltros() {
    setFiltros({ estado: "", tipoEquipoId: "", sectorId: "", grupoId: "" });
  }

  return (
    <>
      <Encabezado
        titulo="Activos"
        subtitulo={cargando ? "Buscando..." : textoDelSubtitulo(activos.length, busqueda, filtrosActivos)}
      >
        {puedeCrear && (
          <button style={{ ...boton("primario"), gap: 7 }} onClick={() => navegar("/activos/nuevo")}>
            <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
            Nuevo equipo
          </button>
        )}
        <button style={boton("secundario")} onClick={() => navegar("/escanear")}>
          Escanear equipo (QR)
        </button>
      </Encabezado>

      {/* ─── Buscador ─── */}
      <div style={estilos.barraBusqueda}>
        <div style={estilos.campoBusqueda}>
          <Search size={17} strokeWidth={1.9} color={color.textoDebil} aria-hidden="true" />
          <input
            style={estilos.input}
            placeholder="Buscar por código, nombre, marca o número de serie"
            value={textoEscrito}
            onChange={(e) => setTextoEscrito(e.target.value)}
          />
          {textoEscrito && (
            <button style={estilos.limpiar} onClick={() => setTextoEscrito("")} title="Limpiar">
              <X size={15} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
        </div>

        <button
          style={{ ...boton(filtrosActivos > 0 ? "primario" : "secundario"), gap: 8 }}
          onClick={() => setVerFiltros((v) => !v)}
        >
          <SlidersHorizontal size={16} strokeWidth={1.9} aria-hidden="true" />
          Filtros{filtrosActivos > 0 ? ` (${filtrosActivos})` : ""}
        </button>
      </div>

      {/* ─── Filtros, plegados por defecto ─── */}
      {verFiltros && (
        <div style={{ ...cs.tarjeta, padding: 18, marginBottom: 14 }}>
          <div style={estilos.grillaFiltros}>
            <Filtro
              etiqueta="Estado"
              valor={filtros.estado}
              onChange={(v) => setFiltros({ ...filtros, estado: v })}
              opciones={opciones.estados.map((e) => ({ id: e, nombre: e }))}
            />
            <Filtro
              etiqueta="Tipo de equipo"
              valor={filtros.tipoEquipoId}
              onChange={(v) => setFiltros({ ...filtros, tipoEquipoId: v })}
              opciones={opciones.tipos}
            />
            <Filtro
              etiqueta="Servicio"
              valor={filtros.sectorId}
              onChange={(v) => setFiltros({ ...filtros, sectorId: v })}
              opciones={opciones.sectores}
            />
            <Filtro
              etiqueta="Grupo técnico"
              valor={filtros.grupoId}
              onChange={(v) => setFiltros({ ...filtros, grupoId: v })}
              opciones={opciones.grupos}
            />
          </div>

          {filtrosActivos > 0 && (
            <button style={{ ...boton("fantasma"), marginTop: 12, gap: 6 }} onClick={limpiarFiltros}>
              <X size={15} strokeWidth={2.2} aria-hidden="true" />
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {error && <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>}

      {!cargando && !error && activos.length === 0 && (
        <p style={estilos.mensaje}>
          No encontramos equipos con esa búsqueda. Probá con menos filtros o con
          parte del nombre del equipo.
        </p>
      )}

      <div style={estilos.lista}>
        {activos.map((a) => (
          <div
            key={a.codigo}
            className="sy-clickeable"
            onClick={() => navegar(`/activos/${a.codigo}`)}
            style={estilos.tarjeta}
          >
            <div style={{ minWidth: 0 }}>
              {/* El nombre primero, el código abajo: nadie reconoce un equipo
              por B-CIRU-MAAN-056. Mismo criterio que en las órdenes. */}
              <div style={estilos.descripcion}>{a.descripcion}</div>
              <div style={estilos.codigo}>
                {a.codigo}
                {a.ubicacion ? ` · ${a.ubicacion}` : ""}
              </div>
              {(a.marca || a.modelo) && (
                <div style={estilos.detalle}>{[a.marca, a.modelo].filter(Boolean).join(" ")}</div>
              )}
            </div>
            <span style={insignia(tonoEstadoActivo(a.estado))}>{a.estado}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Filtro({ etiqueta, valor, onChange, opciones }) {
  return (
    <div>
      <label style={cs.label}>{etiqueta}</label>
      <select style={cs.input} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todos</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>{o.nombre}</option>
        ))}
      </select>
    </div>
  );
}

// El subtítulo dice si estás viendo todo o un recorte, para que nadie crea que
// el hospital tiene 12 equipos cuando en realidad hay un filtro puesto.
function textoDelSubtitulo(cantidad, busqueda, filtrosActivos) {
  if (busqueda || filtrosActivos > 0) {
    return `${cantidad} ${cantidad === 1 ? "resultado" : "resultados"}`;
  }
  return `${cantidad} equipos registrados`;
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "20px 0", lineHeight: 1.6 },
  barraBusqueda: { display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" },
  campoBusqueda: {
    ...cs.input,
    display: "flex", alignItems: "center", gap: 9,
    flex: 1, minWidth: 220, padding: "0 12px",
  },
  input: {
    flex: 1, border: "none", outline: "none", background: "transparent",
    fontFamily: "inherit", fontSize: "0.92rem", color: color.texto,
    padding: "11px 0", minWidth: 0,
  },
  limpiar: {
    background: "transparent", border: "none", cursor: "pointer",
    color: color.textoDebil, display: "flex", padding: 2,
  },
  grillaFiltros: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 14,
  },
  lista: { display: "flex", flexDirection: "column", gap: 10 },
  tarjeta: {
    ...cs.tarjeta, padding: "14px 18px",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  },
  descripcion: { fontSize: "0.97rem", color: color.texto, fontWeight: 600 },
  codigo: { fontSize: "0.82rem", color: color.textoSuave, fontFamily: "ui-monospace, monospace", marginTop: 3 },
  detalle: { fontSize: "0.82rem", color: color.textoDebil, marginTop: 2 },
};

export default Activos;