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

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { armarContexto, DATOS_DEL_SITIO } from '../src/lib/poligrafo/contexto.js';
import { SENADORES, VOTACION } from '../src/data/mapa-recinto.js';
import { DIMENSIONES, FILTROS_DE, GRUPOS_PRODUCTO, METRICAS, PRODUCTOS, TOPE_MAXIMO, UNIDADES } from '../src/lib/analista/catalogo.js';
import { MESES_SIN_PRECIO_DE_GASOIL, precioDe } from '../src/lib/analista/productos.js';
import { ajustarConsulta, desdeModelo, ESQUEMA_CONSULTA, opcionesDeMenu } from '../src/lib/analista/consulta.js';
import { describirConsulta, ejecutarConsulta, etiquetaGrupo, resolverConsulta, seriesDe } from '../src/lib/analista/motor.js';
import { armarConsignaAnalista } from '../server/analista/consigna.js';
import { gasoilPorSector, margenesBiodiesel } from '../src/lib/poligrafo/sitio.js';

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
    entendido: 'si', motivo: '', tipos: ['ranking'], metricas: ['ventas_cupo'], agrupar: 'empresa', tiempo: 'ninguno', sujeto: 'TOTAL', petrolera: 'ninguno',
    periodo: 'anio:2025', periodo_inicial: '', orden: 'mayor', ordenar_por: 'ninguno', tope: null, productos: [], producto_base: 'ninguno', equivalencia: 'ninguno', aclaracion: '', ...extra,
  });
  const a = desdeModelo(cruda({}), ctx);
  control('IA · un pedido bien traducido queda listo para el motor', [a.ok, a.consulta.desde, a.consulta.hasta, a.consulta.tope, a.avisos], [true, '2025-01', '2025-12', 20, []]);
  const b = desdeModelo(cruda({ entendido: 'no', metricas: [], motivo: 'Eso no está en los datos del sitio.' }), ctx);
  control('IA · si dice que no entendió, no se calcula nada y se muestra el motivo', [b.ok, b.motivo], [false, 'Eso no está en los datos del sitio.']);
  const c = desdeModelo(cruda({ periodo: '' }), ctx);
  control('IA · sin período: últimos 12 meses, y se avisa', [c.consulta.desde, c.consulta.hasta, c.avisos.length], ['2025-10', '2026-09', 1]);
  const d = desdeModelo(cruda({ sujeto: 'categoria:NO INTEGRADA', aclaracion: 'Tomé GRUPO BOJANICH como grupo.' }), ctx);
  control('IA · el sujeto pasa a filtro y la aclaración sale con el nombre público del grupo', [d.consulta.filtros, d.aclaracion.includes('BOJANICH'), d.aclaracion.includes('Grupo Bahía Energía')], [{ categoria: ['NO INTEGRADA'] }, false, true]);
  const e = desdeModelo(cruda({ metricas: ['compras'], agrupar: 'empresa', petrolera: 'YPF' }), ctx);
  control('IA · una petrolera escrita a medias se reconoce si hay una sola parecida', e.consulta.filtros.petrolera, ['YPF S.A.']);
  const f = desdeModelo(cruda({ sujeto: 'categoria:NO INTEGRADA+provincia:SANTA FE+provincia:CÓRDOBA' }), ctx);
  control('IA · si el sujeto repite un tipo de filtro (dos provincias), valen las dos', [f.consulta.filtros, f.avisos], [{ categoria: ['NO INTEGRADA'], provincia: ['CÓRDOBA', 'SANTA FE'] }, []]);
  const h = desdeModelo(cruda({ sujeto: 'localidad:ROSARIO' }), ctx);
  control('IA · un pedido que nombra una localidad queda filtrado por ella (antes se perdía sin aviso)', [h.consulta.filtros, h.avisos, describirConsulta(h.consulta, ctx)], [{ localidad: ['ROSARIO'] }, [], 'Ranking de ventas al cupo por empresa · Rosario · 2025']);
  const g = desdeModelo(cruda({ sujeto: 'provincia:SANTA FE+provincia:MARTE' }), ctx);
  control('IA · si una parte del sujeto no existe, no se filtra nada y se avisa', [g.consulta.filtros, g.avisos.length], [{}, 1]);
  const i = desdeModelo(cruda({ metricas: ['compras'], agrupar: 'empresa', petrolera: 'YPF S.A.+RAIZEN (ex SHELL)' }), ctx);
  control('IA · dos petroleras unidas con "+": valen las dos', [i.consulta.filtros, i.avisos], [{ petrolera: ['RAIZEN (ex SHELL)', 'YPF S.A.'] }, []]);
  const j = desdeModelo(cruda({ metricas: ['compras'], agrupar: 'empresa', petrolera: 'YPF+PETROLERA DE MARTE' }), ctx);
  control('IA · si una de las petroleras no existe, entra la otra y se avisa', [j.consulta.filtros, j.avisos], [{ petrolera: ['YPF S.A.'] }, ['No encuentro la petrolera «PETROLERA DE MARTE» en los datos del sitio.']]);
  // el pedido escrito con varias medidas, varias clases de respuesta o varios productos (24/11/2026)
  const k = desdeModelo(cruda({ metricas: ['produccion', 'ventas_cupo'] }), ctx);
  const kSolas = ['ventas_cupo', 'produccion'].map((m) => filasDe(correr({ tipo: 'ranking', metrica: m, agrupar: 'empresa', desde: '2025-01', hasta: '2025-12', tope: 60 }).r, 'total')[0].celdas[2]);
  const kJuntas = resolverConsulta({ ...k.consulta, tope: 60 }, ctx);
  control('IA · dos medidas en el pedido: van las dos en una tabla, ordenada por la primera que nombró', [k.consulta.metricas, k.consulta.ordenMedida, k.avisos, kJuntas.length, filasDe(kJuntas[0], 'total')[0].celdas.slice(2).map(r0)], [['ventas_cupo', 'produccion'], 'produccion', [], 1, kSolas.map(r0)]);
  const l = desdeModelo(cruda({ tipos: ['ranking', 'evolucion'], tiempo: 'mes' }), ctx);
  control('IA · dos clases de respuesta en el pedido: un cuadro por cada una', [l.consulta.tipos, l.consulta.tiempo, resolverConsulta(l.consulta, ctx).map((b) => [b.tipo, b.ok])], [['ranking', 'evolucion'], 'mes', [['ranking', true], ['evolucion', true]]]);
  const m = desdeModelo(cruda({ metricas: ['corte_real', 'ventas_cupo', 'corte_obligatorio'], tipos: ['total'], agrupar: 'ninguno' }), ctx);
  control('IA · medidas de dos grupos de datos: quedan las del grupo de la primera y se avisa cuál quedó afuera', [m.consulta.metricas, m.avisos], [['corte_real', 'corte_obligatorio'], ['Quedó afuera lo que sale de otros datos y no se puede combinar con corte real: ventas al cupo. Se pide en otra consulta.']]);
  const n = desdeModelo(cruda({ tipos: ['evolucion'], metricas: ['precio'], agrupar: 'ninguno', tiempo: 'anio', productos: ['biodiesel', 'gasoil_surtidor'], periodo: 'rango:2022-01:2025-12' }), ctx);
  control('IA · el precio de dos productos: una serie por producto', [n.consulta.productos, seriesDe(n.consulta).map((s) => s.producto), resolverConsulta(n.consulta, ctx)[0].ok], [['biodiesel', 'gasoil_surtidor'], ['biodiesel', 'gasoil_surtidor'], true]);
  const o = desdeModelo(cruda({ tipos: [], metricas: ['ventas_cupo', 'ventas_cupo', 'no_existe'] }), ctx);
  control('IA · listas mal armadas (sin tipo, medida repetida o inventada): queda una consulta que se puede calcular', [o.ok, o.consulta.tipos, o.consulta.metricas, o.consulta.ordenMedida], [true, ['ranking'], ['ventas_cupo'], null]);
  const pp = desdeModelo(cruda({ metricas: ['capacidad', 'produccion'], tipos: ['evolucion'], tiempo: 'anio', periodo: '' }), ctx);
  control('IA · la capacidad junto con otra medida en una evolución: se avisa que la capacidad no entra, y el período sí se pide', [pp.consulta.metricas, pp.avisos.length, pp.avisos.some((a) => /Capacidad instalada: el sitio tiene solo la foto/.test(a)), pp.avisos.some((a) => /no decía el período/.test(a))], [['produccion', 'capacidad'], 2, true, true]);
  control('el esquema de la IA pide todos los campos y no admite otros', [ESQUEMA_CONSULTA.required.length === Object.keys(ESQUEMA_CONSULTA.properties).length, ESQUEMA_CONSULTA.additionalProperties], [true, false]);
  // la salida estructurada de la API de Anthropic no admite mínimos ni máximos en listas, números o textos:
  // si el esquema los lleva, el sitio publicado rechaza todos los pedidos (en local no se nota)
  const prohibidas = ['minItems', 'maxItems', 'uniqueItems', 'minimum', 'maximum', 'multipleOf', 'minLength', 'maxLength', 'pattern'];
  const enEsquema = JSON.stringify(ESQUEMA_CONSULTA);
  const listas = ['tipos', 'metricas', 'productos'].map((c) => [ESQUEMA_CONSULTA.properties[c].type, ESQUEMA_CONSULTA.properties[c].items.type, ESQUEMA_CONSULTA.properties[c].items.enum.length > 1]);
  control('regla · en el esquema de la IA, tipos, medidas y productos son listas de valores cerrados, sin restricciones que la API no admite', [listas, prohibidas.filter((c) => enEsquema.includes(`"${c}"`))], [[['array', 'string', true], ['array', 'string', true], ['array', 'string', true]], []]);
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
  // lo que la consigna le pone de ejemplo a la IA tiene que existir en los datos: un ejemplo con un
  // nombre que no está le enseña a escribir filtros que después se caen
  const ejemplos = [...consigna.matchAll(/^Consulta: (\{.*\})$/gm)].map((m) => JSON.parse(m[1]));
  const sujetosDeMuestra = [...consigna.matchAll(/"((?:categoria|empresa|grupo|provincia|localidad|camara):[^"]+)"/g)].map((m) => m[1]);
  // y escrito tal cual: la consigna le pide a la IA el valor "igual que en Valores válidos"
  const partesDe = (sujeto) => (sujeto && sujeto !== 'total' ? sujeto.split('+').map((p) => [p.slice(0, p.indexOf(':')), p.slice(p.indexOf(':') + 1)]) : []);
  const malos = [
    ...ejemplos.flatMap((e) => [...partesDe(e.sujeto), ...(e.petrolera === 'ninguno' ? [] : e.petrolera.split('+').map((p) => ['petrolera', p]))]),
    ...sujetosDeMuestra.flatMap(partesDe),
  ].filter(([tipo, valor]) => !menus[tipo]?.includes(valor)).map(([tipo, valor]) => `${tipo}:${valor}`);
  const noCierran = ejemplos.filter((e) => desdeModelo(e, ctx).ok !== (e.entendido === 'si')).length;
  // cada ejemplo trae los campos del esquema, ni uno más ni uno menos, y valores que el esquema admite
  const cumple = (valor, regla) => (regla.anyOf ? regla.anyOf.some((r) => cumple(valor, r)) : regla.type === 'array' ? Array.isArray(valor) && valor.every((v) => cumple(v, regla.items)) : regla.type === 'null' ? valor === null : typeof valor === regla.type && (!regla.enum || regla.enum.includes(valor)));
  const fueraDeEsquema = ejemplos.filter((e) => !igual(Object.keys(e).sort(), [...ESQUEMA_CONSULTA.required].sort()) || Object.entries(ESQUEMA_CONSULTA.properties).some(([campo, regla]) => !cumple(e[campo], regla))).map((e) => JSON.stringify(e).slice(0, 80));
  control('regla · los ejemplos de la consigna respetan el esquema que se le exige a la IA', fueraDeEsquema, []);
  control(`regla · los ${ejemplos.length} ejemplos de la consigna y sus ${sujetosDeMuestra.length} filtros de muestra usan nombres que están, tal cual, en los datos del sitio`, [ejemplos.length > 8, sujetosDeMuestra.length > 4, noCierran, malos], [true, true, 0, []]);
  const repetidos = sujetosDeMuestra.filter((s) => { const tipos = s.split('+').map((p) => p.split(':')[0]); return new Set(tipos).size < tipos.length; });
  control('regla · la consigna le muestra a la IA que un tipo de filtro se puede repetir (dos provincias, dos localidades) y que las petroleras pueden ser varias', [repetidos.length >= 2, consigna.includes('el tipo se repite'), ejemplos.some((e) => e.petrolera.includes('+'))], [true, true, true]);
  control('los menús de la página muestran los grupos con su nombre público', menus.grupo.map((g) => etiquetaGrupo('grupo', g, ctx)).filter((n) => /BOJANICH|PUCCIARIELLO|GRUPO BOLZ[ÁA]N/.test(n)), []);
}

