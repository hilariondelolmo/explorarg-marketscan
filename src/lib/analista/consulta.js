// Analista (Agente Explorarg) - la "consulta": el pedido traducido a parámetros.
//
// La IA devuelve un JSON con el esquema de acá abajo. Eso pasa por dos controles:
//   - desdeModelo: lo lleva a la forma interna (filtros, meses desde y hasta);
//   - ajustarConsulta: hace que los parámetros sean compatibles entre sí y con los
//     datos que hay. Es el mismo control que corre cada vez que la persona cambia
//     un menú en la página, así que nunca llega al motor una consulta imposible.

import { conNombresPublicos } from '../poligrafo/catalogo.js';
import { norm, parsearSujeto, resolverPeriodo } from '../poligrafo/motor.js';
import { DIMENSIONES, EQUIVALENCIAS, FILTROS_DE, METRICAS, ORDENAR_POR, ORDENES, PRODUCTOS, TIEMPOS, TIPOS, TOPE_MAXIMO } from './catalogo.js';
import { mesesEntre, mesTxt, minuscula, nombreDeLaMedida, seriesDe, sumarMes } from './motor.js';

export const MAX_PEDIDO = 600;
const NINGUNO = 'ninguno';
const conNinguno = (obj) => [...Object.keys(obj), NINGUNO];
const texto = (v, max = 300) => (typeof v === 'string' ? conNombresPublicos(v.trim()).slice(0, max) : '');

/** Esquema del JSON que tiene que devolver el modelo (salida estructurada). */
export const ESQUEMA_CONSULTA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'entendido', 'motivo', 'tipo', 'metrica', 'agrupar', 'tiempo', 'sujeto', 'petrolera', 'periodo', 'periodo_inicial',
    'orden', 'ordenar_por', 'tope', 'producto', 'producto_base', 'equivalencia', 'aclaracion',
  ],
  properties: {
    entendido: { type: 'string', enum: ['si', 'no'] },
    motivo: { type: 'string' },
    tipo: { type: 'string', enum: Object.keys(TIPOS) },
    metrica: { type: 'string', enum: conNinguno(METRICAS) },
    agrupar: { type: 'string', enum: conNinguno(DIMENSIONES) },
    tiempo: { type: 'string', enum: conNinguno(TIEMPOS) },
    sujeto: { type: 'string' },
    petrolera: { type: 'string' },
    periodo: { type: 'string' },
    periodo_inicial: { type: 'string' },
    orden: { type: 'string', enum: Object.keys(ORDENES) },
    ordenar_por: { type: 'string', enum: conNinguno(ORDENAR_POR) },
    tope: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    producto: { type: 'string', enum: conNinguno(PRODUCTOS) },
    producto_base: { type: 'string', enum: conNinguno(PRODUCTOS) },
    equivalencia: { type: 'string', enum: conNinguno(EQUIVALENCIAS) },
    aclaracion: { type: 'string' },
  },
};

const esMes = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

/** Desde y hasta qué mes hay datos para las medidas del pedido (todas salen del mismo grupo de datos). */
export function rangoDe(q, ctx) {
  const familia = METRICAS[q.metricas?.[0]]?.familia;
  if (familia === 'compras' && ctx.compras?.meses?.length) return [ctx.compras.meses[0], ctx.compras.meses[ctx.compras.meses.length - 1]];
  if (familia === 'corte' && ctx.corteMensual?.length) return [ctx.corteMensual[0].fecha, ctx.corteMensual[ctx.corteMensual.length - 1].fecha];
  if (familia === 'aceite' && ctx.aceite?.meses?.length) return [ctx.aceite.meses[0].fecha, ctx.aceite.meses[ctx.aceite.meses.length - 1].fecha];
  if (familia === 'precios' && ctx.precios) {
    // con varios precios, de la primera fecha a la última en que hay alguno
    let rango = null;
    for (const s of seriesDe(q)) {
      const meses = ctx.precios.mesesCon([s.producto, s.productoBase].filter((k) => PRODUCTOS[k]));
      if (!meses.length) continue;
      const ultimo = meses[meses.length - 1];
      rango = rango ? [meses[0] < rango[0] ? meses[0] : rango[0], ultimo > rango[1] ? ultimo : rango[1]] : [meses[0], ultimo];
    }
    if (rango) return rango;
  }
  return [ctx.primerMes, ctx.ultimo];
}

