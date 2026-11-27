// Banco de prueba del modelo de crushing integrado (src/lib/crushing.js).
//
//   node scripts/crushing_prueba.mjs
//
// Tres clases de control:
//   - "por fuera": la misma cuenta escrita acá de otra manera (las ecuaciones enteras de
//     cada destino, sin pasar por el piso) tiene que dar lo mismo que el modelo.
//   - "regla": lo que hace el modelo con destinos apagados, datos que faltan y precios de
//     cruce.
//   - "planilla": los resultados de la planilla de HDO, celda por celda. Sus entradas y
//     sus resultados NO están en el repositorio, que es público: se leen de
//     ~/Explora_projects/_fuentes/crushing/control_planilla.json. Si ese archivo no está
//     (otra máquina), esos controles se saltean y se avisa.
//
// Los números de acá abajo son DE EJEMPLO, inventados para ejercitar la cuenta: no son
// precios ni costos de nadie. Los de verdad no se escriben en este archivo.

import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ALTERNATIVAS, calcular, netoBioExportacion, netoExportacion, precioDeCruce } from '../src/lib/crushing.js';
import { porMes, resumen, serieDiaria } from '../src/lib/crushingSerie.js';
import { aEntradas, valoresDelDia } from '../src/lib/crushingDia.js';
import { asignar, barrer, cruces, evaluar, leer, pasosDe, poner, rangoDe, tablaDoble, variable } from '../src/lib/crushingEscenarios.js';

let fallas = 0;
function control(nombre, obtenido, esperado, tolerancia = 1e-6) {
  const ok =
    typeof esperado === 'number' && typeof obtenido === 'number'
      ? Math.abs(obtenido - esperado) <= tolerancia
      : JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallas += 1;
  console.log(`${ok ? '  ok ' : 'FALLA'}  ${nombre}${ok ? '' : `\n         obtenido: ${JSON.stringify(obtenido)}\n         esperado: ${JSON.stringify(esperado)}`}`);
}
const alt = (r, id) => r.alternativas.find((x) => x.id === id);
const fila = (r, id) => r.matriz.find((m) => m.id === id);

// Entradas de ejemplo (inventadas)
const EJEMPLO = {
  poroto: { fob: 400, fobOficial: 410, dex: 0.2, gasto: 3 },
  harina: { fob: 350, fobOficial: 340, dex: 0.15, gasto: 2 },
  aceite: { fob: 1000, fobOficial: 990, dex: 0.15, gasto: 4 },
  aceiteLocal: 880,
  gastoAceiteLocal: 6,
  bioFob: 1210,
  dexBio: 0.1,
  gastoBioExpo: 8,
  bioLocal: 1150,
  gastoBioLocal: 5,
  rendAceite: 0.2,
  rendHarina: 0.75,
  costoMolienda: 12,
  otrosCoproductos: 1.5,
  consumoAceite: 1.05,
  metanolPrecio: 500,
  metanolConsumo: 100,
  otrosCostos: 25,
  glicerina: 15,
};
const R = calcular(EJEMPLO);

console.log('\npor fuera: valores netos');
{
  const e = EJEMPLO;
  control('poroto: FOB menos retención sobre el FOB oficial, menos gastos', R.netos.poroto, 400 - 410 * 0.2 - 3);
  control('harina', R.netos.harina, 350 - 340 * 0.15 - 2);
  control('aceite', R.netos.aceite, 1000 - 990 * 0.15 - 4);
  control('aceite local: precio menos gastos', R.netos.aceiteLocal, 880 - 6);
  control('biodiésel exportado: la retención va sobre la base sin el derecho', R.netos.bioExpo, 1210 / 1.1 - 8);
  control('... y lo que se paga de derecho es FOB x t / (1 + t)', e.bioFob - netoBioExportacion({ fob: e.bioFob, dex: e.dexBio }), (1210 * 0.1) / 1.1, 1e-9);
  control('biodiésel local: precio menos gastos', R.netos.bioLocal, 1150 - 5);
  control('sin FOB oficial, la retención va sobre el mismo FOB', netoExportacion({ fob: 400, dex: 0.2 }), 320);
}

