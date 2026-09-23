// Stock.jsx — insumos y repuestos: seguimiento de stock, alta de insumos,
// pedidos de compra y su recepción, ajustes manuales y el historial
// unificado de movimientos.
//
// Acceso: todos los roles menos enfermería (ver Cascaron.jsx). Dar de alta un
// insumo nuevo es carga de catálogo — igual criterio que Catalogos.jsx —, así
// que ese botón queda solo para coordinación (y jefatura, que siempre pasa).
// Registrar pedidos, marcar recibida una compra, consumir insumos y ajustar
// stock a mano SÍ lo puede hacer cualquiera que llegue a esta pantalla
// (técnico, junior, coordinación, jefatura) — es el trabajo del día a día.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  listarInsumos, crearInsumo, alertasDeStock, registrarPedidoCompra,
  recibirCompra, listarCompras, registrarAjuste, listarMovimientos,
} from "../api/stock";
import { catalogosParaAlta } from "../api/activos";
import { rolActual } from "../api/auth";
import Encabezado from "../componentes/Encabezado";
import { color, cs, boton, insignia } from "../tema";

const PUEDE_CREAR_INSUMO = ["coordinacion", "jefatura"];

const NIVEL_TONO = { ok: "exito", reponer: "advertencia", critico: "peligro" };
const NIVEL_TEXTO = { ok: "Stock ok", reponer: "Conviene reponer", critico: "Stock crítico" };

const ORIGEN_TEXTO = { compra: "Compra", consumo: "Consumo", ajuste: "Ajuste" };

// Valor especial para filtrar los insumos que no tienen tipo de equipo
// específico (ej: guantes, alcohol en gel) — no es un id real del catálogo.
const SIN_TIPO = "__sin_tipo__";

function Stock() {
  const puedeCrearInsumo = PUEDE_CREAR_INSUMO.includes(rolActual());
  const [insumos, setInsumos] = useState([]);
  const [todosInsumos, setTodosInsumos] = useState([]); // para nombre/unidad en el historial, sin importar el filtro de alertas
  const [tipos, setTipos] = useState([]);
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [modalNuevo, setModalNuevo] = useState(false);
  const [movimientos, setMovimientos] = useState([]);
  const [tipoFiltro, setTipoFiltro] = useState("");

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

  function cargarMovimientos() {
    listarMovimientos().then(setMovimientos).catch(() => {});
  }

  useEffect(cargarMovimientos, []);
  useEffect(() => {
    catalogosParaAlta().then((c) => setTipos(c.tipos || [])).catch(() => {});
  }, []);

  function alCrearInsumo() {
    setModalNuevo(false);
    cargarInsumos();
  }

  function alCambiarStock() {
    cargarInsumos();
    cargarMovimientos();
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
      alCambiarStock();
    } catch (e) {
      toast.error(e.response?.data?.detail || "No pudimos marcar la compra como recibida.");
    }
  }

  // Filtro por tipo de equipo, en el navegador: la lista de insumos es chica
  // (a diferencia de los activos), no hace falta pedírselo al backend.
  const insumosFiltrados = insumos.filter((i) => {
    if (!tipoFiltro) return true;
    if (tipoFiltro === SIN_TIPO) return !i.tipo_equipo_id;
    return i.tipo_equipo_id === tipoFiltro;
  });

  function nombrePorId(id) {
    const ins = todosInsumos.find((x) => x.id === id);
    return ins ? ins.nombre : "Insumo";
  }

  function unidadPorId(id) {
    const ins = todosInsumos.find((x) => x.id === id);
    return ins?.unidad || "";
  }

  return (
    <>
      <Encabezado
        titulo="Insumos"
        subtitulo={cargando ? "Cargando..." : textoDelSubtitulo(insumosFiltrados.length, soloAlertas, !!tipoFiltro)}
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

      <div style={estilos.barraFiltro}>
        <Filtro
          etiqueta="Tipo de insumo"
          valor={tipoFiltro}
          onChange={setTipoFiltro}
          opciones={[...tipos, { id: SIN_TIPO, nombre: "Sin tipo específico" }]}
        />
      </div>

      {error && <p style={{ ...estilos.mensaje, color: color.peligro }}>{error}</p>}

      {!cargando && !error && insumosFiltrados.length === 0 && (
        <p style={estilos.mensaje}>
          {tipoFiltro
            ? "Ningún insumo de ese tipo."
            : soloAlertas ? "Ningún insumo necesita atención por ahora." : "Todavía no hay insumos cargados."}
        </p>
      )}

      <div style={estilos.lista}>
        {insumosFiltrados.map((i) => (
          <InsumoCard
            key={i.id}
            insumo={i}
            onPedidoRegistrado={alCambiarStock}
            onRecibida={() => marcarRecibida(i.id)}
            onAjusteRegistrado={alCambiarStock}
          />
        ))}
      </div>

      <MovimientosHistorial movimientos={movimientos} nombrePorId={nombrePorId} unidadPorId={unidadPorId} />

      {modalNuevo && (
        <ModalNuevoInsumo tipos={tipos} onCancelar={() => setModalNuevo(false)} onCreado={alCrearInsumo} />
      )}
    </>
  );
}

