// Banco de prueba de las cuentas de explorarg.com: el candado del servidor.
//
//   node scripts/cuentas_prueba.mjs
//
// Tres partes:
//   1. El candado (server/cuentas/sesion.js), que impide consultar a la IA sin sesión.
//      Lo que usa credenciales de verdad necesita el emulador de Firebase
//      (configuración "cuentas-emulador" de .claude/launch.json): si no está
//      levantado, se saltea y lo avisa.
//   2. Lo que cuesta una consulta (server/cuentas/precios.js) y la cuenta corriente
//      (server/cuentas/cuenta.js), con la base de prueba en memoria: crédito inicial,
//      primera consulta y siguientes, devolución, tope diario y consultas a la vez.
//      También el panel de administrador y la compra de tokens (server/pagos/), con un
//      Banco Central y un Mercado Pago de mentira: acá no se mueve plata ni se sale a internet.
//   3. Lo mismo, en chico, contra la base de verdad (Firestore), en una colección
//      aparte ("pruebas_usuarios") que se borra al terminar. Necesita la llave del
//      servidor en ~/.cache/explorarg/firebase-servicio.json: si no está, se saltea.

import { EMULADOR_AUTH, PROYECTO_EMULADOR } from '../src/lib/cuenta/config.js';

let fallas = 0;
function control(nombre, obtenido, esperado) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallas += 1;
  console.log(`${ok ? '  ok ' : 'FALLA'}  ${nombre}${ok ? '' : `\n         obtenido: ${JSON.stringify(obtenido)}\n         esperado: ${JSON.stringify(esperado)}`}`);
}

const VARIABLES = ['VERCEL', 'VERCEL_ENV', 'FIREBASE_PROJECT_ID', 'VITE_FIREBASE_PROJECT_ID', 'FIREBASE_AUTH_EMULATOR_HOST', 'CUENTAS_ADMIN', 'MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET', 'SITIO_URL', 'DOLAR_FIJO'];
function conEntorno(valores) {
  for (const k of VARIABLES) delete process.env[k];
  Object.assign(process.env, valores);
}

// Precios DE EJEMPLO, solo para estos controles: costo más 100% la primera consulta de una
// tanda y más 200% las siguientes, y un consumo típico inventado. Los de verdad no están en
// el repositorio (es público): van en la variable CUENTAS_PRECIOS del servidor
// (server/cuentas/precios.js). No escribirlos acá.
const PRECIOS_DE_EJEMPLO = JSON.stringify({
  margen: { primera: 100, siguientes: 200 },
  consumo: { poligrafo: { fijo: 46500, variable: 300, salida: 1800 }, analista: { fijo: 9300, variable: 100, salida: 220 } },
});
process.env.CUENTAS_PRECIOS = PRECIOS_DE_EJEMPLO;

const { ErrorDeSesion, estadoCuentas, exigirSesion } = await import('../server/cuentas/sesion.js');
/** Qué contesta el candado: 'pasa' o el código del rechazo. */
async function candado(cabeceras) {
  try {
    const s = await exigirSesion({ headers: cabeceras });
    return s.local ? 'pasa (local)' : `pasa (${s.email})`;
  } catch (e) {
    if (e instanceof ErrorDeSesion) return `${e.estadoHttp} ${e.codigo}`;
    throw e;
  }
}

// ------------------------------------------------------------------ en qué estado quedan las cuentas
conEntorno({});
control('en esta Mac, sin nada configurado: cuentas apagadas (el prototipo sigue abierto)', [estadoCuentas(), await candado({})], ['apagadas', 'pasa (local)']);
conEntorno({ VERCEL: '1' });
control('publicado y sin configurar: se niega todo', [estadoCuentas(), await candado({ authorization: 'Bearer lo-que-sea' })], ['sin_configurar', '503 cuentas_sin_configurar']);
conEntorno({ VERCEL: '1', FIREBASE_PROJECT_ID: 'x', FIREBASE_AUTH_EMULATOR_HOST: EMULADOR_AUTH });
control('publicado con el emulador encendido por error: se niega todo (el emulador acepta credenciales sin firma)', [estadoCuentas(), await candado({ authorization: 'Bearer lo-que-sea' })], ['sin_configurar', '503 cuentas_sin_configurar']);
conEntorno({ VERCEL: '1', VITE_FIREBASE_PROJECT_ID: 'x' });
control('publicado con el proyecto configurado: cuentas reales', estadoCuentas(), 'real');

// ------------------------------------------------------------------ sin credencial no pasa
conEntorno({ FIREBASE_PROJECT_ID: PROYECTO_EMULADOR, FIREBASE_AUTH_EMULATOR_HOST: EMULADOR_AUTH });
control('sin cabecera: 401', await candado({}), '401 sin_ingreso');
control('con una cabecera que no es una credencial: 401', await candado({ authorization: 'Basic abc' }), '401 sin_ingreso');

// ------------------------------------------------------------------ con el emulador
const base = `http://${EMULADOR_AUTH}`;
const api = (camino, cuerpo) =>
  fetch(`${base}/identitytoolkit.googleapis.com/v1/${camino}?key=clave-de-prueba`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }).then((r) => r.json());
const hayEmulador = await fetch(base, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok).catch(() => false);

if (!hayEmulador) {
  console.log('\n  --   El emulador de Firebase no está levantado: se saltean los controles con credenciales de verdad.');
} else {
  control('una credencial inventada: 401', await candado({ authorization: 'Bearer abc.def.ghi' }), '401 sesion_vencida');

  // una persona que entra con el enlace del mail, como en la página
  const mail = `control.${Date.now()}@explorarg.test`;
  await api('accounts:sendOobCode', { requestType: 'EMAIL_SIGNIN', email: mail, continueUrl: 'http://localhost:5274/agente' });
  const codigos = await fetch(`${base}/emulator/v1/projects/${PROYECTO_EMULADOR}/oobCodes`).then((r) => r.json());
  const oobCode = codigos.oobCodes.filter((c) => c.email === mail).pop()?.oobCode;
  const conEnlace = await api('accounts:signInWithEmailLink', { email: mail, oobCode });
  control('quien entra con el enlace del mail pasa, y el servidor sabe quién es', await candado({ authorization: `Bearer ${conEnlace.idToken}` }), `pasa (${mail})`);
  control('la misma credencial, cortada: 401', await candado({ authorization: `Bearer ${String(conEnlace.idToken).slice(0, -6)}` }), '401 sesion_vencida');

  // una cuenta con mail y contraseña no tiene el mail comprobado: no consulta
  const sinComprobar = await api('accounts:signUp', { email: `sin.comprobar.${Date.now()}@explorarg.test`, password: 'solo-para-el-control', returnSecureToken: true });
  control('una cuenta con el mail sin comprobar no consulta: 403', await candado({ authorization: `Bearer ${sinComprobar.idToken}` }), '403 mail_sin_comprobar');

  // el panel de administrador (api/admin.js): solo para el mail que figura en CUENTAS_ADMIN
  const { default: admin } = await import('../api/admin.js');
  /** Qué contesta el panel: [estado, código del rechazo o los bloques que trae]. */
  const pedirPanel = async (credencial) => {
    let estado = 200;
    let cuerpo = null;
    const res = { status: (c) => ((estado = c), res), json: (o) => (cuerpo = o), setHeader: () => {} };
    await admin({ method: 'GET', headers: credencial ? { authorization: `Bearer ${credencial}` } : {} }, res);
    return [estado, cuerpo?.codigo ?? Object.keys(cuerpo ?? {}).join(',')];
  };
  process.env.CUENTAS_ADMIN = `otro@explorarg.test, ${mail.toUpperCase()}`;
  control('panel de administrador: entra quien figura en CUENTAS_ADMIN (sin importar mayúsculas)', await pedirPanel(conEnlace.idToken), [200, 'generado,totales,cuentas,consultas,indeterminadas,sinCobrar,compras']);
  process.env.CUENTAS_ADMIN = 'otro@explorarg.test';
  control('panel de administrador: cualquier otra cuenta recibe un 403', await pedirPanel(conEnlace.idToken), [403, 'no_admin']);
  delete process.env.CUENTAS_ADMIN;
  control('panel de administrador: sin CUENTAS_ADMIN nadie entra, y sin sesión tampoco', [await pedirPanel(conEnlace.idToken), await pedirPanel(null)], [[403, 'no_admin'], [401, 'sin_ingreso']]);

  // el resumen de la cuenta (api/cuenta.js) avisa si se pueden comprar tokens: con eso el cartel de
  // "tus tokens no alcanzan" manda a Mi panel (con el emulador hay un Mercado Pago de mentira)
  const { default: cuentaApi } = await import('../api/cuenta.js');
  let resumenApi = null;
  const resCuenta = { status: () => resCuenta, json: (o) => (resumenApi = o), setHeader: () => {} };
  await cuentaApi({ method: 'GET', url: '/api/cuenta', headers: { authorization: `Bearer ${conEnlace.idToken}` } }, resCuenta);
  control('el resumen de la cuenta avisa que se pueden comprar tokens, y a quien no administra no le dice que administra', [Number.isInteger(resumenApi?.saldo), resumenApi?.compra, resumenApi?.admin], [true, true, undefined]);
}

