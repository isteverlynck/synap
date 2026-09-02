// Solicitudes.jsx — pantalla del usuario de enfermería/médico.
//
// Tiene 4 solapas:
//   1. Crear solicitud: el formulario (¿es equipo médico o no? + datos).
//   2. Enviadas: las que mandé y todavía están PENDIENTE (esperando al coordinador).
//   3. Aceptadas: las que ya se convirtieron en OT, con su estado de avance
//      (sin asignar / en progreso / finalizada).
//   4. Rechazadas: las que el coordinador rechazó, con el motivo.

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import cliente from "../api/cliente";
import { logout } from "../api/auth";
import { crearSolicitud, misSolicitudes, verOrdenTrabajo } from "../api/solicitudes";

const SOLAPAS = [
  { key: "crear", label: "Crear solicitud" },
  { key: "enviadas", label: "Enviadas" },
  { key: "aceptadas", label: "Aceptadas" },
  { key: "rechazadas", label: "Rechazadas" },
];

// ═══════════════════════════════════════════════════════════════════════════
// Helpers compartidos: formatear fecha y agrupar una lista por día
// (de más reciente a más antigua), para mostrar un encabezado de fecha
// seguido de todas las solicitudes de ese día.
// ═══════════════════════════════════════════════════════════════════════════

