// exportar.js — descarga de tablas en CSV (se abren en Excel o Google Sheets).
//
// No alcanza con un link común porque el backend pide el token de sesión:
// pedimos el archivo con axios (que ya lo agrega), lo recibimos como "blob"
// (el archivo en crudo) y lo descargamos con un link temporal.

import cliente from "./cliente";

// ruta: la del backend, ej. "/exportar/activos".
// nombreBase: cómo se llama el archivo, ej. "equipos" → equipos_2026-09-25.csv
export async function descargarCSV(ruta, nombreBase) {
  const res = await cliente.get(ruta, { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${nombreBase}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}