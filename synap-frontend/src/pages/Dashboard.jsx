// Dashboard.jsx — el panel de jefatura.
//
// Regla de toda esta pantalla: un indicador sin datos suficientes dice "sin
// datos", nunca cero. Un 0% de cumplimiento y un "todavía no hay preventivos
// cargados" significan cosas opuestas, y confundirlos lleva a decisiones malas
// sobre el parque de equipos.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Boxes, ClipboardList, ClipboardCheck, Timer, Wrench, TriangleAlert, ChevronRight, UserX, CalendarX } from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList,
} from "recharts";
import { obtenerKPIs } from "../api/dashboard";
import { opcionesDeFiltro } from "../api/activos";
import { resumenCalendario } from "../api/preventivas";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton, radio, sombra } from "../tema";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MESES_ABREV = MESES.map((m) => m.slice(0, 3));

// "YYYY-MM" a partir de un Date, y un Date desplazado "delta" meses — mismos
// helpers que usa CalendarioMP.jsx para pedirle al backend un rango de meses.
function formatoMes(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function sumarMesesFecha(d, delta) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

// Mismos 4 estados de OT que usa el resto de la app (ver CalendarioMP.jsx),
// con el mismo color que ya tienen sus pastillas (insignia() en tema.js) —
// así "abierta" es el mismo azul en el calendario, en Órdenes y acá.
const NOMBRE_ESTADO_OT = {
  ABIERTA: "Abierta",
  EN_PROGRESO: "En progreso",
  PENDIENTE_CIERRE: "Pendiente de cierre",
  CERRADA: "Cerrada",
};
const COLOR_ESTADO_OT = {
  ABIERTA: "#14538C",
  EN_PROGRESO: "#5A3E9E",
  PENDIENTE_CIERRE: color.advertencia,
  CERRADA: "#667085",
};

function Dashboard() {
  const navegar = useNavigate();
  const [kpis, setKpis] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // Filtro por grupo técnico / tipo de equipo: recalcula TODOS los KPIs solo
  // sobre los activos que matchean. Mismas opciones que usa la pantalla de
  // Activos, para no duplicar catálogos.
  const [opciones, setOpciones] = useState({ tipos: [], grupos: [] });
  const [filtros, setFiltros] = useState({ grupoId: "", tipoEquipoId: "" });
  const filtrosActivos = Object.values(filtros).filter(Boolean).length;

  // "Tipo de equipo" en cascada: si hay un grupo técnico elegido, el select
  // de tipo solo debe ofrecer los tipos que están a cargo de ESE grupo (cada
  // tipo tiene un único grupo dueño — ver grupo_tipo_equipo en el backend).
  // Sin grupo elegido, se ven todos los tipos como antes.
  const tiposDelGrupo = filtros.grupoId
    ? opciones.tipos.filter((t) => t.grupo_id === filtros.grupoId)
    : opciones.tipos;

  function elegirGrupo(grupoId) {
    // Si el tipo que ya estaba elegido no pertenece al grupo nuevo, se limpia
    // solo: dejarlo puesto mostraría un filtro imposible (0 resultados) sin
    // que se entienda por qué.
    const tiposValidos = grupoId
      ? opciones.tipos.filter((t) => t.grupo_id === grupoId).map((t) => t.id)
      : opciones.tipos.map((t) => t.id);
    setFiltros((f) => ({
      grupoId,
      tipoEquipoId: tiposValidos.includes(f.tipoEquipoId) ? f.tipoEquipoId : "",
    }));
  }

  // Filtro de mes: aparte de grupo/tipo porque no afecta a todo el panel,
  // solo a la tarjeta de cumplimiento de preventivos (ver dashboard.js).
  const [mesMP, setMesMP] = useState("");

  // ─── Mantenimientos planeados (próximos 6 meses) ───
  // Reutiliza el mismo endpoint que arma el gráfico del calendario
  // (/preventivas/calendario/resumen) — acá el rango queda fijo (mes actual
  // + 5 siguientes, sin selector propio) porque en el dashboard es una vista
  // resumen, no de planificación mes a mes. Si hay un grupo técnico elegido
  // arriba, el gráfico respeta ese mismo filtro (el de tipo de equipo no
  // aplica: el endpoint del calendario no lo soporta).
  const [resumenMeses, setResumenMeses] = useState([]);
  const [cargandoResumen, setCargandoResumen] = useState(true);
  const [errorResumen, setErrorResumen] = useState("");

  useEffect(() => {
    opcionesDeFiltro().then(setOpciones).catch(() => {});
  }, []);

  useEffect(() => {
    setCargando(true);
    setError("");
    obtenerKPIs({ ...filtros, mes: mesMP })
      .then(setKpis)
      .catch(() => setError("No pudimos cargar los indicadores."))
      .finally(() => setCargando(false));
  }, [filtros, mesMP]);

  useEffect(() => {
    const hoy = new Date();
    const desde = formatoMes(hoy);
    const hasta = formatoMes(sumarMesesFecha(hoy, 5));
    setCargandoResumen(true);
    setErrorResumen("");
    resumenCalendario(desde, hasta, filtros.grupoId)
      .then((res) => setResumenMeses(res.items))
      .catch(() => setErrorResumen("No pudimos calcular los mantenimientos planeados."))
      .finally(() => setCargandoResumen(false));
  }, [filtros.grupoId]);

  function limpiarFiltros() {
    setFiltros({ grupoId: "", tipoEquipoId: "" });
  }

  return (
    <>
      {/* Los filtros van DENTRO del encabezado (children = "acciones", a la
      derecha del título) en vez de en su propia tarjeta aparte: así no
      suman una fila entera de alto — comparten el renglón que ya existe. */}
      <Encabezado
        titulo="Panel de indicadores"
        subtitulo="Calculado en el momento, sobre los datos actuales"
      >
        <FiltroInline
          etiqueta="Grupo técnico"
          valor={filtros.grupoId}
          onChange={elegirGrupo}
          opciones={opciones.grupos}
        />
        <FiltroInline
          etiqueta="Tipo de equipo"
          valor={filtros.tipoEquipoId}
          onChange={(v) => setFiltros({ ...filtros, tipoEquipoId: v })}
          opciones={tiposDelGrupo}
        />
        {filtrosActivos > 0 && (
          <button style={{ ...boton("fantasma"), padding: "6px 10px", gap: 4 }} onClick={limpiarFiltros}>
            <X size={13} strokeWidth={2.2} aria-hidden="true" />
            Limpiar
          </button>
        )}
      </Encabezado>

      {cargando && <p style={estilos.mensaje}>Calculando indicadores...</p>}
      {!cargando && error && <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>}
      {!cargando && !error && kpis && (
        <>

      {/* ─── Fila 0: alertas y pendientes ─── */}
      {/* Va primero, antes que cualquier otro número: son las dos cosas que
      hay que atender YA (a diferencia del resto del panel, que es contexto
      general). Por eso estas tarjetas SÍ cambian de color según el dato —
      rojo si hay algo pendiente, verde si está todo al día — usan los
      colores de estado reservados (TONOS_TARJETA), no los acentos
      decorativos del resto del panel. */}
      <p style={estilos.subtituloFila}>Alertas y pendientes</p>
      <div style={estilos.filaAlertas}>
        <TarjetaAlerta
          icono={UserX}
          etiqueta="OT sin asignar"
          valor={kpis.ot_sin_asignar}
          notaOk="Todas las órdenes abiertas tienen técnico asignado."
          notaAlerta="Órdenes abiertas (correctivas o preventivas) sin técnico asignado todavía."
        />
        <TarjetaAlerta
          icono={CalendarX}
          etiqueta="Preventivos vencidos"
          valor={kpis.preventivos_vencidos}
          notaOk="No hay preventivos atrasados."
          notaAlerta="Preventivos cuyo mes programado ya pasó y todavía no se hicieron."
        />
      </div>

      {/* ─── Fila 1: el estado del parque hoy ─── */}
      <p style={estilos.subtituloFila}>Estado del parque hoy</p>
      <div style={estilos.grilla}>
        <Tarjeta
          icono={Boxes}
          acento="teal"
          etiqueta="Equipos registrados"
          valor={kpis.activos_totales}
          nota={kpis.activos_en_baja > 0 ? `${kpis.activos_en_baja} dados de baja` : null}
        />
        <Tarjeta
          icono={ClipboardList}
          acento="esmeralda"
          etiqueta="Órdenes abiertas"
          valor={kpis.ot_abiertas}
          nota={`de ${kpis.ot_totales} en total`}
          progreso={kpis.ot_totales > 0 ? { valor: kpis.ot_abiertas, total: kpis.ot_totales } : null}
        />
        <Tarjeta
          icono={ClipboardCheck}
          acento="azul"
          etiqueta="Cumplimiento de preventivos"
          valor={kpis.cumplimiento_mp_pct !== null ? `${kpis.cumplimiento_mp_pct}%` : null}
          nota={kpis.mp_totales > 0
            ? `${kpis.mp_realizados} de ${kpis.mp_totales} realizados${mesMP ? " ese mes" : ""}`
            : (mesMP ? "Sin preventivos programados ese mes" : "No hay preventivos cargados")}
          progreso={kpis.cumplimiento_mp_pct !== null ? { valor: kpis.cumplimiento_mp_pct, total: 100 } : null}
          extra={
            <div style={estilos.filtroMes}>
              <input
                type="month"
                value={mesMP}
                onChange={(e) => setMesMP(e.target.value)}
                style={estilos.inputMes}
              />
              {mesMP && (
                <button
                  style={estilos.botonLimpiarMes}
                  onClick={() => setMesMP("")}
                  aria-label="Quitar filtro de mes"
                  title="Quitar filtro de mes"
                >
                  <X size={13} strokeWidth={2.2} aria-hidden="true" />
                </button>
              )}
            </div>
          }
        />
      </div>

      {/* ─── Fila 2: los tiempos ─── */}
      <p style={estilos.subtituloFila}>Tiempos y desempeño</p>
      <div style={estilos.grilla}>
        <Tarjeta
          icono={Timer}
          acento="cian"
          etiqueta="Tiempo fuera de servicio"
          valor={kpis.inactividad_promedio_dias !== null ? `${kpis.inactividad_promedio_dias} d` : null}
          nota={kpis.correctivas_evaluadas > 0
            ? `Promedio sobre ${kpis.correctivas_evaluadas} correctivas (parada medida)`
            : "Ninguna correctiva con tiempo de parada medido todavía"}
        />
        <Tarjeta
          icono={Wrench}
          acento="lila"
          etiqueta="Tiempo medio de reparación"
          valor={kpis.mttr_dias !== null ? `${kpis.mttr_dias} d` : null}
          nota={kpis.ot_cerradas > 0 ? `Sobre ${kpis.ot_cerradas} órdenes cerradas` : "Sin órdenes cerradas"}
        />
        <Tarjeta
          icono={TriangleAlert}
          acento="ciruela"
          etiqueta="Fallas registradas"
          valor={kpis.fallas_totales}
          nota={kpis.fallas_por_tipo.length > 0
            ? `${kpis.fallas_por_tipo.length} tipos distintos`
            : "Sin fallas registradas"}
        />
      </div>

      {/* ─── Fila 3: estado y carga de trabajo actual ─── */}
      <p style={estilos.subtituloFila}>Estado y carga de trabajo</p>
      <div style={estilos.filaGraficos}>
        <div style={{ ...cs.tarjeta, padding: "18px 20px" }}>
          <p style={estilos.tituloGrafico}>OT por estado</p>
          <p style={estilos.ayudaGrafico}>Todas las órdenes de trabajo del sistema, sin importar el filtro de mes.</p>
          <GraficoTortaEstados datos={kpis.ot_por_estado} />
        </div>
        <div style={{ ...cs.tarjeta, padding: "18px 20px" }}>
          <p style={estilos.tituloGrafico}>Carga laboral por grupo</p>
          <p style={estilos.ayudaGrafico}>OT abiertas ahora mismo (no cerradas), por grupo técnico.</p>
          <GraficoCargaGrupo datos={kpis.carga_por_grupo} />
        </div>
      </div>

      {/* ─── Fila 4: mantenimientos planeados ─── */}
      <div style={{ ...cs.tarjeta, padding: "18px 20px", marginTop: 14 }}>
        <p style={estilos.tituloGrafico}>Mantenimientos planeados</p>
        <p style={estilos.ayudaGrafico}>
          Preventivos generados + pronóstico, mes a mes (hoy y los 5 meses siguientes).
        </p>
        <GraficoProximosMP datos={resumenMeses} cargando={cargandoResumen} error={errorResumen} />
      </div>

      {/* ─── Fila 5: fallas por trimestre ─── */}
      <div style={{ ...cs.tarjeta, padding: "18px 20px", marginTop: 14 }}>
        <p style={estilos.tituloGrafico}>Fallas por trimestre</p>
        <p style={estilos.ayudaGrafico}>Últimos 4 trimestres, incluido el actual.</p>
        <GraficoFallasTrimestre datos={kpis.fallas_por_trimestre} />
      </div>

      {/* ─── Los equipos que más problemas dan ─── */}
      <Seccion
        titulo="Equipos con más fallas"
        ayuda="Los que más veces se reportaron. Son los candidatos a revisar o reemplazar. Tocá uno para ir a su ficha."
      >
        {kpis.fallas_por_equipo.length === 0 && (
          <p style={estilos.vacio}>Todavía no hay fallas registradas.</p>
        )}
        {kpis.fallas_por_equipo.map((f) => (
          <Barra
            key={f.activo_codigo}
            etiqueta={f.activo_codigo}
            valor={f.cantidad}
            maximo={kpis.fallas_por_equipo[0].cantidad}
            sufijo={f.cantidad === 1 ? "falla" : "fallas"}
            onClick={() => navegar(`/activos/${f.activo_codigo}`)}
          />
        ))}
      </Seccion>

      <Seccion
        titulo="Tipos de falla más frecuentes"
        ayuda="Sirve para detectar si el problema es del equipo o del uso que se le da."
      >
        {kpis.fallas_por_tipo.length === 0 && (
          <p style={estilos.vacio}>Todavía no hay fallas clasificadas.</p>
        )}
        {kpis.fallas_por_tipo.map((f) => (
          <Barra
            key={f.tipo_falla}
            etiqueta={f.tipo_falla === "SIN_TIPO" ? "Sin clasificar" : f.tipo_falla}
            valor={f.cantidad}
            maximo={kpis.fallas_por_tipo[0].cantidad}
            sufijo={f.cantidad === 1 ? "vez" : "veces"}
          />
        ))}
      </Seccion>

      {/* MTBF necesita al menos dos fallas del mismo equipo para existir: con
      una sola no hay ningún intervalo que medir. Por eso esta sección puede
      estar vacía aunque haya fallas registradas. */}
      <Seccion
        titulo="Equipos menos confiables"
        ayuda="Menos días entre fallas = falla más seguido. Necesita al menos dos fallas del mismo equipo para poder calcularse. Tocá uno para ir a su ficha."
      >
        {kpis.mtbf_por_equipo.length === 0 && (
          <p style={estilos.vacio}>
            Todavía no hay ningún equipo con dos fallas o más, así que no se puede
            medir cada cuánto fallan.
          </p>
        )}
        {kpis.mtbf_por_equipo.slice(0, 8).map((m) => (
          <div
            key={m.clave}
            style={{ ...estilos.filaMtbf, ...estilos.filaClickeable }}
            className="sy-clickeable"
            onClick={() => navegar(`/activos/${m.clave}`)}
          >
            <span style={estilos.mtbfClave}>{m.clave}</span>
            <span style={estilos.filaValorConFlecha}>
              <span style={estilos.mtbfDato}>
                cada {m.mtbf_dias} días
                <span style={estilos.mtbfNota}> · {m.cantidad_fallas} fallas</span>
              </span>
              <ChevronRight size={15} strokeWidth={2} color={color.textoDebil} aria-hidden="true" />
            </span>
          </div>
        ))}
      </Seccion>
        </>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────

// acentos: color DECORATIVO fijo para cada una de las 6 tarjetas (ninguna
// cambia de color según el dato — ver historial más abajo). Todas comparten
// la misma receta (tono saturado + fondo pastel clarito) así se leen como
// una familia, pero cada una tiene su propio matiz para que el panel no se
// vea monocromático. Elegidos dentro de la gama azul/verde/lila que pidió
// Cami (28/09), evitando los matices que el resto de la pantalla ya usa con
// otro significado: el azul/violeta de la torta de OT por estado (calcado
// de las pastillas insignia()) — así ningún color de acá se confunde con un
// semáforo de estado.
//
// Historial de este esquema: primero cada tarjeta tenía un color suelto sin
// un criterio en común y no "pegaban" entre sí. Se probó unificar las 5
// decorativas en un solo verde agua, pero un panel con 5 tarjetas idénticas
// se ve raro también. Se pasó a 5 matices distintos de una misma receta —
// mejor, pero "Cumplimiento de preventivos" seguía aparte, con semáforo
// verde/ámbar/rojo según el %. Cami pidió sacar ese naranja y llevar todo a
// azules/verdes/lilas: "Cumplimiento" pasó a tener también un acento FIJO
// (azul) en vez de semáforo — el % y la barra de progreso ya alcanzan para
// ver si está bien o mal, no hace falta que cambie el color de fondo.
const ACENTOS = {
  // Equipos registrados: el verde agua de la marca (color "ancla" del panel).
  teal: { fg: color.primario, bg: color.primarioClaro },
  // Órdenes abiertas: verde esmeralda, primo cercano del teal de marca.
  esmeralda: { fg: "#0D9488", bg: "#D7F3EF" },
  // Cumplimiento de preventivos: azul.
  azul: { fg: "#273A9B", bg: "#E7E9F3" },
  // Tiempo fuera de servicio: cian.
  cian: { fg: "#0E7490", bg: "#D9F1F5" },
  // Tiempo medio de reparación: lila.
  lila: { fg: "#8930A6", bg: "#F0E7F3" },
  // Fallas registradas: ciruela (el matiz más cercano al rojo del grupo,
  // pero sin serlo — sigue siendo violeta/magenta, no naranja ni rojo puro).
  ciruela: { fg: "#9E2E82", bg: "#F3E7F0" },
};

// Alto de tarjeta compartido por las 6 (ver comentario en Tarjeta).
const ALTURA_TARJETA = 176;

function Tarjeta({ etiqueta, valor, nota, acento, extra, icono: Icono, progreso }) {
  // valor null = no hay datos suficientes. Distinto de valor 0.
  const sinDatos = valor === null || valor === undefined;
  const paleta = ACENTOS[acento] || { fg: color.primario, bg: color.primarioClaro };
  const pctProgreso = progreso && progreso.total > 0
    ? Math.max(0, Math.min(100, Math.round((progreso.valor / progreso.total) * 100)))
    : null;

  return (
    <div style={{
      ...cs.tarjeta,
      padding: 14,
      // Alto fijo: todas las tarjetas miden lo mismo aunque tengan menos
      // contenido (ej. "Equipos registrados" no tiene nota ni barra). El
      // valor es el alto que necesita la más cargada de todas ("Cumplimiento
      // de preventivos", que suma nota + barra + selector de mes).
      minHeight: ALTURA_TARJETA,
      // Tarjeta pintada entera con su color (no solo una tira): así se ve
      // colorido de un vistazo, sin salir de los tonos que ya usa el resto
      // de la app (los mismos de las pastillas de estado/insignia()).
      background: sinDatos ? color.fondo : paleta.bg,
      border: `1px solid ${sinDatos ? color.borde : paleta.fg + "2E"}`,
      borderTopWidth: 3,
      borderTopStyle: "solid",
      borderTopColor: sinDatos ? color.bordeSuave : paleta.fg,
    }}>
      <div style={estilos.cabeceraTarjeta}>
        <p style={estilos.etiqueta}>{etiqueta}</p>
        {Icono && (
          <span style={{
            ...estilos.iconoBadge,
            background: sinDatos ? color.textoDebil : paleta.fg,
            color: "#fff",
          }}>
            <Icono size={15} strokeWidth={2.1} aria-hidden="true" />
          </span>
        )}
      </div>
      <p style={{
        ...estilos.valor,
        color: sinDatos ? color.textoDebil : paleta.fg,
        fontSize: sinDatos ? "1.05rem" : "1.8rem",
      }}>
        {sinDatos ? "Sin datos" : valor}
      </p>
      {nota && <p style={estilos.nota}>{nota}</p>}
      {pctProgreso !== null && (
        <div style={{ ...estilos.barraFondo, marginTop: 8, background: "rgba(255,255,255,0.6)" }}>
          <div style={{ ...estilos.barraRelleno, width: `${pctProgreso}%`, background: paleta.fg }} />
        </div>
      )}
      {extra}
    </div>
  );
}

// Tarjeta de alerta: a diferencia de Tarjeta (arriba), esta SÍ cambia de
// color según el dato — rojo si valor > 0 (hay algo pendiente), verde si
// valor es 0 ("todo al día"). Usa los colores de ESTADO reservados
// (exito/peligro de tema.js), no los acentos decorativos del resto del
// panel: acá el color es información real, no solo prolijidad visual.
function TarjetaAlerta({ icono: Icono, etiqueta, valor, notaOk, notaAlerta }) {
  const hayAlerta = valor > 0;
  const paleta = hayAlerta
    ? { fg: color.peligro, bg: color.peligroFondo }
    : { fg: color.exito, bg: color.exitoFondo };
  return (
    <div style={{
      ...cs.tarjeta,
      padding: 14,
      display: "flex",
      alignItems: "center",
      gap: 12,
      background: paleta.bg,
      border: `1px solid ${paleta.fg}2E`,
    }}>
      <span style={{ ...estilos.iconoBadge, width: 36, height: 36, flexShrink: 0, background: paleta.fg, color: "#fff" }}>
        <Icono size={18} strokeWidth={2.1} aria-hidden="true" />
      </span>
      <div>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "1.5rem", color: paleta.fg, lineHeight: 1.1 }}>{valor}</p>
        <p style={{ ...estilos.etiqueta, margin: "2px 0 0" }}>{etiqueta}</p>
        <p style={{ ...estilos.nota, margin: "2px 0 0" }}>{hayAlerta ? notaAlerta : notaOk}</p>
      </div>
    </div>
  );
}

// Filtro en una sola línea (etiqueta y select, uno al lado del otro) para
// que entre como "acción" del encabezado, junto al título de la pantalla,
// en vez de ocupar una tarjeta propia con una fila entera de alto.
function FiltroInline({ etiqueta, valor, onChange, opciones }) {
  return (
    <label style={estilos.filtroInline}>
      <span style={estilos.filtroInlineTexto}>{etiqueta}</span>
      <select style={estilos.selectFiltro} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todos</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>{o.nombre}</option>
        ))}
      </select>
    </label>
  );
}

