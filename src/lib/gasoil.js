// Acceso y cálculo sobre los datos del mercado de gas oil
// (src/data/gasoil_precios.json y gasoil_ranking.json, generados por
// scripts/regenerate_gasoil.py desde el relevamiento SE Res. 1104/2004).
import precios from '../data/gasoil_precios.json';
import ranking from '../data/gasoil_ranking.json';
import mapa from '../data/mapa_argentina.json';

export const MESES = precios.meses;
export const ULTIMO_MES = precios.ultimo_mes;
export const PROVINCIAS = precios.provincias;
export const BANDERAS = precios.banderas;
export const CANALES_DIST = precios.canales_distribucion;
export const CANALES_COM = precios.canales_comercializacion;
export const TIPOS_NEGOCIO = precios.tipos_negocio;
export const CANALES = precios.canales;
export const FLUJOS = precios.flujos;
export const EESS = precios.eess;
export const META_PRECIOS = precios.meta;

export const PRODUCTOS = ranking.productos;
export const IMPORTACIONES = ranking.importaciones;
export const DENSIDAD_GO = ranking.densidad_go;
export const TC = new Map(ranking.tc);
export const CPI_US = new Map(ranking.cpi_us);
export const META_RANKING = ranking.meta;

export const IDX_MES = new Map(MESES.map((f, i) => [f, i]));

// Posición de cada campo en las filas compactas de los JSON
export const COL = {
  canales: { mes: 0, cd: 1, cc: 2, 2: { w: 3, s: 4, c: 5, n: 6 }, 3: { w: 7, s: 8, c: 9, n: 10 } },
};

// --- Relevamiento fino (public/data/gasoil_retail.json): cruce mes × provincia
// × bandera × canal distribución × tipo de negocio × canal comercialización,
// en columnas. Va fuera del bundle (7,8 MB) y se pide una sola vez.
let retailPromesa = null;
export function cargarRetail() {
  if (!retailPromesa) {
    retailPromesa = fetch('/data/gasoil_retail.json').then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar el relevamiento (${r.status})`);
      return r.json();
    });
  }
  return retailPromesa;
}

// Datos por boca y mes, particionados por operador (índice % partes)
const partesPromesa = new Map();
export function cargarParte(k) {
  if (!partesPromesa.has(k)) {
    partesPromesa.set(k, fetch(`/data/gasoil_bocas/${k}.json`).then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar la partición ${k} (${r.status})`);
      return r.json();
    }));
  }
  return partesPromesa.get(k);
}

