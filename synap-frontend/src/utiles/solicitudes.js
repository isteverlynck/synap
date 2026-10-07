// solicitudes.js — lo que comparten las pantallas que listan solicitudes de
// servicio (la bandeja de coordinación, en Pendientes.jsx, y las listas de
// "Mis solicitudes", en Solicitudes.jsx) para buscarlas por equipo y por
// fecha. Son funciones puras: no tocan la pantalla ni piden nada al backend,
// solo deciden si una solicitud entra o no en lo que se está buscando.

import { parsearFecha } from "./fechas";

const MS_POR_HORA = 3600000;

// El día (AAAA-MM-DD) en que cae una fecha con hora, contado en hora de
// Argentina. El backend guarda las horas en UTC; a las 22:00 del 5 de octubre
// en Argentina ya es 01:00 del 6 en UTC, y la solicitud tiene que contar como
// del 5. Argentina no cambia la hora en verano (siempre UTC-3), así que
// alcanza con restar 3 horas. Mismo criterio que el filtro de fecha de las
// órdenes de trabajo. Devuelve null si no hay fecha o no se entiende.
export function diaArgentina(valor) {
  if (!valor) return null;
  const fecha = parsearFecha(valor);
  if (isNaN(fecha.getTime())) return null;
  return new Date(fecha.getTime() - 3 * MS_POR_HORA).toISOString().slice(0, 10);
}

// ¿La fecha cae dentro del rango? "desde" y "hasta" son "AAAA-MM-DD" (o ""
// si no se puso), y los dos días cuentan como parte del rango. Sin ningún
// extremo, todo entra. Una solicitud sin fecha no entra si hay un rango
// puesto.
export function enRangoDeFechas(valor, desde, hasta) {
  if (!desde && !hasta) return true;
  const dia = diaArgentina(valor);
  if (!dia) return false;
  if (desde && dia < desde) return false;
  if (hasta && dia > hasta) return false;
  return true;
}

// Minúsculas y sin tildes, para que "ubicacion" encuentre "Ubicación".
function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// ¿La solicitud coincide con lo que se escribió en el buscador? Alcanza con
// una de estas tres:
//   - Número de solicitud: "12" o "#12" encuentra la solicitud #12 (el número
//     exacto, no las que lo contienen).
//   - Equipo: el código del equipo, sin importar mayúsculas ni si los guiones
//     o espacios no coinciden exactamente con los del código real ("b ciru
//     maan 056" encuentra B-CIRU-MAAN-056). Si la solicitud no es de un equipo
//     médico, lo que se escribió como "qué es" (pinza de oftalmología, etc.).
//   - Otros datos: el título, la ubicación o quién la pidió.
export function coincideSolicitud(s, textoBusqueda) {
  const texto = textoBusqueda.trim();
  if (!texto) return true;

  const comoNumero = texto.replace(/^#\s*/, "");
  if (/^\d+$/.test(comoNumero) && Number(comoNumero) === s.numero_solicitud) {
    return true;
  }

  const comoCodigo = texto.toUpperCase().replace(/[\s-]+/g, "-").replace(/^-+|-+$/g, "");
  if (comoCodigo && s.activo_codigo?.toUpperCase().includes(comoCodigo)) {
    return true;
  }

  const buscado = normalizar(texto);
  return [s.descripcion_cosa, s.titulo, s.ubicacion, s.solicitante_nombre]
    .some((campo) => normalizar(campo).includes(buscado));
}

// La lista ordenada de la más reciente a la más vieja (las sin fecha, al
// final). Hace falta ANTES de partirla en páginas: si cada página se ordenara
// por su lado, una solicitud reciente podría quedar en la página 3.
export function masRecientesPrimero(lista, obtenerFecha) {
  const marca = (item) => {
    const valor = obtenerFecha(item);
    if (!valor) return Number.MIN_SAFE_INTEGER;
    const t = parsearFecha(valor).getTime();
    return isNaN(t) ? Number.MIN_SAFE_INTEGER : t;
  };
  return [...lista].sort((a, b) => marca(b) - marca(a));
}