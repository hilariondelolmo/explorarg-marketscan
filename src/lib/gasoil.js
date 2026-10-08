// Acceso y cálculo sobre los datos del mercado de gas oil
// (src/data/gasoil_precios.json y gasoil_ranking.json en el bundle, y el
// relevamiento fino en public/data/, todos generados por
// scripts/regenerate_gasoil.py desde el relevamiento SE Res. 1104/2004).
// Imports nombrados del JSON: los bloques que ninguna sección lee (canales,
// flujos, eess: cruces precalculados de la primera versión) quedan fuera del
// bundle sin tocar el generador.
import {
  meses as MESES_JSON, ultimo_mes as ULTIMO_MES_JSON, provincias as PROVINCIAS_JSON, banderas as BANDERAS_JSON,
  canales_distribucion as CANALES_DIST_JSON, canales_comercializacion as CANALES_COM_JSON,
  tipos_negocio as TIPOS_NEGOCIO_JSON, meta as META_PRECIOS_JSON,
} from '../data/gasoil_precios.json';
import ranking from '../data/gasoil_ranking.json';
// Biodiésel del tablero de biodiésel (scripts/regenerate_data.py), para el
// corte real de la página Tablas SESCO: ventas de corte del país por mes (m³)
// y compras de cada petrolera (toneladas). Imports nombrados: el resto de
// esos JSON queda fuera de este bundle.
import { mensual as CORTE_MENSUAL_JSON, densidad_bio as DENSIDAD_BIO_JSON } from '../data/corte.json';
import { mensual as BIO_PETROLERAS_JSON } from '../data/petroleras.json';
import mapa from '../data/mapa_argentina.json';

export const MESES = MESES_JSON;
export const ULTIMO_MES = ULTIMO_MES_JSON;
export const PROVINCIAS = PROVINCIAS_JSON;
export const BANDERAS = BANDERAS_JSON;
export const CANALES_DIST = CANALES_DIST_JSON;
export const CANALES_COM = CANALES_COM_JSON;
export const TIPOS_NEGOCIO = TIPOS_NEGOCIO_JSON;
export const META_PRECIOS = META_PRECIOS_JSON;

// Meses sin precios de gas oil en todo el sitio (decisión de HDO del
// 05/10/2026; desde el 01/10/2026 cuatro de ellos ya quedaban afuera del gas
// oil fósil de Resultado de importar y de Corte obligatorio): el relevamiento
// trae valores anómalos, con saltos contra los meses vecinos de +83% en
// oct-2010 (grado 2), +125% en jun-2011 y +46% en jun-2013 (grado 3) y +73%
// en ago-2015 (grado 3 sin impuestos); abr-2011 y jul-2013, más leves. Se
// borran los precios del relevamiento al cargarlo (surtidor, con y sin
// impuestos, los dos grados) y los de las series de gas oil del ranking; los
// volúmenes de esos meses quedan como vienen.
export const MESES_ANOMALOS = new Set(['2010-10', '2011-04', '2011-06', '2013-06', '2013-07', '2015-08']);
/** Meses que se ofrecen en los selectores de las páginas de precio. */
export const MESES_CON_PRECIO = MESES.filter((f) => !MESES_ANOMALOS.has(f));

export const PRODUCTOS = ranking.productos.map((p) => (
  p.id.startsWith('go') ? { ...p, serie: p.serie.filter(([f]) => !MESES_ANOMALOS.has(f)) } : p
));
export const IMPORTACIONES = ranking.importaciones;
// Series de Master data que no van al ranking (Precios comparados): aceite
// FAS MINAGRI y metanol YPF, cada una hasta su último mes con dato
export const COMPARADOS = ranking.comparados || [];
// Precio del biodiésel Res. 963 por mes desde nov-2023: fórmula (Explora),
// publicado (SE), cupo y cupo de Explora en toneladas, TC (página Res. 963 y ajustes)
export const RES963 = ranking.res963 || [];
export const DENSIDAD_GO = ranking.densidad_go;
export const TC = new Map(ranking.tc);
export const CPI_US = new Map(ranking.cpi_us);
export const META_RANKING = ranking.meta;

