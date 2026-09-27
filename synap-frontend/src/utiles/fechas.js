// fechas.js — formateo y agrupación de fechas, compartido por las pantallas
// que muestran listas cronológicas (solicitudes, pendientes, órdenes).

// Las fechas de solo día ("2026-10-29") las interpreta como UTC, y en
// Argentina eso las corre un día para atrás. Si viene así, la armamos en
// hora local.
//
// Las fechas CON hora las manda el backend en UTC (datetime.utcnow()) pero
// SIN indicar la zona (ej: "2026-09-27T22:45:00.123456", sin "Z" ni offset
// al final). El estándar de JS interpreta un datetime sin zona como hora
// LOCAL, no UTC — así que sin este agregado, una OT abierta a las 19:45
// (hora de Argentina) se mostraba como "22:45" (la hora UTC, tal cual, sin
// convertir). Si el valor no trae ya una zona explícita, se la agregamos
// ("Z" = UTC) para que el navegador la convierta bien a la hora local.
export function parsearFecha(valor) {
  const texto = String(valor);
  const soloDia = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (soloDia) {
    return new Date(Number(soloDia[1]), Number(soloDia[2]) - 1, Number(soloDia[3]));
  }
  const tieneZonaExplicita = /Z$|[+-]\d{2}:\d{2}$/.test(texto);
  return new Date(tieneZonaExplicita ? texto : `${texto}Z`);
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
export function agruparPorFecha(lista, obtenerFecha, formato = formatearFecha) {
  const ordenada = [...lista].sort(
    (a, b) => new Date(obtenerFecha(b)) - new Date(obtenerFecha(a))
  );
  const grupos = [];
  for (const item of ordenada) {
    const fechaRaw = obtenerFecha(item);
    const fecha = fechaRaw ? formato(fechaRaw) : "Sin fecha";
    const ultimoGrupo = grupos[grupos.length - 1];
    if (ultimoGrupo && ultimoGrupo.fecha === fecha) {
      ultimoGrupo.items.push(item);
    } else {
      grupos.push({ fecha, items: [item] });
    }
  }
  return grupos;
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function formatearFechaOT(valor, conHora = false) {
  if (!valor) return "—";
  const f = parsearFecha(valor);
  if (isNaN(f.getTime())) return "—";
  const fecha = `${f.getDate()}-${MESES[f.getMonth()]}-${f.getFullYear()}`;
  if (!conHora) return fecha;
  const horas = String(f.getHours()).padStart(2, "0");
  const minutos = String(f.getMinutes()).padStart(2, "0");
  return `${fecha} ${horas}:${minutos}hs`;
}