// Cascaron.jsx — el marco que rodea a todas las pantallas de adentro.
//
// Contiene lo que es igual para todos: la barra de arriba (saludo,
// notificaciones, ajustes) y el menú de navegación. Lo único que cambia según
// el rol es QUÉ ítems tiene ese menú.
//
// En compu el menú es una barra lateral oscura; en celular pasa abajo, como
// pestañas. Es el mismo componente: solo cambia dónde se dibuja.

import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { obtenerPerfil, logout } from "../api/auth";
import { color } from "../tema";

// ─── Qué ve cada rol ──────────────────────────────────────────────────────
// Escanear va primero para todos: cualquiera puede sacar la ficha de un
// equipo, y es la acción más frecuente.
// "listo: false" = la pantalla todavía no existe. Se muestra apagada, para
// que no lleve a una pantalla en blanco.
const MENUS = {
  enfermeria: [
    { id: "escanear", texto: "Escanear", ruta: "/escanear", icono: "qr", listo: true },
    { id: "solicitudes", texto: "Mis solicitudes", ruta: "/solicitudes", icono: "bandeja", listo: true },
  ],
  tecnico: [
    { id: "escanear", texto: "Escanear", ruta: "/escanear", icono: "qr", listo: true },
    { id: "ot", texto: "Mis órdenes", ruta: "/ordenes", icono: "orden", listo: true },
    { id: "activos", texto: "Equipos", ruta: "/activos", icono: "equipo", listo: true },
    { id: "insumos", texto: "Insumos", ruta: "/insumos", icono: "caja", listo: false },
  ],
  coordinacion: [
    { id: "escanear", texto: "Escanear", ruta: "/escanear", icono: "qr", listo: true },
    { id: "solicitudes", texto: "Solicitudes", ruta: "/pendientes", icono: "bandeja", listo: true },
    { id: "ot", texto: "Órdenes", ruta: "/ordenes", icono: "orden", listo: true },
    { id: "activos", texto: "Equipos", ruta: "/activos", icono: "equipo", listo: true },
    { id: "mp", texto: "Mantenimientos", ruta: "/mantenimientos", icono: "calendario", listo: false },
    { id: "insumos", texto: "Insumos", ruta: "/insumos", icono: "caja", listo: false },
  ],
  jefatura: [
    { id: "escanear", texto: "Escanear", ruta: "/escanear", icono: "qr", listo: true },
    { id: "dashboard", texto: "Dashboard", ruta: "/dashboard", icono: "grafico", listo: false },
    { id: "ot", texto: "Órdenes", ruta: "/ordenes", icono: "orden", listo: true },
    { id: "activos", texto: "Equipos", ruta: "/activos", icono: "equipo", listo: true },
    { id: "mp", texto: "Mantenimientos", ruta: "/mantenimientos", icono: "calendario", listo: false },
  ],
};

