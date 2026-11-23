// Polígrafo - la ficha de datos del sitio.
//
// Un puñado de datos ya calculados (por este archivo, con los mismos JSON de
// los tableros), cada uno con un id. La IA los ve en la consigna y puede
// citarlos por id como prueba de lo que una frase omite (la segunda lectura).
// El número que muestra la página sale de acá, no del texto de la IA: por eso
// la ficha se arma igual en el servidor y en el navegador.
//
// Agregar un dato: sumarlo a la lista de `agregarFicha` con un id nuevo. No
// cambiar un id existente (los ejemplos guardados los citan por id).

import { FUENTE_PRECIOS, grupoPublico, MAGNITUDES } from './catalogo.js';
import { corteDelPeriodo, norm, resolverPeriodo } from './motor.js';
import { calcularTopes39, periodos39 } from '../topes39.js';
import { enFunciones, eficaciaPorPresidencia, metricasDeGestion } from '../gestionCuentas.js';
import { gananciaDeLosMezcladores, gasoilPorSector, margenesBiodiesel, periodosPresidenciales, precioDeReferencia, publicadoContraFormula } from './sitio.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesTxt = (iso) => `${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const nf = (n, d = 0) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const t = (n) => `${nf(n)} t`;
const pct = (n, d = 1) => `${nf(n, d)}%`;
const min = (s) => s.charAt(0).toLowerCase() + s.slice(1); // "Biodiésel" -> "biodiésel", sin tocar siglas como HVO
const lista = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs.join(''));
const pesos = (n, d = 0) => `$ ${nf(n, d)}`;
const signo = (n, d = 0) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${nf(Math.abs(n), d)}%`;
const sumarMes = (iso, n) => {
  const total = Number(iso.slice(0, 4)) * 12 + (Number(iso.slice(5, 7)) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};
const promedio = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const masCaro = (g) => `${nf(Math.abs(g), 1)}% más ${g >= 0 ? 'caro' : 'barato'}`;

const suma = (e, idx, per) => e.serie.reduce((s, r) => (r[0] >= per.desde && r[0] <= per.hasta ? s + (r[idx] || 0) : s), 0);

function porClave(empresas, clave, idx, per) {
  const m = new Map();
  for (const e of empresas) {
    const v = suma(e, idx, per);
    if (v <= 0) continue;
    const x = m.get(e[clave]) ?? { v: 0, n: 0 };
    x.v += v;
    x.n += 1;
    m.set(e[clave], x);
  }
  return [...m.entries()].map(([k, x]) => ({ k, ...x })).sort((a, b) => b.v - a.v);
}

/**
 * Arma la ficha y la deja en ctx.ficha = { lista, porId }.
 * `petroleras` es petroleras.json, `aceite` es precio_aceite_rosario.json,
 * `tecnicos` es datos_tecnicos.json (contenido energético y reducción de
 * emisiones), `recinto` es { SENADORES, VOTACION } de mapa-recinto.js y `leyBases`
 * es diputados_ley_bases_2024.json (la votación de Diputados del 2/2/2024); si
 * alguno falta, los datos que dependen de él no se arman. Los precios salen de
 * ctx.precios (precios.js). `art39` es dicho_dato_art39.json (la planilla del
 * artículo 39: con ella se calcula si las no integradas pueden cubrir el corte
 * que la media sanción les reserva). `gestion` es gestion.json (presidencias,
 * secretarios de Energía y fórmulas de precio), `ranking` es gasoil_ranking.json
 * (precios de referencia, glicerina, aceite, gas oil importado) y `sectores` es
 * go_sectores.json (gas oil vendido por sector). `evidencia` es evidencia.json
 * (precio publicado del biodiésel en pesos y retenciones), `rutasPuertos` es
 * rutas_puertos.json (kilómetros por ruta de cada planta al puerto) y
 * `densidadBio`, la densidad del biodiésel (corte.json).
 */
export function agregarFicha(ctx, { petroleras, aceite, tecnicos, recinto, leyBases, art39, gestion, ranking, sectores, evidencia, rutasPuertos, densidadBio } = {}) {
  const datos = [];
  // `fuente` solo cuando no es la de siempre (Secretaría de Energía)
  const sumar = (id, tema, texto, ruta, fuente) => datos.push({ id, tema, texto, ruta, ...(fuente ? { fuente } : {}) });
  // los datos técnicos no salen de los tableros: llevan su propia fuente y su enlace
  const sumarTecnico = (id, tema, texto, anexo) =>
    datos.push({
      id,
      tema,
      texto,
      fuente: `Fuente: Directiva (UE) 2018/2001 de la Unión Europea (energías renovables), ${anexo}.`,
      url: tecnicos.meta.url,
    });

  const p12 = resolverPeriodo('ultimos_12_meses', ctx);
  const anioCerrado = ctx.ultimo.slice(5) === '12' ? Number(ctx.ultimo.slice(0, 4)) : Number(ctx.ultimo.slice(0, 4)) - 1;
  const pAnio = resolverPeriodo(`anio:${anioCerrado}`, ctx);
  const pTodo = resolverPeriodo('historico', ctx);
  const VC = MAGNITUDES.ventas_cupo.idx;
  const PROD = MAGNITUDES.produccion.idx;
  const EXP = MAGNITUDES.exportacion.idx;
  const de = (cat) => ctx.empresas.filter((e) => e.categoria === cat);
  const total = (lst, idx, per) => lst.reduce((s, e) => s + suma(e, idx, per), 0);

  if (p12.ok) {
    const en = `en ${p12.etiqueta}`;

    // ---- ventas al cupo
    const vcTotal = total(ctx.empresas, VC, p12);
    const vcNI = total(de('NO INTEGRADA'), VC, p12);
    const vcI = total(de('INTEGRADA'), VC, p12);
    if (vcTotal > 0) {
      sumar(
        'D-CUPO-CATEGORIAS',
        'Ventas al cupo',
        `Ventas de biodiésel al cupo ${en}: ${t(vcTotal)}. Las no integradas vendieron ${t(vcNI)} (${pct((vcNI / vcTotal) * 100)}) y las integradas ${t(vcI)} (${pct((vcI / vcTotal) * 100)}).`,
        '/mercado/integradas'
      );

      const conVentas = (cat) => de(cat).filter((e) => suma(e, VC, p12) > 0);
      const ni = conVentas('NO INTEGRADA');
      const integ = conVentas('INTEGRADA');
      sumar(
        'D-CUPO-EMPRESAS',
        'Ventas al cupo',
        `Empresas que vendieron al cupo ${en}: ${ni.length} no integradas, de ${new Set(ni.map((e) => e.grupo)).size} grupos económicos, y ${integ.length} ${integ.length === 1 ? 'integrada' : 'integradas'}${integ.length ? ` (${lista(integ.map((e) => e.nombre))})` : ''}.`,
        '/mercado/empresa'
      );

      const empresas = ctx.empresas.map((e) => ({ e, v: suma(e, VC, p12) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
      const mayor = empresas[0];
      sumar(
        'D-CUPO-MAYOR-EMPRESA',
        'Concentración de las ventas al cupo',
        `La empresa que más vendió al cupo ${en} fue ${mayor.e.nombre} (${mayor.e.categoria.toLowerCase()}), con ${t(mayor.v)}: ${pct((mayor.v / vcTotal) * 100)} del total. Empresas con más de 10% del total: ${empresas.filter((x) => x.v / vcTotal > 0.1).length || 'ninguna'}.`,
        '/mercado/participacion'
      );

      const grupos = porClave(ctx.empresas, 'grupo', VC, p12);
      const g = grupos[0];
      const mas10 = grupos.filter((x) => x.v / vcTotal > 0.1);
      sumar(
        'D-CUPO-MAYOR-GRUPO',
        'Concentración de las ventas al cupo',
        `El grupo económico que más vendió al cupo ${en} fue el ${grupoPublico(g.k)}, con ${g.n} ${g.n === 1 ? 'empresa' : 'empresas'} y ${t(g.v)}: ${pct((g.v / vcTotal) * 100)} del total. Grupos con más de 10% del total: ${mas10.length ? lista(mas10.map((x) => `${grupoPublico(x.k)} (${pct((x.v / vcTotal) * 100)})`)) : 'ninguno'}. Los grupos se arman con las empresas que los integran hoy.`,
        '/mercado/aceiteras'
      );
    }

    // ---- producción y exportación
    sumar(
      'D-PROD-CATEGORIAS',
      'Producción',
      `Producción de biodiésel ${en}: integradas ${t(total(de('INTEGRADA'), PROD, p12))}; no integradas ${t(total(de('NO INTEGRADA'), PROD, p12))}.`,
      '/mercado/integradas'
    );
    sumar(
      'D-EXPO-CATEGORIAS',
      'Exportación',
      `Exportaciones de biodiésel ${en}: integradas ${t(total(de('INTEGRADA'), EXP, p12))}; no integradas ${t(total(de('NO INTEGRADA'), EXP, p12))}.`,
      '/mercado/integradas'
    );
  }

  if (pTodo.ok) {
    sumar(
      'D-EXPO-NI-HISTORICO',
      'Exportación',
      `Exportaciones de las empresas no integradas en toda la serie del sitio (${mesTxt(pTodo.desde)} a ${mesTxt(pTodo.hasta)}): ${t(total(de('NO INTEGRADA'), EXP, pTodo))}. En el mismo período las integradas exportaron ${t(total(de('INTEGRADA'), EXP, pTodo))}.`,
      '/mercado/integradas'
    );
    const porAnio = [];
    for (let y = anioCerrado - 8; y <= anioCerrado; y += 1) {
      const per = resolverPeriodo(`anio:${y}`, ctx);
      if (per.ok) porAnio.push(`${y}: ${nf(total(ctx.empresas, EXP, per))}`);
    }
    if (porAnio.length) {
      sumar('D-EXPO-POR-ANIO', 'Exportación', `Exportaciones de biodiésel por año, en toneladas. ${porAnio.join(' · ')}.`, '/mercado/evolucion');
    }
  }

  // ---- capacidad instalada
  const conPlanta = (cat) => de(cat).filter((e) => e.capacidad > 0);
  const capI = conPlanta('INTEGRADA');
  const capNI = conPlanta('NO INTEGRADA');
  if (capI.length || capNI.length) {
    const cap = (lst) => lst.reduce((s, e) => s + e.capacidad, 0);
    sumar(
      'D-CAP-CATEGORIAS',
      'Capacidad instalada',
      `Capacidad instalada de biodiésel en operación (tablero de Capacidad del sitio, a ${mesTxt(ctx.fechaCapacidad)}): integradas ${nf(cap(capI))} t por año en ${capI.length} plantas; no integradas ${nf(cap(capNI))} t por año en ${capNI.length} plantas.`,
      '/mercado/capacidad'
    );
    const grandes = capNI.filter((e) => e.capacidad > 50000).sort((a, b) => b.capacidad - a.capacidad);
    sumar(
      'D-CAP-NI-MAS-50000',
      'Capacidad instalada',
      `Plantas no integradas en operación con capacidad instalada mayor a 50.000 t por año: ${grandes.length}${grandes.length ? ` (${lista(grandes.map((e) => `${e.nombre}, ${nf(e.capacidad)}`))})` : ''}. Con 50.000 t o menos: ${capNI.length - grandes.length}.`,
      '/mercado/capacidad'
    );
  }

  // ---- corte obligatorio
  const frase = (c) =>
    `corte obligatorio ${pct(c.obligatorio, 2)} (promedio ponderado), corte real ${pct(c.real, 2)}, cumplimiento ${pct((c.real / c.obligatorio) * 100)}; faltaron ${t(c.faltante)} de biodiésel para cumplirlo`;
  const cAnio = pAnio.ok ? corteDelPeriodo(ctx, pAnio) : null;
  if (cAnio) sumar('D-CORTE-ULTIMO-ANIO', 'Corte obligatorio', `En ${anioCerrado}: ${frase(cAnio)}.`, '/gestion');
  const c12 = p12.ok ? corteDelPeriodo(ctx, p12) : null;
  if (c12) sumar('D-CORTE-12M', 'Corte obligatorio', `En ${p12.etiqueta}: ${frase(c12)}.`, '/gestion');

  if (ctx.corteMensual.length) {
    const primero = Number(ctx.corteMensual[0].fecha.slice(0, 4));
    const anios = [];
    for (let y = primero; y <= anioCerrado; y += 1) {
      const per = resolverPeriodo(`anio:${y}`, ctx);
      const c = per.ok ? corteDelPeriodo(ctx, per) : null;
      if (c && c.meses === 12) anios.push({ y, ...c });
    }
    if (anios.length) {
      const cumplidos = anios.filter((a) => Math.round(a.real * 100) >= Math.round(a.obligatorio * 100));
      sumar(
        'D-CORTE-ANIOS-CUMPLIDOS',
        'Corte obligatorio',
        `De los ${anios.length} años completos entre ${anios[0].y} y ${anios[anios.length - 1].y}, el corte real alcanzó al obligatorio en ${cumplidos.length}${cumplidos.length ? `: ${lista(cumplidos.map((a) => a.y))}` : ''}.`,
        '/gestion'
      );
      sumar(
        'D-CORTE-HISTORIA',
        'Corte obligatorio',
        `Corte obligatorio de biodiésel por año (promedio ponderado). ${anios.map((a) => `${a.y}: ${pct(a.obligatorio, 1)}`).join(' · ')}.`,
        '/gestion'
      );
    }
    const cambios = [];
    for (let i = 1; i < ctx.corteMensual.length; i += 1) {
      const a = ctx.corteMensual[i - 1];
      const b = ctx.corteMensual[i];
      if (a.obligatorio !== null && b.obligatorio !== null && a.obligatorio !== b.obligatorio) {
        cambios.push(`${mesTxt(b.fecha)}, de ${pct(a.obligatorio * 100, 1)} a ${pct(b.obligatorio * 100, 1)}`);
      }
    }
    sumar(
      'D-CORTE-CAMBIOS',
      'Corte obligatorio',
      `El corte obligatorio de biodiésel cambió ${cambios.length} veces entre ${mesTxt(ctx.corteMensual[0].fecha)} y ${mesTxt(ctx.ultimo)}: ${cambios.join('; ')}.`,
      '/gestion'
    );
  }

  // ---- compradores
  if (petroleras?.matriz_12m?.length) {
    const compras = new Map();
    for (const fila of petroleras.matriz_12m) {
      for (const [petrolera, v] of Object.entries(fila.ventas)) compras.set(petrolera, (compras.get(petrolera) || 0) + (v || 0));
    }
    const orden = [...compras.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const tot = orden.reduce((s, [, v]) => s + v, 0);
    if (tot > 0) {
      const per = petroleras.periodo_12m ? `${mesTxt(petroleras.periodo_12m.desde)} a ${mesTxt(petroleras.periodo_12m.hasta)}` : 'los últimos 12 meses';
      const cuatro = orden.slice(0, 4);
      sumar(
        'D-COMPRAS-PETROLERAS',
        'Compradores de biodiésel',
        `Compras de biodiésel para el corte, ${per}: ${orden.length} petroleras compraron ${t(tot)}. ${orden[0][0]} compró ${t(orden[0][1])} (${pct((orden[0][1] / tot) * 100)}). Las cuatro mayores (${lista(cuatro.map(([k]) => k))}) compraron el ${pct((cuatro.reduce((s, [, v]) => s + v, 0) / tot) * 100)}.`,
        '/mercado/compras-cupo'
      );
    }
  }

  // ---- precio del aceite por distancia
  if (aceite?.resumen?.length) {
    const z = aceite.resumen;
    sumar(
      'D-ACEITE-DISTANCIA',
      'Precio del aceite por distancia',
      `Precio de compra del aceite que informan las elaboradoras, según la distancia de la planta a Rosario (${aceite.periodo}, ${aceite.meses_n} meses; nota de la Secretaría de Energía del 14/10/2026). Meses en que cada zona tuvo el aceite más barato: ${z.map((r) => `${r.rotulo.toLowerCase()}, ${r.mas_barata}`).join('; ')}. Meses en que tuvo el más caro: ${z.map((r) => `${r.rotulo.toLowerCase()}, ${r.mas_cara}`).join('; ')}.`,
      '/relacion-precio-aceite'
    );

    // lo mismo, en promedios: cuánto pagó cada zona y cuánto se separan entre sí
    if (aceite.meses?.length) {
      const meses = aceite.meses;
      const zonas = z.map((r) => ({ ...r, media: promedio(meses.map((m) => m[r.zona])), sobreRosario: meses.filter((m) => m[r.zona] > 100).length }));
      const orden = [...zonas].sort((a, b) => a.media - b.media);
      const [baja, alta] = [orden[0], orden[orden.length - 1]];
      const brecha = promedio(meses.map((m) => Math.max(...z.map((r) => m[r.zona])) - Math.min(...z.map((r) => m[r.zona]))));
      const todasAbajo = zonas.every((r) => r.media < 100);
      sumar(
        'D-ACEITE-DISTANCIA-PROMEDIO',
        'Precio del aceite por distancia, en promedio',
        `Precio de compra del aceite que informan las elaboradoras, según la distancia de la planta a Rosario, en promedio de ${mesTxt(meses[0].fecha)} a ${mesTxt(meses[meses.length - 1].fecha)} (${meses.length} meses; índice con Rosario = 100, de la nota de la Secretaría de Energía del 14/10/2026). Índice promedio de cada zona: ${zonas.map((r) => `${r.rotulo.toLowerCase()}, ${nf(r.media, 1)}`).join('; ')}.${todasAbajo ? ' Todas las zonas compraron, en promedio, por debajo del precio de Rosario.' : ''} La zona que compró más barato en promedio fue ${baja.rotulo.toLowerCase()} y la que compró más caro, ${alta.rotulo.toLowerCase()}: ${nf(alta.media - baja.media, 1)} puntos de diferencia entre las dos. Entre la zona más cara y la más barata de cada mes hubo, en promedio, ${nf(brecha, 1)} puntos. Meses en que cada zona pagó más que el precio de Rosario: ${zonas.map((r) => `${r.rotulo.toLowerCase()}, ${r.sobreRosario}`).join('; ')}.`,
        '/relacion-precio-aceite'
      );
    }
  }

  // ---- lo que la media sanción manda y lo que sus topes permiten (artículos 38 y 39)
  // Es la cuenta del control «Tope, porcentaje y corte» de «Del dicho al dato»
  // (topes39.js). Sin esto, una frase como "con la media sanción las no integradas
  // no pueden abastecer el 7,5%" quedaba Indeterminada: el texto de la ley trae los
  // topes, pero no dice si alcanzan (HDO, 22/11/2026).
  if (art39?.entidades?.length && art39.media_sancion) {
    const { maximo, pct: porcentaje } = art39.media_sancion;
    const cuenta = (periodoId, conMaximo = true) => calcularTopes39(art39, { periodoId, maximo: conMaximo ? maximo : null, pct: porcentaje });
    const periodos = periodos39(art39);
    const primero = periodos[0];
    const r = cuenta(primero.id);
    const sinMax = cuenta(primero.id, false);
    const grupos = art39.entidades.filter((e) => e.tipo === 'grupo');
    const independientes = art39.entidades.filter((e) => e.tipo !== 'grupo');
    const sociedades = art39.entidades.reduce((n, e) => n + e.sociedades.length, 0);
    const d2 = (n) => nf(n, 2);
    // la diferencia se saca con las dos cifras ya redondeadas, para que cierre con lo que se lee
    const saldoDe = (x) => Math.round(x.permitido) - Math.round(x.periodo.segmento);
    const saldoTxt = (x) => (saldoDe(x) < 0 ? `faltan ${t(-saldoDe(x))}` : saldoDe(x) > 0 ? `sobran ${t(saldoDe(x))}` : 'alcanza justo');
    const EN_LETRAS = ['', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];
    const enLetras = (n) => EN_LETRAS[n] ?? String(n);
    const fuenteTopes = `Fuente: cálculo de www.explorarg.com con los artículos 38 y 39 de la media sanción y la capacidad de cada planta (${art39.meta.fuente_publica}).`;
    const ruta39 = '/del-dicho-al-dato/4';
    const base = `Cuenta con ${nf(art39.gasoil_m3 / 1e6, 2)} millones de m³ de gas oil por año.`;

    sumar(
      'D-TOPES-MS-PRIMER-ANIO',
      'Cuenta de los topes de la media sanción',
      `Primer año de la media sanción. El artículo 38 les reserva a las no integradas el ${pct(primero.ni)} del gas oil: son ${t(primero.segmento)} de biodiésel. Con los topes del artículo 39 a) (cada empresa, hasta el ${pct(porcentaje, 0)} de ese volumen con un máximo de ${t(maximo)}; cada grupo económico, hasta el ${pct(porcentaje, 0)}), las ${sociedades} no integradas que venden al corte, que son ${grupos.length} grupos económicos y ${independientes.length} empresas independientes, pueden vender entre todas ${t(r.permitido)} como máximo. ${saldoDe(r) < 0 ? `Faltan ${t(-saldoDe(r))}, el ${pct((-saldoDe(r) / primero.segmento) * 100)} de lo que la ley les reserva: con esos topes las no integradas no pueden abastecer el ${pct(primero.ni)}; lo más que pueden cubrir es el ${d2(r.cortePosible)}% del gas oil.` : `Alcanza: ${saldoTxt(r)}.`} No es por falta de plantas: su capacidad instalada suma ${t(r.capacidad)} por año. ${base}`,
      ruta39,
      fuenteTopes
    );
    sumar(
      'D-TOPES-MS-PERIODOS',
      'Cuenta de los topes de la media sanción, período por período',
      `Lo que el artículo 38 de la media sanción les reserva a las no integradas y lo que los topes del artículo 39 a) les dejan vender, en cada período: ${periodos
        .map((p) => {
          const x = cuenta(p.id);
          return `${min(p.label)}, ${pct(p.ni)} del gas oil: manda ${t(p.segmento)}, los topes permiten ${t(x.permitido)}, ${saldoTxt(x)} (corte posible ${d2(x.cortePosible)}%)`;
        })
        .join('; ')}. ${base}`,
      ruta39,
      fuenteTopes
    );
    const afectadas = r.filas.filter((f) => f.saca > 0.5);
    if (afectadas.length) {
      const iguales = afectadas.every((f) => Math.abs(f.saca - afectadas[0].saca) < 1);
      const total = afectadas.reduce((s, f) => s + f.saca, 0);
      sumar(
        'D-TOPES-MS-MAXIMO',
        'Efecto del máximo de 50.000 toneladas',
        `El máximo de ${t(maximo)} por empresa del artículo 39 a) i) de la media sanción, el primer año: ${iguales ? `les saca ${t(afectadas[0].saca)} a cada una de ${lista(afectadas.map((f) => f.nombre))} (${t(total)} entre las ${enLetras(afectadas.length)})` : `les saca ${t(total)} en total a ${lista(afectadas.map((f) => f.nombre))}`}. Sin ese máximo, cada una podría vender hasta el ${pct(porcentaje, 0)} del segmento (${t(r.limite)}), lo mismo que un grupo económico, al que el máximo en toneladas no se le aplica. Sin el máximo, las no integradas podrían vender ${t(sinMax.permitido)}: ${saldoTxt(sinMax)} para cubrir el ${pct(primero.ni)} (corte posible ${d2(sinMax.cortePosible)}%).`,
        ruta39,
        fuenteTopes
      );
    }
    sumar(
      'D-TOPES-MS-USO-PLANTA',
      'Uso de cada planta con los topes de la media sanción',
      `Con los topes del artículo 39 a) de la media sanción, el primer año, cuánto puede vender cada una y qué parte de su capacidad representa: ${r.filas
        .map((f) => `${f.nombre}${f.tipo === 'grupo' ? ` (grupo, ${f.sociedades.length} sociedades)` : ''}, ${t(f.puede)} de ${t(f.capacidad)} (${pct((f.puede / f.capacidad) * 100, 0)})`)
        .join('; ')}.`,
      ruta39,
      fuenteTopes
    );
  }

  // ============ Cuentas de otras páginas del sitio (HDO, 22/11/2026: todo lo que está
  // en explorarg.com sirve de prueba; ver sitio.js y gestionCuentas.js)
  const usd = (n, d = 0) => `US$ ${nf(n, d)}`;
  const rango = (desde, hasta) => (desde === hasta ? mesTxt(desde) : `${mesTxt(desde)} a ${mesTxt(hasta)}`);

  // ---- cumplimiento del corte por presidencia y por secretario de Energía (/gestion)
  if (gestion?.presidencias?.length && ctx.corteMensual.length) {
    const presidencias = gestion.presidencias.filter((x) => !x.hasta || x.hasta >= '2010-01');
    const ef = eficaciaPorPresidencia({ presidencias, corteMensual: ctx.corteMensual });
    if (ef.length) {
      sumar(
        'D-GESTION-PRESIDENCIAS',
        'Cumplimiento del corte por presidencia',
        `Cumplimiento del corte obligatorio de biodiésel durante cada presidencia, desde enero de 2010 (biodiésel vendido para el corte sobre lo que mandaba la norma): ${ef
          .map((g) => `${g.presidente} (${rango(g.desde, g.hasta)}), ${pct(g.cumplimiento)} cumplido, corte real ${pct(g.corte)}, déficit acumulado ${t(g.deficit)} en ${g.meses} meses`)
          .join('; ')}.`,
        '/gestion/eficacia'
      );
    }
    if (gestion.secretarios?.length && ranking?.importaciones) {
      const secretarios = enFunciones(gestion.secretarios);
      const M = metricasDeGestion({ lista: secretarios, corteMensual: ctx.corteMensual, importaciones: ranking.importaciones, densidadGo: ranking.densidad_go });
      const filas = secretarios
        .map((sec) => ({ sec, m: M.get(`${sec.nombre}|${sec.desde}`) }))
        .filter((x) => x.m && x.m.cumpl !== null);
      if (filas.length) {
        const orden = [...filas].sort((a, b) => b.m.cumpl - a.m.cumpl);
        sumar(
          'D-GESTION-SECRETARIOS',
          'Cumplimiento del corte por secretario de Energía',
          `Corte de biodiésel durante la gestión de cada secretario o secretaria de Energía desde enero de 2010: ${filas
            .map(({ sec, m }) => `${sec.nombre} (${rango(m.desde, m.hasta)}; presidencia de ${sec.presidente}), corte real ${pct(m.corte * 100)}, cumplimiento ${pct(m.cumpl * 100)}${m.importado !== null ? `, gas oil importado ${pct(m.importado * 100)} del vendido` : ''}`)
            .join('; ')}. El mayor cumplimiento fue el de ${orden[0].sec.nombre} (${pct(orden[0].m.cumpl * 100)}) y el menor, el de ${orden[orden.length - 1].sec.nombre} (${pct(orden[orden.length - 1].m.cumpl * 100)}).`,
          '/gestion/secretarios'
        );
      }
    }
    if (gestion.formulas_periodos?.length) {
      const fp = gestion.formulas_periodos;
      sumar(
        'D-FORMULAS-PRECIO',
        'Fórmulas del precio oficial del biodiésel',
        `Desde 2010 el precio oficial del biodiésel para el corte se fijó con ${fp.length} fórmulas o resoluciones sucesivas: ${fp.map((f) => `${f.formula} (desde ${mesTxt(f.desde)})`).join('; ')}. La vigente es ${fp[fp.length - 1].formula}.`,
        '/gestion'
      );
    }
  }

  // ---- márgenes del biodiésel (/margenes) y precios de referencia (/gas-oil)
  const margenes = margenesBiodiesel(ranking);
  if (margenes) {
    const desde12 = sumarMes(margenes.ultimo, -11);
    const m12 = margenes.promedio(desde12, margenes.ultimo);
    const u = margenes.de(margenes.ultimo);
    sumar(
      'D-MARGEN-BIO-12M',
      'Margen del biodiésel sobre el aceite',
      `Margen del biodiésel sobre el aceite de soja, promedio de los últimos 12 meses (${rango(desde12, margenes.ultimo)}), en dólares por tonelada: precio oficial del biodiésel para el corte ${usd(m12.bio)}, aceite de soja FAS ${usd(m12.aceite)}, margen ${usd(m12.margen)} (${pct(m12.margenPct)} del precio del biodiésel). Crack spread 10:9:1 (0,9 de biodiésel más 0,1 de glicerina, menos el aceite): ${usd(m12.crack)}, el ${pct(m12.crackPct)} del precio del aceite. En ${mesTxt(u.fecha)}: biodiésel ${usd(u.bio)}, aceite ${usd(u.aceite)}, margen ${usd(u.margen)}. El margen es antes de los demás costos de elaboración (metanol, energía, mano de obra, fletes).`,
      '/margenes'
    );
    if (gestion?.presidencias?.length) {
      const per = periodosPresidenciales(gestion.presidencias, margenes.primero, margenes.ultimo).map((x) => ({ ...x, m: margenes.promedio(x.desde, x.hasta) }));
      sumar(
        'D-MARGEN-BIO-PRESIDENCIAS',
        'Margen del biodiésel sobre el aceite, por presidencia',
        `Margen del biodiésel sobre el aceite de soja FAS, promedio de cada presidencia, en dólares por tonelada: ${per
          .map((x) => `${x.presidente} (${rango(x.desde, x.hasta)}), biodiésel ${usd(x.m.bio)}, aceite ${usd(x.m.aceite)}, margen ${usd(x.m.margen)} (${pct(x.m.margenPct)} del precio del biodiésel), crack spread 10:9:1 ${usd(x.m.crack)}`)
          .join('; ')}.`,
        '/margenes'
      );
    }
  }
  if (ranking?.productos) {
    const REFERENCIAS = [
      ['bio_963_m', 'biodiésel para el corte obligatorio (precio oficial)'],
      ['sme_arg', 'biodiésel SME Argentina, fob Rosario'],
      ['jj_bio_fob', 'biodiésel de exportación spot, fob Rosario'],
      ['fame_ara', 'biodiésel FAME en Europa (ARA, fob)'],
      ['aceite_fob_sagyp', 'aceite de soja, fob oficial'],
      ['aceite_fas', 'aceite de soja FAS Rosario'],
      ['go2_sin_imp', 'gas oil grado 2 local, sin impuestos'],
      ['metanol_ypf', 'metanol de YPF'],
    ];
    const refs = REFERENCIAS.map(([id, nombre]) => ({ nombre, x: precioDeReferencia(ranking, id, anioCerrado) })).filter((r) => r.x?.promedio);
    const brent = precioDeReferencia(ranking, 'brent', anioCerrado);
    if (refs.length) {
      sumar(
        'D-PRECIOS-REFERENCIA',
        'Precios de referencia en dólares',
        `Precios de referencia en dólares por tonelada, promedio de ${anioCerrado} y, entre paréntesis, el último dato: ${refs
          .map((r) => `${r.nombre}, ${usd(r.x.promedio)} (${mesTxt(r.x.ultimo.fecha)}: ${usd(r.x.ultimo.valor)})`)
          .join('; ')}.${brent?.promedio ? ` Petróleo Brent: ${usd(brent.promedio / 6.2898, 1)} por barril en ${anioCerrado} (${mesTxt(brent.ultimo.fecha)}: ${usd(brent.ultimo.valor / 6.2898, 1)}).` : ''}`,
        '/gas-oil/ranking',
        'Fuente: Secretaría de Energía, SAGyP y cotizaciones internacionales, procesadas por www.explorarg.com.'
      );
    }
    // gas oil importado: volumen y precio
    if (ranking.importaciones?.length && p12.ok) {
      const imp = ranking.importaciones.filter((m) => m.fecha >= p12.desde && m.fecha <= p12.hasta);
      const ton = imp.reduce((s2, m) => s2 + (m.ton || 0), 0);
      const go = ctx.corteMensual.filter((m) => m.fecha >= p12.desde && m.fecha <= p12.hasta).reduce((s2, m) => s2 + m.go_m3, 0);
      const cif = imp.filter((m) => m.ton && m.cif_usd_ton);
      const cifMedio = cif.reduce((s2, m) => s2 + m.cif_usd_ton * m.ton, 0) / (cif.reduce((s2, m) => s2 + m.ton, 0) || 1);
      if (ton > 0 && go > 0) {
        sumar(
          'D-GASOIL-IMPORTADO-12M',
          'Gas oil importado',
          `Gas oil importado en los últimos 12 meses (${rango(p12.desde, p12.hasta)}; despachos sin CAMMESA): ${t(ton)}, el ${pct((ton / ranking.densidad_go / go) * 100)} del gas oil grado 2 y 3 vendido en el país. Precio promedio puesto en puerto (CIF): ${usd(cifMedio)} por tonelada.`,
          '/gas-oil/importaciones'
        );
      }
    }
  }

  // ---- gas oil vendido por sector (/gas-oil)
  if (sectores?.mensual_total?.length && p12.ok) {
    const gs = gasoilPorSector(sectores, p12.desde, p12.hasta);
    if (gs) {
      const sinCorte = gs.filas.filter((f) => f.sinCorte).map((f) => f.sector.toLowerCase());
      sumar(
        'D-GASOIL-SECTORES',
        'Gas oil vendido por sector',
        `Gas oil grado 2 y 3 vendido en el país en los últimos 12 meses (${rango(p12.desde, p12.hasta)}): ${nf(gs.total / 1e6, 2)} millones de m³. Por sector: ${gs.filas
          .filter((f) => f.pct >= 0.5)
          .map((f) => `${f.sector.toLowerCase()}, ${pct(f.pct)}`)
          .join('; ')}. Los sectores sin obligación de corte (${lista(sinCorte)}) suman el ${pct(gs.sinCortePct)}; el resto, ${nf((gs.total * (1 - gs.sinCortePct / 100)) / 1e6, 2)} millones de m³, es el gas oil sobre el que se mide el corte.`,
        '/gas-oil'
      );
    }
  }

  // ---- Res. 963: precio publicado contra precio de fórmula (/gas-oil/biodiesel-963)
  const pf = publicadoContraFormula(ranking?.res963);
  if (pf) {
    const dif = pf.ultimo.publicado - pf.ultimo.formula;
    sumar(
      'D-RES963-PUBLICADO-FORMULA',
      'Precio publicado contra precio de fórmula (Res. 963/2023)',
      `Precio del biodiésel para el corte que publica la Secretaría de Energía, comparado con el que da la fórmula de la Resolución 963/2023, de ${rango(pf.desde, pf.hasta)} (${pf.meses} meses): el publicado quedó por debajo de la fórmula en ${pf.porDebajo} meses, igual en ${pf.iguales} y por arriba en ${pf.porArriba}. Diferencia acumulada, multiplicada por el cupo de cada mes: ${pf.acumuladoUsd < 0 ? `las elaboradoras cobraron ${usd(-pf.acumuladoUsd / 1e6, 1)} millones menos` : `las elaboradoras cobraron ${usd(pf.acumuladoUsd / 1e6, 1)} millones más`} que con el precio de fórmula. En ${mesTxt(pf.ultimo.fecha)}: publicado ${pesos(pf.ultimo.publicado)} por tonelada, fórmula ${pesos(pf.ultimo.formula)} (${dif < 0 ? `${pesos(-dif)} menos` : `${pesos(dif)} más`}).`,
      '/gas-oil/biodiesel-963'
    );
  }

  // ---- ganancia de los mezcladores por mezclar menos biodiésel (/gas-oil/corte)
  if (evidencia?.precio_biodiesel && ranking?.tc && densidadBio) {
    const gm = gananciaDeLosMezcladores({ corteMensual: ctx.corteMensual, precioBio: evidencia.precio_biodiesel, tc: ranking.tc, importaciones: ranking.importaciones, densidadBio, densidadGo: ranking.densidad_go });
    if (gm) {
      const mill = (n) => `${usd(Math.abs(n) / 1e6)} millones`;
      sumar(
        'D-MEZCLADORES-GANANCIA',
        'Ganancia de los mezcladores por mezclar menos biodiésel',
        `Lo que ganaron los mezcladores (las petroleras) por mezclar menos biodiésel y cubrir esa parte con gas oil, valuado contra el gas oil importado puesto en puerto, en dólares corrientes, de ${rango(gm.desde, gm.hasta)}: ${gm.total >= 0 ? 'ganancia' : 'pérdida'} acumulada de ${mill(gm.total)}. Son ${mill(gm.reemplazo)} ${gm.reemplazo >= 0 ? 'por' : 'de pérdida por'} el biodiésel que faltó para llegar al corte obligatorio, más ${mill(gm.reduccion)} ${gm.reduccion >= 0 ? 'por' : 'de pérdida por'} la reducción del corte del 10% de la ley 26.093 (desde julio de 2021). La cuenta de cada mes: porcentaje no mezclado por el gas oil vendido por la diferencia de precio entre el biodiésel y el gas oil importado.`,
        '/gas-oil/corte'
      );
    }
  }

  // ---- retenciones: aceite de soja y biodiésel
  if (evidencia?.retenciones?.length) {
    const ret = evidencia.retenciones.filter((x) => x.sbo !== null && x.sme !== null && x.sme !== undefined);
    if (ret.length) {
      const u = ret[ret.length - 1];
      const p100 = (x) => pct(x * 100);
      const dic = [];
      for (let y = 2010; y <= anioCerrado; y += 1) {
        const x = ret.find((z) => z.fecha === `${y}-12`);
        if (x) dic.push(`${y}, ${p100(x.sbo)} y ${p100(x.sme)}`);
      }
      const iguales = [...ret].reverse().findIndex((x) => Math.abs(x.sbo - x.sme) > 0.0005);
      const desdeIguales = iguales > 0 ? ret[ret.length - iguales].fecha : null;
      sumar(
        'D-RETENCIONES',
        'Retenciones del aceite de soja y del biodiésel',
        `Derechos de exportación (retenciones) del aceite de soja y del biodiésel. En ${mesTxt(u.fecha)}: aceite ${p100(u.sbo)}, biodiésel ${p100(u.sme)}${desdeIguales ? `; pagan lo mismo desde ${mesTxt(desdeIguales)}` : ''}. A diciembre de cada año (aceite y biodiésel): ${dic.join('; ')}.`,
        '/propuesta-s0809-2026',
        'Fuente: decretos y resoluciones de derechos de exportación, procesados por www.explorarg.com.'
      );
    }
  }

  // ---- distancia de cada planta al puerto (/mercado/plantas)
  if (rutasPuertos?.rutas) {
    const filas = Object.entries(rutasPuertos.rutas)
      .map(([clave, r]) => ({ empresa: clave.split('|')[0], km: r.km }))
      .sort((a, b) => a.km - b.km);
    if (filas.length) {
      const hasta = (k) => filas.filter((f) => Math.round(f.km) <= k).length; // con el km redondeado, como se lee
      sumar(
        'D-DISTANCIA-PUERTO',
        'Distancia de cada planta de biodiésel al puerto',
        `Kilómetros por ruta desde cada planta de biodiésel en operación hasta Puerto General San Martín (Gran Rosario): ${filas.map((f) => `${f.empresa}, ${nf(f.km)} km`).join('; ')}. De las ${filas.length} plantas, ${hasta(50)} están a 50 km o menos, ${hasta(100)} a 100 km o menos y ${filas.length - hasta(300)} a más de 300 km.`,
        '/mercado/plantas',
        'Fuente: rutas de OpenStreetMap calculadas por www.explorarg.com sobre el padrón de plantas de la Secretaría de Energía.'
      );
    }
  }

  // ---- las integradas en el mercado interno, año por año
  if (pTodo.ok) {
    const CUPO = MAGNITUDES.cupo_asignado.idx;
    const filas = [];
    for (let y = Number(pTodo.desde.slice(0, 4)); y <= anioCerrado; y += 1) {
      const per = resolverPeriodo(`anio:${y}`, ctx);
      if (!per.ok) continue;
      const cupo = total(de('INTEGRADA'), CUPO, per);
      const vc = total(de('INTEGRADA'), VC, per);
      const exp = total(de('INTEGRADA'), EXP, per);
      if (!filas.length && cupo <= 0 && vc <= 0) continue; // la serie empieza cuando empieza el corte obligatorio
      filas.push(`${y}: cupo ${nf(cupo)}, vendido al cupo ${nf(vc)}, exportado ${nf(exp)}`);
    }
    if (filas.length) {
      sumar(
        'D-INTEGRADAS-MERCADO-INTERNO',
        'Las integradas en el mercado interno',
        `Empresas integradas, por año, en toneladas: cupo asignado para el corte obligatorio, biodiésel vendido al cupo y exportaciones. ${filas.join(' · ')}.`,
        '/mercado/integradas'
      );
    }
  }

  // ---- uso de la capacidad instalada (producción sobre capacidad en operación de cada año)
  if (ctx.capacidadAnual?.anios.length && pTodo.ok) {
    const { anios, de: fotos } = ctx.capacidadAnual;
    const foto = (y) => fotos.get([...anios].reverse().find((a) => a <= y) ?? anios[0]);
    const clave = (e) => norm(e.nombre);
    const uso = (cat, per) => {
      const mesesPorAnio = new Map();
      for (let m = per.desde; m <= per.hasta; m = sumarMes(m, 1)) mesesPorAnio.set(Number(m.slice(0, 4)), (mesesPorAnio.get(Number(m.slice(0, 4))) || 0) + 1);
      let cap = 0;
      for (const e of de(cat)) for (const [y, n] of mesesPorAnio) cap += ((foto(y).get(clave(e)) || 0) * n) / 12;
      return cap > 0 ? (total(de(cat), PROD, per) / cap) * 100 : null;
    };
    const serie = (cat) => {
      const xs = [];
      for (let y = Number(pTodo.desde.slice(0, 4)); y <= anioCerrado; y += 1) {
        const per = resolverPeriodo(`anio:${y}`, ctx);
        const u = per.ok ? uso(cat, per) : null;
        if (u !== null) xs.push(`${y} ${nf(u)}%`);
      }
      const u12 = p12.ok ? uso(cat, p12) : null;
      if (u12 !== null) xs.push(`${p12.etiqueta} ${nf(u12)}%`);
      return xs.join(' · ');
    };
    sumar(
      'D-CAP-USO',
      'Uso de la capacidad instalada',
      `Uso de la capacidad instalada: producción de biodiésel de cada año sobre la capacidad en operación registrada en enero de ese año (por eso un año en que se sumó capacidad puede pasar de 100%). Integradas: ${serie('INTEGRADA')}. No integradas: ${serie('NO INTEGRADA')}.`,
      '/mercado/capacidad'
    );
  }

  // ---- precios: biodiésel contra gas oil, impuestos y efecto del corte en el surtidor (precios.js)
  const P = ctx.precios;
  if (P) {
    const ruta = '/gas-oil/biodiesel';
    const par = P.mesesCon(['biodiesel', 'gasoil_fosil']);
    const g = (m, b = 'gasoil_fosil') => P.brecha(m, 'biodiesel', b);
    if (par.length) {
      const u = par[par.length - 1];
      const f = P.de(u);
      const imp = P.mesesCon(['biodiesel', 'gasoil_importado']);
      const ui = imp[imp.length - 1];
      sumar(
        'D-PRECIO-ULTIMO-MES',
        'Precios: biodiésel y gas oil',
        `Precios por litro, sin impuestos, en ${mesTxt(u)} (último mes con datos): biodiésel, precio oficial para el corte obligatorio, ${pesos(f.biodiesel)}; gas oil fósil local (grado 2 mayorista, descontado el biodiésel que lleva mezclado), ${pesos(f.gasoil_fosil)}. El litro de biodiésel es ${masCaro(g(u))} que el de gas oil fósil local.${ui ? ` Gas oil importado puesto en puerto (CIF), ${mesTxt(ui)}: ${pesos(P.de(ui).gasoil_importado)}; ese mes el biodiésel fue ${masCaro(g(ui, 'gasoil_importado'))} que el importado.` : ''}${f.gasoil_surtidor ? ` Gas oil grado 2 en el surtidor, con impuestos: ${pesos(f.gasoil_surtidor)}.` : ''}`,
        ruta,
        FUENTE_PRECIOS
      );

      const ult = par.slice(-24);
      const min = ult.reduce((a, b) => (g(b) < g(a) ? b : a));
      const max = ult.reduce((a, b) => (g(b) > g(a) ? b : a));
      sumar(
        'D-PRECIO-BRECHA-MESES',
        'Precios: biodiésel contra gas oil fósil local, mes por mes',
        `Cuánto más caro (+) o más barato (-) es el litro de biodiésel que el de gas oil fósil local, los dos sin impuestos, mes por mes. ${ult.map((m) => `${mesTxt(m)} ${signo(g(m))}`).join(' · ')}. En esos ${ult.length} meses fue de ${signo(g(min))} (${mesTxt(min)}) a ${signo(g(max))} (${mesTxt(max)}).`,
        ruta,
        FUENTE_PRECIOS
      );

      const porAnio = (meses, base) => {
        const m = new Map();
        for (const mes of meses) {
          const y = mes.slice(0, 4);
          if (!m.has(y)) m.set(y, []);
          m.get(y).push(g(mes, base));
        }
        return [...m.entries()].map(([y, xs]) => ({ y, prom: promedio(xs), n: xs.length }));
      };
      const anios = porAnio(par, 'gasoil_fosil');
      const baratos = anios.filter((a) => a.prom < 0);
      sumar(
        'D-PRECIO-BRECHA-ANIOS',
        'Precios: biodiésel contra gas oil fósil local, por año',
        `Cuánto más caro (+) o más barato (-) fue el litro de biodiésel que el de gas oil fósil local, los dos sin impuestos: promedio de los meses de cada año. ${anios.map((a) => `${a.y} ${signo(a.prom)}`).join(' · ')}. Años en que el biodiésel fue en promedio más barato que el gas oil fósil: ${baratos.length ? lista(baratos.map((a) => a.y)) : 'ninguno'}.`,
        ruta,
        FUENTE_PRECIOS
      );

      if (imp.length) {
        const ai = porAnio(imp, 'gasoil_importado').slice(-6);
        const ui12 = imp.slice(-12);
        sumar(
          'D-PRECIO-BRECHA-IMPORTADO',
          'Precios: biodiésel contra gas oil importado',
          `Cuánto más caro (+) o más barato (-) es el litro de biodiésel que el de gas oil importado puesto en puerto (valor CIF de los despachos, sin impuestos ni gastos internos; es el precio en el puerto, no el precio al que se vende el gas oil en el país). Mes por mes: ${ui12.map((m) => `${mesTxt(m)} ${signo(g(m, 'gasoil_importado'))}`).join(' · ')}. Por año: ${ai.map((a) => `${a.y} ${signo(a.prom)}`).join(' · ')}.`,
          '/gas-oil/importaciones',
          FUENTE_PRECIOS
        );
      }
    }

    const conImp = P.mesesCon(['impuestos_gasoil']);
    if (conImp.length) {
      const u = conImp[conImp.length - 1];
      const f = P.de(u);
      sumar(
        'D-IMPUESTOS-GASOIL',
        'Impuestos del gas oil',
        `Impuestos que paga cada litro de gas oil fósil en ${mesTxt(u)}: ${pesos(f.impuestos_gasoil, 2)} (impuesto a los combustibles líquidos ${pesos(f.icl, 2)} más impuesto al dióxido de carbono ${pesos(f.ico2, 2)}, tarifa general). El biodiésel no paga ninguno de los dos.`,
        '/gas-oil/surtidor',
        'Fuente: datos de la Secretaría de Hacienda (montos del ICL y del ICO2), procesados por www.explorarg.com.'
      );
    }

    // el efecto de subir el corte es proporcional a los puntos: se da el de 7,5 puntos
    // (de 7,5% a 15%, "duplicar el corte") y los otros dos escenarios del debate
    const ms = P.mesesSurtidor;
    if (ms.length) {
      const fuente = 'Fuente: datos de la Secretaría de Energía (precios) y de la Secretaría de Hacienda (impuestos), procesados por www.explorarg.com.';
      const ef = (m, a, b) => P.efectoCorte(m, a, b);
      const txt = (e) => `${signo(e.pct, 1)} (${e.total >= 0 ? 'sube' : 'baja'} ${pesos(Math.abs(e.total))} por litro)`;
      const ult = ms.slice(-12);
      const u = ms[ms.length - 1];
      const todos = ms.map((m) => ef(m, 7.5, 15));
      const suben = todos.filter((e) => e.total > 0).length;
      const min = todos.reduce((a, b) => (b.pct < a.pct ? b : a));
      const max = todos.reduce((a, b) => (b.pct > a.pct ? b : a));
      sumar(
        'D-SURTIDOR-CORTE',
        'Precio en el surtidor si sube el corte',
        `Qué le pasa al precio del litro de gas oil en el surtidor si el corte de biodiésel sube. Cada punto de corte reemplaza gas oil fósil por biodiésel: el precio cambia por la diferencia de precio entre los dos (con 21% de IVA) y baja por los impuestos que el fósil paga y el biodiésel no. Con el corte en 15% en lugar de 7,5%, mes por mes: ${ult.map((m) => `${mesTxt(m)} ${txt(ef(m, 7.5, 15))}`).join(' · ')}. En los ${ms.length} meses con datos (${mesTxt(ms[0])} a ${mesTxt(u)}) el surtidor subía en ${suben} y bajaba en ${ms.length - suben}: de ${signo(min.pct, 1)} (${mesTxt(min.mes)}) a ${signo(max.pct, 1)} (${mesTxt(max.mes)}). El efecto es proporcional a los puntos de corte que se suman. En ${mesTxt(u)}: de 7,5% a 10%, ${txt(ef(u, 7.5, 10))}; de 10% a 15%, ${txt(ef(u, 10, 15))}.`,
        '/gas-oil/surtidor',
        fuente
      );
      const e = ef(u, 7.5, 15);
      sumar(
        'D-FISCO-CORTE',
        'Impuestos que se dejan de cobrar si sube el corte',
        `Lo que el Estado deja de cobrar cuando sube el corte es el impuesto de los litros de gas oil fósil que el biodiésel reemplaza. Con el corte en 15% en lugar de 7,5%, en ${mesTxt(u)}: ${pesos(Math.abs(e.porImpuestos), 1)} menos de impuestos por litro de gas oil vendido (7,5% de ${pesos(P.de(u).impuestos_gasoil, 2)}). Ese mismo monto es lo que baja el precio del surtidor por impuestos; por la diferencia de precio entre el biodiésel y el fósil, con IVA, el surtidor cambia ${e.porPrecio >= 0 ? '+' : '-'}${pesos(Math.abs(e.porPrecio), 1)}; el resultado es ${e.total >= 0 ? '+' : '-'}${pesos(Math.abs(e.total), 1)} por litro.`,
        '/gas-oil/surtidor',
        fuente
      );
    }
  }

  // ---- precios: bioetanol contra nafta, por litro y a igual energía
  const eBio = ctx.energia?.get('bioetanol');
  const eNafta = ctx.energia?.get('nafta');
  const parEtanol = P ? P.mesesCon(['bioetanol', 'nafta_fosil']) : [];
  if (parEtanol.length && eBio && eNafta) {
    const factor = eNafta.mj / eBio.mj;
    const litro = (m) => P.brecha(m, 'bioetanol', 'nafta_fosil');
    const energia = (m) => P.brecha(m, 'bioetanol', 'nafta_fosil', factor);
    const u = parEtanol[parEtanol.length - 1];
    const f = P.de(u);
    const menos = (1 - eBio.mj / eNafta.mj) * 100;
    sumar(
      'D-PRECIO-BIOETANOL-NAFTA',
      'Precios: bioetanol y nafta',
      `Precios por litro, sin impuestos, en ${mesTxt(u)} (último mes con datos): bioetanol, precio oficial para el corte obligatorio, ${pesos(f.bioetanol)} (promedio de caña, ${pesos(f.bioetanolCana)}, y maíz, ${pesos(f.bioetanolMaiz)}); nafta súper mayorista, ${pesos(f.naftaMezcla)}; nafta fósil en refinería (la súper mayorista, descontado el 12% de bioetanol que manda la ley), ${pesos(f.nafta_fosil)}. Litro contra litro, el bioetanol es ${masCaro(litro(u))} que la nafta fósil. Pero un litro de bioetanol tiene ${nf(menos)}% menos energía que uno de nafta: a igual energía, el bioetanol es ${masCaro(energia(u))}. Para costar lo mismo por unidad de energía, el litro de bioetanol tendría que valer ${pesos((f.nafta_fosil * eBio.mj) / eNafta.mj)}.`,
      '/gas-oil/ranking'
    );
    const ult = parEtanol.slice(-12);
    const todos = parEtanol.map(energia);
    const caros = todos.filter((x) => x > 0).length;
    sumar(
      'D-PRECIO-BIOETANOL-MESES',
      'Precios: bioetanol contra nafta fósil, mes por mes',
      `Cuánto más caro (+) o más barato (-) es el bioetanol que la nafta fósil en refinería, los dos sin impuestos, mes por mes: primero litro contra litro y después a igual energía. ${ult.map((m) => `${mesTxt(m)} ${signo(litro(m))} y ${signo(energia(m))}`).join(' · ')}. En los ${parEtanol.length} meses con datos (${mesTxt(parEtanol[0])} a ${mesTxt(u)}), a igual energía el bioetanol fue más caro que la nafta fósil en ${caros === parEtanol.length ? 'todos' : `${caros} y más barato en ${parEtanol.length - caros}`}.`,
      '/gas-oil/ranking'
    );
  }

  // ---- votación del Senado, provincia por provincia (mapa-recinto.js)
  if (recinto?.SENADORES?.length && recinto?.VOTACION?.favor) {
    const { SENADORES, VOTACION } = recinto;
    const prov = new Map();
    for (const sen of SENADORES) {
      const x = prov.get(sen.provincia) ?? { favor: 0, contra: 0, ausente: 0 };
      x[VOTACION.favor.includes(sen.id) ? 'favor' : VOTACION.contra.includes(sen.id) ? 'contra' : 'ausente'] += 1;
      prov.set(sen.provincia, x);
    }
    const filas = [...prov.entries()].map(([k, x]) => ({ k, ...x })).sort((a, b) => a.k.localeCompare(b.k, 'es'));
    const detalle = (xs) => lista(xs.map((x) => `${x.k} (${x.favor} a ${x.contra}${x.ausente ? `, ${x.ausente} ${x.ausente === 1 ? 'ausente' : 'ausentes'}` : ''})`));
    const enContra = filas.filter((x) => x.contra > x.favor);
    const empate = filas.filter((x) => x.contra === x.favor);
    const aFavor = filas.filter((x) => x.favor > x.contra);
    const divididas = aFavor.filter((x) => x.contra > 0);
    const tot = (k) => filas.reduce((s, x) => s + x[k], 0);
    sumar(
      'D-SENADO-VOTACION',
      'Votación en el Senado, por provincia',
      `Votación en general del proyecto de ley de biocombustibles en el Senado, ${VOTACION.fecha} (acta ${VOTACION.acta}): ${tot('favor')} a favor, ${tot('contra')} en contra y ${tot('ausente')} ausentes. De los ${filas.length} distritos (las 23 provincias y la Ciudad de Buenos Aires, cada uno con tres senadores; se anota a favor y en contra): en ${enContra.length} ganó el voto en contra: ${detalle(enContra)}. En ${empate.length} hubo empate: ${detalle(empate)}. En ${aFavor.length} ganó el voto a favor: ${detalle(aFavor)}; de esas, ${divididas.length} tuvieron algún voto en contra. No acompañaron el proyecto ${enContra.length + empate.length} de los ${filas.length}.`,
      '/mapa-recinto',
      `Fuente: Senado de la Nación, acta de votación ${VOTACION.acta} del ${VOTACION.fecha}.`
    );
  }

  // ---- votación de la Ley de Bases en Diputados, con su capítulo de biocombustibles (2/2/2024)
  if (leyBases?.resultado?.afirmativos) {
    const r = leyBases.resultado;
    const acta = (leyBases.fuente.match(/acta (\d+)/) ?? [])[1];
    sumar(
      'D-DIPUTADOS-LEY-BASES',
      'Votación de la Ley de Bases en Diputados (2/2/2024)',
      `Votación en general en la Cámara de Diputados, ${leyBases.fecha.replace(/\b0/g, '')}: ${leyBases.asunto.replace(/, votación en general$/, '')}. Resultado: ${r.afirmativos} a favor, ${r.negativos} en contra, ${r.abstenciones} abstenciones y ${r.ausentes} ausentes, sobre ${r.total} diputados. El texto votado traía un capítulo de biocombustibles: Título VI, Sección IV, artículos 281 a 289 del dictamen de mayoría (Orden del Día 1/2024, páginas 61 a 64). El expediente termina en "PE": el proyecto lo envió el Poder Ejecutivo.`,
      '/mapa-diputados',
      `Fuente: Cámara de Diputados de la Nación, acta de votación ${acta} del ${leyBases.fecha.replace(/\b0/g, '')}.`
    );
  }

  // ---- datos técnicos: contenido energético y reducción de emisiones (datos_tecnicos.json)
  if (tecnicos?.contenido_energetico?.length) {
    const de1 = (id) => tecnicos.contenido_energetico.find((c) => c.id === id);
    const par = (fosil, bio) => {
      const f = de1(fosil);
      const b = de1(bio);
      const menos = (1 - b.mj_l / f.mj_l) * 100;
      return `${min(f.nombre)} ${nf(f.mj_l)} MJ por litro; ${min(b.nombre)} ${nf(b.mj_l)} MJ por litro. Un litro de ${min(b.nombre)} tiene ${nf(menos)}% menos energía que un litro de ${min(f.nombre)}: para dar la misma energía hacen falta ${nf(f.mj_l / b.mj_l, 2)} litros. A igual energía, el ${min(b.nombre)} cuesta lo mismo que ${fosil === 'nafta' ? 'la nafta' : 'el gas oil'} solo si su precio por litro es ${nf(menos)}% menor`;
    };
    sumarTecnico(
      'T-ENERGIA-NAFTA-BIOETANOL',
      'Datos técnicos: contenido energético',
      `Contenido energético (valor calorífico inferior): ${par('nafta', 'bioetanol')}.`,
      'anexo III'
    );
    sumarTecnico(
      'T-ENERGIA-GASOIL-BIODIESEL',
      'Datos técnicos: contenido energético',
      `Contenido energético (valor calorífico inferior): ${par('gasoil', 'biodiesel')}.`,
      'anexo III'
    );
    sumarTecnico(
      'T-ENERGIA-POR-KILO',
      'Datos técnicos: contenido energético',
      `Contenido energético por kilo (valor calorífico inferior): ${tecnicos.contenido_energetico.map((c) => `${min(c.nombre)} ${nf(c.mj_kg)} MJ`).join('; ')}.`,
      'anexo III'
    );
    const red = (prefijo) =>
      tecnicos.reduccion_emisiones
        .filter((r) => r.id.startsWith(prefijo))
        .map((r) => `${min(r.nombre)} ${nf(r.tipico)}% y ${nf(r.defecto)}%`)
        .join('; ');
    const intro = 'Reducción de emisiones de gases de efecto invernadero frente al combustible fósil que reemplaza (valor típico y valor por defecto)';
    sumarTecnico('T-EMISIONES-BIODIESEL', 'Datos técnicos: reducción de emisiones', `${intro}: ${[red('biodiesel'), red('hvo')].join('; ')}.`, 'anexo V');
    sumarTecnico('T-EMISIONES-BIOETANOL', 'Datos técnicos: reducción de emisiones', `${intro}: ${red('bioetanol')}.`, 'anexo V');
    sumarTecnico(
      'T-EMISIONES-FOSIL',
      'Datos técnicos: reducción de emisiones',
      `Combustible fósil de referencia para medir la reducción de emisiones de los biocombustibles: ${nf(tecnicos.fosil_referencia_g_co2eq_mj)} gramos de CO2 equivalente por MJ.`,
      'anexo V'
    );
  }

  ctx.ficha = { lista: datos, porId: new Map(datos.map((d) => [d.id, d])) };
  return ctx;
}


