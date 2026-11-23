// Banco de prueba del motor del Polígrafo (sin IA).
//
//   node scripts/poligrafo_prueba.mjs            corre los controles
//   node scripts/poligrafo_prueba.mjs --ver      además imprime el veredicto completo del ejemplo
//
// Usa los mismos JSON que la página. Los valores esperados son los del sitio
// con datos a septiembre de 2026: si se regeneran los datos, los controles
// marcados "dato" pueden cambiar y hay que revisarlos, no forzarlos.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aplicarRespuestas, normalizarAnalisis } from '../src/lib/poligrafo/analisis.js';
import { EJEMPLOS } from '../src/lib/poligrafo/ejemplos.js';
import { armarContexto, DATOS_DEL_SITIO } from '../src/lib/poligrafo/contexto.js';
import { SENADORES, VOTACION } from '../src/data/mapa-recinto.js';
import { elegirTextos, textosQueFaltan } from '../src/lib/poligrafo/textos.js';
import { calcularTopes39 } from '../src/lib/topes39.js';
import { margenesBiodiesel } from '../src/lib/poligrafo/sitio.js';
import { armarConsigna, armarTextosOpcionales } from '../server/poligrafo/consigna.js';
import { evaluarEnunciado, evaluarForma, formaVisible, parsearSujeto, resolverPeriodo } from '../src/lib/poligrafo/motor.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = (n) => JSON.parse(readFileSync(path.join(raiz, 'src/data', `${n}.json`), 'utf8'));
const ctx = armarContexto({
  ...Object.fromEntries(Object.entries(DATOS_DEL_SITIO).map(([nombre, archivo]) => [nombre, leer(archivo)])),
  recinto: { SENADORES, VOTACION },
});

let fallas = 0;
function control(nombre, obtenido, esperado) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallas += 1;
  console.log(`${ok ? '  ok ' : 'FALLA'}  ${nombre}${ok ? '' : `\n         obtenido: ${JSON.stringify(obtenido)}\n         esperado: ${JSON.stringify(esperado)}`}`);
}

console.log(`Datos del sitio hasta ${ctx.ultimo} · ${ctx.empresas.length} empresas\n`);

// --- cuentas de otras páginas del sitio conectadas a la ficha (HDO, 22/11/2026: todo lo que está en explorarg.com
// sirve de prueba). Cada cifra se cotejó ese día con la página que la muestra. Datos a sep 2026: si se regeneran,
// hay que revisarlas contra la página, no forzarlas.
{
  const de = (id) => ctx.ficha.porId.get(id)?.texto ?? '';
  const tiene = (id, frases) => frases.map((x) => de(id).includes(x));
  control('ficha · cumplimiento por presidencia, como las tarjetas de /gestion/eficacia', tiene('D-GESTION-PRESIDENCIAS', ['Cristina Fernández de Kirchner (ene 2010 a nov 2015), 92,3% cumplido', 'Mauricio Macri (dic 2015 a nov 2019), 93,7% cumplido', 'Alberto Fernández (dic 2019 a nov 2023), 65,3% cumplido', 'déficit acumulado 1.242.721 t en 48 meses', 'Javier Milei (dic 2023 a sep 2026), 83,2% cumplido']), [true, true, true, true, true]);
  control('ficha · cumplimiento por secretario, como /gestion/secretarios', tiene('D-GESTION-SECRETARIOS', ['Darío Martínez (ago 2020 a ago 2022; presidencia de Alberto Fernández), corte real 3,7%, cumplimiento 53,8%, gas oil importado 15,5%', 'María Tettamanti (oct 2024 a sep 2026; presidencia de Javier Milei), corte real 6,2%, cumplimiento 82,9%, gas oil importado 5,2%', 'El mayor cumplimiento fue el de Javier Iguacel (96,8%) y el menor, el de Darío Martínez (53,8%)']), [true, true, true]);
  control('ficha · margen del biodiésel sobre el aceite, últimos 12 meses', tiene('D-MARGEN-BIO-12M', ['biodiésel para el corte US$ 1.292', 'aceite de soja FAS US$ 899', 'margen US$ 393 (30,4%', 'US$ 309, el 34,4% del precio del aceite']), [true, true, true, true]);
  control('ficha · ganancia de los mezcladores, como la tarjeta de /gas-oil/corte: U$ 1.405 M = 681 + 724, a ago 2026', tiene('D-MEZCLADORES-GANANCIA', ['de ene 2010 a ago 2026', 'ganancia acumulada de US$ 1.405 millones', 'US$ 681 millones por el biodiésel que faltó', 'US$ 724 millones por la reducción']), [true, true, true, true]);
  control('ficha · Res. 963, como /gas-oil/biodiesel-963: 28 de 36 meses por debajo y U$ 127,3 M menos', tiene('D-RES963-PUBLICADO-FORMULA', ['(36 meses)', 'por debajo de la fórmula en 28 meses', 'US$ 127,3 millones menos', 'publicado $ 2.032.310 por tonelada, fórmula $ 2.035.497']), [true, true, true, true]);
  control('ficha · gas oil por sector: lo que queda sin bunker ni usinas es el gas oil del corte', [de('D-GASOIL-SECTORES').includes('al público, 49,0%'), de('D-GASOIL-SECTORES').includes('suman el 4,7%'), de('D-GASOIL-SECTORES').includes('13,90 millones de m³')], [true, true, true]);
  control('ficha · retenciones y distancia al puerto', [de('D-RETENCIONES').includes('aceite 22,5%, biodiésel 22,5%; pagan lo mismo desde feb 2025'), de('D-DISTANCIA-PUERTO').includes('EXPLORA S.A., 4 km'), de('D-DISTANCIA-PUERTO').includes('BIOBAHIA S.A., 810 km'), de('D-DISTANCIA-PUERTO').includes('De las 29 plantas, 10 están a 50 km o menos')], [true, true, true, true]);
  // la página Márgenes muestra, para toda la serie: biodiésel 994, aceite 669, margen 325, crack 254 (39,3% del aceite)
  const m = margenesBiodiesel(leer('gasoil_ranking'));
  const x = m.promedio(m.primero, '2026-10');
  control('márgenes del biodiésel: los promedios de toda la serie son los de la página /margenes', [Math.round(x.bio), Math.round(x.aceite), Math.round(x.margen), Math.round(x.crack), Number(x.crackPct.toFixed(1))], [994, 669, 325, 254, 39.3]);
}

