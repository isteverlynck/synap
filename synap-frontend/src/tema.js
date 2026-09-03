// tema.js — paleta de colores, tipografía y estilos reutilizables de SYNAP.
//
// Antes cada pantalla tenía sus propios colores y medidas "hardcodeadas"
// (cada una un poco distinta). Este archivo junta todo eso en un solo lugar:
// así toda la app se ve consistente, y si mañana querés cambiar el celeste
// principal o el tamaño de los bordes redondeados, lo cambiás acá una vez
// y se actualiza en todas las pantallas.
//
// Cómo se usa: importás lo que necesites y lo aplicás en el style={...} de
// cada elemento, por ejemplo: style={cs.tarjeta} o style={boton("primario")}.

export const color = {
  primario: "#0a66d6",
  primarioOscuro: "#08509f",
  primarioClaro: "#e8f1fd",
  texto: "#1b2430",
  textoSuave: "#5b6472",
  textoDebil: "#94a0b3",
  fondo: "#f2f4f8",
  tarjeta: "#ffffff",
  borde: "#e2e6ed",
  bordeSuave: "#edf0f4",
  exito: "#1a8f4c",
  exitoFondo: "#e7f7ee",
  advertencia: "#c8720b",
  advertenciaFondo: "#fdf1e2",
  peligro: "#d13c3c",
  peligroFondo: "#fceceb",
};

export const radio = { chico: 8, mediano: 12, grande: 18, pastilla: 999 };

export const sombra = {
  tarjeta: "0 1px 2px rgba(20,24,35,0.04), 0 6px 20px rgba(20,24,35,0.06)",
  flotante: "0 12px 32px rgba(20,24,35,0.14)",
};

export const fuente = "'Segoe UI', system-ui, -apple-system, Roboto, sans-serif";

// ─────────────────────────────────────────────────────────────────────────
// Estilos reutilizables (contenedores, tarjetas, inputs). Se combinan con
// spread cuando hace falta ajustar algo puntual: {...cs.tarjeta, padding: 8}
// ─────────────────────────────────────────────────────────────────────────

export const cs = {
  // Fondo + tipografía de toda la pantalla. Va en el <div> más externo.
  pagina: {
    minHeight: "100vh",
    background: color.fondo,
    fontFamily: fuente,
  },
  // Centra el contenido y le pone un ancho máximo prolijo para leer.
  contenido: {
    maxWidth: 900,
    margin: "0 auto",
    padding: "28px 24px 60px",
    boxSizing: "border-box",
  },
  tarjeta: {
    background: color.tarjeta,
    border: `1px solid ${color.borde}`,
    borderRadius: radio.grande,
    boxShadow: sombra.tarjeta,
    boxSizing: "border-box",
  },
  input: {
    width: "100%",
    padding: "11px 14px",
    borderRadius: radio.chico + 2,
    border: `1.5px solid ${color.borde}`,
    fontSize: "0.95rem",
    fontFamily: "inherit",
    color: color.texto,
    boxSizing: "border-box",
    outline: "none",
    background: color.tarjeta,
  },
  label: {
    display: "block",
    marginBottom: 6,
    fontSize: "0.78rem",
    fontWeight: 600,
    color: color.textoSuave,
    letterSpacing: "0.01em",
    textTransform: "uppercase",
  },
};

// Variantes de botón: "primario" (acción principal), "secundario" (con
// borde, para acciones alternativas), "fantasma" (sin fondo, para algo
// discreto como "Cerrar sesión") y "peligro" (rechazar, eliminar, etc.)
export function boton(variante = "primario") {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "10px 18px",
    borderRadius: radio.chico + 2,
    fontSize: "0.88rem",
    fontWeight: 600,
    cursor: "pointer",
    border: "1.5px solid transparent",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  };
  const variantes = {
    primario: { ...base, background: color.primario, color: "#fff" },
    secundario: { ...base, background: color.tarjeta, color: color.texto, borderColor: color.borde },
    fantasma: { ...base, background: "transparent", color: color.textoSuave, borderColor: "transparent" },
    peligro: { ...base, background: color.peligroFondo, color: color.peligro, borderColor: "transparent" },
  };
  return variantes[variante] || variantes.primario;
}

// Pastillitas de estado (PENDIENTE, ACEPTADA, en progreso, etc.)
export function insignia(tono = "primario") {
  const tonos = {
    primario: { color: color.primario, background: color.primarioClaro },
    exito: { color: color.exito, background: color.exitoFondo },
    advertencia: { color: color.advertencia, background: color.advertenciaFondo },
    peligro: { color: color.peligro, background: color.peligroFondo },
    neutro: { color: color.textoSuave, background: color.bordeSuave },
  };
  return {
    display: "inline-block",
    fontSize: "0.72rem",
    fontWeight: 700,
    padding: "3px 10px",
    borderRadius: radio.pastilla,
    letterSpacing: "0.02em",
    whiteSpace: "nowrap",
    ...(tonos[tono] || tonos.primario),
  };
}

// El campo "estado" de un activo es texto libre en la base (no hay una lista
// fija todavía), así que esto es una aproximación por palabras clave: verde
// si suena a "andando", rojo/naranja si suena a "de baja" o "en reparación",
// y gris neutro para cualquier otro caso.
export function tonoEstadoActivo(estado) {
  const texto = (estado || "").toUpperCase();
  if (texto.includes("BAJA") || texto.includes("FUERA")) return "peligro";
  if (texto.includes("REPARAC") || texto.includes("MANTEN")) return "advertencia";
  if (texto.includes("ACTIV") || texto.includes("OPERATIV")) return "exito";
  return "neutro";
}