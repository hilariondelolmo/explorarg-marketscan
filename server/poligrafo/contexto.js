// Polígrafo - los datos del sitio, leídos del lado del servidor.
//
// Los mismos JSON que importa la página (la lista es DATOS_DEL_SITIO, en
// src/lib/poligrafo/contexto.js): con ellos se arman la lista de nombres, los textos
// legales y la ficha de datos. Lo usan api/poligrafo.js (para la consigna y para anotar
// el veredicto de cada consulta) y api/admin.js (para el panel de administrador).
//
// Se lee una vez y se vuelve a leer solo si cambió algún archivo (regenerar los datos
// no pide reiniciar el servidor local).

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { SENADORES, VOTACION } from '../../src/data/mapa-recinto.js';
import { armarContexto, DATOS_DEL_SITIO } from '../../src/lib/poligrafo/contexto.js';

const DATOS = Object.entries(DATOS_DEL_SITIO); // [nombre en el contexto, archivo]
const ruta = (archivo) => path.join(process.cwd(), 'src', 'data', `${archivo}.json`);
let cache = null; // { sello, ctx }

/** El contexto del Polígrafo (el mismo objeto mientras los datos no cambien). */
export async function contextoDelSitio() {
  const sello = (await Promise.all(DATOS.map(async ([, archivo]) => (await stat(ruta(archivo))).mtimeMs))).join('-');
  if (!cache || cache.sello !== sello) {
    const d = Object.fromEntries(await Promise.all(DATOS.map(async ([nombre, archivo]) => [nombre, JSON.parse(await readFile(ruta(archivo), 'utf8'))])));
    cache = { sello, ctx: armarContexto({ ...d, recinto: { SENADORES, VOTACION } }) };
  }
  return cache.ctx;
}
