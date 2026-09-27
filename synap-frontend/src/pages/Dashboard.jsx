// Dashboard.jsx — el panel de jefatura.
//
// Regla de toda esta pantalla: un indicador sin datos suficientes dice "sin
// datos", nunca cero. Un 0% de cumplimiento y un "todavía no hay preventivos
// cargados" significan cosas opuestas, y confundirlos lleva a decisiones malas
// sobre el parque de equipos.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Boxes, ClipboardList, ClipboardCheck, Timer, Wrench, TriangleAlert, ChevronRight } from "lucide-react";
import { obtenerKPIs } from "../api/dashboard";
import { opcionesDeFiltro } from "../api/activos";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton, radio } from "../tema";

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
          acento="naranja"
          etiqueta="Órdenes abiertas"
          valor={kpis.ot_abiertas}
          nota={`de ${kpis.ot_totales} en total`}
          progreso={kpis.ot_totales > 0 ? { valor: kpis.ot_abiertas, total: kpis.ot_totales } : null}
        />
        <Tarjeta
          icono={ClipboardCheck}
          etiqueta="Cumplimiento de preventivos"
          valor={kpis.cumplimiento_mp_pct !== null ? `${kpis.cumplimiento_mp_pct}%` : null}
          nota={kpis.mp_totales > 0
            ? `${kpis.mp_realizados} de ${kpis.mp_totales} realizados${mesMP ? " ese mes" : ""}`
            : (mesMP ? "Sin preventivos programados ese mes" : "No hay preventivos cargados")}
          tono={tonoCumplimiento(kpis.cumplimiento_mp_pct)}
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
          acento="azul"
          etiqueta="Tiempo fuera de servicio"
          valor={kpis.inactividad_promedio_dias !== null ? `${kpis.inactividad_promedio_dias} d` : null}
          nota={kpis.correctivas_evaluadas > 0
            ? `Promedio sobre ${kpis.correctivas_evaluadas} correctivas (parada medida)`
            : "Ninguna correctiva con tiempo de parada medido todavía"}
        />
        <Tarjeta
          icono={Wrench}
          acento="violeta"
          etiqueta="Tiempo medio de reparación"
          valor={kpis.mttr_dias !== null ? `${kpis.mttr_dias} d` : null}
          nota={kpis.ot_cerradas > 0 ? `Sobre ${kpis.ot_cerradas} órdenes cerradas` : "Sin órdenes cerradas"}
        />
        <Tarjeta
          icono={TriangleAlert}
          acento="rosa"
          etiqueta="Fallas registradas"
          valor={kpis.fallas_totales}
          nota={kpis.fallas_por_tipo.length > 0
            ? `${kpis.fallas_por_tipo.length} tipos distintos`
            : "Sin fallas registradas"}
        />
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

// Verde arriba de 90, ámbar entre 70 y 90, rojo abajo. Son umbrales que
// pusimos nosotras: confirmalos con Bioingeniería antes de la defensa.
function tonoCumplimiento(pct) {
  if (pct === null || pct === undefined) return null;
  if (pct >= 90) return "exito";
  if (pct >= 70) return "advertencia";
  return "peligro";
}

// tonos: color de ESTADO (reservado — nunca se reusa para otra cosa que no
// sea "bien/atención/mal"). Ahora SOLO lo usa "Cumplimiento de preventivos":
// es la única tarjeta que mide algo contra un umbral que de verdad importa
// mirar de un vistazo. "Órdenes abiertas" antes también usaba este mismo
// ámbar/verde y, como casi siempre hay alguna orden abierta, terminaba
// pintada del mismo color que "Cumplimiento" cuando ese también estaba en
// alerta (72,9% cae en el mismo rango que "hay órdenes abiertas") — dos
// tarjetas distintas con el mismo color. Por eso "Órdenes abiertas" pasó a
// tener su propio acento fijo (ver ACENTOS, "naranja"), y así entre las 6
// tarjetas nunca se repite un color.
const TONOS_TARJETA = {
  exito: { fg: "#15803D", bg: "#DCFCE7" },
  advertencia: { fg: "#B45309", bg: "#FEF3C7" },
  peligro: { fg: "#DC2626", bg: "#FEE2E2" },
};

// acentos: color puramente DECORATIVO para las tarjetas que son un conteo
// (no un estado — más equipos registrados no es "bueno" ni "malo"). Paleta
// de jewel tones (el mismo estilo saturado que los TONOS_TARJETA de arriba,
// para que todo el panel se vea parejo). Cada tarjeta decorativa tiene un
// color FIJO propio (no depende de ningún umbral), así entre estas 5 más la
// de estado (Cumplimiento) siempre hay 6 colores distintos en pantalla.
const ACENTOS = {
  teal: { fg: color.primario, bg: color.primarioClaro },
  naranja: { fg: "#EA580C", bg: "#FFEDD5" },
  azul: { fg: "#2563EB", bg: "#DBEAFE" },
  violeta: { fg: "#7C3AED", bg: "#EDE9FE" },
  rosa: { fg: "#DB2777", bg: "#FCE7F3" },
};

// Alto de tarjeta compartido por las 6 (ver comentario en Tarjeta).
const ALTURA_TARJETA = 176;

function Tarjeta({ etiqueta, valor, nota, tono, acento, extra, icono: Icono, progreso }) {
  // valor null = no hay datos suficientes. Distinto de valor 0.
  const sinDatos = valor === null || valor === undefined;
  // El tono de estado manda sobre el acento decorativo cuando ambos existen
  // (ej: "Órdenes abiertas" no tiene acento propio, se pinta con su tono).
  const paleta = TONOS_TARJETA[tono] || ACENTOS[acento] || { fg: color.primario, bg: color.primarioClaro };
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

// Filtro en una sola línea (etiqueta + select, uno al lado del otro) para
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

const estilos = {
  mensaje: { color: color.textoSuave, padding: "18px 0" },
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