// BarraFiltros.jsx — el buscador + botón "Filtros" que comparten las listas
// (Activos, Órdenes de trabajo, Accesorios), para que todas se vean y se usen
// igual.
//
// Arriba va el buscador y, al lado, el botón "Filtros". Los filtros están
// plegados: el botón los muestra/esconde, y si hay alguno puesto el botón se
// pinta de color y dice cuántos ("Filtros (2)"), así no se pierde de vista
// qué está recortando la lista aunque el panel esté cerrado.
//
// Cada pantalla le pasa sus filtros como "children" (usando CampoFiltro para
// los desplegables o GrupoFiltro para botoncitos / fechas) y el componente
// los acomoda en una sola fila chica que baja de renglón si no entran. Si la
// pantalla no tiene filtros (children vacío), solo se ve el buscador.

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { color, cs, boton } from "../tema";

function BarraFiltros({ placeholder, texto, onTexto, filtrosActivos = 0, onLimpiar, children }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <div style={estilos.barra}>
        <div style={estilos.campoBusqueda}>
          <Search size={16} strokeWidth={1.9} color={color.textoDebil} aria-hidden="true" />
          <input
            style={estilos.input}
            placeholder={placeholder}
            value={texto}
            onChange={(e) => onTexto(e.target.value)}
          />
          {texto && (
            <button style={estilos.limpiarTexto} onClick={() => onTexto("")} title="Limpiar">
              <X size={15} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
        </div>

        {children && (
          <button
            style={{ ...boton(filtrosActivos > 0 ? "primario" : "secundario"), ...estilos.botonFiltros }}
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
          >
            <SlidersHorizontal size={15} strokeWidth={1.9} aria-hidden="true" />
            Filtros{filtrosActivos > 0 ? ` (${filtrosActivos})` : ""}
          </button>
        )}
      </div>

      {children && abierto && (
        <div style={estilos.panel}>
          <div style={estilos.contenido}>
            {children}
            {filtrosActivos > 0 && onLimpiar && (
              <button style={estilos.limpiarFiltros} onClick={onLimpiar}>
                <X size={14} strokeWidth={2.2} aria-hidden="true" />
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Un filtro de tipo desplegable, chico: etiqueta arriba y el select abajo.
export function CampoFiltro({ etiqueta, valor, onChange, opciones, textoTodos = "Todos" }) {
  return (
    <label style={estilos.grupo}>
      <span style={estilos.etiqueta}>{etiqueta}</span>
      <select style={estilos.select} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">{textoTodos}</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>{o.nombre}</option>
        ))}
      </select>
    </label>
  );
}

// Un filtro "libre" (botoncitos, fechas...): la misma etiqueta chica arriba y
// lo que le pases abajo, en fila.
export function GrupoFiltro({ etiqueta, children }) {
  return (
    <div style={estilos.grupo}>
      <span style={estilos.etiqueta}>{etiqueta}</span>
      <div style={estilos.fila}>{children}</div>
    </div>
  );
}

const estilos = {
  barra: { display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  campoBusqueda: {
    ...cs.input,
    display: "flex", alignItems: "center", gap: 8,
    flex: 1, minWidth: 220, padding: "0 12px",
  },
  input: {
    flex: 1, border: "none", outline: "none", background: "transparent",
    fontFamily: "inherit", fontSize: "0.9rem", color: color.texto,
    padding: "8px 0", minWidth: 0,
  },
  limpiarTexto: {
    background: "transparent", border: "none", cursor: "pointer",
    color: color.textoDebil, display: "flex", padding: 2,
  },
  botonFiltros: { gap: 7, padding: "7px 14px", fontSize: "0.84rem" },
  panel: { ...cs.tarjeta, padding: "10px 14px", marginBottom: 12 },
  contenido: {
    display: "flex", flexWrap: "wrap", alignItems: "flex-end",
    columnGap: 18, rowGap: 10,
  },
  grupo: { display: "flex", flexDirection: "column", gap: 4 },
  etiqueta: {
    fontSize: "0.68rem", fontWeight: 600, color: color.textoSuave,
    textTransform: "uppercase", letterSpacing: "0.02em",
  },
  select: {
    ...cs.input, width: "auto", minWidth: 150, maxWidth: 240,
    padding: "5px 8px", fontSize: "0.82rem",
  },
  fila: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  limpiarFiltros: {
    display: "inline-flex", alignItems: "center", gap: 4,
    background: "transparent", border: "none", cursor: "pointer",
    color: color.primario, fontSize: "0.8rem", fontWeight: 600, fontFamily: "inherit",
    padding: "6px 0",
  },
};

export default BarraFiltros;