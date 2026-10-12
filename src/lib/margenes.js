/**
 * Márgenes del biodiésel (página /margenes, pestaña Biodiésel; pedido de HDO
 * del 12/10/2026): réplica de las hojas "Margenes BIO Inicio" y "CRACK SPREAD
 * BIO INICIAL" del workbook Tableau 03 "MARKET & INDUSTRY - MARGEN BIODIESEL".
 *
 * Series mensuales en usd/ton de gasoil_ranking.json (Master data):
 *  - biodiésel: precio mediana de la Res. 963 ÷ TC ("Biodiesel corte obligatorio")
 *  - aceite FAS Minagri: FOB oficial SAGyP × (1 - retención), día a día y promediado
 *  - aceite FAS JJ: J.J. Hinrichsen FAS Rosario vendedor desde mar-2023; antes, el promedio
 *  - glicerina: Rosario fob (F.O. Licht) cuando cotiza; si no, USA exw (F.O. Licht);
 *    si no, el precio de venta de Explora (Reporte de Gestión; decisión de HDO del
 *    12/10/2026); después del último mes de Explora, ese precio repetido (provisorio).
 *
 * Fórmulas del workbook, por tonelada: margen = biodiésel - aceite; crack spread
 * 10:9:1 = 0,9 × biodiésel + 0,1 × glicerina - aceite; crack % = crack ÷ aceite;
 * acumulado = (crack del mes - crack del primer mes) ÷ |crack del primer mes|.
 * Otras unidades: cada precio pasa a usd/m³ con su densidad y de ahí a la unidad.
 */
import { PRODUCTOS, COMPARADOS, DENSIDAD_BIO } from './gasoil.js';
import { PRESIDENCIAS } from './gestiones.js';

const mapa = (lista, id) => new Map(lista.find((p) => p.id === id)?.serie || []);
const ficha = (lista, id) => lista.find((p) => p.id === id) || null;

// Unidades, las mismas de Precios comparados y el Ranking: cuántas hay en un m³
// (ton: la densidad del producto, en ton/m³)
export const UNIDADES = [
  { id: 'ton', label: 'ton', porM3: (d) => d },
  { id: 'm3', label: 'm³', porM3: () => 1 },
  { id: 'l', label: 'l', porM3: () => 1000 },
  { id: 'bbl', label: 'bbl', porM3: () => 6.2898 },
  { id: 'gal', label: 'gal', porM3: () => 264.172 },
];
// Densidades (ton/m³): las del workbook 03 (biodiésel 0,885; aceite 0,92; glicerina 1,26)
export const DENSIDADES = { bio: DENSIDAD_BIO, aceite: 0.92, glicerina: 1.26 };
// Crack spread 10:9:1: diez de aceite dan nueve de biodiésel y una de glicerina
export const RATIO = { bio: 0.9, glicerina: 0.1 };

export const ACEITES = [
  { id: 'minagri', label: 'FAS Minagri', nombre: 'Aceite de soja FAS Minagri', enFrase: 'aceite de soja FAS Minagri', detalle: 'FOB oficial de la SAGyP menos la retención del aceite' },
  { id: 'jj', label: 'FAS JJ', nombre: 'Aceite de soja FAS Rosario (J.J. Hinrichsen)', enFrase: 'aceite de soja FAS Rosario (J.J. Hinrichsen)', detalle: 'FAS Rosario vendedor desde mar-2023; antes, el promedio comprador-vendedor' },
];

export const BIO = mapa(PRODUCTOS, 'bio_963_m');
const aceiteJJ = new Map(mapa(PRODUCTOS, 'aceite_fas'));
for (const [f, v] of mapa(PRODUCTOS, 'aceite_fas_vendedor')) aceiteJJ.set(f, v);
export const ACEITE = { minagri: mapa(COMPARADOS, 'aceite_minagri'), jj: aceiteJJ };

const glicRosario = mapa(PRODUCTOS, 'glicerina');
const glicUsa = mapa(COMPARADOS, 'glicerina_usa');
const glicExplora = mapa(COMPARADOS, 'glicerina_explora');
export const FICHA_GLICERINA = {
  rosario: ficha(PRODUCTOS, 'glicerina'), usa: ficha(COMPARADOS, 'glicerina_usa'), explora: ficha(COMPARADOS, 'glicerina_explora'),
};
export const FUENTES_GLICERINA = {
  rosario: 'Rosario fob, F.O. Licht',
  usa: 'USA exw, F.O. Licht',
  explora: 'precio de venta de Explora',
  provisorio: 'último precio de Explora, provisorio',
};

