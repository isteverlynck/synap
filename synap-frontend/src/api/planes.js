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