console.log('\npor fuera: las ecuaciones enteras de cada destino');
{
  const e = EJEMPLO;
  const VS = 400 - 410 * 0.2 - 3;
  const VH = 350 - 340 * 0.15 - 2;
  const VA = 1000 - 990 * 0.15 - 4;
  const VL = 880 - 6;
  const VBX = 1210 / 1.1 - 8;
  const VBL = 1150 - 5;
  const CN = (500 * 100) / 1000 + 25 - 15;
  const q = 0.2 / 1.05;
  const base = 0.75 * VH + 1.5 - VS - 12; // harina más otros coproductos, menos el poroto y la molienda
  control('costo de transformación: metanol más otros, menos glicerina', R.transformacion, CN);
  control('biodiésel por tonelada de soja', R.bioPorSoja, q, 1e-12);
  control('exportar el poroto: margen cero por construcción', alt(R, 'poroto').margen, 0, 1e-9);
  control('exportar aceite y harina', alt(R, 'aceite_expo').margen, base + 0.2 * VA, 1e-9);
  control('aceite al mercado local', alt(R, 'aceite_local').margen, base + 0.2 * VL, 1e-9);
  control('biodiésel exportado', alt(R, 'bio_expo').margen, base + q * (VBX - CN), 1e-9);
  control('biodiésel al mercado local', alt(R, 'bio_local').margen, base + q * (VBL - CN), 1e-9);
  control('el piso es el aceite que deja el margen en cero', 0.75 * VH + 0.2 * R.piso + 1.5 - VS - 12, 0, 1e-9);
  control('el piso del biodiésel: transformación más el aceite que consume', R.pisoBio, CN + 1.05 * R.piso, 1e-9);
  control('margen por tonelada de aceite', alt(R, 'aceite_local').margenPorAceite, (base + 0.2 * VL) / 0.2, 1e-9);
  control('margen por tonelada de biodiésel', alt(R, 'bio_local').margenPorBio, (base + q * (VBL - CN)) / q, 1e-9);
  control('harina por tonelada de aceite y efecto de la harina sobre el piso', [R.harinaPorAceite, R.sensibilidadHarina], [3.75, -3.75]);
  control('los cinco destinos, en orden', R.alternativas.map((x) => x.id), ALTERNATIVAS.map((x) => x.id));
  const mayor = Math.max(...R.alternativas.map((x) => x.margen));
  control('el mejor destino es el de mayor margen', R.mejor.margen, mayor, 1e-12);
  control('el mejor sin biodiésel no es un destino de biodiésel', R.mejorSinBio.bio, false);
  void e;
}

console.log('\npor fuera: con el precio de indiferencia, el margen iguala al del destino de referencia');
for (const ref of ALTERNATIVAS.map((x) => x.id)) {
  const m = fila(R, ref);
  control(`biodiésel local a su indiferencia iguala a "${ref}"`, alt(calcular({ ...EJEMPLO, bioLocal: m.bioLocal }), 'bio_local').margen, m.margen, 1e-9);
  control(`biodiésel FOB a su indiferencia iguala a "${ref}"`, alt(calcular({ ...EJEMPLO, bioFob: m.bioFob }), 'bio_expo').margen, m.margen, 1e-9);
  control(`aceite local a su indiferencia iguala a "${ref}"`, alt(calcular({ ...EJEMPLO, aceiteLocal: m.aceiteLocal }), 'aceite_local').margen, m.margen, 1e-9);
  // el FOB de aceite equivalente supone que lo que se le descuenta al FOB no cambia
  const descuento = EJEMPLO.aceite.fob - R.netos.aceite;
  control(`aceite FOB equivalente de "${ref}": el valor neto más lo que se le descuenta al FOB`, m.aceiteFob, m.aceite + descuento, 1e-9);
}

