// Polígrafo - catálogo cerrado de lo que se puede medir.
//
// Regla de diseño (HDO, 22/11/2026): la IA solo traduce el enunciado a una
// forma lógica eligiendo de este catálogo; los números y el veredicto los
// calcula el motor (motor.js) con los JSON del sitio. Lo que no está acá, la
// IA no lo puede pedir.
//
// Este archivo lo usan tres lados: el traductor con IA (para armar la
// consigna), el motor (para calcular) y la página (para los menús y textos).

export const VERSION_CATALOGO = 1;

// Cómo se nombran las cosas en lo que ve el público (HDO, 22/11/2026):
// - los datos llevan siempre la fuente, no "dato del sitio";
// - quien lee y juzga es "explorarg.com", nunca "la IA".
export const FUENTE_DATOS = 'Fuente: datos de la Secretaría de Energía, procesados por www.explorarg.com.';
// Los precios salen de la Secretaría de Energía; los impuestos, de la Secretaría de Hacienda.
export const FUENTE_PRECIOS = 'Fuente: datos de la Secretaría de Energía y de la Secretaría de Hacienda, procesados por www.explorarg.com.';
export const AUTOR = 'explorarg.com';
// Cómo se nombra a los grupos económicos en lo que ve el público (regla de HDO del
// 19/9/2026 para las piezas públicas). Los datos del sitio y los códigos de sujeto
// siguen usando el nombre del maestro; esto es solo lo que se muestra.
export const NOMBRE_PUBLICO_GRUPO = {
  'GRUPO BOJANICH': 'Grupo Bahía Energía',
  'GRUPO PUCCIARIELLO': 'Grupo Rosario Bio',
  'GRUPO BOLZÁN': 'Grupo Bolzan',
};
export const grupoPublico = (grupo) => NOMBRE_PUBLICO_GRUPO[grupo] ?? grupo;
/** Pasa a los nombres públicos los grupos que aparezcan dentro de un texto. */
export function conNombresPublicos(txt) {
  let t = String(txt ?? '');
  for (const [maestro, publico] of Object.entries(NOMBRE_PUBLICO_GRUPO)) {
    // "GRUPO BOLZÁN" también puede venir sin tilde
    const patron = maestro.replace('Á', '[ÁA]').replace(/ /g, '\\s+');
    t = t.replace(new RegExp(`(?:\\bel\\s+)?${patron}`, 'gi'), (m) => {
      const articulo = m.match(/^(el)\s/i); // se conserva como venía: "El" o "el"
      return articulo ? `${articulo[1]} ${publico}` : publico;
    });
  }
  return t;
}

// La frase que acompaña a una opinión que choca con los hechos (HDO, 22/11/2026).
export const LEMA_OPINION = 'Todos tenemos derecho a una opinión. A lo que no tenemos derecho es a datos propios.';

// Posición de cada magnitud en la serie por empresa de empresas.json:
// [fecha, prod, cupo, vc, xq, exp, cotab]
export const MAGNITUDES = {
  ventas_cupo: {
    idx: 3,
    etiqueta: 'ventas al cupo',
    larga: 'ventas al cupo (biodiésel vendido al mercado interno para el corte obligatorio)',
  },
  produccion: { idx: 1, etiqueta: 'producción', larga: 'producción de biodiésel' },
  cupo_asignado: {
    idx: 2,
    etiqueta: 'cupo asignado',
    larga: 'cupo asignado por la Secretaría de Energía',
  },
  exportacion: { idx: 5, etiqueta: 'exportaciones', larga: 'exportaciones de biodiésel' },
  ventas_extracupo: {
    idx: 4,
    etiqueta: 'ventas fuera de cupo',
    larga: 'ventas al mercado interno por fuera del cupo',
  },
};

