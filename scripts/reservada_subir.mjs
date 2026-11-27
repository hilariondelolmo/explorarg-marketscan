// Sube a Firestore los datos del área reservada, para que los lea el sitio publicado.
//
//   node scripts/reservada_subir.mjs             simulacro: dice qué subiría, no toca nada
//   node scripts/reservada_subir.mjs --subir     sube de verdad
//
// Lo corre HDO (o Claude con su orden): escribe en la base de producción. Los datos del
// área reservada no están en el repositorio ni viajan con la página; en esta Mac viven en
// ~/.cache/explorarg/reservada/<nombre>.json (los arma scripts/regenerate_crushing.py) y
// publicados, en Firestore, colección "reservada", partidos en documentos de menos de
// 1 MB (server/reservada/datos.js los vuelve a unir). Necesita la llave del servidor en
// ~/.cache/explorarg/firebase-servicio.json y el proyecto en .env.local.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// el proyecto de Firebase sale de .env.local, igual que en el sitio local
const envLocal = path.join(raiz, '.env.local');
if (existsSync(envLocal)) {
  for (const linea of readFileSync(envLocal, 'utf8').split('\n')) {
    const m = /^(VITE_FIREBASE_PROJECT_ID|FIREBASE_PROJECT_ID|FIREBASE_CLAVE_SERVICIO)=(.*)$/.exec(linea.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const subir = process.argv.includes('--subir');
const { getFirestore } = await import('firebase-admin/firestore');
const { app, estadoCuentas, hayLlave, proyecto } = await import('../server/cuentas/firebase.js');
const { COLECCION, CONJUNTOS, LARGO_DE_PARTE, archivoLocal } = await import('../server/reservada/datos.js');

console.log(`Datos del área reservada → Firestore (${proyecto() || 'sin proyecto'})${subir ? '' : '  [simulacro]'}`);
if (subir && (estadoCuentas() !== 'real' || !hayLlave())) {
  console.error('Falta el proyecto de Firebase o la llave del servidor: no se puede subir.');
  process.exit(1);
}

for (const nombre of CONJUNTOS) {
  const archivo = archivoLocal(nombre);
  if (!existsSync(archivo)) {
    console.log(`  ${nombre}: no está ${archivo}; no se sube.`);
    continue;
  }
  const texto = readFileSync(archivo, 'utf8');
  const datos = JSON.parse(texto); // si no es un JSON válido, corta acá
  const partes = [];
  for (let i = 0; i < texto.length; i += LARGO_DE_PARTE) partes.push(texto.slice(i, i + LARGO_DE_PARTE));
  console.log(`  ${nombre}: ${(texto.length / 1024).toFixed(0)} KB en ${partes.length} parte(s) · generado ${datos.meta?.generado ?? '?'} · datos hasta ${datos.meta?.hasta ?? '?'}`);
  if (!subir) continue;
  const db = getFirestore(app());
  const col = db.collection(COLECCION);
  const anterior = (await col.doc(nombre).get()).data();
  await Promise.all(partes.map((t, i) => col.doc(`${nombre}__${i}`).set({ texto: t })));
  await col.doc(nombre).set({ partes: partes.length, generado: datos.meta?.generado ?? null, hasta: datos.meta?.hasta ?? null, bytes: texto.length, subido: new Date().toISOString() });
  // si la versión anterior tenía más partes, las que sobran se borran
  for (let i = partes.length; i < (anterior?.partes ?? 0); i += 1) await col.doc(`${nombre}__${i}`).delete();
  console.log(`    subido.`);
}
if (!subir) console.log('Simulacro: no se subió nada. Para subir: node scripts/reservada_subir.mjs --subir');
process.exit(0);
