// Cascaron.jsx — el marco que rodea a todas las pantallas de adentro.
//
// Contiene lo que es igual para todos: la barra de arriba (saludo,
// notificaciones, ajustes) y el menú de navegación. Lo único que cambia según
// el rol es QUÉ ítems tiene ese menú.
//
// En compu el menú es una barra lateral oscura; en celular pasa abajo, como
// pestañas. Es el mismo componente: solo cambia dónde se dibuja.

import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { obtenerPerfil, logout } from "../api/auth";
import { descargarCSV } from "../api/exportar";
import { toast } from "sonner";
import { color } from "../tema";
import {
  QrCode, Inbox, ClipboardList, HeartPulse, Package,
  CalendarClock, CalendarDays, BarChart3, Bell, Boxes, Download,
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
    { id: "calendario-mp", texto: "Calendario MP", ruta: "/calendario-mp", icono: "calendario-dias", listo: true },
    { id: "insumos", texto: "Insumos", ruta: "/insumos", icono: "caja", listo: true },
  ],
  coordinacion: [
    { id: "escanear", texto: "Escanear", ruta: "/escanear", icono: "qr", listo: true },
    { id: "solicitudes", texto: "Solicitudes", ruta: "/pendientes", icono: "bandeja", listo: true },
    { id: "ot", texto: "Órdenes", ruta: "/ordenes", icono: "orden", listo: true },
    { id: "activos", texto: "Equipos", ruta: "/activos", icono: "equipo", listo: true },
    { id: "mp", texto: "Mantenimientos", ruta: "/mantenimientos", icono: "calendario", listo: true },
    { id: "calendario-mp", texto: "Calendario MP", ruta: "/calendario-mp", icono: "calendario-dias", listo: true },
    { id: "insumos", texto: "Insumos", ruta: "/insumos", icono: "caja", listo: true },
    // Tipos de equipo y servicios/áreas: antes solo se cargaban a mano en la
    // base. Coordinación es quien los da de alta (ej: entra un tipo de
    // equipo nuevo), por eso vive en su menú y en el de jefatura.
    { id: "catalogos", texto: "Catálogos", ruta: "/catalogos", icono: "catalogos", listo: true },
  ],
  jefatura: [
    { id: "escanear", texto: "Escanear", ruta: "/escanear", icono: "qr", listo: true },
    { id: "dashboard", texto: "Dashboard", ruta: "/dashboard", icono: "grafico", listo: true },
    { id: "activos", texto: "Equipos", ruta: "/activos", icono: "equipo", listo: true },
    { id: "mp", texto: "Mantenimientos", ruta: "/mantenimientos", icono: "calendario", listo: true },
    { id: "calendario-mp", texto: "Calendario MP", ruta: "/calendario-mp", icono: "calendario-dias", listo: true },
    { id: "insumos", texto: "Insumos", ruta: "/insumos", icono: "caja", listo: true },
    { id: "catalogos", texto: "Catálogos", ruta: "/catalogos", icono: "catalogos", listo: true },
  ],
};

