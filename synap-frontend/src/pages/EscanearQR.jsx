// EscanearQR.jsx — escaneo del QR de un equipo.
//
// La cámara arranca solo cuando la persona toca "Activar cámara": pedir el
// permiso apenas se abre la pantalla es invasivo, y muchos lo rechazan por
// reflejo. Primero se explica para qué es, después se pide.
//
// Usamos Html5Qrcode (no Html5QrcodeScanner): la clase básica solo maneja la
// cámara y nos deja dibujar la pantalla nosotras. La otra trae su propia
// interfaz, en inglés y sin forma de darle estilo.
//
// Según quién escanea pasa algo distinto: enfermería va directo a crear una
// solicitud con el equipo cargado; el resto ve la ficha del equipo.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, Keyboard } from "lucide-react";
import { rolActual } from "../api/auth";
import { verActivo } from "../api/activos";
import { normalizarCodigo } from "../utiles/codigos";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton } from "../tema";

const ID_LECTOR = "lector-qr";

function EscanearQR() {
  const navegar = useNavigate();
  const [camaraActiva, setCamaraActiva] = useState(false);
  const [codigoManual, setCodigoManual] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");

  const lectorRef = useRef(null);       // instancia de Html5Qrcode
  const yaResueltoRef = useRef(false);  // evita procesar dos veces la misma lectura

  function irSegunRol(codigo) {
    const rol = rolActual();
    if (rol === "enfermeria") {
      navegar("/solicitudes", { state: { activoCodigoEscaneado: codigo } });
    } else {
      navegar(`/activos/${codigo}`);
    }
  }

  async function detenerCamara() {
    const lector = lectorRef.current;
    if (!lector) return;
    try {
      await lector.stop();
      await lector.clear();
    } catch {
      // Si ya estaba detenida, no importa.
    }
    lectorRef.current = null;
    setCamaraActiva(false);
  }

  // Antes de navegar verificamos que el equipo exista: el QR puede estar viejo,
  // o el código tipeado mal.
  async function procesarCodigo(textoCrudo) {
    if (yaResueltoRef.current) return;
    const codigo = normalizarCodigo(textoCrudo);
    if (!codigo) {
      setError("Escribí el código del equipo.");
      return;
    }
    yaResueltoRef.current = true;
    setBuscando(true);
    setError("");
    try {
      await verActivo(codigo);
      await detenerCamara();
      irSegunRol(codigo);
    } catch {
      setError(`No encontramos ningún equipo con el código "${codigo}".`);
      setBuscando(false);
      yaResueltoRef.current = false;   // dejar reintentar
    }
  }

  async function activarCamara() {
    setError("");
    try {
      const lector = new Html5Qrcode(ID_LECTOR);
      lectorRef.current = lector;
      setCamaraActiva(true);
      await lector.start(
        // "environment" = cámara trasera, que es con la que se escanea un
        // equipo. En una notebook cae a la única que haya.
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (texto) => procesarCodigo(texto),
        () => {
          // Se llama constantemente mientras no hay QR en cuadro. Es normal.
        }
      );
    } catch {
      setError(
        "No pudimos acceder a la cámara. Revisá que le hayas dado permiso al " +
        "navegador, o escribí el código a mano."
      );
      setCamaraActiva(false);
      lectorRef.current = null;
    }
  }

  // Apagar la cámara al salir de la pantalla. Sin esto queda prendida.
  useEffect(() => {
    return () => {
      lectorRef.current?.stop().catch(() => {});
    };
  }, []);

  return (
    <>
      {/* Sin botón "Volver": esta pantalla es una pestaña del menú, no un
      detalle al que se llega desde otro lado. */}
      <Encabezado
        titulo="Escanear equipo"
        subtitulo="Apuntá la cámara al código QR pegado en el equipo"
      />

      <div style={{ ...cs.tarjeta, padding: 22, textAlign: "center" }}>
        {/* El div del lector siempre está en el DOM (la librería lo necesita
        para montarse), pero solo se ve cuando la cámara está activa. */}
        <div
          id={ID_LECTOR}
          style={{
            ...estilos.lector,
            display: camaraActiva ? "block" : "none",
          }}
        />

        {!camaraActiva ? (
          <div style={estilos.reposo}>
            <div style={estilos.iconoGrande}>
              <Camera size={30} strokeWidth={1.5} color={color.primario} aria-hidden="true" />
            </div>
            <p style={estilos.titulo}>Escaneá el código del equipo</p>
            <p style={estilos.ayuda}>
              Vamos a pedirte permiso para usar la cámara. Solo se usa para leer
              el código: no se guarda ninguna imagen.
            </p>
            <button style={{ ...boton("primario"), gap: 8, marginTop: 6 }} onClick={activarCamara}>
              <Camera size={17} strokeWidth={1.9} aria-hidden="true" />
              Activar cámara
            </button>
          </div>
        ) : (
          <button style={{ ...boton("secundario"), gap: 8, marginTop: 14 }} onClick={detenerCamara}>
            <CameraOff size={17} strokeWidth={1.9} aria-hidden="true" />
            Apagar cámara
          </button>
        )}
      </div>

      <div style={{ ...cs.tarjeta, padding: 22, marginTop: 12 }}>
        <p style={estilos.subtitulo}>
          <Keyboard size={16} strokeWidth={1.9} aria-hidden="true" />
          ¿El QR está roto o no se lee?
        </p>
        <label style={cs.label}>Escribí el código a mano</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            style={{ ...cs.input, flex: 1, minWidth: 180 }}
            placeholder="B-CIRU-MAAN-056 o B CIRU MAAN 056"
            value={codigoManual}
            onChange={(e) => { setCodigoManual(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && procesarCodigo(codigoManual)}
          />
          <button
            style={boton("primario")}
            onClick={() => procesarCodigo(codigoManual)}
            disabled={buscando}
          >
            {buscando ? "Buscando..." : "Buscar"}
          </button>
        </div>
        <p style={estilos.nota}>Da igual si lo escribís con guiones o con espacios.</p>
        {error && <p style={estilos.error}>{error}</p>}
      </div>
    </>
  );
}

const estilos = {
  lector: { borderRadius: 12, overflow: "hidden", margin: "0 auto", maxWidth: 340 },
  reposo: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "18px 0" },
  iconoGrande: {
    width: 62, height: 62, borderRadius: "50%", background: color.primarioClaro,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  titulo: { margin: 0, fontSize: "1.05rem", color: color.texto, fontWeight: 700 },
  ayuda: { margin: 0, color: color.textoSuave, fontSize: "0.86rem", maxWidth: 330, lineHeight: 1.55 },
  subtitulo: {
    display: "flex", alignItems: "center", gap: 7, margin: "0 0 14px",
    fontSize: "0.92rem", color: color.texto, fontWeight: 600,
  },
  nota: { margin: "10px 0 0", fontSize: "0.79rem", color: color.textoDebil },
  error: { color: color.peligro, fontSize: "0.85rem", margin: "10px 0 0" },
};

export default EscanearQR;