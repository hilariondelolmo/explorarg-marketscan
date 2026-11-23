// Venta de tokens - lo que se habla con Mercado Pago.
//
// Tres cosas, nada más (Checkout Pro):
//   crearPreferencia   arma el cobro; devuelve la dirección de la página de Mercado Pago
//                      donde la persona paga (init_point);
//   pago               le pregunta a Mercado Pago por un pago: es la única fuente que
//                      vale para saber si se aprobó, por cuánto y de qué compra era;
//   firmaValida        comprueba que un aviso de pago lo mandó Mercado Pago.
//
// Se habla directo con la API (dos direcciones), sin sumar un paquete al sitio. Los
// nombres de los campos y la forma de la firma están cotejados con el paquete oficial
// de Node (mercadopago 3.6.2, 23/11/2026).
//
// LAS CREDENCIALES son secretas y van fuera del repositorio (.env.local en esta Mac,
// variables en Vercel):
//   MP_ACCESS_TOKEN     la llave de la aplicación de Mercado Pago (el Access Token; el de
//                       prueba y el de verdad empiezan igual, con APP_USR). Sin ella, la
//                       venta queda apagada.
//   MP_WEBHOOK_SECRET   la clave secreta de los avisos (Tus integraciones > Webhooks).
//                       Si está, todo aviso sin firma válida se rechaza.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { estadoCuentas } from '../cuentas/firebase.js';

const API = 'https://api.mercadopago.com';

export class ErrorDeMercadoPago extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

/** El cliente de Mercado Pago, o null si no está la llave (la venta queda apagada). */
export function clienteMercadoPago({ token = process.env.MP_ACCESS_TOKEN, traer = fetch } = {}) {
  if (!token) return null;
  const pedir = async (camino, opciones = {}) => {
    const r = await traer(`${API}${camino}`, {
      ...opciones,
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opciones.headers ?? {}) },
    });
    const cuerpo = await r.json().catch(() => ({}));
    // el mensaje de Mercado Pago va al registro del servidor, nunca a la página
    if (!r.ok) throw new ErrorDeMercadoPago(r.status, `Mercado Pago contestó ${r.status}: ${cuerpo?.message ?? 'sin detalle'}`);
    return cuerpo;
  };
  return {
    /** `idempotencia`: si el pedido se repite con la misma clave, Mercado Pago no crea dos cobros. */
    crearPreferencia: (cuerpo, idempotencia) => pedir('/checkout/preferences/', { method: 'POST', body: JSON.stringify(cuerpo), headers: idempotencia ? { 'X-Idempotency-Key': idempotencia } : {} }),
    pago: (id) => pedir(`/v1/payments/${encodeURIComponent(String(id))}`),
  };
}

/**
 * Un Mercado Pago de mentira, SOLO para probar la compra en esta Mac con el emulador de
 * Firebase (vite --mode cuentas): en vez de la página de pago devuelve la vuelta al sitio
 * con un pago aprobado, que después "confirma" cuando se le pregunta. No mueve plata y
 * no existe en el sitio publicado (ahí el emulador está prohibido: firebase.js).
 */
export function mercadoPagoSimulado() {
  const pagos = new Map(); // número -> pago
  let numero = 9000000000;
  return {
    simulado: true,
    async crearPreferencia(cuerpo) {
      const id = String((numero += 1));
      pagos.set(id, { id: Number(id), status: 'approved', currency_id: 'ARS', transaction_amount: cuerpo.items[0].unit_price, external_reference: cuerpo.external_reference, live_mode: false });
      return { id: `simulada-${id}`, init_point: `${cuerpo.back_urls.success}?payment_id=${id}&status=approved` };
    },
    async pago(id) {
      const p = pagos.get(String(id));
      if (!p) throw new ErrorDeMercadoPago(404, 'Ese pago no existe');
      return p;
    },
  };
}

let simulado = null;

/**
 * El Mercado Pago que le toca a como está configurado el sitio: el de verdad si está la
 * llave; con el emulador y sin llave, el de mentira; si no, null (la venta queda apagada).
 */
export function mercadoPagoDelSitio() {
  const real = clienteMercadoPago();
  if (real) return real;
  if (estadoCuentas() === 'emulador') {
    simulado ??= mercadoPagoSimulado();
    return simulado;
  }
  return null;
}

/**
 * ¿El aviso lo firmó Mercado Pago? La cabecera x-signature trae `ts=<momento>,v1=<firma>`;
 * la firma es el HMAC SHA-256, con la clave secreta, de este texto:
 *     id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 * (las partes que no vienen se saltean). `toleranciaSeg`: un aviso más viejo que eso
 * no vale (evita que alguien reenvíe uno viejo).
 */
export function firmaValida({ firma, pedidoId, dataId, secreto, ahora = Date.now(), toleranciaSeg = 15 * 60 }) {
  if (!firma || !secreto) return false;
  let ts = null;
  let v1 = null;
  for (const parte of String(firma).split(',')) {
    const [clave, valor] = parte.split('=').map((x) => x?.trim());
    if (clave?.toLowerCase() === 'ts') ts = valor;
    if (clave?.toLowerCase() === 'v1') v1 = valor;
  }
  if (!ts || !/^\d+$/.test(ts) || !v1) return false;
  // Mercado Pago manda el momento en segundos o en milésimas, según el aviso
  const momento = ts.length > 11 ? Number(ts) : Number(ts) * 1000;
  if (toleranciaSeg && Math.abs(ahora - momento) / 1000 > toleranciaSeg) return false;
  const texto = `${[dataId ? `id:${String(dataId).trim().toLowerCase()}` : null, pedidoId ? `request-id:${String(pedidoId).trim()}` : null, `ts:${ts}`].filter(Boolean).join(';')};`;
  const esperada = createHmac('sha256', secreto).update(texto).digest('hex');
  const [a, b] = [Buffer.from(esperada), Buffer.from(v1)];
  return a.length === b.length && timingSafeEqual(a, b);
}
