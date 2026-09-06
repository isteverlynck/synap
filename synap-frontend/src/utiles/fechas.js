// fechas.js — formateo y agrupación de fechas, compartido por las pantallas
// que muestran listas cronológicas (solicitudes, pendientes, órdenes).

export function formatearFecha(fechaISO) {
  return new Date(fechaISO).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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