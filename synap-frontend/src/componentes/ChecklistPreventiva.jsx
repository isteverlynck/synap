// ChecklistPreventiva.jsx — el checklist de mantenimiento dentro de una OT
// preventiva: la lista de ítems a revisar, con "Pasa" / "No pasa" para cada
// uno. Cuando algo "No pasa", se puede generar de una una OT correctiva por
// ESE ítem puntual (queda enganchada a esta misma preventiva, igual que la
// que se genera con el botón general "Algo no funciona" de la OT).
//
// Un ítem ya contestado se puede volver a contestar ("Cambiar"): por si se
// apretó el botón equivocado. El backend guarda esto como un upsert (la
// misma fila se actualiza, no se duplica).
//
// Vive dentro de DetalleOrden.jsx, solo quando la OT es tipo PREVENTIVA.

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Circle } from "lucide-react";
import { mantenimientoDeOT } from "../api/mantenimientos";
import {
  verChecklistDePlantilla, verRespuestasDeMP,
  registrarRespuesta, generarCorrectivaDesdeChecklist,
} from "../api/checklists";
import { completarOrden } from "../api/ordenes";
import { color, cs, boton, insignia } from "../tema";

// Este ítem fijo (lo agrega el backend solo a todo plan, ver
// ITEMS_OBLIGATORIOS_TODO_PLAN en routers/planes_mantenimiento.py) es distinto
// a los demás: no es un chequeo tipo "¿esto funciona?" sino una pregunta
// directa ("¿hace falta un correctivo?"). Mostrarle al técnico los botones
// genéricos "Pasa" / "No pasa" quedaba confuso ("Necesidad de correctivo: Pasa"
// suena al revés de lo que significa) — pedido de Cami: para ESTE ítem puntual
// se muestran "Sí" / "No" en vez de "Pasa" / "No pasa". Por abajo sigue siendo
// el mismo resultado PASA/NO_PASA de siempre (no cambia nada en el backend):
// "Sí, hace falta" guarda NO_PASA (y deja generar la correctiva, igual que
// cualquier otro ítem que no pasa); "No, no hace falta" guarda PASA.
const ITEM_NECESIDAD_CORRECTIVO = "Necesidad de correctivo";

function etiquetaResultado(item, resultado) {
  const esNecesidadCorrectivo = item.descripcion === ITEM_NECESIDAD_CORRECTIVO;
  if (resultado === "PASA") return esNecesidadCorrectivo ? "No" : "Pasa";
  if (resultado === "NO_PASA") return esNecesidadCorrectivo ? "Sí" : "No pasa";
  return "Sin resultado";
}

