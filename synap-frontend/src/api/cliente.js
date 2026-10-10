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

// Interceptor de respuesta: si el backend contesta 401 (token vencido o
// inválido; dura un día), la sesión ya no sirve. Sin esto, la persona que
// vuelve al día siguiente queda con el menú vacío y sin forma de salir, salvo
// borrando el almacenamiento del navegador. Acá se borran el token y el rol
// guardados y se la manda a la pantalla de ingreso.
//
// El 401 de /auth/login NO cuenta: ahí significa "número o contraseña
// incorrectos", y esa pantalla tiene que poder mostrar el mensaje. Preguntar
// por el token guardado también evita repetir la salida si varios pedidos
// fallan a la vez: el primero borra el token y los demás ya no hacen nada.
cliente.interceptors.response.use(
  (respuesta) => respuesta,
  (error) => {
    const url = error.config?.url || "";
    const sesionVencida =
      error.response?.status === 401 &&
      !url.includes("/auth/login") &&
      localStorage.getItem("token") !== null;

    if (sesionVencida) {
      localStorage.removeItem("token");
      localStorage.removeItem("rol");
      if (window.location.pathname !== "/") {
        window.location.assign("/");
      }
    }
    return Promise.reject(error);
  }
);

export default cliente;