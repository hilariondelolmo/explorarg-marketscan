// Cuentas de explorarg.com - la cuenta corriente de cada persona.
//
// Es una lista de movimientos, como el resumen de un banco (HDO, 22/11/2026):
//   - al registrarse, 15.000 tokens de bienvenida (equivalen a US$ 1,50);
//   - cada consulta resta lo que consumió (precios.js: su costo más un margen, que es
//     uno para la primera de una tanda y otro para las siguientes dentro de los 5 minutos);
//   - (más adelante) cada compra de créditos suma.
// El saldo se guarda en la ficha de la persona y cada movimiento anota cómo
// quedó, así se puede revisar renglón por renglón.
//
// Cómo se cobra una consulta, en tres pasos:
//   1. reservar    antes de consultar a la IA: si el saldo alcanza para el costo
//                  estimado, se aparta el máximo y queda un movimiento "en curso".
//                  Dos consultas a la vez no pueden gastar el mismo saldo: el
//                  descuento es una transacción.
//   2. confirmar   la consulta salió bien: se cobra lo que consumió de verdad (nunca
//                  más que lo apartado), se devuelve la diferencia, el movimiento
//                  queda "hecha" y la consulta se guarda.
//      devolver    la consulta falló o no se pudo responder: vuelve todo lo
//                  apartado y el movimiento queda "anulada". No se cobra.
//   3. Si el servidor se cae entre el paso 1 y el 2, la reserva queda colgada: se
//      devuelve sola la próxima vez que la persona usa la cuenta (pasados diez minutos).
//
// Todo en tokens de explorarg, números enteros (1 token = un diezmilésimo de dólar; config.js). Este archivo no
// sabe si la base es Firestore o la de prueba: usa lo que ofrece base.js.

import { CREDITO_INICIAL, HERRAMIENTAS, MINUTOS_DE_TANDA, POR_DOLAR, TOPE_SIN_CARGO_POR_DIA, aproxTokens, enTokens } from '../../src/lib/cuenta/config.js';
import { ErrorDeCuenta } from './errores.js';
import { estimadoDe } from './precios.js';

export { ErrorDeCuenta };

const RESERVA_COLGADA_MS = 10 * 60 * 1000;
const TANDA_MS = MINUTOS_DE_TANDA * 60 * 1000;
// el día, como se vive en la Argentina (para el tope diario de consultas sin cargo)
const dia = (fecha) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(fecha);

function cuentaNueva(sesion, ahora) {
  return {
    unidad: POR_DOLAR, // en qué está la plata de esta ficha: tokens de 1/10.000 de dólar
    email: sesion.email,
    nombre: sesion.nombre ?? null,
    creada: ahora.toISOString(),
    saldo: CREDITO_INICIAL,
    consultas: 0, // las que se cobraron
    gastado: 0, // cobrado en consultas
    comprado: 0, // comprado (etapa de ventas)
    sinCargoDia: null, // tope diario de consultas que no se cobran
    sinCargoN: 0,
    enCurso: [], // reservas abiertas: [{ id, precio, fecha }]
    tandas: {}, // por herramienta, cuándo hizo la primera consulta de la tanda en curso
    porHerramienta: {}, // por herramienta, { consultas, gastado }: lo que muestra el panel
  };
}

/**
 * Lee la ficha dentro de una transacción; si la persona es nueva, arma la cuenta
 * con el crédito inicial. Devuelve { u, escribir }: `escribir` son las escrituras
 * pendientes (van después de todas las lecturas, como pide Firestore).
 */
async function abrir(t, sesion, ahora) {
  const existente = await t.usuario();
  if (existente) {
    if (existente.unidad !== POR_DOLAR) throw new Error('La ficha de esta cuenta está en una unidad vieja: hay que migrarla.');
    return { u: existente, escribir: [] };
  }
  const u = cuentaNueva(sesion, ahora);
  return {
    u,
    escribir: [
      () =>
        t.agregarMovimiento({
          tipo: 'credito_inicial',
          detalle: 'Tokens de bienvenida',
          monto: CREDITO_INICIAL,
          saldo: CREDITO_INICIAL,
          fecha: ahora.toISOString(),
          estado: 'hecha',
        }),
    ],
  };
}

/** Devuelve las reservas que quedaron colgadas (el servidor se cayó a mitad de una consulta). */
function soltarColgadas(t, u, ahora) {
  const escribir = [];
  const siguen = [];
  for (const r of u.enCurso ?? []) {
    if (ahora.getTime() - new Date(r.fecha).getTime() < RESERVA_COLGADA_MS) {
      siguen.push(r);
      continue;
    }
    u.saldo += r.precio;
    const saldo = u.saldo;
    escribir.push(() => t.cambiarMovimiento(r.id, { estado: 'anulada', motivo: 'sin_respuesta', monto: 0, saldo }));
  }
  u.enCurso = siguen;
  return escribir;
}