// onCompletado(otActualizada): se llama cuando la orden ya se completó de
// verdad (el backend la dejó PENDIENTE_CIERRE) — así el padre actualiza su
// copia de la OT. Antes esto abría un panel aparte pidiendo de nuevo "qué se
// hizo"; ahora todo el paso de completar pasa por acá, en el modal de
// validación, para que haya un solo botón que complete la orden.
function ChecklistPreventiva({ ot, perfil, puedeCompletar, onCorrectivaCreada, onCompletado, navegar }) {
  const [cargando, setCargando] = useState(true);
  const [mp, setMp] = useState(null);
  const [items, setItems] = useState([]);
  const [respuestas, setRespuestas] = useState([]);
  const [error, setError] = useState("");

  // El ítem que tiene abierto el formulario de "no pasa" (a lo sumo uno).
  const [itemAbierto, setItemAbierto] = useState(null);
  // El ítem que se está volviendo a contestar (ya tenía una respuesta, pero
  // se apretó "Cambiar"): mientras tanto se le vuelven a mostrar los botones
  // Pasa/No pasa en vez de la insignia de solo lectura.
  const [itemEditando, setItemEditando] = useState(null);
  const [observacion, setObservacion] = useState("");
  const [generarCorrectiva, setGenerarCorrectiva] = useState(true);
  const [prioridad, setPrioridad] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorItem, setErrorItem] = useState("");
  const [mostrarValidacion, setMostrarValidacion] = useState(false);
  const yaSeAbrio = useRef(false);

  // ─── Completar la orden (dentro del modal de validación) ───
  // El campo "qué se hizo" se sacó (pedido de Cami): quedaba redundante con
  // las observaciones que ya se cargan ítem por ítem en el checklist de
  // arriba. Al completar ya no se manda ninguna observación de la OT en sí.
  const [justificacionRetraso, setJustificacionRetraso] = useState("");
  const [completando, setCompletando] = useState(false);
  const [errorCompletar, setErrorCompletar] = useState("");

  // Si hoy ya no estamos en el mes en que se abrió la OT, hubo un desvío y
  // el backend va a pedir el motivo del retraso. Esto es una ESTIMACIÓN para
  // no pedirle el motivo a todo el mundo de entrada: compara contra la hora
  // del navegador de quien está completando. La decisión real la toma el
  // backend con la hora de Argentina (ver hoy_argentina() en fechas.py) —
  // por eso, si de todos modos el backend contesta que hubo desvío (ver
  // `desvioForzado` más abajo), mostramos el campo igual en vez de dejar a
  // la persona trabada.
  const hoy = new Date();
  const apertura = ot.fecha_apertura ? new Date(ot.fecha_apertura) : null;
  const conDesvioEstimado =
    apertura &&
    (apertura.getFullYear() !== hoy.getFullYear() || apertura.getMonth() !== hoy.getMonth());
  const [desvioForzado, setDesvioForzado] = useState(false);
  const conDesvio = conDesvioEstimado || desvioForzado;

  async function confirmarCompletar() {
    if (conDesvio && !justificacionRetraso.trim()) {
      setErrorCompletar("Este mantenimiento se completa fuera del mes en que se abrió: contá el motivo del retraso.");
      return;
    }
    setCompletando(true);
    setErrorCompletar("");
    try {
      const nuevaOrden = await completarOrden(ot.id, "", justificacionRetraso.trim());
      toast.success(`OT-${String(ot.numero_ot).padStart(4, "0")} completada`, {
        description: "Queda pendiente de que coordinación autorice el cierre.",
      });
      setMostrarValidacion(false);
      onCompletado?.(nuevaOrden);
    } catch (e) {
      const detalle = e.response?.data?.detail || "No pudimos completar la orden.";
      // El navegador y el servidor pueden "pensar" que es un mes distinto
      // cerca de la medianoche (uno mira la hora local, el otro Argentina) —
      // si pasó esto, el backend corta pidiendo el motivo aunque acá
      // creíamos que no hacía falta. En vez de dejar a la persona sin poder
      // completar nunca la orden, mostramos el campo y que lo complete.
      if (!conDesvio && detalle.includes("fuera del mes")) {
        setDesvioForzado(true);
      }
      setErrorCompletar(detalle);
    } finally {
      setCompletando(false);
    }
  }

  useEffect(() => {
    mantenimientoDeOT(ot.id)
      .then((lista) => setMp(lista[0] || null))
      .catch(() => setError("No pudimos cargar el checklist de esta orden."))
      .finally(() => setCargando(false));
  }, [ot.id]);

  useEffect(() => {
    if (!mp) return;
    Promise.all([verChecklistDePlantilla(mp.plantilla_mp_id), verRespuestasDeMP(mp.id)])
      .then(([its, resp]) => { setItems(its); setRespuestas(resp); })
      .catch(() => setError("No pudimos cargar el checklist de esta orden."));
  }, [mp]);

  const obligatorios = items.filter((it) => it.obligatorio);
  const checklistCompleto =
    obligatorios.length > 0 && obligatorios.every((it) => estaRespondido(it.id));

  useEffect(() => {
    if (checklistCompleto && puedeCompletar && !yaSeAbrio.current) {
      yaSeAbrio.current = true;
      setMostrarValidacion(true);
    }
  }, [checklistCompleto, puedeCompletar]);

  function respuestaDe(itemId) {
    return respuestas.find((r) => r.checklist_item_id === itemId);
  }

  function estaRespondido(itemId) {
    const r = respuestaDe(itemId);
    return !!r && !!r.resultado;
  }

  // respuestaPrevia: si se está EDITANDO una respuesta que ya existía, se
  // pasa acá para precargar lo que había escrito antes. Al editar, "Generar
  // correctiva" arranca destildado (si ya se había decidido no generarla, o
  // si ya se generó una la primera vez, no queremos abrir otra sin que lo
  // pidan de nuevo).
  function abrirNoPasa(item, respuestaPrevia) {
    setItemAbierto(item.id);
    setObservacion(respuestaPrevia?.observacion || "");
    setGenerarCorrectiva(!respuestaPrevia);
    setPrioridad("");
    setErrorItem("");
  }

  function cambiarRespuesta(item) {
    setItemAbierto(null);
    setErrorItem("");
    setItemEditando(item.id);
  }

  function cancelarEdicion() {
    setItemAbierto(null);
    setItemEditando(null);
    setErrorItem("");
  }

  // Reemplaza (si ya había una respuesta para este ítem) o agrega, en el
  // estado local, sin dejar duplicados — el backend hace lo mismo del lado
  // de la base.
  function upsertLocal(nueva) {
    setRespuestas((antes) => [
      ...antes.filter((r) => r.checklist_item_id !== nueva.checklist_item_id),
      nueva,
    ]);
  }

  async function marcarPasa(item) {
    // Sin este bloqueo, dos clicks rápidos mandan dos POST antes de que el
    // primero grabe: los dos consultan, los dos ven el ítem sin respuesta y
    // los dos insertan. Así aparecieron filas duplicadas.
    if (enviando) return;
    setEnviando(true);
    try {
      const nueva = await registrarRespuesta({
        mpId: mp.id, checklistItemId: item.id, resultado: "PASA", completadoPor: perfil?.id,
      });
      upsertLocal(nueva);
      setItemEditando(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || "No pudimos guardar la respuesta.");
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarNoPasa(item) {
    if (!observacion.trim()) {
      setErrorItem("Contá qué encontraste en este ítem.");
      return;
    }
    setEnviando(true);
    setErrorItem("");
    try {
      if (generarCorrectiva) {
        const correctiva = await generarCorrectivaDesdeChecklist({
          mpId: mp.id, checklistItemId: item.id, descripcion: observacion.trim(),
          prioridad, tecnicoId: perfil?.id,
        });
        // El backend no devuelve la respuesta (devuelve la OT correctiva);
        // la agregamos acá mismo para que el ítem quede marcado sin recargar.
        upsertLocal({
          id: `local-${item.id}`, mp_id: mp.id, checklist_item_id: item.id,
          completado: true, resultado: "NO_PASA", observacion: observacion.trim(),
        });
        onCorrectivaCreada?.(correctiva);
        toast.success(`Correctiva OT-${String(correctiva.numero_ot).padStart(4, "0")} generada`, {
          description: item.descripcion,
          action: navegar ? { label: "Verla", onClick: () => navegar(`/ordenes/${correctiva.id}`) } : undefined,
        });
      } else {
        const nueva = await registrarRespuesta({
          mpId: mp.id, checklistItemId: item.id, resultado: "NO_PASA",
          observacion: observacion.trim(), completadoPor: perfil?.id,
        });
        upsertLocal(nueva);
      }
      setItemAbierto(null);
      setItemEditando(null);
    } catch (e) {
      setErrorItem(e.response?.data?.detail || "No pudimos guardar el ítem.");
    } finally {
      setEnviando(false);
    }
  }

  if (ot.tipo !== "PREVENTIVA") return null;
  if (cargando) return null;
  if (error) return <p style={{ ...estilos.mensaje, color: color.peligro, marginTop: 14 }}>{error}</p>;
  if (!mp) {
    return (
      <div style={{ ...cs.tarjeta, padding: 18, marginTop: 14 }}>
        <p style={estilos.panelTitulo}>Checklist de mantenimiento</p>
        <p style={estilos.mensaje}>Esta orden no tiene un checklist de mantenimiento vinculado.</p>
      </div>
    );
  }

  const completados = items.filter((it) => estaRespondido(it.id)).length;

  return (
    <div style={{ ...cs.tarjeta, padding: 18, marginTop: 14 }}>
      <div style={estilos.cabecera}>
        <p style={estilos.panelTitulo}>Checklist de mantenimiento</p>
        <span style={estilos.progreso}>{completados} de {items.length} completados</span>
      </div>

      <div style={estilos.listaItems}>
        {items.map((item) => {
          const r = respuestaDe(item.id);
          const editando = itemEditando === item.id;
          // Se muestran los botones Pasa/No pasa cuando el ítem todavía no
          // tiene respuesta, O cuando se apretó "Cambiar" para esta.
          const mostrarBotones = puedeCompletar && itemAbierto !== item.id && (!estaRespondido(item.id) || editando);
          return (
            <div key={item.id} style={estilos.item}>
              <div style={estilos.filaItem}>
                <IconoEstado resultado={editando ? null : r?.resultado} />
                <span style={estilos.itemTexto}>
                  {item.descripcion}
                  {!item.obligatorio && <span style={estilos.opcional}> (opcional)</span>}
                </span>

                {mostrarBotones && (
                  <div style={estilos.botonesItem}>
                    {item.descripcion === ITEM_NECESIDAD_CORRECTIVO ? (
                      <>
                        <button style={{ ...boton("peligro"), padding: "6px 12px" }} onClick={() => abrirNoPasa(item, r)} disabled={enviando}>
                          Sí
                        </button>
                        <button style={{ ...boton("secundario"), padding: "6px 12px" }} onClick={() => marcarPasa(item)} disabled={enviando}>
                          No
                        </button>
                      </>
                    ) : (
                      <>
                        <button style={{ ...boton("secundario"), padding: "6px 12px" }} onClick={() => marcarPasa(item)} disabled={enviando}>
                          Pasa
                        </button>
                        <button style={{ ...boton("peligro"), padding: "6px 12px" }} onClick={() => abrirNoPasa(item, r)} disabled={enviando}>
                          No pasa
                        </button>
                      </>
                    )}
                    {editando && (
                      <button style={{ ...boton("fantasma"), padding: "6px 12px" }} onClick={cancelarEdicion}>
                        Cancelar
                      </button>
                    )}
                  </div>
                )}

                {r && !editando && itemAbierto !== item.id && (
                  <>
                    <span style={insignia(r.resultado === "PASA" ? "exito" : r.resultado === "NO_PASA" ? "peligro" : "neutro")}>
                      {etiquetaResultado(item, r.resultado)}
                    </span>
                    {puedeCompletar && (
                      <button style={estilos.linkCambiar} onClick={() => cambiarRespuesta(item)}>
                        Cambiar
                      </button>
                    )}
                  </>
                )}
              </div>

              {r?.observacion && !editando && itemAbierto !== item.id && (
                <p style={estilos.observacion}>{r.observacion}</p>
              )}

              {itemAbierto === item.id && (
                <div style={estilos.formNoPasa}>
                  <label style={cs.label}>Qué encontraste</label>
                  <textarea
                    style={{ ...cs.input, minHeight: 60, marginBottom: 10, resize: "vertical" }}
                    placeholder="Ej: la batería no retiene carga."
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                  />
                  <label style={estilos.checkboxFila}>
                    <input
                      type="checkbox"
                      checked={generarCorrectiva}
                      onChange={(e) => setGenerarCorrectiva(e.target.checked)}
                    />
                    <span>Generar una orden correctiva por esto</span>
                  </label>
                  {generarCorrectiva && (
                    <div style={{ marginTop: 10, maxWidth: 220 }}>
                      <label style={cs.label}>Prioridad (opcional)</label>
                      <select style={cs.input} value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
                        <option value="">Sin definir</option>
                        <option value="BAJA">Baja</option>
                        <option value="MEDIA">Media</option>
                        <option value="ALTA">Alta</option>
                        <option value="URGENTE">Urgente</option>
                      </select>
                    </div>
                  )}
                  {errorItem && <p style={estilos.error}>{errorItem}</p>}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button style={boton("primario")} onClick={() => confirmarNoPasa(item)} disabled={enviando}>
                      {enviando ? "Guardando..." : "Guardar"}
                    </button>
                    <button style={boton("fantasma")} onClick={cancelarEdicion} disabled={enviando}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {checklistCompleto && puedeCompletar && (
        <button
          style={{ ...boton("primario"), marginTop: 14, width: "100%" }}
          onClick={() => setMostrarValidacion(true)}
        >
          Revisar y completar la orden
        </button>
      )}

      {mostrarValidacion && (
        <div
          style={estilos.fondoModal}
          onClick={() => { if (!completando) setMostrarValidacion(false); }}
        >
          <div style={estilos.modal} onClick={(e) => e.stopPropagation()}>
            <p style={estilos.panelTitulo}>Validación de datos</p>
            <p style={estilos.modalAyuda}>
              Revisá lo que cargaste. Si algo quedó mal, cancelá y corregilo con el
              botón "Cambiar". Al completar, la orden queda pendiente de cierre hasta
              que coordinación la revise y la autorice (o te la devuelva si encuentra
              algo mal).
            </p>

            <div style={estilos.listaItems}>
              {items.map((item) => {
                const r = respuestaDe(item.id);
                return (
                  <div key={item.id} style={estilos.filaResumen}>
                    <IconoEstado resultado={r?.resultado} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={estilos.itemTexto}>{item.descripcion}</div>
                      {r?.observacion && (
                        <div style={estilos.detalleResumen}>{r.observacion}</div>
                      )}
                      {!r && <div style={estilos.detalleResumen}>Sin responder</div>}
                    </div>
                    {r && (
                      <span style={insignia(r.resultado === "PASA" ? "exito" : "peligro")}>
                        {etiquetaResultado(item, r.resultado)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {ot.parada_iniciada_en && (
              <p style={estilos.modalAyuda}>
                El equipo figura parado ahora mismo. Al completar, la parada se
                finaliza sola con la fecha de ahora.
              </p>
            )}

            {conDesvio && (
              <>
                <p style={estilos.modalAyuda}>
                  {apertura
                    ? `Este mantenimiento se abrió en ${apertura.toLocaleDateString("es-AR", { month: "2-digit", year: "numeric" })} y se está completando fuera de ese mes: hubo un desvío.`
                    // desvioForzado sin "apertura" (no debería pasar, pero por las
                    // dudas): el backend avisó el desvío igual, mostramos el motivo
                    // sin la fecha de apertura en el texto.
                    : "Este mantenimiento se está completando fuera del mes en que se programó: hubo un desvío."}
                </p>
                <label style={cs.label}>Motivo del retraso</label>
                <textarea
                  style={{ ...cs.input, minHeight: 60, marginBottom: 12, resize: "vertical" }}
                  placeholder="Ej: se esperó un repuesto que tardó en llegar."
                  value={justificacionRetraso}
                  onChange={(e) => setJustificacionRetraso(e.target.value)}
                />
              </>
            )}

            {errorCompletar && <p style={estilos.error}>{errorCompletar}</p>}

            <div style={estilos.accionesModal}>
              <button style={boton("fantasma")} onClick={() => setMostrarValidacion(false)} disabled={completando}>
                Cancelar
              </button>
              <button style={boton("primario")} onClick={confirmarCompletar} disabled={completando}>
                {completando ? "Completando..." : "Completar orden de trabajo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconoEstado({ resultado }) {
  if (resultado === "PASA") return <CheckCircle2 size={18} strokeWidth={2} color={color.exito} aria-hidden="true" />;
  if (resultado === "NO_PASA") return <XCircle size={18} strokeWidth={2} color={color.peligro} aria-hidden="true" />;
  return <Circle size={18} strokeWidth={1.6} color={color.textoDebil} aria-hidden="true" />;
}


const estilos = {
  mensaje: { color: color.textoSuave, padding: "6px 0" },
  cabecera: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, flexWrap: "wrap", gap: 8 },
  panelTitulo: { margin: 0, fontSize: "0.95rem", fontWeight: 700, color: color.texto },
  progreso: { fontSize: "0.8rem", color: color.textoSuave },
  listaItems: { display: "flex", flexDirection: "column", gap: 10 },
  item: { padding: "10px 12px", borderRadius: 10, background: color.fondo, border: `1px solid ${color.bordeSuave}` },
  filaItem: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  itemTexto: { fontSize: "0.9rem", color: color.texto, flex: 1, minWidth: 160 },
  opcional: { color: color.textoDebil, fontSize: "0.8rem" },
  botonesItem: { display: "flex", gap: 8 },
  linkCambiar: {
    background: "transparent", border: "none", cursor: "pointer",
    color: color.primario, fontSize: "0.78rem", fontWeight: 600,
    fontFamily: "inherit", padding: 0,
  },
  observacion: { margin: "8px 0 0 28px", fontSize: "0.84rem", color: color.textoSuave, lineHeight: 1.5 },
  formNoPasa: { marginTop: 12, paddingTop: 12, borderTop: `1px solid ${color.bordeSuave}` },
  checkboxFila: { display: "flex", alignItems: "center", gap: 8, fontSize: "0.86rem", color: color.texto, cursor: "pointer" },
  error: { color: color.peligro, fontSize: "0.82rem", margin: "10px 0 0" },
  fondoModal: {
    position: "fixed", inset: 0, background: "rgba(15, 23, 32, 0.45)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 16, zIndex: 50,
  },
  modal: {
    ...cs.tarjeta, padding: 20, width: "100%", maxWidth: 560,
    maxHeight: "80vh", overflowY: "auto",
  },
  modalAyuda: { margin: "4px 0 14px", fontSize: "0.85rem", color: color.textoSuave },
  filaResumen: { display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0" },
  detalleResumen: { fontSize: "0.8rem", color: color.textoSuave, marginTop: 2 },
  accionesModal: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 },
};

export default ChecklistPreventiva;