// ================================================================== lo que cuesta una consulta
console.log('\nLo que cuesta una consulta');
const { baseEnMemoria, baseFirestore } = await import('../server/cuentas/base.js');
const { ErrorDeCuenta, asegurarCuenta, confirmar, consultaGuardada, devolver, panel, reservar, resumen } = await import('../server/cuentas/cuenta.js');
const { conCobro } = await import('../server/cuentas/cobro.js');
const { costoDeLista, costoParaExplora, estimadoDe, hayPrecios, margenDe, precioAlUsuario } = await import('../server/cuentas/precios.js');
const { CREDITO_INICIAL, MINUTOS_DE_TANDA, POR_DOLAR, TOPE_SIN_CARGO_POR_DIA, aproxTokens, enDolares, enTokens } = await import('../src/lib/cuenta/config.js');
const P1 = estimadoDe('poligrafo', true);
const P2 = estimadoDe('poligrafo', false);
const A1 = estimadoDe('analista', true);
const A2 = estimadoDe('analista', false);
const r6 = (x) => Math.round(x * 1e6) / 1e6;
// la consulta de HDO del 22/11/2026 al Polígrafo: 59.230 tokens de entrada (59.228 de consigna) y 2.807 de salida
const USO = { entrada: 59230, entradaDeCache: 0, entradaACache: 59228, salida: 2807 };
const USO_LEIDO = { entrada: 59230, entradaDeCache: 59228, entradaACache: 0, salida: 2807 };
// lo que se cobra por ese consumo, con los márgenes de ejemplo
const PRECIO_1 = precioAlUsuario(costoDeLista('claude-opus-5-5', USO, true), true);
const PRECIO_2 = precioAlUsuario(costoDeLista('claude-opus-5-5', USO, false), false);
// lo que consume una consulta en los casos de la cuenta corriente: un poco menos que el estimado
const COBRO_1 = Math.round(P1.estimado * 0.91);
const COBRO_2 = Math.round(P2.estimado * 0.97);

// Al usuario se le habla en tokens de explorarg (HDO, 22/11/2026): 1 token = un diezmilésimo de dólar.
control('los tokens: 10.000 por dólar, y 15.000 de bienvenida (equivalen a US$ 1,50)', [POR_DOLAR, enTokens(CREDITO_INICIAL), enDolares(CREDITO_INICIAL)], [10000, '15.000 tokens', 'US$ 1,50']);
control('los montos exactos se muestran enteros y los estimados, redondeados a dos cifras', [enTokens(14412), enTokens(1), aproxTokens(5176), aproxTokens(7764), aproxTokens(1046), aproxTokens(540), aproxTokens(101)], ['14.412 tokens', '1 token', '5.200 tokens', '7.800 tokens', '1.000 tokens', '540 tokens', '100 tokens']);
control('regla de HDO: un margen para la primera consulta y otro para las siguientes dentro de los 5 minutos (acá, los de ejemplo)', [margenDe(true), margenDe(false), MINUTOS_DE_TANDA], [2, 3, 5]);
// los precios salen de una variable del servidor: sin ella no hay precio, y entonces no se consulta
const sinPrecio = () => {
  try {
    return estimadoDe('poligrafo', true).estimado;
  } catch (e) {
    return `${e.estadoHttp} ${e.codigo}`;
  }
};
delete process.env.CUENTAS_PRECIOS;
control('sin la variable de precios no hay precio: 503 (y no se consulta)', [sinPrecio(), hayPrecios()], ['503 cuentas_sin_precios', false]);
process.env.CUENTAS_PRECIOS = 'esto no es un JSON';
control('una variable de precios que no se puede leer tampoco vale', sinPrecio(), '503 cuentas_sin_precios');
process.env.CUENTAS_PRECIOS = JSON.stringify({ margen: { primera: 100, siguientes: 200 }, consumo: { poligrafo: { fijo: 46500, variable: 300, salida: 1800 } } });
control('ni una a la que le falta el consumo de una herramienta', sinPrecio(), '503 cuentas_sin_precios');
process.env.CUENTAS_PRECIOS = JSON.stringify({ margen: { primera: '100', siguientes: 200 }, consumo: JSON.parse(PRECIOS_DE_EJEMPLO).consumo });
control('ni una con un margen que no es un número', sinPrecio(), '503 cuentas_sin_precios');
process.env.CUENTAS_PRECIOS = PRECIOS_DE_EJEMPLO;
control('con la variable bien cargada hay precio', hayPrecios(), true);
control('costo de lista de esa consulta: 35,2 centavos si es la primera y 6,8 si es una siguiente', [r6(costoDeLista('claude-opus-5-5', USO, true)), r6(costoDeLista('claude-opus-5-5', USO, false))], [0.352288, 0.067994]);
control('el costo no depende de lo que pasó en la caché, sino de si es la primera de esa persona', [r6(costoDeLista('claude-opus-5-5', USO_LEIDO, true)), r6(costoDeLista('claude-opus-5-5', USO_LEIDO, false))], [0.352288, 0.067994]);
control('se cobra el costo por el margen (acá, los de ejemplo): la primera 7.046 tokens y una siguiente 2.040', [enTokens(PRECIO_1), enDolares(PRECIO_1), enTokens(PRECIO_2), enDolares(PRECIO_2)], ['7.046 tokens', 'US$ 0,70', '2.040 tokens', 'US$ 0,20']);
control('lo que le costó a Explora queda aparte: caro si se escribió la caché, barato si se leyó', [r6(costoParaExplora('claude-opus-5-5', USO)), r6(costoParaExplora('claude-opus-5-5', USO_LEIDO))], [0.352288, 0.067994]);
control('costo estimado que se muestra antes de consultar, con los precios de ejemplo (y el máximo, 50% más)', [aproxTokens(P1.estimado), aproxTokens(P1.maximo), aproxTokens(P2.estimado), aproxTokens(A1.estimado), aproxTokens(A2.estimado), P1.maximo === Math.ceil(P1.estimado * 1.5)], ['5.400 tokens', '8.100 tokens', '1.400 tokens', '510 tokens', '100 tokens', true]);
control('un modelo sin precio de lista no tiene costo calculado (se cobra el estimado)', costoDeLista('otro-modelo', USO, true), null);

