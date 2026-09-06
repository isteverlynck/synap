// Pendientes.jsx — la bandeja del coordinador: las solicitudes que le llegaron
// y todavía no resolvió.
//
// La idea central es que resuelva sin salir de la lista. Cada tarjeta se abre
// en el lugar para aceptar, rechazar o corregir. Es lo contrario de Máximo,
// donde hay que navegar varias pantallas para hacer algo simple.

import { useEffect, useState } from "react";
import { solicitudesPendientes, tecnicosDisponibles, aceptarSolicitud,
         rechazarSolicitud, modificarSolicitud } from "../api/coordinacion";
import { agruparPorFecha } from "../utiles/fechas";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton, insignia } from "../tema";
import { toast } from "sonner";
import { HeartPulse, Wrench } from "lucide-react";

function Pendientes() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // Qué tarjeta está abierta y en qué modo: { id, modo: 'aceptar'|'rechazar'|'modificar' }
  const [abierta, setAbierta] = useState(null);

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      // Las dos cosas en paralelo: la lista y los técnicos para el desplegable.
      const [lista, gente] = await Promise.all([
        solicitudesPendientes(),
        tecnicosDisponibles(),
      ]);
      setSolicitudes(lista);
      setTecnicos(gente);
    } catch {
      setError("No pudimos cargar las solicitudes pendientes.");
    } finally {
      setCargando(false);
    }
  }

  // Después de resolver una, la sacamos de la lista sin recargar todo: la
  // pantalla responde al toque y no parpadea.
  function quitarDeLaLista(id) {
    setSolicitudes((antes) => antes.filter((s) => s.id !== id));
    setAbierta(null);
  }

  if (cargando) {
    return <p style={estilos.mensaje}>Cargando solicitudes...</p>;
  }

  const grupos = agruparPorFecha(solicitudes, (s) => s.created_at);

  return (
    <>
      <Encabezado
        titulo="Solicitudes pendientes"
        subtitulo={`${solicitudes.length} esperando respuesta`}
      >
        <button style={boton("secundario")} onClick={cargar}>Actualizar</button>
      </Encabezado>

      {error && <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>}

      {solicitudes.length === 0 && !error && (
        <p style={estilos.mensaje}>No hay solicitudes esperando. Todo al día.</p>
      )}

      {grupos.map((grupo) => (
        <div key={grupo.fecha} style={{ marginBottom: 22 }}>
          <p style={estilos.fecha}>{grupo.fecha}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {grupo.items.map((s) => (
              <Tarjeta
                key={s.id}
                solicitud={s}
                tecnicos={tecnicos}
                abierta={abierta}
                setAbierta={setAbierta}
                alResolver={quitarDeLaLista}
                alModificar={(actualizada) =>
                  setSolicitudes((antes) =>
                    antes.map((x) => (x.id === actualizada.id ? actualizada : x))
                  )
                }
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Una solicitud
// ─────────────────────────────────────────────────────────────────────────

function Tarjeta({ solicitud: s, tecnicos, abierta, setAbierta, alResolver, alModificar }) {
  const modo = abierta?.id === s.id ? abierta.modo : null;

  return (
    <div style={estilos.tarjeta}>
      <div style={estilos.cabecera}>
        <div style={{ minWidth: 0 }}>
          <p style={estilos.titulo}>#{s.numero_solicitud} · {s.titulo}</p>
          <p style={{ ...estilos.linea, display: "flex", alignItems: "center", gap: 6 }}>
            {/* Equipo médico o "cosa": son circuitos distintos (uno se rutea
            solo por el tipo de equipo, el otro necesita que el coordinador
            elija el grupo). Que se distinga de un vistazo ahorra abrir. */}
            {s.es_equipo_medico
              ? <HeartPulse size={14} strokeWidth={1.8} aria-hidden="true" />
              : <Wrench size={14} strokeWidth={1.8} aria-hidden="true" />}
            {s.es_equipo_medico
              ? `${s.activo_codigo || "Equipo sin código"} · ${s.ubicacion || "Sin ubicación"}`
              : `${s.descripcion_cosa || "Sin equipo asociado"} · ${s.ubicacion || "Sin ubicación"}`}
          </p>
          <p style={estilos.lineaTenue}>{s.solicitante_nombre || "Solicitante desconocido"}</p>
        </div>
        <span style={insignia("advertencia")}>Pendiente</span>
      </div>

      {s.descripcion_problema && (
        <p style={estilos.descripcion}>{s.descripcion_problema}</p>
      )}

      {/* Los botones desaparecen cuando hay un panel abierto: así queda claro
      que estás en el medio de una acción y no se dispara otra sin querer. */}
      {!modo && (
        <div style={estilos.acciones}>
          <button style={boton("primario")} onClick={() => setAbierta({ id: s.id, modo: "aceptar" })}>Aceptar</button>
          <button style={boton("secundario")} onClick={() => setAbierta({ id: s.id, modo: "modificar" })}>Modificar</button>
          <button style={boton("peligro")} onClick={() => setAbierta({ id: s.id, modo: "rechazar" })}>Rechazar</button>
        </div>
      )}

      {modo === "aceptar" && (
        <PanelAceptar s={s} tecnicos={tecnicos} cerrar={() => setAbierta(null)} alResolver={alResolver} />
      )}
      {modo === "rechazar" && (
        <PanelRechazar s={s} cerrar={() => setAbierta(null)} alResolver={alResolver} />
      )}
      {modo === "modificar" && (
        <PanelModificar s={s} cerrar={() => setAbierta(null)} alModificar={alModificar} />
      )}
    </div>
  );
}

// ─── Aceptar ───

function PanelAceptar({ s, tecnicos, cerrar, alResolver }) {
  const [tecnicoId, setTecnicoId] = useState("");
  const [prioridad, setPrioridad] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function confirmar() {
    setEnviando(true);
    setError("");
    try {
      await aceptarSolicitud(s.id, { asignarAId: tecnicoId || null, prioridad: prioridad || null });
      toast.success(`Solicitud #${s.numero_solicitud} aceptada`, {
        description: tecnicoId
          ? "Se generó la orden y quedó asignada."
          : "Se generó la orden. Queda sin técnico asignado.",
      });
      alResolver(s.id);
    } catch (e) {
      setError(e.response?.data?.detail || "No pudimos aceptar la solicitud.");
      setEnviando(false);
    }
  }

  return (
    <div style={estilos.panel}>
      <p style={estilos.panelTitulo}>Aceptar y generar la orden de trabajo</p>

      <label style={cs.label}>Asignar a</label>
      <select style={{ ...cs.input, marginBottom: 12 }} value={tecnicoId}
              onChange={(e) => setTecnicoId(e.target.value)}>
        {/* Dejar sin asignar es una opción válida: la OT nace abierta y se
        asigna después. Por eso está primera, no escondida. */}
        <option value="">Dejar sin asignar por ahora</option>
        {tecnicos.map((t) => (
          <option key={t.id} value={t.id}>{t.nombre} {t.apellido}</option>
        ))}
      </select>

      <label style={cs.label}>Prioridad</label>
      <select style={{ ...cs.input, marginBottom: 14 }} value={prioridad}
              onChange={(e) => setPrioridad(e.target.value)}>
        <option value="">Sin definir</option>
        <option value="ALTA">Alta</option>
        <option value="MEDIA">Media</option>
        <option value="BAJA">Baja</option>
      </select>

      {error && <p style={estilos.error}>{error}</p>}

      <div style={estilos.acciones}>
        <button style={boton("primario")} onClick={confirmar} disabled={enviando}>
          {enviando ? "Generando..." : "Confirmar"}
        </button>
        <button style={boton("fantasma")} onClick={cerrar}>Cancelar</button>
      </div>
    </div>
  );
}

// ─── Rechazar ───

function PanelRechazar({ s, cerrar, alResolver }) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function confirmar() {
    if (!motivo.trim()) {
      setError("Escribí un motivo: lo va a ver quien hizo la solicitud.");
      return;
    }
    setEnviando(true);
    setError("");
    try {
      await rechazarSolicitud(s.id, motivo.trim());
      toast.success(`Solicitud #${s.numero_solicitud} rechazada`, {
        description: "Quien la pidió va a ver el motivo.",
      });
      alResolver(s.id);
    } catch (e) {
      setError(e.response?.data?.detail || "No pudimos rechazar la solicitud.");
      setEnviando(false);
    }
  }

  return (
    <div style={estilos.panel}>
      <p style={estilos.panelTitulo}>Rechazar la solicitud</p>
      <label style={cs.label}>Motivo</label>
      <textarea
        style={{ ...cs.input, minHeight: 70, marginBottom: 12, resize: "vertical" }}
        placeholder="Ej: el equipo ya tiene una orden abierta por la misma falla."
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
      />
      {error && <p style={estilos.error}>{error}</p>}
      <div style={estilos.acciones}>
        <button style={boton("peligro")} onClick={confirmar} disabled={enviando}>
          {enviando ? "Rechazando..." : "Confirmar rechazo"}
        </button>
        <button style={boton("fantasma")} onClick={cerrar}>Cancelar</button>
      </div>
    </div>
  );
}

// ─── Modificar ───

function PanelModificar({ s, cerrar, alModificar }) {
  const [titulo, setTitulo] = useState(s.titulo || "");
  const [descripcion, setDescripcion] = useState(s.descripcion_problema || "");
  const [ubicacion, setUbicacion] = useState(s.ubicacion || "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function guardar() {
    setEnviando(true);
    setError("");
    try {
      const cambios = {};
      if (titulo !== s.titulo) cambios.titulo = titulo;
      if (descripcion !== s.descripcion_problema) cambios.descripcion_problema = descripcion;
      if (ubicacion !== s.ubicacion) cambios.ubicacion = ubicacion;

      if (Object.keys(cambios).length === 0) { cerrar(); return; }

      const actualizada = await modificarSolicitud(s.id, cambios);
      toast.success("Cambios guardados");
      alModificar(actualizada);
      cerrar();
    } catch (e) {
      setError(e.response?.data?.detail || "No pudimos guardar los cambios.");
      setEnviando(false);
    }
  }

  return (
    <div style={estilos.panel}>
      <p style={estilos.panelTitulo}>Corregir la solicitud</p>

      <label style={cs.label}>Título</label>
      <input style={{ ...cs.input, marginBottom: 10 }} value={titulo} onChange={(e) => setTitulo(e.target.value)} />

      <label style={cs.label}>Descripción</label>
      <textarea style={{ ...cs.input, minHeight: 60, marginBottom: 10, resize: "vertical" }}
                value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />

      <label style={cs.label}>Ubicación</label>
      <input style={{ ...cs.input, marginBottom: 12 }} value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} />

      {error && <p style={estilos.error}>{error}</p>}

      <div style={estilos.acciones}>
        <button style={boton("primario")} onClick={guardar} disabled={enviando}>
          {enviando ? "Guardando..." : "Guardar cambios"}
        </button>
        <button style={boton("fantasma")} onClick={cerrar}>Cancelar</button>
      </div>
    </div>
  );
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "18px 0" },
  fecha: { margin: "0 0 8px", fontSize: "0.72rem", color: color.textoDebil, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 },
  tarjeta: { ...cs.tarjeta, padding: "14px 16px" },
  cabecera: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  titulo: { margin: 0, fontSize: "0.98rem", color: color.texto, fontWeight: 600 },
  linea: { margin: "3px 0 0", fontSize: "0.84rem", color: color.textoSuave },
  lineaTenue: { margin: "2px 0 0", fontSize: "0.82rem", color: color.textoDebil },
  descripcion: { margin: "10px 0 0", fontSize: "0.88rem", color: color.texto, lineHeight: 1.5 },
  acciones: { display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" },
  panel: { marginTop: 14, paddingTop: 14, borderTop: `1px solid ${color.borde}` },
  panelTitulo: { margin: "0 0 12px", fontSize: "0.9rem", fontWeight: 700, color: color.texto },
  error: { color: color.peligro, fontSize: "0.84rem", margin: "0 0 10px" },
};

export default Pendientes;