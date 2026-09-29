// CalendarioMP.jsx — calendario de mantenimientos preventivos.
//
// Muestra, mes por mes (cualquiera: pasado, actual o futuro — no solo los
// próximos 3), qué equipos tienen un mantenimiento preventivo esa fecha. Dos
// estados posibles por ítem:
//   - Ya generada: existe la OT real (el backend la generó solo — ver nota
//     abajo). Clickeable, lleva al detalle de la orden.
//   - Pronóstico: la próxima MP del equipo cae en ese mes pero la OT
//     todavía no se generó (normal en meses futuros). Lleva a la ficha del
//     equipo, no a una OT que no existe.
//
// El backend genera las OT preventivas SOLO: al arrancar, y todos los días
// por si es día 1 del mes (antes esto no lo disparaba nada). Por eso esta
// pantalla es de CONSULTA para cualquier rol — no hace falta apretar nada
// para que las órdenes existan. El botón "Generar ahora" es solo un
// resguardo manual (para coordinación/jefatura) por si el backend estuvo
// apagado un tiempo y no quieren esperar al próximo reinicio.
//
// Filtros: el endpoint trae TODOS los equipos con MP ese mes, de cualquier
// grupo (a propósito: es información de planificación, no "mis cosas"). Con
// varios grupos mezclados la lista se hace larga, así que se filtra acá
// mismo, sobre lo que ya se trajo — sin pedirle nada nuevo al backend:
//   - Buscador: por código o nombre del equipo.
//   - Estado: pronóstico / abierta / en progreso / cerrada.
//   - Grupo técnico: las opciones salen de los propios ítems del mes (no de
//     un catálogo aparte), así nunca ofrece un grupo que ese mes no tiene
//     nada.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList,
} from "recharts";
import { calendarioPreventivas, generarPreventivas, resumenCalendario } from "../api/preventivas";
import { obtenerPerfil } from "../api/auth";
import { opcionesDeFiltro } from "../api/activos";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton, insignia, sombra } from "../tema";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MESES_ABREV = MESES.map((m) => m.slice(0, 3));

const PUEDE_GENERAR = ["coordinacion", "jefatura"];

