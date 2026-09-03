// Solicitudes.jsx — pantalla del usuario de enfermería/médico.
//
// Tiene 4 solapas:
//   1. Crear solicitud: el formulario (¿es equipo médico o no? + datos).
//   2. Enviadas: las que mandé y todavía están PENDIENTE (esperando al coordinador).
//   3. Aceptadas: las que ya se convirtieron en OT, con su estado de avance
//      (sin asignar / en progreso / finalizada).
//   4. Rechazadas: las que el coordinador rechazó, con el motivo.

import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import cliente from "../api/cliente";
import { logout } from "../api/auth";
import { crearSolicitud, misSolicitudes, verOrdenTrabajo } from "../api/solicitudes";
import { verActivo } from "../api/activos";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton, insignia } from "../tema";

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
  const location = useLocation();
  // Si llegamos acá después de escanear el QR de un equipo, viene el código
  // en el estado de la navegación (ver EscanearQR.jsx).
  const activoEscaneado = location.state?.activoCodigoEscaneado || null;

  function cerrarSesion() {
    logout();
    navegar("/");
  }

  return (
    <div style={cs.pagina}>
      <div style={cs.contenido}>
        <Encabezado titulo="Solicitudes de servicio" subtitulo="Enfermería">
          <button style={boton("secundario")} onClick={() => navegar("/escanear")}>
            Escanear equipo (QR)
          </button>
          <button style={boton("fantasma")} onClick={cerrarSesion}>
            Cerrar sesión
          </button>
        </Encabezado>

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

        <div style={estilos.contenidoSolapa}>
          {solapa === "crear" && (
            <div style={estilos.envoltorioForm}>
              <CrearSolicitud activoInicial={activoEscaneado} onCreada={() => setSolapa("enviadas")} />
            </div>
          )}
          {solapa === "enviadas" && <ListaSolicitudes estado="PENDIENTE" vacio="No tenés solicitudes enviadas." />}
          {solapa === "aceptadas" && <ListaAceptadas />}
          {solapa === "rechazadas" && <ListaSolicitudes estado="RECHAZADA" vacio="No tenés solicitudes rechazadas." />}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SOLAPA 1 — Crear solicitud
// ═══════════════════════════════════════════════════════════════════════════

function CrearSolicitud({ onCreada, activoInicial }) {
  // null = todavía no eligió; true = equipo médico; false = no es equipo médico.
  // Si venimos de escanear un QR, ya sabemos que es un equipo médico y cuál.
  const [esEquipoMedico, setEsEquipoMedico] = useState(activoInicial ? true : null);
  const [activos, setActivos] = useState([]);
  // codigoTexto = lo que la persona va escribiendo. activoValidado = el
  // equipo ya confirmado contra el backend (solo se puede enviar la
  // solicitud si esto está cargado, así el ID siempre queda validado).
  const [codigoTexto, setCodigoTexto] = useState(activoInicial || "");
  const [activoValidado, setActivoValidado] = useState(null);
  const [validandoCodigo, setValidandoCodigo] = useState(false);
  const [errorCodigo, setErrorCodigo] = useState("");
  const [descripcionCosa, setDescripcionCosa] = useState("");
  const [descripcionProblema, setDescripcionProblema] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  // Traemos una lista de activos para mostrar sugerencias mientras escribe.
  // No hace falta que esté completa: el ID que finalmente se manda siempre
  // se valida contra el backend (ver validarCodigo), así que aunque el
  // equipo no aparezca en esta lista corta igual funciona si se escribe el
  // código exacto (por ejemplo, leyéndolo del cartelito QR pegado en el equipo).
  useEffect(() => {
    if (esEquipoMedico === true && activos.length === 0) {
      cliente.get("/activos").then((res) => setActivos(res.data)).catch(() => {});
    }
  }, [esEquipoMedico, activos.length]);

  // Confirma contra el backend que el ID escrito corresponde a un equipo
  // real. Se usa al elegir una sugerencia, al salir del campo (onBlur), al
  // apretar Enter, y al mandar el formulario si todavía no se había validado.
  // Devuelve el activo encontrado, o null si el ID no existe.
  async function validarCodigo(codigo) {
    const limpio = codigo.trim();
    if (!limpio) return null;
    setValidandoCodigo(true);
    setErrorCodigo("");
    try {
      const activo = await verActivo(limpio);
      setActivoValidado(activo);
      setCodigoTexto(activo.codigo);
      return activo;
    } catch {
      setActivoValidado(null);
      setErrorCodigo(`No encontramos ningún equipo con el ID "${limpio}". Revisalo e intentá de nuevo.`);
      return null;
    } finally {
      setValidandoCodigo(false);
    }
  }

  // Si venimos de escanear un QR ya sabemos el código; lo validamos igual
  // (para tener la descripción y confirmar que el equipo sigue existiendo).
  useEffect(() => {
    if (activoInicial) validarCodigo(activoInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activoInicial]);

  // Filtra la lista de activos a medida que la persona escribe (por código o
  // por descripción), para no tener que buscar a mano en una lista larga.
  const textoBusqueda = codigoTexto.trim().toLowerCase();
  const activosFiltrados = !activoValidado && textoBusqueda
    ? activos
        .filter(
          (a) =>
            a.codigo.toLowerCase().includes(textoBusqueda) ||
            (a.descripcion || "").toLowerCase().includes(textoBusqueda)
        )
        .slice(0, 20)
    : [];

  function elegirTipo(valor) {
    setEsEquipoMedico(valor);
    setCodigoTexto("");
    setActivoValidado(null);
    setErrorCodigo("");
    setDescripcionCosa("");
    setError("");
    setExito("");
  }

  function cambiarEquipo() {
    setActivoValidado(null);
    setCodigoTexto("");
    setErrorCodigo("");
  }

  async function enviar() {
    setError("");
    setExito("");

    // Validaciones simples del lado del frontend (el backend las repite igual).
    if (esEquipoMedico === null) {
      setError("Elegí si es un equipo médico o no.");
      return;
    }

    // El ID del equipo es obligatorio y siempre tiene que estar validado
    // contra el backend antes de poder enviar (así nunca se manda un ID
    // que no exista).
    let equipo = activoValidado;
    if (esEquipoMedico && !equipo) {
      if (!codigoTexto.trim()) {
        setError("Ingresá el ID del equipo.");
        return;
      }
      equipo = await validarCodigo(codigoTexto);
      if (!equipo) return; // el error ya quedó mostrado debajo del campo
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
        activo_codigo: esEquipoMedico ? equipo.codigo : undefined,
        descripcion_cosa: esEquipoMedico ? undefined : descripcionCosa.trim(),
        descripcion_problema: descripcionProblema.trim(),
        ubicacion: ubicacion.trim(),
      });
      setExito("Solicitud enviada correctamente.");
      // Limpiar el formulario para la próxima.
      setEsEquipoMedico(null);
      setCodigoTexto("");
      setActivoValidado(null);
      setErrorCodigo("");
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
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
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
          <label style={cs.label}>ID del equipo</label>
          {activoValidado ? (
            <div style={estilos.equipoElegido}>
              <span>
                <strong>{activoValidado.codigo}</strong> — {activoValidado.descripcion}
              </span>
              <button type="button" style={estilos.linkCambiar} onClick={cambiarEquipo}>
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <input
                style={cs.input}
                placeholder="Ej: B-CIRU-MAAN-056"
                value={codigoTexto}
                onChange={(e) => {
                  setCodigoTexto(e.target.value);
                  setErrorCodigo("");
                }}
                onBlur={() => codigoTexto.trim() && validarCodigo(codigoTexto)}
                onKeyDown={(e) => e.key === "Enter" && validarCodigo(codigoTexto)}
              />
              {validandoCodigo && <p style={estilos.ayudaCampo}>Verificando…</p>}
              {errorCodigo && <p style={estilos.error}>{errorCodigo}</p>}
              {!errorCodigo && !validandoCodigo && textoBusqueda && activosFiltrados.length > 0 && (
                <div style={estilos.listaSugerencias}>
                  {activosFiltrados.map((a) => (
                    <div key={a.codigo} style={estilos.sugerencia} onClick={() => validarCodigo(a.codigo)}>
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
          <label style={cs.label}>¿Qué es?</label>
          <input
            style={cs.input}
            placeholder="Ej: pinza de oftalmología"
            value={descripcionCosa}
            onChange={(e) => setDescripcionCosa(e.target.value)}
          />
        </div>
      )}

      {esEquipoMedico !== null && (
        <>
          <div style={estilos.campo}>
            <label style={cs.label}>Descripción de la falla</label>
            <textarea
              style={{ ...cs.input, minHeight: 60, resize: "vertical" }}
              placeholder="Contá qué le pasa"
              value={descripcionProblema}
              onChange={(e) => setDescripcionProblema(e.target.value)}
            />
          </div>

          <div style={estilos.campo}>
            <label style={cs.label}>Ubicación</label>
            <input
              style={cs.input}
              placeholder="Ej: Quirófano 2"
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value)}
            />
          </div>

          {error && <p style={estilos.error}>{error}</p>}
          {exito && <p style={estilos.exito}>{exito}</p>}

          <button style={{ ...boton("primario"), width: "100%", padding: "12px" }} onClick={enviar} disabled={enviando}>
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
  if (error) return <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>;
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
  if (!ot) return { texto: "Sin asignar", tono: "advertencia" };
  if (ot.estado === "CERRADA") return { texto: "Finalizada", tono: "exito" };
  if (!ot.tecnico_id) return { texto: "Sin asignar", tono: "advertencia" };
  return { texto: "En progreso", tono: "primario" };
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
  if (error) return <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>;
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
                <span style={insignia(estado.tono)}>{estado.texto}</span>
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
          <strong style={estilos.tituloSolicitud}>{s.titulo}</strong>
          <div style={estilos.detalle}>{s.descripcion_problema}</div>
          <div style={estilos.detalle}>📍 {s.ubicacion}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Estilos (usan los tokens compartidos de tema.js, más los propios de esta
// pantalla: solapas, tarjeta de solicitud, formulario, etc.)
// ═══════════════════════════════════════════════════════════════════════════

const estilos = {
  solapas: {
    display: "flex",
    gap: 6,
    background: color.bordeSuave,
    padding: 4,
    borderRadius: 12,
    width: "fit-content",
    margin: "0 auto 18px",
  },
  solapa: {
    padding: "9px 16px",
    border: "none",
    background: "none",
    cursor: "pointer",
    borderRadius: 9,
    fontSize: "0.88rem",
    fontWeight: 600,
    color: color.textoSuave,
    fontFamily: "inherit",
  },
  solapaActiva: {
    padding: "9px 16px",
    border: "none",
    cursor: "pointer",
    borderRadius: 9,
    fontSize: "0.88rem",
    fontWeight: 600,
    color: color.primario,
    background: color.tarjeta,
    boxShadow: "0 1px 3px rgba(20,24,35,0.1)",
    fontFamily: "inherit",
  },
  contenidoSolapa: { minHeight: 200 },
  // Centra la tarjeta de "Crear solicitud" en el medio de la pantalla (en vez
  // de quedar pegada a la izquierda) y le da un tamaño compacto para que
  // entre todo sin tener que scrollear.
  envoltorioForm: { display: "flex", justifyContent: "center" },
  tarjetaForm: { ...cs.tarjeta, padding: "22px 26px", width: "100%", maxWidth: 440 },
  pregunta: { fontWeight: 700, marginBottom: 8, color: color.texto, fontSize: "0.95rem" },
  opcion: {
    flex: 1, padding: "12px", borderRadius: 10, border: `1.5px solid ${color.borde}`,
    background: color.tarjeta, cursor: "pointer", fontFamily: "inherit", fontSize: "0.88rem", color: color.texto,
  },
  opcionActiva: {
    flex: 1, padding: "12px", borderRadius: 10, border: `1.5px solid ${color.primario}`,
    background: color.primarioClaro, cursor: "pointer", fontWeight: 600,
    fontFamily: "inherit", fontSize: "0.88rem", color: color.primarioOscuro,
  },
  campo: { marginBottom: 13 },
  equipoElegido: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${color.borde}`, background: color.fondo,
  },
  linkCambiar: {
    border: "none", background: "none", color: color.primario, cursor: "pointer",
    fontSize: "0.85rem", fontWeight: 600, padding: 0, fontFamily: "inherit",
  },
  listaSugerencias: {
    marginTop: 6, maxHeight: 220, overflowY: "auto", border: `1px solid ${color.borde}`,
    borderRadius: 10, background: color.tarjeta,
  },
  sugerencia: {
    padding: "10px 12px", cursor: "pointer", borderBottom: `1px solid ${color.bordeSuave}`, fontSize: "0.88rem", color: color.texto,
  },
  ayudaCampo: { color: color.textoSuave, fontSize: "0.8rem", margin: "6px 0 0" },
  error: { color: color.peligro, fontSize: "0.85rem", margin: "0 0 12px" },
  exito: { color: color.exito, fontSize: "0.85rem", margin: "0 0 12px" },
  mensaje: { color: color.textoSuave, padding: "20px 0" },
  filtro: {
    ...cs.input,
    width: "100%", maxWidth: 280, marginBottom: 20,
  },
  fechaTitulo: { fontSize: "0.8rem", color: color.textoDebil, fontWeight: 700, letterSpacing: "0.02em", margin: "22px 0 10px", textTransform: "uppercase" },
  numeroSolicitud: { fontSize: "0.74rem", color: color.primario, fontWeight: 700, marginBottom: 4 },
  tituloSolicitud: { color: color.texto, fontSize: "0.98rem" },
  tarjeta: { ...cs.tarjeta, padding: "16px 20px", marginBottom: 10 },
  detalle: { fontSize: "0.85rem", color: color.textoSuave, marginTop: 4 },
  motivoRechazo: { fontSize: "0.85rem", color: color.peligro, marginTop: 6 },
};

export default Solicitudes;