// ================================================================== la cuenta corriente
console.log('\nLa cuenta corriente');

/** Qué pasa al reservar: la reserva, o el código del rechazo. */
async function intento(base, sesion, herramienta, ahora) {
  try {
    return await reservar(base, sesion, herramienta, ahora);
  } catch (e) {
    if (e instanceof ErrorDeCuenta) return `${e.estadoHttp} ${e.codigo}`;
    throw e;
  }
}
/** La regla de oro: el saldo es la suma de los movimientos, y nunca es negativo. */
async function cuadra(base, uid) {
  const u = await base.transaccion(uid, (t) => t.usuario());
  const suma = (await base.movimientos(uid, 500)).reduce((t, m) => t + m.monto, 0);
  return [u.saldo === suma, u.saldo >= 0];
}
const persona = (n) => ({ uid: `control-${n}`, email: `control.${n}@explorarg.test`, nombre: null });
const T0 = new Date('2026-11-23T15:00:00Z');
const masMin = (m) => new Date(T0.getTime() + m * 60 * 1000);

{
  const base = baseEnMemoria();
  const s = persona(1);
  const r = await resumen(base, s, T0);
  control('al registrarse: 15.000 tokens de bienvenida, un solo movimiento y precio de primera consulta', [enTokens(r.saldo), (await base.movimientos(s.uid)).map((m) => [m.tipo, m.detalle, m.monto]), r.precios.poligrafo.tandaHasta], ['15.000 tokens', [['credito_inicial', 'Tokens de bienvenida', CREDITO_INICIAL]], null]);
  await resumen(base, s, T0);
  control('entrar de nuevo no regala el crédito otra vez', (await base.movimientos(s.uid)).length, 1);

  // la primera consulta del Polígrafo
  const reserva = await reservar(base, s, 'poligrafo', T0);
  control('antes de consultar se aparta el máximo de la primera consulta', [reserva.primera, reserva.apartado, reserva.saldo], [true, P1.maximo, CREDITO_INICIAL - P1.maximo]);
  const c = await confirmar(base, s, reserva, { pedido: 'una frase', respuestaJson: '{}' }, COBRO_1, masMin(0.5));
  const u = await asegurarCuenta(base, s, masMin(0.5));
  control('al terminar se cobra lo que consumió y vuelve la diferencia', [c.monto, c.saldo, u.consultas, u.gastado, (await base.consultas(s.uid)).map((q) => [q.herramienta, q.precio, q.primera, q.pedido])], [COBRO_1, CREDITO_INICIAL - COBRO_1, 1, COBRO_1, [['poligrafo', COBRO_1, true, 'una frase']]]);
  control('la tanda dura 5 minutos desde que se mandó la primera consulta', c.precios.poligrafo.tandaHasta, masMin(5).toISOString());
  control('confirmar dos veces no cobra dos veces', [(await confirmar(base, s, reserva, {}, COBRO_1, masMin(0.6))).saldo, (await asegurarCuenta(base, s, masMin(0.6))).consultas], [CREDITO_INICIAL - COBRO_1, 1]);

  // las siguientes
  const r2 = await reservar(base, s, 'poligrafo', masMin(2));
  control('una consulta a los 2 minutos es una "siguiente": se aparta mucho menos', [r2.primera, r2.estimado, r2.apartado], [false, P2.estimado, P2.maximo]);
  const c2 = await confirmar(base, s, r2, {}, COBRO_2, masMin(2.5));
  control('y se cobra su costo con el margen de las siguientes', [c2.monto, c2.saldo], [COBRO_2, CREDITO_INICIAL - COBRO_1 - COBRO_2]);
  control('la misma persona con la otra herramienta arranca de primera: la tanda es por herramienta', (await intento(base, s, 'analista', masMin(3))).primera, true);
  const r3 = await reservar(base, s, 'poligrafo', masMin(6));
  control('a los 6 minutos de la primera, la tanda terminó: vuelve a ser "primera"', [r3.primera, r3.estimado], [true, P1.estimado]);
  await devolver(base, s, r3, 'fallo', masMin(6));
  control('el saldo es la suma de los movimientos y no es negativo', await cuadra(base, s.uid), [true, true]);

  // otra persona, en el mismo momento
  const otra = await reservar(base, persona(11), 'poligrafo', masMin(2));
  control('otra persona, a los 2 minutos, paga precio de primera: el precio reducido es solo de quien hizo la primera', otra.primera, true);
}
{
  const base = baseEnMemoria();
  const s = persona(2);
  const r = await reservar(base, s, 'analista', T0);
  const c = await confirmar(base, s, r, {}, 999999, T0);
  control('nunca se cobra más que el máximo apartado', [c.monto, c.saldo], [A1.maximo, CREDITO_INICIAL - A1.maximo]);
  const r2 = await reservar(base, s, 'poligrafo', T0);
  const d = await devolver(base, s, r2, 'fallo', T0);
  const anulada = (await base.movimientos(s.uid)).find((m) => m.estado === 'anulada');
  control('una consulta que falla se devuelve entera y el movimiento queda anulado', [d.saldo, anulada.monto, anulada.motivo], [CREDITO_INICIAL - A1.maximo, 0, 'fallo']);
  control('devolver dos veces no devuelve dos veces', (await devolver(base, s, r2, 'fallo', T0)).saldo, CREDITO_INICIAL - A1.maximo);
  control('una primera consulta que falla no abre la tanda: la que sigue paga de primera', (await intento(base, s, 'poligrafo', masMin(1))).primera, true);
}
{
  // sin crédito
  const base = baseEnMemoria();
  const s = persona(3);
  const a = await reservar(base, s, 'poligrafo', T0);
  await confirmar(base, s, a, {}, P1.maximo, T0); // quedan 15000 - 7764 = 7236
  const b = await reservar(base, s, 'poligrafo', masMin(10)); // otra primera: el máximo no entra entero
  control('si queda menos que el máximo, se aparta lo que queda', [b.primera, b.apartado, b.saldo], [true, CREDITO_INICIAL - P1.maximo, 0]);
  await confirmar(base, s, b, {}, COBRO_1, masMin(10));
  const queda = CREDITO_INICIAL - P1.maximo - COBRO_1;
  control('con menos crédito que el costo estimado, la consulta se rechaza (402) y no descuenta nada', [await intento(base, s, 'poligrafo', masMin(20)), (await asegurarCuenta(base, s, masMin(20))).saldo, queda < P1.estimado], ['402 sin_saldo', queda, true]);
  control('pero una "siguiente", que es más barata, sí entra', typeof (await intento(base, s, 'poligrafo', masMin(12))), 'object');
}
{
  // diez consultas del Polígrafo al mismo tiempo, con crédito para dos
  const base = baseEnMemoria();
  const s = persona(4);
  const resultados = await Promise.all(Array.from({ length: 10 }, () => intento(base, s, 'poligrafo', T0)));
  control('muchas consultas a la vez: pasan solo las que el crédito alcanza y el saldo nunca queda negativo', [resultados.filter((x) => typeof x === 'object').length, resultados.filter((x) => x === '402 sin_saldo').length, ...(await cuadra(base, s.uid))], [2, 8, true, true]);
}
{
  // el tope diario de consultas que no se cobran
  const base = baseEnMemoria();
  const s = persona(5);
  for (let i = 0; i < TOPE_SIN_CARGO_POR_DIA; i += 1) await devolver(base, s, await reservar(base, s, 'analista', T0), 'no_se_puede', T0);
  control(`después de ${TOPE_SIN_CARGO_POR_DIA} consultas sin cargo en el día, la siguiente se rechaza (429)`, await intento(base, s, 'analista', T0), '429 muchas_sin_cargo');
  control('al día siguiente puede consultar de nuevo, con el crédito intacto', (await intento(base, s, 'analista', masMin(24 * 60))).saldo, CREDITO_INICIAL - A1.maximo);
}
{
  // el servidor se cae después de reservar: la plata vuelve sola pasados diez minutos
  const base = baseEnMemoria();
  const s = persona(6);
  await reservar(base, s, 'poligrafo', T0);
  const alRato = await asegurarCuenta(base, s, masMin(2));
  const despues = await asegurarCuenta(base, s, masMin(11));
  const m = (await base.movimientos(s.uid)).find((x) => x.tipo === 'consulta');
  control('una reserva colgada sigue apartada a los 2 minutos y se devuelve sola a los 11', [alRato.saldo, despues.saldo, m.estado, m.motivo, ...(await cuadra(base, s.uid))], [CREDITO_INICIAL - P1.maximo, CREDITO_INICIAL, 'anulada', 'sin_respuesta', true, true]);
}
{
  // conCobro, que es lo que usan las dos funciones del sitio (con el emulador: base en memoria)
  conEntorno({ FIREBASE_PROJECT_ID: PROYECTO_EMULADOR, FIREBASE_AUTH_EMULATOR_HOST: EMULADOR_AUTH });
  const s = persona(7);
  const respuesta = { cobrar: true, modelo: 'claude-opus-5-5', uso: USO, registro: { pedido: 'una frase' } };
  const primera = await conCobro(s, 'poligrafo', async () => respuesta);
  const siguiente = await conCobro(s, 'poligrafo', async () => respuesta);
  control('de punta a punta: la primera se cobra con el margen de primera y la siguiente, hecha enseguida, con el de las siguientes', [primera.cuenta.primera, enTokens(primera.cuenta.cobrado), siguiente.cuenta.primera, enTokens(siguiente.cuenta.cobrado), siguiente.cuenta.saldo], [true, enTokens(PRECIO_1), false, enTokens(PRECIO_2), CREDITO_INICIAL - PRECIO_1 - PRECIO_2]);
  const noSePuede = await conCobro(s, 'analista', async () => ({ cobrar: false, motivo: 'no_se_puede' }));
  const fallo = await conCobro(s, 'analista', async () => {
    throw new Error('se cayó la IA');
  }).then(() => 'no falló', () => 'falló');
  const alFinal = await conCobro(s, 'analista', async () => ({ cobrar: false }));
  control('una consulta que no se pudo responder no se cobra, y una que falla tampoco', [noSePuede.cuenta.cobrado, fallo, alFinal.cuenta.saldo], [0, 'falló', CREDITO_INICIAL - PRECIO_1 - PRECIO_2]);
  const sinPrecio = await conCobro(persona(8), 'analista', async () => ({ cobrar: true, modelo: 'otro-modelo', uso: USO }));
  control('si el modelo no tiene precio de lista, se cobra el estimado', sinPrecio.cuenta.cobrado, A1.estimado);
  const local = await conCobro({ uid: 'local', local: true }, 'poligrafo', async () => ({ cobrar: true }));
  control('con las cuentas apagadas (copia local) no se cobra nada', local.cuenta, null);
}

