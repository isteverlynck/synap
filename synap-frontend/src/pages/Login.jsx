// Login.jsx — la pantalla de entrada al sistema.
// Pide número y contraseña, llama al backend, y si anda guarda el token
// y manda a la persona a la pantalla principal.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, obtenerPerfil, pantallaInicioPorRol } from "../api/auth";
import { color, radio, sombra, fuente, cs, boton } from "../tema";

function Login() {
  // "useState" = memoria de la pantalla. Guarda lo que la persona escribe.
  const [numero, setNumero] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const navegar = useNavigate();

  // Qué pasa cuando toca "Ingresar".
  async function manejarLogin() {
    setError("");
    setCargando(true);
    try {
      await login(numero, password);         // llama al backend
      const perfil = await obtenerPerfil();   // trae nombre, rol, etc.
      localStorage.setItem("rol", perfil.rol);
      navegar(pantallaInicioPorRol(perfil.rol)); // manda a la pantalla que le corresponde
    } catch {
      // Si el backend rechaza (contraseña mal, etc.), mostramos el error.
      setError("Número o contraseña incorrectos.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div style={estilos.contenedor}>
      <div style={estilos.tarjeta}>
        <div style={estilos.logo}>S</div>
        <h1 style={estilos.titulo}>SYNAP</h1>
        <p style={estilos.subtitulo}>Gestión de equipamiento médico</p>

        <label style={cs.label}>Número de identificación</label>
        <input
          style={{ ...cs.input, marginBottom: 14 }}
          placeholder="Ej: u44111222"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
        />

        <label style={cs.label}>Contraseña</label>
        <input
          style={{ ...cs.input, marginBottom: 22 }}
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && manejarLogin()}
        />

        {error && <p style={estilos.error}>{error}</p>}

        <button
          style={{ ...boton("primario"), width: "100%", padding: "12px" }}
          onClick={manejarLogin}
          disabled={cargando}
        >
          {cargando ? "Ingresando..." : "Ingresar"}
        </button>
        <button
          style={{ ...boton("fantasma"), width: "100%", marginTop: 10 }}
          onClick={() => navegar("/recuperar")}
        >
          Olvidé mi contraseña
        </button>
      </div>
    </div>
  );
}

const estilos = {
  contenedor: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: color.fondo,
    fontFamily: fuente,
    padding: 20,
  },
  tarjeta: {
    background: color.tarjeta,
    padding: "40px 36px",
    borderRadius: radio.grande,
    boxShadow: sombra.flotante,
    border: `1px solid ${color.borde}`,
    width: 340,
    boxSizing: "border-box",
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 14,
    background: color.primario,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: "1.3rem",
    margin: "0 auto 16px",
  },
  titulo: { margin: "0 0 4px", fontSize: "1.5rem", color: color.texto, textAlign: "center", fontWeight: 700 },
  subtitulo: { margin: "0 0 28px", color: color.textoSuave, fontSize: "0.88rem", textAlign: "center" },
  error: { color: color.peligro, fontSize: "0.85rem", margin: "0 0 14px", textAlign: "center" },
};

export default Login;