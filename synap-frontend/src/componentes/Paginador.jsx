// Paginador.jsx — las flechas "← Anterior · Página X de Y · Siguiente →" que
// comparten las listas largas (Activos, Órdenes de trabajo, Accesorios).
//
// Es solo la barra: cada pantalla sabe en qué página está (pagina, empieza en
// 0) y cuántas hay (totalPaginas), y recibe el número de página nuevo en
// onCambiar. Si hay una sola página no dibuja nada.
//
// Al cambiar de página vuelve a la barra, para no quedar a mitad de una lista
// distinta de la que se estaba mirando.

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { color, boton } from "../tema";

function Paginador({ pagina, totalPaginas, onCambiar, deshabilitado = false }) {
  const ref = useRef(null);
  if (totalPaginas <= 1) return null;

  function ir(n) {
    onCambiar(n);
    ref.current?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div ref={ref} style={estilos.barra}>
      <button
        style={{ ...boton("secundario"), gap: 6 }}
        onClick={() => ir(pagina - 1)}
        disabled={deshabilitado || pagina === 0}
      >
        <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
        Anterior
      </button>
      <span style={estilos.texto}>Página {pagina + 1} de {totalPaginas}</span>
      <button
        style={{ ...boton("secundario"), gap: 6 }}
        onClick={() => ir(pagina + 1)}
        disabled={deshabilitado || pagina + 1 >= totalPaginas}
      >
        Siguiente
        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}

const estilos = {
  barra: {
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: 14, flexWrap: "wrap", marginBottom: 14,
  },
  texto: { fontSize: "0.88rem", color: color.textoSuave, fontWeight: 600 },
};

export default Paginador;