// Analista (Agente Explorarg) - catálogo cerrado de lo que se puede pedir.
//
// Misma regla que el Polígrafo (HDO, 22/11/2026): la IA solo traduce el pedido a
// una consulta armada con este catálogo; los números los calcula el motor
// (motor.js) con los JSON del sitio. Lo que no está acá, no se puede pedir.
//
// Lo usan tres lados: la consigna de la IA, el motor y la página (los menús con
// que la persona corrige la consulta sin volver a preguntarle a la IA).

import { FUENTE_DATOS, FUENTE_PRECIOS, MAGNITUDES } from '../poligrafo/catalogo.js';

export { EQUIVALENCIAS, PRODUCTOS } from '../poligrafo/catalogo.js';

export const FUENTE_ACEITE = 'Fuente: Secretaría de Energía, nota del 14/10/2026 sobre la relación del precio del aceite, procesada por www.explorarg.com.';

// Qué clase de respuesta se pide.
export const TIPOS = {
  ranking: { etiqueta: 'Ranking', queEs: 'Ordena empresas, grupos, provincias, petroleras o zonas por una medida, en un período.' },
  evolucion: { etiqueta: 'Evolución en el tiempo', queEs: 'Muestra una medida mes por mes o año por año.' },
  total: { etiqueta: 'Un total', queEs: 'Da un solo número: la medida de un conjunto en un período.' },
  comparacion: { etiqueta: 'Comparación entre dos períodos', queEs: 'Compara la medida entre un período inicial y uno final.' },
};

// Por qué se puede agrupar.
export const DIMENSIONES = {
  empresa: { titulo: 'Empresa', por: 'por empresa' },
  grupo: { titulo: 'Grupo económico', por: 'por grupo económico' },
  categoria: { titulo: 'Categoría', por: 'por categoría (integradas y no integradas)' },
  provincia: { titulo: 'Provincia', por: 'por provincia' },
  localidad: { titulo: 'Localidad', por: 'por localidad' },
  camara: { titulo: 'Cámara', por: 'por cámara' },
  petrolera: { titulo: 'Petrolera', por: 'por petrolera compradora' },
  zona: { titulo: 'Zona', por: 'por zona de distancia a Rosario' },
};

const DE_EMPRESA = ['empresa', 'grupo', 'categoria', 'provincia', 'localidad', 'camara'];
const TABLERO_EMPRESAS = { etiqueta: 'Mercado - Detalle por empresa', ruta: '/mercado/empresa', origen: FUENTE_DATOS };
const TABLERO_CORTE = { etiqueta: 'Cumplimiento Corte', ruta: '/gestion', origen: FUENTE_DATOS };
const TABLERO_PRECIOS = { etiqueta: 'Gas Oil - Biodiésel vs. gas oil', ruta: '/gas-oil/biodiesel', origen: FUENTE_PRECIOS };

const volumen = (magnitud, nombre, queMide) => ({
  nombre,
  queMide,
  unidad: 't',
  decimales: 0,
  familia: 'empresas',
  aditiva: true,
  idx: MAGNITUDES[magnitud].idx,
  dims: DE_EMPRESA,
  fuente: TABLERO_EMPRESAS,
});

