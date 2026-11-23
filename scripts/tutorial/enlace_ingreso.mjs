#!/usr/bin/env node
/**
 * Enlace de ingreso de la cuenta de demostración de los tutoriales (Agente Explorarg, 23/11/2026).
 *
 * Lo usa grabar.mjs (acción `entrar`) cuando graba contra el sitio publicado: el Agente pide
 * ingresar, y el grabador no tiene casilla de mail ni escribe contraseñas. Este programa le pide a
 * Firebase, con la llave del servidor de esta Mac, el mismo enlace que la página manda por mail
 * ("Mandame el enlace para entrar"). No manda ningún mail.
 *
 *   node scripts/tutorial/enlace_ingreso.mjs <mail> <destino>
 *
 * El enlace sale por la salida estándar y sirve para entrar a esa cuenta: no pegarlo en ningún
 * lado. La llave no se muestra ni sale de la Mac (~/.cache/explorarg/firebase-servicio.json, o
 * la ruta de FIREBASE_CLAVE_SERVICIO).
 *
 * La cuenta se crea sola la primera vez que el grabador entra con el enlace, igual que la de
 * cualquier persona que se registra, y recibe los tokens de bienvenida.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [mail, destino] = process.argv.slice(2);
if (!mail || !destino || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail) || !/^https:\/\//.test(destino)) {
  console.error('uso: node enlace_ingreso.mjs <mail> <https://.../agente>');
  process.exit(2);
}

const LLAVE = process.env.FIREBASE_CLAVE_SERVICIO || path.join(os.homedir(), '.cache', 'explorarg', 'firebase-servicio.json');
let llave;
try {
  llave = JSON.parse(fs.readFileSync(LLAVE, 'utf8'));
} catch {
  console.error(`No pude leer la llave del servidor de Firebase (${LLAVE}).`);
  process.exit(1);
}

try {
  initializeApp({ credential: cert(llave) });
  const enlace = await getAuth().generateSignInWithEmailLink(mail, { url: destino, handleCodeInApp: true });
  process.stdout.write(enlace);
} catch (e) {
  console.error(`Firebase no dio el enlace: ${e?.code ?? ''} ${String(e?.message ?? e).slice(0, 200)}`);
  process.exit(1);
}