// Qué hace falta para que una empresa "cuente" en un período.
export const CRITERIOS = {
  ventas_cupo: { etiqueta: 'con ventas al cupo', menu: 'Las que vendieron al cupo' },
  produccion: { etiqueta: 'con producción', menu: 'Las que produjeron biodiésel' },
  cupo_asignado: { etiqueta: 'con cupo asignado', menu: 'Las que tuvieron cupo asignado' },
  exportacion: { etiqueta: 'con exportaciones', menu: 'Las que exportaron' },
  con_planta: {
    etiqueta: 'con planta en operación',
    menu: 'Las que tienen planta en operación',
    sinPeriodo: true,
  },
};

// Contra qué se mide una participación.
export const BASES = {
  total: {
    etiqueta: 'sobre el total',
    menu: 'Sobre el total de todas las empresas',
  },
  corte_obligatorio: {
    etiqueta: 'sobre lo que manda la ley',
    menu: 'Sobre lo que manda la ley: lo vendido más lo que faltó para cumplir el corte',
    soloMagnitud: 'ventas_cupo',
  },
};

export const MEDIDAS_CORTE = {
  real: { etiqueta: 'Corte real', menu: 'El corte real (lo que efectivamente se mezcló)' },
  obligatorio: { etiqueta: 'Corte obligatorio', menu: 'El corte que manda la ley' },
  cumplimiento: {
    etiqueta: 'Cumplimiento del corte',
    menu: 'El cumplimiento (corte real dividido corte obligatorio)',
  },
};

// Productos con precio por litro (precios.js). `clave` es el campo de la fila mensual.
// Los que llevan `soloNivel` no entran en una comparación de precios.
export const PRODUCTOS = {
  biodiesel: {
    etiqueta: 'biodiésel',
    menu: 'Biodiésel: el precio oficial para el corte obligatorio, sin impuestos',
    nota: 'Biodiésel: precio oficial para el corte obligatorio que publica la Secretaría de Energía, pasado a pesos por litro con el tipo de cambio del mes.',
    energia: 'biodiesel',
  },
  gasoil_fosil: {
    etiqueta: 'gas oil fósil local',
    menu: 'Gas oil fósil local: el grado 2 mayorista sin impuestos, sin el biodiésel que lleva mezclado',
    nota: 'Gas oil fósil local: grado 2 mayorista sin impuestos del relevamiento de la Secretaría de Energía (Res. 1104/2004), ponderado por volumen y descontado el biodiésel que llevaba mezclado ese mes.',
    energia: 'gasoil',
  },
  gasoil_importado: {
    etiqueta: 'gas oil importado',
    menu: 'Gas oil importado, puesto en puerto (CIF), sin impuestos',
    nota: 'Gas oil importado: valor CIF de los despachos del mes, puesto en puerto, pasado a pesos por litro.',
    energia: 'gasoil',
  },
  gasoil_surtidor: {
    etiqueta: 'gas oil en el surtidor',
    menu: 'Gas oil grado 2 en el surtidor, con impuestos',
    nota: 'Gas oil en el surtidor: grado 2 al público, con impuestos, del relevamiento de la Secretaría de Energía (Res. 1104/2004), ponderado por volumen.',
    energia: 'gasoil',
    conImpuestos: true,
  },
  bioetanol: {
    etiqueta: 'bioetanol',
    menu: 'Bioetanol: el precio oficial para el corte obligatorio (promedio de caña y maíz), sin impuestos',
    nota: 'Bioetanol: precio oficial para el corte obligatorio que publica la Secretaría de Energía, promedio de caña y maíz (la ley reparte el corte mitad y mitad).',
    energia: 'bioetanol',
  },
  nafta_fosil: {
    etiqueta: 'nafta fósil',
    menu: 'Nafta fósil en refinería: la súper mayorista sin impuestos, sin el bioetanol que lleva mezclado',
    nota: 'Nafta fósil: nafta súper mayorista sin impuestos del relevamiento de la Secretaría de Energía (Res. 1104/2004), ponderada por volumen y descontado el 12% de bioetanol que manda la ley (el sitio no tiene el corte real de bioetanol). Es una estimación del precio en refinería.',
    energia: 'nafta',
  },
  nafta_surtidor: {
    etiqueta: 'nafta en el surtidor',
    menu: 'Nafta súper en el surtidor, con impuestos',
    nota: 'Nafta en el surtidor: súper al público, con impuestos, del relevamiento de la Secretaría de Energía (Res. 1104/2004), ponderada por volumen.',
    energia: 'nafta',
    conImpuestos: true,
  },
  impuestos_gasoil: {
    etiqueta: 'impuestos del gas oil',
    menu: 'Los impuestos que paga el litro de gas oil (combustibles líquidos más dióxido de carbono)',
    nota: 'Impuestos del gas oil: impuesto a los combustibles líquidos (ICL) más impuesto al dióxido de carbono (ICO2), tarifa general, según la Secretaría de Hacienda. El biodiésel no los paga.',
    soloNivel: true,
  },
};