// ================================================================== Mi panel
console.log('\nMi panel');
{
  const base = baseEnMemoria();
  const s = persona(9);
  await resumen(base, s, T0);
  const a = await reservar(base, s, 'poligrafo', masMin(1));
  await confirmar(base, s, a, { pedido: 'una frase', contexto: 'quién la dijo', respuestaJson: '{"afirmaciones":[]}' }, COBRO_1, masMin(1));
  const b = await reservar(base, s, 'analista', masMin(2));
  await confirmar(base, s, b, { pedido: 'un ranking', respuestaJson: '{"consulta":{}}' }, 529, masMin(2));
  await devolver(base, s, await reservar(base, s, 'analista', masMin(3)), 'no_se_puede', masMin(3));
  const p = await panel(base, s, masMin(4));
  control('tokens que quedan, usados y recibidos, y consultas hechas', [p.saldo, p.gastado, p.bienvenida, p.comprado, p.consultasHechas], [CREDITO_INICIAL - COBRO_1 - 529, COBRO_1 + 529, CREDITO_INICIAL, 0, 2]);
  control('lo usado con cada herramienta', p.porHerramienta, { poligrafo: { consultas: 1, gastado: COBRO_1 }, analista: { consultas: 1, gastado: 529 } });
  control('las consultas guardadas, la más nueva primero y sin la respuesta entera', p.consultas.map((x) => [x.herramienta, x.pedido, x.precio, 'respuestaJson' in x]), [['analista', 'un ranking', 529, false], ['poligrafo', 'una frase', COBRO_1, false]]);
  control('los movimientos: no figura la consulta que no se cobró', p.movimientos.map((m) => [m.tipo, m.monto, m.saldo]), [['consulta', -529, CREDITO_INICIAL - COBRO_1 - 529], ['consulta', -COBRO_1, CREDITO_INICIAL - COBRO_1], ['credito_inicial', CREDITO_INICIAL, CREDITO_INICIAL]]);
  control('el panel trae lo que cuesta consultar ahora (sigue el precio reducido de las dos herramientas)', [Boolean(p.precios.poligrafo.tandaHasta), Boolean(p.precios.analista.tandaHasta)], [true, true]);
  const g = await consultaGuardada(base, s, p.consultas[1].id);
  control('una consulta guardada se vuelve a abrir entera', [g.herramienta, g.pedido, g.contexto, g.respuestaJson], ['poligrafo', 'una frase', 'quién la dijo', '{"afirmaciones":[]}']);
  control('nadie abre la consulta de otro, ni una que no existe', [await consultaGuardada(base, persona(10), p.consultas[1].id), await consultaGuardada(base, s, 'no-existe-123'), await consultaGuardada(base, s, '../otro')], [null, null, null]);
  // una cuenta de antes de que se llevara el total por herramienta: se arma con las consultas
  await base.transaccion(s.uid, async (t) => {
    const u = await t.usuario();
    delete u.porHerramienta;
    t.guardarUsuario(u);
  });
  control('una cuenta vieja, sin el total por herramienta, lo arma con sus consultas', (await panel(base, s, masMin(5))).porHerramienta, { poligrafo: { consultas: 1, gastado: COBRO_1 }, analista: { consultas: 1, gastado: 529 } });
}

