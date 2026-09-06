// // FichaActivo.jsx — ficha básica de un equipo: sus datos + historial de
// // órdenes de trabajo, fallas y mantenimientos.
// //
// // Por ahora la usan técnicos, coordinación y jefatura al escanear un QR (esos
// // roles todavía no tienen una pantalla de inicio propia). Es un placeholder
// // simple: cuando armemos las pantallas definitivas de cada rol, esta ficha va
// // a servir de base para agregarles las acciones que le correspondan a cada uno
// // (ej: técnico marca la OT en progreso, coordinación asigna, etc.).

// import { useEffect, useState } from "react";
// import { useNavigate, useParams } from "react-router-dom";
// import { logout } from "../api/auth";
// import { verActivoDetalle } from "../api/activos";
// import Encabezado from "../componentes/Encabezado";
// import { color, cs, boton, insignia, tonoEstadoActivo } from "../tema";

// function FichaActivo() {
//   const { codigo } = useParams();
//   const navegar = useNavigate();
//   const [activo, setActivo] = useState(null);
//   const [cargando, setCargando] = useState(true);
//   const [error, setError] = useState("");

//   useEffect(() => {
//     setCargando(true);
//     setError("");
//     verActivoDetalle(codigo)
//       .then(setActivo)
//       .catch(() => setError(`No encontramos el equipo "${codigo}".`))
//       .finally(() => setCargando(false));
//   }, [codigo]);

//   function cerrarSesion() {
//     logout();
//     navegar("/");
//   }

//   if (cargando) {
//     return (
//       <div style={cs.pagina}>
//         <div style={cs.contenido}><p style={estilos.mensaje}>Cargando ficha del equipo...</p></div>
//       </div>
//     );
//   }

//   if (error) {
//     return (
//       <div style={cs.pagina}>
//         <div style={cs.contenido}>
//           <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>
//           <button style={boton("secundario")} onClick={() => navegar("/escanear")}>
//             Escanear de nuevo
//           </button>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div style={cs.pagina}>
//       <div style={cs.contenido}>
//         <Encabezado titulo={activo.codigo} subtitulo={activo.descripcion}>
//           <button style={boton("secundario")} onClick={() => navegar("/escanear")}>Escanear otro</button>
//           <button style={boton("fantasma")} onClick={cerrarSesion}>Cerrar sesión</button>
//         </Encabezado>

//         <div style={estilos.tarjetaDatos}>
//           <Dato etiqueta="Estado" valor={<span style={insignia(tonoEstadoActivo(activo.estado))}>{activo.estado}</span>} />
//           <Dato etiqueta="Marca / Modelo" valor={[activo.marca, activo.modelo].filter(Boolean).join(" ") || "—"} />
//           <Dato etiqueta="N° de serie" valor={activo.numero_serie || "—"} />
//           <Dato etiqueta="Ubicación" valor={activo.ubicacion || "—"} />
//         </div>

//         <Seccion titulo={`Órdenes de trabajo (${activo.ordenes_de_trabajo.length})`}>
//           {activo.ordenes_de_trabajo.length === 0 && <p style={estilos.vacio}>Sin órdenes de trabajo registradas.</p>}
//           {activo.ordenes_de_trabajo.map((ot) => (
//             <div key={ot.id} style={estilos.item}>
//               <span><strong>OT #{ot.numero_ot}</strong> — {ot.tipo}</span>
//               <span style={insignia("primario")}>{ot.estado}</span>
//               {ot.prioridad && <span style={estilos.detalle}>Prioridad: {ot.prioridad}</span>}
//             </div>
//           ))}
//         </Seccion>

//         <Seccion titulo={`Fallas (${activo.fallas.length})`}>
//           {activo.fallas.length === 0 && <p style={estilos.vacio}>Sin fallas registradas.</p>}
//           {activo.fallas.map((f) => (
//             <div key={f.id} style={estilos.item}>
//               <span>{f.tipo_falla || "Falla"}</span>
//               <span style={insignia("advertencia")}>{f.estado}</span>
//               {f.severidad && <span style={estilos.detalle}>Severidad: {f.severidad}</span>}
//             </div>
//           ))}
//         </Seccion>

