// Helpers para agrupar series por gestión presidencial
import gestion from '../data/gestion.json';

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
