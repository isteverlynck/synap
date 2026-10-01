// planes.js — planes de mantenimiento (las plantillas de MP y sus checklists).
//
// Los usa el formulario de "nuevo activo" (para mostrar con qué checklist va
// a quedar vinculado el mantenimiento antes de crearlo) y la pantalla de
// Mantenimientos, donde coordinación/jefatura pueden ver y crear checklists.

import cliente from "./cliente";

// Todos los planes de mantenimiento (plantillas), sin sus ítems de checklist.
export async function listarPlanes() {
  const res = await cliente.get("/planes-mantenimiento");
  return res.data;
}

// Un plan puntual, con todos sus ítems de checklist (ordenados).
export async function verPlan(planId) {
  const res = await cliente.get(`/planes-mantenimiento/${planId}`);
  return res.data;
}

// Crear un plan de mantenimiento nuevo: la plantilla + todos sus ítems de
// checklist, de una sola vez. Solo coordinación (y jefatura) pueden hacerlo
// — el backend corta con 403 si lo intenta otro rol.
export async function crearPlan(datos) {
  const res = await cliente.post("/planes-mantenimiento", datos);
  return res.data;
}

// Editar un plan ya existente: nombre, frecuencia, descripción y/o los
// ítems del checklist. Mismo permiso que crearPlan. Si mandás "items", la
// lista reemplaza por completo los ítems editables del plan (ver
// PanelEditarPlan en DetallePlan.jsx) — un ítem con id se actualiza, uno sin
// id se crea, y uno que ya existía y no viene en la lista se da de baja
// (nunca se borra del todo).
export async function editarPlan(planId, datos) {
  const res = await cliente.patch(`/planes-mantenimiento/${planId}`, datos);
  return res.data;
}