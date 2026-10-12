import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import corte from '../../data/corte.json';
import { fmt } from '../../lib/format.js';
import ChartTooltip from '../charts/ChartTooltip.jsx';
import '../charts/Chart.css';
import { useChartColors } from '../../lib/theme.jsx';

/** Déficit anual de corte (ton de bio no cortadas) + acumulado. */
export default function DeficitChart() {
  const C = useChartColors();
  let acum = 0;
  const serie = corte.anual
    .filter((a) => a.anio >= 2010)
    .map((a) => {
      acum += a.deficit_ton || 0;
      return { anio: String(a.anio), deficit: a.deficit_ton || 0, acumulado: acum };
    });

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <div>
          <span className="chart-card-title">Toneladas no cortadas por año</span>
          <span className="chart-card-subtitle">
            biodiesel que el mandato exigía y no se mezcló · línea: acumulado
          </span>
        </div>
      </div>
      <div className="chart-card-body">
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={serie} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <XAxis dataKey="anio" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} />
            <YAxis
              yAxisId="izq"
              tick={{ fill: C.tick, fontSize: 11 }}
              tickFormatter={(v) => fmt.compact(v)}
              stroke={C.axis}
            />
            <YAxis
              yAxisId="der"
              orientation="right"
              tick={{ fill: C.tick, fontSize: 11 }}
              tickFormatter={(v) => fmt.compact(v)}
              stroke={C.axis}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: C.cursor }} />
            <Bar yAxisId="izq" dataKey="deficit" name="Déficit del año" fill={C.alert} />
            <Line
              yAxisId="der"
              dataKey="acumulado"
              name="Acumulado 2010-hoy"
              stroke={C.neutral}
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="chart-legend">
          <div className="chart-legend-item">
            <span className="chart-legend-swatch" style={{ background: C.alert }} />
            <span>Déficit anual (eje izquierdo)</span>
          </div>
          <div className="chart-legend-item">
            <span className="chart-legend-swatch" style={{ background: C.neutral }} />
            <span>Déficit acumulado (eje derecho)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
