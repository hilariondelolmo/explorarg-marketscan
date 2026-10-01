import { useMemo, useState } from 'react';
import {
  ComposedChart, Line, Bar, Cell, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { MESES, IDX_MES, TC, DENSIDAD_BIO, RES963, ponderarCol, variacion } from '../../lib/gasoil.js';
import { mensual as CORTE_JSON } from '../../data/corte.json';
import { precio_biodiesel as PRECIO_BIO_JSON } from '../../data/evidencia.json';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import { useRelevamiento, useCajas, Cajas } from './relevamiento.jsx';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import './GasOil.css';

const MEZCLA = new Map(CORTE_JSON.map((m) => [m.fecha, m.real]));                 // mezcla real del mes
const PRECIO_BIO = new Map(PRECIO_BIO_JSON.map((p) => [p.fecha, p.mediana]));    // 963 publicado, $/ton
const R963 = new Map(RES963.map((r) => [r.fecha, r]));
const MESES_963 = RES963.map((r) => r.fecha);

const miles = (v) => (v == null ? '-' : `${fmt.int(v / 1000)} K`);
const pesos = (v) => (v == null ? '-' : `${fmt.int(v)} $/ton`);
const pct = (v, n = 1) => (v == null ? '-' : `${v >= 0 ? '+' : ''}${fmt.pct(v, n)}`);
const millones = (usd) => `U$ ${(usd / 1e6).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`;

function Encabezado({ seccion }) {
  return (
    <>
      <p className="section-kicker">Mercado Gas Oil</p>
      <h2>{seccion?.title ?? 'Precio Res. 963: publicado vs. fórmula'}</h2>
      {seccion?.intro && <p className="section-intro">{seccion.intro}</p>}
    </>
  );
}

function Tarjeta({ label, valor, unidad, sub, tono, title }) {
  return (
    <div className={`kpi-card ${tono ? `tone-${tono}` : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-val" title={title}>{valor}{unidad && <> <span className="kpi-unidad">{unidad}</span></>}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

/**
 * Res. 963: publicado vs. fórmula y ajustes (pedido de HDO del 01/10/2026;
 * réplica del Dashboard 31 "Precio Res 963 vs. precio publicado" y de las
 * hojas de "% ajuste vs. mes anterior" y "% ajuste acumulado" del workbook
 * 05). El precio por fórmula es la columna "Fórmula" del Excel
 * Database Precio Formula 963.xlsx (lo calcula y carga HDO); el publicado es
 * la MEDIANA de Master data y, solo en los meses que no la tienen, la columna
 * "Publicado" del Excel (regla de HDO, 01/10/2026). La diferencia del mes va en barras
 * y, valorizada por el cupo del mes, en la tarjeta de diferencia acumulada.
 *
 * Los ajustes comparan cada mes con el anterior y, acumulados, con el primer
 * mes del intervalo: publicado, fórmula, gas oil fósil grado 2 y 3 y tipo de
 * cambio. El gas oil fósil es el de Minorista y mayorista: precio sin
 * impuestos del relevamiento (minorista, al público, bocas de expendio,
 * ponderado por volumen), neto del biodiésel mezclado con la mezcla real del
 * mes y el precio publicado, en $/l. Sin filtros del relevamiento: el tablero
 * fija ese recorte.
 */
export default function Res963({ seccion }) {
  const C = useChartColors();
  const F = useRelevamiento({ modo: 'surtidor' }); // solo para el cruce fino: minorista, al público, bocas
  const { DX, listo, error, fCanal } = F;
  const [desde, setDesde] = useState(MESES_963[0]);
  const [hasta, setHasta] = useState(MESES_963.at(-1));
  const [abiertos, alternar] = useCajas({ resultado: true, comparacion: true, mensual: true, acumulado: true });
  const cambiarDesde = (f) => { setDesde(f); if (f > hasta) setHasta(f); };
  const cambiarHasta = (f) => { setHasta(f); if (f < desde) setDesde(f); };
  const rango = useMemo(() => MESES_963.filter((f) => f >= desde && f <= hasta), [desde, hasta]);

  // Gas oil fósil grado 2 y 3, $/l, por mes (país, minorista, al público, bocas; precio sin impuestos)
  const fosil = useMemo(() => {
    const out = { g2: new Map(), g3: new Map() };
    if (!listo) return out;
    for (const g of [2, 3]) {
      const m = ponderarCol(DX, fCanal, (i) => DX.mes[i], 'n', g);
      for (const [mi, v] of m) {
        const f = MESES[mi];
        const mezcla = MEZCLA.get(f);
        const bioTon = PRECIO_BIO.get(f);
        if (mezcla == null || !bioTon) continue;
        const bioL = (bioTon * DENSIDAD_BIO) / 1000;
        out[`g${g}`].set(f, (v.precio - mezcla * bioL) / (1 - mezcla));
      }
    }
    return out;
  }, [DX, listo]);

  // Series por mes: niveles, ajuste contra el mes anterior y acumulado desde el primer mes del intervalo
  const SERIES = [
    { k: 'publicado', nombre: 'Biodiésel publicado (SE)', color: C.bio, de: (f) => R963.get(f)?.publicado ?? null },
    { k: 'formula', nombre: 'Biodiésel por fórmula', color: C.exp, de: (f) => R963.get(f)?.formula ?? null },
    { k: 'go2', nombre: 'Gas oil fósil grado 2', color: C.oil, de: (f) => fosil.g2.get(f) ?? null },
    { k: 'go3', nombre: 'Gas oil fósil grado 3', color: C.warn, de: (f) => fosil.g3.get(f) ?? null },
    { k: 'tc', nombre: 'Tipo de cambio', color: C.neutral, de: (f) => TC.get(f) ?? null },
  ];
  const datos = useMemo(() => {
    const anterior = (f) => MESES_963[MESES_963.indexOf(f) - 1] ?? MESES[IDX_MES.get(f) - 1];
    const base = {};
    return rango.map((f) => {
      const r = R963.get(f);
      const p = { fecha: f, publicado: r.publicado, publicado_de: r.publicado_de, formula: r.formula, diferencia: r.publicado - r.formula, cupo: r.cupo, tc: r.tc };
      for (const s of SERIES) {
        const v = s.de(f);
        const ant = anterior(f) ? s.de(anterior(f)) : null;
        p[`m_${s.k}`] = variacion(v, ant);
        if (base[s.k] == null && v != null) base[s.k] = v;
        p[`a_${s.k}`] = v != null && base[s.k] != null ? variacion(v, base[s.k]) : null;
      }
      return p;
    });
  }, [rango, fosil, C]);

  // Resultado: el último mes del intervalo y la diferencia acumulada valorizada por el cupo
  const ultimo = datos.at(-1);
  const acumulado = useMemo(() => datos.reduce((acc, p) => {
    acc.ars += p.diferencia * p.cupo;
    acc.usd += (p.diferencia * p.cupo) / p.tc;
    acc.cupo += p.cupo;
    if (p.diferencia < 0) acc.abajo += 1;
    return acc;
  }, { ars: 0, usd: 0, cupo: 0, abajo: 0 }), [datos]);
  const rotuloRango = `${fmt.monthShort(desde)} a ${fmt.monthShort(hasta)}`;

  const cajas = [
    { id: 'resultado', titulo: 'Resultado del mes', detalle: ultimo ? `${fmt.monthShort(ultimo.fecha)} · publicado ${miles(ultimo.publicado)} · fórmula ${miles(ultimo.formula)}` : '' },
    { id: 'comparacion', titulo: 'Publicado vs. fórmula', detalle: `${rotuloRango} · ${acumulado.abajo} de ${datos.length} meses con el publicado por debajo` },
    { id: 'mensual', titulo: 'Ajuste contra el mes anterior', detalle: 'Biodiésel publicado y por fórmula, gas oil fósil grado 2 y 3, tipo de cambio' },
    { id: 'acumulado', titulo: 'Ajuste acumulado', detalle: `Desde ${fmt.monthShort(desde)}` },
  ];

  const TooltipNiveles = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{fmt.monthShort(label)}</div>
        <div className="chart-tooltip-row"><span className="chart-tooltip-swatch" style={{ background: C.bio }} /><span>Publicado</span><strong>{pesos(p.publicado)}</strong></div>
        <div className="chart-tooltip-row"><span className="chart-tooltip-swatch" style={{ background: C.exp }} /><span>Fórmula</span><strong>{pesos(p.formula)}</strong></div>
        <div className="chart-tooltip-row"><span>Diferencia</span><strong>{pesos(p.diferencia)} ({pct((p.diferencia / p.formula) * 100)})</strong></div>
        <div className="chart-tooltip-row"><span>Cupo del mes</span><strong>{fmt.int(p.cupo)} t</strong></div>
        <div className="chart-tooltip-row"><span>Diferencia × cupo</span><strong>{millones((p.diferencia * p.cupo) / p.tc)}</strong></div>
      </div>
    );
  };
  const TooltipAjuste = ({ prefijo, active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{fmt.monthShort(label)}</div>
        {SERIES.map((s) => (p[`${prefijo}_${s.k}`] == null ? null : (
          <div key={s.k} className="chart-tooltip-row"><span className="chart-tooltip-swatch" style={{ background: s.color }} /><span>{s.nombre}</span><strong>{pct(p[`${prefijo}_${s.k}`])}</strong></div>
        )))}
      </div>
    );
  };
  const graficoAjuste = (prefijo, titulo, sub, tooltip) => (
    <div className="chart-card">
      <div className="chart-card-header">
        <div>
          <span className="chart-card-title">{titulo}</span>
          <span className="chart-card-subtitle">{sub}</span>
        </div>
      </div>
      <div className="chart-card-body">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={datos} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={fmt.monthShort} minTickGap={40} />
            <YAxis tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => `${v}%`} width={52} />
            <ReferenceLine y={0} stroke={C.axis} />
            <Tooltip content={tooltip} cursor={{ stroke: C.axis }} />
            {SERIES.map((s) => (
              <Line key={s.k} dataKey={`${prefijo}_${s.k}`} name={s.nombre} stroke={s.color} strokeWidth={s.k === 'publicado' || s.k === 'formula' ? 2.2 : 1.6}
                strokeDasharray={s.k === 'tc' ? '4 3' : undefined} dot={false} connectNulls />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
        <div className="chart-legend">
          {SERIES.map((s) => (
            <div key={s.k} className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: s.color }} />{s.nombre}</div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="go-seccion go-sesco go-963">
      <div className="go-sticky">
        <Encabezado seccion={seccion} />
        <div className="go-intervalo">
          <span className="go-filtro-label">Intervalo</span>
          <select className="empresa-select" value={desde} onChange={(e) => cambiarDesde(e.target.value)} aria-label="Desde">
            {[...MESES_963].reverse().map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
          </select>
          <span className="go-filtro-label">a</span>
          <select className="empresa-select" value={hasta} onChange={(e) => cambiarHasta(e.target.value)} aria-label="Hasta">
            {[...MESES_963].reverse().map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
          </select>
          <span className="chart-card-subtitle">{rango.length} meses · el ajuste acumulado parte del primer mes del intervalo</span>
        </div>
        <Cajas cajas={cajas} abiertos={abiertos} alternar={alternar} />
      </div>

      {abiertos.resultado && ultimo && (
        <div className="go-kpi-bloque">
          <div className="go-kpi-cabecera">
            <span className="chart-card-subtitle">{fmt.monthShort(ultimo.fecha)} · diferencia acumulada {rotuloRango}, valorizada por el cupo de cada mes y pasada a dólares con el TC del mes</span>
          </div>
          <div className="kpi-grid go-kpis-fila">
            <Tarjeta label="Publicado por la SE" valor={fmt.int(ultimo.publicado)} unidad="$/ton" tono="pos" sub={`cupo del mes ${fmt.int(ultimo.cupo)} t${ultimo.publicado_de === 'excel' ? ' · publicado del Excel (sin mediana todavía)' : ''}`} />
            <Tarjeta label="Por fórmula" valor={fmt.int(ultimo.formula)} unidad="$/ton" tono="info" sub="columna Fórmula del Excel de Explora" />
            <Tarjeta
              label="Diferencia del mes" valor={`${ultimo.diferencia >= 0 ? '+' : '-'}${fmt.int(Math.abs(ultimo.diferencia))}`} unidad="$/ton"
              tono={ultimo.diferencia < 0 ? 'warn' : undefined} sub={`${pct((ultimo.diferencia / ultimo.formula) * 100, 2)} del precio por fórmula · ${millones((ultimo.diferencia * ultimo.cupo) / ultimo.tc)} por el cupo`}
            />
            <Tarjeta
              label="Diferencia acumulada" valor={millones(acumulado.usd)} tono={acumulado.usd < 0 ? 'warn' : undefined}
              sub={`${rotuloRango} · ${acumulado.abajo} de ${datos.length} meses por debajo · ${fmt.int(acumulado.cupo)} t de cupo`}
              title={`${fmt.int(acumulado.ars)} $`}
            />
          </div>
        </div>
      )}

      {abiertos.comparacion && (
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Precio Res. 963: publicado vs. fórmula [$/ton]</span>
              <span className="chart-card-subtitle">Líneas: precio publicado por la SE y precio por fórmula · barras: diferencia del mes (publicado menos fórmula)</span>
            </div>
          </div>
          <div className="chart-card-body">
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={datos} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={fmt.monthShort} minTickGap={40} />
                <YAxis tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={miles} width={62} />
                <ReferenceLine y={0} stroke={C.axis} />
                <Tooltip content={<TooltipNiveles />} cursor={{ fill: C.cursor }} />
                <Bar dataKey="diferencia" name="Diferencia" maxBarSize={18}>
                  {datos.map((p) => <Cell key={p.fecha} fill={p.diferencia < 0 ? C.alert : C.ink} fillOpacity={0.8} />)}
                </Bar>
                <Line dataKey="formula" name="Por fórmula" stroke={C.exp} strokeWidth={2.2} dot={{ r: 2 }} />
                <Line dataKey="publicado" name="Publicado" stroke={C.bio} strokeWidth={2.2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.bio }} />Publicado por la SE</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.exp }} />Por fórmula (Explora)</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.alert }} />Diferencia del mes, publicado por debajo</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.ink }} />Diferencia del mes, publicado por encima</div>
            </div>
          </div>
        </div>
      )}

      {abiertos.mensual && graficoAjuste('m', 'Ajuste contra el mes anterior [%]',
        'Variación de cada precio contra el mes anterior · gas oil fósil: sin impuestos, minorista al público, neto del biodiésel mezclado', <TooltipAjuste prefijo="m" />)}
      {abiertos.acumulado && graficoAjuste('a', `Ajuste acumulado desde ${fmt.monthShort(desde)} [%]`,
        'Variación de cada precio contra el primer mes del intervalo', <TooltipAjuste prefijo="a" />)}
      {!listo && !error && <div className="section-placeholder">Cargando el relevamiento para el gas oil fósil (10 MB, una sola vez)…</div>}
      {error && <div className="section-placeholder">{error}</div>}

      <p className="note go-nota">
        Fuente: precio por fórmula de la Res. SE 963/2023 calculado por Explora (Excel "Database Precio Formula 963", columna
        Fórmula) y precio publicado por la Secretaría de Energía (la mediana de la base Explora; si un mes todavía no la tiene,
        el publicado del Excel), con el cupo asignado cada mes; desde nov-2023, cuando empezó a regir la fórmula. Diferencia × cupo: (publicado menos fórmula) por las toneladas del cupo del mes, en dólares
        con el tipo de cambio del mes. Gas oil fósil: precio sin impuestos del relevamiento Res. 1104/2004 (minorista, al
        público, bocas de expendio, ponderado por volumen) neto del biodiésel mezclado, con la mezcla real del mes y el precio
        publicado (densidad {DENSIDAD_BIO} ton/m³), en $/l; llega hasta el último mes del relevamiento. Tipo de cambio: promedio
        mensual. Los ajustes son variaciones contra el mes anterior y, acumulados, contra el primer mes del intervalo.
      </p>
    </div>
  );
}
