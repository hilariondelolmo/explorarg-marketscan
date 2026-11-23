// Prueba del motor de producción del Agente: la API de Anthropic, con consultas de verdad.
//
//   node scripts/motor_api_prueba.mjs            simulacro: revisa que esté todo y no consulta
//   node scripts/motor_api_prueba.mjs --correr   hace las cuatro consultas. CUESTA cerca de medio dólar.
//
// Llama a las mismas funciones que van a Vercel (api/analista.js y api/poligrafo.js), con el
// motor "api" forzado y las cuentas apagadas: no toca la cuenta de nadie ni la base de datos.
// Cada herramienta se consulta dos veces seguidas: la primera escribe la consigna en la caché
// del modelo y la segunda tiene que leerla de ahí (de eso depende el precio de "las siguientes").
//
// La clave sale de ANTHROPIC_API_KEY en .env.local y no se muestra nunca. De ahí salen también
// la configuración de precios (CUENTAS_PRECIOS), para decir cuánto se le cobraría a un usuario.
// Conviene correrla antes de publicar y cada vez que cambie la consigna, el modelo o el SDK.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(raiz); // las funciones leen src/data desde la carpeta del sitio

const correr = process.argv.includes('--correr');
const otros = process.argv.slice(2).filter((a) => a !== '--correr');
if (otros.length) {
  console.log(`No entiendo "${otros[0]}". Sin nada es simulacro; con --correr, consulta de verdad.`);
  process.exit(2);
}

// ------------------------------------------------------------------ la clave y el entorno
const deEnvLocal = (nombre) => {
  try {
    const renglon = readFileSync('.env.local', 'utf8').split('\n').find((l) => l.startsWith(`${nombre}=`));
    return (renglon ?? '').slice(nombre.length + 1).trim();
  } catch {
    return ''; // sin .env.local no hay nada
  }
};
const clave = deEnvLocal('ANTHROPIC_API_KEY');
const precios = deEnvLocal('CUENTAS_PRECIOS');
if (!clave) {
  console.log('Falta ANTHROPIC_API_KEY en .env.local: sin la clave no se puede probar el motor de producción.');
  process.exit(1);
}
// Entorno limpio: si esto corre desde una sesión de Claude, hereda variables que mandarían
// la consulta a otro lado o con otra credencial. Y las cuentas, apagadas (sesión local).
for (const k of Object.keys(process.env)) {
  if (/^(ANTHROPIC|CLAUDE|POLIGRAFO|ANALISTA)/.test(k) || ['VERCEL', 'FIREBASE_PROJECT_ID', 'VITE_FIREBASE_PROJECT_ID', 'FIREBASE_AUTH_EMULATOR_HOST'].includes(k)) delete process.env[k];
}
process.env.POLIGRAFO_MOTOR = 'api';
process.env.ANTHROPIC_API_KEY = clave;
process.env.CUENTAS_PRECIOS = precios;

const { costoDeLista, costoParaExplora, estimadoDe, hayPrecios, margenDe, precioAlUsuario } = await import('../server/cuentas/precios.js');
if (!hayPrecios()) {
  console.log('Falta CUENTAS_PRECIOS en .env.local, o está mal escrita: sin los precios no se puede calcular lo que se cobra.');
  process.exit(1);
}
const { POR_DOLAR } = await import('../src/lib/cuenta/config.js');
const { estadoCuentas } = await import('../server/cuentas/firebase.js');
const { motorElegido } = await import('../server/poligrafo/modelo.js');

// el tiempo máximo de cada función en Vercel (vercel.json)
const MAXIMOS = Object.fromEntries(Object.entries(JSON.parse(readFileSync('vercel.json', 'utf8')).functions).map(([k, v]) => [k, v.maxDuration]));

const PRUEBAS = [
  { herramienta: 'analista', nombre: 'Analista', archivo: 'api/analista.js', primera: true, cuerpo: { pedido: 'Ranking de ventas al cupo por empresa en 2024' } },
  { herramienta: 'analista', nombre: 'Analista', archivo: 'api/analista.js', primera: false, cuerpo: { pedido: 'Evolución mensual del precio del biodiésel durante 2025' } },
  { herramienta: 'poligrafo', nombre: 'Polígrafo', archivo: 'api/poligrafo.js', primera: true, cuerpo: { enunciado: 'En 2025 las integradas vendieron menos del 10% del cupo.' } },
  { herramienta: 'poligrafo', nombre: 'Polígrafo', archivo: 'api/poligrafo.js', primera: false, cuerpo: { enunciado: 'En 2024 el precio del biodiésel fue siempre más alto que el del gas oil.' } },
];

const num = (n) => Math.round(n).toLocaleString('es-AR');
const usd = (n) => `US$ ${n.toFixed(3).replace('.', ',')}`;
const estimadoUsd = PRUEBAS.reduce((s, p) => s + estimadoDe(p.herramienta, p.primera).estimado / margenDe(p.primera) / POR_DOLAR, 0);

