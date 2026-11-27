// Crushing integrado - los valores de un día, listos para la cuenta.
//
// Del conjunto de datos del área reservada ({ campos, filas, parametros }) arma, para un
// día, lo que las pantallas muestran en sus casilleros: cada valor con su nota de origen.
// Los porcentajes (retenciones y rendimientos) van en %, como se muestran; `aEntradas`
// los pasa a fracción y arma el objeto que espera `calcular` (src/lib/crushing.js).
//
// Este archivo no trae precios ni costos: llegan en `datos`.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const diaLargo = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export const diaCorto = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
export const mesCorto = (iso) => (iso ? `${MESES[Number(iso.slice(5, 7)) - 1]}-${iso.slice(0, 4)}` : '');
const entero = (v) => Math.round(v).toLocaleString('es-AR');

/** Los parámetros del modelo que se pueden tocar (costos, rendimientos, gastos y volumen). */
export const PARAMETROS = [
  'rendAceite', 'rendHarina', 'costoMolienda', 'consumoAceite', 'metanolPrecio', 'metanolConsumo', 'otrosCostos', 'glicerina',
  'otrosCoproductos', 'gastoPoroto', 'gastoHarina', 'gastoAceite', 'gastoAceiteLocal', 'gastoBioExpo', 'gastoBioLocal', 'volumen',
];
const EN_PORCIENTO = new Set(['rendAceite', 'rendHarina']);
// de fracción a %, sin arrastrar decimales de más (0,225 -> 22,5)
const aPorciento = (x) => Math.round(x * 1e5) / 1e3;

/**
 * Los valores cargados para un día: { diaUsado, base }, con base[id] = { valor, fecha, nota }.
 * Si ese día no hubo circular se usa el anterior más cercano; si una serie no tiene dato
 * ese día, su último valor anterior, y la nota dice de qué fecha es.
 *
 * `rotuloAceite` y `rotuloBio`: cómo se llama la fuente elegida, para la nota.
 */
export function valoresDelDia(datos, { fecha, posicion = '', fuenteAceite, fuenteBio, rotuloAceite = '', rotuloBio = '' }) {
  const { campos, filas, parametros } = datos;
  const I = Object.fromEntries(campos.map((c, i) => [c, i]));
  let pos = filas.length - 1;
  while (pos > 0 && filas[pos][0] > fecha) pos -= 1;
  const diaUsado = filas[pos][0];

  const al = (campo) => {
    const i = I[campo];
    if (i === undefined) return { valor: null, fecha: null };
    for (let k = pos; k >= 0; k -= 1) if (filas[k][i] != null) return { valor: filas[k][i], fecha: filas[k][0] };
    return { valor: null, fecha: null };
  };
  const nota = (d, texto, mensual = false) => {
    if (d.valor == null) return 'sin dato';
    const cuando = mensual ? mesCorto(d.fecha) : d.fecha === diaUsado ? null : `del ${diaCorto(d.fecha)}`;
    return [texto, cuando].filter(Boolean).join(' · ');
  };

  const base = {};
  for (const prod of ['poroto', 'harina', 'aceite']) {
    const d = al(`${prod}${posicion}`);
    base[prod] = { ...d, nota: nota(d, 'FOB oficial') };
  }
  const aceiteLocal = al(fuenteAceite);
  base.aceiteLocal = { ...aceiteLocal, nota: nota(aceiteLocal, rotuloAceite) };
  const bioFob = al(fuenteBio);
  base.bioFob = { ...bioFob, nota: nota(bioFob, rotuloBio) };
  const bioLocal = al('bio_oficial');
  base.bioLocal = { ...bioLocal, nota: nota(bioLocal, 'precio oficial', true) };
  for (const [id, campo] of [['dexPoroto', 'dex_poroto'], ['dexHarina', 'dex_harina'], ['dexAceite', 'dex_aceite']]) {
    const d = al(campo);
    base[id] = { valor: d.valor == null ? null : aPorciento(d.valor), fecha: d.fecha, nota: d.valor == null ? 'sin dato' : 'vigente ese día' };
  }
  const dexBio = al('dex_bio');
  const tBio = dexBio.valor ?? parametros.dexBio ?? null;
  base.dexBio = { valor: tBio == null ? null : aPorciento(tBio), fecha: dexBio.fecha, nota: 'sobre la base sin el derecho' };
  for (const id of PARAMETROS) {
    const p = parametros[id];
    base[id] = { valor: p == null ? null : EN_PORCIENTO.has(id) ? aPorciento(p) : p, nota: null };
  }
  const metanol = al('metanol_ypf');
  if (metanol.valor != null) base.metanolPrecio.nota = `metanol YPF de ${mesCorto(metanol.fecha)}: ${entero(metanol.valor)}`;
  const glicerina = al('glicerina_explora');
  if (glicerina.valor != null) base.glicerina.nota = `glicerina de Explora de ${mesCorto(glicerina.fecha)}: ${entero(glicerina.valor)} usd/t`;
  return { diaUsado, base };
}

const fraccion = (x) => (x == null ? null : x / 100);

/** De los valores de los casilleros (porcentajes en %) al objeto que espera `calcular`. */
export function aEntradas(v) {
  return {
    poroto: { fob: v.poroto, dex: fraccion(v.dexPoroto) ?? 0, gasto: v.gastoPoroto ?? 0 },
    harina: { fob: v.harina, dex: fraccion(v.dexHarina) ?? 0, gasto: v.gastoHarina ?? 0 },
    aceite: { fob: v.aceite, dex: fraccion(v.dexAceite) ?? 0, gasto: v.gastoAceite ?? 0 },
    aceiteLocal: v.aceiteLocal,
    gastoAceiteLocal: v.gastoAceiteLocal,
    bioFob: v.bioFob,
    dexBio: fraccion(v.dexBio),
    gastoBioExpo: v.gastoBioExpo,
    bioLocal: v.bioLocal,
    gastoBioLocal: v.gastoBioLocal,
    rendAceite: fraccion(v.rendAceite),
    rendHarina: fraccion(v.rendHarina),
    costoMolienda: v.costoMolienda,
    otrosCoproductos: v.otrosCoproductos,
    consumoAceite: v.consumoAceite,
    metanolPrecio: v.metanolPrecio,
    metanolConsumo: v.metanolConsumo,
    otrosCostos: v.otrosCostos,
    glicerina: v.glicerina,
  };
}