function Cascaron() {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const [perfil, setPerfil] = useState(null);
  const esCelular = usarEsCelular();

  // Pedimos el perfil una sola vez, cuando se monta el cascarón. Como el
  // cascarón NO se desmonta al cambiar de pantalla, no se repite en cada
  // navegación.
  useEffect(() => {
    obtenerPerfil().then(setPerfil).catch(() => setPerfil(null));
  }, []);

  // 'junior' usa el mismo menú que 'tecnico' (mismos permisos en el backend).
  const rol = perfil?.rol === "junior" ? "tecnico" : perfil?.rol;
  const items = MENUS[rol] || [];

  function irA(item) {
    if (!item.listo) return;   // las pantallas que faltan no navegan
    navegar(item.ruta);
  }

  function cerrarSesion() {
    logout();
    navegar("/");
  }

  const activo = (item) => ubicacion.pathname.startsWith(item.ruta);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: color.fondo }}>

      {/* ─── Menú lateral (solo en compu) ─── */}
      {!esCelular && (
        <nav style={estilos.lateral}>
          <div style={estilos.marca}>
            <span style={estilos.logoChico}>S</span>
            <span style={estilos.marcaTexto}>SYNAP</span>
          </div>
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => irA(item)}
              style={{
                ...estilos.itemLateral,
                ...(activo(item) ? estilos.itemLateralActivo : {}),
                opacity: item.listo ? 1 : 0.4,
                cursor: item.listo ? "pointer" : "default",
              }}
            >
              <Icono nombre={item.icono} />
              <span>{item.texto}</span>
              {!item.listo && <span style={estilos.pronto}>pronto</span>}
            </div>
          ))}
        </nav>
      )}

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>

        {/* ─── Barra de arriba ─── */}
        <header style={estilos.barraArriba}>
          <div>
            <p style={estilos.saludo}>
              {perfil ? `Hola, ${perfil.nombre}!` : "Hola!"}
            </p>
            <p style={estilos.rolTexto}>{etiquetaRol(perfil?.rol)}</p>
          </div>

          <div style={estilos.iconosArriba}>
            {/* Todavía no hacen nada: las pantallas no existen. Están acá para
            que el lugar quede reservado y no haya que rediseñar después. */}
            <button style={estilos.iconoBoton} title="Notificaciones">
              <Icono nombre="campana" color={color.textoSuave} />
            </button>
            <button style={estilos.iconoBoton} title="Ajustes">
              <Icono nombre="rueda" color={color.textoSuave} />
            </button>
            <div style={estilos.avatar} onClick={cerrarSesion} title="Cerrar sesión">
              {iniciales(perfil)}
            </div>
          </div>
        </header>

        {/* ─── Acá se dibuja cada pantalla ─── */}
        <main style={{ flex: 1, padding: esCelular ? "16px 16px 84px" : "22px 26px" }}>
          <Outlet />
        </main>
      </div>

      {/* ─── Pestañas de abajo (solo en celular) ─── */}
      {esCelular && (
        <nav style={estilos.barraAbajo}>
          {items.filter((i) => i.listo).map((item) => (
            <div
              key={item.id}
              onClick={() => irA(item)}
              style={{
                ...estilos.itemAbajo,
                color: activo(item) ? color.primario : color.textoSuave,
              }}
            >
              <Icono nombre={item.icono} color={activo(item) ? color.primario : color.textoSuave} />
              <span style={{ fontSize: "0.65rem" }}>{item.texto}</span>
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Piezas chicas
// ─────────────────────────────────────────────────────────────────────────

// ¿Estamos en una pantalla angosta? No se puede usar una media query de CSS
// con estilos inline, así que la escuchamos desde JavaScript.
function usarEsCelular() {
  const [esCelular, setEsCelular] = useState(window.innerWidth < 768);
  useEffect(() => {
    const consulta = window.matchMedia("(max-width: 767px)");
    const alCambiar = (e) => setEsCelular(e.matches);
    consulta.addEventListener("change", alCambiar);
    return () => consulta.removeEventListener("change", alCambiar);
  }, []);
  return esCelular;
}

function etiquetaRol(rol) {
  const nombres = {
    enfermeria: "Enfermería",
    tecnico: "Técnico",
    junior: "Técnico junior",
    coordinacion: "Coordinación",
    jefatura: "Jefatura",
  };
  return nombres[rol] || "";
}

function iniciales(perfil) {
  if (!perfil) return "?";
  return `${perfil.nombre?.[0] || ""}${perfil.apellido?.[0] || ""}`.toUpperCase();
}

// Íconos en SVG, sin librerías. Algunos necesitan círculos además de líneas
// (la campana, los controles de ajustes), por eso el ícono puede tener las dos
// cosas y no solo un trazo.
function Icono({ nombre, color: c = "currentColor" }) {
  const iconos = {
    qr: { trazos: ["M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM19 19h2v2h-2z"] },
    bandeja: { trazos: ["M3 13h5l2 3h4l2-3h5M4 4h16l1 9v7H3v-7z"] },
    orden: { trazos: ["M9 3h6v3H9zM5 6h14v15H5zM9 12h6M9 16h4"] },
    equipo: { trazos: ["M4 5h16v11H4zM9 20h6M12 16v4M8 10h2l1.5-3 2 6 1.5-3h2"] },
    caja: { trazos: ["M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7"] },
    calendario: { trazos: ["M4 5h16v16H4zM4 10h16M8 3v4M16 3v4M9 15h2"] },
    grafico: { trazos: ["M4 20V10M10 20V4M16 20v-7M22 20H2"] },
    campana: {
      trazos: ["M6 9a6 6 0 1112 0c0 6 2 7 2 7H4s2-1 2-7", "M10 20a2 2 0 004 0"],
    },
    // Controles deslizantes en vez de engranaje: a 19 píxeles se lee mejor y
    // significa lo mismo.
    rueda: {
      trazos: ["M4 8h9", "M18 8h2", "M4 16h4", "M13 16h7"],
      circulos: [{ cx: 15.5, cy: 8, r: 2.2 }, { cx: 10.5, cy: 16, r: 2.2 }],
    },
  };

  const icono = iconos[nombre] || { trazos: [] };

  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }} aria-hidden="true">
      {icono.trazos.map((d, i) => <path key={i} d={d} />)}
      {(icono.circulos || []).map((c2, i) => <circle key={`c${i}`} {...c2} />)}
    </svg>
  );
}

const estilos = {
  lateral: {
    width: 240,
    background: color.lateral,
    padding: "18px 0",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  marca: { display: "flex", alignItems: "center", gap: 10, padding: "0 22px 20px" },
  logoChico: {
    width: 28, height: 28, borderRadius: 8, background: color.primario, color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.85rem",
  },
  marcaTexto: { color: "#fff", fontSize: "1rem", letterSpacing: "0.09em", fontWeight: 600 },
  itemLateral: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "11px 22px", color: color.lateralTexto, fontSize: "0.88rem",
    borderLeft: "3px solid transparent",
  },
  itemLateralActivo: {
    background: color.lateralActivo, color: "#fff", borderLeftColor: color.primario,
  },
  pronto: {
    marginLeft: "auto", fontSize: "0.6rem", color: color.lateralTextoTenue,
    border: `1px solid ${color.lateralTextoTenue}`, borderRadius: 4, padding: "1px 5px",
  },
  barraArriba: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 14, padding: "14px 22px", background: color.tarjeta,
    borderBottom: `1px solid ${color.borde}`,
  },
  saludo: { margin: 0, fontSize: "1rem", color: color.texto, fontWeight: 700 },
  rolTexto: { margin: "1px 0 0", fontSize: "0.76rem", color: color.textoSuave },
  iconosArriba: { display: "flex", alignItems: "center", gap: 6 },
  iconoBoton: {
    background: "transparent", border: "none", cursor: "pointer",
    padding: 7, borderRadius: 8, display: "flex",
  },
  avatar: {
    width: 32, height: 32, borderRadius: "50%", background: color.primarioClaro,
    color: color.primarioOscuro, display: "flex", alignItems: "center",
    justifyContent: "center", fontSize: "0.72rem", fontWeight: 700,
    cursor: "pointer", marginLeft: 4,
  },
  barraAbajo: {
    position: "fixed", bottom: 0, left: 0, right: 0,
    background: color.tarjeta, borderTop: `1px solid ${color.borde}`,
    display: "flex", padding: "8px 0 12px", zIndex: 10,
  },
  itemAbajo: {
    flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
    gap: 3, cursor: "pointer",
  },
};

export default Cascaron;