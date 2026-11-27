// Crushing integrado - la misma cuenta de src/lib/crushing.js, día por día y mes por mes.
//
// Recibe el conjunto de datos del área reservada ({ campos, filas, parametros }; lo arma
// scripts/regenerate_crushing.py y lo entrega api/reservada.js) y devuelve una fila por
// día con el resultado de `calcular`, y de ahí los promedios por mes.
//
// Reglas:
//   - Los costos y rendimientos son los de `parametros`, los mismos para todos los días:
//     la serie muestra cómo se movieron los precios y las retenciones, no los costos.
//   - Los precios que no se cargan todos los días (el FAS y el FOB de J.J. Hinrichsen,
//     las series de uso interno) se arrastran hasta `arrastre` días hábiles; pasado eso, ese destino
//     queda sin dato ese día.
//   - El precio oficial del biodiésel es uno por mes: un mes sin precio publicado no tiene
//     biodiésel local.
//   - El promedio del mes es el promedio de los días con dato de cada número (se calcula
//     cada día y después se promedia, no al revés).
//
// Este archivo no trae precios ni costos: llegan en `datos`.

import { ALTERNATIVAS, calcular } from './crushing.js';

export const DESTINOS = ALTERNATIVAS.filter((a) => a.id !== 'poroto');

const ARRASTRE = 5;

/**
 * Una fila por día: { fecha, piso, pisoBio, x: {id}, margen: {id}, mejor, mejorSinBio,
 * bioLocal, indifBioLocal, bioFob, indifBioFob, aceiteFob, indifAceiteFob }.
 * Los días en que falta el FOB del poroto o de la harina no salen.
 */
export function serieDiaria(datos, { fuenteAceite = 'fas_jj', fuenteBio = 'bio_fob_jj', posicion = '', arrastre = ARRASTRE } = {}) {
  const { campos, filas, parametros: p } = datos;
  const I = Object.fromEntries(campos.map((c, i) => [c, i]));
  const visto = {}; // campo -> { valor, k }: el último dato, para arrastrarlo
  const con = (fila, k, campo) => {
    const i = I[campo];
    const v = i === undefined ? null : fila[i];
    if (v != null) {
      visto[campo] = { valor: v, k };
      return v;
    }
    const u = visto[campo];
    return u && k - u.k <= arrastre ? u.valor : null;
  };
  const dias = [];
  filas.forEach((fila, k) => {
    const dato = (campo) => {
      const i = I[campo];
      return i === undefined ? null : fila[i];
    };
    const aceiteLocal = con(fila, k, fuenteAceite);
    const bioFob = con(fila, k, fuenteBio);
    const bioLocal = dato('bio_oficial');
    // la retención del biodiésel es la de ese día; si no se conoce, no se inventa con la de hoy
    const dexBio = dato('dex_bio');
    const R = calcular({
      poroto: { fob: dato(`poroto${posicion}`), dex: dato('dex_poroto') ?? 0, gasto: p.gastoPoroto ?? 0 },
      harina: { fob: dato(`harina${posicion}`), dex: dato('dex_harina') ?? 0, gasto: p.gastoHarina ?? 0 },
      aceite: { fob: dato(`aceite${posicion}`), dex: dato('dex_aceite') ?? 0, gasto: p.gastoAceite ?? 0 },
      aceiteLocal,
      gastoAceiteLocal: p.gastoAceiteLocal,
      // sin retención conocida (la alícuota móvil de 2012 a 2014) no hay biodiésel exportado
      bioFob: dexBio == null ? null : bioFob,
      dexBio,
      gastoBioExpo: p.gastoBioExpo,
      bioLocal,
      gastoBioLocal: p.gastoBioLocal,
      rendAceite: p.rendAceite,
      rendHarina: p.rendHarina,
      costoMolienda: p.costoMolienda,
      otrosCoproductos: p.otrosCoproductos,
      consumoAceite: p.consumoAceite,
      metanolPrecio: p.metanolPrecio,
      metanolConsumo: p.metanolConsumo,
      otrosCostos: p.otrosCostos,
      glicerina: p.glicerina,
    });
    if (!R) return;
    const x = {};
    const margen = {};
    for (const a of R.alternativas) {
      x[a.id] = a.x;
      margen[a.id] = a.margen;
    }
    dias.push({
      fecha: fila[0],
      piso: R.piso,
      pisoBio: R.pisoBio,
      x,
      margen,
      mejor: R.mejor?.id ?? null,
      mejorSinBio: R.mejorSinBio?.id ?? null,
      bioLocal,
      indifBioLocal: R.indiferencia?.bioLocal ?? null,
      bioFob: dexBio == null ? null : bioFob,
      indifBioFob: dexBio == null ? null : (R.indiferencia?.bioFob ?? null),
      aceiteFob: dato(`aceite${posicion}`),
      indifAceiteFob: R.indiferencia?.aceiteFob ?? null,
    });
  });
  return dias;
}

const promedio = (lista) => {
  const v = lista.filter((n) => n != null && !Number.isNaN(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/**
 * Una fila por mes con el promedio de los días: { fecha: 'aaaa-mm', dias, piso, pisoBio,
 * x_<id>, m_<id>, bioLocal, indifBioLocal, brechaBioLocal, bioFob, indifBioFob,
 * brechaBioFob, mejor }. La indiferencia se promedia sobre todos los días del mes; las
 * brechas (precio menos indiferencia), solo sobre los días que tienen los dos. `mejor` es el destino de mayor margen promedio del mes.
 */
export function porMes(dias) {
  const grupos = new Map();
  for (const d of dias) {
    const m = d.fecha.slice(0, 7);
    if (!grupos.has(m)) grupos.set(m, []);
    grupos.get(m).push(d);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([fecha, ds]) => {
      const fila = {
        fecha,
        dias: ds.length,
        piso: promedio(ds.map((d) => d.piso)),
        pisoBio: promedio(ds.map((d) => d.pisoBio)),
        bioLocal: promedio(ds.map((d) => d.bioLocal)),
        indifBioLocal: promedio(ds.map((d) => d.indifBioLocal)),
        brechaBioLocal: promedio(ds.map((d) => (d.bioLocal == null || d.indifBioLocal == null ? null : d.bioLocal - d.indifBioLocal))),
        bioFob: promedio(ds.map((d) => d.bioFob)),
        indifBioFob: promedio(ds.map((d) => d.indifBioFob)),
        brechaBioFob: promedio(ds.map((d) => (d.bioFob == null || d.indifBioFob == null ? null : d.bioFob - d.indifBioFob))),
      };
      let mejor = null;
      for (const a of ALTERNATIVAS) {
        fila[`x_${a.id}`] = promedio(ds.map((d) => d.x[a.id]));
        const m = promedio(ds.map((d) => d.margen[a.id]));
        fila[`m_${a.id}`] = m;
        if (m != null && (mejor === null || m > fila[`m_${mejor}`])) mejor = a.id;
      }
      fila.mejor = mejor;
      return fila;
    });
}

/** Promedio de un campo sobre los meses de un intervalo, y en cuántos meses hay dato. */
export function resumen(meses, campo) {
  const v = meses.map((m) => m[campo]).filter((n) => n != null);
  return { promedio: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, meses: v.length };
}
