// catalogos.js — glosario de siglas, para decodificar los segmentos de un
// código de ubicación (ej: E01-1SS-IMAG-RMG) o de equipo en un cartelito al
// pasar el mouse. Ver utiles/codigos.js (decodificarCodigo) y
// componentes/CodigoConGlosario.jsx.

import cliente from "./cliente";

// Todo el glosario (sigla → significado), para armar el diccionario que usa
// CodigoConGlosario en cualquier pantalla.
export async function listarSiglas() {
  const res = await cliente.get("/catalogos/siglas");
  return res.data;
}

// Agregar una sigla nueva. datos: { id, nombre, categoria }.
export async function crearSigla(datos) {
  const res = await cliente.post("/catalogos/siglas", datos);
  return res.data;
}

// Sacar una sigla del glosario (ej: se cargó con un error de tipeo).
export async function eliminarSigla(id) {
  await cliente.delete(`/catalogos/siglas/${id}`);
}