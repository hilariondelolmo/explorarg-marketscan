// Banco de prueba del Analista (Agente Explorarg), sin IA.
//
//   node scripts/analista_prueba.mjs
//
// Tres clases de control:
//   - "por fuera": la misma cuenta hecha acá a mano, leyendo los JSON crudos, tiene
//     que dar lo que da el motor del Analista;
//   - "dato": valores fijos del sitio con datos a septiembre de 2026. Si se
//     regeneran los datos pueden cambiar: hay que revisarlos, no forzarlos;
//   - "regla": lo que hace el control de la consulta cuando el pedido viene mal
//     armado (lo que devuelve la IA nunca llega al motor sin pasar por ahí);
//   - "varias": los menús de selección múltiple (23/11/2026). Tildar varias cosas
//     tiene que dar lo mismo que pedir cada una por separado.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { armarContexto, DATOS_DEL_SITIO } from '../src/lib/poligrafo/contexto.js';
import { SENADORES, VOTACION } from '../src/data/mapa-recinto.js';
import { DIMENSIONES, FILTROS_DE, METRICAS, TOPE_MAXIMO } from '../src/lib/analista/catalogo.js';
import { ajustarConsulta, desdeModelo, ESQUEMA_CONSULTA, opcionesDeMenu } from '../src/lib/analista/consulta.js';
import { describirConsulta, ejecutarConsulta, etiquetaGrupo, resolverConsulta, seriesDe } from '../src/lib/analista/motor.js';
import { armarConsignaAnalista } from '../server/analista/consigna.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = (n) => JSON.parse(readFileSync(path.join(raiz, 'src/data', `${n}.json`), 'utf8'));
const crudo = Object.fromEntries(Object.entries(DATOS_DEL_SITIO).map(([nombre, archivo]) => [nombre, leer(archivo)]));
const ctx = armarContexto({ ...crudo, recinto: { SENADORES, VOTACION } });

let fallas = 0;
function control(nombre, obtenido, esperado) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallas += 1;
  console.log(`${ok ? '  ok ' : 'FALLA'}  ${nombre}${ok ? '' : `\n         obtenido: ${JSON.stringify(obtenido)}\n         esperado: ${JSON.stringify(esperado)}`}`);
}
const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

/** Corre una consulta como la corre la página: primero el control, después el motor. */
function correr(q) {
  const { consulta, avisos } = ajustarConsulta(q, ctx);
  return { consulta, avisos, r: ejecutarConsulta(consulta, ctx), texto: describirConsulta(consulta, ctx) };
}
const filasDe = (r, clase) => r.filas.filter((f) => (clase ? f.clase === clase : !f.clase));
const celda = (r, etiqueta, columna) => r.filas.find((f) => f.celdas.includes(etiqueta))?.celdas[columna];

console.log(`Datos del sitio hasta ${ctx.ultimo} · ${ctx.empresas.length} empresas\n`);

// ------------------------------------------------------------------ ventas al cupo
const U12 = { desde: '2025-10', hasta: '2026-09' };
const enPeriodo = (fecha, p) => fecha >= p.desde && fecha <= p.hasta;
// por fuera: empresas.json, columna 3 de la serie = ventas al cupo
const ventasPorFuera = (p, filtro = () => true) =>
  crudo.empresas.empresas
    .filter(filtro)
    .map((e) => [e.empresa.trim(), e.serie.filter((s) => enPeriodo(s[0], p)).reduce((t, s) => t + (s[3] || 0), 0)])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

