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
import { color, cs, boton, insignia } from "../tema";

function ChecklistPreventiva({ ot, perfil, puedeCompletar, onCorrectivaCreada, onCerrarOT, navegar }) {
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
                    <button style={{ ...boton("secundario"), padding: "6px 12px" }} onClick={() => marcarPasa(item)} disabled={enviando}>
                      Pasa
                    </button>
                    <button style={{ ...boton("peligro"), padding: "6px 12px" }} onClick={() => abrirNoPasa(item, r)} disabled={enviando}>
                      No pasa
                    </button>
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
                      {r.resultado === "PASA" ? "Pasa" : r.resultado === "NO_PASA" ? "No pasa" : "Sin resultado"}
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
          Revisar y cerrar la orden
        </button>
      )}

      {mostrarValidacion && (
        <div style={estilos.fondoModal} onClick={() => setMostrarValidacion(false)}>
          <div style={estilos.modal} onClick={(e) => e.stopPropagation()}>
            <p style={estilos.panelTitulo}>Validación de datos</p>
            <p style={estilos.modalAyuda}>
              Revisá lo que cargaste antes de cerrar la orden. Si algo quedó mal,
              cancelá y corregilo con el botón "Cambiar".
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
                        {r.resultado === "PASA" ? "Pasa" : "No pasa"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={estilos.accionesModal}>
              <button style={boton("fantasma")} onClick={() => setMostrarValidacion(false)}>
                Cancelar
              </button>
              <button
                style={boton("primario")}
                onClick={() => { setMostrarValidacion(false); onCerrarOT?.(); }}
              >
                Cerrar OT
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