/**
 * ¿Hasta cuándo dura la tanda de esta persona con esta herramienta? La tanda
 * arranca con su primera consulta cobrada y dura 5 minutos desde ese momento.
 * Devuelve la fecha en que termina, o null si no está en una tanda.
 */
function finDeTanda(u, herramienta, ahora) {
  const inicio = u.tandas?.[herramienta];
  if (!inicio) return null;
  const fin = new Date(inicio).getTime() + TANDA_MS;
  return ahora.getTime() < fin ? new Date(fin) : null;
}

/**
 * Lo que la página muestra antes de consultar, para cada herramienta: el costo
 * estimado y el máximo de la primera consulta y de las siguientes, y hasta
 * cuándo esta persona tiene el precio de "siguiente".
 */
function preciosPara(u, ahora) {
  return Object.fromEntries(
    Object.keys(HERRAMIENTAS).map((h) => [
      h,
      { primera: estimadoDe(h, true), siguiente: estimadoDe(h, false), tandaHasta: finDeTanda(u, h, ahora)?.toISOString() ?? null },
    ])
  );
}

/** Crea la cuenta si hace falta (con su crédito inicial) y devuelve la ficha. */
export function asegurarCuenta(base, sesion, ahora = new Date()) {
  return base.transaccion(sesion.uid, async (t) => {
    const { u, escribir } = await abrir(t, sesion, ahora);
    const colgadas = soltarColgadas(t, u, ahora);
    if (escribir.length || colgadas.length) {
      [...escribir, ...colgadas].forEach((w) => w());
      t.guardarUsuario(u);
    }
    return u;
  });
}

/**
 * Paso 1: aparta la plata de la consulta. Devuelve
 * { id, herramienta, primera, estimado, apartado, fecha, saldo }.
 * Tira ErrorDeCuenta si el saldo no alcanza para el costo estimado (402) o si la
 * persona ya hizo hoy demasiadas consultas que no se cobraron (429).
 */
export function reservar(base, sesion, herramienta, ahora = new Date()) {
  return base.transaccion(sesion.uid, async (t) => {
    const { u, escribir } = await abrir(t, sesion, ahora);
    escribir.push(...soltarColgadas(t, u, ahora));

    const hoy = dia(ahora);
    if (u.sinCargoDia === hoy && u.sinCargoN >= TOPE_SIN_CARGO_POR_DIA) {
      throw new ErrorDeCuenta(429, 'muchas_sin_cargo', 'Hoy hiciste muchas consultas que no se pudieron responder. Probá de nuevo mañana.', { saldo: u.saldo });
    }
    const primera = !finDeTanda(u, herramienta, ahora);
    const { estimado, maximo } = estimadoDe(herramienta, primera);
    if (u.saldo < estimado) {
      throw new ErrorDeCuenta(
        402,
        'sin_saldo',
        `Tus tokens no alcanzan para esta consulta: te quedan ${enTokens(u.saldo)} y una consulta del ${HERRAMIENTAS[herramienta]} cuesta cerca de ${aproxTokens(estimado)}.`,
        { saldo: u.saldo, estimado }
      );
    }

    escribir.forEach((w) => w());
    // se aparta el máximo; si queda menos que eso, lo que queda (el cobro nunca pasa de lo apartado)
    const apartado = Math.min(maximo, u.saldo);
    u.saldo -= apartado;
    const fecha = ahora.toISOString();
    const id = t.agregarMovimiento({
      tipo: 'consulta',
      herramienta,
      detalle: `Consulta del ${HERRAMIENTAS[herramienta]}`,
      monto: -apartado,
      saldo: u.saldo,
      fecha,
      estado: 'en_curso',
      primera,
      estimado,
    });
    u.enCurso = [...(u.enCurso ?? []), { id, precio: apartado, fecha }];
    t.guardarUsuario(u);
    return { id, herramienta, primera, estimado, apartado, fecha, saldo: u.saldo };
  });
}

/**
 * Paso 2, si salió bien: se cobra `monto` (lo que la consulta consumió, ya con el
 * margen; nunca más que lo apartado), vuelve la diferencia y la consulta queda
 * guardada. `registro` es lo que se guarda de la consulta (pedido, respuesta,
 * modelo, consumo, costos). Si era la primera, acá arranca la tanda.
 * Devuelve { saldo, monto, consultaId, precios }.
 */