export const IDX_MES = new Map(MESES.map((f, i) => [f, i]));
const IDX_ANOMALOS = new Set([...MESES_ANOMALOS].map((f) => IDX_MES.get(f)));
const COLUMNAS_PRECIO = ['s2', 'c2', 'n2', 's3', 'c3', 'n3'];
/** Deja sin precio (0 = sin dato) las filas de los meses excluidos; no toca el volumen. */
function sinPreciosAnomalos(datos, excluida) {
  for (const c of COLUMNAS_PRECIO) {
    const col = datos[c];
    if (!col) continue;
    for (let i = 0; i < col.length; i++) if (excluida(i)) col[i] = 0;
  }
  return datos;
}

export const DENSIDAD_BIO = DENSIDAD_BIO_JSON;
// mes → corte obligatorio (fracción; null si no había mandato)
export const CORTE_OBLIGATORIO = new Map(CORTE_MENSUAL_JSON.map((m) => [m.fecha, m.obligatorio]));
// mes → m³ de biodiésel vendido para el corte en el país
export const BIO_MENSUAL = new Map(CORTE_MENSUAL_JSON.map((m) => [m.fecha, m.bio_m3]));
// mes → { petrolera compradora: toneladas de biodiésel }
export const BIO_PETROLERAS = new Map(BIO_PETROLERAS_JSON.map(({ fecha, ...compras }) => [fecha, compras]));

