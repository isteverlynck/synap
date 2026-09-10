// checklists.js — completar el checklist de un mantenimiento preventivo.
//
// Dos conceptos (no confundir): la PLANTILLA (qué hay que revisar, fijo) y
// las RESPUESTAS (qué se marcó en un MP concreto). Este archivo trae ambas
// cosas y registra las respuestas que va marcando el técnico.

import cliente from "./cliente";

// Los ítems de una plantilla de checklist, en orden.
export async function verChecklistDePlantilla(plantillaId) {
  const res = await cliente.get(`/checklists/plantilla/${plantillaId}`);
  return res.data;
}

// Las respuestas ya registradas en un MP concreto.
export async function verRespuestasDeMP(mpId) {
  const res = await cliente.get(`/checklists/respuestas/${mpId}`);
  return res.data;
}

// Registrar la respuesta a UN ítem (pasa / no pasa), sin generar correctiva.
export async function registrarRespuesta({ mpId, checklistItemId, resultado, observacion, completadoPor }) {
  const res = await cliente.post("/checklists/respuestas", {
    mp_id: mpId,
    checklist_item_id: checklistItemId,
    completado: true,
    resultado,
    observacion: observacion || null,
    completado_por: completadoPor || null,
  });
  return res.data;
}

// Combo: registrar el ítem como NO_PASA Y generar de una la OT correctiva
// asociada (queda enganchada a la OT preventiva de origen).
export async function generarCorrectivaDesdeChecklist({ mpId, checklistItemId, descripcion, prioridad, tecnicoId }) {
  const res = await cliente.post("/checklists/generar-correctiva", {
    mp_id: mpId,
    checklist_item_id: checklistItemId,
    descripcion,
    prioridad: prioridad || null,
    tecnico_id: tecnicoId || null,
  });
  return res.data;
}