// Las medidas. `familia` dice de qué datos sale y `dims`, por qué se puede agrupar.
// `aditiva`: los grupos se pueden sumar (y tiene sentido un "% del total").
export const METRICAS = {
  ventas_cupo: volumen('ventas_cupo', 'Ventas al cupo', 'Toneladas de biodiésel vendidas al mercado interno para el corte obligatorio.'),
  produccion: volumen('produccion', 'Producción', 'Toneladas de biodiésel producidas.'),
  cupo_asignado: volumen('cupo_asignado', 'Cupo asignado', 'Toneladas de cupo que la Secretaría de Energía le asignó a cada empresa.'),
  exportacion: volumen('exportacion', 'Exportaciones', 'Toneladas de biodiésel exportadas.'),
  ventas_extracupo: volumen('ventas_extracupo', 'Ventas fuera de cupo', 'Toneladas vendidas al mercado interno por fuera del cupo.'),
  cumplimiento_cupo: {
    nombre: 'Cumplimiento del cupo',
    queMide: 'Qué porcentaje del cupo asignado se vendió: ventas al cupo sobre cupo asignado.',
    unidad: '%',
    decimales: 1,
    familia: 'empresas',
    aditiva: false,
    dims: DE_EMPRESA,
    fuente: TABLERO_EMPRESAS,
  },
  capacidad: {
    nombre: 'Capacidad instalada',
    queMide: 'Toneladas por año de capacidad de las plantas en operación (la foto más reciente; no tiene período).',
    unidad: 't/año',
    decimales: 0,
    familia: 'empresas',
    aditiva: true,
    sinTiempo: true,
    dims: DE_EMPRESA,
    fuente: { etiqueta: 'Mercado - Capacidad instalada', ruta: '/mercado/capacidad', origen: FUENTE_DATOS },
  },
  uso_capacidad: {
    nombre: 'Uso de la capacidad instalada',
    queMide: 'Qué porcentaje de la capacidad en operación se usó: producción del período sobre la capacidad de esos meses.',
    unidad: '%',
    decimales: 1,
    familia: 'empresas',
    aditiva: false,
    dims: DE_EMPRESA,
    fuente: { etiqueta: 'Mercado - Capacidad instalada', ruta: '/mercado/capacidad', origen: FUENTE_DATOS },
  },
  compras: {
    nombre: 'Compras de biodiésel para el corte',
    queMide: 'Toneladas de biodiésel que cada petrolera les compró a las elaboradoras para el corte obligatorio.',
    unidad: 't',
    decimales: 0,
    familia: 'compras',
    aditiva: true,
    dims: ['petrolera', ...DE_EMPRESA],
    fuente: { etiqueta: 'Mercado - Compras al cupo', ruta: '/mercado/compras-cupo', origen: FUENTE_DATOS },
  },
  corte_real: {
    nombre: 'Corte real',
    queMide: 'Porcentaje de biodiésel efectivamente mezclado en el gas oil.',
    unidad: '%',
    decimales: 2,
    familia: 'corte',
    aditiva: false,
    dims: [],
    fuente: TABLERO_CORTE,
  },
  corte_obligatorio: {
    nombre: 'Corte obligatorio',
    queMide: 'Porcentaje de corte que manda la norma (ponderado por las ventas de gas oil).',
    unidad: '%',
    decimales: 2,
    familia: 'corte',
    aditiva: false,
    dims: [],
    fuente: TABLERO_CORTE,
  },
  cumplimiento_corte: {
    nombre: 'Cumplimiento del corte',
    queMide: 'Corte real dividido corte obligatorio.',
    unidad: '%',
    decimales: 1,
    familia: 'corte',
    aditiva: false,
    dims: [],
    fuente: TABLERO_CORTE,
  },
  faltante: {
    nombre: 'Biodiésel que faltó para cumplir el corte',
    queMide: 'Toneladas de biodiésel que faltaron para llegar al corte obligatorio.',
    unidad: 't',
    decimales: 0,
    familia: 'corte',
    aditiva: true,
    dims: [],
    fuente: { etiqueta: 'Cumplimiento Corte - Déficit', ruta: '/gestion/deficit', origen: FUENTE_DATOS },
  },
  gasoil_vendido: {
    nombre: 'Gas oil vendido (grados 2 y 3)',
    queMide: 'Metros cúbicos de gas oil grado 2 y grado 3 vendidos en el país: la base sobre la que se mide el corte.',
    unidad: 'm³',
    decimales: 0,
    familia: 'corte',
    aditiva: true,
    dims: [],
    fuente: TABLERO_CORTE,
  },
  precio: {
    nombre: 'Precio por litro',
    queMide: 'Pesos por litro de un producto (biodiésel, gas oil, bioetanol, nafta o los impuestos del gas oil). Pide el parámetro producto.',
    unidad: '$/l',
    decimales: 0,
    familia: 'precios',
    aditiva: false,
    dims: [],
    pide: ['producto'],
    fuente: TABLERO_PRECIOS,
  },
  brecha_precio: {
    nombre: 'Diferencia de precio entre dos productos',
    queMide: 'Cuánto más caro, en porcentaje, es un producto que otro (por ejemplo, el biodiésel contra el gas oil fósil). Pide producto, producto_base y equivalencia.',
    unidad: '%',
    decimales: 1,
    familia: 'precios',
    aditiva: false,
    dims: [],
    pide: ['producto', 'producto_base', 'equivalencia'],
    fuente: TABLERO_PRECIOS,
  },
  precio_aceite: {
    nombre: 'Precio de compra del aceite según la distancia a Rosario',
    queMide: 'Índice del precio al que las elaboradoras compran el aceite, por zona de distancia de la planta a Rosario (Rosario = 100). De la nota de la Secretaría de Energía del 14/10/2026. Se agrupa siempre por zona.',
    unidad: 'índice',
    decimales: 1,
    familia: 'aceite',
    aditiva: false,
    dims: ['zona'],
    agruparSiempre: 'zona',
    // en las barras se dibuja la distancia a la base: con el eje desde cero, 96 y 98 se ven iguales
    base: { valor: 100, leyenda: 'Diferencia con el precio de Rosario, en puntos del índice (Rosario = 100). Hacia la izquierda, más barato que Rosario.' },
    fuente: { etiqueta: 'Relación del precio del aceite', ruta: '/relacion-precio-aceite', origen: FUENTE_ACEITE },
  },
};

export const TIEMPOS = { mes: 'Mes por mes', anio: 'Año por año' };
export const ORDENES = { mayor: 'De mayor a menor', menor: 'De menor a mayor' };
export const ORDENAR_POR = {
  valor: 'Por el valor del período final',
  diferencia: 'Por la diferencia entre los dos períodos',
  variacion: 'Por la variación en porcentaje',
};

// Filtros que admite cada familia (los de empresa valen para la vendedora en las compras).
export const FILTROS_DE = {
  empresas: ['categoria', 'provincia', 'grupo', 'camara', 'empresa'],
  compras: ['petrolera', 'categoria', 'provincia', 'grupo', 'camara', 'empresa'],
  corte: [],
  precios: [],
  aceite: [],
};

export const TOPE_MAXIMO = 60;