console.log('\nregla: destinos apagados, datos que faltan y el precio de cruce');
{
  const sinPrecio = calcular({ ...EJEMPLO, bioLocal: null });
  control('sin precio local de biodiésel: sin margen y no disponible', [alt(sinPrecio, 'bio_local').margen, alt(sinPrecio, 'bio_local').disponible], [null, false]);
  const apagado = calcular({ ...EJEMPLO, habilitadas: { [R.mejorSinBio.id]: false } });
  control('con el mejor destino sin biodiésel apagado, la referencia pasa al siguiente', apagado.mejorSinBio.id !== R.mejorSinBio.id, true);
  control('... y la indiferencia del biodiésel baja', apagado.indiferencia.bioLocal < R.indiferencia.bioLocal, true);
  control('sin rendimiento de aceite no hay cuenta', calcular({ ...EJEMPLO, rendAceite: 0 }), null);
  control('sin FOB de poroto no hay cuenta', calcular({ ...EJEMPLO, poroto: { dex: 0.2 } }), null);
  const cruce = precioDeCruce(EJEMPLO, (e, v) => ({ ...e, bioFob: v }), 'bio_expo', 'aceite_local');
  control('precio de cruce del biodiésel FOB contra el aceite local: el de la matriz', cruce, fila(R, 'aceite_local').bioFob, 1e-6);
  const cruceHarina = precioDeCruce(EJEMPLO, (e, v) => ({ ...e, harina: { ...e.harina, fob: v, fobOficial: v } }), 'aceite_local', 'poroto');
  const enElCruce = calcular({ ...EJEMPLO, harina: { ...EJEMPLO.harina, fob: cruceHarina, fobOficial: cruceHarina } });
  control('en el precio de cruce de la harina, moler y vender el aceite local deja lo mismo que exportar el poroto', alt(enElCruce, 'aceite_local').margen, 0, 1e-6);
  control('fuera del rango no hay cruce', precioDeCruce(EJEMPLO, (e, v) => ({ ...e, bioFob: v }), 'bio_expo', 'aceite_local', { min: 0, max: 10 }), null);
}

console.log('\nserie: la cuenta día por día y el promedio del mes (datos inventados)');
{
  const P = {
    rendAceite: 0.2, rendHarina: 0.75, costoMolienda: 12, otrosCoproductos: 1.5, consumoAceite: 1.05,
    metanolPrecio: 500, metanolConsumo: 100, otrosCostos: 25, glicerina: 15,
    gastoPoroto: 3, gastoHarina: 2, gastoAceite: 4, gastoAceiteLocal: 6, gastoBioExpo: 8, gastoBioLocal: 5, dexBio: 0.1,
  };
  const campos = ['fecha', 'poroto', 'harina', 'aceite', 'dex_poroto', 'dex_harina', 'dex_aceite', 'dex_bio', 'fas_jj', 'bio_fob_jj', 'bio_oficial'];
  const filas = [
    ['2030-01-02', 400, 350, 1000, 0.2, 0.15, 0.15, 0.1, 880, 1210, 1150],
    ['2030-01-03', 410, 352, 1010, 0.2, 0.15, 0.15, 0.1, null, 1220, 1150], // sin FAS ese día: se arrastra el anterior
    ['2030-01-04', null, 352, 1010, 0.2, 0.15, 0.15, 0.1, 890, 1220, 1150], // sin poroto: el día no sale
    ['2030-02-01', 420, 360, 1020, 0.2, 0.15, 0.15, null, 900, 1230, null], // sin precio oficial y sin retención conocida del biodiésel
  ];
  const datos = { campos, filas, parametros: P };
  const dias = serieDiaria(datos);
  control('salen los días con poroto y harina', dias.map((d) => d.fecha), ['2030-01-02', '2030-01-03', '2030-02-01']);
  const aMano = (f, aceiteLocal, bioLocal) =>
    calcular({
      ...P,
      poroto: { fob: f[1], dex: f[4], gasto: 3 }, harina: { fob: f[2], dex: f[5], gasto: 2 }, aceite: { fob: f[3], dex: f[6], gasto: 4 },
      aceiteLocal, bioFob: f[9], dexBio: f[7] ?? 0.1, bioLocal,
    });
  const d1 = aMano(filas[0], 880, 1150);
  const d2 = aMano(filas[1], 880, 1150); // el FAS arrastrado
  const d3 = aMano(filas[3], 900, null);
  control('día 1: igual a la cuenta suelta', [dias[0].piso, dias[0].margen.bio_local, dias[0].indifBioLocal], [d1.piso, alt(d1, 'bio_local').margen, d1.indiferencia.bioLocal]);
  control('día 2: el FAS que falta se arrastra del día anterior', dias[1].margen.aceite_local, alt(d2, 'aceite_local').margen, 1e-12);
  control('día 3: sin precio oficial no hay biodiésel local', [dias[2].margen.bio_local, dias[2].bioLocal], [null, null]);
  control('día 3: sin retención conocida del biodiésel no hay biodiésel exportado (no se usa la de hoy)', [dias[2].margen.bio_expo, dias[2].bioFob, dias[2].indifBioFob], [null, null, null]);
  control('... y el resto de ese día sale igual', dias[2].margen.aceite_local, alt(d3, 'aceite_local').margen, 1e-12);
  control('sin arrastre, el día 2 queda sin aceite local', serieDiaria(datos, { arrastre: 0 })[1].margen.aceite_local, null);
  const meses = porMes(dias);
  control('dos meses, con sus días', meses.map((m) => [m.fecha, m.dias]), [['2030-01', 2], ['2030-02', 1]]);
  control('enero: el margen del mes es el promedio de los dos días', meses[0].m_bio_local, (alt(d1, 'bio_local').margen + alt(d2, 'bio_local').margen) / 2, 1e-12);
  control('enero: la brecha del biodiésel local es precio menos indiferencia', meses[0].brechaBioLocal, (1150 - d1.indiferencia.bioLocal + 1150 - d2.indiferencia.bioLocal) / 2, 1e-9);
  control('febrero: sin precio oficial no hay brecha, pero sí indiferencia', [meses[1].brechaBioLocal, meses[1].indifBioLocal], [null, d3.indiferencia.bioLocal]);
  const mayorEnero = ['poroto', 'aceite_expo', 'aceite_local', 'bio_expo', 'bio_local'].reduce((a, b) => (meses[0][`m_${b}`] > meses[0][`m_${a}`] ? b : a));
  control('el mejor destino del mes es el de mayor margen promedio', meses[0].mejor, mayorEnero);
  control('resumen de un campo: promedio de los meses con dato', resumen(meses, 'm_bio_local'), { promedio: meses[0].m_bio_local, meses: 1 });
}

