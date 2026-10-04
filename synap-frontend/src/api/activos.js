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
export async function listarActivos({ buscar, estado, tipoEquipoId, sectorId, grupoId, limit, offset } = {}) {
  const params = {};
  if (buscar) params.buscar = buscar;
  if (estado) params.estado = estado;
  if (tipoEquipoId) params.tipo_equipo_id = tipoEquipoId;
  if (sectorId) params.sector_id = sectorId;
  if (grupoId) params.grupo_id = grupoId;
  if (limit) params.limit = limit;
  if (offset) params.offset = offset;
  const res = await cliente.get("/activos", { params });
  return res.data;
}

// Como listarActivos, pero además devuelve el total de resultados que hay SIN
// paginar (header X-Total-Count que manda el backend). La usa la pantalla de
// Activos para el botón "Cargar más": las otras pantallas que buscan equipos
// (el buscador de CalendarioMP y el de DetalleOrden) siguen usando
// listarActivos a secas, sin tocarlas, porque a ellas les alcanza con la
// primera página y esperan un array simple como respuesta.
export async function listarActivosConTotal(opciones = {}) {
  const { buscar, estado, tipoEquipoId, sectorId, grupoId, limit, offset } = opciones;
  const params = {};
  if (buscar) params.buscar = buscar;
  if (estado) params.estado = estado;
  if (tipoEquipoId) params.tipo_equipo_id = tipoEquipoId;
  if (sectorId) params.sector_id = sectorId;
  if (grupoId) params.grupo_id = grupoId;
  if (limit) params.limit = limit;
  if (offset) params.offset = offset;
  const res = await cliente.get("/activos", { params });
  const total = Number(res.headers["x-total-count"]);
  return { items: res.data, total: Number.isNaN(total) ? res.data.length : total };
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

// ─── Catálogos (tipos de equipo y servicios): alta de coordinación ───

// Dar de alta un tipo de equipo nuevo (ej: llegó un robot y no había tipo
// para eso). datos: { id, nombre, descripcion }.
export async function crearTipoEquipo(datos) {
  const res = await cliente.post("/activos/tipos-equipo", datos);
  return res.data;
}

// Dar de alta un servicio/área nueva. datos: { id, nombre, centro_costos, descripcion }.
export async function crearServicio(datos) {
  const res = await cliente.post("/activos/servicios", datos);
  return res.data;
}

export async function programarSegunPlan(codigo) {
  const { data } = await cliente.patch(`/activos/${codigo}/programar-segun-plan`);
  return data;
}

// Asignar a mano un plan de mantenimiento a un equipo que todavía no tiene
// uno. A diferencia de programarSegunPlan (que adivina solo), acá se elige
// explícitamente CUÁL plan (planId) y en qué mes arranca (proximaFechaMp,
// formato "YYYY-MM-DD" — el día se ignora, el backend lo normaliza al 1).
export async function asignarPlan(codigo, planId, proximaFechaMp) {
  const { data } = await cliente.patch(
    `/activos/${codigo}/asignar-plan/${planId}`,
    null,
    { params: { proxima_fecha_mp: proximaFechaMp } }
  );
  return data;
}

// Cambiar el mes del próximo mantenimiento de un equipo que YA tiene uno
// asignado (no toca el plan ni la frecuencia, solo la fecha). nuevaFecha en
// formato "YYYY-MM-DD" — el día se ignora, el backend lo normaliza al 1. Si
// el equipo todavía no tiene ningún mantenimiento asignado, usar
// asignarPlan en lugar de esta función.
export async function reprogramarMp(codigo, nuevaFecha) {
  const { data } = await cliente.patch(
    `/activos/${codigo}/reprogramar-mp`,
    null,
    { params: { nueva_fecha: nuevaFecha } }
  );
  return data;
}

// Editar la ficha de un equipo ya existente. Es parcial: solo manda los
// campos que realmente cambiaron (ver EditarActivo en FichaActivo.jsx).
export async function editarActivo(codigo, datos) {
  const res = await cliente.patch(`/activos/${codigo}`, datos);
  return res.data;
}

// Criticidad y nivel de riesgo del equipo según el PRIUX del Alemán.
export async function verCriticidad(codigo) {
  const res = await cliente.get(`/activos/${codigo}/criticidad`);
  return res.data;
}

// ─── Informe en PDF (datos del equipo + todo su historial de OT) ───
// Se pide como blob (igual que el informe de OT en api/ordenes.js) porque el
// backend exige el token de sesión, así que no alcanza con un link común.
export async function descargarInformeActivo(codigo) {
  const res = await cliente.get(`/activos/${codigo}/informe-pdf`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(res.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Informe_${codigo}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}