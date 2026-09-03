// Mapa de firmas del plenario de comisiones sobre biocombustibles
// (Minería, Energía y Combustibles + Presupuesto y Hacienda, 03/09/2026).
//
// Composición verificada en senado.gob.ar el 2/9/2026 (comisiones 65 y 54).
// Para actualizar la planilla alcanza con editar este archivo:
//  - SENADORES: `a` es el cargo en Minería (null si no la integra),
//    `b` el cargo en Presupuesto (null si no la integra).
//  - COMISIONES: bancas, mayoría (art. 105: más de la mitad de los
//    miembros reglamentarios) y vacantes.

export const PLENARIO = {
  fecha: 'Jueves 3/9/2026 · 11:00 · Salón Azul',
  verificado: '2/9/2026',
  expedientes:
    'S-809/26 Bullrich · S-916/26 Royón · S-3/26 Vigo y Espínola · S-1271/25 Ávila · ' +
    'S-1861/25 Carambia y Gadano · S-1035/26 Arce y Rojas Decut · S-1246/26 Capitanich',
};

export const COMISIONES = {
  A: {
    id: 'A',
    nombre: 'Minería, Energía y Combustibles',
    corto: 'Minería',
    bancas: 19,
    mayoria: 10,
    vacantes: 5,
    preside: 'Royón',
  },
  B: {
    id: 'B',
    nombre: 'Presupuesto y Hacienda',
    corto: 'Presupuesto',
    bancas: 17,
    mayoria: 9,
    vacantes: 3,
    preside: 'Monteverde',
  },
};

export const BLOQUES = {
  LLA: { label: 'LLA', clase: 'lla' },
  UCR: { label: 'UCR', clase: 'ucr' },
  PRO: { label: 'PRO', clase: 'pro' },
  CF: { label: 'Convicción Federal', clase: 'cf' },
  PU: { label: 'Provincias Unidas', clase: 'prov' },
  PLS: { label: 'Primero los Salteños', clase: 'prov' },
  MSC: { label: 'Movere Santa Cruz', clase: 'prov' },
  LN: { label: 'La Neuquinidad', clase: 'prov' },
  JSF: { label: 'Justicia Social Federal', clase: 'prov' },
  IND: { label: 'Independencia', clase: 'prov' },
};

export const ORDEN_BLOQUES = ['LLA', 'UCR', 'PRO', 'CF', 'PU', 'PLS', 'MSC', 'LN', 'JSF', 'IND'];

export const SENADORES = [
  { id: 'cervi', nombre: 'Cervi', provincia: 'Neuquén', bloque: 'LLA', a: 'secretario', b: null },
  { id: 'godoy', nombre: 'Godoy', provincia: 'Chaco', bloque: 'LLA', a: 'vocal', b: null },
  { id: 'olivera', nombre: 'Olivera Lucero', provincia: 'San Juan', bloque: 'LLA', a: 'vocal', b: 'vocal' },
  { id: 'atauche', nombre: 'Atauche', provincia: 'Jujuy', bloque: 'LLA', a: 'vocal', b: 'vocal' },
  { id: 'coto', nombre: 'Coto', provincia: 'Tierra del Fuego', bloque: 'LLA', a: 'vocal', b: null },
  { id: 'fullone', nombre: 'Fullone', provincia: 'Río Negro', bloque: 'LLA', a: 'vocal', b: null },
  { id: 'monteverde', nombre: 'Monteverde', provincia: 'CABA', bloque: 'LLA', a: null, b: 'presidente' },
  { id: 'abdala', nombre: 'Abdala', provincia: 'San Luis', bloque: 'LLA', a: null, b: 'vocal' },
  { id: 'bullrich', nombre: 'Bullrich', provincia: 'CABA', bloque: 'LLA', a: null, b: 'vocal' },
  { id: 'fama', nombre: 'Fama', provincia: 'Catamarca', bloque: 'UCR', a: 'vicepresidente', b: 'vocal' },
  { id: 'juri', nombre: 'Juri', provincia: 'Mendoza', bloque: 'UCR', a: 'vocal', b: 'vocal' },
  { id: 'galaretto', nombre: 'Galaretto', provincia: 'Santa Fe', bloque: 'UCR', a: 'vocal', b: null },
  { id: 'schneider', nombre: 'Schneider', provincia: 'Chaco', bloque: 'UCR', a: null, b: 'secretaria' },
  { id: 'cristina', nombre: 'Cristina', provincia: 'Chubut', bloque: 'PRO', a: 'vocal', b: 'vocal' },
  { id: 'moises', nombre: 'Moisés', provincia: 'Jujuy', bloque: 'CF', a: 'vocal', b: null },
  { id: 'andrada', nombre: 'Andrada', provincia: 'Catamarca', bloque: 'CF', a: null, b: 'vocal' },
  { id: 'vigo', nombre: 'Vigo', provincia: 'Córdoba', bloque: 'PU', a: null, b: 'vocal' },
  { id: 'espinola', nombre: 'Espínola', provincia: 'Corrientes', bloque: 'PU', a: null, b: 'vocal' },
  { id: 'royon', nombre: 'Royón', provincia: 'Salta', bloque: 'PLS', a: 'presidenta', b: null },
  { id: 'carambia', nombre: 'Carambia', provincia: 'Santa Cruz', bloque: 'MSC', a: 'vocal', b: null },
  { id: 'corroza', nombre: 'Corroza', provincia: 'Neuquén', bloque: 'LN', a: 'vocal', b: null },
  { id: 'salino', nombre: 'Salino', provincia: 'San Luis', bloque: 'JSF', a: null, b: 'vicepresidente' },
  { id: 'avila', nombre: 'Ávila', provincia: 'Tucumán', bloque: 'IND', a: null, b: 'vocal' },
];

