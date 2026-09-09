// Mapa del recinto: los 72 senadores frente al dictamen de biocombustibles.
//
// Nómina verificada en senado.gob.ar el 9/9/2026 (listados por bloque y por
// provincia). Para actualizar la planilla alcanza con editar este archivo:
//  - SENADORES: apellido para mostrar, nombre completo, provincia y bloque,
//    en el orden político de izquierda a derecha con que se sientan en el
//    hemiciclo (el orden dentro de cada bloque no importa).
//  - RECINTO: umbrales del Reglamento HSN (arts. 16 y 209).
//  - PRESETS: escenarios de un toque; `favor` y `contra` son listas de ids,
//    el resto queda ausente.

export const RECINTO = {
  fecha: 'Sesión prevista para el jueves 10/9/2026, dejada sin efecto el 9/9',
  verificado: '9/9/2026',
  bancas: 72,
  quorum: 37, // art. 16: mayoría absoluta del número constitucional
  dictamen: 'Dictamen de mayoría del plenario de Minería, Energía y Combustibles y Presupuesto y Hacienda, firmado el 3/9/2026',
};

export const BLOQUES = {
  PJ: { label: 'Justicialista', clase: 'pj' },
  FCS: { label: 'Frente Cívico por Santiago', clase: 'fcs' },
  CF: { label: 'Convicción Federal', clase: 'cf' },
  JSF: { label: 'Justicia Social Federal', clase: 'prov' },
  MSC: { label: 'Movere Santa Cruz', clase: 'prov' },
  PU: { label: 'Provincias Unidas', clase: 'prov' },
  UNI: { label: 'Unipersonales', clase: 'prov' },
  UCR: { label: 'UCR', clase: 'ucr' },
  PRO: { label: 'PRO', clase: 'pro' },
  LLA: { label: 'LLA', clase: 'lla' },
};

// De izquierda a derecha en el hemiciclo.
export const ORDEN_BLOQUES = ['PJ', 'FCS', 'CF', 'JSF', 'MSC', 'PU', 'UNI', 'UCR', 'PRO', 'LLA'];

const s = (id, nombre, completo, provincia, bloque, sub) => ({
  id,
  nombre,
  completo,
  provincia,
  bloque,
  sub: sub || null,
});

