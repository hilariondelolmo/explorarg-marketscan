// Analista (Agente Explorarg) - catálogo cerrado de lo que se puede pedir.
//
// Misma regla que el Polígrafo (HDO, 22/11/2026): la IA solo traduce el pedido a
// una consulta armada con este catálogo; los números los calcula el motor
// (motor.js) con los JSON del sitio. Lo que no está acá, no se puede pedir.
//
// Lo usan tres lados: la consigna de la IA, el motor y la página (los menús con
// que la persona corrige la consulta sin volver a preguntarle a la IA).

import { FUENTE_DATOS, FUENTE_PRECIOS, MAGNITUDES } from '../poligrafo/catalogo.js';

// Los precios: todos los que tiene el sitio (los ocho del Polígrafo y los demás), con sus unidades.
export { EQUIVALENCIAS, GRUPOS_PRODUCTO, PRODUCTOS, UNIDADES } from './productos.js';
import { FUENTE_RANKING } from './productos.js';

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
  // la petrolera como vendedora de gas oil (las que el sitio identifica en las tablas de ventas)
  vendedora: { titulo: 'Petrolera', por: 'por petrolera' },
  sector: { titulo: 'Sector', por: 'por sector' },
  // el relevamiento de precios (Res. 1104/2004): a quién se le vende y por qué canal de distribución
  canal: { titulo: 'Canal de venta', por: 'por canal de venta' },
  distribucion: { titulo: 'Canal de distribución', por: 'por canal de distribución' },
  zona: { titulo: 'Zona', por: 'por zona de distancia a Rosario' },
};