{
  const { r, texto } = correr({ tipo: 'ranking', metrica: 'ventas_cupo', agrupar: 'empresa', ...U12, tope: 60 });
  const fuera = ventasPorFuera(U12);
  const filas = filasDe(r);
  control('ventas al cupo por empresa: mismas empresas y toneladas que la cuenta por fuera', filas.map((f) => [f.celdas[1], r0(f.celdas[2])]), fuera.map(([k, v]) => [k, r0(v)]));
  control('ventas al cupo por empresa: el total es la suma de las filas', r0(filasDe(r, 'total')[0].celdas[2]), r0(fuera.reduce((t, [, v]) => t + v, 0)));
  control('ventas al cupo por empresa: los porcentajes suman 100', r1(filas.reduce((t, f) => t + f.celdas[3], 0)), 100);
  control('dato · últimos 12 meses: primera Explora con 45.062 t sobre 788.749 t', [filas[0].celdas[1], r0(filas[0].celdas[2]), r0(filasDe(r, 'total')[0].celdas[2])], ['EXPLORA S.A.', 45062, 788749]);
  control('la consulta se dice en palabras', texto, 'Ranking de ventas al cupo por empresa · oct 2025 a sep 2026');
}
{
  const { r } = correr({ tipo: 'ranking', metrica: 'ventas_cupo', agrupar: 'empresa', ...U12, tope: 5 });
  const total = filasDe(r, 'total')[0].celdas[2];
  const vistas = filasDe(r).reduce((t, f) => t + f.celdas[2], 0);
  const resto = filasDe(r, 'resto')[0];
  control('tope 5: cinco filas, y "Otras" lleva lo que falta para el total', [filasDe(r).length, r0(vistas + resto.celdas[2]), resto.celdas[1]], [5, r0(total), `Otras ${ventasPorFuera(U12).length - 5}`]);
}
{
  const { r } = correr({ tipo: 'ranking', metrica: 'ventas_cupo', agrupar: 'empresa', desde: '2023-01', hasta: '2024-12' });
  control('dato · el pedido de ejemplo de HDO (ene 2023 a dic 2024): primera Explora con 90.915 t', [filasDe(r)[0].celdas[1], r0(filasDe(r)[0].celdas[2])], ['EXPLORA S.A.', 90915]);
}
{
  const { r } = correr({ tipo: 'ranking', metrica: 'ventas_cupo', agrupar: 'grupo', ...U12, filtros: { categoria: 'NO INTEGRADA' }, tope: 60 });
  const nombres = filasDe(r).map((f) => f.celdas[1]);
  const fuera = ventasPorFuera(U12, (e) => e.categoria === 'NO INTEGRADA').reduce((t, [, v]) => t + v, 0);
  control('por grupo, solo no integradas: el total es el de las no integradas por fuera', r0(filasDe(r, 'total')[0].celdas[2]), r0(fuera));
  control('los grupos salen con su nombre público, nunca con el apellido', [nombres.slice(0, 2), nombres.some((n) => /BOJANICH|PUCCIARIELLO|GRUPO BOLZ[ÁA]N/.test(n))], [['Grupo Bahía Energía', 'Grupo Rosario Bio'], false]);
  control('dato · no integradas, últimos 12 meses: Grupo Bahía Energía 230.429 t, el 30,9%', [r0(filasDe(r)[0].celdas[2]), r1(filasDe(r)[0].celdas[3])], [230429, 30.9]);
}
{
  const { r } = correr({ tipo: 'evolucion', metrica: 'ventas_cupo', agrupar: 'categoria', desde: '2022-01', hasta: '2025-12', tiempo: 'anio' });
  const de2025 = r.filas.find((f) => String(f.celdas[0]).startsWith('2025')).celdas;
  const total2025 = ventasPorFuera({ desde: '2025-01', hasta: '2025-12' }).reduce((t, [, v]) => t + v, 0);
  // se compara con menos de una tonelada de margen: las dos cuentas suman los mismos números en distinto orden
  control('evolución por año y categoría: una fila por año, y 2025 da el total por fuera', [r.filas.length, Math.abs(de2025[de2025.length - 1] - total2025) < 1], [4, true]);
}
{
  const { r } = correr({ tipo: 'comparacion', metrica: 'ventas_cupo', agrupar: 'empresa', desde: '2025-01', hasta: '2025-12', desde0: '2024-01', hasta0: '2024-12', tope: 5 });
  const f = filasDe(r)[0].celdas;
  control('comparación: diferencia = final menos inicial, y variación en % sobre el inicial', [r0(f[3]), r1(f[4])], [r0(f[2] - f[1]), r1(((f[2] - f[1]) / f[1]) * 100)]);
  const t = filasDe(r, 'total')[0].celdas;
  control('dato · 2025 contra 2024: 696.230 t contra 772.014 t, -9,8%', [r0(t[1]), r0(t[2]), r1(t[4])], [772014, 696230, -9.8]);
}

// ------------------------------------------------------------------ compras por petrolera
{
  const { r } = correr({ tipo: 'ranking', metrica: 'compras', agrupar: 'petrolera', ...U12, tope: 60 });
  // por fuera: compras_cupo.json, filas [mes, empresa, petrolera, toneladas]
  const c = crudo.compras;
  const fuera = new Map();
  for (const [iMes, , iPet, tn] of c.ventas) if (enPeriodo(c.meses[iMes], U12)) fuera.set(c.petroleras[iPet], (fuera.get(c.petroleras[iPet]) || 0) + tn);
  const orden = [...fuera].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  control('compras por petrolera: lo mismo que la cuenta por fuera', filasDe(r).map((f) => [f.celdas[1], r0(f.celdas[2])]), orden.map(([k, v]) => [k, r0(v)]));
  control('dato · YPF compró el 59,9% (el mismo número que la ficha del Polígrafo)', [r1(filasDe(r)[0].celdas[3]), ctx.ficha.porId.get('D-COMPRAS-PETROLERAS').texto.includes('59,9%')], [59.9, true]);
}

// ------------------------------------------------------------------ corte
{
  const { r } = correr({ tipo: 'evolucion', metrica: 'corte_real', desde: '2019-01', hasta: '2026-09', tiempo: 'anio' });
  // por fuera: corte.json, biodiésel sobre gas oil, sumando los meses del año
  const de = (anio) => {
    const ms = crudo.corte.mensual.filter((m) => m.fecha.startsWith(String(anio)) && m.obligatorio !== null && m.obligatorio !== undefined);
    return (ms.reduce((t, m) => t + m.bio_m3, 0) / ms.reduce((t, m) => t + m.go_m3, 0)) * 100;
  };
  control('corte real por año: lo mismo que la cuenta por fuera', r.filas.map((f) => r2(f.celdas[1])), [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => r2(de(y))));
  control('dato · corte real de 2025: 5,79%', r2(celda(r, '2025', 1)), 5.79);
}
{
  const { r } = correr({ tipo: 'total', metrica: 'faltante', desde: '2025-01', hasta: '2025-12' });
  const fuera = crudo.corte.mensual.filter((m) => m.fecha.startsWith('2025')).reduce((t, m) => t + (m.deficit_ton || 0), 0);
  control('faltante de 2025: una sola cifra, igual a la suma por fuera', [r.filas.length, r0(r.cifra.valor), r.cifra.unidad], [1, r0(fuera), 't']);
  control('dato · faltante de 2025: 194.669 t', r0(r.cifra.valor), 194669);
}
{
  const { r } = correr({ tipo: 'total', metrica: 'cumplimiento_corte', desde: '2025-01', hasta: '2025-12' });
  const real = correr({ tipo: 'total', metrica: 'corte_real', desde: '2025-01', hasta: '2025-12' }).r.cifra.valor;
  const oblig = correr({ tipo: 'total', metrica: 'corte_obligatorio', desde: '2025-01', hasta: '2025-12' }).r.cifra.valor;
  control('cumplimiento del corte = corte real sobre corte obligatorio', r1(r.cifra.valor), r1((real / oblig) * 100));
}

