// Analista (Agente Explorarg) - todos los precios que tiene el sitio.
//
// Pedido de HDO (27/11/2026): todo lo que está en las bases de explorarg tiene que
// poder pedirse. Hasta ese día el Analista conocía ocho precios (los del Polígrafo);
// acá están esos ocho, con el mismo nombre, y todas las demás series de precio que
// publica el sitio: el gas oil mayorista y de estaciones por grado, las naftas, el
// bioetanol de caña y de maíz, los impuestos por separado, el biodiésel por categoría
// de empresa y los de exportación, los crudos, el diésel de referencia, el aceite de
// soja, el metanol y la glicerina.
//
// Cada producto dice de dónde sale (`de`), en qué unidad viene (`unidad`) y a qué
// familia de densidad pertenece (`densidad`), para poder pasarlo a cualquiera de las
// unidades del menú. Las densidades son las del tablero Ranking de precios del sitio.
//
// Si se suma una serie de precio a los JSON del sitio, se suma acá: el banco de prueba
// (scripts/analista_prueba.mjs) falla mientras haya una serie sin producto.

import { PRODUCTOS as BASE, EQUIVALENCIAS as EQUIVALENCIAS_BASE, FUENTE_PRECIOS } from '../poligrafo/catalogo.js';
import { margenesBiodiesel } from '../poligrafo/sitio.js';

export const FUENTE_RANKING =
  'Fuente: Secretaría de Energía, Secretaría de Agricultura, EIA, F.O. Licht, J.J. Hinrichsen, YPF y Explora, según la serie, procesados por www.explorarg.com.';

const TABLEROS = {
  precios: { etiqueta: 'Gas Oil - Biodiésel vs. gas oil', ruta: '/gas-oil/biodiesel', origen: FUENTE_PRECIOS },
  ventas: { etiqueta: 'Gas Oil - Ventas, precio', ruta: '/gas-oil/canales', origen: FUENTE_PRECIOS },
  ranking: { etiqueta: 'Gas Oil - Ranking de precios', ruta: '/gas-oil/ranking', origen: FUENTE_RANKING },
};

// Los grupos del menú, en el orden en que se muestran.
export const GRUPOS_PRODUCTO = {
  biodiesel: 'Biodiésel',
  gasoil: 'Gas oil',
  naftas: 'Naftas y bioetanol',
  impuestos: 'Impuestos del gas oil',
  crudo: 'Petróleo crudo',
  diesel: 'Diésel en el mundo',
  aceite: 'Aceite de soja',
  insumos: 'Metanol y glicerina',
};

const RES_1104 = 'del relevamiento de la Secretaría de Energía (Res. 1104/2004), ponderado por volumen';
const REGALIAS = 'del informe de regalías de crudo de la Secretaría de Energía.';

const crudo = (id, nombre, importado = false) => ({
  etiqueta: `crudo ${nombre}`,
  menu: importado ? `Crudo ${nombre}: referencia internacional` : `Crudo ${nombre}: crudo argentino`,
  nota: `Crudo ${nombre}: precio ${REGALIAS}`,
  grupo: 'crudo',
  unidad: 'usd/m3',
  densidad: 'crudo',
  tablero: 'ranking',
  de: { ranking: id },
});

// Una serie que viene en dólares por tonelada de una fuente de mercado.
const externo = (grupo, densidad, id, etiqueta, detalle, fuente = 'F.O. Licht', energia = null) => ({
  etiqueta,
  menu: `${detalle} (${fuente})`,
  nota: `${etiqueta.charAt(0).toUpperCase()}${etiqueta.slice(1)}: ${detalle.charAt(0).toLowerCase()}${detalle.slice(1)}. Fuente: ${fuente}.`,
  grupo,
  unidad: 'usd/t',
  densidad,
  tablero: 'ranking',
  de: { ranking: id },
  ...(energia ? { energia } : {}),
});

// `grado` 2 o 3; `canal` mayorista (todo el canal mayorista) o publico (minorista, al público);
// `precio` surtidor, con_imp o sin_imp: las tres columnas de precio del relevamiento.
const relevado = (grado, canal, precio, etiqueta, menu, nota, extra = {}) => ({
  etiqueta,
  menu,
  nota,
  grupo: 'gasoil',
  unidad: '$/l',
  densidad: 'gasoil',
  energia: 'gasoil',
  tablero: 'ventas',
  de: { relevamiento: { grado, canal, precio } },
  ...extra,
});

const local = (grupo, densidad, tablero) => ({ grupo, unidad: '$/l', densidad, tablero });

