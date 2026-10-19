import datos from '../../data/diputados_corte_anual.json';

/**
 * "El corte se cumplió en tres de dieciséis años": corte obligatorio y corte
 * real por año, 2010 a 2026, con el área del biodiésel que faltó mezclar.
 * Rehecho nativo (SVG) a partir del gráfico del artículo del 13/10/2026; los
 * datos son la copia congelada de corte.json (diputados_corte_anual.json).
 * Colores por clase (QueSeJuegaDiputados.css): respeta el tema oscuro.
 */
const W = 1000;
const ALTO = 560;
const MARGENES = { top: 100, right: 40, bottom: 96, left: 70 };
const M_SIN_TITULO = { ...MARGENES, top: 64 }; // con `sinTitulo` el título lo pone el marco del esquema
const YMAX = 0.11;
const TICKS = [
  [0, '0%'],
  [0.025, '2,5%'],
  [0.05, '5%'],
  [0.075, '7,5%'],
  [0.1, '10%'],
];
const CUMPLIDOS = [2012, 2013, 2017];
const ROTULOS = { 2020: '4,9%', 2023: '4,6%' };

export default function GraficoCorte({ sinTitulo = false }) {
  const anual = datos.anual;
  const n = anual.length;
  const M = sinTitulo ? M_SIN_TITULO : MARGENES;
  const H = sinTitulo ? ALTO - 36 : ALTO;
  const x = (i) => M.left + (i * (W - M.left - M.right)) / (n - 1);
  const y = (v) => M.top + (1 - v / YMAX) * (H - M.top - M.bottom);
  const y0 = y(0);
  const linea = (k) =>
    anual.map((a, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(a[k]).toFixed(1)}`).join(' ');
  const vuelta = anual
    .map((_, j) => {
      const i = n - 1 - j;
      return `L${x(i).toFixed(1)} ${y(anual[i].real).toFixed(1)}`;
    })
    .join(' ');
  const area = `${linea('obligatorio')} ${vuelta} Z`;
  const acumulado = datos.acumulado_ton.toLocaleString('es-AR');

  return (
    <svg
      className="dip-grafico"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Corte obligatorio y corte real de biodiésel por año, 2010 a 2026. El corte se cumplió en tres años: 2012, 2013 y 2017. Faltante acumulado ${acumulado} toneladas.`}
    >
      {!sinTitulo && (
        <text className="gc-titulo" x={20} y={36} fontSize={23}>
          El corte se cumplió en tres de dieciséis años
        </text>
      )}
      <text className="gc-sub" x={20} y={sinTitulo ? 30 : 64} fontSize={15}>
        Corte obligatorio y corte real de biodiésel en el gas oil, % por año · faltante acumulado {acumulado} t
      </text>

      {TICKS.map(([v, r]) => (
        <g key={v}>
          <line className="gc-grid" x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} />
          <text className="gc-eje" x={M.left - 10} y={y(v) + 5} fontSize={14} textAnchor="end">
            {r}
          </text>
        </g>
      ))}

      <path className="gc-area" d={area} />
      <path className="gc-oblig" d={linea('obligatorio')} />
      <path className="gc-real" d={linea('real')} />

      {anual.map((a, i) => (
        <g key={a.anio}>
          <circle className="gc-punto" cx={x(i)} cy={y(a.real)} r={4.5} />
          {CUMPLIDOS.includes(a.anio) && (
            <circle className="gc-anillo" cx={x(i)} cy={y(a.real)} r={11} />
          )}
          {ROTULOS[a.anio] && (
            <text className="gc-etiqueta" x={x(i)} y={y(a.real) + 28} fontSize={15} textAnchor="middle">
              {ROTULOS[a.anio]}
            </text>
          )}
          <text className="gc-eje" x={x(i)} y={y0 + 24} fontSize={14} textAnchor="middle">
            {a.anio}
          </text>
        </g>
      ))}

      {/* "cumplido": un rótulo para 2012-2013 y otro para 2017 */}
      <text className="gc-etiqueta" x={(x(2) + x(3)) / 2} y={y(anual[3].real) - 24} fontSize={15} textAnchor="middle">
        cumplido
      </text>
      <text className="gc-etiqueta" x={x(7)} y={y(anual[7].real) - 22} fontSize={15} textAnchor="middle">
        cumplido
      </text>

      <line className="gc-grid" x1={M.left} x2={W - M.right} y1={y0} y2={y0} />

      {/* Leyenda */}
      <g transform={`translate(${M.left}, ${H - 30})`}>
        <line className="gc-oblig" x1={0} x2={34} y1={0} y2={0} />
        <text className="gc-eje" x={42} y={5} fontSize={14}>Corte obligatorio</text>
        <line className="gc-real" x1={190} x2={224} y1={0} y2={0} />
        <circle className="gc-punto" cx={207} cy={0} r={4.5} />
        <text className="gc-eje" x={232} y={5} fontSize={14}>Corte real</text>
        <rect className="gc-area-leyenda" x={330} y={-8} width={22} height={16} />
        <text className="gc-eje" x={360} y={5} fontSize={14}>Biodiésel que faltó mezclar</text>
      </g>
      <text className="gc-eje" x={W - M.right} y={H - 25} fontSize={14} textAnchor="end">
        2026: enero a agosto
      </text>
    </svg>
  );
}
