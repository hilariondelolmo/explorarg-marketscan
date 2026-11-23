// Polígrafo - cuentas que hacen otras páginas del sitio y que la ficha necesita.
//
// Regla de HDO (22/11/2026): todo lo que está en explorarg.com sirve de prueba,
// y eso incluye las cuentas que ya hace otra página, no solo los archivos de
// datos. Acá van las que todavía no tienen una función compartida con su
// página (las que sí la tienen están en src/lib: topes39.js, gestionCuentas.js).
// Cada una dice de qué página es espejo: si allá cambia la fórmula, cambia acá,
// y el banco de prueba (scripts/poligrafo_prueba.mjs) fija las cifras.
//
// No importa ningún JSON: recibe los datos ya leídos.

const serieDe = (lista, id) => new Map((lista?.find((p) => p.id === id)?.serie ?? []).filter(([, v]) => v !== null && v !== undefined));
const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

function mesesEntre(a, b) {
  const out = [];
  let [y, m] = a.split('-').map(Number);
  const [y2, m2] = b.split('-').map(Number);
  while (y < y2 || (y === y2 && m <= m2)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Márgenes del biodiésel en usd por tonelada, mes por mes. Espejo de
 * src/lib/margenes.js (página /margenes, pestaña Biodiésel), con sus opciones
 * por defecto: aceite FAS Minagri y toneladas.
 *   margen = biodiésel oficial (mediana de la Res. 963) - aceite de soja FAS
 *   crack spread 10:9:1 = 0,9 x biodiésel + 0,1 x glicerina - aceite
 * La glicerina sale de Rosario fob; si no cotiza, de USA exw; si no, del precio
 * de venta de Explora, y después de su último mes, ese precio repetido.
 * `ranking` es gasoil_ranking.json. Devuelve { meses, de(mes), promedio(desde, hasta) }.
 */
export function margenesBiodiesel(ranking) {
  if (!ranking?.productos) return null;
  const bio = serieDe(ranking.productos, 'bio_963_m');
  const aceite = serieDe(ranking.comparados, 'aceite_minagri');
  const glicRosario = serieDe(ranking.productos, 'glicerina');
  const glicUsa = serieDe(ranking.comparados, 'glicerina_usa');
  const glicExplora = serieDe(ranking.comparados, 'glicerina_explora');
  const mesesBio = [...bio.keys()].sort();
  const ultimo = [...mesesBio].reverse().find((f) => aceite.has(f));
  if (!mesesBio.length || !ultimo) return null;
  const ultimoExplora = [...glicExplora.keys()].sort().at(-1);
  const glicerina = (f) => glicRosario.get(f) ?? glicUsa.get(f) ?? glicExplora.get(f) ?? (ultimoExplora && f > ultimoExplora ? glicExplora.get(ultimoExplora) : null) ?? null;

  const porMes = new Map();
  for (const f of mesesEntre(mesesBio[0], ultimo)) {
    const b = bio.get(f) ?? null;
    const a = aceite.get(f) ?? null;
    const g = glicerina(f);
    const margen = b !== null && a !== null ? b - a : null;
    const crack = margen !== null && g !== null ? 0.9 * b + 0.1 * g - a : null;
    porMes.set(f, {
      fecha: f,
      bio: b,
      aceite: a,
      glicerina: g,
      margen,
      margenPct: margen !== null && b ? (margen / b) * 100 : null,
      crack,
      crackPct: crack !== null && a ? (crack / a) * 100 : null,
    });
  }
  const meses = [...porMes.keys()];
  /** Promedios simples de cada serie en el intervalo, como las tarjetas de la página. */
  const promedio = (desde, hasta) => {
    const pts = meses.filter((f) => f >= desde && f <= hasta).map((f) => porMes.get(f));
    const de = (k) => media(pts.map((p) => p[k]).filter((x) => x !== null));
    return { bio: de('bio'), aceite: de('aceite'), margen: de('margen'), margenPct: de('margenPct'), crack: de('crack'), crackPct: de('crackPct'), meses: pts.filter((p) => p.margen !== null).length };
  };
  return { meses, primero: meses[0], ultimo, de: (f) => porMes.get(f) ?? null, promedio };
}

/**
 * Las presidencias como las usa la página Márgenes: de diciembre del año en que
 * asume a noviembre del año en que termina, recortadas a los meses con dato.
 */
export function periodosPresidenciales(presidencias, primerMes, ultimoMes) {
  return presidencias
    .filter((p) => !p.hasta || p.hasta >= `${primerMes}-01`)
    .map((p) => {
      const desde = `${p.desde.slice(0, 4)}-12`;
      const hasta = p.hasta ? `${p.hasta.slice(0, 4)}-11` : ultimoMes;
      return { presidente: p.presidente, desde: desde < primerMes ? primerMes : desde, hasta: hasta > ultimoMes ? ultimoMes : hasta };
    })
    .filter((p) => p.desde <= p.hasta);
}

/**
 * Precio de un producto del ranking de precios (página /gas-oil, Precios
 * comparados): promedio de un año y último dato. `ranking` es gasoil_ranking.json.
 * Devuelve { id, nombre, unidad, promedio, mesesDelAnio, ultimo: { fecha, valor } } o null.
 */
export function precioDeReferencia(ranking, id, anio) {
  const p = [...(ranking?.productos ?? []), ...(ranking?.comparados ?? [])].find((x) => x.id === id);
  if (!p) return null;
  const serie = p.serie.filter(([, v]) => v !== null && v !== undefined);
  if (!serie.length) return null;
  const delAnio = serie.filter(([f]) => f.startsWith(`${anio}-`)).map(([, v]) => v);
  const [fecha, valor] = serie[serie.length - 1];
  return { id, nombre: p.nombre, unidad: p.unidad, promedio: media(delAnio), mesesDelAnio: delAnio.length, ultimo: { fecha, valor } };
}

/**
 * Gas oil vendido por sector (página /gas-oil, Mercado hoy): participación de
 * cada sector en un período. `sectores` es go_sectores.json.
 * Devuelve { total, filas: [{ sector, m3, pct, sinCorte }], sinCortePct } (m3 en metros cúbicos).
 */
export function gasoilPorSector(sectores, desde, hasta) {
  const meses = (sectores?.mensual_total ?? []).filter((m) => m.fecha >= desde && m.fecha <= hasta);
  if (!meses.length) return null;
  const sinCorte = new Set(sectores.sectores_sin_corte ?? []);
  const filas = sectores.sectores
    .map((sector) => ({ sector, m3: meses.reduce((s, m) => s + (m[sector] || 0), 0), sinCorte: sinCorte.has(sector) }))
    .filter((f) => f.m3 > 0)
    .sort((a, b) => b.m3 - a.m3);
  const total = filas.reduce((s, f) => s + f.m3, 0);
  for (const f of filas) f.pct = (f.m3 / total) * 100;
  return { total, filas, meses: meses.length, sinCortePct: filas.filter((f) => f.sinCorte).reduce((s, f) => s + f.pct, 0) };
}

/**
 * Ganancia de los mezcladores por mezclar menos biodiésel. Espejo de la página
 * /gas-oil/corte (CorteObligatorio.jsx) con sus opciones por defecto: contra el
 * gas oil importado (CIF), en dólares corrientes y sobre toda la serie.
 *   desplazado = obligatorio - real (cuando falta biodiésel)
 *   reducción  = 10% de la ley 26.093 - obligatorio, desde jul-2021 (ley 27.640)
 *   ganancia   = (desplazado o reducción) x gas oil vendido x (precio del biodiésel - gas oil importado)
 * con los dos precios en dólares por m³. `precioBio` es evidencia.precio_biodiesel
 * (mediana de la Res. 963, en $/ton), `tc` es ranking.tc.
 * Devuelve { desde, hasta, reemplazo, reduccion, total } en dólares, o null.
 */
export function gananciaDeLosMezcladores({ corteMensual, precioBio, tc, importaciones, densidadBio, densidadGo }) {
  if (!corteMensual?.length || !precioBio?.length || !tc?.length || !importaciones?.length) return null;
  const REF_26093 = 0.1;
  const DESDE_27640 = '2021-07';
  const bio = new Map(precioBio.map((x) => [x.fecha, x.mediana]));
  const cambio = new Map(tc);
  const cif = new Map(importaciones.map((m) => [m.fecha, m.ton ? m.cif_usd_ton : null]));
  const filas = corteMensual.filter((m) => m.obligatorio !== null && m.obligatorio !== undefined && m.go_m3 > 0);
  let reemplazo = 0;
  let reduccion = 0;
  let conPrecio = 0;
  let ultimoConPrecio = null;
  for (const m of filas) {
    const t = cambio.get(m.fecha);
    const bioUsd = bio.get(m.fecha) && t ? (bio.get(m.fecha) * densidadBio) / t : null;
    const sust = cif.get(m.fecha) !== null && cif.get(m.fecha) !== undefined ? cif.get(m.fecha) * densidadGo : null;
    if (bioUsd === null || sust === null) continue;
    const dif = bioUsd - sust;
    reemplazo += Math.max(m.obligatorio - m.real, 0) * m.go_m3 * dif;
    reduccion += (m.fecha >= DESDE_27640 ? REF_26093 - m.obligatorio : 0) * m.go_m3 * dif;
    conPrecio += 1;
    ultimoConPrecio = m.fecha;
  }
  if (!conPrecio) return null;
  // `hasta` es el último mes con precio del gas oil importado (la página dice "a ago 2026")
  return { desde: filas[0].fecha, hasta: ultimoConPrecio, reemplazo, reduccion, total: reemplazo + reduccion, meses: conPrecio };
}

/**
 * Precio publicado contra precio de fórmula de la Res. 963/2023. Espejo de la
 * página /gas-oil/biodiesel-963 (Res963.jsx): diferencia = publicado - fórmula,
 * y la acumulada en dólares = Σ diferencia x cupo / tipo de cambio.
 * `res963` es ranking.res963. Devuelve { desde, hasta, meses, porDebajo, iguales, porArriba, acumuladoUsd, ultimo } o null.
 */
export function publicadoContraFormula(res963) {
  if (!res963?.length) return null;
  const filas = res963.filter((x) => x.formula && x.publicado);
  if (!filas.length) return null;
  const ultimo = filas[filas.length - 1];
  return {
    desde: filas[0].fecha,
    hasta: ultimo.fecha,
    meses: filas.length,
    porDebajo: filas.filter((x) => x.publicado < x.formula).length,
    iguales: filas.filter((x) => x.publicado === x.formula).length,
    porArriba: filas.filter((x) => x.publicado > x.formula).length,
    acumuladoUsd: filas.reduce((s, x) => s + (x.cupo && x.tc ? ((x.publicado - x.formula) * x.cupo) / x.tc : 0), 0),
    ultimo: { fecha: ultimo.fecha, publicado: ultimo.publicado, formula: ultimo.formula },
  };
}

