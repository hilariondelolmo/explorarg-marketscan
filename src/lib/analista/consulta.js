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
import { mesesEntre, mesTxt, minuscula, nombreDeLaMedida, sumarMes } from './motor.js';

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

/** Desde y hasta qué mes hay datos para una medida. */
export function rangoDe(q, ctx) {
  const familia = METRICAS[q.metrica]?.familia;
  if (familia === 'compras' && ctx.compras?.meses?.length) return [ctx.compras.meses[0], ctx.compras.meses[ctx.compras.meses.length - 1]];
  if (familia === 'corte' && ctx.corteMensual?.length) return [ctx.corteMensual[0].fecha, ctx.corteMensual[ctx.corteMensual.length - 1].fecha];
  if (familia === 'aceite' && ctx.aceite?.meses?.length) return [ctx.aceite.meses[0].fecha, ctx.aceite.meses[ctx.aceite.meses.length - 1].fecha];
  if (familia === 'precios' && ctx.precios) {
    const claves = q.metrica === 'brecha_precio' ? [q.producto, q.productoBase] : [q.producto];
    const meses = ctx.precios.mesesCon(claves.filter((k) => PRODUCTOS[k]));
    if (meses.length) return [meses[0], meses[meses.length - 1]];
  }
  return [ctx.primerMes, ctx.ultimo];
}

/** Las listas de los menús de la página. */
export function opcionesDeMenu(ctx) {
  return {
    categoria: ctx.valores.categoria.filter((c) => ctx.empresas.some((e) => e.categoria === c)),
    provincia: ctx.valores.provincia,
    grupo: ctx.valores.grupo,
    camara: ctx.valores.camara,
    empresa: ctx.valores.empresa,
    petrolera: ctx.compras?.petroleras ?? [],
  };
}

function validarFiltro(tipo, valor, ctx) {
  if (!valor) return null;
  const lista = opcionesDeMenu(ctx)[tipo] ?? [];
  const v = norm(valor);
  const exacta = lista.find((o) => norm(o) === v);
  if (exacta) return exacta;
  const parecidas = lista.filter((o) => norm(o).includes(v) || v.includes(norm(o)));
  return v.length >= 3 && parecidas.length === 1 ? parecidas[0] : null;
}

/**
 * Deja la consulta coherente: parámetros que existen, compatibles entre sí y dentro
 * de los datos que hay. Devuelve { consulta, avisos }. Es idempotente.
 */
export function ajustarConsulta(entrada, ctx) {
  const avisos = [];
  const q = { ...entrada, filtros: { ...(entrada.filtros ?? {}) } };
  if (!METRICAS[q.metrica]) q.metrica = 'ventas_cupo';
  const m = METRICAS[q.metrica];
  if (!TIPOS[q.tipo]) q.tipo = 'ranking';

  // productos (solo para precios)
  if (m.familia === 'precios') {
    if (!PRODUCTOS[q.producto]) q.producto = 'biodiesel';
    if (q.metrica === 'brecha_precio') {
      if (PRODUCTOS[q.producto].soloNivel) q.producto = 'biodiesel';
      const porDefecto = PRODUCTOS[q.producto].energia === 'bioetanol' || PRODUCTOS[q.producto].energia === 'nafta' ? 'nafta_fosil' : 'gasoil_fosil';
      if (!PRODUCTOS[q.productoBase] || PRODUCTOS[q.productoBase].soloNivel || q.productoBase === q.producto) {
        q.productoBase = q.producto === porDefecto ? (porDefecto === 'nafta_fosil' ? 'bioetanol' : 'biodiesel') : porDefecto;
      }
      if (!EQUIVALENCIAS[q.equivalencia]) q.equivalencia = 'por_litro';
    } else {
      q.productoBase = null;
      q.equivalencia = null;
    }
  } else {
    q.producto = null;
    q.productoBase = null;
    q.equivalencia = null;
  }

  // por qué se agrupa
  if (m.agruparSiempre) q.agrupar = m.agruparSiempre;
  else if (!m.dims.includes(q.agrupar)) q.agrupar = NINGUNO;

  // qué tipo de respuesta admite la medida
  if (m.sinTiempo && (q.tipo === 'evolucion' || q.tipo === 'comparacion')) {
    avisos.push(`${m.nombre}: el sitio tiene solo la foto más reciente, así que no se puede ver en el tiempo. Se muestra el ranking.`);
    q.tipo = 'ranking';
  }
  if (q.tipo === 'ranking' && q.agrupar === NINGUNO) {
    if (m.dims.length) q.agrupar = m.dims[0];
    else q.tipo = 'evolucion';
  }
  if (q.tipo === 'total' && m.agruparSiempre) q.tipo = 'ranking';

  // filtros: solo los que valen para esa medida, y con valores que existen
  const permitidos = FILTROS_DE[m.familia];
  for (const f of Object.keys(q.filtros)) {
    const valor = permitidos.includes(f) ? validarFiltro(f, q.filtros[f], ctx) : null;
    if (valor) q.filtros[f] = valor;
    else delete q.filtros[f];
  }

  // período
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
  if (!m.sinTiempo && (pedido[0] !== q.desde || pedido[1] !== q.hasta)) {
    avisos.push(`De ${minuscula(nombreDeLaMedida(q))} hay datos de ${mesTxt(min)} a ${mesTxt(max)}: el período se ajustó a eso.`);
  }

  if (q.tipo === 'comparacion') {
    const largo = mesesEntre(q.desde, q.hasta).length;
    if (!esMes(q.hasta0) || !esMes(q.desde0)) {
      q.hasta0 = sumarMes(q.desde, -1);
      q.desde0 = sumarMes(q.hasta0, -(largo - 1));
    }
    if (q.desde0 > q.hasta0) [q.desde0, q.hasta0] = [q.hasta0, q.desde0];
    if (q.hasta0 > max) q.hasta0 = max;
    if (q.desde0 < min) q.desde0 = min;
    if (q.desde0 > q.hasta0) q.hasta0 = q.desde0;
    if (mesesEntre(q.desde0, q.hasta0).length !== largo && m.aditiva) {
      avisos.push('Los dos períodos no duran lo mismo: en una medida que se suma, la comparación queda despareja.');
    }
  } else {
    q.desde0 = null;
    q.hasta0 = null;
  }

  // en el tiempo
  if (q.tipo === 'evolucion') {
    if (!TIEMPOS[q.tiempo]) q.tiempo = mesesEntre(q.desde, q.hasta).length <= 36 ? 'mes' : 'anio';
  } else {
    q.tiempo = NINGUNO;
  }

  if (!ORDENES[q.orden]) q.orden = 'mayor';
  q.ordenarPor = q.tipo === 'comparacion' ? (ORDENAR_POR[q.ordenarPor] ? q.ordenarPor : 'diferencia') : 'valor';
  const topePorDefecto = q.tipo === 'evolucion' ? 5 : 20;
  q.tope = Number.isFinite(q.tope) && q.tope >= 1 ? Math.min(Math.round(q.tope), TOPE_MAXIMO) : topePorDefecto;

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
    const s = parsearSujeto(cruda.sujeto, ctx);
    if (s.ok) for (const f of s.filtros) q.filtros[f.tipo] = f.valor;
    else avisos.push(`${s.motivo} Se toman todas las empresas.`);
  }
  if (cruda.petrolera && cruda.petrolera !== NINGUNO) {
    const p = validarFiltro('petrolera', cruda.petrolera, ctx);
    if (p) q.filtros.petrolera = p;
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
