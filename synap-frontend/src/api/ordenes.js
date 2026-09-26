// ordenes.js — órdenes de trabajo. Las usan los cuatro roles, cada uno de una
// forma distinta: el técnico ve las suyas, coordinación las de su grupo,
// jefatura todas, y cualquiera puede abrir el detalle de una OT puntual.

import cliente from "./cliente";

// Las OT asignadas al usuario logueado (la pantalla del técnico).
//   { estado }  → ABIERTA / EN_PROGRESO / CERRADA
//   { tipo }    → CORRECTIVA / PREVENTIVA
export async function misOrdenes({ estado, tipo } = {}) {
  const params = {};
  if (estado) params.estado = estado;
  if (tipo) params.tipo = tipo;
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
export async function cerrarOrden(otId, observaciones, justificacionRetraso) {
  const res = await cliente.patch(`/ordenes-trabajo/${otId}/cerrar`, {
    observaciones: observaciones || null,
    justificacion_retraso: justificacionRetraso || null,
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

// ─── Adjuntos (fotos o PDFs de la solicitud que originó la OT) ───

// Solo los nombres, para la lista. El archivo en sí se pide al tocarlo.
export async function listarAdjuntos(otId) {
  const res = await cliente.get(`/ordenes-trabajo/${otId}/adjuntos`);
  return res.data;
}

// Abre un adjunto. No alcanza con un link común porque el backend pide el
// token de sesión: lo pedimos con axios (que ya lo agrega), lo recibimos como
// "blob" (el archivo en crudo) y armamos una dirección temporal para abrirlo.
//
// Las fotos JPG/PNG y los PDF se abren en una pestaña nueva. Las HEIC se
// descargan con su nombre, porque la mayoría de los navegadores no las muestran.
export async function abrirAdjunto(otId, adjunto) {
  const esHeic = adjunto.tipo_mime === "image/heic" || adjunto.tipo_mime === "image/heif";
  // La pestaña se abre ANTES de pedir el archivo: si se abre después de
  // esperar la respuesta, algunos navegadores (Safari) la bloquean.
  const pestana = esHeic ? null : window.open("", "_blank");
  try {
    const res = await cliente.get(`/ordenes-trabajo/${otId}/adjuntos/${adjunto.id}`, {
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