// Cómo se comparan dos precios: litro contra litro, o a igual energía (un litro de
// biocombustible tiene menos energía que uno de fósil: datos_tecnicos.json).
export const EQUIVALENCIAS = {
  por_litro: { etiqueta: 'por litro', menu: 'Litro contra litro' },
  por_energia: { etiqueta: 'a igual energía', menu: 'A igual energía: el litro de biocombustible rinde menos que el de fósil' },
};

export const COMPARADORES = {
  igual: { simbolo: '=', texto: 'es' },
  aprox: { simbolo: '≈', texto: 'es alrededor de' },
  mayor: { simbolo: '>', texto: 'es más de' },
  mayor_igual: { simbolo: '≥', texto: 'es al menos' },
  menor: { simbolo: '<', texto: 'es menos de' },
  menor_igual: { simbolo: '≤', texto: 'es a lo sumo' },
  incluye: { simbolo: '⊇', texto: 'incluye' },
};

export const CATEGORIAS = ['INTEGRADA', 'NO INTEGRADA', 'COMERCIALIZADORA'];

// Tipos de filtro que admite el "sujeto" (se combinan con "+").
export const FILTROS = {
  categoria: 'categoría',
  empresa: 'empresa',
  grupo: 'grupo económico',
  provincia: 'provincia',
  localidad: 'localidad',
  camara: 'cámara',
};

