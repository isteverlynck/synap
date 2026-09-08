// DetalleOrden.jsx — una OT abierta en detalle. Es la pantalla donde el trabajo
// efectivamente avanza: el técnico la arranca y la cierra, coordinación la
// asigna o reasigna.
//
// Igual que en la ficha del equipo, la parte de arriba es idéntica para todos
// y lo único que cambia son las acciones de abajo.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  verOrden, cambiarEstado, cerrarOrden, asignarTecnico, listarNotas, agregarNota,
  listarCorrectivasAsociadas, crearCorrectivaAsociada,
} from "../api/ordenes";
import { tecnicosDisponibles } from "../api/coordinacion";
import { obtenerPerfil } from "../api/auth";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton, insignia } from "../tema";
import Volver from "../componentes/Volver";
import { toast } from "sonner";

function DetalleOrden() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [ot, setOt] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [tecnicos, setTecnicos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [accion, setAccion] = useState(null);   // 'cerrar' | 'asignar' | 'correctiva' | null
  const [notas, setNotas] = useState([]);
  const [correctivas, setCorrectivas] = useState([]);

  useEffect(() => {
    Promise.all([verOrden(id), obtenerPerfil()])
      .then(([orden, p]) => { setOt(orden); setPerfil(p); })
      .catch(() => setError("No pudimos cargar esta orden de trabajo."))
      .finally(() => setCargando(false));
    listarNotas(id).then(setNotas).catch(() => {});
    // Las correctivas asociadas solo existen para preventivas; pedirlas para
    // cualquier OT no rompe nada (una correctiva simplemente no tiene), pero
    // total da una lista vacía sin uso — igual la pedimos siempre acá porque
    // todavía no sabemos el tipo hasta que responde verOrden.
    listarCorrectivasAsociadas(id).then(setCorrectivas).catch(() => {});
  }, [id]);

  const rol = perfil?.rol === "junior" ? "tecnico" : perfil?.rol;
  const esCoordinacion = rol === "coordinacion";
  // El técnico solo puede ARRANCAR/CERRAR sus propias órdenes...
  const esMiOrden = rol === "tecnico" && ot?.tecnico_id === perfil?.id;
  // ...pero puede REASIGNAR (pasársela a un compañero) y sumar notas a
  // cualquier OT de su propio grupo, esté asignada a él o a otra persona: así
  // el grupo se reparte el trabajo sin depender del coordinador para cada pase.
  const esDeMiGrupo = rol === "tecnico" && !!perfil?.grupo && ot?.grupo_id === perfil.grupo;
  const puedeAsignar = esCoordinacion || esDeMiGrupo;

  useEffect(() => {
    if (!puedeAsignar) return;
    tecnicosDisponibles().then(setTecnicos).catch(() => setTecnicos([]));
  }, [puedeAsignar]);

  async function arrancar() {
    try {
      setOt(await cambiarEstado(id, "EN_PROGRESO"));
      toast.success("Orden en progreso");
    } catch (e) {
      setError(e.response?.data?.detail || "No pudimos cambiar el estado.");
    }
  }

  if (cargando) return <p style={estilos.mensaje}>Cargando orden...</p>;
  if (error && !ot) return <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>;

  const cerrada = ot.estado === "CERRADA";

  return (
    <>
      <Volver a="/ordenes" />
      <Encabezado
        titulo={`OT-${String(ot.numero_ot).padStart(4, "0")}`}
        subtitulo={ot.tipo}
      >
        <button style={boton("fantasma")} onClick={() => navegar("/ordenes")}>
          Volver al listado
        </button>
      </Encabezado>

      {/* Estado arriba de todo, igual que en la ficha del equipo. */}
      <div style={estilos.pastillas}>
        <span style={insignia(tonoEstadoOT(ot.estado))}>{textoEstado(ot.estado)}</span>
        {ot.prioridad && (
          <span className={`sy-prioridad sy-prioridad-${ot.prioridad.toLowerCase()}`}>
            Prioridad {ot.prioridad.toLowerCase()}
          </span>
        )}
      </div>

      {/* El equipo, clickeable: desde la OT se llega a su ficha completa. */}
      <div
        className="sy-clickeable"
        style={{ ...cs.tarjeta, padding: "14px 18px", marginBottom: 12, cursor: "pointer" }}
        onClick={() => navegar(`/activos/${ot.activo_codigo}`)}
      >
        <p style={estilos.equipoNombre}>{ot.activo_descripcion || "Equipo sin descripción"}</p>
        <p style={estilos.equipoCodigo}>
          {ot.activo_codigo}{ot.activo_ubicacion ? ` · ${ot.activo_ubicacion}` : ""}
        </p>
      </div>

      {ot.descripcion && (
        <div style={{ ...cs.tarjeta, padding: "14px 18px", marginBottom: 12 }}>
          <p style={estilos.etiqueta}>El problema</p>
          <p style={estilos.texto}>{ot.descripcion}</p>
        </div>
      )}

      <div style={estilos.datos}>
        <Dato etiqueta="Notificada" valor={fechaHora(ot.fecha_notificacion)} />
        <Dato etiqueta="Abierta" valor={fechaHora(ot.fecha_apertura)} />
        <Dato etiqueta="Cerrada" valor={fechaHora(ot.fecha_cierre)} />
        {/* Este es el KPI de inactividad del anteproyecto, calculado acá para
        que quien mira la OT lo vea sin ir al dashboard. */}
        <Dato etiqueta="Fuera de servicio" valor={tiempoFueraDeServicio(ot)} />
      </div>

      {ot.observaciones && (
        <div style={{ ...cs.tarjeta, padding: "14px 18px", marginTop: 12 }}>
          <p style={estilos.etiqueta}>Qué se hizo</p>
          <p style={estilos.texto}>{ot.observaciones}</p>
        </div>
      )}

      {error && <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>}

      {/* ─── Acciones ─── */}
      {!cerrada && !accion && (
        <div style={estilos.acciones}>
          {esMiOrden && ot.estado === "ABIERTA" && (
            <button style={boton("primario")} onClick={arrancar}>Empezar a trabajar</button>
          )}
          {esMiOrden && ot.estado === "EN_PROGRESO" && (
            <button style={boton("primario")} onClick={() => setAccion("cerrar")}>Cerrar la orden</button>
          )}
          {puedeAsignar && (
            <button style={boton("secundario")} onClick={() => setAccion("asignar")}>
              {ot.tecnico_id ? "Reasignar técnico" : "Asignar técnico"}
            </button>
          )}
          {/* Solo tiene sentido desde una preventiva: es el "che, esto no
          funciona" que aparece haciendo el mantenimiento programado. */}
          {ot.tipo === "PREVENTIVA" && puedeAsignar && (
            <button style={boton("secundario")} onClick={() => setAccion("correctiva")}>
              Algo no funciona: generar correctiva
            </button>
          )}
        </div>
      )}

      {accion === "cerrar" && (
        <PanelCerrar ot={ot} setOt={setOt} cerrar={() => setAccion(null)} />
      )}
      {accion === "asignar" && (
        <PanelAsignar ot={ot} setOt={setOt} tecnicos={tecnicos} cerrar={() => setAccion(null)} />
      )}
      {accion === "correctiva" && (
        <PanelCorrectivaAsociada
          ot={ot}
          setCorrectivas={setCorrectivas}
          cerrar={() => setAccion(null)}
          navegar={navegar}
        />
      )}

      {/* ─── Correctivas ya generadas desde esta preventiva ─── */}
      {ot.tipo === "PREVENTIVA" && correctivas.length > 0 && (
        <div style={{ ...cs.tarjeta, padding: 18, marginTop: 14 }}>
          <p style={estilos.panelTitulo}>Correctivas generadas desde esta OT</p>
          <div style={estilos.listaNotas}>
            {correctivas.map((c) => (
              <div
                key={c.id}
                className="sy-clickeable"
                style={{ ...estilos.nota, cursor: "pointer" }}
                onClick={() => navegar(`/ordenes/${c.id}`)}
              >
                <div style={estilos.notaCabecera}>
                  <span style={estilos.notaAutor}>OT-{String(c.numero_ot).padStart(4, "0")} · Correctiva</span>
                  <span style={insignia(tonoEstadoOT(c.estado))}>{textoEstado(c.estado)}</span>
                </div>
                <p style={estilos.texto}>{c.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Bitácora: lo que se va haciendo mientras la OT está en curso ─── */}
      {(notas.length > 0 || (!cerrada && puedeAsignar) || esMiOrden) && (
        <PanelBitacora
          ot={ot}
          notas={notas}
          setNotas={setNotas}
          puedeEscribir={!cerrada && (esMiOrden || puedeAsignar)}
        />
      )}
    </>
  );
}

// ─── Bitácora ───

function PanelBitacora({ ot, notas, setNotas, puedeEscribir }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function agregar() {
    if (!texto.trim()) return;
    setEnviando(true);
    setError("");
    try {
      const nueva = await agregarNota(ot.id, texto.trim());
      setNotas((antes) => [...antes, nueva]);
      setTexto("");
    } catch (e) {
      setError(e.response?.data?.detail || "No pudimos guardar la nota.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ ...cs.tarjeta, padding: 18, marginTop: 16 }}>
      <p style={estilos.panelTitulo}>Bitácora</p>
      <p style={estilos.bitacoraAyuda}>
        Lo que se va haciendo, encontrando o necesitando mientras se trabaja en
        esta orden — queda de registro para cuando se cierre.
      </p>

      {notas.length === 0 && <p style={estilos.mensaje}>Todavía no hay entradas.</p>}

      <div style={estilos.listaNotas}>
        {notas.map((n) => (
          <div key={n.id} style={estilos.nota}>
            <div style={estilos.notaCabecera}>
              <span style={estilos.notaAutor}>{n.autor_nombre || "Alguien del equipo"}</span>
              <span style={estilos.notaFecha}>{fechaHora(n.created_at)}</span>
            </div>
            <p style={estilos.texto}>{n.texto}</p>
          </div>
        ))}
      </div>

      {puedeEscribir && (
        <div style={{ marginTop: notas.length > 0 ? 14 : 0 }}>
          <textarea
            style={{ ...cs.input, minHeight: 60, marginBottom: 8, resize: "vertical" }}
            placeholder="Ej: se pidió el repuesto, llega en dos días."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          {error && <p style={estilos.error}>{error}</p>}
          <button style={boton("secundario")} onClick={agregar} disabled={enviando || !texto.trim()}>
            {enviando ? "Guardando..." : "Agregar a la bitácora"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Cerrar ───

function PanelCerrar({ ot, setOt, cerrar }) {
  const [observaciones, setObservaciones] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function confirmar() {
    // No es obligatorio para el backend, pero lo pedimos igual: sin esto el
    // historial de fallas queda vacío y el análisis de patrones no se puede
    // hacer. Es el dato que después alimenta las decisiones sobre el parque.
    if (!observaciones.trim()) {
      setError("Contá qué se hizo: es lo que queda en el historial del equipo.");
      return;
    }
    setEnviando(true);
    try {
      setOt(await cerrarOrden(ot.id, observaciones.trim()));
      toast.success(`OT-${String(ot.numero_ot).padStart(4, "0")} cerrada`, {
        description: "Ya figura en el historial del equipo.",
      });
      cerrar();
    } catch (e) {
      setError(e.response?.data?.detail || "No pudimos cerrar la orden.");
      setEnviando(false);
    }
  }

  return (
    <div style={{ ...cs.tarjeta, padding: 18, marginTop: 14 }}>
      <p style={estilos.panelTitulo}>Cerrar la orden</p>
      <label style={cs.label}>Qué se hizo</label>
      <textarea
        style={{ ...cs.input, minHeight: 80, marginBottom: 12, resize: "vertical" }}
        placeholder="Ej: se reemplazó el sensor de flujo y se calibró el equipo."
        value={observaciones}
        onChange={(e) => setObservaciones(e.target.value)}
      />
      {error && <p style={estilos.error}>{error}</p>}
      <div style={estilos.acciones}>
        <button style={boton("primario")} onClick={confirmar} disabled={enviando}>
          {enviando ? "Cerrando..." : "Confirmar cierre"}
        </button>
        <button style={boton("fantasma")} onClick={cerrar}>Cancelar</button>
      </div>
    </div>
  );
}

// ─── Asignar ───

function PanelAsignar({ ot, setOt, tecnicos, cerrar }) {
  const [tecnicoId, setTecnicoId] = useState(ot.tecnico_id || "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function confirmar() {
    if (!tecnicoId) { setError("Elegí un técnico."); return; }
    setEnviando(true);
    try {
      setOt(await asignarTecnico(ot.id, tecnicoId));
      toast.success("Orden asignada");
      cerrar();
    } catch (e) {
      setError(e.response?.data?.detail || "No pudimos asignar la orden.");
      setEnviando(false);
    }
  }

  return (
    <div style={{ ...cs.tarjeta, padding: 18, marginTop: 14 }}>
      <p style={estilos.panelTitulo}>Asignar la orden</p>
      <label style={cs.label}>Técnico</label>
      <select style={{ ...cs.input, marginBottom: 12 }} value={tecnicoId}
              onChange={(e) => setTecnicoId(e.target.value)}>
        <option value="">Elegir...</option>
        {tecnicos.map((t) => (
          <option key={t.id} value={t.id}>{t.nombre} {t.apellido}</option>
        ))}
      </select>
      {error && <p style={estilos.error}>{error}</p>}
      <div style={estilos.acciones}>
        <button style={boton("primario")} onClick={confirmar} disabled={enviando}>
          {enviando ? "Asignando..." : "Confirmar"}
        </button>
        <button style={boton("fantasma")} onClick={cerrar}>Cancelar</button>
      </div>
    </div>
  );
}

// ─── Correctiva asociada ───

function PanelCorrectivaAsociada({ ot, setCorrectivas, cerrar, navegar }) {
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function confirmar() {
    if (!descripcion.trim()) {
      setError("Contá qué se encontró.");
      return;
    }
    setEnviando(true);
    setError("");
    try {
      const nueva = await crearCorrectivaAsociada(ot.id, { descripcion: descripcion.trim(), prioridad });
      setCorrectivas((antes) => [...antes, nueva]);
      toast.success(`Correctiva OT-${String(nueva.numero_ot).padStart(4, "0")} generada`, {
        description: "Queda vinculada a esta preventiva.",
        action: { label: "Verla", onClick: () => navegar(`/ordenes/${nueva.id}`) },
      });
      cerrar();
    } catch (e) {
      setError(e.response?.data?.detail || "No pudimos generar la correctiva.");
      setEnviando(false);
    }
  }

  return (
    <div style={{ ...cs.tarjeta, padding: 18, marginTop: 14 }}>
      <p style={estilos.panelTitulo}>Generar correctiva asociada</p>
      <p style={estilos.bitacoraAyuda}>
        Se abre una OT correctiva nueva, en el mismo equipo y grupo, con el rastro
        de que salió de esta preventiva.
      </p>
      <label style={cs.label}>Qué se encontró</label>
      <textarea
        style={{ ...cs.input, minHeight: 70, marginBottom: 12, resize: "vertical" }}
        placeholder="Ej: la batería no retiene carga, hay que reemplazarla."
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
      />
      <label style={cs.label}>Prioridad (opcional)</label>
      <select style={{ ...cs.input, marginBottom: 12 }} value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
        <option value="">Sin definir</option>
        <option value="BAJA">Baja</option>
        <option value="MEDIA">Media</option>
        <option value="ALTA">Alta</option>
        <option value="URGENTE">Urgente</option>
      </select>
      {error && <p style={estilos.error}>{error}</p>}
      <div style={estilos.acciones}>
        <button style={boton("primario")} onClick={confirmar} disabled={enviando}>
          {enviando ? "Generando..." : "Generar correctiva"}
        </button>
        <button style={boton("fantasma")} onClick={cerrar}>Cancelar</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

// Tiempo que el equipo estuvo sin poder usarse. El anteproyecto lo define como
// la diferencia entre el cierre y la notificación; si no hay notificación,
// usamos la apertura como referencia.
function tiempoFueraDeServicio(ot) {
  const desde = ot.fecha_notificacion || ot.fecha_apertura;
  if (!desde) return "—";
  const hasta = ot.fecha_cierre ? new Date(ot.fecha_cierre) : new Date();
  const horas = Math.round((hasta - new Date(desde)) / 36e5);
  if (isNaN(horas)) return "—";
  const sufijo = ot.fecha_cierre ? "" : " y contando";
  if (horas < 24) return `${horas} h${sufijo}`;
  return `${Math.floor(horas / 24)} d ${horas % 24} h${sufijo}`;
}

function fechaHora(valor) {
  if (!valor) return "—";
  const f = new Date(valor);
  if (isNaN(f)) return "—";
  return f.toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Azul = hay que hacerla. Violeta = alguien la está haciendo. Gris = terminada,
// ya no pide atención. Nada de rojo: si toda OT abierta fuera roja, el rojo
// dejaría de significar "urgente".
function tonoEstadoOT(estado) {
  if (estado === "CERRADA") return "apagado";
  if (estado === "EN_PROGRESO") return "proceso";
  return "pendiente";
}

function textoEstado(estado) {
  const nombres = { ABIERTA: "Abierta", EN_PROGRESO: "En progreso", CERRADA: "Cerrada" };
  return nombres[estado] || estado;
}

function Dato({ etiqueta, valor }) {
  return (
    <div>
      <div style={estilos.etiqueta}>{etiqueta}</div>
      <div style={estilos.texto}>{valor}</div>
    </div>
  );
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "18px 0" },
  pastillas: { display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" },
  equipoNombre: { margin: 0, fontSize: "1rem", color: color.texto, fontWeight: 600 },
  equipoCodigo: { margin: "3px 0 0", fontSize: "0.82rem", color: color.textoSuave, fontFamily: "ui-monospace, monospace" },
  datos: {
    ...cs.tarjeta, padding: 18,
    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 16,
  },
  etiqueta: { fontSize: "0.7rem", color: color.textoDebil, textTransform: "uppercase", letterSpacing: "0.02em", fontWeight: 600, marginBottom: 3 },
  texto: { margin: 0, fontSize: "0.9rem", color: color.texto, lineHeight: 1.5 },
  acciones: { display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" },
  panelTitulo: { margin: "0 0 12px", fontSize: "0.95rem", fontWeight: 700, color: color.texto },
  error: { color: color.peligro, fontSize: "0.84rem", margin: "0 0 10px" },
  bitacoraAyuda: { margin: "-6px 0 14px", fontSize: "0.82rem", color: color.textoSuave, lineHeight: 1.5 },
  listaNotas: { display: "flex", flexDirection: "column", gap: 10 },
  nota: { padding: "10px 12px", borderRadius: 10, background: color.fondo, border: `1px solid ${color.bordeSuave}` },
  notaCabecera: { display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 },
  notaAutor: { fontSize: "0.82rem", fontWeight: 700, color: color.texto },
  notaFecha: { fontSize: "0.76rem", color: color.textoDebil, flexShrink: 0 },
};

export default DetalleOrden;