// ------------------------------------------------------------------ precios
{
  const mes = '2026-09';
  const p = ctx.precios.de(mes);
  const uno = (q) => correr({ tipo: 'total', desde: mes, hasta: mes, ...q }).r.cifra.valor;
  control('precio del biodiésel en un mes: el del tablero', r2(uno({ metrica: 'precio', producto: 'biodiesel' })), r2(p.biodiesel));
  control('diferencia biodiésel contra gas oil fósil en un mes: (a / b - 1) x 100', r2(uno({ metrica: 'brecha_precio', producto: 'biodiesel', productoBase: 'gasoil_fosil' })), r2((p.biodiesel / p.gasoil_fosil - 1) * 100));
  // por fuera: bioetanol_precios.json, promedio simple de caña y maíz
  const [, cana, maiz] = crudo.bioetanol.mensual.find((f) => f[0] === mes);
  control('precio del bioetanol: promedio de caña y maíz del reporte de la Secretaría', r2(uno({ metrica: 'precio', producto: 'bioetanol' })), r2((cana + maiz) / 2));
  const energia = correr({ tipo: 'total', metrica: 'brecha_precio', producto: 'bioetanol', productoBase: 'nafta_fosil', equivalencia: 'por_energia', desde: mes, hasta: mes }).r;
  const litro = uno({ metrica: 'brecha_precio', producto: 'bioetanol', productoBase: 'nafta_fosil', equivalencia: 'por_litro' });
  control('a igual energía el bioetanol sale más caro que litro contra litro, y la nota lo explica', [energia.cifra.valor > litro, energia.notas.some((n) => n.includes('MJ'))], [true, true]);
}
{
  const { consulta, avisos } = correr({ tipo: 'ranking', metrica: 'precio', producto: 'bioetanol', desde: '2030-01', hasta: '2030-12' });
  control('regla · un precio no tiene ranking: pasa a evolución, y un período sin datos se cambia por el último que hay', [consulta.tipos, consulta.hasta, avisos.length], [['evolucion'], crudo.bioetanol.mensual[crudo.bioetanol.mensual.length - 1][0], 1]);
  control('regla · el aviso nombra el producto y no pierde mayúsculas', avisos[0].startsWith('De precio por litro de bioetanol hay datos de'), true);
}

// ------------------------------------------------------------------ precio del aceite por distancia
{
  const a = crudo.aceite;
  const { r, consulta } = correr({ tipo: 'ranking', metrica: 'precio_aceite', agrupar: 'empresa', desde: a.meses[0].fecha, hasta: a.meses[a.meses.length - 1].fecha });
  const fuera = a.resumen.map((z) => [z.rotulo, r1(a.meses.reduce((t, m) => t + m[z.zona], 0) / a.meses.length)]).sort((x, y) => y[1] - x[1]);
  control('regla · el precio del aceite se agrupa siempre por zona', consulta.agrupar, 'zona');
  control('aceite por distancia: promedio de cada zona, igual a la cuenta por fuera', r.filas.map((f) => [f.celdas[1], r1(f.celdas[2])]), fuera);
  control('aceite por distancia: coincide con el resumen de la página (Rosario = 100)', a.resumen.map((z) => r1(celda(r, z.rotulo, 2) - 100)), a.resumen.map((z) => z.promedio));
  control('dato · la zona que compró más barato en promedio es de 201 a 600 km (96,2) y no hay fila de total', [r.filas[r.filas.length - 1].celdas[1], r1(r.filas[r.filas.length - 1].celdas[2]), filasDe(r, 'total').length], ['De 201 a 600 km', 96.2, 0]);
  const fuente = `${r.fuente.etiqueta} ${r.fuente.origen}`;
  control('aceite por distancia: cita la nota de la Secretaría de Energía y enlaza a la página', [fuente.includes('14/10/2026'), r.fuente.ruta], [true, '/relacion-precio-aceite']);
  control('aceite por distancia: las barras muestran la diferencia con Rosario (si no, 96 y 98 se ven iguales) y la tabla, el índice', [r.grafico.unidad, r.grafico.series[0].valores.map(r1), r.filas.map((f) => r1(f.celdas[2] - 100))].map((x) => JSON.stringify(x)), ['"puntos"', JSON.stringify(fuera.map(([, v]) => r1(v - 100))), JSON.stringify(fuera.map(([, v]) => r1(v - 100)))]);
  const fuera2 = correr({ tipo: 'ranking', metrica: 'precio_aceite', desde: '2020-01', hasta: '2020-12' });
  control('regla · el aviso del aceite deja "Rosario" con mayúscula', fuera2.avisos[0].startsWith('De precio de compra del aceite según la distancia a Rosario hay datos de ene 2024 a ago 2026'), true);
}

