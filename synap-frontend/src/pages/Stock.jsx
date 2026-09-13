// Stock.jsx — insumos y repuestos: seguimiento de stock, alta de insumos,
// pedidos de compra y su recepción, e historial de compras/consumos.
//
// Acceso: todos los roles menos enfermería (ver Cascaron.jsx). Dar de alta un
// insumo nuevo es carga de catálogo — igual criterio que Catalogos.jsx —, así
// que ese botón queda solo para coordinación (y jefatura, que siempre pasa).
// Registrar pedidos, marcar recibida una compra y consumir insumos SÍ lo
// puede hacer cualquiera que llegue a esta pantalla (técnico, junior,
// coordinación, jefatura) — es el trabajo del día a día.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  listarInsumos, crearInsumo, alertasDeStock, listarCompras,
  registrarPedidoCompra, recibirCompra, listarConsumos,
} from "../api/stock";
import { catalogosParaAlta } from "../api/activos";
import { rolActual } from "../api/auth";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton, insignia } from "../tema";

const PUEDE_CREAR_INSUMO = ["coordinacion", "jefatura"];

const NIVEL_TONO = { ok: "exito", reponer: "advertencia", critico: "peligro" };
const NIVEL_TEXTO = { ok: "Stock ok", reponer: "Conviene reponer", critico: "Stock crítico" };