// --- lógica de tres valores
const val = (m) => (id) => m[id];
control('V y V = V', evaluarForma('A1 y A2', val({ A1: 'V', A2: 'V' })), 'V');
control('V y F = F', evaluarForma('A1 y A2', val({ A1: 'V', A2: 'F' })), 'F');
control('F y I = F', evaluarForma('A1 y A2', val({ A1: 'F', A2: 'I' })), 'F');
control('V y I = I', evaluarForma('A1 y A2', val({ A1: 'V', A2: 'I' })), 'I');
control('V o I = V', evaluarForma('A1 o A2', val({ A1: 'V', A2: 'I' })), 'V');
control('F o I = I', evaluarForma('A1 o A2', val({ A1: 'F', A2: 'I' })), 'I');
control('no F = V', evaluarForma('no A1', val({ A1: 'F' })), 'V');
control('precedencia: A1 o A2 y A3', evaluarForma('A1 o A2 y A3', val({ A1: 'V', A2: 'F', A3: 'F' })), 'V');
control('paréntesis: (A1 o A2) y A3', evaluarForma('(A1 o A2) y A3', val({ A1: 'V', A2: 'F', A3: 'F' })), 'F');
control('forma rota devuelve null', evaluarForma('A1 y y A2', val({ A1: 'V', A2: 'V' })), null);
control('id desconocido devuelve null', evaluarForma('A1 y A9', val({ A1: 'V' })), null);
control('forma visible', formaVisible('A1 y (A2 o no A3)'), 'A1 ∧ (A2 ∨ ¬A3)');

// --- períodos
const per = (c) => { const r = resolverPeriodo(c, ctx); return r.ok ? `${r.desde}..${r.hasta}` : `error`; };
control('ultimos_12_meses', per('ultimos_12_meses'), '2025-10..2026-09');
control('anio en curso se corta en el último mes', per('anio:2026'), '2026-01..2026-09');
control('anio futuro es error', per('anio:2027'), 'error');
control('rango', per('rango:2020-01:2024-12'), '2020-01..2024-12');
control('código inválido es error', per('el año pasado'), 'error');

// --- sujetos
const suj = (c) => { const r = parsearSujeto(c, ctx); return r.ok ? r.codigo : 'error'; };
control('alias de provincia', suj('provincia:Buenos Aires'), 'provincia:PROVINCIA DE BUENOS AIRES');
control('grupo por nombre parcial', suj('grupo:bojanich'), 'grupo:GRUPO BOJANICH');
control('empresa por nombre parcial', suj('empresa:Explora'), 'empresa:EXPLORA S.A.');
control('empresa inexistente es error', suj('empresa:Petrobras'), 'error');
control('filtro combinado', suj('categoria:no integradas+localidad:Nogoya'), 'categoria:NO INTEGRADA+localidad:NOGOYÁ');

// --- el ejemplo de HDO, con cada lectura
const ejemplo = EJEMPLOS[0];
const analisis = normalizarAnalisis(ejemplo.analisis, ctx);
control('ejemplo: 6 afirmaciones', analisis.afirmaciones.length, 6);
control('ejemplo: 3 preguntas', analisis.preguntas.map((q) => `${q.id}:${q.parametro}:${q.aplica_a.join(',')}`), ['P1:criterio:A2,A3,A5', 'P2:periodo:A2,A3,A5,A6', 'P3:base:A6']);
control('ejemplo: forma', analisis.forma, 'A2 y A3 y A4 y A5 y A6');

function correr(respuestas) {
  const r = evaluarEnunciado(aplicarRespuestas(analisis, respuestas), ctx);
  return { r, corto: Object.fromEntries(r.veredictos.map((v) => [v.id, v.estado === 'OPINION' ? 'O' : `${v.estado[0]}${v.dato ? ` ${v.dato}` : ''}`])) };
}

let x = correr({ P1: 'ventas_cupo', P2: 'ultimos_12_meses', P3: 'total' });
control('dato · ventas al cupo, 12 meses, sobre el total', x.corto, {
  A1: 'O', A2: 'F 24', A3: 'V Buenos Aires, Santa Fe, Entre Ríos, La Pampa, San Luis', A4: 'I', A5: 'V 1', A6: 'F 94,6%',
});
control('dato · veredicto general', x.r.estado, 'FALSO');
const verEjemplo = x.r;

x = correr({ P1: 'cupo_asignado', P2: 'anio:2025', P3: 'corte_obligatorio' });
control('dato · cupo asignado, 2025, sobre lo que manda la ley', { A2: x.corto.A2, A6: x.corto.A6 }, { A2: 'V 25', A6: 'F 73,9%' });

x = correr({ P1: 'con_planta', P2: 'ultimo_mes', P3: 'total' });
control('dato · con planta en operación (tablero de Capacidad, no el padrón del mapa)', x.corto.A2, 'F 23');

x = correr({});
control('sin responder: las afirmaciones con preguntas quedan indeterminadas', [x.corto.A2, x.corto.A6, x.r.estado], ['I', 'I', 'INDETERMINADO']);

// --- el control rechaza lo que la IA no puede pedir
const malo = normalizarAnalisis({
  afirmaciones: [
    { id: 'A1', cita: 'x', tipo: 'dato', indicador: 'precio_del_dolar', valor_numero: 1 },
    { id: 'A2', cita: 'y', tipo: 'dato', indicador: 'volumen', magnitud: 'produccion', sujeto: 'empresa:Petrobras', periodo: 'anio:2025', comparador: 'igual', valor_numero: 1 },
    { id: 'A3', cita: 'z', tipo: 'dato', indicador: 'volumen', magnitud: 'produccion', sujeto: 'total', periodo: 'anio:2031', comparador: 'igual', valor_numero: 1 },
    { id: 'A4', cita: 'w', tipo: 'dato', indicador: 'volumen', magnitud: 'produccion', sujeto: 'total', periodo: 'anio:2025', comparador: 'igual', valor_numero: null },
    { id: 'A5', cita: 'v', tipo: 'dato', indicador: 'volumen', magnitud: 'produccion', sujeto: 'total', periodo: 'anio:2025', comparador: 'igual', valor_numero: 968766 },
  ],
  preguntas: [{ parametro: 'periodo', aplica_a: ['A5'], pregunta: '¿?', opciones: ['DROP TABLE', 'anio:1900'] }],
  forma: 'A1 y (A2',
}, ctx);
control('control: indicador inventado, empresa inexistente, año futuro y sin número bajan a sin_datos', malo.afirmaciones.map((a) => a.tipo), ['sin_datos', 'sin_datos', 'sin_datos', 'sin_datos', 'dato']);
control('control: pregunta sobre un parámetro ya definido se descarta', malo.preguntas.length, 0);
control('control: forma rota se reemplaza por la conjunción', malo.forma, 'A1 y A2 y A3 y A4 y A5');
control('dato · producción total 2025 = 968.766 t', evaluarEnunciado(malo, ctx).veredictos[4].estado, 'VERDADERO');

