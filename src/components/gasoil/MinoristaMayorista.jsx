import { useMemo, useState } from 'react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  MESES, ULTIMO_MES, IDX_MES, CANALES, CANALES_COM, COL, IMPORTACIONES,
  TIPOS_PRECIO, tipoPrecio, convertir, ponderar, desdeRango, fmtPrecio, variacion,
} from '../../lib/gasoil.js';
import corte from '../../data/corte.json';
import evidencia from '../../data/evidencia.json';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import './GasOil.css';

const L = COL.canales;
const TODOS = 'todos';
const RANGOS = [['12m', '12 m'], ['5a', '5 a'], ['10a', '10 a'], ['todo', 'Todo']];
const DENSIDAD_BIO = corte.densidad_bio;
const MEZCLA = new Map(corte.mensual.map((m) => [m.fecha, m.real]));
// Precio del biodiesel de cupo (Res. 963, categoría mediana) en $/ton
const PRECIO_BIO = new Map(evidencia.precio_biodiesel.map((p) => [p.fecha, p.mediana]));

/**
 * Réplica del tablero "ARG GO MARKET BTB BTC": precio ponderado del gas oil
 * grado 2 y 3 por canal de distribución y comercialización (relevamiento SE
 * 1104, todos los tipos de negocio), con su variación acumulada, y el gas
 * oil importado (CIF). Para el precio sin impuestos se agrega el "gas oil
 * fósil": el precio neto del biodiesel que lleva mezclado, con la mezcla
 * real del mes y el precio 963 (fórmula del workbook).
 */