export async function confirmar(base, sesion, reserva, registro, monto, ahora = new Date()) {
  const cobrado = Math.max(1, Math.min(Math.round(monto), reserva.apartado));
  const consultaId = await base.guardarConsulta(sesion.uid, {
    ...registro,
    herramienta: reserva.herramienta,
    primera: reserva.primera,
    estimado: reserva.estimado,
    precio: cobrado,
    movimientoId: reserva.id,
    fecha: ahora.toISOString(),
  });
  return base.transaccion(sesion.uid, async (t) => {
    const u = await t.usuario();
    const abierta = (u.enCurso ?? []).some((r) => r.id === reserva.id);
    if (abierta) {
      u.enCurso = u.enCurso.filter((r) => r.id !== reserva.id);
      u.saldo += reserva.apartado - cobrado;
      u.consultas += 1;
      u.gastado += cobrado;
      const antes = u.porHerramienta?.[reserva.herramienta] ?? { consultas: 0, gastado: 0 };
      u.porHerramienta = { ...(u.porHerramienta ?? {}), [reserva.herramienta]: { consultas: antes.consultas + 1, gastado: antes.gastado + cobrado } };
      // la tanda se cuenta desde que se mandó la primera consulta
      if (reserva.primera) u.tandas = { ...(u.tandas ?? {}), [reserva.herramienta]: reserva.fecha };
      t.cambiarMovimiento(reserva.id, { estado: 'hecha', consultaId, monto: -cobrado, saldo: u.saldo });
      t.guardarUsuario(u);
    } // si ya estaba cerrada, no se toca dos veces
    return { saldo: u.saldo, monto: cobrado, consultaId, precios: preciosPara(u, ahora) };
  });
}

/**
 * Paso 2, si salió mal: vuelve todo lo apartado y la consulta cuenta para el tope
 * diario de consultas sin cargo. Devuelve { saldo, precios }.
 * `extra` es lo que se sabe de esa consulta que no se cobró (el pedido y, si la IA llegó
 * a contestar, el modelo, el consumo y lo que le costó a Explora): queda anotado en el
 * movimiento para el panel de administrador. La persona no lo ve.
 */
