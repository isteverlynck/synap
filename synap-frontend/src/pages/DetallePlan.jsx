// DetallePlan.jsx — un checklist de mantenimiento en detalle: sus datos y
// todos sus ítems, en el orden en que se revisan.

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { verPlan } from "../api/planes";
import Encabezado from "../componentes/Encabezado";
import Volver from "../componentes/Volver";
import { color, cs, insignia } from "../tema";

function DetallePlan() {
  const { id } = useParams();
  const [plan, setPlan] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

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
      <Volver a="/mantenimientos" />
      <Encabezado
        titulo={plan.nombre}
        subtitulo={`Cada ${plan.frecuencia_dias} días${plan.es_generica ? " · genérico" : ""}`}
      >
        {plan.es_generica && <span style={insignia("neutro")}>Genérico</span>}
      </Encabezado>

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
};

export default DetallePlan;