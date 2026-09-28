// NuevoActivo.jsx — alta de un equipo nuevo en el inventario.
//
// La usan coordinación, técnicos (y junior) y jefatura. El código del equipo
// NO se escribe a mano: lo arma el backend (B-[área]-[tipo de equipo]-[número
// correlativo]) a partir del área que se elige acá y el tipo de equipo.
// La descripción tampoco se escribe a mano: el backend la completa sola con
// el nombre del tipo de equipo elegido (ver el select "Tipo de equipo").
//
// El segundo bloque (mantenimiento preventivo) es opcional: si se activa, se
// pide la frecuencia (en meses) y EN QUÉ MES debería abrirse la primera
// orden (la OT siempre se abre el día 1 de ese mes) — a partir de ahí, la
// frecuencia va marcando los meses siguientes solos. También se muestra con
// qué checklist va a quedar vinculado el equipo (el de su tipo, o el
// genérico si no hay uno propio) ANTES de crearlo, para que no sea sorpresa.
// El campo de frecuencia se sugiere solo, a partir de la frecuencia que ya
// trae ese checklist (frecuencia_dias, convertida a meses) — así no hay que
// adivinarla, aunque se puede pisar a mano si hace falta un caso puntual.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { crearActivo, catalogosParaAlta } from "../api/activos";
import { listarPlanes } from "../api/planes";
import { listarUbicaciones } from "../api/catalogos";
import Encabezado from "../componentes/Encabezado";
import Volver from "../componentes/Volver";
import { color, cs, boton } from "../tema";

const ESTADOS = [
  { valor: "ACTIVO", texto: "Activo / operativo" },
  { valor: "EN_REPARACION", texto: "En reparación" },
  { valor: "DE_BAJA", texto: "De baja" },
  { valor: "FUERA_DE_SERVICIO", texto: "Fuera de servicio" },
];

const CRITICIDADES = [
  { valor: "", texto: "Sin definir" },
  { valor: "BAJA", texto: "Baja" },
  { valor: "MEDIA", texto: "Media" },
  { valor: "ALTA", texto: "Alta" },
  { valor: "CRITICA", texto: "Crítica" },
];