// "YYYY-MM" a partir de un Date — lo que espera el input type="month" y el
// endpoint /preventivas/calendario/resumen.
function formatoMes(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Un Date desplazado "delta" meses (puede ser negativo), siempre al día 1 —
// para calcular el default del rango del gráfico sin pelearse con los
// desbordes de mes/año a mano.
function sumarMesesFecha(d, delta) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

// Los filtros de estado. "PRONOSTICO" no es un estado de OT real: es "la MP
// existe en el plan pero todavía no se generó la orden" (ver comentario de
// arriba).
const FILTROS_ESTADO = [
  { id: "", texto: "Todos" },
  { id: "PRONOSTICO", texto: "Pronóstico" },
  { id: "ABIERTA", texto: "Abiertas" },
  { id: "EN_PROGRESO", texto: "En progreso" },
  { id: "PENDIENTE_CIERRE", texto: "Pendientes de cierre" },
  { id: "CERRADA", texto: "Cerradas" },
];

// ¿Este ítem del calendario pasa los filtros activos? Los tres son
// independientes entre sí (AND): busqueda, estado y grupo.
function coincideFiltros(item, { busqueda, estado, grupo }) {
  if (grupo && item.grupo_id !== grupo) return false;

  if (estado) {
    if (estado === "PRONOSTICO") {
      if (item.generada) return false;
    } else if (!item.generada || item.estado !== estado) {
      return false;
    }
  }

  const texto = busqueda.trim();
  if (texto) {
    const enNombre = item.activo_descripcion?.toLowerCase().includes(texto.toLowerCase());
    const comoCodigo = texto.toUpperCase().replace(/[\s-]+/g, "-").replace(/^-+|-+$/g, "");
    const enCodigo = comoCodigo && item.activo_codigo?.toUpperCase().includes(comoCodigo);
    if (!enNombre && !enCodigo) return false;
  }

  return true;
}

function CalendarioMP() {
  const navegar = useNavigate();
  const hoy = new Date();

  const [perfil, setPerfil] = useState(null);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1); // JS: 0-11 → nosotros: 1-12
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [generando, setGenerando] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState("");

  // ─── Gráfico "carga de mantenimientos por mes" ───
  // Por default arranca en el mes actual y muestra los 6 siguientes: es una
  // pantalla de planificación hacia adelante, así que el rango por default
  // mira para adelante, no para atrás (se puede correr con "Desde"/"Hasta").
  const [desdeGrafico, setDesdeGrafico] = useState(formatoMes(hoy));
  const [hastaGrafico, setHastaGrafico] = useState(formatoMes(sumarMesesFecha(hoy, 5)));
  const [grupoGrafico, setGrupoGrafico] = useState("");
  const [resumenMeses, setResumenMeses] = useState([]);
  const [cargandoGrafico, setCargandoGrafico] = useState(true);
  const [errorGrafico, setErrorGrafico] = useState("");
  const [gruposCatalogo, setGruposCatalogo] = useState([]);

  useEffect(() => {
    obtenerPerfil().then(setPerfil).catch(() => setPerfil(null));
    opcionesDeFiltro().then((o) => setGruposCatalogo(o.grupos || [])).catch(() => {});
  }, []);

  useEffect(() => {
    cargar();
  }, [anio, mes]);

  // El rango se valida ACÁ (no solo en el backend) para no ni siquiera pedir
  // algo que ya sabemos que va a fallar, y para poder mostrar el mensaje al
  // toque en vez de esperar la respuesta del servidor.
  const rangoGraficoValido = desdeGrafico && hastaGrafico && desdeGrafico <= hastaGrafico;

  useEffect(() => {
    if (!rangoGraficoValido) {
      setErrorGrafico("El mes \"hasta\" tiene que ser igual o posterior al mes \"desde\".");
      setCargandoGrafico(false);
      return;
    }
    setCargandoGrafico(true);
    setErrorGrafico("");
    resumenCalendario(desdeGrafico, hastaGrafico, grupoGrafico)
      .then((res) => setResumenMeses(res.items))
      .catch((err) => setErrorGrafico(err.response?.data?.detail || "No pudimos calcular la carga por mes."))
      .finally(() => setCargandoGrafico(false));
  }, [desdeGrafico, hastaGrafico, grupoGrafico, rangoGraficoValido]);

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const res = await calendarioPreventivas(anio, mes);
      setDatos(res);
    } catch {
      setError("No pudimos cargar el calendario de mantenimientos.");
    } finally {
      setCargando(false);
    }
  }

  function cambiarMes(delta) {
    let m = mes + delta;
    let a = anio;
    if (m > 12) { m = 1; a += 1; }
    if (m < 1) { m = 12; a -= 1; }
    setMes(m);
    setAnio(a);
  }

  function irAHoy() {
    setAnio(hoy.getFullYear());
    setMes(hoy.getMonth() + 1);
  }

  const esMesActual = anio === hoy.getFullYear() && mes === hoy.getMonth() + 1;

  async function generarAhora() {
    setGenerando(true);
    try {
      const res = await generarPreventivas(anio, mes);
      if (res.cantidad_generada > 0) {
        toast.success(`Se generaron ${res.cantidad_generada} OT preventivas.`);
      } else {
        toast.info("No había nada nuevo para generar este mes.");
      }
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo generar.");
    } finally {
      setGenerando(false);
    }
  }

  function irAlItem(item) {
    if (item.generada) {
      navegar(`/ordenes/${item.orden_id}`);
    } else {
      navegar(`/activos/${item.activo_codigo}`);
    }
  }

  const items = datos?.items || [];
  const puedeGenerar = PUEDE_GENERAR.includes(perfil?.rol);
  const esJefatura = perfil?.rol === "jefatura";
  function sePuedeAbrir(item) {
    return !(item.generada && esJefatura);
  }

  // Grupos técnicos presentes ESTE mes, para las opciones del filtro — así
  // nunca se ofrece un grupo que este mes no tiene ningún mantenimiento.
  const grupos = [...new Set(items.map((i) => i.grupo_id).filter(Boolean))].sort();

  const hayFiltrosActivos = busqueda.trim() !== "" || filtroEstado !== "" || filtroGrupo !== "";
  const itemsFiltrados = hayFiltrosActivos
    ? items.filter((item) => coincideFiltros(item, { busqueda, estado: filtroEstado, grupo: filtroGrupo }))
    : items;

  function limpiarFiltros() {
    setBusqueda("");
    setFiltroEstado("");
    setFiltroGrupo("");
  }

  return (
    <>
      <Encabezado
        titulo="Calendario de mantenimientos"
        subtitulo={
          hayFiltrosActivos
            ? `${itemsFiltrados.length} de ${items.length} en esta vista`
            : "Preventivos generados y programados, mes a mes"
        }
      />

      <div style={estilos.navegador}>
        <button style={estilos.flecha} onClick={() => cambiarMes(-1)} aria-label="Mes anterior">
          <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>

        <div style={estilos.mesActual}>
          <span style={estilos.mesTexto}>{MESES[mes - 1]} {anio}</span>
        </div>

        <button style={estilos.flecha} onClick={() => cambiarMes(1)} aria-label="Mes siguiente">
          <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
        </button>

        {!esMesActual && (
          <button style={estilos.linkHoy} onClick={irAHoy}>Ir a hoy</button>
        )}

        {puedeGenerar && (
          <button
            style={{ ...boton("fantasma"), marginLeft: "auto" }}
            onClick={generarAhora}
            disabled={generando}
            title="Resguardo manual: normalmente no hace falta, el backend genera solo."
          >
            {generando ? "Generando..." : "Generar ahora"}
          </button>
        )}
      </div>

      {/* ─── Carga de mantenimientos por mes: vista de conjunto (varios
      meses a la vez), para ver de un vistazo qué mes tiene más encima antes
      de meterse a revisar mes por mes en la lista de abajo. ─── */}
      <div style={{ ...cs.tarjeta, padding: "18px 20px", marginBottom: 18 }}>
        <div style={estilos.encabezadoGrafico}>
          <div>
            <p style={estilos.tituloGrafico}>Carga de mantenimientos por mes</p>
            <p style={estilos.ayudaGrafico}>Generados + pronóstico, para ver qué mes está más cargado.</p>
          </div>
          <div style={estilos.controlesGrafico}>
            <label style={estilos.campoRango}>
              <span style={estilos.etiquetaRango}>Desde</span>
              <input
                type="month"
                style={estilos.inputMesRango}
                value={desdeGrafico}
                onChange={(e) => setDesdeGrafico(e.target.value)}
              />
            </label>
            <label style={estilos.campoRango}>
              <span style={estilos.etiquetaRango}>Hasta</span>
              <input
                type="month"
                style={estilos.inputMesRango}
                value={hastaGrafico}
                onChange={(e) => setHastaGrafico(e.target.value)}
              />
            </label>
          </div>
        </div>

        {gruposCatalogo.length > 1 && (
          <div style={{ ...estilos.filtros, marginTop: 12, marginBottom: 0 }}>
            <button
              onClick={() => setGrupoGrafico("")}
              style={{ ...estilos.filtro, ...(grupoGrafico === "" ? estilos.filtroActivo : {}) }}
            >
              Todos los grupos
            </button>
            {gruposCatalogo.map((g) => (
              <button
                key={g.id}
                onClick={() => setGrupoGrafico(g.id)}
                style={{ ...estilos.filtro, ...(grupoGrafico === g.id ? estilos.filtroActivo : {}) }}
              >
                {g.nombre}
              </button>
            ))}
          </div>
        )}

        <GraficoCargaMensual
          datos={resumenMeses}
          cargando={cargandoGrafico}
          error={errorGrafico}
        />
      </div>

      {/* ─── Buscador: por código o nombre del equipo ─── */}
      <div style={estilos.campoBusqueda}>
        <Search size={17} strokeWidth={1.9} color={color.textoDebil} aria-hidden="true" />
        <input
          style={estilos.inputBusqueda}
          placeholder="Buscar por código o nombre del equipo"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        {busqueda && (
          <button style={estilos.limpiarBusqueda} onClick={() => setBusqueda("")} title="Limpiar">
            <X size={15} strokeWidth={2.2} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* ─── Filtro por estado ─── */}
      <div style={estilos.filtros}>
        {FILTROS_ESTADO.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltroEstado(f.id)}
            style={{
              ...estilos.filtro,
              ...(filtroEstado === f.id ? estilos.filtroActivo : {}),
            }}
          >
            {f.texto}
          </button>
        ))}
      </div>

      {/* ─── Filtro por grupo técnico: solo si hay más de uno este mes,
      elegir entre uno solo no aporta nada. ─── */}
      {grupos.length > 1 && (
        <div style={estilos.filtros}>
          <button
            onClick={() => setFiltroGrupo("")}
            style={{ ...estilos.filtro, ...(filtroGrupo === "" ? estilos.filtroActivo : {}) }}
          >
            Todos los grupos
          </button>
          {grupos.map((g) => (
            <button
              key={g}
              onClick={() => setFiltroGrupo(g)}
              style={{ ...estilos.filtro, ...(filtroGrupo === g ? estilos.filtroActivo : {}) }}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {error && <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>}

      {!cargando && !error && items.length === 0 && (
        <p style={estilos.mensaje}>
          No hay mantenimientos preventivos programados para {MESES[mes - 1].toLowerCase()} de {anio}.
        </p>
      )}

      {!cargando && !error && items.length > 0 && itemsFiltrados.length === 0 && (
        <p style={estilos.mensaje}>
          Ningún equipo coincide con el filtro.{" "}
          <button style={estilos.linkHoy} onClick={limpiarFiltros}>Limpiar filtros</button>
        </p>
      )}

      <div style={estilos.lista}>
        {itemsFiltrados.map((item) => (
          <div
            key={item.activo_codigo}
            className={sePuedeAbrir(item) ? "sy-clickeable" : undefined}
            style={estilos.tarjeta}
            onClick={sePuedeAbrir(item) ? () => irAlItem(item) : undefined}
          >
            <div style={{ minWidth: 0 }}>
              <p style={estilos.titulo}>{item.activo_descripcion}</p>
              <p style={estilos.codigo}>
                {item.activo_codigo}
                {item.activo_ubicacion ? ` · ${item.activo_ubicacion}` : ""}
                {item.grupo_id ? ` · ${item.grupo_id}` : ""}
              </p>
            </div>
            <span style={insignia(item.generada ? tonoEstadoOT(item.estado) : "neutro")}>
              {item.generada ? `OT-${String(item.numero_ot).padStart(4, "0")} · ${textoEstado(item.estado)}` : "Pronóstico"}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

// Mismo criterio de colores que la pantalla de Órdenes: azul = hay que
// hacerla, violeta = en curso, gris = terminada.
function tonoEstadoOT(estado) {
  if (estado === "CERRADA") return "apagado";
  if (estado === "PENDIENTE_CIERRE") return "advertencia";
  if (estado === "EN_PROGRESO") return "proceso";
  return "pendiente";
}

function textoEstado(estado) {
  const nombres = {
    ABIERTA: "Abierta",
    EN_PROGRESO: "En progreso",
    PENDIENTE_CIERRE: "Pendiente de cierre",
    CERRADA: "Cerrada",
  };
  return nombres[estado] || estado;
}

// ─── Gráfico de barras: carga de mantenimientos por mes ───
// Una sola serie (cantidad de mantenimientos), así que un solo color; el mes
// con más carga se resalta con el tono más oscuro de la misma familia (no un
// color distinto: sigue siendo la misma magnitud, solo que es el pico). Cada
// barra muestra su valor arriba (son pocos meses a la vez, entran todos sin
// amontonarse) y el eje Y va oculto: el valor en la barra ya lo reemplaza.
function GraficoCargaMensual({ datos, cargando, error }) {
  if (cargando) {
    return <p style={estilos.mensajeGrafico}>Calculando...</p>;
  }
  if (error) {
    return <p style={{ ...estilos.mensajeGrafico, color: color.peligro }}>{error}</p>;
  }
  if (datos.length === 0) {
    return <p style={estilos.mensajeGrafico}>Elegí un rango de meses válido.</p>;
  }

  const maxCantidad = Math.max(0, ...datos.map((d) => d.cantidad));
  const datosGrafico = datos.map((d) => ({
    ...d,
    etiqueta: `${MESES_ABREV[d.mes - 1]} ${String(d.anio).slice(2)}`,
    esPico: maxCantidad > 0 && d.cantidad === maxCantidad,
  }));
  const mesPico = datosGrafico.find((d) => d.esPico);

  return (
    <>
      {mesPico ? (
        <p style={estilos.resumenGrafico}>
          El mes con más carga en este rango es{" "}
          <strong>{MESES[mesPico.mes - 1]} {mesPico.anio}</strong>, con {mesPico.cantidad}{" "}
          {mesPico.cantidad === 1 ? "mantenimiento" : "mantenimientos"}.
        </p>
      ) : (
        <p style={estilos.resumenGrafico}>No hay mantenimientos programados en este rango.</p>
      )}

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={datosGrafico} margin={{ top: 22, right: 8, bottom: 4, left: 8 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={color.bordeSuave} />
          <XAxis
            dataKey="etiqueta"
            tickLine={false}
            axisLine={{ stroke: color.borde }}
            tick={{ fill: color.textoDebil, fontSize: 12 }}
          />
          {/* Oculto a propósito: cada barra ya lleva su valor arriba (LabelList),
          así que un eje numérico solo agregaría ruido sin sumar información. */}
          <YAxis hide domain={[0, "dataMax + 1"]} allowDecimals={false} />
          <Tooltip content={<TooltipGrafico />} cursor={{ fill: color.bordeSuave, opacity: 0.6 }} />
          <Bar dataKey="cantidad" radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false}>
            {datosGrafico.map((d, i) => (
              <Cell key={d.etiqueta + i} fill={d.esPico ? color.primarioOscuro : color.primario} />
            ))}
            <LabelList
              dataKey="cantidad"
              position="top"
              style={{ fill: color.textoSuave, fontSize: 12, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

// Tooltip propio (en vez del que trae Recharts por default) para que respete
// la tipografía y los colores de la app, y para que el valor sea lo
// destacado (negrita, arriba) y el mes quede como dato secundario abajo.
function TooltipGrafico({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div style={estilos.tooltip}>
      <p style={estilos.tooltipValor}>
        {d.cantidad} {d.cantidad === 1 ? "mantenimiento" : "mantenimientos"}
      </p>
      <p style={estilos.tooltipMes}>{MESES[d.mes - 1]} {d.anio}</p>
    </div>
  );
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "20px 0", lineHeight: 1.6 },
  // ─── Gráfico "carga de mantenimientos por mes" ───
  encabezadoGrafico: {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
    gap: 14, flexWrap: "wrap",
  },
  tituloGrafico: { margin: 0, fontSize: "1rem", color: color.texto, fontWeight: 700 },
  ayudaGrafico: { margin: "3px 0 0", fontSize: "0.8rem", color: color.textoSuave },
  controlesGrafico: { display: "flex", gap: 10, flexWrap: "wrap" },
  campoRango: { display: "flex", flexDirection: "column", gap: 3 },
  etiquetaRango: {
    fontSize: "0.7rem", fontWeight: 600, color: color.textoDebil,
    textTransform: "uppercase", letterSpacing: "0.03em",
  },
  inputMesRango: { ...cs.input, padding: "6px 8px", fontSize: "0.82rem", width: "auto" },
  mensajeGrafico: { color: color.textoSuave, padding: "16px 0", fontSize: "0.88rem" },
  resumenGrafico: { margin: "12px 0 0", fontSize: "0.85rem", color: color.textoSuave, lineHeight: 1.5 },
  tooltip: {
    background: color.tarjeta, border: `1px solid ${color.borde}`, borderRadius: 10,
    padding: "8px 12px", boxShadow: sombra.flotante,
  },
  tooltipValor: { margin: 0, fontSize: "0.88rem", fontWeight: 700, color: color.texto },
  tooltipMes: { margin: "2px 0 0", fontSize: "0.78rem", color: color.textoSuave },
  navegador: {
    display: "flex", alignItems: "center", gap: 10,
    marginBottom: 18, flexWrap: "wrap",
  },
  flecha: {
    ...cs.tarjeta, width: 36, height: 36, padding: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", color: color.texto,
  },
  mesActual: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, minWidth: 190 },
  mesTexto: { fontSize: "1.05rem", fontWeight: 700, color: color.texto },
  linkHoy: {
    background: "transparent", border: "none", cursor: "pointer",
    color: color.primario, fontSize: "0.8rem", fontWeight: 600,
    fontFamily: "inherit", padding: 0,
  },
  // Mismo aspecto que el buscador de Equipos/Órdenes, para que las tres
  // pantallas se sientan consistentes.
  campoBusqueda: {
    ...cs.input,
    display: "flex", alignItems: "center", gap: 9,
    padding: "0 12px", marginBottom: 12,
  },
  inputBusqueda: {
    flex: 1, border: "none", outline: "none", background: "transparent",
    fontFamily: "inherit", fontSize: "0.92rem", color: color.texto,
    padding: "11px 0", minWidth: 0,
  },
  limpiarBusqueda: {
    background: "transparent", border: "none", cursor: "pointer",
    color: color.textoDebil, display: "flex", padding: 2,
  },
  filtros: { display: "flex", gap: 7, marginBottom: 10, flexWrap: "wrap" },
  filtro: {
    padding: "6px 14px", borderRadius: 999,
    // Separadas y no el atajo `border`: mezclarlo con el `borderColor` de
    // filtroActivo hace que al desactivarse quede el borde oscuro.
    borderWidth: 1, borderStyle: "solid", borderColor: color.borde,
    background: color.tarjeta, color: color.textoSuave, fontSize: "0.83rem",
    cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
  },
  filtroActivo: {
    background: color.primarioClaro, color: color.primarioOscuro,
    borderColor: color.primarioClaro,
  },
  lista: { display: "flex", flexDirection: "column", gap: 10 },
  tarjeta: {
    ...cs.tarjeta, padding: "14px 18px",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  },
  titulo: { margin: 0, fontSize: "0.95rem", color: color.texto, fontWeight: 600 },
  codigo: {
    margin: "3px 0 0", fontSize: "0.8rem", color: color.textoSuave,
    fontFamily: "ui-monospace, monospace",
  },
};

export default CalendarioMP;