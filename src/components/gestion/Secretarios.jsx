import { useMemo, useState } from 'react';
import gestion from '../../data/gestion.json';
import { fmt } from '../../lib/format.js';
import { SECRETARIOS, SUBSECRETARIOS, claveDe, metricasGestion } from '../../lib/gestiones.js';
import './Gestion.css';
import '../charts/Chart.css';

const DESDE_BIODIESEL = '2006-01-01'; // sanción de la Ley 26.093
const pct1 = (v) => `${(v * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const pct2 = (v) => `${(v * 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
// Mismos umbrales que las tarjetas de eficacia por presidencia
const tono = (cumpl) => (cumpl >= 0.9 ? 'ok' : cumpl >= 0.8 ? 'medio' : 'bajo');

function duracionMeses(desde, hasta) {
  const a = new Date(desde);
  const b = hasta ? new Date(hasta) : new Date();
  return Math.max(1, Math.round((b - a) / (30.44 * 24 * 3600 * 1000)));
}

/**
 * Línea de tiempo de los secretarios de Energía y de los subsecretarios del
 * área hidrocarburos. Con `metricas` (página Cumplimiento del corte, pedido
 * de HDO del 12/10/2026) cada funcionario lleva el corte real, el
 * cumplimiento y la participación del gas oil importado de su gestión
 * (lib/gestiones.js, las mismas cuentas que el gráfico de las gestiones), su
 * puesto por cumplimiento entre los funcionarios con datos, y la lista se
 * puede ordenar por eficacia.
 */
export default function Secretarios({ metricas = false }) {
  const [nivel, setNivel] = useState('secretarios');
  const [todos, setTodos] = useState(false);
  const [orden, setOrden] = useState('cronologico');
  const esSec = nivel === 'secretarios';

  const secretarios = SECRETARIOS
    .filter((s) => todos || !s.hasta || s.hasta >= DESDE_BIODIESEL)
    .slice()
    .reverse();
  const subsecretarios = SUBSECRETARIOS.slice().reverse();
  const cronologica = esSec ? secretarios : subsecretarios;

  // Métricas de cada funcionario y su puesto por cumplimiento
  const M = useMemo(() => (metricas ? metricasGestion(esSec ? SECRETARIOS : SUBSECRETARIOS) : null), [metricas, esSec]);
  const puestos = useMemo(() => {
    if (!M) return new Map();
    const conDatos = [...M].filter(([, m]) => m.cumpl != null).sort((a, b) => b[1].cumpl - a[1].cumpl);
    return new Map(conDatos.map(([k], i) => [k, i + 1]));
  }, [M]);
  const total = puestos.size;
  const lista = orden === 'eficacia' && M
    ? [...cronologica].sort((a, b) => (puestos.get(claveDe(a)) ?? Infinity) - (puestos.get(claveDe(b)) ?? Infinity))
    : cronologica;

  return (
    <>
      <div className="secretarios-controles">
        <div className="chart-range-selector">
          <button className={esSec ? 'active' : ''} onClick={() => setNivel('secretarios')}>
            Secretarios/as de Energía
          </button>
          <button className={!esSec ? 'active' : ''} onClick={() => setNivel('subsecretarios')}>
            Subsecretarios · área hidrocarburos
          </button>
        </div>
        {metricas && (
          <div className="chart-range-selector">
            <button className={orden === 'cronologico' ? 'active' : ''} onClick={() => setOrden('cronologico')}>
              Cronológico
            </button>
            <button
              className={orden === 'eficacia' ? 'active' : ''} onClick={() => setOrden('eficacia')}
              title="Del mayor al menor cumplimiento del corte en su gestión"
            >
              Por eficacia
            </button>
          </div>
        )}
      </div>
      <div className="secretarios-lista">
        {lista.map((s) => {
          const meses = duracionMeses(s.desde, s.hasta);
          const k = claveDe(s);
          const m = M?.get(k);
          const puesto = puestos.get(k);
          // La gestión empezó antes del corte: las cuentas arrancan en ene-2010
          const recortada = m && m.desde > s.desde.slice(0, 7);
          return (
            <div
              key={k}
              className={`secretario-item ${s.hasta ? '' : 'actual'}`}
            >
              <div className="secretario-nombre">
                {puesto && (
                  <span className={`secretario-puesto ${tono(m.cumpl)}`} title={`Puesto ${puesto} de ${total} por cumplimiento del corte`}>
                    {puesto}º de {total}
                  </span>
                )}
                {s.nombre}
                {!s.hasta && ' · en funciones'}
              </div>
              <div className="secretario-meta">
                {fmt.monthShort(s.desde.slice(0, 7))} →{' '}
                {s.hasta ? fmt.monthShort(s.hasta.slice(0, 7)) : 'hoy'}
                {' · '}{meses} meses · Presidencia {s.presidente}
                {esSec && s.coalicion ? ` · ${s.coalicion}` : ''}
              </div>
              {!esSec && (
                <div className="secretario-meta">
                  {s.cargo}
                  {s.nombramiento ? ` · ${s.nombramiento}` : ''}
                </div>
              )}
              {metricas && (m ? (
                <div className="secretario-metricas">
                  <div className="secretario-metrica">
                    <span className="secretario-metrica-label">Corte real</span>
                    <strong>{pct2(m.corte)}</strong>
                    <span className="secretario-metrica-sub">
                      {m.meses} meses{recortada ? ` desde ${fmt.monthShort(m.desde)}` : ''}
                    </span>
                  </div>
                  <div className="secretario-metrica">
                    <span className="secretario-metrica-label">Cumplimiento</span>
                    <strong className={tono(m.cumpl)}>{pct1(m.cumpl)}</strong>
                    <div className="gestion-barra">
                      <div className={`gestion-barra-fill ${tono(m.cumpl)}`} style={{ width: `${Math.min(100, m.cumpl * 100)}%` }} />
                    </div>
                  </div>
                  <div className="secretario-metrica">
                    <span className="secretario-metrica-label">Gas oil importado</span>
                    <strong>{m.importado != null ? pct1(m.importado) : '-'}</strong>
                    <span className="secretario-metrica-sub">del gas oil vendido</span>
                  </div>
                </div>
              ) : (
                <div className="secretario-sin-datos">Sin datos: el corte obligatorio rige desde ene-2010.</div>
              ))}
            </div>
          );
        })}
      </div>
      {esSec && (
        <button className="secretarios-toggle" onClick={() => setTodos((v) => !v)}>
          {todos
            ? 'Ver solo era biodiesel (2006→)'
            : `Ver historia completa (${gestion.secretarios.length} desde 1958)`}
        </button>
      )}
      {metricas && (
        <p className="note" style={{ marginTop: '1.2rem' }}>
          Corte real: biodiesel vendido para el corte sobre el gas oil grado 2 y 3 del país sin bunker ni usinas, en m³,
          de todos los meses de la gestión desde ene-2010. Cumplimiento: ese biodiesel sobre el que mandaba la norma
          vigente cada mes. Gas oil importado: despachos de importación (sin CAMMESA) sobre el mismo gas oil, en m³.
          El puesto ordena por cumplimiento a los {total} funcionarios con datos. Las mismas cuentas que el gráfico
          de la pestaña Corte obligatorio.
        </p>
      )}
    </>
  );
}
