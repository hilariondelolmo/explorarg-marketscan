// Crushing integrado: qué destino le conviene a una tonelada de soja.
//
// Pedido de HDO del 27/11/2026, a partir de la planilla "2026.11.26 Modelo Crushing
// integrado.xlsx". Es la misma cuenta, en una sola función: los controles de
// scripts/crushing_prueba.mjs la cotejan contra la planilla, celda por celda.
//
// La idea. Una tonelada de poroto da aceite (rendAceite) y harina (rendHarina). La
// harina se exporta siempre, así que lo único que cambia entre un destino y otro es
// cuánto paga por la tonelada de aceite. Ese valor se llama acá `x`:
//
//   exportar el poroto      x = el piso: lo que tiene que valer el aceite para que moler
//                               deje lo mismo que no moler
//   exportar el aceite      x = FOB - retención - gastos
//   aceite al mercado local x = precio local - gastos
//   biodiésel exportado     x = (FOB / (1 + retención) - gastos - transformación) / consumo
//   biodiésel local         x = (precio local - gastos - transformación) / consumo
//
// y el margen de cada destino, contra exportar el poroto, es
//
//   margen = rendAceite x (x - piso)        [usd por tonelada de soja]
//
// Modelo marginal, con capacidad ociosa: solo entran los costos que se evitan si no se
// muele. No hay costos fijos, inversión, IVA ni financiación.
//
// Unidades: precios en usd por tonelada del producto; retenciones y rendimientos en
// fracción (0,24 es 24%); consumo de aceite en t de aceite por t de biodiésel; consumo
// de metanol en kg por t de biodiésel.
//
// Este archivo no trae ningún precio ni ningún costo: los valores los entrega el
// servidor a quien está autorizado (api/reservada.js).

export const ALTERNATIVAS = [
  { id: 'poroto', nombre: 'Exportar el poroto', corto: 'Poroto', bio: false },
  { id: 'aceite_expo', nombre: 'Exportar aceite y harina', corto: 'Aceite exportado', bio: false },
  { id: 'aceite_local', nombre: 'Aceite al mercado local', corto: 'Aceite local', bio: false },
  { id: 'bio_expo', nombre: 'Biodiésel exportado', corto: 'Biodiésel exportado', bio: true },
  { id: 'bio_local', nombre: 'Biodiésel al mercado local', corto: 'Biodiésel local', bio: true },
];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Valor neto de exportar un producto del complejo: FOB menos la retención, que se
 * calcula sobre el FOB oficial (si no se informa, el mismo FOB), menos los gastos.
 */
export function netoExportacion({ fob, fobOficial = null, dex = 0, gasto = 0 }) {
  if (num(fob) === null) return null;
  return fob - (num(fobOficial) ?? fob) * dex - gasto;
}

/**
 * Valor neto del biodiésel exportado. La retención del biodiésel es nominal sobre la
 * base que no incluye el propio derecho: lo que se paga es FOB x t / (1 + t).
 */
export function netoBioExportacion({ fob, dex = 0, gasto = 0 }) {
  if (num(fob) === null) return null;
  return fob / (1 + dex) - gasto;
}

/**
 * La cuenta entera.
 *
 * @param {object} e entradas
 *   poroto, harina, aceite: { fob, fobOficial?, dex, gasto? }
 *   aceiteLocal, gastoAceiteLocal
 *   bioFob, dexBio, gastoBioExpo
 *   bioLocal (puede faltar), gastoBioLocal
 *   rendAceite, rendHarina, costoMolienda, otrosCoproductos
 *   consumoAceite, metanolPrecio, metanolConsumo, otrosCostos, glicerina
 *   habilitadas?: { id: false } para dejar afuera un destino
 * @returns {object|null} null si falta un dato sin el que no hay cuenta
 */