function Seccion({ titulo, ayuda, children }) {
  return (
    <div style={{ ...cs.tarjeta, padding: 20, marginTop: 14 }}>
      <p style={estilos.tituloSeccion}>{titulo}</p>
      {ayuda && <p style={estilos.ayuda}>{ayuda}</p>}
      <div style={{ marginTop: 14 }}>{children}</div>
    </div>
  );
}

// Barra horizontal proporcional al máximo de la lista. Sin librería de
// gráficos: es una barra de ancho variable y alcanza. Si viene onClick, la
// fila se vuelve clickeable (mismo efecto hover que el resto de la app) y
// suma una flechita como pista visual de que lleva a algún lado.
function Barra({ etiqueta, valor, maximo, sufijo, onClick }) {
  const ancho = maximo > 0 ? Math.round((valor / maximo) * 100) : 0;
  return (
    <div
      style={onClick ? { ...estilos.filaBarra, ...estilos.filaClickeable } : estilos.filaBarra}
      className={onClick ? "sy-clickeable" : undefined}
      onClick={onClick}
    >
      <div style={estilos.barraCabecera}>
        <span style={estilos.barraEtiqueta}>{etiqueta}</span>
        <span style={estilos.filaValorConFlecha}>
          <span style={estilos.barraValor}>{valor} {sufijo}</span>
          {onClick && <ChevronRight size={14} strokeWidth={2} color={color.textoDebil} aria-hidden="true" />}
        </span>
      </div>
      <div style={estilos.barraFondo}>
        <div style={{ ...estilos.barraRelleno, width: `${ancho}%` }} />
      </div>
    </div>
  );
}

