// dashboard.js — los indicadores del panel de jefatura. Un solo endpoint
// devuelve todos los KPIs calculados en el momento.

import cliente from "./cliente";

export async function obtenerKPIs() {
  const res = await cliente.get("/dashboard/kpis");
  return res.data;
}