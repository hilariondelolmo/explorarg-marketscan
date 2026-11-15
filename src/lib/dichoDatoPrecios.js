// Precios e impuestos por mes para los controles de "Del dicho al dato" que
// comparan el biodiésel con el gas oil (episodios 15 a 18 y 20). Son las
// series de las láminas de González, en pesos corrientes por litro:
//
//  - biodiésel: precio Res. 963/2023 (mediana) de gasoil_ranking.json, en
//    usd/t, pasado a $/l con la densidad del biodiésel y el TC del mes;
//  - gas oil fósil: grado 2 mayorista sin impuestos del relevamiento
//    Res. 1104/2004 (gasoil_precios.json, canal mayorista, ponderado por
//    volumen), neto del biodiésel que llevaba mezclado ese mes (corte real
//    de corte.json): (precio - corte x biodiésel) / (1 - corte);
//  - gas oil importado: CIF de los despachos del mes, sin CAMMESA;
//  - surtidor: grado 2 al público (canal minorista), ponderado por volumen;
//  - impuestos: ICL + ICO2 del gas oil, tarifa general (icl_ico2.json, de la
//    DNIAF). El biodiésel no los paga.
//
// La cuenta del surtidor es la de las láminas: al subir el corte, cada punto
// reemplaza fósil por biodiésel. El precio cambia por la diferencia entre los
// dos (con 21% de IVA) y baja por los impuestos que el fósil paga y el
// biodiésel no. Lo que baja por impuestos es lo que el fisco deja de cobrar.
import { meses as MESES_REL, canales_distribucion as CANALES_DIST, canales_comercializacion as CANALES_COM, canales as CANALES } from '../data/gasoil_precios.json';
import { productos as PRODUCTOS, importaciones as IMPORTACIONES, tc as TC_LISTA, densidad_go as DENSIDAD_GO } from '../data/gasoil_ranking.json';
import { mensual as CORTE, densidad_bio as DENSIDAD_BIO } from '../data/corte.json';
import { gasoil as ICL_ICO2 } from '../data/icl_ico2.json';

export const PRIMER_MES = '2023-11'; // primer mes con precio de la Res. 963/2023
export const IVA = 1.21;
export const VIDEO = ['2026-02', '2026-05']; // "antes de la suba" y "cuando habló"

const TC = new Map(TC_LISTA);
const MAYORISTA = CANALES_DIST.indexOf('Mayorista');
const MINORISTA = CANALES_DIST.indexOf('Minorista');
const AL_PUBLICO = CANALES_COM.indexOf('Al público');
const [MES, DIST, COM, VOL2, SURT2, , SINIMP2] = [0, 1, 2, 3, 4, 5, 6];

const bioUsd = new Map(PRODUCTOS.find((p) => p.id === 'bio_963_m').serie);
const corteReal = new Map(CORTE.map((m) => [m.fecha, m.real]));
const cif = new Map(IMPORTACIONES.map((m) => [m.fecha, m.cif_usd_ton]));
const impuestos = new Map(ICL_ICO2.map(([fecha, icl, , ico2]) => [fecha, icl + ico2]));

// Promedio ponderado por volumen de una columna de precio, por mes
function ponderar(filtro, columna) {
  const acc = new Map();
  CANALES.forEach((f) => {
    if (!filtro(f) || !f[VOL2] || !f[columna]) return;
    const a = acc.get(f[MES]) || { num: 0, den: 0 };
    a.num += f[VOL2] * f[columna];
    a.den += f[VOL2];
    acc.set(f[MES], a);
  });
  return new Map([...acc].map(([i, a]) => [MESES_REL[i], a.num / a.den]));
}
const mayorista = ponderar((f) => f[DIST] === MAYORISTA, SINIMP2);
const surtidor = ponderar((f) => f[DIST] === MINORISTA && f[COM] === AL_PUBLICO, SURT2);

export function precios(mes) {
  const tc = TC.get(mes);
  const bio = bioUsd.has(mes) && tc ? (bioUsd.get(mes) * DENSIDAD_BIO * tc) / 1000 : null;
  const mezcla = mayorista.get(mes) ?? null;
  const c = corteReal.get(mes) || 0;
  return {
    bio,
    fosil: mezcla !== null && bio !== null ? (mezcla - c * bio) / (1 - c) : null,
    importado: cif.has(mes) && tc ? (cif.get(mes) * DENSIDAD_GO * tc) / 1000 : null,
    surtidor: surtidor.get(mes) ?? null,
    impuestos: impuestos.get(mes) ?? null,
  };
}

const con = (mes, claves) => {
  const p = precios(mes);
  return claves.every((k) => p[k] !== null);
};
// Meses con biodiésel y fósil (control de precios) y con todo lo que pide la cuenta del surtidor
export const MESES = MESES_REL.filter((m) => m >= PRIMER_MES && con(m, ['bio', 'fosil']));
export const MESES_SURTIDOR = MESES.filter((m) => con(m, ['surtidor', 'impuestos']));

/**
 * Qué le pasa al litro de gas oil en el surtidor si el corte pasa de `desde`
 * a `hasta` (en % del gas oil): cuánto por la diferencia de precio (con IVA),
 * cuánto por los impuestos que deja de pagar (lo que el fisco deja de cobrar)
 * y el total, en $/l y en % del precio al público.
 */
export function efectoCorte(mes, desde, hasta) {
  const p = precios(mes);
  const puntos = (hasta - desde) / 100;
  const porPrecio = puntos * (p.bio - p.fosil) * IVA;
  const porImpuestos = -puntos * p.impuestos;
  const total = porPrecio + porImpuestos;
  return { ...p, porPrecio, porImpuestos, total, pct: (total / p.surtidor) * 100 };
}
