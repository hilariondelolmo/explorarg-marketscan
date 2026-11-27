// Analista (Agente Explorarg) - motor de cálculo.
//
// Recibe una consulta ya controlada (consulta.js) y la resuelve con los JSON
// del sitio. Acá no hay IA: todo número que muestra el Analista sale de estas
// funciones. Corre igual en el navegador, en el servidor y en el banco de prueba.
//
// Una consulta se resuelve en dos pasos:
//   1. medir: para cada grupo (empresa, provincia, petrolera...) y cada tramo de
//      tiempo, se juntan los "componentes" de la medida (toneladas, o numerador y
//      denominador si es un porcentaje) y recién al final se calcula el valor.
//      Así un porcentaje de un grupo sale de sus totales, no de promediar porcentajes.
//   2. presentar: según el tipo de pedido (ranking, evolución, total, comparación)
//      se arma la tabla, el gráfico y las notas.
//
// Desde el 23/11/2026 los menús de la página son de selección múltiple: un pedido
// puede traer varios tipos, varias medidas y varios valores en cada filtro.
// resolverConsulta lo abre en bloques: uno por cada tipo, con las medidas juntas
// en la misma tabla (o un bloque por medida cuando juntas no se leerían).

import { grupoPublico } from '../poligrafo/catalogo.js';
import { corteDelPeriodo, lindo, norm } from '../poligrafo/motor.js';
import { DIMENSIONES, EQUIVALENCIAS, METRICAS, OTRAS_EMPRESAS, PRODUCTOS, TOPE_MAXIMO, UNIDADES } from './catalogo.js';
import { MESES_SIN_PRECIO_DE_GASOIL, brechaDe, mesesConPrecio, motivoSinConversion, notaDelDato, notaDeMesesSinPrecio, notasDeConversion, notasDeDensidad, precioDe, serieAuxiliar, tableroDe, vienePorVolumen } from './productos.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const mesTxt = (iso) => `${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
/** Primera letra en minúscula, sin tocar el resto ("Precio ... a Rosario" no pierde la mayúscula de Rosario). */
export const minuscula = (t) => t.charAt(0).toLowerCase() + t.slice(1);

