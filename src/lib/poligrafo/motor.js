// Polígrafo - motor de cálculo.
//
// Recibe afirmaciones ya traducidas a forma lógica (ver analisis.js) y las
// contrasta con los JSON del sitio. Acá no hay IA: todo número que muestra el
// Polígrafo sale de estas funciones.
//
// Corre igual en el navegador (la página) y en Node (la función del servidor
// y scripts/poligrafo_prueba.mjs): no importa nada del DOM ni de React.

import {
  grupoPublico,
  BASES,
  CATEGORIAS,
  COMPARADORES,
  CRITERIOS,
  EQUIVALENCIAS,
  FILTROS,
  INDICADORES,
  MAGNITUDES,
  MARGEN,
  MEDIDAS_CORTE,
  PRODUCTOS,
} from './catalogo.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// ---------------------------------------------------------------- texto

/** Mayúsculas, sin tildes, sin espacios duros ni dobles: para comparar nombres. */
export function norm(s) {
  return String(s ?? '')
    .replace(/ /g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const limpio = (s) => String(s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

const MINUSCULAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'EL']);

/** "PROVINCIA DE BUENOS AIRES" -> "Buenos Aires"; "ENTRE RÍOS" -> "Entre Ríos". */
export function lindo(s) {
  const t = limpio(s).replace(/^PROVINCIA DE /i, '');
  if (t === 'CABA') return t;
  return t
    .split(' ')
    .map((p, i) =>
      i > 0 && MINUSCULAS.has(p.toUpperCase())
        ? p.toLowerCase()
        : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
    )
    .join(' ');
}

const nf = (n, d = 0) =>
  Number(n).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Un valor con su unidad, en formato local. */
export function formatear(n, unidad, decimales) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  if (unidad === '%') return `${nf(n, decimales ?? 1)}%`;
  if (unidad === 't' || unidad === 't/año') return `${nf(n, 0)} ${unidad}`;
  if (unidad === '$/l') return `$ ${nf(n, decimales ?? 0)} por litro`;
  return nf(n, decimales ?? 0);
}

/** El número tal como se dijo: sin inventarle decimales. */
function formatearDicho(n, unidad) {
  const txt = Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  if (unidad === '%') return `${txt}%`;
  if (unidad === 't' || unidad === 't/año') return `${txt} ${unidad}`;
  if (unidad === '$/l') return `$ ${txt} por litro`;
  return txt;
}

