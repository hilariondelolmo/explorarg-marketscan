// Polígrafo - el "análisis": la forma lógica que devuelve el traductor con IA.
//
// La IA devuelve un JSON con las afirmaciones, las preguntas de menú y la
// forma lógica. Acá está el esquema de ese JSON y el control que lo pasa por
// el catálogo: lo que no se puede medir con los datos del sitio se baja a
// "sin datos", y ninguna opción de menú llega a la página sin validar.

import {
  conNombresPublicos,
  BASES,
  COMPARADORES,
  CRITERIOS,
  EQUIVALENCIAS,
  INDICADORES,
  MAGNITUDES,
  MEDIDAS_CORTE,
  PARAMETROS_PREGUNTABLES,
  PRODUCTOS,
} from './catalogo.js';
import { evaluarForma, parsearSujeto, resolverPeriodo, verificarCita } from './motor.js';
import { TEXTOS_OPCIONALES } from './textos.js';

export const MAX_ENUNCIADO = 1500;
export const MAX_CONTEXTO = 300;
const MAX_AFIRMACIONES = 12;
const NINGUNO = 'ninguno';

const TIPOS = ['dato', 'norma', 'opinion', 'sin_datos'];
const JUICIOS = ['respalda', 'contradice', 'no_alcanza'];
const MAX_CITAS = 3;
const MAX_DATOS = 4;

const REVISIONES = ['verdad_a_medias', 'doble_vara'];
const RESULTADOS_REVISION = ['se_sostiene', 'no_se_sostiene', 'no_alcanza'];

const ESQUEMA_CITAS = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'texto'],
    properties: { id: { type: 'string' }, texto: { type: 'string' } },
  },
};

const conNinguno = (obj) => [...Object.keys(obj), NINGUNO];

/** Esquema del JSON que tiene que devolver el modelo (salida estructurada). */
export const ESQUEMA_ANALISIS = {
  type: 'object',
  additionalProperties: false,
  required: ['afirmaciones', 'preguntas', 'forma', 'textos_necesarios'],
  properties: {
    // textos legales que no se cargaron en la consulta y hacen falta (textos.js): casi siempre vacío
    textos_necesarios: { type: 'array', items: { type: 'string', enum: Object.keys(TEXTOS_OPCIONALES) } },
    afirmaciones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id', 'cita', 'tipo', 'motivo', 'indicador', 'sujeto', 'criterio', 'magnitud', 'base',
          'medida', 'producto', 'producto_base', 'equivalencia', 'periodo', 'periodo_inicial', 'comparador', 'valor_numero', 'valor_lista',
          'norma_juicio', 'norma_explicacion', 'citas',
          'revision_tipo', 'revision_omite', 'revision_vale_para', 'revision_no_vale_para',
          'revision_resultado', 'revision_explicacion', 'revision_citas', 'revision_datos',
          'opinion_choca', 'opinion_hecho', 'datos',
        ],
        properties: {
          id: { type: 'string' },
          cita: { type: 'string' },
          tipo: { type: 'string', enum: TIPOS },
          motivo: { type: 'string' },
          indicador: { type: 'string', enum: conNinguno(INDICADORES) },
          sujeto: { type: 'string' },
          criterio: { type: 'string', enum: conNinguno(CRITERIOS) },
          magnitud: { type: 'string', enum: conNinguno(MAGNITUDES) },
          base: { type: 'string', enum: conNinguno(BASES) },
          medida: { type: 'string', enum: conNinguno(MEDIDAS_CORTE) },
          // solo para los indicadores de precio
          producto: { type: 'string', enum: conNinguno(PRODUCTOS) },
          producto_base: { type: 'string', enum: conNinguno(PRODUCTOS) },
          equivalencia: { type: 'string', enum: conNinguno(EQUIVALENCIAS) },
          periodo: { type: 'string' },
          periodo_inicial: { type: 'string' },
          comparador: { type: 'string', enum: conNinguno(COMPARADORES) },
          valor_numero: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          valor_lista: { type: 'array', items: { type: 'string' } },
          // solo para tipo "norma": el juicio contra el texto legal y las citas que lo respaldan
          norma_juicio: { type: 'string', enum: [...JUICIOS, NINGUNO] },
          norma_explicacion: { type: 'string' },
          citas: ESQUEMA_CITAS,
          // segunda lectura: lo que la frase omite (solo pesa si al pie de la letra es cierta)
          revision_tipo: { type: 'string', enum: [...REVISIONES, 'ninguna'] },
          revision_omite: { type: 'string' },
          revision_vale_para: { type: 'string' },
          revision_no_vale_para: { type: 'string' },
          revision_resultado: { type: 'string', enum: [...RESULTADOS_REVISION, NINGUNO] },
          revision_explicacion: { type: 'string' },
          revision_citas: ESQUEMA_CITAS,
          revision_datos: { type: 'array', items: { type: 'string' } }, // ids de la ficha de datos
          // solo para tipo "opinion": si lo que da por cierto choca con los textos o los datos
          opinion_choca: { type: 'string', enum: ['si', 'no'] },
          opinion_hecho: { type: 'string' },
          datos: { type: 'array', items: { type: 'string' } }, // ids de la ficha que lo prueban
        },
      },
    },
    preguntas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['parametro', 'aplica_a', 'pregunta', 'opciones'],
        properties: {
          parametro: { type: 'string', enum: PARAMETROS_PREGUNTABLES },
          aplica_a: { type: 'array', items: { type: 'string' } },
          pregunta: { type: 'string' },
          opciones: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    forma: { type: 'string' },
  },
};