// Los indicadores. `parametros` son los que el motor necesita sí o sí.
export const INDICADORES = {
  cantidad_empresas: {
    nombre: 'Cantidad de empresas',
    queMide:
      'Cuántas empresas elaboradoras cumplen un criterio (vendieron al cupo, produjeron, tuvieron cupo, exportaron o tienen planta en operación) en un período. Sirve también para "hay una planta en tal localidad" (cantidad mayor o igual a 1).',
    parametros: ['sujeto', 'criterio', 'periodo'],
    valor: 'numero',
    unidad: 'empresas',
    entero: true,
    comparadores: ['igual', 'aprox', 'mayor', 'mayor_igual', 'menor', 'menor_igual'],
    fuente: { etiqueta: 'Mercado - Detalle por empresa', ruta: '/mercado/empresa' },
  },
  cantidad_grupos: {
    nombre: 'Cantidad de grupos económicos',
    queMide:
      'Cuántos grupos económicos distintos hay detrás de las empresas que cumplen un criterio en un período.',
    parametros: ['sujeto', 'criterio', 'periodo'],
    valor: 'numero',
    unidad: 'grupos',
    entero: true,
    comparadores: ['igual', 'aprox', 'mayor', 'mayor_igual', 'menor', 'menor_igual'],
    fuente: { etiqueta: 'Mercado - Grupos económicos', ruta: '/mercado/aceiteras' },
  },
  provincias: {
    nombre: 'Provincias donde están las empresas',
    queMide:
      'En qué provincias están las empresas que cumplen un criterio en un período. El valor es una lista de provincias.',
    parametros: ['sujeto', 'criterio', 'periodo'],
    valor: 'lista',
    unidad: 'provincias',
    comparadores: ['igual', 'incluye'],
    fuente: { etiqueta: 'Mercado - Mapa de plantas', ruta: '/mercado/plantas' },
  },
  volumen: {
    nombre: 'Volumen',
    queMide:
      'Toneladas de una magnitud (ventas al cupo, producción, cupo asignado, exportaciones, ventas fuera de cupo) de un conjunto de empresas en un período.',
    parametros: ['magnitud', 'sujeto', 'periodo'],
    valor: 'numero',
    unidad: 't',
    comparadores: ['igual', 'aprox', 'mayor', 'mayor_igual', 'menor', 'menor_igual'],
    fuente: { etiqueta: 'Mercado - Principales indicadores', ruta: '/mercado' },
  },
  participacion: {
    nombre: 'Participación',
    queMide:
      'Qué porcentaje de una magnitud corresponde a un conjunto de empresas en un período. La base es el total de esa magnitud o, para las ventas al cupo, lo que manda la ley (ventas más faltante).',
    parametros: ['magnitud', 'sujeto', 'base', 'periodo'],
    valor: 'numero',
    unidad: '%',
    comparadores: ['igual', 'aprox', 'mayor', 'mayor_igual', 'menor', 'menor_igual'],
    fuente: { etiqueta: 'Mercado - Participación', ruta: '/mercado/participacion' },
  },
  corte: {
    nombre: 'Corte de biodiésel en el gas oil',
    queMide:
      'El porcentaje de corte en un período: el real (biodiésel sobre gas oil grado 2 y 3), el obligatorio que fija la norma, o el cumplimiento (real dividido obligatorio).',
    parametros: ['medida', 'periodo'],
    valor: 'numero',
    unidad: '%',
    comparadores: ['igual', 'aprox', 'mayor', 'mayor_igual', 'menor', 'menor_igual'],
    fuente: { etiqueta: 'Cumplimiento Corte', ruta: '/gestion' },
  },
  faltante: {
    nombre: 'Biodiésel que faltó para cumplir el corte',
    queMide:
      'Toneladas de biodiésel que faltaron en un período para llegar al corte obligatorio (suma de los faltantes mensuales).',
    parametros: ['periodo'],
    valor: 'numero',
    unidad: 't',
    comparadores: ['igual', 'aprox', 'mayor', 'mayor_igual', 'menor', 'menor_igual'],
    fuente: { etiqueta: 'Cumplimiento Corte - Déficit', ruta: '/gestion/deficit' },
  },
  variacion: {
    nombre: 'Variación entre dos períodos',
    queMide:
      'Cuánto cambió, en porcentaje, una magnitud de un conjunto de empresas entre un período inicial y uno final. Las caídas son negativas.',
    parametros: ['magnitud', 'sujeto', 'periodo_inicial', 'periodo'],
    valor: 'numero',
    unidad: '%',
    comparadores: ['igual', 'aprox', 'mayor', 'mayor_igual', 'menor', 'menor_igual'],
    fuente: { etiqueta: 'Mercado - Evolución', ruta: '/mercado/evolucion' },
  },
  capacidad_instalada: {
    nombre: 'Capacidad instalada',
    queMide:
      'Toneladas por año de capacidad de producción de las plantas en operación de un conjunto de empresas (según el tablero de Capacidad del sitio, sin período).',
    parametros: ['sujeto'],
    valor: 'numero',
    unidad: 't/año',
    comparadores: ['igual', 'aprox', 'mayor', 'mayor_igual', 'menor', 'menor_igual'],
    fuente: { etiqueta: 'Mercado - Capacidad instalada', ruta: '/mercado/capacidad' },
  },
  utilizacion_capacidad: {
    nombre: 'Uso de la capacidad instalada',
    queMide:
      'Qué porcentaje de su capacidad instalada usó un conjunto de empresas en un período: la producción de biodiésel del período sobre la capacidad en operación de esos meses. Sirve para "usa el 15% de la capacidad" y para la capacidad ociosa (100 menos el uso).',
    parametros: ['sujeto', 'periodo'],
    valor: 'numero',
    unidad: '%',
    comparadores: ['igual', 'aprox', 'mayor', 'mayor_igual', 'menor', 'menor_igual'],
    fuente: { etiqueta: 'Mercado - Capacidad instalada', ruta: '/mercado/capacidad' },
  },
  precio: {
    nombre: 'Precio por litro',
    queMide:
      'Pesos por litro de un producto en un mes: el biodiésel, el gas oil (fósil local, importado o en el surtidor), los impuestos que paga el gas oil, el bioetanol o la nafta (fósil en refinería o en el surtidor). Con un período de varios meses (hasta 12) es el promedio simple. Hay datos desde 2010 (impuestos, desde marzo de 2018; bioetanol y nafta fósil, desde junio de 2018).',
    parametros: ['producto', 'periodo'],
    valor: 'numero',
    unidad: '$/l',
    comparadores: ['igual', 'aprox', 'mayor', 'mayor_igual', 'menor', 'menor_igual'],
    fuente: { etiqueta: 'Gas Oil - Biodiésel vs. gas oil', ruta: '/gas-oil/biodiesel', origen: FUENTE_PRECIOS },
  },
  brecha_precio: {
    nombre: 'Diferencia de precio entre dos productos',
    queMide:
      'Cuánto más caro, en porcentaje, es un producto (producto) que otro (producto_base) en un mes, litro contra litro o a igual energía (equivalencia). Positivo si el primero es más caro, negativo si es más barato. Con un período de varios meses es el promedio de las diferencias de cada mes. Sirve para "el biodiésel está 80% por arriba del fósil" (80), para "el biodiésel es más caro que el gas oil" (mayor que 0) o "más barato" (menor que 0), y para "el bioetanol cuesta lo mismo que la nafta" (aprox 0).',
    parametros: ['producto', 'producto_base', 'equivalencia', 'periodo'],
    // si la frase no da motivo para preguntarlo, se compara litro contra litro
    porDefecto: { equivalencia: 'por_litro' },
    valor: 'numero',
    unidad: '%',
    // "80% por arriba" afirma un precio (1,80 veces el otro): el margen se aplica a ese precio
    margenSobrePrecio: true,
    comparadores: ['igual', 'aprox', 'mayor', 'mayor_igual', 'menor', 'menor_igual'],
    fuente: { etiqueta: 'Gas Oil - Biodiésel vs. gas oil', ruta: '/gas-oil/biodiesel', origen: FUENTE_PRECIOS },
  },
};

// Parámetros que pueden quedar abiertos y resolverse con una pregunta de menú.
export const PARAMETROS_PREGUNTABLES = [
  'sujeto',
  'criterio',
  'magnitud',
  'base',
  'medida',
  'producto',
  'producto_base',
  'equivalencia',
  'periodo',
  'periodo_inicial',
];

// Márgenes de comparación. Confirmados por HDO el 22/11/2026 ("están bien como
// se han definido"). Las cantidades de empresas se comparan exactas (motor.js).
export const MARGEN = {
  exacto: 0.02, // un número dicho sin matiz: se da por bueno a menos de 2%
  aproximado: 0.05, // "alrededor de", "casi", "unos": 5%
};
// En una diferencia de precios (brecha_precio) el margen se aplica al precio que la
// frase da a entender, no a la diferencia: "80% por arriba" es un precio de 1,80
// veces el otro, y vale si el precio real está a menos de 2% de ese (una diferencia
// de 76,4% a 83,6%). Así "cuestan lo mismo" (diferencia 0) tiene margen: 2 o 5 puntos.
// Criterio del 22/11/2026, pendiente de que lo confirme HDO.
