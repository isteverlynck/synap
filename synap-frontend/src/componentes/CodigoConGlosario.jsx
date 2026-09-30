// CodigoConGlosario.jsx — envuelve un código (de equipo o de ubicación) y le
// agrega un cartelito nativo al pasar el mouse con el significado de sus
// siglas, cuando el glosario tiene algo para decodificar (ver
// utiles/codigos.js). Si no hay nada cargado para ese código puntual, se
// muestra igual pero sin cartelito ni subrayado — no hace falta que TODOS
// los códigos estén en el glosario para que esto sirva.
//
// descripcionExacta (opcional): cuando el código tiene una descripción
// completa y confiable en un catálogo propio (hoy: el catálogo de
// ubicaciones relevadas, por código exacto — ver diccionarioUbicaciones en
// Activos.jsx/FichaActivo.jsx), esa descripción se usa tal cual en vez de
// decodificar sigla por sigla, porque es más completa y no depende de que
// cada segmento esté cargado en el glosario.

import { decodificarCodigo } from "../utiles/codigos";

function CodigoConGlosario({ codigo, diccionario, descripcionExacta, style, className }) {
  if (!codigo) return null;
  const decodificado = descripcionExacta || decodificarCodigo(codigo, diccionario);

  return (
    <span
      title={decodificado || undefined}
      style={{
        ...(decodificado
          ? { cursor: "help", textDecoration: "underline dotted", textUnderlineOffset: 3 }
          : {}),
        ...style,
      }}
      className={className}
    >
      {codigo}
    </span>
  );
}

export default CodigoConGlosario;