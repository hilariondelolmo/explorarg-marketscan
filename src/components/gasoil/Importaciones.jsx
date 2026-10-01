import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { cargarImportaciones, cargarMapaMundo } from '../../lib/gasoil.js';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import { useCajas, Cajas, DropdownMulti, mismas } from './relevamiento.jsx';
import MapaMundo from './MapaMundo.jsx';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import './GasOil.css';

const ESCALAS = [
  ['todos', 'Todos los despachos'],
  ['directo', 'Origen = procedencia'],
  ['escala', 'Con escala (origen ≠ procedencia)'],
];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const TRIMESTRES = ['1er trim.', '2do trim.', '3er trim.', '4to trim.'];
const MAX_AREAS = 7; // importadores con área propia en el acumulado; el resto va en "Otros"
const ROTULO_SIN_CAMMESA = 'Sin CAMMESA';

const decimales = (v, n) => v.toLocaleString('es-AR', { minimumFractionDigits: n, maximumFractionDigits: n });
const millones = (usd) => `U$ ${decimales(usd / 1e6, usd >= 1e9 ? 0 : 1)} M`;
// Eje: "35 K", "1,2 M"
const eje = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`
  : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)} K` : fmt.int(v));
const precio = (a) => (a && a.ton ? a.cif / a.ton : null);
const enLista = (lista, nexo) => (lista.length < 2 ? lista.join('') : `${lista.slice(0, -1).join(', ')} ${nexo} ${lista.at(-1)}`);

function Encabezado({ seccion }) {
  return (
    <>
      <p className="section-kicker">Mercado Gas Oil</p>
      <h2>{seccion?.title ?? 'Gas oil importado'}</h2>
      {seccion?.intro && <p className="section-intro">{seccion.intro}</p>}
    </>
  );
}

