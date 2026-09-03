// RecuperarPassword.jsx — recuperación de contraseña, en dos momentos:
//
//   /recuperar                  → pedís el mail (escribís tu número)
//   /restablecer?token=xxxxx    → elegís la contraseña nueva
//
// Es una sola pantalla porque comparten casi todo el diseño: mira si hay
// ?token= en la dirección y muestra un paso o el otro.

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { pedirRecuperacion, restablecerPassword } from "../api/auth";
import { color, radio, sombra, fuente, cs, boton } from "../tema";

function RecuperarPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");   // null si venimos de /recuperar
  const navegar = useNavigate();

  const [numero, setNumero] = useState("");
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  // Paso 1: pedir el mail con el enlace.
  async function pedirMail() {
    setError("");
    setCargando(true);
    try {
      const r = await pedirRecuperacion(numero.trim().toLowerCase());
      setMensaje(r.mensaje);
    } catch {
      setError("No pudimos procesar el pedido. Intentá de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  // Paso 2: cambiar la contraseña con el token del mail.
  async function cambiarPassword() {
    setError("");
    if (password !== confirmacion) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setCargando(true);
    try {
      await restablecerPassword(token, password, confirmacion);
      setMensaje("Listo. Ya podés entrar con tu contraseña nueva.");
      // Después de dos segundos lo mandamos al login.
      setTimeout(() => navegar("/"), 2000);
    } catch (e) {
      // El backend explica si el enlace venció o ya se usó: mostramos eso.
      setError(e.response?.data?.detail || "No pudimos cambiar la contraseña.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div style={estilos.contenedor}>
      <div style={estilos.tarjeta}>
        <div style={estilos.logo}>S</div>
        <h1 style={estilos.titulo}>
          {token ? "Nueva contraseña" : "Recuperar contraseña"}
        </h1>

        {/* Mensaje de éxito: reemplaza al formulario. */}
        {mensaje ? (
          <p style={estilos.exito}>{mensaje}</p>
        ) : token ? (
          // ─── Paso 2: elegir contraseña nueva ───
          <>
            <p style={estilos.subtitulo}>Elegí tu contraseña nueva.</p>

            <label style={cs.label}>Contraseña</label>
            <input
              style={{ ...cs.input, marginBottom: 14 }}
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <label style={cs.label}>Repetir contraseña</label>
            <input
              style={{ ...cs.input, marginBottom: 22 }}
              type="password"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && cambiarPassword()}
            />

            {error && <p style={estilos.error}>{error}</p>}

            <button
              style={{ ...boton("primario"), width: "100%", padding: "12px" }}
              onClick={cambiarPassword}
              disabled={cargando}
            >
              {cargando ? "Guardando..." : "Cambiar contraseña"}
            </button>
          </>
        ) : (
          // ─── Paso 1: pedir el mail ───
          <>
            <p style={estilos.subtitulo}>
              Escribí tu número de identificación y te mandamos un enlace a tu
              mail del hospital.
            </p>

            <label style={cs.label}>Número de identificación</label>
            <input
              style={{ ...cs.input, marginBottom: 22 }}
              placeholder="Ej: u44111222"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pedirMail()}
            />

            {error && <p style={estilos.error}>{error}</p>}

            <button
              style={{ ...boton("primario"), width: "100%", padding: "12px" }}
              onClick={pedirMail}
              disabled={cargando}
            >
              {cargando ? "Enviando..." : "Enviar enlace"}
            </button>
          </>
        )}

        <button
          style={{ ...boton("fantasma"), width: "100%", marginTop: 12 }}
          onClick={() => navegar("/")}
        >
          Volver al ingreso
        </button>
      </div>
    </div>
  );
}

// Mismos estilos que el Login, para que se sientan la misma pantalla.
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
  titulo: { margin: "0 0 6px", fontSize: "1.35rem", color: color.texto, textAlign: "center", fontWeight: 700 },
  subtitulo: { margin: "0 0 24px", color: color.textoSuave, fontSize: "0.86rem", textAlign: "center", lineHeight: 1.5 },
  error: { color: color.peligro, fontSize: "0.85rem", margin: "0 0 14px", textAlign: "center" },
  exito: { color: color.exito, fontSize: "0.9rem", margin: "8px 0 4px", textAlign: "center", lineHeight: 1.5 },
};

export default RecuperarPassword;