// --- Relevamiento fino (public/data/gasoil_retail.json): cruce mes × provincia
// × bandera × canal distribución × tipo de negocio × canal comercialización,
// en columnas, con la cantidad de estaciones de cada celda (q y p, ver
// scripts/gasoil_estaciones.py). Va fuera del bundle (10 MB) y se pide una
// sola vez.
let retailPromesa = null;
export function cargarRetail() {
  if (!retailPromesa) {
    retailPromesa = fetch('/data/gasoil_retail.json').then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar el relevamiento (${r.status})`);
      return r.json();
    }).then((d) => sinPreciosAnomalos(d, (i) => IDX_ANOMALOS.has(d.mes[i])));
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
    }).then((d) => sinPreciosAnomalos(d, (i) => IDX_ANOMALOS.has(d.mes[i]))));
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
    }).then((d) => (MESES_ANOMALOS.has(f) ? sinPreciosAnomalos(d, () => true) : d)));
  }
  return mesesPromesa.get(f);
}

// --- Relevamiento abierto por producto (public/data/gasoil_productos.json,
// scripts/gasoil_productos.py): cruce mes × canal distribución × tipo de
// negocio × canal comercialización con el precio ponderado ($/l) y su peso
// (m³) para gas oil grado 1, 2 y 3, kerosene, nafta súper y nafta premium,
// por tipo de precio (p{s|c|n}_{producto} y w{s|c|n}_{producto}). Lo usa el
// Ranking de precios. Los precios de los meses excluidos se borran al cargar,
// como en el cruce fino (los seis meses valen para todos los productos del
// relevamiento: las naftas traen los mismos saltos que el gas oil).
// Meses anómalos propios de las naftas (decisión de HDO del 07/10/2026, solo
// para estas series; el surtidor y el con impuestos de esos meses son normales):
// nafta premium sin impuestos ene-2015 y feb-2017 (347 y 322 $/l contra 10,7 y
// 13,3 en los meses vecinos) y nafta súper sin impuestos mar-2026 (2.056 contra
// 1.163 en feb). Columna del archivo → meses que se dejan sin precio.
export const MESES_ANOMALOS_PRODUCTOS = { pn_np: ['2015-01', '2017-02'], pn_ns: ['2026-03'] };
let productosPromesa = null;
export function cargarProductos() {
  if (!productosPromesa) {
    productosPromesa = fetch('/data/gasoil_productos.json').then((r) => {
      if (!r.ok) throw new Error(`No se pudieron cargar los productos del relevamiento (${r.status})`);
      return r.json();
    }).then((d) => {
      const anomalos = new Set([...MESES_ANOMALOS].map((f) => d.meses.indexOf(f)));
      for (const c of d.columnas) {
        if (!c.startsWith('p')) continue;
        const col = d[c];
        for (let i = 0; i < col.length; i++) if (anomalos.has(d.mes[i])) col[i] = 0;
      }
      for (const [c, fechas] of Object.entries(MESES_ANOMALOS_PRODUCTOS)) {
        const col = d[c];
        if (!col) continue;
        const idx = new Set(fechas.map((f) => d.meses.indexOf(f)));
        for (let i = 0; i < col.length; i++) if (idx.has(d.mes[i])) col[i] = 0;
      }
      return d;
    });
  }
  return productosPromesa;
}

/**
 * Precio ponderado por mes ($/l) de un producto y tipo de precio del
 * relevamiento abierto por producto: Σ precio × peso / Σ peso sobre las filas
 * que pasan `filtro(i)`. Devuelve Map(fecha → $/l).
 */
export function ponderarProducto(D, filtro, producto, tipo) {
  const P = D[`p${tipo}_${producto}`];
  const W = D[`w${tipo}_${producto}`];
  const out = new Map();
  if (!P || !W) return out;
  const pw = new Map();
  const ww = new Map();
  for (let i = 0; i < D.mes.length; i++) {
    const p = P[i];
    const w = W[i];
    if (!p || !w || (filtro && !filtro(i))) continue;
    const m = D.mes[i];
    pw.set(m, (pw.get(m) || 0) + p * w);
    ww.set(m, (ww.get(m) || 0) + w);
  }
  for (const [m, w] of ww) out.set(D.meses[m], pw.get(m) / w);
  return out;
}

// --- Tablas SESCO (public/data/gasoil_sesco.json, scripts/gasoil_sesco.py):
// ventas al mercado por mes × provincia × empresa × sector. Cada producto
// guarda solo las filas del cruce donde tiene venta (i = fila, v = cantidad
// en su unidad). Va fuera del bundle (5 MB) y se pide una sola vez.
let sescoPromesa = null;
export function cargarSesco() {
  if (!sescoPromesa) {
    sescoPromesa = fetch('/data/gasoil_sesco.json').then((r) => {
      if (!r.ok) throw new Error(`No se pudieron cargar las tablas SESCO (${r.status})`);
      return r.json();
    });
  }
  return sescoPromesa;
}

// --- Importaciones (public/data/gasoil_importaciones.json,
// scripts/gasoil_importaciones.py): despachos de importación de gas oil por
// mes × importador × país de origen × país de procedencia, en columnas; y el
// mapa mundial (public/data/mapa_mundo.json, scripts/generar_mapa_mundo.py)
// para dibujar los flujos. Los dos fuera del bundle, pedidos una sola vez.
let importacionesPromesa = null;
export function cargarImportaciones() {
  if (!importacionesPromesa) {
    importacionesPromesa = fetch('/data/gasoil_importaciones.json').then((r) => {
      if (!r.ok) throw new Error(`No se pudieron cargar las importaciones (${r.status})`);
      return r.json();
    });
  }
  return importacionesPromesa;
}
let mapaMundoPromesa = null;
export function cargarMapaMundo() {
  if (!mapaMundoPromesa) {
    mapaMundoPromesa = fetch('/data/mapa_mundo.json').then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar el mapa mundial (${r.status})`);
      return r.json();
    });
  }
  return mapaMundoPromesa;
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

/**
 * Volumen (m³) del relevamiento columnar, sin mirar el tipo de precio: el que
 * declararon las bocas que informaron algún precio en el mes (las que no
 * informaron precio no están en los datos).
 *   D       datos columnares (cargarRetail)
 *   filtro  (i) => bool, o null
 *   clave   (i) => clave de agrupación
 *   grado   2 | 3
 * Devuelve Map(clave → m³).
 */
export function sumarCol(D, filtro, clave, grado) {
  const W = D[`w${grado}`];
  const out = new Map();
  const n = D.mes.length;
  for (let i = 0; i < n; i++) {
    if (filtro && !filtro(i)) continue;
    const w = W[i];
    if (!w) continue;
    const k = clave(i);
    out.set(k, (out.get(k) || 0) + w);
  }
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
