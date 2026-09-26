// DetalleOrden.jsx — una OT abierta en detalle. Es la pantalla donde el trabajo
// efectivamente avanza: el técnico la arranca y la cierra, coordinación la
// asigna o reasigna.
//
// Igual que en la ficha del equipo, la parte de arriba es idéntica para todos
// y lo único que cambia son las acciones de abajo.

import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  verOrden, cambiarEstado, cerrarOrden, asignarTecnico, listarNotas, agregarNota,
  listarCorrectivasAsociadas, crearCorrectivaAsociada, iniciarParada, finalizarParada,
  listarAdjuntos, abrirAdjunto,
} from "../api/ordenes";
import { tecnicosDisponibles } from "../api/coordinacion";
import { listarInsumos, registrarConsumo, listarConsumos } from "../api/stock";
import { obtenerPerfil } from "../api/auth";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton, insignia } from "../tema";
import Volver from "../componentes/Volver";
import ChecklistPreventiva from "../componentes/ChecklistPreventiva";
import { toast } from "sonner";
import { diasHasta, formatearFechaOT } from "../utiles/fechas";

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
  const [insumos, setInsumos] = useState([]);
  const [consumosOT, setConsumosOT] = useState([]);
  const [adjuntos, setAdjuntos] = useState([]);

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
    // Insumos consumidos en esta OT (y el catálogo, para poder elegir uno
    // nuevo y para mostrar el nombre en vez del id en el historial).
    listarInsumos().then(setInsumos).catch(() => {});
    listarConsumos({ otId: id }).then(setConsumosOT).catch(() => {});
    listarAdjuntos(id).then(setAdjuntos).catch(() => {});
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
  // Preventiva: mientras nadie la empezó, la puede trabajar cualquiera del
  // grupo. Cuando alguien aprieta "Empezar a trabajar" (iniciada_por), solo
  // esa persona; el resto del grupo la puede ver pero no tocar. Si está en
  // progreso sin registro de quién la empezó (OT viejas o migradas), la
  // sigue pudiendo trabajar cualquiera del grupo, para que no quede trabada.
  // Correctiva: solo su técnico asignado.
  const puedeTrabajar = ot?.tipo === "PREVENTIVA"
    ? esDeMiGrupo && (!ot?.iniciada_por || ot.iniciada_por === perfil?.id)
    : esMiOrden;
  const avisoPreventivo = textoPreventivo(ot?.activo_proxima_fecha_mp);

  useEffect(() => {
    if (!puedeAsignar) return;
    tecnicosDisponibles().then(setTecnicos).catch(() => setTecnicos([]));
  }, [puedeAsignar]);

  // Mientras hay una parada corriendo, refrescamos cada un rato para que el
  // "Tiempo parado" que se muestra abajo vaya sumando, no se quede clavado.
  const [, forzarRefresco] = useState(0);
  useEffect(() => {
    if (!ot?.parada_iniciada_en) return;
    const intervalo = setInterval(() => forzarRefresco((n) => n + 1), 60000);
    return () => clearInterval(intervalo);
  }, [ot?.parada_iniciada_en]);

  // "tecnicos" ya se pide más arriba (para el desplegable de asignar/
  // reasignar) cuando puedeAsignar es true — que cubre a coordinación y a
  // cualquier técnico del grupo de esta OT, o sea a todo el que llega hasta
  // acá (jefatura no ve el detalle de una OT). La reusamos para mostrar el
  // nombre en vez de pedirle más al backend.
  function nombreTecnico(id) {
    if (!id) return null;
    const t = tecnicos.find((x) => x.id === id);
    if (t) return `${t.nombre} ${t.apellido}`;
    // Si no está en la lista (otro grupo, usuario dado de baja), usamos el
    // nombre que ya manda el backend antes de rendirnos.
    return ot?.tecnico_nombre || "Técnico no identificado";
  }

  function nombreInsumo(insumoId) {
    const i = insumos.find((x) => x.id === insumoId);
    return i ? i.nombre : "Insumo";
  }
  async function arrancar() {
    try {
      setOt(await cambiarEstado(id, "EN_PROGRESO"));
      toast.success("Orden en progreso");
    } catch (e) {
      setError(e.response?.data?.detail || "No pudimos cambiar el estado.");
    }
  }

  async function iniciarParadaClick() {
    try {
      setOt(await iniciarParada(id));
      toast.success("Parada del equipo iniciada");
    } catch (e) {
      setError(e.response?.data?.detail || "No pudimos iniciar la parada.");
    }
  }

  async function finalizarParadaClick() {
    try {
      setOt(await finalizarParada(id));
      toast.success("Parada del equipo finalizada");
    } catch (e) {
      setError(e.response?.data?.detail || "No pudimos finalizar la parada.");
    }
  }

  if (cargando) return <p style={estilos.mensaje}>Cargando orden...</p>;
  if (error && !ot) return <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>;

  const cerrada = ot.estado === "CERRADA";

  return (
    <>
      <Volver />
      <Encabezado
        titulo={`OT-${String(ot.numero_ot).padStart(4, "0")}`}
        subtitulo={ot.tipo}
      >
      </Encabezado>

      {/* Estado arriba de todo, igual que en la ficha del equipo. */}
      <div style={estilos.pastillas}>
        <span style={insignia(tonoEstadoOT(ot.estado))}>{textoEstado(ot.estado)}</span>
        {ot.prioridad && (
          <span className={`sy-prioridad sy-prioridad-${ot.prioridad.toLowerCase()}`}>
            Prioridad {ot.prioridad.toLowerCase()}
          </span>
        )}
        {ot.parada_iniciada_en && (
          <span style={insignia("peligro")}>Equipo parado momentáneamente</span>
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
        {avisoPreventivo && !cerrada && <p style={estilos.equipoCodigo}>{avisoPreventivo}</p>}
      </div>

      {ot.descripcion && (
        <div style={{ ...cs.tarjeta, padding: "14px 18px", marginBottom: 12 }}>
          <p style={estilos.etiqueta}>El problema</p>
          <p style={estilos.texto}>{ot.descripcion}</p>
        </div>
      )}

        <div style={estilos.datos}>
          <Dato
            etiqueta="Asignado a"
            valor={ 
              ot.tecnico_id
                ? nombreTecnico(ot.tecnico_id)
                : ot.tipo === "PREVENTIVA"
                  ? `Asignada al grupo ${ot.grupo_id || "sin definir"}`
                  : "Sin asignar"
          }
        />
        {/* Quién reportó la falla (la persona que hizo la solicitud), con su
        mail para que el técnico le pueda consultar algo. Solo en correctivas. */}
        {ot.tipo === "CORRECTIVA" && (
          <Dato
            etiqueta="Falla reportada por"
            valor={
              ot.reportado_por_nombre ? (
                <>
                  {ot.reportado_por_nombre}
                  {ot.reportado_por_email && (
                    <a
                      href={`mailto:${ot.reportado_por_email}`}
                      style={{ display: "block", fontSize: "0.82rem", color: color.primario, wordBreak: "break-all" }}
                    >
                      {ot.reportado_por_email}
                    </a>
                  )}
                </>
              ) : ot.ot_origen_id ? (
                "Detectada en un preventivo"
              ) : (
                "—"
              )
            }
          />
        )}
        {/* Quién apretó "Empezar a trabajar". Las OT viejas o migradas del
        hospital no tienen este dato: ahí se muestra "Sin registro". */}
        <Dato
          etiqueta="Iniciada por"
          valor={
            ot.tipo !== "PREVENTIVA"
              ? "—"
              : ot.iniciada_por_nombre
                ? ot.iniciada_por_nombre
                : ot.estado === "ABIERTA"
                  ? "Todavía no se empezó"
                  : "Sin registro"
          }
        />
        <Dato etiqueta="Notificada" valor={fechaHora(ot.fecha_notificacion)} />
        <Dato etiqueta="Abierta" valor={fechaHora(ot.fecha_apertura)} />
        <Dato etiqueta="Cerrada" valor={fechaHora(ot.fecha_cierre)} />
        {/* Tiempo real que el equipo estuvo parado — medido con los botones
        "Iniciar parada" / "Finalizar parada" de abajo, no calculado a partir
        de otras fechas (antes se restaba notificación/apertura contra cierre,
        y en OT que tardan en arrancar eso daba números sin sentido). */}
        <Dato etiqueta="Tiempo parado" valor={tiempoDeParada(ot)} />
      </div>

      {/* Adjuntos de la solicitud: solo el nombre; al tocarlo se abre. */}
      {adjuntos.length > 0 && (
        <div style={{ ...cs.tarjeta, padding: "14px 18px", marginTop: 12 }}>
          <p style={estilos.etiqueta}>Archivos adjuntos</p>
          {adjuntos.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() =>
                abrirAdjunto(ot.id, a).catch(() => toast.error("No se pudo abrir el archivo."))
              }
              style={{
                display: "block", background: "none", border: "none", padding: "4px 0",
                cursor: "pointer", color: color.primario, fontSize: "0.9rem",
                textAlign: "left", fontFamily: "inherit", wordBreak: "break-all",
              }}
            >
              📎 {a.nombre_archivo}
            </button>
          ))}
        </div>
      )}

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
          {puedeTrabajar && ot.estado === "ABIERTA" && (
            <button style={boton("primario")} onClick={arrancar}>Empezar a trabajar</button>
          )}
          {puedeTrabajar && ot.estado === "EN_PROGRESO" && (
            <button style={boton("primario")} onClick={() => setAccion("cerrar")}>Cerrar la orden</button>
          )}
          {/* Las preventivas son del grupo entero: no se asignan a una
          persona. Solo las correctivas tienen dueño. */}
          {esCoordinacion && ot.tipo !== "PREVENTIVA" && (
            <button style={boton("secundario")} onClick={() => setAccion("asignar")}>
              {ot.tecnico_id ? "Reasignar técnico" : "Asignar técnico"}
            </button>
          )}
          {/* Solo tiene sentido desde una preventiva: es el "che, esto no
          funciona" que aparece haciendo el mantenimiento programado. */}
          {ot.tipo === "PREVENTIVA" && puedeTrabajar && (
            <button style={boton("secundario")} onClick={() => setAccion("correctiva")}>
              Algo no funciona: generar correctiva
            </button>
          )}
          {/* Consumo de repuestos: aplica a cualquier OT (preventiva o
          correctiva), no solo a las preventivas. */}
          {puedeTrabajar && (
            <button style={boton("secundario")} onClick={() => setAccion("consumo")}>
              Registrar consumo de insumo
            </button>
          )}
          {/* Tiempo real de parada: se aprieta al momento en que el equipo
          deja (o vuelve) a poder usarse — no tiene por qué coincidir con
          abrir/cerrar la OT. */}
          {puedeTrabajar && (
            ot.parada_iniciada_en ? (
              <button style={boton("peligro")} onClick={finalizarParadaClick}>
                Finalizar parada del equipo
              </button>
            ) : (
              <button style={boton("secundario")} onClick={iniciarParadaClick}>
                Iniciar parada del equipo
              </button>
            )
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
      {accion === "consumo" && (
        <PanelConsumoInsumo
          ot={ot}
          perfil={perfil}
          insumos={insumos}
          setConsumosOT={setConsumosOT}
          cerrar={() => setAccion(null)}
        />
      )}

      {/* ─── Checklist del mantenimiento: se completa ítem por ítem, y desde
      cada ítem que "no pasa" se puede generar de una su propia correctiva ─── */}
      {ot.tipo === "PREVENTIVA" && (
        <ChecklistPreventiva
          ot={ot}
          perfil={perfil}
          puedeCompletar={!cerrada && puedeTrabajar}
          onCerrarOT={() => setAccion("cerrar")}
          onCorrectivaCreada={(nueva) => setCorrectivas((antes) => [...antes, nueva])}
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

      {/* ─── Insumos consumidos en esta OT ─── */}
      {consumosOT.length > 0 && (
        <div style={{ ...cs.tarjeta, padding: 18, marginTop: 14 }}>
          <p style={estilos.panelTitulo}>Insumos consumidos en esta OT</p>
          <div style={estilos.listaNotas}>
            {consumosOT.map((c) => (
              <div key={c.id} style={estilos.nota}>
                <div style={estilos.notaCabecera}>
                  <span style={estilos.notaAutor}>{nombreInsumo(c.insumo_id)}</span>
                  <span style={estilos.notaFecha}>{fechaHora(c.fecha)}</span>
                </div>
                <p style={estilos.texto}>Cantidad: {c.cantidad}</p>
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
  const [justificacionRetraso, setJustificacionRetraso] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  // Si es una preventiva y hoy ya no estamos en el mes en que se abrió, se
  // está cerrando con desvío: el backend va a pedir el motivo del retraso,
  // así que se lo mostramos de una en vez de que se entere por un error.
  // (fecha_apertura siempre cae dentro del mes programado del MP, así que
  // compararla con hoy alcanza — no hace falta traer el MP acá.)
  const hoy = new Date();
  const apertura = ot.fecha_apertura ? new Date(ot.fecha_apertura) : null;
  const esPreventivaConDesvio =
    ot.tipo === "PREVENTIVA" &&
    apertura &&
    (apertura.getFullYear() !== hoy.getFullYear() || apertura.getMonth() !== hoy.getMonth());

  async function confirmar() {
    // No es obligatorio para el backend, pero lo pedimos igual: sin esto el
    // historial de fallas queda vacío y el análisis de patrones no se puede
    // hacer. Es el dato que después alimenta las decisiones sobre el parque.
    if (!observaciones.trim()) {
      setError("Contá qué se hizo: es lo que queda en el historial del equipo.");
      return;
    }
    if (esPreventivaConDesvio && !justificacionRetraso.trim()) {
      setError("Este mantenimiento se cierra fuera del mes en que se abrió: contá el motivo del retraso.");
      return;
    }
    setEnviando(true);
    try {
      setOt(await cerrarOrden(ot.id, observaciones.trim(), justificacionRetraso.trim()));
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
      {ot.parada_iniciada_en && (
        <p style={estilos.bitacoraAyuda}>
          El equipo figura parado ahora mismo. Al cerrar, la parada se
          finaliza sola con la fecha de cierre.
        </p>
      )}
      <label style={cs.label}>Qué se hizo</label>
      <textarea
        style={{ ...cs.input, minHeight: 80, marginBottom: 12, resize: "vertical" }}
        placeholder="Ej: se reemplazó el sensor de flujo y se calibró el equipo."
        value={observaciones}
        onChange={(e) => setObservaciones(e.target.value)}
      />
      {esPreventivaConDesvio && (
        <>
          <p style={estilos.bitacoraAyuda}>
            Este mantenimiento se abrió en {apertura.toLocaleDateString("es-AR", { month: "2-digit", year: "numeric" })} y se está cerrando fuera de ese mes: hubo un desvío.
          </p>
          <label style={cs.label}>Motivo del retraso</label>
          <textarea
            style={{ ...cs.input, minHeight: 70, marginBottom: 12, resize: "vertical" }}
            placeholder="Ej: se esperó un repuesto que tardó en llegar."
            value={justificacionRetraso}
            onChange={(e) => setJustificacionRetraso(e.target.value)}
          />
        </>
      )}
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
// ─── Consumo de insumo ───

function PanelConsumoInsumo({ ot, perfil, insumos, setConsumosOT, cerrar }) {
  const [insumoId, setInsumoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function confirmar() {
    if (!insumoId) { setError("Elegí el insumo."); return; }
    const cant = Number(cantidad);
    if (!cant || cant <= 0) { setError("Indicá una cantidad mayor a 0."); return; }
    setEnviando(true);
    setError("");
    try {
      const resultado = await registrarConsumo({
        otId: ot.id, insumoId, cantidad: cant, tecnicoId: perfil?.id,
      });
      setConsumosOT((antes) => [...antes, resultado.consumo]);
      if (resultado.aviso) {
        toast.warning(resultado.aviso);
      } else {
        toast.success("Consumo registrado.");
      }
      cerrar();
    } catch (e) {
      setError(e.response?.data?.detail || "No pudimos registrar el consumo.");
      setEnviando(false);
    }
  }

  return (
    <div style={{ ...cs.tarjeta, padding: 18, marginTop: 14 }}>
      <p style={estilos.panelTitulo}>Registrar consumo de insumo</p>
      <label style={cs.label}>Insumo</label>
      <select
        style={{ ...cs.input, marginBottom: 12 }}
        value={insumoId}
        onChange={(e) => setInsumoId(e.target.value)}
      >
        <option value="">Elegir...</option>
        {insumos.map((i) => (
          <option key={i.id} value={i.id}>{i.nombre}{i.unidad ? ` (${i.unidad})` : ""}</option>
        ))}
      </select>
      <label style={cs.label}>Cantidad</label>
      <input
        style={{ ...cs.input, marginBottom: 12 }}
        type="number"
        min="1"
        value={cantidad}
        onChange={(e) => setCantidad(e.target.value)}
      />
      {error && <p style={estilos.error}>{error}</p>}
      <div style={estilos.acciones}>
        <button style={boton("primario")} onClick={confirmar} disabled={enviando}>
          {enviando ? "Registrando..." : "Registrar"}
        </button>
        <button style={boton("fantasma")} onClick={cerrar}>Cancelar</button>
      </div>
    </div>
  );
}
// Tiempo real que el equipo estuvo parado — medido con "Iniciar parada" /
// "Finalizar parada", no calculado a partir de otras fechas. Suma todas las
// paradas ya cerradas (ot.tiempo_parada_segundos) más, si hay una corriendo
// ahora mismo (ot.parada_iniciada_en), lo que lleva transcurrido.
function tiempoDeParada(ot) {
  let segundos = ot.tiempo_parada_segundos || 0;
  if (ot.parada_iniciada_en) {
    const desde = new Date(ot.parada_iniciada_en);
    if (!isNaN(desde)) segundos += Math.max(0, Math.floor((Date.now() - desde) / 1000));
  }
  if (segundos <= 0) return ot.parada_iniciada_en ? "recién empieza" : "—";

  const sufijo = ot.parada_iniciada_en ? " y contando" : "";
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `${minutos} min${sufijo}`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h${sufijo}`;
  return `${Math.floor(horas / 24)} d ${horas % 24} h${sufijo}`;
}

function fechaHora(valor) {
  return formatearFechaOT(valor, true);
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
    // Cada dato ocupa lo que necesita, con una separación fija entre uno y
    // otro (antes era una grilla que repartía el ancho en partes iguales:
    // en pantallas anchas quedaban muy separados y el mail se cortaba).
    display: "flex", flexWrap: "wrap", columnGap: 40, rowGap: 16,
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

function textoPreventivo(fecha) {
  const dias = diasHasta(fecha);
  if (dias === null) return "";
  if (dias < 0) return `Preventivo vencido hace ${Math.abs(dias)} días`;
  if (dias === 0) return "Preventivo programado para hoy";
  return `Próximo preventivo en ${dias} días`;
}