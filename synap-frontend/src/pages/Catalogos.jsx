// Catalogos.jsx — alta y consulta de los catálogos de equipos: tipos de
// equipo (ej: "Desfibrilador", "Monitor multiparamétrico") y servicios/áreas
// del hospital (ej: "UTI", "Anestesia").
//
// Antes esto solo se podía cargar tocando la base de datos a mano en
// Supabase. Ahora coordinación (y jefatura) lo puede hacer desde acá, en
// cualquier momento — por ejemplo, si entra un tipo de equipo nuevo (un
// robot quirúrgico) o se abre un servicio nuevo. Es su propia pantalla,
// aparte del alta de un equipo puntual, para que quede accesible desde el
// menú y no escondida dentro de otro formulario.
//
// Solo coordinación y jefatura la tienen en el menú (ver Cascaron.jsx); el
// resto de los roles ni siquiera llega acá. Igual, por las dudas, los
// botones de "Nuevo..." quedan ocultos para cualquier otro rol.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Boxes, Building2 } from "lucide-react";
import { catalogosParaAlta, crearTipoEquipo, crearServicio } from "../api/activos";
import { rolActual } from "../api/auth";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton } from "../tema";

const PUEDE_CREAR = ["coordinacion", "jefatura"];

function Catalogos() {
  const puedeCrear = PUEDE_CREAR.includes(rolActual());
  const [catalogos, setCatalogos] = useState({ tipos: [], sectores: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(""); // "" | "tipo" | "servicio"

  function cargar() {
    setCargando(true);
    setError("");
    catalogosParaAlta()
      .then(setCatalogos)
      .catch(() => setError("No se pudieron cargar los catálogos."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  function alCrear() {
    setModal("");
    cargar();
  }

  return (
    <>
      <Encabezado titulo="Catálogos" subtitulo="Tipos de equipo y servicios/áreas del hospital" />

      {error && <p style={estilos.error}>{error}</p>}

      <div style={estilos.grilla}>
        <Seccion
          icono={<Boxes size={18} strokeWidth={1.9} color={color.primario} aria-hidden="true" />}
          titulo="Tipos de equipo"
          ayuda='El código de cada uno va en el código de los equipos de ese tipo (ej: "ROBT" en B-INTR-ROBT-001).'
          items={catalogos.tipos}
          cargando={cargando}
          puedeCrear={puedeCrear}
          onNuevo={() => setModal("tipo")}
          textoNuevo="Nuevo tipo de equipo"
        />
        <Seccion
          icono={<Building2 size={18} strokeWidth={1.9} color={color.primario} aria-hidden="true" />}
          titulo="Servicios / áreas"
          ayuda="Los sectores del hospital donde están instalados los equipos."
          items={catalogos.sectores}
          cargando={cargando}
          puedeCrear={puedeCrear}
          onNuevo={() => setModal("servicio")}
          textoNuevo="Nuevo servicio"
        />
      </div>

      {modal && (
        <ModalNuevoCatalogo variante={modal} onCancelar={() => setModal("")} onCreado={alCrear} />
      )}
    </>
  );
}

function Seccion({ icono, titulo, ayuda, items, cargando, puedeCrear, onNuevo, textoNuevo }) {
  return (
    <div style={estilos.tarjeta}>
      <div style={estilos.seccionCabecera}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          {icono}
          <p style={estilos.seccionTitulo}>{titulo}</p>
        </div>
        {puedeCrear && (
          <button
            style={{ ...boton("secundario"), gap: 6, padding: "7px 12px", fontSize: "0.82rem" }}
            onClick={onNuevo}
          >
            <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
            {textoNuevo}
          </button>
        )}
      </div>
      <p style={estilos.seccionAyuda}>{ayuda}</p>

      {cargando ? (
        <p style={estilos.mensaje}>Cargando…</p>
      ) : items.length === 0 ? (
        <p style={estilos.mensaje}>Todavía no hay ninguno cargado.</p>
      ) : (
        <div style={estilos.lista}>
          {items.map((it) => (
            <div key={it.id} style={estilos.item}>
              <span style={estilos.itemCodigo}>{it.id}</span>
              <span style={estilos.itemNombre}>{it.nombre}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modal de alta: mismo formulario para tipo de equipo o servicio, con el
// campo de centro de costos aparte (solo aplica a servicios). ───
function ModalNuevoCatalogo({ variante, onCancelar, onCreado }) {
  const esServicio = variante === "servicio";
  const [id, setId] = useState("");
  const [nombre, setNombre] = useState("");
  const [centroCostos, setCentroCostos] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function crear() {
    setError("");
    if (!id.trim()) return setError("Indicá el código.");
    if (!nombre.trim()) return setError("Indicá el nombre.");
    if (esServicio && !centroCostos.trim()) return setError("Indicá el centro de costos.");

    setEnviando(true);
    try {
      const creado = esServicio
        ? await crearServicio({
            id: id.trim(),
            nombre: nombre.trim(),
            centro_costos: centroCostos.trim(),
            descripcion: descripcion.trim() || null,
          })
        : await crearTipoEquipo({
            id: id.trim(),
            nombre: nombre.trim(),
            descripcion: descripcion.trim() || null,
          });
      toast.success(`${esServicio ? "Servicio" : "Tipo de equipo"} creado: ${creado.id} — ${creado.nombre}`);
      onCreado();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo crear.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={estilos.overlay} onClick={onCancelar}>
      <div style={estilos.modal} onClick={(e) => e.stopPropagation()}>
        <p style={estilos.modalTitulo}>{esServicio ? "Nuevo servicio / área" : "Nuevo tipo de equipo"}</p>

        <Campo
          etiqueta="Código"
          ayuda={
            esServicio
              ? "Corto, sin espacios (ej: UTI)."
              : "Corto, sin espacios. Va en el código de cada equipo de este tipo (ej: ROBT para \"Robot quirúrgico\")."
          }
        >
          <input
            style={cs.input}
            placeholder={esServicio ? "Ej: UTI" : "Ej: ROBT"}
            value={id}
            onChange={(e) => setId(e.target.value.toUpperCase())}
            autoFocus
          />
        </Campo>

        <div style={{ marginTop: 14 }}>
          <Campo etiqueta="Nombre">
            <input
              style={cs.input}
              placeholder={esServicio ? "Ej: Unidad de Terapia Intensiva" : "Ej: Robot quirúrgico"}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </Campo>
        </div>

        {esServicio && (
          <div style={{ marginTop: 14 }}>
            <Campo etiqueta="Centro de costos">
              <input style={cs.input} value={centroCostos} onChange={(e) => setCentroCostos(e.target.value)} />
            </Campo>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <Campo etiqueta="Descripción (opcional)">
            <input style={cs.input} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </Campo>
        </div>

        {error && <p style={estilos.error}>{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button style={boton("primario")} onClick={crear} disabled={enviando}>
            {enviando ? "Creando..." : "Crear"}
          </button>
          <button style={boton("secundario")} onClick={onCancelar} disabled={enviando}>
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
  error: { fontSize: "0.85rem", color: color.peligro, margin: "8px 0 16px" },
  mensaje: { color: color.textoDebil, fontSize: "0.85rem", padding: "6px 0 2px" },
  grilla: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 16,
  },
  tarjeta: { ...cs.tarjeta, padding: 20 },
  seccionCabecera: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 10, flexWrap: "wrap",
  },
  seccionTitulo: { margin: 0, fontSize: "1rem", fontWeight: 700, color: color.texto },
  seccionAyuda: { fontSize: "0.8rem", color: color.textoDebil, margin: "6px 0 14px", lineHeight: 1.5 },
  lista: { display: "flex", flexDirection: "column", gap: 6 },
  item: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "9px 12px", borderRadius: 10, background: color.fondo,
  },
  itemCodigo: {
    fontFamily: "ui-monospace, monospace", fontWeight: 700, fontSize: "0.82rem",
    color: color.primarioOscuro, background: color.primarioClaro,
    padding: "2px 7px", borderRadius: 6, flexShrink: 0,
  },
  itemNombre: { fontSize: "0.87rem", color: color.texto },
  overlay: {
    position: "fixed", inset: 0, background: "rgba(15,20,30,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 16, zIndex: 50,
  },
  modal: {
    ...cs.tarjeta, padding: 24, width: "100%", maxWidth: 420,
    maxHeight: "90vh", overflowY: "auto",
  },
  modalTitulo: { margin: "0 0 16px", fontSize: "1.05rem", fontWeight: 700, color: color.texto },
  ayuda: { fontSize: "0.78rem", color: color.textoDebil, margin: "6px 0 0" },
};

export default Catalogos;