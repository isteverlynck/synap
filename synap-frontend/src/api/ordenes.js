// ordenes.js — órdenes de trabajo. Las usan los cuatro roles, cada uno de una
// forma distinta: el técnico ve las suyas, coordinación las de su grupo,
// jefatura todas, y cualquiera puede abrir el detalle de una OT puntual.

import cliente from "./cliente";

// Las OT asignadas al usuario logueado (la pantalla del técnico).
export async function misOrdenes(estado) {
  const params = estado ? { estado } : {};
  const res = await cliente.get("/ordenes-trabajo/mias", { params });
  return res.data;
}

// Listado general con filtros. Los que más se usan:
//   { misGrupos: true }                → las de los grupos que coordino
//   { misGrupos: true, sinAsignar: true } → las que esperan técnico
export async function listarOrdenes({ estado, tipo, activoCodigo, grupoId,
                                      sinAsignar, misGrupos, limite } = {}) {
  const params = {};
  if (estado) params.estado = estado;
  if (tipo) params.tipo = tipo;
  if (activoCodigo) params.activo_codigo = activoCodigo;
  if (grupoId) params.grupo_id = grupoId;
  if (sinAsignar !== undefined) params.sin_asignar = sinAsignar;
  if (misGrupos) params.mis_grupos = true;
  if (limite) params.limit = limite;
  const res = await cliente.get("/ordenes-trabajo", { params });
  return res.data;
}

// Una OT puntual.
export async function verOrden(otId) {
  const res = await cliente.get(`/ordenes-trabajo/${otId}`);
  return res.data;
}

// Asignar o reasignar el técnico de una OT.
export async function asignarTecnico(otId, tecnicoId) {
  const res = await cliente.patch(`/ordenes-trabajo/${otId}/asignar`, {
    tecnico_id: tecnicoId,
  });
  return res.data;
}

// Cambiar el estado (ABIERTA / EN_PROGRESO / CERRADA). Para cerrar conviene
// usar cerrarOrden(), que además guarda la fecha de cierre.
export async function cambiarEstado(otId, estado) {
  const res = await cliente.patch(`/ordenes-trabajo/${otId}/estado`, { estado });
  return res.data;
}

// Cerrar la OT. Las observaciones son opcionales pero es donde queda registrado
// qué se hizo: es lo que después alimenta el análisis de patrones de falla.
export async function cerrarOrden(otId, observaciones) {
  const res = await cliente.patch(`/ordenes-trabajo/${otId}/cerrar`, {
    observaciones: observaciones || null,
  });
  return res.data;
}

// ─── Tiempo de parada del equipo ───
// Medido a mano (no calculado a partir de otras fechas): se aprieta "Iniciar
// parada" cuando el equipo deja de poder usarse y "Finalizar parada" cuando
// vuelve a andar. Si la OT se cierra con una parada corriendo, el backend la
// cierra solo con la fecha de cierre.

export async function iniciarParada(otId) {
  const res = await cliente.patch(`/ordenes-trabajo/${otId}/iniciar-parada`);
  return res.data;
}

export async function finalizarParada(otId) {
  const res = await cliente.patch(`/ordenes-trabajo/${otId}/finalizar-parada`);
  return res.data;
}

// ─── Bitácora ───
// El registro de lo que se va haciendo mientras la OT está en curso: a
// diferencia de "observaciones" (un solo texto que se completa al cerrar),
// acá se suman entradas con fecha y quién las escribió.

// Las entradas de la bitácora de una OT, de la más vieja a la más nueva.
export async function listarNotas(otId) {
  const res = await cliente.get(`/ordenes-trabajo/${otId}/notas`);
  return res.data;
}

// Sumar una entrada nueva.
export async function agregarNota(otId, texto) {
  const res = await cliente.post(`/ordenes-trabajo/${otId}/notas`, { texto });
  return res.data;
}

// ─── Correctiva asociada a una preventiva ───
// Durante un mantenimiento programado se puede encontrar algo que no
// funciona: esto abre una correctiva aparte, sin perder el rastro de qué
// preventiva la originó.

// Las correctivas que ya se generaron a partir de esta OT (siempre que sea
// una preventiva).
export async function listarCorrectivasAsociadas(otId) {
  const res = await cliente.get(`/ordenes-trabajo/${otId}/correctivas`);
  return res.data;
}

// Generar una correctiva nueva a partir de una preventiva.
export async function crearCorrectivaAsociada(otId, { descripcion, prioridad }) {
  const res = await cliente.post(`/ordenes-trabajo/${otId}/correctiva`, {
    descripcion,
    prioridad: prioridad || null,
  });
  return res.data;
}