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


// "Guardia": envuelve una pantalla protegida. Si no estás logueada, te manda
// al login. Así ninguna pantalla protegida se ve sin haber entrado.
function Protegida({ children }) {
  return estaLogueado() ? children : <Navigate to="/" />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Pantalla pública: login */}
        <Route path="/" element={<Login />} />

        {/* Pantallas protegidas (requieren login) */}
        <Route path="/activos" element={<Protegida><Activos /></Protegida>} />
        <Route path="/solicitudes" element={<Protegida><Solicitudes /></Protegida>} />

        {/* Escaneo de QR: lo puede abrir cualquier rol. Según quién escanea,
        la pantalla decide a dónde mandarlo (ver EscanearQR.jsx). */}
        <Route path="/escanear" element={<Protegida><EscanearQR /></Protegida>} />
        <Route path="/activos/:codigo" element={<Protegida><FichaActivo /></Protegida>} />

        <Route path="/recuperar" element={<RecuperarPassword />} />
        <Route path="/restablecer" element={<RecuperarPassword />} />

        {/* Acá van sumando: OT, stock, dashboard... */}
        {/* Ejemplo para cuando las hagan:
        <Route path="/stock" element={<Protegida><Stock /></Protegida>} />
        <Route path="/dashboard" element={<Protegida><Dashboard /></Protegida>} />
        */}
      </Routes>
    </BrowserRouter>
  );
}

export default App;