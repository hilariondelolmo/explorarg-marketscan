import { useState } from 'react';
import { fmt } from '../../lib/format.js';
import { PRESIDENCIAS } from '../../lib/gestiones.js';
import '../mercado/Mercado.css';
import '../gasoil/GasOil.css';
import './Gestion.css';

// Atajos del período: meses hacia atrás desde el último mes con datos (null = todo)
export const ATAJOS = [['1m', 1, '1m'], ['6m', 6, '6m'], ['1a', 12, '1a'], ['5a', 60, '5a'], ['10a', 120, '10a'], ['todo', null, 'Todo']];

/**
 * Período elegible de las páginas de cumplimiento (pedido de HDO del
 * 12/10/2026): desde y hasta libres sobre los meses con datos, atajos 1m /
 * 6m / 1a / 5a / 10a / Todo hasta el último mes, y las presidencias de
 * diciembre a noviembre de cada mandato, como en Gas Oil y Márgenes. Los
 * atajos y la presidencia se sueltan al mover una fecha a mano.
 * `meses`: lista ordenada "YYYY-MM" de los meses con datos (constante).
 */
export function usePeriodo(meses, inicial = 12) {
  const primero = meses[0];
  const ultimo = meses.at(-1);
  const idx = new Map(meses.map((f, i) => [f, i]));
  const desdeDe = (n) => (n == null ? primero : meses[Math.max(0, idx.get(ultimo) - n + 1)]);
  const [desde, setDesde] = useState(() => desdeDe(inicial));
  const [hasta, setHasta] = useState(ultimo);
  const cambiarDesde = (f) => { setDesde(f); if (f > hasta) setHasta(f); };
  const cambiarHasta = (f) => { setHasta(f); if (f < desde) setDesde(f); };
  const atajo = (n) => { setHasta(ultimo); setDesde(desdeDe(n)); };
  const atajoActivo = hasta !== ultimo ? '' : ATAJOS.find(([, n]) => desde === desdeDe(n))?.[0] || '';
  const presidencias = PRESIDENCIAS.map((p) => {
    const d = `${p.desde.slice(0, 4)}-12`;
    const h = p.hasta ? `${p.hasta.slice(0, 4)}-11` : ultimo;
    return { id: p.presidente, nombre: p.corto, desde: d < primero ? primero : d, hasta: h > ultimo ? ultimo : h };
  }).filter((p) => p.desde <= p.hasta);
  const presidenciaActiva = presidencias.find((p) => p.desde === desde && p.hasta === hasta)?.id || '';
  const elegirPresidencia = (id) => {
    const p = presidencias.find((q) => q.id === id);
    if (p) { setDesde(p.desde); setHasta(p.hasta); }
  };
  const enPeriodo = (f) => f >= desde && f <= hasta;
  const nMeses = idx.get(hasta) - idx.get(desde) + 1;
  const rotulo = desde === hasta
    ? fmt.monthShort(desde)
    : `${fmt.monthShort(desde)} → ${fmt.monthShort(hasta)} · ${nMeses} meses`;
  return {
    meses, desde, hasta, cambiarDesde, cambiarHasta, atajo, atajoActivo,
    presidencias, presidenciaActiva, elegirPresidencia, enPeriodo, nMeses, rotulo,
  };
}

/** Fila de filtros del período: desde, hasta y atajos, y la presidencia. */
export function FiltrosPeriodo({ P, idBase }) {
  const opciones = [...P.meses].reverse();
  return (
    <div className="go-filtros go-filtros-cumplimiento">
      <div className="go-filtro go-f-intervalo">
        <span className="go-filtro-label">Período</span>
        <div className="go-intervalo-controles">
          <select className="empresa-select" value={P.desde} onChange={(e) => P.cambiarDesde(e.target.value)} aria-label="Desde">
            {opciones.map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
          </select>
          <span className="go-filtro-label">a</span>
          <select className="empresa-select" value={P.hasta} onChange={(e) => P.cambiarHasta(e.target.value)} aria-label="Hasta">
            {opciones.map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
          </select>
          <div className="chart-range-selector">
            {ATAJOS.map(([id, n, label]) => (
              <button key={id} className={P.atajoActivo === id ? 'active' : ''} onClick={() => P.atajo(n)}>{label}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="go-filtro">
        <label htmlFor={`${idBase}-presidencia`}>Presidencia</label>
        <select
          id={`${idBase}-presidencia`} className="empresa-select"
          value={P.presidenciaActiva} onChange={(e) => P.elegirPresidencia(e.target.value)}
        >
          <option value="">Elegir una presidencia…</option>
          {P.presidencias.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre} · {fmt.monthShort(p.desde)} a {fmt.monthShort(p.hasta)}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
