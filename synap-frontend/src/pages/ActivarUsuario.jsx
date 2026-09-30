// ActivarUsuario.jsx — primer ingreso: crear la contraseña.
//
// El hospital carga a cada persona en el padrón (número, mail, rol) pero sin
// contraseña — recién la crea ella misma la primera vez que entra. Dos pasos
// en una sola pantalla, mismo patrón que RecuperarPassword.jsx:
//
//   Paso 1: escribe su número → GET /auth/estado/{numero} nos dice si existe
//           en el padrón y si ya activó la cuenta antes.
//   Paso 2 (solo si existe y todavía NO activó): elige su contraseña, dos
//           veces y con mínimo 8 caracteres → POST /auth/activar.
//
// Si el número no está en el padrón, o la cuenta ya estaba activada, se
// avisa en el paso 1 y no se pasa al paso 2 (no tendría sentido "activar"
// una cuenta que ya tiene contraseña).

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { estadoUsuario, activarCuenta } from "../api/auth";
import { color, radio, sombra, fuente, cs, boton } from "../tema";

function ActivarUsuario() {
  const navegar = useNavigate();

  // "numero" → paso 1. "crear" → paso 2 (ya sabemos que existe y falta activar).
  const [paso, setPaso] = useState("numero");
  const [numero, setNumero] = useState("");
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  // Paso 1: ¿existe ese número, y ya tiene contraseña o no?
  async function verificarNumero() {
    setError("");
    const limpio = numero.trim().toLowerCase();
    if (!limpio) {
      setError("Escribí tu número de identificación.");
      return;
    }
    setCargando(true);
    try {
      const estado = await estadoUsuario(limpio);
      if (!estado.existe) {
        setError("No encontramos ese número de identificación. Contactá a Bioingeniería.");
      } else if (estado.activado) {
        setError("Esta cuenta ya está activada. Iniciá sesión con tu contraseña.");
      } else {
        setNumero(limpio);
        setPaso("crear");
      }
    } catch {
      setError("No pudimos verificar el número. Intentá de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  // Paso 2: crear la contraseña (dos veces, mínimo 8 caracteres — mismas
  // reglas que ya valida el backend, repetidas acá para avisar al toque).
  async function crearContrasena() {
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
      await activarCuenta(numero, password, confirmacion);
      setMensaje("Listo, tu cuenta ya está activada. Ya podés entrar con tu número y tu contraseña nueva.");
      // Después de dos segundos lo mandamos al login, mismo criterio que
      // usa RecuperarPassword.jsx al terminar el paso 2.
      setTimeout(() => navegar("/"), 2000);
    } catch (e) {
      setError(e.response?.data?.detail || "No pudimos activar la cuenta.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div style={estilos.contenedor}>
      <div style={estilos.tarjeta}>
        <div style={estilos.logo}>S</div>
        <h1 style={estilos.titulo}>
          {paso === "crear" ? "Creá tu contraseña" : "Activar mi usuario"}
        </h1>

        {/* Mensaje de éxito: reemplaza al formulario. */}
        {mensaje ? (
          <p style={estilos.exito}>{mensaje}</p>
        ) : paso === "crear" ? (
          // ─── Paso 2: elegir la contraseña ───
          <>
            <p style={estilos.subtitulo}>
              Es la primera vez que entrás con <strong>{numero}</strong>. Elegí tu
              contraseña para activar la cuenta.
            </p>

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
              onKeyDown={(e) => e.key === "Enter" && crearContrasena()}
            />

            {error && <p style={estilos.error}>{error}</p>}

            <button
              style={{ ...boton("primario"), width: "100%", padding: "12px" }}
              onClick={crearContrasena}
              disabled={cargando}
            >
              {cargando ? "Activando..." : "Activar cuenta"}
            </button>

            <button
              style={{ ...boton("fantasma"), width: "100%", marginTop: 10 }}
              onClick={() => { setPaso("numero"); setError(""); setPassword(""); setConfirmacion(""); }}
            >
              Usar otro número
            </button>
          </>
        ) : (
          // ─── Paso 1: verificar el número ───
          <>
            <p style={estilos.subtitulo}>
              Escribí tu número de identificación (el mismo que usa el hospital)
              para crear tu contraseña por primera vez.
            </p>

            <label style={cs.label}>Número de identificación</label>
            <input
              style={{ ...cs.input, marginBottom: 22 }}
              placeholder="Ej: u44111222"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && verificarNumero()}
            />

            {error && <p style={estilos.error}>{error}</p>}

            <button
              style={{ ...boton("primario"), width: "100%", padding: "12px" }}
              onClick={verificarNumero}
              disabled={cargando}
            >
              {cargando ? "Verificando..." : "Continuar"}
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

// Mismos estilos que Login/RecuperarPassword, para que se sientan la misma pantalla.
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

export default ActivarUsuario;