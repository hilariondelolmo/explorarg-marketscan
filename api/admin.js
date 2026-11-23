import { esAdmin, panelDeAdministrador } from '../server/cuentas/admin.js';
import { baseOError } from '../server/cuentas/cobro.js';
import { ErrorDeCuenta } from '../server/cuentas/cuenta.js';
import { pedidosDeRegistro, resolverPedido } from '../server/cuentas/registro.js';
import { ErrorDeSesion, exigirSesion } from '../server/cuentas/sesion.js';
import { direccionDelSitio } from '../server/pagos/compra.js';
import { contextoDelSitio } from '../server/poligrafo/contexto.js';
import { veredictoResumido } from '../server/poligrafo/veredicto.js';

/**
 * El panel de administrador: todas las cuentas, las consultas, lo cobrado contra lo que
 * costó, las frases que el Polígrafo no pudo comprobar y las consultas que no se cobraron.
 *
 * GET  /api/admin -> { generado, totales, cuentas, consultas, indeterminadas, sinCobrar, compras, pedidos }
 * POST /api/admin { accion: 'autorizar' | 'rechazar', uid } -> { pedido }
 *     resuelve un pedido de registro con mail y contraseña (server/cuentas/registro.js):
 *     al autorizar sale el mail de confirmación.
 *
 * Solo para quien administra el sitio: el mail de la sesión tiene que figurar en la
 * variable CUENTAS_ADMIN (server/cuentas/admin.js). Cualquier otro recibe un 403. No
 * consulta a la IA: no cuesta nada.
 *
 * Para publicar: falta CUENTAS_ADMIN en Vercel. Los JSON de src/data ya viajan con la
 * función (vercel.json): para las consultas viejas del Polígrafo el veredicto se calcula
 * acá, con los datos del sitio.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  try {
    const sesion = await exigirSesion(req);
    res.setHeader('Cache-Control', 'no-store');
    if (!esAdmin(sesion)) {
      res.status(403).json({ error: 'Este panel es solo para quien administra el sitio.', codigo: 'no_admin' });
      return;
    }
    const base = baseOError();
    if (req.method === 'POST') {
      const { accion, uid } = req.body ?? {};
      if (typeof uid !== 'string' || !uid) {
        res.status(400).json({ error: 'Falta decir de qué pedido se trata.', codigo: 'falta_uid' });
        return;
      }
      const pedido = await resolverPedido(base, uid, accion, { por: sesion.email, sitio: direccionDelSitio(req) });
      console.log(`[admin] pedido de registro ${uid}: ${pedido.estado}${pedido.mail ? ` (mail: ${pedido.mail})` : ''}`);
      res.status(200).json({ pedido });
      return;
    }
    // Las consultas del Polígrafo de antes de que se guardara el veredicto: se calcula con los datos de hoy
    let ctx = null;
    try {
      ctx = await contextoDelSitio();
    } catch (e) {
      console.error('[admin] no se pudieron leer los datos del sitio:', e);
    }
    const veredictoDe = (c) => {
      if (!ctx || !c.respuestaJson) return null;
      try {
        return veredictoResumido(JSON.parse(c.respuestaJson), ctx);
      } catch {
        return null;
      }
    };
    res.status(200).json({ ...(await panelDeAdministrador(base, { veredictoDe })), pedidos: await pedidosDeRegistro(base) });
  } catch (e) {
    if (e instanceof ErrorDeSesion || e instanceof ErrorDeCuenta) {
      res.status(e.estadoHttp).json({ error: e.message, codigo: e.codigo });
      return;
    }
    console.error('[admin] error:', e);
    res.status(500).json({ error: 'No se pudo armar el panel.' });
  }
}