export function devolver(base, sesion, reserva, motivo, ahora = new Date(), extra = {}) {
  // Firestore no acepta valores sin definir
  const anotado = Object.fromEntries(Object.entries(extra ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  return base.transaccion(sesion.uid, async (t) => {
    const u = await t.usuario();
    const abierta = (u.enCurso ?? []).some((r) => r.id === reserva.id);
    if (abierta) {
      u.enCurso = u.enCurso.filter((r) => r.id !== reserva.id);
      u.saldo += reserva.apartado;
      const hoy = dia(ahora);
      u.sinCargoN = u.sinCargoDia === hoy ? u.sinCargoN + 1 : 1;
      u.sinCargoDia = hoy;
      t.cambiarMovimiento(reserva.id, { ...anotado, estado: 'anulada', motivo, monto: 0, saldo: u.saldo });
      t.guardarUsuario(u);
    } // si ya estaba cerrada, no se devuelve dos veces
    return { saldo: u.saldo, precios: preciosPara(u, ahora) };
  });
}

/**
 * Suma a la cuenta los tokens de una compra ya pagada. El movimiento lleva como id el
 * del pago (`<medio>-<pagoId>`): si ese pago ya se acreditó, no se acredita de nuevo.
 * Quién decide que el pago vale es server/pagos/compra.js; acá solo se anota.
 * Devuelve { acreditado, saldo }: `acreditado` es false si ya estaba.
 */
export function acreditarCompra(base, uid, { medio, pagoId, tokens, pesos = null, dolar = null, ordenId = null }, ahora = new Date()) {
  if (!Number.isInteger(tokens) || tokens <= 0) throw new Error('Una compra tiene que sumar una cantidad entera de tokens.');
  const id = `${medio}-${pagoId}`;
  return base.transaccion(uid, async (t) => {
    const [u, ya] = [await t.usuario(), await t.movimiento(id)];
    if (!u) throw new ErrorDeCuenta(404, 'cuenta_no_encontrada', 'No existe la cuenta de esa compra.');
    if (ya) return { acreditado: false, saldo: u.saldo };
    u.saldo += tokens;
    u.comprado = (u.comprado ?? 0) + tokens;
    t.ponerMovimiento(id, { tipo: 'compra', detalle: `Compra de ${enTokens(tokens)}`, monto: tokens, saldo: u.saldo, fecha: ahora.toISOString(), estado: 'hecha', medio, pagoId: String(pagoId), pesos, dolar, ordenId });
    t.guardarUsuario(u);
    return { acreditado: true, saldo: u.saldo };
  });
}

/**
 * El pago de una compra se devolvió o el comprador lo desconoció ante su tarjeta: se
 * sacan los tokens que había sumado, una sola vez. Si ya gastó una parte, se saca lo
 * que queda (el saldo no queda negativo) y el movimiento anota cuánto faltó.
 * Devuelve { revertido, saldo }.
 */
export function revertirCompra(base, uid, { medio, pagoId, motivo }, ahora = new Date()) {
  const id = `${medio}-${pagoId}`;
  return base.transaccion(uid, async (t) => {
    const [u, compra, ya] = [await t.usuario(), await t.movimiento(id), await t.movimiento(`${id}-dev`)];
    if (!u || !compra || ya) return { revertido: false, saldo: u?.saldo ?? 0 };
    const sacado = Math.min(compra.monto, u.saldo);
    u.saldo -= sacado;
    u.comprado = Math.max(0, (u.comprado ?? 0) - compra.monto);
    t.ponerMovimiento(`${id}-dev`, { tipo: 'devolucion_compra', detalle: `Compra anulada (${enTokens(compra.monto)})`, monto: -sacado, saldo: u.saldo, fecha: ahora.toISOString(), estado: 'hecha', medio, pagoId: String(pagoId), motivo, faltaron: compra.monto - sacado });
    t.guardarUsuario(u);
    return { revertido: true, saldo: u.saldo };
  });
}

/** Lo que la página necesita saber de la cuenta: el saldo y lo que cuesta consultar. */
export async function resumen(base, sesion, ahora = new Date()) {
  const u = await asegurarCuenta(base, sesion, ahora);
  return {
    saldo: u.saldo,
    creditoInicial: CREDITO_INICIAL,
    precios: preciosPara(u, ahora),
    consultas: u.consultas,
    gastado: u.gastado,
    creada: u.creada,
  };
}

const MAX_EN_EL_PANEL = 200;

/**
 * El panel de la persona: sus tokens, lo que lleva usado con cada herramienta, sus
 * consultas guardadas y los movimientos de la cuenta. Las consultas van sin la
 * respuesta entera (pesa): para reabrir una se pide aparte con consultaGuardada.
 */
export async function panel(base, sesion, ahora = new Date()) {
  const u = await asegurarCuenta(base, sesion, ahora);
  const [movimientos, consultas] = await Promise.all([base.movimientos(sesion.uid, MAX_EN_EL_PANEL), base.consultas(sesion.uid, MAX_EN_EL_PANEL)]);
  // Las cuentas de antes de que se llevara el total por herramienta: se arma con las consultas
  const sinTotales = !u.porHerramienta || !Object.keys(u.porHerramienta).length;
  const porHerramienta = Object.fromEntries(
    Object.keys(HERRAMIENTAS).map((h) => {
      if (!sinTotales) return [h, u.porHerramienta[h] ?? { consultas: 0, gastado: 0 }];
      const suyas = consultas.filter((c) => c.herramienta === h);
      return [h, { consultas: suyas.length, gastado: suyas.reduce((s, c) => s + (c.precio ?? 0), 0) }];
    })
  );
  return {
    email: u.email,
    creada: u.creada,
    saldo: u.saldo,
    bienvenida: CREDITO_INICIAL,
    comprado: u.comprado ?? 0,
    gastado: u.gastado,
    consultasHechas: u.consultas,
    porHerramienta,
    precios: preciosPara(u, ahora),
    consultas: consultas.map((c) => ({ id: c.id, herramienta: c.herramienta, pedido: c.pedido ?? '', contexto: c.contexto ?? '', fecha: c.fecha, precio: c.precio ?? 0, primera: c.primera ?? null })),
    // las anuladas no se cobraron: no van al resumen de la cuenta
    movimientos: movimientos
      .filter((m) => m.estado !== 'anulada')
      .map((m) => ({ id: m.id, tipo: m.tipo, detalle: m.detalle ?? '', herramienta: m.herramienta ?? null, monto: m.monto, saldo: m.saldo, fecha: m.fecha, estado: m.estado, primera: m.primera ?? null })),
  };
}

/** Una consulta guardada de la persona, entera, para volver a abrirla sin gastar. null si no es suya o no existe. */
export async function consultaGuardada(base, sesion, id) {
  if (typeof id !== 'string' || !/^[\w-]{6,80}$/.test(id)) return null;
  const c = await base.consulta(sesion.uid, id);
  if (!c) return null;
  return { id: c.id ?? id, herramienta: c.herramienta, pedido: c.pedido ?? '', contexto: c.contexto ?? '', fecha: c.fecha, precio: c.precio ?? 0, respuestaJson: c.respuestaJson ?? null };
}