console.log(correr ? '\nPRUEBA del motor de producción (consultas de verdad, se pagan)\n' : '\nSIMULACRO: se revisa que esté todo y no se consulta nada\n');
console.log(`Clave de Anthropic: está en .env.local · motor: ${motorElegido()} · cuentas: ${estadoCuentas()}`);
console.log(`Costo estimado de las ${PRUEBAS.length} consultas: cerca de ${usd(estimadoUsd)}\n`);
if (motorElegido() !== 'api' || estadoCuentas() !== 'apagadas') {
  console.log('El entorno no quedó como hace falta (motor "api" y cuentas apagadas): no se sigue.');
  process.exit(1);
}

if (!correr) {
  for (const p of PRUEBAS) console.log(`  ${p.nombre}, ${p.primera ? 'primera consulta' : 'consulta siguiente'}: «${p.cuerpo.pedido ?? p.cuerpo.enunciado}»`);
  console.log('\nSimulacro sin problemas. Para consultar de verdad: node scripts/motor_api_prueba.mjs --correr');
  process.exit(0);
}

// ------------------------------------------------------------------ las consultas
let fallas = 0;
const control = (texto, bien) => {
  console.log(`  ${bien ? 'ok      ' : 'REVISAR '} ${texto}`);
  if (!bien) fallas += 1;
};

async function llamar(archivo, cuerpo) {
  const { default: funcion } = await import(path.join(raiz, archivo));
  const salida = { estado: 200, cuerpo: null };
  const res = {
    status(c) {
      salida.estado = c;
      return res;
    },
    json(o) {
      salida.cuerpo = o;
    },
    setHeader() {},
  };
  const desde = Date.now();
  await funcion({ method: 'POST', headers: {}, body: cuerpo }, res);
  return { ...salida, segundos: (Date.now() - desde) / 1000 };
}

let total = 0;
for (const p of PRUEBAS) {
  console.log(`${p.nombre}, ${p.primera ? 'primera consulta' : 'consulta siguiente'}: «${p.cuerpo.pedido ?? p.cuerpo.enunciado}»`);
  let r;
  try {
    r = await llamar(p.archivo, p.cuerpo);
  } catch (e) {
    control(`la función no terminó: ${e?.message ?? e}`, false);
    continue;
  }
  const c = r.cuerpo ?? {};
  control(`respondió (${r.estado}${c.error ? `: ${c.error}` : ''})`, r.estado === 200);
  if (r.estado !== 200) {
    console.log();
    continue;
  }
  const uso = c.uso ?? {};
  const lista = costoDeLista(c.modelo, uso, p.primera);
  control(`motor ${c.motor}, modelo ${c.modelo}`, c.motor === 'api');
  control('el modelo está en la lista de precios (si no, no se puede cobrar lo consumido)', lista !== null);
  if (p.primera) control(`la consigna pasó por la caché del modelo (escribió ${num(uso.entradaACache ?? 0)} tokens, leyó ${num(uso.entradaDeCache ?? 0)})`, (uso.entradaACache ?? 0) + (uso.entradaDeCache ?? 0) > 0);
  else control(`leyó la consigna de la caché (${num(uso.entradaDeCache ?? 0)} tokens): las siguientes salen más baratas`, (uso.entradaDeCache ?? 0) > 0);
  const maximo = MAXIMOS[p.archivo];
  control(`tardó ${r.segundos.toFixed(0)} segundos (el máximo en Vercel es ${maximo})`, r.segundos < maximo * 0.8);
  if (p.herramienta === 'analista') {
    control(`armó la consulta: ${c.ok ? `${c.consulta?.tipo} de ${c.consulta?.metrica}` : `no se puede responder (${c.aclaracion ?? 's/d'})`}`, c.ok === true);
  } else {
    const n = c.analisis?.afirmaciones?.length ?? 0;
    control(`encontró ${n} ${n === 1 ? 'afirmación' : 'afirmaciones'}${c.vueltas > 1 ? ' (dio dos vueltas para sumar un texto)' : ''}${c.textos?.length ? ` · textos a pedido: ${c.textos.join(', ')}` : ''}`, n > 0);
    for (const a of c.analisis?.afirmaciones ?? []) console.log(`             ${a.id}: ${String(a.cita ?? '').slice(0, 100)}`);
  }
  const costo = costoParaExplora(c.modelo, uso);
  if (costo !== null) total += costo;
  console.log(`           entrada ${num(uso.entrada ?? 0)} tokens, salida ${num(uso.salida ?? 0)}`);
  console.log(`           costó ${costo === null ? 's/d' : usd(costo)}${lista === null ? '' : ` · a un usuario se le cobrarían ${num(precioAlUsuario(lista, p.primera))} tokens (el estimado es ${num(estimadoDe(p.herramienta, p.primera).estimado)})`}`);
  console.log();
}

console.log(`Costo total de la prueba: ${usd(total)}`);
console.log(fallas ? `\nHay ${fallas} ${fallas === 1 ? 'punto' : 'puntos'} para revisar.` : '\nTodos los controles pasaron: el motor de producción anda.');
process.exit(fallas ? 1 : 0);
