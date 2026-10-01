// DetallePlan.jsx — un checklist de mantenimiento en detalle: sus datos y
// todos sus ítems, en el orden en que se revisan.
//
// Edición (pedido de Cami, parte 3 de 3 de "poder editar con confirmación":
// ficha de equipo y OT no cerrada ya se podían editar): coordinación (y
// jefatura) pueden tocar "Editar checklist" y corregir nombre, frecuencia,
// descripción y los ítems propios del plan — agregar, sacar o corregir el
// texto de cada uno. Los dos ítems fijos de todo checklist ("Necesidad de
// correctivo", "Equipo operativo") no se muestran acá para editar: los
// agrega y preserva el backend solo, igual que al crear un plan.

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { verPlan, editarPlan } from "../api/planes";
import { rolActual } from "../api/auth";
import Encabezado from "../componentes/Encabezado";
import Volver from "../componentes/Volver";
import { color, cs, boton, insignia } from "../tema";

const PUEDE_EDITAR = ["coordinacion", "jefatura"];

// Estos dos ítems los agrega y mantiene el backend solo (ver
// ITEMS_OBLIGATORIOS_TODO_PLAN en routers/planes_mantenimiento.py): no se
// muestran en el formulario de edición para no dar la idea de que se pueden
// sacar o que hace falta tipearlos de nuevo.
const ITEMS_FIJOS = ["Necesidad de correctivo", "Equipo operativo"];