// ================================================================== el panel de administrador
console.log('\nEl panel de administrador');
const { esAdmin, panelDeAdministrador } = await import('../server/cuentas/admin.js');
{
  conEntorno({ CUENTAS_ADMIN: 'jefe@explorarg.test; segundo@explorarg.test' });
  control(
    'es administrador solo quien figura en CUENTAS_ADMIN; la copia local sin cuentas no tiene administrador',
    [esAdmin({ uid: 'a', email: 'Jefe@Explorarg.test' }), esAdmin({ uid: 'b', email: 'segundo@explorarg.test' }), esAdmin({ uid: 'c', email: 'cualquiera@explorarg.test' }), esAdmin({ uid: 'local', email: null, local: true }), esAdmin(null)],
    [true, true, false, false, false]
  );
  conEntorno({});
  control('sin la variable CUENTAS_ADMIN nadie es administrador', esAdmin({ uid: 'a', email: 'jefe@explorarg.test' }), false);

  const base = baseEnMemoria();
  const [ana, beto] = [persona(20), persona(21)];
  await resumen(base, ana, T0);
  await resumen(base, beto, masMin(1));
  // Ana: una frase del Polígrafo con una afirmación que no se pudo comprobar
  const veredicto = { estado: 'INDETERMINADO', afirmaciones: [{ id: 'A1', cita: 'se vendió más', estado: 'VERDADERO' }, { id: 'A2', cita: 'el margen subió', estado: 'INDETERMINADO', motivo: 'El sitio no tiene ese dato.' }] };
  await confirmar(base, ana, await reservar(base, ana, 'poligrafo', masMin(2)), { pedido: 'una frase', modelo: 'claude-opus-5-5', motor: 'api', uso: USO, costoListaUsd: 0.352288, costoParaExploraUsd: 0.352288, veredicto }, COBRO_1, masMin(2));
  // un pedido del Analista, y otro que no se pudo responder (no se cobra, pero a Explora le costó)
  await confirmar(base, ana, await reservar(base, ana, 'analista', masMin(3)), { pedido: 'un ranking', respuestaJson: '{"consulta":{"tipo":"ranking","metrica":"ventas_cupo"}}', costoParaExploraUsd: 0.03 }, 529, masMin(3));
  await devolver(base, ana, await reservar(base, ana, 'analista', masMin(4)), 'no_se_puede', masMin(4), { pedido: 'el precio del trigo', costoParaExploraUsd: 0.02, vacio: undefined });
  // una consulta vieja del Polígrafo, guardada sin veredicto: se calcula al armar el panel
  await confirmar(base, ana, await reservar(base, ana, 'poligrafo', masMin(5)), { pedido: 'una frase vieja', respuestaJson: '{"afirmaciones":[{"id":"A1"}]}' }, COBRO_2, masMin(5));

  const a = await panelDeAdministrador(base, { veredictoDe: (c) => (c.pedido === 'una frase vieja' ? { estado: 'FALSO', afirmaciones: [{ id: 'A1', cita: 'vieja', estado: 'FALSO' }] } : null), ahora: masMin(9) });
  const usado = COBRO_1 + 529 + COBRO_2;
  control(
    'totales: cuentas, tokens regalados, usados y los que quedan sin usar',
    [a.totales.cuentas, a.totales.bienvenida, a.totales.comprado, a.totales.gastado, a.totales.saldo, a.totales.consultas, a.totales.sinCobrar],
    [2, 2 * CREDITO_INICIAL, 0, usado, 2 * CREDITO_INICIAL - usado, 3, 1]
  );
  control(
    'lo cobrado contra lo que costó: el costo incluye la consulta que no se cobró',
    [a.totales.cobradoUsd, a.totales.costoExploraUsd, a.totales.diferenciaUsd],
    [r6(usado / POR_DOLAR), r6(0.352288 + 0.03 + 0.02), r6(usado / POR_DOLAR - (0.352288 + 0.03 + 0.02))]
  );
  control(
    'una fila por cuenta, primero la que más usó',
    a.cuentas.map((c) => [c.email, c.consultas, c.gastado, c.saldo, c.sinCobrar, c.porHerramienta.poligrafo.consultas, c.porHerramienta.analista.gastado, c.ultimaConsulta]),
    [
      [ana.email, 3, usado, CREDITO_INICIAL - usado, 1, 2, 529, masMin(5).toISOString()],
      [beto.email, 0, 0, CREDITO_INICIAL, 0, 0, 0, ''],
    ]
  );
  control(
    'una fila por consulta, la más nueva primero, con su resultado y sin la respuesta entera',
    a.consultas.map((c) => [c.email === ana.email, c.herramienta, c.pedido, c.resultado, c.precio, c.calculadoHoy, 'respuestaJson' in c]),
    [
      [true, 'poligrafo', 'una frase vieja', 'FALSO', COBRO_2, true, false],
      [true, 'analista', 'un ranking', 'Ranking: Ventas al cupo', 529, false, false],
      [true, 'poligrafo', 'una frase', 'INDETERMINADO', COBRO_1, false, false],
    ]
  );
  control('de cada consulta: lo cobrado en dólares, lo que costó y la diferencia', [a.consultas[2].cobradoUsd, a.consultas[2].costoExploraUsd, a.consultas[2].diferenciaUsd], [r6(COBRO_1 / POR_DOLAR), 0.352288, r6(COBRO_1 / POR_DOLAR - 0.352288)]);
  control('las afirmaciones que el Polígrafo no pudo comprobar, con su motivo', a.indeterminadas.map((x) => [x.pedido, x.afirmacion, x.motivo, x.resultadoDeLaFrase]), [['una frase', 'el margen subió', 'El sitio no tiene ese dato.', 'INDETERMINADO']]);
  control('las consultas que no se cobraron, con lo que pidió la persona y lo que costaron', a.sinCobrar.map((x) => [x.email, x.herramienta, x.motivo, x.pedido, x.costoExploraUsd]), [[ana.email, 'analista', 'no_se_puede', 'el precio del trigo', 0.02]]);
  control('lo anotado en una consulta que no se cobró no cambia la cuenta de la persona', [...(await cuadra(base, ana.uid)), (await panel(base, ana, masMin(9))).movimientos.some((m) => 'pedido' in m)], [true, true, false]);
}

