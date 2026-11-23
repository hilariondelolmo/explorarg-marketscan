// Cuentas de explorarg.com - cuánto cuesta una consulta.
//
// Regla de HDO (22/11/2026): se cobra lo que la consulta consume de verdad, medido en
// tokens y a precio de lista del modelo, más un margen. Hay dos márgenes:
//   - uno para la primera consulta de una tanda;
//   - otro para las siguientes de esa persona con esa herramienta dentro de los 5
//     minutos de la primera.
// Lo que se cobra va en tokens de explorarg: 1 token = un diezmilésimo de dólar (config.js).
//
// Por qué hay dos costos. Casi todo lo que se le manda al modelo es la consigna,
// que es fija. La primera vez el modelo la lee entera y la deja guardada unos
// minutos (se paga más cara: "escribir en caché"). Mientras siga guardada, las
// consultas siguientes la leen de ahí a una fracción del precio ("leer de caché").
//
// El costo se calcula con los tokens de la consulta y con la situación DE LA
// PERSONA (si es su primera o una siguiente), no con lo que pasó de verdad en la
// caché: así la misma consulta le cuesta lo mismo a todos, y que otro usuario
// haya consultado recién no cambia el precio de nadie.

import { POR_DOLAR } from '../../src/lib/cuenta/config.js';
import { ErrorDeCuenta } from './errores.js';

// LOS MÁRGENES Y EL CONSUMO TÍPICO NO ESTÁN EN EL REPOSITORIO, que es público (decisión de
// HDO, 23/11/2026). Con el consumo típico y el costo estimado que muestra la página, el
// margen se deduce con una división: por eso van juntos. Salen de una variable del
// servidor, CUENTAS_PRECIOS, que es un JSON en un solo renglón:
//
//   { "margen":  { "primera": <% sobre el costo>, "siguientes": <% sobre el costo> },
//     "consumo": { "poligrafo": { "fijo": <tokens>, "variable": <tokens>, "salida": <tokens> },
//                  "analista":  { "fijo": <tokens>, "variable": <tokens>, "salida": <tokens> } } }
//
//   margen.primera      la primera consulta de una tanda
//   margen.siguientes   las siguientes de esa persona dentro de la tanda
//   consumo             lo que consume una consulta típica de cada herramienta: tokens de la
//                       parte fija (la consigna), de la parte que cambia (la frase o el
//                       pedido) y de la respuesta. Con eso se arma el costo estimado que se
//                       muestra antes de consultar. Si la consigna crece (más textos legales,
//                       más datos en la ficha) hay que actualizarlo:
//                       `node scripts/motor_api_prueba.mjs --correr` dice cuánto mide.
//
// Va en .env.local de esta Mac y en las variables de Vercel. No escribir sus valores en
// ningún archivo del repositorio: ni acá, ni en los controles, ni en la documentación.
// Sin la variable no se puede cobrar, así que tampoco se puede consultar.

// Con qué modelo va cada herramienta (para el costo estimado; los modelos de verdad se
// eligen en server/poligrafo/modelo.js y api/analista.js).
const MODELO_DE = { poligrafo: 'claude-opus-5-5', analista: 'claude-sonnet-5-5' };

const sinPrecios = () => new ErrorDeCuenta(503, 'cuentas_sin_precios', 'Los precios de las consultas todavía no están configurados.');
let leida = { crudo: null, valor: null };

/** La configuración de precios, leída de CUENTAS_PRECIOS. Tira ErrorDeCuenta si falta o está mal. */
function configuracion() {
  const crudo = String(process.env.CUENTAS_PRECIOS ?? '').trim();
  if (leida.valor && leida.crudo === crudo) return leida.valor;
  let c;
  try {
    c = JSON.parse(crudo);
  } catch {
    throw sinPrecios();
  }
  const numero = (x, maximo) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= maximo;
  const bien =
    numero(c?.margen?.primera, 1000) &&
    numero(c?.margen?.siguientes, 1000) &&
    Object.keys(MODELO_DE).every((h) => ['fijo', 'variable', 'salida'].every((k) => numero(c?.consumo?.[h]?.[k], 5e6)));
  if (!bien) throw sinPrecios();
  leida = { crudo, valor: c };
  return c;
}

