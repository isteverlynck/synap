// Activos.jsx — el listado de equipos, con búsqueda, filtros y paginación.
//
// La búsqueda y los filtros los resuelve el BACKEND, no el navegador: filtrar
// una lista que ya está en pantalla solo alcanzaría si estuvieran todos los
// equipos cargados. Con los datos reales del hospital (más de 6000 equipos)
// eso tampoco entra de una: se muestra de a páginas de 50 equipos (limit/offset
// al backend), con las flechas "Anterior / Siguiente" arriba de la lista. El
// total real viene en el header X-Total-Count de cada respuesta.
//
// "Descargar CSV" baja la tabla con los mismos filtros que están puestos.
//
// El buscador + "Filtros" plegable y las flechas de página son componentes
// compartidos con Órdenes y Accesorios (BarraFiltros y Paginador), para que
// todas las listas se vean y se usen igual.

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Download } from "lucide-react";
import { listarActivosConTotal, opcionesDeFiltro } from "../api/activos";
import { listarSiglas, listarUbicaciones } from "../api/catalogos";
import { rolActual } from "../api/auth";
import { descargarCSV } from "../api/exportar";
import { toast } from "sonner";
import Encabezado from "../componentes/Encabezado";
import CodigoConGlosario from "../componentes/CodigoConGlosario";
import BarraFiltros, { CampoFiltro } from "../componentes/BarraFiltros";
import Paginador from "../componentes/Paginador";
import { armarDiccionarioSiglas } from "../utiles/codigos";
import { color, cs, boton, insignia, tonoEstadoActivo } from "../tema";

// Quién puede dar de alta un equipo nuevo. Enfermería no: para ellos "Activos"
// es solo consulta (reportan un problema desde la ficha, no cargan equipos).
const PUEDE_CREAR = ["coordinacion", "tecnico", "junior", "jefatura"];

// Quién puede bajar el CSV de equipos (el backend lo exige igual).
const PUEDE_DESCARGAR = ["coordinacion", "tecnico", "junior", "jefatura"];

// Cuántos equipos se muestran por página.
const POR_PAGINA = 50;