export function sumarMes(iso, n) {
  const total = Number(iso.slice(0, 4)) * 12 + (Number(iso.slice(5, 7)) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function mesesEntre(desde, hasta) {
  const out = [];
  for (let m = desde; m <= hasta && out.length < 600; m = sumarMes(m, 1)) out.push(m);
  return out;
}

/** "2025", "ene 2023 a dic 2024", "sep 2026". */
export function periodoTxt(desde, hasta) {
  if (desde === hasta) return mesTxt(desde);
  if (desde.slice(0, 4) === hasta.slice(0, 4) && desde.endsWith('-01') && hasta.endsWith('-12')) return desde.slice(0, 4);
  return `${mesTxt(desde)} a ${mesTxt(hasta)}`;
}

const CATEGORIA_TXT = { INTEGRADA: 'Integradas', 'NO INTEGRADA': 'No integradas', COMERCIALIZADORA: 'Comercializadoras' };
const CAMPO = { empresa: 'nombre', grupo: 'grupo', categoria: 'categoria', provincia: 'provincia', localidad: 'localidad', camara: 'camara' };

/** Cómo se muestra el nombre de un grupo. */
export function etiquetaGrupo(dim, clave, ctx) {
  if (dim === 'grupo') return grupoPublico(clave);
  if (dim === 'categoria') return CATEGORIA_TXT[clave] ?? lindo(clave);
  if (dim === 'provincia' || dim === 'localidad') return lindo(clave);
  if (dim === 'zona') return ctx.aceite?.resumen?.find((z) => z.zona === clave)?.rotulo ?? clave;
  if (dim === 'sector') return clave === 'S/N' ? 'Sin sector informado' : clave;
  if (dim === 'vendedora') return clave === OTRAS_EMPRESAS ? 'Otras empresas' : clave;
  if (dim === 'canal') return clave === 'N/D' ? 'Sin canal informado' : clave;
  return clave;
}

// cada filtro es una lista: pasa la empresa que coincide con alguno de los valores tildados
const pasaFiltros = (filtros) => (e) =>
  Object.entries(CAMPO).every(([f, campo]) => !filtros?.[f]?.length || filtros[f].includes(e[campo]));

// ---------------------------------------------------------------- tramos de tiempo

/** Los tramos que pide la consulta: uno (ranking, total), dos (comparación) o uno por mes o año. */
function armarTramos(q) {
  if (q.tipo === 'comparacion') {
    return [
      { clave: 'inicial', etiqueta: periodoTxt(q.desde0, q.hasta0), desde: q.desde0, hasta: q.hasta0 },
      { clave: 'final', etiqueta: periodoTxt(q.desde, q.hasta), desde: q.desde, hasta: q.hasta },
    ];
  }
  if (q.tipo !== 'evolucion') return [{ clave: 'periodo', etiqueta: periodoTxt(q.desde, q.hasta), desde: q.desde, hasta: q.hasta }];
  const meses = mesesEntre(q.desde, q.hasta);
  if (q.tiempo !== 'anio') return meses.map((m) => ({ clave: m, etiqueta: mesTxt(m), desde: m, hasta: m }));
  const porAnio = new Map();
  for (const m of meses) {
    const y = m.slice(0, 4);
    if (!porAnio.has(y)) porAnio.set(y, { clave: y, desde: m, hasta: m });
    porAnio.get(y).hasta = m;
  }
  return [...porAnio.values()].map((t) => ({
    ...t,
    etiqueta: t.desde.endsWith('-01') && t.hasta.endsWith('-12') ? t.clave : `${t.clave} (${MESES[Number(t.desde.slice(5)) - 1]} a ${MESES[Number(t.hasta.slice(5)) - 1]})`,
  }));
}

/** mes -> índices de los tramos que lo contienen. */
function tramosPorMes(tramos) {
  const m = new Map();
  tramos.forEach((t, i) => {
    for (const mes of mesesEntre(t.desde, t.hasta)) {
      if (!m.has(mes)) m.set(mes, []);
      m.get(mes).push(i);
    }
  });
  return m;
}

// ---------------------------------------------------------------- medir

class Acumulador {
  constructor(nTramos, claves) {
    this.n = nTramos;
    this.claves = claves;
    this.grupos = new Map();
    this.total = this.vacio();
  }

  vacio() {
    return Array.from({ length: this.n }, () => Object.fromEntries(this.claves.map((k) => [k, 0])));
  }

  sumar(grupo, tramo, componentes) {
    if (grupo !== null && grupo !== undefined) {
      if (!this.grupos.has(grupo)) this.grupos.set(grupo, this.vacio());
      for (const k of this.claves) this.grupos.get(grupo)[tramo][k] += componentes[k] || 0;
    }
    for (const k of this.claves) this.total[tramo][k] += componentes[k] || 0;
  }
}

const NOTAS_DE_SERIE = {
  tipo_cambio: 'Tipo de cambio: pesos por dólar, promedio de cada mes. Es el que usa el sitio para pasar los precios de dólares a pesos.',
  retencion: 'Derecho de exportación (retención) vigente en cada mes, en porcentaje del valor exportado.',
  margen_biodiesel: 'Margen = precio oficial del biodiésel menos aceite de soja FAS teórico oficial (FOB oficial menos retención), los dos en dólares por tonelada. Es la misma cuenta de la página Márgenes.',
  margen_biodiesel_pct: 'Margen = precio oficial del biodiésel menos aceite de soja FAS teórico oficial, como porcentaje del precio del biodiésel. Es la misma cuenta de la página Márgenes.',
  crack_biodiesel: 'Crack spread 10:9:1 = 0,9 x biodiésel + 0,1 x glicerina - aceite de soja, en dólares por tonelada de aceite: diez de aceite dan nueve de biodiésel y una de glicerina. Es la misma cuenta de la página Márgenes.',
  crack_biodiesel_pct: 'Crack spread 10:9:1 = 0,9 x biodiésel + 0,1 x glicerina - aceite de soja, como porcentaje del precio del aceite. Es la misma cuenta de la página Márgenes.',
};

// el relevamiento por canal: [mes, canal dist, canal com, vol2, surt2, conimp2, sinimp2, vol3, surt3, conimp3, sinimp3]
const COLUMNAS_DE_CANAL = {
  precio_canal: { vol: 3, precio: 6 },
  precio_canal_con_impuestos: { vol: 3, precio: 5 },
  precio_canal_g3: { vol: 7, precio: 10 },
  precio_canal_g3_con_impuestos: { vol: 7, precio: 9 },
};

const NOTA_CON_CUPO = 'Entran solo las petroleras con cupo de biodiésel asignado en el período: las revendedoras compran el gas oil ya cortado y no tienen obligación propia de mezcla.';

const FAMILIAS = {
  empresas(q, ctx, tramos) {
    const m = METRICAS[q.metrica];
    const acc = new Acumulador(tramos.length, ['a', 'b']);
    const porMes = tramosPorMes(tramos);
    const campo = CAMPO[q.agrupar];
    const lista = ctx.empresas.filter(pasaFiltros(q.filtros));
    const notas = [];

    if (q.metrica === 'capacidad') {
      for (const e of lista) if (e.capacidad > 0) tramos.forEach((_, i) => acc.sumar(campo ? e[campo] : null, i, { a: e.capacidad }));
      notas.push(`La capacidad es la de las plantas en operación según el tablero de Capacidad del sitio (a ${mesTxt(ctx.fechaCapacidad)}): no cambia con el período.`);
      return { acc, valor: (c) => (c.a > 0 ? c.a : null), notas };
    }

    const { anios, de: fotos } = ctx.capacidadAnual ?? { anios: [] };
    const foto = (y) => fotos?.get([...anios].reverse().find((x) => x <= y) ?? anios[0]);
    for (const e of lista) {
      const grupo = campo ? e[campo] : null;
      for (const r of e.serie) {
        const cuales = porMes.get(r[0]);
        if (!cuales) continue;
        for (const i of cuales) {
          if (q.metrica === 'cumplimiento_cupo') acc.sumar(grupo, i, { a: r[3] || 0, b: r[2] || 0 });
          else if (q.metrica === 'uso_capacidad') acc.sumar(grupo, i, { a: r[1] || 0 });
          else acc.sumar(grupo, i, { a: r[m.idx] || 0 });
        }
      }
      if (q.metrica === 'uso_capacidad' && anios.length) {
        // la capacidad de cada mes es la de la foto de ese año, dividida doce
        const k = norm(e.nombre);
        tramos.forEach((t, i) => {
          let cap = 0;
          for (const mes of mesesEntre(t.desde, t.hasta)) cap += (foto(Number(mes.slice(0, 4)))?.get(k) || 0) / 12;
          if (cap > 0) acc.sumar(grupo, i, { b: cap });
        });
      }
    }
    if (q.metrica === 'cumplimiento_cupo') {
      notas.push('Cumplimiento = ventas al cupo sobre cupo asignado, con los totales de cada grupo en el período.');
      return { acc, valor: (c) => (c.b > 0 ? (c.a / c.b) * 100 : null), notas };
    }
    if (q.metrica === 'uso_capacidad') {
      notas.push('Uso = producción del período sobre la capacidad en operación de esos meses (tablero de Capacidad: una foto por año).');
      return { acc, valor: (c) => (c.b > 0 ? (c.a / c.b) * 100 : null), notas };
    }
    return { acc, valor: (c) => c.a, notas };
  },

  compras(q, ctx, tramos) {
    const d = ctx.compras;
    if (!d?.ventas?.length) return { error: 'El sitio no tiene cargadas las compras por petrolera.' };
    const acc = new Acumulador(tramos.length, ['a']);
    const porMes = tramosPorMes(tramos);
    const empresaDe = new Map(ctx.empresas.map((e) => [norm(e.nombre), e]));
    const pasa = pasaFiltros(q.filtros);
    const vendedoras = d.empresas.map((n) => empresaDe.get(norm(n)) ?? null);
    for (const [mi, ei, pi, t] of d.ventas) {
      const cuales = porMes.get(d.meses[mi]);
      if (!cuales || !t) continue;
      const e = vendedoras[ei];
      if (!e || !pasa(e)) continue;
      const petrolera = d.petroleras[pi];
      if (q.filtros?.petrolera?.length && !q.filtros.petrolera.includes(petrolera)) continue;
      const grupo = q.agrupar === 'petrolera' ? petrolera : CAMPO[q.agrupar] ? e[CAMPO[q.agrupar]] : null;
      for (const i of cuales) acc.sumar(grupo, i, { a: t });
    }
    return { acc, valor: (c) => c.a, notas: ['Son las compras de biodiésel para el corte obligatorio: lo que cada elaboradora le vendió a cada petrolera.'] };
  },

  corte(q, ctx, tramos) {
    // el gas oil importado: los despachos de importación, solos o contra el gas oil vendido
    if (q.metrica === 'gasoil_importado' || q.metrica === 'gasoil_importado_pct') {
      const ranking = ctx.fuentesPrecio?.gasoilRanking;
      if (!ranking?.importaciones?.length) return { error: 'El sitio no tiene cargadas las importaciones de gas oil.' };
      const acc = new Acumulador(tramos.length, ['ton', 'go', 'n']);
      const porMes = tramosPorMes(tramos);
      const vendido = new Map(ctx.corteMensual.map((c) => [c.fecha, c.go_m3]));
      for (const m of ranking.importaciones) {
        const cuales = porMes.get(m.fecha);
        if (!cuales) continue;
        for (const i of cuales) acc.sumar(null, i, { ton: m.ton || 0, go: vendido.get(m.fecha) || 0, n: 1 });
      }
      const notas = ['Gas oil importado: toneladas de los despachos de importación de cada mes, sin las compras de CAMMESA para las usinas.'];
      const ultimo = ranking.importaciones[ranking.importaciones.length - 1].fecha;
      if (tramos[tramos.length - 1].hasta > ultimo) notas.push(`Hay importaciones cargadas hasta ${mesTxt(ultimo)}: los meses que siguen no cuentan.`);
      if (q.metrica === 'gasoil_importado') return { acc, valor: (c) => (c.n > 0 ? c.ton : null), notas };
      notas.push(`Las toneladas importadas se pasan a metros cúbicos con la densidad del gas oil (${String(ranking.densidad_go).replace('.', ',')}) y se comparan con el gas oil grado 2 y grado 3 vendido en esos meses, sin bunker ni usinas.`);
      return { acc, valor: (c) => (c.go > 0 ? (c.ton / ranking.densidad_go / c.go) * 100 : null), notas };
    }
    const acc = new Acumulador(tramos.length, ['bio', 'go', 'oblig', 'falt']);
    tramos.forEach((t, i) => {
      const c = corteDelPeriodo(ctx, t);
      if (c) acc.sumar(null, i, { bio: c.bio, go: c.go, oblig: (c.obligatorio / 100) * c.go, falt: c.faltante });
    });
    const valores = {
      corte_real: (c) => (c.go > 0 ? (c.bio / c.go) * 100 : null),
      corte_obligatorio: (c) => (c.go > 0 ? (c.oblig / c.go) * 100 : null),
      cumplimiento_corte: (c) => (c.oblig > 0 ? (c.bio / c.oblig) * 100 : null),
      faltante: (c) => (c.go > 0 ? c.falt : null),
      gasoil_vendido: (c) => (c.go > 0 ? c.go : null),
    };
    const notas = {
      corte_real: 'Corte real = biodiésel vendido al cupo sobre gas oil grado 2 y grado 3 vendido, en volumen.',
      corte_obligatorio: 'En un período de varios meses, el corte obligatorio va ponderado por las ventas de gas oil de cada mes.',
      cumplimiento_corte: 'Cumplimiento = corte real dividido corte obligatorio.',
      faltante: 'Cada mes cuenta solo si el corte real quedó por debajo del obligatorio.',
      gasoil_vendido: 'Gas oil grado 2 y grado 3, sin bunker ni usinas: la base sobre la que se mide el corte.',
    };
    return { acc, valor: valores[q.metrica], notas: [notas[q.metrica]] };
  },

  // Ventas de gas oil por sector y por petrolera (go_sectores.json: tablas de ventas de la Secretaría de Energía).
  gasoil(q, ctx, tramos) {
    const d = ctx.gasoilSectores;
    if (!d?.mensual_total?.length) return { error: 'El sitio no tiene cargadas las ventas de gas oil por sector.' };
    const acc = new Acumulador(tramos.length, ['a']);
    const porMes = tramosPorMes(tramos);
    const sectores = q.filtros?.sector?.length ? q.filtros.sector : d.sectores;
    const elegidas = q.filtros?.vendedora ?? [];
    const grupoDe = (sector, petrolera) => (q.agrupar === 'sector' ? sector : q.agrupar === 'vendedora' ? petrolera : null);
    const notas = ['Gas oil grado 2 y grado 3 vendido en el país, según las tablas de ventas de la Secretaría de Energía. Entran todos los sectores, también bunker y usinas eléctricas, que no llevan corte.'];
    if (q.agrupar !== 'vendedora' && !elegidas.length) {
      // sin abrir por petrolera: el total del sistema, con todas las empresas
      for (const fila of d.mensual_total) {
        const cuales = porMes.get(fila.fecha);
        if (!cuales) continue;
        for (const sec of sectores) if (fila[sec]) for (const i of cuales) acc.sumar(grupoDe(sec, null), i, { a: fila[sec] });
      }
      return { acc, valor: (c) => c.a, notas };
    }
    // por petrolera: las que el sitio identifica por nombre; el resto del total va junto
    const identificado = new Map(); // "mes|sector" -> m³ de las identificadas
    for (const fila of d.mensual_petrolera) {
      const cuales = porMes.get(fila.fecha);
      if (!cuales) continue;
      for (const sec of sectores) {
        const v = fila[sec];
        if (!v) continue;
        const k = `${fila.fecha}|${sec}`;
        identificado.set(k, (identificado.get(k) || 0) + v);
        if (elegidas.length && !elegidas.includes(fila.petrolera)) continue;
        for (const i of cuales) acc.sumar(grupoDe(sec, fila.petrolera), i, { a: v });
      }
    }
    if (!elegidas.length) {
      for (const fila of d.mensual_total) {
        const cuales = porMes.get(fila.fecha);
        if (!cuales) continue;
        for (const sec of sectores) {
          const resto = (fila[sec] || 0) - (identificado.get(`${fila.fecha}|${sec}`) || 0);
          if (resto > 0.5) for (const i of cuales) acc.sumar(grupoDe(sec, OTRAS_EMPRESAS), i, { a: resto });
        }
      }
      notas.push('«Otras empresas» junta lo que vendieron las que el sitio no identifica por nombre.');
    }
    return { acc, valor: (c) => c.a, notas };
  },

  // El corte de cada petrolera (petroleras.json): la misma cuenta que el tablero Cumplimiento Corte, Petroleras.
  petroleras(q, ctx, tramos) {
    const d = ctx.petroleras;
    const densidad = ctx.fuentesPrecio?.densidadBio;
    if (!d?.go_mensual?.length || !densidad) return { error: 'El sitio no tiene cargado el gas oil vendido por petrolera.' };
    const elegidas = q.filtros?.vendedora ?? [];
    const pasa = (p) => !elegidas.length || elegidas.includes(p);
    const porMes = tramosPorMes(tramos);
    const obligatorio = new Map(ctx.corteMensual.map((c) => [c.fecha, c.obligatorio]));
    const vendidoPais = new Map(ctx.corteMensual.map((c) => [c.fecha, c.go_m3]));
    // por petrolera y por tramo: gas oil vendido, biodiésel que le exigía el corte, biodiésel comprado y cupo asignado
    const base = new Acumulador(tramos.length, ['go', 'req', 'bio', 'cupo']);
    const resto = tramos.map(() => 0);
    for (const fila of d.go_mensual) {
      const cuales = porMes.get(fila.fecha);
      const o = obligatorio.get(fila.fecha);
      if (!cuales || o === null || o === undefined) continue;
      let identificado = 0;
      for (const [p, v] of Object.entries(fila)) {
        if (p === 'fecha' || !v) continue;
        identificado += v;
        if (pasa(p)) for (const i of cuales) base.sumar(p, i, { go: v, req: v * o });
      }
      const pais = vendidoPais.get(fila.fecha) || 0;
      for (const i of cuales) resto[i] += Math.max(0, pais - identificado);
    }
    for (const fila of d.mensual ?? []) {
      const cuales = porMes.get(fila.fecha);
      if (!cuales) continue;
      for (const [p, t] of Object.entries(fila)) if (p !== 'fecha' && t && base.grupos.has(p)) for (const i of cuales) base.sumar(p, i, { bio: t });
    }
    for (const r of d.cumplimiento ?? []) {
      const cuales = porMes.get(r.fecha);
      if (cuales && r.cupo > 0 && base.grupos.has(r.petrolera)) for (const i of cuales) base.sumar(r.petrolera, i, { cupo: r.cupo });
    }

    const acc = new Acumulador(tramos.length, ['a', 'b', 'n']);
    const grupo = (p) => (q.agrupar === 'vendedora' ? p : null);
    const deVolumen = q.metrica === 'gasoil_petrolera' || q.metrica === 'biodiesel_petrolera';
    for (const [p, comps] of base.grupos) {
      comps.forEach((c, i) => {
        if (q.metrica === 'gasoil_petrolera') {
          if (c.go) acc.sumar(grupo(p), i, { a: c.go, n: 1 });
        } else if (q.metrica === 'biodiesel_petrolera') {
          if (c.bio) acc.sumar(grupo(p), i, { a: c.bio, n: 1 });
        } else if (c.cupo > 0 && c.go > 0) {
          // el corte se le mide solo a la que tiene cupo: las revendedoras compran el gas oil ya cortado
          if (q.metrica === 'corte_petrolera') acc.sumar(grupo(p), i, { a: c.bio / densidad, b: c.go, n: 1 });
          else if (q.metrica === 'cumplimiento_petrolera') acc.sumar(grupo(p), i, { a: c.bio / densidad, b: c.req, n: 1 });
          else acc.sumar(grupo(p), i, { a: Math.max(0, (c.req - c.bio / densidad) * densidad), n: 1 });
        }
      });
    }
    const notas = ['Son las petroleras que el sitio identifica en las ventas de gas oil, como en el tablero Cumplimiento Corte. El gas oil es grado 2 y grado 3, sin bunker ni usinas.'];
    if (q.metrica === 'gasoil_petrolera' && !elegidas.length) {
      resto.forEach((v, i) => {
        if (v > 0.5) acc.sumar(grupo(OTRAS_EMPRESAS), i, { a: v, n: 1 });
      });
      notas.push('«Otras empresas» junta lo que vendieron las que el sitio no identifica por nombre.');
    }
    if (deVolumen || q.metrica === 'faltante_petrolera') {
      if (q.metrica === 'faltante_petrolera') notas.push('Lo que faltó = el biodiésel que le exigía el corte obligatorio de cada mes por sus ventas de gas oil, menos el que compró en el período. Si compró de más, es cero.');
      if (!deVolumen) notas.push(NOTA_CON_CUPO);
      return { acc, valor: (c) => (c.n > 0 ? c.a : null), notas };
    }
    notas.push(
      q.metrica === 'corte_petrolera'
        ? `Corte real de la petrolera = el biodiésel que compró (pasado a metros cúbicos con la densidad ${String(densidad).replace('.', ',')}) sobre el gas oil que vendió.`
        : `Cumplimiento = el biodiésel que compró (pasado a metros cúbicos con la densidad ${String(densidad).replace('.', ',')}) sobre el que le exigía el corte obligatorio de cada mes por sus ventas de gas oil.`
    );
    notas.push(NOTA_CON_CUPO);
    return { acc, valor: (c) => (c.b > 0 ? (c.a / c.b) * 100 : null), notas };
  },

  // El precio del gas oil según a quién se le vende y por qué canal (relevamiento Res. 1104/2004, gasoil_precios.json).
  canales(q, ctx, tramos) {
    const rel = ctx.fuentesPrecio?.gasoilPrecios;
    if (!rel?.canales?.length) return { error: 'El sitio no tiene cargado el relevamiento de precios por canal.' };
    const col = COLUMNAS_DE_CANAL[q.metrica];
    const deCanal = q.filtros?.canal ?? [];
    const deDistribucion = q.filtros?.distribucion ?? [];
    const porMes = tramosPorMes(tramos);
    const anomalos = new Set(MESES_SIN_PRECIO_DE_GASOIL);
    // el precio de cada mes, ponderado por volumen: de cada grupo y de todo lo que pasa los filtros
    const delMes = new Map(); // mes -> Map(grupo o null -> { num, den })
    for (const fila of rel.canales) {
      const mes = rel.meses[fila[0]];
      if (!porMes.has(mes) || anomalos.has(mes) || !fila[col.vol] || !fila[col.precio]) continue;
      const distribucion = rel.canales_distribucion[fila[1]];
      const canal = rel.canales_comercializacion[fila[2]];
      if ((deDistribucion.length && !deDistribucion.includes(distribucion)) || (deCanal.length && !deCanal.includes(canal))) continue;
      if (!delMes.has(mes)) delMes.set(mes, new Map());
      const grupo = q.agrupar === 'canal' ? canal : q.agrupar === 'distribucion' ? distribucion : undefined;
      for (const k of grupo === undefined ? [null] : [null, grupo]) {
        const a = delMes.get(mes).get(k) ?? { num: 0, den: 0 };
        a.num += fila[col.vol] * fila[col.precio];
        a.den += fila[col.vol];
        delMes.get(mes).set(k, a);
      }
    }
    // en un tramo de varios meses, el promedio simple de los precios de cada mes (como los demás precios)
    const acc = new Acumulador(tramos.length, ['suma', 'n']);
    for (const [mes, grupos] of delMes) {
      for (const [k, a] of grupos) {
        const destino = k === null ? acc.total : acc.grupos.get(k) ?? acc.grupos.set(k, acc.vacio()).get(k);
        for (const i of porMes.get(mes)) {
          destino[i].suma += a.num / a.den;
          destino[i].n += 1;
        }
      }
    }
    const promedio = (c) => (c.n > 0 ? c.suma / c.n : null);
    const notas = ['Precio del relevamiento de la Secretaría de Energía (Res. 1104/2004), ponderado por el volumen que declaró cada boca. Canal de venta es a quién se le vende (al público, agro, transporte, reventa) y canal de distribución, si es mayorista o minorista.'];
    if (tramos.some((t) => t.desde !== t.hasta)) notas.push('En un tramo de varios meses es el promedio simple de los precios de cada mes, en pesos corrientes.');
    const sinPrecio = MESES_SIN_PRECIO_DE_GASOIL.filter((m) => porMes.has(m));
    if (sinPrecio.length) notas.push(`Sin los precios de gas oil de ${sinPrecio.join(', ')}: en esos meses el relevamiento trae valores anómalos y el sitio no los usa.`);
    const valores = [...acc.total, ...[...acc.grupos.values()].flat()].map(promedio).filter((v) => v);
    const minimo = valores.length ? Math.min(...valores) : 1000;
    return { acc, valor: promedio, notas, m: { decimales: minimo >= 1000 ? 0 : minimo >= 100 ? 1 : 2 } };
  },

  precios(q, ctx, tramos) {
    if (!ctx.precios) return { error: 'El sitio no tiene cargados los precios.' };
    const acc = new Acumulador(tramos.length, ['suma', 'n']);
    const promedio = (c) => (c.n > 0 ? c.suma / c.n : null);
    const variosMeses = tramos.some((t) => t.desde !== t.hasta);

    // el tipo de cambio y las retenciones: una serie por mes, sin producto
    if (q.metrica !== 'precio' && q.metrica !== 'brecha_precio') {
      const serie = serieAuxiliar(q.metrica, ctx);
      tramos.forEach((t, i) => {
        for (const mes of mesesEntre(t.desde, t.hasta)) if (serie.has(mes)) acc.sumar(null, i, { suma: serie.get(mes), n: 1 });
      });
      const notas = [NOTAS_DE_SERIE[q.metrica] ?? NOTAS_DE_SERIE.retencion];
      if (q.metrica.startsWith('crack_')) notas.push('La glicerina es la cruda FOB Rosario; cuando no cotiza, la de Estados Unidos y, si tampoco, el precio de venta de Explora.');
      if (variosMeses) notas.push('En un tramo de varios meses es el promedio simple de los valores de cada mes.');
      return { acc, valor: promedio, notas };
    }

    const a = PRODUCTOS[q.producto];
    const notas = [a.nota];
    const sinPrecio = (productos) => notaDeMesesSinPrecio(productos, tramos[0].desde, tramos[tramos.length - 1].hasta);

    if (q.metrica === 'precio') {
      const unidad = UNIDADES[q.unidad] ? q.unidad : 'pesos_litro';
      const sinConversion = motivoSinConversion(q.producto, unidad, ctx);
      if (sinConversion) return { error: sinConversion };
      tramos.forEach((t, i) => {
        for (const mes of mesesConPrecio([q.producto], ctx, t.desde, t.hasta)) {
          const v = precioDe(q.producto, mes, unidad, ctx);
          if (v !== null) acc.sumar(null, i, { suma: v, n: 1 });
        }
      });
      notas.push(...notasDeConversion([q.producto], unidad, ctx));
      if (variosMeses) notas.push(`En un tramo de varios meses es el promedio simple de los precios de cada mes, en ${UNIDADES[unidad].moneda === 'ars' ? 'pesos' : 'dólares'} corrientes.`);
      if (sinPrecio([q.producto])) notas.push(sinPrecio([q.producto]));
      if (notaDelDato(q.producto, ctx)) notas.push(notaDelDato(q.producto, ctx));
      // los decimales, según el tamaño de los valores: un precio de 3 pesos por litro (2010) no se redondea a entero
      const valores = acc.total.map(promedio).filter((v) => v !== null && v !== 0).map(Math.abs);
      const minimo = valores.length ? Math.min(...valores) : 1000;
      const decimales = minimo >= 1000 ? 0 : minimo >= 100 ? 1 : minimo >= 1 ? 2 : 3;
      return { acc, valor: promedio, notas, m: { unidad: UNIDADES[unidad].simbolo, decimales, fuente: tableroDe(q.producto) } };
    }

    const b = PRODUCTOS[q.productoBase];
    notas.push(b.nota);
    let factor = 1;
    if (q.equivalencia === 'por_energia') {
      const ea = ctx.energia?.get(a.energia);
      const eb = ctx.energia?.get(b.energia);
      if (!ea || !eb) return { error: 'El sitio no tiene el contenido energético de esos productos.' };
      factor = eb.mj / ea.mj;
      if (factor !== 1) notas.push(`A igual energía: un litro de ${ea.nombre.toLowerCase()} tiene ${ea.mj} MJ y uno de ${eb.nombre.toLowerCase()}, ${eb.mj} MJ (Directiva (UE) 2018/2001).`);
    }
    const par = [q.producto, q.productoBase];
    // litro contra litro o tonelada contra tonelada: los que vienen en la otra medida se pasan con la densidad
    const aPasar = par.filter((k) => vienePorVolumen(k) === (q.equivalencia === 'por_tonelada'));
    notas.push(...notasDeDensidad(aPasar, ctx));
    if (Boolean(a.conImpuestos) !== Boolean(b.conImpuestos)) notas.push('Uno de los dos precios incluye impuestos y el otro no: la diferencia mezcla precio e impuestos.');
    tramos.forEach((t, i) => {
      for (const mes of mesesConPrecio(par, ctx, t.desde, t.hasta)) {
        const v = brechaDe(q.producto, q.productoBase, mes, q.equivalencia, ctx, factor);
        if (v !== null) acc.sumar(null, i, { suma: v, n: 1 });
      }
    });
    if (variosMeses) notas.push('En un tramo de varios meses es el promedio de las diferencias de cada mes.');
    if (sinPrecio(par)) notas.push(sinPrecio(par));
    for (const k of par) if (notaDelDato(k, ctx) && !notas.includes(notaDelDato(k, ctx))) notas.push(notaDelDato(k, ctx));
    return { acc, valor: promedio, notas, m: { fuente: tableroDe(q.producto) } };
  },

  aceite(q, ctx, tramos) {
    const d = ctx.aceite;
    if (!d?.meses?.length) return { error: 'El sitio no tiene cargada la relación del precio del aceite.' };
    const acc = new Acumulador(tramos.length, ['suma', 'n']);
    const porMes = tramosPorMes(tramos);
    const zonas = d.resumen.map((z) => z.zona);
    for (const fila of d.meses) {
      const cuales = porMes.get(fila.fecha);
      if (!cuales) continue;
      for (const z of zonas) if (typeof fila[z] === 'number') for (const i of cuales) acc.sumar(z, i, { suma: fila[z], n: 1 });
    }
    const notas = [
      `Índice del precio de compra del aceite que informan las elaboradoras, con Rosario = 100. Menos de 100 quiere decir que esa zona compró el aceite más barato que el precio de Rosario. Hay datos de ${mesTxt(d.meses[0].fecha)} a ${mesTxt(d.meses[d.meses.length - 1].fecha)}.`,
      'Los valores se leyeron del gráfico de la nota de la Secretaría de Energía, con una precisión de más o menos 0,1.',
    ];
    return { acc, valor: (c) => (c.n > 0 ? c.suma / c.n : null), notas, sinTotal: true };
  },
};

// ---------------------------------------------------------------- presentar

const femenino = (s) => /^(nafta|glicerina)/.test(s);
const articulo = (s) => (femenino(s) ? 'la' : 'el');
/** "litro", "tonelada", "metro cúbico" o "barril": por qué cantidad va el precio del pedido. */
const porQue = (q) => (UNIDADES[q?.unidad] ?? UNIDADES.pesos_litro).porTxt;
const COMO = { por_energia: ', a igual energía', por_tonelada: ', tonelada contra tonelada' };
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** "a", "a y b", "a, b y c" (con "e" delante de una palabra que empieza con i). */
export function enumerar(xs) {
  if (xs.length <= 1) return xs.join('');
  const ultimo = String(xs[xs.length - 1]);
  return `${xs.slice(0, -1).join(', ')} ${/^h?i(?!e)/i.test(ultimo) ? 'e' : 'y'} ${ultimo}`;
}
const varios = (xs) => (xs.length > 4 ? `${xs.slice(0, 3).join(', ')} y ${xs.length - 3} más` : enumerar(xs));

export function nombreDeLaMedida(q) {
  const m = METRICAS[q.metrica];
  if (q.metrica === 'precio') {
    const p = PRODUCTOS[q.producto];
    return p.soloNivel ? `${p.nombreSolo} por ${porQue(q)} de gas oil` : `Precio por ${porQue(q)} de ${p.etiqueta}`;
  }
  if (q.metrica === 'brecha_precio') {
    const a = PRODUCTOS[q.producto].etiqueta;
    const b = PRODUCTOS[q.productoBase].etiqueta;
    return `Cuánto más ${femenino(a) ? 'cara' : 'caro'} es ${articulo(a)} ${a} que ${articulo(b)} ${b}${COMO[q.equivalencia] ?? ''}`;
  }
  return m.nombre;
}

/**
 * Las medidas del pedido, de a una: cada medida tildada y, en los precios, cada
 * producto (o cada par de productos, en la diferencia de precio).
 */
export function seriesDe(q) {
  const series = [];
  for (const metrica of q?.metricas ?? []) {
    if (metrica === 'precio') {
      for (const producto of q.productos) series.push({ metrica, producto, productoBase: null, equivalencia: null, unidad: q.unidad ?? null });
    } else if (metrica === 'brecha_precio') {
      for (const producto of q.productos) {
        if (PRODUCTOS[producto].soloNivel) continue;
        for (const productoBase of q.productosBase) {
          if (productoBase === producto) continue;
          for (const equivalencia of q.equivalencias) series.push({ metrica, producto, productoBase, equivalencia });
        }
      }
    } else {
      series.push({ metrica, producto: null, productoBase: null, equivalencia: null });
    }
  }
  return series;
}

/** El nombre de una medida en la columna y en la leyenda, cuando van varias juntas. */
function nombreCorto(s) {
  if (s.metrica === 'precio') return mayuscula(PRODUCTOS[s.producto].etiqueta);
  if (METRICAS[s.metrica].corto) return METRICAS[s.metrica].corto;
  if (s.metrica === 'brecha_precio') return `${mayuscula(PRODUCTOS[s.producto].etiqueta)} contra ${PRODUCTOS[s.productoBase].etiqueta}${COMO[s.equivalencia] ?? ''}`;
  return nombreDeLaMedida(s);
}

/** Todas las medidas del pedido en una frase, para el título. */
function nombresJuntos(series) {
  if (series.length === 1) return nombreDeLaMedida(series[0]);
  // varias medidas de un mismo grupo que se nombran igual (las de las petroleras, las del precio por canal):
  // los nombres cortos y, una sola vez, de qué son
  const [antes, despues] = METRICAS[series[0].metrica].juntas ?? [];
  if (antes !== undefined && series.every((s) => METRICAS[s.metrica].juntas?.[0] === antes && METRICAS[s.metrica].juntas?.[1] === despues)) {
    const cortos = enumerar(series.map((s) => minuscula(METRICAS[s.metrica].corto)));
    return `${antes}${antes ? cortos : mayuscula(cortos)}${despues}`;
  }
  const precios = series.filter((s) => s.metrica === 'precio');
  const brechas = series.filter((s) => s.metrica === 'brecha_precio');
  if (!precios.length && !brechas.length) return enumerar(series.map((s, i) => (i ? minuscula(nombreDeLaMedida(s)) : nombreDeLaMedida(s))));
  // los precios se dicen juntos ("precio por litro de biodiésel y gas oil"), y las diferencias también
  const partes = [];
  const deProducto = precios.filter((s) => !PRODUCTOS[s.producto].soloNivel);
  if (deProducto.length) partes.push(`precio por ${porQue(deProducto[0])} de ${enumerar(deProducto.map((s) => PRODUCTOS[s.producto].etiqueta))}`);
  for (const s of precios) if (PRODUCTOS[s.producto].soloNivel) partes.push(minuscula(nombreDeLaMedida(s)));
  if (brechas.length === 1) partes.push(minuscula(nombreDeLaMedida(brechas[0])));
  else if (brechas.length) partes.push(`diferencia de precio: ${enumerar(brechas.map((s) => minuscula(nombreCorto(s))))}`);
  // el tipo de cambio y las retenciones, que se pueden pedir junto con los precios
  for (const s of series) if (s.metrica !== 'precio' && s.metrica !== 'brecha_precio') partes.push(minuscula(nombreDeLaMedida(s)));
  return mayuscula(partes.join('; '));
}

/** De quiénes habla la consulta, en palabras ("no integradas de Santa Fe"). */
export function filtrosTxt(q, ctx) {
  const de = (f) => q.filtros?.[f] ?? [];
  const partes = [];
  if (de('empresa').length) partes.push(varios(de('empresa')));
  if (de('categoria').length) partes.push(varios(de('categoria').map((c) => (CATEGORIA_TXT[c] ?? c).toLowerCase())));
  if (de('grupo').length) partes.push(varios(de('grupo').map((g) => grupoPublico(g))));
  if (de('provincia').length) partes.push(varios(de('provincia').map((p) => lindo(p))));
  if (de('localidad').length) partes.push(varios(de('localidad').map((l) => lindo(l))));
  if (de('camara').length) partes.push(`${de('camara').length > 1 ? 'cámaras' : 'cámara'} ${varios(de('camara'))}`);
  if (de('petrolera').length) partes.push(`compradas por ${varios(de('petrolera'))}`);
  if (de('vendedora').length) partes.push(varios(de('vendedora')));
  if (de('distribucion').length) partes.push(`canal ${varios(de('distribucion').map((x) => x.toLowerCase()))}`);
  if (de('canal').length) partes.push(`venta a: ${varios(de('canal').map((x) => etiquetaGrupo('canal', x, ctx).toLowerCase()))}`);
  if (de('sector').length) partes.push(`${de('sector').length > 1 ? 'sectores' : 'sector'} ${varios(de('sector').map((x) => etiquetaGrupo('sector', x, ctx).toLowerCase()))}`);
  return partes.join(' · ');
}

function ordenar(filas, clave, orden) {
  const s = orden === 'menor' ? 1 : -1;
  return [...filas].sort((x, y) => s * (x[clave] - y[clave]) || x.etiqueta.localeCompare(y.etiqueta, 'es'));
}

const col = (nombre, extra = {}) => ({ nombre, tipo: 'numero', ...extra });

/** Las barras de un índice se dibujan como distancia a su base (100): si no, todas se ven iguales. */
function conBase(grafico, m) {
  if (!m.base || grafico.tipo !== 'barrasH') return grafico;
  const resta = (v) => (v === null || v === undefined ? null : v - m.base.valor);
  return { ...grafico, series: grafico.series.map((s) => ({ ...s, valores: s.valores.map(resta) })), unidad: 'puntos', decimales: 1, leyenda: m.base.leyenda };
}

const NOTA_GRUPOS = 'Los grupos económicos se arman con las empresas que los integran hoy: el sitio no registra desde cuándo pertenece cada una, así que hacia atrás la cifra de un grupo puede incluir empresas que entonces no eran suyas.';

/** La nota de los grupos económicos vale cuando el pedido los usa y mira más de un año atrás. */
function notaDeGrupos(q, m, ctx) {
  const usaGrupos = q.agrupar === 'grupo' || q.filtros?.grupo?.length;
  const primerMes = q.tipo === 'comparacion' ? q.desde0 : q.desde;
  return usaGrupos && m.familia !== 'aceite' && primerMes < `${Number(ctx.ultimo.slice(0, 4)) - 1}-01` ? NOTA_GRUPOS : null;
}

/** El período del pedido y de quiénes habla, para debajo del título. */
function bajadaDe(q, tramos, sinTiempo, ctx) {
  const cuando = q.tipo === 'comparacion' ? `${tramos[0].etiqueta} contra ${tramos[1].etiqueta}` : sinTiempo ? '' : periodoTxt(q.desde, q.hasta);
  return [cuando, filtrosTxt(q, ctx)].filter(Boolean).join(' · ');
}

/**
 * Mide una sola medida: el valor de cada grupo y del total en cada tramo de tiempo.
 * Devuelve { m, tramos, dim, grupos, total, notas } o { error }.
 */
function medir(q, ctx) {
  const deCatalogo = METRICAS[q?.metrica];
  if (!deCatalogo) return { error: 'No quedó claro qué medida se pide.' };
  const tramos = armarTramos(q);
  if (!tramos.length) return { error: 'El período no tiene ningún mes.' };
  const r = FAMILIAS[deCatalogo.familia](q, ctx, tramos);
  if (r.error) return { error: r.error };
  // un precio se muestra en la unidad del pedido: la unidad, los decimales y el tablero salen de la cuenta
  const m = r.m ? { ...deCatalogo, ...r.m } : deCatalogo;

  const dim = q.agrupar !== 'ninguno' ? q.agrupar : null;
  const valores = (comps) => comps.map((c) => r.valor(c));
  const grupos = [...r.acc.grupos.entries()].map(([clave, comps]) => ({ clave, etiqueta: etiquetaGrupo(dim, clave, ctx), v: valores(comps) }));
  const total = r.sinTotal ? null : valores(r.acc.total);
  const hayDato = dim ? grupos.some((g) => g.v.some((x) => x !== null && x !== 0)) : total?.some((x) => x !== null);
  if (!hayDato) return { error: `El sitio no tiene datos de ${minuscula(m.nombre)} para ese pedido en ${periodoTxt(q.desde, q.hasta)}.` };
  return { m, tramos, dim, grupos, total, notas: [...r.notas] };
}

/**
 * Resuelve una consulta de un solo tipo y una sola medida. Devuelve { ok: true, titulo,
 * bajada, cifra, columnas, filas, grafico, notas, fuente } o { ok: false, motivo }.
 * Las celdas llevan el valor crudo; el formato lo da la página con `columnas`.
 */
function ejecutarSimple(q, ctx) {
  const r = medir(q, ctx);
  if (r.error) return { ok: false, motivo: r.error };
  const { m, tramos, dim, total, notas } = r;
  let { grupos } = r;
  const u = { unidad: m.unidad, decimales: m.decimales };

  const notaGrupos = notaDeGrupos(q, m, ctx);
  if (notaGrupos) notas.push(notaGrupos);
  const tope = Math.min(Math.max(1, q.tope || 20), TOPE_MAXIMO);
  const base = {
    ok: true,
    titulo: `${nombreDeLaMedida(q)}${dim && !m.agruparSiempre && !m.nombraGrupo ? ` ${DIMENSIONES[dim].por.split(' (')[0]}` : ''}`,
    bajada: bajadaDe(q, tramos, m.sinTiempo, ctx),
    cifra: null,
    grafico: null,
    notas,
    fuente: m.fuente,
  };

  // ---- un total
  if (q.tipo === 'total' || (!dim && q.tipo === 'ranking')) {
    const v = total?.[0];
    if (v === null || v === undefined) return { ok: false, motivo: `No hay datos para calcular ${minuscula(m.nombre)} en ${periodoTxt(q.desde, q.hasta)}.` };
    return { ...base, titulo: nombreDeLaMedida(q), cifra: { valor: v, ...u }, columnas: [{ nombre: 'Medida', tipo: 'texto' }, col(m.unidad === '%' ? 'Valor' : `Valor (${m.unidad})`, u)], filas: [{ celdas: [nombreDeLaMedida(q), v] }] };
  }

  // ---- ranking
  if (q.tipo === 'ranking') {
    grupos = ordenar(grupos.map((g) => ({ ...g, x: g.v[0] })).filter((g) => g.x !== null && g.x !== 0), 'x', q.orden);
    const tot = m.aditiva ? grupos.reduce((s, g) => s + g.x, 0) : null;
    const vistos = grupos.slice(0, tope);
    const resto = grupos.slice(tope);
    let acum = 0;
    const filas = vistos.map((g, i) => {
      acum += g.x;
      return { celdas: [i + 1, g.etiqueta, g.x, ...(m.aditiva ? [(g.x / tot) * 100, (acum / tot) * 100] : [])] };
    });
    if (resto.length && m.aditiva) {
      const s = resto.reduce((x, g) => x + g.x, 0);
      filas.push({ celdas: ['', `Otras ${resto.length}`, s, (s / tot) * 100, 100], clase: 'resto' });
    } else if (resto.length) {
      notas.push(`Se muestran ${vistos.length} de ${grupos.length}.`);
    }
    if (m.aditiva) filas.push({ celdas: ['', 'Total', tot, 100, null], clase: 'total' });
    else if (total?.[0] !== null && total?.[0] !== undefined) filas.push({ celdas: ['', 'Todas juntas', total[0]], clase: 'total' });
    const enGrafico = vistos.slice(0, 15);
    return {
      ...base,
      columnas: [
        { nombre: '#', tipo: 'puesto' },
        { nombre: DIMENSIONES[dim].titulo, tipo: 'texto' },
        col(m.unidad === '%' || m.unidad === 'índice' ? m.nombre : `${m.nombre} (${m.unidad})`, u),
        ...(m.aditiva ? [col('% del total', { unidad: '%', decimales: 1 }), col('% acumulado', { unidad: '%', decimales: 1 })] : []),
      ],
      filas,
      grafico: conBase({ tipo: 'barrasH', categorias: enGrafico.map((g) => g.etiqueta), series: [{ nombre: m.nombre, valores: enGrafico.map((g) => g.x) }], ...u }, m),
    };
  }

  // ---- comparación entre dos períodos
  if (q.tipo === 'comparacion') {
    const fila = (etiqueta, v0, v1) => {
      const dif = v0 !== null && v1 !== null ? v1 - v0 : null;
      const variacion = m.unidad === '%' || !v0 || dif === null ? null : (dif / v0) * 100;
      return { etiqueta, v0, v1, dif, variacion };
    };
    const esPct = m.unidad === '%';
    const columnas = [
      { nombre: dim ? DIMENSIONES[dim].titulo : 'Medida', tipo: 'texto' },
      col(tramos[0].etiqueta, u),
      col(tramos[1].etiqueta, u),
      col(esPct ? 'Diferencia (puntos)' : 'Diferencia', { ...u, signo: true }),
      ...(esPct ? [] : [col('Variación', { unidad: '%', decimales: 1, signo: true })]),
    ];
    const celdas = (f) => [f.etiqueta, f.v0, f.v1, f.dif, ...(esPct ? [] : [f.variacion])];
    if (!dim) {
      const f = fila(nombreDeLaMedida(q), total?.[0] ?? null, total?.[1] ?? null);
      return { ...base, columnas, filas: [{ celdas: celdas(f) }], grafico: { tipo: 'barras', categorias: tramos.map((t) => t.etiqueta), series: [{ nombre: m.nombre, valores: [f.v0, f.v1] }], ...u } };
    }
    const clave = q.ordenarPor === 'valor' ? 'v1' : q.ordenarPor === 'variacion' && !esPct ? 'variacion' : 'dif';
    const todas = grupos.map((g) => fila(g.etiqueta, g.v[0] ?? null, g.v[1] ?? null)).filter((f) => (f.v0 || 0) !== 0 || (f.v1 || 0) !== 0);
    const conDato = ordenar(todas.filter((f) => f[clave] !== null).map((f) => ({ ...f, x: f[clave] })), 'x', q.orden);
    const sinDato = todas.filter((f) => f[clave] === null);
    const vistos = [...conDato, ...sinDato].slice(0, tope);
    const filas = vistos.map((f) => ({ celdas: celdas(f) }));
    if (todas.length > vistos.length) notas.push(`Se muestran ${vistos.length} de ${todas.length}.`);
    if (total) filas.push({ celdas: celdas(fila(m.aditiva ? 'Total' : 'Todas juntas', total[0], total[1])), clase: 'total' });
    const enGrafico = vistos.slice(0, 12);
    return {
      ...base,
      columnas,
      filas,
      grafico: conBase(
        {
          tipo: 'barrasH',
          categorias: enGrafico.map((f) => f.etiqueta),
          series: [
            { nombre: tramos[0].etiqueta, valores: enGrafico.map((f) => f.v0) },
            { nombre: tramos[1].etiqueta, valores: enGrafico.map((f) => f.v1) },
          ],
          par: true,
          ...u,
        },
        m
      ),
    };
  }

  // ---- evolución en el tiempo
  const primeraCol = { nombre: q.tiempo === 'anio' ? 'Año' : 'Mes', tipo: 'texto' };
  if (!dim) {
    const serie = total ?? [];
    return {
      ...base,
      columnas: [primeraCol, col(m.unidad === '%' ? nombreDeLaMedida(q) : `${nombreDeLaMedida(q)} (${m.unidad})`, u)],
      filas: [
        ...tramos.map((t, i) => ({ celdas: [t.etiqueta, serie[i] ?? null] })),
        ...(m.aditiva && tramos.length > 1 ? [{ celdas: ['Total', serie.reduce((s, x) => s + (x || 0), 0)], clase: 'total' }] : []),
      ],
      grafico: { tipo: m.aditiva ? 'barras' : 'lineas', categorias: tramos.map((t) => t.etiqueta), series: [{ nombre: nombreDeLaMedida(q), valores: serie }], ...u },
    };
  }
  // con grupos: los primeros N por el total del período (o por el último valor, si no se suma) y el resto junto
  const peso = (g) => (m.aditiva ? g.v.reduce((s, x) => s + (x || 0), 0) : [...g.v].reverse().find((x) => x !== null) ?? -Infinity);
  const maxSeries = Math.min(tope, m.familia === 'aceite' ? 8 : 8);
  // las zonas de distancia van en su orden (de cerca a lejos), no por valor
  const ordenZonas = dim === 'zona' ? (ctx.aceite?.resumen ?? []).map((z) => z.zona) : null;
  const ordenados = [...grupos]
    .map((g) => ({ ...g, x: peso(g) }))
    .filter((g) => g.v.some((x) => x))
    .sort((a, b) => (ordenZonas ? ordenZonas.indexOf(a.clave) - ordenZonas.indexOf(b.clave) : b.x - a.x));
  const series = ordenados.slice(0, maxSeries);
  const resto = ordenados.slice(maxSeries);
  if (resto.length && m.aditiva) series.push({ etiqueta: `Otras ${resto.length}`, v: tramos.map((_, i) => resto.reduce((s, g) => s + (g.v[i] || 0), 0)) });
  else if (resto.length) notas.push(`Se muestran ${series.length} de ${ordenados.length} (las de mayor valor al final del período).`);
  const conTotal = Boolean(total) && series.length > 1;
  return {
    ...base,
    columnas: [primeraCol, ...series.map((s) => col(s.etiqueta, u)), ...(conTotal ? [col(m.aditiva ? 'Total' : 'Todas juntas', u)] : [])],
    filas: tramos.map((t, i) => ({ celdas: [t.etiqueta, ...series.map((s) => s.v[i] ?? null), ...(conTotal ? [total[i]] : [])] })),
    grafico: { tipo: 'lineas', categorias: tramos.map((t) => t.etiqueta), series: series.map((s) => ({ nombre: s.etiqueta, valores: s.v })), ...u },
  };
}

// ---------------------------------------------------------------- varias medidas juntas

export const MAX_MEDIDAS = 8;
const UNIDAD_TXT = {
  t: 'toneladas', '%': 'porcentaje', '$/l': 'pesos por litro', 'm³': 'metros cúbicos', 't/año': 'toneladas por año', '$/US$': 'pesos por dólar',
  ...Object.fromEntries(Object.values(UNIDADES).map((u) => [u.simbolo, minuscula(u.etiqueta)])),
};
const conUnidad = (nombre, m) => (m.unidad === '%' || m.unidad === 'índice' ? nombre : `${nombre} (${m.unidad})`);

/**
 * Un gráfico por unidad: las medidas que comparten unidad van en el mismo gráfico y
 * las demás, en otro (toneladas y porcentajes no entran en un mismo eje).
 * `armar(grupo)` devuelve { tipo, categorias, series } para las medidas de una unidad.
 */
function graficosPorUnidad(medidas, armar, { minimo = 1, nombrar = false } = {}) {
  const porUnidad = new Map();
  for (const x of medidas) porUnidad.set(x.m.unidad, [...(porUnidad.get(x.m.unidad) ?? []), x]);
  return [...porUnidad.values()]
    .filter((grupo) => grupo.length >= minimo)
    .map((grupo) => {
      const unidad = grupo[0].m.unidad;
      const enUnidad = `en ${UNIDAD_TXT[unidad] ?? unidad}`;
      // con una sola unidad el título ya lo dice todo; con varias, cada gráfico avisa cuál es la suya
      const leyenda = porUnidad.size === 1 ? undefined : nombrar && grupo.length === 1 ? `${grupo[0].corto}, ${enUnidad}` : mayuscula(enUnidad);
      return { ...armar(grupo), unidad, decimales: Math.max(...grupo.map((x) => x.m.decimales)), ...(leyenda ? { leyenda } : {}) };
    });
}

/**
 * Varias medidas del mismo pedido en una sola tabla: una columna por medida (ranking y
 * evolución) o una fila por medida (total y comparación). Todas comparten tipo, período,
 * filtros y agrupación. Devuelve lo mismo que ejecutarSimple, con `graficos` (uno por
 * unidad), `cifras` y `fuentes` en plural; una fila puede traer `formatos` cuando sus
 * celdas no llevan la unidad de la columna.
 */
function presentarVarias(simples, ctx, notasPrevias = []) {
  const q = simples[0]; // lo común a todas: tipo, período, filtros, agrupación, orden
  const notas = [...notasPrevias];
  const medidas = [];
  for (const s of simples) {
    const r = medir(s, ctx);
    if (r.error) notas.push(`${nombreDeLaMedida(s)} no se muestra. ${r.error}`);
    else medidas.push({ ...r, s, corto: nombreCorto(s), u: { unidad: r.m.unidad, decimales: r.m.decimales } });
  }
  if (!medidas.length) return { ok: false, motivo: `El sitio no tiene datos de esas medidas para ese pedido en ${periodoTxt(q.desde, q.hasta)}.` };
  if (medidas.length === 1) {
    const unica = ejecutarSimple(medidas[0].s, ctx);
    return unica.ok ? { ...unica, notas: [...notas, ...unica.notas] } : unica;
  }

  const { tramos, dim } = medidas[0];
  for (const x of medidas) for (const n of x.notas) if (!notas.includes(n)) notas.push(n);
  if (medidas.some((x) => x.s.metrica === 'brecha_precio')) notas.push('La diferencia de precio dice cuánto más caro es el primer producto que el segundo, en porcentaje.');
  const notaGrupos = notaDeGrupos(q, medidas[0].m, ctx);
  if (notaGrupos) notas.push(notaGrupos);
  const hayAditiva = medidas.some((x) => x.m.aditiva);
  const fuentes = medidas.map((x) => x.m.fuente).filter((f, i, todas) => todas.findIndex((g) => g.ruta === f.ruta) === i);
  const base = {
    ok: true,
    titulo: `${nombresJuntos(medidas.map((x) => x.s))}${dim && !medidas.every((x) => x.m.nombraGrupo) ? ` ${DIMENSIONES[dim].por.split(' (')[0]}` : ''}`,
    bajada: bajadaDe(q, tramos, medidas.every((x) => x.m.sinTiempo), ctx),
    cifra: null,
    grafico: null,
    notas,
    fuente: fuentes[0],
    fuentes,
  };
  const columnasDeMedidas = medidas.map((x) => col(conUnidad(x.corto, x.m), x.u));

  // ---- un total: una fila por medida
  if (q.tipo === 'total' || (!dim && q.tipo === 'ranking')) {
    const valor = (x) => x.total?.[0] ?? null;
    return {
      ...base,
      titulo: nombresJuntos(medidas.map((x) => x.s)),
      cifras: medidas.filter((x) => valor(x) !== null).map((x) => ({ nombre: x.corto, valor: valor(x), ...x.u })),
      columnas: [{ nombre: 'Medida', tipo: 'texto' }, col('Valor')],
      filas: medidas.map((x) => ({ celdas: [conUnidad(x.corto, x.m), valor(x)], formatos: [null, x.u] })),
      graficos: graficosPorUnidad(
        medidas.filter((x) => valor(x) !== null),
        (grupo) => ({ tipo: 'barrasH', categorias: grupo.map((x) => x.corto), series: [{ nombre: periodoTxt(q.desde, q.hasta), valores: grupo.map(valor) }] }),
        { minimo: 2 }
      ),
    };
  }

  // ---- ranking: una columna por medida, ordenado por una de ellas
  if (q.tipo === 'ranking') {
    const manda = medidas.find((x) => x.s.metrica === q.ordenMedida) ?? medidas[0];
    const etiquetas = new Map();
    for (const x of medidas) {
      x.porClave = new Map(x.grupos.map((g) => [g.clave, g.v[0] ?? null]));
      for (const g of x.grupos) etiquetas.set(g.clave, g.etiqueta);
    }
    const de = (x, clave) => x.porClave.get(clave) ?? null;
    const todas = [...etiquetas]
      .map(([clave, etiqueta]) => ({ etiqueta, vs: medidas.map((x) => de(x, clave)), x: de(manda, clave) }))
      .filter((f) => f.vs.some((v) => v !== null && v !== 0));
    // las que no tienen dato en la medida que ordena van al final
    const enOrden = [...ordenar(todas.filter((f) => f.x !== null), 'x', q.orden), ...todas.filter((f) => f.x === null)];
    const tope = Math.min(Math.max(1, q.tope || 20), TOPE_MAXIMO);
    const vistos = enOrden.slice(0, tope);
    const resto = enOrden.slice(tope);
    const suma = (filas, k) => filas.reduce((t, f) => t + (f.vs[k] || 0), 0);
    const filas = vistos.map((f, i) => ({ celdas: [i + 1, f.etiqueta, ...f.vs] }));
    if (resto.length && hayAditiva) filas.push({ celdas: ['', `Otras ${resto.length}`, ...medidas.map((x, k) => (x.m.aditiva ? suma(resto, k) : ''))], clase: 'resto' });
    else if (resto.length) notas.push(`Se muestran ${vistos.length} de ${enOrden.length}.`);
    filas.push({ celdas: ['', hayAditiva ? 'Total' : 'Todas juntas', ...medidas.map((x, k) => (x.m.aditiva ? suma(enOrden, k) : x.total?.[0] ?? null))], clase: 'total' });
    notas.unshift(`La tabla está ordenada por ${minuscula(manda.corto)}.`);
    const enGrafico = vistos.slice(0, 12);
    return {
      ...base,
      columnas: [{ nombre: '#', tipo: 'puesto' }, { nombre: DIMENSIONES[dim].titulo, tipo: 'texto' }, ...columnasDeMedidas],
      filas,
      graficos: graficosPorUnidad(
        medidas,
        (grupo) => ({ tipo: 'barrasH', categorias: enGrafico.map((f) => f.etiqueta), series: grupo.map((x) => ({ nombre: x.corto, valores: enGrafico.map((f) => f.vs[medidas.indexOf(x)]) })) }),
        { nombrar: true }
      ),
    };
  }

  // ---- comparación entre dos períodos, sin agrupar: una fila por medida
  if (q.tipo === 'comparacion') {
    const todasPct = medidas.every((x) => x.m.unidad === '%');
    const fila = (x) => {
      const [v0, v1] = [x.total?.[0] ?? null, x.total?.[1] ?? null];
      const dif = v0 !== null && v1 !== null ? v1 - v0 : null;
      return { v0, v1, dif, variacion: x.m.unidad === '%' || !v0 || dif === null ? null : (dif / v0) * 100 };
    };
    if (!todasPct && medidas.some((x) => x.m.unidad === '%')) notas.push('En las medidas en porcentaje la diferencia va en puntos y no lleva variación.');
    return {
      ...base,
      columnas: [
        { nombre: 'Medida', tipo: 'texto' },
        col(tramos[0].etiqueta),
        col(tramos[1].etiqueta),
        col(todasPct ? 'Diferencia (puntos)' : 'Diferencia', { signo: true }),
        ...(todasPct ? [] : [col('Variación', { unidad: '%', decimales: 1, signo: true })]),
      ],
      filas: medidas.map((x) => {
        const f = fila(x);
        return {
          celdas: [conUnidad(x.corto, x.m), f.v0, f.v1, f.dif, ...(todasPct ? [] : [f.variacion])],
          formatos: [null, x.u, x.u, { ...x.u, signo: true }, ...(todasPct ? [] : [null])],
        };
      }),
      graficos: graficosPorUnidad(medidas, (grupo) => ({
        tipo: 'barrasH',
        categorias: grupo.map((x) => x.corto),
        series: [
          { nombre: tramos[0].etiqueta, valores: grupo.map((x) => fila(x).v0) },
          { nombre: tramos[1].etiqueta, valores: grupo.map((x) => fila(x).v1) },
        ],
        par: true,
      })),
    };
  }

  // ---- evolución en el tiempo, sin agrupar: una columna por medida
  const serie = (x) => tramos.map((_, i) => x.total?.[i] ?? null);
  return {
    ...base,
    columnas: [{ nombre: q.tiempo === 'anio' ? 'Año' : 'Mes', tipo: 'texto' }, ...columnasDeMedidas],
    filas: [
      ...tramos.map((t, i) => ({ celdas: [t.etiqueta, ...medidas.map((x) => x.total?.[i] ?? null)] })),
      ...(hayAditiva && tramos.length > 1 ? [{ celdas: ['Total', ...medidas.map((x) => (x.m.aditiva ? serie(x).reduce((t, v) => t + (v || 0), 0) : ''))], clase: 'total' }] : []),
    ],
    graficos: graficosPorUnidad(
      medidas,
      (grupo) => ({
        tipo: grupo.every((x) => x.m.aditiva) && tramos.length <= 24 ? 'barras' : 'lineas',
        categorias: tramos.map((t) => t.etiqueta),
        series: grupo.map((x) => ({ nombre: x.corto, valores: serie(x) })),
      }),
      { nombrar: true }
    ),
  };
}

// ---------------------------------------------------------------- el pedido entero

/**
 * Resuelve el pedido tal como sale de ajustarConsulta. Devuelve una lista de bloques,
 * cada uno { ok: true, tipo, titulo, bajada, columnas, filas, notas, fuente, ... } o
 * { ok: false, tipo, motivo }:
 *   - un bloque por cada tipo tildado en "Qué mostrar";
 *   - con varias medidas, van juntas en la tabla del bloque. La excepción es la evolución
 *     o la comparación agrupadas (por empresa, por provincia...): ahí cada medida ya trae
 *     una columna por grupo, así que va un bloque por medida.
 */
export function resolverConsulta(q, ctx) {
  const todas = seriesDe(q);
  if (!q?.tipos?.length || !todas.length) return [{ ok: false, motivo: 'No quedó claro qué medida se pide.' }];
  const comun = {
    agrupar: q.agrupar, tiempo: q.tiempo, filtros: q.filtros, desde: q.desde, hasta: q.hasta, desde0: q.desde0, hasta0: q.hasta0,
    orden: q.orden, ordenarPor: q.ordenarPor, ordenMedida: q.ordenMedida, tope: q.tope,
  };
  const agrupado = q.agrupar !== 'ninguno';
  const bloques = [];
  for (const tipo of q.tipos) {
    const enElTiempo = tipo === 'evolucion' || tipo === 'comparacion';
    const notas = [];
    // una medida que es una foto (la capacidad instalada) no entra en lo que se mira en el tiempo
    let series = enElTiempo ? todas.filter((s) => !METRICAS[s.metrica].sinTiempo) : todas;
    if (series.length < todas.length) {
      const fuera = todas.filter((s) => METRICAS[s.metrica].sinTiempo).map((s) => nombreDeLaMedida(s));
      notas.push(`${enumerar(fuera)} no entra acá: el sitio tiene solo la foto más reciente, así que no se puede ver en el tiempo.`);
    }
    if (series.length > MAX_MEDIDAS) {
      notas.push(`Se muestran las primeras ${MAX_MEDIDAS} de las ${series.length} medidas que salen de lo tildado.`);
      series = series.slice(0, MAX_MEDIDAS);
    }
    const simples = series.map((s) => ({ ...comun, ...s, tipo }));
    // cada bloque dice a qué tipo responde: con varios tipos tildados, la página lo rotula
    const conNotas = (b) => ({ ...b, tipo, ...(b.ok && notas.length ? { notas: [...notas, ...b.notas] } : {}) });
    if (simples.length === 1) bloques.push(conNotas(ejecutarSimple(simples[0], ctx)));
    else if (simples.length > 1 && agrupado && enElTiempo) simples.forEach((s, i) => bloques.push(i ? { ...ejecutarSimple(s, ctx), tipo } : conNotas(ejecutarSimple(s, ctx))));
    else if (simples.length > 1) bloques.push({ ...presentarVarias(simples, ctx, notas), tipo });
  }
  return bloques.length ? bloques : [{ ok: false, motivo: 'No quedó claro qué medida se pide.' }];
}

/** El primer bloque del pedido: con un solo tipo y una sola medida, es todo el resultado. */
export function ejecutarConsulta(q, ctx) {
  return resolverConsulta(q, ctx)[0];
}

/** El pedido tal como se va a calcular, en una frase (lo arma el programa, no la IA). */
export function describirConsulta(q, ctx) {
  const series = seriesDe(q);
  if (!q?.tipos?.length || !series.length) return '';
  const m = METRICAS[q.metricas[0]];
  const dim = q.agrupar !== 'ninguno' && !m.agruparSiempre && !q.metricas.every((k) => METRICAS[k].nombraGrupo) ? ` ${DIMENSIONES[q.agrupar].por.split(' (')[0]}` : '';
  const quien = filtrosTxt(q, ctx);
  const periodo = periodoTxt(q.desde, q.hasta);
  const soloComparacion = q.tipos.length === 1 && q.tipos[0] === 'comparacion';
  const cuando = soloComparacion ? `${periodoTxt(q.desde0, q.hasta0)} contra ${periodo}` : q.metricas.every((k) => METRICAS[k].sinTiempo) ? '' : periodo;
  const contra = q.tipos.includes('comparacion') && !soloComparacion ? `comparado con ${periodoTxt(q.desde0, q.hasta0)}` : '';
  const como = { ranking: 'ranking', evolucion: q.tiempo === 'anio' ? 'evolución año por año' : 'evolución mes por mes', total: 'total', comparacion: 'comparación' };
  return [`${mayuscula(enumerar(q.tipos.map((t) => como[t])))} de ${minuscula(nombresJuntos(series))}${dim}`, quien, cuando, contra].filter(Boolean).join(' · ');
}

export { EQUIVALENCIAS };
