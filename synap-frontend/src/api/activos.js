// activos.js — llamadas al backend relacionadas con los equipos (activos).

import cliente from "./cliente";

// Lista de activos (para el buscador de "crear solicitud" y la pantalla de Activos).
export async function listarActivos(limit = 50) {
  const res = await cliente.get("/activos", { params: { limit } });
  return res.data;
}

// Un activo puntual, por su código (ej: al escanear su QR y confirmar que existe).
export async function verActivo(codigo) {
  const res = await cliente.get(`/activos/${codigo}`);
  return res.data;
}

// Ficha completa del activo: sus datos + historial de OT, fallas y mantenimientos.
export async function verActivoDetalle(codigo) {
  const res = await cliente.get(`/activos/${codigo}/detalle`);
  return res.data;
}