export const SENADORES = [
  // Justicialista (21)
  s('mayans', 'Mayans', 'José Miguel Ángel Mayans', 'Formosa', 'PJ'),
  s('gonzalez', 'González', 'María Teresa Margarita González', 'Formosa', 'PJ'),
  s('depedro', 'de Pedro', 'Eduardo Enrique de Pedro', 'Buenos Aires', 'PJ'),
  s('ditullio', 'Di Tullio', 'Juliana Di Tullio', 'Buenos Aires', 'PJ'),
  s('recalde', 'Recalde', 'Mariano Recalde', 'CABA', 'PJ'),
  s('capitanich', 'Capitanich', 'Jorge Milton Capitanich', 'Chaco', 'PJ'),
  s('corpacci', 'Corpacci', 'Lucía Benigna Corpacci', 'Catamarca', 'PJ'),
  s('linares', 'Linares', 'Carlos Alberto Linares', 'Chubut', 'PJ'),
  s('bahl', 'Bahl', 'Adán Humberto Bahl', 'Entre Ríos', 'PJ'),
  s('bensusan', 'Bensusán', 'Daniel Pablo Bensusán', 'La Pampa', 'PJ'),
  s('flopez', 'F. López', 'María Florencia López', 'La Rioja', 'PJ'),
  s('fsagasti', 'Fernández Sagasti', 'Anabel Fernández Sagasti', 'Mendoza', 'PJ'),
  s('marks', 'Marks', 'Ana Inés Marks', 'Río Negro', 'PJ'),
  s('soria', 'Soria', 'Martín Ignacio Soria', 'Río Negro', 'PJ'),
  s('gimenez', 'Giménez Navarro', 'María Celeste Giménez Navarro', 'San Juan', 'PJ'),
  s('unac', 'Uñac', 'Sergio Mauricio Uñac', 'San Juan', 'PJ'),
  s('kirchner', 'Kirchner', 'Alicia Margarita Antonia Kirchner', 'Santa Cruz', 'PJ'),
  s('lewandowski', 'Lewandowski', 'Marcelo Néstor Lewandowski', 'Santa Fe', 'PJ'),
  s('neder', 'Neder', 'José Emilio Neder', 'Santiago del Estero', 'PJ'),
  s('clopez', 'C. López', 'Cándida Cristina López', 'Tierra del Fuego', 'PJ'),
  s('manzur', 'Manzur', 'Juan Luis Manzur', 'Tucumán', 'PJ'),
  // Frente Cívico por Santiago (2)
  s('zamora', 'Zamora', 'Gerardo Zamora', 'Santiago del Estero', 'FCS'),
  s('moreno', 'Moreno', 'Elia Esther del Carmen Moreno', 'Santiago del Estero', 'FCS'),
  // Convicción Federal (3)
  s('andrada', 'Andrada', 'Guillermo Eduardo Andrada', 'Catamarca', 'CF'),
  s('moises', 'Moisés', 'María Carolina Moisés', 'Jujuy', 'CF'),
  s('mendoza', 'Mendoza', 'Sandra Mariela Mendoza', 'Tucumán', 'CF'),
  // Justicia Social Federal (2)
  s('salino', 'Salino', 'Fernando Aldo Salino', 'San Luis', 'JSF'),
  s('rejal', 'Rejal', 'Jesús Fernando Rejal', 'La Rioja', 'JSF'),
  // Movere Santa Cruz (2)
  s('carambia', 'Carambia', 'José María Carambia', 'Santa Cruz', 'MSC'),
  s('gadano', 'Gadano', 'Natalia Elena Gadano', 'Santa Cruz', 'MSC'),
  // Provincias Unidas (2)
  s('vigo', 'Vigo', 'Alejandra María Vigo', 'Córdoba', 'PU'),
  s('espinola', 'Espínola', 'Carlos Mauricio Espínola', 'Corrientes', 'PU'),
  // Unipersonales (6)
  s('royon', 'Royón', 'Flavia Gabriela Royón', 'Salta', 'UNI', 'Primero los Salteños'),
  s('avila', 'Ávila', 'Beatriz Luisa Ávila', 'Tucumán', 'UNI', 'Independencia'),
  s('corroza', 'Corroza', 'Julieta Corroza', 'Neuquén', 'UNI', 'La Neuquinidad'),
  s('terenzi', 'Terenzi', 'Edith Elizabeth Terenzi', 'Chubut', 'UNI', 'Despierta Chubut'),
  s('arce', 'Arce', 'Carlos Omar Arce', 'Misiones', 'UNI', 'Encuentro Misionero'),
  s('rojasdecut', 'Rojas Decut', 'Sonia Elizabeth Rojas Decut', 'Misiones', 'UNI', 'Movimiento por Misiones'),
  // UCR (10)
  s('abad', 'Abad', 'Maximiliano Abad', 'Buenos Aires', 'UCR'),
  s('fama', 'Fama', 'Flavio Sergio Fama', 'Catamarca', 'UCR'),
  s('schneider', 'Schneider', 'Silvana Lorena Schneider', 'Chaco', 'UCR'),
  s('valenzuela', 'Valenzuela', 'Mercedes Gabriela Valenzuela', 'Corrientes', 'UCR'),
  s('vischi', 'Vischi', 'Eduardo Alejandro Vischi', 'Corrientes', 'UCR'),
  s('kroneberger', 'Kroneberger', 'Daniel Ricardo Kroneberger', 'La Pampa', 'UCR'),
  s('juri', 'Juri', 'Mariana Juri', 'Mendoza', 'UCR'),
  s('suarez', 'Suárez', 'Rodolfo Alejandro Suárez', 'Mendoza', 'UCR'),
  s('galaretto', 'Galaretto', 'Eduardo Horacio Galaretto', 'Santa Fe', 'UCR'),
  s('losada', 'Losada', 'Carolina Losada', 'Santa Fe', 'UCR'),
  // PRO (3)
  s('cristina', 'Cristina', 'Andrea Marcela Cristina', 'Chubut', 'PRO'),
  s('huala', 'Huala', 'María Victoria Huala', 'La Pampa', 'PRO'),
  s('goerling', 'Goerling Lara', 'Enrique Martín Goerling Lara', 'Misiones', 'PRO'),
  // LLA (21)
  s('bullrich', 'Bullrich', 'Patricia Bullrich', 'CABA', 'LLA'),
  s('monteverde', 'Monteverde', 'Agustín Aníbal Monteverde', 'CABA', 'LLA'),
  s('godoy', 'Godoy', 'Juan Cruz Godoy', 'Chaco', 'LLA'),
  s('alvarezrivero', 'Álvarez Rivero', 'Carmen Álvarez Rivero', 'Córdoba', 'LLA'),
  s('juez', 'Juez', 'Luis Alfredo Juez', 'Córdoba', 'LLA'),
  s('almeida', 'Almeida', 'Romina María Almeida', 'Entre Ríos', 'LLA'),
  s('benegas', 'Benegas Lynch', 'Joaquín Alberto Benegas Lynch', 'Entre Ríos', 'LLA'),
  s('paoltroni', 'Paoltroni', 'Francisco Manuel Paoltroni', 'Formosa', 'LLA'),
  s('atauche', 'Atauche', 'Ezequiel Atauche', 'Jujuy', 'LLA'),
  s('bedia', 'Bedia', 'Vilma Facunda Bedia', 'Jujuy', 'LLA'),
  s('pagotto', 'Pagotto', 'Juan Carlos Pagotto', 'La Rioja', 'LLA'),
  s('cervi', 'Cervi', 'Mario Pablo Cervi', 'Neuquén', 'LLA'),
  s('marquez', 'Márquez', 'Nadia Judith Márquez', 'Neuquén', 'LLA'),
  s('fullone', 'Fullone', 'Enzo Paolo Fullone', 'Río Negro', 'LLA'),
  s('guzman', 'Guzmán Coraita', 'Gonzalo Guzmán Coraita', 'Salta', 'LLA'),
  s('orozco', 'Orozco', 'María Emilia Orozco', 'Salta', 'LLA'),
  s('olivera', 'Olivera Lucero', 'Bruno Antonio Olivera Lucero', 'San Juan', 'LLA'),
  s('abdala', 'Abdala', 'Bartolomé Esteban Abdala', 'San Luis', 'LLA'),
  s('arrascaeta', 'Arrascaeta', 'Ivanna Marcela Arrascaeta', 'San Luis', 'LLA'),
  s('coto', 'Coto', 'Agustín Pedro Coto', 'Tierra del Fuego', 'LLA'),
  s('montedeoca', 'Monte de Oca', 'María Belén Monte de Oca', 'Tierra del Fuego', 'LLA'),
];

