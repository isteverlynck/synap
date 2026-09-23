// dashboard.js — los indicadores del panel de jefatura. Un solo endpoint
// devuelve todos los KPIs calculados en el momento.

import cliente from "./cliente";

// grupoId / tipoEquipoId: opcionales y combinables, afectan a TODOS los KPIs.
// mes: opcional, formato "YYYY-MM" (lo que devuelve un <input type="month">).
// A diferencia de grupoId/tipoEquipoId, mes SOLO afecta al cumplimiento de
// preventivos — ver la nota en el backend (dashboard.py) del porqué.
export async function obtenerKPIs({ grupoId, tipoEquipoId, mes } = {}) {
  const params = {};
  if (grupoId) params.grupo_id = grupoId;
  if (tipoEquipoId) params.tipo_equipo_id = tipoEquipoId;
  if (mes) {
    const [anio, mesNum] = mes.split("-").map(Number);
    params.anio = anio;
    params.mes = mesNum;
  }
  const res = await cliente.get("/dashboard/kpis", { params });
  return res.data;
}