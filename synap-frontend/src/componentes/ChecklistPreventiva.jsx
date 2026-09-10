// ChecklistPreventiva.jsx — el checklist de mantenimiento dentro de una OT
// preventiva: la lista de ítems a revisar, con "Pasa" / "No pasa" para cada
// uno. Cuando algo "No pasa", se puede generar de una una OT correctiva por
// ESE ítem puntual (queda enganchada a esta misma preventiva, igual que la
// que se genera con el botón general "Algo no funciona" de la OT).
//
// Vive dentro de DetalleOrden.jsx, solo quando la OT es tipo PREVENTIVA.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Circle } from "lucide-react";
import { mantenimientoDeOT } from "../api/mantenimientos";
import {
  verChecklistDePlantilla, verRespuestasDeMP,
  registrarRespuesta, generarCorrectivaDesdeChecklist,
} from "../api/checklists";
import { color, cs, boton, insignia } from "../tema";

function ChecklistPreventiva({ ot, perfil, puedeCompletar, onCorrectivaCreada, navegar }) {
  const [cargando, setCargando] = useState(true);
  const [mp, setMp] = useState(null);
  const [items, setItems] = useState([]);
  const [respuestas, setRespuestas] = useState([]);
  const [error, setError] = useState("");

  // El ítem que tiene abierto el formulario de "no pasa" (a lo sumo uno).
  const [itemAbierto, setItemAbierto] = useState(null);
  const [observacion, setObservacion] = useState("");
  const [generarCorrectiva, setGenerarCorrectiva] = useState(true);
  const [prioridad, setPrioridad] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorItem, setErrorItem] = useState("");

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

  function respuestaDe(itemId) {
    return respuestas.find((r) => r.checklist_item_id === itemId);
  }

  function abrirNoPasa(item) {
    setItemAbierto(item.id);
    setObservacion("");
    setGenerarCorrectiva(true);
    setPrioridad("");
    setErrorItem("");
  }

  async function marcarPasa(item) {
    try {
      const nueva = await registrarRespuesta({
        mpId: mp.id, checklistItemId: item.id, resultado: "PASA", completadoPor: perfil?.id,
      });
      setRespuestas((antes) => [...antes, nueva]);
    } catch (e) {
      toast.error(e.response?.data?.detail || "No pudimos guardar la respuesta.");
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
        setRespuestas((antes) => [...antes, {
          id: `local-${item.id}`, mp_id: mp.id, checklist_item_id: item.id,
          completado: true, resultado: "NO_PASA", observacion: observacion.trim(),
        }]);
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
        setRespuestas((antes) => [...antes, nueva]);
      }
      setItemAbierto(null);
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

  const completados = items.filter((it) => respuestaDe(it.id)).length;

  return (
    <div style={{ ...cs.tarjeta, padding: 18, marginTop: 14 }}>
      <div style={estilos.cabecera}>
        <p style={estilos.panelTitulo}>Checklist de mantenimiento</p>
        <span style={estilos.progreso}>{completados} de {items.length} completados</span>
      </div>

      <div style={estilos.listaItems}>
        {items.map((item) => {
          const r = respuestaDe(item.id);
          return (
            <div key={item.id} style={estilos.item}>
              <div style={estilos.filaItem}>
                <IconoEstado resultado={r?.resultado} />
                <span style={estilos.itemTexto}>
                  {item.descripcion}
                  {!item.obligatorio && <span style={estilos.opcional}> (opcional)</span>}
                </span>

                {!r && puedeCompletar && itemAbierto !== item.id && (
                  <div style={estilos.botonesItem}>
                    <button style={{ ...boton("secundario"), padding: "6px 12px" }} onClick={() => marcarPasa(item)}>
                      Pasa
                    </button>
                    <button style={{ ...boton("peligro"), padding: "6px 12px" }} onClick={() => abrirNoPasa(item)}>
                      No pasa
                    </button>
                  </div>
                )}

                {r && (
                  <span style={insignia(r.resultado === "PASA" ? "exito" : "peligro")}>
                    {r.resultado === "PASA" ? "Pasa" : "No pasa"}
                  </span>
                )}
              </div>

              {r?.observacion && (
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
                    <button style={boton("fantasma")} onClick={() => setItemAbierto(null)} disabled={enviando}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
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
  observacion: { margin: "8px 0 0 28px", fontSize: "0.84rem", color: color.textoSuave, lineHeight: 1.5 },
  formNoPasa: { marginTop: 12, paddingTop: 12, borderTop: `1px solid ${color.bordeSuave}` },
  checkboxFila: { display: "flex", alignItems: "center", gap: 8, fontSize: "0.86rem", color: color.texto, cursor: "pointer" },
  error: { color: color.peligro, fontSize: "0.82rem", margin: "10px 0 0" },
};

export default ChecklistPreventiva;