/** Las listas de los menús de la página. */
export function opcionesDeMenu(ctx) {
  return {
    categoria: ctx.valores.categoria.filter((c) => ctx.empresas.some((e) => e.categoria === c)),
    provincia: ctx.valores.provincia,
    // la IA puede traducir "las empresas de Rosario" a un filtro por localidad: sin este menú se perdía sin aviso
    localidad: ctx.valores.localidad,
    grupo: ctx.valores.grupo,
    camara: ctx.valores.camara,
    empresa: ctx.valores.empresa,
    petrolera: ctx.compras?.petroleras ?? [],
  };
}

function validarFiltro(valor, opciones) {
  if (!valor || typeof valor !== 'string') return null;
  const v = norm(valor);
  const exacta = opciones.find((o) => norm(o) === v);
  if (exacta) return exacta;
  const parecidas = opciones.filter((o) => norm(o).includes(v) || v.includes(norm(o)));
  return v.length >= 3 && parecidas.length === 1 ? parecidas[0] : null;
}

// Cada menú de selección múltiple guarda una lista. Una consulta guardada antes del
// 23/11/2026 (o la que arma la IA) trae un solo valor: se lee igual.
const lista = (v) => (Array.isArray(v) ? v : v === null || v === undefined || v === '' ? [] : [v]);
/** Los valores que existen, sin repetir y en el orden del catálogo (no en el orden en que se tildaron). */
const enOrden = (valores, catalogo) => Object.keys(catalogo).filter((k) => valores.includes(k));

const basePorDefecto = (producto) => {
  const energia = PRODUCTOS[producto].energia;
  const base = energia === 'bioetanol' || energia === 'nafta' ? 'nafta_fosil' : 'gasoil_fosil';
  return producto === base ? (base === 'nafta_fosil' ? 'bioetanol' : 'biodiesel') : base;
};

/**
 * Deja la consulta coherente: parámetros que existen, compatibles entre sí y dentro
 * de los datos que hay. Devuelve { consulta, avisos }. Es idempotente.
 *
 * La consulta que sale tiene siempre esta forma (los menús de selección múltiple son listas):
 *   tipos, metricas, productos, productosBase, equivalencias, filtros { menú: [valores] },
 *   agrupar, tiempo, desde, hasta, desde0, hasta0, orden, ordenarPor, ordenMedida, tope.
 */