function formatearFecha(fechaISO) {
  return new Date(fechaISO).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// "obtenerFecha" le dice a la función cómo sacarle la fecha a cada elemento
// de la lista (útil porque en "Aceptadas" cada elemento es { solicitud, ot },
// no la solicitud directamente).
function agruparPorFecha(lista, obtenerFecha) {
  const ordenada = [...lista].sort(
    (a, b) => new Date(obtenerFecha(b)) - new Date(obtenerFecha(a))
  );
  const grupos = [];
  for (const item of ordenada) {
    const fechaRaw = obtenerFecha(item);
    const fecha = fechaRaw ? formatearFecha(fechaRaw) : "Sin fecha";
    const ultimoGrupo = grupos[grupos.length - 1];
    if (ultimoGrupo && ultimoGrupo.fecha === fecha) {
      ultimoGrupo.items.push(item);
    } else {
      grupos.push({ fecha, items: [item] });
    }
  }
  return grupos;
}

function Solicitudes() {
  const [solapa, setSolapa] = useState("crear");
  const navegar = useNavigate();

  function cerrarSesion() {
    logout();
    navegar("/");
  }

  return (
    <div style={estilos.pagina}>
      <div style={estilos.encabezado}>
        <h1 style={estilos.titulo}>Solicitudes de servicio</h1>
        <button style={estilos.botonSecundario} onClick={cerrarSesion}>
          Cerrar sesión
        </button>
      </div>

      <div style={estilos.solapas}>
        {SOLAPAS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSolapa(s.key)}
            style={solapa === s.key ? estilos.solapaActiva : estilos.solapa}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div style={estilos.contenido}>
        {solapa === "crear" && <CrearSolicitud onCreada={() => setSolapa("enviadas")} />}
        {solapa === "enviadas" && <ListaSolicitudes estado="PENDIENTE" vacio="No tenés solicitudes enviadas." />}
        {solapa === "aceptadas" && <ListaAceptadas />}
        {solapa === "rechazadas" && <ListaSolicitudes estado="RECHAZADA" vacio="No tenés solicitudes rechazadas." />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SOLAPA 1 — Crear solicitud
// ═══════════════════════════════════════════════════════════════════════════

function CrearSolicitud({ onCreada }) {
  // null = todavía no eligió; true = equipo médico; false = no es equipo médico.
  const [esEquipoMedico, setEsEquipoMedico] = useState(null);
  const [activos, setActivos] = useState([]);
  const [activoCodigo, setActivoCodigo] = useState("");
  const [busquedaActivo, setBusquedaActivo] = useState("");
  const [descripcionCosa, setDescripcionCosa] = useState("");
  const [descripcionProblema, setDescripcionProblema] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  // Cuando elige "es equipo médico", traemos la lista de activos para poder
  // filtrarla a medida que escribe.
  useEffect(() => {
    if (esEquipoMedico === true && activos.length === 0) {
      cliente.get("/activos").then((res) => setActivos(res.data)).catch(() => {});
    }
  }, [esEquipoMedico, activos.length]);

  // Filtra la lista de activos a medida que la persona escribe (por código o
  // por descripción), para no tener que buscar a mano en una lista larga.
  const textoBusqueda = busquedaActivo.trim().toLowerCase();
  const activosFiltrados = textoBusqueda
    ? activos
        .filter(
          (a) =>
            a.codigo.toLowerCase().includes(textoBusqueda) ||
            (a.descripcion || "").toLowerCase().includes(textoBusqueda)
        )
        .slice(0, 20)
    : [];
  const activoElegido = activos.find((a) => a.codigo === activoCodigo);

  function elegirTipo(valor) {
    setEsEquipoMedico(valor);
    setActivoCodigo("");
    setBusquedaActivo("");
    setDescripcionCosa("");
    setError("");
    setExito("");
  }

  async function enviar() {
    setError("");
    setExito("");

    // Validaciones simples del lado del frontend (el backend las repite igual).
    if (esEquipoMedico === null) {
      setError("Elegí si es un equipo médico o no.");
      return;
    }
    if (esEquipoMedico && !activoCodigo) {
      setError("Elegí el equipo.");
      return;
    }
    if (!esEquipoMedico && !descripcionCosa.trim()) {
      setError("Describí qué es (ej: pinza de oftalmología).");
      return;
    }
    if (!descripcionProblema.trim()) {
      setError("Describí la falla.");
      return;
    }
    if (!ubicacion.trim()) {
      setError("Indicá la ubicación.");
      return;
    }

    setEnviando(true);
    try {
      await crearSolicitud({
        es_equipo_medico: esEquipoMedico,
        activo_codigo: esEquipoMedico ? activoCodigo : undefined,
        descripcion_cosa: esEquipoMedico ? undefined : descripcionCosa.trim(),
        descripcion_problema: descripcionProblema.trim(),
        ubicacion: ubicacion.trim(),
      });
      setExito("Solicitud enviada correctamente.");
      // Limpiar el formulario para la próxima.
      setEsEquipoMedico(null);
      setActivoCodigo("");
      setBusquedaActivo("");
      setDescripcionCosa("");
      setDescripcionProblema("");
      setUbicacion("");
      onCreada?.();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo enviar la solicitud.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={estilos.tarjetaForm}>
      <p style={estilos.pregunta}>¿Es un equipo médico?</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button
          style={esEquipoMedico === true ? estilos.opcionActiva : estilos.opcion}
          onClick={() => elegirTipo(true)}
        >
          Sí, es un equipo médico
        </button>
        <button
          style={esEquipoMedico === false ? estilos.opcionActiva : estilos.opcion}
          onClick={() => elegirTipo(false)}
        >
          No (ej: instrumental)
        </button>
      </div>

      {esEquipoMedico === true && (
        <div style={estilos.campo}>
          <label style={estilos.label}>Equipo</label>
          {activoCodigo ? (
            <div style={estilos.equipoElegido}>
              <span>
                <strong>{activoCodigo}</strong>
                {activoElegido ? ` — ${activoElegido.descripcion}` : ""}
              </span>
              <button
                type="button"
                style={estilos.linkCambiar}
                onClick={() => {
                  setActivoCodigo("");
                  setBusquedaActivo("");
                }}
              >
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <input
                style={estilos.input}
                placeholder="Escribí el código o la descripción del equipo…"
                value={busquedaActivo}
                onChange={(e) => setBusquedaActivo(e.target.value)}
              />
              {textoBusqueda && (
                <div style={estilos.listaSugerencias}>
                  {activosFiltrados.length === 0 && (
                    <div style={estilos.sugerenciaVacia}>No se encontró ningún equipo.</div>
                  )}
                  {activosFiltrados.map((a) => (
                    <div
                      key={a.codigo}
                      style={estilos.sugerencia}
                      onClick={() => {
                        setActivoCodigo(a.codigo);
                        setBusquedaActivo("");
                      }}
                    >
                      <strong>{a.codigo}</strong> — {a.descripcion}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {esEquipoMedico === false && (
        <div style={estilos.campo}>
          <label style={estilos.label}>¿Qué es?</label>
          <input
            style={estilos.input}
            placeholder="Ej: pinza de oftalmología"
            value={descripcionCosa}
            onChange={(e) => setDescripcionCosa(e.target.value)}
          />
        </div>
      )}

      {esEquipoMedico !== null && (
        <>
          <div style={estilos.campo}>
            <label style={estilos.label}>Descripción de la falla</label>
            <textarea
              style={{ ...estilos.input, minHeight: 80, resize: "vertical" }}
              placeholder="Contá qué le pasa"
              value={descripcionProblema}
              onChange={(e) => setDescripcionProblema(e.target.value)}
            />
          </div>

          <div style={estilos.campo}>
            <label style={estilos.label}>Ubicación</label>
            <input
              style={estilos.input}
              placeholder="Ej: Quirófano 2"
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value)}
            />
          </div>

          {error && <p style={estilos.error}>{error}</p>}
          {exito && <p style={estilos.exito}>{exito}</p>}

          <button style={estilos.boton} onClick={enviar} disabled={enviando}>
            {enviando ? "Enviando..." : "Enviar solicitud"}
          </button>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SOLAPA 2 y 4 — Lista simple de solicitudes por estado (enviadas / rechazadas)
// ═══════════════════════════════════════════════════════════════════════════

function ListaSolicitudes({ estado, vacio }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [filtroNumero, setFiltroNumero] = useState("");

  useEffect(() => {
    misSolicitudes(estado)
      .then(setSolicitudes)
      .catch(() => setError("No se pudieron cargar las solicitudes."))
      .finally(() => setCargando(false));
  }, [estado]);

  if (cargando) return <p style={estilos.mensaje}>Cargando…</p>;
  if (error) return <p style={{ ...estilos.mensaje, color: "#d70015" }}>{error}</p>;
  if (solicitudes.length === 0) return <p style={estilos.mensaje}>{vacio}</p>;

  // Filtra por número de solicitud (acepta que escriban "#12" o solo "12").
  const textoFiltro = filtroNumero.trim().replace(/^#/, "");
  const solicitudesFiltradas = textoFiltro
    ? solicitudes.filter((s) => String(s.numero_solicitud).includes(textoFiltro))
    : solicitudes;
  const grupos = agruparPorFecha(solicitudesFiltradas, (s) => s.created_at);

  return (
    <div>
      <input
        style={estilos.filtro}
        placeholder="Buscar por N° de solicitud…"
        value={filtroNumero}
        onChange={(e) => setFiltroNumero(e.target.value)}
      />

      {grupos.length === 0 && (
        <p style={estilos.mensaje}>No encontramos ninguna solicitud con ese número.</p>
      )}

      {grupos.map((grupo) => (
        <div key={grupo.fecha}>
          <h3 style={estilos.fechaTitulo}>{grupo.fecha}</h3>
          {grupo.items.map((s) => (
            <TarjetaSolicitud key={s.id} s={s}>
              {s.estado === "RECHAZADA" && s.motivo_rechazo && (
                <p style={estilos.motivoRechazo}>Motivo: {s.motivo_rechazo}</p>
              )}
            </TarjetaSolicitud>
          ))}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SOLAPA 3 — Aceptadas, con su sub-estado (sin asignar / en progreso / finalizada)
// ═══════════════════════════════════════════════════════════════════════════

function estadoOt(ot) {
  if (!ot) return { texto: "Sin asignar", color: "#e37400", fondo: "#fff4e5" };
  if (ot.estado === "CERRADA") return { texto: "Finalizada", color: "#1a7f37", fondo: "#e6f7ec" };
  if (!ot.tecnico_id) return { texto: "Sin asignar", color: "#e37400", fondo: "#fff4e5" };
  return { texto: "En progreso", color: "#0071e3", fondo: "#e8f2ff" };
}

function ListaAceptadas() {
  const [items, setItems] = useState([]); // [{ solicitud, ot }]
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [filtroNumero, setFiltroNumero] = useState("");

  const cargar = useCallback(async () => {
    setError("");
    try {
      const solicitudes = await misSolicitudes("ACEPTADA");
      // Para cada solicitud aceptada, traemos su OT para saber en qué anda.
      const conOt = await Promise.all(
        solicitudes.map(async (s) => {
          if (!s.ot_id) return { solicitud: s, ot: null };
          try {
            const ot = await verOrdenTrabajo(s.ot_id);
            return { solicitud: s, ot };
          } catch {
            return { solicitud: s, ot: null };
          }
        })
      );
      setItems(conOt);
    } catch {
      setError("No se pudieron cargar las solicitudes aceptadas.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando) return <p style={estilos.mensaje}>Cargando…</p>;
  if (error) return <p style={{ ...estilos.mensaje, color: "#d70015" }}>{error}</p>;
  if (items.length === 0) return <p style={estilos.mensaje}>No tenés solicitudes aceptadas todavía.</p>;

  const textoFiltro = filtroNumero.trim().replace(/^#/, "");
  const itemsFiltrados = textoFiltro
    ? items.filter((it) => String(it.solicitud.numero_solicitud).includes(textoFiltro))
    : items;
  const grupos = agruparPorFecha(itemsFiltrados, (it) => it.solicitud.created_at);

  return (
    <div>
      <input
        style={estilos.filtro}
        placeholder="Buscar por N° de solicitud…"
        value={filtroNumero}
        onChange={(e) => setFiltroNumero(e.target.value)}
      />

      {grupos.length === 0 && (
        <p style={estilos.mensaje}>No encontramos ninguna solicitud con ese número.</p>
      )}

      {grupos.map((grupo) => (
        <div key={grupo.fecha}>
          <h3 style={estilos.fechaTitulo}>{grupo.fecha}</h3>
          {grupo.items.map(({ solicitud: s, ot }) => {
            const estado = estadoOt(ot);
            return (
              <TarjetaSolicitud key={s.id} s={s}>
                <span style={{ ...estilos.badge, color: estado.color, background: estado.fondo }}>
                  {estado.texto}
                </span>
              </TarjetaSolicitud>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tarjeta común para mostrar una solicitud (la reusan las 3 listas)
// ═══════════════════════════════════════════════════════════════════════════

function TarjetaSolicitud({ s, children }) {
  return (
    <div style={estilos.tarjeta}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <div style={estilos.numeroSolicitud}>Solicitud #{s.numero_solicitud}</div>
          <strong>{s.titulo}</strong>
          <div style={estilos.detalle}>{s.descripcion_problema}</div>
          <div style={estilos.detalle}>📍 {s.ubicacion}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Estilos (mismo criterio simple que el resto de las pantallas de SYNAP)
// ═══════════════════════════════════════════════════════════════════════════

const estilos = {
  pagina: { padding: 40, fontFamily: "system-ui", maxWidth: 800, margin: "0 auto" },
  encabezado: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  titulo: { color: "#0071e3", margin: 0 },
  botonSecundario: { padding: "8px 16px", borderRadius: 8, border: "1px solid #ddd", background: "white", cursor: "pointer" },
  solapas: { display: "flex", gap: 6, borderBottom: "1px solid #eee", marginBottom: 20 },
  solapa: {
    padding: "10px 16px", border: "none", background: "none", cursor: "pointer",
    fontSize: "0.95rem", color: "#666", borderBottom: "2px solid transparent",
  },
  solapaActiva: {
    padding: "10px 16px", border: "none", background: "none", cursor: "pointer",
    fontSize: "0.95rem", color: "#0071e3", fontWeight: 600, borderBottom: "2px solid #0071e3",
  },
  contenido: { minHeight: 200 },
  tarjetaForm: { background: "white", padding: 24, borderRadius: 12, border: "1px solid #eee", maxWidth: 480 },
  pregunta: { fontWeight: 600, marginBottom: 10 },
  opcion: { flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer" },
  opcionActiva: { flex: 1, padding: "12px", borderRadius: 10, border: "2px solid #0071e3", background: "#e8f2ff", cursor: "pointer", fontWeight: 600 },
  campo: { marginBottom: 16 },
  label: { display: "block", marginBottom: 6, fontSize: "0.85rem", color: "#666" },
  input: { width: "100%", padding: "12px", borderRadius: 10, border: "1px solid #ddd", fontSize: "1rem", boxSizing: "border-box", fontFamily: "inherit" },
  equipoElegido: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px", borderRadius: 10, border: "1px solid #ddd", background: "#f9f9fb",
  },
  linkCambiar: {
    border: "none", background: "none", color: "#0071e3", cursor: "pointer",
    fontSize: "0.85rem", fontWeight: 600, padding: 0,
  },
  listaSugerencias: {
    marginTop: 6, maxHeight: 220, overflowY: "auto", border: "1px solid #ddd",
    borderRadius: 10, background: "white",
  },
  sugerencia: {
    padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid #f0f0f0", fontSize: "0.9rem",
  },
  sugerenciaVacia: { padding: "10px 12px", color: "#666", fontSize: "0.85rem" },
  boton: { width: "100%", padding: "12px", background: "#0071e3", color: "white", border: "none", borderRadius: 10, fontSize: "1rem", cursor: "pointer" },
  error: { color: "#d70015", fontSize: "0.85rem", margin: "0 0 12px" },
  exito: { color: "#1a7f37", fontSize: "0.85rem", margin: "0 0 12px" },
  mensaje: { color: "#666", padding: "20px 0" },
  filtro: {
    width: "100%", maxWidth: 280, padding: "10px 14px", marginBottom: 20, borderRadius: 10,
    border: "1px solid #ddd", fontSize: "0.9rem", boxSizing: "border-box", fontFamily: "inherit",
  },
  fechaTitulo: { fontSize: "0.85rem", color: "#666", fontWeight: 600, margin: "20px 0 10px" },
  numeroSolicitud: { fontSize: "0.75rem", color: "#0071e3", fontWeight: 600, marginBottom: 4 },
  tarjeta: { background: "white", padding: 16, borderRadius: 10, marginBottom: 10, border: "1px solid #eee" },
  detalle: { fontSize: "0.85rem", color: "#666", marginTop: 4 },
  motivoRechazo: { fontSize: "0.85rem", color: "#d70015", marginTop: 6 },
  badge: { fontSize: "0.75rem", fontWeight: 600, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap" },
};

export default Solicitudes;