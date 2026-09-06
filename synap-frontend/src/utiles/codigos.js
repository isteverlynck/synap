// codigos.js — normalización de los códigos de equipo.
//
// En la base los códigos están con guiones y en mayúsculas (B-TERA-MOMU-001),
// pero las etiquetas físicas del hospital los muestran con espacios
// (B TERA MOMU 001). Si comparamos literal, el escaneo no encuentra nada.
//
// Esta función lleva cualquier variante a la forma que usa la base, así da
// igual cómo venga: escaneado, tipeado, con espacios o en minúsculas.

export function normalizarCodigo(texto) {
  if (!texto) return "";
  return texto
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")   // espacios (uno o varios) → guión
    .replace(/-+/g, "-")    // guiones repetidos → uno solo
    .replace(/^-|-$/g, ""); // guiones sobrantes al principio o al final
}