/** Todos los productos con precio. Los ocho primeros nombres son los del Polígrafo y no cambian. */
export const PRODUCTOS = {
  // ------------------------------------------------------------------ biodiésel
  biodiesel: { ...BASE.biodiesel, ...local('biodiesel', 'bio', 'precios'), de: { base: 'biodiesel' } },
  biodiesel_grande_integrada: {
    etiqueta: 'biodiésel de las grandes integradas',
    menu: 'Biodiésel: el precio oficial que regía para las empresas grandes integradas (hasta 2023 la Secretaría de Energía fijaba un precio por tamaño de empresa)',
    nota: 'Biodiésel de las grandes integradas: precio oficial de la Secretaría de Energía para esa categoría de empresa, pasado a dólares con el tipo de cambio del mes.',
    grupo: 'biodiesel',
    unidad: 'usd/t',
    densidad: 'bio',
    energia: 'biodiesel',
    tablero: 'ranking',
    de: { ranking: 'bio_963_gi' },
  },
  biodiesel_grande_no_integrada: {
    etiqueta: 'biodiésel de las grandes no integradas',
    menu: 'Biodiésel: el precio oficial que regía para las empresas grandes no integradas',
    nota: 'Biodiésel de las grandes no integradas: precio oficial de la Secretaría de Energía para esa categoría de empresa, pasado a dólares con el tipo de cambio del mes.',
    grupo: 'biodiesel',
    unidad: 'usd/t',
    densidad: 'bio',
    energia: 'biodiesel',
    tablero: 'ranking',
    de: { ranking: 'bio_963_gni' },
  },
  biodiesel_pequena: {
    etiqueta: 'biodiésel de las pequeñas',
    menu: 'Biodiésel: el precio oficial que regía para las empresas pequeñas',
    nota: 'Biodiésel de las pequeñas: precio oficial de la Secretaría de Energía para esa categoría de empresa, pasado a dólares con el tipo de cambio del mes.',
    grupo: 'biodiesel',
    unidad: 'usd/t',
    densidad: 'bio',
    energia: 'biodiesel',
    tablero: 'ranking',
    de: { ranking: 'bio_963_p' },
  },
  biodiesel_formula: {
    etiqueta: 'biodiésel por fórmula',
    menu: 'Biodiésel por fórmula: el precio que da la fórmula de la Resolución 963/2023, para comparar con el publicado (desde noviembre de 2023)',
    nota: 'Biodiésel por fórmula: el precio que resulta de aplicar la fórmula de la Resolución 963/2023, calculado por Explora. El precio oficial es el que publica la Secretaría de Energía.',
    grupo: 'biodiesel',
    unidad: '$/t',
    densidad: 'bio',
    energia: 'biodiesel',
    tablero: 'precios',
    de: { res963: 'formula' },
  },
  biodiesel_fob_rosario: externo('biodiesel', 'bio', 'sme_arg', 'biodiésel de exportación FOB Rosario', 'Biodiésel argentino de exportación (SME), FOB Rosario', 'F.O. Licht', 'biodiesel'),
  biodiesel_fob_rosario_spot: externo('biodiesel', 'bio', 'jj_bio_fob', 'biodiésel de exportación spot FOB Rosario', 'Biodiésel argentino de exportación, precio spot FOB Rosario', 'J.J. Hinrichsen', 'biodiesel'),
  biodiesel_fame_europa: externo('biodiesel', 'bio', 'fame_ara', 'biodiésel FAME en Europa', 'Biodiésel FAME en Europa, FOB ARA (Ámsterdam, Róterdam y Amberes)', 'F.O. Licht', 'biodiesel'),
  biodiesel_pme_europa: externo('biodiesel', 'bio', 'pme_ara', 'biodiésel de palma en Europa', 'Biodiésel de palma (PME) en Europa, FOB ARA', 'F.O. Licht', 'biodiesel'),
  biodiesel_sme_golfo: externo('biodiesel', 'bio', 'sme_usg', 'biodiésel de soja en el Golfo de Estados Unidos', 'Biodiésel de soja (SME), FOB Golfo de Estados Unidos', 'F.O. Licht', 'biodiesel'),

  // ------------------------------------------------------------------ gas oil
  gasoil_fosil: { ...BASE.gasoil_fosil, ...local('gasoil', 'gasoil', 'precios'), de: { base: 'gasoil_fosil' }, sinMesesAnomalos: true },
  gasoil_mayorista: relevado(
    2, 'mayorista', 'sin_imp', 'gas oil mayorista',
    'Gas oil mayorista: el grado 2 en el canal mayorista, sin impuestos, tal como se vende (con el biodiésel que lleva mezclado)',
    `Gas oil mayorista: grado 2 en el canal mayorista, sin impuestos, ${RES_1104}. Es el precio del gas oil tal como se vende, con el biodiésel que lleva mezclado.`
  ),
  gasoil_mayorista_con_impuestos: relevado(
    2, 'mayorista', 'con_imp', 'gas oil mayorista con impuestos',
    'Gas oil grado 2 en el canal mayorista, con impuestos',
    `Gas oil mayorista con impuestos: grado 2 en el canal mayorista, ${RES_1104}.`,
    { conImpuestos: true }
  ),
  gasoil_g3_mayorista: relevado(
    3, 'mayorista', 'sin_imp', 'gas oil grado 3 mayorista',
    'Gas oil grado 3 (el premium) en el canal mayorista, sin impuestos',
    `Gas oil grado 3 mayorista: canal mayorista, sin impuestos, ${RES_1104}.`
  ),
  gasoil_g3_mayorista_con_impuestos: relevado(
    3, 'mayorista', 'con_imp', 'gas oil grado 3 mayorista con impuestos',
    'Gas oil grado 3 (el premium) en el canal mayorista, con impuestos',
    `Gas oil grado 3 mayorista con impuestos: canal mayorista, ${RES_1104}.`,
    { conImpuestos: true }
  ),
  gasoil_surtidor: { ...BASE.gasoil_surtidor, ...local('gasoil', 'gasoil', 'precios'), de: { base: 'gasoil_surtidor' }, sinMesesAnomalos: true },
  gasoil_g3_surtidor: relevado(
    3, 'publico', 'surtidor', 'gas oil grado 3 en el surtidor',
    'Gas oil grado 3 (el premium) en el surtidor, con impuestos',
    `Gas oil grado 3 en el surtidor: al público, con impuestos, ${RES_1104}.`,
    { conImpuestos: true }
  ),
  gasoil_estaciones_sin_impuestos: relevado(
    2, 'publico', 'sin_imp', 'gas oil en estaciones sin impuestos',
    'Gas oil grado 2 que venden las estaciones al público, sin impuestos',
    `Gas oil en estaciones sin impuestos: grado 2 al público (canal minorista), sin impuestos, ${RES_1104}.`
  ),
  gasoil_g3_estaciones_sin_impuestos: relevado(
    3, 'publico', 'sin_imp', 'gas oil grado 3 en estaciones sin impuestos',
    'Gas oil grado 3 que venden las estaciones al público, sin impuestos',
    `Gas oil grado 3 en estaciones sin impuestos: al público (canal minorista), sin impuestos, ${RES_1104}.`
  ),
  gasoil_estaciones_con_impuestos: relevado(
    2, 'publico', 'con_imp', 'gas oil en estaciones con impuestos',
    'Gas oil grado 2 que venden las estaciones al público: el precio con impuestos que declaran (no es el del cartel del surtidor)',
    `Gas oil en estaciones con impuestos: grado 2 al público (canal minorista), precio con impuestos que declaran las estaciones, ${RES_1104}. El precio del cartel es el del surtidor.`,
    { conImpuestos: true }
  ),
  gasoil_g3_estaciones_con_impuestos: relevado(
    3, 'publico', 'con_imp', 'gas oil grado 3 en estaciones con impuestos',
    'Gas oil grado 3 que venden las estaciones al público: el precio con impuestos que declaran (no es el del cartel del surtidor)',
    `Gas oil grado 3 en estaciones con impuestos: al público (canal minorista), precio con impuestos que declaran las estaciones, ${RES_1104}. El precio del cartel es el del surtidor.`,
    { conImpuestos: true }
  ),
  gasoil_importado: { ...BASE.gasoil_importado, ...local('gasoil', 'gasoil', 'precios'), de: { base: 'gasoil_importado' } },
  gasoil_importado_fob: {
    etiqueta: 'gas oil importado en origen',
    menu: 'Gas oil importado en origen (FOB): antes del flete y el seguro',
    nota: 'Gas oil importado en origen: valor FOB de los despachos de importación del mes, antes del flete y el seguro.',
    grupo: 'gasoil',
    unidad: 'usd/t',
    densidad: 'gasoil',
    energia: 'gasoil',
    tablero: 'precios',
    de: { importaciones: 'fob_usd_ton' },
  },

  // ------------------------------------------------------------------ naftas y bioetanol
  bioetanol: { ...BASE.bioetanol, ...local('naftas', 'bioetanol', 'precios'), de: { base: 'bioetanol' } },
  bioetanol_cana: {
    etiqueta: 'bioetanol de caña',
    menu: 'Bioetanol de caña de azúcar: el precio oficial para el corte obligatorio',
    nota: 'Bioetanol de caña: precio oficial para el corte obligatorio que publica la Secretaría de Energía.',
    ...local('naftas', 'bioetanol', 'precios'),
    energia: 'bioetanol',
    de: { base: 'bioetanolCana' },
  },
  bioetanol_maiz: {
    etiqueta: 'bioetanol de maíz',
    menu: 'Bioetanol de maíz: el precio oficial para el corte obligatorio',
    nota: 'Bioetanol de maíz: precio oficial para el corte obligatorio que publica la Secretaría de Energía.',
    ...local('naftas', 'bioetanol', 'precios'),
    energia: 'bioetanol',
    de: { base: 'bioetanolMaiz' },
  },
  nafta_fosil: { ...BASE.nafta_fosil, ...local('naftas', 'naftas', 'precios'), de: { base: 'nafta_fosil' } },
  nafta_mayorista: {
    etiqueta: 'nafta súper mayorista',
    menu: 'Nafta súper en el canal mayorista, sin impuestos, tal como se vende (con el bioetanol que lleva mezclado)',
    nota: `Nafta súper mayorista: canal mayorista, sin impuestos, ${RES_1104}. Es la nafta tal como se vende, con el bioetanol que lleva mezclado.`,
    ...local('naftas', 'naftas', 'precios'),
    energia: 'nafta',
    de: { base: 'naftaMezcla' },
  },
  nafta_surtidor: { ...BASE.nafta_surtidor, ...local('naftas', 'naftas', 'precios'), de: { base: 'nafta_surtidor' } },
  nafta_premium_mayorista: {
    etiqueta: 'nafta premium mayorista',
    menu: 'Nafta premium en el canal mayorista, sin impuestos',
    nota: `Nafta premium mayorista: canal mayorista, sin impuestos, ${RES_1104}.`,
    ...local('naftas', 'naftas', 'precios'),
    energia: 'nafta',
    de: { naftas: 'premium_mayorista_sin_imp' },
  },
  nafta_premium_surtidor: {
    etiqueta: 'nafta premium en el surtidor',
    menu: 'Nafta premium en el surtidor, con impuestos',
    nota: `Nafta premium en el surtidor: al público, con impuestos, ${RES_1104}.`,
    ...local('naftas', 'naftas', 'precios'),
    energia: 'nafta',
    conImpuestos: true,
    de: { naftas: 'premium_surtidor' },
  },

  // ------------------------------------------------------------------ impuestos del gas oil
  impuestos_gasoil: { ...BASE.impuestos_gasoil, ...local('impuestos', 'gasoil', 'precios'), nombreSolo: 'Impuestos', de: { base: 'impuestos_gasoil' } },
  icl_gasoil: {
    etiqueta: 'impuesto a los combustibles líquidos del gas oil',
    menu: 'Impuesto a los combustibles líquidos (ICL) que paga el litro de gas oil, tarifa general',
    nota: 'Impuesto a los combustibles líquidos (ICL) del gas oil, tarifa general, según la Secretaría de Hacienda. El biodiésel no lo paga.',
    ...local('impuestos', 'gasoil', 'precios'),
    nombreSolo: 'Impuesto a los combustibles líquidos',
    soloNivel: true,
    de: { base: 'icl' },
  },
  icl_gasoil_zona_exenta: {
    etiqueta: 'impuesto a los combustibles líquidos del gas oil en las zonas con tarifa reducida',
    menu: 'Impuesto a los combustibles líquidos (ICL) del gas oil en las zonas con tratamiento diferencial (tarifa reducida)',
    nota: 'Impuesto a los combustibles líquidos (ICL) del gas oil, tarifa reducida de las zonas con tratamiento diferencial, según la Secretaría de Hacienda.',
    ...local('impuestos', 'gasoil', 'precios'),
    nombreSolo: 'Impuesto a los combustibles líquidos, tarifa reducida,',
    soloNivel: true,
    de: { impuestos: 'icl_exento' },
  },
  ico2_gasoil: {
    etiqueta: 'impuesto al dióxido de carbono del gas oil',
    menu: 'Impuesto al dióxido de carbono (ICO2) que paga el litro de gas oil',
    nota: 'Impuesto al dióxido de carbono (ICO2) del gas oil, según la Secretaría de Hacienda. El biodiésel no lo paga.',
    ...local('impuestos', 'gasoil', 'precios'),
    nombreSolo: 'Impuesto al dióxido de carbono',
    soloNivel: true,
    de: { base: 'ico2' },
  },

  // ------------------------------------------------------------------ petróleo crudo
  crudo_brent: crudo('brent', 'Brent', true),
  crudo_wti: crudo('wti', 'WTI', true),
  crudo_medanito: crudo('medanito', 'Medanito'),
  crudo_escalante: crudo('escalante', 'Escalante'),
  crudo_canadon_seco: crudo('canadon_seco', 'Cañadón Seco'),
  crudo_magallanes: crudo('magallanes', 'Magallanes'),
  crudo_maria_ines: crudo('maria_ines', 'María Inés'),
  crudo_mendoza_norte: crudo('mendoza_norte', 'Mendoza Norte'),
  crudo_noroeste: crudo('noroeste', 'Noroeste'),
  crudo_san_sebastian: crudo('san_sebastian', 'San Sebastián'),

  // ------------------------------------------------------------------ diésel en el mundo
  diesel_estados_unidos: externo('diesel', 'gasoil', 'diesel_usa', 'diésel en Estados Unidos', 'Diésel en Estados Unidos, precio al consumidor', 'EIA', 'gasoil'),
  diesel_europa: externo('diesel', 'gasoil', 'diesel_nwe', 'diésel en Europa', 'Diésel CIF Noroeste de Europa', 'F.O. Licht', 'gasoil'),
  diesel_nueva_york: externo('diesel', 'gasoil', 'diesel_ulsd', 'diésel en Nueva York', 'Diésel de ultra bajo azufre (ULSD), precio spot en el puerto de Nueva York', 'EIA', 'gasoil'),
  heating_oil_nymex: externo('diesel', 'gasoil', 'diesel_nymex', 'heating oil del Nymex', 'Heating oil N° 2 del Nymex, puerto de Nueva York', 'F.O. Licht', 'gasoil'),

  // ------------------------------------------------------------------ aceite de soja
  aceite_fas: externo('aceite', 'aceite', 'aceite_fas', 'aceite de soja FAS Rosario', 'Aceite de soja en el mercado local, FAS Rosario', 'J.J. Hinrichsen'),
  aceite_fas_vendedor: externo('aceite', 'aceite', 'aceite_fas_vendedor', 'aceite de soja FAS Rosario punta vendedora', 'Aceite de soja FAS Rosario, punta vendedora, desde marzo de 2023', 'J.J. Hinrichsen'),
  aceite_fas_teorico: {
    etiqueta: 'aceite de soja FAS teórico oficial',
    menu: 'Aceite de soja FAS teórico: el FOB oficial menos la retención (Secretaría de Agricultura)',
    nota: 'Aceite de soja FAS teórico oficial: el FOB oficial de la Secretaría de Agricultura menos el derecho de exportación, día por día y promediado en el mes. Es el aceite con que la página Márgenes calcula el margen del biodiésel.',
    grupo: 'aceite',
    unidad: 'usd/t',
    densidad: 'aceite',
    tablero: 'ranking',
    // La serie de Precios comparados y de Márgenes. El Ranking de precios trae otra casi igual (aceite_fas_minagri,
    // de Master data), que difiere en unos pocos meses: se usa una sola, para que biodiésel menos aceite dé el margen.
    de: { comparado: 'aceite_minagri' },
  },
  aceite_fob_oficial: {
    etiqueta: 'aceite de soja FOB oficial',
    menu: 'Aceite de soja FOB oficial de la Secretaría de Agricultura',
    nota: 'Aceite de soja FOB oficial que publica la Secretaría de Agricultura.',
    grupo: 'aceite',
    unidad: 'usd/t',
    densidad: 'aceite',
    tablero: 'ranking',
    de: { ranking: 'aceite_fob_sagyp' },
  },
  aceite_fob_up_river: externo('aceite', 'aceite', 'aceite_upriver', 'aceite de soja FOB Up River', 'Aceite de soja FOB puertos del Paraná (Up River)'),

  // ------------------------------------------------------------------ metanol y glicerina
  metanol_ypf: externo('insumos', 'metanol', 'metanol_ypf', 'metanol de YPF', 'Metanol de YPF en el mercado local, desde 2019', 'YPF'),
  metanol_exportacion: {
    etiqueta: 'metanol argentino de exportación',
    menu: 'Metanol argentino de exportación (FOB), según los despachos de exportación',
    nota: 'Metanol argentino de exportación: valor FOB de los despachos de exportación del mes.',
    grupo: 'insumos',
    unidad: 'usd/t',
    densidad: 'metanol',
    tablero: 'ranking',
    de: { evidencia: ['metanol', 'fob_export'] },
  },
  metanol_estados_unidos: externo('insumos', 'metanol', 'metanol_usa', 'metanol en Estados Unidos', 'Metanol en Estados Unidos, precio de contrato de Methanex'),
  metanol_europa: externo('insumos', 'metanol', 'metanol_eu', 'metanol en Europa', 'Metanol en Europa, precio de contrato de Methanex'),
  glicerina_rosario: externo('insumos', 'glicerina', 'glicerina', 'glicerina cruda FOB Rosario', 'Glicerina cruda al 80%, FOB Rosario'),
  glicerina_estados_unidos: {
    etiqueta: 'glicerina cruda en Estados Unidos',
    menu: 'Glicerina cruda al 80% en Estados Unidos, puesta en fábrica (hasta julio de 2022)',
    nota: 'Glicerina cruda en Estados Unidos, al 80%, puesta en fábrica. Fuente: F.O. Licht.',
    grupo: 'insumos',
    unidad: 'usd/t',
    densidad: 'glicerina',
    tablero: 'ranking',
    de: { comparado: 'glicerina_usa' },
  },
  glicerina_explora: {
    etiqueta: 'glicerina de Explora',
    menu: 'Glicerina al 80% de Explora: su precio de venta (desde 2022)',
    nota: 'Glicerina de Explora, al 80%: precio de venta de Explora, ponderado de ventas locales y de exportación.',
    grupo: 'insumos',
    unidad: 'usd/t',
    densidad: 'glicerina',
    tablero: 'ranking',
    de: { comparado: 'glicerina_explora' },
  },
};

