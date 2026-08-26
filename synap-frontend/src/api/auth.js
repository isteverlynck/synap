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

// Cerrar sesión: borrar el token guardado.
export function logout() {
  localStorage.removeItem("token");
}

// ¿Hay alguien logueado? (¿existe token guardado?)
export function estaLogueado() {
  return localStorage.getItem("token") !== null;
}
