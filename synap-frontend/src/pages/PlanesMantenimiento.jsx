// PlanesMantenimiento.jsx — listado de checklists de mantenimiento preventivo.
//
// Un "plan de mantenimiento" es la plantilla que define qué se revisa para un
// tipo de equipo (o el plan genérico, para los que no tienen uno propio) y
// cada cuántos días se sugiere. Solo coordinación (y jefatura) pueden crear
// planes nuevos — el resto de los roles ni siquiera llega a esta pantalla
// (no está en su menú).

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ClipboardCheck } from "lucide-react";
import { listarPlanes } from "../api/planes";
import { catalogosParaAlta } from "../api/activos";
import { rolActual } from "../api/auth";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton, insignia } from "../tema";

const PUEDE_CREAR = ["coordinacion", "jefatura"];

function PlanesMantenimiento() {
  const navegar = useNavigate();
  const puedeCrear = PUEDE_CREAR.includes(rolActual());
  const [planes, setPlanes] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([listarPlanes(), catalogosParaAlta()])
      .then(([pl, cat]) => {
        setPlanes(pl);
        setTipos(cat.tipos);
      })
      .catch(() => setError("No se pudieron cargar los checklists de mantenimiento."))
      .finally(() => setCargando(false));
  }, []);

  function nombreDeTipo(tipoEquipoId) {
    return tipos.find((t) => t.id === tipoEquipoId)?.nombre || tipoEquipoId;
  }

  return (
    <>
      <Encabezado
        titulo="Mantenimientos"
        subtitulo={cargando ? "Cargando..." : `${planes.length} checklist${planes.length === 1 ? "" : "s"} de mantenimiento`}
      >
        {puedeCrear && (
          <button style={{ ...boton("primario"), gap: 7 }} onClick={() => navegar("/mantenimientos/nuevo")}>
            <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
            Nuevo checklist
          </button>
        )}
      </Encabezado>

      {error && <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>}

      {!cargando && !error && planes.length === 0 && (
        <p style={estilos.mensaje}>
          Todavía no hay ningún checklist de mantenimiento cargado.
          {puedeCrear ? " Creá el primero con \"Nuevo checklist\"." : ""}
        </p>
      )}

      <div style={estilos.lista}>
        {planes.map((p) => (
          <div
            key={p.id}
            className="sy-clickeable"
            onClick={() => navegar(`/mantenimientos/${p.id}`)}
            style={estilos.tarjeta}
          >
            <div style={estilos.icono}>
              <ClipboardCheck size={18} strokeWidth={1.9} color={color.primario} aria-hidden="true" />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={estilos.nombre}>{p.nombre}</div>
              <div style={estilos.detalle}>
                {p.es_generica ? "Genérico — para equipos sin checklist propio" : nombreDeTipo(p.tipo_equipo_id)}
                {" · cada "}{p.frecuencia_dias}{" días"}
              </div>
            </div>
            {p.es_generica && <span style={insignia("neutro")}>Genérico</span>}
          </div>
        ))}
      </div>
    </>
  );
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "20px 0", lineHeight: 1.6 },
  lista: { display: "flex", flexDirection: "column", gap: 10 },
  tarjeta: {
    ...cs.tarjeta, padding: "14px 18px",
    display: "flex", alignItems: "center", gap: 14,
  },
  icono: {
    width: 36, height: 36, borderRadius: 10, background: color.primarioClaro,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  nombre: { fontSize: "0.97rem", color: color.texto, fontWeight: 600 },
  detalle: { fontSize: "0.82rem", color: color.textoSuave, marginTop: 3 },
};

export default PlanesMantenimiento;