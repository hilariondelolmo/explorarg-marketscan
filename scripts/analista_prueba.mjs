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
//     armado (lo que devuelve la IA nunca llega al motor sin pasar por ahí).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { armarContexto, DATOS_DEL_SITIO } from '../src/lib/poligrafo/contexto.js';
import { SENADORES, VOTACION } from '../src/data/mapa-recinto.js';
import { DIMENSIONES, METRICAS, TOPE_MAXIMO } from '../src/lib/analista/catalogo.js';
import { ajustarConsulta, desdeModelo, ESQUEMA_CONSULTA, opcionesDeMenu } from '../src/lib/analista/consulta.js';
import { describirConsulta, ejecutarConsulta, etiquetaGrupo } from '../src/lib/analista/motor.js';
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
  control('regla · un precio no tiene ranking: pasa a evolución, y un período sin datos se cambia por el último que hay', [consulta.tipo, consulta.hasta, avisos.length], ['evolucion', crudo.bioetanol.mensual[crudo.bioetanol.mensual.length - 1][0], 1]);
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
  control('regla · la capacidad no se puede ver en el tiempo: pasa a ranking y avisa', [ev.consulta.tipo, ev.avisos.length], ['ranking', 1]);
}

// ------------------------------------------------------------------ el control de la consulta
{
  const basura = { tipo: 'cualquiera', metrica: 'no_existe', agrupar: 'petrolera', tope: 9999, orden: 'x', filtros: { provincia: 'MARTE', petrolera: 'YPF S.A.' }, desde: '2026-09', hasta: '2025-10' };
  const { consulta } = ajustarConsulta(basura, ctx);
  control('regla · una consulta rota queda en algo que se puede calcular', [consulta.tipo, consulta.metrica, consulta.agrupar, consulta.tope, consulta.orden, consulta.filtros, consulta.desde, consulta.hasta], ['ranking', 'ventas_cupo', 'empresa', TOPE_MAXIMO, 'mayor', {}, '2025-10', '2026-09']);
  control('regla · pasar dos veces por el control no cambia nada', ajustarConsulta(consulta, ctx).consulta, consulta);
  const todas = [];
  for (const metrica of Object.keys(METRICAS)) for (const tipo of ['ranking', 'evolucion', 'total', 'comparacion']) for (const agrupar of ['ninguno', ...Object.keys(DIMENSIONES)]) todas.push({ tipo, metrica, agrupar });
  const malas = todas.filter((q) => {
    const a = ajustarConsulta(q, ctx).consulta;
    return !ejecutarConsulta(a, ctx).ok || JSON.stringify(ajustarConsulta(a, ctx).consulta) !== JSON.stringify(a);
  });
  control(`regla · las ${todas.length} combinaciones de medida, tipo y agrupación dan un resultado`, malas.map((q) => `${q.metrica}/${q.tipo}/${q.agrupar}`), []);
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
  control('IA · el sujeto pasa a filtro y la aclaración sale con el nombre público del grupo', [d.consulta.filtros, d.aclaracion.includes('BOJANICH'), d.aclaracion.includes('Grupo Bahía Energía')], [{ categoria: 'NO INTEGRADA' }, false, true]);
  const e = desdeModelo(cruda({ metrica: 'compras', agrupar: 'empresa', petrolera: 'YPF' }), ctx);
  control('IA · una petrolera escrita a medias se reconoce si hay una sola parecida', e.consulta.filtros.petrolera, 'YPF S.A.');
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
  control('los menús de la página muestran los grupos con su nombre público', menus.grupo.map((g) => etiquetaGrupo('grupo', g, ctx)).filter((n) => /BOJANICH|PUCCIARIELLO|GRUPO BOLZ[ÁA]N/.test(n)), []);
}

console.log(fallas ? `\n${fallas} control(es) fallaron` : '\nTodos los controles pasaron');
process.exit(fallas ? 1 : 0);