//         <Seccion titulo={`Mantenimientos (${activo.mantenimientos.length})`}>
//           {activo.mantenimientos.length === 0 && <p style={estilos.vacio}>Sin mantenimientos registrados.</p>}
//           {activo.mantenimientos.map((m) => (
//             <div key={m.id} style={estilos.item}>
//               <span>Programado: {m.fecha_programada}</span>
//               <span style={insignia("neutro")}>{m.estado}</span>
//               {m.fecha_realizada && <span style={estilos.detalle}>Realizado: {m.fecha_realizada}</span>}
//             </div>
//           ))}
//         </Seccion>
//       </div>
//     </div>
//   );
// }

// function Dato({ etiqueta, valor }) {
//   return (
//     <div style={estilos.dato}>
//       <div style={estilos.datoEtiqueta}>{etiqueta}</div>
//       <div style={estilos.datoValor}>{valor}</div>
//     </div>
//   );
// }

// function Seccion({ titulo, children }) {
//   return (
//     <div style={estilos.seccion}>
//       <h2 style={estilos.tituloSeccion}>{titulo}</h2>
//       <div style={estilos.listaItems}>{children}</div>
//     </div>
//   );
// }

// const estilos = {
//   mensaje: { color: color.textoSuave, padding: "20px 0" },
//   tarjetaDatos: {
//     ...cs.tarjeta,
//     padding: 22,
//     marginBottom: 26,
//     display: "grid",
//     gridTemplateColumns: "1fr 1fr",
//     gap: 18,
//   },
//   dato: { fontSize: "0.95rem" },
//   datoEtiqueta: { fontSize: "0.72rem", color: color.textoDebil, textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 4, fontWeight: 600 },
//   datoValor: { color: color.texto, fontWeight: 500 },
//   seccion: { marginBottom: 24 },
//   tituloSeccion: { fontSize: "1rem", color: color.texto, marginBottom: 10, fontWeight: 700 },
//   listaItems: { display: "flex", flexDirection: "column", gap: 8 },
//   item: {
//     ...cs.tarjeta,
//     padding: "12px 16px",
//     fontSize: "0.9rem",
//     color: color.texto,
//     display: "flex",
//     alignItems: "center",
//     gap: 12,
//     flexWrap: "wrap",
//   },
//   detalle: { color: color.textoSuave, fontSize: "0.82rem" },
//   vacio: { color: color.textoSuave, fontSize: "0.9rem" },
// };

// export default FichaActivo;

// FichaActivo.jsx — la ficha del equipo. Es la pantalla central del sistema:
// cualquier rol llega acá al escanear un QR, y desde acá hace lo que su rol le
// permita.
//
// La estructura es siempre la misma para todos (aviso de estado, datos,
// responsable, historial). Lo único que cambia según quién mira son los botones
// de abajo — igual que requiere_rol() en el backend, pero en pantalla.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { logout, rolActual } from "../api/auth";
import { verActivoDetalle } from "../api/activos";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton, insignia, estadoDelEquipo } from "../tema";