// --- casos que salieron de las pruebas con IA del 22/11/2026
const af = (extra) => ({
  cita: 'x', tipo: 'dato', motivo: '', sujeto: '', criterio: 'ninguno', magnitud: 'ninguno', base: 'ninguno', medida: 'ninguno',
  periodo: '', periodo_inicial: '', comparador: 'igual', valor_numero: null, valor_lista: [], ...extra,
});
const variacion = normalizarAnalisis({
  afirmaciones: [af({ id: 'A1', indicador: 'variacion', sujeto: 'total', magnitud: 'produccion', periodo_inicial: 'anio:2017', comparador: 'menor', valor_numero: 0 })],
  preguntas: [{ parametro: 'periodo', aplica_a: ['A1'], pregunta: '¿Hasta cuándo?', opciones: ['ultimo_mes', 'ultimos_12_meses', 'anio:2026', 'anio:2025'] }],
  forma: 'A1',
}, ctx);
control('variación: el menú solo ofrece períodos que duran lo mismo que el inicial', variacion.preguntas[0].opciones.map((o) => o.valor), ['ultimos_12_meses', 'anio:2025']);
const desparejo = evaluarEnunciado({ afirmaciones: [{ ...variacion.afirmaciones[0], periodo: 'ultimo_mes' }], preguntas: [], forma: 'A1' }, ctx);
control('variación: un año contra un mes queda indeterminada', desparejo.veredictos[0].estado, 'INDETERMINADO');

const negacion = evaluarEnunciado(normalizarAnalisis({
  afirmaciones: [
    af({ id: 'A1', indicador: 'cantidad_empresas', sujeto: 'categoria:NO INTEGRADA+provincia:SANTA FE', criterio: 'con_planta', comparador: 'menor', valor_numero: 10 }),
    af({ id: 'A2', indicador: 'cantidad_empresas', sujeto: 'categoria:NO INTEGRADA+provincia:Buenos Aires', criterio: 'con_planta', comparador: 'menor', valor_numero: 10 }),
  ],
  preguntas: [],
  forma: 'no A1 y no A2',
}, ctx), ctx);
control('dato · negación: "ni Santa Fe ni Buenos Aires tienen menos de diez" (en operación hay 9 y 9)', [negacion.veredictos.map((v) => `${v.estado[0]} ${v.dicho} / ${v.dato}`), negacion.estado], [['V menos de 10 / 9', 'V menos de 10 / 9'], 'FALSO']);
control('negación: el resumen explica la fórmula', negacion.resumen.includes('Aplicada la fórmula ¬A1 ∧ ¬A2, el enunciado resulta falso.'), true);

const grupo = (periodo) => evaluarEnunciado(normalizarAnalisis({
  afirmaciones: [af({ id: 'A1', indicador: 'volumen', sujeto: 'grupo:Bojanich', magnitud: 'ventas_cupo', periodo, valor_numero: 0 })],
  preguntas: [],
  forma: 'A1',
}, ctx), ctx).veredictos[0];
control('grupo en un año viejo: indeterminado, y avisa cuánto daría con la composición de hoy', [grupo('anio:2011').estado, grupo('anio:2011').motivo.includes('794 t')], ['INDETERMINADO', true]);
control('grupo en el año pasado: se evalúa', grupo('anio:2025').estado, 'FALSO');

// --- textos legales: el juicio de la IA solo vale con una cita que figure textual
const norma = (extra) => evaluarEnunciado(normalizarAnalisis({
  afirmaciones: [af({ id: 'A1', tipo: 'norma', indicador: 'ninguno', comparador: 'ninguno', norma_juicio: 'contradice', norma_explicacion: 'x', citas: [], ...extra })],
  preguntas: [],
  forma: 'A1',
}, ctx), ctx).veredictos[0];
const citaBuena = { id: 'MS-18', texto: '«los mezcladores no podrán considerar su volumen a los efectos del cómputo de la mezcla del corte obligatorio de biodiesel»' };
control('norma: 44 artículos de la media sanción, 25 de la Ley 27.640 y los hitos del Marco Legal', ['MS', 'L27640', 'ML'].map((n) => [...ctx.normas.items.values()].filter((x) => x.norma === n).length), [44, 25, 22]);
control('norma: el acuerdo con la Unión Europea está cargado (decisión de 2019 y reglamento de 2025)', [
  norma({ citas: [{ id: 'UE835-C2', texto: 'consistentes en un contingente anual libre de derechos para el biodiésel a un precio mínimo' }] }).estado,
  norma({ citas: [{ id: 'UE245-1', texto: 'Se aceptan los compromisos ofrecidos por los productores exportadores enumerados a continuación junto con la Cámara Argentina de Biocombustibles' }] }).citas[0].norma,
], ['FALSO', 'Decisión (UE) 2019/245 - acuerdo con la Unión Europea']);
control('norma: contradice con cita textual da Falso', [norma({ citas: [citaBuena] }).estado, norma({ citas: [citaBuena] }).citas[0].rotulo], ['FALSO', 'Artículo 18']);
control('norma: respalda con cita textual da Verdadero', norma({ norma_juicio: 'respalda', citas: [citaBuena] }).estado, 'VERDADERO');
control('norma: una cita inventada se descarta y queda Indeterminado', [norma({ citas: [{ id: 'MS-18', texto: 'los mezcladores podrán computar su volumen para el corte obligatorio' }] }).estado, norma({ citas: [{ id: 'MS-18', texto: 'los mezcladores podrán computar su volumen para el corte obligatorio' }] }).citas.length], ['INDETERMINADO', 0]);
control('norma: una cita real atribuida a otro artículo se descarta', norma({ citas: [{ ...citaBuena, id: 'MS-38' }] }).estado, 'INDETERMINADO');
control('norma: "no alcanza" da Indeterminado aunque traiga cita', norma({ norma_juicio: 'no_alcanza', citas: [citaBuena] }).estado, 'INDETERMINADO');
control('norma: cita con puntos suspensivos en el medio, si los dos tramos figuran en orden', norma({ citas: [{ id: 'MS-39', texto: 'no excederá el diez por ciento (10%) (...) con un tope máximo de cincuenta mil (50.000) toneladas' }] }).estado, 'FALSO');