function NuevoActivo() {
  const navegar = useNavigate();

  const [catalogos, setCatalogos] = useState({ tipos: [], sectores: [] });
  const [planes, setPlanes] = useState([]);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(true);
  const [errorCatalogos, setErrorCatalogos] = useState("");

  const [area, setArea] = useState("");
  const [tipoEquipoId, setTipoEquipoId] = useState("");
  const [sectorId, setSectorId] = useState("");
  // Ubicación: se elige del catálogo, no se escribe libre (ver
  // listarUbicaciones). ubicacionTexto es lo que se va tipeando para
  // filtrar; ubicacionElegida es la que realmente se manda al crear el
  // equipo — solo se completa al elegir una sugerencia de la lista.
  const [ubicaciones, setUbicaciones] = useState([]);
  const [ubicacionTexto, setUbicacionTexto] = useState("");
  const [ubicacionElegida, setUbicacionElegida] = useState(null);
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [numeroSerie, setNumeroSerie] = useState("");
  const [numeroOrdenCompra, setNumeroOrdenCompra] = useState("");
  const [codigoQr, setCodigoQr] = useState("");
  const [fechaInstalacion, setFechaInstalacion] = useState("");
  const [estado, setEstado] = useState("ACTIVO");
  const [criticidad, setCriticidad] = useState("");

  const [crearMantenimiento, setCrearMantenimiento] = useState(false);
  // Lo que la persona escribió a mano en el campo de frecuencia. Empieza
  // vacío: mientras siga vacío, se MUESTRA la recomendación del checklist en
  // su lugar (ver frecuenciaEfectiva) sin pisar este estado — así, si todavía
  // no se eligió un tipo de equipo y la recomendación cambia después, no hay
  // nada guardado de antes que quede desactualizado.
  const [frecuenciaMeses, setFrecuenciaMeses] = useState("");
  // Mes en que debería abrirse la primera orden (input type="month", da
  // "YYYY-MM"). La OT siempre se abre el día 1 de ese mes.
  const [primerMes, setPrimerMes] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([catalogosParaAlta(), listarPlanes(), listarUbicaciones()])
      .then(([cat, pl, ubi]) => {
        setCatalogos(cat);
        setPlanes(pl);
        setUbicaciones(ubi);
      })
      .catch(() => setErrorCatalogos("No se pudieron cargar los tipos de equipo y servicios. Recargá la página."))
      .finally(() => setCargandoCatalogos(false));
  }, []);

  // Filtra el catálogo de ubicaciones a medida que se escribe (por código o
  // por descripción), mismo criterio que el buscador de equipo en
  // Solicitudes.jsx. Se corta en 30 para no mostrar una lista eterna.
  const textoBusquedaUbicacion = ubicacionTexto.trim().toLowerCase();
  const ubicacionesFiltradas = !ubicacionElegida && textoBusquedaUbicacion
    ? ubicaciones
        .filter(
          (u) =>
            u.codigo.toLowerCase().includes(textoBusquedaUbicacion) ||
            u.descripcion.toLowerCase().includes(textoBusquedaUbicacion)
        )
        .slice(0, 30)
    : [];

  function elegirUbicacion(u) {
    setUbicacionElegida(u);
    setUbicacionTexto("");
  }

  function cambiarUbicacion() {
    setUbicacionElegida(null);
    setUbicacionTexto("");
  }

  // El checklist que le va a tocar a este equipo, para mostrarlo ANTES de
  // crear el mantenimiento: primero el del tipo elegido; si no hay, el
  // genérico. Es una vista previa: la decisión real la vuelve a tomar el
  // backend al crear el activo (acá solo evitamos que sea una sorpresa).
  const planQueLeToca = tipoEquipoId
    ? planes.find((p) => p.tipo_equipo_id === tipoEquipoId) || planes.find((p) => p.es_generica)
    : null;

  // El checklist ya trae su propia frecuencia recomendada (frecuencia_dias):
  // la convertimos a meses, redondeando al mes más cercano (mínimo 1), para
  // sugerirla en el campo de abajo en vez de dejarlo en blanco a adivinar.
  const frecuenciaRecomendada = planQueLeToca
    ? Math.max(1, Math.round(planQueLeToca.frecuencia_dias / 30))
    : null;

  // El valor que realmente se usa: lo que escribió la persona, o si todavía
  // no tocó el campo, la recomendación del checklist. Se calcula en cada
  // render (no hace falta un efecto que "copie" la sugerencia al estado).
  const frecuenciaEfectiva = frecuenciaMeses || (frecuenciaRecomendada != null ? String(frecuenciaRecomendada) : "");

  async function enviar() {
    setError("");

    if (!area.trim()) return setError("Indicá el área (va en el código del equipo, ej: INTR, TERA).");
    if (!tipoEquipoId) return setError("Elegí el tipo de equipo.");
    if (!sectorId) return setError("Elegí el servicio/sector.");
    // La ubicación es opcional, pero si se escribió algo tiene que haberse
    // elegido de la lista — no se manda texto libre sin elegir.
    if (ubicacionTexto.trim() && !ubicacionElegida) {
      return setError("Elegí la ubicación de la lista, o borrá lo que escribiste si no aplica.");
    }
    if (crearMantenimiento) {
      const n = Number(frecuenciaEfectiva);
      if (!n || n <= 0) return setError("Indicá cada cuántos meses se repite el mantenimiento.");
      if (!primerMes) return setError("Indicá en qué mes debería abrirse la primera orden.");
      if (!planQueLeToca) {
        return setError(
          "No hay un checklist de mantenimiento para este tipo de equipo ni uno genérico. " +
          "Pedile a coordinación que cargue un plan antes de programar este mantenimiento."
        );
      }
    }

    setEnviando(true);
    try {
      const activo = await crearActivo({
        area: area.trim(),
        tipo_equipo_id: tipoEquipoId,
        sector_id: sectorId,
        ubicacion: ubicacionElegida?.codigo || null,
        marca: marca.trim() || null,
        modelo: modelo.trim() || null,
        numero_serie: numeroSerie.trim() || null,
        numero_orden_compra: numeroOrdenCompra.trim() || null,
        codigo_qr: codigoQr.trim() || null,
        fecha_instalacion: fechaInstalacion || null,
        estado,
        criticidad: criticidad || null,
        crear_mantenimiento: crearMantenimiento,
        frecuencia_meses: crearMantenimiento ? Number(frecuenciaEfectiva) : null,
        // "YYYY-MM" del input type="month" → "YYYY-MM-01" para el backend.
        proxima_fecha_mp: crearMantenimiento && primerMes ? `${primerMes}-01` : null,
      });
      toast.success(`Equipo creado: ${activo.codigo}`);
      navegar(`/activos/${activo.codigo}`);
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo crear el equipo.");
    } finally {
      setEnviando(false);
    }
  }

  if (cargandoCatalogos) {
    return (
      <div style={cs.pagina}>
        <div style={cs.contenido}>
          <p style={estilos.mensaje}>Cargando…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={cs.pagina}>
      <div style={cs.contenido}>
        <Volver a="/activos" />
        <Encabezado titulo="Nuevo equipo" subtitulo="Alta de un activo en el inventario" />

        {errorCatalogos && <p style={estilos.error}>{errorCatalogos}</p>}

        <div style={estilos.tarjeta}>
          <div style={estilos.grilla2}>
            <Campo
              etiqueta="Área (para el código)"
              ayuda="Ej: INTR, TERA, CIRU. Va en el código del equipo: B-[área]-[tipo]-[número]."
            >
              <input
                style={cs.input}
                placeholder="Ej: INTR"
                value={area}
                onChange={(e) => setArea(e.target.value.toUpperCase())}
              />
            </Campo>

            <Campo etiqueta="Tipo de equipo">
              <select style={cs.input} value={tipoEquipoId} onChange={(e) => setTipoEquipoId(e.target.value)}>
                <option value="">Elegí un tipo</option>
                {catalogos.tipos.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Servicio / sector">
              <select style={cs.input} value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
                <option value="">Elegí un servicio</option>
                {catalogos.sectores.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Estado">
              <select style={cs.input} value={estado} onChange={(e) => setEstado(e.target.value)}>
                {ESTADOS.map((e) => (
                  <option key={e.valor} value={e.valor}>{e.texto}</option>
                ))}
              </select>
            </Campo>
          </div>

          <div style={{ ...estilos.grilla2, marginTop: 16, marginBottom: 0 }}>
            <Campo etiqueta="Ubicación">
              {ubicacionElegida ? (
                <div style={estilos.ubicacionElegida}>
                  <span>
                    <strong>{ubicacionElegida.codigo}</strong> — {ubicacionElegida.descripcion}
                  </span>
                  <button type="button" style={estilos.linkCambiar} onClick={cambiarUbicacion}>
                    Cambiar
                  </button>
                </div>
              ) : (
                <>
                  <input
                    style={cs.input}
                    placeholder="Buscá por código o descripción, ej: UTI, quirófano"
                    value={ubicacionTexto}
                    onChange={(e) => setUbicacionTexto(e.target.value)}
                  />
                  {textoBusquedaUbicacion && ubicacionesFiltradas.length === 0 && (
                    <p style={estilos.ayuda}>No encontramos ninguna ubicación con eso.</p>
                  )}
                  {ubicacionesFiltradas.length > 0 && (
                    <div style={estilos.listaSugerencias}>
                      {ubicacionesFiltradas.map((u) => (
                        <div
                          key={u.codigo}
                          style={estilos.sugerencia}
                          // onMouseDown y no onClick: el mousedown ocurre antes
                          // del blur del input, así el click no se pierde.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            elegirUbicacion(u);
                          }}
                        >
                          <strong>{u.codigo}</strong> — {u.descripcion}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </Campo>
            <Campo etiqueta="Código QR (si ya está pegado)">
              <input style={cs.input} placeholder="Opcional" value={codigoQr} onChange={(e) => setCodigoQr(e.target.value)} />
            </Campo>
            <Campo etiqueta="Marca">
              <input style={cs.input} value={marca} onChange={(e) => setMarca(e.target.value)} />
            </Campo>
            <Campo etiqueta="Modelo">
              <input style={cs.input} value={modelo} onChange={(e) => setModelo(e.target.value)} />
            </Campo>
            <Campo etiqueta="Número de serie">
              <input style={cs.input} value={numeroSerie} onChange={(e) => setNumeroSerie(e.target.value)} />
            </Campo>
            <Campo etiqueta="N° de orden de compra">
              <input style={cs.input} value={numeroOrdenCompra} onChange={(e) => setNumeroOrdenCompra(e.target.value)} />
            </Campo>
            <Campo etiqueta="Fecha de instalación">
              <input type="date" style={cs.input} value={fechaInstalacion} onChange={(e) => setFechaInstalacion(e.target.value)} />
            </Campo>
            <Campo etiqueta="Criticidad">
              <select style={cs.input} value={criticidad} onChange={(e) => setCriticidad(e.target.value)}>
                {CRITICIDADES.map((c) => (
                  <option key={c.valor} value={c.valor}>{c.texto}</option>
                ))}
              </select>
            </Campo>
          </div>
        </div>

        <div style={estilos.tarjeta}>
          <label style={estilos.checkboxFila}>
            <input
              type="checkbox"
              checked={crearMantenimiento}
              onChange={(e) => setCrearMantenimiento(e.target.checked)}
            />
            <span style={estilos.checkboxTexto}>Programarle mantenimiento preventivo a este equipo</span>
          </label>

          {crearMantenimiento && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ maxWidth: 200 }}>
                  <Campo
                    etiqueta="Frecuencia (en meses)"
                    ayuda={
                      frecuenciaRecomendada != null
                        ? `Recomendado según el checklist "${planQueLeToca.nombre}": cada ${frecuenciaRecomendada} ${frecuenciaRecomendada === 1 ? "mes" : "meses"}. Lo podés cambiar.`
                        : "Ej: 12 = una vez por año."
                    }
                  >
                    <input
                      type="number"
                      min="1"
                      style={cs.input}
                      value={frecuenciaEfectiva}
                      onChange={(e) => setFrecuenciaMeses(e.target.value)}
                    />
                  </Campo>
                </div>
                <div style={{ maxWidth: 200 }}>
                  <Campo
                    etiqueta="Mes de la primera orden"
                    ayuda="La orden se abre siempre el día 1 de ese mes."
                  >
                    <input
                      type="month"
                      style={cs.input}
                      value={primerMes}
                      onChange={(e) => setPrimerMes(e.target.value)}
                    />
                  </Campo>
                </div>
              </div>

              {!tipoEquipoId && (
                <p style={estilos.ayuda}>Elegí primero el tipo de equipo para saber qué checklist le corresponde.</p>
              )}
              {tipoEquipoId && planQueLeToca && (
                <p style={estilos.ayudaOk}>
                  Se va a vincular con el checklist <strong>{planQueLeToca.nombre}</strong>
                  {planQueLeToca.es_generica ? " (genérico: no hay uno específico para este tipo todavía)" : ""}.
                </p>
              )}
              {tipoEquipoId && !planQueLeToca && (
                <p style={estilos.error}>
                  No hay un checklist para este tipo de equipo ni uno genérico. Pedile a jefatura
                  que cargue un plan antes de programar este mantenimiento.
                </p>
              )}
            </div>
          )}
        </div>

        {error && <p style={estilos.error}>{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button style={boton("primario")} onClick={enviar} disabled={enviando}>
            {enviando ? "Creando..." : "Crear equipo"}
          </button>
          <button style={boton("secundario")} onClick={() => navegar("/activos")} disabled={enviando}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ etiqueta, ayuda, children }) {
  return (
    <div>
      <label style={cs.label}>{etiqueta}</label>
      {children}
      {ayuda && <p style={estilos.ayuda}>{ayuda}</p>}
    </div>
  );
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "20px 0" },
  tarjeta: { ...cs.tarjeta, padding: 22, marginBottom: 16 },
  grilla2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
    marginBottom: 16,
  },
  ayuda: { fontSize: "0.78rem", color: color.textoDebil, margin: "6px 0 0" },
  ayudaOk: { fontSize: "0.82rem", color: color.exito, margin: "6px 0 0" },
  error: { fontSize: "0.85rem", color: color.peligro, margin: "8px 0" },
  checkboxFila: { display: "flex", alignItems: "center", gap: 10, cursor: "pointer" },
  checkboxTexto: { fontSize: "0.92rem", color: color.texto, fontWeight: 600 },
  ubicacionElegida: {
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
    padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${color.borde}`, background: color.fondo,
  },
  linkCambiar: {
    border: "none", background: "none", color: color.primario, cursor: "pointer",
    fontSize: "0.85rem", fontWeight: 600, padding: 0, fontFamily: "inherit", flexShrink: 0,
  },
  listaSugerencias: {
    marginTop: 6, maxHeight: 220, overflowY: "auto", border: `1px solid ${color.borde}`,
    borderRadius: 10, background: color.tarjeta,
  },
  sugerencia: {
    padding: "10px 12px", cursor: "pointer", borderBottom: `1px solid ${color.bordeSuave}`, fontSize: "0.88rem", color: color.texto,
  },
};

export default NuevoActivo;