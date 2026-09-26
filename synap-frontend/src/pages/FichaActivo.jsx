import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { logout, rolActual } from "../api/auth";
import { verActivoDetalle } from "../api/activos";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton, insignia, estadoDelEquipo } from "../tema";
import Volver from "../componentes/Volver";
import { diasHasta, parsearFecha, formatearFechaOT } from "../utiles/fechas";
import { programarSegunPlan } from "../api/activos";
import { toast } from "sonner";

function FichaActivo() {
  const { codigo } = useParams();
  const navegar = useNavigate();
  const rol = rolActual();
  const [activo, setActivo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [programando, setProgramando] = useState(false);
  const [avisoRestringido, setAvisoRestringido] = useState(false);

  async function programarMP() {
    if (programando) return;
    setProgramando(true);
    try {
      const actualizado = await programarSegunPlan(activo.codigo);
      setActivo({ ...activo, frecuencia_mp_meses: actualizado.frecuencia_mp_meses });
      toast.success(`Queda programado cada ${actualizado.frecuencia_mp_meses} meses.`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "No pudimos programarlo.");
    } finally {
      setProgramando(false);
    }
  }

  useEffect(() => {
    setCargando(true);
    setError("");
    verActivoDetalle(codigo)
      .then(setActivo)
      .catch(() => setError(`No encontramos el equipo "${codigo}".`))
      .finally(() => setCargando(false));
  }, [codigo]);

  function cerrarSesion() {
    logout();
    navegar("/");
  }

  if (cargando) {
    return (
      <div style={cs.pagina}>
        <div style={cs.contenido}><p style={estilos.mensaje}>Cargando ficha del equipo...</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={cs.pagina}>
        <div style={cs.contenido}>
          <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>
          <button style={boton("secundario")} onClick={() => navegar("/escanear")}>
            Escanear de nuevo
          </button>
        </div>
      </div>
    );
  }

  // Todo lo del cartel de estado sale de una sola función (ver tema.js): qué
  // color, qué dice, y qué acción ofrecer.
  const situacion = estadoDelEquipo(activo);
  const abiertas = activo.ordenes_de_trabajo.filter((ot) => ot.estado !== "CERRADA");
  const cerradas = activo.ordenes_de_trabajo.filter((ot) => ot.estado === "CERRADA");
  // Mismo criterio que en Acciones: jefatura y enfermería no entran al detalle
  // de una OT, así que para ellas el historial no es clickeable.
  const veOrdenes = rol === "tecnico" || rol === "junior" || rol === "coordinacion";

  return (
    <div style={cs.pagina}>
      <div style={cs.contenido}>
        <Volver />
        <Encabezado titulo="Ficha del equipo">
          {/* <button style={boton("secundario")} onClick={() => navegar("/escanear")}>Escanear otro</button> */}
        </Encabezado>

        {/* Aviso de estado: ancho completo y ANTES del nombre del equipo, para
        que alguien apurado en un pasillo lo vea sin leer. */}
        <AvisoEstado situacion={situacion} />

        <h2 style={estilos.nombreEquipo}>{activo.descripcion}</h2>
        <p style={estilos.codigo}>{activo.codigo}</p>

        {rol === "coordinacion" && activo.proxima_fecha_mp && !activo.frecuencia_mp_meses && (
          <div style={{ ...cs.tarjeta, padding: "14px 18px", marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: "0.88rem", color: color.texto }}>
              Este equipo tiene mantenimiento programado pero no tiene definido cada
              cuánto se repite. Sin eso, la próxima fecha no avanza y el equipo
              queda vencido de forma permanente.
            </p>
            <button
              style={{ ...boton("primario"), marginTop: 12 }}
              onClick={programarMP}
              disabled={programando}
            >
              {programando ? "Programando..." : "Programar según su plan"}
            </button>
          </div>
        )}

        <div style={estilos.tarjetaDatos}>
          <Dato etiqueta="Marca y modelo" valor={[activo.marca, activo.modelo].filter(Boolean).join(" ") || "—"} />
          <Dato etiqueta="Ubicación" valor={activo.ubicacion || "—"} />
          <Dato etiqueta="N° de serie" valor={activo.numero_serie || "—"} />
          <Dato etiqueta="Próximo preventivo" valor={textoProximoMP(activo.proxima_fecha_mp)} />
        </div>

                {/* El responsable no es un dato más: es una acción. Cumple el objetivo
        de contacto directo con el bioingeniero. Es TODO el grupo a cargo del
        equipo, no una sola persona — cualquiera de ellos puede atender. */}
        {activo.responsables && activo.responsables.length > 0 && (
          <div style={estilos.responsable}>
            <div style={estilos.datoEtiqueta}>Bioingeniería responsable</div>
            {activo.responsables.map((r, i) => (
              <div key={i} style={estilos.filaResponsable}>
                <div style={estilos.datoValor}>{r.nombre}</div>
                {r.email && (
                  <a href={`mailto:${r.email}`} style={{ ...boton("secundario"), textDecoration: "none" }}>
                    Contactar
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        <Acciones
          rol={rol}
          situacion={situacion}
          activo={activo}
          navegar={navegar}
        />

        <Seccion titulo="Historial">
          {abiertas.map((ot) => (
            <ItemHistorial
              key={ot.id}
              titulo={`OT-${String(ot.numero_ot).padStart(4, "0")} · ${ot.tipo}`}
              detalle={`Abierta el ${formatearFechaOT(ot.fecha_apertura)}`}
              tono="advertencia"
              estado={ot.estado}
              onClick={veOrdenes ? () => (ot.puedo_abrir ? navegar(`/ordenes/${ot.id}`) : setAvisoRestringido(true)) : undefined}
            />
          ))}
          {cerradas.slice(0, 5).map((ot) => (
            <ItemHistorial
              key={ot.id}
              titulo={`OT-${String(ot.numero_ot).padStart(4, "0")} · ${ot.tipo}`}
              detalle={`Cerrada`}
              tono="neutro"
              estado={ot.estado}
              onClick={veOrdenes ? () => (ot.puedo_abrir ? navegar(`/ordenes/${ot.id}`) : setAvisoRestringido(true)) : undefined}
            />
          ))}
          {activo.mantenimientos.slice(0, 5).map((m) => (
            <ItemHistorial
              key={m.id}
              titulo="Mantenimiento preventivo"
              detalle={`Programado: ${formatearFecha(m.fecha_programada)}`}
              tono="neutro"
              estado={m.estado}
            />
          ))}
          {activo.ordenes_de_trabajo.length === 0 && activo.mantenimientos.length === 0 && (
            <p style={estilos.vacio}>Este equipo todavía no tiene historial registrado.</p>
          )}
        </Seccion>
      </div>

      {avisoRestringido && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(15, 23, 32, 0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, zIndex: 50,
          }}
          onClick={() => setAvisoRestringido(false)}
        >
          <div
            style={{ ...cs.tarjeta, padding: 22, width: "100%", maxWidth: 380 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: 0, fontWeight: 700, fontSize: "1rem", color: color.texto }}>
              Acceso restringido
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "0.88rem", color: color.textoSuave }}>
              Esta orden pertenece a otro grupo técnico. Podés ver que existe en el
              historial del equipo, pero no su detalle.
            </p>
            <button
              style={{ ...boton("primario"), marginTop: 16, width: "100%" }}
              onClick={() => setAvisoRestringido(false)}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Aviso de estado
// ─────────────────────────────────────────────────────────────────────────

function AvisoEstado({ situacion }) {
  const fondos = {
    exito: color.exitoFondo,
    advertencia: color.advertenciaFondo,
    peligro: color.peligroFondo,
    neutro: color.bordeSuave,
  };
  const textos = {
    exito: color.exito,
    advertencia: color.advertencia,
    peligro: color.peligro,
    neutro: color.textoSuave,
  };

  // El de baja va más grande a propósito: no puede leerse igual que los otros.
  const esBaja = situacion.tono === "peligro";

  return (
    <div style={{ ...estilos.aviso, background: fondos[situacion.tono] }}>
      <div style={{
        ...estilos.avisoTitulo,
        color: textos[situacion.tono],
        fontSize: esBaja ? "1.1rem" : "0.98rem",
      }}>
        {situacion.titulo}
      </div>
      <div style={{ ...estilos.avisoDetalle, color: textos[situacion.tono] }}>
        {situacion.detalle}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Acciones según rol y estado
// ─────────────────────────────────────────────────────────────────────────

function Acciones({ rol, situacion, activo, navegar }) {
  const acciones = [];
  const veOrdenes = rol === "tecnico" || rol === "junior" || rol === "coordinacion";
  // La acción principal la manda el ESTADO, no el rol: si el equipo está de
  // baja o ya tiene una OT abierta, nadie reporta un problema nuevo. Así no se
  // juntan cinco solicitudes del mismo monitor el mismo día.
  if (situacion.accion === "reportar" && rol === "enfermeria") {
    acciones.push({
      texto: "Reportar un problema",
      variante: "primario",
      onClick: () => navegar(`/solicitudes?activo=${activo.codigo}`),
    });
  }
  if (situacion.accion === "ver_ot" && veOrdenes) {
    acciones.push({
      texto: "Ver estado de la reparación",
      variante: "secundario",
      onClick: () => navegar(`/ordenes/${situacion.otId}`),
    });
  }

  if (rol === "coordinacion") {
    acciones.push({ texto: "Ver plan de mantenimiento", variante: "secundario", onClick: () => navegar(`/mantenimientos?tipo=${activo.tipo_equipo_id}`) });
  }
  

  if (acciones.length === 0) return null;

  return (
    <div style={estilos.acciones}>
      {acciones.map((a) => (
        <button key={a.texto} style={{ ...boton(a.variante), flex: 1 }} onClick={a.onClick}>
          {a.texto}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Piezas chicas
// ─────────────────────────────────────────────────────────────────────────

// Las fechas vienen del backend en UTC: las mostramos en formato local.
function formatearFecha(valor) {
  if (!valor) return "—";
  const f = parsearFecha(valor);
  if (isNaN(f)) return "—";
  return f.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

function textoProximoMP(fecha) {
  const base = formatearFecha(fecha);
  const dias = diasHasta(fecha);
  if (dias === null) return base;
  if (dias < 0) return `${base} · vencido hace ${Math.abs(dias)} días`;
  if (dias === 0) return `${base} · es hoy`;
  if (dias === 1) return `${base} · mañana`;
  return `${base} · en ${dias} días`;
}

// Los estados se guardan en mayúsculas y con guión bajo (así los espera el
// backend). Para mostrar, los pasamos a texto legible.
function textoEstado(estado) {
  const nombres = {
    ABIERTA: "Abierta",
    EN_PROGRESO: "En progreso",
    CERRADA: "Cerrada",
    PENDIENTE: "Pendiente",
    CUMPLIDO: "Cumplido",
  };
  return nombres[estado] || estado;
}

function Dato({ etiqueta, valor }) {
  return (
    <div>
      <div style={estilos.datoEtiqueta}>{etiqueta}</div>
      <div style={estilos.datoValor}>{valor}</div>
    </div>
  );
}

function Seccion({ titulo, children }) {
  return (
    <div style={{ marginTop: 26 }}>
      <h2 style={estilos.tituloSeccion}>{titulo}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function ItemHistorial({ titulo, detalle, tono, estado, onClick }) {
  return (
    <div
      style={onClick ? { ...estilos.item, cursor: "pointer" } : estilos.item}
      onClick={onClick}
      className={onClick ? "sy-clickeable" : undefined}
    >
      <div>
        <div style={{ color: color.texto, fontWeight: 500 }}>{titulo}</div>
        <div style={estilos.detalle}>{detalle}</div>
      </div>
      <span style={{ ...insignia(tono), marginLeft: "auto" }}>{textoEstado(estado)}</span>
    </div>
  );
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "20px 0" },
  aviso: { borderRadius: 12, padding: "14px 16px", marginBottom: 20 },
  avisoTitulo: { fontWeight: 700, marginBottom: 2 },
  avisoDetalle: { fontSize: "0.85rem" },
  nombreEquipo: { margin: "0 0 2px", fontSize: "1.3rem", color: color.texto, fontWeight: 700 },
  codigo: { margin: "0 0 18px", fontSize: "0.85rem", color: color.textoSuave, fontFamily: "ui-monospace, monospace" },
  tarjetaDatos: {
    ...cs.tarjeta,
    padding: 20,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 18,
  },
    responsable: {
    ...cs.tarjeta,
    padding: "14px 20px",
    marginTop: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  filaResponsable: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  acciones: { display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" },
  datoEtiqueta: { fontSize: "0.72rem", color: color.textoDebil, textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 4, fontWeight: 600 },
  datoValor: { color: color.texto, fontWeight: 500, fontSize: "0.95rem" },
  tituloSeccion: { fontSize: "1rem", color: color.texto, marginBottom: 10, fontWeight: 700 },
  item: { ...cs.tarjeta, padding: "12px 16px", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 12 },
  detalle: { color: color.textoSuave, fontSize: "0.82rem", marginTop: 2 },
  vacio: { color: color.textoSuave, fontSize: "0.9rem" },
};

export default FichaActivo;