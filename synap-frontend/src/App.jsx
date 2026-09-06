// App.jsx — el "mapa" de la aplicación: qué pantalla se muestra en cada dirección.
//
// Cada <Route> conecta una dirección (path) con una pantalla (element).
// Para agregar una pantalla nueva: la importás arriba y sumás una <Route>.
// Acá es donde vos y Cami van a ir enganchando las pantallas que hagan.

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { estaLogueado } from "./api/auth";
import Login from "./pages/Login";
import Activos from "./pages/Activos";
import Solicitudes from "./pages/Solicitudes";
import EscanearQR from "./pages/EscanearQR";
import FichaActivo from "./pages/FichaActivo";
import RecuperarPassword from "./pages/RecuperarPassword";
import Cascaron from "./componentes/Cascaron";
import Pendientes from "./pages/Pendientes";
import Ordenes from "./pages/Ordenes";
import DetalleOrden from "./pages/DetalleOrden";


// "Guardia": envuelve una pantalla protegida. Si no estás logueada, te manda
// al login. Así ninguna pantalla protegida se ve sin haber entrado.
function Protegida({ children }) {
  return estaLogueado() ? children : <Navigate to="/" />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/recuperar" element={<RecuperarPassword />} />
        <Route path="/restablecer" element={<RecuperarPassword />} />

        {/* Todo lo de adentro vive dentro del cascarón */}
        <Route element={<Protegida><Cascaron /></Protegida>}>
          <Route path="/activos" element={<Activos />} />
          <Route path="/activos/:codigo" element={<FichaActivo />} />
          <Route path="/escanear" element={<EscanearQR />} />
          <Route path="/solicitudes" element={<Solicitudes />} />
          <Route path="/pendientes" element={<Pendientes />} />
          <Route path="/ordenes" element={<Ordenes />} />
          <Route path="/ordenes/:id" element={<DetalleOrden />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;