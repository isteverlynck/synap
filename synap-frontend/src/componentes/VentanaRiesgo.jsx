// VentanaRiesgo.jsx — ventanita que explica el nivel de riesgo PRIUX de un
// equipo: una barra con los tres niveles (bajo / medio / alto) y dónde cae
// este equipo, la fórmula en palabras y los valores de ESTE equipo con su
// escala. Se abre al tocar la pastilla de riesgo en la ficha del activo.
//
// Recibe:
//   - datos: lo que devuelve GET /activos/{codigo}/criticidad (ver
//     backend/app/criticidad.py). Solo se abre si el equipo tiene puntaje.
//   - alCerrar: función que la cierra (la cruz o tocar afuera).

import { X } from "lucide-react";
import { color, cs } from "../tema";

// Colores de los tramos de la barra. Son más claros que los de las pastillas
// (color.exito, etc.) porque en una barra ancha los oscuros quedan pesados.
const COLOR_TRAMO = { BAJO: "#97C459", MEDIO: "#EF9F27", ALTO: "#E24B4A" };
const COLOR_TEXTO = { BAJO: color.exito, MEDIO: color.advertencia, ALTO: color.peligro };

// Qué significa cada nivel de las tablas del PRIUX, en palabras cortas.
const FUNCION = {
  5: "apoyo de vida, cirugía o cuidados intensivos",
  4: "tratamiento, monitoreo o diagnóstico",
  3: "análisis de laboratorio",
  2: "accesorio de laboratorio o computadora",
  1: "equipo menor",
};
const RIESGO = {
  5: "puede causar la muerte",
  4: "puede dañar al paciente u operador",
  3: "terapia inapropiada o falso diagnóstico",
  2: "puede dañar el equipo",
  1: "sin daño identificado",
};
const MANTENIMIENTO = {
  5: "repuestos, ajuste, seguridad y pruebas adicionales",
  4: "repuestos, ajuste y prueba de seguridad",
  3: "ajuste y prueba de seguridad",
  2: "verificación de funcionamiento",
  1: "inspección visual",
};
const ANTIGUEDAD = {
  1: "menos de 1 año",
  2: "entre 1 y 5 años",
  3: "entre 5 y 10 años",
  4: "entre 10 y 15 años",
  5: "más de 15 años",
};

// 18.75 → "18,75" (coma decimal, como se escribe acá).
function num(n) {
  return String(n).replace(".", ",");
}