export const tableroDe = (producto) => TABLEROS[PRODUCTOS[producto]?.tablero] ?? TABLEROS.precios;

// Cómo se comparan dos precios. El Analista suma la tonelada: el aceite, el metanol y la
// glicerina se negocian por tonelada, no por litro.
export const EQUIVALENCIAS = {
  ...EQUIVALENCIAS_BASE,
  por_tonelada: { etiqueta: 'por tonelada', menu: 'Tonelada contra tonelada' },
};

// ---------------------------------------------------------------- unidades

// En qué se muestra un precio. `moneda`: ars o usd; `por`: l, t, m3 o bbl.
export const UNIDADES = {
  pesos_litro: { etiqueta: 'Pesos por litro', simbolo: '$/l', moneda: 'ars', por: 'l', porTxt: 'litro' },
  dolares_litro: { etiqueta: 'Dólares por litro', simbolo: 'US$/l', moneda: 'usd', por: 'l', porTxt: 'litro' },
  pesos_tonelada: { etiqueta: 'Pesos por tonelada', simbolo: '$/t', moneda: 'ars', por: 't', porTxt: 'tonelada' },
  dolares_tonelada: { etiqueta: 'Dólares por tonelada', simbolo: 'US$/t', moneda: 'usd', por: 't', porTxt: 'tonelada' },
  dolares_m3: { etiqueta: 'Dólares por metro cúbico', simbolo: 'US$/m³', moneda: 'usd', por: 'm3', porTxt: 'metro cúbico' },
  dolares_barril: { etiqueta: 'Dólares por barril', simbolo: 'US$/bbl', moneda: 'usd', por: 'bbl', porTxt: 'barril' },
};

