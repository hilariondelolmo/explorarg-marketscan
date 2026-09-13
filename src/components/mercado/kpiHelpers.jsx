import { fmt } from '../../lib/format.js';

/** Suma n meses a una fecha "YYYY-MM". */
export function mesOffset(fecha, n) {
  const [y, m] = fecha.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${String(Math.floor(t / 12)).padStart(4, '0')}-${String((t % 12) + 1).padStart(2, '0')}`;
}

// Serie agregada de un conjunto de empresas: suma mes a mes. El % de
// cumplimiento que se deriva sale de los volúmenes agregados
// (Σventas/Σcupo), nunca de promediar porcentajes.
export const sumaSerie = (lista) => {
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

/** Primer y último mes con actividad (producción, cupo, ventas o exportaciones). */
export function ventanaActiva(serie) {
  const activos = serie.filter(([, prod, cupo, vc, xq, exp]) =>
    (prod || 0) + (cupo || 0) + (vc || 0) + (xq || 0) + (exp || 0) > 0);
  return {
    desde: activos.length ? activos[0][0] : null,
    hasta: activos.length ? activos.at(-1)[0] : null,
  };
}

/** Acumulado de la serie en (desde, hasta]: producción, cupo, ventas al corte, fuera de corte y exportaciones. */
export function acumular(serie, desde, hasta) {
  const a = { prod: 0, cupo: 0, vc: 0, xq: 0, exp: 0 };
  for (const [f, prod, cupo, vc, xq, exp] of serie) {
    if (f > desde && f <= hasta) {
      a.prod += prod || 0;
      a.cupo += cupo || 0;
      a.vc += vc || 0;
      a.xq += xq || 0;
      a.exp += exp || 0;
    }
  }
  return a;
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
