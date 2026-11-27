// Crushing integrado - "qué pasa si": mover variables y repartir un volumen con topes.
//
// Todo parte de los valores de los casilleros (`v`, con los porcentajes en %; ver
// crushingDia.js) y usa la cuenta de crushing.js:
//
//   barrer      mueve una variable entre dos valores y da el margen de cada destino
//   cruces      en qué valores de esa variable cambia el mejor destino
//   tablaDoble  mueve dos variables a la vez: el mejor destino de cada combinación
//   asignar     reparte un volumen de soja entre los destinos, con topes por destino
//
// Este archivo no trae precios ni costos: llegan en `v`.

import { calcular } from './crushing.js';
import { aEntradas } from './crushingDia.js';

/**
 * Las variables que se pueden mover. `clase`: 'precio' se mueve en porcentaje de su valor;
 * 'puntos' (las retenciones), en puntos porcentuales.
 */
export const VARIABLES = [
  { id: 'bioLocal', label: 'Biodiésel en el mercado local', unidad: 'usd/t', clase: 'precio' },
  { id: 'bioFob', label: 'Biodiésel FOB', unidad: 'usd/t', clase: 'precio' },
  { id: 'aceite', label: 'Aceite FOB', unidad: 'usd/t', clase: 'precio' },
  { id: 'aceiteLocal', label: 'Aceite en el mercado local', unidad: 'usd/t', clase: 'precio' },
  { id: 'harina', label: 'Harina FOB', unidad: 'usd/t', clase: 'precio' },
  { id: 'poroto', label: 'Poroto FOB', unidad: 'usd/t', clase: 'precio' },
  { id: 'dexPoroto', label: 'Retención del poroto', unidad: '%', clase: 'puntos' },
  // harina y aceite pagan la misma alícuota desde 2015: se mueven juntas
  { id: 'dexSub', label: 'Retención de harina y aceite, juntas', unidad: '%', clase: 'puntos', campos: ['dexAceite', 'dexHarina'] },
  { id: 'dexBio', label: 'Retención del biodiésel', unidad: '%', clase: 'puntos' },
  { id: 'costoMolienda', label: 'Costo variable de molienda', unidad: 'usd/t soja', clase: 'precio' },
  { id: 'metanolPrecio', label: 'Precio del metanol', unidad: 'usd/t', clase: 'precio' },
  { id: 'otrosCostos', label: 'Otros costos de transformación', unidad: 'usd/t bio', clase: 'precio' },
];

export const variable = (id) => VARIABLES.find((x) => x.id === id);
const camposDe = (vr) => vr.campos ?? [vr.id];

/** El valor de una variable en `v`. */
export const leer = (vr, v) => v[camposDe(vr)[0]] ?? null;

/** `v` con esa variable puesta en `x`. */
export function poner(vr, v, x) {
  const nuevo = { ...v };
  for (const c of camposDe(vr)) nuevo[c] = x;
  return nuevo;
}

export const evaluar = (v) => calcular(aEntradas(v));

/** Entre qué valores tiene sentido mover una variable: 30% para cada lado, o 10 puntos. */
export function rangoDe(vr, v) {
  const base = leer(vr, v);
  if (base == null) return null;
  if (vr.clase === 'puntos') return { min: Math.max(0, base - 10), max: base + 10 };
  return base > 0 ? { min: base * 0.7, max: base * 1.3 } : { min: 0, max: 100 };
}

/** Siete valores alrededor del actual, para la tabla de dos variables. */
export function pasosDe(vr, v) {
  const base = leer(vr, v);
  if (base == null) return [];
  if (vr.clase === 'puntos') return [-6, -4, -2, 0, 2, 4, 6].map((d) => Math.max(0, base + d));
  return [-30, -20, -10, 0, 10, 20, 30].map((d) => base * (1 + d / 100));
}

const fila = (R, x) => {
  const f = { x, mejor: R?.mejor?.id ?? null };
  for (const a of R?.alternativas ?? []) f[a.id] = a.margen;
  return f;
};

/** El margen de cada destino para `pasos + 1` valores de la variable entre `min` y `max`. */
export function barrer(vr, v, { min, max, pasos = 60 }) {
  return Array.from({ length: pasos + 1 }, (_, i) => {
    const x = min + ((max - min) * i) / pasos;
    return fila(evaluar(poner(vr, v, x)), x);
  });
}