// la unidad del menú que coincide con la unidad en que viene cada serie
const UNIDAD_DE_ORIGEN = { '$/l': 'pesos_litro', '$/t': 'pesos_tonelada', 'usd/t': 'dolares_tonelada', 'usd/m3': 'dolares_m3' };
const ORIGEN = {
  '$/l': { moneda: 'ars', por: 'l' },
  '$/t': { moneda: 'ars', por: 't' },
  'usd/t': { moneda: 'usd', por: 't' },
  'usd/m3': { moneda: 'usd', por: 'm3' },
};

/**
 * La unidad que se usa cuando el pedido no la dice: la de las series, si todas vienen en
 * la misma (pesos por litro para los combustibles del país); si se mezclan precios del
 * país con internacionales, dólares por tonelada, como el Ranking de precios del sitio.
 */
export function unidadPorDefecto(productos) {
  const propias = [...new Set(productos.filter((k) => PRODUCTOS[k]).map((k) => UNIDAD_DE_ORIGEN[PRODUCTOS[k].unidad]))];
  if (!propias.length) return 'pesos_litro';
  return propias.length === 1 ? propias[0] : 'dolares_tonelada';
}

const BARRILES_POR_M3 = 6.2898;
const TXT_DENSIDAD = { gasoil: 'gas oil y diésel', bio: 'biodiésel', naftas: 'naftas', crudo: 'crudos', aceite: 'aceite de soja', metanol: 'metanol', glicerina: 'glicerina' };

