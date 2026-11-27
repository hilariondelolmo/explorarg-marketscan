import { ErrorDeSesion, exigirSesion } from '../server/cuentas/sesion.js';
import { puedeEntrar } from '../server/reservada/acceso.js';
import { CONJUNTOS, SinDatos, leerConjunto } from '../server/reservada/datos.js';

/**
 * Los datos del área reservada (HDO, 27/11/2026): uso interno, solo para quien está
 * logueado y autorizado de antemano.
 *
 * GET /api/reservada              -> { autorizado: true, conjuntos: [...] }   (para saber si la persona entra)
 * GET /api/reservada?que=crushing -> el JSON de ese conjunto
 *
 * Dos candados, uno detrás del otro:
 *   1. exigirSesion: hay una persona logueada en explorarg.com (server/cuentas/sesion.js);
 *   2. puedeEntrar: esa persona figura en CUENTAS_RESERVADA o administra el sitio
 *      (server/reservada/acceso.js). Cualquier otro recibe un 403.
 * Los datos no están en el repositorio ni viajan con la página: salen de
 * server/reservada/datos.js recién después de los dos candados. No consulta a la IA y no
 * descuenta tokens.
 *
 * Para publicar: CUENTAS_RESERVADA en Vercel y los datos subidos a Firestore
 * (scripts/reservada_subir.mjs).
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  try {
    const sesion = await exigirSesion(req);
    res.setHeader('Cache-Control', 'no-store');
    if (!puedeEntrar(sesion)) {
      res.status(403).json({ error: 'Tu cuenta no está habilitada para el área reservada.', codigo: 'no_autorizado' });
      return;
    }
    // en Vercel los parámetros llegan en req.query; en la copia local, en la dirección
    const parametros = req.query ?? Object.fromEntries(new URL(req.url, 'http://local').searchParams);
    const que = parametros.que ? String(parametros.que) : null;
    if (!que) {
      res.status(200).json({ autorizado: true, conjuntos: CONJUNTOS });
      return;
    }
    res.status(200).json(await leerConjunto(que));
  } catch (e) {
    if (e instanceof ErrorDeSesion) {
      res.status(e.estadoHttp).json({ error: e.message, codigo: e.codigo });
      return;
    }
    if (e instanceof SinDatos) {
      console.error('[reservada]', e.message);
      res.status(503).json({ error: 'Los datos de esta herramienta todavía no están cargados.', codigo: 'sin_datos' });
      return;
    }
    console.error('[reservada] error:', e);
    res.status(500).json({ error: 'No se pudieron leer los datos.' });
  }
}