const ids = (filtro) => SENADORES.filter(filtro).map((x) => x.id);
const en = (...bloques) => ids((x) => bloques.includes(x.bloque));

// Escenarios de un toque. El primero es el estado inicial de la planilla.
export const PRESETS = [
  {
    id: 'sin_pj',
    label: 'Sin el PJ: los otros 51 presentes y a favor',
    favor: ids((x) => x.bloque !== 'PJ'),
    contra: [],
  },
  {
    id: 'nucleo',
    label: 'Solo LLA + UCR + PRO',
    favor: en('LLA', 'UCR', 'PRO'),
    contra: [],
  },
  {
    id: 'nucleo_cf',
    label: 'LLA + UCR + PRO + Convicción Federal',
    favor: en('LLA', 'UCR', 'PRO', 'CF'),
    contra: [],
  },
  {
    id: 'completa',
    label: 'Sesión completa: PJ y Santiago en contra',
    favor: ids((x) => !['PJ', 'FCS'].includes(x.bloque)),
    contra: en('PJ', 'FCS'),
  },
  { id: 'limpiar', label: 'Limpiar', favor: [], contra: [] },
];

export const QUIEN_CIERRA = [
  {
    dt: '37',
    b: 'Quórum (art. 16).',
    t: 'Sin el bloque Justicialista quedan 51 senadores: pueden faltar hasta 14 y la sesión igual se abre. LLA + UCR + PRO suman 34 y no la abren solos: necesitan 3 de los otros 17 (Convicción Federal 3, Santiago 2, Justicia Social Federal 2, Movere 2, Provincias Unidas 2 y los 6 unipersonales).',
  },
  {
    dt: '34 + 3',
    b: 'LLA + UCR + PRO + Convicción Federal',
    t: 'hacen 37 justos. Cero margen: una sola ausencia en ese conjunto deja la sesión sin quórum, salvo que la cubra un provincial o un peronista que se siente.',
  },
  {
    dt: '26 de 51',
    b: 'Mayoría con el PJ ausente (art. 209).',
    t: 'Con los 51 no peronistas presentes, más de la mitad son 26. LLA + UCR completos (31) la superan solos. LLA + PRO (24) no llegan sin la UCR, ni con Convicción Federal (27 sí).',
  },
  {
    dt: '37 de 72',
    b: 'Si el PJ se sienta y vota en contra,',
    t: 'la mayoría sube a 37 y vuelve a ser LLA + UCR + PRO + CF justos; con todos los provinciales, 49 a 23. El PJ no puede voltear el dictamen votando: solo puede vaciar el quórum si lo acompañan al menos 15 senadores no peronistas.',
  },
  {
    dt: '2/3',
    b: 'Sobre tablas y reconsideración (arts. 147 y 148).',
    t: 'Dos tercios de los votos emitidos: con 51 presentes son 34, exactamente LLA + UCR + PRO. La preferencia para tratar un dictamen impreso en el orden del día solo exige mayoría absoluta (art. 146).',
  },
  {
    dt: '36 - 36',
    b: 'Empate (art. 213).',
    t: 'Se reabre la discusión y se repite la votación; si persiste, decide el voto de la Presidencia (Villarruel, art. 33).',
  },
];

