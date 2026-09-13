// stock.js — insumos y repuestos: seguimiento de stock, alertas de
// reposición, compras (pedido/recepción) y consumos vinculados a una OT.

import cliente from "./cliente";

// Listado de insumos con sus existencias actuales.
export async function listarInsumos() {
  const res = await cliente.get("/stock/insumos");
  return res.data;
}

// Un insumo puntual.
export async function verInsumo(insumoId) {
  const res = await cliente.get(`/stock/insumos/${insumoId}`);
  return res.data;
}

// Dar de alta un insumo nuevo en el catálogo (coordinación/jefatura).
export async function crearInsumo(datos) {
  const res = await cliente.post("/stock/insumos", datos);
  return res.data;
}

// Estado de stock con nivel (ok/reponer/critico). Por defecto solo trae los
// que necesitan atención; con soloAlertas=false trae todos (para pintar la
// tabla completa por color).
export async function alertasDeStock(soloAlertas = true) {
  const res = await cliente.get("/stock/alertas", { params: { solo_alertas: soloAlertas } });
  return res.data;
}

// Historial de compras. Filtrable por insumo y/o estado (pedida/recibida).
export async function listarCompras({ insumoId, estado } = {}) {
  const params = {};
  if (insumoId) params.insumo_id = insumoId;
  if (estado) params.estado = estado;
  const res = await cliente.get("/stock/compras", { params });
  return res.data;
}

// Registrar un PEDIDO de compra (nace 'pedida', no suma stock todavía).
export async function registrarPedidoCompra(datos) {
  const res = await cliente.post("/stock/compras", datos);
  return res.data;
}

// Marcar una compra como recibida: recién ahí sube el stock.
export async function recibirCompra(compraId) {
  const res = await cliente.patch(`/stock/compras/${compraId}/recibir`);
  return res.data;
}

// Historial de consumos (salidas de stock). Filtrable por OT y/o insumo.
export async function listarConsumos({ otId, insumoId } = {}) {
  const params = {};
  if (otId) params.ot_id = otId;
  if (insumoId) params.insumo_id = insumoId;
  const res = await cliente.get("/stock/consumos", { params });
  return res.data;
}

// Registrar un consumo (descuento automático) vinculado a una OT. Nunca se
// rechaza por falta de stock: el backend devuelve el nivel resultante y, si
// corresponde, un aviso para mostrarle a la persona.
export async function registrarConsumo({ otId, insumoId, cantidad, tecnicoId }) {
  const res = await cliente.post("/stock/consumos", {
    ot_id: otId, insumo_id: insumoId, cantidad, tecnico_id: tecnicoId || null,
  });
  return res.data;
}