export default function MinoristaMayorista() {
  const C = useChartColors();
  const [tipoId, setTipoId] = useState('surtidor');
  const [cd, setCd] = useState('0');          // '0' minorista · '1' mayorista · 'todos'
  const [cc, setCc] = useState('Al público');
  const [rango, setRango] = useState('5a');
  const tipo = tipoPrecio(tipoId);

  // Canales de comercialización con datos para el canal de distribución elegido
  const canalesCom = useMemo(() => {
    const vistos = new Map();
    for (const r of CANALES) {
      if (cd !== TODOS && r[L.cd] !== Number(cd)) continue;
      vistos.set(r[L.cc], (vistos.get(r[L.cc]) || 0) + r[L[2].w] + r[L[3].w]);
    }
    return [...vistos.entries()].sort((a, b) => b[1] - a[1]).map(([i]) => CANALES_COM[i]);
  }, [cd]);
  const ccValido = cc === TODOS || canalesCom.includes(cc) ? cc : TODOS;

  const filtro = (r) => (cd === TODOS || r[L.cd] === Number(cd))
    && (ccValido === TODOS || CANALES_COM[r[L.cc]] === ccValido);

  const desde = desdeRango(rango, ULTIMO_MES);
  const series = useMemo(() => {
    const armar = (grado) => {
      const m = ponderar(CANALES, COL.canales, filtro, (r) => r[L.mes], tipo.campo, grado);
      const pts = [];
      for (let i = IDX_MES.get(desde); i < MESES.length; i++) {
        const f = MESES[i];
        const v = m.get(i);
        const precioArs = v ? v.precio : null;
        const p = { fecha: f, precio: convertir(precioArs, f, tipo), vol: v?.w || 0 };
        // Gas oil fósil: neto del biodiesel mezclado (solo tiene sentido sin impuestos)
        if (grado === 2 && tipo.campo === 'n' && precioArs != null) {
          const mezcla = MEZCLA.get(f);
          const bioTon = PRECIO_BIO.get(f);
          if (mezcla != null && bioTon) {
            const bioL = (bioTon * DENSIDAD_BIO) / 1000; // $/ton → $/l
            p.fosil = convertir((precioArs - mezcla * bioL) / (1 - mezcla), f, tipo);
          }
        }
        pts.push(p);
      }
      const base = pts.find((x) => x.precio != null)?.precio;
      for (const x of pts) x.acumulada = variacion(x.precio, base);
      return pts;
    };
    return { g2: armar(2), g3: armar(3) };
  }, [cd, ccValido, tipo, desde]);

  const importaciones = useMemo(() => {
    const pts = IMPORTACIONES.filter((m) => m.fecha >= desde).map((m) => ({
      fecha: m.fecha, ton: m.ton, cif: m.cif_usd_ton,
    }));
    const base = pts.find((x) => x.cif != null)?.cif;
    for (const x of pts) x.acumulada = variacion(x.cif, base);
    return pts;
  }, [desde]);

  const ult = (serie, campo = 'precio') => [...serie].reverse().find((x) => x[campo] != null);
  const u2 = ult(series.g2);
  const u3 = ult(series.g3);
  const uImp = importaciones.at(-1);
  const etiquetaCanal = `${cd === TODOS ? 'minorista y mayorista' : cd === '0' ? 'minorista' : 'mayorista'}${ccValido !== TODOS ? ` · ${ccValido.toLowerCase()}` : ''}`;

  return (
    <div className="go-seccion">
      <div className="empresa-selector-row go-controles">
        <label htmlFor="go-mm-tipo">Tipo de precio</label>
        <select id="go-mm-tipo" className="empresa-select" value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
          {TIPOS_PRECIO.map((t) => <option key={t.id} value={t.id}>{t.label} [{t.unidad}]</option>)}
        </select>
        <label>Distribución</label>
        <div className="chart-range-selector">
          {[['0', 'Minorista'], ['1', 'Mayorista'], [TODOS, 'Ambos']].map(([id, l]) => (
            <button key={id} className={cd === id ? 'active' : ''} onClick={() => setCd(id)}>{l}</button>
          ))}
        </div>
        <label htmlFor="go-mm-cc">Comercialización</label>
        <select id="go-mm-cc" className="empresa-select" value={ccValido} onChange={(e) => setCc(e.target.value)}>
          <option value={TODOS}>Todos los canales</option>
          {canalesCom.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label>Período</label>
        <div className="chart-range-selector">
          {RANGOS.map(([id, label]) => (
            <button key={id} className={rango === id ? 'active' : ''} onClick={() => setRango(id)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Grado 2 · {tipo.label.toLowerCase()} ({tipo.unidad})</div>
          <div className="kpi-val">{fmtPrecio(u2?.precio, tipo.unidad)}</div>
          <div className="kpi-sub">{u2 ? fmt.monthShort(u2.fecha) : '-'} · {etiquetaCanal}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Grado 3 · {tipo.label.toLowerCase()} ({tipo.unidad})</div>
          <div className="kpi-val">{fmtPrecio(u3?.precio, tipo.unidad)}</div>
          <div className="kpi-sub">{u3 ? fmt.monthShort(u3.fecha) : '-'} · {etiquetaCanal}</div>
        </div>
        <div className="kpi-card tone-warn">
          <div className="kpi-label">Gas oil importado · CIF (usd/ton)</div>
          <div className="kpi-val">{uImp ? fmt.int(uImp.cif) : '-'}</div>
          <div className="kpi-sub">{uImp ? `${fmt.monthShort(uImp.fecha)} · ${fmt.int(uImp.ton)} ton` : '-'}</div>
        </div>
      </div>

      <div className="go-charts-grid">
        <CardSerie
          titulo="Gas oil grado 2" sub={`${tipo.label} [${tipo.unidad}] · ${etiquetaCanal}`}
          data={series.g2} unidad={tipo.unidad} C={C}
          extra={tipo.campo === 'n' ? { key: 'fosil', name: 'Gas oil fósil (neto de biodiesel)', color: C.bio } : null}
        />
        <CardSerie
          titulo="Gas oil grado 3" sub={`${tipo.label} [${tipo.unidad}] · ${etiquetaCanal}`}
          data={series.g3} unidad={tipo.unidad} C={C}
        />
      </div>

      <div className="chart-card">
        <div className="chart-card-header">
          <div>
            <span className="chart-card-title">Gas oil importado · precio CIF y volumen</span>
            <span className="chart-card-subtitle">usd/ton CIF (despachos de importación) · barras: toneladas del mes · línea punteada: variación acumulada</span>
          </div>
        </div>
        <div className="chart-card-body">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={importaciones} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.monthShort(v)} minTickGap={40} />
              <YAxis yAxisId="p" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.int(v)} width={58} domain={['auto', 'auto']} />
              <YAxis yAxisId="ton" orientation="right" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.compact(v)} width={52} />
              <Tooltip content={<TooltipSerie unidad="usd/ton" extraFmt={{ ton: (v) => `${fmt.int(v)} ton` }} />} cursor={{ stroke: C.axis }} />
              <Bar yAxisId="ton" dataKey="ton" name="Toneladas importadas" fill={C.neutralFill} />
              <Line yAxisId="p" dataKey="cif" name="CIF [usd/ton]" stroke={C.oil} strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="chart-legend">
            <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.oil }} />Precio CIF usd/ton (eje izquierdo)</div>
            <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.neutral }} />Toneladas importadas (eje derecho)</div>
          </div>
        </div>
      </div>

      <p className="note go-nota">
        Fuente: Secretaría de Energía, relevamiento Res. 1104/2004 (todos los tipos de negocio; ponderado por el volumen
        de cada boca) y despachos de importación de gas oil. Gas oil fósil = (precio sin impuestos − mezcla real × precio
        del biodiesel) / (1 − mezcla real), con la mezcla real del mes y el precio Res. 963 de la categoría mediana en $/l
        (densidad {DENSIDAD_BIO}). Último mes: {fmt.monthShort(ULTIMO_MES)}.
      </p>
    </div>
  );
}

