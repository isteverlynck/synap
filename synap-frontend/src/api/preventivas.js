// preventivas.js — pronóstico y generación de mantenimientos preventivos.
//
// El backend genera las OT preventivas SOLO (al arrancar, y todos los días
// por si es día 1 del mes) — no hace falta apretar nada para que existan.
// Lo que sí necesita el frontend es poder MOSTRAR, de cualquier mes, qué
// mantenimientos hay (generados o todavía en pronóstico).

import cliente from "./cliente";

// Los mantenimientos preventivos de un mes puntual: los ya generados (con su
// OT) y los programados que todavía no (pronóstico). Sin año/mes, el backend
// usa el mes actual.
export async function calendarioPreventivas(anio, mes) {
  const params = {};
  if (anio) params.anio = anio;
  if (mes) params.mes = mes;
  const res = await cliente.get("/preventivas/calendario", { params });
  return res.data;
}

// Forzar el chequeo/generación de un mes a mano. Ya no hace falta para el uso
// normal (el backend se auto-genera), pero queda como resguardo: por ejemplo
// si el backend estuvo apagado varios días y coordinación quiere forzar el
// chequeo ya mismo, sin esperar al próximo reinicio. Solo coordinación.
export async function generarPreventivas(anio, mes) {
  const res = await cliente.post("/preventivas/generar", {
    anio: anio || null,
    mes: mes || null,
  });
  return res.data;
}