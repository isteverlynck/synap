// Encabezado.jsx — barra superior que comparten todas las pantallas
// protegidas (Activos, Solicitudes, Escanear QR, Ficha del equipo). Muestra
// el título de la pantalla (con la marca SYNAP) a la izquierda, y a la
// derecha los botones que le pasa cada pantalla como "children" — por
// ejemplo "Escanear equipo" o "Cerrar sesión". Así todas las pantallas
// tienen el mismo encabezado sin repetir el mismo bloque de estilos en cada
// archivo.

import { color } from "../tema";

function Encabezado({ titulo, subtitulo, children }) {
  return (
    <header style={estilos.header}>
      <div style={estilos.marca}>
        <span style={estilos.logo}>S</span>
        <div>
          <h1 style={estilos.titulo}>{titulo}</h1>
          {subtitulo && <p style={estilos.subtitulo}>{subtitulo}</p>}
        </div>
      </div>
      {children && <div style={estilos.acciones}>{children}</div>}
    </header>
  );
}

const estilos = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    paddingBottom: 16,
    marginBottom: 20,
    borderBottom: `1px solid ${color.borde}`,
  },
  marca: { display: "flex", alignItems: "center", gap: 12 },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 11,
    background: color.primario,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: "1.05rem",
    flexShrink: 0,
  },
  titulo: { margin: 0, fontSize: "1.35rem", color: color.texto, lineHeight: 1.25, fontWeight: 700 },
  subtitulo: { margin: "2px 0 0", fontSize: "0.82rem", color: color.textoSuave },
  acciones: { display: "flex", gap: 10, flexWrap: "wrap" },
};

export default Encabezado;