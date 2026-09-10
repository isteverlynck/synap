// NuevoPlan.jsx — crear un checklist de mantenimiento nuevo (plantilla +
// ítems). Solo coordinación (y jefatura) pueden hacerlo — el backend corta
// con 403 si lo intenta otro rol, así que acá alcanza con no ofrecer el
// botón que trae a esta pantalla (ver PlanesMantenimiento.jsx).

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { crearPlan } from "../api/planes";
import { catalogosParaAlta } from "../api/activos";
import Encabezado from "../componentes/Encabezado";
import Volver from "../componentes/Volver";
import { color, cs, boton } from "../tema";

function NuevoPlan() {
  const navegar = useNavigate();

  const [tipos, setTipos] = useState([]);
  const [cargandoTipos, setCargandoTipos] = useState(true);

  const [nombre, setNombre] = useState("");
  const [esGenerica, setEsGenerica] = useState(false);
  const [tipoEquipoId, setTipoEquipoId] = useState("");
  const [frecuenciaDias, setFrecuenciaDias] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [items, setItems] = useState([{ descripcion: "", obligatorio: true }]);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    catalogosParaAlta()
      .then((cat) => setTipos(cat.tipos))
      .catch(() => setError("No se pudieron cargar los tipos de equipo. Recargá la página."))
      .finally(() => setCargandoTipos(false));
  }, []);

  function agregarItem() {
    setItems((antes) => [...antes, { descripcion: "", obligatorio: true }]);
  }

  function quitarItem(indice) {
    setItems((antes) => antes.filter((_, i) => i !== indice));
  }

  function cambiarItem(indice, campo, valor) {
    setItems((antes) => antes.map((it, i) => (i === indice ? { ...it, [campo]: valor } : it)));
  }

  async function enviar() {
    setError("");

    if (!nombre.trim()) return setError("Indicá un nombre para el checklist.");
    if (!esGenerica && !tipoEquipoId) return setError("Elegí a qué tipo de equipo aplica, o marcalo como genérico.");
    const dias = Number(frecuenciaDias);
    if (!dias || dias <= 0) return setError("Indicá cada cuántos días se sugiere repetir este mantenimiento.");

    const itemsValidos = items
      .map((it) => ({ ...it, descripcion: it.descripcion.trim() }))
      .filter((it) => it.descripcion);
    if (itemsValidos.length === 0) return setError("Agregá al menos un ítem al checklist.");

    setEnviando(true);
    try {
      const plan = await crearPlan({
        nombre: nombre.trim(),
        frecuencia_dias: dias,
        descripcion: descripcion.trim() || null,
        es_generica: esGenerica,
        tipo_equipo_id: esGenerica ? null : tipoEquipoId,
        items: itemsValidos.map((it, i) => ({
          orden: i + 1,
          descripcion: it.descripcion,
          obligatorio: it.obligatorio,
        })),
      });
      toast.success(`Checklist creado: ${plan.nombre}`);
      navegar(`/mantenimientos/${plan.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo crear el checklist.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={cs.pagina}>
      <div style={cs.contenido}>
        <Volver a="/mantenimientos" />
        <Encabezado titulo="Nuevo checklist" subtitulo="Plan de mantenimiento preventivo" />

        <div style={estilos.tarjeta}>
          <div style={estilos.grilla2}>
            <Campo etiqueta="Nombre del checklist">
              <input
                style={cs.input}
                placeholder="Ej: MP anual de desfibrilador"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </Campo>
            <Campo etiqueta="Frecuencia sugerida (en días)" ayuda="Ej: 365 = una vez por año.">
              <input
                type="number"
                min="1"
                style={cs.input}
                value={frecuenciaDias}
                onChange={(e) => setFrecuenciaDias(e.target.value)}
              />
            </Campo>
          </div>

          <label style={estilos.checkboxFila}>
            <input
              type="checkbox"
              checked={esGenerica}
              onChange={(e) => setEsGenerica(e.target.checked)}
            />
            <span style={estilos.checkboxTexto}>
              Es el checklist genérico (se usa para equipos sin uno propio)
            </span>
          </label>

          {!esGenerica && (
            <div style={{ marginTop: 14 }}>
              <Campo etiqueta="Tipo de equipo">
                {cargandoTipos ? (
                  <p style={estilos.ayuda}>Cargando tipos de equipo...</p>
                ) : (
                  <select style={cs.input} value={tipoEquipoId} onChange={(e) => setTipoEquipoId(e.target.value)}>
                    <option value="">Elegí un tipo</option>
                    {tipos.map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                )}
              </Campo>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <Campo etiqueta="Descripción (opcional)">
              <textarea
                style={{ ...cs.input, minHeight: 70, resize: "vertical" }}
                placeholder="Para qué sirve este checklist, alcance, etc."
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </Campo>
          </div>
        </div>

        <div style={estilos.tarjeta}>
          <p style={estilos.tituloItems}>Ítems del checklist</p>
          <div style={estilos.listaItems}>
            {items.map((it, i) => (
              <div key={i} style={estilos.filaItem}>
                <span style={estilos.numeroItem}>{i + 1}</span>
                <input
                  style={{ ...cs.input, flex: 1 }}
                  placeholder="Ej: verificar carga de batería"
                  value={it.descripcion}
                  onChange={(e) => cambiarItem(i, "descripcion", e.target.value)}
                />
                <label style={estilos.obligatorioFila}>
                  <input
                    type="checkbox"
                    checked={it.obligatorio}
                    onChange={(e) => cambiarItem(i, "obligatorio", e.target.checked)}
                  />
                  Obligatorio
                </label>
                {items.length > 1 && (
                  <button
                    type="button"
                    style={estilos.quitarBoton}
                    onClick={() => quitarItem(i)}
                    title="Quitar este ítem"
                  >
                    <X size={16} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" style={{ ...boton("secundario"), gap: 7, marginTop: 12 }} onClick={agregarItem}>
            <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
            Agregar ítem
          </button>
        </div>

        {error && <p style={estilos.error}>{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button style={boton("primario")} onClick={enviar} disabled={enviando}>
            {enviando ? "Creando..." : "Crear checklist"}
          </button>
          <button style={boton("secundario")} onClick={() => navegar("/mantenimientos")} disabled={enviando}>
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
  tarjeta: { ...cs.tarjeta, padding: 22, marginBottom: 16 },
  grilla2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
    marginBottom: 16,
  },
  ayuda: { fontSize: "0.78rem", color: color.textoDebil, margin: "6px 0 0" },
  error: { fontSize: "0.85rem", color: color.peligro, margin: "8px 0" },
  checkboxFila: { display: "flex", alignItems: "center", gap: 10, cursor: "pointer" },
  checkboxTexto: { fontSize: "0.92rem", color: color.texto, fontWeight: 600 },
  tituloItems: { margin: "0 0 14px", fontSize: "0.95rem", fontWeight: 700, color: color.texto },
  listaItems: { display: "flex", flexDirection: "column", gap: 10 },
  filaItem: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  numeroItem: {
    width: 22, height: 22, borderRadius: "50%", background: color.primarioClaro,
    color: color.primarioOscuro, fontSize: "0.75rem", fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  obligatorioFila: {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: "0.8rem", color: color.textoSuave, whiteSpace: "nowrap",
  },
  quitarBoton: {
    background: "transparent", border: "none", cursor: "pointer",
    color: color.textoDebil, display: "flex", padding: 4, flexShrink: 0,
  },
};

export default NuevoPlan;