// ================================================================== la compra de tokens
console.log('\nLa compra de tokens');
const { createHmac } = await import('node:crypto');
const { PAQUETES, enPesos } = await import('../src/lib/cuenta/config.js');
const { URL_BCRA, dolarOficial, olvidarDolar } = await import('../server/pagos/dolar.js');
const { ErrorDeMercadoPago, clienteMercadoPago, firmaValida, mercadoPagoDelSitio } = await import('../server/pagos/mercadopago.js');
const { acreditarPago, direccionDelSitio, iniciarCompra, ofertas } = await import('../server/pagos/compra.js');
// el Banco Central de mentira: contesta la cotización que se le diga, o no contesta
const bcra = (valor, fecha = '2026-11-20') => async (url) => ({ ok: url === URL_BCRA, status: 200, json: async () => ({ status: 200, results: [{ idVariable: 4, detalle: [{ fecha, valor }] }] }) });
const bcraCaido = async () => {
  throw new Error('sin conexión');
};
const rechazo = (f) => f().then(() => 'pasó', (e) => (e instanceof ErrorDeCuenta ? `${e.estadoHttp} ${e.codigo}` : `otro error: ${e.message}`));
{
  conEntorno({});
  // ---- el precio en pesos
  const base = baseEnMemoria();
  olvidarDolar();
  const o = await ofertas(base, { ahora: T0, traer: bcra(1601.32) });
  control('decisión de HDO: tres paquetes, de 50.000, 100.000 y 250.000 tokens', PAQUETES.map((p) => p.tokens), [50000, 100000, 250000]);
  control('el precio en pesos sale del dólar oficial del día, sin recargo', [o.dolar.valor, o.dolar.fecha, o.paquetes.map((p) => enPesos(p.pesos))], [1601.32, '2026-11-20', ['$ 8.007', '$ 16.013', '$ 40.033']]);
  control('la cotización leída sirve tres horas sin volver a preguntar', (await dolarOficial(base, { ahora: masMin(120), traer: bcraCaido })).valor, 1601.32);
  control('si el Banco Central no contesta, vale la última cotización leída', (await dolarOficial(base, { ahora: masMin(200), traer: bcraCaido })).valor, 1601.32);
  olvidarDolar();
  control('también después de reiniciar el servidor: la cotización queda guardada en la base', [(await base.ajuste('dolar')).valor, (await dolarOficial(base, { ahora: masMin(200), traer: bcraCaido })).valor], [1601.32, 1601.32]);
  olvidarDolar();
  control('con una cotización de más de siete días no se vende', await rechazo(() => dolarOficial(base, { ahora: masMin(9 * 24 * 60), traer: bcraCaido })), '503 sin_cotizacion');
  control('y sin ninguna cotización, tampoco', await rechazo(() => dolarOficial(baseEnMemoria(), { ahora: T0, traer: bcraCaido })), '503 sin_cotizacion');
  process.env.DOLAR_FIJO = '1500';
  control('de emergencia, la variable DOLAR_FIJO manda sobre todo', (await ofertas(base, { ahora: T0, traer: bcraCaido })).paquetes[0].pesos, 7500);
  delete process.env.DOLAR_FIJO;

  // ---- la firma de los avisos de Mercado Pago
  const secreto = 'clave-de-prueba';
  const ts = String(Math.floor(T0.getTime() / 1000));
  const v1 = createHmac('sha256', secreto).update(`id:123456;request-id:pedido-1;ts:${ts};`).digest('hex');
  const aviso = (cambios = {}) => firmaValida({ firma: `ts=${ts},v1=${v1}`, pedidoId: 'pedido-1', dataId: '123456', secreto, ahora: T0.getTime(), ...cambios });
  control(
    'aviso de pago: vale con la firma de Mercado Pago; no vale si cambia el pago, la clave o la firma, ni sin firma',
    [aviso(), aviso({ dataId: '123457' }), aviso({ secreto: 'otra' }), aviso({ firma: `ts=${ts},v1=${'0'.repeat(64)}` }), aviso({ firma: '' }), aviso({ firma: 'cualquier cosa' })],
    [true, false, false, false, false, false]
  );
  control('un aviso viejo que alguien reenvía no vale', aviso({ ahora: masMin(30).getTime() }), false);

  // ---- cómo se le habla a Mercado Pago
  const llamadas = [];
  const real = clienteMercadoPago({
    token: 'TEST-123',
    traer: async (url, op) => {
      llamadas.push([url, op.method ?? 'GET', op.headers.Authorization, op.headers['X-Idempotency-Key'] ?? null]);
      return { ok: true, status: 200, json: async () => ({ id: 'x', init_point: 'https://mp' }) };
    },
  });
  await real.crearPreferencia({ items: [] }, 'orden-1');
  await real.pago('1001');
  control('a Mercado Pago se le habla por dos direcciones, con la llave en la cabecera', llamadas, [
    ['https://api.mercadopago.com/checkout/preferences/', 'POST', 'Bearer TEST-123', 'orden-1'],
    ['https://api.mercadopago.com/v1/payments/1001', 'GET', 'Bearer TEST-123', null],
  ]);

  // ---- la compra, con un Mercado Pago de mentira
  olvidarDolar();
  const pedidos = [];
  const pagos = new Map();
  const mp = {
    crearPreferencia: async (cuerpo, idempotencia) => {
      pedidos.push({ cuerpo, idempotencia });
      return { id: 'pref-1', init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1' };
    },
    pago: async (id) => {
      if (!pagos.has(String(id))) throw new ErrorDeMercadoPago(404, 'no existe');
      return pagos.get(String(id));
    },
  };
  const s = persona(30);
  const opciones = { origen: 'https://www.explorarg.com', ahora: T0, traer: bcra(1601.32) };
  control('sin la llave de Mercado Pago la venta está apagada', await rechazo(() => iniciarCompra(base, null, s, 't50', opciones)), '503 venta_apagada');
  control('un paquete que no existe no se vende', await rechazo(() => iniciarCompra(base, mp, s, 't999', opciones)), '400 paquete_desconocido');
  const c = await iniciarCompra(base, mp, s, 't50', opciones);
  const pedido = pedidos[0].cuerpo;
  control(
    'al iniciar la compra, Mercado Pago recibe el cobro en pesos con la referencia de la orden',
    [c.tokens, c.pesos, c.url.startsWith('https://www.mercadopago.com.ar/'), pedido.items.map((i) => [i.title, i.quantity, i.currency_id, i.unit_price]), pedido.external_reference === `${s.uid}:${c.ordenId}`, pedidos[0].idempotencia === c.ordenId],
    [50000, 8007, true, [['50.000 tokens de explorarg', 1, 'ARS', 8007]], true, true]
  );
  control('con el sitio publicado, Mercado Pago vuelve al panel y le avisa al servidor', [pedido.back_urls.success, pedido.auto_return, pedido.notification_url], ['https://www.explorarg.com/agente/panel', 'approved', 'https://www.explorarg.com/api/pago-mp']);
  await iniciarCompra(base, mp, s, 't50', { ...opciones, origen: 'http://localhost:5273' });
  control('en la copia local no se pide el aviso (a esta Mac no llega)', [pedidos[1].cuerpo.back_urls.success, 'notification_url' in pedidos[1].cuerpo, 'auto_return' in pedidos[1].cuerpo], ['http://localhost:5273/agente/panel', false, false]);
  control('iniciar una compra no suma nada', (await asegurarCuenta(base, s, T0)).saldo, CREDITO_INICIAL);

  const referencia = `${s.uid}:${c.ordenId}`;
  const pago = (cambios = {}) => ({ id: 1001, status: 'approved', currency_id: 'ARS', transaction_amount: 8007, external_reference: referencia, live_mode: true, ...cambios });
  pagos.set('1001', pago({ status: 'in_process' }));
  control('un pago que Mercado Pago todavía no aprobó no suma nada', [(await acreditarPago(base, mp, '1001', { ahora: masMin(1) })).estado, (await asegurarCuenta(base, s, masMin(1))).saldo], ['pendiente', CREDITO_INICIAL]);
  pagos.set('1001', pago({ status: 'rejected' }));
  control('un pago rechazado, tampoco', (await acreditarPago(base, mp, '1001', { ahora: masMin(1) })).estado, 'rechazado');
  pagos.set('1001', pago());
  const a1 = await acreditarPago(base, mp, '1001', { ahora: masMin(2) });
  control('pago aprobado: se suman los tokens del paquete', [a1.estado, a1.tokens, a1.saldo, a1.uid === s.uid], ['acreditado', 50000, CREDITO_INICIAL + 50000, true]);
  const a2 = await acreditarPago(base, mp, '1001', { ahora: masMin(3) });
  control('el mismo pago no se acredita dos veces (el aviso y la vuelta al sitio llegan los dos)', [a2.estado, a2.saldo], ['ya_acreditado', CREDITO_INICIAL + 50000]);
  const seis = await Promise.all(Array.from({ length: 6 }, () => acreditarPago(base, mp, '1001', { ahora: masMin(3) })));
  control('ni aunque lleguen seis avisos a la vez', [seis.filter((x) => x.estado === 'acreditado').length, (await asegurarCuenta(base, s, masMin(3))).saldo, ...(await cuadra(base, s.uid))], [0, CREDITO_INICIAL + 50000, true, true]);
  const p = await panel(base, s, masMin(4));
  control('en Mi panel: los tokens comprados y el movimiento de la compra', [p.comprado, p.saldo, p.movimientos.map((m) => [m.tipo, m.detalle, m.monto])[0]], [50000, CREDITO_INICIAL + 50000, ['compra', 'Compra de 50.000 tokens', 50000]]);

  // ---- lo que no se acredita
  pagos.set('1002', pago({ id: 1002, transaction_amount: 100 }));
  pagos.set('1003', pago({ id: 1003, currency_id: 'USD' }));
  pagos.set('1004', pago({ id: 1004, external_reference: `${s.uid}:orden-inventada` }));
  pagos.set('1005', pago({ id: 1005, external_reference: 'otra-cosa' }));
  pagos.set('1006', pago({ id: 1006, live_mode: false }));
  const estados = [];
  for (const id of ['1002', '1003', '1004', '1005', '9999', 'no-es-un-numero']) estados.push((await acreditarPago(base, mp, id, { ahora: masMin(5) })).estado);
  control('no se acredita un pago por menos plata, en otra moneda, de una orden que no existe, de otra cosa, uno que no existe ni un número inventado', [estados.length, ...new Set(estados), (await asegurarCuenta(base, s, masMin(5))).saldo], [6, 'no_corresponde', CREDITO_INICIAL + 50000]);
  control(
    'en el sitio publicado un pago de prueba no acredita; en esta Mac, sí',
    [(await acreditarPago(base, mp, '1006', { ahora: masMin(5), soloEnVivo: true })).estado, (await acreditarPago(base, mp, '1006', { ahora: masMin(5), soloEnVivo: false })).estado],
    ['no_corresponde', 'acreditado']
  );
  const mpCaido = {
    pago: async () => {
      throw new ErrorDeMercadoPago(500, 'caído');
    },
  };
  control('si Mercado Pago no contesta, el aviso falla (así lo manda de nuevo más tarde)', await acreditarPago(base, mpCaido, '1001').then(() => 'pasó', (e) => e.constructor.name), 'ErrorDeMercadoPago');

  // ---- devoluciones
  pagos.set('1001', pago({ status: 'refunded' }));
  const d1 = await acreditarPago(base, mp, '1001', { ahora: masMin(6) });
  const d2 = await acreditarPago(base, mp, '1001', { ahora: masMin(7) });
  control('si el pago se devuelve, se sacan los tokens de esa compra, una sola vez', [d1.estado, d1.saldo, d2.saldo, ...(await cuadra(base, s.uid))], ['devuelto', CREDITO_INICIAL + 50000, CREDITO_INICIAL + 50000, true, true]);

  const s2 = persona(31);
  const c2 = await iniciarCompra(base, mp, s2, 't50', opciones);
  const pago2 = (cambios = {}) => pago({ id: 2001, external_reference: `${s2.uid}:${c2.ordenId}`, ...cambios });
  pagos.set('2001', pago2());
  await acreditarPago(base, mp, '2001', { ahora: masMin(1) });
  // gasta 45.000 de los 65.000 que tiene
  await base.transaccion(s2.uid, async (t) => {
    const u = await t.usuario();
    u.saldo -= 45000;
    u.gastado += 45000;
    t.agregarMovimiento({ tipo: 'consulta', monto: -45000, saldo: u.saldo, fecha: masMin(2).toISOString(), estado: 'hecha' });
    t.guardarUsuario(u);
  });
  pagos.set('2001', pago2({ status: 'charged_back' }));
  const cb = await acreditarPago(base, mp, '2001', { ahora: masMin(3) });
  const anulada = (await base.movimientos(s2.uid)).find((m) => m.tipo === 'devolucion_compra');
  control('si el comprador desconoce el pago y ya gastó una parte, se saca lo que queda: el saldo no queda negativo', [cb.estado, cb.saldo, anulada.monto, anulada.faltaron, ...(await cuadra(base, s2.uid))], ['devuelto', 0, -20000, 30000, true, true]);

  // ---- las compras en el panel de administrador
  const adm = await panelDeAdministrador(base, { ahora: masMin(9) });
  control(
    'panel de administrador: las compras de tokens, con lo que entró en pesos (sin las anuladas)',
    [adm.totales.compras, adm.totales.comprasAnuladas, adm.totales.vendidoPesos, adm.totales.comprado, adm.compras.map((x) => [x.email, x.tokens, x.pesos, x.dolar, x.medio, x.anulada]).sort((x, y) => (x[0] + x[5] < y[0] + y[5] ? -1 : 1))],
    [1, 2, 8007, 50000, [[s.email, 50000, 8007, 1601.32, 'mp', false], [s.email, 50000, 8007, 1601.32, 'mp', true], [s2.email, 50000, 8007, 1601.32, 'mp', true]]]
  );

  // ---- adónde vuelve y qué Mercado Pago se usa
  conEntorno({ VERCEL: '1' });
  control('publicado, Mercado Pago vuelve siempre a explorarg.com (no a lo que diga el navegador)', direccionDelSitio({ headers: { origin: 'https://otro-sitio.test', host: 'otro-sitio.test' } }), 'https://www.explorarg.com');
  conEntorno({});
  control('en esta Mac, vuelve a la copia local', direccionDelSitio({ headers: { origin: 'http://localhost:5273' } }), 'http://localhost:5273');
  control('sin la llave no hay Mercado Pago: la venta queda apagada', [mercadoPagoDelSitio(), clienteMercadoPago({ token: '' })], [null, null]);
  conEntorno({ VERCEL: '1', FIREBASE_PROJECT_ID: 'x', FIREBASE_AUTH_EMULATOR_HOST: EMULADOR_AUTH });
  control('publicado nunca hay un Mercado Pago de mentira', mercadoPagoDelSitio(), null);

  // ---- el aviso de Mercado Pago de punta a punta (api/pago-mp.js), con el emulador y el Mercado Pago de mentira
  const { default: avisoMp } = await import('../api/pago-mp.js');
  const { abrirBase } = await import('../server/cuentas/base.js');
  const mandarAviso = async ({ id, tipo = 'payment', cabeceras = {} }) => {
    let estado = 200;
    const res = { status: (cod) => ((estado = cod), res), json: () => {}, setHeader: () => {} };
    await avisoMp({ method: 'POST', url: `/?data.id=${id}&type=${tipo}`, headers: cabeceras, body: {} }, res);
    return estado;
  };
  conEntorno({});
  control('llega un aviso y la venta no está configurada: 500, para que Mercado Pago lo mande de nuevo', await mandarAviso({ id: '1' }), 500);
  conEntorno({ FIREBASE_PROJECT_ID: PROYECTO_EMULADOR, FIREBASE_AUTH_EMULATOR_HOST: EMULADOR_AUTH });
  const delSitio = abrirBase();
  const s3 = persona(32);
  olvidarDolar();
  const c3 = await iniciarCompra(delSitio, mercadoPagoDelSitio(), s3, 't100', { origen: 'http://localhost:5274', traer: bcra(1601.32, new Date().toISOString().slice(0, 10)) });
  const numero = new URL(c3.url).searchParams.get('payment_id');
  control('el Mercado Pago de mentira del emulador devuelve la vuelta al panel con un pago', [mercadoPagoDelSitio().simulado, c3.url.startsWith('http://localhost:5274/agente/panel?payment_id='), /^\d+$/.test(numero)], [true, true, true]);
  control('un aviso que no es de un pago: 200 y no hace nada', [await mandarAviso({ id: numero, tipo: 'merchant_order' }), (await asegurarCuenta(delSitio, s3)).saldo], [200, CREDITO_INICIAL]);
  control('el aviso de un pago aprobado: 200 y se suman los tokens', [await mandarAviso({ id: numero }), (await asegurarCuenta(delSitio, s3)).saldo], [200, CREDITO_INICIAL + 100000]);
  process.env.MP_WEBHOOK_SECRET = 'clave-de-los-avisos';
  control('con la clave secreta cargada, un aviso sin firma se rechaza (401)', await mandarAviso({ id: numero }), 401);
  const ts2 = String(Math.floor(Date.now() / 1000));
  const firma2 = createHmac('sha256', 'clave-de-los-avisos').update(`id:${numero};request-id:r-1;ts:${ts2};`).digest('hex');
  control('y uno firmado pasa (sin acreditar de nuevo)', [await mandarAviso({ id: numero, cabeceras: { 'x-signature': `ts=${ts2},v1=${firma2}`, 'x-request-id': 'r-1' } }), (await asegurarCuenta(delSitio, s3)).saldo], [200, CREDITO_INICIAL + 100000]);
  delete process.env.MP_WEBHOOK_SECRET;
  olvidarDolar();
}

// ================================================================== contra la base de verdad
conEntorno({});
const { existsSync, readFileSync } = await import('node:fs');
const os = await import('node:os');
const pathMod = await import('node:path');
const archivoLlave = pathMod.join(os.homedir(), '.cache', 'explorarg', 'firebase-servicio.json');
if (!existsSync(archivoLlave)) {
  console.log('\n  --   La llave del servidor no está en ~/.cache/explorarg/firebase-servicio.json: se saltean los controles contra Firestore.');
} else {
  console.log('\nLa cuenta corriente, contra Firestore (colección de prueba)');
  // el id del proyecto sale de la llave; no se muestra nada más de ese archivo
  conEntorno({ FIREBASE_PROJECT_ID: JSON.parse(readFileSync(archivoLlave, 'utf8')).project_id });
  const base = baseFirestore('pruebas_usuarios');
  const s = { uid: `control-${Date.now()}`, email: 'control@explorarg.test', nombre: null };
  try {
    const r = await resumen(base, s, T0);
    control('Firestore: al registrarse, 15.000 tokens de bienvenida', r.saldo, CREDITO_INICIAL);
    const reserva = await reservar(base, s, 'analista', T0);
    const c = await confirmar(base, s, reserva, { pedido: 'control', respuestaJson: '{"a":[1,[2,3]]}', uso: { entrada: 10, salida: 2 }, sinDefinir: undefined }, A1.estimado, T0);
    control('Firestore: la primera consulta se cobra y queda guardada', [reserva.primera, c.saldo, (await base.consultas(s.uid)).map((q) => [q.herramienta, q.precio, q.pedido])], [true, CREDITO_INICIAL - A1.estimado, [['analista', A1.estimado, 'control']]]);
    const r2 = await reservar(base, s, 'analista', masMin(2));
    const c2 = await confirmar(base, s, r2, {}, A2.estimado, masMin(2));
    control('Firestore: la siguiente, a los 2 minutos, paga el precio reducido', [r2.primera, c2.saldo], [false, CREDITO_INICIAL - A1.estimado - A2.estimado]);
    const r3 = await reservar(base, s, 'poligrafo', T0);
    control('Firestore: una consulta que falla se devuelve', (await devolver(base, s, r3, 'fallo', T0)).saldo, CREDITO_INICIAL - A1.estimado - A2.estimado);
    const resultados = await Promise.all(Array.from({ length: 6 }, () => intento(base, s, 'poligrafo', T0)));
    const p = await panel(base, s, masMin(3));
    const g = await consultaGuardada(base, s, p.consultas[p.consultas.length - 1].id);
    control('Firestore: el panel lista las consultas y una guardada se vuelve a abrir', [p.consultas.map((x) => x.herramienta), p.consultasHechas, g.pedido, g.respuestaJson, await consultaGuardada(base, s, 'no-existe-123')], [['analista', 'analista'], 2, 'control', '{"a":[1,[2,3]]}', null]);
    control('Firestore: consultas a la vez, pasan solo las que el crédito alcanza y el saldo cuadra', [resultados.filter((x) => typeof x === 'object').length, resultados.filter((x) => x === '402 sin_saldo').length, ...(await cuadra(base, s.uid))], [2, 4, true, true]);
    // el panel de administrador lee todas las cuentas de la colección (acá, la de prueba: solo esta persona)
    const a = await panelDeAdministrador(base);
    const mia = a.cuentas.filter((c) => c.uid === s.uid);
    control(
      'Firestore: el panel de administrador trae la cuenta, sus consultas y la que no se cobró, sin mezclar otras colecciones',
      [mia.map((c) => [c.email, c.consultas, c.gastado]), a.consultas.filter((c) => c.uid === s.uid).length, a.sinCobrar.filter((m) => m.uid === s.uid).map((m) => m.motivo), a.consultas.every((c) => c.uid === s.uid), a.cuentas.length],
      [[['control@explorarg.test', 2, A1.estimado + A2.estimado]], 2, ['fallo'], true, 1]
    );
    // la compra de tokens: el pago se acredita una sola vez aunque lleguen varios avisos juntos
    const antes = (await base.transaccion(s.uid, (t) => t.usuario())).saldo;
    olvidarDolar();
    const pagosF = new Map();
    const mpF = { crearPreferencia: async () => ({ id: 'pref', init_point: 'https://www.mercadopago.com.ar/' }), pago: async (id) => pagosF.get(String(id)) };
    const cF = await iniciarCompra(base, mpF, s, 't50', { origen: 'https://www.explorarg.com', ahora: masMin(4), traer: bcra(1601.32) });
    pagosF.set('3001', { id: 3001, status: 'approved', currency_id: 'ARS', transaction_amount: cF.pesos, external_reference: `${s.uid}:${cF.ordenId}`, live_mode: true });
    const tres = await Promise.all([1, 2, 3].map(() => acreditarPago(base, mpF, '3001', { ahora: masMin(5) })));
    const ordenF = await base.compra(s.uid, cF.ordenId);
    control(
      'Firestore: una compra se acredita una sola vez aunque el aviso llegue tres veces a la vez; quedan guardadas la orden y la cotización',
      [tres.filter((x) => x.estado === 'acreditado').length, (await base.transaccion(s.uid, (t) => t.usuario())).saldo - antes, ordenF.estado, ordenF.pesos, (await base.ajuste('dolar')).valor, ...(await cuadra(base, s.uid))],
      [1, 50000, 'acreditada', 8007, 1601.32, true, true]
    );
  } finally {
    await base.borrarUsuario(s.uid);
    await base.borrarAjuste('dolar');
    olvidarDolar();
  }
  control('Firestore: la colección de prueba queda vacía al terminar', await base.transaccion(s.uid, (t) => t.usuario()), null);
}

console.log(fallas ? `\n${fallas} control(es) fallaron` : '\nTodos los controles pasaron');
process.exit(fallas ? 1 : 0);