// Bocas relevadas en un mes (mapa de estaciones con precio): un archivo por mes
const mesesPromesa = new Map();
export function cargarMes(f) {
  if (!mesesPromesa.has(f)) {
    mesesPromesa.set(f, fetch(`/data/gasoil_mes/${f}.json`).then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar el mes ${f} (${r.status})`);
      return r.json();
    }));
  }
  return mesesPromesa.get(f);
}

/**
 * Precio ponderado sobre el relevamiento columnar.
 *   D       datos columnares (cargarRetail)
 *   filtro  (i) => bool, o null
 *   clave   (i) => clave de agrupación
 *   campo   's' | 'c' | 'n' · grado 2 | 3
 * Devuelve Map(clave → { precio ($/l), w (m3), e (EESS con precio surtidor) }).
 */
export function ponderarCol(D, filtro, clave, campo, grado) {
  const P = D[`${campo}${grado}`];
  const W = D[`w${grado}`];
  const E = D.e2;
  const out = new Map();
  const n = D.mes.length;
  for (let i = 0; i < n; i++) {
    if (filtro && !filtro(i)) continue;
    const p = P[i];
    const w = W[i];
    if (!p || !w) continue;
    const k = clave(i);
    let a = out.get(k);
    if (!a) {
      a = { w: 0, pw: 0, e: 0 };
      out.set(k, a);
    }
    a.w += w;
    a.pw += (p / 100) * w;
    a.e += E[i];
  }
  for (const a of out.values()) a.precio = a.pw / a.w;
  return out;
}

/** Tipos de precio del relevamiento (los del selector del workbook). */
export const TIPOS_PRECIO = [
  { id: 'surtidor', label: 'Precio surtidor', campo: 's', unidad: '$/l', moneda: 'ars' },
  { id: 'sin_imp', label: 'Precio sin impuestos', campo: 'n', unidad: '$/l', moneda: 'ars' },
  { id: 'con_imp', label: 'Precio con impuestos', campo: 'c', unidad: '$/l', moneda: 'ars' },
  { id: 'sin_imp_usd', label: 'Precio sin impuestos', campo: 'n', unidad: 'usd/l', moneda: 'usd' },
  { id: 'sin_imp_usd_ton', label: 'Precio sin impuestos', campo: 'n', unidad: 'usd/ton', moneda: 'usd', ton: true },
  { id: 'con_imp_usd_ton', label: 'Precio con impuestos', campo: 'c', unidad: 'usd/ton', moneda: 'usd', ton: true },
];
export const tipoPrecio = (id) => TIPOS_PRECIO.find((t) => t.id === id) || TIPOS_PRECIO[0];

/** Convierte un precio en $/l al tipo pedido (usd/l o usd/ton con el TC del mes). */
export function convertir(valorArs, fecha, tipo) {
  if (valorArs == null) return null;
  if (tipo.moneda === 'ars') return valorArs;
  const tc = TC.get(fecha);
  if (!tc) return null;
  const usdL = valorArs / tc;
  return tipo.ton ? (usdL * 1000) / DENSIDAD_GO : usdL;
}

/**
 * Precio ponderado por volumen, agrupado por `clave`.
 *   rows    filas compactas (RETAIL o CANALES)
 *   layout  COL.retail o COL.canales
 *   filtro  (fila) => bool, o null
 *   clave   (fila) => clave de agrupación
 *   campo   's' surtidor · 'c' con impuestos · 'n' sin impuestos
 *   grado   2 o 3
 * Devuelve Map(clave → { precio, w (m3 ponderador), e (EESS con precio) }).
 * Un precio 0 es "sin dato" (la SE carga 0 de surtidor fuera del canal al público).
 */
export function ponderar(rows, layout, filtro, clave, campo, grado) {
  const L = layout[grado];
  const out = new Map();
  for (const r of rows) {
    if (filtro && !filtro(r)) continue;
    const p = r[L[campo]];
    const w = r[L.w];
    if (!p || !w) continue;
    const k = clave(r);
    let a = out.get(k);
    if (!a) {
      a = { w: 0, pw: 0, e: 0 };
      out.set(k, a);
    }
    a.w += w;
    a.pw += p * w;
    if (L.e != null) a.e += r[L.e] || 0;
  }
  for (const a of out.values()) a.precio = a.pw / a.w;
  return out;
}

/** Ventanas del selector de rango: primer mes incluido. */
export function desdeRango(rango, hasta = ULTIMO_MES) {
  if (rango === 'todo') return MESES[0];
  const meses = { '12m': 12, '5a': 60, '10a': 120 }[rango] || 60;
  const i = IDX_MES.get(hasta) ?? MESES.length - 1;
  return MESES[Math.max(0, i - meses + 1)];
}

/** Precio con la cantidad de decimales que pide su magnitud y unidad. */
export function fmtPrecio(v, unidad = '$/l') {
  if (v == null || isNaN(v)) return '-';
  let dec = 0;
  if (unidad === 'usd/l') dec = 3;
  else if (unidad === '$/l') dec = Math.abs(v) >= 100 ? 0 : 2;
  return v.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Variación % de un valor contra otro (null si no se puede). */
export const variacion = (v, base) => (v == null || base == null || base === 0 ? null : (v / base - 1) * 100);

// Colores de las banderas para el mapa de estaciones (marcas reconocibles;
// el resto en un gris neutro).
export const COLOR_BANDERA = {
  YPF: '#1d4ed8',
  SHELL: '#eab308',
  AXION: '#7c3aed',
  PUMA: '#dc2626',
  GULF: '#f97316',
  BLANCA: '#9ca3af',
  REFINOR: '#0e7490',
  'OIL COMBUSTIBLES': '#065f46',
  ESSO: '#b91c1c',
  PETROBRAS: '#16a34a',
  DAPSA: '#a16207',
  VOY: '#db2777',
};
export const colorBandera = (b) => COLOR_BANDERA[b] || '#6b7280';

/** Nombre de provincia en mayúsculas tipográficas ("Santa Fe"). */
const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y']);
export const nombreProvincia = (s) =>
  (s || '').toLowerCase().split(' ').map((w, i) => (
    i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
  )).join(' ');

// --- Mapa: misma proyección Mercator que el mapa de plantas (generar_mapa.py)
const { lon_min, lat_max, kx, ky } = mapa.proyeccion;
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const MERC_TOP = merc(lat_max);
export const proyectar = (lng, lat) => [(lng - lon_min) * kx, (MERC_TOP - merc(lat)) * ky];
export const MAPA = mapa;

// Caja [x0, y0, x1, y1] de cada provincia en unidades del viewBox (para
// etiquetas y para encuadrar el mapa en una provincia)
export const CAJA_PROVINCIA = new Map(mapa.provincias.map((p) => {
  const nums = p.path.match(/-?\d+(?:\.\d+)?/g).map(Number);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i], y = nums[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [p.nombre, [x0, y0, x1, y1]];
}));