// Meses sin precios de gas oil en todo el sitio (decisión de HDO del 05/10/2026): el
// relevamiento trae valores anómalos. Es la misma lista que MESES_ANOMALOS de src/lib/gasoil.js
// (ese archivo importa los JSON y no corre fuera del navegador; el banco de prueba coteja las dos).
export const MESES_SIN_PRECIO_DE_GASOIL = ['2010-10', '2011-04', '2011-06', '2013-06', '2013-07', '2015-08'];

// ---------------------------------------------------------------- las series

const preparados = new WeakMap();

/**
 * Las series de precio de un contexto, armadas una sola vez: { serie(id), tc, densidades }.
 * `serie(id)` es un Map mes -> valor en la unidad en que viene el producto.
 */
function preparar(ctx) {
  if (preparados.has(ctx)) return preparados.get(ctx);
  const f = ctx.fuentesPrecio ?? {};
  const P = ctx.precios;
  const ranking = f.gasoilRanking ?? {};
  const anomalos = new Set(MESES_SIN_PRECIO_DE_GASOIL);
  const sinAnomalos = (m) => new Map([...m].filter(([mes]) => !anomalos.has(mes)));
  const tabla = (filas, clave) => new Map((filas ?? []).filter((x) => typeof x[clave] === 'number' && x[clave] > 0).map((x) => [x.fecha, x[clave]]));
  const pares = (serie) => new Map((serie ?? []).filter(([, v]) => typeof v === 'number' && v > 0));

  // el relevamiento por canal: [mes, canal dist, canal com, vol2, surt2, conimp2, sinimp2, vol3, surt3, conimp3, sinimp3]
  const rel = f.gasoilPrecios;
  const COLUMNA = { 2: { vol: 3, surtidor: 4, con_imp: 5, sin_imp: 6 }, 3: { vol: 7, surtidor: 8, con_imp: 9, sin_imp: 10 } };
  const relevamiento = ({ grado, canal, precio }) => {
    const out = new Map();
    if (!rel?.canales) return out;
    const MAYORISTA = rel.canales_distribucion.indexOf('Mayorista');
    const MINORISTA = rel.canales_distribucion.indexOf('Minorista');
    const AL_PUBLICO = rel.canales_comercializacion.indexOf('Al público');
    const { vol, [precio]: col } = COLUMNA[grado];
    const acc = new Map();
    for (const fila of rel.canales) {
      const pasa = canal === 'mayorista' ? fila[1] === MAYORISTA : fila[1] === MINORISTA && fila[2] === AL_PUBLICO;
      if (!pasa || !fila[vol] || !fila[col]) continue;
      const a = acc.get(fila[0]) ?? { num: 0, den: 0 };
      a.num += fila[vol] * fila[col];
      a.den += fila[vol];
      acc.set(fila[0], a);
    }
    for (const [i, a] of acc) if (!anomalos.has(rel.meses[i])) out.set(rel.meses[i], a.num / a.den);
    return out;
  };

  const columnaDe = (datos, filas, campo) => {
    const i = (datos?.campos ?? []).indexOf(campo);
    return i < 0 ? new Map() : new Map((filas ?? []).filter((x) => typeof x[i] === 'number' && x[i] > 0).map((x) => [x[0], x[i]]));
  };

  const armar = (id) => {
    const p = PRODUCTOS[id];
    const d = p?.de ?? {};
    let m = new Map();
    if (d.base) {
      if (P) for (const mes of P.meses) {
        const v = P.de(mes)?.[d.base];
        if (typeof v === 'number' && v > 0) m.set(mes, v);
      }
    } else if (d.ranking) m = pares(ranking.productos?.find((x) => x.id === d.ranking)?.serie);
    else if (d.comparado) m = pares(ranking.comparados?.find((x) => x.id === d.comparado)?.serie);
    else if (d.importaciones) m = tabla(ranking.importaciones, d.importaciones);
    else if (d.res963) m = tabla(ranking.res963, d.res963);
    else if (d.relevamiento) m = relevamiento(d.relevamiento);
    else if (d.naftas) m = columnaDe(f.naftas, f.naftas?.mensual, d.naftas);
    else if (d.impuestos) m = columnaDe(f.iclIco2, f.iclIco2?.gasoil, d.impuestos);
    else if (d.evidencia) m = tabla(f.evidencia?.[d.evidencia[0]], d.evidencia[1]);
    return p?.sinMesesAnomalos ? sinAnomalos(m) : m;
  };

  const series = new Map();
  const r = {
    serie(id) {
      if (!series.has(id)) series.set(id, armar(id));
      return series.get(id);
    },
    tc: new Map(ranking.tc ?? []),
    densidades: { gasoil: ranking.densidad_go ?? null, bio: f.densidadBio ?? null, naftas: 0.68, crudo: 0.835, aceite: 0.92, metanol: 0.792, glicerina: 1.26 },
    retenciones: { aceite: tabla0(f.evidencia?.retenciones, 'sbo'), biodiesel: tabla0(f.evidencia?.retenciones, 'sme') },
    // los márgenes del biodiésel: la misma cuenta que usa el Polígrafo, espejo de la página /margenes
    margenes: margenesBiodiesel(ranking),
  };
  preparados.set(ctx, r);
  return r;
}

