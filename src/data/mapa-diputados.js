// Mapa de Diputados: los 257 diputados de hoy frente a la media sanción de
// biocombustibles (CD-76/26), con la votación en general de la Ley de Bases del
// 2/2/2024 cargada sobre la Cámara actual.
//
// Nómina bajada de hcdn.gob.ar/diputados el 19/10/2026. Para actualizar la
// planilla alcanza con editar este archivo:
//  - DIPUTADOS: apellido para mostrar, nombre completo, distrito, familia de
//    bloque (BLOQUES), bloque real cuando la familia agrupa varios (sub),
//    mandato y bloque en el que votó en 2024 (null si no estaba), en el orden
//    político de izquierda a derecha con que se dibuja el hemiciclo (el orden
//    dentro de cada familia no importa).
//  - RECINTO: umbrales del Reglamento HCDN (arts. 15 y 194).
//  - VOTACION: la Ley de Bases del 2/2/2024 proyectada sobre los 257 de hoy.
//  - PRESETS: escenarios de un toque; `favor`, `contra`, `preside` y `noestaba`
//    son listas de ids, el resto queda ausente.
// Armado el 19/10/2026 a partir de diputados_ley_bases_2024.json (nómina de hoy
// y votación de 2024); desde entonces este archivo es la fuente y se edita a mano.

export const RECINTO = {
  fecha: 'Votación en general de la Ley de Bases, viernes 2/2/2024 a las 18:13, acta 5101: 144 a favor, 109 en contra, 3 ausentes y el presidente sin votar',
  verificado: '19/10/2026',
  bancas: 257,
  quorum: 129, // art. 15: mayoría absoluta de los miembros, los presentes superan a los ausentes
  dosTercios: 172, // dos tercios de los votos emitidos con los 257 presentes
  expediente: 'Media sanción del Senado del 17/9/2026, en Diputados como CD-76/26, girada a las comisiones de Energía y Combustibles y de Presupuesto y Hacienda',
  pendiente: 'hcdn.gob.ar lista además una diputada de CABA por LLA pendiente de incorporación, sin nombre ni mandato; la planilla muestra las 257 bancas con titular',
};

// Votación en general de la Ley de Bases (expediente 25-PE-2023, Orden del Día
// 1/2024), acta 5101 de la Plataforma de Votaciones Abiertas: 144 afirmativos,
// 109 negativos, 0 abstenciones, 3 ausentes (Ávila, Gómez y Snopek) y el
// presidente Menem sin votar. Acá van solo los 144 que siguen en la Cámara al
// 19/10/2026; los otros 113 diputados de hoy no estaban (`noestaba`).
export const VOTACION = {
  id: 'ley_bases',
  param: 'ley-bases', // ?votacion=ley-bases abre la planilla con esta votación
  fecha: '2/2/2024',
  hora: '18:13',
  acta: 5101,
  url: 'https://votaciones.hcdn.gob.ar/votacion/5101',
  resultado: { afirmativos: 144, negativos: 109, abstenciones: 0, ausentes: 3, presidente: 1 },
  siguen: { favor: 79, contra: 61, ausentes: 3, preside: 1, noestaba: 113 },
  favor: [
    'efernandez', 'medina', 'piconmartinez', 'garrido', 'arrua', 'ggonzalez', 'outes', 'ruiz',
    'vancsik', 'vega', 'massot', 'pichetto', 'arrieta', 'atorres', 'brugge', 'capozzi',
    'cgutierrez', 'coletta', 'garciaaresca', 'nunez', 'rizzotti', 'ferraro', 'frade', 'cipolini',
    'nieri', 'verasay', 'falcone', 'zago', 'banfi', 'pagano', 'agonzalez', 'ardohain',
    'bianchetti', 'desensi', 'fernandezmolero', 'finocchiaro', 'ritondo', 'yeza', 'ajmechet', 'almiron',
    'amartinez', 'ansaloni', 'arabia', 'avico', 'benedit', 'benegaslynch', 'bonacci', 'bongiovanni',
    'bornoroni', 'campero', 'cgarcia', 'correallano', 'diez', 'emma', 'ferreyra', 'giudici',
    'gmontenegro', 'huesen', 'ibanez', 'lemoine', 'llano', 'macyszyn', 'mayoraz', 'morchio',
    'morenoovalle', 'pauli', 'peluc', 'picat', 'ponce', 'quintar', 'razzini', 'rodriguezmachado',
    'santillanjuarezbrahim', 'santurio', 'tortoriello', 'treffinger', 'vasquez', 'villaverde', 'zapata',
  ],
  contra: [
    'bregman', 'delcano', 'delpla', 'aguirre', 'araujohernandez', 'aveiro', 'basterra', 'bordet',
    'cafiero', 'campitelli', 'carignano', 'casas', 'castagneto', 'chica', 'cisneros', 'daives',
    'estevez', 'freites', 'giuliano', 'glinski', 'gmartinez', 'hagman', 'ianni', 'kirchner',
    'leiva', 'manrique', 'marin', 'marino', 'molle', 'monzon', 'moreau', 'neder',
    'osuna', 'palazzo', 'parola', 'pedrali', 'penacca', 'pokoik', 'potenza', 'propato',
    'rauschenberger', 'rgutierrez', 'sand', 'selva', 'siley', 'strada', 'tailhade', 'todero',
    'tolosapaz', 'valdes', 'volnovich', 'yasky', 'yedlin', 'zaracho', 'zulli', 'favila',
    'noblega', 'ali', 'delasota', 'juliano', 'paulon',
  ],
  ausentes: ['gomez', 'snopek', 'javila'],
  preside: ['menem'],
  noestaba: [
    'giordano', 'andino', 'andrade', 'barbur', 'borgatta', 'campo', 'campora', 'delarosa',
    'diaz', 'dolce', 'felix', 'ferran', 'galmarini', 'grabois', 'hadad', 'lanesansancho',
    'lopez', 'lopezpasquali', 'luque', 'mango', 'marclay', 'mgarcia', 'michel', 'mino',
    'molina', 'moyano', 'mukdise', 'olmos', 'palladino', 'pietragallacorti', 'roberto', 'rossi',
    'salzmann', 'serquis', 'taiana', 'tepp', 'tita', 'trotta', 'velazquez', 'monguillot',
    'noguera', 'jfernandez', 'jaimequiroga', 'maureira', 'alvarez', 'biella', 'herreraahuad', 'cbasualdo',
    'farias', 'lousteau', 'scaglia', 'schiaretti', 'zigaran', 'aguero', 'dgonzalez', 'schneider',
    'deandreis', 'fregonese', 'giampieri', 'sanchezwrba', 'abasualdo', 'agarcia', 'almena', 'andreussi',
    'becerra', 'brizuela', 'bruno', 'carrancio', 'castelnuovo', 'chiconi', 'fargosi', 'figliuolo',
    'flores', 'frias', 'gallardo', 'goitia', 'gonzales', 'gonzalezestevarena', 'gruber', 'guzman',
    'hartfield', 'holzman', 'humenuk', 'jmontenegro', 'laumann', 'leone', 'lluch', 'longo',
    'matzkin', 'metralasensio', 'molinuevo', 'mondaca', 'munoz', 'niveyro', 'ojeda', 'pareja',
    'patinobrizuela', 'pellegrini', 'pelli', 'petri', 'petrovich', 'ravera', 'reichardt', 'riesco',
    'roca', 'rodriguez', 'rtorres', 'soldano', 'tomassoni', 'tournier', 'urien', 'vera',
    'visconti',
  ],
};