const DESCARGAS = [
  { texto: "Descargar CSV de activos", ruta: "/exportar/activos", archivo: "equipos",
    roles: ["tecnico", "coordinacion", "jefatura"] },
  { texto: "Descargar CSV de órdenes", ruta: "/exportar/ordenes", archivo: "ordenes",
    roles: ["tecnico", "coordinacion"] },
  { texto: "Descargar CSV de insumos", ruta: "/exportar/insumos", archivo: "insumos",
    roles: ["tecnico", "coordinacion", "jefatura"] },
  { texto: "Descargar CSV de mantenimientos", ruta: "/exportar/mantenimientos", archivo: "mantenimientos",
    roles: ["tecnico", "coordinacion", "jefatura"] },
];

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

  // Menú de descargas: qué opciones tiene este rol, y si está abierto.
  const descargas = DESCARGAS.filter((d) => d.roles.includes(rol));
  const [descargasAbierto, setDescargasAbierto] = useState(false);
  const cajaDescargas = useRef(null);

  // Si el menú de descargas está abierto y se toca en otro lado, se cierra.
  useEffect(() => {
    if (!descargasAbierto) return;
    function alTocarAfuera(e) {
      if (cajaDescargas.current && !cajaDescargas.current.contains(e.target)) {
        setDescargasAbierto(false);
      }
    }
    document.addEventListener("mousedown", alTocarAfuera);
    return () => document.removeEventListener("mousedown", alTocarAfuera);
  }, [descargasAbierto]);

  function descargar(d) {
    setDescargasAbierto(false);
    descargarCSV(d.ruta, d.archivo).catch(() => toast.error("No se pudo descargar la tabla."));
  }

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
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            {/* En celular no está el menú lateral (que es donde va el logo),
            así que lo mostramos acá, a la izquierda del saludo. */}
            {esCelular && (
              <span style={{ ...estilos.logoChico, width: 38, height: 38, fontSize: "1.05rem", flexShrink: 0 }}>
                S
              </span>
            )}
            <div>
              <p style={estilos.saludo}>
                {perfil ? `Hola, ${perfil.nombre}!` : "Hola!"}
              </p>
              <p style={estilos.rolTexto}>{etiquetaRol(perfil?.rol)}</p>
            </div>
          </div>

          <div style={estilos.iconosArriba}>
            {/* Descargas en CSV: solo aparece si el rol tiene algo para bajar. */}
            {descargas.length > 0 && (
              <div ref={cajaDescargas} style={{ position: "relative" }}>
                <button
                  style={estilos.iconoBoton}
                  title="Descargar tablas"
                  onClick={() => setDescargasAbierto(!descargasAbierto)}
                >
                  <Icono nombre="descargar" color={color.textoSuave} />
                </button>
                {descargasAbierto && (
                  <div style={estilos.menuDescargas}>
                    {descargas.map((d) => (
                      <button
                        key={d.ruta}
                        className="sy-clickeable"
                        style={estilos.opcionDescarga}
                        onClick={() => descargar(d)}
                      >
                        {d.texto}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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
                color: activo(item) ? "#fff" : color.lateralTexto,
              }}
            >
              <Icono nombre={item.icono} color={activo(item) ? "#fff" : color.lateralTexto} />
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
  "calendario-dias": CalendarDays,
  grafico: BarChart3,
  campana: Bell,
  catalogos: Boxes,
  descargar: Download,
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
    // Fijo en pantalla: si el contenido de la derecha es más largo que la
    // ventana, el menú se queda quieto en vez de scrollear con el resto.
    position: "sticky",
    top: 0,
    height: "100vh",
    overflowY: "auto",
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
    // Las tres por separado, no el atajo `borderLeft`: si mezclás atajo y
    // propiedad suelta, React deja el borde con el color anterior al
    // desactivar el ítem y queda una línea clara al costado.
    borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: "transparent",
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
  menuDescargas: {
    position: "absolute", top: "100%", right: 0, marginTop: 4, zIndex: 30,
    background: color.tarjeta, border: `1px solid ${color.borde}`, borderRadius: 10,
    boxShadow: "0 6px 20px rgba(15,20,30,0.12)", padding: 4, minWidth: 220,
  },
  opcionDescarga: {
    display: "block", width: "100%", background: "transparent", border: "none",
    borderRadius: 8, cursor: "pointer", padding: "9px 12px", fontSize: "0.88rem",
    color: color.texto, fontFamily: "inherit", textAlign: "left", whiteSpace: "nowrap",
  },
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
    background: color.lateral, borderTop: `1px solid ${color.lateral}`,
    display: "flex", padding: "8px 0 12px", zIndex: 10,
  },
  itemAbajo: {
    flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
    gap: 3, cursor: "pointer",
    // Si el texto se parte en dos renglones (ej. "Calendario MP"), que
    // queden centrados bajo el ícono y no alineados a la izquierda.
    textAlign: "center",
  },
};

export default Cascaron;