// las retenciones valen también cuando son cero (hubo años sin retención)
function tabla0(filas, clave) {
  return new Map((filas ?? []).filter((x) => typeof x[clave] === 'number').map((x) => [x.fecha, x[clave] * 100]));
}

/** ¿Se puede pasar ese producto a esa unidad? (falta la densidad para ir de litros a toneladas). */
function densidadDe(producto, ctx) {
  return preparar(ctx).densidades[PRODUCTOS[producto].densidad] ?? null;
}

/**
 * El valor por metro cúbico de un producto en un mes, en `moneda` ('ars', 'usd', o null
 * para dejarlo en la moneda en que viene). null si falta el dato, la densidad o el tipo de cambio.
 */
function porM3(producto, mes, ctx, moneda = null) {
  const S = preparar(ctx);
  const v = S.serie(producto).get(mes);
  if (v === undefined) return null;
  const o = ORIGEN[PRODUCTOS[producto].unidad];
  let x = o.por === 'l' ? v * 1000 : o.por === 'm3' ? v : null;
  if (x === null) {
    const d = densidadDe(producto, ctx);
    if (!d) return null;
    x = v * d; // por tonelada -> por metro cúbico
  }
  if (moneda && moneda !== o.moneda) {
    const tc = S.tc.get(mes);
    if (!tc) return null;
    x = moneda === 'usd' ? x / tc : x * tc;
  }
  return x;
}