export const BLOQUES = {
  FIT: { label: 'Frente de Izquierda', clase: 'fit' },
  UXP: { label: 'Unión por la Patria', clase: 'uxp' },
  PROV: { label: 'Provinciales', clase: 'prov' },
  FED: { label: 'Federales', clase: 'fed' },
  PU: { label: 'Provincias Unidas', clase: 'pu' },
  CC: { label: 'Coalición Cívica', clase: 'cc' },
  UCR: { label: 'UCR', clase: 'ucr' },
  OTROS: { label: 'Otros', clase: 'otros' },
  PRO: { label: 'PRO', clase: 'pro' },
  LLA: { label: 'LLA', clase: 'lla' },
};

// De izquierda a derecha en el hemiciclo (orden aprobado por HDO el 19/10/2026).
export const ORDEN_BLOQUES = ['FIT', 'UXP', 'PROV', 'FED', 'PU', 'CC', 'UCR', 'OTROS', 'PRO', 'LLA'];

// id, apellido a mostrar, nombre completo, distrito, familia, bloque real (o
// null), mandato, bloque en 2024 (null si no estaba en la votación).
const d = (id, nombre, completo, distrito, bloque, sub, mandato, b2024) => ({
  id,
  nombre,
  completo,
  distrito,
  bloque,
  sub: sub || null,
  mandato,
  b2024: b2024 || null,
});

