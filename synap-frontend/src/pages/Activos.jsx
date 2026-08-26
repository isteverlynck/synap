// Activos.jsx — lista de activos. Ejemplo de pantalla PROTEGIDA que trae datos
// del backend. Sirve de molde para las demás pantallas que van a hacer con Cami.

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import cliente from "../api/cliente";
import { logout } from "../api/auth";

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

  if (cargando) return <p style={{ padding: 40 }}>Cargando activos...</p>;
  if (error) return <p style={{ padding: 40, color: "#d70015" }}>{error}</p>;

  return (
    <div style={{ padding: 40, fontFamily: "system-ui", maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ color: "#0071e3" }}>Activos ({activos.length})</h1>
        <button onClick={cerrarSesion} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}>
          Cerrar sesión
        </button>
      </div>
      <div style={{ marginTop: 20 }}>
        {activos.map((a) => (
          <div key={a.codigo} style={{ background: "white", padding: 16, borderRadius: 10, marginBottom: 10, border: "1px solid #eee" }}>
            <strong>{a.codigo}</strong> — {a.descripcion}
            <div style={{ fontSize: "0.85rem", color: "#666" }}>
              {a.marca} {a.modelo} · Estado: {a.estado}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Activos;
