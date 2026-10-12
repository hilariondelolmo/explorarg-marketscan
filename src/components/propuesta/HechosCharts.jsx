import { useState } from 'react';
import {
  Area, Bar, BarChart, Cell, ComposedChart, Line, LineChart,
  Tooltip, XAxis, YAxis, ResponsiveContainer,
} from 'recharts';
import corte from '../../data/corte.json';
import dashboard from '../../data/dashboard.json';
import evidencia from '../../data/evidencia.json';
import capacidad from '../../data/capacidad.json';
import empresas from '../../data/empresas.json';
import petroleras from '../../data/petroleras.json';
import { fmt } from '../../lib/format.js';
import ChartTooltip from '../charts/ChartTooltip.jsx';
import EficaciaGestionesCards from '../gestion/EficaciaGestiones.jsx';
import PetrolerasCumplimiento from '../gestion/PetrolerasCumplimiento.jsx';
import DeficitChart from '../gestion/DeficitChart.jsx';
import SecretariosLista from '../gestion/Secretarios.jsx';
import FormulasPreciosGrid from '../gestion/FormulasPrecios.jsx';
import GruposAceiteras from '../mercado/GruposAceiteras.jsx';
import CategoriasComparadas from '../mercado/CategoriasComparadas.jsx';
import CorteRealGO from '../mercado/CorteRealGO.jsx';
import DemandaPetroleras from '../mercado/DemandaPetroleras.jsx';
import { useChartColors } from '../../lib/theme.jsx';

/**
 * Gráficos de la oblea "Respaldo en datos" (/propuesta-s0809-2026).
 *
 * Reemplazan a los PNG del docx AMPLIADO_DATOS con las mismas series pero
 * leídas del pipeline del dashboard (decisión HDO 2026-08-17). El generador
 * deja placeholders <div class="pl-chart" data-chart="id"> en los popups y
 * PropuestaLey los monta por portal con el registro HECHOS_CHARTS.
 */

const ALTO = 240;