/** Meses entre dos 'YYYY-MM', ambos incluidos. */
function mesesEntre(a, b) {
  const out = [];
  let [y, m] = a.split('-').map(Number);
  const [y2, m2] = b.split('-').map(Number);
  while (y < y2 || (y === y2 && m <= m2)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

// Del primer mes con precio de biodiésel (feb-2010, decisión de HDO: meses
// completos, no el 13/03/2010 del workbook) al último con biodiésel y aceite.
const mesesBio = [...BIO.keys()].sort();
export const PRIMER_MES = mesesBio[0];
export const ULTIMO_MES = [...mesesBio].reverse().find((f) => ACEITE.minagri.has(f)) || mesesBio.at(-1);
export const MESES = mesesEntre(PRIMER_MES, ULTIMO_MES);
export const IDX = new Map(MESES.map((f, i) => [f, i]));

// Glicerina por mes: valor en usd/ton y de dónde salió
export const GLICERINA = new Map();
{
  const ultimoExplora = [...glicExplora.keys()].sort().at(-1);
  for (const f of MESES) {
    if (glicRosario.has(f)) GLICERINA.set(f, { valor: glicRosario.get(f), fuente: 'rosario' });
    else if (glicUsa.has(f)) GLICERINA.set(f, { valor: glicUsa.get(f), fuente: 'usa' });
    else if (glicExplora.has(f)) GLICERINA.set(f, { valor: glicExplora.get(f), fuente: 'explora' });
    else if (ultimoExplora && f > ultimoExplora) GLICERINA.set(f, { valor: glicExplora.get(ultimoExplora), fuente: 'provisorio' });
  }
}

// Presidencias como intervalo, con la regla del sitio (diciembre del año que
// asume a noviembre del que termina) recortada a los meses de esta página
export const PERIODOS = PRESIDENCIAS.map((p) => {
  const desde = `${p.desde.slice(0, 4)}-12`;
  const hasta = p.hasta ? `${p.hasta.slice(0, 4)}-11` : ULTIMO_MES;
  return { id: p.presidente, nombre: p.corto, desde: desde < PRIMER_MES ? PRIMER_MES : desde, hasta: hasta > ULTIMO_MES ? ULTIMO_MES : hasta };
});

/** usd/ton → usd por la unidad elegida, con la densidad del producto. */
export function convertir(vTon, densidad, unidad) {
  if (vTon == null) return null;
  return (vTon * densidad) / unidad.porM3(densidad);
}

/**
 * Serie mensual del intervalo en la unidad elegida: precios, margen sobre
 * aceite, crack spread 10:9:1 (valor, % del aceite y variación acumulada
 * desde el primer mes con crack spread) y los promedios del intervalo de cada
 * serie (las tarjetas de Resultado muestran los del período, HDO 12/10/2026).
 */
export function calcular({ aceiteId, unidadId, desde, hasta }) {
  const unidad = UNIDADES.find((u) => u.id === unidadId) || UNIDADES[0];
  const A = ACEITE[aceiteId] || ACEITE.minagri;
  const pts = [];
  for (const f of MESES) {
    if (f < desde || f > hasta) continue;
    const bio = convertir(BIO.get(f) ?? null, DENSIDADES.bio, unidad);
    const aceite = convertir(A.get(f) ?? null, DENSIDADES.aceite, unidad);
    const g = GLICERINA.get(f);
    const glic = g ? convertir(g.valor, DENSIDADES.glicerina, unidad) : null;
    const margen = bio != null && aceite != null ? bio - aceite : null;
    const crack = margen != null && glic != null ? RATIO.bio * bio + RATIO.glicerina * glic - aceite : null;
    pts.push({
      fecha: f, bio, aceite, glic, glicFuente: g?.fuente ?? null, margen,
      margenPct: margen != null && bio ? (margen / bio) * 100 : null,
      crack, crackPct: crack != null && aceite ? (crack / aceite) * 100 : null, crackAcum: null,
    });
  }
  const base = pts.find((p) => p.crack != null) || null;
  if (base && base.crack !== 0) for (const p of pts) p.crackAcum = p.crack != null ? ((p.crack - base.crack) / Math.abs(base.crack)) * 100 : null;
  const promedio = (k) => {
    const v = pts.map((p) => p[k]).filter((x) => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const conMargen = pts.filter((p) => p.margen != null);
  const conCrack = pts.filter((p) => p.crack != null);
  return {
    pts, unidad, rotuloUnidad: `usd/${unidad.label}`,
    promedios: { bio: promedio('bio'), aceite: promedio('aceite'), margen: promedio('margen'), margenPct: promedio('margenPct'), crack: promedio('crack'), crackPct: promedio('crackPct') },
    primero: conMargen[0] || null, ultimo: conMargen.at(-1) || null,
    primerCrack: conCrack[0] || null, ultimoCrack: conCrack.at(-1) || null,
    meses: conMargen.length, mesesCrack: conCrack.length,
  };
}