/**
 * Los valores de la variable en los que cambia el mejor destino, entre `min` y `max`:
 * [{ x, de, a }] (por debajo de x el mejor es `de`; por encima, `a`). Recorre el rango y
 * afina cada cambio por bisección.
 */
export function cruces(vr, v, { min, max, pasos = 240 }) {
  const mejorEn = (x) => evaluar(poner(vr, v, x))?.mejor?.id ?? null;
  const lista = [];
  let xAnterior = min;
  let mejorAnterior = mejorEn(min);
  for (let i = 1; i <= pasos; i += 1) {
    const x = min + ((max - min) * i) / pasos;
    const mejor = mejorEn(x);
    if (mejor !== mejorAnterior) {
      let lo = xAnterior;
      let hi = x;
      for (let k = 0; k < 40; k += 1) {
        const medio = (lo + hi) / 2;
        if (mejorEn(medio) === mejorAnterior) lo = medio;
        else hi = medio;
      }
      lista.push({ x: (lo + hi) / 2, de: mejorAnterior, a: mejor });
    }
    xAnterior = x;
    mejorAnterior = mejor;
  }
  return lista;
}

/** Dos variables a la vez: una fila por valor de `vrA`, una celda por valor de `vrB`. */
export function tablaDoble(vrA, vrB, v, valoresA, valoresB) {
  return valoresA.map((xa) =>
    valoresB.map((xb) => {
      const R = evaluar(poner(vrB, poner(vrA, v, xa), xb));
      return { mejor: R?.mejor?.id ?? null, margen: R?.mejor?.margen ?? null };
    })
  );
}

/**
 * Reparte `soja` toneladas entre los destinos para que dejen lo más posible.
 *
 * `topes`: toneladas de PRODUCTO (aceite o biodiésel) que admite cada destino; sin dato,
 * no tiene tope. `molienda`: toneladas de soja que se pueden moler; sin dato, sin tope.
 * Exportar el poroto no tiene tope y recibe lo que sobra.
 *
 * Como cada destino deja un margen fijo por tonelada de soja y todos gastan la misma
 * soja y la misma molienda, lo mejor es llenar primero el que más deja, después el
 * siguiente, y así. Un destino que deja menos que exportar el poroto no recibe nada.
 *
 * Devuelve { filas: [{ id, nombre, margen, soja, producto, total, tope, lleno }], poroto,
 * molida, total, promedio, siguiente }, con `siguiente` = a dónde iría la próxima tonelada.
 */
export function asignar(R, { soja, molienda = null, topes = {} }) {
  if (!R || !(soja > 0)) return null;
  const rendAceite = 1 / R.sojaPorAceite;
  const productoPorSoja = (id) => (id.startsWith('bio') ? R.bioPorSoja : rendAceite);
  const orden = R.alternativas.filter((a) => a.id !== 'poroto' && a.disponible && a.margen > 0).sort((a, b) => b.margen - a.margen);
  let resto = soja;
  let puedeMoler = molienda == null ? Infinity : Math.max(0, molienda);
  let siguiente = null;
  const filas = orden.map((a) => {
    const porSoja = productoPorSoja(a.id);
    const tope = topes[a.id] == null ? null : Math.max(0, topes[a.id]);
    const cabe = tope == null ? Infinity : tope / porSoja;
    const va = Math.max(0, Math.min(resto, puedeMoler, cabe));
    resto -= va;
    puedeMoler -= va;
    const lleno = tope != null && va >= cabe - 1e-9;
    // la próxima tonelada va al primer destino al que todavía le entra
    if (!siguiente && !lleno && puedeMoler > 1e-9) siguiente = { id: a.id, nombre: a.nombre, margen: a.margen };
    return { id: a.id, nombre: a.nombre, margen: a.margen, soja: va, producto: va * porSoja, total: va * a.margen, tope, lleno };
  });
  const molida = filas.reduce((s, f) => s + f.soja, 0);
  const total = filas.reduce((s, f) => s + f.total, 0);
  return {
    filas,
    poroto: resto,
    molida,
    total,
    promedio: total / soja,
    siguiente: siguiente ?? { id: 'poroto', nombre: 'Exportar el poroto', margen: 0 },
  };
}
