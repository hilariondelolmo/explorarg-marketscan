import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine,
} from 'recharts';
import {
  MESES, ULTIMO_MES, IDX_MES, PRODUCTOS, TC, CPI_US, TIPOS_NEGOCIO, CANALES_COM, MESES_ANOMALOS_PRODUCTOS, variacion,
  cargarProductos, ponderarProducto,
} from '../../lib/gasoil.js';
import { NOTA_MESES_EXCLUIDOS, TIPOS_RETAIL, CC_PUBLICO, TODAS, DropdownMulti, mismas } from './relevamiento.jsx';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import './GasOil.css';

const BASE_DEFAULT = '2024-01'; // "Fecha Final" del workbook (12/01/2024)
const REZAGO_MAX = 3;           // meses hacia atrás que se admiten si falta el dato del mes

// Productos del relevamiento SE 1104 (public/data/gasoil_productos.json): cada
// producto × tipo de precio es un producto del ranking, como en el filtro
// Producto del Tableau. Densidades del workbook: 0,845 gas oil y kerosene,
// 0,68 naftas. El gas oil grado 1 solo tiene surtidor, de 2010 a 2013.
const TIPOS = { s: 'surtidor', c: 'con impuestos', n: 'sin impuestos' };
const RELEVAMIENTO = [
  { id: 'g2', nombre: 'Gas oil grado 2', densidad: 0.845, tipos: 'scn', familia: 'gasoil' },
  { id: 'g3', nombre: 'Gas oil grado 3', densidad: 0.845, tipos: 'scn', familia: 'gasoil' },
  { id: 'g1', nombre: 'Gas oil grado 1', densidad: 0.845, tipos: 's', familia: 'gasoil' },
  { id: 'ns', nombre: 'Nafta súper', densidad: 0.68, tipos: 'scn', familia: 'naftas' },
  { id: 'np', nombre: 'Nafta premium', densidad: 0.68, tipos: 'scn', familia: 'naftas' },
  { id: 'ke', nombre: 'Kerosene', densidad: 0.845, tipos: 'scn', familia: 'naftas' },
];
const PRODUCTOS_1104 = RELEVAMIENTO.flatMap((p) => [...p.tipos].map((t) => ({
  id: `${p.id}_${t}`, producto: p.id, tipo: t, nombre: `${p.nombre} - ${TIPOS[t]}`, familia: p.familia,
  densidad: p.densidad, unidad: 'usd/ton', fuente: 'SE Res. 1104', relevamiento: true,
})));
// Series precalculadas por el generador con el recorte inicial (minorista, al
// público, bocas y estaciones): valen de respaldo hasta que baja el archivo
const RESPALDO = { g2_s: 'go2_surtidor', g2_n: 'go2_sin_imp', g3_s: 'go3_surtidor', g3_n: 'go3_sin_imp' };
// Los productos de Master data (gasoil_ranking.json), sin las cuatro series precalculadas de gas oil
const PRODUCTOS_MASTER = PRODUCTOS.filter((p) => !p.id.startsWith('go')).map((p) => ({ ...p, familia: p.familia || 'otros' }));
const FAMILIAS = [
  ['gasoil', 'Gas oil (relevamiento SE 1104)', 'oil'],
  ['naftas', 'Naftas y kerosene (relevamiento SE 1104)', 'violeta'],
  ['crudo', 'Crudos', 'neutral'],
  ['diesel', 'Diésel de referencia', 'exp'],
  ['bio', 'Biodiésel', 'bio'],
  ['aceite', 'Aceite de soja', 'warn'],
  ['metanol', 'Metanol', 'celeste'],
  ['glicerina', 'Glicerina', 'expDim'],
  ['otros', 'Otros', 'neutral'],
];
const CATALOGO = FAMILIAS.flatMap(([f]) => [...PRODUCTOS_1104, ...PRODUCTOS_MASTER].filter((p) => p.familia === f));
const GRUPOS = FAMILIAS.map(([f, titulo]) => ({ titulo, opciones: CATALOGO.filter((p) => p.familia === f).map((p) => p.id) }))
  .filter((g) => g.opciones.length);
