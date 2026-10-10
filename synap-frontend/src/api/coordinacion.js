// coordinacion.js — lo que hace el coordinador con las solicitudes que le
// llegan: verlas (con sus archivos adjuntos), corregirlas, aceptarlas (con o
// sin técnico) o rechazarlas.

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

// Aceptar: genera la OT. asignar_a_id, grupo_id y prioridad son opcionales
// (sin asignar_a_id la OT nace sin técnico y se asigna después). En cambio
// origenFalla es OBLIGATORIO: "TECNICA" o "USUARIO" (el backend rechaza el
// pedido si falta). Solo las fallas técnicas cuentan en los KPIs del dashboard.
export async function aceptarSolicitud(id, { asignarAId, grupoId, prioridad, origenFalla } = {}) {
  const cuerpo = {};
  if (origenFalla) cuerpo.origen_falla = origenFalla;
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

// ─── Archivos adjuntos de una solicitud pendiente ───
// Las fotos o PDF que subió quien hizo la solicitud. Una vez aceptada se ven
// desde la orden de trabajo (api/ordenes.js); estas tres sirven para mirarlos
// ANTES de decidir.

// Cuántos archivos tiene cada solicitud pendiente de la bandeja:
// { "id de la solicitud": cantidad }. Las que no tienen ninguno no figuran.
export async function resumenAdjuntosPendientes() {
  const res = await cliente.get("/solicitudes/pendientes/adjuntos-resumen");
  return res.data;
}

// Solo los nombres, para la lista. El archivo en sí se pide al tocarlo.
export async function listarAdjuntosDeSolicitud(solicitudId) {
  const res = await cliente.get(`/solicitudes/${solicitudId}/adjuntos`);
  return res.data;
}

// Abre un adjunto. No alcanza con un link común porque el backend pide el
// token de sesión: lo pedimos con axios (que ya lo agrega), lo recibimos como
// "blob" (el archivo en crudo) y armamos una dirección temporal para abrirlo.
//
// Las fotos JPG/PNG y los PDF se abren en una pestaña nueva. Las HEIC se
// descargan con su nombre, porque la mayoría de los navegadores no las muestran.
export async function abrirAdjuntoDeSolicitud(solicitudId, adjunto) {
  const esHeic = adjunto.tipo_mime === "image/heic" || adjunto.tipo_mime === "image/heif";
  // La pestaña se abre ANTES de pedir el archivo: si se abre después de
  // esperar la respuesta, algunos navegadores (Safari) la bloquean.
  const pestana = esHeic ? null : window.open("", "_blank");
  try {
    const res = await cliente.get(`/solicitudes/${solicitudId}/adjuntos/${adjunto.id}`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    if (pestana) {
      pestana.location.href = url;
    } else {
      const link = document.createElement("a");
      link.href = url;
      link.download = adjunto.nombre_archivo;
      link.click();
    }
    // La dirección temporal se libera al rato, cuando ya se abrió.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    if (pestana) pestana.close();
    throw err;
  }
}