function Stock() {
  const puedeCrearInsumo = PUEDE_CREAR_INSUMO.includes(rolActual());
  const [insumos, setInsumos] = useState([]);
  const [todosInsumos, setTodosInsumos] = useState([]); // para el nombre en el historial, sin importar el filtro de alertas
  const [tipos, setTipos] = useState([]);
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [modalNuevo, setModalNuevo] = useState(false);
  const [compras, setCompras] = useState([]);
  const [consumos, setConsumos] = useState([]);

  function cargarInsumos() {
    setCargando(true);
    setError("");
    alertasDeStock(soloAlertas)
      .then(setInsumos)
      .catch(() => setError("No se pudo cargar el stock."))
      .finally(() => setCargando(false));
    listarInsumos().then(setTodosInsumos).catch(() => {});
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(cargarInsumos, [soloAlertas]);

  function cargarHistorial() {
    listarCompras().then(setCompras).catch(() => {});
    listarConsumos().then(setConsumos).catch(() => {});
  }

  useEffect(cargarHistorial, []);
  useEffect(() => {
    catalogosParaAlta().then((c) => setTipos(c.tipos || [])).catch(() => {});
  }, []);

  function alCrearInsumo() {
    setModalNuevo(false);
    cargarInsumos();
  }

  async function marcarRecibida(insumoId) {
    try {
      const pendientes = await listarCompras({ insumoId, estado: "pedida" });
      const compra = pendientes[0];
      if (!compra) {
        toast.error("No encontramos el pedido pendiente de este insumo.");
        return;
      }
      await recibirCompra(compra.id);
      toast.success("Compra recibida: se sumó al stock.");
      cargarInsumos();
      cargarHistorial();
    } catch (e) {
      toast.error(e.response?.data?.detail || "No pudimos marcar la compra como recibida.");
    }
  }

  function nombrePorId(id) {
    const ins = todosInsumos.find((x) => x.id === id);
    return ins ? ins.nombre : "Insumo";
  }

  return (
    <>
      <Encabezado
        titulo="Insumos"
        subtitulo={cargando ? "Cargando..." : textoDelSubtitulo(insumos.length, soloAlertas)}
      >
        <button style={boton(soloAlertas ? "primario" : "secundario")} onClick={() => setSoloAlertas((v) => !v)}>
          {soloAlertas ? "Viendo solo alertas" : "Ver todos"}
        </button>
        {puedeCrearInsumo && (
          <button style={{ ...boton("primario"), gap: 7 }} onClick={() => setModalNuevo(true)}>
            <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
            Nuevo insumo
          </button>
        )}
      </Encabezado>

      {error && <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>}

      {!cargando && !error && insumos.length === 0 && (
        <p style={estilos.mensaje}>
          {soloAlertas ? "Ningún insumo necesita atención por ahora." : "Todavía no hay insumos cargados."}
        </p>
      )}

      <div style={estilos.lista}>
        {insumos.map((i) => (
          <InsumoCard
            key={i.id}
            insumo={i}
            onPedidoRegistrado={() => { cargarInsumos(); cargarHistorial(); }}
            onRecibida={() => marcarRecibida(i.id)}
          />
        ))}
      </div>

      <HistorialStock compras={compras} consumos={consumos} nombrePorId={nombrePorId} />

      {modalNuevo && (
        <ModalNuevoInsumo tipos={tipos} onCancelar={() => setModalNuevo(false)} onCreado={alCrearInsumo} />
      )}
    </>
  );
}

// ─── Cada insumo: nivel de alerta + acciones de pedido/recepción ───

function InsumoCard({ insumo, onPedidoRegistrado, onRecibida }) {
  const [pidiendo, setPidiendo] = useState(false);
  const [cantidad, setCantidad] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [numeroOrden, setNumeroOrden] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [recibiendo, setRecibiendo] = useState(false);
  const [error, setError] = useState("");

  async function confirmarPedido() {
    const cant = Number(cantidad);
    if (!cant || cant <= 0) { setError("Indicá una cantidad mayor a 0."); return; }
    setEnviando(true);
    setError("");
    try {
      await registrarPedidoCompra({
        insumo_id: insumo.id,
        cantidad: cant,
        fecha: new Date().toISOString().slice(0, 10),
        proveedor: proveedor.trim() || null,
        numero_orden: numeroOrden.trim() || null,
      });
      toast.success(`Pedido registrado: ${cant} de "${insumo.nombre}".`);
      setPidiendo(false);
      setCantidad(""); setProveedor(""); setNumeroOrden("");
      onPedidoRegistrado();
    } catch (e) {
      setError(e.response?.data?.detail || "No pudimos registrar el pedido.");
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarRecepcion() {
    setRecibiendo(true);
    await onRecibida();
    setRecibiendo(false);
  }

  return (
    <div style={estilos.tarjeta}>
      <div style={estilos.filaPrincipal}>
        <div style={{ minWidth: 0 }}>
          <div style={estilos.nombre}>{insumo.nombre}</div>
          {insumo.descripcion && <div style={estilos.detalle}>{insumo.descripcion}</div>}
          <div style={estilos.detalle}>
            Stock: {insumo.stock_actual ?? 0}{insumo.unidad ? ` ${insumo.unidad}` : ""}
            {" · "}mínimo {insumo.stock_minimo ?? 0}
            {" · "}reorden {insumo.punto_reorden ?? 0}
          </div>
        </div>
        <span style={insignia(NIVEL_TONO[insumo.nivel] || "neutro")}>
          {NIVEL_TEXTO[insumo.nivel] || insumo.nivel}
        </span>
      </div>

      <div style={estilos.filaAcciones}>
        {insumo.tiene_compra_pedida ? (
          <>
            <span style={insignia("pendiente")}>Pedido en camino</span>
            <button style={boton("secundario")} onClick={confirmarRecepcion} disabled={recibiendo}>
              {recibiendo ? "Marcando..." : "Marcar recibida"}
            </button>
          </>
        ) : (
          <button style={boton("secundario")} onClick={() => setPidiendo((v) => !v)}>
            {pidiendo ? "Cancelar" : "Registrar pedido de compra"}
          </button>
        )}
      </div>

      {pidiendo && (
        <div style={estilos.formPedido}>
          <label style={cs.label}>Cantidad</label>
          <input
            style={{ ...cs.input, marginBottom: 10 }}
            type="number"
            min="1"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
          />
          <label style={cs.label}>Proveedor (opcional)</label>
          <input
            style={{ ...cs.input, marginBottom: 10 }}
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
          />
          <label style={cs.label}>Número de orden (opcional)</label>
          <input
            style={{ ...cs.input, marginBottom: 10 }}
            value={numeroOrden}
            onChange={(e) => setNumeroOrden(e.target.value)}
          />
          {error && <p style={estilos.error}>{error}</p>}
          <button style={boton("primario")} onClick={confirmarPedido} disabled={enviando}>
            {enviando ? "Registrando..." : "Confirmar pedido"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Historial: compras y consumos, uno al lado del otro ───

function HistorialStock({ compras, consumos, nombrePorId }) {
  return (
    <div style={estilos.historialGrilla}>
      <div style={estilos.tarjetaHistorial}>
        <p style={estilos.panelTitulo}>Compras</p>
        {compras.length === 0 ? (
          <p style={estilos.mensaje}>Todavía no hay compras registradas.</p>
        ) : (
          <div style={estilos.lista}>
            {compras.map((c) => (
              <div key={c.id} style={estilos.filaHistorial}>
                <div style={{ minWidth: 0 }}>
                  <div style={estilos.nombre}>{nombrePorId(c.insumo_id)}</div>
                  <div style={estilos.detalle}>
                    {c.cantidad}{c.proveedor ? ` · ${c.proveedor}` : ""} · {c.fecha}
                  </div>
                </div>
                <span style={insignia(c.estado === "recibida" ? "exito" : "pendiente")}>
                  {c.estado === "recibida" ? "Recibida" : "Pedida"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={estilos.tarjetaHistorial}>
        <p style={estilos.panelTitulo}>Consumos</p>
        {consumos.length === 0 ? (
          <p style={estilos.mensaje}>Todavía no hay consumos registrados.</p>
        ) : (
          <div style={estilos.lista}>
            {consumos.map((c) => (
              <div key={c.id} style={estilos.filaHistorial}>
                <div style={{ minWidth: 0 }}>
                  <div style={estilos.nombre}>{nombrePorId(c.insumo_id)}</div>
                  <div style={estilos.detalle}>Cantidad: {c.cantidad}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal: alta de un insumo nuevo ───

function ModalNuevoInsumo({ tipos, onCancelar, onCreado }) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [unidad, setUnidad] = useState("");
  const [stockActual, setStockActual] = useState("0");
  const [stockMinimo, setStockMinimo] = useState("0");
  const [puntoReorden, setPuntoReorden] = useState("0");
  const [tipoEquipoId, setTipoEquipoId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function crear() {
    setError("");
    if (!nombre.trim()) return setError("Indicá el nombre del insumo.");
    const actual = Number(stockActual) || 0;
    const minimo = Number(stockMinimo) || 0;
    const reorden = Number(puntoReorden) || 0;
    if (actual < 0 || minimo < 0 || reorden < 0) {
      return setError("Las cantidades no pueden ser negativas.");
    }

    setEnviando(true);
    try {
      const creado = await crearInsumo({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        unidad: unidad.trim() || null,
        stock_actual: actual,
        stock_minimo: minimo,
        punto_reorden: reorden,
        tipo_equipo_id: tipoEquipoId || null,
      });
      toast.success(`Insumo creado: ${creado.nombre}`);
      onCreado();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo crear el insumo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={estilos.overlay} onClick={onCancelar}>
      <div style={estilos.modal} onClick={(e) => e.stopPropagation()}>
        <p style={estilos.modalTitulo}>Nuevo insumo</p>

        <label style={cs.label}>Nombre</label>
        <input
          style={{ ...cs.input, marginBottom: 12 }}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          autoFocus
        />

        <label style={cs.label}>Descripción (opcional)</label>
        <input
          style={{ ...cs.input, marginBottom: 12 }}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />

        <label style={cs.label}>Unidad (opcional)</label>
        <input
          style={{ ...cs.input, marginBottom: 12 }}
          placeholder="Ej: unidades, cajas, litros"
          value={unidad}
          onChange={(e) => setUnidad(e.target.value)}
        />

        <div style={estilos.grillaTres}>
          <div>
            <label style={cs.label}>Stock actual</label>
            <input style={cs.input} type="number" min="0" value={stockActual} onChange={(e) => setStockActual(e.target.value)} />
          </div>
          <div>
            <label style={cs.label}>Stock mínimo</label>
            <input style={cs.input} type="number" min="0" value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} />
          </div>
          <div>
            <label style={cs.label}>Punto de reorden</label>
            <input style={cs.input} type="number" min="0" value={puntoReorden} onChange={(e) => setPuntoReorden(e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={cs.label}>Tipo de equipo (opcional)</label>
          <select style={cs.input} value={tipoEquipoId} onChange={(e) => setTipoEquipoId(e.target.value)}>
            <option value="">Sin tipo específico (ej: guantes, alcohol en gel)</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
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

function textoDelSubtitulo(cantidad, soloAlertas) {
  if (soloAlertas) {
    return `${cantidad} ${cantidad === 1 ? "insumo necesita" : "insumos necesitan"} atención`;
  }
  return `${cantidad} ${cantidad === 1 ? "insumo cargado" : "insumos cargados"}`;
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "14px 0", lineHeight: 1.6 },
  error: { fontSize: "0.85rem", color: color.peligro, margin: "8px 0" },
  lista: { display: "flex", flexDirection: "column", gap: 10 },
  tarjeta: { ...cs.tarjeta, padding: "14px 18px" },
  filaPrincipal: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  nombre: { fontSize: "0.92rem", color: color.texto, fontWeight: 700 },
  detalle: { fontSize: "0.82rem", color: color.textoSuave, marginTop: 3 },
  filaAcciones: { display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" },
  formPedido: {
    marginTop: 12, paddingTop: 12, borderTop: `1px solid ${color.bordeSuave}`,
  },
  historialGrilla: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
    marginTop: 20,
  },
  tarjetaHistorial: { ...cs.tarjeta, padding: 18 },
  panelTitulo: { margin: "0 0 12px", fontSize: "0.95rem", fontWeight: 700, color: color.texto },
  filaHistorial: {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
    padding: "9px 0", borderBottom: `1px solid ${color.bordeSuave}`,
  },
  grillaTres: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
    gap: 12,
    marginTop: 14,
  },
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
};

export default Stock;