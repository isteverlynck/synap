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

// ─── Glosario de siglas: decodificar un código en su significado ───
//
// Un código como B-INTR-DESF-070 (equipo) o E01-1SS-IMAG-RMG (ubicación) se
// arma concatenando siglas con guiones. armarDiccionarioSiglas junta el
// glosario de siglas de ubicación (api/catalogos.js) con el catálogo de
// tipos de equipo (que ya tiene su propio nombre, no hace falta cargarlo dos
// veces) en un solo diccionario sigla → significado.

export function armarDiccionarioSiglas(siglas, tiposEquipo) {
  const dic = {};
  (siglas || []).forEach((s) => { dic[s.id.toUpperCase()] = s.nombre; });
  (tiposEquipo || []).forEach((t) => { dic[t.id.toUpperCase()] = t.nombre; });
  return dic;
}

// Devuelve el texto para el cartelito (ej: "Edificio 1 · Primer subsuelo ·
// Imágenes · Resonancia Magnética"), o "" si no hay nada que decodificar —
// así el que llama sabe que no debe mostrar ningún cartelito.
//
// Los segmentos puramente numéricos (el correlativo al final de un código de
// equipo, ej. "070") se ignoran: nunca son una sigla.
export function decodificarCodigo(codigo, diccionario) {
  if (!codigo || !diccionario) return "";
  const partes = codigo.split("-").filter(Boolean);
  const nombres = [];
  for (const parte of partes) {
    if (/^\d+$/.test(parte)) continue;
    const nombre = diccionario[parte.toUpperCase()];
    if (nombre) nombres.push(nombre);
  }
  return nombres.join(" · ");
}