/** ¿Está cargada, y bien, la configuración de precios? */
export function hayPrecios() {
  try {
    configuracion();
    return true;
  } catch {
    return false;
  }
}

/** Por cuánto se multiplica el costo: 1 + el porcentaje del margen. */
export function margenDe(primera) {
  const m = configuracion().margen;
  return 1 + (primera ? m.primera : m.siguientes) / 100;
}

// Antes de consultar se muestra un costo estimado y un máximo. Se aparta el máximo y al
// terminar se cobra lo real, que nunca pasa de ese máximo.
export const MAXIMO_SOBRE_ESTIMADO = 1.5;

// Precios de lista de la API de Anthropic, en dólares por millón de tokens
// (22/11/2026). Si cambia un precio o se suma un modelo, va acá.
const LISTA = [
  { modelo: 'claude-opus-5-5', entrada: 4, salida: 20, leerCache: 0.2, escribirCache: 5 },
  { modelo: 'claude-sonnet-5-5', entrada: 2, salida: 10, leerCache: 0.1, escribirCache: 2.5 },
];
const lista = (modelo) => LISTA.find((x) => String(modelo ?? '').startsWith(x.modelo)) ?? null;

const usd = (p, { fijo, variable, salida }, primera) => (variable * p.entrada + fijo * (primera ? p.escribirCache : p.leerCache) + salida * p.salida) / 1e6;

/**
 * Costo de lista de una consulta, en dólares, según sea la primera de la tanda o
 * una siguiente. `uso` es lo que informa el modelo: { entrada (todo lo que entró),
 * entradaDeCache, entradaACache, salida }. La parte fija es lo que pasó por la caché,
 * se haya leído o escrito. Devuelve null si no se conoce el precio del modelo.
 */
export function costoDeLista(modelo, uso, primera) {
  const p = lista(modelo);
  if (!p || !uso) return null;
  const fijo = (uso.entradaDeCache ?? 0) + (uso.entradaACache ?? 0);
  return usd(p, { fijo, variable: Math.max(0, (uso.entrada ?? 0) - fijo), salida: uso.salida ?? 0 }, primera);
}

/**
 * Lo que la consulta le costó de verdad a Explora, en dólares, según lo que pasó
 * en la caché. No se usa para cobrar: queda guardado para comparar (panel de HDO).
 */
export function costoParaExplora(modelo, uso) {
  const p = lista(modelo);
  if (!p || !uso) return null;
  const deCache = uso.entradaDeCache ?? 0;
  const aCache = uso.entradaACache ?? 0;
  const comun = Math.max(0, (uso.entrada ?? 0) - deCache - aCache);
  return (comun * p.entrada + deCache * p.leerCache + aCache * p.escribirCache + (uso.salida ?? 0) * p.salida) / 1e6;
}

/** De dólares de costo a lo que se le cobra a la persona, en tokens (mínimo 1). */
export function precioAlUsuario(costoUsd, primera) {
  return Math.max(1, Math.ceil(costoUsd * margenDe(primera) * POR_DOLAR - 1e-9));
}

/** Costo estimado y máximo de una consulta, en tokens. */
export function estimadoDe(herramienta, primera) {
  const modelo = MODELO_DE[herramienta];
  if (!modelo) throw new Error(`No hay consumo típico para "${herramienta}"`);
  const estimado = precioAlUsuario(usd(lista(modelo), configuracion().consumo[herramienta], primera), primera);
  return { estimado, maximo: Math.ceil(estimado * MAXIMO_SOBRE_ESTIMADO) };
}
