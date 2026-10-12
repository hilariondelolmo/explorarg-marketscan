import petroleras from '../../data/petroleras.json';
import corte from '../../data/corte.json';
import RankingCumplimiento from './RankingCumplimiento.jsx';
import { usePeriodo, FiltrosPeriodo, ATAJOS } from './PeriodoCumplimiento.jsx';
import { fmt } from '../../lib/format.js';
import '../charts/Chart.css';

const DENSIDAD = corte.densidad_bio;
const OBLIG = new Map(corte.mensual.map((m) => [m.fecha, m.obligatorio]));
// Meses con ventas de gas oil por petrolera y corte obligatorio vigente
const GO_MESES = petroleras.go_mensual.filter((r) => OBLIG.get(r.fecha) != null);
const MESES = GO_MESES.map((r) => r.fecha);

/**
 * Cumplimiento del corte por petrolera en el período elegido (abre en el
 * último año; desde, hasta, atajos 1m / 6m / 1a / 5a / 10a / Todo y
 * presidencia): bio recibido de elaboradoras (m3) / (GO G2+G3 vendido × %
 * corte obligatorio). Con `compacto` (popup de hechos de la Propuesta) solo
 * lleva los atajos en el encabezado del gráfico, como antes.
 */
export default function PetrolerasCumplimiento({ compacto = false }) {
  const P = usePeriodo(MESES, 12);
  const ventana = GO_MESES.filter((r) => P.enPeriodo(r.fecha));
  const fechas = new Set(ventana.map((r) => r.fecha));

  const requerido = new Map(); // petrolera → bio m3 requerido
  for (const row of ventana) {
    for (const [pet, go] of Object.entries(row)) {
      if (pet === 'fecha') continue;
      requerido.set(pet, (requerido.get(pet) || 0) + go * OBLIG.get(row.fecha));
    }
  }

  const recibido = new Map(); // petrolera → bio m3 comprado
  for (const row of petroleras.mensual) {
    if (!fechas.has(row.fecha)) continue;
    for (const [pet, ton] of Object.entries(row)) {
      if (pet === 'fecha' || !ton) continue;
      recibido.set(pet, (recibido.get(pet) || 0) + ton / DENSIDAD);
    }
  }

  // Solo petroleras con cupo asignado en la ventana: las revendedoras compran
  // gas oil ya cortado y no tienen obligación propia de mezcla.
  const conCupo = new Set(
    petroleras.cumplimiento
      .filter((r) => fechas.has(r.fecha) && (r.cupo || 0) > 0)
      .map((r) => r.petrolera)
  );

  const goTotal = [...requerido.values()].reduce((a, b) => a + b, 0);
  const items = [...requerido.entries()]
    .filter(([pet, req]) => req > 1000 && conCupo.has(pet))
    .map(([pet, req]) => ({
      nombre: pet,
      valor: ((recibido.get(pet) || 0) / req) * 100,
      detalle: `share del GO requerido: ${fmt.pct((req / goTotal) * 100)}`,
    }))
    .sort((a, b) => b.valor - a.valor);

  return (
    <>
      {!compacto && <FiltrosPeriodo P={P} idBase="ge-pe" />}
      <div className="chart-card">
        <div className="chart-card-header">
          <div>
            <span className="chart-card-title">Cumplimiento del corte por petrolera</span>
            <span className="chart-card-subtitle">
              bio comprado / bio requerido por sus ventas de gas oil · {P.rotulo}
            </span>
          </div>
          {compacto && (
            <div className="chart-range-selector" style={{ marginLeft: 'auto' }}>
              {ATAJOS.map(([id, n, label]) => (
                <button key={id} className={P.atajoActivo === id ? 'active' : ''} onClick={() => P.atajo(n)}>{label}</button>
              ))}
            </div>
          )}
        </div>
        <div className="chart-card-body">
          <RankingCumplimiento items={items} />
          <p className="note">
            El requerido surge de las ventas de GO Grado 2 y 3 de cada petrolera (excluidos
            bunker y usinas) multiplicadas por el corte obligatorio vigente cada mes. Fuente:
            Secretaría de Energía, ventas de derivados y detalle de biodiesel.
          </p>
        </div>
      </div>
    </>
  );
}