export function ajustarConsulta(entrada, ctx) {
  const avisos = [];
  const q = {};

  // medidas: una o varias, todas del mismo grupo de datos (comparten filtros, agrupación y fechas)
  let metricas = enOrden(lista(entrada.metricas ?? entrada.metrica), METRICAS);
  if (!metricas.length) metricas = ['ventas_cupo'];
  const familia = METRICAS[metricas[0]].familia;
  if (metricas.some((k) => METRICAS[k].familia !== familia)) {
    metricas = metricas.filter((k) => METRICAS[k].familia === familia);
    avisos.push('Las medidas se combinan dentro de un mismo grupo (elaboradoras, corte o precios): quedaron las del primero.');
  }
  q.metricas = metricas;
  const ms = metricas.map((k) => METRICAS[k]);
  const m = ms[0]; // lo que es igual para todo el grupo: por qué se agrupa y qué filtros admite

  let tipos = enOrden(lista(entrada.tipos ?? entrada.tipo), TIPOS);
  if (!tipos.length) tipos = ['ranking'];

  // productos (solo para precios)
  q.productos = [];
  q.productosBase = [];
  q.equivalencias = [];
  if (familia === 'precios') {
    const conBrecha = metricas.includes('brecha_precio');
    const comparable = (k) => !PRODUCTOS[k].soloNivel;
    let productos = lista(entrada.productos ?? entrada.producto).filter((k) => PRODUCTOS[k]);
    // la diferencia de precio se mide entre dos precios: los impuestos solos no entran
    if (!metricas.includes('precio')) productos = productos.filter(comparable);
    if (!productos.some(comparable) && (conBrecha || !productos.length)) productos.push('biodiesel');
    q.productos = enOrden(productos, PRODUCTOS);
    if (conBrecha) {
      const comparables = q.productos.filter(comparable);
      let bases = lista(entrada.productosBase ?? entrada.productoBase).filter((k) => PRODUCTOS[k] && comparable(k));
      // tiene que quedar al menos un par de productos distintos para comparar
      if (!bases.some((b) => comparables.some((p) => p !== b))) bases = [basePorDefecto(comparables[0])];
      q.productosBase = enOrden(bases, PRODUCTOS);
      q.equivalencias = enOrden(lista(entrada.equivalencias ?? entrada.equivalencia), EQUIVALENCIAS);
      if (!q.equivalencias.length) q.equivalencias = ['por_litro'];
    }
  }

  // por qué se agrupa
  q.agrupar = m.agruparSiempre ?? (m.dims.includes(entrada.agrupar) ? entrada.agrupar : NINGUNO);

  // qué tipos de respuesta admiten las medidas
  const sinTiempo = ms.filter((x) => x.sinTiempo);
  const pideTiempo = (t) => t === 'evolucion' || t === 'comparacion';
  if (sinTiempo.length === ms.length && tipos.some(pideTiempo)) {
    avisos.push(`${sinTiempo.map((x) => x.nombre).join(', ')}: el sitio tiene solo la foto más reciente, así que no se puede ver en el tiempo. Se muestra el ranking.`);
    tipos = tipos.map((t) => (pideTiempo(t) ? 'ranking' : t));
  } else if (sinTiempo.length && tipos.some(pideTiempo)) {
    avisos.push(`${sinTiempo.map((x) => x.nombre).join(', ')}: el sitio tiene solo la foto más reciente, así que no entra en la evolución ni en la comparación.`);
  }
  if (tipos.includes('ranking') && q.agrupar === NINGUNO) {
    if (m.dims.length) q.agrupar = m.dims[0];
    else tipos = tipos.map((t) => (t === 'ranking' ? 'evolucion' : t));
  }
  if (m.agruparSiempre) tipos = tipos.map((t) => (t === 'total' ? 'ranking' : t));
  q.tipos = enOrden(tipos, TIPOS);
  const hayEvolucion = q.tipos.includes('evolucion');
  const hayComparacion = q.tipos.includes('comparacion');

  // filtros: solo los que valen para esas medidas, y con valores que existen
  q.filtros = {};
  const menus = opcionesDeMenu(ctx);
  for (const f of FILTROS_DE[familia]) {
    const pedidos = lista(entrada.filtros?.[f]).map((v) => validarFiltro(v, menus[f]));
    const validos = menus[f].filter((o) => pedidos.includes(o));
    if (validos.length) q.filtros[f] = validos;
  }

  // período
  q.desde = entrada.desde;
  q.hasta = entrada.hasta;
  const [min, max] = rangoDe(q, ctx);
  if (!esMes(q.hasta)) q.hasta = max;
  if (!esMes(q.desde)) q.desde = sumarMes(q.hasta, -11);
  if (q.desde > q.hasta) [q.desde, q.hasta] = [q.hasta, q.desde];
  const pedido = [q.desde, q.hasta];
  if (q.hasta > max) q.hasta = max;
  if (q.desde < min) q.desde = min;
  if (q.desde > q.hasta) {
    // el período pedido cae entero fuera de los datos: se muestra lo último que hay
    q.hasta = max;
    q.desde = sumarMes(max, -11) < min ? min : sumarMes(max, -11);
  }
  if (sinTiempo.length < ms.length && (pedido[0] !== q.desde || pedido[1] !== q.hasta)) {
    const series = seriesDe(q);
    const deQue = series.length === 1 ? minuscula(nombreDeLaMedida(series[0])) : 'las medidas elegidas';
    avisos.push(`De ${deQue} hay datos de ${mesTxt(min)} a ${mesTxt(max)}: el período se ajustó a eso.`);
  }

  q.desde0 = null;
  q.hasta0 = null;
  if (hayComparacion) {
    const largo = mesesEntre(q.desde, q.hasta).length;
    q.desde0 = entrada.desde0;
    q.hasta0 = entrada.hasta0;
    if (!esMes(q.hasta0) || !esMes(q.desde0)) {
      q.hasta0 = sumarMes(q.desde, -1);
      q.desde0 = sumarMes(q.hasta0, -(largo - 1));
    }
    if (q.desde0 > q.hasta0) [q.desde0, q.hasta0] = [q.hasta0, q.desde0];
    if (q.hasta0 > max) q.hasta0 = max;
    if (q.desde0 < min) q.desde0 = min;
    if (q.desde0 > q.hasta0) q.hasta0 = q.desde0;
    if (mesesEntre(q.desde0, q.hasta0).length !== largo && ms.some((x) => x.aditiva)) {
      avisos.push('Los dos períodos no duran lo mismo: en una medida que se suma, la comparación queda despareja.');
    }
  }

  // en el tiempo
  q.tiempo = NINGUNO;
  if (hayEvolucion) q.tiempo = TIEMPOS[entrada.tiempo] ? entrada.tiempo : mesesEntre(q.desde, q.hasta).length <= 36 ? 'mes' : 'anio';

  q.orden = ORDENES[entrada.orden] ? entrada.orden : 'mayor';
  q.ordenarPor = hayComparacion ? (ORDENAR_POR[entrada.ordenarPor] ? entrada.ordenarPor : 'diferencia') : 'valor';
  // con varias medidas en un ranking, cuál de ellas ordena la tabla
  q.ordenMedida = null;
  if (metricas.length > 1 && q.tipos.includes('ranking') && q.agrupar !== NINGUNO) {
    q.ordenMedida = metricas.includes(entrada.ordenMedida) ? entrada.ordenMedida : metricas[0];
  }
  const topePorDefecto = q.tipos.every((t) => t === 'evolucion') ? 5 : 20;
  q.tope = Number.isFinite(entrada.tope) && entrada.tope >= 1 ? Math.min(Math.round(entrada.tope), TOPE_MAXIMO) : topePorDefecto;

  return { consulta: q, avisos };
}

