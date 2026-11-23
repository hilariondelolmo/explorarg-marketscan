// Venta de tokens - comprar un paquete y acreditarlo.
//
// Decisiones de HDO (23/11/2026): tres paquetes (config.js), precio en pesos al dólar
// oficial del día y sin recargo (dolar.js), tokens que no vencen, y en la Argentina se
// paga con Mercado Pago (mercadopago.js).
//
// Cómo es una compra:
//   1. iniciarCompra   la persona elige un paquete. Se anota la ORDEN (qué paquete, cuántos
//                      pesos, a qué dólar) y se le pide a Mercado Pago la página de pago.
//                      El cobro lleva la referencia "<persona>:<orden>".
//   2. La persona paga en la página de Mercado Pago y vuelve al sitio.
//   3. acreditarPago   se le pregunta a Mercado Pago por ese pago. Si está aprobado, es en
//                      pesos y alcanza para lo que decía la orden, se suman los tokens.
//                      Se llega acá por dos caminos, y los dos hacen lo mismo:
//                        - el aviso que Mercado Pago le manda al servidor (api/pago-mp.js);
//                        - la vuelta de la persona al sitio (api/compra.js).
//
// LA REGLA: los tokens se suman solo por lo que contesta Mercado Pago cuando el servidor
// le pregunta, nunca por lo que diga el navegador ni por lo que traiga un aviso. Y un
// mismo pago se acredita una sola vez (el movimiento lleva el número del pago).
//
// Si el pago después se devuelve o el comprador lo desconoce ante su tarjeta, los
// tokens se sacan (revertirCompra).

import { PAQUETES, POR_DOLAR, enTokens } from '../../src/lib/cuenta/config.js';
import { ErrorDeCuenta, acreditarCompra, asegurarCuenta, revertirCompra } from '../cuentas/cuenta.js';
import { dolarOficial } from './dolar.js';
import { ErrorDeMercadoPago } from './mercadopago.js';

export const MEDIO = 'mp';
const APAGADA = () => new ErrorDeCuenta(503, 'venta_apagada', 'La compra de tokens todavía no está habilitada.');

/** 50.000 tokens al dólar de $ 1.601,32 -> $ 8.007 (sin centavos). */
export const precioEnPesos = (tokens, dolar) => Math.round((tokens / POR_DOLAR) * dolar);

/** Lo que se ofrece hoy: { dolar, paquetes: [{ id, tokens, pesos }] }. */
export async function ofertas(base, opciones = {}) {
  const dolar = await dolarOficial(base, opciones);
  return { dolar, paquetes: PAQUETES.map((p) => ({ id: p.id, tokens: p.tokens, pesos: precioEnPesos(p.tokens, dolar.valor) })) };
}

/**
 * La dirección del sitio, para que Mercado Pago sepa adónde volver y adónde avisar.
 * Publicado es siempre la del sitio (no se toma de lo que mande el navegador); en esta
 * Mac, la de la copia local.
 */
export function direccionDelSitio(req) {
  if (process.env.SITIO_URL) return process.env.SITIO_URL.replace(/\/+$/, '');
  if (process.env.VERCEL) return 'https://www.explorarg.com';
  return req?.headers?.origin || `http://${req?.headers?.host ?? 'localhost:5273'}`;
}

// Mercado Pago solo puede avisarle a una dirección pública con https (a la copia local no llega)
const esPublica = (origen) => /^https:\/\//.test(origen) && !/\/\/(localhost|127\.|\[::1\])/.test(origen);

/**
 * Paso 1. Devuelve { url, ordenId, pesos, tokens }: `url` es la página de Mercado Pago
 * donde la persona paga.
 */