/** El precio de un producto en un mes, en la unidad pedida. null si no se puede. */
export function precioDe(producto, mes, unidad, ctx) {
  const u = UNIDADES[unidad] ?? UNIDADES.pesos_litro;
  // sin conversión cuando se pide la unidad en que viene: no depende de la densidad ni del tipo de cambio
  if (UNIDAD_DE_ORIGEN[PRODUCTOS[producto].unidad] === unidad) return preparar(ctx).serie(producto).get(mes) ?? null;
  const x = porM3(producto, mes, ctx, u.moneda);
  if (x === null) return null;
  if (u.por === 'l') return x / 1000;
  if (u.por === 'm3') return x;
  if (u.por === 'bbl') return x / BARRILES_POR_M3;
  const d = densidadDe(producto, ctx);
  return d ? x / d : null;
}

/**
 * Cuánto más caro (%) es `a` que `b` en un mes: litro contra litro, tonelada contra
 * tonelada o a igual energía (`factor` = energía de un litro de b sobre la de uno de a).
 * null si falta alguno de los dos precios o no se pueden llevar a la misma base.
 */
export function brechaDe(a, b, mes, equivalencia, ctx, factor = 1) {
  const misma = ORIGEN[PRODUCTOS[a].unidad].moneda === ORIGEN[PRODUCTOS[b].unidad].moneda;
  let va = porM3(a, mes, ctx, misma ? null : 'ars');
  let vb = porM3(b, mes, ctx, misma ? null : 'ars');
  if (va === null || vb === null) return null;
  if (equivalencia === 'por_tonelada') {
    const [da, db] = [densidadDe(a, ctx), densidadDe(b, ctx)];
    if (!da || !db) return null;
    va /= da;
    vb /= db;
  }
  if (!vb) return null;
  return ((va / vb) * (equivalencia === 'por_energia' ? factor : 1) - 1) * 100;
}

/** Los meses en que hay dato de todos esos productos, entre desde y hasta (pueden faltar). */
export function mesesConPrecio(productos, ctx, desde, hasta) {
  const S = preparar(ctx);
  const [primero, ...resto] = productos.map((k) => S.serie(k));
  if (!primero) return [];
  return [...primero.keys()].filter((m) => (!desde || m >= desde) && (!hasta || m <= hasta) && resto.every((s) => s.has(m))).sort();
}