// --- segunda lectura: verdad a medias (paso intermedio) y doble vara (sello)
const citaAlcance = { id: 'MS-39', texto: 'A los efectos de la definición de volúmenes a ser comercializados en el segmento de Empresas No Integradas, se considerarán las siguientes pautas' };
const citaTope = { id: 'MS-39', texto: 'la participación por empresa elaboradora no excederá el diez por ciento (10%)' };
const dobleVara = { revision_tipo: 'doble_vara', revision_vale_para: 'las no integradas', revision_no_vale_para: 'las integradas', revision_citas: [citaAlcance], revision_explicacion: 'x' };
control('doble vara: literal cierto + trato distinto citado da Doble vara', norma({ norma_juicio: 'respalda', citas: [citaTope], ...dobleVara }).estado, 'DOBLE_VARA');
control('doble vara: si lo literal es falso, manda lo literal', norma({ norma_juicio: 'contradice', citas: [citaTope], ...dobleVara }).estado, 'FALSO');
control('doble vara: sin cita comprobada de lo omitido, queda el veredicto literal', norma({ norma_juicio: 'respalda', citas: [citaTope], ...dobleVara, revision_citas: [{ id: 'MS-39', texto: 'las integradas no tienen ningún tope de participación' }] }).estado, 'VERDADERO');
const medias = (resultado) => norma({ norma_juicio: 'respalda', citas: [citaTope], revision_tipo: 'verdad_a_medias', revision_omite: 'x', revision_resultado: resultado, revision_citas: [citaAlcance], revision_explicacion: 'x' });
control('verdad a medias: el sello sale de evaluar con lo omitido incorporado', ['no_se_sostiene', 'se_sostiene', 'no_alcanza'].map((r) => medias(r).estado), ['FALSO', 'VERDADERO', 'INDETERMINADO']);
control('verdad a medias: queda registrado que al pie de la letra era cierto', [medias('no_se_sostiene').literal, medias('no_se_sostiene').revision.tipo], ['VERDADERO', 'verdad_a_medias']);
control('ficha: 47 datos del sitio, con los que usa la serie', [ctx.ficha.lista.filter((d) => d.id.startsWith('D-')).length, ctx.ficha.porId.get('D-COMPRAS-PETROLERAS').texto.includes('59,9%'), ctx.ficha.porId.get('D-CORTE-ANIOS-CUMPLIDOS').texto.includes('en 3: 2012, 2013 y 2017'), ctx.ficha.porId.get('D-CAP-CATEGORIAS').texto.includes('integradas 2.620.000 t por año en 6 plantas')], [47, true, true, true]);
control('ficha: el precio del aceite por distancia, en promedio (nota de la Secretaría de Energía del 14/10/2026)', ['de 201 a 600 km, 96,2', 'más de 600 km, 97,6', '1,3 puntos de diferencia', 'en promedio, 4,0 puntos'].map((x) => ctx.ficha.porId.get('D-ACEITE-DISTANCIA-PROMEDIO').texto.includes(x)), [true, true, true, true]);
// La cuenta de los artículos 38 y 39 de la media sanción (HDO, 22/11/2026: la frase "con la media sanción las no
// integradas no pueden abastecer el 7,5%" había dado Indeterminado porque esta cuenta no estaba en la ficha).
// Son las cifras de la serie «Del dicho al dato» (planilla «Art. 39» rev. 1): si cambian, hay que revisar, no forzar.
{
  const de = (id) => ctx.ficha.porId.get(id)?.texto ?? '';
  control('ficha · media sanción, primer año: manda 919.294 t, los topes permiten 730.988 t, faltan 188.306 t, corte posible 5,96%', ['son 919.294 t', 'entre todas 730.988 t', 'Faltan 188.306 t, el 20,5%', 'no pueden abastecer el 7,5%', 'el 5,96% del gas oil', 'suma 1.327.200 t'].map((x) => de('D-TOPES-MS-PRIMER-ANIO').includes(x)), [true, true, true, true, true, true]);
  control('ficha · media sanción, período por período: falta hasta 2029 y sobra desde 2030', ['faltan 188.306 t', 'faltan 102.505 t', 'faltan 16.704 t', 'sobran 23.082 t', 'sobran 90.800 t'].map((x) => de('D-TOPES-MS-PERIODOS').includes(x)), [true, true, true, true, true]);
  control('ficha · el máximo de 50.000 t les saca 41.929 t a cada una de las tres, y sin él faltarían 62.518 t', ['41.929 t a cada una de Unitec Bio, Explora y Diaser', '125.788 t entre las tres', 'faltan 62.518 t'].map((x) => de('D-TOPES-MS-MAXIMO').includes(x)), [true, true, true]);
  control('ficha · cuánto de su planta puede usar cada una: Unitec Bio 21%, Explora 42%, Diaser 52%', ['Unitec Bio, 50.000 t de 240.000 t (21%)', 'Explora, 50.000 t de 120.000 t (42%)', 'Diaser, 50.000 t de 96.000 t (52%)'].map((x) => de('D-TOPES-MS-USO-PLANTA').includes(x)), [true, true, true]);
  // la misma cuenta que usa el control de la serie: una sola para todo el sitio
  const art39 = leer('dicho_dato_art39');
  const r = calcularTopes39(art39, { periodoId: 'anio1', maximo: art39.media_sancion.maximo, pct: art39.media_sancion.pct });
  control('la cuenta de topes es la del control de la serie (topes39.js)', [Math.round(r.periodo.segmento), Math.round(r.permitido), Math.round(r.saldo), Number(r.cortePosible.toFixed(2)), r.filas.length], [919294, 730988, -188306, 5.96, 14]);
  control('la consigna le avisa al traductor que esa cuenta está en la ficha', armarConsigna(ctx).includes('D-TOPES-MS'), true);
  // la frase de HDO, con la forma lógica guardada: tiene que dar Verdadero, probada con la ficha y con citas textuales
  const ej = EJEMPLOS.find((e) => e.id === 'topes-media-sancion');
  const res = evaluarEnunciado(normalizarAnalisis(ej.analisis, ctx), ctx);
  const v = res.veredictos[0];
  control('la frase de HDO sobre la media sanción y el 7,5% da Verdadero, con datos de la ficha y citas comprobadas', [res.estado, v.datos.map((x) => x.id).includes('D-TOPES-MS-PRIMER-ANIO'), v.citas.length > 0, v.citas.every((c) => c.norma.includes('Media sanción'))], ['VERDADERO', true, true, true]);
}
const conDato = norma({ norma_juicio: 'respalda', citas: [citaTope], revision_tipo: 'verdad_a_medias', revision_omite: 'x', revision_resultado: 'no_se_sostiene', revision_citas: [], revision_datos: ['D-CUPO-MAYOR-EMPRESA', 'D-NO-EXISTE'], revision_explicacion: 'x' });
control('segunda lectura: lo omitido se puede probar con un dato de la ficha, sin cita', [conDato.estado, conDato.revision.datos.map((d) => d.id)], ['FALSO', ['D-CUPO-MAYOR-EMPRESA']]);
control('segunda lectura: un dato que no existe en la ficha no prueba nada', norma({ norma_juicio: 'respalda', citas: [citaTope], revision_tipo: 'doble_vara', revision_vale_para: 'a', revision_no_vale_para: 'b', revision_citas: [], revision_datos: ['D-INVENTADO'], revision_explicacion: 'x' }).estado, 'VERDADERO');
const datoConDobleVara = (sujeto) => evaluarEnunciado(normalizarAnalisis({
  afirmaciones: [af({ id: 'A1', indicador: 'volumen', sujeto, magnitud: 'exportacion', periodo: 'anio:2025', comparador: 'mayor', valor_numero: 0, revision_tipo: 'doble_vara', revision_vale_para: 'las integradas', revision_no_vale_para: 'las no integradas', revision_citas: [], revision_datos: ['D-EXPO-NI-HISTORICO'], revision_explicacion: 'x' })],
  preguntas: [],
  forma: 'A1',
}, ctx), ctx).veredictos[0].estado;
control('doble vara en datos: vale para una frase general, no para una que ya habla de un solo grupo', [datoConDobleVara('total'), datoConDobleVara('categoria:INTEGRADA')], ['DOBLE_VARA', 'VERDADERO']);
// --- opiniones: no se evalúan, salvo que choquen con los textos o los datos
const opinion = (extra) => evaluarEnunciado(normalizarAnalisis({
  afirmaciones: [af({ id: 'A1', tipo: 'opinion', indicador: 'ninguno', comparador: 'ninguno', motivo: 'x', opinion_choca: 'no', opinion_hecho: '', citas: [], datos: [], ...extra })],
  preguntas: [],
  forma: '',
}, ctx), ctx);
const choque = { opinion_choca: 'si', opinion_hecho: 'que con el proyecto nadie pierde', norma_explicacion: 'x' };
control('opinión sin choque: no se evalúa', [opinion({}).estado, opinion({}).veredictos[0].estado], ['OPINION', 'OPINION']);
control('opinión que choca con un texto legal: Falso, y entra en la fórmula', [opinion({ ...choque, citas: [citaTope] }).estado, opinion({ ...choque, citas: [citaTope] }).forma, opinion({ ...choque, citas: [citaTope] }).veredictos[0].origen], ['FALSO', 'A1', 'opinion']);
control('opinión que choca con un dato de la ficha: Falso', opinion({ ...choque, datos: ['D-CAP-NI-MAS-50000'] }).estado, 'FALSO');
control('opinión que dice chocar pero no trae prueba comprobable: no se evalúa', opinion({ ...choque, citas: [{ id: 'MS-39', texto: 'todas las empresas pierden con esta ley sin excepción' }], datos: ['D-INVENTADO'] }).estado, 'OPINION');
// --- nombres públicos de los grupos económicos
const conGrupo = normalizarAnalisis({
  afirmaciones: [af({ id: 'A1', cita: 'Bojanich vende más que nadie', tipo: 'sin_datos', motivo: 'El GRUPO BOJANICH y el Grupo Pucciariello superan el tope; GRUPO BOLZAN no.' })],
  preguntas: [],
  forma: 'A1',
}, ctx).afirmaciones[0];
control('grupos: lo que redacta la IA sale con el nombre público, y la cita del enunciado no se toca', [conGrupo.motivo, conGrupo.cita], ['El Grupo Bahía Energía y el Grupo Rosario Bio superan el tope; Grupo Bolzan no.', 'Bojanich vende más que nadie']);
const conCodigos = normalizarAnalisis({
  afirmaciones: [af({ id: 'A1', tipo: 'sin_datos', motivo: 'Un litro de bioetanol tiene 34% menos energía (T-ENERGIA-NAFTA-BIOETANOL), según el artículo 38 (MS-38).' })],
  preguntas: [],
  forma: 'A1',
}, ctx).afirmaciones[0].motivo;
control('redacción: los códigos internos de las piezas no llegan al público', conCodigos, 'Un litro de bioetanol tiene 34% menos energía, según el artículo 38.');
control('grupos: el sujeto y la ficha muestran el nombre público', [parsearSujeto('grupo:Bojanich', ctx).etiqueta, parsearSujeto('grupo:Bojanich', ctx).codigo, ctx.ficha.porId.get('D-CUPO-MAYOR-GRUPO').texto.includes('fue el Grupo Bahía Energía, con 8 empresas')], ['empresas del Grupo Bahía Energía', 'grupo:GRUPO BOJANICH', true]);
// --- datos técnicos (Directiva (UE) 2018/2001): prueban afirmaciones técnicas
const tec = (id) => ctx.ficha.porId.get(id);
control('técnicos: 6 datos, leídos del anexo oficial', [ctx.ficha.lista.filter((d) => d.id.startsWith('T-')).length, tec('T-ENERGIA-NAFTA-BIOETANOL').texto.includes('nafta 32 MJ por litro; bioetanol 21 MJ por litro. Un litro de bioetanol tiene 34% menos energía'), tec('T-ENERGIA-GASOIL-BIODIESEL').texto.includes('gas oil 36 MJ por litro; biodiésel 33 MJ por litro. Un litro de biodiésel tiene 8% menos energía'), tec('T-EMISIONES-BIODIESEL').texto.includes('biodiésel de soja 55% y 50%; biodiésel de aceite de cocina usado 88% y 84%'), tec('T-EMISIONES-BIOETANOL').texto.includes('bioetanol de caña de azúcar 70% y 70%'), tec('T-EMISIONES-FOSIL').fuente.includes('Directiva (UE) 2018/2001')], [6, true, true, true, true, true]);
const tecnica = norma({ norma_juicio: 'contradice', citas: [], datos: ['T-ENERGIA-NAFTA-BIOETANOL'] });
control('técnicos: una afirmación técnica se prueba con un dato de la ficha, sin cita', [tecnica.estado, tecnica.datos[0].id, tecnica.normas], ['FALSO', 'T-ENERGIA-NAFTA-BIOETANOL', ['datos técnicos: contenido energético']]);
control('técnicos: sin cita ni dato válido no hay veredicto', norma({ norma_juicio: 'contradice', citas: [], datos: ['T-NO-EXISTE'] }).estado, 'INDETERMINADO');
const k4 = (m, f) => evaluarForma(f, (id) => m[id]);
control('fórmula con doble vara: F manda sobre D, D sobre I, y con todo V queda D', [k4({ A1: 'D', A2: 'F' }, 'A1 y A2'), k4({ A1: 'D', A2: 'I' }, 'A1 y A2'), k4({ A1: 'D', A2: 'V' }, 'A1 y A2'), k4({ A1: 'D', A2: 'V' }, 'A1 o A2'), k4({ A1: 'D' }, 'no A1')], ['F', 'D', 'D', 'V', 'D']);

