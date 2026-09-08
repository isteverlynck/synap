// planes.js — planes de mantenimiento (las plantillas de MP y sus checklists).
//
// Por ahora el formulario de "nuevo activo" es el único que los usa: para
// mostrar, antes de crear el equipo, con qué checklist va a quedar vinculado
// su mantenimiento (el del tipo de equipo elegido, o el genérico si no hay
// uno específico).

import cliente from "./cliente";

// Todos los planes de mantenimiento (plantillas), sin sus ítems de checklist.
export async function listarPlanes() {
  const res = await cliente.get("/planes-mantenimiento");
  return res.data;
}