export async function iniciarCompra(base, mp, sesion, paqueteId, { origen, ahora = new Date(), traer } = {}) {
  if (!mp) throw APAGADA();
  const paquete = PAQUETES.find((p) => p.id === paqueteId);
  if (!paquete) throw new ErrorDeCuenta(400, 'paquete_desconocido', 'Ese paquete no existe.');
  await asegurarCuenta(base, sesion, ahora);
  const dolar = await dolarOficial(base, { ahora, ...(traer ? { traer } : {}) });
  const pesos = precioEnPesos(paquete.tokens, dolar.valor);
  const ordenId = await base.guardarCompra(sesion.uid, {
    paquete: paquete.id,
    tokens: paquete.tokens,
    pesos,
    dolar: dolar.valor,
    dolarFecha: dolar.fecha,
    medio: MEDIO,
    estado: 'iniciada',
    fecha: ahora.toISOString(),
  });
  const vuelta = `${origen}/agente/panel`;
  let preferencia;
  try {
    preferencia = await mp.crearPreferencia(
      {
        items: [{ id: paquete.id, title: `${enTokens(paquete.tokens)} de explorarg`, description: 'Tokens para consultar al Agente Explorarg', quantity: 1, currency_id: 'ARS', unit_price: pesos }],
        external_reference: `${sesion.uid}:${ordenId}`,
        back_urls: { success: vuelta, pending: vuelta, failure: vuelta },
        // volver solo al sitio después de pagar y recibir el aviso: solo con el sitio publicado
        ...(esPublica(origen) ? { auto_return: 'approved', notification_url: `${origen}/api/pago-mp` } : {}),
        statement_descriptor: 'EXPLORARG',
      },
      ordenId
    );
  } catch (e) {
    console.error('[compra] Mercado Pago no armó el cobro:', e.message);
    await base.cambiarCompra(sesion.uid, ordenId, { estado: 'fallida' }).catch(() => {});
    throw new ErrorDeCuenta(502, 'sin_mercado_pago', 'No se pudo abrir el pago en Mercado Pago. Probá de nuevo en un rato.');
  }
  if (!preferencia?.init_point) throw new ErrorDeCuenta(502, 'sin_mercado_pago', 'No se pudo abrir el pago en Mercado Pago. Probá de nuevo en un rato.');
  await base.cambiarCompra(sesion.uid, ordenId, { preferenciaId: preferencia.id ?? null });
  return { url: preferencia.init_point, ordenId, pesos, tokens: paquete.tokens };
}

/**
 * Paso 3. Le pregunta a Mercado Pago por el pago y hace lo que corresponde. Devuelve
 * { estado, uid, ordenId, tokens, pesos, saldo }, con `estado`:
 *   acreditado       se sumaron los tokens recién
 *   ya_acreditado    ese pago ya se había acreditado (no se suma dos veces)
 *   pendiente        Mercado Pago todavía no lo aprobó (un pago en efectivo, por ejemplo)
 *   rechazado        no se aprobó
 *   devuelto         el pago se devolvió o se desconoció: se sacaron los tokens
 *   no_corresponde   el pago no existe, no es de una compra de tokens o no coincide con la orden
 *
 * `soloEnVivo`: en el sitio publicado, un pago de prueba no acredita nada.
 */
export async function acreditarPago(base, mp, pagoId, { ahora = new Date(), soloEnVivo = process.env.VERCEL_ENV === 'production' } = {}) {
  if (!mp) throw APAGADA();
  const nada = { estado: 'no_corresponde' };
  if (!/^\d{1,24}$/.test(String(pagoId ?? ''))) return nada;
  let pago;
  try {
    pago = await mp.pago(pagoId);
  } catch (e) {
    if (e instanceof ErrorDeMercadoPago && e.estado === 404) return nada;
    throw e; // Mercado Pago no contestó: que se reintente
  }
  const [uid, ordenId, sobra] = String(pago?.external_reference ?? '').split(':');
  if (!uid || !ordenId || sobra !== undefined) return nada;
  const orden = await base.compra(uid, ordenId);
  if (!orden) return nada;
  const comun = { uid, ordenId, tokens: orden.tokens, pesos: orden.pesos };

  if (pago.status === 'refunded' || pago.status === 'charged_back') {
    const r = await revertirCompra(base, uid, { medio: MEDIO, pagoId, motivo: pago.status }, ahora);
    if (r.revertido) await base.cambiarCompra(uid, ordenId, { estado: 'devuelta', devuelta: ahora.toISOString() });
    return { ...comun, estado: 'devuelto', saldo: r.saldo };
  }
  if (pago.status !== 'approved') {
    return { ...comun, estado: ['pending', 'in_process', 'authorized', 'in_mediation'].includes(pago.status) ? 'pendiente' : 'rechazado' };
  }
  // aprobado: tiene que ser en pesos y alcanzar para lo que decía la orden
  if (pago.currency_id !== 'ARS' || !(Number(pago.transaction_amount) >= orden.pesos)) {
    console.error(`[compra] el pago ${pagoId} no coincide con la orden ${ordenId}: ${pago.transaction_amount} ${pago.currency_id} contra ${orden.pesos} ARS`);
    return nada;
  }
  if (soloEnVivo && pago.live_mode === false) {
    console.error(`[compra] el pago ${pagoId} es de prueba y el sitio está publicado: no se acredita`);
    return nada;
  }
  const r = await acreditarCompra(base, uid, { medio: MEDIO, pagoId, tokens: orden.tokens, pesos: orden.pesos, dolar: orden.dolar, ordenId }, ahora);
  if (r.acreditado) await base.cambiarCompra(uid, ordenId, { estado: 'acreditada', pagoId: String(pagoId), acreditada: ahora.toISOString() });
  return { ...comun, estado: r.acreditado ? 'acreditado' : 'ya_acreditado', saldo: r.saldo };
}