/** El tipo de cambio del mes (pesos por dólar) y las retenciones (%), como series mensuales. */
export function serieAuxiliar(nombre, ctx) {
  const S = preparar(ctx);
  if (nombre === 'tipo_cambio') return S.tc;
  if (nombre === 'retencion_aceite') return S.retenciones.aceite;
  if (nombre === 'retencion_biodiesel') return S.retenciones.biodiesel;
  const clave = { margen_biodiesel: 'margen', margen_biodiesel_pct: 'margenPct', crack_biodiesel: 'crack', crack_biodiesel_pct: 'crackPct' }[nombre];
  if (clave && S.margenes) return new Map(S.margenes.meses.map((m) => [m, S.margenes.de(m)[clave]]).filter(([, v]) => v !== null && v !== undefined));
  return new Map();
}

/**
 * Las notas de una conversión: qué densidad y qué tipo de cambio se usaron para pasar
 * esos productos a esa unidad. Vacío si todos se muestran en la unidad en que vienen.
 */
export function notasDeConversion(productos, unidad, ctx) {
  const u = UNIDADES[unidad] ?? UNIDADES.pesos_litro;
  const notas = [];
  const convertidos = productos.filter((k) => UNIDAD_DE_ORIGEN[PRODUCTOS[k].unidad] !== unidad);
  if (convertidos.some((k) => ORIGEN[PRODUCTOS[k].unidad].moneda !== u.moneda)) {
    notas.push(`Los precios que vienen en ${u.moneda === 'usd' ? 'pesos' : 'dólares'} se pasan a ${u.moneda === 'usd' ? 'dólares' : 'pesos'} con el tipo de cambio promedio de cada mes.`);
  }
  notas.push(...notasDeDensidad(convertidos.filter((k) => (ORIGEN[PRODUCTOS[k].unidad].por === 't') !== (u.por === 't')), ctx));
  if (u.por === 'bbl') notas.push('Un metro cúbico son 6,2898 barriles.');
  return notas;
}

/**
 * Con qué densidades se pasan esos productos de volumen a toneladas (o al revés). Es
 * siempre la misma frase, con todas las densidades del sitio: así sale una sola vez
 * aunque el pedido traiga varios productos.
 */
export function notasDeDensidad(productos, ctx) {
  if (!productos.length) return [];
  const S = preparar(ctx);
  const notas = [];
  if (productos.some((k) => S.densidades[PRODUCTOS[k].densidad])) {
    const lista = Object.entries(TXT_DENSIDAD).filter(([d]) => S.densidades[d]).map(([d, txt]) => `${txt} ${String(S.densidades[d]).replace('.', ',')}`);
    notas.push(`Para pasar de volumen a toneladas, o al revés, se usan las densidades del sitio, en toneladas por metro cúbico: ${lista.join('; ')}.`);
  }
  if (productos.some((k) => PRODUCTOS[k].densidad === 'bioetanol')) notas.push(SIN_DENSIDAD_DE_BIOETANOL);
  return notas;
}

const SIN_DENSIDAD_DE_BIOETANOL = 'El bioetanol no se pasa a toneladas: el sitio no tiene su densidad.';

/** Por qué ese producto no se puede mostrar en esa unidad, o null si se puede. */
export function motivoSinConversion(producto, unidad, ctx) {
  const u = UNIDADES[unidad] ?? UNIDADES.pesos_litro;
  const cambiaDeBase = (ORIGEN[PRODUCTOS[producto].unidad].por === 't') !== (u.por === 't');
  return cambiaDeBase && !densidadDe(producto, ctx) ? SIN_DENSIDAD_DE_BIOETANOL : null;
}

/** Los productos que vienen por volumen (y no por tonelada): los que necesitan la densidad para compararse por tonelada. */
export const vienePorVolumen = (producto) => ORIGEN[PRODUCTOS[producto].unidad].por !== 't';

/** Lo que avisa el propio dato: los últimos meses del informe de regalías de crudo son provisorios. */
export function notaDelDato(producto, ctx) {
  const id = PRODUCTOS[producto]?.de?.ranking;
  const nota = id ? ctx.fuentesPrecio?.gasoilRanking?.productos?.find((x) => x.id === id)?.nota : null;
  return nota && /provisorios/.test(nota) ? 'Los dos últimos meses del informe de regalías de crudo son provisorios.' : null;
}

/** La nota de los meses que el sitio deja sin precio de gas oil, si el período toca alguno. */
export function notaDeMesesSinPrecio(productos, desde, hasta) {
  const deGasoil = productos.some((k) => PRODUCTOS[k].sinMesesAnomalos || PRODUCTOS[k].de?.relevamiento);
  const tocados = MESES_SIN_PRECIO_DE_GASOIL.filter((m) => m >= desde && m <= hasta);
  if (!deGasoil || !tocados.length) return null;
  return `Sin los precios de gas oil de ${tocados.join(', ')}: en esos meses el relevamiento trae valores anómalos y el sitio no los usa.`;
}
