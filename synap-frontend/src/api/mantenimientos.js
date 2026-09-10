// mantenimientos.js — mantenimientos preventivos (MP) puntuales.
//
// Por ahora lo único que necesita el frontend es encontrar el MP enganchado
// a una OT preventiva (para saber qué checklist mostrarle al técnico).

import cliente from "./cliente";

// El (o los, aunque en la práctica es a lo sumo uno) MP enganchado a una OT.
export async function mantenimientoDeOT(otId) {
  const res = await cliente.get("/mantenimientos", { params: { ot_id: otId } });
  return res.data;
}