function FichaActivo() {
  const { codigo } = useParams();
  const navegar = useNavigate();
  const rol = rolActual();
  const [activo, setActivo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setCargando(true);
    setError("");
    verActivoDetalle(codigo)
      .then(setActivo)
      .catch(() => setError(`No encontramos el equipo "${codigo}".`))
      .finally(() => setCargando(false));
  }, [codigo]);

  function cerrarSesion() {
    logout();
    navegar("/");
  }

  if (cargando) {
    return (
      <div style={cs.pagina}>
        <div style={cs.contenido}><p style={estilos.mensaje}>Cargando ficha del equipo...</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={cs.pagina}>
        <div style={cs.contenido}>
          <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>
          <button style={boton("secundario")} onClick={() => navegar("/escanear")}>
            Escanear de nuevo
          </button>
        </div>
      </div>
    );
  }

  // Todo lo del cartel de estado sale de una sola función (ver tema.js): qué
  // color, qué dice, y qué acción ofrecer.
  const situacion = estadoDelEquipo(activo);
  const abiertas = activo.ordenes_de_trabajo.filter((ot) => ot.estado !== "CERRADA");
  const cerradas = activo.ordenes_de_trabajo.filter((ot) => ot.estado === "CERRADA");

  return (
    <div style={cs.pagina}>
      <div style={cs.contenido}>
        <Encabezado titulo="Ficha del equipo">
          <button style={boton("secundario")} onClick={() => navegar("/escanear")}>Escanear otro</button>
          <button style={boton("fantasma")} onClick={cerrarSesion}>Cerrar sesión</button>
        </Encabezado>

        {/* Aviso de estado: ancho completo y ANTES del nombre del equipo, para
        que alguien apurado en un pasillo lo vea sin leer. */}
        <AvisoEstado situacion={situacion} />

        <h2 style={estilos.nombreEquipo}>{activo.descripcion}</h2>
        <p style={estilos.codigo}>{activo.codigo}</p>

        <div style={estilos.tarjetaDatos}>
          <Dato etiqueta="Marca y modelo" valor={[activo.marca, activo.modelo].filter(Boolean).join(" ") || "—"} />
          <Dato etiqueta="Ubicación" valor={activo.ubicacion || "—"} />
          <Dato etiqueta="N° de serie" valor={activo.numero_serie || "—"} />
          <Dato etiqueta="Próximo preventivo" valor={formatearFecha(activo.proxima_fecha_mp)} />
        </div>

        {/* El responsable no es un dato más: es una acción. Cumple el objetivo
        de contacto directo con el bioingeniero. */}
        {activo.responsable_nombre && (
          <div style={estilos.responsable}>
            <div>
              <div style={estilos.datoEtiqueta}>Bioingeniero responsable</div>
              <div style={estilos.datoValor}>{activo.responsable_nombre}</div>
            </div>
            {activo.responsable_email && (
              <a href={`mailto:${activo.responsable_email}`} style={{ ...boton("secundario"), textDecoration: "none" }}>
                Contactar
              </a>
            )}
          </div>
        )}

        <Acciones
          rol={rol}
          situacion={situacion}
          activo={activo}
          navegar={navegar}
        />

        <Seccion titulo="Historial">
          {abiertas.map((ot) => (
            <ItemHistorial
              key={ot.id}
              titulo={`OT-${String(ot.numero_ot).padStart(4, "0")} · ${ot.tipo}`}
              detalle={`Abierta el ${formatearFecha(ot.fecha_apertura)}`}
              tono="advertencia"
              estado={ot.estado}
            />
          ))}
          {cerradas.slice(0, 5).map((ot) => (
            <ItemHistorial
              key={ot.id}
              titulo={`OT-${String(ot.numero_ot).padStart(4, "0")} · ${ot.tipo}`}
              detalle={`Cerrada`}
              tono="neutro"
              estado={ot.estado}
            />
          ))}
          {activo.mantenimientos.slice(0, 5).map((m) => (
            <ItemHistorial
              key={m.id}
              titulo="Mantenimiento preventivo"
              detalle={`Programado: ${formatearFecha(m.fecha_programada)}`}
              tono={m.fecha_realizada ? "exito" : "neutro"}
              estado={m.estado}
            />
          ))}
          {activo.ordenes_de_trabajo.length === 0 && activo.mantenimientos.length === 0 && (
            <p style={estilos.vacio}>Este equipo todavía no tiene historial registrado.</p>
          )}
        </Seccion>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Aviso de estado
// ─────────────────────────────────────────────────────────────────────────

function AvisoEstado({ situacion }) {
  const fondos = {
    exito: color.exitoFondo,
    advertencia: color.advertenciaFondo,
    peligro: color.peligroFondo,
    neutro: color.bordeSuave,
  };
  const textos = {
    exito: color.exito,
    advertencia: color.advertencia,
    peligro: color.peligro,
    neutro: color.textoSuave,
  };

  // El de baja va más grande a propósito: no puede leerse igual que los otros.
  const esBaja = situacion.tono === "peligro";

  return (
    <div style={{ ...estilos.aviso, background: fondos[situacion.tono] }}>
      <div style={{
        ...estilos.avisoTitulo,
        color: textos[situacion.tono],
        fontSize: esBaja ? "1.1rem" : "0.98rem",
      }}>
        {situacion.titulo}
      </div>
      <div style={{ ...estilos.avisoDetalle, color: textos[situacion.tono] }}>
        {situacion.detalle}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Acciones según rol y estado
// ─────────────────────────────────────────────────────────────────────────

function Acciones({ rol, situacion, activo, navegar }) {
  const acciones = [];

  // La acción principal la manda el ESTADO, no el rol: si el equipo está de
  // baja o ya tiene una OT abierta, nadie reporta un problema nuevo. Así no se
  // juntan cinco solicitudes del mismo monitor el mismo día.
  if (situacion.accion === "reportar" && rol === "enfermeria") {
    acciones.push({
      texto: "Reportar un problema",
      variante: "primario",
      onClick: () => navegar(`/solicitudes?activo=${activo.codigo}`),
    });
  }
  if (situacion.accion === "ver_ot") {
    acciones.push({
      texto: "Ver estado de la reparación",
      variante: "secundario",
      onClick: () => navegar(`/ordenes/${situacion.otId}`),
    });
  }

  // Acciones propias de cada rol, sobre las que ya decidió el estado.
  if (rol === "tecnico" || rol === "junior") {
    acciones.push({ texto: "Abrir OT", variante: "secundario", onClick: () => navegar(`/ordenes/nueva?activo=${activo.codigo}`) });
  }
  if (rol === "coordinacion") {
    acciones.push({ texto: "Abrir OT", variante: "secundario", onClick: () => navegar(`/ordenes/nueva?activo=${activo.codigo}`) });
    acciones.push({ texto: "Ver plan de mantenimiento", variante: "secundario", onClick: () => navegar(`/mantenimientos?activo=${activo.codigo}`) });
  }

  if (acciones.length === 0) return null;

  return (
    <div style={estilos.acciones}>
      {acciones.map((a) => (
        <button key={a.texto} style={{ ...boton(a.variante), flex: 1 }} onClick={a.onClick}>
          {a.texto}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Piezas chicas
// ─────────────────────────────────────────────────────────────────────────

// Las fechas vienen del backend en UTC: las mostramos en formato local.
function formatearFecha(valor) {
  if (!valor) return "—";
  const f = new Date(valor);
  if (isNaN(f)) return "—";
  return f.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

function Dato({ etiqueta, valor }) {
  return (
    <div>
      <div style={estilos.datoEtiqueta}>{etiqueta}</div>
      <div style={estilos.datoValor}>{valor}</div>
    </div>
  );
}

function Seccion({ titulo, children }) {
  return (
    <div style={{ marginTop: 26 }}>
      <h2 style={estilos.tituloSeccion}>{titulo}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function ItemHistorial({ titulo, detalle, tono, estado }) {
  return (
    <div style={estilos.item}>
      <div>
        <div style={{ color: color.texto, fontWeight: 500 }}>{titulo}</div>
        <div style={estilos.detalle}>{detalle}</div>
      </div>
      <span style={{ ...insignia(tono), marginLeft: "auto" }}>{estado}</span>
    </div>
  );
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "20px 0" },
  aviso: { borderRadius: 12, padding: "14px 16px", marginBottom: 20 },
  avisoTitulo: { fontWeight: 700, marginBottom: 2 },
  avisoDetalle: { fontSize: "0.85rem" },
  nombreEquipo: { margin: "0 0 2px", fontSize: "1.3rem", color: color.texto, fontWeight: 700 },
  codigo: { margin: "0 0 18px", fontSize: "0.85rem", color: color.textoSuave, fontFamily: "ui-monospace, monospace" },
  tarjetaDatos: {
    ...cs.tarjeta,
    padding: 20,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 18,
  },
  responsable: {
    ...cs.tarjeta,
    padding: "14px 20px",
    marginTop: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  acciones: { display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" },
  datoEtiqueta: { fontSize: "0.72rem", color: color.textoDebil, textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 4, fontWeight: 600 },
  datoValor: { color: color.texto, fontWeight: 500, fontSize: "0.95rem" },
  tituloSeccion: { fontSize: "1rem", color: color.texto, marginBottom: 10, fontWeight: 700 },
  item: { ...cs.tarjeta, padding: "12px 16px", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 12 },
  detalle: { color: color.textoSuave, fontSize: "0.82rem", marginTop: 2 },
  vacio: { color: color.textoSuave, fontSize: "0.9rem" },
};

export default FichaActivo;