console.log('\ndía: los valores de los casilleros y su paso a la cuenta (datos inventados)');
// Los mismos números de EJEMPLO, como los muestran los casilleros: porcentajes en %
const V_EJ = {
  poroto: 400, harina: 350, aceite: 1000, aceiteLocal: 880, bioFob: 1210, bioLocal: 1150,
  dexPoroto: 20, dexHarina: 15, dexAceite: 15, dexBio: 10,
  rendAceite: 20, rendHarina: 75, costoMolienda: 12, consumoAceite: 1.05, metanolPrecio: 500, metanolConsumo: 100,
  otrosCostos: 25, glicerina: 15, otrosCoproductos: 1.5,
  gastoPoroto: 3, gastoHarina: 2, gastoAceite: 4, gastoAceiteLocal: 6, gastoBioExpo: 8, gastoBioLocal: 5, volumen: 1000,
};
{
  const e = aEntradas(V_EJ);
  control('los porcentajes pasan a fracción', [e.poroto.dex, e.harina.dex, e.dexBio, e.rendAceite, e.rendHarina], [0.2, 0.15, 0.1, 0.2, 0.75]);
  const aMano = calcular({ ...EJEMPLO, poroto: { fob: 400, dex: 0.2, gasto: 3 }, harina: { fob: 350, dex: 0.15, gasto: 2 }, aceite: { fob: 1000, dex: 0.15, gasto: 4 } });
  control('evaluar los casilleros da lo mismo que la cuenta suelta', evaluar(V_EJ).alternativas.map((x) => x.margen), aMano.alternativas.map((x) => x.margen));
  const datos = {
    campos: ['fecha', 'poroto', 'harina', 'aceite', 'poroto_sig', 'dex_poroto', 'dex_harina', 'dex_aceite', 'dex_bio', 'fas_jj', 'bio_fob_jj', 'bio_oficial'],
    filas: [
      ['2030-01-02', 400, 350, 1000, 405, 0.2, 0.15, 0.15, 0.1, 880, 1210, 1150],
      ['2030-01-03', 410, 352, 1010, 415, 0.2, 0.15, 0.225, 0.1, null, 1220, null],
    ],
    parametros: { rendAceite: 0.2, rendHarina: 0.75, costoMolienda: 12, dexBio: 0.3 },
  };
  const d = valoresDelDia(datos, { fecha: '2030-01-05', fuenteAceite: 'fas_jj', fuenteBio: 'bio_fob_jj', rotuloAceite: 'FAS', rotuloBio: 'FOB' });
  control('un día sin circular usa el anterior más cercano', d.diaUsado, '2030-01-03');
  control('el precio que falta ese día es el último anterior, y la nota dice de cuándo', [d.base.aceiteLocal.valor, d.base.aceiteLocal.nota], [880, 'FAS · del 02/01']);
  control('el precio oficial es mensual: la nota dice el mes', [d.base.bioLocal.valor, d.base.bioLocal.nota], [1150, 'precio oficial · ene-2030']);
  control('las retenciones se muestran en %, sin decimales de más', [d.base.dexPoroto.valor, d.base.dexAceite.valor, d.base.dexBio.valor], [20, 22.5, 10]);
  control('los rendimientos también', [d.base.rendAceite.valor, d.base.rendHarina.valor], [20, 75]);
  control('la posición del mes siguiente toma su propia columna', valoresDelDia(datos, { fecha: '2030-01-02', posicion: '_sig', fuenteAceite: 'fas_jj', fuenteBio: 'bio_fob_jj' }).base.poroto.valor, 405);
}