export const DIPUTADOS = [
  // Frente de Izquierda · PTS (2)
  d('bregman', 'Bregman', 'Myriam Bregman', 'CABA', 'FIT', 'PTS', '2025-2029', 'Frente de Izquierda'),
  d('delcano', 'del Caño', 'Nicolás del Caño', 'Buenos Aires', 'FIT', 'PTS', '2025-2029', 'Frente de Izquierda'),
  // Frente de Izquierda · Izquierda Socialista (1)
  d('giordano', 'Giordano', 'Juan Carlos Giordano', 'Buenos Aires', 'FIT', 'Izquierda Socialista', '2023-2027', null),
  // Frente de Izquierda · Partido Obrero (1)
  d('delpla', 'Del Plá', 'Romina Del Plá', 'Buenos Aires', 'FIT', 'Partido Obrero', '2025-2029', 'Frente de Izquierda'),
  // Unión por la Patria (92)
  d('aguirre', 'Aguirre', 'Hilda Aguirre', 'La Rioja', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('andino', 'Andino', 'Cristian Andino', 'San Juan', 'UXP', null, '2025-2029', null),
  d('andrade', 'Andrade', 'Javier Andrade', 'CABA', 'UXP', null, '2023-2027', null),
  d('araujohernandez', 'Araujo Hernández', 'Jorge Neri Araujo Hernández', 'Tierra del Fuego', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('aveiro', 'Aveiro', 'Martín Aveiro', 'Mendoza', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('barbur', 'Barbur', 'Marcelo Barbur', 'Santiago del Estero', 'UXP', null, '2025-2029', null),
  d('basterra', 'Basterra', 'Luis Eugenio Basterra', 'Formosa', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('bordet', 'Bordet', 'Gustavo Bordet', 'Entre Ríos', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('borgatta', 'Borgatta', 'Alejandrina Borgatta', 'Santa Fe', 'UXP', null, '2025-2029', null),
  d('cafiero', 'Cafiero', 'Santiago Cafiero', 'Buenos Aires', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('campitelli', 'Campitelli', 'Celia Campitelli', 'Santiago del Estero', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('campo', 'Campo', 'Julieta Marisol Campo', 'Chaco', 'UXP', null, '2025-2029', null),
  d('campora', 'Cámpora', 'Lucía Cámpora', 'CABA', 'UXP', null, '2025-2029', null),
  d('carignano', 'Carignano', 'Florencia Carignano', 'Santa Fe', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('casas', 'Casas', 'Sergio Guillermo Casas', 'La Rioja', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('castagneto', 'Castagneto', 'Carlos Daniel Castagneto', 'Buenos Aires', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('chica', 'Chica', 'Jorge Chica', 'San Juan', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('cisneros', 'Cisneros', 'Carlos Cisneros', 'Tucumán', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('daives', 'Daives', 'Ricardo Daives', 'Santiago del Estero', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('delarosa', 'de la Rosa', 'María Graciela de la Rosa', 'Formosa', 'UXP', null, '2025-2029', null),
  d('diaz', 'Díaz', 'Fernanda Díaz', 'Buenos Aires', 'UXP', null, '2025-2029', null),
  d('dolce', 'Dolce', 'Sergio Dolce', 'Chaco', 'UXP', null, '2025-2029', null),
  d('estevez', 'Estévez', 'Gabriela Beatriz Estévez', 'Córdoba', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('felix', 'Félix', 'Emir Félix', 'Mendoza', 'UXP', null, '2025-2029', null),
  d('ferran', 'Ferrán', 'Abelardo Ferrán', 'La Pampa', 'UXP', null, '2025-2029', null),
  d('freites', 'Freites', 'Andrea Freites', 'Tierra del Fuego', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('galmarini', 'Galmarini', 'Sebastián Galmarini', 'Buenos Aires', 'UXP', null, '2025-2029', null),
  d('giuliano', 'Giuliano', 'Diego A. Giuliano', 'Santa Fe', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('glinski', 'Glinski', 'José Glinski', 'Chubut', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('gmartinez', 'G. Martínez', 'Germán Pedro Martínez', 'Santa Fe', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('gomez', 'Gomez', 'José Gomez', 'Santiago del Estero', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('grabois', 'Grabois', 'Juan Grabois', 'Buenos Aires', 'UXP', null, '2025-2029', null),
  d('hadad', 'Hadad', 'Raúl Hadad', 'Corrientes', 'UXP', null, '2025-2029', null),
  d('hagman', 'Hagman', 'Itai Hagman', 'CABA', 'UXP', null, '2025-2029', 'Unión por la Patria'),
  d('ianni', 'Ianni', 'Ana María Ianni', 'Santa Cruz', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('kirchner', 'Kirchner', 'Máximo Carlos Kirchner', 'Buenos Aires', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('lanesansancho', 'Lanesan Sancho', 'Moira Lanesan Sancho', 'Santa Cruz', 'UXP', null, '2025-2029', null),
  d('leiva', 'Leiva', 'Aldo Leiva', 'Chaco', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('lopez', 'López', 'Jimena López', 'Buenos Aires', 'UXP', null, '2025-2029', null),
  d('lopezpasquali', 'López Pasquali', 'Cecilia López Pasquali', 'Santiago del Estero', 'UXP', null, '2025-2029', null),
  d('luque', 'Luque', 'Juan Pablo Luque', 'Chubut', 'UXP', null, '2025-2029', null),
  d('mango', 'Mango', 'Marcelo Mango', 'Río Negro', 'UXP', null, '2023-2027', null),
  d('manrique', 'Manrique', 'Mario Manrique', 'Buenos Aires', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('marclay', 'Marclay', 'Marianela Marclay', 'Entre Ríos', 'UXP', null, '2025-2029', null),
  d('marin', 'Marín', 'Varinia Lis Marín', 'La Pampa', 'UXP', null, '2025-2029', 'Unión por la Patria'),
  d('marino', 'Marino', 'Juan Marino', 'Buenos Aires', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('mgarcia', 'M. García', 'María Teresa García', 'Buenos Aires', 'UXP', null, '2025-2029', null),
  d('michel', 'Michel', 'Guillermo Michel', 'Entre Ríos', 'UXP', null, '2025-2029', null),
  d('mino', 'Miño', 'Fernanda Miño', 'Buenos Aires', 'UXP', null, '2025-2029', null),
  d('molina', 'Molina', 'Juan Carlos Molina', 'Santa Cruz', 'UXP', null, '2025-2029', null),
  d('molle', 'Molle', 'Matías Molle', 'Buenos Aires', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('monzon', 'Monzón', 'Roxana Monzón', 'Buenos Aires', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('moreau', 'Moreau', 'Cecilia Moreau', 'Buenos Aires', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('moyano', 'Moyano', 'Hugo Antonio Moyano', 'Buenos Aires', 'UXP', null, '2025-2029', null),
  d('mukdise', 'Mukdise', 'Jorge Mukdise', 'Santiago del Estero', 'UXP', null, '2025-2029', null),
  d('neder', 'Neder', 'Estela Mary Neder', 'Santiago del Estero', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('olmos', 'Olmos', 'Kelly Olmos', 'CABA', 'UXP', null, '2025-2029', null),
  d('osuna', 'Osuna', 'Blanca Inés Osuna', 'Entre Ríos', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('palazzo', 'Palazzo', 'Sergio Omar Palazzo', 'Buenos Aires', 'UXP', null, '2025-2029', 'Unión por la Patria'),
  d('palladino', 'Palladino', 'Claudia María Palladino', 'Catamarca', 'UXP', null, '2025-2029', null),
  d('parola', 'Parola', 'María Graciela Parola', 'Formosa', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('pedrali', 'Pedrali', 'Gabriela Pedrali', 'La Rioja', 'UXP', null, '2025-2029', 'Unión por la Patria'),
  d('penacca', 'Penacca', 'Paula Andrea Penacca', 'CABA', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('pietragallacorti', 'Pietragalla Corti', 'Horacio Pietragalla Corti', 'Buenos Aires', 'UXP', null, '2025-2029', null),
  d('pokoik', 'Pokoik', 'Lorena Pokoik', 'CABA', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('potenza', 'Potenza', 'Luciana Potenza', 'Buenos Aires', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('propato', 'Propato', 'Agustina Lucrecia Propato', 'Buenos Aires', 'UXP', null, '2025-2029', 'Unión por la Patria'),
  d('rauschenberger', 'Rauschenberger', 'Ariel Rauschenberger', 'La Pampa', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('rgutierrez', 'R. Gutiérrez', 'Ramiro Gutiérrez', 'Buenos Aires', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('roberto', 'Roberto', 'Santiago Luis Roberto', 'CABA', 'UXP', null, '2025-2029', null),
  d('rossi', 'Rossi', 'Agustín Oscar Rossi', 'Santa Fe', 'UXP', null, '2025-2029', null),
  d('salzmann', 'Salzmann', 'Marina Dorotea Salzmann', 'Buenos Aires', 'UXP', null, '2025-2029', null),
  d('sand', 'Sand', 'Nancy Sand', 'Corrientes', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('selva', 'Selva', 'Sabrina Selva', 'Buenos Aires', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('serquis', 'Serquis', 'Adriana Cristina Serquis', 'Río Negro', 'UXP', null, '2025-2029', null),
  d('siley', 'Siley', 'Vanesa Raquel Siley', 'Buenos Aires', 'UXP', null, '2025-2029', 'Unión por la Patria'),
  d('snopek', 'Snopek', 'Guillermo Snopek', 'Jujuy', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('strada', 'Strada', 'Julia Strada', 'Buenos Aires', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('taiana', 'Taiana', 'Jorge Taiana', 'Buenos Aires', 'UXP', null, '2025-2029', null),
  d('tailhade', 'Tailhade', 'Rodolfo Tailhade', 'Buenos Aires', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('tepp', 'Tepp', 'Caren Tepp', 'Santa Fe', 'UXP', null, '2025-2029', null),
  d('tita', 'Tita', 'Paulo Agustín Tita', 'Tierra del Fuego', 'UXP', null, '2025-2029', null),
  d('todero', 'Todero', 'Pablo Todero', 'Neuquén', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('tolosapaz', 'Tolosa Paz', 'Victoria Tolosa Paz', 'Buenos Aires', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('trotta', 'Trotta', 'Nicolás Alfredo Trotta', 'Buenos Aires', 'UXP', null, '2025-2029', null),
  d('valdes', 'Valdés', 'Eduardo Félix Valdés', 'CABA', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('velazquez', 'Velázquez', 'M. Elena Velázquez', 'Buenos Aires', 'UXP', null, '2025-2029', null),
  d('volnovich', 'Volnovich', 'Luana Volnovich', 'Buenos Aires', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('yasky', 'Yasky', 'Hugo Yasky', 'Buenos Aires', 'UXP', null, '2025-2029', 'Unión por la Patria'),
  d('yedlin', 'Yedlin', 'Pablo Raúl Yedlin', 'Tucumán', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('zaracho', 'Zaracho', 'Natalia Zaracho', 'Buenos Aires', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  d('zulli', 'Zulli', 'Christian Alejandro Zulli', 'Corrientes', 'UXP', null, '2023-2027', 'Unión por la Patria'),
  // Provinciales · Elijo Catamarca (3)
  d('favila', 'F. Avila', 'Fernanda Avila', 'Catamarca', 'PROV', 'Elijo Catamarca', '2023-2027', 'Unión por la Patria'),
  d('monguillot', 'Monguillot', 'Fernando Monguillot', 'Catamarca', 'PROV', 'Elijo Catamarca', '2025-2029', null),
  d('noblega', 'Nóblega', 'Sebastián Nóblega', 'Catamarca', 'PROV', 'Elijo Catamarca', '2023-2027', 'Unión por la Patria'),
  // Provinciales · Independencia (3)
  d('efernandez', 'E. Fernández', 'Elia Marina Fernández', 'Tucumán', 'PROV', 'Independencia', '2023-2027', 'Independencia'),
  d('medina', 'Medina', 'Gladys Medina', 'Tucumán', 'PROV', 'Independencia', '2025-2029', 'Independencia'),
  d('noguera', 'Noguera', 'Javier Noguera', 'Tucumán', 'PROV', 'Independencia', '2025-2029', null),
  // Provinciales · Primero San Luis (2)
  d('ali', 'Alí', 'Ernesto "Pipi" Alí', 'San Luis', 'PROV', 'Primero San Luis', '2023-2027', 'Unión por la Patria'),
  d('jfernandez', 'J. Fernández', 'Jorge Fernández', 'San Luis', 'PROV', 'Primero San Luis', '2025-2029', null),
  // Provinciales · Producción y Trabajo (2)
  d('jaimequiroga', 'Jaime Quiroga', 'Carlos Gustavo Jaime Quiroga', 'San Juan', 'PROV', 'Producción y Trabajo', '2025-2029', null),
  d('piconmartinez', 'Picón Martínez', 'Nancy Viviana Picón Martínez', 'San Juan', 'PROV', 'Producción y Trabajo', '2023-2027', 'Producción y Trabajo'),
  // Provinciales · Defendamos Córdoba (1)
  d('delasota', 'de la Sota', 'Natalia de la Sota', 'Córdoba', 'PROV', 'Defendamos Córdoba', '2025-2029', 'Hacemos Coalición Federal'),
  // Provinciales · La Neuquinidad (1)
  d('maureira', 'Maureira', 'Karina Maureira', 'Neuquén', 'PROV', 'La Neuquinidad', '2025-2029', null),
  // Provinciales · Por Santa Cruz (1)
  d('garrido', 'Garrido', 'José Luis Garrido', 'Santa Cruz', 'PROV', 'Por Santa Cruz', '2023-2027', 'Por Santa Cruz'),
  // Federales · Argentina Federal (9)
  d('alvarez', 'Álvarez', 'Claudio Álvarez', 'San Luis', 'FED', 'Argentina Federal', '2023-2027', null),
  d('arrua', 'Arrúa', 'Alberto Arrúa', 'Misiones', 'FED', 'Argentina Federal', '2023-2027', 'Innovación Federal'),
  d('biella', 'Biella', 'Bernardo Biella', 'Salta', 'FED', 'Argentina Federal', '2025-2029', null),
  d('ggonzalez', 'G. González', 'Gerardo Gustavo González', 'Formosa', 'FED', 'Argentina Federal', '2023-2027', 'La Libertad Avanza'),
  d('herreraahuad', 'Herrera Ahuad', 'Oscar A. Herrera Ahuad', 'Misiones', 'FED', 'Argentina Federal', '2025-2029', null),
  d('outes', 'Outes', 'Pablo Outes', 'Salta', 'FED', 'Argentina Federal', '2023-2027', 'Innovación Federal'),
  d('ruiz', 'Ruíz', 'Yamila Ruíz', 'Misiones', 'FED', 'Argentina Federal', '2023-2027', 'Innovación Federal'),
  d('vancsik', 'Vancsik', 'Daniel Vancsik', 'Misiones', 'FED', 'Argentina Federal', '2023-2027', 'Innovación Federal'),
  d('vega', 'Vega', 'Yolanda Vega', 'Salta', 'FED', 'Argentina Federal', '2023-2027', 'Innovación Federal'),
  // Federales · Encuentro Federal (2)
  d('massot', 'Massot', 'Nicolás Massot', 'Buenos Aires', 'FED', 'Encuentro Federal', '2023-2027', 'Hacemos Coalición Federal'),
  d('pichetto', 'Pichetto', 'Miguel Ángel Pichetto', 'Buenos Aires', 'FED', 'Encuentro Federal', '2023-2027', 'Hacemos Coalición Federal'),
  // Provincias Unidas (18)
  d('arrieta', 'Arrieta', 'Lourdes Micaela Arrieta', 'Mendoza', 'PU', null, '2023-2027', 'La Libertad Avanza'),
  d('atorres', 'A. Torres', 'Alejandra Torres', 'Córdoba', 'PU', null, '2023-2027', 'Hacemos Coalición Federal'),
  d('brugge', 'Brügge', 'Juan Fernando Brügge', 'Córdoba', 'PU', null, '2023-2027', 'Hacemos Coalición Federal'),
  d('capozzi', 'Capozzi', 'Sergio Eduardo Capozzi', 'Río Negro', 'PU', null, '2023-2027', 'PRO'),
  d('cbasualdo', 'C. Basualdo', 'Carolina Basualdo', 'Córdoba', 'PU', null, '2025-2029', null),
  d('cgutierrez', 'C. Gutiérrez', 'Carlos Gutiérrez', 'Córdoba', 'PU', null, '2023-2027', 'Hacemos Coalición Federal'),
  d('coletta', 'Coletta', 'Mariela Coletta', 'CABA', 'PU', null, '2023-2027', 'UCR'),
  d('farias', 'Farías', 'Pablo Farías', 'Santa Fe', 'PU', null, '2025-2029', null),
  d('garciaaresca', 'García Aresca', 'Ignacio García Aresca', 'Córdoba', 'PU', null, '2025-2029', 'Hacemos Coalición Federal'),
  d('javila', 'J. Avila', 'Jorge Antonio Avila', 'Chubut', 'PU', null, '2023-2027', 'Hacemos Coalición Federal'),
  d('juliano', 'Juliano', 'Pablo Juliano', 'Buenos Aires', 'PU', null, '2023-2027', 'UCR'),
  d('lousteau', 'Lousteau', 'Martín Lousteau', 'CABA', 'PU', null, '2025-2029', null),
  d('nunez', 'Nuñez', 'José Nuñez', 'Santa Fe', 'PU', null, '2023-2027', 'PRO'),
  d('paulon', 'Paulón', 'Esteban Paulón', 'Santa Fe', 'PU', null, '2023-2027', 'Hacemos Coalición Federal'),
  d('rizzotti', 'Rizzotti', 'Jorge Rizzotti', 'Jujuy', 'PU', null, '2023-2027', 'UCR'),
  d('scaglia', 'Scaglia', 'Gisela Scaglia', 'Santa Fe', 'PU', null, '2025-2029', null),
  d('schiaretti', 'Schiaretti', 'Juan Schiaretti', 'Córdoba', 'PU', null, '2025-2029', null),
  d('zigaran', 'Zigarán', 'María Inés Zigarán', 'Jujuy', 'PU', null, '2025-2029', null),
  // Coalición Cívica (2)
  d('ferraro', 'Ferraro', 'Maximiliano Ferraro', 'CABA', 'CC', null, '2023-2027', 'Hacemos Coalición Federal'),
  d('frade', 'Frade', 'Mónica Frade', 'Buenos Aires', 'CC', null, '2023-2027', 'Hacemos Coalición Federal'),
  // UCR (6)
  d('aguero', 'Agüero', 'Guillermo César Agüero', 'Chaco', 'UCR', null, '2025-2029', null),
  d('cipolini', 'Cipolini', 'Gerardo Cipolini', 'Chaco', 'UCR', null, '2023-2027', 'UCR'),
  d('dgonzalez', 'D. González', 'Diógenes Ignacio González', 'Corrientes', 'UCR', null, '2025-2029', null),
  d('nieri', 'Nieri', 'Lisandro Nieri', 'Mendoza', 'UCR', null, '2023-2027', 'UCR'),
  d('schneider', 'Schneider', 'Darío Schneider', 'Entre Ríos', 'UCR', null, '2025-2029', null),
  d('verasay', 'Verasay', 'Pamela Fernanda Verasay', 'Mendoza', 'UCR', null, '2025-2029', 'UCR'),
  // Otros · MID (2)
  d('falcone', 'Falcone', 'Eduardo Falcone', 'Buenos Aires', 'OTROS', 'MID', '2023-2027', 'La Libertad Avanza'),
  d('zago', 'Zago', 'Oscar Zago', 'CABA', 'OTROS', 'MID', '2023-2027', 'La Libertad Avanza'),
  // Otros · Adelante Buenos Aires (1)
  d('banfi', 'Banfi', 'Karina Banfi', 'Buenos Aires', 'OTROS', 'Adelante Buenos Aires', '2023-2027', 'UCR'),
  // Otros · Coherencia (1)
  d('pagano', 'Pagano', 'Marcela Marina Pagano', 'Buenos Aires', 'OTROS', 'Coherencia', '2023-2027', 'La Libertad Avanza'),
  // PRO (12)
  d('agonzalez', 'Á. González', 'Álvaro González', 'CABA', 'PRO', null, '2023-2027', 'PRO'),
  d('ardohain', 'Ardohain', 'Martín Ardohain', 'La Pampa', 'PRO', null, '2023-2027', 'PRO'),
  d('bianchetti', 'Bianchetti', 'Emmanuel Bianchetti', 'Misiones', 'PRO', null, '2023-2027', 'PRO'),
  d('deandreis', 'de Andreis', 'Fernando de Andreis', 'CABA', 'PRO', null, '2025-2029', null),
  d('desensi', 'De Sensi', 'María Florencia De Sensi', 'Buenos Aires', 'PRO', null, '2025-2029', 'PRO'),
  d('fernandezmolero', 'Fernández Molero', 'Daiana Fernández Molero', 'CABA', 'PRO', null, '2023-2027', 'PRO'),
  d('finocchiaro', 'Finocchiaro', 'Alejandro Finocchiaro', 'Buenos Aires', 'PRO', null, '2025-2029', 'PRO'),
  d('fregonese', 'Fregonese', 'Alicia Fregonese', 'Entre Ríos', 'PRO', null, '2025-2029', null),
  d('giampieri', 'Giampieri', 'Antonela Giampieri', 'CABA', 'PRO', null, '2025-2029', null),
  d('ritondo', 'Ritondo', 'Cristian A. Ritondo', 'Buenos Aires', 'PRO', null, '2023-2027', 'PRO'),
  d('sanchezwrba', 'Sánchez Wrba', 'Javier Sánchez Wrba', 'Buenos Aires', 'PRO', null, '2025-2029', null),
  d('yeza', 'Yeza', 'Martín Yeza', 'Buenos Aires', 'PRO', null, '2023-2027', 'PRO'),
  // LLA (95)
  d('abasualdo', 'A. Basualdo', 'Atilio Basualdo', 'Formosa', 'LLA', null, '2025-2029', null),
  d('agarcia', 'Á. García', 'Álvaro García', 'Buenos Aires', 'LLA', null, '2025-2029', null),
  d('ajmechet', 'Ajmechet', 'Sabrina Ajmechet', 'CABA', 'LLA', null, '2025-2029', 'PRO'),
  d('almena', 'Almena', 'Carlos Alberto Almena', 'San Luis', 'LLA', null, '2025-2029', null),
  d('almiron', 'Almirón', 'Lisandro Almirón', 'Corrientes', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('amartinez', 'Á. Martínez', 'Álvaro Martínez', 'Mendoza', 'LLA', null, '2025-2029', 'La Unión Mendocina'),
  d('andreussi', 'Andreussi', 'Barbara Andreussi', 'Jujuy', 'LLA', null, '2025-2029', null),
  d('ansaloni', 'Ansaloni', 'Pablo Ansaloni', 'Buenos Aires', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('arabia', 'Arabia', 'Damián Arabia', 'CABA', 'LLA', null, '2023-2027', 'PRO'),
  d('avico', 'Avico', 'Belén Avico', 'Córdoba', 'LLA', null, '2023-2027', 'PRO'),
  d('becerra', 'Becerra', 'Mónica Becerra', 'San Luis', 'LLA', null, '2025-2029', null),
  d('benedit', 'Benedit', 'Beltrán Benedit', 'Entre Ríos', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('benegaslynch', 'Benegas Lynch', 'Bertie Benegas Lynch', 'Buenos Aires', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('bonacci', 'Bonacci', 'Rocío Bonacci', 'Santa Fe', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('bongiovanni', 'Bongiovanni', 'Alejandro Bongiovanni', 'Santa Fe', 'LLA', null, '2023-2027', 'PRO'),
  d('bornoroni', 'Bornoroni', 'Gabriel Bornoroni', 'Córdoba', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('brizuela', 'Brizuela', 'Adrián Brizuela', 'Catamarca', 'LLA', null, '2025-2029', null),
  d('bruno', 'Bruno', 'Eliana Bruno', 'Salta', 'LLA', null, '2023-2027', null),
  d('campero', 'Campero', 'Mariano Campero', 'Tucumán', 'LLA', null, '2023-2027', 'UCR'),
  d('carrancio', 'Carrancio', 'Alejandro Carrancio', 'Buenos Aires', 'LLA', null, '2025-2029', null),
  d('castelnuovo', 'Castelnuovo', 'Giselle Castelnuovo', 'Buenos Aires', 'LLA', null, '2025-2029', null),
  d('cgarcia', 'C. García', 'Carlos García', 'Chaco', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('chiconi', 'Chiconi', 'Abel Chiconi', 'San Juan', 'LLA', null, '2025-2029', null),
  d('correallano', 'Correa Llano', 'Facundo Correa Llano', 'Mendoza', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('diez', 'Diez', 'Romina Diez', 'Santa Fe', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('emma', 'Emma', 'Nicolás Emma', 'CABA', 'LLA', null, '2025-2029', 'La Libertad Avanza'),
  d('fargosi', 'Fargosi', 'Alejandro Fargosi', 'CABA', 'LLA', null, '2025-2029', null),
  d('ferreyra', 'Ferreyra', 'Alida Ferreyra', 'CABA', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('figliuolo', 'Figliuolo', 'Sergio Figliuolo', 'Buenos Aires', 'LLA', null, '2025-2029', null),
  d('flores', 'Flores', 'Maria Gabriela Flores', 'Salta', 'LLA', null, '2025-2029', null),
  d('frias', 'Frias', 'Maira Frias', 'Chubut', 'LLA', null, '2025-2029', null),
  d('gallardo', 'Gallardo', 'María Virginia Gallardo', 'Corrientes', 'LLA', null, '2025-2029', null),
  d('giudici', 'Giudici', 'Silvana Giudici', 'CABA', 'LLA', null, '2023-2027', 'PRO'),
  d('gmontenegro', 'G. Montenegro', 'Guillermo Montenegro', 'Buenos Aires', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('goitia', 'Goitia', 'Rosario Goitia', 'Chaco', 'LLA', null, '2025-2029', null),
  d('gonzales', 'Gonzales', 'Alfredo Gonzales', 'Jujuy', 'LLA', null, '2025-2029', null),
  d('gonzalezestevarena', 'González Estevarena', 'María Luisa González Estevarena', 'Buenos Aires', 'LLA', null, '2025-2029', null),
  d('gruber', 'Gruber', 'Maura Gruber', 'Misiones', 'LLA', null, '2025-2029', null),
  d('guzman', 'Guzmán', 'Jairo Guzmán', 'Santa Cruz', 'LLA', null, '2025-2029', null),
  d('hartfield', 'Hartfield', 'Diego Hartfield', 'Misiones', 'LLA', null, '2025-2029', null),
  d('holzman', 'Holzman', 'Patricia Holzman', 'CABA', 'LLA', null, '2025-2029', null),
  d('huesen', 'Huesen', 'Gerardo Huesen', 'Tucumán', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('humenuk', 'Humenuk', 'Gladys Humenuk', 'Buenos Aires', 'LLA', null, '2025-2029', null),
  d('ibanez', 'Ibañez', 'María Cecilia Ibañez', 'Córdoba', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('jmontenegro', 'J. Montenegro', 'Juan Pablo Montenegro', 'Santa Fe', 'LLA', null, '2025-2029', null),
  d('laumann', 'Laumann', 'Andrés Ariel Laumann', 'Entre Ríos', 'LLA', null, '2025-2029', null),
  d('lemoine', 'Lemoine', 'Lilia Lemoine', 'Buenos Aires', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('leone', 'Leone', 'Andrés Leone', 'CABA', 'LLA', null, '2025-2029', null),
  d('llano', 'Llano', 'Mercedes Llano', 'Mendoza', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('lluch', 'Lluch', 'Enrique Lluch', 'Córdoba', 'LLA', null, '2025-2029', null),
  d('longo', 'Longo', 'Johanna Sabrina Longo', 'Buenos Aires', 'LLA', null, '2025-2029', null),
  d('macyszyn', 'Macyszyn', 'Lorena Macyszyn', 'Buenos Aires', 'LLA', null, '2023-2027', 'Buenos Aires Libre'),
  d('matzkin', 'Matzkin', 'Martín Matzkin', 'La Pampa', 'LLA', null, '2025-2029', null),
  d('mayoraz', 'Mayoraz', 'Nicolás Mayoraz', 'Santa Fe', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('menem', 'Menem', 'Martín Menem', 'La Rioja', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('metralasensio', 'Metral Asensio', 'Julieta Metral Asensio', 'Mendoza', 'LLA', null, '2025-2029', null),
  d('molinuevo', 'Molinuevo', 'Soledad Molinuevo', 'Tucumán', 'LLA', null, '2025-2029', null),
  d('mondaca', 'Mondaca', 'Soledad Mondaca', 'Neuquén', 'LLA', null, '2025-2029', null),
  d('morchio', 'Morchio', 'Francisco Morchio', 'Entre Ríos', 'LLA', null, '2023-2027', 'Hacemos Coalición Federal'),
  d('morenoovalle', 'Moreno Ovalle', 'Julio Moreno Ovalle', 'Salta', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('munoz', 'Muñoz', 'Gabriela Luciana Muñoz', 'Neuquén', 'LLA', null, '2023-2027', null),
  d('niveyro', 'Niveyro', 'Miriam Niveyro', 'Buenos Aires', 'LLA', null, '2025-2029', null),
  d('ojeda', 'Ojeda', 'Joaquín Ojeda', 'Buenos Aires', 'LLA', null, '2025-2029', null),
  d('pareja', 'Pareja', 'Sebastián Pareja', 'Buenos Aires', 'LLA', null, '2025-2029', null),
  d('patinobrizuela', 'Patiño Brizuela', 'Marcos Patiño Brizuela', 'Córdoba', 'LLA', null, '2025-2029', null),
  d('pauli', 'Pauli', 'Santiago Pauli', 'Tierra del Fuego', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('pellegrini', 'Pellegrini', 'Agustín Pellegrini', 'Santa Fe', 'LLA', null, '2025-2029', null),
  d('pelli', 'Pelli', 'Federico Agustín Pelli', 'Tucumán', 'LLA', null, '2025-2029', null),
  d('peluc', 'Peluc', 'José Peluc', 'San Juan', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('petri', 'Petri', 'Luis Petri', 'Mendoza', 'LLA', null, '2025-2029', null),
  d('petrovich', 'Petrovich', 'María Lorena Petrovich', 'Buenos Aires', 'LLA', null, '2023-2027', null),
  d('picat', 'Picat', 'Luis Albino Picat', 'Córdoba', 'LLA', null, '2023-2027', 'UCR'),
  d('ponce', 'Ponce', 'María Celeste Ponce', 'Córdoba', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('quintar', 'Quintar', 'Manuel Quintar', 'Jujuy', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('ravera', 'Ravera', 'Valentina Ravera', 'Santa Fe', 'LLA', null, '2025-2029', null),
  d('razzini', 'Razzini', 'Verónica Razzini', 'Santa Fe', 'LLA', null, '2023-2027', 'PRO'),
  d('reichardt', 'Reichardt', 'Karen Reichardt', 'Buenos Aires', 'LLA', null, '2025-2029', null),
  d('riesco', 'Riesco', 'Gastón Riesco', 'Neuquén', 'LLA', null, '2025-2029', null),
  d('roca', 'Roca', 'Gonzalo Roca', 'Córdoba', 'LLA', null, '2025-2029', null),
  d('rodriguez', 'Rodríguez', 'Miguel Rodríguez', 'Tierra del Fuego', 'LLA', null, '2025-2029', null),
  d('rodriguezmachado', 'Rodríguez Machado', 'Laura Elena Rodríguez Machado', 'Córdoba', 'LLA', null, '2025-2029', 'PRO'),
  d('rtorres', 'R. Torres', 'Rubén Darío Torres', 'Buenos Aires', 'LLA', null, '2025-2029', null),
  d('santillanjuarezbrahim', 'Santillán Juárez Brahim', 'Juliana Santillán Juárez Brahim', 'Buenos Aires', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('santurio', 'Santurio', 'Santiago Santurio', 'Buenos Aires', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('soldano', 'Soldano', 'Laura Soldano', 'Córdoba', 'LLA', null, '2025-2029', null),
  d('tomassoni', 'Tomassoni', 'Yamile Tomassoni', 'Santa Fe', 'LLA', null, '2025-2029', null),
  d('tortoriello', 'Tortoriello', 'Aníbal Tortoriello', 'Río Negro', 'LLA', null, '2025-2029', 'PRO'),
  d('tournier', 'Tournier', 'José Federico Tournier', 'Corrientes', 'LLA', null, '2023-2027', null),
  d('treffinger', 'Treffinger', 'César Treffinger', 'Chubut', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('urien', 'Urien', 'Hernán Urien', 'Buenos Aires', 'LLA', null, '2025-2029', null),
  d('vasquez', 'Vásquez', 'Patricia Vásquez', 'Buenos Aires', 'LLA', null, '2023-2027', 'PRO'),
  d('vera', 'Vera', 'Andrea Fernanda Vera', 'Buenos Aires', 'LLA', null, '2025-2029', null),
  d('villaverde', 'Villaverde', 'Lorena Villaverde', 'Río Negro', 'LLA', null, '2023-2027', 'La Libertad Avanza'),
  d('visconti', 'Visconti', 'Gino Visconti', 'La Rioja', 'LLA', null, '2025-2029', null),
  d('zapata', 'Zapata', 'Carlos Raúl Zapata', 'Salta', 'LLA', null, '2025-2029', 'La Libertad Avanza'),
];

const ids = (filtro) => DIPUTADOS.filter(filtro).map((x) => x.id);
const en = (...bloques) => ids((x) => bloques.includes(x.bloque));

// Escenarios de un toque. El primero es el estado inicial de la planilla: la
// votación de la Ley de Bases sobre los 257 de hoy.
export const PRESETS = [
  {
    id: VOTACION.id,
    label: 'Ley de Bases 2/2/2024: cómo votaron los 144 que siguen en la Cámara',
    favor: VOTACION.favor,
    contra: VOTACION.contra,
    preside: VOTACION.preside,
    noestaba: VOTACION.noestaba,
  },
  {
    id: 'sin_uxp',
    label: 'Sin Unión por la Patria ni la izquierda: los otros 161 presentes y a favor',
    favor: ids((x) => !['UXP', 'FIT'].includes(x.bloque)),
    contra: [],
  },
  {
    id: 'lla_pro',
    label: 'Solo LLA + PRO (107)',
    favor: en('LLA', 'PRO'),
    contra: [],
  },
  {
    id: 'nucleo',
    label: 'LLA + PRO + UCR + Coalición Cívica + otros (119)',
    favor: en('LLA', 'PRO', 'UCR', 'CC', 'OTROS'),
    contra: [],
  },
  {
    id: 'nucleo_fed',
    label: 'Los 119 + federales (130)',
    favor: en('LLA', 'PRO', 'UCR', 'CC', 'OTROS', 'FED'),
    contra: [],
  },
  {
    id: 'completa',
    label: 'Sesión completa: Unión por la Patria y la izquierda en contra',
    favor: ids((x) => !['UXP', 'FIT'].includes(x.bloque)),
    contra: en('UXP', 'FIT'),
  },
  { id: 'limpiar', label: 'Limpiar', favor: [], contra: [] },
];

// Qué queda de la votación de 2024 en la Cámara de hoy, por familia de bloque actual.
export const DESDE_2024 = [
  { code: 'FIT', bloque: 'Frente de Izquierda', bancas: 4, favor: 0, contra: 3, ausentes: 0, preside: 0, noestaba: 1 },
  { code: 'UXP', bloque: 'Unión por la Patria', bancas: 92, favor: 0, contra: 52, ausentes: 2, preside: 0, noestaba: 38 },
  { code: 'PROV', bloque: 'Provinciales', bancas: 13, favor: 4, contra: 4, ausentes: 0, preside: 0, noestaba: 5 },
  { code: 'FED', bloque: 'Federales', bancas: 11, favor: 8, contra: 0, ausentes: 0, preside: 0, noestaba: 3 },
  { code: 'PU', bloque: 'Provincias Unidas', bancas: 18, favor: 9, contra: 2, ausentes: 1, preside: 0, noestaba: 6 },
  { code: 'CC', bloque: 'Coalición Cívica', bancas: 2, favor: 2, contra: 0, ausentes: 0, preside: 0, noestaba: 0 },
  { code: 'UCR', bloque: 'UCR', bancas: 6, favor: 3, contra: 0, ausentes: 0, preside: 0, noestaba: 3 },
  { code: 'OTROS', bloque: 'Otros', bancas: 4, favor: 4, contra: 0, ausentes: 0, preside: 0, noestaba: 0 },
  { code: 'PRO', bloque: 'PRO', bancas: 12, favor: 8, contra: 0, ausentes: 0, preside: 0, noestaba: 4 },
  { code: 'LLA', bloque: 'LLA', bancas: 95, favor: 41, contra: 0, ausentes: 0, preside: 1, noestaba: 53 },
];

export const QUIEN_CIERRA = [
  {
    dt: '129',
    b: 'Quórum (art. 15).',
    t: 'Unión por la Patria y la izquierda suman 96: sin ellos quedan 161 y la sesión se abre igual aunque falten 32 más. Para dejar la Cámara sin quórum necesitan que se queden afuera 33 de esos 161. LLA + PRO (107) no la abren solos: les faltan 22.',
  },
  {
    dt: '119 + 10',
    b: 'LLA + PRO + UCR + Coalición Cívica + otros',
    t: 'hacen 119 y siguen 10 abajo del quórum. Lo cierran los federales (Argentina Federal 9 + Encuentro Federal 2 = 130, margen +1), los provinciales (13, 132) o Provincias Unidas (18, 137): cualquier combinación de 10 entre esos 42.',
  },
  {
    dt: '81 de 161',
    b: 'Mayoría con Unión por la Patria y la izquierda ausentes (art. 194).',
    t: 'Con 161 votos emitidos, más de la mitad son 81. LLA + PRO (107) la superan solos y de sobra.',
  },
  {
    dt: '129 de 257',
    b: 'Si Unión por la Patria y la izquierda se sientan y votan en contra (96),',
    t: 'la mayoría sube a 129 y vuelve a ser el núcleo de 119 más 10 de los federales, los provinciales o Provincias Unidas. Para ganar una votación, la oposición también necesita 129: con Provincias Unidas, la Coalición Cívica y la UCR llega a 122, y recién con los provinciales (135) o los federales (133) pasa.',
  },
  {
    dt: '172',
    b: 'Dos tercios (arts. 133 a 135 del Reglamento y art. 81 de la Constitución).',
    t: 'Dos tercios de los votos emitidos: con los 257 presentes son 172, y sin Unión por la Patria y la izquierda nadie llega (161). Con ellos ausentes, dos tercios de 161 son 108: LLA + PRO (107) quedan uno abajo y con la UCR (113) los superan. Importa porque Diputados es cámara revisora: si corrige la media sanción con dos tercios de los presentes, el Senado necesita dos tercios para insistir con su texto; si la corrige con mayoría absoluta, al Senado le alcanza la mayoría absoluta para insistir.',
  },
  {
    dt: 'empate',
    b: 'Empate (art. 196).',
    t: 'Se reabre la discusión y se vota de nuevo; si persiste, decide el presidente de la Cámara (Menem, LLA), que fuera del empate solo vota en los asuntos que exigen mayoría absoluta o especial por la Constitución o en los que haya tomado parte del debate (art. 41).',
  },
];

export const LEY_BASES = [
  'Corte de biodiésel (art. 8 nuevo): 10% desde la vigencia, 11% desde el 1/1/2025 y 12,5% desde el 1/4/2026; después, y no antes de tres años, la Autoridad de Aplicación proponía al Congreso subas hasta 15%. Patagonia 10%. Excepción solo por escasez general y comprobada de materia prima.',
  'Integradas (art. 11 nuevo): todas las elaboradoras, "sin distinción de materia prima de origen, ni de su condición de integradas o no integradas, ni de su composición societaria", con derecho a participar en el mercado interno y en el de exportación. La ley llamaba integradas a las "empresas que producen materia prima": integrada era la que tenía el aceite, no la que superaba un tamaño.',
  'Dos segmentos igualados por el factor de utilización (art. 13 nuevo, a.3): en cada año calendario, la relación entre la producción real (propia y a façon) y la capacidad instalada del conjunto de las integradas debía ser igual a la del conjunto de las restantes elaboradoras, las no integradas, verificando la composición societaria de cada grupo empresario. Cada conjunto se llevaba el volumen proporcional a su capacidad, con el mismo factor de utilización, y eso se mantenía todo el tiempo: sin transición ni cupo fijo.',
  'Precio y volúmenes (art. 13 nuevo): un sistema único de licitaciones transparentes, de acceso público y periódicas, que la Autoridad de Aplicación debía lanzar a los 30 días de vigencia. La adjudicación a cada empresa no podía superar el 14% del volumen licitado (a.1) ni su capacidad instalada registrada (a.2); el incumplimiento en la entrega permitía revocar la adjudicación (c) y, si el precio adjudicado superaba la paridad de importación, se vendía al precio de importación (d).',
  'Mezcladoras (art. 10 nuevo): compran sin excepción a elaboradoras autorizadas, al precio y volumen que salen de las licitaciones. Petroleras solo sobre el excedente cuando el corte supere 15%, y nunca más del 15% de ese excedente.',
  'Qué pasó después: el 6/2/2024 la votación en particular se trabó y el proyecto volvió a comisión. El texto que Diputados aprobó el 30/4/2024 (142 a 106) ya no tenía el capítulo de biocombustibles, y la Ley 27.742 sancionada en junio tampoco.',
];

export const REGLAS = [
  {
    b: 'Art. 15.',
    t: 'Quórum: la mayoría absoluta de los miembros, es decir cuando los presentes superan a los ausentes. Son 129 de 257, siempre, sin importar las licencias.',
  },
  {
    b: 'Art. 190.',
    t: 'La votación en general de los proyectos de ley es nominal: en el acta queda el nombre y el voto de cada diputado. Esta planilla sigue la votación en general.',
  },
  {
    b: 'Art. 194.',
    t: 'Las resoluciones se toman por mayoría absoluta de los votos emitidos, más de la mitad de los que votan, salvo que la Constitución o el Reglamento exijan otra. La media sanción de biocombustibles no exige mayoría especial.',
  },
  {
    b: 'Art. 197.',
    t: 'Ningún diputado puede dejar de votar sin permiso de la Cámara. La abstención autorizada descuenta de la base: mayoría y dos tercios se calculan sobre los votos emitidos.',
  },
  {
    b: 'Arts. 41 y 196.',
    t: 'Empate: se reabre la discusión y, si persiste, decide el presidente con su voto. Fuera del empate, el presidente puede votar en los asuntos en los que tomó parte del debate y en los que exigen mayoría absoluta o especial por la Constitución; en la Ley de Bases, Menem no votó.',
  },
  {
    b: 'Arts. 133 a 135.',
    t: 'Preferencia con despacho de comisión: mayoría absoluta de los votos emitidos. Preferencia sin despacho, sobre tablas y reconsideración: dos tercios de los votos emitidos.',
  },
  {
    b: 'Art. 81 de la Constitución.',
    t: 'Diputados es cámara revisora. Si aprueba el texto del Senado como vino, pasa al Ejecutivo. Si lo corrige, tiene que indicar si lo hizo con mayoría absoluta o con dos tercios de los presentes y el proyecto vuelve al Senado, que puede aceptar las correcciones o insistir con su texto con la misma mayoría. Un proyecto desechado totalmente no puede repetirse en las sesiones de ese año.',
  },
];

export const FUENTES = [
  { label: 'acta 5101 de la Plataforma de Votaciones Abiertas', href: 'https://votaciones.hcdn.gob.ar/votacion/5101' },
  { label: 'acta en PDF', href: 'https://votaciones.hcdn.gob.ar/pdf/acta/5101' },
  { label: 'Diario de Sesiones del 2/2/2024', href: 'https://www4.hcdn.gob.ar/dependencias/dtaquigrafos/diarios/periodo-141/diario_2024020214.pdf' },
  { label: 'Orden del Día 1/2024 (texto votado)', href: 'https://www4.hcdn.gob.ar/dependencias/dcomisiones/periodo-141/141-1.pdf' },
  { label: 'nómina de diputados', href: 'https://www.hcdn.gob.ar/diputados/' },
  { label: 'Reglamento HCDN', href: 'https://www3.hcdn.gob.ar/institucional/autoridades/reglamento2020.pdf' },
];