// ─── Cada insumo: nivel de alerta + acciones de pedido/recepción/ajuste ───

function InsumoCard({ insumo, onPedidoRegistrado, onRecibida, onAjusteRegistrado }) {
  const [pidiendo, setPidiendo] = useState(false);
  const [cantidad, setCantidad] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [numeroOrden, setNumeroOrden] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [recibiendo, setRecibiendo] = useState(false);
  const [error, setError] = useState("");

  const [ajustando, setAjustando] = useState(false);
  const [tipoAjuste, setTipoAjuste] = useState("salida");
  const [cantidadAjuste, setCantidadAjuste] = useState("");
  const [motivoAjuste, setMotivoAjuste] = useState("");
  const [enviandoAjuste, setEnviandoAjuste] = useState(false);
  const [errorAjuste, setErrorAjuste] = useState("");

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

  async function confirmarAjuste() {
    const cant = Number(cantidadAjuste);
    if (!cant || cant <= 0) { setErrorAjuste("Indicá una cantidad mayor a 0."); return; }
    if (!motivoAjuste.trim()) { setErrorAjuste("Indicá el motivo del ajuste."); return; }
    setEnviandoAjuste(true);
    setErrorAjuste("");
    try {
      await registrarAjuste({
        insumoId: insumo.id,
        tipo: tipoAjuste,
        cantidad: cant,
        motivo: motivoAjuste.trim(),
      });
      toast.success(`Ajuste registrado: ${tipoAjuste === "entrada" ? "+" : "-"}${cant} de "${insumo.nombre}".`);
      setAjustando(false);
      setCantidadAjuste(""); setMotivoAjuste("");
      onAjusteRegistrado();
    } catch (e) {
      setErrorAjuste(e.response?.data?.detail || "No pudimos registrar el ajuste.");
    } finally {
      setEnviandoAjuste(false);
    }
  }

  return (
    <div style={estilos.tarjeta}>
      <div style={estilos.filaPrincipal}>
        <div style={{ minWidth: 0 }}>
          <div style={estilos.nombre}>
            {insumo.nombre}
            {insumo.codigo && <span style={estilos.codigo}>{insumo.codigo}</span>}
          </div>
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
        <button style={boton("secundario")} onClick={() => setAjustando((v) => !v)}>
          {ajustando ? "Cancelar" : "Ajustar stock"}
        </button>
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

      {ajustando && (
        <div style={estilos.formPedido}>
          <label style={cs.label}>Tipo de ajuste</label>
          <select
            style={{ ...cs.input, marginBottom: 10 }}
            value={tipoAjuste}
            onChange={(e) => setTipoAjuste(e.target.value)}
          >
            <option value="salida">Salida (merma, rotura, se encontró menos de lo que dice el sistema)</option>
            <option value="entrada">Entrada (se encontró stock sin registrar)</option>
          </select>
          <label style={cs.label}>Cantidad</label>
          <input
            style={{ ...cs.input, marginBottom: 10 }}
            type="number"
            min="1"
            value={cantidadAjuste}
            onChange={(e) => setCantidadAjuste(e.target.value)}
          />
          <label style={cs.label}>Motivo</label>
          <input
            style={{ ...cs.input, marginBottom: 10 }}
            placeholder="Ej: se rompieron 2 en el conteo mensual"
            value={motivoAjuste}
            onChange={(e) => setMotivoAjuste(e.target.value)}
          />
          {errorAjuste && <p style={estilos.error}>{errorAjuste}</p>}
          <button style={boton("primario")} onClick={confirmarAjuste} disabled={enviandoAjuste}>
            {enviandoAjuste ? "Registrando..." : "Confirmar ajuste"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Historial unificado: compras recibidas + consumos + ajustes, todo junto ───

function MovimientosHistorial({ movimientos, nombrePorId, unidadPorId }) {
  return (
    <div style={estilos.tarjetaHistorial}>
      <p style={estilos.panelTitulo}>Historial de movimientos</p>
      {movimientos.length === 0 ? (
        <p style={estilos.mensaje}>Todavía no hay movimientos de stock registrados.</p>
      ) : (
        <div style={estilos.lista}>
          {movimientos.map((m) => (
            <div key={`${m.origen}-${m.id}`} style={estilos.filaHistorial}>
              <div style={{ minWidth: 0 }}>
                <div style={estilos.nombre}>{nombrePorId(m.insumo_id)}</div>
                <div style={estilos.detalle}>
                  {ORIGEN_TEXTO[m.origen] || m.origen}
                  {m.referencia ? ` · ${m.referencia}` : ""}
                  {m.fecha ? ` · ${new Date(m.fecha).toLocaleDateString()}` : ""}
                </div>
              </div>
              <span style={insignia(m.sentido === "entrada" ? "exito" : "primario")}>
                {m.sentido === "entrada" ? "+" : "-"}{m.cantidad}{unidadPorId(m.insumo_id) ? ` ${unidadPorId(m.insumo_id)}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Filtro por tipo de insumo (mismo patrón que Activos.jsx) ───

function Filtro({ etiqueta, valor, onChange, opciones }) {
  return (
    <div>
      <label style={cs.label}>{etiqueta}</label>
      <select style={cs.input} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todos</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>{o.nombre}</option>
        ))}
      </select>
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

        {/* Cuerpo con scroll propio: así los botones de abajo quedan siempre
        a la vista, sin tener que bajar hasta el final del formulario. */}
        <div style={estilos.modalCuerpo}>
          <p style={estilos.ayudaCodigo}>El código (INS-0001, INS-0002...) lo asigna el sistema solo.</p>

          <label style={cs.label}>Nombre</label>
          <input
            style={{ ...cs.input, marginBottom: 10 }}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
          />

          <label style={cs.label}>Descripción (opcional)</label>
          <input
            style={{ ...cs.input, marginBottom: 10 }}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />

          <div style={estilos.grillaDos}>
            <div>
              <label style={cs.label}>Unidad (opcional)</label>
              <input
                style={cs.input}
                placeholder="Ej: unidades, cajas"
                value={unidad}
                onChange={(e) => setUnidad(e.target.value)}
              />
            </div>
            <div>
              <label style={cs.label}>Tipo de equipo (opcional)</label>
              <select style={cs.input} value={tipoEquipoId} onChange={(e) => setTipoEquipoId(e.target.value)}>
                <option value="">Sin tipo específico</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>
          </div>

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

          {error && <p style={estilos.error}>{error}</p>}
        </div>

        <div style={estilos.modalBotones}>
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

function textoDelSubtitulo(cantidad, soloAlertas, hayFiltro) {
  if (hayFiltro) {
    return `${cantidad} ${cantidad === 1 ? "resultado" : "resultados"}`;
  }
  if (soloAlertas) {
    return `${cantidad} ${cantidad === 1 ? "insumo necesita" : "insumos necesitan"} atención`;
  }
  return `${cantidad} ${cantidad === 1 ? "insumo cargado" : "insumos cargados"}`;
}

const estilos = {
  mensaje: { color: color.textoSuave, padding: "14px 0", lineHeight: 1.6 },
  error: { fontSize: "0.85rem", color: color.peligro, margin: "8px 0" },
  lista: { display: "flex", flexDirection: "column", gap: 10 },
  barraFiltro: { maxWidth: 240, marginBottom: 14 },
  tarjeta: { ...cs.tarjeta, padding: "14px 18px" },
  filaPrincipal: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  nombre: { fontSize: "0.92rem", color: color.texto, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 },
  codigo: {
    fontSize: "0.72rem", fontWeight: 600, color: color.textoSuave,
    fontFamily: "ui-monospace, monospace", background: color.bordeSuave,
    padding: "1px 7px", borderRadius: 6,
  },
  detalle: { fontSize: "0.82rem", color: color.textoSuave, marginTop: 3 },
  filaAcciones: { display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" },
  formPedido: {
    marginTop: 12, paddingTop: 12, borderTop: `1px solid ${color.bordeSuave}`,
  },
  tarjetaHistorial: { ...cs.tarjeta, padding: 18, marginTop: 20 },
  panelTitulo: { margin: "0 0 12px", fontSize: "0.95rem", fontWeight: 700, color: color.texto },
  filaHistorial: {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
    padding: "9px 0", borderBottom: `1px solid ${color.bordeSuave}`,
  },
  grillaDos: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 12,
    marginBottom: 10,
  },
  grillaTres: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
    gap: 12,
  },
  overlay: {
    position: "fixed", inset: 0, background: "rgba(15,20,30,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 16, zIndex: 50,
  },
  // display:flex column + el cuerpo con su propio scroll: el título queda
  // fijo arriba y los botones fijos abajo, aunque el formulario sea largo.
  modal: {
    ...cs.tarjeta, padding: 22, width: "100%", maxWidth: 460,
    maxHeight: "88vh", display: "flex", flexDirection: "column",
  },
  modalCuerpo: { overflowY: "auto", flex: 1, minHeight: 0 },
  modalBotones: { display: "flex", gap: 10, marginTop: 16, flexShrink: 0 },
  modalTitulo: { margin: "0 0 14px", fontSize: "1.05rem", fontWeight: 700, color: color.texto },
  ayudaCodigo: { margin: "0 0 14px", fontSize: "0.8rem", color: color.textoSuave },
};

export default Stock;