// ------------------------------------------------------------------ capacidad
{
  const { r } = correr({ tipo: 'ranking', metrica: 'capacidad', agrupar: 'provincia' });
  const fuera = ctx.empresas.reduce((t, e) => t + e.capacidad, 0);
  control('capacidad por provincia: el total es el de las plantas en operación', r0(filasDe(r, 'total')[0].celdas[2]), r0(fuera));
  const ev = correr({ tipo: 'evolucion', metrica: 'capacidad' });
  control('regla · la capacidad no se puede ver en el tiempo: pasa a ranking y avisa', [ev.consulta.tipos, ev.avisos.length], [['ranking'], 1]);
}

// ------------------------------------------------------------------ el control de la consulta
{
  const basura = { tipo: 'cualquiera', metrica: 'no_existe', agrupar: 'petrolera', tope: 9999, orden: 'x', filtros: { provincia: 'MARTE', petrolera: 'YPF S.A.' }, desde: '2026-09', hasta: '2025-10' };
  const { consulta } = ajustarConsulta(basura, ctx);
  control('regla · una consulta rota queda en algo que se puede calcular', [consulta.tipos, consulta.metricas, consulta.agrupar, consulta.tope, consulta.orden, consulta.filtros, consulta.desde, consulta.hasta], [['ranking'], ['ventas_cupo'], 'empresa', TOPE_MAXIMO, 'mayor', {}, '2025-10', '2026-09']);
  control('regla · pasar dos veces por el control no cambia nada', ajustarConsulta(consulta, ctx).consulta, consulta);
  const todas = [];
  for (const metrica of Object.keys(METRICAS)) for (const tipo of ['ranking', 'evolucion', 'total', 'comparacion']) for (const agrupar of ['ninguno', ...Object.keys(DIMENSIONES)]) todas.push({ tipo, metrica, agrupar });
  const malas = todas.filter((q) => {
    const a = ajustarConsulta(q, ctx).consulta;
    return !ejecutarConsulta(a, ctx).ok || JSON.stringify(ajustarConsulta(a, ctx).consulta) !== JSON.stringify(a);
  });
  control(`regla · las ${todas.length} combinaciones de medida, tipo y agrupación dan un resultado`, malas.map((q) => `${q.metrica}/${q.tipo}/${q.agrupar}`), []);
}

