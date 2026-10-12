// Helpers para agrupar series por gestión presidencial
import gestion from '../data/gestion.json';
import { mensual as CORTE_MENSUAL } from '../data/corte.json';
// Gas oil importado por mes (toneladas, sin CAMMESA) y densidad, de
// scripts/regenerate_gasoil.py. Imports nombrados: el resto del JSON queda
// fuera de este bundle. No se importa lib/gasoil.js: ese módulo importa
// PRESIDENCIAS de acá.
import { importaciones as IMPORTACIONES_JSON, densidad_go as DENSIDAD_GO } from '../data/gasoil_ranking.json';

/** Presidencias con rango, recortadas a la era del corte (2010→). */
export const PRESIDENCIAS = gestion.presidencias
  .filter((p) => !p.hasta || p.hasta >= '2010-01')
  .map((p) => ({
    ...p,
    corto: p.presidente
      .replace('Cristina Fernández de Kirchner', 'C. Fernández de Kirchner')
      .replace('Alberto Fernández', 'A. Fernández'),
  }));

/** Devuelve la presidencia vigente para una fecha "YYYY-MM". */
export function presidenciaDe(fecha) {
  const d = `${fecha}-15`;
  return PRESIDENCIAS.find((p) => d >= p.desde && (!p.hasta || d < p.hasta));
}

// El hyper llena el egreso del funcionario en funciones con el último mes de
// datos: el egreso más alto de cada lista se trata como "en funciones".
const enFunciones = (lista) => {
  const max = lista.reduce((m, s) => (s.hasta && s.hasta > m ? s.hasta : m), '');
  return lista.map((s) => (s.hasta === max ? { ...s, hasta: null } : s));
};
/** Secretarios/as de Energía y subsecretarios del área de hidrocarburos. */
export const SECRETARIOS = enFunciones(gestion.secretarios);
export const SUBSECRETARIOS = enFunciones(gestion.subsecretarios);

/** Funcionario de una lista en funciones a mediados del mes "YYYY-MM". */
export function funcionarioDe(lista, fecha) {
  const d = `${fecha}-15`;
  return lista.find((p) => d >= p.desde && (!p.hasta || d <= p.hasta));
}

/** Recorta un rango presidencial al dominio de una serie de fechas "YYYY-MM". */
export function bandas(fechas) {
  if (!fechas.length) return [];
  const min = fechas[0];
  const max = fechas[fechas.length - 1];
  return PRESIDENCIAS.map((p) => {
    const desde = p.desde.slice(0, 7) < min ? min : p.desde.slice(0, 7);
    const hasta = !p.hasta || p.hasta.slice(0, 7) > max ? max : p.hasta.slice(0, 7);
    return desde <= hasta ? { ...p, x1: desde, x2: hasta } : null;
  }).filter(Boolean);
}

const IMPORTADO_TON = new Map(IMPORTACIONES_JSON.map((m) => [m.fecha, m.ton || 0]));
const DESDE_CORTE = '2010-01'; // el corte obligatorio rige desde ene-2010

/** Clave de un funcionario: hay personas con dos períodos. */
export const claveDe = (p) => `${p.nombre}|${p.desde}`;

/**
 * Métricas de la gestión de cada funcionario de la lista (SECRETARIOS o
 * SUBSECRETARIOS) sobre los meses del corte desde ene-2010, con las mismas
 * cuentas que el gráfico Corte obligatorio vs. corte real:
 *  - corte: biodiésel vendido para el corte / gas oil grado 2 + 3 del país
 *    sin bunker ni usinas, en m³, de todos sus meses;
 *  - cumpl: ese biodiésel / lo que mandaba la norma (Σ obligatorio × gas oil);
 *  - importado: gas oil importado (despachos sin CAMMESA, en m³) / el mismo
 *    gas oil, de los meses con dato de importación.
 * Devuelve un Map clave → { corte, cumpl, importado, meses, desde, hasta }.
 */
export function metricasGestion(lista) {
  const acum = new Map();
  for (const r of CORTE_MENSUAL) {
    if (r.fecha < DESDE_CORTE) continue;
    const p = funcionarioDe(lista, r.fecha);
    if (!p) continue;
    const k = claveDe(p);
    const a = acum.get(k) || { bio: 0, go: 0, mandato: 0, imp: 0, goImp: 0, meses: 0, desde: r.fecha, hasta: r.fecha };
    a.bio += r.bio_m3;
    a.go += r.go_m3;
    if (r.obligatorio) a.mandato += r.obligatorio * r.go_m3;
    if (IMPORTADO_TON.has(r.fecha)) {
      a.imp += IMPORTADO_TON.get(r.fecha) / DENSIDAD_GO;
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
