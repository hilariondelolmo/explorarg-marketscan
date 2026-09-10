import { useMemo, useState } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import empresasData from '../../data/empresas.json';
import KPIs from '../KPIs.jsx';
import { mesOffset, mesesEntre, Delta } from './kpiHelpers.jsx';
import { fmt } from '../../lib/format.js';
import ChartTooltip from '../charts/ChartTooltip.jsx';
import '../charts/Chart.css';
import './Mercado.css';
import { useChartColors } from '../../lib/theme.jsx';

/**
 * Ficha por elaboradora: selector de empresa, KPIs del último año completo
 * y serie cupo/ventas con vista anual o mensual.
 * serie: [fecha, prod, cupo, ventas_corte, xquota, exportaciones]
 */
const TODAS = '__todas__';

// Serie agregada de un conjunto de empresas: suma mes a mes. El % de
// cumplimiento que se deriva sale de los volúmenes agregados
// (Σventas/Σcupo), nunca de promediar porcentajes.
const sumaSerie = (lista) => {
  const porFecha = new Map();
  for (const e of lista) {
    for (const [f, prod, cupo, vc, xq, exp] of e.serie) {
      const c = porFecha.get(f) || [f, 0, 0, 0, 0, 0];
      c[1] += prod || 0;
      c[2] += cupo || 0;
      c[3] += vc || 0;
      c[4] += xq || 0;
      c[5] += exp || 0;
      porFecha.set(f, c);
    }
  }
  return [...porFecha.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
};

// Ventana temporal del gráfico, como en Evolución de ventas: "12m" solo
// tiene sentido en la vista mensual (en anual cae a 5 años).
const RANGOS = [
  { id: '12m', label: '12m', anios: 1, soloMensual: true },
  { id: '5y', label: '5 años', anios: 5 },
  { id: '10y', label: '10 años', anios: 10 },
  { id: 'todo', label: 'Todo', anios: null },
];

export default function EmpresaFicha({ seccion }) {
  const C = useChartColors();
  const empresas = empresasData.empresas;
  // Selección: el mercado completo, una empresa o un grupo económico
  const [sel, setSel] = useState({ tipo: 'todas' });
  // Al entrar: apertura mensual de los últimos 12 meses (pedido HDO)
  const [vista, setVista] = useState('mensual');
  const [rangoId, setRangoId] = useState('12m');
  const anual = vista === 'anual';
  const rango = RANGOS.find((r) => r.id === rangoId && !(anual && r.soloMensual))
    || RANGOS.find((r) => r.id === '5y');

  // Grupos elegibles: los que consolidan más de una empresa. Incluye los
  // supergrupos (holdings de holdings, p.ej. ESSENTIAL ENERGY) con todas
  // sus empresas, igual que en la matriz.
  const grupos = useMemo(() => {
    const m = new Map();
    const add = (clave, e) => {
      if (!m.has(clave)) m.set(clave, []);
      m.get(clave).push(e);
    };
    for (const e of empresas) {
      if (e.grupo) add(e.grupo, e);
      if (e.supergrupo) add(e.supergrupo, e);
    }
    return [...m.entries()]
      .filter(([, miembros]) => miembros.length > 1)
      .sort(([a], [b]) => a.localeCompare(b, 'es'));
  }, [empresas]);

  const emp = useMemo(() => {
    if (sel.tipo === 'empresa') return empresas.find((e) => e.empresa === sel.empresa);
    if (sel.tipo === 'grupo') {
      const miembros = grupos.find(([g]) => g === sel.grupo)?.[1] || [];
      const cats = new Set(miembros.map((e) => e.categoria));
      return {
        empresa: sel.grupo,
        esAgregado: true,
        categoria: cats.size === 1 ? [...cats][0] : null,
        agregado: { cuenta: miembros.length, sub: 'empresas del grupo' },
        serie: sumaSerie(miembros),
      };
    }
    return {
      empresa: 'Todas las elaboradoras',
      esAgregado: true,
      categoria: null,
      agregado: { cuenta: empresas.length, sub: 'en el registro histórico' },
      serie: sumaSerie(empresas),
    };
  }, [sel, empresas, grupos]);

  const { serieAnual, serieMensual, fin, inicio, acum } = useMemo(() => {
    const porAnio = new Map();
    for (const [f, prod, cupo, vc, xq, exp] of emp.serie) {
      const y = f.slice(0, 4);
      const cur = porAnio.get(y) || { prod: 0, cupo: 0, vc: 0, xq: 0, exp: 0, meses: 0 };
      cur.prod += prod || 0;
      cur.cupo += cupo || 0;
      cur.vc += vc || 0;
      cur.xq += xq || 0;
      cur.exp += exp || 0;
      cur.meses += 1;
      porAnio.set(y, cur);
    }
    const sa = [...porAnio.entries()].map(([anio, v]) => ({
      x: anio,
      Cupo: Math.round(v.cupo) || null,
      Ventas_corte: Math.round(v.vc),
      Fuera_de_corte: Math.round(v.xq),
      Exportaciones: Math.round(v.exp),
      prod: Math.round(v.prod),
      cumplimiento: v.cupo > 0 ? (v.vc / v.cupo) * 100 : null,
      meses: v.meses,
    }));
    // Ventana mensual: la vida activa de LA EMPRESA (una empresa inactiva
    // hoy mostraría vacío si se usara el calendario). El recorte 12m/5a/10a
    // se aplica después, sobre esta ventana.
    const activos = emp.serie.filter(([, prod, cupo, vc, xq, exp]) =>
      (prod || 0) + (cupo || 0) + (vc || 0) + (xq || 0) + (exp || 0) > 0);
    const hastaMes = activos.length ? activos.at(-1)[0] : null;
    const desdeMes = activos.length ? activos[0][0] : null;
    const sm = emp.serie
      .filter(([f]) => hastaMes && f >= desdeMes && f <= hastaMes)
      .map(([f, , cupo, vc, xq, exp]) => ({
      x: f,
      Cupo: cupo ? Math.round(cupo) : null,
      Ventas_corte: vc ? Math.round(vc) : 0,
      Fuera_de_corte: xq ? Math.round(xq) : 0,
      Exportaciones: exp ? Math.round(exp) : 0,
      cumplimiento: cupo > 0 ? (vc / cupo) * 100 : null,
    }));
    // Acumulador para los KPIs: suma (desde, hasta] de la serie. La ventana
    // concreta la fija el rango elegido, más abajo.
    const acum = (desde, hasta) => {
      const a = { prod: 0, cupo: 0, vc: 0, exp: 0 };
      for (const [f, prod, cupo, vc, , exp] of emp.serie) {
        if (f > desde && f <= hasta) {
          a.prod += prod || 0;
          a.cupo += cupo || 0;
          a.vc += vc || 0;
          a.exp += exp || 0;
        }
      }
      return a;
    };
    return { serieAnual: sa, serieMensual: sm, fin: hastaMes, inicio: desdeMes, acum };
  }, [emp]);

  // Ventana de los KPIs: sigue el rango elegido para el gráfico (12m / 5
  // años / 10 años / Todo), siempre en meses cerrados hasta el último mes
  // de vida activa. Anual/Mensual solo cambia el dibujo del gráfico, no
  // los KPIs (decisión HDO 10/09/2026). El delta compara contra el período
  // inmediato anterior de igual largo; con "Todo" no hay anterior.
  const { u12, u12py, mesesKpi } = useMemo(() => {
    if (!fin) return { u12: null, u12py: null, mesesKpi: 0 };
    const meses = rango.anios === null ? mesesEntre(inicio, fin) : rango.anios * 12;
    const desde = mesOffset(fin, -meses);
    return {
      u12: acum(desde, fin),
      u12py: rango.anios === null ? null : acum(mesOffset(fin, -2 * meses), desde),
      mesesKpi: meses,
    };
  }, [fin, inicio, acum, rango]);

  const serieBase = anual
    ? serieAnual.filter((s) =>
        s.Cupo > 0 || s.Ventas_corte > 0 || s.Fuera_de_corte > 0 || s.Exportaciones > 0)
    : serieMensual;
  const serie = rango.anios === null
    ? serieBase
    : serieBase.slice(-(anual ? rango.anios : rango.anios * 12));

  // Ventana de los KPIs bajo el título: "Jul 25 / Jun 26" (hasta el
  // último mes de vida activa - para una empresa que cesó, el rango lo
  // dice solo). La leyenda enuncia el período acumulado una sola vez.
  const mesCorto = (f) => {
    const m = fmt.monthShort(f); // "jul 2025"
    return m.charAt(0).toUpperCase() + m.slice(1, 3) + ' ' + m.slice(-2);
  };
  const ventana = fin ? `${mesCorto(mesOffset(fin, -(mesesKpi - 1)))} / ${mesCorto(fin)}` : '';
  const periodoKpi = rango.anios === null
    ? `Acumulado serie completa (${mesesKpi} meses)`
    : rango.anios === 1
      ? 'Acumulado últimos 12 meses'
      : `Acumulado últimos ${rango.anios} años`;
  const etiquetaPrev = rango.anios === 1 ? '12 Ms Prev' : `${rango.anios} Años Prev`;
  const delta12 = (actual, base, formato) => (
    <Delta
      actual={actual} base={base}
      etiqueta={etiquetaPrev} formatoBase={formato}
    />
  );

  const kpis = fin
    ? [
        {
          label: 'Producción',
          value: <>{fmt.int(u12.prod)} <span className="kpi-unidad">ton</span></>,
          delta: u12py && delta12(u12.prod, u12py.prod, `${fmt.compact(u12py.prod)} ton`),
        },
        (u12.cupo > 0 || u12.vc > 0 || u12py?.vc > 0) && {
          label: 'Ventas al corte',
          value: <>{fmt.int(u12.vc)} <span className="kpi-unidad">ton</span></>,
          delta: u12py && delta12(u12.vc, u12py.vc, `${fmt.compact(u12py.vc)} ton`),
        },
        u12.cupo > 0 && {
          label: 'Cumplimiento',
          value: fmt.pct((u12.vc / u12.cupo) * 100, 0),
          sub: 'del cupo asignado',
          tone: (u12.vc / u12.cupo) * 100 >= 95 ? 'pos' : 'neg',
          delta: u12py?.cupo > 0
            ? delta12(u12.vc / u12.cupo, u12py.vc / u12py.cupo,
                fmt.pct((u12py.vc / u12py.cupo) * 100, 0))
            : null,
        },
        (u12.exp > 0 || u12py?.exp > 0) && {
          label: 'Exportaciones',
          value: <>{fmt.int(u12.exp)} <span className="kpi-unidad">ton</span></>,
          delta: u12py && delta12(u12.exp, u12py.exp, `${fmt.compact(u12py.exp)} ton`),
        },
        emp.categoria && {
          label: 'Categoría',
          value: emp.categoria.charAt(0) + emp.categoria.slice(1).toLowerCase(),
          sub: emp.esAgregado
            ? null
            : [emp.localidad, emp.provincia].filter(Boolean).join(', ') || '-',
          tone: 'info',
          texto: true,
        },
        emp.esAgregado && {
          label: 'Elaboradoras',
          value: String(emp.agregado.cuenta),
          sub: emp.agregado.sub,
          tone: 'info',
        },
        // Con grupo real (consolida más de una empresa): el holding al que
        // pertenece. Independiente - en el registro figura como grupo de sí
        // misma - la tarjeta dice "Empresa elaboradora" (pedido HDO).
        !emp.esAgregado && (() => {
          const esGrupoReal = grupos.some(([g]) => g === emp.grupo);
          return {
            label: esGrupoReal ? 'Grupo económico' : 'Empresa elaboradora',
            value: fmt.truncate(esGrupoReal ? emp.grupo : emp.empresa, 22),
            sub: emp.camara ? `Cámara: ${emp.camara}` : null,
            texto: true,
          };
        })(),
      ].filter(Boolean)
    : [];

  return (
    <>
      {/* Bloque fijo estilo Tableau: del encabezado a la base de los
          selectores nada se mueve al scrollear (mismo patrón que la
          matriz; la clase ya trae top, fondo opaco y aire bajo la barra) */}
      <div className="mz-controles-sticky">
      <p className="section-kicker">Mercado Biodiesel</p>
      <h2>{seccion?.title ?? 'Detalle por Empresa y/o Grupo Económico'}</h2>
      {seccion?.intro && <p className="section-intro">{seccion.intro}</p>}
      <div className="empresa-selector-row">
        <label htmlFor="empresa-select">Elaboradora</label>
        <select
          id="empresa-select"
          className="empresa-select"
          value={sel.tipo === 'empresa' ? sel.empresa : sel.tipo === 'todas' ? TODAS : ''}
          onChange={(e) =>
            setSel(e.target.value === TODAS
              ? { tipo: 'todas' }
              : { tipo: 'empresa', empresa: e.target.value })
          }
        >
          {sel.tipo === 'grupo' && <option value="" disabled hidden>-</option>}
          <option value={TODAS}>Todas</option>
          {empresas.map((e) => (
            <option key={e.empresa} value={e.empresa}>
              {e.empresa}
            </option>
          ))}
        </select>
        <label htmlFor="grupo-select">Grupo económico</label>
        <select
          id="grupo-select"
          className="empresa-select"
          value={sel.tipo === 'grupo' ? sel.grupo : ''}
          onChange={(e) =>
            setSel(e.target.value
              ? { tipo: 'grupo', grupo: e.target.value }
              : { tipo: 'todas' })
          }
        >
          <option value="">-</option>
          {grupos.map(([g, miembros]) => (
            <option key={g} value={g}>
              {g} ({miembros.length})
            </option>
          ))}
        </select>
      </div>
      {/* Los KPIs también quedan fijos: solo el gráfico corre debajo.
          El período acumulado se enuncia una sola vez, fuera de las cajas */}
      {kpis.length > 0 && (
        <>
          <p className="kpi-periodo">{periodoKpi} · {ventana}</p>
          <KPIs items={kpis} />
        </>
      )}
      </div>
      <div className="chart-card">
        <div className="chart-card-header">
          <div>
            <span className="chart-card-title empresa-titulo">{fmt.truncate(emp.empresa, 42)}</span>
            <span className="chart-card-subtitle">
              ventas por destino, apilado · línea: cupo asignado
            </span>
          </div>
          <div className="ev-selectores">
            <div className="chart-range-selector">
              <button className={anual ? 'active' : ''} onClick={() => setVista('anual')}>Anual</button>
              <button className={!anual ? 'active' : ''} onClick={() => setVista('mensual')}>Mensual</button>
            </div>
            <div className="chart-range-selector">
              {RANGOS.map((r) => (
                <button
                  key={r.id}
                  className={rango.id === r.id ? 'active' : ''}
                  disabled={anual && r.soloMensual}
                  title={anual && r.soloMensual ? 'Solo en vista mensual' : undefined}
                  onClick={() => setRangoId(r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="chart-card-body">
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={serie} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="x" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis}
                tickFormatter={anual ? undefined : (v) => fmt.monthShort(v)} minTickGap={30}
              />
              <YAxis
                tick={{ fill: C.tick, fontSize: 11 }}
                tickFormatter={(v) => fmt.compact(v)} stroke={C.axis}
              />
              <Tooltip
                content={<ChartTooltip />} cursor={{ stroke: C.axis }}
                labelFormatter={anual ? undefined : (l) => fmt.monthShort(l)}
              />
              <Area dataKey="Ventas_corte" name="Ventas al corte" stackId="v"
                stroke={C.bio} fill={C.bioFillFuerte} />
              <Area dataKey="Fuera_de_corte" name="Fuera de corte" stackId="v"
                stroke={C.neutral} fill={C.neutralFill} />
              <Area dataKey="Exportaciones" name="Exportaciones" stackId="v"
                stroke={C.oil} fill={C.oilFillFuerte} />
              <Line dataKey="Cupo" name="Cupo asignado" stroke={C.exp}
                strokeWidth={1.8} strokeDasharray="5 3" dot={false} />
              {/* Serie invisible: suma el % de cumplimiento al tooltip sin
                  dibujarlo (el gráfico queda igual al de Evolución) */}
              <Line dataKey="cumplimiento" name="Cumplimiento" unit="%"
                stroke={C.ink} strokeWidth={0} dot={false} activeDot={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="chart-legend">
            <div className="chart-legend-item">
              <span className="chart-legend-swatch" style={{ background: C.bio }} />
              <span>Ventas al corte obligatorio</span>
            </div>
            <div className="chart-legend-item">
              <span className="chart-legend-swatch" style={{ background: C.neutral }} />
              <span>Mercado interno fuera de corte</span>
            </div>
            <div className="chart-legend-item">
              <span className="chart-legend-swatch" style={{ background: C.oil }} />
              <span>Exportaciones</span>
            </div>
            <div className="chart-legend-item">
              <span className="chart-legend-swatch" style={{ background: C.exp }} />
              <span>Cupo asignado (línea)</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
