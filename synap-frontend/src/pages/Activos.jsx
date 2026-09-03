// Activos.jsx — lista de activos. Ejemplo de pantalla PROTEGIDA que trae datos
// del backend. Sirve de molde para las demás pantallas que van a hacer con Cami.

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import cliente from "../api/cliente";
import { logout } from "../api/auth";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton, insignia, tonoEstadoActivo } from "../tema";

function Activos() {
  const [activos, setActivos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const navegar = useNavigate();

  // "useEffect" = corre una vez cuando la pantalla se abre. Acá pedimos los datos.
  useEffect(() => {
    cliente.get("/activos")
      .then((res) => setActivos(res.data))
      .catch(() => setError("No se pudieron cargar los activos."))
      .finally(() => setCargando(false));
  }, []);

  function cerrarSesion() {
    logout();
    navegar("/");
  }

  return (
    <div style={cs.pagina}>
      <div style={cs.contenido}>
        <Encabezado titulo={`Activos (${activos.length})`} subtitulo="Equipamiento médico registrado">
          <button style={boton("secundario")} onClick={() => navegar("/escanear")}>
            Escanear equipo (QR)
          </button>
          <button style={boton("secundario")} onClick={() => navegar("/solicitudes")}>
            Solicitudes de servicio
          </button>
          <button style={boton("fantasma")} onClick={cerrarSesion}>
            Cerrar sesión
          </button>
        </Encabezado>

        {cargando && <p style={estilos.mensaje}>Cargando activos...</p>}
        {error && <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>}

        {!cargando && !error && (
          <div style={estilos.lista}>
            {activos.map((a) => (
              <div key={a.codigo} onClick={() => navegar(`/activos/${a.codigo}`)} style={estilos.tarjeta}>
                <div>
                  <div style={estilos.codigo}>{a.codigo}</div>
                  <div style={estilos.descripcion}>{a.descripcion}</div>
                  {(a.marca || a.modelo) && (
                    <div style={estilos.detalle}>{[a.marca, a.modelo].filter(Boolean).join(" ")}</div>
                  )}
                </div>
                <span style={insignia(tonoEstadoActivo(a.estado))}>{a.estado}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "20px 0" },
  lista: { display: "flex", flexDirection: "column", gap: 10 },
  tarjeta: {
    ...cs.tarjeta,
    padding: "16px 20px",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  codigo: { fontWeight: 700, color: color.texto, fontSize: "0.95rem" },
  descripcion: { color: color.textoSuave, fontSize: "0.88rem", marginTop: 2 },
  detalle: { color: color.textoDebil, fontSize: "0.78rem", marginTop: 4 },
};

export default Activos;