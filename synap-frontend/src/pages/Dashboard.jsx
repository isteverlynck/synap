// Dashboard.jsx — el panel de jefatura.
//
// Regla de toda esta pantalla: un indicador sin datos suficientes dice "sin
// datos", nunca cero. Un 0% de cumplimiento y un "todavía no hay preventivos
// cargados" significan cosas opuestas, y confundirlos lleva a decisiones malas
// sobre el parque de equipos.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { obtenerKPIs } from "../api/dashboard";
import { opcionesDeFiltro } from "../api/activos";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton } from "../tema";

function Dashboard() {
  const [kpis, setKpis] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // Filtro por grupo técnico / tipo de equipo: recalcula TODOS los KPIs solo
  // sobre los activos que matchean. Mismas opciones que usa la pantalla de
  // Activos, para no duplicar catálogos.
  const [opciones, setOpciones] = useState({ tipos: [], grupos: [] });
  const [filtros, setFiltros] = useState({ grupoId: "", tipoEquipoId: "" });
  const filtrosActivos = Object.values(filtros).filter(Boolean).length;

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
      <Encabezado
        titulo="Panel de indicadores"
        subtitulo="Calculado en el momento, sobre los datos actuales"
      />

      {/* ─── Filtro por grupo técnico / tipo de equipo ─── */}
      <div style={{ ...cs.tarjeta, padding: 18, marginBottom: 14 }}>
        <div style={estilos.grillaFiltros}>
          <Filtro
            etiqueta="Grupo técnico"
            valor={filtros.grupoId}
            onChange={(v) => setFiltros({ ...filtros, grupoId: v })}
            opciones={opciones.grupos}
          />
          <Filtro
            etiqueta="Tipo de equipo"
            valor={filtros.tipoEquipoId}
            onChange={(v) => setFiltros({ ...filtros, tipoEquipoId: v })}
            opciones={opciones.tipos}
          />
        </div>
        {filtrosActivos > 0 && (
          <button style={{ ...boton("fantasma"), marginTop: 12, gap: 6 }} onClick={limpiarFiltros}>
            <X size={15} strokeWidth={2.2} aria-hidden="true" />
            Limpiar filtros
          </button>
        )}
      </div>

      {cargando && <p style={estilos.mensaje}>Calculando indicadores...</p>}
      {!cargando && error && <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>}
      {!cargando && !error && kpis && (
        <>

      {/* ─── Fila 1: el estado del parque hoy ─── */}
      <div style={estilos.grilla}>
        <Tarjeta
          etiqueta="Equipos registrados"
          valor={kpis.activos_totales}
          nota={kpis.activos_en_baja > 0 ? `${kpis.activos_en_baja} dados de baja` : null}
        />
        <Tarjeta
          etiqueta="Órdenes abiertas"
          valor={kpis.ot_abiertas}
          nota={`de ${kpis.ot_totales} en total`}
          tono={kpis.ot_abiertas > 0 ? "advertencia" : "exito"}
        />
        <Tarjeta
          etiqueta="Cumplimiento de preventivos"
          valor={kpis.cumplimiento_mp_pct !== null ? `${kpis.cumplimiento_mp_pct}%` : null}
          nota={kpis.mp_totales > 0
            ? `${kpis.mp_realizados} de ${kpis.mp_totales} realizados${mesMP ? " ese mes" : ""}`
            : (mesMP ? "Sin preventivos programados ese mes" : "No hay preventivos cargados")}
          tono={tonoCumplimiento(kpis.cumplimiento_mp_pct)}
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
      <div style={estilos.grilla}>
        <Tarjeta
          etiqueta="Tiempo fuera de servicio"
          valor={kpis.inactividad_promedio_dias !== null ? `${kpis.inactividad_promedio_dias} d` : null}
          nota={kpis.correctivas_evaluadas > 0
            ? `Promedio sobre ${kpis.correctivas_evaluadas} correctivas`
            : "Ninguna correctiva cerrada todavía"}
        />
        <Tarjeta
          etiqueta="Tiempo medio de reparación"
          valor={kpis.mttr_dias !== null ? `${kpis.mttr_dias} d` : null}
          nota={kpis.ot_cerradas > 0 ? `Sobre ${kpis.ot_cerradas} órdenes cerradas` : "Sin órdenes cerradas"}
        />
        <Tarjeta
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
        ayuda="Los que más veces se reportaron. Son los candidatos a revisar o reemplazar."
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
        ayuda="Menos días entre fallas = falla más seguido. Necesita al menos dos fallas del mismo equipo para poder calcularse."
      >
        {kpis.mtbf_por_equipo.length === 0 && (
          <p style={estilos.vacio}>
            Todavía no hay ningún equipo con dos fallas o más, así que no se puede
            medir cada cuánto fallan.
          </p>
        )}
        {kpis.mtbf_por_equipo.slice(0, 8).map((m) => (
          <div key={m.clave} style={estilos.filaMtbf}>
            <span style={estilos.mtbfClave}>{m.clave}</span>
            <span style={estilos.mtbfDato}>
              cada {m.mtbf_dias} días
              <span style={estilos.mtbfNota}> · {m.cantidad_fallas} fallas</span>
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

function Tarjeta({ etiqueta, valor, nota, tono, extra }) {
  const colores = {
    exito: color.exito,
    advertencia: color.advertencia,
    peligro: color.peligro,
  };
  // valor null = no hay datos suficientes. Distinto de valor 0.
  const sinDatos = valor === null || valor === undefined;

  return (
    <div style={{ ...cs.tarjeta, padding: 18 }}>
      <p style={estilos.etiqueta}>{etiqueta}</p>
      <p style={{
        ...estilos.valor,
        color: sinDatos ? color.textoDebil : (colores[tono] || color.texto),
        fontSize: sinDatos ? "1.1rem" : "1.9rem",
      }}>
        {sinDatos ? "Sin datos" : valor}
      </p>
      {nota && <p style={estilos.nota}>{nota}</p>}
      {extra}
    </div>
  );
}

// Mismo componente que usa la pantalla de Activos para sus filtros, para que
// se vean y se comporten igual.
function Filtro({ etiqueta, valor, onChange, opciones }) {
  return (
    <div>
      <label style={cs.label}>{etiqueta}</label>
      <select style={cs.input} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todos</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>{o.nombre}</option>
        ))}
      </select>
    </div>
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
// gráficos: es una barra de ancho variable y alcanza.
function Barra({ etiqueta, valor, maximo, sufijo }) {
  const ancho = maximo > 0 ? Math.round((valor / maximo) * 100) : 0;
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={estilos.barraCabecera}>
        <span style={estilos.barraEtiqueta}>{etiqueta}</span>
        <span style={estilos.barraValor}>{valor} {sufijo}</span>
      </div>
      <div style={estilos.barraFondo}>
        <div style={{ ...estilos.barraRelleno, width: `${ancho}%` }} />
      </div>
    </div>
  );
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "18px 0" },
  grillaFiltros: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 14,
  },
  grilla: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 12,
    marginBottom: 12,
  },
  etiqueta: {
    margin: 0, fontSize: "0.73rem", color: color.textoDebil,
    textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 600,
  },
  valor: { margin: "8px 0 0", fontWeight: 700, lineHeight: 1.1 },
  nota: { margin: "6px 0 0", fontSize: "0.78rem", color: color.textoSuave },
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
  barraCabecera: { display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 },
  barraEtiqueta: { fontSize: "0.83rem", color: color.texto, fontFamily: "ui-monospace, monospace" },
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