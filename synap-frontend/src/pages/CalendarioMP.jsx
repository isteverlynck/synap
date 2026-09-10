// CalendarioMP.jsx — calendario de mantenimientos preventivos.
//
// Muestra, mes por mes (cualquiera: pasado, actual o futuro — no solo los
// próximos 3), qué equipos tienen un mantenimiento preventivo esa fecha. Dos
// estados posibles por ítem:
//   - Ya generada: existe la OT real (el backend la generó solo — ver nota
//     abajo). Clickeable, lleva al detalle de la orden.
//   - Pronóstico: la próxima MP del equipo cae en ese mes pero la OT
//     todavía no se generó (normal en meses futuros). Lleva a la ficha del
//     equipo, no a una OT que no existe.
//
// El backend genera las OT preventivas SOLO: al arrancar, y todos los días
// por si es día 1 del mes (antes esto no lo disparaba nada). Por eso esta
// pantalla es de CONSULTA para cualquier rol — no hace falta apretar nada
// para que las órdenes existan. El botón "Generar ahora" es solo un
// resguardo manual (para coordinación/jefatura) por si el backend estuvo
// apagado un tiempo y no quieren esperar al próximo reinicio.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { calendarioPreventivas, generarPreventivas } from "../api/preventivas";
import { obtenerPerfil } from "../api/auth";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton, insignia } from "../tema";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const PUEDE_GENERAR = ["coordinacion", "jefatura"];

function CalendarioMP() {
  const navegar = useNavigate();
  const hoy = new Date();

  const [perfil, setPerfil] = useState(null);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1); // JS: 0-11 → nosotros: 1-12
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    obtenerPerfil().then(setPerfil).catch(() => setPerfil(null));
  }, []);

  useEffect(() => {
    cargar();
  }, [anio, mes]);

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const res = await calendarioPreventivas(anio, mes);
      setDatos(res);
    } catch {
      setError("No pudimos cargar el calendario de mantenimientos.");
    } finally {
      setCargando(false);
    }
  }

  function cambiarMes(delta) {
    let m = mes + delta;
    let a = anio;
    if (m > 12) { m = 1; a += 1; }
    if (m < 1) { m = 12; a -= 1; }
    setMes(m);
    setAnio(a);
  }

  function irAHoy() {
    setAnio(hoy.getFullYear());
    setMes(hoy.getMonth() + 1);
  }

  const esMesActual = anio === hoy.getFullYear() && mes === hoy.getMonth() + 1;

  async function generarAhora() {
    setGenerando(true);
    try {
      const res = await generarPreventivas(anio, mes);
      if (res.cantidad_generada > 0) {
        toast.success(`Se generaron ${res.cantidad_generada} OT preventivas.`);
      } else {
        toast.info("No había nada nuevo para generar este mes.");
      }
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo generar.");
    } finally {
      setGenerando(false);
    }
  }

  function irAlItem(item) {
    if (item.generada) {
      navegar(`/ordenes/${item.orden_id}`);
    } else {
      navegar(`/activos/${item.activo_codigo}`);
    }
  }

  const items = datos?.items || [];
  const puedeGenerar = PUEDE_GENERAR.includes(perfil?.rol);

  return (
    <>
      <Encabezado
        titulo="Calendario de mantenimientos"
        subtitulo="Preventivos generados y programados, mes a mes"
      />

      <div style={estilos.navegador}>
        <button style={estilos.flecha} onClick={() => cambiarMes(-1)} aria-label="Mes anterior">
          <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>

        <div style={estilos.mesActual}>
          <span style={estilos.mesTexto}>{MESES[mes - 1]} {anio}</span>
          {!esMesActual && (
            <button style={estilos.linkHoy} onClick={irAHoy}>Ir a hoy</button>
          )}
        </div>

        <button style={estilos.flecha} onClick={() => cambiarMes(1)} aria-label="Mes siguiente">
          <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
        </button>

        {puedeGenerar && (
          <button
            style={{ ...boton("fantasma"), marginLeft: "auto" }}
            onClick={generarAhora}
            disabled={generando}
            title="Resguardo manual: normalmente no hace falta, el backend genera solo."
          >
            {generando ? "Generando..." : "Generar ahora"}
          </button>
        )}
      </div>

      {error && <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>}

      {!cargando && !error && items.length === 0 && (
        <p style={estilos.mensaje}>
          No hay mantenimientos preventivos programados para {MESES[mes - 1].toLowerCase()} de {anio}.
        </p>
      )}

      <div style={estilos.lista}>
        {items.map((item) => (
          <div
            key={item.activo_codigo}
            className="sy-clickeable"
            style={estilos.tarjeta}
            onClick={() => irAlItem(item)}
          >
            <div style={{ minWidth: 0 }}>
              <p style={estilos.titulo}>{item.activo_descripcion}</p>
              <p style={estilos.codigo}>
                {item.activo_codigo}
                {item.activo_ubicacion ? ` · ${item.activo_ubicacion}` : ""}
                {item.grupo_id ? ` · ${item.grupo_id}` : ""}
              </p>
            </div>
            <span style={insignia(item.generada ? tonoEstadoOT(item.estado) : "neutro")}>
              {item.generada ? `OT-${String(item.numero_ot).padStart(4, "0")} · ${textoEstado(item.estado)}` : "Pronóstico"}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

// Mismo criterio de colores que la pantalla de Órdenes: azul = hay que
// hacerla, violeta = en curso, gris = terminada.
function tonoEstadoOT(estado) {
  if (estado === "CERRADA") return "apagado";
  if (estado === "EN_PROGRESO") return "proceso";
  return "pendiente";
}

function textoEstado(estado) {
  const nombres = { ABIERTA: "Abierta", EN_PROGRESO: "En progreso", CERRADA: "Cerrada" };
  return nombres[estado] || estado;
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "20px 0", lineHeight: 1.6 },
  navegador: {
    display: "flex", alignItems: "center", gap: 10,
    marginBottom: 18, flexWrap: "wrap",
  },
  flecha: {
    ...cs.tarjeta, width: 36, height: 36, padding: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", color: color.texto,
  },
  mesActual: { display: "flex", alignItems: "center", gap: 10, minWidth: 190 },
  mesTexto: { fontSize: "1.05rem", fontWeight: 700, color: color.texto },
  linkHoy: {
    background: "transparent", border: "none", cursor: "pointer",
    color: color.primario, fontSize: "0.8rem", fontWeight: 600,
    fontFamily: "inherit", padding: 0,
  },
  lista: { display: "flex", flexDirection: "column", gap: 10 },
  tarjeta: {
    ...cs.tarjeta, padding: "14px 18px",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  },
  titulo: { margin: 0, fontSize: "0.95rem", color: color.texto, fontWeight: 600 },
  codigo: {
    margin: "3px 0 0", fontSize: "0.8rem", color: color.textoSuave,
    fontFamily: "ui-monospace, monospace",
  },
};

export default CalendarioMP;