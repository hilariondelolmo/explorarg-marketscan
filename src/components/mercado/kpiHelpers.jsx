import { fmt } from '../../lib/format.js';

/** Suma n meses a una fecha "YYYY-MM". */
export function mesOffset(fecha, n) {
  const [y, m] = fecha.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${String(Math.floor(t / 12)).padStart(4, '0')}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Cantidad de meses entre dos fechas "YYYY-MM", ambas inclusive. */
export function mesesEntre(desde, hasta) {
  const [y1, m1] = desde.split('-').map(Number);
  const [y2, m2] = hasta.split('-').map(Number);
  return (y2 * 12 + m2) - (y1 * 12 + m1) + 1;
}

/** Variación relativa entre dos valores del mismo indicador, con flecha. */
export function Delta({ actual, base, etiqueta, formatoBase }) {
  if (base == null || actual == null || base === 0) return null;
  const d = (actual / base - 1) * 100;
  const pos = d >= 0;
  return (
    <div className="mh-delta">
      <span className={pos ? 'delta-pos' : 'delta-neg'}>
        {pos ? '▲' : '▼'}{fmt.pct(Math.abs(d))}
      </span>{' '}
      vs. {etiqueta} {formatoBase}
    </div>
  );
}