/** Tarjeta del año: valor grande, una línea secundaria y la variación contra el año anterior. */
function TarjetaAnio({ label, valor, unidad, sub, delta, pp, contra, tono, title }) {
  return (
    <div className={`kpi-card ${tono ? `tone-${tono}` : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-val" title={title}>
        {valor}{unidad && <> <span className="kpi-unidad">{unidad}</span></>}
      </div>
      <div className="kpi-sub">
        {delta == null ? 'sin dato comparable' : (
          <>
            <span className={delta >= 0 ? 'delta-pos' : 'delta-neg'}>
              {delta >= 0 ? '▲' : '▼'}{pp ? `${decimales(Math.abs(delta), 1)} pp` : fmt.pct(Math.abs(delta))}
            </span>
            {' '}vs. {contra}
          </>
        )}
      </div>
      {sub && <div className="kpi-sub go-kpi-nota">{sub}</div>}
    </div>
  );
}

/**
 * Gas oil importado por despacho aduanero (pedido de HDO del 30/09/2026):
 * réplica de los tableros GO IMPORTS (mapa de flujos y tablas por importador
 * y por procedencia), GO IMPORTS II (procedencia por trimestre e importador
 * por mes) y GO IMPORTS III (acumulado del año por importador y egreso de
 * dólares) del workbook 05. La fuente es el cruce mes × importador × país de
 * origen × país de procedencia de scripts/gasoil_importaciones.py.
 *
 * Cálculos, los del workbook: toneladas = kilos netos / 1000; precio = CIF /
 * toneladas (usd/ton); m³ = toneladas / 0,845; usd/m³ = usd/ton × 0,845. El
 * tablero deja afuera a CAMMESA (importa para las usinas) con el filtro de
 * importador: acá la página arranca sin ella y el filtro la deja tildar. Abre
 * en el último año con datos. Las tablas por importador y por procedencia
 * ignoran el filtro de su propio nivel (como las de Estructura del mercado):
 * clic en una fila deja solo esa categoría en el resto de la página, otro
 * clic la suelta. El mapa y las tablas de período responden a todos los
 * filtros.
 */
export default function Importaciones({ seccion }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    Promise.all([cargarImportaciones(), cargarMapaMundo()]).then(setDatos).catch((e) => setError(e.message));
  }, []);
  if (datos) return <Despachos D={datos[0]} M={datos[1]} seccion={seccion} />;
  return (
    <div className="go-seccion">
      <div className="go-sticky"><Encabezado seccion={seccion} /></div>
      <div className="section-placeholder">{error || 'Cargando los despachos de importación…'}</div>
    </div>
  );
}

function Despachos({ D, M, seccion }) {
  const C = useChartColors();
  const K = useMemo(() => {
    const anioDe = D.meses.map((m) => Number(m.slice(0, 4)));
    const mesDe = D.meses.map((m) => Number(m.slice(5, 7)));
    const anios = [...new Set(anioDe)].sort();
    const todos = D.importadores.map((_, i) => i);
    const sinCammesa = todos.filter((i) => i !== D.cammesa);
    const filasAnio = new Map(anios.map((a) => [a, []]));
    for (let r = 0; r < D.filas; r++) filasAnio.get(anioDe[D.mes[r]]).push(r);
    return { anioDe, mesDe, anios, todos, sinCammesa, filasAnio };
  }, [D]);
  const ULTIMO_ANIO = K.anios.at(-1);
  const ULTIMO_MES = Number(D.ultimo_mes.slice(5, 7));
  const rotuloAnio = (a) => (a === ULTIMO_ANIO && ULTIMO_MES < 12 ? `${a} (ene a ${MESES_CORTOS[ULTIMO_MES - 1]})` : String(a));

  const [anio, setAnio] = useState(ULTIMO_ANIO);
  const [importadores, setImportadores] = useState(() => new Set(K.sinCammesa)); // abre sin CAMMESA (HDO 30/09/2026)
  const [baseImp, setBaseImp] = useState(K.sinCammesa); // adonde vuelve la tabla al soltar un importador
  const [origenes, setOrigenes] = useState(null);       // null = todos; si no, índices de D.paises
  const [procedencias, setProcedencias] = useState(null);
  const [escala, setEscala] = useState('todos');
  const [abiertos, alternar] = useCajas({ resultado: true, mapa: true, tablas: true, periodos: false, dolares: true });
  const [tablaPeriodo, setTablaPeriodo] = useState('procedencia'); // 'procedencia' (trimestres) | 'importador' (meses)

  const ultimoMesAnio = anio === ULTIMO_ANIO ? ULTIMO_MES : 12;
  const ACCIONES_IMP = [['Todos', K.todos], [ROTULO_SIN_CAMMESA, K.sinCammesa, 'Todos menos CAMMESA, que importa para las usinas'], ['Ninguno', []]];
  const cambiarImportadores = (n) => {
    setImportadores(n);
    if (mismas(n, K.todos)) setBaseImp(K.todos);
    else if (mismas(n, K.sinCammesa)) setBaseImp(K.sinCammesa);
  };

  // Países con despachos en el año (cualquier importador), para los filtros
  const paisesAnio = useMemo(() => {
    const o = new Set();
    const p = new Set();
    for (const r of K.filasAnio.get(anio)) {
      o.add(D.ori[r]);
      p.add(D.pro[r]);
    }
    const orden = (s) => [...s].sort((x, y) => D.paises[x].nombre.localeCompare(D.paises[y].nombre, 'es'));
    return { ori: orden(o), pro: orden(p) };
  }, [D, K, anio]);
  const opcionesOri = useMemo(
    () => [...paisesAnio.ori, ...(origenes ? [...origenes].filter((i) => !paisesAnio.ori.includes(i)) : [])],
    [paisesAnio, origenes],
  );
  const opcionesPro = useMemo(
    () => [...paisesAnio.pro, ...(procedencias ? [...procedencias].filter((i) => !paisesAnio.pro.includes(i)) : [])],
    [paisesAnio, procedencias],
  );
  // Con todas las opciones tildadas no hay filtro
  const cambiarOrigenes = (n) => setOrigenes(opcionesOri.every((i) => n.has(i)) ? null : n);
  const cambiarProcedencias = (n) => setProcedencias(opcionesPro.every((i) => n.has(i)) ? null : n);

  // Predicados de cada filtro. Las tablas ignoran el de su propio nivel: la
  // de importadores lista los de la base (Todos o Sin CAMMESA) aunque haya
  // uno elegido, y la de procedencias lista todas.
  const pasaImp = (r) => importadores.has(D.imp[r]);
  const enBase = (r) => baseImp.includes(D.imp[r]);
  const pasaOri = (r) => !origenes || origenes.has(D.ori[r]);
  const pasaPro = (r) => !procedencias || procedencias.has(D.pro[r]);
  const pasaEscala = (r) => escala === 'todos' || (escala === 'directo') === (D.ori[r] === D.pro[r]);
  const filtrar = (rows, { sinImp = false, sinPro = false } = {}) => rows.filter((r) => (
    (sinImp ? enBase(r) : pasaImp(r)) && pasaOri(r) && (sinPro || pasaPro(r)) && pasaEscala(r)
  ));
  const deps = [D, K, anio, importadores, baseImp, origenes, procedencias, escala];
  const filas = useMemo(() => filtrar(K.filasAnio.get(anio)), deps);
  const filasSinImp = useMemo(() => filtrar(K.filasAnio.get(anio), { sinImp: true }), deps);
  const filasSinPro = useMemo(() => filtrar(K.filasAnio.get(anio), { sinPro: true }), deps);
  // El año anterior, con los mismos filtros y hasta el mismo mes si el año está en curso
  const filasPrev = useMemo(
    () => filtrar(K.filasAnio.get(anio - 1) || []).filter((r) => K.mesDe[D.mes[r]] <= ultimoMesAnio),
    [...deps, ultimoMesAnio],
  );

  const agregar = (rows, clave) => {
    const m = new Map();
    for (const r of rows) {
      const k = clave(r);
      let a = m.get(k);
      if (!a) {
        a = { ton: 0, cif: 0, n: 0 };
        m.set(k, a);
      }
      a.ton += D.ton[r];
      a.cif += D.cif[r];
      a.n += D.n[r];
    }
    return m;
  };
  const total = (rows) => {
    const t = { ton: 0, cif: 0, n: 0 };
    for (const r of rows) {
      t.ton += D.ton[r];
      t.cif += D.cif[r];
      t.n += D.n[r];
    }
    return t;
  };
  const ordenar = (m, nombre) => [...m.entries()].map(([k, a]) => ({ k, nombre: nombre(k), ...a })).sort((x, y) => y.ton - x.ton);
  const dens = D.densidad_go;

  // ------------------------------------------------------------ resultado
  const tot = useMemo(() => total(filas), [filas]);
  const totPrev = useMemo(() => total(filasPrev), [filasPrev]);
  const conEscala = useMemo(() => total(filas.filter((r) => D.ori[r] !== D.pro[r])).ton, [filas]);
  const conEscalaPrev = useMemo(() => total(filasPrev.filter((r) => D.ori[r] !== D.pro[r])).ton, [filasPrev]);
  const variacion = (v, base) => (v == null || base == null || base === 0 ? null : (v / base - 1) * 100);
  const contra = `${rotuloAnio(anio - 1)}`.replace(String(anio - 1), String(anio - 1)) + (anio === ULTIMO_ANIO && ULTIMO_MES < 12 ? ` (ene a ${MESES_CORTOS[ULTIMO_MES - 1]})` : '');
  const pctEscala = tot.ton ? (conEscala / tot.ton) * 100 : null;
  const pctEscalaPrev = totPrev.ton ? (conEscalaPrev / totPrev.ton) * 100 : null;

  // ------------------------------------------------------------ mapa
  const pais = (i) => D.paises[i];
  const mapaDatos = useMemo(() => {
    const porPro = agregar(filas, (r) => D.pro[r]);
    const porOri = agregar(filas, (r) => D.ori[r]);
    const porFlujo = agregar(filas.filter((r) => D.ori[r] !== D.pro[r]), (r) => `${D.ori[r]}-${D.pro[r]}`);
    return {
      procedencias: [...porPro.entries()].map(([i, a]) => ({ ...pais(i), ...a })),
      origenes: [...porOri.entries()].map(([i, a]) => ({ ...pais(i), ...a })),
      flujos: [...porFlujo.entries()].map(([k, a]) => {
        const [o, p] = k.split('-').map(Number);
        return { ori: pais(o), pro: pais(p), ...a };
      }),
    };
  }, [filas]);
  const elegidosMapa = {
    pro: procedencias ? new Set([...procedencias].map((i) => pais(i).iso)) : null,
    ori: origenes ? new Set([...origenes].map((i) => pais(i).iso)) : null,
  };
  const idxIso = useMemo(() => new Map(D.paises.map((p, i) => [p.iso, i])), [D]);
  // Clic en el mapa: deja solo ese país en su filtro; otro clic lo suelta
  const elegirPais = (iso, tipo) => {
    const i = idxIso.get(iso);
    if (tipo === 'pro') setProcedencias(procedencias?.size === 1 && procedencias.has(i) ? null : new Set([i]));
    else setOrigenes(origenes?.size === 1 && origenes.has(i) ? null : new Set([i]));
  };

  // ------------------------------------------------------------ tablas
  const tablaImp = useMemo(() => ordenar(agregar(filasSinImp, (r) => D.imp[r]), (i) => D.importadores[i].nombre), [filasSinImp]);
  const tablaPro = useMemo(() => ordenar(agregar(filasSinPro, (r) => D.pro[r]), (i) => pais(i).nombre), [filasSinPro]);
  const totImp = useMemo(() => total(filasSinImp), [filasSinImp]);
  const totPro = useMemo(() => total(filasSinPro), [filasSinPro]);
  const impActiva = (r) => importadores.size === 1 && importadores.has(r.k);
  const proActiva = (r) => procedencias?.size === 1 && procedencias.has(r.k);
  const elegirImp = (r) => cambiarImportadores(new Set(impActiva(r) ? baseImp : [r.k]));
  const elegirPro = (r) => setProcedencias(proActiva(r) ? null : new Set([r.k]));

  // Tablas de período: procedencia por trimestre (cuatro columnas) e
  // importador por mes (hasta doce), con las toneladas y el precio CIF
  const periodos = useMemo(() => {
    const porPro = tablaPeriodo === 'procedencia';
    const rows = porPro ? filasSinPro : filasSinImp;
    const nCols = porPro ? 4 : ultimoMesAnio;
    const col = (r) => (porPro ? Math.floor((K.mesDe[D.mes[r]] - 1) / 3) : K.mesDe[D.mes[r]] - 1);
    const dim = porPro ? (r) => D.pro[r] : (r) => D.imp[r];
    const nombre = porPro ? (i) => pais(i).nombre : (i) => D.importadores[i].nombre;
    const celdas = new Map();
    for (const r of rows) {
      const k = dim(r);
      let c = celdas.get(k);
      if (!c) {
        c = { k, nombre: nombre(k), cols: Array.from({ length: nCols }, () => ({ ton: 0, cif: 0 })), ton: 0, cif: 0 };
        celdas.set(k, c);
      }
      const j = col(r);
      c.cols[j].ton += D.ton[r];
      c.cols[j].cif += D.cif[r];
      c.ton += D.ton[r];
      c.cif += D.cif[r];
    }
    const filasT = [...celdas.values()].sort((x, y) => y.ton - x.ton);
    const totCols = Array.from({ length: nCols }, (_, j) => ({
      ton: filasT.reduce((s, f) => s + f.cols[j].ton, 0), cif: filasT.reduce((s, f) => s + f.cols[j].cif, 0),
    }));
    const tt = { ton: filasT.reduce((s, f) => s + f.ton, 0), cif: filasT.reduce((s, f) => s + f.cif, 0) };
    const encabezados = porPro ? TRIMESTRES : MESES_CORTOS.slice(0, nCols).map((m) => `${m} ${String(anio).slice(2)}`);
    return { porPro, filas: filasT, totCols, total: tt, encabezados };
  }, [filasSinPro, filasSinImp, tablaPeriodo, ultimoMesAnio, anio]);

  // ------------------------------------------------------------ egreso de dólares
  // Acumulado del año por importador (áreas apiladas) y dólares acumulados (línea)
  const acumulado = useMemo(() => {
    const porImp = ordenar(agregar(filas, (r) => D.imp[r]), (i) => D.importadores[i].nombre);
    const principales = porImp.slice(0, MAX_AREAS);
    const otros = porImp.slice(MAX_AREAS);
    const series = [...principales.map((p) => ({ k: p.k, nombre: p.nombre, ton: p.ton, cif: p.cif }))];
    if (otros.length) {
      series.push({
        k: 'otros', nombre: `Otros (${otros.length})`, ton: otros.reduce((s, o) => s + o.ton, 0), cif: otros.reduce((s, o) => s + o.cif, 0),
        ids: new Set(otros.map((o) => o.k)),
      });
    }
    const idxSerie = new Map();
    series.forEach((s, j) => { if (s.ids) s.ids.forEach((i) => idxSerie.set(i, j)); else idxSerie.set(s.k, j); });
    const mensual = Array.from({ length: ultimoMesAnio }, () => ({ tons: new Float64Array(series.length), cif: 0 }));
    for (const r of filas) {
      const m = K.mesDe[D.mes[r]] - 1;
      mensual[m].tons[idxSerie.get(D.imp[r])] += D.ton[r];
      mensual[m].cif += D.cif[r];
    }
    const pts = [];
    const acum = new Float64Array(series.length);
    let usd = 0;
    for (let m = 0; m < ultimoMesAnio; m++) {
      usd += mensual[m].cif;
      const p = { mes: `${MESES_CORTOS[m]} ${String(anio).slice(2)}`, usd, total: 0 };
      series.forEach((s, j) => {
        acum[j] += mensual[m].tons[j];
        p[`s${j}`] = acum[j];
        p.total += acum[j];
      });
      pts.push(p);
    }
    return { series, pts };
  }, [filas, ultimoMesAnio, anio]);
  const COLORES = [C.exp, C.oil, C.bio, C.warn, C.violeta, C.celeste, C.alert, C.neutral];
  const colorSerie = (s, j) => (s.k === 'otros' ? C.neutral : COLORES[j % COLORES.length]);

  // ------------------------------------------------------------ etiquetas
  const todosImp = importadores.size === D.importadores.length;
  const sinCammesa = mismas(importadores, K.sinCammesa);
  const elegidosImp = D.importadores.map((im, i) => ({ ...im, i })).filter(({ i }) => importadores.has(i));
  const resumenImp = todosImp ? 'Todos'
    : sinCammesa ? ROTULO_SIN_CAMMESA
      : elegidosImp.length === 1 ? elegidosImp[0].nombre
        : elegidosImp.length ? `${elegidosImp.length} importadores` : 'Ninguno';
  const etiquetaImp = todosImp ? '' : sinCammesa ? 'sin CAMMESA' : elegidosImp.length <= 2 && elegidosImp.length ? elegidosImp.map((e) => e.nombre).join(' + ') : resumenImp.toLowerCase();
  const nombresDe = (sel) => (sel ? [...sel].map((i) => pais(i).nombre).sort((a, b) => a.localeCompare(b, 'es')) : []);
  const resumenPaises = (sel, vacio) => (!sel ? 'Todos' : sel.size === 1 ? nombresDe(sel)[0] : sel.size ? `${sel.size} países` : vacio);
  const etiquetaPaises = (sel, rotulo) => (!sel ? '' : sel.size <= 2 && sel.size ? `${rotulo} ${enLista(nombresDe(sel), 'y')}` : `${rotulo} ${resumenPaises(sel, 'ningún país').toLowerCase()}`);
  const etiquetaEscala = escala === 'todos' ? '' : escala === 'directo' ? 'origen = procedencia' : 'con escala';
  const etiquetaFiltro = [etiquetaImp, etiquetaPaises(origenes, 'origen'), etiquetaPaises(procedencias, 'procedencia'), etiquetaEscala].filter(Boolean).join(' · ');
  const alcance = `${rotuloAnio(anio)}${etiquetaFiltro ? ` · ${etiquetaFiltro}` : ''}`;

  const cajas = [
    { id: 'resultado', titulo: 'Resultado del año', detalle: `${rotuloAnio(anio)} · ${fmt.int(tot.ton)} t · ${precio(tot) != null ? `${fmt.int(precio(tot))} usd/ton` : 'sin despachos'}` },
    { id: 'mapa', titulo: 'Mapa de flujos', detalle: `${mapaDatos.procedencias.length} países de procedencia · ${mapaDatos.origenes.length} de origen` },
    { id: 'tablas', titulo: 'Por importador y procedencia', detalle: `${tablaImp.length} importadores · ${tablaPro.length} procedencias · ton, usd/ton, m³ y usd/m³` },
    { id: 'periodos', titulo: 'Trimestres y meses', detalle: 'Procedencia por trimestre e importador por mes' },
    { id: 'dolares', titulo: 'Egreso de dólares', detalle: `Acumulado ${rotuloAnio(anio)}: ${fmt.int(tot.ton)} t · ${millones(tot.cif)}` },
  ];

  const filaTabla = (r, totalBase, activa, elegir) => (
    <tr key={r.k} className={activa(r) ? 'activa' : ''} onClick={() => elegir(r)}>
      <td>{r.nombre}</td>
      <td className="num">{fmt.int(r.ton)}</td>
      <td className="num">{fmt.int(precio(r))}</td>
      <td className="num">{fmt.int(r.ton / dens)}</td>
      <td className="num">{fmt.int(precio(r) * dens)}</td>
      <td className="num">{fmt.pct(totalBase.ton ? (r.ton / totalBase.ton) * 100 : 0)}</td>
    </tr>
  );
  const tablaDoble = (titulo, filasT, t, activa, elegir) => (
    <div>
      <h4>{titulo}</h4>
      <div className="mh-tabla-scroll">
        <table className="mh-tabla go-tabla">
          <thead>
            <tr><th>{titulo}</th><th className="num">ton</th><th className="num">usd/ton</th><th className="num">m³</th><th className="num">usd/m³</th><th className="num">Partic.</th></tr>
          </thead>
          <tbody>{filasT.map((r) => filaTabla(r, t, activa, elegir))}</tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="num">{fmt.int(t.ton)}</td>
              <td className="num">{fmt.int(precio(t))}</td>
              <td className="num">{fmt.int(t.ton / dens)}</td>
              <td className="num">{fmt.int(precio(t) * dens)}</td>
              <td className="num">{fmt.pct(t.ton ? 100 : 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
  const celda = (c, campo) => (c.ton ? (campo === 'ton' ? fmt.int(c.ton) : fmt.int(c.cif / c.ton)) : '');
  const activaPeriodo = (r) => (periodos.porPro ? proActiva(r) : impActiva(r));
  const elegirPeriodo = (r) => (periodos.porPro ? elegirPro(r) : elegirImp(r));

  const TooltipAcumulado = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">Acumulado a {label}</div>
        {acumulado.series.map((s, j) => (p[`s${j}`] ? (
          <div key={s.k} className="chart-tooltip-row">
            <span className="chart-tooltip-swatch" style={{ background: colorSerie(s, j) }} />
            <span>{s.nombre}</span><strong>{fmt.int(p[`s${j}`])} t</strong>
          </div>
        ) : null))}
        <div className="chart-tooltip-row"><span>Total</span><strong>{fmt.int(p.total)} t</strong></div>
        <div className="chart-tooltip-row"><span>Egreso de dólares</span><strong>{millones(p.usd)}</strong></div>
      </div>
    );
  };

  return (
    <div className="go-seccion go-sesco go-imp">
      <div className="go-sticky">
        <Encabezado seccion={seccion} />
        <div className="go-filtros go-filtros-imp">
          <div className="go-filtro go-f-mes">
            <label htmlFor="imp-anio">Año</label>
            <select id="imp-anio" className="empresa-select" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
              {[...K.anios].reverse().map((a) => <option key={a} value={a}>{rotuloAnio(a)}</option>)}
            </select>
          </div>
          <div className="go-filtro go-f-band">
            <span className="go-filtro-label">Importador</span>
            <DropdownMulti
              opciones={K.todos} seleccion={importadores} resumen={resumenImp} onCambiar={cambiarImportadores}
              rotulo={(i) => D.importadores[i].nombre} acciones={ACCIONES_IMP}
            />
          </div>
          <div className="go-filtro go-f-ori">
            <span className="go-filtro-label">País de origen</span>
            <DropdownMulti
              opciones={opcionesOri} seleccion={origenes ?? new Set(opcionesOri)} resumen={resumenPaises(origenes, 'Ninguno')}
              onCambiar={cambiarOrigenes} rotulo={(i) => pais(i).nombre} acciones={[['Todos', null], ['Ninguno', []]]} clase="go-prov-panel"
            />
          </div>
          <div className="go-filtro go-f-prov">
            <span className="go-filtro-label">País de procedencia</span>
            <DropdownMulti
              opciones={opcionesPro} seleccion={procedencias ?? new Set(opcionesPro)} resumen={resumenPaises(procedencias, 'Ninguno')}
              onCambiar={cambiarProcedencias} rotulo={(i) => pais(i).nombre} acciones={[['Todos', null], ['Ninguno', []]]} clase="go-prov-panel"
            />
          </div>
          <div className="go-filtro go-f-escala">
            <label htmlFor="imp-escala">Origen y procedencia</label>
            <select id="imp-escala" className="empresa-select" value={escala} onChange={(e) => setEscala(e.target.value)}>
              {ESCALAS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
        </div>
        <Cajas cajas={cajas} abiertos={abiertos} alternar={alternar} />
      </div>

      {abiertos.resultado && (
        <div className="go-kpi-bloque">
          <div className="go-kpi-cabecera">
            <span className="chart-card-subtitle">{alcance} · variación contra {contra}, con los mismos filtros</span>
          </div>
          <div className="kpi-grid go-kpis-fila">
            <TarjetaAnio
              label="Volumen importado" valor={fmt.int(tot.ton)} unidad="t" tono="warn"
              sub={`${fmt.int(tot.ton / dens)} m³ · ${fmt.int(tot.n)} despachos`}
              delta={variacion(tot.ton, totPrev.ton)} contra={contra} title={`${fmt.int(totPrev.ton)} t en ${contra}`}
            />
            <TarjetaAnio
              label="Precio CIF" valor={precio(tot) != null ? fmt.int(precio(tot)) : '-'} unidad="usd/ton" tono="info"
              sub={precio(tot) != null ? `${fmt.int(precio(tot) * dens)} usd/m³ · ${precio(tot) != null && tot.ton ? `FOB ${fmt.int(filas.reduce((s, r) => s + D.fob[r], 0) / tot.ton)} usd/ton` : ''}` : ''}
              delta={variacion(precio(tot), precio(totPrev))} contra={contra} title={precio(totPrev) != null ? `${fmt.int(precio(totPrev))} usd/ton en ${contra}` : undefined}
            />
            <TarjetaAnio
              label="Egreso de dólares" valor={millones(tot.cif)} tono="pos"
              sub="Valor CIF de los despachos"
              delta={variacion(tot.cif, totPrev.cif)} contra={contra} title={`${millones(totPrev.cif)} en ${contra}`}
            />
            <TarjetaAnio
              label="Con escala" valor={pctEscala != null ? fmt.pct(pctEscala) : '-'}
              sub={`${fmt.int(conEscala)} t llegaron desde un país distinto del de origen`}
              delta={pctEscala != null && pctEscalaPrev != null ? pctEscala - pctEscalaPrev : null} pp contra={contra}
            />
          </div>
        </div>
      )}

      {abiertos.mapa && (
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Mapa de flujos · {rotuloAnio(anio)}</span>
              <span className="chart-card-subtitle">
                Ámbar: del país de procedencia a la Argentina · verde: del país de origen al de procedencia, cuando no son el mismo · ancho por toneladas{etiquetaFiltro ? ` · ${etiquetaFiltro}` : ''}
              </span>
            </div>
          </div>
          <div className="chart-card-body">
            {filas.length ? (
              <MapaMundo
                mapa={M} procedencias={mapaDatos.procedencias} origenes={mapaDatos.origenes} flujos={mapaDatos.flujos}
                destino={D.destino} elegidos={elegidosMapa} onPais={elegirPais} etiqueta={`Flujos del gas oil importado, ${rotuloAnio(anio)}`}
              />
            ) : <div className="section-placeholder">Sin despachos con esta selección.</div>}
            <div className="chart-legend">
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.oil }} />Procedencia → Argentina (país pintado según su volumen)</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.bio }} />Origen → procedencia (solo con escala)</div>
              <div className="chart-legend-item">Clic en un país, arco o punto filtra; otro clic lo suelta</div>
            </div>
          </div>
        </div>
      )}

      {abiertos.tablas && (
        <div className="chart-card go-sesco-tabla">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Por importador y por procedencia · {rotuloAnio(anio)}</span>
              <span className="chart-card-subtitle">
                Toneladas, precio CIF y su equivalente en m³ ({decimales(dens, 3)} ton/m³) · cada tabla ignora su propio filtro; clic en una fila filtra el resto{etiquetaFiltro ? ` · ${etiquetaFiltro}` : ''}
              </span>
            </div>
          </div>
          <div className="chart-card-body">
            <div className="go-imp-tablas">
              {tablaDoble('Importador', tablaImp, totImp, impActiva, elegirImp)}
              {tablaDoble('Procedencia', tablaPro, totPro, proActiva, elegirPro)}
            </div>
          </div>
        </div>
      )}

      {abiertos.periodos && (
        <div className="chart-card go-sesco-tabla go-imp-periodos">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">{periodos.porPro ? 'Procedencia por trimestre' : 'Importador por mes'} · {rotuloAnio(anio)}</span>
              <span className="chart-card-subtitle">Toneladas y, debajo, precio CIF en usd/ton · clic en una fila filtra el resto{etiquetaFiltro ? ` · ${etiquetaFiltro}` : ''}</span>
            </div>
            <div className="chart-range-selector">
              <button className={periodos.porPro ? 'active' : ''} onClick={() => setTablaPeriodo('procedencia')}>Procedencia · trimestres</button>
              <button className={periodos.porPro ? '' : 'active'} onClick={() => setTablaPeriodo('importador')}>Importador · meses</button>
            </div>
          </div>
          <div className="chart-card-body">
            <div className="mh-tabla-scroll go-sesco-scroll">
              <table className="mh-tabla go-tabla go-imp-doble">
                <thead>
                  <tr>
                    <th>{periodos.porPro ? 'Procedencia' : 'Importador'}</th>
                    <th />
                    {periodos.encabezados.map((h) => <th key={h} className="num">{h}</th>)}
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {periodos.filas.map((r) => [
                    <tr key={`${r.k}-t`} className={`principal${activaPeriodo(r) ? ' activa' : ''}`} onClick={() => elegirPeriodo(r)}>
                      <td rowSpan={2}>{r.nombre}</td>
                      <td className="rotulo-unidad">ton</td>
                      {r.cols.map((c, j) => <td key={j} className="num">{celda(c, 'ton')}</td>)}
                      <td className="num">{fmt.int(r.ton)}</td>
                    </tr>,
                    <tr key={`${r.k}-p`} className={`sub${activaPeriodo(r) ? ' activa' : ''}`} onClick={() => elegirPeriodo(r)}>
                      <td className="rotulo-unidad">usd/ton</td>
                      {r.cols.map((c, j) => <td key={j} className="num">{celda(c, 'cif')}</td>)}
                      <td className="num">{fmt.int(precio(r))}</td>
                    </tr>,
                  ])}
                </tbody>
                <tfoot>
                  <tr className="principal">
                    <td rowSpan={2}>Total</td>
                    <td className="rotulo-unidad">ton</td>
                    {periodos.totCols.map((c, j) => <td key={j} className="num">{celda(c, 'ton')}</td>)}
                    <td className="num">{fmt.int(periodos.total.ton)}</td>
                  </tr>
                  <tr className="sub">
                    <td className="rotulo-unidad">usd/ton</td>
                    {periodos.totCols.map((c, j) => <td key={j} className="num">{celda(c, 'cif')}</td>)}
                    <td className="num">{fmt.int(precio(periodos.total))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {abiertos.dolares && (
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Egreso de dólares · acumulado {rotuloAnio(anio)}</span>
              <span className="chart-card-subtitle">
                Toneladas acumuladas en el año por importador (áreas) y dólares CIF acumulados (línea, eje derecho){etiquetaFiltro ? ` · ${etiquetaFiltro}` : ''}
              </span>
            </div>
          </div>
          <div className="chart-card-body">
            {acumulado.pts.length ? (
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={acumulado.pts} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <XAxis dataKey="mes" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} />
                  <YAxis yAxisId="ton" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => `${eje(v)} t`} width={66} />
                  <YAxis yAxisId="usd" orientation="right" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => `U$ ${eje(v)}`} width={82} />
                  <Tooltip content={<TooltipAcumulado />} cursor={{ stroke: C.axis }} />
                  {acumulado.series.map((s, j) => (
                    <Area key={s.k} yAxisId="ton" dataKey={`s${j}`} name={s.nombre} stackId="acum" stroke={colorSerie(s, j)} fill={colorSerie(s, j)} fillOpacity={0.55} />
                  ))}
                  <Line yAxisId="usd" dataKey="usd" name="Dólares acumulados" stroke={C.ink} strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <div className="section-placeholder">Sin despachos con esta selección.</div>}
            <div className="chart-legend">
              {acumulado.series.map((s, j) => (
                <div key={s.k} className="chart-legend-item">
                  <span className="chart-legend-swatch" style={{ background: colorSerie(s, j) }} />
                  {s.nombre} · {fmt.int(s.ton)} t · {millones(s.cif)}
                </div>
              ))}
              <div className="chart-legend-item">
                <span className="chart-legend-swatch" style={{ background: C.ink }} />
                <span className="go-imp-leyenda-total">Acumulado {rotuloAnio(anio)}: {fmt.int(tot.ton)} t · {millones(tot.cif)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="note go-nota">
        Fuente: despachos de importación de gasoil (NCM 2710.19.21) por aduana, {D.meses[0].slice(0, 4)} a {fmt.monthShort(D.ultimo_mes)}.
        Toneladas = kilos netos / 1000; precio = valor CIF / toneladas; m³ = toneladas / {decimales(dens, 3)} (densidad del gas oil).
        La página abre sin CAMMESA, que importa gas oil para las usinas eléctricas; se agrega desde el filtro Importador.
        País de origen es donde se produjo el gas oil y país de procedencia desde donde se embarcó hacia la Argentina: cuando no
        coinciden, el despacho vino con escala (Togo es la escala habitual de lo que llega de Asia y del Golfo). Quedan afuera
        {' '}{D.excluidos.despachos} despachos de menos de 100 kg (muestras y bidones, {decimales(D.excluidos.ton, 1)} t en toda la serie).
        Las variaciones comparan con el mismo tramo del año anterior y con los mismos filtros. Último mes: {fmt.monthShort(D.ultimo_mes)}.
      </p>
    </div>
  );
}