// --- precios (22/11/2026): las cifras tienen que ser las que publica «Del dicho al dato»
// (episodios 16, 17, 18 y 20): si no coinciden, cambió un dato o una fórmula y hay que mirarlo.
const P = ctx.precios;
const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
control('precios · feb 2026: biodiésel $ 1.631, fósil $ 1.084, importado $ 842 (episodio 16)', [r0(P.de('2026-02').biodiesel), r0(P.de('2026-02').gasoil_fosil), r0(P.de('2026-02').gasoil_importado)], [1631, 1084, 842]);
control('precios · may 2026: fósil $ 1.587 contra biodiésel $ 1.600 (episodio 16)', [r0(P.de('2026-05').gasoil_fosil), r0(P.de('2026-05').biodiesel)], [1587, 1600]);
control('precios · biodiésel sobre fósil local: 50% en feb 2026 y 1% en may 2026', [r0(P.brecha('2026-02', 'biodiesel', 'gasoil_fosil')), r0(P.brecha('2026-05', 'biodiesel', 'gasoil_fosil'))], [50, 1]);
const ef = (m, a, b) => { const e = P.efectoCorte(m, a, b); return [r1(e.pct), r0(e.total)]; };
control('surtidor · corte de 7,5% a 15%: +1,6% ($ 29) en feb 2026 y -0,9% ($ 21) en may 2026 (episodio 17)', [ef('2026-02', 7.5, 15), ef('2026-05', 7.5, 15)], [[1.6, 29], [-0.9, -21]]);
control('surtidor · corte de 10% a 15% en feb 2026: 1,1% y $ 19,6 (el episodio 20 publicó $ 19)', ef('2026-02', 10, 15), [1.1, 20]);
control('fisco · may 2026, 7,5 puntos más de corte: $ 22 menos de impuestos por litro (episodio 18)', r0(P.efectoCorte('2026-05', 7.5, 15).porImpuestos), -22);

