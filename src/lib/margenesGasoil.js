/**
 * Crack spread de refinación sobre el crudo (página /margenes, pestaña Gas
 * oil; pedido de HDO del 12/10/2026): réplica de la hoja "CRACK SPREAD
 * INICIO" del workbook 03 "MARKET & INDUSTRY - MARGEN BIODIESEL".
 *
 * Crack spread = (a × naftas + b × gas oil - (a + b) × crudo) ÷ (a + b), con
 * a:b = 1:1 (ratio 2:1:1), 2:1 (3:2:1) o 3:2 (5:3:2); en % = crack ÷ crudo;
 * acumulado = variación contra el primer mes del intervalo. Todo sin
 * impuestos y ponderado por volumen:
 *  - Precios "Mercado": relevamiento Res. 1104 abierto por producto
 *    (public/data/gasoil_productos.json), con los tres filtros del Ranking;
 *    naftas = súper + premium, gas oil = grado 2 + grado 3.
 *  - Precios "Terminales": precios en planta por reventa a EESS
 *    (public/data/gasoil_terminales.json, scripts/gasoil_terminales.py), por
 *    empresa y terminal; gas oil = sin grado + grado 2 + grado 3.
 *  - El gas oil es siempre el fósil: neto del biodiésel con la mezcla real y
 *    la mediana Res. 963, la fórmula del sitio. Las naftas van como vienen
 *    (decisión de HDO del 12/10/2026).
 *  - Crudo: Medanito, Escalante y Cañadón Seco (usd/m³, las series del
 *    Ranking) mezclados con los porcentajes que elige el usuario (abre con
 *    0 / 50 / 50, decisión de HDO).
 *  - $/l ÷ TC × 1.000 = usd/m³; a la unidad elegida con la densidad de cada
 *    producto (gas oil 0,845, naftas 0,68, crudo 0,835 ton/m³).
 */
import { TC, PRODUCTOS, DENSIDAD_GO, DENSIDAD_BIO, MESES_ANOMALOS, MESES_ANOMALOS_PRODUCTOS, cargarProductos } from './gasoil.js';
import { PRESIDENCIAS } from './gestiones.js';
import { UNIDADES } from './margenes.js';
import { mensual as CORTE_JSON } from '../data/corte.json';
import { precio_biodiesel as PRECIO_BIO_JSON } from '../data/evidencia.json';

export { UNIDADES, cargarProductos };

export const RATIOS = [
  { id: '211', label: '2:1:1', naftas: 1, gasoil: 1 },
  { id: '321', label: '3:2:1', naftas: 2, gasoil: 1 },
  { id: '532', label: '5:3:2', naftas: 3, gasoil: 2 },
];
export const CRUDOS = [
  { id: 'medanito', nombre: 'Medanito', inicial: 0 },
  { id: 'escalante', nombre: 'Escalante', inicial: 50 },
  { id: 'canadon_seco', nombre: 'Cañadón Seco', inicial: 50 },
];
export const PCT_INICIAL = Object.fromEntries(CRUDOS.map((c) => [c.id, c.inicial]));
export const DENSIDADES = { gasoil: DENSIDAD_GO, naftas: 0.68, crudo: 0.835 };
export const FUENTES = [
  { id: 'mercado', label: 'Mercado', nombre: 'relevamiento Res. 1104, minorista y mayorista' },
  { id: 'terminales', label: 'Terminales', nombre: 'precios en planta por reventa a estaciones de servicio' },
];
export const PRIMER_MES = '2010-01';
// Meses que el crack spread con precios de mercado saltea enteros: los seis
// con precios anómalos de gas oil que excluye todo el sitio y los de las
// naftas sin impuestos (abr-2025 y jun-2025 los pidió HDO el 12/10/2026 desde
// esta página: la nafta premium del minorista viene por diez). Con una sola
// nafta el mix no sería súper + premium, así que el mes queda afuera.
export const EXCLUIDOS_MERCADO = new Set([...MESES_ANOMALOS, ...Object.values(MESES_ANOMALOS_PRODUCTOS).flat()]);

const CRUDO_SERIE = Object.fromEntries(CRUDOS.map((c) => [c.id, new Map(PRODUCTOS.find((p) => p.id === c.id)?.serie || [])]));
export const FICHA_CRUDO = Object.fromEntries(CRUDOS.map((c) => [c.id, PRODUCTOS.find((p) => p.id === c.id) || null]));
const MEZCLA = new Map(CORTE_JSON.map((m) => [m.fecha, m.real]));
const PRECIO_BIO = new Map(PRECIO_BIO_JSON.map((p) => [p.fecha, p.mediana]));

/** Gas oil fósil en $/l: el precio sin impuestos neto del biodiésel mezclado (fórmula del sitio). */
export function fosil(pL, f) {
  if (pL == null) return null;
  const mezcla = MEZCLA.get(f);
  const bioTon = PRECIO_BIO.get(f);
  if (mezcla == null || !mezcla) return pL;
  if (bioTon == null) return null;
  const bioL = (bioTon * DENSIDAD_BIO) / 1000;
  return (pL - mezcla * bioL) / (1 - mezcla);
}

let terminalesPromesa = null;
export function cargarTerminales() {
  if (!terminalesPromesa) {
    terminalesPromesa = fetch('/data/gasoil_terminales.json').then((r) => {
      if (!r.ok) throw new Error(`No se pudieron cargar los precios de terminales (${r.status})`);
      return r.json();
    });
  }
  return terminalesPromesa;
}

