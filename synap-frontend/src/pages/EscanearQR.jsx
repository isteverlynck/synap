// EscanearQR.jsx — pantalla de escaneo del QR de un equipo.
//
// La idea: cada equipo tiene pegado un QR con su código (ej: B-CIRU-MAAN-056).
// Esta pantalla la puede abrir CUALQUIER usuario logueado, sea cual sea su rol.
// Al escanear, según el rol de quien escanea pasa una cosa distinta:
//   - enfermería  → va directo a "crear solicitud" con el equipo ya cargado.
//   - cualquier otro rol (técnico, coordinación, jefatura) → por ahora, hasta
//     que armemos sus pantallas propias, ve una ficha básica del equipo
//     (sus datos + historial de OT, fallas y mantenimientos).
//
// Usamos Html5QrcodeScanner (con su propia interfaz: botón de pedir permiso
// de cámara, selector si hay varias cámaras, etc.) — el mismo enfoque que
// Ine ya probó en prueba_qr.html. Además dejamos un campo para escribir el
// código a mano, por si la cámara no anda o el QR está dañado/ilegible.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5QrcodeScanner } from "html5-qrcode";
import { rolActual } from "../api/auth";
import { verActivo } from "../api/activos";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton } from "../tema";

const ID_LECTOR = "lector-qr";

function EscanearQR() {
  const navegar = useNavigate();
  const [codigoManual, setCodigoManual] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");
  const scannerRef = useRef(null);      // instancia de Html5QrcodeScanner
  const yaResueltoRef = useRef(false);  // evita procesar el mismo escaneo dos veces

  // A dónde mandar según el rol de quien escaneó.
  function irSegunRol(codigo) {
    const rol = rolActual();
    if (rol === "enfermeria") {
      navegar("/solicitudes", { state: { activoCodigoEscaneado: codigo } });
    } else {
      navegar(`/activos/${codigo}`);
    }
  }

  // Verifica que el equipo exista antes de navegar (por si el QR está viejo,
  // roto, o alguien tipeó mal el código a mano).
  async function procesarCodigo(codigo) {
    if (yaResueltoRef.current) return;
    yaResueltoRef.current = true;
    setBuscando(true);
    setError("");
    try {
      await verActivo(codigo);
      irSegunRol(codigo);
    } catch {
      setError(`No encontramos ningún equipo con el código "${codigo}".`);
      setBuscando(false);
      yaResueltoRef.current = false; // dejar reintentar
    }
  }

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      ID_LECTOR,
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );
    scannerRef.current = scanner;

    scanner.render(
      (textoDecodificado) => {
        // Lectura exitosa: frenamos la cámara y procesamos el código.
        scanner.clear().catch(() => {});
        procesarCodigo(textoDecodificado.trim());
      },
      () => {
        // Se llama todo el tiempo mientras no encuentra un QR en cuadro.
        // No hacemos nada acá, es el funcionamiento normal.
      }
    );

    // Al salir de la pantalla, apagar la cámara.
    return () => {
      scannerRef.current?.clear().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function enviarCodigoManual() {
    const codigo = codigoManual.trim();
    if (!codigo) {
      setError("Escribí el código del equipo.");
      return;
    }
    procesarCodigo(codigo);
  }

  return (
    <div style={cs.pagina}>
      <div style={{ ...cs.contenido, maxWidth: 480 }}>
        <Encabezado titulo="Escanear equipo" subtitulo="Apuntá la cámara al QR pegado en el equipo">
          <button style={boton("secundario")} onClick={() => navegar(-1)}>Volver</button>
        </Encabezado>

        <div style={{ ...cs.tarjeta, padding: 20, marginBottom: 20, textAlign: "center" }}>
          <div id={ID_LECTOR} style={estilos.lector} />
          <p style={estilos.ayuda}>
            Apretá "Request Camera Permissions" para activar la cámara.
          </p>
        </div>

        <div style={{ ...cs.tarjeta, padding: 20 }}>
          <label style={cs.label}>O escribí el código del equipo</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              style={cs.input}
              placeholder="Ej: B-CIRU-MAAN-056"
              value={codigoManual}
              onChange={(e) => setCodigoManual(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enviarCodigoManual()}
            />
            <button style={boton("primario")} onClick={enviarCodigoManual} disabled={buscando}>
              {buscando ? "Buscando..." : "Buscar"}
            </button>
          </div>
          {error && <p style={estilos.error}>{error}</p>}
        </div>
      </div>
    </div>
  );
}

const estilos = {
  lector: { borderRadius: 12, overflow: "hidden" },
  ayuda: { color: color.textoSuave, fontSize: "0.85rem", marginTop: 14 },
  error: { color: color.peligro, fontSize: "0.85rem", margin: "12px 0 0" },
};

export default EscanearQR;