// Login.jsx — la pantalla de entrada al sistema.
// Pide número y contraseña, llama al backend, y si anda guarda el token
// y manda a la persona a la pantalla principal.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api/auth";

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
      await login(numero, password);   // llama al backend
      navegar("/activos");             // si anda, va a la lista de activos
    } catch (err) {
      // Si el backend rechaza (contraseña mal, etc.), mostramos el error.
      setError("Número o contraseña incorrectos.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div style={estilos.contenedor}>
      <div style={estilos.tarjeta}>
        <h1 style={estilos.titulo}>SYNAP</h1>
        <p style={estilos.subtitulo}>Gestión de equipamiento médico</p>

        <input
          style={estilos.input}
          placeholder="Número de identificación"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
        />
        <input
          style={estilos.input}
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && manejarLogin()}
        />

        {error && <p style={estilos.error}>{error}</p>}

        <button style={estilos.boton} onClick={manejarLogin} disabled={cargando}>
          {cargando ? "Ingresando..." : "Ingresar"}
        </button>
      </div>
    </div>
  );
}

// Estilos simples en línea. Después se pueden mejorar / mover a CSS.
const estilos = {
  contenedor: {
    minHeight: "100vh", display: "flex", alignItems: "center",
    justifyContent: "center", background: "#f5f5f7", fontFamily: "system-ui",
  },
  tarjeta: {
    background: "white", padding: "40px", borderRadius: "16px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)", width: "320px",
  },
  titulo: { margin: "0 0 4px", fontSize: "2rem", color: "#0071e3", textAlign: "center" },
  subtitulo: { margin: "0 0 24px", color: "#666", fontSize: "0.9rem", textAlign: "center" },
  input: {
    width: "100%", padding: "12px", marginBottom: "12px", borderRadius: "10px",
    border: "1px solid #ddd", fontSize: "1rem", boxSizing: "border-box",
  },
  boton: {
    width: "100%", padding: "12px", background: "#0071e3", color: "white",
    border: "none", borderRadius: "10px", fontSize: "1rem", cursor: "pointer",
  },
  error: { color: "#d70015", fontSize: "0.85rem", margin: "0 0 12px" },
};

export default Login;
