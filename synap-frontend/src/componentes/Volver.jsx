// Volver.jsx — el botón de retroceso que va arriba a la izquierda en toda
// pantalla de detalle.
//
// Por defecto usa el historial del navegador (te devuelve exactamente a donde
// estabas). Con la prop "a" se puede forzar un destino fijo, para los casos
// donde se puede llegar desde varios lados.

import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { color } from "../tema";

function Volver({ a, texto = "Volver" }) {
  const navegar = useNavigate();

  return (
    <button
      onClick={() => (a ? navegar(a) : navegar(-1))}
      style={estilos.boton}
    >
      <ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />
      {texto}
    </button>
  );
}

const estilos = {
  boton: {
    display: "inline-flex", alignItems: "center", gap: 7,
    background: "transparent", border: "none", padding: "6px 10px 6px 0",
    color: color.textoSuave, fontSize: "0.88rem", fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", marginBottom: 6,
  },
};

export default Volver;