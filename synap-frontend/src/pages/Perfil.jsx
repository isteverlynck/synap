// Perfil.jsx — la cuenta de quien está logueado.
//
// Sigue la estructura de Alina: una sola pantalla con los datos arriba, el
// cambio de contraseña en el medio y el cierre de sesión abajo del todo. No
// separamos "ajustes" de "perfil": son dos nombres para el mismo lugar y
// obligan al usuario a adivinar cuál mirar.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LogOut, Lock } from "lucide-react";
import { obtenerPerfil, cambiarPassword, logout } from "../api/auth";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton } from "../tema";

function Perfil() {
  const navegar = useNavigate();
  const [perfil, setPerfil] = useState(null);

  useEffect(() => {
    obtenerPerfil().then(setPerfil).catch(() => setPerfil(null));
  }, []);

  function cerrarSesion() {
    logout();
    navegar("/");
  }

  if (!perfil) return <p style={estilos.mensaje}>Cargando tu perfil...</p>;

  return (
    <>
      <Encabezado titulo="Mi cuenta" />

      {/* Tarjeta 1: quién sos. Los datos son de solo lectura: los carga
      Bioingeniería, no el propio usuario. */}
      <div style={{ ...cs.tarjeta, padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={estilos.avatarGrande}>
          {`${perfil.nombre?.[0] || ""}${perfil.apellido?.[0] || ""}`.toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={estilos.nombre}>{perfil.nombre} {perfil.apellido}</p>
          <p style={estilos.dato}>{perfil.email}</p>
          <p style={estilos.datoTenue}>
            {etiquetaRol(perfil.rol)}
            {perfil.grupo ? ` · Grupo ${perfil.grupo}` : ""}
          </p>
        </div>
      </div>

      <CambiarPassword />

      {/* Tarjeta 3: salir. Va abajo del todo y separada, para que nadie la
      toque sin querer mientras usa el resto de la pantalla. */}
      <div style={{ ...cs.tarjeta, padding: 20, marginTop: 12, display: "flex",
                    alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <p style={estilos.etiqueta}>Sesión</p>
          <p style={estilos.dato}>Salir de la cuenta en este dispositivo</p>
        </div>
        <button style={{ ...boton("secundario"), gap: 8 }} onClick={cerrarSesion}>
          <LogOut size={16} strokeWidth={1.8} aria-hidden="true" />
          Cerrar sesión
        </button>
      </div>
    </>
  );
}

function CambiarPassword() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function guardar() {
    setError("");
    if (nueva !== confirmacion) {
      setError("Las contraseñas nuevas no coinciden.");
      return;
    }
    if (nueva.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setEnviando(true);
    try {
      await cambiarPassword(actual, nueva, confirmacion);
      toast.success("Contraseña actualizada");
      setActual(""); setNueva(""); setConfirmacion("");
    } catch (e) {
      setError(e.response?.data?.detail || "No pudimos cambiar la contraseña.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ ...cs.tarjeta, padding: 20, marginTop: 12 }}>
      <p style={estilos.etiqueta}>Cambiar contraseña</p>

      <label style={{ ...cs.label, marginTop: 14 }}>Contraseña actual</label>
      <input style={{ ...cs.input, marginBottom: 12 }} type="password"
             value={actual} onChange={(e) => setActual(e.target.value)} />

      <label style={cs.label}>Nueva contraseña</label>
      <input style={{ ...cs.input, marginBottom: 12 }} type="password"
             placeholder="Mínimo 8 caracteres"
             value={nueva} onChange={(e) => setNueva(e.target.value)} />

      <label style={cs.label}>Repetir la nueva</label>
      <input style={{ ...cs.input, marginBottom: 14 }} type="password"
             value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)}
             onKeyDown={(e) => e.key === "Enter" && guardar()} />

      {error && <p style={estilos.error}>{error}</p>}

      <button style={{ ...boton("primario"), gap: 8 }} onClick={guardar} disabled={enviando}>
        <Lock size={16} strokeWidth={1.8} aria-hidden="true" />
        {enviando ? "Guardando..." : "Actualizar contraseña"}
      </button>
    </div>
  );
}

function etiquetaRol(rol) {
  const nombres = {
    enfermeria: "Enfermería", tecnico: "Técnico", junior: "Técnico junior",
    coordinacion: "Coordinación", jefatura: "Jefatura",
  };
  return nombres[rol] || rol;
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "18px 0" },
  avatarGrande: {
    width: 56, height: 56, borderRadius: "50%", background: color.primarioClaro,
    color: color.primarioOscuro, display: "flex", alignItems: "center",
    justifyContent: "center", fontSize: "1.2rem", fontWeight: 700, flexShrink: 0,
  },
  nombre: { margin: 0, fontSize: "1.1rem", color: color.texto, fontWeight: 700 },
  dato: { margin: "3px 0 0", fontSize: "0.88rem", color: color.textoSuave },
  datoTenue: { margin: "2px 0 0", fontSize: "0.82rem", color: color.textoDebil },
  etiqueta: {
    margin: 0, fontSize: "0.73rem", color: color.textoDebil,
    textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 600,
  },
  error: { color: color.peligro, fontSize: "0.85rem", margin: "0 0 12px" },
};

export default Perfil;