const ids = (filtro) => SENADORES.filter(filtro).map((s) => s.id);

// Escenarios de un toque. El primero es el estado inicial de la planilla.
export const PRESETS = [
  { id: 'lla_ucr', label: 'LLA + UCR', ids: ids((s) => s.bloque === 'LLA' || s.bloque === 'UCR') },
  {
    id: 'lla_ucr_pro',
    label: 'LLA + UCR + PRO',
    ids: ids((s) => ['LLA', 'UCR', 'PRO'].includes(s.bloque)),
  },
  {
    id: 'sin_ucr',
    label: 'Sin UCR (mapa de prensa)',
    ids: [...ids((s) => s.bloque === 'LLA'), 'cristina', 'royon', 'carambia', 'corroza', 'vigo', 'espinola', 'avila'],
  },
  { id: 'limpiar', label: 'Limpiar', ids: [] },
];

export const QUIEN_CIERRA = [
  {
    dt: '9 / 8',
    b: 'LLA + UCR completos',
    t: 'quedan a una firma en cada comisión. Cierra Andrea Cristina sola (PRO, integra ambas) o un extra en Minería (Royón, Carambia, Corroza, Moisés) más uno en Presupuesto (Salino, Vigo, Espínola, Ávila, Andrada): 21 maneras mínimas.',
  },
  {
    dt: '10 / 9',
    b: 'LLA + UCR + PRO',
    t: 'llegan justo. Cero margen: cualquiera de los 14 que se baje voltea el dictamen salvo que lo reemplace un provincial.',
  },
  {
    dt: '6 / 5',
    b: 'LLA solo',
    t: 'no alcanza. Es imprescindible pero insuficiente: las 21 coaliciones mínimas de bloques lo incluyen, y sin LLA el resto de los designados suma 8 en Minería.',
  },
  {
    dt: '4 de 5',
    b: 'Sin la UCR',
    t: 'LLA necesita 4 de los 5 no radicales de Minería (Cristina, Royón, Carambia, Corroza, Moisés) y 4 de los 6 de Presupuesto (Cristina, Salino, Vigo, Espínola, Ávila, Andrada): 45 maneras mínimas.',
  },
  {
    dt: '328.642',
    b: 'Conjuntos distintos de firmantes',
    t: 'logran la mayoría en ambas comisiones; 102.321 son mínimos y el mínimo absoluto son 14 senadores (los 5 dobles, 5 de Minería y 4 de Presupuesto).',
  },
];

export const PRENSA = [
  'Bullrich llega con borrador propio: "dictaminamos y vemos qué texto tiene más firmas". Godoy (LLA, Chaco) pidió cuarto intermedio el 26/8 y Atauche se le opuso: riesgo interno en Minería.',
  'Fama y Royón no conocían el borrador. La UCR no fijó posición pública y define si el dictamen sale justo o con margen: sus 3 y 3 firmas llevan a LLA de 6 y 5 a 9 y 8.',
  'Royón, Ávila, Vigo y Espínola empujan el dictamen y el Norte Grande apura. Convicción Federal (Moisés, Andrada) cuestionó "dictámenes sin aval". Salino (San Luis, biodiésel no integrado) habló de "irregularidad absoluta". Galaretto es el único santafesino.',
  'Sin UCR el mapa plausible queda en el umbral justo: Minería LLA 6 + Cristina + Royón + Carambia + Corroza = 10; Presupuesto LLA 5 + Cristina + Vigo + Espínola + Ávila = 9. Con la UCR pasa a 13 y 12.',
];

export const REGLAS = [
  {
    b: 'Art. 105.',
    t: 'Dictamen: firma de más de la mitad de los miembros que reglamentariamente integran cada comisión. Si dos fracciones empatan en firmas, es de mayoría la que sostiene quien preside: Royón (art. 92).',
  },
  {
    b: 'Art. 100.',
    t: 'Quórum para sesionar: 10 y 9 presentes. Pasada media hora de la convocatoria alcanza un tercio: 7 y 6.',
  },
  { b: 'Art. 106.', t: 'Entrado el dictamen a Mesa de Entradas, la firma no se retira.' },
  {
    b: 'Vacantes.',
    t: 'Las 5 y 3 bancas sin ocupar son del bloque Justicialista, que las dejó vacantes en protesta por el reparto de comisiones y sostiene que estos dictámenes son inválidos. Eso no frenó Presupuesto 2026, Inocencia Fiscal, Glaciares ni la reforma laboral. Si el PJ ocupara sus bancas, los umbrales no cambian: se suman 5 y 3 firmantes posibles.',
  },
];

export const FUENTES = [
  { label: 'comisión 65', href: 'https://www.senado.gob.ar/parlamentario/comisiones/info/65' },
  { label: 'comisión 54', href: 'https://www.senado.gob.ar/parlamentario/comisiones/info/54' },
  { label: 'bloques', href: 'https://www.senado.gob.ar/senadores/listados/agrupados-por-bloques' },
  { label: 'Reglamento HSN', href: 'https://www.senado.gob.ar/bundles/senadoportal/pdf/Reglamento_HSN.pdf' },
  { label: 'agenda del plenario', href: 'https://www.senado.gob.ar/parlamentario/comisiones/info/65?Reuniones=3' },
];
