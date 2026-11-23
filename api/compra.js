import { baseOError } from '../server/cuentas/cobro.js';
import { ErrorDeCuenta } from '../server/cuentas/cuenta.js';
import { ErrorDeSesion, exigirSesion } from '../server/cuentas/sesion.js';
import { acreditarPago, direccionDelSitio, iniciarCompra, ofertas } from '../server/pagos/compra.js';
import { mercadoPagoDelSitio } from '../server/pagos/mercadopago.js';

/**
 * La compra de tokens de quien está logueado (server/pagos/compra.js). En la Argentina
 * se paga con Mercado Pago, en pesos.
 *
 * GET  /api/compra                -> { habilitada, paquetes: [{ id, tokens, pesos }], actualizado }
 * POST /api/compra { paquete }    -> { url }: la página de Mercado Pago donde se paga
 * POST /api/compra { pago }       -> { estado, tokens, saldo }: al volver de Mercado Pago, con el
 *                                   número de pago que trae la dirección. El servidor le pregunta
 *                                   a Mercado Pago por ese pago; lo que diga el navegador no cuenta.
 *
 * A la página no viaja la cotización del dólar: al usuario se le habla en tokens y en pesos.
 *
 * Pendiente para publicar: MP_ACCESS_TOKEN y MP_WEBHOOK_SECRET en Vercel, y la dirección
 * https://www.explorarg.com/api/pago-mp cargada en los avisos de la aplicación de Mercado Pago.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  try {
    const sesion = await exigirSesion(req);
    res.setHeader('Cache-Control', 'no-store');
    if (sesion.local) {
      res.status(200).json({ apagadas: true, habilitada: false });
      return;
    }
    const base = baseOError();
    const mp = mercadoPagoDelSitio();

    if (req.method === 'GET') {
      if (!mp) {
        res.status(200).json({ habilitada: false });
        return;
      }
      const o = await ofertas(base);
      res.status(200).json({ habilitada: true, paquetes: o.paquetes, actualizado: o.dolar.fecha });
      return;
    }

    if (req.body?.pago !== undefined) {
      const r = await acreditarPago(base, mp, String(req.body.pago));
      // cada uno se entera solo de sus propias compras
      const mia = r.uid === sesion.uid;
      console.log(`[compra] ${sesion.uid} volvió con el pago ${String(req.body.pago).slice(0, 24)}: ${mia ? r.estado : 'no es suyo'}`);
      res.status(200).json(mia ? { estado: r.estado, tokens: r.tokens, saldo: r.saldo } : { estado: 'no_corresponde' });
      return;
    }
    const c = await iniciarCompra(base, mp, sesion, String(req.body?.paquete ?? ''), { origen: direccionDelSitio(req) });
    console.log(`[compra] ${sesion.uid} inició la compra de ${c.tokens} tokens por $ ${c.pesos} (orden ${c.ordenId})`);
    res.status(200).json({ url: c.url });
  } catch (e) {
    if (e instanceof ErrorDeSesion || e instanceof ErrorDeCuenta) {
      res.status(e.estadoHttp).json({ error: e.message, codigo: e.codigo });
      return;
    }
    console.error('[compra] error:', e);
    res.status(500).json({ error: 'No se pudo completar la compra. Si pagaste, los tokens se van a sumar solos.' });
  }
}
