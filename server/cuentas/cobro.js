// Cuentas de explorarg.com - cobrar una consulta.
//
// Lo usan api/poligrafo.js y api/analista.js para envolver la consulta a la IA:
//
//   const { resultado, cuenta } = await conCobro(sesion, 'analista', async () => {
//     ... consulta a la IA ...
//     return { cobrar: true, modelo, uso, registro: { ... }, ... };
//   });
//
// `hacer` devuelve `cobrar`: true si la persona recibió su respuesta, junto con el
// `modelo` y el `uso` (los tokens) que informó la IA: con eso se calcula lo que se
// cobra (precios.js). Si `cobrar` es false (no se pudo responder) o si `hacer`
// tira un error, la plata apartada se devuelve.
//
// `cuenta` es lo que la página necesita para actualizarse: { saldo, cobrado,
// estimado, primera, precios }, o null con las cuentas apagadas (el prototipo
// local, que no cobra).

import { abrirBase } from './base.js';
import { ErrorDeCuenta, confirmar, devolver, reservar } from './cuenta.js';
import { costoDeLista, costoParaExplora, precioAlUsuario } from './precios.js';

/** La base de la cuenta corriente; si no está, no se puede cobrar y entonces no se consulta. */
export function baseOError() {
  const base = abrirBase();
  if (!base) throw new ErrorDeCuenta(503, 'cuentas_sin_base', 'Los tokens de las cuentas todavía no están habilitados.');
  return base;
}

// `datos.pedido`: lo que escribió la persona. Si la consulta no se cobra, queda anotado junto
// al movimiento anulado, para que el panel de administrador muestre qué no se pudo responder.
export async function conCobro(sesion, herramienta, hacer, datos = {}) {
  if (sesion.local) return { resultado: await hacer(), cuenta: null };

  const base = baseOError();
  const reserva = await reservar(base, sesion, herramienta);
  let resultado;
  try {
    resultado = await hacer();
  } catch (e) {
    await devolver(base, sesion, reserva, 'fallo', new Date(), { pedido: datos.pedido }).catch((e2) => console.error('[cuentas] no se pudo devolver una reserva:', e2));
    throw e;
  }
  if (!resultado.cobrar) {
    // no se cobra, pero la IA contestó: a Explora le costó igual, y queda anotado cuánto
    const d = await devolver(base, sesion, reserva, resultado.motivo ?? 'sin_respuesta', new Date(), {
      pedido: resultado.registro?.pedido ?? datos.pedido,
      motor: resultado.registro?.motor,
      modelo: resultado.modelo,
      uso: resultado.uso,
      costoParaExploraUsd: costoParaExplora(resultado.modelo, resultado.uso),
    });
    return { resultado, cuenta: { saldo: d.saldo, cobrado: 0, estimado: reserva.estimado, primera: reserva.primera, precios: d.precios } };
  }

  // lo que consumió, a precio de lista, según sea su primera consulta o una siguiente
  const costoLista = costoDeLista(resultado.modelo, resultado.uso, reserva.primera);
  // si no se conoce el precio del modelo, se cobra el estimado
  const monto = costoLista === null ? reserva.estimado : precioAlUsuario(costoLista, reserva.primera);
  const c = await confirmar(
    base,
    sesion,
    reserva,
    { ...(resultado.registro ?? {}), modelo: resultado.modelo ?? null, uso: resultado.uso ?? null, costoListaUsd: costoLista, costoParaExploraUsd: costoParaExplora(resultado.modelo, resultado.uso) },
    monto
  );
  return { resultado, cuenta: { saldo: c.saldo, cobrado: c.monto, estimado: reserva.estimado, primera: reserva.primera, consultaId: c.consultaId, precios: c.precios } };
}