// ------------------------------------------------------------------ todos los precios del sitio (27/11/2026)
// Pedido de HDO: todo lo que está en las bases de explorarg tiene que poder pedirse.
{
  const G = crudo.gasoilPrecios;
  const K = crudo.gasoilRanking;
  const mes = '2026-09';
  const tc = new Map(K.tc).get(mes);
  const uno = (q) => correr({ tipo: 'total', desde: mes, hasta: mes, ...q }).r.cifra.valor;
  const deRanking = (id, m = mes) => new Map(K.productos.find((p) => p.id === id).serie).get(m);
  const consignaEntera = armarConsignaAnalista(ctx);
  // lo que devuelve la IA, con los campos del esquema
  const cruda = (extra) => ({ entendido: 'si', motivo: '', tipos: ['ranking'], metricas: ['ventas_cupo'], agrupar: 'ninguno', tiempo: 'ninguno', sujeto: 'total', petrolera: 'ninguno', periodo: '', periodo_inicial: '', orden: 'mayor', ordenar_por: 'ninguno', tope: null, productos: [], producto_base: 'ninguno', equivalencia: 'ninguno', unidad: 'ninguno', aclaracion: '', ...extra });

  // por fuera: el relevamiento por canal, ponderado por volumen. Columnas: [mes, canal dist, canal com, vol2, surt2, conimp2, sinimp2, vol3, surt3, conimp3, sinimp3]
  const im = G.meses.indexOf(mes);
  const MAY = G.canales_distribucion.indexOf('Mayorista');
  const ponderado = (filas, vol, precio) => {
    const con = filas.filter((f) => f[vol] && f[precio]);
    return con.reduce((t, f) => t + f[vol] * f[precio], 0) / con.reduce((t, f) => t + f[vol], 0);
  };
  const mayoristas = G.canales.filter((f) => f[0] === im && f[1] === MAY);
  control('precios · gas oil mayorista (grado 2, sin impuestos): el ponderado del canal mayorista hecho por fuera', r2(uno({ metrica: 'precio', producto: 'gasoil_mayorista' })), r2(ponderado(mayoristas, 3, 6)));
  control('precios · gas oil mayorista: es el mismo precio del que sale el gas oil fósil, antes de descontar el biodiésel', r2(uno({ metrica: 'precio', producto: 'gasoil_mayorista' })), r2(ctx.precios.de(mes).mezcla));
  control('precios · gas oil mayorista con impuestos y grado 3 mayorista, por fuera', [r2(uno({ metrica: 'precio', producto: 'gasoil_mayorista_con_impuestos' })), r2(uno({ metrica: 'precio', producto: 'gasoil_g3_mayorista' })), r2(uno({ metrica: 'precio', producto: 'gasoil_g3_mayorista_con_impuestos' }))], [r2(ponderado(mayoristas, 3, 5)), r2(ponderado(mayoristas, 7, 10)), r2(ponderado(mayoristas, 7, 9))]);
  control('dato · septiembre de 2026: gas oil mayorista 1.608,19 $/l sin impuestos y 2.251,34 con impuestos', [r2(uno({ metrica: 'precio', producto: 'gasoil_mayorista' })), r2(uno({ metrica: 'precio', producto: 'gasoil_mayorista_con_impuestos' }))], [1608.19, 2251.34]);

  // el surtidor y las estaciones, contra las series que ya publica el Ranking de precios del sitio (en dólares por tonelada)
  const espejo = { gasoil_surtidor: 'go2_surtidor', gasoil_estaciones_sin_impuestos: 'go2_sin_imp', gasoil_g3_surtidor: 'go3_surtidor', gasoil_g3_estaciones_sin_impuestos: 'go3_sin_imp' };
  const lejos = Object.entries(espejo).flatMap(([mio, suyo]) =>
    K.productos.find((p) => p.id === suyo).serie.filter(([m, v]) => {
      const x = precioDe(mio, m, 'dolares_tonelada', ctx);
      return x !== null && Math.abs(x / v - 1) > 0.005;
    }).map(([m]) => `${mio} ${m}`)
  );
  control('precios · el gas oil de las estaciones, en dólares por tonelada, da lo mismo que las series del Ranking de precios (todos los meses, a menos de 0,5%)', lejos, []);

  // las unidades: la misma cifra, pasada a mano
  const brent = deRanking('brent');
  control('unidades · el Brent viene en dólares por metro cúbico: sin conversión es el dato del informe', uno({ metrica: 'precio', producto: 'crudo_brent', unidad: 'dolares_m3' }), brent);
  control('unidades · el Brent por barril (6,2898 por m³), por tonelada (0,835 t/m³) y en pesos por litro (tipo de cambio del mes)', [r2(uno({ metrica: 'precio', producto: 'crudo_brent', unidad: 'dolares_barril' })), r2(uno({ metrica: 'precio', producto: 'crudo_brent', unidad: 'dolares_tonelada' })), r2(uno({ metrica: 'precio', producto: 'crudo_brent', unidad: 'pesos_litro' }))], [r2(brent / 6.2898), r2(brent / 0.835), r2((brent * tc) / 1000)]);
  control('unidades · el biodiésel en dólares por tonelada es el precio oficial tal como lo publica la serie', r2(uno({ metrica: 'precio', producto: 'biodiesel', unidad: 'dolares_tonelada' })), deRanking('bio_963_m'));
  control('unidades · el gas oil mayorista en dólares por litro y por tonelada (0,845 t/m³)', [r2(uno({ metrica: 'precio', producto: 'gasoil_mayorista', unidad: 'dolares_litro' }) * 1000), r2(uno({ metrica: 'precio', producto: 'gasoil_mayorista', unidad: 'dolares_tonelada' }))], [r2((ponderado(mayoristas, 3, 6) / tc) * 1000), r2((ponderado(mayoristas, 3, 6) / tc) * 1000 / K.densidad_go)]);
  const formula = K.res963.find((x) => x.fecha === mes);
  control('unidades · el biodiésel por fórmula viene en pesos por tonelada: sin conversión, y en pesos por litro con la densidad 0,885', [uno({ metrica: 'precio', producto: 'biodiesel_formula', unidad: 'pesos_tonelada' }), r2(uno({ metrica: 'precio', producto: 'biodiesel_formula', unidad: 'pesos_litro' }))], [formula.formula, r2((formula.formula * crudo.corte.densidad_bio) / 1000)]);
  const etanol = correr({ tipo: 'total', metrica: 'precio', producto: 'bioetanol', unidad: 'dolares_tonelada', desde: mes, hasta: mes }).r;
  control('unidades · el bioetanol no se pasa a toneladas: el sitio no tiene su densidad, y se dice', [etanol.ok, /bioetanol/i.test(etanol.motivo ?? '')], [false, true]);

  // el resto de las series, contra el JSON
  const naftas = Object.fromEntries(crudo.naftas.campos.map((c, i) => [c, crudo.naftas.mensual.find((f) => f[0] === mes)[i]]));
  const [, icl, iclExento, ico2] = crudo.iclIco2.gasoil.find((f) => f[0] === mes);
  control('precios · nafta premium (mayorista y surtidor) y nafta súper mayorista: las columnas del relevamiento', [uno({ metrica: 'precio', producto: 'nafta_premium_mayorista' }), uno({ metrica: 'precio', producto: 'nafta_premium_surtidor' }), uno({ metrica: 'precio', producto: 'nafta_mayorista' })], [naftas.premium_mayorista_sin_imp, naftas.premium_surtidor, naftas.super_mayorista_sin_imp]);
  control('precios · los impuestos del gas oil por separado suman el total', [uno({ metrica: 'precio', producto: 'icl_gasoil' }), uno({ metrica: 'precio', producto: 'ico2_gasoil' }), uno({ metrica: 'precio', producto: 'icl_gasoil_zona_exenta' }), r2(uno({ metrica: 'precio', producto: 'impuestos_gasoil' }))], [icl, ico2, iclExento, r2(icl + ico2)]);
  const [, cana, maiz] = crudo.bioetanol.mensual.find((f) => f[0] === mes);
  control('precios · bioetanol de caña y de maíz por separado', [uno({ metrica: 'precio', producto: 'bioetanol_cana' }), uno({ metrica: 'precio', producto: 'bioetanol_maiz' })], [cana, maiz]);
  const importado = K.importaciones.find((x) => x.fecha === '2026-08');
  control('precios · gas oil importado en origen (FOB), en dólares por tonelada', correr({ tipo: 'total', metrica: 'precio', producto: 'gasoil_importado_fob', desde: '2026-08', hasta: '2026-08' }).r.cifra.valor, importado.fob_usd_ton);
  control('precios · tipo de cambio y retenciones: los del sitio', [uno({ metrica: 'tipo_cambio' }), r2(uno({ metrica: 'retencion_aceite' })), r2(uno({ metrica: 'retencion_biodiesel' }))], [tc, r2(crudo.evidencia.retenciones.find((x) => x.fecha === mes).sbo * 100), r2(crudo.evidencia.retenciones.find((x) => x.fecha === mes).sme * 100)]);

  // diferencias de precio entre series que vienen en unidades distintas
  const aceite = deRanking('aceite_fas');
  control('diferencia · biodiésel contra aceite de soja, tonelada contra tonelada: los dos precios en dólares por tonelada', r2(uno({ metrica: 'brecha_precio', producto: 'biodiesel', productoBase: 'aceite_fas', equivalencia: 'por_tonelada' })), r2((deRanking('bio_963_m') / aceite - 1) * 100));
  control('diferencia · gas oil mayorista (pesos por litro) contra Brent (dólares por m³), litro contra litro', r2(uno({ metrica: 'brecha_precio', producto: 'gasoil_mayorista', productoBase: 'crudo_brent' })), r2(((ponderado(mayoristas, 3, 6) * 1000) / (brent * tc) - 1) * 100));
  const energia = correr({ tipo: 'total', metrica: 'brecha_precio', producto: 'biodiesel', productoBase: 'aceite_fas', equivalencia: 'por_energia', desde: mes, hasta: mes }).r;
  control('regla · a igual energía solo entre combustibles: del aceite el sitio no tiene el contenido energético', [energia.ok, energia.motivo], [false, 'El sitio no tiene el contenido energético de esos productos.']);

  // la unidad que se elige cuando el pedido no la dice
  const unidadDe = (productos, unidad) => ajustarConsulta({ tipo: 'evolucion', metrica: 'precio', productos, unidad }, ctx);
  control('regla · sin unidad pedida: pesos por litro para los combustibles del país, dólares por m³ para los crudos, dólares por tonelada para el aceite', [unidadDe(['biodiesel', 'gasoil_mayorista']).consulta.unidad, unidadDe(['crudo_brent', 'crudo_medanito']).consulta.unidad, unidadDe(['aceite_fas']).consulta.unidad], ['pesos_litro', 'dolares_m3', 'dolares_tonelada']);
  const mezcla = unidadDe(['gasoil_mayorista', 'crudo_brent']);
  control('regla · si se mezclan precios en unidades distintas, van todos a dólares por tonelada y se avisa', [mezcla.consulta.unidad, mezcla.avisos.filter((a) => a.includes('unidades distintas')).length], ['dolares_tonelada', 1]);
  control('regla · la unidad pedida se respeta, y una vez elegida no se vuelve a avisar', [unidadDe(['gasoil_mayorista', 'crudo_brent'], 'dolares_barril').consulta.unidad, ajustarConsulta(mezcla.consulta, ctx).avisos.filter((a) => a.includes('unidades distintas')).length], ['dolares_barril', 0]);
  control('regla · una consulta guardada antes de este cambio (sin unidad) se sigue viendo en pesos por litro', [ajustarConsulta({ tipos: ['evolucion'], metricas: ['precio'], productos: ['biodiesel', 'gasoil_fosil'], productosBase: [], equivalencias: [] }, ctx).consulta.unidad, ajustarConsulta({ tipo: 'ranking', metrica: 'ventas_cupo' }, ctx).consulta.unidad], ['pesos_litro', null]);

  // varios precios juntos, con el dólar al lado
  const juntos = pedir({ tipos: ['evolucion'], metricas: ['precio', 'tipo_cambio'], productos: ['gasoil_mayorista', 'crudo_brent'], unidad: 'dolares_tonelada', tiempo: 'mes', desde: '2026-01', hasta: '2026-09' }).bloques[0];
  control('varias · gas oil mayorista, Brent y el dólar en una tabla: cada columna con su unidad y un gráfico por unidad', [juntos.columnas.map((c) => c.nombre), juntos.graficos.map((g) => g.unidad)], [['Mes', 'Gas oil mayorista (US$/t)', 'Crudo Brent (US$/t)', 'Tipo de cambio ($/US$)'], ['US$/t', '$/US$']]);
  control('varias · el título dice por qué cantidad va el precio', juntos.titulo, 'Precio por tonelada de gas oil mayorista y crudo Brent; tipo de cambio');
  control('la consulta se dice en palabras, también con una nafta (en femenino)', correr({ tipo: 'total', metrica: 'brecha_precio', producto: 'nafta_surtidor', productoBase: 'bioetanol', desde: mes, hasta: mes }).r.titulo, 'Cuánto más cara es la nafta en el surtidor que el bioetanol');
  control('notas · al pasar de unidad se dice con qué densidad y con qué tipo de cambio', [juntos.notas.some((n) => n.includes('gas oil y diésel 0,845') && n.includes('crudos 0,835')), juntos.notas.some((n) => n.includes('tipo de cambio promedio de cada mes')), juntos.notas.some((n) => n.includes('provisorios'))], [true, true, true]);

  // los meses que el sitio deja sin precio de gas oil
  const gasoilJs = readFileSync(path.join(raiz, 'src/lib/gasoil.js'), 'utf8');
  const delSitio = gasoilJs.match(/MESES_ANOMALOS = new Set\(\[([^\]]+)\]\)/)[1].match(/\d{4}-\d{2}/g);
  control('regla · los meses sin precio de gas oil son los mismos que en las páginas del sitio (src/lib/gasoil.js)', MESES_SIN_PRECIO_DE_GASOIL, delSitio);
  const oct2010 = correr({ tipo: 'evolucion', metrica: 'precio', productos: ['gasoil_surtidor', 'gasoil_mayorista', 'biodiesel'], tiempo: 'mes', desde: '2010-09', hasta: '2010-11' });
  const b2010 = resolverConsulta(oct2010.consulta, ctx)[0];
  // las columnas van en el orden del catálogo: biodiésel, gas oil mayorista y gas oil en el surtidor
  control('regla · en octubre de 2010 no hay precio de gas oil (sí de biodiésel), y la nota dice por qué', [b2010.filas.map((f) => f.celdas.slice(1).map((v) => v !== null)), b2010.notas.some((n) => n.includes('2010-10') && n.includes('anómalos'))], [[[true, true, true], [true, false, false], [true, true, true]], true]);
  control('regla · un precio de pocos pesos (2010) se muestra con decimales, y uno de miles, sin', [correr({ tipo: 'total', metrica: 'precio', producto: 'gasoil_mayorista', desde: '2010-09', hasta: '2010-09' }).r.cifra.decimales, correr({ tipo: 'total', metrica: 'precio', producto: 'gasoil_mayorista', desde: mes, hasta: mes }).r.cifra.decimales], [2, 0]);

  // desde la IA
  const ia = desdeModelo(cruda({ tipos: ['evolucion'], metricas: ['precio'], tiempo: 'mes', productos: ['biodiesel', 'gasoil_mayorista'], periodo: 'anio:2026', unidad: 'ninguno' }), ctx);
  control('IA · "el precio del biodiésel y el del gas oil mayorista": dos columnas en pesos por litro, sin avisos', [ia.ok, resolverConsulta(ia.consulta, ctx)[0].columnas.map((c) => c.nombre), ia.avisos], [true, ['Mes', 'Biodiésel ($/l)', 'Gas oil mayorista ($/l)'], []]);
  const iaUsd = desdeModelo(cruda({ tipos: ['total'], metricas: ['precio'], productos: ['crudo_brent'], periodo: 'mes:2026-09', unidad: 'dolares_barril' }), ctx);
  control('IA · "el Brent por barril": la unidad que pide', [iaUsd.consulta.unidad, r2(resolverConsulta(iaUsd.consulta, ctx)[0].cifra.valor)], ['dolares_barril', r2(brent / 6.2898)]);

  // ---- que no falte nada: toda serie de precio de los JSON tiene su producto en el Analista
  const usados = (clave) => new Set(Object.values(PRODUCTOS).map((p) => p.de[clave]).filter(Boolean).map((x) => (typeof x === 'string' ? x : JSON.stringify(x))));
  // las que entran por otro camino: el biodiésel oficial es el producto "biodiesel", y las cuatro de gas oil
  // precalculadas son las del relevamiento (controladas arriba contra los productos de las estaciones)
  // aceite_fas_minagri: el FAS teórico oficial se toma de "comparados" (aceite_minagri), que es el de la página Márgenes
  const POR_OTRO_CAMINO = ['bio_963_m', 'go2_surtidor', 'go2_sin_imp', 'go3_surtidor', 'go3_sin_imp', 'aceite_fas_minagri'];
  control('cobertura · todas las series de gasoil_ranking.json (productos) se pueden pedir', K.productos.map((p) => p.id).filter((id) => !usados('ranking').has(id) && !POR_OTRO_CAMINO.includes(id)), []);
  // metanol_ypf de "comparados" es la misma serie que metanol_ypf de "productos" (se controla acá abajo)
  control('cobertura · todas las series de gasoil_ranking.json (comparados) se pueden pedir', K.comparados.map((p) => p.id).filter((id) => !usados('comparado').has(id) && id !== 'metanol_ypf'), []);
  const serieDe = (lista, id) => new Map(lista.find((p) => p.id === id).serie);
  const distintos = (a, b) => [...a].filter(([m, v]) => b.has(m) && Math.abs(b.get(m) - v) > 0.005).map(([m]) => m);
  control('cobertura · el metanol de YPF de "comparados" es el mismo de "productos", mes por mes', distintos(serieDe(K.productos, 'metanol_ypf'), serieDe(K.comparados, 'metanol_ypf')), []);
  // Las dos series del FAS teórico del aceite no son idénticas: el sitio las calcula por dos caminos. Si al
  // regenerar los datos cambia esta lista, revisar cuál usa el Analista (hoy, la de Márgenes).
  control('dato · el FAS teórico del aceite del Ranking difiere del de Márgenes en siete meses', distintos(serieDe(K.productos, 'aceite_fas_minagri'), serieDe(K.comparados, 'aceite_minagri')), ['2020-01', '2024-07', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
  const base = usados('base');
  control('cobertura · las columnas de naftas, bioetanol e impuestos', [
    crudo.naftas.campos.filter((c) => c !== 'fecha' && !c.startsWith('m3_') && !usados('naftas').has(c) && !({ super_mayorista_sin_imp: base.has('naftaMezcla'), super_surtidor: base.has('nafta_surtidor') })[c]),
    crudo.bioetanol.campos.filter((c) => !['fecha', 'publicado'].includes(c) && !base.has({ cana: 'bioetanolCana', maiz: 'bioetanolMaiz' }[c])),
    crudo.iclIco2.campos.filter((c) => c !== 'fecha' && !usados('impuestos').has(c) && !base.has(c)),
  ], [[], [], []]);
  control('cobertura · los grupos del menú: todo producto tiene grupo, y ningún grupo queda vacío', [Object.entries(PRODUCTOS).filter(([, p]) => !GRUPOS_PRODUCTO[p.grupo]).map(([k]) => k), Object.keys(GRUPOS_PRODUCTO).filter((g) => !Object.values(PRODUCTOS).some((p) => p.grupo === g))], [[], []]);
  const sinDatos = Object.keys(PRODUCTOS).filter((k) => !correr({ tipo: 'evolucion', metrica: 'precio', producto: k, tiempo: 'anio', desde: '2010-01', hasta: '2026-12' }).r.ok);
  control(`cobertura · los ${Object.keys(PRODUCTOS).length} productos del catálogo tienen datos y se pueden calcular`, sinDatos, []);
  const enDolaresT = Object.keys(PRODUCTOS).filter((k) => PRODUCTOS[k].densidad !== 'bioetanol' && !correr({ tipo: 'evolucion', metrica: 'precio', producto: k, unidad: 'dolares_tonelada', tiempo: 'anio', desde: '2010-01', hasta: '2026-12' }).r.ok);
  control('cobertura · todos (menos el bioetanol) se pueden pasar a dólares por tonelada', enDolaresT, []);
  control('la consigna de la IA nombra todos los productos y todas las unidades', [...Object.keys(PRODUCTOS), ...Object.keys(UNIDADES)].filter((k) => !consignaEntera.includes(`- ${k}: `)), []);

  // ---- el inventario: cada archivo de datos del sitio, o lo usa el Analista, o está anotado acá con el motivo.
  // Un archivo nuevo en src/data hace fallar este control hasta que se decida qué se hace con él.
  const LO_USA = ['empresas', 'mercado', 'corte', 'capacidad', 'precio_aceite_rosario', 'datos_tecnicos', 'gasoil_precios', 'gasoil_ranking', 'icl_ico2', 'naftas_precios', 'bioetanol_precios', 'compras_cupo', 'evidencia', 'petroleras', 'go_sectores'];
  const PENDIENTES = {
    // bases con números que el Analista todavía no calcula (están en las páginas del sitio)
    gestion: 'secretarios de Energía, presidencias y fórmulas de precio (Cumplimiento Corte)',
    dashboard: 'los mismos números de mercado.json y empresas.json, ya agregados para la portada',
    diputados_corte_anual: 'corte anual, ya cubierto por corte.json',
    dicho_dato_art39: 'planilla del artículo 39 (topes de la media sanción): la usa el Polígrafo',
    plantas_aceite: 'plantas aceiteras: ubicación y capacidad (mapa de plantas)',
    refinerias: 'refinerías: ubicación (mapa de plantas)',
  };
  const NO_SON_BASES = ['article-content', 'articles', 'dicho_dato', 'diputados_ley_bases_2024', 'diputados_videos', 'mapa_argentina', 'poligrafo_ejemplos', 'poligrafo_normas', 'puertos', 'rutas_aceiteras', 'rutas_puertos', 'rutas_refinerias', 'timeline', 'tutoriales'];
  const archivos = readdirSync(path.join(raiz, 'src/data')).filter((a) => a.endsWith('.json')).map((a) => a.slice(0, -5));
  const sinAnotar = archivos.filter((a) => !LO_USA.includes(a) && !PENDIENTES[a] && !NO_SON_BASES.includes(a) && !/^situacion_/.test(a));
  control('inventario · cada archivo de src/data, o lo usa el Analista, o está anotado como pendiente o como texto', sinAnotar, []);
  // la lista de archivos que lee la función publicada (api/analista.js) tiene que ser esa misma
  const enLaFuncion = readFileSync(path.join(raiz, 'api/analista.js'), 'utf8').match(/const ARCHIVOS = \[([^\]]+)\]/)[1].match(/'([^']+)'/g).map((x) => DATOS_DEL_SITIO[x.slice(1, -1)]);
  control('inventario · lo que usa el Analista es lo que lee la función publicada', [[...LO_USA].sort(), enLaFuncion.includes(undefined)], [[...enLaFuncion].sort(), false]);
  // además de src/data, el sitio tiene datos que las páginas bajan aparte (public/data): el Analista todavía no los usa
  const PUBLICOS_PENDIENTES = {
    'gasoil_retail.json': 'precio y volumen del gas oil por provincia, bandera y canal (Gas Oil, Ventas)',
    'gasoil_sesco.json': 'ventas de combustibles por provincia, empresa y sector (Tablas SESCO)',
    'gasoil_productos.json': 'precios del relevamiento por producto y canal, con los filtros del Ranking',
    'gasoil_importaciones.json': 'importaciones de gas oil por importador y país',
    'gasoil_terminales.json': 'terminales de despacho (mapa)',
    'gasoil_bocas': 'precio por boca de expendio',
    'gasoil_mes': 'bocas relevadas en cada mes (mapa)',
    'mapa_mundo.json': 'mapa, no son datos de mercado',
  };
  control('inventario · cada archivo de public/data está anotado', readdirSync(path.join(raiz, 'public/data')).filter((a) => !a.startsWith('.') && !PUBLICOS_PENDIENTES[a]), []);
}

