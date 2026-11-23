import { esAdmin } from '../server/cuentas/admin.js';
import { baseOError } from '../server/cuentas/cobro.js';
import { ErrorDeCuenta, consultaGuardada, panel, resumen } from '../server/cuentas/cuenta.js';
import { ErrorDeSesion, exigirSesion } from '../server/cuentas/sesion.js';
import { mercadoPagoDelSitio } from '../server/pagos/mercadopago.js';

/**
 * La cuenta de quien está logueado. Todo en tokens de explorarg. No consulta a la IA:
 * no cuesta nada.
 *
 * GET /api/cuenta                -> { saldo, precios, ... }: lo justo para la barra y los botones
 *                                (más `admin: true` a quien administra y `compra: true` si se pueden comprar tokens)
 * GET /api/cuenta?detalle=1      -> el panel: tokens, consumo por herramienta, consultas guardadas y movimientos
 * GET /api/cuenta?consulta=ID    -> una consulta guardada, entera, para volver a abrirla
 *                                o { apagadas: true } en la copia local sin cuentas configuradas
 *
 * La primera vez que una persona llega acá se le crea la cuenta con los tokens de
 * bienvenida. Cada uno ve solo lo suyo: todo se busca por el id de su sesión.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  try {
    const sesion = await exigirSesion(req);
    res.setHeader('Cache-Control', 'no-store');
    if (sesion.local) {
      res.status(200).json({ apagadas: true });
      return;
    }
    // en Vercel los parámetros llegan en req.query; en la copia local, en la dirección
    const parametros = req.query ?? Object.fromEntries(new URL(req.url, 'http://local').searchParams);
    const base = baseOError();
    if (parametros.consulta) {
      const c = await consultaGuardada(base, sesion, String(parametros.consulta));
      if (!c) {
        res.status(404).json({ error: 'No encontré esa consulta entre las tuyas.', codigo: 'consulta_no_encontrada' });
        return;
      }
      res.status(200).json(c);
      return;
    }
    if (parametros.detalle) {
      res.status(200).json(await panel(base, sesion));
      return;
    }
    // a quien administra el sitio se le avisa, para que la página le muestre su pestaña (el candado está en api/admin.js)
    // y si la venta de tokens está habilitada, para que el cartel de "no alcanzan" mande a comprarlos
    res.status(200).json({ ...(await resumen(base, sesion)), ...(esAdmin(sesion) ? { admin: true } : {}), ...(mercadoPagoDelSitio() ? { compra: true } : {}) });
  } catch (e) {
    if (e instanceof ErrorDeSesion || e instanceof ErrorDeCuenta) {
      res.status(e.estadoHttp).json({ error: e.message, codigo: e.codigo });
      return;
    }
    console.error('[cuenta] error:', e);
    res.status(500).json({ error: 'No se pudo leer tu cuenta.' });
  }
}