function Marco({ titulo, nota, extra, children }) {
  return (
    <figure className="pl-chart-box">
      <figcaption style={extra ? { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.8rem', flexWrap: 'wrap' } : undefined}>
        <span>
          <span className="pl-chart-titulo">{titulo}</span>
          {nota && <span className="pl-chart-nota">{nota}</span>}
        </span>
        {extra}
      </figcaption>
      <ResponsiveContainer width="100%" height={ALTO}>
        {children}
      </ResponsiveContainer>
    </figure>
  );
}

// Ventanas de análisis compartidas por los gráficos con selector
const VENTANAS = [['1m', 1], ['6m', 6], ['1a', 12], ['5a', 60], ['10a', 120], ['Todo', 0]];

function SelectorVentana({ meses, setMeses }) {
  return (
    <span className="chart-range-selector">
      {VENTANAS.map(([rotulo, m]) => (
        <button key={rotulo} type="button" className={meses === m ? 'active' : ''}
                onClick={() => setMeses(m)}>
          {rotulo}
        </button>
      ))}
    </span>
  );
}

const ejeX = (C, extra = {}) => ({
  tick: { fill: C.tick, fontSize: 11 },
  stroke: C.axis,
  ...extra,
});

const ejeY = (C, formatter) => ({
  tick: { fill: C.tick, fontSize: 11 },
  stroke: C.axis,
  width: 52,
  tickFormatter: formatter,
});

// Ticks anuales (enero) para series mensuales largas
const ticksAnuales = (serie) =>
  serie.filter((d) => d.fecha.endsWith('-01')).map((d) => d.fecha);

/* ── art. 12: corte obligatorio vs corte real, serie completa ── */
function CorteSerie() {
  const C = useChartColors();
  const serie = corte.mensual.map((m) => {
    const real = m.real == null ? null : +(m.real * 100).toFixed(2);
    const oblig = m.obligatorio == null ? null : +(m.obligatorio * 100).toFixed(2);
    return {
      fecha: m.fecha,
      Obligatorio: oblig,
      Real: real,
      Déficit: oblig != null && real != null && oblig > real
        ? +(oblig - real).toFixed(2) : 0,
    };
  });
  return (
    <Marco titulo="Corte obligatorio y corte real de biodiesel en gasoil"
           nota="mensual, % - el área sombreada es el déficit - fuente: SE / dashboard explorarg">
      <ComposedChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="fecha" {...ejeX(C, {
          ticks: ticksAnuales(serie),
          tickFormatter: (f) => f.slice(0, 4),
        })} />
        <YAxis {...ejeY(C, (v) => `${v}%`)} />
        <Tooltip content={<ChartTooltip unit="%" labelFormatter={fmt.monthShort} />}
                 cursor={{ stroke: C.cursorLinea }} />
        <Area isAnimationActive={false} dataKey="Real" stackId="corte"
              stroke={C.alert} strokeWidth={1.6} fill={C.bioFill} connectNulls />
        <Area isAnimationActive={false} dataKey="Déficit" stackId="corte"
              stroke="none" fill={C.alertFill} />
        <Line isAnimationActive={false} dataKey="Obligatorio" stroke={C.exp} dot={false} strokeWidth={2}
              type="stepAfter" connectNulls />
      </ComposedChart>
    </Marco>
  );
}

/* ── art. 12: eficacia por gestión y petroleras, reusados del eje /gestion
      tal como se ven en el dashboard (pedido HDO 2026-08-18) ── */
function EficaciaGestiones() {
  return (
    <figure className="pl-chart-box">
      <figcaption>
        <span className="pl-chart-titulo">Eficacia de la Autoridad de Aplicación por gestión</span>
        <span className="pl-chart-nota">
          biodiesel cortado / requerido por la norma vigente · 2010 → jun. 2026 - fuente: SE / dashboard explorarg
        </span>
      </figcaption>
      <EficaciaGestionesCards />
    </figure>
  );
}

/* ── art. 12: asignación oficial vs ventas registradas, por año ── */
function AsignacionVentas() {
  const C = useChartColors();
  const serie = dashboard.anual
    .filter((a) => a.AÑO >= 2010 && a.AÑO < 2026)
    .map((a) => ({
      anio: a.AÑO,
      Asignado: Math.round(a['BIODIESEL QUOTA [ton]'] || 0),
      Vendido: Math.round(a['BIODIESEL QUOTA SALES [ton]'] || 0),
    }));
  return (
    <Marco titulo="Cupo asignado y ventas al corte registradas"
           nota="toneladas por año - fuente: SE / dashboard explorarg">
      <BarChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="anio" {...ejeX(C)} />
        <YAxis {...ejeY(C, fmt.compact)} />
        <Tooltip content={<ChartTooltip unit="ton" />} cursor={{ fill: C.cursor }} />
        <Bar isAnimationActive={false} dataKey="Asignado" fill={C.expDim} />
        <Bar isAnimationActive={false} dataKey="Vendido" fill={C.bio} />
      </BarChart>
    </Marco>
  );
}

/* ── art. 14: precio publicado vs resultado de la fórmula 963/2023 ── */
function PrecioFormula() {
  const C = useChartColors();
  const serie = evidencia.precio_biodiesel
    .filter((p) => p.fecha >= '2023-11' && (p.grande_ni != null || p.formula_963 != null))
    .map((p) => ({
      fecha: p.fecha,
      Publicado: p.grande_ni == null ? null : Math.round(p.grande_ni),
      'Fórmula 963/2023': p.formula_963 == null ? null : Math.round(p.formula_963),
    }));
  return (
    <Marco titulo="Precio publicado y precio resultante de la fórmula vigente"
           nota="$/ton - fuente: SE, Res. 963/2023 / dashboard explorarg">
      <LineChart data={serie} margin={{ top: 8, right: 8, left: 12, bottom: 0 }}>
        <XAxis dataKey="fecha" {...ejeX(C, { tickFormatter: fmt.monthShort, minTickGap: 40 })} />
        <YAxis {...ejeY(C, fmt.compact)} />
        <Tooltip content={<ChartTooltip unit="$/ton" labelFormatter={fmt.monthShort} />}
                 cursor={{ stroke: C.cursorLinea }} />
        <Line isAnimationActive={false} dataKey="Publicado" stroke={C.exp} dot={false} strokeWidth={2} connectNulls />
        <Line isAnimationActive={false} dataKey="Fórmula 963/2023" stroke={C.alert} dot={false} strokeWidth={2}
              strokeDasharray="5 3" connectNulls />
      </LineChart>
    </Marco>
  );
}

/* ── art. 14: concentración de la demanda, con ventana elegible ── */
function ConcentracionCompradores() {
  const C = useChartColors();
  const [meses, setMeses] = useState(12);
  const filas = petroleras.mensual;
  const ventana = meses ? filas.slice(-meses) : filas;
  const compras = {};
  for (const row of ventana) {
    for (const [petro, v] of Object.entries(row)) {
      if (petro === 'fecha' || !v) continue;
      compras[petro] = (compras[petro] || 0) + v;
    }
  }
  const total = Object.values(compras).reduce((a, b) => a + b, 0);
  const orden = Object.entries(compras).sort((a, b) => b[1] - a[1]);
  const top = orden.slice(0, 4).map(([nombre, v]) => ({
    nombre: fmt.truncate(nombre, 26),
    Participación: +((v / total) * 100).toFixed(1),
  }));
  const resto = orden.slice(4).reduce((a, [, v]) => a + v, 0);
  if (resto > 0) {
    top.push({ nombre: 'Resto', Participación: +((resto / total) * 100).toFixed(1) });
  }
  const desde = ventana[0]?.fecha;
  const hasta = ventana.at(-1)?.fecha;
  const rango = desde === hasta ? fmt.monthShort(desde)
    : `${fmt.monthShort(desde)} - ${fmt.monthShort(hasta)}`;
  return (
    <Marco titulo="Concentración de las compras de biodiesel para el corte"
           nota={`% del total, ${rango} - fuente: SE / dashboard explorarg`}
           extra={<SelectorVentana meses={meses} setMeses={setMeses} />}>
      <BarChart data={top} layout="vertical"
                margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
        <XAxis type="number" {...ejeX(C, { tickFormatter: (v) => `${v}%` })} />
        <YAxis type="category" dataKey="nombre" width={168}
               tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} />
        <Tooltip content={<ChartTooltip unit="%" />} cursor={{ fill: C.cursor }} />
        <Bar isAnimationActive={false} dataKey="Participación">
          {top.map((d, i) => (
            <Cell key={d.nombre} fill={d.nombre === 'Resto' ? C.neutralFill : C.exp} />
          ))}
        </Bar>
      </BarChart>
    </Marco>
  );
}

/* ── art. 17: metanol YPF - precio interno vs exportación, y prima ── */
function Metanol() {
  const C = useChartColors();
  const serie = evidencia.metanol
    .filter((m) => m.fecha >= '2019-01' && (m.interno != null || m.fob_export != null))
    .map((m) => ({
      fecha: m.fecha,
      'Precio interno': m.interno ?? null,
      'Precio de exportación': m.fob_export == null ? null : Math.round(m.fob_export),
      Prima: m.prima == null ? null : Math.round(m.prima),
    }));
  return (
    <Marco titulo="Metanol de YPF: precio interno, precio de exportación y prima"
           nota="usd/ton - fuentes: relevamiento propio y aduana / dashboard explorarg">
      <LineChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="fecha" {...ejeX(C, {
          ticks: ticksAnuales(serie),
          tickFormatter: (f) => f.slice(0, 4),
        })} />
        <YAxis {...ejeY(C, fmt.int)} />
        <Tooltip content={<ChartTooltip unit="usd/ton" labelFormatter={fmt.monthShort} />}
                 cursor={{ stroke: C.cursorLinea }} />
        <Line isAnimationActive={false} dataKey="Precio interno" stroke={C.alert} dot={false} strokeWidth={2} connectNulls />
        <Line isAnimationActive={false} dataKey="Precio de exportación" stroke={C.exp} dot={false} strokeWidth={1.6} connectNulls />
        <Line isAnimationActive={false} dataKey="Prima" stroke={C.bio} dot={false} strokeWidth={1.6}
              strokeDasharray="4 3" connectNulls />
      </LineChart>
    </Marco>
  );
}

/* ── art. 5: asimetría de escala integradas vs no integradas ──
   Universo HDO (2026-08-17): plantas activas (ON) del último mes de la
   serie de capacidad, promedio por planta. Con Patagonia INTEGRADA
   reproduce las cifras del informe (2.620.000 / promedio 327.500). */
function AsimetriaEscala() {
  const C = useChartColors();
  const categoria = Object.fromEntries(
    empresas.empresas.map((e) => [e.empresa, e.categoria])
  );
  const ultimo = capacidad.serie[capacidad.serie.length - 1].fecha;
  const grupos = { INTEGRADA: [], 'NO INTEGRADA': [] };
  for (const r of capacidad.serie) {
    if (r.fecha !== ultimo || r.condicion !== 'ON') continue;
    const c = categoria[r.empresa];
    if (grupos[c]) grupos[c].push(r.capacidad);
  }
  const prom = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const data = [
    {
      nombre: `Integrada (${grupos.INTEGRADA.length} plantas)`,
      Capacidad: Math.round(prom(grupos.INTEGRADA)),
    },
    {
      nombre: `No integrada (${grupos['NO INTEGRADA'].length} plantas)`,
      Capacidad: Math.round(prom(grupos['NO INTEGRADA'])),
    },
  ];
  const relacion = data[1].Capacidad
    ? (data[0].Capacidad / data[1].Capacidad).toFixed(1).replace('.', ',')
    : '-';
  return (
    <Marco titulo="Asimetría de escala por planta activa"
           nota={`capacidad anual promedio (ton) - relación ${relacion}× - fuente: dashboard explorarg`}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis dataKey="nombre" {...ejeX(C)} />
        <YAxis {...ejeY(C, fmt.compact)} />
        <Tooltip content={<ChartTooltip unit="ton" />} cursor={{ fill: C.cursor }} />
        <Bar isAnimationActive={false} dataKey="Capacidad">
          <Cell fill={C.exp} />
          <Cell fill={C.bio} />
        </Bar>
      </BarChart>
    </Marco>
  );
}

/* ── art. 5: derechos de exportación - aceite (SBO) vs biodiesel (SME) ── */
function Retenciones() {
  const C = useChartColors();
  const serie = evidencia.retenciones
    .filter((r) => r.fecha >= '2007-01')
    .map((r) => ({
      fecha: r.fecha,
      'Aceite de soja': r.sbo == null ? null : +(r.sbo * 100).toFixed(1),
      Biodiesel: r.sme == null ? null : +(r.sme * 100).toFixed(1),
    }));
  return (
    <Marco titulo="Derechos de exportación: aceite de soja vs biodiesel"
           nota="%, promedio mensual - fuente: normativa DEX / dashboard explorarg">
      <LineChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="fecha" {...ejeX(C, {
          ticks: ticksAnuales(serie).filter((f) => +f.slice(0, 4) % 2 === 1),
          tickFormatter: (f) => f.slice(0, 4),
        })} />
        <YAxis {...ejeY(C, (v) => `${v}%`)} />
        <Tooltip content={<ChartTooltip unit="%" labelFormatter={fmt.monthShort} />}
                 cursor={{ stroke: C.cursorLinea }} />
        <Line isAnimationActive={false} dataKey="Aceite de soja" stroke={C.oil} dot={false} strokeWidth={2} connectNulls />
        <Line isAnimationActive={false} dataKey="Biodiesel" stroke={C.bio} dot={false} strokeWidth={2} connectNulls />
      </LineChart>
    </Marco>
  );
}

/* ── art. 39: capacidad instalada vs producción nacional ── */
function Utilizacion() {
  const C = useChartColors();
  const capPorAnio = {};
  for (const r of capacidad.serie) {
    const anio = +r.fecha.slice(0, 4);
    (capPorAnio[anio] ||= {})[r.fecha] = (capPorAnio[anio][r.fecha] || 0) + r.capacidad;
  }
  const prodPorAnio = Object.fromEntries(
    dashboard.anual.map((a) => [a.AÑO, a['PRODUCTION [ton]'] || 0])
  );
  const serie = Object.keys(capPorAnio)
    .map(Number)
    .filter((a) => a >= 2010 && a < 2026 && prodPorAnio[a] != null)
    .sort((a, b) => a - b)
    .map((anio) => {
      const meses = Object.values(capPorAnio[anio]);
      const cap = meses.reduce((x, y) => x + y, 0) / meses.length;
      return {
        anio,
        'Capacidad instalada': Math.round(cap),
        Producción: Math.round(prodPorAnio[anio]),
        Utilización: +((prodPorAnio[anio] / cap) * 100).toFixed(1),
      };
    });
  return (
    <Marco titulo="Capacidad instalada y producción nacional"
           nota="toneladas por año - fuente: dashboard explorarg">
      <ComposedChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="anio" {...ejeX(C)} />
        <YAxis {...ejeY(C, fmt.compact)} />
        <Tooltip content={<ChartTooltip unit="ton" />} cursor={{ fill: C.cursor }} />
        <Bar isAnimationActive={false} dataKey="Producción" fill={C.bioFillFuerte} />
        <Line isAnimationActive={false} dataKey="Capacidad instalada" stroke={C.exp} dot={false} strokeWidth={2} />
        <Line isAnimationActive={false} dataKey="Utilización" stroke="none" unit="%" dot={false} legendType="none" />
      </ComposedChart>
    </Marco>
  );
}

/* ── art. 20: aceite de soja FAS Rosario, el rubro dominante del costo ── */
function AceiteFas() {
  const C = useChartColors();
  const serie = evidencia.aceite
    .filter((r) => r.fecha >= '2010-01' && r.fas_minagri != null)
    .map((r) => ({ fecha: r.fecha, 'FAS Rosario': Math.round(r.fas_minagri) }));
  return (
    <Marco titulo="Aceite de soja - precio FAS Rosario"
           nota="usd/ton - más del 75% del costo del biodiesel - fuente: MINAGRI / dashboard explorarg">
      <LineChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="fecha" {...ejeX(C, {
          ticks: ticksAnuales(serie),
          tickFormatter: (f) => f.slice(0, 4),
        })} />
        <YAxis {...ejeY(C, fmt.compact)} />
        <Tooltip content={<ChartTooltip unit="usd/ton" labelFormatter={fmt.monthShort} />}
                 cursor={{ stroke: C.cursorLinea }} />
        <Line isAnimationActive={false} dataKey="FAS Rosario" stroke={C.oil} dot={false} strokeWidth={2} />
      </LineChart>
    </Marco>
  );
}

/* ── componentes de /gestion y /mercado reusados tal cual en los popups ── */
function SecretariosBox() {
  return (
    <figure className="pl-chart-box">
      <figcaption>
        <span className="pl-chart-titulo">Los funcionarios del régimen</span>
        <span className="pl-chart-nota">
          rotación de la Autoridad de Aplicación - fuente: normativa / dashboard explorarg
        </span>
      </figcaption>
      <SecretariosLista />
    </figure>
  );
}

function FormulasBox() {
  return (
    <figure className="pl-chart-box">
      <figcaption>
        <span className="pl-chart-titulo">Las fórmulas de precio del biodiesel desde 2010</span>
        <span className="pl-chart-nota">
          una veintena de cambios normativos - fuente: normativa SE / dashboard explorarg
        </span>
      </figcaption>
      <FormulasPreciosGrid />
    </figure>
  );
}

function DemandaPetrolerasBox() {
  const ultimo = corte.mensual.filter((m) => m.obligatorio != null).at(-1)?.fecha;
  return <DemandaPetroleras mes={ultimo} />;
}

// El popup de hechos lleva la versión compacta (solo los atajos del período)
function PetrolerasCompacto() {
  return <PetrolerasCumplimiento compacto />;
}

export const HECHOS_CHARTS = {
  'corte-serie': CorteSerie,
  'eficacia-gestiones': EficaciaGestiones,
  'petroleras-cumplimiento': PetrolerasCompacto,
  'asignacion-ventas': AsignacionVentas,
  'grupos-aceiteras': GruposAceiteras,
  'categorias-comparadas': CategoriasComparadas,
  'corte-real-go': CorteRealGO,
  'demanda-petroleras': DemandaPetrolerasBox,
  deficit: DeficitChart,
  secretarios: SecretariosBox,
  'formulas-precios': FormulasBox,
  'aceite-fas': AceiteFas,
  'precio-formula': PrecioFormula,
  'concentracion-compradores': ConcentracionCompradores,
  metanol: Metanol,
  'asimetria-escala': AsimetriaEscala,
  retenciones: Retenciones,
  utilizacion: Utilizacion,
};