/**
 * Pasa el JSON crudo del modelo a una consulta controlada.
 * Devuelve { ok: true, consulta, avisos } o { ok: false, motivo }.
 */
export function desdeModelo(cruda, ctx) {
  if (!cruda || cruda.entendido === 'no' || !METRICAS[cruda.metrica]) {
    return { ok: false, motivo: texto(cruda?.motivo) || 'Eso no se puede responder con los datos que el Analista tiene cargados.' };
  }
  const avisos = [];
  const q = {
    tipo: cruda.tipo,
    metrica: cruda.metrica,
    agrupar: cruda.agrupar,
    tiempo: cruda.tiempo,
    filtros: {},
    orden: cruda.orden,
    ordenarPor: cruda.ordenar_por,
    tope: typeof cruda.tope === 'number' ? cruda.tope : null,
    producto: cruda.producto,
    productoBase: cruda.producto_base,
    equivalencia: cruda.equivalencia,
  };

  if (cruda.sujeto && norm(cruda.sujeto) !== 'TOTAL') {
    // cada parte se lee por separado: si el sujeto repite un tipo (dos provincias), valen las dos
    const partes = cruda.sujeto.split('+').map((parte) => parsearSujeto(parte, ctx));
    const mala = partes.find((s) => !s.ok);
    if (mala) avisos.push(`${mala.motivo} Se toman todas las empresas.`);
    else for (const f of partes.flatMap((s) => s.filtros)) q.filtros[f.tipo] = [...(q.filtros[f.tipo] ?? []), f.valor];
  }
  if (cruda.petrolera && cruda.petrolera !== NINGUNO) {
    const p = validarFiltro(cruda.petrolera, opcionesDeMenu(ctx).petrolera);
    if (p) q.filtros.petrolera = [p];
    else avisos.push(`No encuentro la petrolera «${texto(cruda.petrolera, 60)}» en los datos del sitio.`);
  }

  const per = cruda.periodo ? resolverPeriodo(cruda.periodo, ctx) : null;
  if (per?.ok) {
    q.desde = per.desde;
    q.hasta = per.hasta;
  } else if (METRICAS[cruda.metrica].sinTiempo !== true) {
    avisos.push(per?.motivo ? `${per.motivo} Se toman los últimos 12 meses.` : 'El pedido no decía el período: se toman los últimos 12 meses con datos.');
  }
  const per0 = cruda.periodo_inicial ? resolverPeriodo(cruda.periodo_inicial, ctx) : null;
  if (per0?.ok) {
    q.desde0 = per0.desde;
    q.hasta0 = per0.hasta;
  } else if (cruda.tipo === 'comparacion') {
    avisos.push('El pedido no decía contra qué período comparar: se toma el período anterior, del mismo largo.');
  }

  const r = ajustarConsulta(q, ctx);
  const aclaracion = texto(cruda.aclaracion, 300);
  return { ok: true, consulta: r.consulta, avisos: [...avisos, ...r.avisos], aclaracion };
}
