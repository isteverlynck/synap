// FichaActivo.jsx — ficha básica de un equipo: sus datos + historial de
// órdenes de trabajo, fallas y mantenimientos.
//
// Por ahora la usan técnicos, coordinación y jefatura al escanear un QR (esos
// roles todavía no tienen una pantalla de inicio propia). Es un placeholder
// simple: cuando armemos las pantallas definitivas de cada rol, esta ficha va
// a servir de base para agregarles las acciones que le correspondan a cada uno
// (ej: técnico marca la OT en progreso, coordinación asigna, etc.).

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { logout } from "../api/auth";
import { verActivoDetalle } from "../api/activos";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton, insignia, tonoEstadoActivo } from "../tema";

function FichaActivo() {
  const { codigo } = useParams();
  const navegar = useNavigate();
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

  return (
    <div style={cs.pagina}>
      <div style={cs.contenido}>
        <Encabezado titulo={activo.codigo} subtitulo={activo.descripcion}>
          <button style={boton("secundario")} onClick={() => navegar("/escanear")}>Escanear otro</button>
          <button style={boton("fantasma")} onClick={cerrarSesion}>Cerrar sesión</button>
        </Encabezado>

        <div style={estilos.tarjetaDatos}>
          <Dato etiqueta="Estado" valor={<span style={insignia(tonoEstadoActivo(activo.estado))}>{activo.estado}</span>} />
          <Dato etiqueta="Marca / Modelo" valor={[activo.marca, activo.modelo].filter(Boolean).join(" ") || "—"} />
          <Dato etiqueta="N° de serie" valor={activo.numero_serie || "—"} />
          <Dato etiqueta="Ubicación" valor={activo.ubicacion || "—"} />
        </div>

        <Seccion titulo={`Órdenes de trabajo (${activo.ordenes_de_trabajo.length})`}>
          {activo.ordenes_de_trabajo.length === 0 && <p style={estilos.vacio}>Sin órdenes de trabajo registradas.</p>}
          {activo.ordenes_de_trabajo.map((ot) => (
            <div key={ot.id} style={estilos.item}>
              <span><strong>OT #{ot.numero_ot}</strong> — {ot.tipo}</span>
              <span style={insignia("primario")}>{ot.estado}</span>
              {ot.prioridad && <span style={estilos.detalle}>Prioridad: {ot.prioridad}</span>}
            </div>
          ))}
        </Seccion>

        <Seccion titulo={`Fallas (${activo.fallas.length})`}>
          {activo.fallas.length === 0 && <p style={estilos.vacio}>Sin fallas registradas.</p>}
          {activo.fallas.map((f) => (
            <div key={f.id} style={estilos.item}>
              <span>{f.tipo_falla || "Falla"}</span>
              <span style={insignia("advertencia")}>{f.estado}</span>
              {f.severidad && <span style={estilos.detalle}>Severidad: {f.severidad}</span>}
            </div>
          ))}
        </Seccion>

        <Seccion titulo={`Mantenimientos (${activo.mantenimientos.length})`}>
          {activo.mantenimientos.length === 0 && <p style={estilos.vacio}>Sin mantenimientos registrados.</p>}
          {activo.mantenimientos.map((m) => (
            <div key={m.id} style={estilos.item}>
              <span>Programado: {m.fecha_programada}</span>
              <span style={insignia("neutro")}>{m.estado}</span>
              {m.fecha_realizada && <span style={estilos.detalle}>Realizado: {m.fecha_realizada}</span>}
            </div>
          ))}
        </Seccion>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor }) {
  return (
    <div style={estilos.dato}>
      <div style={estilos.datoEtiqueta}>{etiqueta}</div>
      <div style={estilos.datoValor}>{valor}</div>
    </div>
  );
}

function Seccion({ titulo, children }) {
  return (
    <div style={estilos.seccion}>
      <h2 style={estilos.tituloSeccion}>{titulo}</h2>
      <div style={estilos.listaItems}>{children}</div>
    </div>
  );
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "20px 0" },
  tarjetaDatos: {
    ...cs.tarjeta,
    padding: 22,
    marginBottom: 26,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
  },
  dato: { fontSize: "0.95rem" },
  datoEtiqueta: { fontSize: "0.72rem", color: color.textoDebil, textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 4, fontWeight: 600 },
  datoValor: { color: color.texto, fontWeight: 500 },
  seccion: { marginBottom: 24 },
  tituloSeccion: { fontSize: "1rem", color: color.texto, marginBottom: 10, fontWeight: 700 },
  listaItems: { display: "flex", flexDirection: "column", gap: 8 },
  item: {
    ...cs.tarjeta,
    padding: "12px 16px",
    fontSize: "0.9rem",
    color: color.texto,
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  detalle: { color: color.textoSuave, fontSize: "0.82rem" },
  vacio: { color: color.textoSuave, fontSize: "0.9rem" },
};

export default FichaActivo;