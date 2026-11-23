// Venta de tokens - el dólar oficial del día.
//
// Los tokens valen en dólares (10.000 tokens = US$ 1) y en la Argentina se venden en
// pesos: el precio sale del dólar oficial del día, sin recargo (decisión de HDO,
// 23/11/2026).
//
// El dólar que se usa es el "tipo de cambio minorista (promedio vendedor)" que publica
// el Banco Central (variable 4 de su servicio de datos): el promedio de lo que cobran
// los bancos por vender un dólar. Sale cada día hábil; el fin de semana vale el del viernes.
//
// Cómo se cuida que haya siempre una cotización:
//   - se le pregunta al Banco Central y la respuesta sirve por tres horas;
//   - cada cotización leída queda guardada en la base (base.guardarAjuste);
//   - si el Banco Central no contesta, se usa la última guardada, siempre que tenga
//     siete días o menos; con una más vieja no se vende (mejor no vender que vender mal);
//   - de emergencia, la variable DOLAR_FIJO manda sobre todo lo demás.

import { ErrorDeCuenta } from '../cuentas/cuenta.js';

export const URL_BCRA = 'https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/4?limit=1';
export const FUENTE_DOLAR = 'Banco Central, tipo de cambio minorista (promedio vendedor)';
const FRESCO_MS = 3 * 60 * 60 * 1000;
const MAXIMO_VIEJO_DIAS = 7;
const DIA_MS = 24 * 60 * 60 * 1000;

let enMemoria = null; // { valor, fecha, leido }

/** Solo para los controles: olvida la cotización que quedó en memoria. */
export function olvidarDolar() {
  enMemoria = null;
}

async function preguntarAlBcra(traer) {
  const r = await traer(URL_BCRA, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`El Banco Central contestó ${r.status}`);
  const dato = (await r.json())?.results?.[0]?.detalle?.[0];
  const valor = Number(dato?.valor);
  if (!dato?.fecha || !Number.isFinite(valor) || valor <= 0) throw new Error('El Banco Central no trajo una cotización');
  return { valor, fecha: String(dato.fecha) };
}

const sirve = (c, ahora) => Boolean(c?.valor > 0 && c.fecha) && ahora.getTime() - new Date(`${c.fecha}T12:00:00-03:00`).getTime() <= MAXIMO_VIEJO_DIAS * DIA_MS;

/**
 * La cotización con la que se arma el precio en pesos: { valor, fecha, fuente }.
 * Tira ErrorDeCuenta (503) si no hay ninguna cotización que sirva.
 */
export async function dolarOficial(base, { ahora = new Date(), traer = fetch } = {}) {
  const fijo = Number(process.env.DOLAR_FIJO);
  if (Number.isFinite(fijo) && fijo > 0) return { valor: fijo, fecha: null, fuente: 'Valor fijado a mano (DOLAR_FIJO)' };

  if (enMemoria && ahora.getTime() - enMemoria.leido < FRESCO_MS) return { valor: enMemoria.valor, fecha: enMemoria.fecha, fuente: FUENTE_DOLAR };
  try {
    const c = await preguntarAlBcra(traer);
    enMemoria = { ...c, leido: ahora.getTime() };
    // que no se pueda guardar no frena la venta: la cotización ya está
    await base.guardarAjuste('dolar', { ...c, leido: ahora.toISOString() }).catch((e) => console.error('[dolar] no se pudo guardar la cotización:', e));
    return { ...c, fuente: FUENTE_DOLAR };
  } catch (e) {
    console.error('[dolar] no se pudo leer la cotización del Banco Central:', e.message);
  }
  // el Banco Central no contestó: la última que se haya leído, si no es vieja
  const guardada = enMemoria ?? (await base.ajuste('dolar').catch(() => null));
  if (sirve(guardada, ahora)) return { valor: guardada.valor, fecha: guardada.fecha, fuente: FUENTE_DOLAR };
  throw new ErrorDeCuenta(503, 'sin_cotizacion', 'En este momento no se puede calcular el precio en pesos. Probá de nuevo en un rato.');
}