const unDato = (extra) => evaluarEnunciado(normalizarAnalisis({ afirmaciones: [af({ id: 'A1', ...extra })], preguntas: [], forma: 'A1' }, ctx), ctx).veredictos[0];
const ochenta = (base, mes) => unDato({ indicador: 'brecha_precio', producto: 'biodiesel', producto_base: base, periodo: `mes:${mes}`, comparador: 'igual', valor_numero: 80 });
let v = ochenta('gasoil_fosil', '2026-02');
control('precios · "80% por arriba del fósil" contra el fósil local, feb 2026: Falso, era 50,4%', [v.estado, v.dato, v.diferencia], ['FALSO', '50,4%', '-29,6 puntos']);
control('precios · la misma frase contra el importado, feb 2026: Falso, era 93,8%', [ochenta('gasoil_importado', '2026-02').estado, ochenta('gasoil_importado', '2026-02').dato], ['FALSO', '93,8%']);
v = ochenta('gasoil_importado', '2026-01');
control('precios · contra el importado, ene 2026: 82,3%, dentro del margen de 2% sobre el precio (76,4% a 83,6%)', [v.estado, v.dato, v.margen], ['VERDADERO', '82,3%', 'Margen de 2% sobre el precio: vale si la diferencia está entre 76,4% y 83,6%.']);
const igualQue = (mes) => unDato({ indicador: 'brecha_precio', producto: 'biodiesel', producto_base: 'gasoil_fosil', periodo: `mes:${mes}`, comparador: 'aprox', valor_numero: 0 });
control('precios · "cuestan lo mismo": cierto en may 2026 (0,9%) y falso en feb 2026 (50,4%)', [igualQue('2026-05').estado, igualQue('2026-02').estado], ['VERDADERO', 'FALSO']);
v = unDato({ indicador: 'brecha_precio', producto: 'biodiesel', producto_base: 'gasoil_fosil', periodo: 'anio:2015', comparador: 'mayor', valor_numero: 0 });
control('precios · "el biodiésel es más caro que el gas oil" en 2015: Falso, fue 21% más barato', [v.estado, v.dato], ['FALSO', '-21,1%']);
v = unDato({ indicador: 'precio', producto: 'biodiesel', periodo: 'mes:2026-02', comparador: 'aprox', valor_numero: 1600 });
control('precios · precio del biodiésel en feb 2026, alrededor de $ 1.600: Verdadero', [v.estado, v.dato], ['VERDADERO', '$ 1.631 por litro']);
control('precios · un promedio de más de 12 meses en pesos corrientes no se da', unDato({ indicador: 'precio', producto: 'biodiesel', periodo: 'rango:2020-01:2024-12', comparador: 'igual', valor_numero: 500 }).estado, 'INDETERMINADO');
control('precios · impuestos contra un precio no se comparan', unDato({ indicador: 'brecha_precio', producto: 'biodiesel', producto_base: 'impuestos_gasoil', periodo: 'mes:2026-02', comparador: 'igual', valor_numero: 1 }).estado, 'INDETERMINADO');
const sinBase = normalizarAnalisis({ afirmaciones: [af({ id: 'A1', indicador: 'brecha_precio', producto: 'biodiesel', producto_base: 'ninguno', periodo: '', comparador: 'igual', valor_numero: 80 })], preguntas: [], forma: 'A1' }, ctx);
control('precios · sin decir contra qué gas oil ni en qué mes: dos preguntas de menú', sinBase.preguntas.map((q) => `${q.parametro}:${q.opciones.map((o) => o.valor).join('|')}`), ['producto_base:gasoil_fosil|gasoil_importado|gasoil_surtidor', 'periodo:ultimo_mes|ultimos_12_meses|anio:2026|anio:2025']);

