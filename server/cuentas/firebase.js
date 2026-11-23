// Cuentas de explorarg.com - la conexión del servidor con Firebase.
//
// Una sola "app" de Firebase para las dos cosas que hace el servidor:
//   - comprobar quién hace el pedido (sesion.js): alcanza con el id del proyecto;
//   - leer y escribir la cuenta corriente (base.js): necesita la LLAVE del servidor
//     (la clave de la cuenta de servicio), que es secreta.
//
// Dónde está la llave:
//   - en Vercel, en la variable FIREBASE_SERVICE_ACCOUNT (el JSON entero);
//   - en esta Mac, en ~/.cache/explorarg/firebase-servicio.json, fuera del
//     repositorio (o donde diga FIREBASE_CLAVE_SERVICIO).
// Nunca va en el repositorio ni en un archivo que empiece con VITE_.

import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';

export const proyecto = () => process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '';

/**
 * En qué estado están las cuentas, según lo que haya configurado:
 *   real             hay proyecto de Firebase. Es producción (o esta Mac contra el proyecto real).
 *   emulador         además FIREBASE_AUTH_EMULATOR_HOST: el emulador local, para probar
 *                    (vite --mode cuentas). Nunca en Vercel.
 *   apagadas         nada configurado y corriendo en esta Mac: el prototipo local anda abierto.
 *   sin_configurar   nada configurado y corriendo en Vercel: se niega todo.
 */
export function estadoCuentas() {
  const enVercel = Boolean(process.env.VERCEL);
  const conEmulador = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
  // El emulador acepta credenciales sin firma: en el sitio publicado no puede estar nunca.
  if (enVercel && conEmulador) return 'sin_configurar';
  if (proyecto()) return conEmulador ? 'emulador' : 'real';
  return enVercel ? 'sin_configurar' : 'apagadas';
}

const ARCHIVO_LOCAL = path.join(os.homedir(), '.cache', 'explorarg', 'firebase-servicio.json');

let llaveLeida = null;

/** La llave del servidor, o null si no está. Con el emulador no se usa nunca la de verdad. */
function llave() {
  if (estadoCuentas() !== 'real') return null;
  if (llaveLeida) return llaveLeida;
  let datos = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    datos = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else if (!process.env.VERCEL) {
    const archivo = process.env.FIREBASE_CLAVE_SERVICIO || ARCHIVO_LOCAL;
    if (existsSync(archivo)) datos = JSON.parse(readFileSync(archivo, 'utf8'));
  }
  if (!datos) return null; // no se guarda el "no está": puede aparecer después sin reiniciar
  if (datos.project_id !== proyecto()) {
    throw new Error(`La llave del servidor es del proyecto "${datos.project_id}" y el sitio está configurado con "${proyecto()}".`);
  }
  llaveLeida = datos;
  return llaveLeida;
}

export const hayLlave = () => Boolean(llave());

/** La app de Firebase del servidor. Si hay llave, la usa; si no, sirve igual para comprobar sesiones. */
export function app() {
  const k = llave();
  const nombre = k ? 'con-llave' : 'sin-llave';
  return getApps().find((a) => a.name === nombre) ?? initializeApp({ projectId: proyecto(), ...(k ? { credential: cert(k) } : {}) }, nombre);
}
