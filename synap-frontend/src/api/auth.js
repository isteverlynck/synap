// auth.js — funciones para login y activación de cuenta.
// Usan el cliente base, que ya sabe la dirección del backend.

import cliente from "./cliente";

// Consultar si un usuario ya está activado (para saber qué pantalla mostrar).
export async function estadoUsuario(numero) {
  const res = await cliente.get(`/auth/estado/${numero}`);
  return res.data;
}

// Login: manda número + contraseña, devuelve el token.
// El backend espera los datos como "form" (por eso el URLSearchParams).
export async function login(numero, password) {
  const params = new URLSearchParams();
  params.append("username", numero);
  params.append("password", password);
  const res = await cliente.post("/auth/login", params);
  // Guardamos el token para las próximas llamadas.
  if (res.data.access_token) {
    localStorage.setItem("token", res.data.access_token);
  }
  return res.data;
}

// Perfil del usuario logueado (nombre, rol, etc). Se llama justo después del
// login para saber a qué pantalla mandar a cada quien según su rol.
export async function obtenerPerfil() {
  const res = await cliente.get("/auth/me");
  return res.data;
}

// Cerrar sesión: borrar el token guardado y el rol.
export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("rol");
}

// ¿Hay alguien logueado? (¿existe token guardado?)
export function estaLogueado() {
  return localStorage.getItem("token") !== null;
}

// Rol del usuario logueado, guardado en el login (null si no hay o no se guardó).
export function rolActual() {
  return localStorage.getItem("rol");
}

// A qué pantalla mandar a cada quien según su rol, justo después de loguearse.
export function pantallaInicioPorRol(rol) {
  if (rol === "enfermeria") return "/solicitudes";
  // Coordinación, técnicos y jefatura todavía no tienen pantalla propia:
  // por ahora van a Activos, como antes.
  return "/activos";
}