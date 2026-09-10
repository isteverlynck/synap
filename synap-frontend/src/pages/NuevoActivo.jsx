// NuevoActivo.jsx — alta de un equipo nuevo en el inventario.
//
// La usan coordinación, técnicos (y junior) y jefatura. El código del equipo
// NO se escribe a mano: lo arma el backend (B-<área>-<tipo de equipo>-<número
// correlativo>) a partir del área que se elige acá y el tipo de equipo.
// La descripción tampoco se escribe a mano: el backend la completa sola con
// el nombre del tipo de equipo elegido (ver el select "Tipo de equipo").
//
// El segundo bloque (mantenimiento preventivo) es opcional: si se activa, se
// pide la frecuencia (en meses) y EN QUÉ MES debería abrirse la primera
// orden (la OT siempre se abre el día 1 de ese mes) — a partir de ahí, la
// frecuencia va marcando los meses siguientes solos. También se muestra con
// qué checklist va a quedar vinculado el equipo (el de su tipo, o el
// genérico si no hay uno propio) ANTES de crearlo, para que no sea sorpresa.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { crearActivo, catalogosParaAlta } from "../api/activos";
import { listarPlanes } from "../api/planes";
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
  const [ubicacion, setUbicacion] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [numeroSerie, setNumeroSerie] = useState("");
  const [numeroOrdenCompra, setNumeroOrdenCompra] = useState("");
  const [codigoQr, setCodigoQr] = useState("");
  const [fechaInstalacion, setFechaInstalacion] = useState("");
  const [estado, setEstado] = useState("ACTIVO");
  const [criticidad, setCriticidad] = useState("");

  const [crearMantenimiento, setCrearMantenimiento] = useState(false);
  const [frecuenciaMeses, setFrecuenciaMeses] = useState("");
  // Mes en que debería abrirse la primera orden (input type="month", da
  // "YYYY-MM"). La OT siempre se abre el día 1 de ese mes.
  const [primerMes, setPrimerMes] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([catalogosParaAlta(), listarPlanes()])
      .then(([cat, pl]) => {
        setCatalogos(cat);
        setPlanes(pl);
      })
      .catch(() => setErrorCatalogos("No se pudieron cargar los tipos de equipo y servicios. Recargá la página."))
      .finally(() => setCargandoCatalogos(false));
  }, []);

  // El checklist que le va a tocar a este equipo, para mostrarlo ANTES de
  // crear el mantenimiento: primero el del tipo elegido; si no hay, el
  // genérico. Es una vista previa: la decisión real la vuelve a tomar el
  // backend al crear el activo (acá solo evitamos que sea una sorpresa).
  const planQueLeToca = tipoEquipoId
    ? planes.find((p) => p.tipo_equipo_id === tipoEquipoId) || planes.find((p) => p.es_generica)
    : null;

  async function enviar() {
    setError("");

    if (!area.trim()) return setError("Indicá el área (va en el código del equipo, ej: INTR, TERA).");
    if (!tipoEquipoId) return setError("Elegí el tipo de equipo.");
    if (!sectorId) return setError("Elegí el servicio/sector.");
    if (crearMantenimiento) {
      const n = Number(frecuenciaMeses);
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
        ubicacion: ubicacion.trim() || null,
        marca: marca.trim() || null,
        modelo: modelo.trim() || null,
        numero_serie: numeroSerie.trim() || null,
        numero_orden_compra: numeroOrdenCompra.trim() || null,
        codigo_qr: codigoQr.trim() || null,
        fecha_instalacion: fechaInstalacion || null,
        estado,
        criticidad: criticidad || null,
        crear_mantenimiento: crearMantenimiento,
        frecuencia_meses: crearMantenimiento ? Number(frecuenciaMeses) : null,
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
              ayuda="Ej: INTR, TERA, CIRU. Va en el código del equipo: B-<área>-<tipo>-<número>."
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
              <input
                style={cs.input}
                placeholder="Ej: E03-P01-CARD"
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
              />
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
                <div style={{ maxWidth: 160 }}>
                  <Campo etiqueta="Frecuencia (en meses)" ayuda="Ej: 12 = una vez por año.">
                    <input
                      type="number"
                      min="1"
                      style={cs.input}
                      value={frecuenciaMeses}
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
};

export default NuevoActivo;