const DE_EMPRESA = ['empresa', 'grupo', 'categoria', 'provincia', 'localidad', 'camara'];
const TABLERO_EMPRESAS = { etiqueta: 'Mercado - Detalle por empresa', ruta: '/mercado/empresa', origen: FUENTE_DATOS };
const TABLERO_CORTE = { etiqueta: 'Cumplimiento Corte', ruta: '/gestion', origen: FUENTE_DATOS };
const TABLERO_PRECIOS = { etiqueta: 'Gas Oil - Biodiésel vs. gas oil', ruta: '/gas-oil/biodiesel', origen: FUENTE_PRECIOS };
const TABLERO_SESCO = { etiqueta: 'Gas Oil - Ventas, Tablas SESCO', ruta: '/gas-oil/canales-sesco', origen: FUENTE_DATOS };
const TABLERO_PETROLERAS = { etiqueta: 'Cumplimiento Corte - Petroleras', ruta: '/gestion/petroleras', origen: FUENTE_DATOS };
const TABLERO_IMPORTACIONES = { etiqueta: 'Gas Oil - Importaciones', ruta: '/gas-oil/importaciones', origen: 'Fuente: despachos de importación de gas oil (NCM 2710.19.21) por aduana y datos de la Secretaría de Energía, procesados por www.explorarg.com.' };
const TABLERO_VENTAS_PRECIO = { etiqueta: 'Gas Oil - Ventas, precio', ruta: '/gas-oil/canales', origen: FUENTE_DATOS };
const TABLERO_RANKING = { etiqueta: 'Gas Oil - Ranking de precios', ruta: '/gas-oil/ranking', origen: FUENTE_RANKING };
// la misma página y la misma fuente con que el Polígrafo cita las retenciones (ficha.js)
const TABLERO_MARGENES = { etiqueta: 'Márgenes - Biodiésel', ruta: '/margenes', origen: FUENTE_RANKING };
const TABLERO_RETENCIONES = { etiqueta: 'Propuesta de ley S-0809/2026', ruta: '/propuesta-s0809-2026', origen: 'Fuente: decretos y resoluciones de derechos de exportación, procesados por www.explorarg.com.' };

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
// `nombraGrupo`: el nombre ya dice de quiénes habla ("de las petroleras"), así que el título no repite "por petrolera";
// `corto`: el nombre para el encabezado de la columna cuando van varias medidas juntas, y `juntas`, lo que va
// antes y después de esos nombres cortos en el título ("... de las petroleras").
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
  gasoil_importado: {
    nombre: 'Gas oil importado',
    queMide: 'Toneladas de gas oil importado, según los despachos de importación (sin las compras de CAMMESA para las usinas).',
    unidad: 't',
    decimales: 0,
    familia: 'corte',
    aditiva: true,
    dims: [],
    fuente: TABLERO_IMPORTACIONES,
  },
  gasoil_importado_pct: {
    nombre: 'Gas oil importado sobre el vendido',
    queMide: 'Qué porcentaje del gas oil grado 2 y grado 3 vendido en el país fue importado.',
    unidad: '%',
    decimales: 1,
    familia: 'corte',
    aditiva: false,
    dims: [],
    fuente: TABLERO_IMPORTACIONES,
  },
  gasoil_ventas: {
    nombre: 'Ventas de gas oil',
    queMide: 'Metros cúbicos de gas oil grado 2 y grado 3 vendidos en el país, en todos los sectores (al público, agro, transporte, bunker, usinas). Se abre por sector y por petrolera.',
    unidad: 'm³',
    decimales: 0,
    familia: 'gasoil',
    aditiva: true,
    dims: ['sector', 'vendedora'],
    fuente: TABLERO_SESCO,
  },
  gasoil_petrolera: {
    nombre: 'Gas oil vendido por las petroleras',
    corto: 'Gas oil vendido',
    nombraGrupo: true,
    juntas: ['', ' de las petroleras'],
    queMide: 'Metros cúbicos de gas oil grado 2 y grado 3 que vendió cada petrolera, sin bunker ni usinas: la base sobre la que se le mide el corte.',
    unidad: 'm³',
    decimales: 0,
    familia: 'petroleras',
    aditiva: true,
    dims: ['vendedora'],
    fuente: TABLERO_PETROLERAS,
  },
  biodiesel_petrolera: {
    nombre: 'Biodiésel comprado por las petroleras',
    corto: 'Biodiésel comprado',
    nombraGrupo: true,
    juntas: ['', ' de las petroleras'],
    queMide: 'Toneladas de biodiésel que compró cada petrolera para el corte. Sirve para ponerlo al lado del gas oil que vendió y de su corte.',
    unidad: 't',
    decimales: 0,
    familia: 'petroleras',
    aditiva: true,
    dims: ['vendedora'],
    fuente: TABLERO_PETROLERAS,
  },
  corte_petrolera: {
    nombre: 'Corte real de las petroleras',
    corto: 'Corte real',
    nombraGrupo: true,
    juntas: ['', ' de las petroleras'],
    queMide: 'Porcentaje de biodiésel que mezcló cada petrolera: el biodiésel que compró sobre el gas oil que vendió, en volumen.',
    unidad: '%',
    decimales: 2,
    familia: 'petroleras',
    aditiva: false,
    dims: ['vendedora'],
    fuente: TABLERO_PETROLERAS,
  },
  cumplimiento_petrolera: {
    nombre: 'Cumplimiento del corte de las petroleras',
    corto: 'Cumplimiento del corte',
    nombraGrupo: true,
    juntas: ['', ' de las petroleras'],
    queMide: 'El biodiésel que compró cada petrolera sobre el que le exigía el corte obligatorio por sus ventas de gas oil.',
    unidad: '%',
    decimales: 1,
    familia: 'petroleras',
    aditiva: false,
    dims: ['vendedora'],
    fuente: TABLERO_PETROLERAS,
  },
  faltante_petrolera: {
    nombre: 'Biodiésel que les faltó comprar a las petroleras',
    corto: 'Biodiésel que faltó',
    nombraGrupo: true,
    juntas: ['', ' de las petroleras'],
    queMide: 'Toneladas de biodiésel que le faltaron a cada petrolera para llegar al corte obligatorio en el período.',
    unidad: 't',
    decimales: 0,
    familia: 'petroleras',
    aditiva: true,
    dims: ['vendedora'],
    fuente: TABLERO_PETROLERAS,
  },
  precio: {
    nombre: 'Precio',
    queMide: 'El precio de uno o más productos de la lista de "Precios": biodiésel, gas oil, naftas, bioetanol, impuestos del gas oil, crudos, diésel de referencia, aceite de soja, metanol y glicerina. Pide el parámetro productos y admite unidad.',
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
    queMide: 'Cuánto más caro, en porcentaje, es un producto que otro (por ejemplo, el biodiésel contra el gas oil fósil, o el biodiésel contra el aceite de soja). Pide productos, producto_base y equivalencia.',
    unidad: '%',
    decimales: 1,
    familia: 'precios',
    aditiva: false,
    dims: [],
    pide: ['producto', 'producto_base', 'equivalencia'],
    fuente: TABLERO_PRECIOS,
  },
  tipo_cambio: {
    nombre: 'Tipo de cambio',
    queMide: 'Pesos por dólar: el tipo de cambio promedio de cada mes, el mismo con que el sitio pasa los precios de dólares a pesos.',
    unidad: '$/US$',
    decimales: 2,
    familia: 'precios',
    aditiva: false,
    dims: [],
    fuente: TABLERO_RANKING,
  },
  retencion_aceite: {
    nombre: 'Retención al aceite de soja',
    queMide: 'Derecho de exportación (retención) del aceite de soja, en porcentaje.',
    unidad: '%',
    decimales: 2,
    familia: 'precios',
    aditiva: false,
    dims: [],
    fuente: TABLERO_RETENCIONES,
  },
  retencion_biodiesel: {
    nombre: 'Retención al biodiésel',
    queMide: 'Derecho de exportación (retención) del biodiésel, en porcentaje.',
    unidad: '%',
    decimales: 2,
    familia: 'precios',
    aditiva: false,
    dims: [],
    fuente: TABLERO_RETENCIONES,
  },
  margen_biodiesel: {
    nombre: 'Margen del biodiésel sobre el aceite',
    queMide: 'Dólares por tonelada: el precio oficial del biodiésel menos el aceite de soja (FAS teórico oficial). Es lo que queda de transformar el aceite en biodiésel, antes de los demás costos.',
    unidad: 'US$/t',
    decimales: 0,
    familia: 'precios',
    aditiva: false,
    dims: [],
    fuente: TABLERO_MARGENES,
  },
  margen_biodiesel_pct: {
    nombre: 'Margen del biodiésel sobre el aceite, en porcentaje',
    queMide: 'El margen del biodiésel sobre el aceite como porcentaje del precio del biodiésel.',
    unidad: '%',
    decimales: 1,
    familia: 'precios',
    aditiva: false,
    dims: [],
    fuente: TABLERO_MARGENES,
  },
  crack_biodiesel: {
    nombre: 'Crack spread del biodiésel',
    queMide: 'Dólares por tonelada de aceite: 0,9 de biodiésel más 0,1 de glicerina, menos el aceite de soja (crack spread 10:9:1).',
    unidad: 'US$/t',
    decimales: 0,
    familia: 'precios',
    aditiva: false,
    dims: [],
    fuente: TABLERO_MARGENES,
  },
  crack_biodiesel_pct: {
    nombre: 'Crack spread del biodiésel, en porcentaje',
    queMide: 'El crack spread del biodiésel como porcentaje del precio del aceite de soja.',
    unidad: '%',
    decimales: 1,
    familia: 'precios',
    aditiva: false,
    dims: [],
    fuente: TABLERO_MARGENES,
  },
  precio_canal: {
    nombre: 'Precio del gas oil según el canal (grado 2, sin impuestos)',
    corto: 'grado 2 sin impuestos',
    nombraGrupo: true,
    juntas: ['Precio del gas oil según el canal: ', ''],
    queMide: 'Pesos por litro de gas oil grado 2, sin impuestos, según a quién se le vende (agro, transporte, al público, reventa) y según el canal de distribución (mayorista o minorista).',
    unidad: '$/l',
    decimales: 0,
    familia: 'canales',
    aditiva: false,
    dims: ['canal', 'distribucion'],
    fuente: TABLERO_VENTAS_PRECIO,
  },
  precio_canal_con_impuestos: {
    nombre: 'Precio del gas oil según el canal (grado 2, con impuestos)',
    corto: 'grado 2 con impuestos',
    nombraGrupo: true,
    juntas: ['Precio del gas oil según el canal: ', ''],
    queMide: 'Lo mismo, con impuestos.',
    unidad: '$/l',
    decimales: 0,
    familia: 'canales',
    aditiva: false,
    dims: ['canal', 'distribucion'],
    fuente: TABLERO_VENTAS_PRECIO,
  },
  precio_canal_g3: {
    nombre: 'Precio del gas oil según el canal (grado 3, sin impuestos)',
    corto: 'grado 3 sin impuestos',
    nombraGrupo: true,
    juntas: ['Precio del gas oil según el canal: ', ''],
    queMide: 'Lo mismo para el gas oil grado 3 (el premium), sin impuestos.',
    unidad: '$/l',
    decimales: 0,
    familia: 'canales',
    aditiva: false,
    dims: ['canal', 'distribucion'],
    fuente: TABLERO_VENTAS_PRECIO,
  },
  precio_canal_g3_con_impuestos: {
    nombre: 'Precio del gas oil según el canal (grado 3, con impuestos)',
    corto: 'grado 3 con impuestos',
    nombraGrupo: true,
    juntas: ['Precio del gas oil según el canal: ', ''],
    queMide: 'Lo mismo para el gas oil grado 3 (el premium), con impuestos.',
    unidad: '$/l',
    decimales: 0,
    familia: 'canales',
    aditiva: false,
    dims: ['canal', 'distribucion'],
    fuente: TABLERO_VENTAS_PRECIO,
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
  empresas: ['categoria', 'provincia', 'localidad', 'grupo', 'camara', 'empresa'],
  compras: ['petrolera', 'categoria', 'provincia', 'localidad', 'grupo', 'camara', 'empresa'],
  corte: [],
  gasoil: ['sector', 'vendedora'],
  petroleras: ['vendedora'],
  canales: ['distribucion', 'canal'],
  precios: [],
  aceite: [],
};

// Lo que venden las empresas que el sitio no identifica por nombre en las tablas de ventas de gas oil.
export const OTRAS_EMPRESAS = 'OTRAS EMPRESAS';

export const TOPE_MAXIMO = 60;
