// CodigoConGlosario.jsx — envuelve un código (de equipo o de ubicación) y le
// agrega un cartelito nativo al pasar el mouse con el significado de sus
// siglas, cuando el glosario tiene algo para decodificar (ver
// utiles/codigos.js). Si no hay nada cargado para ese código puntual, se
// muestra igual pero sin cartelito ni subrayado — no hace falta que TODOS
// los códigos estén en el glosario para que esto sirva.

import { decodificarCodigo } from "../utiles/codigos";

function CodigoConGlosario({ codigo, diccionario, style, className }) {
  if (!codigo) return null;
  const decodificado = decodificarCodigo(codigo, diccionario);

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