function CardSerie({ titulo, sub, data, unidad, C, extra }) {
  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <div>
          <span className="chart-card-title">{titulo} · precio y variación acumulada</span>
          <span className="chart-card-subtitle">{sub}</span>
        </div>
      </div>
      <div className="chart-card-body">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.monthShort(v)} minTickGap={40} />
            <YAxis yAxisId="p" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmtPrecio(v, unidad)} domain={['auto', 'auto']} width={58} />
            <YAxis yAxisId="pct" orientation="right" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.pct(v, 0)} width={52} />
            <ReferenceLine yAxisId="pct" y={0} stroke={C.axis} />
            <Tooltip content={<TooltipSerie unidad={unidad} />} cursor={{ stroke: C.axis }} />
            <Line yAxisId="p" dataKey="precio" name={`Precio [${unidad}]`} stroke={C.oil} strokeWidth={2} dot={false} connectNulls />
            {extra && <Line yAxisId="p" dataKey={extra.key} name={extra.name} stroke={extra.color} strokeWidth={1.6} dot={false} connectNulls />}
            <Line yAxisId="pct" dataKey="acumulada" name="Variación acumulada" stroke={C.ink} strokeWidth={1.2} dot={false} strokeDasharray="4 3" connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="chart-legend">
          <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.oil }} />Precio ponderado (eje izquierdo)</div>
          {extra && <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: extra.color }} />{extra.name}</div>}
          <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.ink }} />Variación acumulada % (eje derecho)</div>
        </div>
      </div>
    </div>
  );
}

function TooltipSerie({ active, payload, label, unidad, extraFmt = {} }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{fmt.monthShort(label)}</div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.dataKey} className="chart-tooltip-row">
          <div className="chart-tooltip-row-label">
            <span className="chart-tooltip-swatch" style={{ background: p.color || p.fill }} />
            <span>{p.name}</span>
          </div>
          <span className="chart-tooltip-row-val">
            {extraFmt[p.dataKey] ? extraFmt[p.dataKey](p.value)
              : p.dataKey === 'acumulada' ? fmt.pct(p.value)
                : `${fmtPrecio(p.value, unidad)} ${unidad}`}
          </span>
        </div>
      ))}
    </div>
  );
}
