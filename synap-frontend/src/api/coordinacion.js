// coordinacion.js — lo que hace el coordinador con las solicitudes que le
// llegan: verlas, corregirlas, aceptarlas (con o sin técnico) o rechazarlas.

import cliente from "./cliente";

// Solicitudes pendientes de los grupos que coordina el usuario logueado.
export async function solicitudesPendientes() {
  const res = await cliente.get("/solicitudes/pendientes");
  return res.data;
}

// Técnicos que esta persona puede asignar. Con "grupo" filtra a uno solo, que
// hace falta en las solicitudes de "cosa" (sin equipo, el grupo se elige). Lo
// usan tanto coordinación (ve los técnicos de sus grupos) como los propios
// técnicos (ven solo a sus compañeros de grupo, para reasignar una OT entre
// ellos) — el backend decide el recorte según el rol de quien pregunta.
export async function tecnicosDisponibles(grupo) {
  const params = grupo ? { grupo } : {};
  const res = await cliente.get("/usuarios/tecnicos", { params });
  return res.data;
}

// Los grupos técnicos que existen, para que el coordinador elija a cuál
// mandar una solicitud que no es de un equipo (ahí el grupo no se puede
// deducir de ningún activo).
export async function listarGrupos() {
  const res = await cliente.get("/usuarios/grupos");
  return res.data;
}

// Aceptar: genera la OT. Todo el cuerpo es opcional — sin asignar_a_id la OT
// nace sin técnico y se asigna después.
export async function aceptarSolicitud(id, { asignarAId, grupoId, prioridad } = {}) {
  const cuerpo = {};
  if (asignarAId) cuerpo.asignar_a_id = asignarAId;
  if (grupoId) cuerpo.grupo_id = grupoId;
  if (prioridad) cuerpo.prioridad = prioridad;
  const res = await cliente.patch(`/solicitudes/${id}/aceptar`, cuerpo);
  return res.data;
}

// Rechazar: el motivo es obligatorio (lo va a leer quien la pidió).
export async function rechazarSolicitud(id, motivo) {
  const res = await cliente.patch(`/solicitudes/${id}/rechazar`, {
    motivo_rechazo: motivo,
  });
  return res.data;
}

// Corregir una solicitud mal cargada, antes de aceptarla. Solo se mandan los
// campos que cambiaron.
export async function modificarSolicitud(id, cambios) {
  const res = await cliente.patch(`/solicitudes/${id}/modificar`, cambios);
  return res.data;
}