// Los diez productos que el tablero de Tableau muestra al abrir (y el sitio desde el principio)
const DIEZ = ['g2_s', 'g2_n', 'g3_s', 'g3_n', 'brent', 'wti', 'diesel_usa', 'fame_ara', 'bio_963_m', 'aceite_fas'];
const TODOS_IDS = CATALOGO.map((p) => p.id);
const ACCIONES_PRODUCTOS = [['Los diez del Tableau', DIEZ, 'Los diez productos con que abre el tablero'], ['Todos', null], ['Ninguno', []]];
const TIPOS_RETAIL_LISTA = TIPOS_NEGOCIO.filter((t) => TIPOS_RETAIL.has(t));
// Nota de los meses sin precio propios de las naftas: "nafta premium - sin impuestos de ene 2015 y feb 2017, ..."
const NOTA_ANOMALOS_PRODUCTOS = Object.entries(MESES_ANOMALOS_PRODUCTOS).map(([col, fechas]) => {
  const [, tipo, producto] = col.match(/^p(\w)_(\w+)$/);
  const p = PRODUCTOS_1104.find((q) => q.producto === producto && q.tipo === tipo);
  return `${p ? p.nombre.toLowerCase() : col} de ${fechas.map(fmt.monthShort).join(' y ')}`;
}).join(', ni la ');

/**
 * Réplica del tablero "RANKING Actualizado": variación % acumulada del precio
 * de cada producto desde una fecha base hasta el mes de análisis, con carrera
 * de barras mes a mes (Play), la misma variación en líneas y la tabla de
 * valores. Moneda usd o $ (TC mensual), valores corrientes o constantes
 * (deflactados con el CPI de Estados Unidos, como en el workbook).
 *
 * Desde el 07/10/2026 (pedido de HDO) ofrece los 48 productos del filtro
 * Producto del tablero: los 16 del relevamiento SE 1104 (gas oil grado 1, 2 y
 * 3, kerosene y naftas por tipo de precio), que se ponderan acá con los tres
 * filtros del relevamiento (canal de distribución, tipo de negocio y canal de
 * comercialización) sobre public/data/gasoil_productos.json, y los 32 de
 * Master data (crudos, diésel, biodiésel, aceite, metanol, glicerina). Abre
 * con los diez de siempre y el recorte del tablero (minorista, al público,
 * bocas y estaciones), que reproduce las series precalculadas.
 */
