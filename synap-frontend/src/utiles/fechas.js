// fechas.js — formateo y agrupación de fechas, compartido por las pantallas
// que muestran listas cronológicas (solicitudes, pendientes, órdenes).

// Las fechas de solo día ("2026-10-29") las interpreta como UTC, y en
// Argentina eso las corre un día para atrás. Si viene así, la armamos en
// hora local; si trae hora, se parsea tal cual.
export function parsearFecha(valor) {
  const texto = String(valor);
  const soloDia = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return soloDia
    ? new Date(Number(soloDia[1]), Number(soloDia[2]) - 1, Number(soloDia[3]))
    : new Date(texto);
}

export function formatearFecha(fechaISO) {
  return parsearFecha(fechaISO).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Días desde hoy hasta una fecha. Negativo = ya pasó. null si no hay dato.
export function diasHasta(fecha) {
  if (!fecha) return null;
  const objetivo = parsearFecha(fecha);
  if (isNaN(objetivo.getTime())) return null;
  const hoy = new Date();
  objetivo.setHours(0, 0, 0, 0);
  hoy.setHours(0, 0, 0, 0);
  return Math.round((objetivo - hoy) / 86400000);
}

// Agrupa una lista en bloques por día, del más reciente al más viejo.
// "obtenerFecha" le dice cómo sacarle la fecha a cada elemento (útil porque a
// veces el elemento es { solicitud, ot } y no la solicitud directamente).
export function agruparPorFecha(lista, obtenerFecha) {
  const ordenada = [...lista].sort(
    (a, b) => new Date(obtenerFecha(b)) - new Date(obtenerFecha(a))
  );
  const grupos = [];
  for (const item of ordenada) {
    const fechaRaw = obtenerFecha(item);
    const fecha = fechaRaw ? formatearFecha(fechaRaw) : "Sin fecha";
    const ultimoGrupo = grupos[grupos.length - 1];
    if (ultimoGrupo && ultimoGrupo.fecha === fecha) {
      ultimoGrupo.items.push(item);
    } else {
      grupos.push({ fecha, items: [item] });
    }
  }
  return grupos;
}