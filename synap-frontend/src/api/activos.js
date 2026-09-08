// activos.js — llamadas al backend relacionadas con los equipos (activos).

import cliente from "./cliente";


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

// Listado con búsqueda y filtros. Todos opcionales y combinables.
export async function listarActivos({ buscar, estado, tipoEquipoId, sectorId, grupoId } = {}) {
  const params = {};
  if (buscar) params.buscar = buscar;
  if (estado) params.estado = estado;
  if (tipoEquipoId) params.tipo_equipo_id = tipoEquipoId;
  if (sectorId) params.sector_id = sectorId;
  if (grupoId) params.grupo_id = grupoId;
  const res = await cliente.get("/activos", { params });
  return res.data;
}

// Opciones para los desplegables de filtro.
export async function opcionesDeFiltro() {
  const res = await cliente.get("/activos/filtros");
  return res.data;
}

// ─── Alta de un equipo nuevo ───

// Catálogos completos (tipos de equipo y servicios) para el formulario de
// "nuevo activo". A diferencia de opcionesDeFiltro(), acá van TODOS, no solo
// los que ya están en uso.
export async function catalogosParaAlta() {
  const res = await cliente.get("/activos/catalogos");
  return res.data;
}

// Crear un activo nuevo. El código lo arma el backend (área + tipo de equipo
// + número correlativo); acá no se manda.
export async function crearActivo(datos) {
  const res = await cliente.post("/activos", datos);
  return res.data;
}