// --- bioetanol y nafta (22/11/2026): el bioetanol sale del reporte de la Secretaría de Energía
// y la nafta del relevamiento Res. 1104 (el mismo hyper del gas oil)
const jul = P.de('2026-07');
control('bioetanol · jul 2026: caña $ 1.043,615 y maíz $ 956,505 (reporte oficial), promedio $ 1.000', [jul.bioetanolCana, jul.bioetanolMaiz, r0(jul.bioetanol)], [1043.615, 956.505, 1000]);
control('bioetanol · un mes con dos precios se pondera por días (caña, ago 2022: 20 días a 80,561 y 11 a 88,240)', P.de('2022-08').bioetanolCana, 83.286);
control('nafta · jul 2026: súper mayorista $ 1.309, fósil en refinería $ 1.351, surtidor $ 2.096', [r0(jul.naftaMezcla), r0(jul.nafta_fosil), r0(jul.nafta_surtidor)], [1309, 1351, 2096]);
control('nafta · mar 2026 sin la celda mal cargada del relevamiento ($ 467.856 el litro)', P.de('2026-03').naftaMezcla, 1110.72);
const etanol = (equivalencia, comparador, extra = {}) => unDato({ indicador: 'brecha_precio', producto: 'bioetanol', producto_base: 'nafta_fosil', equivalencia, periodo: 'mes:2026-07', comparador, valor_numero: 0, ...extra });
control('bioetanol · jul 2026: por litro 26% más barato que la nafta; a igual energía 12,8% más caro', [etanol('por_litro', 'igual').dato, etanol('por_energia', 'igual').dato], ['-26,0%', '12,8%']);
control('bioetanol · "cuesta lo mismo que la nafta": Falso por litro y Falso a igual energía', [etanol('por_litro', 'aprox').estado, etanol('por_energia', 'aprox').estado], ['FALSO', 'FALSO']);
control('bioetanol · "es más barato que la nafta": Verdadero por litro, Falso a igual energía', [etanol('por_litro', 'menor').estado, etanol('por_energia', 'menor').estado], ['VERDADERO', 'FALSO']);
const sinEquivalencia = normalizarAnalisis({ afirmaciones: [af({ id: 'A1', indicador: 'brecha_precio', producto: 'biodiesel', producto_base: 'gasoil_fosil', periodo: 'mes:2026-02', comparador: 'igual', valor_numero: 80 })], preguntas: [], forma: 'A1' }, ctx);
control('precios · si nadie pregunta cómo se compara, es litro contra litro', [sinEquivalencia.afirmaciones[0].equivalencia, sinEquivalencia.preguntas.length], ['por_litro', 0]);
const etanolAbierto = normalizarAnalisis({ afirmaciones: [af({ id: 'A1', indicador: 'brecha_precio', producto: 'bioetanol', producto_base: 'ninguno', equivalencia: 'ninguno', periodo: 'mes:2026-07', comparador: 'aprox', valor_numero: 0 })], preguntas: [{ parametro: 'equivalencia', aplica_a: ['A1'], pregunta: '¿Por litro o a igual energía?', opciones: ['por_litro', 'por_energia'] }], forma: 'A1' }, ctx);
control('bioetanol · la pregunta de por litro o por energía llega al menú, y contra qué se compara ofrece la nafta', etanolAbierto.preguntas.map((q) => `${q.parametro}:${q.opciones.map((o) => o.valor).join('|')}`), ['equivalencia:por_litro|por_energia', 'producto_base:nafta_fosil|nafta_surtidor']);

// --- Ley de Bases de 2024 (HDO, 22/11/2026: es el proyecto original del Poder Ejecutivo y está en el sitio)
const piezasLB = [...ctx.normas.items.values()].filter((x) => x.norma === 'LB');
control('ley de bases · 9 artículos del dictamen (281 a 289) y 6 reseñas del Mapa de Diputados', [piezasLB.length, piezasLB[0].id, piezasLB[8].id, [...ctx.normas.items.values()].filter((x) => x.norma === 'LBR').length], [9, 'LB-281', 'LB-289', 6]);
const licitaciones = norma({ norma_juicio: 'respalda', citas: [{ id: 'LB-288', texto: 'será realizada periódicamente mediante un sistema único de licitaciones transparentes, de acceso público' }, { id: 'LB-288', texto: 'deberá dar inicio a las licitaciones en un plazo máximo de 30 días corridos' }] });
control('ley de bases · una cita textual del artículo 288 se comprueba y lleva al PDF oficial de Diputados', [licitaciones.estado, licitaciones.citas.length, licitaciones.citas[0].norma, licitaciones.citas[0].resena, licitaciones.citas[0].url], ['VERDADERO', 2, 'Ley de Bases 2024, dictamen de Diputados', false, 'https://www4.hcdn.gob.ar/dependencias/dcomisiones/periodo-141/141-1.pdf']);
control('ley de bases · una cita que no figura en el artículo no vale', norma({ norma_juicio: 'respalda', citas: [{ id: 'LB-288', texto: 'la adjudicación a cada grupo económico no podrá exceder el catorce por ciento' }] }).estado, 'INDETERMINADO');
control('ley de bases · la votación del 2/2/2024 está en la ficha: 144 a 109', ctx.ficha.porId.get('D-DIPUTADOS-LEY-BASES').texto.includes('144 a favor, 109 en contra'), true);