function DetallePlan() {
  const { id } = useParams();
  const [plan, setPlan] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [modoEdicion, setModoEdicion] = useState(false);

  const puedeEditar = PUEDE_EDITAR.includes(rolActual());

  useEffect(() => {
    verPlan(id)
      .then(setPlan)
      .catch(() => setError("No pudimos cargar este checklist."))
      .finally(() => setCargando(false));
  }, [id]);

  if (cargando) return <p style={estilos.mensaje}>Cargando...</p>;
  if (error || !plan) return <p style={{ ...estilos.mensaje, color: color.peligro }}>{error || "No encontrado."}</p>;

  return (
    <>
      <Volver />
      <Encabezado
        titulo={plan.nombre}
        subtitulo={`Cada ${plan.frecuencia_dias} días${plan.es_generica ? " · genérico" : ""}`}
      >
        {plan.es_generica && <span style={insignia("neutro")}>Genérico</span>}
        {puedeEditar && !modoEdicion && (
          <button style={boton("secundario")} onClick={() => setModoEdicion(true)}>
            Editar checklist
          </button>
        )}
      </Encabezado>

      {modoEdicion ? (
        <PanelEditarPlan
          plan={plan}
          setPlan={setPlan}
          cerrar={() => setModoEdicion(false)}
        />
      ) : (
        <>
          {plan.descripcion && (
            <div style={{ ...cs.tarjeta, padding: "14px 18px", marginBottom: 14 }}>
              <p style={estilos.etiqueta}>Descripción</p>
              <p style={estilos.texto}>{plan.descripcion}</p>
            </div>
          )}

          <div style={{ ...cs.tarjeta, padding: 18 }}>
            <p style={estilos.etiqueta}>Ítems del checklist ({plan.items.length})</p>
            {plan.items.length === 0 && <p style={estilos.mensaje}>Este checklist todavía no tiene ítems.</p>}
            <div style={estilos.listaItems}>
              {plan.items.map((it, i) => (
                <div key={it.id} style={estilos.item}>
                  <span style={estilos.itemNumero}>{i + 1}</span>
                  <span style={estilos.itemTexto}>{it.descripcion}</span>
                  {!it.obligatorio && <span style={insignia("neutro")}>Opcional</span>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ─── Editar el checklist (nombre, frecuencia, descripción e ítems) ───
// Mismo patrón de confirmación antes de guardar que la ficha del equipo y
// la edición de una OT: "Guardar cambios" valida, arma el diff (PATCH
// parcial de verdad) y recién ahí pide confirmación con un cartel.

function PanelEditarPlan({ plan, setPlan, cerrar }) {
  const [nombre, setNombre] = useState(plan.nombre);
  const [frecuenciaDias, setFrecuenciaDias] = useState(String(plan.frecuencia_dias));
  const [descripcion, setDescripcion] = useState(plan.descripcion || "");

  // Los ítems editables son los del plan MENOS los dos fijos — se cargan
  // con su id (para que el backend sepa que son ítems que ya existían, no
  // nuevos) y ordenados igual que se muestran.
  const itemsEditablesIniciales = plan.items
    .filter((it) => !ITEMS_FIJOS.includes(it.descripcion))
    .sort((a, b) => a.orden - b.orden)
    .map((it) => ({ id: it.id, descripcion: it.descripcion, obligatorio: it.obligatorio !== false }));
  const [items, setItems] = useState(
    itemsEditablesIniciales.length > 0 ? itemsEditablesIniciales : [{ id: null, descripcion: "", obligatorio: true }]
  );

  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  function agregarItem() {
    setItems((antes) => [...antes, { id: null, descripcion: "", obligatorio: true }]);
  }

  function quitarItem(indice) {
    setItems((antes) => antes.filter((_, i) => i !== indice));
  }

  function cambiarItem(indice, campo, valor) {
    setItems((antes) => antes.map((it, i) => (i === indice ? { ...it, [campo]: valor } : it)));
  }

  // Normaliza la lista actual de ítems (con descripción recortada, sin los
  // vacíos, y sin el id cuando el ítem es nuevo) para compararla contra la
  // que tenía el plan al abrir el formulario.
  function itemsNormalizados() {
    return items
      .map((it) => ({ ...it, descripcion: it.descripcion.trim() }))
      .filter((it) => it.descripcion)
      .map((it, i) => ({
        id: it.id || undefined,
        orden: i + 1,
        descripcion: it.descripcion,
        obligatorio: it.obligatorio,
      }));
  }

  // Solo se manda lo que realmente cambió — PATCH parcial de verdad.
  function armarCambios() {
    const cambios = {};
    const nombreTrim = nombre.trim();
    if (nombreTrim !== plan.nombre) cambios.nombre = nombreTrim;

    const dias = Number(frecuenciaDias);
    if (dias !== plan.frecuencia_dias) cambios.frecuencia_dias = dias;

    const descTrim = descripcion.trim();
    if (descTrim !== (plan.descripcion || "")) cambios.descripcion = descTrim || null;

    const itemsNuevos = itemsNormalizados();
    const itemsOriginales = itemsEditablesIniciales.map((it, i) => ({
      id: it.id || undefined,
      orden: i + 1,
      descripcion: it.descripcion,
      obligatorio: it.obligatorio,
    }));
    if (JSON.stringify(itemsNuevos) !== JSON.stringify(itemsOriginales)) {
      cambios.items = itemsNuevos;
    }

    return cambios;
  }

  function pedirConfirmacion() {
    setError("");
    if (!nombre.trim()) return setError("Indicá un nombre para el checklist.");
    const dias = Number(frecuenciaDias);
    if (!dias || dias <= 0) return setError("Indicá cada cuántos días se sugiere repetir este mantenimiento.");
    if (itemsNormalizados().length === 0) return setError("Agregá al menos un ítem al checklist.");

    const cambios = armarCambios();
    if (Object.keys(cambios).length === 0) {
      setError("No cambiaste nada todavía.");
      return;
    }
    setConfirmando(true);
  }

  async function confirmarGuardado() {
    setEnviando(true);
    try {
      const actualizado = await editarPlan(plan.id, armarCambios());
      setPlan(actualizado);
      toast.success("Cambios guardados.");
      cerrar();
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudieron guardar los cambios.");
      setConfirmando(false);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ ...cs.tarjeta, padding: 22, marginBottom: 16 }}>
      <p style={estilos.tituloItems}>Editar checklist</p>

      <div style={estilos.grilla2}>
        <Campo etiqueta="Nombre del checklist">
          <input style={cs.input} value={nombre} onChange={(e) => setNombre(e.target.value)} />
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

      <div style={{ marginTop: 16, marginBottom: 20 }}>
        <Campo etiqueta="Descripción (opcional)">
          <textarea
            style={{ ...cs.input, minHeight: 70, resize: "vertical" }}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </Campo>
      </div>

      <p style={estilos.tituloItems}>Ítems del checklist</p>
      <p style={estilos.ayuda}>
        "Necesidad de correctivo" y "Equipo operativo" van siempre al final de
        todo checklist y no se editan acá.
      </p>
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

      {error && <p style={estilos.error}>{error}</p>}

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button style={boton("primario")} onClick={pedirConfirmacion} disabled={enviando}>
          Guardar cambios
        </button>
        <button style={boton("fantasma")} onClick={cerrar} disabled={enviando}>Cancelar</button>
      </div>

      {confirmando && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(15, 23, 32, 0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, zIndex: 50,
          }}
          onClick={() => !enviando && setConfirmando(false)}
        >
          <div
            style={{ ...cs.tarjeta, padding: 22, width: "100%", maxWidth: 380 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: 0, fontWeight: 700, fontSize: "1rem", color: color.texto }}>
              ¿Confirmás que querés modificar este checklist?
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "0.88rem", color: color.textoSuave }}>
              Se van a guardar los cambios en "{plan.nombre}". Un ítem que
              saques no se borra: queda de historial en los mantenimientos ya
              hechos, pero deja de aparecer en los próximos.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button style={boton("primario")} onClick={confirmarGuardado} disabled={enviando}>
                {enviando ? "Guardando..." : "Sí, guardar cambios"}
              </button>
              <button style={boton("secundario")} onClick={() => setConfirmando(false)} disabled={enviando}>
                Seguir editando
              </button>
            </div>
          </div>
        </div>
      )}
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
  etiqueta: {
    fontSize: "0.7rem", color: color.textoDebil, textTransform: "uppercase",
    letterSpacing: "0.02em", fontWeight: 600, marginBottom: 10,
  },
  texto: { margin: 0, fontSize: "0.9rem", color: color.texto, lineHeight: 1.5 },
  listaItems: { display: "flex", flexDirection: "column", gap: 8 },
  item: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 12px", borderRadius: 10,
    background: color.fondo, border: `1px solid ${color.bordeSuave}`,
  },
  itemNumero: {
    width: 22, height: 22, borderRadius: "50%", background: color.primarioClaro,
    color: color.primarioOscuro, fontSize: "0.75rem", fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  itemTexto: { fontSize: "0.9rem", color: color.texto, flex: 1 },
  grilla2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },
  ayuda: { fontSize: "0.78rem", color: color.textoDebil, margin: "6px 0 0" },
  error: { fontSize: "0.85rem", color: color.peligro, margin: "10px 0 0" },
  tituloItems: { margin: "0 0 14px", fontSize: "0.95rem", fontWeight: 700, color: color.texto },
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

export default DetallePlan;