export default function VentanaRiesgo({ datos, alCerrar }) {
  const { cortes } = datos;

  // Posición de cada cosa en la barra, como porcentaje del puntaje máximo.
  const pct = (valor) => (valor / cortes.maximo) * 100;
  const posicionEquipo = Math.min(pct(datos.puntaje), 100);

  return (
    // Fondo oscuro: tocarlo cierra la ventana (igual que el aviso de acceso
    // restringido de la ficha).
    <div style={estilos.fondo} onClick={alCerrar}>
      <div style={estilos.ventana} onClick={(e) => e.stopPropagation()}>
        <div style={estilos.encabezado}>
          <p style={estilos.titulo}>Nivel de riesgo</p>
          <button type="button" onClick={alCerrar} style={estilos.cerrar} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {/* ─── La barra ─── */}
        <div style={{ position: "relative", margin: "34px 0 6px" }}>
          {/* Marca de este equipo, arriba de la barra. */}
          <div style={{ ...estilos.marca, left: `${posicionEquipo}%` }}>
            <span style={{ ...estilos.marcaTexto, color: COLOR_TEXTO[datos.nivel] }}>
              {num(datos.puntaje)} pts
            </span>
            <div style={estilos.marcaLinea} />
          </div>
          <div style={estilos.barra}>
            <div style={{ width: `${pct(cortes.medio)}%`, background: COLOR_TRAMO.BAJO }} />
            <div style={{ width: `${pct(cortes.alto) - pct(cortes.medio)}%`, background: COLOR_TRAMO.MEDIO }} />
            <div style={{ flex: 1, background: COLOR_TRAMO.ALTO }} />
          </div>
        </div>

        {/* Números de los cortes y nombre de cada tramo, debajo de la barra. */}
        <div style={estilos.escala}>
          <span style={{ position: "absolute", left: 0 }}>0</span>
          <span style={{ ...estilos.centrado, left: `${pct(cortes.medio)}%` }}>{num(cortes.medio)}</span>
          <span style={{ ...estilos.centrado, left: `${pct(cortes.alto)}%` }}>{num(cortes.alto)}</span>
          <span style={{ position: "absolute", right: 0 }}>{cortes.maximo}</span>

          <span style={{ ...estilos.tramo, left: `${pct(cortes.medio) / 2}%`, color: COLOR_TEXTO.BAJO }}>Bajo</span>
          <span style={{ ...estilos.tramo, left: `${(pct(cortes.medio) + pct(cortes.alto)) / 2}%`, color: COLOR_TEXTO.MEDIO }}>Medio</span>
          <span style={{ ...estilos.tramo, left: `${(pct(cortes.alto) + 100) / 2}%`, color: COLOR_TEXTO.ALTO }}>Alto</span>
        </div>

        {/* ─── La fórmula en palabras ─── */}
        <div style={estilos.caja}>
          <p style={estilos.cajaEtiqueta}>Cómo se calcula</p>
          <p style={estilos.formula}>
            Puntaje = criticidad × peso + mantenimiento × peso + antigüedad × peso
          </p>
        </div>

        {/* ─── Los valores de este equipo ─── */}
        <p style={estilos.subtitulo}>Para este equipo</p>
        <Fila
          nombre="Criticidad"
          valor={datos.criticidad}
          peso={datos.alfa0}
          detalle={`de 2 a 10 · función: ${FUNCION[datos.funcion]} · riesgo: ${RIESGO[datos.riesgo_clinico]}`}
        />
        <Fila
          nombre="Mantenimiento"
          valor={datos.tipo_mantenimiento}
          peso={datos.alfa1}
          detalle={`de 1 a 5 · ${MANTENIMIENTO[datos.tipo_mantenimiento]}`}
        />
        <Fila
          nombre="Antigüedad"
          valor={datos.antiguedad}
          peso={datos.alfa2}
          detalle={`de 1 a 5 · ${ANTIGUEDAD[datos.antiguedad]} (tiene ${num(datos.antiguedad_anios)} años)`}
        />
        <div style={estilos.total}>
          <span>Puntaje</span>
          <span style={{ color: COLOR_TEXTO[datos.nivel] }}>
            {num(datos.puntaje)} pts · {datos.nivel}
          </span>
        </div>

        {/* ─── Por qué los pesos valen lo que valen ─── */}
        {datos.motivos_peso.length === 0 ? (
          <p style={estilos.nota}>
            Los pesos valen 1: el equipo tiene reemplazo, soporte y proveedor, y está
            dentro de su vida útil.
          </p>
        ) : (
          <div style={estilos.nota}>
            Los pesos arrancan en 1 y en este equipo suben porque:
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {datos.motivos_peso.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// Una fila de la tabla: nombre, "valor × peso" y qué significa ese valor.
function Fila({ nombre, valor, peso, detalle }) {
  return (
    <div style={estilos.fila}>
      <div style={estilos.filaArriba}>
        <span>{nombre}</span>
        <span style={{ fontWeight: 700 }}>{valor} × {num(peso)}</span>
      </div>
      <p style={estilos.filaDetalle}>{detalle}</p>
    </div>
  );
}

const estilos = {
  fondo: {
    position: "fixed", inset: 0, background: "rgba(15, 23, 32, 0.45)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 16, zIndex: 50,
  },
  ventana: {
    ...cs.tarjeta, padding: 22, width: "100%", maxWidth: 460,
    maxHeight: "90vh", overflowY: "auto", boxSizing: "border-box",
  },
  encabezado: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  titulo: { margin: 0, fontWeight: 700, fontSize: "1rem", color: color.texto },
  cerrar: {
    background: "none", border: "none", cursor: "pointer", padding: 4,
    color: color.textoSuave, display: "flex",
  },

  barra: { display: "flex", height: 12, borderRadius: 6, overflow: "hidden" },
  marca: {
    position: "absolute", top: -28, transform: "translateX(-50%)",
    display: "flex", flexDirection: "column", alignItems: "center",
  },
  marcaTexto: { fontSize: "0.75rem", fontWeight: 700, whiteSpace: "nowrap" },
  marcaLinea: { width: 2, height: 30, background: color.texto, marginTop: 2 },
  escala: {
    position: "relative", height: 36, fontSize: "0.75rem", color: color.textoSuave,
  },
  centrado: { position: "absolute", transform: "translateX(-50%)" },
  tramo: {
    position: "absolute", top: 17, transform: "translateX(-50%)", fontWeight: 700,
  },

  caja: { background: color.fondo, borderRadius: 10, padding: "12px 14px", marginTop: 12 },
  cajaEtiqueta: { margin: "0 0 4px", fontSize: "0.8rem", color: color.textoSuave },
  formula: { margin: 0, fontSize: "0.9rem", lineHeight: 1.5, color: color.texto },

  subtitulo: { margin: "16px 0 4px", fontSize: "0.8rem", color: color.textoSuave },
  fila: { borderBottom: `1px solid ${color.bordeSuave}`, padding: "8px 0" },
  filaArriba: {
    display: "flex", justifyContent: "space-between",
    fontSize: "0.9rem", color: color.texto,
  },
  filaDetalle: { margin: "2px 0 0", fontSize: "0.75rem", color: color.textoDebil },
  total: {
    display: "flex", justifyContent: "space-between", padding: "10px 0 0",
    fontSize: "0.95rem", fontWeight: 700, color: color.texto,
  },
  nota: { margin: "14px 0 0", fontSize: "0.82rem", lineHeight: 1.5, color: color.textoSuave },
};
