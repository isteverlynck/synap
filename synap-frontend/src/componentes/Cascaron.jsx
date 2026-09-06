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
import {
  QrCode, Inbox, ClipboardList, HeartPulse, Package,
  CalendarClock, BarChart3, Bell,
} from "lucide-react";

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
    { id: "ot", texto: "Órdenes", ruta: "/ordenes", icono: "orden", listo: false },
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
              className={item.listo ? "sy-item-menu" : "sy-item-menu sy-item-menu-inactivo"}
              style={{
                ...estilos.itemLateral,
                ...(activo(item) ? estilos.itemLateralActivo : {}),
                opacity: item.listo ? 1 : 0.4,
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
            <button style={estilos.iconoBoton} title="Notificaciones">
              <Icono nombre="campana" color={color.textoSuave} />
            </button>
            {/* El avatar lleva a Mi cuenta, donde vive el cerrar sesión. Antes
            cerraba la sesión de una: un click sin querer te sacaba. */}
            <div
              style={estilos.avatar}
              onClick={() => navegar("/perfil")}
              className="sy-clickeable"
              title="Mi cuenta"
            >
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

// Los íconos vienen de lucide-react. Cada uno es un componente de React, así
// que los guardamos en un mapa y elegimos por nombre, igual que antes — pero
// sin dibujar trazos a mano.
const ICONOS = {
  qr: QrCode,
  bandeja: Inbox,
  orden: ClipboardList,
  equipo: HeartPulse,
  caja: Package,
  calendario: CalendarClock,
  grafico: BarChart3,
  campana: Bell,
};

function Icono({ nombre, color: c = "currentColor" }) {
  const Componente = ICONOS[nombre];
  if (!Componente) return null;
  return <Componente size={19} strokeWidth={1.7} color={c} aria-hidden="true" />;
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
    gap: 14, padding: "20px 28px", background: color.tarjeta,
    borderBottom: `1px solid ${color.borde}`,
  },
  saludo: { margin: 0, fontSize: "1.4rem", color: color.texto, fontWeight: 700 },
  rolTexto: { margin: "3px 0 0", fontSize: "0.88rem", color: color.textoSuave },
  iconosArriba: { display: "flex", alignItems: "center", gap: 12 },
  iconoBoton: {
    background: "transparent", border: "none", cursor: "pointer",
    padding: 9, borderRadius: 10, display: "flex",
  },
  avatar: {
    width: 42, height: 42, borderRadius: "50%", background: color.primarioClaro,
    color: color.primarioOscuro, display: "flex", alignItems: "center",
    justifyContent: "center", fontSize: "0.88rem", fontWeight: 700,
    marginLeft: 4,
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