// --- proyecto S-809/26, texto original del Senado (HDO, 22/11/2026: se carga, pero lo que se diga
// del proyecto se sigue midiendo contra la media sanción)
const piezasS809 = [...ctx.normas.items.values()].filter((x) => x.norma === 'S809');
control('s809 · 44 artículos del texto original; la transición terminaba el 31/12/2030 (en la media sanción, el 1/1/2036)', [piezasS809.length, ctx.normas.items.get('S809-35').texto.includes('hasta el 31 de diciembre de 2030'), ctx.normas.items.get('MS-35').texto.includes('hasta el 1° de enero de 2036')], [44, true, true]);
control('s809 · la tabla del artículo 38 (imagen en el PDF) quedó transcripta: no integradas 7,5 / 5 / 4 / 3', ctx.normas.items.get('S809-38').texto.includes('Empresas No Integradas (Corte por Sistema de comercialización - Art. 14) | 7,5% | 5,0% | 4,0% | 3,0%'), true);
const cambioTope = norma({ norma_juicio: 'respalda', citas: [{ id: 'S809-39', texto: 'no excederá el CATORCE POR CIENTO (14%) del total de la cantidad de biodiesel comercializada por año calendario en el segmento de Empresas No Integradas' }, { id: 'MS-39', texto: 'la participación por empresa elaboradora no excederá el diez por ciento (10%)' }] });
control('s809 · una frase sobre qué cambió se prueba con el original y con la media sanción', [cambioTope.estado, cambioTope.citas.map((c) => c.norma)], ['VERDADERO', ['Proyecto S-809/26, texto original', 'Media sanción del Senado (CD-76/26)']]);

// --- recorte de textos (HDO, 22/11/2026): el núcleo va siempre y los demás, solo si la frase los nombra
control('textos · una frase de datos o de la ley no suma textos a pedido', [elegirTextos('Hoy tenemos 25 elaboradoras no integradas que abastecen el 65% del corte'), elegirTextos('Estamos poniendo límites para evitar que el segmento termine concentrándose')], [[], []]);
control('textos · Europa, Ley de Bases y el proyecto original suman el suyo', [elegirTextos('Los países europeos nos han cerrado el mercado'), elegirTextos('El proyecto original del Poder Ejecutivo iba a libre mercado'), elegirTextos('Se hicieron muchísimos ajustes a ese proyecto de ley')], [['UE'], ['LB', 'S809'], ['S809']]);
control('textos · "los ingresos del Estado" no trae el proyecto que ingresó, y el contexto solo cuenta si nombra el texto', [elegirTextos('Cualquier aumento de corte tiene un impacto negativo en los ingresos del Estado nacional'), elegirTextos('Es un gran equilibrio', 'Lic. González, por el Poder Ejecutivo nacional'), elegirTextos('Eso no es así', 'Habla del acuerdo con la Unión Europea')], [[], [], ['UE']]);
const fija = armarConsigna(ctx);
const conUE = armarTextosOpcionales(ctx, ['UE']);
const sinNada = armarTextosOpcionales(ctx, []);
control('textos · la parte fija trae el núcleo y ninguno de los que van a pedido', [fija.includes('<pieza id="MS-38"'), fija.includes('<pieza id="L27640-8"'), fija.includes('<pieza id="S809-35"'), fija.includes('<pieza id="LB-288"'), fija.includes('<pieza id="UE245-1"')], [true, true, false, false, false]);
control('textos · lo que se pide se carga, y lo que no, queda avisado para que el modelo lo pueda pedir', [conUE.includes('<pieza id="UE245-1"'), conUE.includes('<pieza id="S809-35"'), sinNada.includes('En esta consulta no se cargó ninguno'), sinNada.includes('poné su clave (UE, LB, S809) en "textos_necesarios"')], [true, false, true, true]);
control('textos · solo se repite la consulta por un texto válido que no estaba cargado', [textosQueFaltan(['UE', 'UE', 'INVENTADO'], []), textosQueFaltan(['UE'], ['UE']), textosQueFaltan(undefined, [])], [['UE'], [], []]);
control('textos · el recorte achica la consigna en casi un tercio', Math.round((1 - (fija.length + sinNada.length) / (fija.length + armarTextosOpcionales(ctx, ['UE', 'LB', 'S809']).length)) * 100) >= 28, true);

// --- uso de la capacidad instalada (episodio 28: 81% en 2011)
const uso = (sujeto, periodo, valor) => unDato({ indicador: 'utilizacion_capacidad', sujeto, periodo, comparador: 'aprox', valor_numero: valor });
control('capacidad · las integradas usaron el 81% en 2011 y el 14% en los últimos 12 meses', [uso('categoria:INTEGRADA', 'anio:2011', 81).dato, uso('categoria:INTEGRADA', 'ultimos_12_meses', 15).dato, uso('categoria:INTEGRADA', 'ultimos_12_meses', 15).estado], ['81,1%', '14,4%', 'VERDADERO']);

// --- votación del Senado por provincia (episodio 26: siete en contra y dos empates)
const voto = ctx.ficha.porId.get('D-SENADO-VOTACION');
control('senado · 41 a 25, siete distritos en contra, dos empates, nueve no acompañaron', ['41 a favor, 25 en contra y 6 ausentes', 'en 7 ganó el voto en contra', 'En 2 hubo empate', 'No acompañaron el proyecto 9 de los 24'].map((t) => voto.texto.includes(t)), [true, true, true, true]);
const delSenado = norma({ norma_juicio: 'contradice', citas: [], datos: ['D-SENADO-VOTACION'] });
control('ficha · un hecho que no entra en un indicador se prueba con un dato del sitio', [delSenado.estado, delSenado.datos[0].fuente], ['FALSO', 'Fuente: Senado de la Nación, acta de votación 15 del 17/9/2026.']);

if (process.argv.includes('--ver')) {
  console.log(`\n${ejemplo.enunciado}\n\nForma: ${formaVisible(verEjemplo.forma)}  ->  ${verEjemplo.estado}\n${verEjemplo.resumen}\n`);
  for (const v of verEjemplo.veredictos) {
    console.log(`${v.id}  ${v.estado}\n    «${v.cita}»`);
    if (v.lectura) console.log(`    Se mide: ${v.lectura}`);
    if (v.dato) console.log(`    Dijo ${v.dicho} · dato ${v.dato}${v.diferencia ? ` · diferencia ${v.diferencia}` : ''}\n    ${v.margen}`);
    if (v.motivo) console.log(`    ${v.motivo}`);
    console.log('');
  }
}

console.log(fallas ? `\n${fallas} control(es) con falla` : '\nTodos los controles pasaron');
process.exit(fallas ? 1 : 0);