const vacio = (v) => v === null || v === undefined || v === '' || v === NINGUNO;
// Lo que escribe la IA (motivos, lecturas, lo que omite) se muestra al público: los
// grupos económicos van con su nombre público. La cita del enunciado no pasa por acá.
// Tampoco se muestran los códigos internos de las piezas (MS-38, D-CUPO-..., T-ENERGIA-...).
const sinCodigos = (t) =>
  t
    .replace(/\s*\((?:\s*(?:[DT]|MS|L27640|UE245|UE835|S809|LBR|LB|ML)-[A-Z0-9]+(?:-[A-Z0-9]+)*\s*[,;y]?\s*)+\)/g, '')
    .replace(/\s*\b[DT]-[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g, '')
    .replace(/\s+([.,;:])/g, '$1');
const texto = (v, max = 400) => (typeof v === 'string' ? sinCodigos(conNombresPublicos(v.trim())).slice(0, max) : '');
const textual = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** ¿Vale `valor` para el parámetro? Devuelve el valor canónico o null. */
function validarValor(parametro, valor, ctx) {
  if (vacio(valor)) return null;
  switch (parametro) {
    case 'sujeto': {
      const s = parsearSujeto(valor, ctx);
      return s.ok ? s.codigo : null;
    }
    case 'periodo':
    case 'periodo_inicial': {
      const r = resolverPeriodo(valor, ctx);
      return r.ok ? r.codigo : null;
    }
    case 'criterio':
      return CRITERIOS[valor] ? valor : null;
    case 'magnitud':
      return MAGNITUDES[valor] ? valor : null;
    case 'base':
      return BASES[valor] ? valor : null;
    case 'medida':
      return MEDIDAS_CORTE[valor] ? valor : null;
    case 'producto':
    case 'producto_base':
      return PRODUCTOS[valor] ? valor : null;
    case 'equivalencia':
      return EQUIVALENCIAS[valor] ? valor : null;
    default:
      return null;
  }
}

/** El texto de una opción de menú sale del valor, no de la IA: lo que se lee es lo que se mide. */
export function etiquetaOpcion(parametro, valor, ctx) {
  switch (parametro) {
    case 'sujeto': {
      const s = parsearSujeto(valor, ctx);
      return s.ok ? s.etiqueta.charAt(0).toUpperCase() + s.etiqueta.slice(1) : valor;
    }
    case 'periodo':
    case 'periodo_inicial': {
      const r = resolverPeriodo(valor, ctx);
      return r.ok ? r.etiqueta.charAt(0).toUpperCase() + r.etiqueta.slice(1) : valor;
    }
    case 'criterio':
      return CRITERIOS[valor]?.menu ?? valor;
    case 'magnitud': {
      const m = MAGNITUDES[valor]?.larga ?? valor;
      return m.charAt(0).toUpperCase() + m.slice(1);
    }
    case 'base':
      return BASES[valor]?.menu ?? valor;
    case 'medida':
      return MEDIDAS_CORTE[valor]?.menu ?? valor;
    case 'producto':
    case 'producto_base':
      return PRODUCTOS[valor]?.menu ?? valor;
    case 'equivalencia':
      return EQUIVALENCIAS[valor]?.menu ?? valor;
    default:
      return valor;
  }
}

/** Menú de respaldo cuando la IA dejó un parámetro abierto sin proponer opciones válidas. */
function opcionesPorDefecto(parametro, ctx, afs = []) {
  const anio = Number(ctx.ultimo.slice(0, 4));
  switch (parametro) {
    case 'periodo':
      return ['ultimo_mes', 'ultimos_12_meses', `anio:${anio}`, `anio:${anio - 1}`];
    case 'periodo_inicial':
      return [`anio:${anio - 1}`, `anio:${anio - 5}`, `anio:${anio - 10}`];
    case 'criterio':
      return Object.keys(CRITERIOS);
    case 'magnitud':
      return Object.keys(MAGNITUDES);
    case 'base':
      return Object.keys(BASES);
    case 'medida':
      return Object.keys(MEDIDAS_CORTE);
    case 'producto':
      return Object.keys(PRODUCTOS).filter((k) => !PRODUCTOS[k].soloNivel);
    case 'producto_base':
      // contra qué se compara depende de qué se compara: el bioetanol, contra la nafta
      if (afs.length && afs.every((a) => a.producto === 'bioetanol')) return ['nafta_fosil', 'nafta_surtidor'];
      return ['gasoil_fosil', 'gasoil_importado', 'gasoil_surtidor'];
    case 'equivalencia':
      return Object.keys(EQUIVALENCIAS);
    default:
      return [];
  }
}

const PREGUNTA_POR_DEFECTO = {
  periodo: '¿A qué período se refiere?',
  periodo_inicial: '¿Desde qué período se compara?',
  criterio: '¿Qué empresas cuentan?',
  magnitud: '¿Qué se mide?',
  base: '¿Sobre qué total se calcula el porcentaje?',
  medida: '¿De qué corte habla?',
  producto: '¿De qué precio habla?',
  producto_base: '¿Contra qué precio se compara?',
  equivalencia: '¿Se compara litro contra litro o a igual energía?',
};

/**
 * En una variación los dos períodos tienen que durar lo mismo: del menú se sacan
 * los que no se pueden comparar con el período que ya está definido.
 */
function periodosComparables(parametro, opciones, afs, ctx) {
  if (parametro !== 'periodo' && parametro !== 'periodo_inicial') return opciones;
  const otro = parametro === 'periodo' ? 'periodo_inicial' : 'periodo';
  const largos = afs
    .filter((a) => a.indicador === 'variacion' && a[otro])
    .map((a) => resolverPeriodo(a[otro], ctx).meses);
  if (!largos.length) return opciones;
  const sirven = opciones.filter((v) => largos.every((m) => resolverPeriodo(v, ctx).meses === m));
  return sirven.length >= 2 ? sirven : opciones;
}

/** De las citas que propone la IA, las que figuran textuales en la base (sin repetir). */
function citasComprobadas(lista, ctx) {
  const citas = [];
  for (const c of Array.isArray(lista) ? lista.slice(0, 6) : []) {
    const comprobada = verificarCita(c, ctx);
    if (comprobada && !citas.some((x) => x.id === comprobada.id && x.texto === comprobada.texto)) citas.push(comprobada);
  }
  return citas.slice(0, MAX_CITAS);
}

/** Los datos se citan por id: solo valen los que existen en la ficha que arma el programa. */
function datosDeLaFicha(lista, ctx) {
  return [...new Set((Array.isArray(lista) ? lista : []).map((id) => String(id).trim()))]
    .filter((id) => ctx.ficha?.porId.has(id))
    .slice(0, MAX_DATOS);
}

/**
 * La segunda lectura que propone la IA: qué omite la frase. Lo omitido tiene que
 * venir probado con una cita textual comprobada o con un dato de la ficha del
 * sitio; si no trae ninguna de las dos cosas, no hay segunda lectura (null).
 * Acepta tanto los campos sueltos del modelo como un análisis ya controlado.
 */
function normalizarRevision(a, ctx) {
  const r = a?.revision
    ? {
        revision_tipo: a.revision.tipo,
        revision_omite: a.revision.omite,
        revision_vale_para: a.revision.vale_para,
        revision_no_vale_para: a.revision.no_vale_para,
        revision_resultado: a.revision.resultado,
        revision_explicacion: a.revision.explicacion,
        revision_citas: a.revision.citas,
        revision_datos: a.revision.datos,
      }
    : a;
  if (!REVISIONES.includes(r?.revision_tipo)) return null;
  const citas = citasComprobadas(r.revision_citas, ctx);
  const datos = datosDeLaFicha(r.revision_datos, ctx);
  if (!citas.length && !datos.length) return null;
  const comun = { tipo: r.revision_tipo, omite: texto(r.revision_omite, 500), explicacion: texto(r.revision_explicacion, 700), citas, datos };
  if (r.revision_tipo === 'doble_vara') {
    const vale = texto(r.revision_vale_para, 200);
    const noVale = texto(r.revision_no_vale_para, 200);
    return vale && noVale ? { ...comun, vale_para: vale, no_vale_para: noVale } : null;
  }
  return { ...comun, resultado: RESULTADOS_REVISION.includes(r.revision_resultado) ? r.revision_resultado : 'no_alcanza' };
}

function bajarASinDatos(af, motivo) {
  return { id: af.id, cita: af.cita, tipo: 'sin_datos', motivo };
}

/** Los parámetros que el indicador necesita, descontando el período cuando el criterio no lo usa. */
function parametrosDe(af) {
  const ind = INDICADORES[af.indicador];
  return ind.parametros.filter((p) => !(p === 'periodo' && af.criterio && CRITERIOS[af.criterio]?.sinPeriodo));
}

/**
 * Pasa el JSON crudo del modelo por el catálogo y devuelve el análisis limpio:
 * { afirmaciones, preguntas, forma, avisos }.
 */
export function normalizarAnalisis(crudo, ctx) {
  const avisos = [];
  const entrada = Array.isArray(crudo?.afirmaciones) ? crudo.afirmaciones.slice(0, MAX_AFIRMACIONES) : [];
  if (Array.isArray(crudo?.afirmaciones) && crudo.afirmaciones.length > MAX_AFIRMACIONES) {
    avisos.push(`El enunciado es muy largo: se evalúan las primeras ${MAX_AFIRMACIONES} afirmaciones.`);
  }

  // 1. afirmaciones: se renumeran A1..An en orden
  const idNuevo = new Map();
  const afirmaciones = entrada.map((a, i) => {
    const id = `A${i + 1}`;
    if (typeof a?.id === 'string') idNuevo.set(a.id.trim().toUpperCase(), id);
    const base = { id, cita: textual(a?.cita, 600) };
    const tipo = TIPOS.includes(a?.tipo) ? a.tipo : 'sin_datos';
    if (tipo === 'norma') {
      // el juicio lo propone la IA; acá solo pasan las citas que figuran textuales en la base
      if (!JUICIOS.includes(a.norma_juicio) || !ctx.normas?.items.size) {
        return bajarASinDatos(base, 'No se pudo contrastar con el texto de una norma.');
      }
      return {
        ...base,
        tipo: 'norma',
        motivo: '',
        norma_juicio: a.norma_juicio,
        norma_explicacion: texto(a.norma_explicacion, 700),
        citas: citasComprobadas(a.citas, ctx),
        datos: datosDeLaFicha(a.datos, ctx), // afirmaciones técnicas: la prueba es un dato de la ficha
        revision: normalizarRevision(a, ctx),
      };
    }
    if (tipo === 'opinion') {
      // Una opinión no se evalúa, salvo que dé por cierto un hecho que los textos o los
      // datos desmienten (HDO, 22/11/2026: "derecho a una opinión, no a datos propios").
      // Solo cuenta si viene probado con una cita comprobada o un dato de la ficha.
      const citas = citasComprobadas(a.citas, ctx);
      const datos = datosDeLaFicha(a.datos, ctx);
      const hecho = texto(a.opinion_hecho, 300);
      const choca = (a.opinion_choca === 'si' || a.choca === true) && hecho && (citas.length > 0 || datos.length > 0);
      return choca
        ? { ...base, tipo, motivo: '', choca: true, opinion_hecho: hecho, citas, datos, norma_explicacion: texto(a.norma_explicacion, 700) }
        : { ...base, tipo, motivo: texto(a?.motivo) };
    }
    if (tipo !== 'dato') return { ...base, tipo, motivo: texto(a?.motivo) };

    const ind = INDICADORES[a.indicador];
    if (!ind) return bajarASinDatos(base, 'Lo que afirma no está entre lo que el Polígrafo sabe medir hoy.');

    const af = { ...base, tipo: 'dato', indicador: a.indicador, revision: normalizarRevision(a, ctx) };
    for (const p of ['sujeto', 'criterio', 'magnitud', 'base', 'medida', 'producto', 'producto_base', 'equivalencia', 'periodo', 'periodo_inicial']) af[p] = null;

    for (const p of ind.parametros) {
      if (vacio(a[p])) continue; // queda abierto: se pregunta
      const v = validarValor(p, a[p], ctx);
      if (v !== null) {
        af[p] = v;
        continue;
      }
      if (p === 'sujeto') return bajarASinDatos(base, parsearSujeto(a[p], ctx).motivo);
      if (p === 'periodo' || p === 'periodo_inicial') {
        const r = resolverPeriodo(a[p], ctx);
        if (r.fueraDeRango) return bajarASinDatos(base, r.motivo);
      }
      // valor que no se entiende: queda abierto y se pregunta
    }
    if (af.base && BASES[af.base].soloMagnitud && af.magnitud && af.magnitud !== BASES[af.base].soloMagnitud) {
      af.base = 'total';
    }

    // Una frase de datos que ya habla de una sola parte ("las integradas vendieron...")
    // no tiene doble vara: describir a un grupo no es medirlo con otra vara. La doble
    // vara en datos queda para las frases generales ("las elaboradoras exportan").
    if (af.revision?.tipo === 'doble_vara' && af.sujeto && af.sujeto !== 'total') af.revision = null;

    af.comparador = ind.comparadores.includes(a.comparador) ? a.comparador : 'igual';
    if (ind.valor === 'lista') {
      af.valor_lista = Array.isArray(a.valor_lista) ? a.valor_lista.map((x) => texto(x, 80)).filter(Boolean).slice(0, 30) : [];
      af.valor_numero = null;
      if (!af.valor_lista.length) return bajarASinDatos(base, 'No quedó claro qué lista afirma.');
    } else {
      af.valor_numero = typeof a.valor_numero === 'number' && Number.isFinite(a.valor_numero) ? a.valor_numero : null;
      af.valor_lista = [];
      if (af.valor_numero === null) return bajarASinDatos(base, 'No da un número que se pueda contrastar.');
    }
    return af;
  });

  const porId = new Map(afirmaciones.map((a) => [a.id, a]));
  const abierto = (af, p) => af.tipo === 'dato' && parametrosDe(af).includes(p) && af[p] === null;

  // 2. preguntas que propuso la IA, validadas contra el catálogo
  const preguntas = [];
  const cubierto = new Set(); // "A1|periodo"
  for (const q of Array.isArray(crudo?.preguntas) ? crudo.preguntas : []) {
    const parametro = q?.parametro;
    if (!PARAMETROS_PREGUNTABLES.includes(parametro)) continue;
    const aplica = [...new Set((Array.isArray(q.aplica_a) ? q.aplica_a : []).map((x) => idNuevo.get(String(x).trim().toUpperCase())))]
      .filter((id) => id && abierto(porId.get(id), parametro) && !cubierto.has(`${id}|${parametro}`));
    if (!aplica.length) continue;
    // la IA manda los códigos sueltos; un análisis ya controlado los trae como { valor, etiqueta }
    const propuestas = (Array.isArray(q.opciones) ? q.opciones : []).map((v) => (typeof v === 'string' ? v : v?.valor));
    let opciones = [...new Set(propuestas.map((v) => validarValor(parametro, v, ctx)).filter(Boolean))];
    if (opciones.length < 2) opciones = opcionesPorDefecto(parametro, ctx, aplica.map((id) => porId.get(id))).map((v) => validarValor(parametro, v, ctx)).filter(Boolean);
    if (opciones.length < 2) continue;
    opciones = periodosComparables(parametro, opciones, aplica.map((id) => porId.get(id)), ctx);
    aplica.forEach((id) => cubierto.add(`${id}|${parametro}`));
    preguntas.push({
      id: `P${preguntas.length + 1}`,
      parametro,
      aplica_a: aplica,
      pregunta: texto(q.pregunta, 240) || PREGUNTA_POR_DEFECTO[parametro] || '¿Cuál de estas lecturas?',
      opciones: opciones.slice(0, 5).map((valor) => ({ valor, etiqueta: etiquetaOpcion(parametro, valor, ctx) })),
    });
  }

  // 3. parámetros que quedaron abiertos sin pregunta: el valor por defecto del
  // indicador si lo tiene; si no, menú de respaldo, uno por parámetro
  for (const parametro of PARAMETROS_PREGUNTABLES) {
    for (const af of afirmaciones) {
      const porDefecto = af.tipo === 'dato' ? INDICADORES[af.indicador]?.porDefecto?.[parametro] : null;
      if (porDefecto && abierto(af, parametro) && !cubierto.has(`${af.id}|${parametro}`)) af[parametro] = porDefecto;
    }
    const faltan = afirmaciones.filter((af) => abierto(af, parametro) && !cubierto.has(`${af.id}|${parametro}`));
    if (!faltan.length) continue;
    const opciones = periodosComparables(
      parametro,
      opcionesPorDefecto(parametro, ctx, faltan).map((v) => validarValor(parametro, v, ctx)).filter(Boolean),
      faltan,
      ctx
    );
    if (opciones.length < 2) {
      // sin menú posible (el sujeto): no se puede medir
      for (const af of faltan) {
        const i = afirmaciones.indexOf(af);
        afirmaciones[i] = bajarASinDatos(af, 'No quedó claro de qué empresas habla.');
        porId.set(af.id, afirmaciones[i]);
      }
      continue;
    }
    faltan.forEach((af) => cubierto.add(`${af.id}|${parametro}`));
    preguntas.push({
      id: `P${preguntas.length + 1}`,
      parametro,
      aplica_a: faltan.map((af) => af.id),
      pregunta: PREGUNTA_POR_DEFECTO[parametro],
      opciones: opciones.map((valor) => ({ valor, etiqueta: etiquetaOpcion(parametro, valor, ctx) })),
    });
  }
  // una pregunta puede haber quedado apuntando a una afirmación que se bajó a "sin datos"
  const preguntasVivas = preguntas
    .map((q) => ({ ...q, aplica_a: q.aplica_a.filter((id) => porId.get(id)?.tipo === 'dato') }))
    .filter((q) => q.aplica_a.length);

  // 4. forma lógica: solo afirmaciones que entran en la cuenta; si no cierra, conjunción
  // las opiniones quedan afuera, salvo las que chocan con la realidad, que sí se evalúan
  const evaluables = afirmaciones.filter((a) => a.tipo !== 'opinion' || a.choca).map((a) => a.id);
  let forma = String(crudo?.forma ?? '').replace(/A\d+/gi, (m) => idNuevo.get(m.toUpperCase()) ?? 'A0');
  const usados = forma.match(/A\d+/g) ?? [];
  const cierra =
    usados.length > 0 &&
    usados.every((id) => evaluables.includes(id)) &&
    evaluables.every((id) => usados.includes(id)) &&
    evaluarForma(forma, () => 'V') !== null;
  if (!cierra) forma = evaluables.join(' y ');

  return { afirmaciones, preguntas: preguntasVivas, forma, avisos };
}

/** Aplica las respuestas del usuario ({ P1: 'ultimo_mes', ... }) y devuelve el análisis resuelto. */
export function aplicarRespuestas(analisis, respuestas) {
  const afirmaciones = analisis.afirmaciones.map((a) => ({ ...a }));
  const porId = new Map(afirmaciones.map((a) => [a.id, a]));
  for (const q of analisis.preguntas) {
    const valor = respuestas?.[q.id];
    if (!valor || !q.opciones.some((o) => o.valor === valor)) continue;
    for (const id of q.aplica_a) {
      const af = porId.get(id);
      if (af) af[q.parametro] = valor;
    }
  }
  return { ...analisis, afirmaciones };
}