console.log('\nqué pasa si: mover una y dos variables (datos inventados)');
{
  const R0 = evaluar(V_EJ);
  const bioLocal = variable('bioLocal');
  const sub = variable('dexSub');
  control('harina y aceite se mueven juntas', [poner(sub, V_EJ, 18).dexAceite, poner(sub, V_EJ, 18).dexHarina, leer(sub, V_EJ)], [18, 18, 15]);
  control('un precio se mueve 30% para cada lado', rangoDe(bioLocal, V_EJ), { min: 1150 * 0.7, max: 1150 * 1.3 });
  control('una retención se mueve 10 puntos para cada lado, sin bajar de cero', [rangoDe(variable('dexBio'), V_EJ), rangoDe(variable('dexBio'), { ...V_EJ, dexBio: 4 })], [{ min: 0, max: 20 }, { min: 0, max: 14 }]);
  control('siete pasos alrededor del valor actual', [pasosDe(bioLocal, V_EJ)[3], pasosDe(bioLocal, V_EJ).length, pasosDe(sub, V_EJ)], [1150, 7, [9, 11, 13, 15, 17, 19, 21]]);
  const rango = rangoDe(bioLocal, V_EJ);
  const puntos = barrer(bioLocal, V_EJ, { ...rango, pasos: 60 });
  control('el barrido tiene sus puntos y pasa por el valor actual', [puntos.length, puntos[30].x], [61, 1150], 1e-9);
  control('en el valor actual, el barrido da la cuenta de siempre', [puntos[30].bio_local, puntos[30].aceite_local, puntos[30].mejor], [alt(R0, 'bio_local').margen, alt(R0, 'aceite_local').margen, R0.mejor.id]);
  control('mover el biodiésel local no cambia los otros destinos', puntos[0].aceite_expo, alt(R0, 'aceite_expo').margen, 1e-12);
  const cs = cruces(bioLocal, V_EJ, rango);
  control('hay un solo valor en que el biodiésel local pasa a ser el mejor', cs.map((c) => c.a), ['bio_local']);
  // en el cruce, los dos destinos dejan lo mismo; y es el precio de indiferencia contra todos los demás
  const enElCruce = evaluar(poner(bioLocal, V_EJ, cs[0].x));
  control('en el cruce, el destino que sale y el que entra dejan lo mismo', alt(enElCruce, cs[0].de).margen, alt(enElCruce, cs[0].a).margen, 1e-6);
  control('fuera del rango no hay cruces', cruces(bioLocal, V_EJ, { min: 2000, max: 2500 }), []);
  const va = pasosDe(bioLocal, V_EJ);
  const vb = pasosDe(variable('aceite'), V_EJ);
  const tabla = tablaDoble(bioLocal, variable('aceite'), V_EJ, va, vb);
  control('la tabla de dos variables es de siete por siete', [tabla.length, tabla[0].length], [7, 7]);
  control('la celda del medio es la cuenta de siempre', [tabla[3][3].mejor, tabla[3][3].margen], [R0.mejor.id, R0.mejor.margen]);
  const suelta = evaluar({ ...V_EJ, bioLocal: va[0], aceite: vb[6] });
  control('una esquina, igual a la cuenta suelta con esos dos valores', [tabla[0][6].mejor, tabla[0][6].margen], [suelta.mejor.id, suelta.mejor.margen]);
}