export function calcular(e) {
  const rA = num(e.rendAceite);
  const rH = num(e.rendHarina);
  const a = num(e.consumoAceite);
  const VS = netoExportacion(e.poroto ?? {});
  const VH = netoExportacion(e.harina ?? {});
  if (rA === null || rA <= 0 || rH === null || a === null || a <= 0 || VS === null || VH === null) return null;

  const CM = num(e.costoMolienda) ?? 0;
  const K = num(e.otrosCoproductos) ?? 0;
  const gAL = num(e.gastoAceiteLocal) ?? 0;
  const gBL = num(e.gastoBioLocal) ?? 0;
  const gBX = num(e.gastoBioExpo) ?? 0;
  const tB = num(e.dexBio) ?? 0;

  const VA = netoExportacion(e.aceite ?? {});
  const VL = num(e.aceiteLocal) === null ? null : e.aceiteLocal - gAL;
  const VBX = netoBioExportacion({ fob: e.bioFob, dex: tB, gasto: gBX });
  const VBL = num(e.bioLocal) === null ? null : e.bioLocal - gBL;

  // Transformar el aceite en biodiésel: metanol más el resto, menos lo que deja la glicerina
  const costoMetanol = ((num(e.metanolPrecio) ?? 0) * (num(e.metanolConsumo) ?? 0)) / 1000;
  const transformacionBruta = costoMetanol + (num(e.otrosCostos) ?? 0);
  const CN = transformacionBruta - (num(e.glicerina) ?? 0);

  // El piso: lo que falta recuperar de una tonelada de soja después de vender la harina,
  // repartido en el aceite que da
  const faltaRecuperar = VS + CM - rH * VH - K;
  const piso = faltaRecuperar / rA;
  const pisoBio = CN + a * piso;

  const x = {
    poroto: piso,
    aceite_expo: VA,
    aceite_local: VL,
    bio_expo: VBX === null ? null : (VBX - CN) / a,
    bio_local: VBL === null ? null : (VBL - CN) / a,
  };

  const bioPorSoja = rA / a;
  const apagadas = e.habilitadas ?? {};
  const alternativas = ALTERNATIVAS.map((alt) => {
    const valor = x[alt.id];
    const disponible = valor !== null && apagadas[alt.id] !== false;
    const margen = valor === null ? null : rA * (valor - piso);
    return {
      ...alt,
      x: valor,
      margen,
      margenPorAceite: margen === null ? null : margen / rA,
      margenPorBio: margen === null ? null : margen / bioPorSoja,
      disponible,
    };
  });

  const mayor = (lista) => lista.reduce((m, alt) => (alt.disponible && (m === null || alt.margen > m.margen) ? alt : m), null);
  const mejor = mayor(alternativas);
  const mejorSinBio = mayor(alternativas.filter((alt) => !alt.bio));

  // Lo que le saca al aceite el paso de FOB a neto (retención y gastos), para volver del
  // valor neto a un FOB equivalente. Se supone constante al simular.
  const deduccionAceite = VA === null ? null : e.aceite.fob - VA;

  /** El precio que tendría que tener cada producto para dejar lo mismo que un aceite que vale `valor`. */
  const equivalencias = (valor) =>
    valor === null
      ? null
      : {
          aceite: valor,
          aceiteLocal: valor + gAL,
          aceiteFob: deduccionAceite === null ? null : valor + deduccionAceite,
          bioLocal: CN + a * valor + gBL,
          bioFob: (CN + a * valor + gBX) * (1 + tB),
        };

  return {
    netos: { poroto: VS, harina: VH, aceite: VA, aceiteLocal: VL, bioExpo: VBX, bioLocal: VBL },
    costoMetanol,
    transformacionBruta,
    transformacion: CN,
    faltaRecuperar,
    piso,
    pisoBio,
    bioPorSoja,
    sojaPorAceite: 1 / rA,
    harinaPorAceite: rH / rA,
    // cuánto se mueve el piso del aceite por cada dólar que se mueve la harina neta
    sensibilidadHarina: -rH / rA,
    deduccionAceite,
    alternativas,
    mejor,
    mejorSinBio,
    // contra el mejor destino que no pasa por el biodiésel
    indiferencia: mejorSinBio ? equivalencias(mejorSinBio.x) : null,
    // una fila por destino: qué precio de cada producto lo iguala
    matriz: alternativas.map((alt) => ({ id: alt.id, nombre: alt.nombre, margen: alt.margen, ...(equivalencias(alt.x) ?? {}) })),
  };
}

/**
 * La misma cuenta, despejada: cuánto tiene que valer una entrada para que un destino
 * deje exactamente lo mismo que otro. Sirve para "qué precio de X da vuelta el orden".
 * Busca por bisección entre `min` y `max`; devuelve null si en ese rango no se cruzan.
 */
export function precioDeCruce(e, poner, idA, idB, { min = 0, max = 5000 } = {}) {
  const diferencia = (v) => {
    const r = calcular(poner(e, v));
    if (!r) return null;
    const A = r.alternativas.find((alt) => alt.id === idA);
    const B = r.alternativas.find((alt) => alt.id === idB);
    return A?.margen == null || B?.margen == null ? null : A.margen - B.margen;
  };
  let lo = min;
  let hi = max;
  let dLo = diferencia(lo);
  const dHi = diferencia(hi);
  if (dLo === null || dHi === null || dLo * dHi > 0) return null;
  for (let i = 0; i < 60; i += 1) {
    const medio = (lo + hi) / 2;
    const d = diferencia(medio);
    if (d === null) return null;
    if (d === 0) return medio;
    if (d * dLo < 0) hi = medio;
    else {
      lo = medio;
      dLo = d;
    }
  }
  return (lo + hi) / 2;
}