// ------------------------------------------------------------------ menús de selección múltiple
/** El pedido entero, como lo muestra la página: el control y después todos los bloques. */
function pedir(q) {
  const { consulta, avisos } = ajustarConsulta(q, ctx);
  return { consulta, avisos, bloques: resolverConsulta(consulta, ctx), texto: describirConsulta(consulta, ctx) };
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

{
  // filtros: varios valores en un mismo menú
  const DOS = ['SANTA FE', 'PROVINCIA DE BUENOS AIRES'];
  const base = { tipo: 'ranking', metrica: 'ventas_cupo', agrupar: 'empresa', ...U12, tope: 60 };
  const { r, consulta, texto } = correr({ ...base, filtros: { provincia: DOS } });
  const fuera = ventasPorFuera(U12, (e) => DOS.includes(e.provincia));
  control('varias · dos provincias tildadas: las empresas de las dos, igual que la cuenta por fuera', filasDe(r).map((f) => [f.celdas[1], r0(f.celdas[2])]), fuera.map(([k, v]) => [k, r0(v)]));
  const totalDe = (provincia) => filasDe(correr({ ...base, filtros: { provincia } }).r, 'total')[0].celdas[2];
  control('varias · el total de dos provincias es la suma de cada una por separado', r0(filasDe(r, 'total')[0].celdas[2]), r0(totalDe('SANTA FE') + totalDe('PROVINCIA DE BUENOS AIRES')));
  control('varias · el filtro queda en el orden del menú y se dice en palabras', [consulta.filtros, texto], [{ provincia: ['PROVINCIA DE BUENOS AIRES', 'SANTA FE'] }, 'Ranking de ventas al cupo por empresa · Buenos Aires y Santa Fe · oct 2025 a sep 2026']);
  const cruzado = correr({ ...base, filtros: { provincia: DOS, categoria: ['NO INTEGRADA'] } }).r;
  const fueraCruzado = ventasPorFuera(U12, (e) => DOS.includes(e.provincia) && e.categoria === 'NO INTEGRADA').reduce((t, [, v]) => t + v, 0);
  control('varias · entre menús distintos se cumplen los dos: no integradas de esas dos provincias', r0(filasDe(cruzado, 'total')[0].celdas[2]), r0(fueraCruzado));
  const vieja = correr({ ...base, filtros: { categoria: 'NO INTEGRADA' } });
  const nueva = correr({ ...base, filtros: { categoria: ['NO INTEGRADA'] } });
  control('varias · una consulta guardada con un solo valor por filtro se lee igual', [vieja.consulta.filtros, igual(vieja.r, nueva.r)], [{ categoria: ['NO INTEGRADA'] }, true]);
  // localidad: el menú que faltaba (la IA ya podía traducir "las empresas de Rosario" a ese filtro, y se perdía)
  const LOCALIDADES = ['ROSARIO', 'SAN LORENZO'];
  const porLocalidad = correr({ ...base, filtros: { localidad: LOCALIDADES } });
  const fueraLocalidad = ventasPorFuera(U12, (e) => LOCALIDADES.includes(e.localidad));
  control('varias · dos localidades tildadas: sus empresas, igual que la cuenta por fuera', filasDe(porLocalidad.r).map((f) => [f.celdas[1], r0(f.celdas[2])]), fueraLocalidad.map(([k, v]) => [k, r0(v)]));
  control('varias · la localidad se dice en palabras, después de la provincia', correr({ ...base, filtros: { localidad: LOCALIDADES, provincia: 'SANTA FE' } }).texto, 'Ranking de ventas al cupo por empresa · Santa Fe · Rosario y San Lorenzo · oct 2025 a sep 2026');
  const comprasEnLocalidad = correr({ tipo: 'ranking', metrica: 'compras', agrupar: 'petrolera', ...U12, tope: 60, filtros: { localidad: LOCALIDADES } }).r;
  control('varias · en las compras, la localidad es la de la planta que vende: el total es el de esas empresas', r0(filasDe(comprasEnLocalidad, 'total')[0].celdas[2]), r0(fueraLocalidad.reduce((t, [, v]) => t + v, 0)));
  const petroleras = filasDe(correr({ tipo: 'ranking', metrica: 'compras', agrupar: 'petrolera', ...U12 }).r).slice(0, 2).map((f) => f.celdas[1]);
  const comprasDe = (petrolera) => filasDe(correr({ tipo: 'ranking', metrica: 'compras', agrupar: 'empresa', ...U12, tope: 60, filtros: { petrolera } }).r, 'total')[0].celdas[2];
  control('varias · dos petroleras tildadas: sus compras sumadas', r0(comprasDe(petroleras)), r0(comprasDe(petroleras[0]) + comprasDe(petroleras[1])));
}
{
  // varias medidas en un ranking: una columna por medida
  const MEDIDAS = ['ventas_cupo', 'produccion', 'exportacion', 'cumplimiento_cupo'];
  const base = { agrupar: 'empresa', ...U12, tope: 60 };
  const { bloques, consulta, texto } = pedir({ ...base, tipos: ['ranking'], metricas: MEDIDAS });
  const b = bloques[0];
  const sola = (metrica) => correr({ ...base, tipo: 'ranking', metrica }).r;
  control('varias · cuatro medidas en un ranking: una sola tabla, con una columna por medida', [bloques.length, b.columnas.map((c) => c.nombre)], [1, ['#', 'Empresa', 'Ventas al cupo (t)', 'Producción (t)', 'Exportaciones (t)', 'Cumplimiento del cupo']]);
  const distintas = MEDIDAS.flatMap((metrica, k) => {
    const una = new Map(filasDe(sola(metrica)).map((f) => [f.celdas[1], f.celdas[2]]));
    // en la tabla conjunta una empresa sin dato en esa medida va con 0 o vacío; en la de una sola medida no figura
    return filasDe(b).filter((f) => Math.abs((f.celdas[2 + k] || 0) - (una.get(f.celdas[1]) || 0)) > 1e-6).map((f) => `${metrica}/${f.celdas[1]}`);
  });
  control('varias · cada columna trae lo mismo que el ranking de esa medida sola', distintas, []);
  control('varias · el total de cada columna es el del ranking de esa medida sola', filasDe(b, 'total')[0].celdas.slice(2).map(r1), MEDIDAS.map((metrica) => r1(filasDe(sola(metrica), 'total')[0].celdas[2])));
  control('varias · sin otra indicación ordena la primera medida, y la consulta se dice en palabras', [filasDe(b)[0].celdas[1], consulta.ordenMedida, texto], [filasDe(sola('ventas_cupo'))[0].celdas[1], 'ventas_cupo', 'Ranking de ventas al cupo, producción, exportaciones y cumplimiento del cupo por empresa · oct 2025 a sep 2026']);
  const porExportacion = pedir({ ...base, tipos: ['ranking'], metricas: MEDIDAS, ordenMedida: 'exportacion' }).bloques[0];
  control('varias · se puede elegir qué medida ordena la tabla', filasDe(porExportacion)[0].celdas[1], filasDe(sola('exportacion'))[0].celdas[1]);
  control('varias · toneladas y porcentajes van en gráficos separados, cada uno con su unidad', b.graficos.map((g) => [g.unidad, g.series.map((x) => x.nombre), g.leyenda]), [['t', ['Ventas al cupo', 'Producción', 'Exportaciones'], 'En toneladas'], ['%', ['Cumplimiento del cupo'], 'Cumplimiento del cupo, en porcentaje']]);
  const tope5 = pedir({ ...base, tope: 5, tipos: ['ranking'], metricas: ['ventas_cupo', 'produccion'] }).bloques[0];
  const [resto, total] = [filasDe(tope5, 'resto')[0].celdas, filasDe(tope5, 'total')[0].celdas];
  control('varias · con tope, "Otras" lleva en cada columna lo que falta para su total', [2, 3].map((k) => r0(filasDe(tope5).reduce((t, f) => t + (f.celdas[k] || 0), 0) + resto[k])), [r0(total[2]), r0(total[3])]);
}
{
  // varios tipos: un bloque por cada uno
  const base = { metrica: 'ventas_cupo', agrupar: 'categoria', ...U12, tope: 20, tiempo: 'mes' };
  const { bloques, texto } = pedir({ ...base, tipos: ['total', 'ranking', 'evolucion'] });
  const solo = (tipo) => correr({ ...base, tipo }).r;
  control('varias · ranking, evolución y total tildados: tres bloques, cada uno igual al que da ese tipo solo', [bloques.length, igual(bloques, [solo('ranking'), solo('evolucion'), solo('total')])], [3, true]);
  control('varias · el pedido con varios tipos se dice en una frase', texto, 'Ranking, evolución mes por mes y total de ventas al cupo por categoría · oct 2025 a sep 2026');
  const conComparacion = pedir({ ...base, tipos: ['ranking', 'comparacion'], desde: '2025-01', hasta: '2025-12', desde0: '2024-01', hasta0: '2024-12' });
  control('varias · con ranking y comparación, la frase dice el período y contra cuál se compara', conComparacion.texto, 'Ranking y comparación de ventas al cupo por categoría · 2025 · comparado con 2024');
}
{
  // varias medidas en el tiempo, sin agrupar: una columna por medida
  const base = { desde: '2019-01', hasta: '2026-09', tiempo: 'anio' };
  const { bloques } = pedir({ ...base, tipos: ['evolucion'], metricas: ['corte_real', 'corte_obligatorio'] });
  const sola = (metrica) => correr({ ...base, tipo: 'evolucion', metrica }).r.filas.map((f) => f.celdas[1]);
  const [real, obligatorio] = [sola('corte_real'), sola('corte_obligatorio')];
  control('varias · corte real y obligatorio año por año: las dos columnas de cada medida sola', bloques[0].filas.map((f) => f.celdas.slice(1)), real.map((v, i) => [v, obligatorio[i]]));
  control('varias · comparten unidad: un solo gráfico con una línea por medida', bloques[0].graficos.map((g) => [g.tipo, g.series.map((x) => x.nombre), g.leyenda]), [['lineas', ['Corte real', 'Corte obligatorio'], undefined]]);
  // por fuera: corte.json. El obligatorio del año va ponderado por el gas oil de cada mes (noviembre y diciembre de 2025 fueron al 7%)
  const de2025 = crudo.corte.mensual.filter((x) => x.fecha.startsWith('2025'));
  const go2025 = de2025.reduce((t, x) => t + x.go_m3, 0);
  control('varias · corte real y obligatorio de 2025, juntos: lo mismo que la cuenta por fuera', bloques[0].filas.find((f) => f.celdas[0] === '2025').celdas.slice(1).map(r2), [r2((de2025.reduce((t, x) => t + x.bio_m3, 0) / go2025) * 100), r2((de2025.reduce((t, x) => t + x.obligatorio * x.go_m3, 0) / go2025) * 100)]);
}
{
  // precios: varios productos
  const base = { desde: '2026-01', hasta: '2026-09', tiempo: 'mes' };
  const PRODUCTOS_3 = ['biodiesel', 'gasoil_fosil', 'nafta_fosil'];
  const { bloques } = pedir({ ...base, tipos: ['evolucion'], metricas: ['precio'], productos: PRODUCTOS_3 });
  const sola = (producto) => correr({ ...base, tipo: 'evolucion', metrica: 'precio', producto }).r.filas.map((f) => f.celdas[1]);
  const columnas = PRODUCTOS_3.map(sola);
  control('varias · tres precios mes a mes: cada columna es el precio de ese producto solo', bloques[0].filas.map((f) => f.celdas.slice(1)), columnas[0].map((_, i) => columnas.map((c) => c[i])));
  control('varias · el título junta los productos', [bloques[0].titulo, bloques[0].columnas.map((c) => c.nombre)], ['Precio por litro de biodiésel, gas oil fósil local y nafta fósil', ['Mes', 'Biodiésel ($/l)', 'Gas oil fósil local ($/l)', 'Nafta fósil ($/l)']]);
  const pares = ajustarConsulta({ tipo: 'evolucion', metrica: 'brecha_precio', productos: ['biodiesel', 'bioetanol'], productosBase: ['gasoil_fosil', 'nafta_fosil'], equivalencias: ['por_litro', 'por_energia'] }, ctx).consulta;
  control('varias · en la diferencia de precio sale una medida por cada par de productos y cada forma de comparar', seriesDe(pares).length, 8);
  const mixto = pedir({ ...base, tipos: ['evolucion'], metricas: ['precio', 'brecha_precio'], productos: ['biodiesel', 'gasoil_fosil'], productosBase: ['gasoil_fosil'] }).bloques[0];
  const brecha = correr({ ...base, tipo: 'evolucion', metrica: 'brecha_precio', producto: 'biodiesel', productoBase: 'gasoil_fosil' }).r.filas.map((f) => f.celdas[1]);
  control('varias · los dos precios y su diferencia en la misma tabla: pesos en un gráfico y porcentaje en otro', [mixto.columnas.length, igual(mixto.filas.map((f) => f.celdas[3]), brecha), mixto.graficos.map((g) => g.unidad)], [4, true, ['$/l', '%']]);
  control('varias · el título dice los precios juntos y después la diferencia', mixto.titulo, 'Precio por litro de biodiésel y gas oil fósil local; cuánto más caro es el biodiésel que el gas oil fósil local');
  const soloImpuestos = ajustarConsulta({ tipo: 'evolucion', metricas: ['precio', 'brecha_precio'], productos: ['impuestos_gasoil'] }, ctx).consulta;
  control('regla · la diferencia de precio necesita dos precios: a los impuestos solos se les suma el biodiésel contra el gas oil', [soloImpuestos.productos, soloImpuestos.productosBase, seriesDe(soloImpuestos).length], [['biodiesel', 'impuestos_gasoil'], ['gasoil_fosil'], 3]);
}
{
  // un total y una comparación con varias medidas: una fila por medida
  const base = { desde: '2025-01', hasta: '2025-12', desde0: '2024-01', hasta0: '2024-12' };
  const MEDIDAS = ['ventas_cupo', 'produccion', 'cumplimiento_cupo'];
  const total = pedir({ ...base, tipos: ['total'], metricas: MEDIDAS }).bloques[0];
  const cifra = (metrica) => correr({ ...base, tipo: 'total', metrica }).r.cifra;
  control('varias · un total con tres medidas: una fila y una cifra por medida, las mismas que cada una sola', [total.filas.map((f) => f.celdas[1]), total.cifras.map((c) => [c.valor, c.unidad])], [MEDIDAS.map((k) => cifra(k).valor), MEDIDAS.map((k) => [cifra(k).valor, cifra(k).unidad])]);
  control('varias · cada fila lleva su unidad (toneladas sin decimales, porcentaje con uno)', total.filas.map((f) => [f.celdas[0], f.formatos[1]]), [['Ventas al cupo (t)', { unidad: 't', decimales: 0 }], ['Producción (t)', { unidad: 't', decimales: 0 }], ['Cumplimiento del cupo', { unidad: '%', decimales: 1 }]]);
  const comp = pedir({ ...base, tipos: ['comparacion'], metricas: MEDIDAS }).bloques[0];
  const solas = MEDIDAS.map((metrica) => correr({ ...base, tipo: 'comparacion', metrica }).r.filas[0].celdas);
  control('varias · comparación de tres medidas: inicial, final y diferencia de cada una sola', comp.filas.map((f) => f.celdas.slice(1, 4)), solas.map((c) => c.slice(1, 4)));
  control('varias · la variación va solo en las medidas que no son un porcentaje', comp.filas.map((f) => (f.celdas[4] === null ? null : r1(f.celdas[4]))), [r1(solas[0][4]), r1(solas[1][4]), null]);
  const agrupada = pedir({ ...base, tipos: ['comparacion'], metricas: MEDIDAS, agrupar: 'categoria' }).bloques;
  control('varias · una comparación agrupada con tres medidas: un bloque por medida, igual al de esa medida sola', igual(agrupada, MEDIDAS.map((metrica) => correr({ ...base, tipo: 'comparacion', metrica, agrupar: 'categoria' }).r)), true);
}
{
  // la capacidad es una foto: entra en el ranking, no en la evolución
  const { consulta, avisos, bloques } = pedir({ tipos: ['ranking', 'evolucion'], metricas: ['ventas_cupo', 'capacidad'], agrupar: 'categoria', ...U12, tope: 20, tiempo: 'mes' });
  const evolucion = correr({ tipo: 'evolucion', metrica: 'ventas_cupo', agrupar: 'categoria', ...U12, tope: 20, tiempo: 'mes' }).r;
  control('regla · capacidad y ventas, en ranking y evolución: la capacidad queda fuera de la evolución y se avisa', [consulta.tipos, avisos.length, bloques.length, bloques[0].columnas.length, igual(bloques[1].filas, evolucion.filas), bloques[1].notas[0].startsWith('Capacidad instalada no entra acá')], [['ranking', 'evolucion'], 1, 2, 4, true, true]);
  const mezcla = ajustarConsulta({ tipo: 'evolucion', metricas: ['ventas_cupo', 'corte_real', 'produccion'] }, ctx);
  control('regla · no se mezclan medidas de grupos distintos: quedan las del primero y se avisa', [mezcla.consulta.metricas, mezcla.avisos.some((a) => a.startsWith('Las medidas se combinan dentro de un mismo grupo'))], [['ventas_cupo', 'produccion'], true]);
  const desordenada = ajustarConsulta({ tipos: ['comparacion', 'ranking', 'ranking', 'x'], metricas: ['produccion', 'ventas_cupo'], filtros: { provincia: ['SANTA FE', 'MARTE', 'CHACO', 'SANTA FE'] } }, ctx).consulta;
  control('regla · lo tildado queda en el orden del menú, sin repetidos ni valores que no existen', [desordenada.tipos, desordenada.metricas, desordenada.filtros], [['ranking', 'comparacion'], ['ventas_cupo', 'produccion'], { provincia: ['CHACO', 'SANTA FE'] }]);
}
{
  // todas las combinaciones de dos medidas del mismo grupo, con todas las combinaciones de tipos
  const TIPOS_4 = ['ranking', 'evolucion', 'total', 'comparacion'];
  const subconjuntos = Array.from({ length: 15 }, (_, i) => TIPOS_4.filter((_t, k) => (i + 1) & (1 << k)));
  const claves = Object.keys(METRICAS);
  const pares = claves.flatMap((a, i) => claves.slice(i + 1).filter((b) => METRICAS[b].familia === METRICAS[a].familia).map((b) => [a, b]));
  const malas = [];
  let bloquesVistos = 0;
  for (const metricas of pares) for (const tipos of subconjuntos) for (const agrupar of ['ninguno', 'empresa', 'categoria']) {
    const a = ajustarConsulta({ tipos, metricas, agrupar }, ctx).consulta;
    const bloques = resolverConsulta(a, ctx);
    bloquesVistos += bloques.length;
    if (bloques.some((b) => !b.ok) || !igual(ajustarConsulta(a, ctx).consulta, a)) malas.push(`${metricas.join('+')}/${tipos.join('+')}/${agrupar}`);
  }
  control(`regla · ${pares.length * subconjuntos.length * 3} combinaciones de dos medidas, tipos y agrupación: todos los bloques (${bloquesVistos}) dan un resultado y el control es estable`, malas, []);
}

// ------------------------------------------------------------------ lo que devuelve la IA
{
  const cruda = (extra) => ({
    entendido: 'si', motivo: '', tipo: 'ranking', metrica: 'ventas_cupo', agrupar: 'empresa', tiempo: 'ninguno', sujeto: 'TOTAL', petrolera: 'ninguno',
    periodo: 'anio:2025', periodo_inicial: '', orden: 'mayor', ordenar_por: 'ninguno', tope: null, producto: 'ninguno', producto_base: 'ninguno', equivalencia: 'ninguno', aclaracion: '', ...extra,
  });
  const a = desdeModelo(cruda({}), ctx);
  control('IA · un pedido bien traducido queda listo para el motor', [a.ok, a.consulta.desde, a.consulta.hasta, a.consulta.tope, a.avisos], [true, '2025-01', '2025-12', 20, []]);
  const b = desdeModelo(cruda({ entendido: 'no', metrica: 'ninguno', motivo: 'Eso no está en los datos del sitio.' }), ctx);
  control('IA · si dice que no entendió, no se calcula nada y se muestra el motivo', [b.ok, b.motivo], [false, 'Eso no está en los datos del sitio.']);
  const c = desdeModelo(cruda({ periodo: '' }), ctx);
  control('IA · sin período: últimos 12 meses, y se avisa', [c.consulta.desde, c.consulta.hasta, c.avisos.length], ['2025-10', '2026-09', 1]);
  const d = desdeModelo(cruda({ sujeto: 'categoria:NO INTEGRADA', aclaracion: 'Tomé GRUPO BOJANICH como grupo.' }), ctx);
  control('IA · el sujeto pasa a filtro y la aclaración sale con el nombre público del grupo', [d.consulta.filtros, d.aclaracion.includes('BOJANICH'), d.aclaracion.includes('Grupo Bahía Energía')], [{ categoria: ['NO INTEGRADA'] }, false, true]);
  const e = desdeModelo(cruda({ metrica: 'compras', agrupar: 'empresa', petrolera: 'YPF' }), ctx);
  control('IA · una petrolera escrita a medias se reconoce si hay una sola parecida', e.consulta.filtros.petrolera, ['YPF S.A.']);
  const f = desdeModelo(cruda({ sujeto: 'categoria:NO INTEGRADA+provincia:SANTA FE+provincia:CÓRDOBA' }), ctx);
  control('IA · si el sujeto repite un tipo de filtro (dos provincias), valen las dos', [f.consulta.filtros, f.avisos], [{ categoria: ['NO INTEGRADA'], provincia: ['CÓRDOBA', 'SANTA FE'] }, []]);
  const h = desdeModelo(cruda({ sujeto: 'localidad:ROSARIO' }), ctx);
  control('IA · un pedido que nombra una localidad queda filtrado por ella (antes se perdía sin aviso)', [h.consulta.filtros, h.avisos, describirConsulta(h.consulta, ctx)], [{ localidad: ['ROSARIO'] }, [], 'Ranking de ventas al cupo por empresa · Rosario · 2025']);
  const g = desdeModelo(cruda({ sujeto: 'provincia:SANTA FE+provincia:MARTE' }), ctx);
  control('IA · si una parte del sujeto no existe, no se filtra nada y se avisa', [g.consulta.filtros, g.avisos.length], [{}, 1]);
  control('el esquema de la IA pide todos los campos y no admite otros', [ESQUEMA_CONSULTA.required.length === Object.keys(ESQUEMA_CONSULTA.properties).length, ESQUEMA_CONSULTA.additionalProperties], [true, false]);
}

// ------------------------------------------------------------------ la consigna
{
  const consigna = armarConsignaAnalista(ctx);
  const faltan = [...Object.keys(METRICAS), ...Object.keys(DIMENSIONES)].filter((k) => !consigna.includes(k));
  control('la consigna de la IA nombra todas las medidas y agrupaciones del catálogo', faltan, []);
  // la consigna usa los nombres de los datos (GRUPO BOJANICH) porque la IA tiene que escribir el filtro
  // tal cual está en la base; lo que ve la persona sale siempre con el nombre público (controlado arriba)
  control('la consigna le dice a la IA cómo se llaman en público los grupos, y no lleva rayas largas', [consigna.includes('"Grupo Bahía Energía" es el GRUPO BOJANICH'), /[—–]/.test(consigna)], [true, false]);
  const menus = opcionesDeMenu(ctx);
  const tiposDeSujeto = consigna.match(/con tipo ([^.]+?) y VALOR/)[1].split(/, | o /);
  control('regla · todo tipo de filtro que la consigna le deja usar a la IA tiene su menú en la página', [tiposDeSujeto, tiposDeSujeto.filter((t) => !FILTROS_DE.empresas.includes(t) || !menus[t]?.length)], [['categoria', 'empresa', 'grupo', 'provincia', 'localidad', 'camara'], []]);
  control('los menús de la página muestran los grupos con su nombre público', menus.grupo.map((g) => etiquetaGrupo('grupo', g, ctx)).filter((n) => /BOJANICH|PUCCIARIELLO|GRUPO BOLZ[ÁA]N/.test(n)), []);
}

console.log(fallas ? `\n${fallas} control(es) fallaron` : '\nTodos los controles pasaron');
process.exit(fallas ? 1 : 0);
