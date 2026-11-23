import { baseOError } from '../server/cuentas/cobro.js';
import { ErrorDeCuenta } from '../server/cuentas/cuenta.js';
import { pedirRegistro } from '../server/cuentas/registro.js';
import { ErrorDeSesion, identificar } from '../server/cuentas/sesion.js';

/**
 * El pedido de registro de quien creó su cuenta con mail y contraseña (HDO, 23/11/2026).
 *
 * POST /api/registro -> { estado: 'pendiente' | 'autorizada' | 'rechazada' }
 *
 * La primera vez deja anotado el pedido, para que alguien de Explora lo autorice desde
 * el panel de administrador; las siguientes, solo cuenta en qué quedó. Es la única
 * función a la que llega quien todavía no puede consultar: por eso no usa el candado
 * (exigirSesion) sino que comprueba la credencial y nada más. No consulta a la IA ni
 * abre la cuenta corriente: no cuesta nada y no entrega tokens.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  try {
    const quien = await identificar(req);
    res.setHeader('Cache-Control', 'no-store');
    if (quien.local) {
      res.status(200).json({ apagadas: true });
      return;
    }
    res.status(200).json(await pedirRegistro(baseOError(), quien));
  } catch (e) {
    if (e instanceof ErrorDeSesion || e instanceof ErrorDeCuenta) {
      res.status(e.estadoHttp).json({ error: e.message, codigo: e.codigo });
      return;
    }
    console.error('[registro] error:', e);
    res.status(500).json({ error: 'No se pudo anotar tu pedido de registro.' });
  }
}
