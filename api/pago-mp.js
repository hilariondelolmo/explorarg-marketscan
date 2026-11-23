import { abrirBase } from '../server/cuentas/base.js';
import { acreditarPago } from '../server/pagos/compra.js';
import { mercadoPagoDelSitio, firmaValida } from '../server/pagos/mercadopago.js';

/**
 * El aviso de pago de Mercado Pago (lo llama Mercado Pago, no una persona): cuando un
 * pago se crea o cambia de estado, avisa acá.
 *
 * POST /api/pago-mp?data.id=<número del pago>&type=payment
 *
 * Del aviso se toma solo el número del pago. Después el servidor le pregunta a Mercado
 * Pago por ese pago y recién ahí acredita los tokens (server/pagos/compra.js): un aviso
 * falso no puede sumarle tokens a nadie.
 *
 * Si está cargada la clave secreta de los avisos (MP_WEBHOOK_SECRET), además se
 * comprueba la firma y lo que no venga firmado por Mercado Pago se rechaza.
 *
 * Qué se contesta: 200 cuando el aviso quedó atendido (aunque no hubiera nada que
 * hacer); 500 si algo falló de nuestro lado, para que Mercado Pago lo mande de nuevo.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  // en Vercel los parámetros llegan en req.query; en la copia local, en la dirección
  const parametros = req.query ?? Object.fromEntries(new URL(req.url, 'http://local').searchParams);
  const tipo = parametros.type ?? req.body?.type ?? parametros.topic;
  const pagoId = parametros['data.id'] ?? req.body?.data?.id ?? (parametros.topic === 'payment' ? parametros.id : undefined);
  try {
    const secreto = process.env.MP_WEBHOOK_SECRET;
    if (secreto && !firmaValida({ firma: req.headers['x-signature'], pedidoId: req.headers['x-request-id'], dataId: parametros['data.id'], secreto })) {
      console.error('[pago-mp] aviso sin firma válida: se rechaza');
      res.status(401).json({ error: 'Firma inválida' });
      return;
    }
    // Mercado Pago avisa de otras cosas además de los pagos: no hay nada que hacer con ellas
    if (tipo !== 'payment' || !pagoId) {
      res.status(200).json({ recibido: true });
      return;
    }
    const base = abrirBase();
    const mp = mercadoPagoDelSitio();
    if (!base || !mp) {
      // sin base o sin la llave de Mercado Pago no se puede acreditar: que lo mande de nuevo más tarde
      console.error('[pago-mp] llegó un aviso y la venta no está configurada');
      res.status(500).json({ error: 'Venta sin configurar' });
      return;
    }
    const r = await acreditarPago(base, mp, String(pagoId));
    console.log(`[pago-mp] pago ${String(pagoId).slice(0, 24)}: ${r.estado}${r.uid ? ` · ${r.uid} · ${r.tokens} tokens` : ''}`);
    res.status(200).json({ recibido: true });
  } catch (e) {
    console.error('[pago-mp] error:', e);
    res.status(500).json({ error: 'No se pudo atender el aviso' });
  }
}
