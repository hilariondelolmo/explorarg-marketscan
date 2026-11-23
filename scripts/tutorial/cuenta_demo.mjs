#!/usr/bin/env node
/**
 * Contraseña de un solo uso para la cuenta de demostración de los tutoriales (Agente Explorarg).
 *
 * Lo usa grabar.mjs (acción `entrar` y texto "{clave}") para ingresar al Agente como lo hace
 * cualquier persona: con mail y contraseña (HDO, 23/11/2026; antes se entraba con un enlace al
 * mail y este programa se llamaba enlace_ingreso.mjs). En cada grabación:
 *   - si la cuenta de demostración no existe, la crea con el mail ya confirmado y el registro ya
 *     autorizado (el registro con mail y contraseña lo autoriza alguien de Explora; ver
 *     server/cuentas/registro.js);
 *   - le pone una contraseña nueva, al azar, que sirve para esa grabación y no se guarda en ningún lado.
 *
 *   node scripts/tutorial/cuenta_demo.mjs <mail>              contra el proyecto real (sitio publicado)
 *   node scripts/tutorial/cuenta_demo.mjs <mail> --emulador   contra el emulador local (copia local)
 *
 * La contraseña sale por la salida estándar: grabar.mjs la lee y la tipea en el campo, donde se ve
 * como puntos. No se imprime ni se pega en ningún lado. Contra el proyecto real usa la llave del
 * servidor de esta Mac (~/.cache/explorarg/firebase-servicio.json, o la ruta de
 * FIREBASE_CLAVE_SERVICIO), que no se muestra ni sale de acá.
 *
 * Solo toca cuentas de demostración: el mail tiene que decir "demo" antes de la arroba. Así un
 * guion mal escrito nunca le cambia la contraseña a una persona.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const args = process.argv.slice(2);
const emulador = args.includes('--emulador');
const mail = args.find((a) => !a.startsWith('--'));
if (!mail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
  console.error('uso: node cuenta_demo.mjs <mail> [--emulador]');
  process.exit(2);
}
if (!/demo[^@]*@/i.test(mail)) {
  console.error('cuenta_demo: solo cuentas de demostración (el mail tiene que decir "demo" antes de la arroba).');
  process.exit(2);
}

if (emulador) {
  // los mismos datos que src/lib/cuenta/config.js (EMULADOR_AUTH, PROYECTO_EMULADOR)
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  initializeApp({ projectId: 'demo-explorarg' });
} else {
  const LLAVE = process.env.FIREBASE_CLAVE_SERVICIO || path.join(os.homedir(), '.cache', 'explorarg', 'firebase-servicio.json');
  let llave;
  try {
    llave = JSON.parse(fs.readFileSync(LLAVE, 'utf8'));
  } catch {
    console.error(`No pude leer la llave del servidor de Firebase (${LLAVE}).`);
    process.exit(1);
  }
  initializeApp({ credential: cert(llave) });
}

try {
  const clave = crypto.randomBytes(18).toString('base64url');
  const auth = getAuth();
  let cuenta = null;
  try {
    cuenta = await auth.getUserByEmail(mail);
  } catch (e) {
    if (e?.code !== 'auth/user-not-found') throw e;
  }
  if (cuenta) await auth.updateUser(cuenta.uid, { password: clave, emailVerified: true });
  else cuenta = await auth.createUser({ email: mail, password: clave, emailVerified: true });
  // el registro con mail y contraseña se autoriza (server/cuentas/registro.js): la de demostración ya lo está
  if (cuenta.customClaims?.autorizada !== true) await auth.setCustomUserClaims(cuenta.uid, { ...(cuenta.customClaims ?? {}), autorizada: true });
  process.stdout.write(clave);
} catch (e) {
  console.error(`Firebase no preparó la cuenta de demostración: ${e?.code ?? ''} ${String(e?.message ?? e).slice(0, 200)}`);
  process.exit(1);
}