// ─── Torta: OT por estado ───
// Pocas categorías (4 como mucho) con colores de ESTADO reservados (los
// mismos que ya usan las pastillas insignia() en el resto de la app): nunca
// se reciclan para otra cosa. Dona con el total en el centro (así el número
// grande no compite con las porciones) + leyenda abajo con nombre y cantidad
// de cada una — con 2 o más categorías, la leyenda siempre va.
function GraficoTortaEstados({ datos }) {
  if (!datos || datos.length === 0) {
    return <p style={estilos.mensajeGrafico}>Todavía no hay OT cargadas.</p>;
  }
  const total = datos.reduce((acc, d) => acc + d.cantidad, 0);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: 160, height: 160, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={datos}
              dataKey="cantidad"
              nameKey="estado"
              innerRadius={52}
              outerRadius={78}
              paddingAngle={2}
              stroke={color.tarjeta}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {datos.map((d) => (
                <Cell key={d.estado} fill={COLOR_ESTADO_OT[d.estado] || color.textoDebil} />
              ))}
            </Pie>
            <Tooltip content={<TooltipTorta total={total} />} />
          </PieChart>
        </ResponsiveContainer>
        <div style={estilos.centroTorta}>
          <span style={estilos.centroTortaValor}>{total}</span>
          <span style={estilos.centroTortaEtiqueta}>{total === 1 ? "OT" : "OTs"}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {datos.map((d) => (
          <div key={d.estado} style={estilos.filaLeyenda}>
            <span style={{ ...estilos.puntoLeyenda, background: COLOR_ESTADO_OT[d.estado] || color.textoDebil }} />
            <span style={estilos.leyendaTexto}>{NOMBRE_ESTADO_OT[d.estado] || d.estado}</span>
            <span style={estilos.leyendaValor}>{d.cantidad}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TooltipTorta({ active, payload, total }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  const pct = total > 0 ? Math.round((d.cantidad / total) * 100) : 0;
  return (
    <div style={estilos.tooltip}>
      <p style={estilos.tooltipValor}>{d.cantidad} {d.cantidad === 1 ? "OT" : "OTs"} ({pct}%)</p>
      <p style={estilos.tooltipEtiqueta}>{NOMBRE_ESTADO_OT[d.estado] || d.estado}</p>
    </div>
  );
}

// Nombres de grupo largos ("Quirófano, anestesia y cirugía") no entran en el
// ancho fijo del eje: por default Recharts los corta a la fuerza en varias
// líneas, y con filas tan bajas terminan pisando al grupo de al lado (bug
// reportado por Cami el 28/09). En vez de agrandar el alto sin límite para
// cada nombre largo, se trunca a una sola línea con "…" — el nombre
// completo sigue disponible en el tooltip al pasar el mouse.
const LARGO_MAXIMO_ETIQUETA_GRUPO = 20;
function truncarNombreGrupo(nombre) {
  return nombre.length > LARGO_MAXIMO_ETIQUETA_GRUPO
    ? `${nombre.slice(0, LARGO_MAXIMO_ETIQUETA_GRUPO - 1)}…`
    : nombre;
}

// ─── Barras horizontales: carga laboral por grupo ───
// Una sola serie (cantidad de OT abiertas), un solo color — el grupo con más
// carga (el primero: el backend ya lo manda ordenado de mayor a menor) se
// resalta más oscuro, mismo criterio que el gráfico de "carga por mes" del
// calendario. Horizontal porque los nombres de grupo no siempre entran
// cortos, y así no hace falta rotar ningún texto para que se lean.
function GraficoCargaGrupo({ datos }) {
  if (!datos || datos.length === 0) {
    return <p style={estilos.mensajeGrafico}>No hay OT abiertas en este momento.</p>;
  }
  const maxCantidad = datos[0].cantidad;
  const alto = Math.max(120, datos.length * 34);

  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart
        data={datos}
        layout="vertical"
        margin={{ top: 4, right: 28, bottom: 4, left: 4 }}
        barCategoryGap="28%"
      >
        <XAxis type="number" hide domain={[0, "dataMax + 1"]} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="grupo_nombre"
          width={132}
          tickLine={false}
          axisLine={false}
          tickFormatter={truncarNombreGrupo}
          tick={{ fill: color.texto, fontSize: 12 }}
        />
        <Tooltip content={<TooltipCargaGrupo />} cursor={{ fill: color.bordeSuave, opacity: 0.6 }} />
        <Bar dataKey="cantidad" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
          {datos.map((d) => (
            <Cell key={d.grupo_id} fill={d.cantidad === maxCantidad ? color.primarioOscuro : color.primario} />
          ))}
          <LabelList
            dataKey="cantidad"
            position="right"
            style={{ fill: color.textoSuave, fontSize: 12, fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TooltipCargaGrupo({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div style={estilos.tooltip}>
      <p style={estilos.tooltipValor}>{d.cantidad} {d.cantidad === 1 ? "OT abierta" : "OTs abiertas"}</p>
      <p style={estilos.tooltipEtiqueta}>{d.grupo_nombre}</p>
    </div>
  );
}

// ─── Barras: mantenimientos planeados (próximos meses) ───
// Mismo diseño que el gráfico "carga por mes" de CalendarioMP.jsx (una sola
// serie, mes con más carga resaltado, valor directo arriba de cada barra,
// eje Y oculto), repetido acá porque esta pantalla vive en un archivo aparte.
function GraficoProximosMP({ datos, cargando, error }) {
  if (cargando) {
    return <p style={estilos.mensajeGrafico}>Calculando...</p>;
  }
  if (error) {
    return <p style={{ ...estilos.mensajeGrafico, color: color.peligro }}>{error}</p>;
  }
  if (!datos || datos.length === 0 || datos.every((d) => d.cantidad === 0)) {
    return <p style={estilos.mensajeGrafico}>No hay mantenimientos planeados en los próximos meses.</p>;
  }

  const maxCantidad = Math.max(0, ...datos.map((d) => d.cantidad));
  const datosGrafico = datos.map((d) => ({
    ...d,
    etiqueta: `${MESES_ABREV[d.mes - 1]} ${String(d.anio).slice(2)}`,
    esPico: maxCantidad > 0 && d.cantidad === maxCantidad,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={datosGrafico} margin={{ top: 22, right: 8, bottom: 4, left: 8 }} barCategoryGap="30%">
        <XAxis
          dataKey="etiqueta"
          tickLine={false}
          axisLine={{ stroke: color.borde }}
          tick={{ fill: color.textoDebil, fontSize: 12 }}
        />
        <YAxis hide domain={[0, "dataMax + 1"]} allowDecimals={false} />
        <Tooltip content={<TooltipProximosMP />} cursor={{ fill: color.bordeSuave, opacity: 0.6 }} />
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
  );
}

function TooltipProximosMP({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div style={estilos.tooltip}>
      <p style={estilos.tooltipValor}>{d.cantidad} {d.cantidad === 1 ? "mantenimiento" : "mantenimientos"}</p>
      <p style={estilos.tooltipEtiqueta}>{MESES[d.mes - 1]} {d.anio}</p>
    </div>
  );
}

// ─── Barras: fallas por trimestre (últimos 4) ───
// Mismo diseño que "Mantenimientos planeados" (una sola serie, el trimestre
// con más fallas resaltado, valor arriba de cada barra) — el backend ya
// manda siempre los 4 trimestres, aunque alguno tenga 0.
function GraficoFallasTrimestre({ datos }) {
  if (!datos || datos.length === 0 || datos.every((d) => d.cantidad === 0)) {
    return <p style={estilos.mensajeGrafico}>No hay fallas registradas en los últimos trimestres.</p>;
  }

  const maxCantidad = Math.max(0, ...datos.map((d) => d.cantidad));
  const datosGrafico = datos.map((d) => ({
    ...d,
    etiqueta: `T${d.trimestre} '${String(d.anio).slice(2)}`,
    esPico: maxCantidad > 0 && d.cantidad === maxCantidad,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={datosGrafico} margin={{ top: 22, right: 8, bottom: 4, left: 8 }} barCategoryGap="30%">
        <XAxis
          dataKey="etiqueta"
          tickLine={false}
          axisLine={{ stroke: color.borde }}
          tick={{ fill: color.textoDebil, fontSize: 12 }}
        />
        <YAxis hide domain={[0, "dataMax + 1"]} allowDecimals={false} />
        <Tooltip content={<TooltipFallasTrimestre />} cursor={{ fill: color.bordeSuave, opacity: 0.6 }} />
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
  );
}

function TooltipFallasTrimestre({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div style={estilos.tooltip}>
      <p style={estilos.tooltipValor}>{d.cantidad} {d.cantidad === 1 ? "falla" : "fallas"}</p>
      <p style={estilos.tooltipEtiqueta}>Trimestre {d.trimestre} de {d.anio}</p>
    </div>
  );
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "18px 0" },
  // ─── Gráficos nuevos: torta de estados, carga por grupo, próximos MP ───
  filaGraficos: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 10,
    marginBottom: 12,
  },
  // ─── Alertas y pendientes (Fila 0) ───
  filaAlertas: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 10,
    marginBottom: 12,
  },
  tituloGrafico: { margin: 0, fontSize: "1rem", color: color.texto, fontWeight: 700 },
  ayudaGrafico: { margin: "3px 0 14px", fontSize: "0.8rem", color: color.textoSuave },
  mensajeGrafico: { color: color.textoSuave, padding: "16px 0", fontSize: "0.88rem" },
  centroTorta: {
    position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
    display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none",
  },
  centroTortaValor: { fontSize: "1.6rem", fontWeight: 700, color: color.texto, lineHeight: 1.1 },
  centroTortaEtiqueta: { fontSize: "0.72rem", color: color.textoDebil, textTransform: "uppercase", letterSpacing: "0.03em" },
  filaLeyenda: { display: "flex", alignItems: "center", gap: 8 },
  puntoLeyenda: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  leyendaTexto: { fontSize: "0.85rem", color: color.texto, minWidth: 130 },
  leyendaValor: { fontSize: "0.85rem", color: color.textoSuave, fontWeight: 600 },
  tooltip: {
    background: color.tarjeta, border: `1px solid ${color.borde}`, borderRadius: 10,
    padding: "8px 12px", boxShadow: sombra.flotante,
  },
  tooltipValor: { margin: 0, fontSize: "0.88rem", fontWeight: 700, color: color.texto },
  tooltipEtiqueta: { margin: "2px 0 0", fontSize: "0.78rem", color: color.textoSuave },
  filtroInline: {
    display: "flex", alignItems: "center", gap: 6,
  },
  filtroInlineTexto: {
    fontSize: "0.72rem", fontWeight: 600, color: color.textoSuave,
    textTransform: "uppercase", letterSpacing: "0.02em", whiteSpace: "nowrap",
  },
  // Ancho FIJO (no "auto"): un <select> sin ancho fijo se estira solo al
  // ancho de su opción más larga (algunos grupos/tipos tienen nombres
  // largos), y eso era lo que estaba empujando los filtros a una segunda
  // línea aunque el título y los filtros por separado entraran de sobra.
  // Con ancho fijo, si el nombre no entra, se corta con "…" adentro del
  // propio select en vez de agrandarlo.
  selectFiltro: {
    ...cs.input, width: 150, padding: "6px 10px", fontSize: "0.82rem",
    textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap",
  },
  subtituloFila: {
    margin: "0 0 6px", fontSize: "0.78rem", color: color.textoDebil,
    textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700,
  },
  grilla: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 10,
    marginBottom: 12,
    // Sin "alignItems: start": queremos el "stretch" por default de grid,
    // para que si alguna nota ocupa dos líneas la tarjeta se estire igual
    // que sus vecinas de esa fila. El alto base parejo lo pone
    // ALTURA_TARJETA en el propio componente Tarjeta (ver Dashboard()).
  },
  cabeceraTarjeta: {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8,
  },
  iconoBadge: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 28, height: 28, borderRadius: radio.chico, flexShrink: 0,
  },
  etiqueta: {
    margin: 0, fontSize: "0.73rem", color: color.textoDebil,
    textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 600,
  },
  valor: { margin: "6px 0 0", fontWeight: 700, lineHeight: 1.1 },
  nota: { margin: "4px 0 0", fontSize: "0.78rem", color: color.textoSuave },
  filtroMes: { display: "flex", alignItems: "center", gap: 6, marginTop: 10 },
  inputMes: {
    ...cs.input, padding: "6px 8px", fontSize: "0.8rem", width: "auto",
  },
  botonLimpiarMes: {
    background: "transparent", border: "none", cursor: "pointer",
    color: color.textoDebil, display: "flex", padding: 2,
  },
  tituloSeccion: { margin: 0, fontSize: "1rem", color: color.texto, fontWeight: 700 },
  ayuda: { margin: "4px 0 0", fontSize: "0.8rem", color: color.textoSuave, lineHeight: 1.5 },
  vacio: { color: color.textoSuave, fontSize: "0.87rem", margin: 0, lineHeight: 1.5 },
  filaBarra: { marginBottom: 11 },
  filaClickeable: { padding: "8px 10px", borderRadius: radio.chico, marginLeft: -10, marginRight: -10 },
  barraCabecera: { display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 },
  barraEtiqueta: { fontSize: "0.83rem", color: color.texto, fontFamily: "ui-monospace, monospace" },
  filaValorConFlecha: { display: "flex", alignItems: "center", gap: 4 },
  barraValor: { fontSize: "0.79rem", color: color.textoSuave, whiteSpace: "nowrap" },
  barraFondo: { height: 7, background: color.bordeSuave, borderRadius: 999, overflow: "hidden" },
  barraRelleno: { height: "100%", background: color.primario, borderRadius: 999 },
  filaMtbf: {
    display: "flex", justifyContent: "space-between", gap: 12,
    padding: "8px 0", borderBottom: `1px solid ${color.bordeSuave}`,
  },
  mtbfClave: { fontSize: "0.85rem", color: color.texto, fontFamily: "ui-monospace, monospace" },
  mtbfDato: { fontSize: "0.85rem", color: color.texto, whiteSpace: "nowrap" },
  mtbfNota: { color: color.textoDebil, fontSize: "0.79rem" },
};

export default Dashboard;