function Activos() {
  const navegar = useNavigate();
  const puedeCrear = PUEDE_CREAR.includes(rolActual());
  const puedeDescargar = PUEDE_DESCARGAR.includes(rolActual());
  const [activos, setActivos] = useState([]);
  const [total, setTotal] = useState(0);
  const [opciones, setOpciones] = useState({ tipos: [], sectores: [], grupos: [], estados: [] });
  const [siglas, setSiglas] = useState([]);
  const [ubicacionesCatalogo, setUbicacionesCatalogo] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState("");

  // Lo que escribe la persona y lo que efectivamente se busca son dos cosas
  // distintas: sin eso, cada tecla dispararía una llamada al backend.
  const [textoEscrito, setTextoEscrito] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtros, setFiltros] = useState({ estado: "", tipoEquipoId: "", sectorId: "", grupoId: "" });

  // Página actual (0 = la primera). Se guarda junto con la búsqueda/filtros a
  // los que corresponde: si cambia cualquiera de ellos, la página vuelve sola
  // a la primera, sin pedir dos veces al servidor.
  const claveConsulta = JSON.stringify([busqueda, filtros]);
  const [paginaGuardada, setPaginaGuardada] = useState({ clave: claveConsulta, pagina: 0 });
  // Si cambió la búsqueda o algún filtro, la página guardada ya no corresponde:
  // se vuelve a la primera (así, al limpiar los filtros, tampoco reaparece una
  // página vieja).
  if (paginaGuardada.clave !== claveConsulta) {
    setPaginaGuardada({ clave: claveConsulta, pagina: 0 });
  }
  const pagina = paginaGuardada.clave === claveConsulta ? paginaGuardada.pagina : 0;

  function irAPagina(n) {
    setPaginaGuardada({ clave: claveConsulta, pagina: n });
  }

  useEffect(() => {
    opcionesDeFiltro().then(setOpciones).catch(() => {});
    listarSiglas().then(setSiglas).catch(() => {});
    listarUbicaciones().then(setUbicacionesCatalogo).catch(() => {});
  }, []);

  // Diccionario sigla → significado para el cartelito de código/ubicación
  // (glosario de siglas + tipos de equipo, que ya trae su propio nombre).
  const diccionarioSiglas = armarDiccionarioSiglas(siglas, opciones.tipos);

  // Código de ubicación exacto → descripción completa (catálogo relevado del
  // hospital). Tiene prioridad sobre el glosario de siglas en el cartelito,
  // porque es la descripción real de ESE código puntual, no una decodificación
  // armada segmento por segmento.
  const diccionarioUbicaciones = Object.fromEntries(
    ubicacionesCatalogo.map((u) => [u.codigo, u.descripcion])
  );

  // Esperamos 350 ms sin que teclee antes de buscar. Es lo que hace que se
  // sienta instantáneo sin castigar al servidor con una consulta por letra.
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(textoEscrito), 350);
    return () => clearTimeout(t);
  }, [textoEscrito]);

  // Cada vez que cambia la búsqueda, los filtros o la página, se pide al
  // backend esa página. Si la persona cambia de página o de filtro antes de
  // que llegue la respuesta anterior, esa respuesta vieja se descarta.
  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError("");
    listarActivosConTotal({ buscar: busqueda, ...filtros, limit: POR_PAGINA, offset: pagina * POR_PAGINA })
      .then(({ items, total: totalNuevo }) => {
        if (!vigente) return;
        setActivos(items);
        setTotal(totalNuevo);
        // Si la página pedida quedó vacía (ej.: se achicó el total), a la primera.
        if (items.length === 0 && totalNuevo > 0 && pagina > 0) {
          setPaginaGuardada({ clave: claveConsulta, pagina: 0 });
        }
      })
      .catch(() => { if (vigente) setError("No se pudieron cargar los activos."); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, filtros, pagina]);

  const filtrosActivos = Object.values(filtros).filter(Boolean).length;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const primerEquipo = pagina * POR_PAGINA + 1;

  // Baja el CSV con la búsqueda y los filtros que están puestos ahora.
  async function descargar() {
    setDescargando(true);
    try {
      const params = new URLSearchParams();
      if (busqueda) params.set("buscar", busqueda);
      if (filtros.estado) params.set("estado", filtros.estado);
      if (filtros.tipoEquipoId) params.set("tipo_equipo_id", filtros.tipoEquipoId);
      if (filtros.sectorId) params.set("sector_id", filtros.sectorId);
      if (filtros.grupoId) params.set("grupo_id", filtros.grupoId);
      const consulta = params.toString();
      await descargarCSV(`/exportar/activos${consulta ? `?${consulta}` : ""}`, "equipos");
    } catch {
      toast.error("No se pudo generar el CSV. Probá de nuevo.");
    } finally {
      setDescargando(false);
    }
  }

  function limpiarFiltros() {
    setFiltros({ estado: "", tipoEquipoId: "", sectorId: "", grupoId: "" });
  }

  return (
    <>
      <Encabezado
        titulo="Activos"
        subtitulo={cargando ? "Buscando..." : textoDelSubtitulo(activos.length, total, busqueda, filtrosActivos, primerEquipo)}
      >
        {puedeCrear && (
          <button style={{ ...boton("primario"), gap: 7 }} onClick={() => navegar("/activos/nuevo")}>
            <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
            Nuevo equipo
          </button>
        )}
        <button style={boton("secundario")} onClick={() => navegar("/escanear")}>
          Escanear equipo (QR)
        </button>
        {puedeDescargar && (
          <button
            style={{ ...boton("secundario"), gap: 7 }}
            onClick={descargar}
            disabled={descargando}
            title="Descarga los equipos con la búsqueda y los filtros que tenés puestos"
          >
            <Download size={16} strokeWidth={1.9} aria-hidden="true" />
            {descargando ? "Generando..." : "Descargar CSV"}
          </button>
        )}
      </Encabezado>


      {/* ─── Buscador + filtros plegables ─── */}
      <BarraFiltros
        placeholder="Buscar por código, nombre, marca o número de serie"
        texto={textoEscrito}
        onTexto={setTextoEscrito}
        filtrosActivos={filtrosActivos}
        onLimpiar={limpiarFiltros}
      >
        <CampoFiltro
          etiqueta="Estado"
          valor={filtros.estado}
          onChange={(v) => setFiltros({ ...filtros, estado: v })}
          opciones={opciones.estados.map((e) => ({ id: e, nombre: e }))}
        />
        <CampoFiltro
          etiqueta="Tipo de equipo"
          valor={filtros.tipoEquipoId}
          onChange={(v) => setFiltros({ ...filtros, tipoEquipoId: v })}
          opciones={opciones.tipos}
        />
        <CampoFiltro
          etiqueta="Servicio"
          valor={filtros.sectorId}
          onChange={(v) => setFiltros({ ...filtros, sectorId: v })}
          opciones={opciones.sectores}
        />
        <CampoFiltro
          etiqueta="Grupo técnico"
          valor={filtros.grupoId}
          onChange={(v) => setFiltros({ ...filtros, grupoId: v })}
          opciones={opciones.grupos}
        />
      </BarraFiltros>

      {error && <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>}

      {!cargando && !error && activos.length === 0 && (
        <p style={estilos.mensaje}>
          No encontramos equipos con esa búsqueda. Probá con menos filtros o con
          parte del nombre del equipo.
        </p>
      )}

      {/* ─── Páginas: flechas arriba de la lista ─── */}
      <Paginador pagina={pagina} totalPaginas={totalPaginas} onCambiar={irAPagina} deshabilitado={cargando} />

      <div style={estilos.lista}>
        {activos.map((a) => (
          <div
            key={a.codigo}
            className="sy-clickeable"
            onClick={() => navegar(`/activos/${a.codigo}`)}
            style={estilos.tarjeta}
          >
            <div style={{ minWidth: 0 }}>
              {/* El código primero, grande: es el identificador con el que se
              ubica un equipo puntual (QR, etiqueta física). La lista viene
              ordenada del backend por fecha de instalación (más nuevo
              primero); el código es solo desempate. El nombre queda abajo,
              como dato secundario. */}
              <div style={estilos.codigo}>
                <CodigoConGlosario codigo={a.codigo} diccionario={diccionarioSiglas} />
                {a.ubicacion && (
                  <>
                    {" · "}
                    <CodigoConGlosario
                      codigo={a.ubicacion}
                      diccionario={diccionarioSiglas}
                      descripcionExacta={diccionarioUbicaciones[a.ubicacion]}
                    />
                  </>
                )}
              </div>
              <div style={estilos.descripcion}>{a.descripcion}</div>
              {(a.marca || a.modelo) && (
                <div style={estilos.detalle}>{[a.marca, a.modelo].filter(Boolean).join(" ")}</div>
              )}
            </div>
            <span style={insignia(tonoEstadoActivo(a.estado))}>{a.estado}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// El subtítulo dice si estás viendo todo o un recorte, para que nadie crea que
// el hospital tiene 50 equipos cuando en realidad hay varios miles y estás
// en una página.
function textoDelSubtitulo(cantidad, total, busqueda, filtrosActivos, primero) {
  const hayRecorte = total > cantidad;
  const rango = `${primero}–${primero + cantidad - 1}`;
  if (busqueda || filtrosActivos > 0) {
    const palabra = total === 1 ? "resultado" : "resultados";
    return hayRecorte ? `Mostrando ${rango} de ${total} ${palabra}` : `${cantidad} ${palabra}`;
  }
  return hayRecorte
    ? `Mostrando ${rango} de ${total} equipos registrados`
    : `${cantidad} equipos registrados`;
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "20px 0", lineHeight: 1.6 },
  lista: { display: "flex", flexDirection: "column", gap: 10 },
  tarjeta: {
    ...cs.tarjeta, padding: "14px 18px",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  },
  codigo: { fontSize: "0.97rem", color: color.texto, fontWeight: 700, fontFamily: "ui-monospace, monospace" },
  descripcion: { fontSize: "0.85rem", color: color.textoSuave, marginTop: 3 },
  detalle: { fontSize: "0.82rem", color: color.textoDebil, marginTop: 2 },
};

export default Activos;