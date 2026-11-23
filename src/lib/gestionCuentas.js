// Las cuentas de la página Cumplimiento del corte por gestión (presidencias y
// secretarios de Energía), sin importar ningún JSON: reciben los datos ya leídos.
//
// Las usan dos partes del sitio, para que den siempre lo mismo:
//   - src/lib/gestiones.js, que les pasa sus datos (página /gestion);
//   - la ficha del Polígrafo (src/lib/poligrafo/ficha.js).

/**
 * El hyper llena el egreso del funcionario en funciones con el último mes de
 * datos: el egreso más alto de cada lista se trata como "en funciones".
 */
export function enFunciones(lista) {
  const max = lista.reduce((m, s) => (s.hasta && s.hasta > m ? s.hasta : m), '');
  return lista.map((s) => (s.hasta === max ? { ...s, hasta: null } : s));
}

/** Funcionario de una lista en funciones a mediados del mes "YYYY-MM". */
export function funcionarioEn(lista, fecha) {
  const d = `${fecha}-15`;
  return lista.find((p) => d >= p.desde && (!p.hasta || d <= p.hasta));
}

/** Presidencia vigente a mediados del mes "YYYY-MM". */
export function presidenciaEn(presidencias, fecha) {
  const d = `${fecha}-15`;
  return presidencias.find((p) => d >= p.desde && (!p.hasta || d < p.hasta));
}

/** Clave de un funcionario: hay personas con dos períodos. */
export const claveDe = (p) => `${p.nombre}|${p.desde}`;

const DESDE_CORTE = '2010-01'; // el corte obligatorio rige desde ene-2010

/**
 * Métricas de la gestión de cada funcionario de la lista sobre los meses del
 * corte desde ene-2010, con las mismas cuentas que el gráfico Corte obligatorio
 * vs. corte real:
 *  - corte: biodiésel vendido para el corte / gas oil grado 2 + 3 del país
 *    sin bunker ni usinas, en m³, de todos sus meses;
 *  - cumpl: ese biodiésel / lo que mandaba la norma (Σ obligatorio × gas oil);
 *  - importado: gas oil importado (despachos sin CAMMESA, en m³) / el mismo
 *    gas oil, de los meses con dato de importación.
 * `importaciones` es [{ fecha, ton }] y `densidadGo`, la densidad del gas oil.
 * Devuelve un Map clave → { corte, cumpl, importado, meses, desde, hasta }.
 */
export function metricasDeGestion({ lista, corteMensual, importaciones, densidadGo }) {
  const importadoTon = new Map(importaciones.map((m) => [m.fecha, m.ton || 0]));
  const acum = new Map();
  for (const r of corteMensual) {
    if (r.fecha < DESDE_CORTE) continue;
    const p = funcionarioEn(lista, r.fecha);
    if (!p) continue;
    const k = claveDe(p);
    const a = acum.get(k) || { bio: 0, go: 0, mandato: 0, imp: 0, goImp: 0, meses: 0, desde: r.fecha, hasta: r.fecha };
    a.bio += r.bio_m3;
    a.go += r.go_m3;
    if (r.obligatorio) a.mandato += r.obligatorio * r.go_m3;
    if (importadoTon.has(r.fecha)) {
      a.imp += importadoTon.get(r.fecha) / densidadGo;
      a.goImp += r.go_m3;
    }
    a.meses += 1;
    a.hasta = r.fecha;
    acum.set(k, a);
  }
  return new Map([...acum].map(([k, a]) => [k, {
    corte: a.go > 0 ? a.bio / a.go : null,
    cumpl: a.mandato > 0 ? a.bio / a.mandato : null,
    importado: a.goImp > 0 ? a.imp / a.goImp : null,
    meses: a.meses,
    desde: a.desde,
    hasta: a.hasta,
  }]));
}

/**
 * Eficacia por presidencia, como las tarjetas de la página (EficaciaGestiones.jsx):
 * cumplimiento = biodiésel vendido para el corte / lo que mandaba la norma, y el
 * déficit acumulado en toneladas, sobre los meses desde ene-2010 con corte obligatorio.
 * Devuelve [{ ...presidencia, cumplimiento (en %), corte (en %), deficit, meses, desde, hasta }].
 */
export function eficaciaPorPresidencia({ presidencias, corteMensual }) {
  const mensual = corteMensual.filter((m) => m.fecha >= DESDE_CORTE && m.obligatorio !== null && m.obligatorio !== undefined);
  return presidencias
    .map((p) => {
      const meses = mensual.filter((m) => presidenciaEn(presidencias, m.fecha)?.presidente === p.presidente);
      if (!meses.length) return null;
      const bio = meses.reduce((s, m) => s + m.bio_m3, 0);
      const go = meses.reduce((s, m) => s + m.go_m3, 0);
      const goOblig = meses.reduce((s, m) => s + m.go_m3 * m.obligatorio, 0);
      return {
        ...p,
        cumplimiento: (bio / goOblig) * 100,
        corte: (bio / go) * 100,
        deficit: meses.reduce((s, m) => s + (m.deficit_ton || 0), 0),
        meses: meses.length,
        desde: meses[0].fecha,
        hasta: meses[meses.length - 1].fecha,
      };
    })
    .filter(Boolean);
}