console.log('\nqué pasa si: repartir un volumen con topes (datos inventados)');
{
  const R0 = evaluar(V_EJ);
  const orden = R0.alternativas.filter((x) => x.id !== 'poroto' && x.margen > 0).sort((x, y) => y.margen - x.margen);
  const [primero, segundo] = orden;
  const prodPorSoja = (id) => (id.startsWith('bio') ? R0.bioPorSoja : 0.2);
  const libre = asignar(R0, { soja: 1000 });
  control('sin topes, todo va al destino que más deja', [libre.filas[0].id, libre.filas[0].soja, libre.poroto, libre.total], [primero.id, 1000, 0, 1000 * primero.margen], 1e-9);
  control('... y la próxima tonelada iría al mismo', libre.siguiente.id, primero.id);
  const tope = 300 * prodPorSoja(primero.id); // producto que sale de 300 t de soja
  const conTope = asignar(R0, { soja: 1000, topes: { [primero.id]: tope } });
  control('con tope en el mejor: se llena con 300 t de soja y el resto va al segundo', [conTope.filas[0].soja, conTope.filas[0].lleno, conTope.filas[1].id, conTope.filas[1].soja], [300, true, segundo.id, 700], 1e-9);
  control('... el producto del primero es justo su tope', conTope.filas[0].producto, tope, 1e-9);
  control('... el total es la suma de cada margen por su soja', conTope.total, 300 * primero.margen + 700 * segundo.margen, 1e-9);
  control('... el promedio es el total sobre toda la soja', conTope.promedio, conTope.total / 1000, 1e-12);
  control('... y la próxima tonelada iría al segundo', conTope.siguiente.id, segundo.id);
  const pocaMolienda = asignar(R0, { soja: 1000, molienda: 400, topes: { [primero.id]: tope } });
  control('con molienda para 400 t: 300 al mejor, 100 al segundo y 600 se exportan como poroto', [pocaMolienda.filas[0].soja, pocaMolienda.filas[1].soja, pocaMolienda.poroto, pocaMolienda.molida], [300, 100, 600, 400], 1e-9);
  control('... y la próxima tonelada ya no se muele', pocaMolienda.siguiente.id, 'poroto');
  const todosLlenos = asignar(R0, { soja: 1000, topes: Object.fromEntries(orden.map((x) => [x.id, 10 * prodPorSoja(x.id)])) });
  control('con todos los destinos topeados en 10 t de soja, sobra para exportar como poroto', [todosLlenos.molida, todosLlenos.poroto, todosLlenos.siguiente.id], [10 * orden.length, 1000 - 10 * orden.length, 'poroto'], 1e-9);
  // un destino que deja menos que exportar el poroto no recibe nada
  const malo = evaluar({ ...V_EJ, bioFob: 500 });
  const conMalo = asignar(malo, { soja: 1000 });
  control('un destino con margen negativo no entra en el reparto', [alt(malo, 'bio_expo').margen < 0, conMalo.filas.some((f) => f.id === 'bio_expo')], [true, false]);
  control('sin soja no hay reparto', asignar(R0, { soja: 0 }), null);
}

// ---------------------------------------------------------------- planilla (archivo privado)
const privado = path.join(os.homedir(), 'Explora_projects', '_fuentes', 'crushing', 'control_planilla.json');
if (!existsSync(privado)) {
  console.log(`\nplanilla: SALTEADO - no está ${privado}`);
} else {
  const { entradas, esperado } = JSON.parse(readFileSync(privado, 'utf8'));
  const P = calcular(entradas);
  const leer = (camino) => {
    const partes = camino.split('.');
    if (partes[0] === 'alt') return alt(P, partes[1])[partes[2]];
    if (partes[0] === 'matriz') return fila(P, partes[1])[partes[2]];
    return partes.reduce((o, k) => o?.[k], P);
  };
  console.log(`\nplanilla: ${esperado.length} celdas de la planilla de HDO`);
  for (const c of esperado) control(c.nombre, leer(c.camino), c.valor);
}

console.log(fallas ? `\n${fallas} control(es) con FALLA` : '\nTodos los controles pasan.');
process.exit(fallas ? 1 : 0);
