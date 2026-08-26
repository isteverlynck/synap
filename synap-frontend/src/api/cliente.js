// cliente.js — la conexión con el backend de SYNAP.
// Todas las llamadas al backend pasan por acá. Si cambia la dirección del
// backend, se cambia en UN solo lugar (abajo, en baseURL).

import axios from "axios";

// Dirección de tu backend. En desarrollo es localhost:8000.
// (Cuando hagan el deploy, se cambia por la dirección pública.)
const cliente = axios.create({
  baseURL: "http://localhost:8000",
});

// "Interceptor": antes de cada llamada, si hay un token guardado, lo agrega
// automáticamente. Así no tenés que acordarte de mandarlo en cada pedido.
// Es lo que hace que los endpoints protegidos (con candado) funcionen.
cliente.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default cliente;
