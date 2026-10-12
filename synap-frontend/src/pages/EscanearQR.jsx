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
// Para que lea bien en el celular (antes costaba que hiciera foco):
//   - Se pide la cámara en alta resolución y con enfoque continuo: con más
//     detalle, el QR se puede leer desde más lejos, donde la cámara sí enfoca.
//   - Si el celular lo permite (la mayoría de los Android con Chrome), aparece
//     un control de zoom: se aleja el celular para que enfoque y se acerca la
//     imagen con el zoom.
//   - "Sacar una foto del QR" abre la cámara del propio celular, que enfoca
//     mucho mejor de cerca, y lee el código de la foto. Es la salida segura en
//     iPhone, donde el navegador muchas veces no deja usar el zoom.
//
// Según quién escanea pasa algo distinto: enfermería va directo a crear una
// solicitud con el equipo cargado; el resto ve la ficha del equipo.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, Keyboard, ImageUp, ZoomIn } from "lucide-react";
import { rolActual } from "../api/auth";
import { verActivo } from "../api/activos";
import { normalizarCodigo } from "../utiles/codigos";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton } from "../tema";

const ID_LECTOR = "lector-qr";
// Otro lugar (invisible) para leer el QR de una foto: la librería necesita un
// elemento propio, separado del de la cámara en vivo.
const ID_LECTOR_FOTO = "lector-qr-foto";

// Cámara trasera, en alta resolución ("ideal": si el celular no llega, usa la
// mejor que tenga) y con enfoque continuo donde exista. Los navegadores que no
// conocen alguna de estas opciones simplemente la ignoran.
const CAMARA = {
  facingMode: "environment",
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  advanced: [{ focusMode: "continuous" }],
};

// Zoom con el que arranca la cámara, si el celular permite zoom: a 2x el QR
// se ve grande con el celular a una distancia en la que la cámara enfoca bien.
const ZOOM_INICIAL = 2;