// ------------------------------------------------------------------ márgenes del biodiésel y precio del gas oil por canal (27/11/2026)
{
  const K = crudo.gasoilRanking;
  const G = crudo.gasoilPrecios;
  const A25 = { desde: '2025-01', hasta: '2025-12' };
  // los márgenes: la cuenta del sitio (espejo de la página /margenes que usa el Polígrafo)
  const M = margenesBiodiesel(K).promedio(A25.desde, A25.hasta);
  const margenes = pedir({ tipos: ['total'], metricas: ['margen_biodiesel', 'margen_biodiesel_pct', 'crack_biodiesel', 'crack_biodiesel_pct'], ...A25 }).bloques[0];
  control('márgenes · margen y crack spread del biodiésel en 2025: los promedios de la página Márgenes', margenes.filas.map((f) => r2(f.celdas[1])), [r2(M.margen), r2(M.margenPct), r2(M.crack), r2(M.crackPct)]);
  control('dato · 2025: margen del biodiésel sobre el aceite de 289,65 dólares por tonelada (26,65%) y crack spread de 215,77', margenes.filas.map((f) => r2(f.celdas[1])).slice(0, 3), [289.65, 26.65, 215.77]);
  const lado = pedir({ tipos: ['evolucion'], metricas: ['precio', 'margen_biodiesel'], productos: ['biodiesel', 'aceite_fas_teorico'], unidad: 'dolares_tonelada', tiempo: 'mes', desde: '2024-01', hasta: '2026-09' }).bloques[0];
  control('márgenes · en la misma tabla, biodiésel menos aceite da el margen, todos los meses', [lado.columnas.map((c) => c.nombre), lado.filas.filter((f) => Math.abs(f.celdas[1] - f.celdas[2] - f.celdas[3]) > 0.02).map((f) => f.celdas[0])], [['Mes', 'Biodiésel (US$/t)', 'Aceite de soja FAS teórico oficial (US$/t)', 'Margen del biodiésel sobre el aceite (US$/t)'], []]);
  control('márgenes · enlazan a la página Márgenes', margenes.fuentes.map((f) => f.ruta), ['/margenes']);

  // el precio por canal: el relevamiento, ponderado por volumen, hecho por fuera
  const mes = '2026-09';
  const im = G.meses.indexOf(mes);
  const fila = (dist, canal) => G.canales.find((f) => f[0] === im && G.canales_distribucion[f[1]] === dist && G.canales_comercializacion[f[2]] === canal);
  const porCanal = correr({ tipo: 'ranking', metrica: 'precio_canal', agrupar: 'canal', filtros: { distribucion: ['Mayorista'] }, desde: mes, hasta: mes }).r;
  control('canales · precio mayorista al agro y al transporte de cargas: las celdas del relevamiento', [celda(porCanal, 'Agro', 2), celda(porCanal, 'Transporte de cargas', 2)], [fila('Mayorista', 'Agro')[6], fila('Mayorista', 'Transporte de cargas')[6]]);
  control('canales · todos los canales mayoristas juntos dan el producto "gas oil mayorista"', r2(filasDe(porCanal, 'total')[0].celdas[2]), r2(correr({ tipo: 'total', metrica: 'precio', producto: 'gasoil_mayorista', desde: mes, hasta: mes }).r.cifra.valor));
  const dosCanales = G.canales.filter((f) => f[0] === im && G.canales_distribucion[f[1]] === 'Mayorista' && ['Agro', 'Transporte de cargas'].includes(G.canales_comercializacion[f[2]]));
  const juntos = correr({ tipo: 'total', metrica: 'precio_canal_g3_con_impuestos', filtros: { distribucion: ['Mayorista'], canal: ['Agro', 'Transporte de cargas'] }, desde: mes, hasta: mes });
  control('canales · dos canales tildados: el ponderado por volumen de los dos (grado 3 con impuestos), por fuera', [r2(juntos.r.cifra.valor), juntos.texto], [r2(dosCanales.reduce((t, f) => t + f[7] * f[9], 0) / dosCanales.reduce((t, f) => t + f[7], 0)), 'Total de precio del gas oil según el canal (grado 3, con impuestos) · canal mayorista · venta a: agro y transporte de cargas · sep 2026']);
  const porDistribucion = pedir({ tipos: ['ranking'], metricas: ['precio_canal', 'precio_canal_con_impuestos'], agrupar: 'distribucion', desde: mes, hasta: mes }).bloques[0];
  control('canales · mayorista y minorista, con y sin impuestos, en una tabla', [porDistribucion.titulo, porDistribucion.columnas.map((c) => c.nombre), filasDe(porDistribucion).length], ['Precio del gas oil según el canal: grado 2 sin impuestos y grado 2 con impuestos', ['#', 'Canal de distribución', 'grado 2 sin impuestos ($/l)', 'grado 2 con impuestos ($/l)'], 2]);
  control('canales · en octubre de 2010 no hay precio (mes anómalo del relevamiento) y se dice', (() => { const r = correr({ tipo: 'evolucion', metrica: 'precio_canal', tiempo: 'mes', desde: '2010-09', hasta: '2010-11' }).r; return [r.filas.map((f) => f.celdas[1] !== null), r.notas.some((n) => n.includes('2010-10'))]; })(), [[true, false, true], true]);
  const cruda = (extra) => ({ entendido: 'si', motivo: '', tipos: ['ranking'], metricas: ['precio_canal'], agrupar: 'ninguno', tiempo: 'ninguno', sujeto: 'total', petrolera: 'ninguno', periodo: 'mes:2026-09', periodo_inicial: '', orden: 'mayor', ordenar_por: 'ninguno', tope: null, productos: [], producto_base: 'ninguno', equivalencia: 'ninguno', unidad: 'ninguno', aclaracion: '', ...extra });
  const ia = desdeModelo(cruda({ agrupar: 'sector', sujeto: 'distribucion:mayorista+sector:Agro+canal:Transporte de cargas' }), ctx);
  control('IA · en los precios por canal, "sector" se lee como canal de venta', [ia.consulta.agrupar, ia.consulta.filtros, ia.avisos], ['canal', { distribucion: ['Mayorista'], canal: ['Agro', 'Transporte de cargas'] }, []]);
  const menus = opcionesDeMenu(ctx);
  const consigna = armarConsignaAnalista(ctx);
  control('regla · los canales del menú son los del relevamiento y la consigna los nombra', [igual(menus.canal, G.canales_comercializacion), igual(menus.distribucion, G.canales_distribucion), menus.canal.filter((c) => !consigna.includes(c))], [true, true, []]);
}

