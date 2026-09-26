// solicitudes.js — llamadas al backend relacionadas con solicitudes de servicio
// (lo que hace el usuario de enfermería/médico) y, para ver el avance de una
// solicitud ya aceptada, la orden de trabajo (OT) que generó.

import cliente from "./cliente";

// Crear una solicitud nueva. "datos" tiene la forma que espera el backend:
// { es_equipo_medico, descripcion_problema, ubicacion, activo_codigo?, descripcion_cosa? }
export async function crearSolicitud(datos) {
  const res = await cliente.post("/solicitudes", datos);
  return res.data;
}

// Las solicitudes del usuario logueado. "estado" es opcional: PENDIENTE / ACEPTADA / RECHAZADA.
export async function misSolicitudes(estado) {
  const params = estado ? { estado } : {};
  const res = await cliente.get("/solicitudes/mias", { params });
  return res.data;
}

// Ver una orden de trabajo puntual (para saber cómo va una solicitud ya aceptada:
// sin asignar / en progreso / finalizada). Cualquier usuario logueado puede verla.
export async function verOrdenTrabajo(otId) {
  const res = await cliente.get(`/ordenes-trabajo/${otId}`);
  return res.data;
}


// Adjuntar archivos (fotos o PDFs) a una solicitud ya creada. "archivos" es
// una lista de File (lo que devuelve un <input type="file">). Se mandan como
// formulario (FormData) porque así viajan los archivos; el backend los recibe
// todos juntos bajo el nombre "archivos".
export async function subirAdjuntos(solicitudId, archivos) {
  const formulario = new FormData();
  archivos.forEach((archivo) => formulario.append("archivos", archivo));
  const res = await cliente.post(`/solicitudes/${solicitudId}/adjuntos`, formulario);
  return res.data;
}