function EscanearQR() {
  const navegar = useNavigate();
  const [camaraActiva, setCamaraActiva] = useState(false);
  const [codigoManual, setCodigoManual] = useState("");
  const [buscando, setBuscando] = useState(false);
  // Dos lugares para los mensajes: arriba (cámara y foto) y abajo (código
  // escrito a mano), así el aviso aparece donde la persona está mirando.
  const [error, setError] = useState("");
  const [errorCamara, setErrorCamara] = useState("");
  // Zoom de la cámara: null = este celular no lo permite (no se muestra).
  const [zoom, setZoom] = useState(null);   // { min, max, paso, valor }
  const [leyendoFoto, setLeyendoFoto] = useState(false);

  const lectorRef = useRef(null);       // instancia de Html5Qrcode
  const yaResueltoRef = useRef(false);  // evita procesar dos veces la misma lectura
  const inputFotoRef = useRef(null);

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
    setZoom(null);
  }

  // Antes de navegar verificamos que el equipo exista: el QR puede estar viejo,
  // o el código tipeado mal. "origen" dice de dónde vino el código, para
  // mostrar el aviso en el lugar correcto.
  async function procesarCodigo(textoCrudo, origen = "manual") {
    if (yaResueltoRef.current) return;
    const mostrarError = origen === "manual" ? setError : setErrorCamara;
    const codigo = normalizarCodigo(textoCrudo);
    if (!codigo) {
      mostrarError("Escribí el código del equipo.");
      return;
    }
    yaResueltoRef.current = true;
    setBuscando(true);
    setError("");
    setErrorCamara("");
    try {
      await verActivo(codigo);
      await detenerCamara();
      irSegunRol(codigo);
    } catch {
      mostrarError(`No encontramos ningún equipo con el código "${codigo}".`);
      setBuscando(false);
      yaResueltoRef.current = false;   // dejar reintentar
    }
  }

  // Si el celular permite zoom, lo arranca en ZOOM_INICIAL y muestra el control.
  async function prepararZoom(lector) {
    try {
      const caracteristica = lector.getRunningTrackCameraCapabilities().zoomFeature();
      if (!caracteristica.isSupported()) return;
      const min = caracteristica.min();
      const max = caracteristica.max();
      if (!(max > min)) return;
      const inicial = Math.min(Math.max(ZOOM_INICIAL, min), max);
      await caracteristica.apply(inicial);
      setZoom({ min, max, paso: caracteristica.step() || 0.1, valor: inicial });
    } catch {
      // Sin zoom: se usa la cámara tal cual.
    }
  }

  async function cambiarZoom(valor) {
    setZoom((z) => (z ? { ...z, valor } : z));
    try {
      await lectorRef.current
        ?.getRunningTrackCameraCapabilities()
        .zoomFeature()
        .apply(valor);
    } catch {
      // Si no se pudo aplicar, queda el zoom anterior.
    }
  }

  async function activarCamara() {
    setErrorCamara("");
    try {
      const lector = new Html5Qrcode(ID_LECTOR);
      lectorRef.current = lector;
      setCamaraActiva(true);
      await lector.start(
        // "environment" = cámara trasera, que es con la que se escanea un
        // equipo. En una notebook cae a la única que haya. (Lo que manda en
        // realidad es "videoConstraints", más abajo: tiene la misma cámara
        // trasera, más la resolución y el enfoque.)
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 }, videoConstraints: CAMARA },
        (texto) => procesarCodigo(texto, "camara"),
        () => {
          // Se llama constantemente mientras no hay QR en cuadro. Es normal.
        }
      );
      await prepararZoom(lector);
    } catch {
      setErrorCamara(
        "No pudimos acceder a la cámara. Revisá que le hayas dado permiso al " +
        "navegador, sacale una foto al QR o escribí el código a mano."
      );
      setCamaraActiva(false);
      lectorRef.current = null;
    }
  }

  // "Sacar una foto del QR": el celular abre su propia cámara (enfoca mejor
  // de cerca) y acá se lee el código de la foto. La foto no se guarda.
  async function leerFoto(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";   // así se puede volver a sacar otra foto igual
    if (!archivo) return;
    setErrorCamara("");
    setLeyendoFoto(true);
    await detenerCamara();   // la cámara en vivo y la foto no pueden convivir
    const lectorFoto = new Html5Qrcode(ID_LECTOR_FOTO);
    try {
      const texto = await lectorFoto.scanFile(archivo, false);
      await procesarCodigo(texto, "foto");
    } catch {
      setErrorCamara(
        "No pudimos leer el QR en la foto. Probá de nuevo con el código " +
        "centrado, más cerca y con buena luz, o escribí el código a mano."
      );
    } finally {
      try { lectorFoto.clear(); } catch { /* nada que limpiar */ }
      setLeyendoFoto(false);
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
        {/* Lugar invisible para leer la foto (ver leerFoto). */}
        <div id={ID_LECTOR_FOTO} style={{ display: "none" }} />
        {/* El selector de foto del celular: con capture="environment" abre
        directamente la cámara trasera. Está escondido; lo abre el botón. */}
        <input
          ref={inputFotoRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={leerFoto}
          style={{ display: "none" }}
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
            <div style={estilos.botones}>
              <button style={{ ...boton("primario"), gap: 8 }} onClick={activarCamara} disabled={leyendoFoto}>
                <Camera size={17} strokeWidth={1.9} aria-hidden="true" />
                Activar cámara
              </button>
              <button
                style={{ ...boton("secundario"), gap: 8 }}
                onClick={() => inputFotoRef.current?.click()}
                disabled={leyendoFoto}
              >
                <ImageUp size={17} strokeWidth={1.9} aria-hidden="true" />
                {leyendoFoto ? "Leyendo la foto..." : "Sacar una foto del QR"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Zoom: solo si el celular lo permite. */}
            {zoom && (
              <label style={estilos.zoom}>
                <ZoomIn size={17} strokeWidth={1.9} color={color.textoSuave} aria-hidden="true" />
                <input
                  type="range"
                  min={zoom.min}
                  max={zoom.max}
                  step={zoom.paso}
                  value={zoom.valor}
                  onChange={(e) => cambiarZoom(Number(e.target.value))}
                  style={{ flex: 1 }}
                  aria-label="Zoom de la cámara"
                />
                <span style={estilos.zoomValor}>{Number(zoom.valor).toFixed(1)}x</span>
              </label>
            )}
            <p style={estilos.nota}>
              {zoom
                ? "Si no enfoca, alejá un poco el celular y acercá la imagen con el zoom."
                : "Si no enfoca, alejá un poco el celular, o sacale una foto al QR."}
            </p>
            <div style={estilos.botones}>
              <button style={{ ...boton("secundario"), gap: 8 }} onClick={detenerCamara}>
                <CameraOff size={17} strokeWidth={1.9} aria-hidden="true" />
                Apagar cámara
              </button>
              <button
                style={{ ...boton("secundario"), gap: 8 }}
                onClick={() => inputFotoRef.current?.click()}
                disabled={leyendoFoto}
              >
                <ImageUp size={17} strokeWidth={1.9} aria-hidden="true" />
                Sacar una foto del QR
              </button>
            </div>
          </>
        )}
        {errorCamara && <p style={estilos.error}>{errorCamara}</p>}
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
  botones: {
    display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 14,
  },
  zoom: {
    display: "flex", alignItems: "center", gap: 10,
    maxWidth: 340, margin: "14px auto 0",
  },
  zoomValor: { fontSize: "0.82rem", color: color.textoSuave, minWidth: 34, textAlign: "right" },
  subtitulo: {
    display: "flex", alignItems: "center", gap: 7, margin: "0 0 14px",
    fontSize: "0.92rem", color: color.texto, fontWeight: 600,
  },
  nota: { margin: "10px 0 0", fontSize: "0.79rem", color: color.textoDebil },
  error: { color: color.peligro, fontSize: "0.85rem", margin: "10px 0 0" },
};

export default EscanearQR;