// ------------------------------------------------------------------ gas oil: ventas, importaciones y corte de cada petrolera (27/11/2026)
{
  const S = crudo.goSectores;
  const P = crudo.petroleras;
  const C = crudo.corte;
  const en = (f, p) => f >= p.desde && f <= p.hasta;
  const filasDeBloque = (q) => { const { r } = correr(q); return r; };

  // ---- ventas por sector: la misma cuenta que usa el Polígrafo (espejo de la página), y por fuera
  const porSector = filasDeBloque({ tipo: 'ranking', metrica: 'gasoil_ventas', agrupar: 'sector', ...U12, tope: 60 });
  const delSitio = gasoilPorSector(S, U12.desde, U12.hasta);
  control('gas oil · ventas por sector: los mismos sectores, metros cúbicos y porcentajes que el dato del sitio', filasDe(porSector).map((f) => [f.celdas[1] === 'Sin sector informado' ? 'S/N' : f.celdas[1], r0(f.celdas[2]), r2(f.celdas[3])]), delSitio.filas.map((f) => [f.sector, r0(f.m3), r2(f.pct)]));
  const totalPorFuera = S.mensual_total.filter((m) => en(m.fecha, U12)).reduce((t, m) => t + Object.entries(m).reduce((a, [k, v]) => a + (k === 'fecha' ? 0 : v), 0), 0);
  control('gas oil · ventas por sector: el total es la suma de todos los sectores del JSON', r0(filasDe(porSector, 'total')[0].celdas[2]), r0(totalPorFuera));
  control('dato · últimos 12 meses: 14.592.452 m³ de gas oil, 49,02% al público y 20,12% al agro', [r0(filasDe(porSector, 'total')[0].celdas[2]), r2(celda(porSector, 'Al Público', 3)), r2(celda(porSector, 'Agro', 3))], [14592452, 49.02, 20.12]);

  // ---- por petrolera: las identificadas más "Otras empresas" dan el mismo total
  const porPetrolera = filasDeBloque({ tipo: 'ranking', metrica: 'gasoil_ventas', agrupar: 'vendedora', ...U12, tope: 60 });
  const identificadas = S.mensual_petrolera.filter((m) => en(m.fecha, U12)).reduce((t, m) => t + Object.entries(m).reduce((a, [k, v]) => a + (k === 'fecha' || k === 'petrolera' ? 0 : v), 0), 0);
  control('gas oil · ventas por petrolera: mismo total que por sector, y «Otras empresas» es el total menos las identificadas', [r0(filasDe(porPetrolera, 'total')[0].celdas[2]), r0(celda(porPetrolera, 'Otras empresas', 2))], [r0(totalPorFuera), r0(totalPorFuera - identificadas)]);
  const ypf = S.mensual_petrolera.find((m) => m.fecha === '2026-09' && m.petrolera === 'YPF S.A.');
  const ypfAgroCarga = correr({ tipo: 'total', metrica: 'gasoil_ventas', filtros: { vendedora: ['YPF S.A.'], sector: ['Agro', 'Transporte de Carga'] }, desde: '2026-09', hasta: '2026-09' });
  control('gas oil · una petrolera y dos sectores: la suma de esas dos celdas del JSON, y la consulta lo dice', [ypfAgroCarga.r.cifra.valor, ypfAgroCarga.texto], [ypf.Agro + ypf['Transporte de Carga'], 'Total de ventas de gas oil · YPF S.A. · sectores agro y transporte de carga · sep 2026']);
  const soloAgro = filasDeBloque({ tipo: 'ranking', metrica: 'gasoil_ventas', agrupar: 'vendedora', filtros: { sector: ['Agro'] }, ...U12, tope: 60 });
  control('gas oil · por petrolera dentro de un sector: suma lo que ese sector tiene en el total', r0(filasDe(soloAgro, 'total')[0].celdas[2]), r0(celda(porSector, 'Agro', 2)));

  // ---- el corte de cada petrolera: la cuenta del tablero Cumplimiento Corte, Petroleras, hecha por fuera
  const O = new Map(C.mensual.map((m) => [m.fecha, m.obligatorio]));
  const go = new Map();
  const req = new Map();
  const bio = new Map();
  for (const fila of P.go_mensual.filter((m) => en(m.fecha, U12))) for (const [p, v] of Object.entries(fila)) if (p !== 'fecha') { go.set(p, (go.get(p) || 0) + v); req.set(p, (req.get(p) || 0) + v * O.get(fila.fecha)); }
  for (const fila of P.mensual.filter((m) => en(m.fecha, U12))) for (const [p, t] of Object.entries(fila)) if (p !== 'fecha' && t) bio.set(p, (bio.get(p) || 0) + t);
  const conCupo = new Set(P.cumplimiento.filter((x) => en(x.fecha, U12) && x.cupo > 0).map((x) => x.petrolera));
  const delTablero = [...go.keys()].filter((p) => conCupo.has(p)).map((p) => [p, r2((bio.get(p) || 0) / C.densidad_bio / go.get(p) * 100), r1((bio.get(p) || 0) / C.densidad_bio / req.get(p) * 100), r0(Math.max(0, (req.get(p) - (bio.get(p) || 0) / C.densidad_bio) * C.densidad_bio))]).sort((a, b) => a[0].localeCompare(b[0]));
  const tabla = pedir({ tipos: ['ranking'], metricas: ['gasoil_petrolera', 'biodiesel_petrolera', 'corte_petrolera', 'cumplimiento_petrolera', 'faltante_petrolera'], agrupar: 'vendedora', ...U12, tope: 60 }).bloques[0];
  const conCorte = filasDe(tabla).filter((f) => typeof f.celdas[4] === 'number').map((f) => [f.celdas[1], r2(f.celdas[4]), r1(f.celdas[5]), r0(f.celdas[6])]).sort((a, b) => a[0].localeCompare(b[0]));
  control('petroleras · corte real, cumplimiento y biodiésel que faltó de cada una: la cuenta del tablero hecha por fuera', conCorte, delTablero);
  control('petroleras · sin cupo no se le mide el corte (revendedoras), y la nota lo dice', [filasDe(tabla).filter((f) => typeof f.celdas[4] !== 'number').map((f) => f.celdas[1]).sort(), tabla.notas.some((n) => n.includes('revendedoras'))], [[...go.keys()].filter((p) => !conCupo.has(p)).concat('Otras empresas').sort(), true]);
  control('petroleras · el título no repite "por petrolera" y las columnas llevan el nombre corto', [tabla.titulo, tabla.columnas.map((c) => c.nombre)], ['Gas oil vendido, biodiésel comprado, corte real, cumplimiento del corte y biodiésel que faltó de las petroleras', ['#', 'Petrolera', 'Gas oil vendido (m³)', 'Biodiésel comprado (t)', 'Corte real', 'Cumplimiento del corte', 'Biodiésel que faltó (t)']]);
  const vendidoPais = correr({ tipo: 'total', metrica: 'gasoil_vendido', ...U12 }).r.cifra.valor;
  control('petroleras · el gas oil de todas (con «Otras empresas») es el gas oil vendido del país, sin bunker ni usinas', r0(filasDe(tabla, 'total')[0].celdas[2]), r0(vendidoPais));
  const comprasPorPetrolera = filasDeBloque({ tipo: 'ranking', metrica: 'compras', agrupar: 'petrolera', ...U12, tope: 60 });
  // los dos archivos redondean cada mes por su lado: en doce meses puede haber una tonelada de diferencia
  const deCompras = new Map(filasDe(comprasPorPetrolera).map((f) => [f.celdas[1], f.celdas[2]]));
  const comprado = filasDe(tabla).filter((f) => typeof f.celdas[3] === 'number');
  control('petroleras · el biodiésel comprado es el de la medida compras, petrolera por petrolera (a menos de 2 t)', [comprado.length, comprado.filter((f) => Math.abs(f.celdas[3] - (deCompras.get(f.celdas[1]) ?? 0)) > 2).map((f) => f.celdas[1])], [8, []]);
  const faltaTotal = correr({ tipo: 'total', metrica: 'faltante_petrolera', ...U12 }).r.cifra.valor;
  control('petroleras · lo que faltó, sin agrupar, es la suma de lo que le faltó a cada una', r0(faltaTotal), r0(filasDe(tabla).reduce((t, f) => t + (typeof f.celdas[6] === 'number' ? f.celdas[6] : 0), 0)));
  control('dato · últimos 12 meses: Trafigura cumplió 73,6% del corte y le faltaron 18.442 t; Refinor, 103,4%', [conCorte.find((x) => x[0].startsWith('TRAFIGURA')).slice(2), conCorte.find((x) => x[0].startsWith('REFINERÍA DEL NORTE'))[2]], [[73.6, 18442], 103.4]);
  control('petroleras · una sola medida: "Corte real de las petroleras", ordenado y con enlace al tablero', (() => { const r = filasDeBloque({ tipo: 'ranking', metrica: 'corte_petrolera', agrupar: 'vendedora', ...U12 }); return [r.titulo, r.fuente.ruta, filasDe(r).length]; })(), ['Corte real de las petroleras', '/gestion/petroleras', delTablero.length]);

  // ---- importaciones
  const A12 = { desde: '2025-09', hasta: '2026-08' };
  const imp = crudo.gasoilRanking.importaciones.filter((m) => en(m.fecha, A12));
  const ton = imp.reduce((t, m) => t + m.ton, 0);
  const vendido = C.mensual.filter((m) => en(m.fecha, A12)).reduce((t, m) => t + m.go_m3, 0);
  const importado = pedir({ tipos: ['total'], metricas: ['gasoil_importado', 'gasoil_importado_pct'], ...A12 }).bloques[0];
  control('importaciones · toneladas de los despachos y porcentaje sobre el gas oil vendido (densidad 0,845), por fuera', [r0(importado.filas[0].celdas[1]), r2(importado.filas[1].celdas[1])], [r0(ton), r2((ton / crudo.gasoilRanking.densidad_go / vendido) * 100)]);
  control('dato · septiembre de 2025 a agosto de 2026: 319.464 t importadas, 2,73% del gas oil vendido', [r0(importado.filas[0].celdas[1]), r2(importado.filas[1].celdas[1])], [319464, 2.73]);
  const conMesSinDato = correr({ tipo: 'total', metrica: 'gasoil_importado', ...U12 });
  control('importaciones · si el período pasa del último mes cargado, cuenta lo que hay y lo avisa', [r0(conMesSinDato.r.cifra.valor), conMesSinDato.r.notas.some((n) => n.includes('Hay importaciones cargadas hasta ago 2026'))], [r0(crudo.gasoilRanking.importaciones.filter((m) => en(m.fecha, U12)).reduce((t, m) => t + m.ton, 0)), true]);

  // ---- desde la IA
  const cruda = (extra) => ({ entendido: 'si', motivo: '', tipos: ['ranking'], metricas: ['gasoil_ventas'], agrupar: 'ninguno', tiempo: 'ninguno', sujeto: 'total', petrolera: 'ninguno', periodo: 'anio:2025', periodo_inicial: '', orden: 'mayor', ordenar_por: 'ninguno', tope: null, productos: [], producto_base: 'ninguno', equivalencia: 'ninguno', unidad: 'ninguno', aclaracion: '', ...extra });
  const a = desdeModelo(cruda({ agrupar: 'petrolera' }), ctx);
  control('IA · "por petrolera" en las ventas de gas oil es la que vende, no la que compra biodiésel', [a.consulta.agrupar, a.avisos], ['vendedora', []]);
  const b = desdeModelo(cruda({ tipos: ['total'], sujeto: 'sector:agro+sector:Transporte de Carga', petrolera: 'YPF' }), ctx);
  control('IA · sectores en el sujeto y una petrolera: quedan como filtros del gas oil', [b.consulta.filtros, b.avisos], [{ sector: ['Agro', 'Transporte de Carga'], vendedora: ['YPF S.A.'] }, []]);
  const c = desdeModelo(cruda({ sujeto: 'sector:Minería', petrolera: 'Petrolera Inventada' }), ctx);
  control('IA · un sector o una petrolera que no están en las ventas de gas oil: se avisa y no se filtra', [c.consulta.filtros, c.avisos.length], [{}, 2]);
  const d = desdeModelo(cruda({ metricas: ['compras'], agrupar: 'vendedora', petrolera: 'YPF S.A.' }), ctx);
  control('IA · al revés: en las compras de biodiésel la petrolera es la compradora', [d.consulta.agrupar, d.consulta.filtros], ['petrolera', { petrolera: ['YPF S.A.'] }]);

  // ---- los nombres de la consigna y de los menús salen de los datos
  const consigna = armarConsignaAnalista(ctx);
  const menus = opcionesDeMenu(ctx);
  control('regla · los sectores y las petroleras del menú son los de los datos, y la consigna los nombra a todos', [igual(menus.sector, S.sectores), menus.vendedora.filter((p) => !consigna.includes(p)), S.sectores.filter((x) => !consigna.includes(x)), menus.vendedora.length], [true, [], [], 10]);
  control('regla · la consigna ya no manda a otra página por lo que el Analista ahora calcula', [/Cuánto gas oil se vendió por sector/.test(consigna.slice(consigna.indexOf('todavía no calcula'))), /cumplimiento del corte de cada petrolera/i.test(consigna.slice(consigna.indexOf('todavía no calcula'), consigna.indexOf('# Vocabulario')))], [false, false]);
}

console.log(fallas ? `\n${fallas} control(es) fallaron` : '\nTodos los controles pasaron');
process.exit(fallas ? 1 : 0);