/** Precios del relevamiento por mes ($/l sin impuestos, ponderados por volumen): gas oil grado 2 + 3 y naftas súper + premium. */
export function preciosMercado(D, filtro) {
  const acc = new Map(); // índice de mes → [Σ p×w gas oil, Σ w, Σ p×w naftas, Σ w]
  const cols = [['pn_g2', 'wn_g2', 0], ['pn_g3', 'wn_g3', 0], ['pn_ns', 'wn_ns', 2], ['pn_np', 'wn_np', 2]];
  for (const [pc, wc, k] of cols) {
    const P = D[pc];
    const W = D[wc];
    if (!P || !W) continue;
    for (let i = 0; i < D.mes.length; i++) {
      const p = P[i];
      const w = W[i];
      if (!p || !w || (filtro && !filtro(i))) continue;
      let a = acc.get(D.mes[i]);
      if (!a) { a = [0, 0, 0, 0]; acc.set(D.mes[i], a); }
      a[k] += p * w;
      a[k + 1] += w;
    }
  }
  const out = new Map();
  for (const [m, a] of acc) out.set(D.meses[m], { gasoil: a[1] ? a[0] / a[1] : null, naftas: a[3] ? a[2] / a[3] : null });
  return out;
}

/** Precios en planta por mes ($/l, ponderados por m³) de las empresas y terminales elegidas. */
export function preciosTerminales(T, empresas, terminales) {
  const grupo = T.productos.map((p) => (p.id.startsWith('g') ? 0 : 2));
  const acc = new Map();
  for (let i = 0; i < T.mes.length; i++) {
    if (!empresas.has(T.empresas[T.emp[i]]) || !terminales.has(T.terminales[T.ter[i]])) continue;
    const k = grupo[T.prod[i]];
    let a = acc.get(T.mes[i]);
    if (!a) { a = [0, 0, 0, 0]; acc.set(T.mes[i], a); }
    a[k] += T.p[i] * T.v[i];
    a[k + 1] += T.v[i];
  }
  const out = new Map();
  for (const [m, a] of acc) out.set(T.meses[m], { gasoil: a[1] ? a[0] / a[1] : null, naftas: a[3] ? a[2] / a[3] : null });
  return out;
}

/** Presidencias como intervalo, recortadas a los meses de esta pestaña. */
export function periodosEntre(primer, ultimo) {
  return PRESIDENCIAS.map((p) => {
    const desde = `${p.desde.slice(0, 4)}-12`;
    const hasta = p.hasta ? `${p.hasta.slice(0, 4)}-11` : ultimo;
    return { id: p.presidente, nombre: p.corto, desde: desde < primer ? primer : desde, hasta: hasta > ultimo ? ultimo : hasta };
  });
}

/** Mezcla de crudos en usd/m³ con los porcentajes elegidos (si no suman 100, se reparten en proporción). */
export function crudoMezcla(f, pct) {
  const total = CRUDOS.reduce((s, c) => s + (Number(pct[c.id]) || 0), 0);
  if (!(total > 0)) return null;
  let v = 0;
  for (const c of CRUDOS) {
    const w = (Number(pct[c.id]) || 0) / total;
    if (!w) continue;
    const x = CRUDO_SERIE[c.id].get(f);
    if (x == null) return null;
    v += w * x;
  }
  return v;
}

/**
 * Serie mensual del intervalo en la unidad elegida: naftas, gas oil fósil y
 * crudo, crack spread (valor, % del crudo y acumulado) y los promedios.
 * `precios` es el Map de preciosMercado o preciosTerminales ($/l);
 * `excluidos` los meses que no entran (los de la hoja del workbook).
 */
export function calcular({ precios, meses, excluidos = new Set(), ratioId, unidadId, pct, desde, hasta }) {
  const ratio = RATIOS.find((r) => r.id === ratioId) || RATIOS[1];
  const unidad = UNIDADES.find((u) => u.id === unidadId) || UNIDADES[3];
  const aU = (vM3, dens) => (vM3 == null ? null : vM3 / unidad.porM3(dens));
  const pts = [];
  for (const f of meses) {
    if (f < desde || f > hasta) continue;
    const tc = TC.get(f);
    const pr = precios.get(f);
    const excluido = excluidos.has(f);
    let naftas = null;
    let gasoil = null;
    let crudo = null;
    if (!excluido && tc && pr) {
      naftas = aU(pr.naftas != null ? (pr.naftas / tc) * 1000 : null, DENSIDADES.naftas);
      const fos = fosil(pr.gasoil, f);
      gasoil = aU(fos != null ? (fos / tc) * 1000 : null, DENSIDADES.gasoil);
      crudo = aU(crudoMezcla(f, pct), DENSIDADES.crudo);
    }
    const k = ratio.naftas + ratio.gasoil;
    const crack = naftas != null && gasoil != null && crudo != null ? (ratio.naftas * naftas + ratio.gasoil * gasoil - k * crudo) / k : null;
    pts.push({ fecha: f, naftas, gasoil, crudo, crack, crackPct: crack != null && crudo ? (crack / crudo) * 100 : null, crackAcum: null, excluido });
  }
  const base = pts.find((p) => p.crack != null) || null;
  if (base && base.crack !== 0) for (const p of pts) p.crackAcum = p.crack != null ? ((p.crack - base.crack) / Math.abs(base.crack)) * 100 : null;
  const promedio = (key) => {
    const v = pts.map((p) => p[key]).filter((x) => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const conCrack = pts.filter((p) => p.crack != null);
  return {
    pts, ratio, unidad, rotuloUnidad: `usd/${unidad.label}`,
    promedios: { naftas: promedio('naftas'), gasoil: promedio('gasoil'), crudo: promedio('crudo'), crack: promedio('crack'), crackPct: promedio('crackPct') },
    primero: conCrack[0] || null, ultimo: conCrack.at(-1) || null, meses: conCrack.length,
    sinPrecio: pts.filter((p) => p.crack == null && !p.excluido).length,
  };
}