export default function RankingPrecios() {
  const C = useChartColors();
  const [base, setBase] = useState(BASE_DEFAULT);
  const [mes, setMes] = useState(ULTIMO_MES);
  const [moneda, setMoneda] = useState('usd');
  const [valores, setValores] = useState('cte');
  const [jugando, setJugando] = useState(false);
  const [seleccion, setSeleccion] = useState(() => new Set(DIEZ));
  const [D, setD] = useState(null);
  const [error, setError] = useState(null);
  // Filtros del relevamiento (modo surtidor del workbook: minorista, bocas y estaciones, al público)
  const [cd, setCd] = useState('0');
  const [tipos, setTipos] = useState(() => new Set(TIPOS_RETAIL_LISTA));
  const [cc, setCc] = useState(CC_PUBLICO >= 0 ? String(CC_PUBLICO) : TODAS);
  const timer = useRef(null);

  useEffect(() => {
    cargarProductos().then(setD).catch((e) => setError(e.message));
  }, []);

  // Listas de tipos y canales: las del archivo (mismos índices que gasoil_precios.json)
  const TN = D?.tipos_negocio || TIPOS_NEGOCIO;
  const CC = D?.canales_com || CANALES_COM;
  const cdN = cd === 'ambos' ? null : Number(cd);
  const ccN = cc === TODAS ? null : Number(cc);
  const tiposIdx = useMemo(() => new Set(TN.map((t, i) => (tipos.has(t) ? i : -1)).filter((i) => i >= 0)), [TN, tipos]);
  // Opciones disponibles según el canal de distribución elegido
  const disponibles = useMemo(() => {
    const tn = new Set();
    const ccs = new Set();
    if (D) {
      for (let i = 0; i < D.mes.length; i++) {
        if (cdN != null && D.cd[i] !== cdN) continue;
        tn.add(D.tn[i]);
        ccs.add(D.cc[i]);
      }
      return { tipos: [...tn].map((i) => TN[i]).sort(), canales: [...ccs].map((i) => CC[i]).sort() };
    }
    return { tipos: [...TN].sort(), canales: [...CC].sort() };
  }, [D, cdN, TN, CC]);
  const cambiarCd = (v) => {
    setCd(v);
    // Minorista: bocas y estaciones (default del workbook); mayorista y ambos: todos los tipos
    setTipos(new Set(v === '0' ? TN.filter((t) => TIPOS_RETAIL.has(t)) : TN));
    setCc(v === '1' ? TODAS : (CC_PUBLICO >= 0 ? String(CC_PUBLICO) : TODAS));
  };
  const enRecorteInicial = cd === '0' && ccN === CC_PUBLICO && mismas(tipos, TIPOS_RETAIL_LISTA);
  const resumenTipos = mismas(tipos, TIPOS_RETAIL_LISTA) ? 'Bocas y estaciones'
    : tipos.size >= disponibles.tipos.length ? 'Todos los tipos'
      : `${[...tipos].filter((t) => disponibles.tipos.includes(t)).length} de ${disponibles.tipos.length} tipos`;
  const recorte = `${cd === 'ambos' ? 'minorista y mayorista' : cd === '0' ? 'minorista' : 'mayorista'} · `
    + `${ccN == null ? 'todos los canales' : CC[ccN].toLowerCase()} · ${resumenTipos.toLowerCase()}`;

  const elegidos = useMemo(() => CATALOGO.filter((p) => seleccion.has(p.id)), [seleccion]);
  const resumenProductos = mismas(seleccion, DIEZ) ? 'Los diez del Tableau'
    : seleccion.size === CATALOGO.length ? 'Todos los productos'
      : `${seleccion.size} de ${CATALOGO.length} productos`;

  // Series en su unidad nativa (usd/ton; crudos usd/m³): id → Map(fecha → valor).
  // Las del relevamiento se ponderan con los filtros; hasta que baje el archivo,
  // las cuatro de gas oil usan las precalculadas si el recorte es el inicial.
  const nativas = useMemo(() => {
    const out = new Map();
    const filtro = (i) => (cdN == null || D.cd[i] === cdN) && tiposIdx.has(D.tn[i]) && (ccN == null || D.cc[i] === ccN);
    for (const p of elegidos) {
      if (!p.relevamiento) {
        out.set(p.id, new Map(p.serie));
      } else if (D) {
        const m = new Map();
        for (const [f, arsL] of ponderarProducto(D, filtro, p.producto, p.tipo)) {
          const tc = TC.get(f);
          if (tc) m.set(f, (arsL / tc) * 1000 / p.densidad);
        }
        out.set(p.id, m);
      } else if (RESPALDO[p.id] && enRecorteInicial) {
        out.set(p.id, new Map(PRODUCTOS.find((q) => q.id === RESPALDO[p.id])?.serie || []));
      } else {
        out.set(p.id, new Map());
      }
    }
    return out;
  }, [D, elegidos, cdN, tiposIdx, ccN, enRecorteInicial]);

  // Series por producto en la moneda/valores elegidos: id → Map(fecha → valor)
  const series = useMemo(() => {
    const cpiBase = CPI_US.get(base);
    const out = new Map();
    for (const [id, nativa] of nativas) {
      const m = new Map();
      for (const [f, usd] of nativa) {
        let v = usd;
        if (moneda === 'ars') {
          const tc = TC.get(f);
          if (!tc) continue;
          v *= tc;
        }
        if (valores === 'cte') {
          const cpi = CPI_US.get(f);
          if (!cpi || !cpiBase) continue;
          v *= cpiBase / cpi;
        }
        m.set(f, v);
      }
      out.set(id, m);
    }
    return out;
  }, [nativas, moneda, valores, base]);

  // Valor de un producto en un mes, admitiendo hasta REZAGO_MAX meses de atraso
  const valorEn = (id, f) => {
    const m = series.get(id);
    let i = IDX_MES.get(f);
    for (let k = 0; k <= REZAGO_MAX && i - k >= 0; k++) {
      const v = m.get(MESES[i - k]);
      if (v != null) return { v, fecha: MESES[i - k] };
    }
    return null;
  };

  const unidadDe = (p) => (moneda === 'usd' ? p.unidad : p.unidad.replace('usd', '$'));
  const filas = useMemo(() => elegidos.map((p) => {
    const b = series.get(p.id)?.get(base);
    const a = valorEn(p.id, mes);
    return {
      id: p.id, nombre: p.nombre, unidad: unidadDe(p),
      fuente: p.relevamiento ? `${p.fuente} · ${recorte}` : p.fuente, nota: p.nota, hasta: p.hasta,
      base: b ?? null, actual: a?.v ?? null, fechaActual: a?.fecha ?? null,
      variacion: b != null && a ? variacion(a.v, b) : null,
    };
  }), [elegidos, series, base, mes, moneda, recorte]);
  const ranking = filas
    .filter((f) => f.variacion != null)
    .sort((a, b) => b.variacion - a.variacion);

  // Líneas: variación acumulada desde la base, mes a mes
  const lineas = useMemo(() => {
    const desde = IDX_MES.get(base);
    const hasta = IDX_MES.get(mes);
    const pts = [];
    for (let i = desde; i <= hasta; i++) {
      const f = MESES[i];
      const row = { fecha: f };
      for (const p of elegidos) {
        const b = series.get(p.id).get(base);
        const v = series.get(p.id).get(f);
        row[p.id] = b != null && v != null ? variacion(v, b) : null;
      }
      pts.push(row);
    }
    return pts;
  }, [elegidos, series, base, mes]);

  // Carrera: avanza un mes por segundo desde la base
  useEffect(() => {
    if (!jugando) return undefined;
    timer.current = setInterval(() => {
      setMes((m) => {
        const i = IDX_MES.get(m);
        if (i >= MESES.length - 1) {
          setJugando(false);
          return m;
        }
        return MESES[i + 1];
      });
    }, 900);
    return () => clearInterval(timer.current);
  }, [jugando]);
  const play = () => {
    if (!jugando && mes === ULTIMO_MES) setMes(MESES[Math.min(IDX_MES.get(base) + 1, MESES.length - 1)]);
    setJugando((j) => !j);
  };

  const unidad = moneda === 'usd' ? 'usd/ton' : '$/ton';
  const familiaDe = (id) => CATALOGO.find((p) => p.id === id)?.familia;
  const color = (id) => C[FAMILIAS.find(([f]) => f === familiaDe(id))?.[2]] || C.neutral;
  const trazo = (p) => (p.tipo === 'n' ? '3 3' : p.tipo === 'c' ? '7 3' : undefined);
  const quitar = (id) => setSeleccion((s) => {
    const n = new Set(s);
    n.delete(id);
    return n;
  });
  const nombreDe = (id) => CATALOGO.find((p) => p.id === id)?.nombre || id;
  const alto = Math.max(260, 34 * Math.max(ranking.length, 1) + 30);

  return (
    <div className="go-seccion go-ranking">
      <div className="empresa-selector-row go-controles">
        <label htmlFor="go-rk-base">Fecha base</label>
        <select id="go-rk-base" className="empresa-select" value={base} onChange={(e) => { setBase(e.target.value); if (e.target.value > mes) setMes(ULTIMO_MES); }}>
          {[...MESES].reverse().filter((f) => f < ULTIMO_MES).map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
        </select>
        <label htmlFor="go-rk-mes">Mes de análisis</label>
        <select id="go-rk-mes" className="empresa-select" value={mes} onChange={(e) => setMes(e.target.value)}>
          {[...MESES].reverse().filter((f) => f > base).map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
        </select>
        <button type="button" className={`empresa-select go-play ${jugando ? 'activo' : ''}`} onClick={play}>
          {jugando ? '❚❚ Pausa' : '▶ Carrera'}
        </button>
        <label>Moneda</label>
        <div className="chart-range-selector">
          <button className={moneda === 'usd' ? 'active' : ''} onClick={() => setMoneda('usd')}>usd</button>
          <button className={moneda === 'ars' ? 'active' : ''} onClick={() => setMoneda('ars')}>$</button>
        </div>
        <label>Valores</label>
        <div className="chart-range-selector">
          <button className={valores === 'cte' ? 'active' : ''} onClick={() => setValores('cte')}>Constantes</button>
          <button className={valores === 'cor' ? 'active' : ''} onClick={() => setValores('cor')}>Corrientes</button>
        </div>
      </div>

      {/* Productos y los tres filtros del relevamiento (sin bloque fijo, como pidió HDO) */}
      <div className="go-filtros go-filtros-ranking">
        <div className="go-filtro go-f-prod">
          <span className="go-filtro-label">Productos</span>
          <DropdownMulti
            opciones={TODOS_IDS} grupos={GRUPOS} seleccion={seleccion} resumen={resumenProductos} onCambiar={setSeleccion}
            rotulo={nombreDe} acciones={ACCIONES_PRODUCTOS} clase="go-prod-panel"
          />
        </div>
        <div className="go-filtro go-f-cd">
          <label htmlFor="go-rk-cd">Canal de distribución</label>
          <select id="go-rk-cd" className="empresa-select" value={cd} onChange={(e) => cambiarCd(e.target.value)}>
            <option value="0">Minorista</option>
            <option value="1">Mayorista</option>
            <option value="ambos">Ambos</option>
          </select>
        </div>
        <div className="go-filtro go-f-tipos">
          <span className="go-filtro-label">Tipo de negocio</span>
          <DropdownMulti opciones={disponibles.tipos} seleccion={tipos} resumen={resumenTipos} onCambiar={setTipos} />
        </div>
        <div className="go-filtro go-f-cc">
          <label htmlFor="go-rk-cc">Canal de comercialización</label>
          <select id="go-rk-cc" className="empresa-select" value={cc} onChange={(e) => setCc(e.target.value)}>
            <option value={TODAS}>Todos los canales</option>
            {disponibles.canales.map((c) => <option key={c} value={String(CC.indexOf(c))}>{c}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="note go-nota">No se pudieron cargar los productos del relevamiento: {error}</p>}

      <div className="go-charts-grid go-ranking-grid">
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Ranking · variación desde {fmt.monthShort(base)} hasta {fmt.monthShort(mes)}</span>
              <span className="chart-card-subtitle">
                {unidad} {valores === 'cte' ? 'constantes (CPI EE.UU.)' : 'corrientes'} · {elegidos.length} productos · {recorte}
              </span>
            </div>
          </div>
          <div className="chart-card-body">
            <ResponsiveContainer width="100%" height={alto}>
              <BarChart data={ranking} layout="vertical" margin={{ top: 4, right: 70, left: 8, bottom: 4 }}>
                <XAxis type="number" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.pct(v, 0)} />
                <YAxis type="category" dataKey="nombre" width={230} tick={{ fill: C.ink, fontSize: 11 }} stroke={C.axis} interval={0} />
                <ReferenceLine x={0} stroke={C.axis} />
                <Tooltip content={<TooltipRanking />} cursor={{ fill: C.cursor }} />
                <Bar dataKey="variacion" isAnimationActive animationDuration={700} radius={[0, 2, 2, 0]}>
                  {ranking.map((r) => <Cell key={r.id} fill={color(r.id)} />)}
                  <LabelList dataKey="variacion" position="right" formatter={(v) => fmt.pct(v, 0)} fill={C.ink} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Variación acumulada mes a mes</span>
              <span className="chart-card-subtitle">desde {fmt.monthShort(base)} · {unidad} {valores === 'cte' ? 'constantes' : 'corrientes'}</span>
            </div>
          </div>
          <div className="chart-card-body">
            <ResponsiveContainer width="100%" height={alto}>
              <LineChart data={lineas} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.monthShort(v)} minTickGap={40} />
                <YAxis tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.pct(v, 0)} width={52} />
                <ReferenceLine y={0} stroke={C.axis} />
                <Tooltip content={<TooltipLineas />} cursor={{ stroke: C.axis }} />
                {elegidos.map((p) => (
                  <Line key={p.id} dataKey={p.id} name={p.nombre} stroke={color(p.id)} strokeWidth={p.familia === 'gasoil' ? 2 : 1.2}
                    strokeDasharray={trazo(p)} dot={false} connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-card-header">
          <div>
            <span className="chart-card-title">Valores</span>
            <span className="chart-card-subtitle">
              {moneda === 'usd' ? 'usd' : '$'} por tonelada (crudos por m³) · {valores === 'cte' ? `constantes de ${fmt.monthShort(base)}` : 'corrientes'} · clic en una fila saca el producto; el desplegable Productos lo vuelve a poner
            </span>
          </div>
        </div>
        <div className="mh-tabla-scroll">
          <table className="mh-tabla go-tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="num">{fmt.monthShort(base)}</th>
                <th className="num">{fmt.monthShort(mes)}</th>
                <th className="num">Variación</th>
                <th>Unidad</th>
                <th>Fuente</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} onClick={() => quitar(f.id)} title="Clic: sacar del ranking">
                  <td><span className="go-swatch" style={{ background: color(f.id) }} />{f.nombre}</td>
                  <td className="num">{f.base != null ? fmt.int(f.base) : 's/d'}</td>
                  <td className="num">
                    {f.actual != null ? fmt.int(f.actual) : 's/d'}
                    {f.fechaActual && f.fechaActual !== mes && <span className="muted"> ({fmt.monthShort(f.fechaActual)})</span>}
                  </td>
                  <td className={`num ${f.variacion == null ? '' : f.variacion >= 0 ? 'delta-pos' : 'delta-neg'}`}>
                    {f.variacion != null ? fmt.pct(f.variacion) : '-'}
                  </td>
                  <td className="go-unidad">{f.unidad}</td>
                  <td className="muted">
                    {f.fuente}{f.nota ? ` · ${f.nota}` : ''}
                    {f.hasta && f.hasta < ULTIMO_MES && !f.nota ? ` · hasta ${fmt.monthShort(f.hasta)}` : ''}
                  </td>
                </tr>
              ))}
              {!filas.length && <tr><td colSpan={6} className="muted">Ningún producto elegido: abrí el desplegable Productos.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <p className="note go-nota">
        Gas oil, naftas y kerosene: precio ponderado por volumen del relevamiento SE Res. 1104 ({recorte}), pasado a usd por
        tonelada con el TC mensual y densidad 0,845 (gas oil y kerosene) o 0,68 (naftas), como en el workbook de origen. El
        precio surtidor solo existe al público: con otro canal esas filas quedan sin dato. Crudos: usd por m³ del informe de
        regalías de crudo de la SE. Valores constantes: deflactados con el CPI de Estados Unidos a la fecha base, en ambas
        monedas, como en el workbook. Cuando falta el dato del mes se toma el último disponible hasta
        {' '}{REZAGO_MAX} meses atrás (se indica entre paréntesis). {NOTA_MESES_EXCLUIDOS} Tampoco se muestra la {NOTA_ANOMALOS_PRODUCTOS}, por
        valores anómalos de esas series (los demás precios de esos meses sí).
      </p>
    </div>
  );
}

function TooltipRanking({ active, payload }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{r.nombre}</div>
      <div className="chart-tooltip-row"><div className="chart-tooltip-row-label"><span>Base</span></div><span className="chart-tooltip-row-val">{fmt.int(r.base)} {r.unidad}</span></div>
      <div className="chart-tooltip-row"><div className="chart-tooltip-row-label"><span>{fmt.monthShort(r.fechaActual)}</span></div><span className="chart-tooltip-row-val">{fmt.int(r.actual)} {r.unidad}</span></div>
      <div className="chart-tooltip-row"><div className="chart-tooltip-row-label"><span>Variación</span></div><span className="chart-tooltip-row-val">{fmt.pct(r.variacion)}</span></div>
    </div>
  );
}

function TooltipLineas({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const orden = [...payload].filter((p) => p.value != null).sort((a, b) => b.value - a.value);
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{fmt.monthShort(label)}</div>
      {orden.map((p) => (
        <div key={p.dataKey} className="chart-tooltip-row">
          <div className="chart-tooltip-row-label"><span className="chart-tooltip-swatch" style={{ background: p.color }} /><span>{p.name}</span></div>
          <span className="chart-tooltip-row-val">{fmt.pct(p.value)}</span>
        </div>
      ))}
    </div>
  );
}