const mesTxt = (iso) => `${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

function sumarMeses(iso, n) {
  const total = Number(iso.slice(0, 4)) * 12 + (Number(iso.slice(5, 7)) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- citas de textos legales

/** Para comparar una cita con el texto: sin diferencias de espacios, comillas, rayas ni mayúsculas. */
export function normCita(s) {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/[\u00a0\s]+/g, ' ')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—−]/g, '-')
    .replace(/ ?- ?/g, '-')
    .toLowerCase()
    .trim();
}

const CORTE_DE_CITA = /\s*(?:\(\.\.\.\)|\[\.\.\.\]|…|\.\.\.)\s*/;

/**
 * ¿La cita figura letra por letra en la pieza `id` de la base de textos?
 * Admite puntos suspensivos en el medio: cada tramo tiene que figurar, en orden.
 * Devuelve { id, texto } con la cita limpia, o null si no se puede comprobar.
 */
export function verificarCita(cita, ctx) {
  const item = ctx.normas?.items.get(String(cita?.id ?? '').trim());
  if (!item) return null;
  const limpia = String(cita?.texto ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“«'‘\s]+|["”»'’\s]+$/g, '')
    .replace(/^(?:\(\.\.\.\)|…|\.\.\.)\s*|\s*(?:\(\.\.\.\)|…|\.\.\.)$/g, '');
  if (limpia.length < 20 || limpia.length > 700) return null;
  const tramos = limpia.split(CORTE_DE_CITA).filter(Boolean);
  const entero = normCita(item.texto);
  let desde = 0;
  for (const tramo of tramos) {
    const t = normCita(tramo);
    if (t.length < 12) return null;
    const i = entero.indexOf(t, desde);
    if (i < 0) return null;
    desde = i + t.length;
  }
  return { id: item.id, texto: tramos.join(' (...) ') };
}

// ---------------------------------------------------------------- datos

const ALIAS_PROVINCIA = {
  'BUENOS AIRES': 'PROVINCIA DE BUENOS AIRES',
  'PCIA DE BUENOS AIRES': 'PROVINCIA DE BUENOS AIRES',
  'PCIA. DE BUENOS AIRES': 'PROVINCIA DE BUENOS AIRES',
  CABA: 'CAPITAL FEDERAL',
  'CIUDAD DE BUENOS AIRES': 'CAPITAL FEDERAL',
  'CIUDAD AUTONOMA DE BUENOS AIRES': 'CAPITAL FEDERAL',
};

const ALIAS_CATEGORIA = {
  INTEGRADAS: 'INTEGRADA',
  'NO INTEGRADAS': 'NO INTEGRADA',
  COMERCIALIZADORAS: 'COMERCIALIZADORA',
};

/**
 * Arma el contexto de cálculo a partir de los JSON del sitio.
 * `corte` y `capacidad` pueden faltar (el servidor solo necesita los nombres).
 */
export function prepararDatos({ empresas, mercado, corte, capacidad, normas, precios, tecnicos }) {
  // Capacidad: la misma tabla que usa el tablero de Capacidad (capacidad.serie),
  // en su última fecha, y solo las plantas en operación (condición ON). No se usa
  // capacidad.plantas: es el padrón del mapa, que repite plantas compartidas
  // (T6 y sus dos dueños) y trae las que están fuera de operación.
  const serieCap = capacidad?.serie ?? [];
  const fechaCap = serieCap.reduce((m, r) => (r.fecha > m ? r.fecha : m), '');
  const capacidadDe = new Map();
  const capacidadOffDe = new Map();
  for (const r of serieCap) {
    if (r.fecha !== fechaCap) continue;
    const destino = r.condicion === 'ON' ? capacidadDe : capacidadOffDe;
    const k = norm(r.empresa);
    destino.set(k, (destino.get(k) || 0) + (r.capacidad || 0));
  }

  // La capacidad en operación de cada año (la tabla trae una foto por año, en enero):
  // con ella se mide el uso de la capacidad en cualquier período.
  const fotos = new Map();
  for (const r of serieCap) {
    if (r.condicion !== 'ON') continue;
    const anio = Number(r.fecha.slice(0, 4));
    if (!fotos.has(anio)) fotos.set(anio, new Map());
    const k = norm(r.empresa);
    fotos.get(anio).set(k, (fotos.get(anio).get(k) || 0) + (r.capacidad || 0));
  }

  const lista = empresas.empresas.map((e) => ({
    nombre: limpio(e.empresa),
    categoria: limpio(e.categoria),
    grupo: limpio(e.grupo),
    provincia: limpio(e.provincia),
    localidad: limpio(e.localidad),
    camara: limpio(e.camara || 'SIN CÁMARA'),
    serie: e.serie,
    capacidad: capacidadDe.get(norm(e.empresa)) || 0, // en operación
    capacidadOff: capacidadOffDe.get(norm(e.empresa)) || 0, // registrada, fuera de operación
  }));

  const unicos = (campo) => [...new Set(lista.map((e) => e[campo]))].sort();
  const primerMes =
    mercado?.mensual?.[0]?.fecha ??
    lista.reduce((m, e) => (e.serie[0] && e.serie[0][0] < m ? e.serie[0][0] : m), '9999-12');

  return {
    ultimo: empresas.ultimo_mes,
    primerMes,
    fechaCapacidad: fechaCap,
    capacidadAnual: { anios: [...fotos.keys()].sort((a, b) => a - b), de: fotos },
    // precios por mes del biodiésel y del gas oil, e impuestos (precios.js); null si no se cargaron
    precios: precios ?? null,
    // energía de un litro de cada combustible, en MJ (datos_tecnicos.json)
    energia: new Map((tecnicos?.contenido_energetico ?? []).map((c) => [c.id, { mj: c.mj_l, nombre: c.nombre }])),
    empresas: lista,
    corteMensual: corte?.mensual ?? [],
    // la ficha de datos citables la completa agregarFicha (ficha.js)
    ficha: { lista: [], porId: new Map() },
    normas: {
      lista: normas?.normas ?? [],
      items: new Map((normas?.items ?? []).map((x) => [x.id, x])),
      normaDe: new Map((normas?.normas ?? []).map((n) => [n.id, n])),
    },
    valores: {
      categoria: CATEGORIAS,
      empresa: unicos('nombre'),
      grupo: unicos('grupo'),
      provincia: unicos('provincia'),
      localidad: unicos('localidad'),
      camara: unicos('camara'),
    },
  };
}

// ---------------------------------------------------------------- períodos

/**
 * Códigos de período:
 *   ultimo_mes · ultimos_12_meses · historico
 *   anio:2025 · mes:2026-09 · rango:2020-01:2024-12
 */
export function resolverPeriodo(codigo, ctx) {
  const c = String(codigo ?? '').trim();
  const { ultimo, primerMes } = ctx;
  const fuera = (motivo) => ({ ok: false, fueraDeRango: true, motivo });
  let desde;
  let hasta;
  let etiqueta;
  let con;

  if (c === 'ultimo_mes') {
    desde = hasta = ultimo;
    etiqueta = `${mesTxt(ultimo)} (último mes con datos)`;
    con = `en ${etiqueta}`;
  } else if (c === 'ultimos_12_meses') {
    hasta = ultimo;
    desde = sumarMeses(ultimo, -11);
    etiqueta = `los últimos 12 meses (${mesTxt(desde)} a ${mesTxt(hasta)})`;
    con = `en ${etiqueta}`;
  } else if (c === 'historico') {
    desde = primerMes;
    hasta = ultimo;
    etiqueta = `toda la serie (${mesTxt(desde)} a ${mesTxt(hasta)})`;
    con = `en ${etiqueta}`;
  } else if (/^anio:\d{4}$/.test(c)) {
    const y = c.slice(5);
    desde = `${y}-01`;
    hasta = `${y}-12`;
    if (desde > ultimo) return fuera(`El sitio tiene datos hasta ${mesTxt(ultimo)}: todavía no hay nada de ${y}.`);
    if (hasta < primerMes) return fuera(`La serie del sitio empieza en ${mesTxt(primerMes)}.`);
    if (hasta > ultimo) {
      hasta = ultimo;
      etiqueta = `${y} (enero a ${MESES[Number(ultimo.slice(5, 7)) - 1]}, año en curso)`;
    } else {
      etiqueta = y;
    }
    if (desde < primerMes) desde = primerMes;
    con = `en ${etiqueta}`;
  } else if (/^mes:\d{4}-(0[1-9]|1[0-2])$/.test(c)) {
    desde = hasta = c.slice(4);
    if (desde > ultimo) return fuera(`El sitio tiene datos hasta ${mesTxt(ultimo)}.`);
    if (desde < primerMes) return fuera(`La serie del sitio empieza en ${mesTxt(primerMes)}.`);
    etiqueta = mesTxt(desde);
    con = `en ${etiqueta}`;
  } else if (/^rango:\d{4}-(0[1-9]|1[0-2]):\d{4}-(0[1-9]|1[0-2])$/.test(c)) {
    [, desde, hasta] = c.split(':');
    if (desde > hasta) return { ok: false, motivo: 'El período está al revés: empieza después de terminar.' };
    if (desde > ultimo) return fuera(`El sitio tiene datos hasta ${mesTxt(ultimo)}.`);
    if (hasta < primerMes) return fuera(`La serie del sitio empieza en ${mesTxt(primerMes)}.`);
    if (hasta > ultimo) hasta = ultimo;
    if (desde < primerMes) desde = primerMes;
    etiqueta = `${mesTxt(desde)} a ${mesTxt(hasta)}`;
    con = `entre ${mesTxt(desde)} y ${mesTxt(hasta)}`;
  } else {
    return { ok: false, motivo: `No entiendo el período «${c}».` };
  }

  const meses =
    (Number(hasta.slice(0, 4)) - Number(desde.slice(0, 4))) * 12 +
    (Number(hasta.slice(5, 7)) - Number(desde.slice(5, 7))) +
    1;
  return { ok: true, codigo: c, desde, hasta, meses, etiqueta, con };
}

// ---------------------------------------------------------------- sujetos

function buscarValor(tipo, valor, ctx) {
  let v = norm(valor);
  if (tipo === 'provincia') v = ALIAS_PROVINCIA[v] ?? v;
  if (tipo === 'categoria') v = ALIAS_CATEGORIA[v] ?? v;
  const opciones = ctx.valores[tipo] ?? [];
  const exacta = opciones.find((o) => norm(o) === v);
  if (exacta) return exacta;
  // "EXPLORA" -> "EXPLORA S.A.", "BOJANICH" -> "GRUPO BOJANICH": solo si hay una sola candidata
  if (tipo === 'empresa' || tipo === 'grupo' || tipo === 'localidad') {
    const parecidas = opciones.filter((o) => norm(o).includes(v) || v.includes(norm(o)));
    if (v.length >= 4 && parecidas.length === 1) return parecidas[0];
  }
  return null;
}

/**
 * Sujeto: "total" o filtros unidos con "+", cada uno "tipo:valor".
 * Ej.: "categoria:NO INTEGRADA+provincia:SANTA FE".
 */
export function parsearSujeto(codigo, ctx) {
  const c = limpio(codigo);
  if (!c || norm(c) === 'TOTAL') {
    return { ok: true, codigo: 'total', filtros: [], etiqueta: 'todas las empresas' };
  }
  const filtros = [];
  for (const parte of c.split('+')) {
    const i = parte.indexOf(':');
    const tipo = i > 0 ? parte.slice(0, i).trim().toLowerCase() : '';
    const valor = i > 0 ? parte.slice(i + 1).trim() : '';
    if (!FILTROS[tipo] || !valor) {
      return { ok: false, motivo: `No entiendo de qué empresas habla («${limpio(parte)}»).` };
    }
    const hallado = buscarValor(tipo, valor, ctx);
    if (!hallado) {
      return {
        ok: false,
        motivo: `No encuentro la ${FILTROS[tipo]} «${limpio(valor)}» en los datos del sitio.`,
      };
    }
    if (filtros.some((f) => f.tipo === tipo)) {
      return { ok: false, motivo: `El sujeto repite el filtro de ${FILTROS[tipo]}.` };
    }
    filtros.push({ tipo, valor: hallado });
  }

  const de = (t) => filtros.find((f) => f.tipo === t)?.valor;
  const cat = de('categoria');
  let base;
  if (de('empresa')) base = de('empresa');
  else if (cat === 'INTEGRADA') base = 'empresas integradas';
  else if (cat === 'NO INTEGRADA') base = 'empresas no integradas';
  else if (cat === 'COMERCIALIZADORA') base = 'comercializadoras';
  else base = 'empresas';
  const extra = [];
  if (de('grupo')) extra.push(`del ${grupoPublico(de('grupo'))}`);
  if (de('camara')) extra.push(`de la cámara ${de('camara')}`);
  if (de('localidad') && de('provincia')) extra.push(`en ${lindo(de('localidad'))} (${lindo(de('provincia'))})`);
  else if (de('localidad')) extra.push(`en ${lindo(de('localidad'))}`);
  else if (de('provincia')) extra.push(`de ${lindo(de('provincia'))}`);

  return {
    ok: true,
    codigo: filtros.map((f) => `${f.tipo}:${f.valor}`).join('+'),
    filtros,
    etiqueta: [base, ...extra].join(' '),
  };
}

const CAMPO_DE_FILTRO = {
  categoria: 'categoria',
  empresa: 'nombre',
  grupo: 'grupo',
  provincia: 'provincia',
  localidad: 'localidad',
  camara: 'camara',
};

function filtrar(ctx, filtros) {
  return ctx.empresas.filter((e) => filtros.every((f) => e[CAMPO_DE_FILTRO[f.tipo]] === f.valor));
}

// ---------------------------------------------------------------- cálculo

function suma(e, idx, per) {
  let s = 0;
  for (const r of e.serie) if (r[0] >= per.desde && r[0] <= per.hasta) s += r[idx] || 0;
  return s;
}

const sumaDe = (lista, idx, per) => lista.reduce((s, e) => s + suma(e, idx, per), 0);

/** Empresas del sujeto que cumplen el criterio, con el valor que las hace contar. */
function lasQueCuentan(ctx, suj, criterio, per) {
  const todas = filtrar(ctx, suj.filtros);
  if (criterio === 'con_planta') {
    return todas.filter((e) => e.capacidad > 0).map((e) => ({ e, v: e.capacidad }));
  }
  const idx = MAGNITUDES[criterio].idx;
  return todas.map((e) => ({ e, v: suma(e, idx, per) })).filter((x) => x.v > 0);
}

export function corteDelPeriodo(ctx, per) {
  const filas = ctx.corteMensual.filter(
    (c) => c.fecha >= per.desde && c.fecha <= per.hasta && c.obligatorio !== null && c.obligatorio !== undefined
  );
  if (!filas.length) return null;
  const go = filas.reduce((s, c) => s + c.go_m3, 0);
  const bio = filas.reduce((s, c) => s + c.bio_m3, 0);
  const oblig = filas.reduce((s, c) => s + c.obligatorio * c.go_m3, 0) / go;
  return {
    meses: filas.length,
    go,
    bio,
    real: (bio / go) * 100,
    obligatorio: oblig * 100,
    faltante: filas.reduce((s, c) => s + (c.deficit_ton || 0), 0),
    filas,
  };
}

/** Hasta `max` filas ordenadas de mayor a menor; el resto se agrupa. */
function recortar(filas, max, armarResto) {
  if (filas.length <= max) return filas;
  return [...filas.slice(0, max), armarResto(filas.slice(max))];
}

const fallo = (motivo) => ({ ok: false, motivo });

/** De dónde sale la capacidad y cuánta quedó afuera por estar fuera de operación. */
function notaCapacidad(ctx, empresas) {
  const off = empresas.filter((e) => e.capacidadOff > 0);
  const base = `Se cuentan las plantas en operación según el tablero de Capacidad del sitio (a ${mesTxt(ctx.fechaCapacidad)}).`;
  if (!off.length) return base;
  return `${base} Quedan afuera ${off.length} ${off.length === 1 ? 'planta registrada' : 'plantas registradas'} fuera de operación, con ${nf(off.reduce((s, e) => s + e.capacidadOff, 0))} t por año.`;
}

/** Resuelve los parámetros que pide el indicador. Devuelve { ok, p } o { ok:false, motivo }. */
function resolverParametros(af, ind, ctx) {
  const p = {};
  for (const nombre of ind.parametros) {
    const crudo = af[nombre];
    if (crudo === null || crudo === undefined || crudo === '') {
      return fallo(`Falta definir ${NOMBRE_PARAMETRO[nombre] ?? nombre}.`);
    }
    if (nombre === 'sujeto') {
      const s = parsearSujeto(crudo, ctx);
      if (!s.ok) return s;
      p.sujeto = s;
    } else if (nombre === 'periodo' || nombre === 'periodo_inicial') {
      const r = resolverPeriodo(crudo, ctx);
      if (!r.ok) return r;
      p[nombre] = r;
    } else if (nombre === 'producto' || nombre === 'producto_base') {
      if (!PRODUCTOS[crudo]) return fallo(`No conozco el producto «${crudo}».`);
      p[nombre] = crudo;
    } else if (nombre === 'equivalencia') {
      if (!EQUIVALENCIAS[crudo]) return fallo(`No entiendo cómo se compara («${crudo}»).`);
      p[nombre] = crudo;
    } else {
      p[nombre] = crudo;
    }
  }
  return { ok: true, p };
}

export const NOMBRE_PARAMETRO = {
  sujeto: 'de qué empresas habla',
  criterio: 'qué empresas cuentan',
  magnitud: 'qué magnitud se mide',
  base: 'sobre qué total se calcula',
  medida: 'qué corte se mide',
  producto: 'de qué precio habla',
  producto_base: 'contra qué precio se compara',
  equivalencia: 'si se compara por litro o a igual energía',
  periodo: 'el período',
  periodo_inicial: 'el período inicial',
};

const CALCULOS = {
  cantidad_empresas(p, ctx) {
    const cuentan = lasQueCuentan(ctx, p.sujeto, p.criterio, p.periodo).sort((a, b) => b.v - a.v);
    const conPlanta = p.criterio === 'con_planta';
    return {
      ok: true,
      dato: cuentan.length,
      detalle: {
        columnas: ['Empresa', 'Grupo económico', 'Provincia', 'Localidad', conPlanta ? 'Capacidad (t/año)' : `${cap(MAGNITUDES[p.criterio].etiqueta)} (t)`],
        filas: cuentan.map(({ e, v }) => [e.nombre, grupoPublico(e.grupo), lindo(e.provincia), lindo(e.localidad), nf(v)]),
      },
      notas: conPlanta ? [notaCapacidad(ctx, filtrar(ctx, p.sujeto.filtros))] : [],
    };
  },

  cantidad_grupos(p, ctx) {
    const cuentan = lasQueCuentan(ctx, p.sujeto, p.criterio, p.periodo);
    const porGrupo = new Map();
    for (const { e, v } of cuentan) {
      const g = porGrupo.get(e.grupo) ?? { n: 0, v: 0 };
      g.n += 1;
      g.v += v;
      porGrupo.set(e.grupo, g);
    }
    const filas = [...porGrupo.entries()].sort((a, b) => b[1].v - a[1].v);
    const conPlanta = p.criterio === 'con_planta';
    return {
      ok: true,
      dato: filas.length,
      detalle: {
        columnas: ['Grupo económico', 'Empresas', conPlanta ? 'Capacidad (t/año)' : `${cap(MAGNITUDES[p.criterio].etiqueta)} (t)`],
        filas: filas.map(([g, x]) => [grupoPublico(g), nf(x.n), nf(x.v)]),
      },
      notas: conPlanta ? [notaCapacidad(ctx, filtrar(ctx, p.sujeto.filtros))] : [],
    };
  },

  provincias(p, ctx) {
    const cuentan = lasQueCuentan(ctx, p.sujeto, p.criterio, p.periodo);
    const porProv = new Map();
    for (const { e } of cuentan) porProv.set(e.provincia, (porProv.get(e.provincia) || 0) + 1);
    const filas = [...porProv.entries()].sort((a, b) => b[1] - a[1]);
    return {
      ok: true,
      dato: filas.map(([prov]) => prov),
      detalle: {
        columnas: ['Provincia', 'Empresas'],
        filas: filas.map(([prov, n]) => [lindo(prov), nf(n)]),
      },
      notas: [],
    };
  },

  volumen(p, ctx) {
    const idx = MAGNITUDES[p.magnitud].idx;
    const porEmpresa = filtrar(ctx, p.sujeto.filtros)
      .map((e) => ({ e, v: suma(e, idx, p.periodo) }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v);
    const total = porEmpresa.reduce((s, x) => s + x.v, 0);
    const filas = recortar(
      porEmpresa.map(({ e, v }) => [e.nombre, nf(v)]),
      12,
      (resto) => [`Otras ${resto.length} empresas`, nf(porEmpresa.slice(12).reduce((s, x) => s + x.v, 0))]
    );
    return {
      ok: true,
      dato: total,
      detalle: { columnas: ['Empresa', `${cap(MAGNITUDES[p.magnitud].etiqueta)} (t)`], filas: [...filas, ['Total', nf(total)]] },
      notas: [],
    };
  },

  participacion(p, ctx) {
    const idx = MAGNITUDES[p.magnitud].idx;
    if (BASES[p.base].soloMagnitud && BASES[p.base].soloMagnitud !== p.magnitud) {
      return fallo('La base «lo que manda la ley» solo vale para las ventas al cupo.');
    }
    const num = sumaDe(filtrar(ctx, p.sujeto.filtros), idx, p.periodo);
    const total = sumaDe(ctx.empresas, idx, p.periodo);
    const mag = MAGNITUDES[p.magnitud].etiqueta;
    const filas = [
      [`${cap(mag)} de ${p.sujeto.etiqueta}`, `${nf(num)} t`],
      [`${cap(mag)} de todas las empresas`, `${nf(total)} t`],
    ];
    let den = total;
    const notas = [];
    if (p.base === 'corte_obligatorio') {
      const c = corteDelPeriodo(ctx, p.periodo);
      if (!c) return fallo('El sitio no tiene datos del corte para ese período.');
      den = total + c.faltante;
      filas.push(['Biodiésel que faltó para cumplir el corte', `${nf(c.faltante)} t`]);
      filas.push(['Lo que manda la ley (ventas más faltante)', `${nf(den)} t`]);
      notas.push('El faltante es la suma de los faltantes mensuales que publica el sitio en Cumplimiento Corte.');
    }
    if (den <= 0) return fallo(`No hay ${mag} en ese período: no se puede calcular una participación.`);
    const pct = (num / den) * 100;
    filas.push(['Participación', `${nf(pct, 1)}%`]);
    return { ok: true, dato: pct, detalle: { columnas: ['Concepto', 'Valor'], filas }, notas };
  },

  corte(p, ctx) {
    const c = corteDelPeriodo(ctx, p.periodo);
    if (!c) return fallo('El sitio no tiene datos del corte para ese período (la serie empieza en enero de 2010).');
    const cumplimiento = (c.real / c.obligatorio) * 100;
    const dato = p.medida === 'real' ? c.real : p.medida === 'obligatorio' ? c.obligatorio : cumplimiento;
    return {
      ok: true,
      dato,
      decimales: p.medida === 'cumplimiento' ? 1 : 2,
      detalle: {
        columnas: ['Concepto', 'Valor'],
        filas: [
          ['Biodiésel vendido al cupo', `${nf(c.bio)} m³`],
          ['Gas oil grado 2 y grado 3', `${nf(c.go)} m³`],
          ['Corte real (biodiésel / gas oil)', `${nf(c.real, 2)}%`],
          ['Corte obligatorio (ponderado por ventas de gas oil)', `${nf(c.obligatorio, 2)}%`],
          ['Cumplimiento (real / obligatorio)', `${nf(cumplimiento, 1)}%`],
        ],
      },
      notas: [],
    };
  },

  faltante(p, ctx) {
    const c = corteDelPeriodo(ctx, p.periodo);
    if (!c) return fallo('El sitio no tiene datos del corte para ese período (la serie empieza en enero de 2010).');
    let filas;
    if (c.filas.length <= 12) {
      filas = c.filas.map((f) => [mesTxt(f.fecha), nf(f.deficit_ton || 0)]);
    } else {
      const porAnio = new Map();
      for (const f of c.filas) porAnio.set(f.fecha.slice(0, 4), (porAnio.get(f.fecha.slice(0, 4)) || 0) + (f.deficit_ton || 0));
      filas = [...porAnio.entries()].map(([y, v]) => [y, nf(v)]);
    }
    return {
      ok: true,
      dato: c.faltante,
      detalle: { columnas: ['Período', 'Faltante (t)'], filas: [...filas, ['Total', nf(c.faltante)]] },
      notas: ['Cada mes cuenta solo si el corte real quedó por debajo del obligatorio.'],
    };
  },

  variacion(p, ctx) {
    const idx = MAGNITUDES[p.magnitud].idx;
    const lista = filtrar(ctx, p.sujeto.filtros);
    // comparar un año entero contra un mes, o contra un año sin cerrar, da cualquier cosa
    if (p.periodo_inicial.meses !== p.periodo.meses) {
      return fallo(
        `Los dos períodos no duran lo mismo (${p.periodo_inicial.etiqueta}: ${p.periodo_inicial.meses} meses; ${p.periodo.etiqueta}: ${p.periodo.meses}). Así no se pueden comparar.`
      );
    }
    const v0 = sumaDe(lista, idx, p.periodo_inicial);
    const v1 = sumaDe(lista, idx, p.periodo);
    if (v0 <= 0) return fallo(`No hay ${MAGNITUDES[p.magnitud].etiqueta} en el período inicial: no se puede calcular una variación.`);
    const pct = ((v1 - v0) / v0) * 100;
    const notas = [];
    return {
      ok: true,
      dato: pct,
      detalle: {
        columnas: ['Período', `${cap(MAGNITUDES[p.magnitud].etiqueta)} (t)`],
        filas: [
          [cap(p.periodo_inicial.etiqueta), nf(v0)],
          [cap(p.periodo.etiqueta), nf(v1)],
          ['Variación', `${pct > 0 ? '+' : ''}${nf(pct, 1)}%`],
        ],
      },
      notas,
    };
  },

  capacidad_instalada(p, ctx) {
    const conPlanta = filtrar(ctx, p.sujeto.filtros)
      .filter((e) => e.capacidad > 0)
      .sort((a, b) => b.capacidad - a.capacidad);
    const total = conPlanta.reduce((s, e) => s + e.capacidad, 0);
    const filas = recortar(
      conPlanta.map((e) => [e.nombre, nf(e.capacidad)]),
      12,
      (resto) => [`Otras ${resto.length} empresas`, nf(conPlanta.slice(12).reduce((s, e) => s + e.capacidad, 0))]
    );
    return {
      ok: true,
      dato: total,
      detalle: { columnas: ['Empresa', 'Capacidad (t/año)'], filas: [...filas, ['Total', nf(total)]] },
      notas: [notaCapacidad(ctx, filtrar(ctx, p.sujeto.filtros))],
    };
  },

  utilizacion_capacidad(p, ctx) {
    const { anios, de } = ctx.capacidadAnual ?? { anios: [] };
    if (!anios.length) return fallo('El sitio no tiene cargada la capacidad instalada.');
    // cuántos meses del período caen en cada año: la capacidad se toma en proporción
    const mesesPorAnio = new Map();
    for (let m = p.periodo.desde; m <= p.periodo.hasta; m = sumarMeses(m, 1)) {
      const y = Number(m.slice(0, 4));
      mesesPorAnio.set(y, (mesesPorAnio.get(y) || 0) + 1);
    }
    const foto = (y) => de.get([...anios].reverse().find((a) => a <= y) ?? anios[0]);
    const idx = MAGNITUDES.produccion.idx;
    const filas = filtrar(ctx, p.sujeto.filtros)
      .map((e) => {
        let capacidad = 0;
        for (const [y, n] of mesesPorAnio) capacidad += ((foto(y).get(norm(e.nombre)) || 0) * n) / 12;
        return { e, prod: suma(e, idx, p.periodo), capacidad };
      })
      .filter((x) => x.capacidad > 0 || x.prod > 0)
      .sort((a, b) => b.capacidad - a.capacidad);
    const prod = filas.reduce((s, x) => s + x.prod, 0);
    const capacidad = filas.reduce((s, x) => s + x.capacidad, 0);
    if (capacidad <= 0) return fallo(`El sitio no registra capacidad instalada en operación de ${p.sujeto.etiqueta} ${p.periodo.con}.`);
    const uso = (x) => (x.capacidad > 0 ? `${nf((x.prod / x.capacidad) * 100, 1)}%` : '-');
    const tabla = recortar(
      filas.map((x) => [x.e.nombre, nf(x.prod), nf(x.capacidad), uso(x)]),
      12,
      () => {
        const resto = filas.slice(12);
        const r = { prod: resto.reduce((s, x) => s + x.prod, 0), capacidad: resto.reduce((s, x) => s + x.capacidad, 0) };
        return [`Otras ${resto.length} empresas`, nf(r.prod), nf(r.capacidad), uso(r)];
      }
    );
    const notas = [
      'Uso = producción del período sobre la capacidad en operación. La capacidad es la del tablero de Capacidad del sitio (una foto por año); si el período no es un año entero, se toma en proporción a los meses.',
    ];
    const sinCapacidad = filas.filter((x) => x.capacidad <= 0);
    if (sinCapacidad.length) {
      notas.push(`${sinCapacidad.length === 1 ? 'Una empresa produjo' : `${sinCapacidad.length} empresas produjeron`} sin figurar con capacidad en operación en esos años (${nf(sinCapacidad.reduce((s, x) => s + x.prod, 0))} t): su producción está contada.`);
    }
    return {
      ok: true,
      dato: (prod / capacidad) * 100,
      detalle: {
        columnas: ['Empresa', 'Producción (t)', 'Capacidad del período (t)', 'Uso'],
        filas: [...tabla, ['Total', nf(prod), nf(capacidad), uso({ prod, capacidad })]],
      },
      notas,
    };
  },

  precio(p, ctx) {
    const P = ctx.precios;
    if (!P) return fallo('El sitio no tiene cargados los precios.');
    const prod = PRODUCTOS[p.producto];
    if (p.periodo.meses > 12) {
      return fallo('Los precios están en pesos corrientes: un promedio de más de 12 meses mezcla pesos de años distintos. Hay que elegir un mes o un año.');
    }
    const meses = P.mesesCon([p.producto], p.periodo.desde, p.periodo.hasta);
    if (!meses.length) {
      const todos = P.mesesCon([p.producto]);
      return fallo(
        `El sitio no tiene el precio de ${prod.etiqueta} ${p.periodo.con}${todos.length ? ` (hay datos de ${mesTxt(todos[0])} a ${mesTxt(todos[todos.length - 1])})` : ''}.`
      );
    }
    const d = p.producto === 'impuestos_gasoil' ? 2 : 0;
    const valores = meses.map((m) => P.de(m)[p.producto]);
    const dato = valores.reduce((s, v) => s + v, 0) / valores.length;
    const filas = meses.map((m, i) => [cap(mesTxt(m)), `$ ${nf(valores[i], d)}`]);
    if (meses.length > 1) filas.push(['Promedio', `$ ${nf(dato, d)}`]);
    const notas = [prod.nota];
    if (meses.length > 1) notas.push('Promedio simple de los meses, en pesos corrientes.');
    if (meses.length < p.periodo.meses) notas.push(`El período tiene ${p.periodo.meses} meses y hay precio para ${meses.length}.`);
    return { ok: true, dato, decimales: d, detalle: { columnas: ['Mes', 'Pesos por litro'], filas }, notas };
  },

  brecha_precio(p, ctx) {
    const P = ctx.precios;
    if (!P) return fallo('El sitio no tiene cargados los precios.');
    const a = PRODUCTOS[p.producto];
    const b = PRODUCTOS[p.producto_base];
    if (p.producto === p.producto_base) return fallo('Los dos precios que se comparan son el mismo.');
    if (a.soloNivel || b.soloNivel) return fallo('Los impuestos no son un precio: no se comparan como si lo fueran.');
    const meses = P.mesesCon([p.producto, p.producto_base], p.periodo.desde, p.periodo.hasta);
    if (!meses.length) {
      const todos = P.mesesCon([p.producto, p.producto_base]);
      return fallo(
        `El sitio no tiene los dos precios ${p.periodo.con}${todos.length ? ` (hay datos de ${mesTxt(todos[0])} a ${mesTxt(todos[todos.length - 1])})` : ''}.`
      );
    }
    const pct = (g) => `${g > 0 ? '+' : ''}${nf(g, 1)}%`;
    // a igual energía: el precio se divide por la energía de un litro de cada uno
    const porEnergia = p.equivalencia === 'por_energia';
    const ea = ctx.energia?.get(a.energia);
    const eb = ctx.energia?.get(b.energia);
    if (porEnergia && (!ea || !eb)) return fallo('El sitio no tiene el contenido energético de esos productos.');
    const factor = porEnergia ? eb.mj / ea.mj : 1;
    const porMes = meses.map((m) => ({
      m,
      a: P.de(m)[p.producto],
      b: P.de(m)[p.producto_base],
      litro: P.brecha(m, p.producto, p.producto_base),
      g: P.brecha(m, p.producto, p.producto_base, factor),
    }));
    const dato = porMes.reduce((s, x) => s + x.g, 0) / porMes.length;
    let detalle;
    if (porMes.length <= 12) {
      detalle = porEnergia
        ? {
            columnas: ['Mes', `${cap(a.etiqueta)} ($/l)`, `${cap(b.etiqueta)} ($/l)`, 'Por litro', 'A igual energía'],
            filas: porMes.map((x) => [cap(mesTxt(x.m)), nf(x.a), nf(x.b), pct(x.litro), pct(x.g)]),
          }
        : {
            columnas: ['Mes', `${cap(a.etiqueta)} ($/l)`, `${cap(b.etiqueta)} ($/l)`, 'Diferencia'],
            filas: porMes.map((x) => [cap(mesTxt(x.m)), nf(x.a), nf(x.b), pct(x.g)]),
          };
      if (porMes.length > 1) detalle.filas.push(porEnergia ? ['Promedio', '', '', '', pct(dato)] : ['Promedio', '', '', pct(dato)]);
    } else {
      const porAnio = new Map();
      for (const x of porMes) {
        const y = x.m.slice(0, 4);
        if (!porAnio.has(y)) porAnio.set(y, []);
        porAnio.get(y).push(x.g);
      }
      detalle = {
        columnas: ['Año', 'Meses', 'Diferencia promedio', 'Mínima', 'Máxima'],
        filas: [...porAnio.entries()].map(([y, gs]) => [y, String(gs.length), pct(gs.reduce((s, g) => s + g, 0) / gs.length), pct(Math.min(...gs)), pct(Math.max(...gs))]),
      };
      detalle.filas.push(['Promedio', String(porMes.length), pct(dato), '', '']);
    }
    const notas = [a.nota, b.nota];
    if (porEnergia) {
      notas.push(
        factor === 1
          ? 'Los dos productos tienen la misma energía por litro: a igual energía la diferencia es la misma que por litro.'
          : `A igual energía: un litro de ${min(ea.nombre)} tiene ${nf(ea.mj)} MJ y uno de ${min(eb.nombre)} tiene ${nf(eb.mj)} MJ (Directiva (UE) 2018/2001, anexo III). Para dar la misma energía que un litro de ${min(eb.nombre)} hacen falta ${nf(eb.mj / ea.mj, 2)} litros de ${min(ea.nombre)}: se compara el precio de esa cantidad.`
      );
    }
    if (porMes.length > 1) {
      const min = porMes.reduce((x, y) => (y.g < x.g ? y : x));
      const max = porMes.reduce((x, y) => (y.g > x.g ? y : x));
      notas.push(`Es el promedio de las diferencias de cada mes. En el período fue de ${pct(min.g)} (${mesTxt(min.m)}) a ${pct(max.g)} (${mesTxt(max.m)}).`);
    }
    if (meses.length < p.periodo.meses) notas.push(`El período tiene ${p.periodo.meses} meses y hay los dos precios para ${meses.length}.`);
    if (Boolean(a.conImpuestos) !== Boolean(b.conImpuestos)) {
      notas.push('El precio del surtidor incluye impuestos y el otro no: la diferencia mezcla precio e impuestos.');
    }
    return { ok: true, dato, decimales: 1, detalle, notas };
  },
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const min = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const articulo = (s) => (s.startsWith('nafta') ? 'la' : 'el');

// ---------------------------------------------------------------- lectura

const PENDIENTE = '[a definir]';

/** La afirmación redactada tal como se va a medir (sin el valor). */
export function describirMedicion(af, ctx) {
  const ind = INDICADORES[af.indicador];
  if (!ind) return '';
  const suj = af.sujeto ? parsearSujeto(af.sujeto, ctx) : null;
  const sujTxt = suj?.ok ? suj.etiqueta : PENDIENTE;
  const perDe = (codigo) => {
    if (!codigo) return `en ${PENDIENTE}`;
    const r = resolverPeriodo(codigo, ctx);
    return r.ok ? r.con : `en ${PENDIENTE}`;
  };
  const criterio = af.criterio ? CRITERIOS[af.criterio].etiqueta : `con ${PENDIENTE}`;
  const sinPeriodo = af.criterio && CRITERIOS[af.criterio].sinPeriodo;
  const per = sinPeriodo ? '' : ` ${perDe(af.periodo)}`;
  const mag = af.magnitud ? MAGNITUDES[af.magnitud].etiqueta : PENDIENTE;

  switch (af.indicador) {
    case 'cantidad_empresas':
      return `Cantidad de ${sujTxt} ${criterio}${per}`;
    case 'cantidad_grupos':
      return `Cantidad de grupos económicos entre las ${sujTxt} ${criterio}${per}`;
    case 'provincias':
      return `Provincias de las ${sujTxt} ${criterio}${per}`;
    case 'volumen':
      return `${cap(mag)} de ${sujTxt} ${perDe(af.periodo)}`;
    case 'participacion':
      return `Participación de ${sujTxt} en las ${mag}, ${af.base ? BASES[af.base].etiqueta : `sobre ${PENDIENTE}`}, ${perDe(af.periodo)}`
        .replace('en las producción', 'en la producción')
        .replace('en las cupo asignado', 'en el cupo asignado');
    case 'corte':
      return `${af.medida ? MEDIDAS_CORTE[af.medida].etiqueta : `Corte ${PENDIENTE}`} ${perDe(af.periodo)}`;
    case 'faltante':
      return `Biodiésel que faltó para cumplir el corte ${perDe(af.periodo)}`;
    case 'variacion': {
      const r0 = af.periodo_inicial ? resolverPeriodo(af.periodo_inicial, ctx) : null;
      const r1 = af.periodo ? resolverPeriodo(af.periodo, ctx) : null;
      return `Variación de ${mag} de ${sujTxt}, de ${r0?.ok ? r0.etiqueta : PENDIENTE} a ${r1?.ok ? r1.etiqueta : PENDIENTE}`;
    }
    case 'capacidad_instalada':
      return `Capacidad instalada de ${sujTxt}`;
    case 'utilizacion_capacidad':
      return `Uso de la capacidad instalada de ${sujTxt} ${perDe(af.periodo)}`;
    case 'precio': {
      const prod = PRODUCTOS[af.producto];
      if (af.producto === 'impuestos_gasoil') return `Impuestos por litro de gas oil ${perDe(af.periodo)}`;
      return `Precio por litro de ${prod ? prod.etiqueta : PENDIENTE} ${perDe(af.periodo)}`;
    }
    case 'brecha_precio': {
      const pa = PRODUCTOS[af.producto]?.etiqueta ?? PENDIENTE;
      const pb = PRODUCTOS[af.producto_base]?.etiqueta ?? PENDIENTE;
      if (af.equivalencia === 'por_energia') return `Cuánto más caro es el ${pa} que ${articulo(pb)} ${pb}, a igual energía, ${perDe(af.periodo)}`;
      if (!af.equivalencia) return `Cuánto más caro es el ${pa} que ${articulo(pb)} ${pb} (${PENDIENTE}: por litro o a igual energía) ${perDe(af.periodo)}`;
      return `Cuánto más caro es el litro de ${pa} que el de ${pb} ${perDe(af.periodo)}`;
    }
    default:
      return ind.nombre;
  }
}

/** El valor afirmado, con su comparador: "= 25", "≈ 65%", "son exactamente: ...". */
export function describirValor(af) {
  const ind = INDICADORES[af.indicador];
  if (!ind) return '';
  if (ind.valor === 'lista') {
    const lista = (af.valor_lista ?? []).map(lindo).join(', ');
    return af.comparador === 'incluye' ? `incluyen: ${lista}` : `son exactamente: ${lista}`;
  }
  const c = COMPARADORES[af.comparador] ?? COMPARADORES.igual;
  return `${c.simbolo} ${formatearDicho(af.valor_numero, ind.unidad)}`;
}

// ---------------------------------------------------------------- comparación

function compararNumero(af, ind, dato) {
  const v = af.valor_numero;
  const dif = dato - v;
  const u = ind.unidad;
  const fd = (n) => formatearDicho(Math.round(n * 100) / 100, u);
  // diferencia de precios: el margen va sobre el precio que la frase da a entender (ver MARGEN)
  if (ind.margenSobrePrecio && (af.comparador === 'aprox' || af.comparador === 'igual')) {
    const m = af.comparador === 'aprox' ? MARGEN.aproximado : MARGEN.exacto;
    const tol = m * Math.abs(100 + v);
    return {
      cumple: Math.abs(dif) <= tol,
      margen: `Margen de ${m * 100}% sobre el precio${af.comparador === 'aprox' ? ' (se dijo como aproximado)' : ''}: vale si la diferencia está entre ${fd(v - tol)} y ${fd(v + tol)}.`,
    };
  }
  switch (af.comparador) {
    case 'aprox': {
      const tol = ind.entero ? Math.max(1, MARGEN.aproximado * Math.abs(v)) : MARGEN.aproximado * Math.abs(v);
      return {
        cumple: Math.abs(dif) <= tol,
        margen: `Se dijo como aproximado: vale si el dato está a menos de ${MARGEN.aproximado * 100}% (entre ${fd(v - tol)} y ${fd(v + tol)}).`,
      };
    }
    case 'mayor':
      return { cumple: dato > v, margen: 'Sin margen: el dato tiene que ser mayor.' };
    case 'mayor_igual':
      return { cumple: dato >= v, margen: 'Sin margen: el dato tiene que ser igual o mayor.' };
    case 'menor':
      return { cumple: dato < v, margen: 'Sin margen: el dato tiene que ser menor.' };
    case 'menor_igual':
      return { cumple: dato <= v, margen: 'Sin margen: el dato tiene que ser igual o menor.' };
    default: {
      if (ind.entero) {
        return { cumple: Math.round(dato) === Math.round(v), margen: 'Sin margen: las cantidades se comparan exactas.' };
      }
      const tol = MARGEN.exacto * Math.abs(v);
      return {
        cumple: Math.abs(dif) <= tol,
        margen: `Margen de ${MARGEN.exacto * 100}%: vale si el dato está entre ${fd(v - tol)} y ${fd(v + tol)}.`,
      };
    }
  }
}

function compararLista(af, dato) {
  const dichas = [...new Set((af.valor_lista ?? []).map((x) => ALIAS_PROVINCIA[norm(x)] ?? norm(x)))];
  const reales = dato.map(norm);
  const faltan = dichas.filter((d) => !reales.includes(d)); // dichas que no están en los datos
  const sobran = reales.filter((r) => !dichas.includes(r)); // en los datos y no dichas
  const cumple = af.comparador === 'incluye' ? faltan.length === 0 : faltan.length === 0 && sobran.length === 0;
  const partes = [];
  if (faltan.length) partes.push(`Se nombró y no aparece en los datos: ${faltan.map(lindo).join(', ')}.`);
  if (sobran.length && af.comparador !== 'incluye') partes.push(`Aparece en los datos y no se nombró: ${sobran.map(lindo).join(', ')}.`);
  if (!partes.length) partes.push('Las listas coinciden.');
  return { cumple, margen: partes.join(' ') };
}

// ---------------------------------------------------------------- veredicto por afirmación

export const ESTADOS = {
  VERDADERO: { etiqueta: 'Verdadero', k: 'V' },
  FALSO: { etiqueta: 'Falso', k: 'F' },
  INDETERMINADO: { etiqueta: 'Indeterminado', k: 'I' },
  // cierto para una parte del universo; la misma norma no lo aplica a la otra (HDO, 22/11/2026)
  DOBLE_VARA: { etiqueta: 'Doble vara', k: 'D' },
  OPINION: { etiqueta: 'No se evalúa', k: null },
};

/**
 * Los grupos económicos del sitio son los de hoy: empresas.json guarda un solo
 * grupo por empresa, sin fecha de ingreso. Aplicado hacia atrás, le suma a un
 * grupo lo que vendían empresas que entonces no eran suyas (caso visto el
 * 22/11/2026: Diferoil vendió 794 t al cupo en 2011, antes de ser del Grupo
 * Bojanich). Hasta tener las fechas de ingreso, una afirmación sobre un grupo
 * solo se evalúa del año pasado en adelante. Límite provisorio: lo confirma HDO.
 */
function periodoViejoConGrupo(af, p, ctx) {
  const usaGrupo = af.indicador === 'cantidad_grupos' || p.sujeto?.filtros.some((f) => f.tipo === 'grupo');
  if (!usaGrupo || (af.criterio && CRITERIOS[af.criterio]?.sinPeriodo)) return null;
  const limite = `${Number(ctx.ultimo.slice(0, 4)) - 1}-01`;
  return [p.periodo_inicial, p.periodo].filter(Boolean).find((per) => per.desde < limite) ?? null;
}

const PREFIJO_DICHO = {
  aprox: 'alrededor de ',
  mayor: 'más de ',
  mayor_igual: 'al menos ',
  menor: 'menos de ',
  menor_igual: 'a lo sumo ',
};

/** Parámetros del indicador que todavía están sin definir. */
export function parametrosAbiertos(af) {
  const ind = INDICADORES[af.indicador];
  if (af.tipo !== 'dato' || !ind) return [];
  return ind.parametros.filter((n) => {
    if (n === 'periodo' && af.criterio && CRITERIOS[af.criterio]?.sinPeriodo) return false;
    return af[n] === null || af[n] === undefined || af[n] === '';
  });
}

/** Las citas de una afirmación, con el artículo y la norma de donde salen. */
export function citasCompletas(af, ctx) {
  return (af.citas ?? [])
    .map((c) => {
      const item = ctx.normas.items.get(c.id);
      const norma = item && ctx.normas.normaDe.get(item.norma);
      if (!item || !norma) return null;
      return {
        id: c.id,
        texto: c.texto,
        rotulo: item.rotulo,
        titulo: item.titulo,
        completo: item.texto,
        normaId: norma.id,
        resena: Boolean(norma.resena), // es el resumen del sitio, no el texto de la norma
        norma: norma.corto,
        ruta: norma.ruta,
        url: item.url ?? norma.url ?? null,
      };
    })
    .filter(Boolean);
}

/**
 * Afirmación sobre lo que dice una norma. Acá el juicio (respalda / contradice)
 * lo propone la IA; el motor solo lo toma si viene con una cita que figura
 * textual en la base de textos (ya comprobada en analisis.js).
 */
function evaluarNorma(af, base, ctx) {
  const citas = citasCompletas(af, ctx);
  // una afirmación técnica se prueba con datos de la ficha (contenido energético, emisiones)
  const datos = (af.datos ?? []).map((id) => ctx.ficha?.porId.get(id)).filter(Boolean);
  const comun = {
    ...base,
    origen: 'norma',
    citas,
    datos,
    explicacion: af.norma_explicacion || '',
    normas: [...new Set([...citas.map((c) => c.norma), ...datos.map((d) => d.tema.charAt(0).toLowerCase() + d.tema.slice(1))])],
  };
  if (af.norma_juicio === 'no_alcanza') {
    return { ...comun, estado: 'INDETERMINADO', motivo: citas.length || !datos.length ? 'El texto legal no alcanza para decidirlo.' : 'Los datos no alcanzan para decidirlo.' };
  }
  if (!citas.length && !datos.length) {
    return {
      ...comun,
      estado: 'INDETERMINADO',
      motivo: 'No hay una cita textual ni un dato que respalde un veredicto: no se da.',
    };
  }
  return { ...comun, estado: af.norma_juicio === 'respalda' ? 'VERDADERO' : 'FALSO' };
}

/**
 * Segunda lectura (criterio de HDO, 22/11/2026). Solo corre cuando la afirmación,
 * al pie de la letra, dio Verdadero, y solo si lo omitido viene probado: con una
 * cita que figura textual en la base de textos, o con un dato de la ficha del
 * sitio (ficha.js), que calcula el programa:
 *
 *  - doble vara: lo dicho vale para una parte del universo y no para la otra.
 *    El sello es Doble vara.
 *  - verdad a medias: es un resultado intermedio, no un sello. Se incorpora lo
 *    que la frase omite y se evalúa de nuevo; el sello sale de esa evaluación.
 */
function conSegundaLectura(v, af, ctx) {
  const r = af.revision;
  if (!r || v.estado !== 'VERDADERO') return v;
  const citas = citasCompletas({ citas: r.citas }, ctx);
  const datos = (r.datos ?? []).map((id) => ctx.ficha?.porId.get(id)).filter(Boolean);
  if (!citas.length && !datos.length) return v;
  const revision = { tipo: r.tipo, omite: r.omite, explicacion: r.explicacion, citas, datos };
  if (r.tipo === 'doble_vara') {
    return { ...v, estado: 'DOBLE_VARA', literal: 'VERDADERO', revision: { ...revision, vale_para: r.vale_para, no_vale_para: r.no_vale_para } };
  }
  const estado = r.resultado === 'no_se_sostiene' ? 'FALSO' : r.resultado === 'se_sostiene' ? 'VERDADERO' : 'INDETERMINADO';
  return { ...v, estado, literal: 'VERDADERO', revision: { ...revision, resultado: r.resultado } };
}

export function evaluarAfirmacion(af, ctx) {
  return conSegundaLectura(evaluarLiteral(af, ctx), af, ctx);
}

/** El veredicto al pie de la letra: lo dicho contra el dato o contra el texto. */
function evaluarLiteral(af, ctx) {
  const base = { id: af.id, cita: af.cita, tipo: af.tipo };

  if (af.tipo === 'opinion') {
    // Una opinión que da por cierto algo que los textos o los datos desmienten es
    // falsa: derecho a una opinión, no a datos propios (HDO, 22/11/2026).
    const citas = af.choca ? citasCompletas(af, ctx) : [];
    const datos = af.choca ? (af.datos ?? []).map((id) => ctx.ficha?.porId.get(id)).filter(Boolean) : [];
    if (af.choca && (citas.length || datos.length)) {
      return { ...base, estado: 'FALSO', origen: 'opinion', hecho: af.opinion_hecho, citas, datos, explicacion: af.norma_explicacion || '' };
    }
    return { ...base, estado: 'OPINION', motivo: af.motivo || 'Es una opinión o un juicio de valor: no es un hecho que se pueda medir.' };
  }
  if (af.tipo === 'norma') return evaluarNorma(af, base, ctx);
  if (af.tipo !== 'dato') {
    return { ...base, estado: 'INDETERMINADO', motivo: af.motivo || 'El sitio no tiene datos para comprobarlo.' };
  }

  const ind = INDICADORES[af.indicador];
  const lectura = `${describirMedicion(af, ctx)} ${describirValor(af)}`;
  const comun = { ...base, lectura, medicion: describirMedicion(af, ctx), fuente: ind.fuente };

  // el padrón de plantas no tiene período: se completa con uno cualquiera válido
  const afCalc = af.criterio && CRITERIOS[af.criterio]?.sinPeriodo && !af.periodo ? { ...af, periodo: 'ultimo_mes' } : af;
  const r = resolverParametros(afCalc, ind, ctx);
  if (!r.ok) return { ...comun, estado: 'INDETERMINADO', motivo: r.motivo };

  const calc = CALCULOS[af.indicador](r.p, ctx);
  if (!calc.ok) return { ...comun, estado: 'INDETERMINADO', motivo: calc.motivo };

  const esLista = ind.valor === 'lista';
  const datoTxt = esLista ? calc.dato.map(lindo).join(', ') : formatear(calc.dato, ind.unidad, calc.decimales);

  const viejo = periodoViejoConGrupo(af, r.p, ctx);
  if (viejo) {
    return {
      ...comun,
      estado: 'INDETERMINADO',
      motivo: `El sitio arma cada grupo económico con las empresas que lo integran hoy y no registra desde cuándo pertenece cada una. Con la composición de hoy el dato sería ${datoTxt}, pero eso no alcanza para afirmar qué pasaba ${viejo.con}.`,
      detalle: calc.detalle,
      notas: calc.notas ?? [],
    };
  }

  const cmp = esLista ? compararLista(af, calc.dato) : compararNumero(af, ind, calc.dato);
  const notas = [...(calc.notas ?? [])];
  if (!esLista && r.p.periodo?.etiqueta?.includes('año en curso')) {
    notas.push('El año todavía no cerró: se cuenta lo que hay publicado.');
  }

  // la diferencia solo dice algo cuando se afirmó un número; con "más de" o "menos de" es ruido
  const conDiferencia = !esLista && (af.comparador === 'igual' || af.comparador === 'aprox');
  const dif = esLista ? 0 : calc.dato - af.valor_numero;

  return {
    ...comun,
    estado: cmp.cumple ? 'VERDADERO' : 'FALSO',
    dicho: esLista
      ? (af.valor_lista ?? []).map(lindo).join(', ')
      : `${PREFIJO_DICHO[af.comparador] ?? ''}${formatearDicho(af.valor_numero, ind.unidad)}`,
    dato: datoTxt,
    datoCrudo: calc.dato,
    diferencia: !conDiferencia
      ? null
      : ind.unidad === '$/l'
        ? `${dif > 0 ? '+' : '-'}$ ${nf(Math.abs(dif), calc.decimales ?? 0)} por litro`
        : `${dif > 0 ? '+' : ''}${formatear(dif, ind.unidad === '%' ? 'pp' : ind.unidad, ind.unidad === '%' ? (calc.decimales ?? 1) : 0)}${ind.unidad === '%' ? ' puntos' : ''}`,
    margen: cmp.margen,
    detalle: calc.detalle,
    notas,
  };
}

// ---------------------------------------------------------------- forma lógica (Kleene, tres valores)

// Cuatro valores: V verdadero, F falso, I indeterminado, D doble vara.
// "y": manda el peor (F, después D, después I). "o": manda el mejor (V, después D, después I).
// La doble vara es un hallazgo firme: pesa más que lo que no se pudo comprobar.
const ORDEN_Y = ['F', 'D', 'I', 'V'];
const ORDEN_O = ['V', 'D', 'I', 'F'];
const Y = (a, b) => ORDEN_Y.find((k) => a === k || b === k);
const O = (a, b) => ORDEN_O.find((k) => a === k || b === k);
const NO = (a) => (a === 'V' ? 'F' : a === 'F' ? 'V' : a);

function tokens(forma) {
  const s = String(forma ?? '').replace(/∧/g, ' y ').replace(/∨/g, ' o ').replace(/¬/g, ' no ');
  const lista = s.match(/A\d+|\(|\)|[a-zA-Z]+/g) ?? [];
  return lista.map((t) => (/^A\d+$/i.test(t) ? t.toUpperCase() : t.toLowerCase()));
}

/**
 * Evalúa "A1 y (A2 o no A3)" con lógica de tres valores.
 * `valorDe(id)` devuelve 'V', 'F', 'I' o 'D'. Devuelve null si la forma no se puede leer.
 */
export function evaluarForma(forma, valorDe) {
  const t = tokens(forma);
  let i = 0;
  let roto = false;

  function factor() {
    const x = t[i];
    if (x === 'no') {
      i += 1;
      return NO(factor());
    }
    if (x === '(') {
      i += 1;
      const v = expr();
      if (t[i] !== ')') roto = true;
      i += 1;
      return v;
    }
    if (x && /^A\d+$/.test(x)) {
      i += 1;
      const v = valorDe(x);
      if (!v) roto = true;
      return v ?? 'I';
    }
    roto = true;
    i += 1;
    return 'I';
  }
  function termino() {
    let v = factor();
    while (t[i] === 'y') {
      i += 1;
      v = Y(v, factor());
    }
    return v;
  }
  function expr() {
    let v = termino();
    while (t[i] === 'o') {
      i += 1;
      v = O(v, termino());
    }
    return v;
  }

  if (!t.length) return null;
  const v = expr();
  if (roto || i < t.length) return null;
  return v;
}

/** "A1 y no A2" -> "A1 ∧ ¬A2" */
export function formaVisible(forma) {
  return tokens(forma)
    .map((x) => (x === 'y' ? '∧' : x === 'o' ? '∨' : x === 'no' ? '¬' : x))
    .join(' ')
    .replace(/¬ /g, '¬')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')');
}

// ---------------------------------------------------------------- enunciado completo

const DE_K = { V: 'VERDADERO', F: 'FALSO', I: 'INDETERMINADO', D: 'DOBLE_VARA' };

export function evaluarEnunciado(analisis, ctx) {
  const veredictos = analisis.afirmaciones.map((af) => evaluarAfirmacion(af, ctx));
  const evaluables = veredictos.filter((v) => v.estado !== 'OPINION');
  const kDe = new Map(evaluables.map((v) => [v.id, ESTADOS[v.estado].k]));

  if (!evaluables.length) {
    return {
      veredictos,
      forma: '',
      estado: 'OPINION',
      resumen: 'El enunciado no afirma ningún hecho medible: es una opinión.',
    };
  }

  const conjuncion = evaluables.map((v) => v.id).join(' y ');
  let forma = analisis.forma;
  let k = evaluarForma(forma, (id) => kDe.get(id));
  if (!k) {
    forma = conjuncion;
    k = evaluarForma(forma, (id) => kDe.get(id));
  }

  const n = (estado) => evaluables.filter((v) => v.estado === estado).length;
  const partes = [];
  if (evaluables.length === 1) {
    const unica = evaluables[0];
    const contra = unica.origen !== 'norma' ? 'los datos' : unica.citas.length ? 'el texto legal' : 'los datos técnicos';
    // (una opinión que choca con los hechos tiene su propia frase, más abajo)
    partes.push(
      {
        VERDADERO: `La afirmación coincide con ${contra}.`,
        FALSO:
          unica.origen === 'opinion'
            ? 'Es una opinión, pero da por cierto algo que los hechos desmienten.'
            : unica.revision
              ? 'Al pie de la letra es cierta, pero con lo que omite no se sostiene.'
              : `La afirmación no coincide con ${contra}.`,
        DOBLE_VARA: 'Lo que dice es cierto para una parte y no para la otra.',
        INDETERMINADO: 'La afirmación no se puede comprobar con los datos y los textos disponibles.',
      }[unica.estado]
    );
  } else {
    const cuenta = [
      [n('VERDADERO'), 'verdadera', 'verdaderas'],
      [n('FALSO'), 'falsa', 'falsas'],
      [n('DOBLE_VARA'), 'con doble vara', 'con doble vara'],
      [n('INDETERMINADO'), 'que no se puede comprobar', 'que no se pueden comprobar'],
    ]
      .filter(([k]) => k > 0)
      .map(([k, uno, varias]) => `${k} ${k === 1 ? uno : varias}`);
    if (cuenta.length === 1) {
      // todas dieron lo mismo
      const todas = { VERDADERO: 'son verdaderas', FALSO: 'son falsas', DOBLE_VARA: 'tienen doble vara', INDETERMINADO: 'no se pueden comprobar' };
      partes.push(`Las ${evaluables.length} afirmaciones ${todas[evaluables[0].estado]}.`);
    } else {
      partes.push(`De las ${evaluables.length} afirmaciones: ${cuenta.slice(0, -1).join(', ')} y ${cuenta[cuenta.length - 1]}.`);
    }
  }

  // con "o" y "no" la cuenta de aciertos no alcanza para entender el resultado: se dice cómo se llegó
  if (/\bo\b|\bno\b/.test(forma)) {
    partes.push(`Aplicada la fórmula ${formaVisible(forma)}, el enunciado resulta ${ESTADOS[DE_K[k]].etiqueta.toLowerCase()}.`);
  }

  return { veredictos, forma, estado: DE_K[k], resumen: partes.join(' ') };
}
