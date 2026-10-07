// Pendientes.jsx — la bandeja del coordinador: las solicitudes que le llegaron
// y todavía no resolvió.
//
// La idea central es que resuelva sin salir de la lista. Cada tarjeta se abre
// en el lugar para aceptar, rechazar o corregir. Es lo contrario de Máximo,
// donde hay que navegar varias pantallas para hacer algo simple.
//
// Formato: igual que Equipos, Órdenes y Accesorios — el buscador arriba (por
// N° de solicitud, por código de equipo, o por lo que es si no es un equipo
// médico), un botón "Filtros" que despliega y esconde el filtro de fechas
// ("Desde" y "Hasta": el día en que se hizo la solicitud, en hora de
// Argentina, los dos incluidos) y las flechas de página ("Anterior /
// Siguiente") arriba de la lista, de a 50. Se filtra acá, sobre lo que ya se
// trajo del backend.

import { useEffect, useState } from "react";
import { solicitudesPendientes, tecnicosDisponibles, listarGrupos, aceptarSolicitud,
         rechazarSolicitud, modificarSolicitud } from "../api/coordinacion";
import { verCriticidad } from "../api/activos";
import { agruparPorFecha } from "../utiles/fechas";
import { coincideSolicitud, enRangoDeFechas, masRecientesPrimero } from "../utiles/solicitudes";
import Encabezado from "../componentes/Encabezado";
import BarraFiltros, { GrupoFiltro } from "../componentes/BarraFiltros";
import Paginador from "../componentes/Paginador";
import { color, cs, boton, insignia } from "../tema";
import { toast } from "sonner";
import { HeartPulse, Wrench } from "lucide-react";

// Sugerencia de prioridad según el nivel de riesgo PRIUX del equipo (ver
// backend/app/criticidad.py::nivel_riesgo). Es un punto de partida nomás:
// coordinación siempre puede elegir otra cosa en el desplegable.
const PRIORIDAD_SEGUN_NIVEL = { ALTO: "ALTA", MEDIO: "MEDIA", BAJO: "BAJA" };
const NOMBRE_NIVEL = { ALTO: "alto", MEDIO: "medio", BAJO: "bajo" };

// Cuántas solicitudes se muestran por página.
const POR_PAGINA = 50;

