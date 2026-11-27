// Área reservada de explorarg.com - de dónde salen sus datos.
//
// Los datos del área reservada NO están en el repositorio (es público) ni viajan con la
// página: los entrega api/reservada.js, después del candado. Cada conjunto es un JSON
// con nombre (hoy uno solo, "crushing") que arma un programa de scripts/.
//
// Dónde vive ese JSON:
//   - en esta Mac: ~/.cache/explorarg/reservada/<nombre>.json (o la carpeta que diga
//     RESERVADA_CARPETA). Lo escribe scripts/regenerate_crushing.py.
//   - publicado (Vercel): en Firestore, colección "reservada". Como un documento de
//     Firestore no pasa de 1 MB, el JSON se guarda en partes:
//         reservada/<nombre>          { partes: N, generado, bytes }
//         reservada/<nombre>__<i>     { texto }   (i = 0 .. N-1)
//     Lo sube scripts/reservada_subir.mjs, que lo corre HDO.

import { existsSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getFirestore } from 'firebase-admin/firestore';
import { app, hayLlave } from '../cuentas/firebase.js';

/** Los conjuntos que existen. Un nombre que no está acá no se sirve. */
export const CONJUNTOS = ['crushing'];

export const COLECCION = 'reservada';
/** Caracteres por parte: muy por debajo del límite de 1 MB de Firestore, aun con acentos. */
export const LARGO_DE_PARTE = 300_000;

export const carpetaLocal = () => process.env.RESERVADA_CARPETA || path.join(os.homedir(), '.cache', 'explorarg', 'reservada');
export const archivoLocal = (nombre) => path.join(carpetaLocal(), `${nombre}.json`);

export class SinDatos extends Error {}

// La función de Vercel queda viva entre pedidos: no hace falta releer Firestore cada vez
const MINUTOS_EN_MEMORIA = 10;
const memoria = new Map(); // nombre -> { hasta, marca, datos }

async function deFirestore(nombre) {
  if (!hayLlave()) throw new SinDatos('Falta la llave del servidor para leer los datos reservados.');
  const db = getFirestore(app());
  const cabecera = (await db.collection(COLECCION).doc(nombre).get()).data();
  if (!cabecera?.partes) throw new SinDatos(`Los datos de "${nombre}" todavía no se subieron.`);
  const partes = await Promise.all(Array.from({ length: cabecera.partes }, (_, i) => db.collection(COLECCION).doc(`${nombre}__${i}`).get()));
  const texto = partes.map((p) => p.data()?.texto ?? '').join('');
  return JSON.parse(texto);
}

function deArchivo(nombre) {
  const archivo = archivoLocal(nombre);
  if (!existsSync(archivo)) throw new SinDatos(`No está ${archivo}: hay que correr el programa que lo arma.`);
  return { marca: statSync(archivo).mtimeMs, datos: JSON.parse(readFileSync(archivo, 'utf8')) };
}

/** El JSON del conjunto. Tira SinDatos si no existe o todavía no se armó. */
export async function leerConjunto(nombre) {
  if (!CONJUNTOS.includes(nombre)) throw new SinDatos('Ese conjunto de datos no existe.');
  // En esta Mac se lee el archivo cada vez que cambia: regenerar y recargar alcanza
  if (!process.env.VERCEL) {
    const archivo = archivoLocal(nombre);
    const marca = existsSync(archivo) ? statSync(archivo).mtimeMs : null;
    const guardado = memoria.get(nombre);
    if (guardado && guardado.marca === marca) return guardado.datos;
    const leido = deArchivo(nombre);
    memoria.set(nombre, leido);
    return leido.datos;
  }
  const guardado = memoria.get(nombre);
  if (guardado && Date.now() < guardado.hasta) return guardado.datos;
  const datos = await deFirestore(nombre);
  memoria.set(nombre, { hasta: Date.now() + MINUTOS_EN_MEMORIA * 60_000, datos });
  return datos;
}
