import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine,
} from 'recharts';
import { MESES, ULTIMO_MES, IDX_MES, PRODUCTOS, TC, CPI_US, variacion } from '../../lib/gasoil.js';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import './GasOil.css';

const BASE_DEFAULT = '2024-01'; // "Fecha Final" del workbook (12/01/2024)
const REZAGO_MAX = 3;           // meses hacia atrás que se admiten si falta el dato del mes

// Familia de cada producto → color de la paleta del sitio
const FAMILIA = {
  go2_surtidor: 'oil', go2_sin_imp: 'oil', go3_surtidor: 'oil', go3_sin_imp: 'oil',
  brent: 'neutral', wti: 'neutral', diesel_usa: 'exp',
  fame_ara: 'bio', bio_963_m: 'bio', aceite_fas: 'warn',
};

/**
 * Réplica del tablero "RANKING Actualizado": variación % acumulada del precio
 * de cada producto desde una fecha base hasta el mes de análisis, con carrera
 * de barras mes a mes (Play), la misma variación en líneas y la tabla de
 * valores. Moneda usd o $ (TC mensual), valores corrientes o constantes
 * (deflactados con el CPI de Estados Unidos, como en el workbook).
 */
export default function RankingPrecios() {
  const C = useChartColors();
  const [base, setBase] = useState(BASE_DEFAULT);
  const [mes, setMes] = useState(ULTIMO_MES);
  const [moneda, setMoneda] = useState('usd');
  const [valores, setValores] = useState('cte');
  const [jugando, setJugando] = useState(false);
  const [ocultos, setOcultos] = useState(() => new Set());
  const timer = useRef(null);

  // Series por producto en la moneda/valores elegidos: id → Map(fecha → valor)
  const series = useMemo(() => {
    const cpiBase = CPI_US.get(base);
    const out = new Map();
    for (const p of PRODUCTOS) {
      const m = new Map();
      for (const [f, usd] of p.serie) {
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
      out.set(p.id, m);
    }
    return out;
  }, [moneda, valores, base]);

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

  const filas = useMemo(() => PRODUCTOS.map((p) => {
    const b = series.get(p.id).get(base);
    const a = valorEn(p.id, mes);
    return {
      id: p.id, nombre: p.nombre, fuente: p.fuente, nota: p.nota,
      base: b ?? null, actual: a?.v ?? null, fechaActual: a?.fecha ?? null,
      variacion: b != null && a ? variacion(a.v, b) : null,
    };
  }), [series, base, mes]);
  const ranking = filas
    .filter((f) => f.variacion != null && !ocultos.has(f.id))
    .sort((a, b) => b.variacion - a.variacion);

  // Líneas: variación acumulada desde la base, mes a mes
  const lineas = useMemo(() => {
    const desde = IDX_MES.get(base);
    const hasta = IDX_MES.get(mes);
    const pts = [];
    for (let i = desde; i <= hasta; i++) {
      const f = MESES[i];
      const row = { fecha: f };
      for (const p of PRODUCTOS) {
        const b = series.get(p.id).get(base);
        const v = series.get(p.id).get(f);
        row[p.id] = b != null && v != null ? variacion(v, b) : null;
      }
      pts.push(row);
    }
    return pts;
  }, [series, base, mes]);

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
  const color = (id) => C[FAMILIA[id]] || C.neutral;
  const toggle = (id) => setOcultos((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <div className="go-seccion">
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

      <div className="go-charts-grid go-ranking-grid">
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Ranking · variación desde {fmt.monthShort(base)} hasta {fmt.monthShort(mes)}</span>
              <span className="chart-card-subtitle">
                {unidad} {valores === 'cte' ? 'constantes (CPI EE.UU.)' : 'corrientes'} · clic en un producto de la tabla lo oculta
              </span>
            </div>
          </div>
          <div className="chart-card-body">
            <ResponsiveContainer width="100%" height={Math.max(260, 34 * ranking.length + 30)}>
              <BarChart data={ranking} layout="vertical" margin={{ top: 4, right: 70, left: 8, bottom: 4 }}>
                <XAxis type="number" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.pct(v, 0)} />
                <YAxis type="category" dataKey="nombre" width={190} tick={{ fill: C.ink, fontSize: 11 }} stroke={C.axis} interval={0} />
                <ReferenceLine x={0} stroke={C.axis} />
                <Tooltip content={<TooltipRanking unidad={unidad} />} cursor={{ fill: C.cursor }} />
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
            <ResponsiveContainer width="100%" height={Math.max(260, 34 * ranking.length + 30)}>
              <LineChart data={lineas} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.monthShort(v)} minTickGap={40} />
                <YAxis tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.pct(v, 0)} width={52} />
                <ReferenceLine y={0} stroke={C.axis} />
                <Tooltip content={<TooltipLineas />} cursor={{ stroke: C.axis }} />
                {PRODUCTOS.filter((p) => !ocultos.has(p.id)).map((p) => (
                  <Line key={p.id} dataKey={p.id} name={p.nombre} stroke={color(p.id)} strokeWidth={p.id.startsWith('go') ? 2 : 1.2}
                    strokeDasharray={p.id.endsWith('sin_imp') ? '4 3' : undefined} dot={false} connectNulls isAnimationActive={false} />
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
            <span className="chart-card-subtitle">{unidad} {valores === 'cte' ? `constantes de ${fmt.monthShort(base)}` : 'corrientes'} · clic oculta o muestra el producto</span>
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
                <th>Fuente</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className={ocultos.has(f.id) ? 'oculta' : ''} onClick={() => toggle(f.id)}>
                  <td><span className="go-swatch" style={{ background: color(f.id) }} />{f.nombre}</td>
                  <td className="num">{f.base != null ? fmt.int(f.base) : 's/d'}</td>
                  <td className="num">
                    {f.actual != null ? fmt.int(f.actual) : 's/d'}
                    {f.fechaActual && f.fechaActual !== mes && <span className="muted"> ({fmt.monthShort(f.fechaActual)})</span>}
                  </td>
                  <td className={`num ${f.variacion == null ? '' : f.variacion >= 0 ? 'delta-pos' : 'delta-neg'}`}>
                    {f.variacion != null ? fmt.pct(f.variacion) : '-'}
                  </td>
                  <td className="muted">{f.fuente}{f.nota ? ` · ${f.nota}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="note go-nota">
        Gas oil: precio ponderado país del relevamiento SE 1104 (minorista, al público) convertido a usd/ton con el TC
        mensual y densidad 0,845. Valores constantes: deflactados con el CPI de Estados Unidos a la fecha base, en ambas
        monedas, como en el workbook de origen. Cuando falta el dato del mes se toma el último disponible hasta
        {' '}{REZAGO_MAX} meses atrás (se indica entre paréntesis).
      </p>
    </div>
  );
}

function TooltipRanking({ active, payload, unidad }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{r.nombre}</div>
      <div className="chart-tooltip-row"><div className="chart-tooltip-row-label"><span>Base</span></div><span className="chart-tooltip-row-val">{fmt.int(r.base)} {unidad}</span></div>
      <div className="chart-tooltip-row"><div className="chart-tooltip-row-label"><span>{fmt.monthShort(r.fechaActual)}</span></div><span className="chart-tooltip-row-val">{fmt.int(r.actual)} {unidad}</span></div>
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