export const PRENSA = [
  'Infobae 3/9: el plenario consensuó el dictamen. Corte de biodiésel del 7,5% al 10% y de bioetanol del 12% al 15% (6 caña, 6 maíz, 3 en competencia), plazo hasta 2036 para la reconversión pyme y tope del 20% del volumen por empresa. Ávila aspiraba al 18% y aceptó el 15%. El dictamen queda "listo para el recinto no antes de siete días" (art. 57).',
  'Opinando San Nicolás 9/9: la sesión del jueves 10/9 quedó sin efecto. El acuerdo político para llevarla adelante era de LLA, UCR, PRO y bloques provinciales; persisten "diferencias entre sectores respecto de la participación que conservarán las pymes".',
  'El Cronista 9/9: el oficialismo "no pudo garantizar los votos". Las pymes del biodiésel consideran insuficiente el acuerdo: piden una participación mayor y permanente, no solo el 3% como piso, frente a las aceiteras integradas. Buenos Aires concentra 10 plantas pyme, 345.000 t/año y 3.500 empleos. El sector del bioetanol avisó que "se retira el capítulo del biodiésel" si se reabre la negociación. Royón dejó abierta la puerta a cambios en el recinto.',
  'Lectura del mapa: la sesión no se cayó por el PJ, que no hace falta ni para el quórum ni para la mayoría. Se cayó porque el núcleo LLA + UCR + PRO (34) no llega a 37 sin los provinciales y Convicción Federal, y ahí el biodiésel bonaerense y el 3% de las pymes son la moneda de cambio.',
];

export const REGLAS = [
  {
    b: 'Art. 16.',
    t: 'Quórum: la mayoría absoluta del número constitucional de senadores hace Cámara. Son 37 de 72, siempre, sin importar las licencias.',
  },
  {
    b: 'Art. 209.',
    t: 'Decide el voto de la mayoría absoluta de los presentes en quórum legal: más de la mitad de los que están en el recinto. El dictamen de biocombustibles no exige mayoría especial.',
  },
  {
    b: 'Art. 212.',
    t: 'Se vota por la afirmativa o la negativa. La abstención requiere autorización del Cuerpo y descuenta de la base: quórum y mayoría se calculan sobre los votos emitidos.',
  },
  {
    b: 'Arts. 33 y 213.',
    t: 'La Presidencia no vota salvo empate. Empatada la votación se reabre la discusión y se repite; si vuelve a empatar, decide el presidente.',
  },
  {
    b: 'Art. 57.',
    t: 'Ningún dictamen entra al plan de labor sin siete días corridos desde su distribución. El del 3/9 recién los cumple el 10/9.',
  },
  {
    b: 'Arts. 146 a 148.',
    t: 'Preferencia con dictamen impreso en el orden del día: mayoría absoluta de los votos emitidos. Sobre tablas y reconsideración: dos tercios de los votos emitidos.',
  },
  {
    b: 'Art. 205.',
    t: 'Todo proyecto de ley se vota en general y luego en particular, artículo por artículo. Esta planilla sigue la votación en general.',
  },
];

export const FUENTES = [
  { label: 'senadores por bloque', href: 'https://www.senado.gob.ar/senadores/listados/agrupados-por-bloques' },
  { label: 'por provincia', href: 'https://www.senado.gob.ar/senadores/listados/agrupados-por-provincia' },
  { label: 'Reglamento HSN', href: 'https://www.senado.gob.ar/bundles/senadoportal/pdf/Reglamento_HSN.pdf' },
  {
    label: 'Infobae 3/9',
    href: 'https://www.infobae.com/politica/2026/09/03/despues-de-anos-de-debate-el-senado-consensuo-avanzar-en-una-suba-del-corte-de-biocombustible/',
  },
  {
    label: 'El Cronista 9/9',
    href: 'https://www.cronista.com/economia-politica/bullrich-apuesta-a-tratar-manana-biocombustibles-pero-el-biodiesel-pone-en-duda-otra-vez-los-votos/',
  },
  {
    label: 'Opinando San Nicolás 9/9',
    href: 'https://www.opinandosannicolas.ar/2026/09/cayo-sesion-senado-biocombustibles/',
  },
];