function Pendientes() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [gruposTecnicos, setGruposTecnicos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // Qué tarjeta está abierta y en qué modo: { id, modo: 'aceptar'|'rechazar'|'modificar' }
  const [abierta, setAbierta] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState("");   // "AAAA-MM-DD" o ""
  const [hasta, setHasta] = useState("");

  // Página actual (0 = la primera), guardada junto con la búsqueda y las
  // fechas a las que corresponde: si cambia cualquiera de ellas, vuelve sola
  // a la primera.
  const clavePagina = JSON.stringify([busqueda, desde, hasta]);
  const [paginaGuardada, setPaginaGuardada] = useState({ clave: clavePagina, pagina: 0 });
  // Si cambió la búsqueda o alguna fecha, la página guardada ya no
  // corresponde: se vuelve a la primera (así, al limpiar los filtros, tampoco
  // reaparece una página vieja).
  if (paginaGuardada.clave !== clavePagina) {
    setPaginaGuardada({ clave: clavePagina, pagina: 0 });
  }

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      // Las tres cosas en paralelo: la lista, los técnicos y los grupos (estos
      // últimos hacen falta para aceptar una solicitud que no es de un
      // equipo, donde el grupo no se puede deducir y hay que elegirlo).
      const [lista, gente, listaGrupos] = await Promise.all([
        solicitudesPendientes(),
        tecnicosDisponibles(),
        listarGrupos(),
      ]);
      setSolicitudes(lista);
      setTecnicos(gente);
      setGruposTecnicos(listaGrupos);
    } catch {
      setError("No pudimos cargar las solicitudes pendientes.");
    } finally {
      setCargando(false);
    }
  }

  // Después de resolver una, la sacamos de la lista sin recargar todo: la
  // pantalla responde al toque y no parpadea.
  function quitarDeLaLista(id) {
    setSolicitudes((antes) => antes.filter((s) => s.id !== id));
    setAbierta(null);
  }

  // "Desde" posterior a "Hasta": no tiene sentido, no se muestra nada hasta
  // que se corrija (las fechas ISO se pueden comparar como texto).
  const rangoInvalido = !!desde && !!hasta && desde > hasta;
  const hayFiltroFecha = !!desde || !!hasta;
  const filtrosActivos = hayFiltroFecha ? 1 : 0;   // las dos fechas cuentan como uno solo

  function limpiarFiltros() {
    setDesde("");
    setHasta("");
  }

  // Primero se filtra y se ordena (la más reciente primero), y recién después
  // se parte en páginas.
  const solicitudesFiltradas = rangoInvalido
    ? []
    : masRecientesPrimero(
        solicitudes.filter(
          (s) => coincideSolicitud(s, busqueda) && enRangoDeFechas(s.created_at, desde, hasta)
        ),
        (s) => s.created_at
      );
  const hayRecorte = busqueda.trim() !== "" || hayFiltroFecha;

  const totalPaginas = Math.max(1, Math.ceil(solicitudesFiltradas.length / POR_PAGINA));
  const pagina = Math.min(paginaGuardada.clave === clavePagina ? paginaGuardada.pagina : 0, totalPaginas - 1);
  const primera = pagina * POR_PAGINA;
  const solicitudesPagina = solicitudesFiltradas.slice(primera, primera + POR_PAGINA);
  const grupos = agruparPorFecha(solicitudesPagina, (s) => s.created_at);

  const subtitulo = cargando
    ? "Cargando..."
    : totalPaginas > 1
      ? `Mostrando ${primera + 1}–${primera + solicitudesPagina.length} de ${solicitudesFiltradas.length}`
      : hayRecorte
        ? `${solicitudesFiltradas.length} de ${solicitudes.length} esperando respuesta`
        : `${solicitudes.length} esperando respuesta`;

  return (
    <>
      <Encabezado titulo="Solicitudes pendientes" subtitulo={subtitulo}>
        <button style={boton("secundario")} onClick={cargar}>Actualizar</button>
      </Encabezado>

      {/* ─── Buscador (por N° de solicitud o equipo) + filtro de fechas plegable ─── */}
      <BarraFiltros
        placeholder="Buscar por N° de solicitud (ej: #12) o por equipo"
        texto={busqueda}
        onTexto={setBusqueda}
        filtrosActivos={filtrosActivos}
        onLimpiar={limpiarFiltros}
      >
        {/* Fecha en que se hizo la solicitud: rango de días, los dos
        extremos incluidos. */}
        <GrupoFiltro etiqueta="Fecha de la solicitud">
          <label style={estilos.campoFecha}>
            Desde
            <input
              type="date"
              style={estilos.inputFecha}
              value={desde}
              max={hasta || undefined}
              onChange={(e) => setDesde(e.target.value)}
            />
          </label>
          <label style={estilos.campoFecha}>
            Hasta
            <input
              type="date"
              style={estilos.inputFecha}
              value={hasta}
              min={desde || undefined}
              onChange={(e) => setHasta(e.target.value)}
            />
          </label>
        </GrupoFiltro>
      </BarraFiltros>

      {cargando && <p style={estilos.mensaje}>Cargando solicitudes...</p>}

      {error && <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>}

      {!cargando && !error && solicitudes.length === 0 && (
        <p style={estilos.mensaje}>No hay solicitudes esperando. Todo al día.</p>
      )}

      {!cargando && !error && solicitudes.length > 0 && solicitudesFiltradas.length === 0 && (
        <p style={estilos.mensaje}>
          {rangoInvalido
            ? "La fecha \"Desde\" no puede ser posterior a la fecha \"Hasta\"."
            : busqueda.trim()
              ? "No encontramos ninguna solicitud con esa búsqueda."
              : "No hay solicitudes en ese rango de fechas."}
        </p>
      )}

      {/* ─── Páginas: flechas arriba de la lista ─── */}
      {!cargando && (
        <Paginador
          pagina={pagina}
          totalPaginas={totalPaginas}
          onCambiar={(n) => setPaginaGuardada({ clave: clavePagina, pagina: n })}
        />
      )}

      {!cargando && grupos.map((grupo) => (
        <div key={grupo.fecha} style={{ marginBottom: 22 }}>
          <p style={estilos.fecha}>{grupo.fecha}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {grupo.items.map((s) => (
              <Tarjeta
                key={s.id}
                solicitud={s}
                tecnicos={tecnicos}
                grupos={gruposTecnicos}
                abierta={abierta}
                setAbierta={setAbierta}
                alResolver={quitarDeLaLista}
                alModificar={(actualizada) =>
                  setSolicitudes((antes) =>
                    antes.map((x) => (x.id === actualizada.id ? actualizada : x))
                  )
                }
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Una solicitud
// ─────────────────────────────────────────────────────────────────────────

function Tarjeta({ solicitud: s, tecnicos, grupos, abierta, setAbierta, alResolver, alModificar }) {
  const modo = abierta?.id === s.id ? abierta.modo : null;

  return (
    <div style={estilos.tarjeta}>
      <div style={estilos.cabecera}>
        <div style={{ minWidth: 0 }}>
          <p style={estilos.titulo}>#{s.numero_solicitud} · {s.titulo}</p>
          <p style={{ ...estilos.linea, display: "flex", alignItems: "center", gap: 6 }}>
            {/* Equipo médico o "cosa": son circuitos distintos (uno se rutea
            solo por el tipo de equipo, el otro necesita que el coordinador
            elija el grupo). Que se distinga de un vistazo ahorra abrir. */}
            {s.activo_codigo
              ? <HeartPulse size={14} strokeWidth={1.8} aria-hidden="true" />
              : <Wrench size={14} strokeWidth={1.8} aria-hidden="true" />}
            {s.activo_codigo
              ? `${s.activo_codigo || "Equipo sin código"} · ${s.ubicacion || "Sin ubicación"}`
              : `${s.descripcion_cosa || "Sin equipo asociado"} · ${s.ubicacion || "Sin ubicación"}`}
          </p>
          <p style={estilos.lineaTenue}>{s.solicitante_nombre || "Solicitante desconocido"}</p>
        </div>
        <span style={insignia("advertencia")}>Pendiente</span>
      </div>

      {s.descripcion_problema && (
        <p style={estilos.descripcion}>{s.descripcion_problema}</p>
      )}

      {/* Los botones desaparecen cuando hay un panel abierto: así queda claro
      que estás en el medio de una acción y no se dispara otra sin querer. */}
      {!modo && (
        <div style={estilos.acciones}>
          <button style={boton("primario")} onClick={() => setAbierta({ id: s.id, modo: "aceptar" })}>Aceptar</button>
          <button style={boton("secundario")} onClick={() => setAbierta({ id: s.id, modo: "modificar" })}>Modificar</button>
          <button style={boton("peligro")} onClick={() => setAbierta({ id: s.id, modo: "rechazar" })}>Rechazar</button>
        </div>
      )}

      {modo === "aceptar" && (
        <PanelAceptar s={s} tecnicos={tecnicos} grupos={grupos} cerrar={() => setAbierta(null)} alResolver={alResolver} />
      )}
      {modo === "rechazar" && (
        <PanelRechazar s={s} cerrar={() => setAbierta(null)} alResolver={alResolver} />
      )}
      {modo === "modificar" && (
        <PanelModificar s={s} cerrar={() => setAbierta(null)} alModificar={alModificar} />
      )}
    </div>
  );
}

// ─── Aceptar ───

function PanelAceptar({ s, tecnicos, grupos, cerrar, alResolver }) {
  // Las solicitudes de un equipo médico ya saben su grupo (sale del equipo);
  // las de "cosa" no, así que acá hay que elegirlo antes de poder asignar.
  const requiereGrupo = !s.activo_codigo;
  const [grupoId, setGrupoId] = useState("");
  const [tecnicoId, setTecnicoId] = useState("");
  const [tecnicosDelGrupo, setTecnicosDelGrupo] = useState(tecnicos);
  const [prioridad, setPrioridad] = useState("");
  // Clasificación de la falla: obligatoria y SIN valor por defecto, para que
  // coordinación tenga que decidir a conciencia. Solo las técnicas cuentan en
  // los KPIs de fallas del dashboard.
  const [origenFalla, setOrigenFalla] = useState("");
  // Nivel de riesgo del equipo (PRIUX), si se pudo sugerir una prioridad a
  // partir de él — para mostrar de dónde salió el valor precargado.
  const [sugerencia, setSugerencia] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  // Mientras no se eligió grupo (solicitud de "cosa"), no hay a quién ofrecer
  // en "Asignar a". Apenas se elige, traemos solo los técnicos de ese grupo.
  useEffect(() => {
    if (!requiereGrupo) return;
    setTecnicoId("");
    if (!grupoId) { setTecnicosDelGrupo([]); return; }
    tecnicosDisponibles(grupoId).then(setTecnicosDelGrupo).catch(() => setTecnicosDelGrupo([]));
  }, [grupoId, requiereGrupo]);

  // Precarga la prioridad según el riesgo del equipo — solo aplica a
  // solicitudes de un equipo médico con el PRIUX calculable (si es "cosa", si
  // no es equipo médico, o si falta algún dato para el cálculo, no hay nada
  // que sugerir y queda "Sin definir" como siempre). Solo completa el campo
  // si todavía está vacío: si coordinación ya eligió algo mientras se
  // calculaba, no se lo pisa.
  useEffect(() => {
    if (!s.activo_codigo) return;
    verCriticidad(s.activo_codigo)
      .then((c) => {
        const sugerida = PRIORIDAD_SEGUN_NIVEL[c.nivel];
        if (!sugerida) return;
        setSugerencia({ prioridad: sugerida, nivel: c.nivel });
        setPrioridad((actual) => actual || sugerida);
      })
      .catch(() => {});
  }, [s.activo_codigo]);

  async function confirmar() {
    if (requiereGrupo && !grupoId) {
      setError("Elegí a qué grupo le corresponde.");
      return;
    }
    if (!origenFalla) {
      setError("Indicá si la falla es técnica o de usuario.");
      return;
    }
    setEnviando(true);
    setError("");
    try {
      await aceptarSolicitud(s.id, {
        origenFalla,
        asignarAId: tecnicoId || null,
        grupoId: requiereGrupo ? grupoId : null,
        prioridad: prioridad || null,
      });
      toast.success(`Solicitud #${s.numero_solicitud} aceptada`, {
        description: tecnicoId
          ? "Se generó la orden y quedó asignada."
          : "Se generó la orden. Queda sin técnico asignado.",
      });
      alResolver(s.id);
    } catch (e) {
      setError(e.response?.data?.detail || "No pudimos aceptar la solicitud.");
      setEnviando(false);
    }
  }

  return (
    <div style={estilos.panel}>
      <p style={estilos.panelTitulo}>Aceptar y generar la orden de trabajo</p>

      {/* Grupo: en una solicitud de equipo ya viene decidido por el tipo de
      equipo (ej. anestesia → G1), así que se muestra fijo y no se puede
      cambiar. Solo en las de "cosa" (sin equipo) el coordinador lo elige. */}
      <label style={cs.label}>Grupo</label>
      {requiereGrupo ? (
        <select style={{ ...cs.input, marginBottom: 12 }} value={grupoId}
                onChange={(e) => setGrupoId(e.target.value)}>
          <option value="">Elegir grupo...</option>
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.descripcion ? `${g.id} — ${g.descripcion}` : g.id}
            </option>
          ))}
        </select>
      ) : (
        <div style={{ ...cs.input, marginBottom: 12, background: color.fondo, color: color.textoSuave }}>
          {(() => {
            // Mismo texto que en el desplegable: "G1 — Anestesia".
            const g = grupos.find((x) => x.id === s.grupo_id);
            if (!s.grupo_id) return "Sin grupo definido";
            return g?.descripcion ? `${g.id} — ${g.descripcion}` : s.grupo_id;
          })()}
        </div>
      )}

      <label style={cs.label}>Asignar a</label>
      <select style={{ ...cs.input, marginBottom: 12 }} value={tecnicoId}
              disabled={requiereGrupo && !grupoId}
              onChange={(e) => setTecnicoId(e.target.value)}>
        {/* Dejar sin asignar es una opción válida: la OT nace abierta y se
        asigna después. Por eso está primera, no escondida. */}
        <option value="">Dejar sin asignar por ahora</option>
        {(requiereGrupo ? tecnicosDelGrupo : tecnicos).map((t) => (
          <option key={t.id} value={t.id}>{t.nombre} {t.apellido}</option>
        ))}
      </select>

      <label style={cs.label}>Clasificación de la falla</label>
      <p style={estilos.sugerencia}>
        Las fallas de usuario (mal uso) no cuentan en los indicadores de fallas del dashboard.
      </p>
      <select style={{ ...cs.input, marginBottom: 12 }} value={origenFalla}
              onChange={(e) => setOrigenFalla(e.target.value)}>
        <option value="">Elegir clasificación...</option>
        <option value="TECNICA">Técnica (falló el equipo)</option>
        <option value="USUARIO">De usuario (mal uso)</option>
      </select>

      <label style={cs.label}>Prioridad</label>
      {sugerencia && (
        <p style={estilos.sugerencia}>
          Sugerida según el riesgo del equipo (nivel {NOMBRE_NIVEL[sugerencia.nivel]}) — la podés cambiar.
        </p>
      )}
      <select style={{ ...cs.input, marginBottom: 14 }} value={prioridad}
              onChange={(e) => setPrioridad(e.target.value)}>

        <option value="">Sin definir</option>
        <option value="CRITICA">Crítica</option>
        <option value="ALTA">Alta</option>
        <option value="MEDIA">Media</option>
        <option value="BAJA">Baja</option>
      </select>

      {error && <p style={estilos.error}>{error}</p>}

      <div style={estilos.acciones}>
        <button style={boton("primario")} onClick={confirmar} disabled={enviando}>
          {enviando ? "Generando..." : "Confirmar"}
        </button>
        <button style={boton("fantasma")} onClick={cerrar}>Cancelar</button>
      </div>
    </div>
  );
}

// ─── Rechazar ───

function PanelRechazar({ s, cerrar, alResolver }) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function confirmar() {
    if (!motivo.trim()) {
      setError("Escribí un motivo: lo va a ver quien hizo la solicitud.");
      return;
    }
    setEnviando(true);
    setError("");
    try {
      await rechazarSolicitud(s.id, motivo.trim());
      toast.success(`Solicitud #${s.numero_solicitud} rechazada`, {
        description: "Quien la pidió va a ver el motivo.",
      });
      alResolver(s.id);
    } catch (e) {
      setError(e.response?.data?.detail || "No pudimos rechazar la solicitud.");
      setEnviando(false);
    }
  }

  return (
    <div style={estilos.panel}>
      <p style={estilos.panelTitulo}>Rechazar la solicitud</p>
      <label style={cs.label}>Motivo</label>
      <textarea
        style={{ ...cs.input, minHeight: 70, marginBottom: 12, resize: "vertical" }}
        placeholder="Ej: el equipo ya tiene una orden abierta por la misma falla."
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
      />
      {error && <p style={estilos.error}>{error}</p>}
      <div style={estilos.acciones}>
        <button style={boton("peligro")} onClick={confirmar} disabled={enviando}>
          {enviando ? "Rechazando..." : "Confirmar rechazo"}
        </button>
        <button style={boton("fantasma")} onClick={cerrar}>Cancelar</button>
      </div>
    </div>
  );
}

// ─── Modificar ───

function PanelModificar({ s, cerrar, alModificar }) {
  const [titulo, setTitulo] = useState(s.titulo || "");
  const [descripcion, setDescripcion] = useState(s.descripcion_problema || "");
  const [ubicacion, setUbicacion] = useState(s.ubicacion || "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function guardar() {
    setEnviando(true);
    setError("");
    try {
      const cambios = {};
      if (titulo !== s.titulo) cambios.titulo = titulo;
      if (descripcion !== s.descripcion_problema) cambios.descripcion_problema = descripcion;
      if (ubicacion !== s.ubicacion) cambios.ubicacion = ubicacion;

      if (Object.keys(cambios).length === 0) { cerrar(); return; }

      const actualizada = await modificarSolicitud(s.id, cambios);
      toast.success("Cambios guardados");
      alModificar(actualizada);
      cerrar();
    } catch (e) {
      setError(e.response?.data?.detail || "No pudimos guardar los cambios.");
      setEnviando(false);
    }
  }

  return (
    <div style={estilos.panel}>
      <p style={estilos.panelTitulo}>Corregir la solicitud</p>

      <label style={cs.label}>Título</label>
      <input style={{ ...cs.input, marginBottom: 10 }} value={titulo} onChange={(e) => setTitulo(e.target.value)} />

      <label style={cs.label}>Descripción</label>
      <textarea style={{ ...cs.input, minHeight: 60, marginBottom: 10, resize: "vertical" }}
                value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />

      <label style={cs.label}>Ubicación</label>
      <input style={{ ...cs.input, marginBottom: 12 }} value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} />

      {error && <p style={estilos.error}>{error}</p>}

      <div style={estilos.acciones}>
        <button style={boton("primario")} onClick={guardar} disabled={enviando}>
          {enviando ? "Guardando..." : "Guardar cambios"}
        </button>
        <button style={boton("fantasma")} onClick={cerrar}>Cancelar</button>
      </div>
    </div>
  );
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "18px 0" },
  campoFecha: {
    display: "flex", alignItems: "center", gap: 5,
    fontSize: "0.78rem", color: color.textoSuave,
  },
  inputFecha: { ...cs.input, width: "auto", padding: "3px 8px", fontSize: "0.78rem" },
  fecha: { margin: "0 0 8px", fontSize: "0.72rem", color: color.textoDebil, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 },
  tarjeta: { ...cs.tarjeta, padding: "14px 16px" },
  cabecera: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  titulo: { margin: 0, fontSize: "0.98rem", color: color.texto, fontWeight: 600 },
  linea: { margin: "3px 0 0", fontSize: "0.84rem", color: color.textoSuave },
  lineaTenue: { margin: "2px 0 0", fontSize: "0.82rem", color: color.textoDebil },
  descripcion: { margin: "10px 0 0", fontSize: "0.88rem", color: color.texto, lineHeight: 1.5 },
  acciones: { display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" },
  panel: { marginTop: 14, paddingTop: 14, borderTop: `1px solid ${color.borde}` },
  panelTitulo: { margin: "0 0 12px", fontSize: "0.9rem", fontWeight: 700, color: color.texto },
  sugerencia: { margin: "4px 0 6px", fontSize: "0.78rem", color: color.textoDebil },
  error: { color: color.peligro, fontSize: "0.84rem", margin: "0 0 10px" },
};

export default Pendientes;