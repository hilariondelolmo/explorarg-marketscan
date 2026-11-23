// Helpers para agrupar series por gestión presidencial
import gestion from '../data/gestion.json';
import { mensual as CORTE_MENSUAL } from '../data/corte.json';
// Gas oil importado por mes (toneladas, sin CAMMESA) y densidad, de
// scripts/regenerate_gasoil.py. Imports nombrados: el resto del JSON queda
// fuera de este bundle. No se importa lib/gasoil.js: ese módulo importa
// PRESIDENCIAS de acá.
import { importaciones as IMPORTACIONES_JSON, densidad_go as DENSIDAD_GO } from '../data/gasoil_ranking.json';
import { claveDe, enFunciones, funcionarioEn, metricasDeGestion, presidenciaEn } from './gestionCuentas.js';

/** Presidencias con rango, recortadas a la era del corte (2010→). */
export const PRESIDENCIAS = gestion.presidencias
  .filter((p) => !p.hasta || p.hasta >= '2010-01')
  .map((p) => ({
    ...p,
    corto: p.presidente
      .replace('Cristina Fernández de Kirchner', 'C. Fernández de Kirchner')
      .replace('Alberto Fernández', 'A. Fernández'),
  }));

// Las cuentas están en gestionCuentas.js, que también usa el Polígrafo: una sola para todo el sitio.

/** Devuelve la presidencia vigente para una fecha "YYYY-MM". */
export const presidenciaDe = (fecha) => presidenciaEn(PRESIDENCIAS, fecha);

/** Secretarios/as de Energía y subsecretarios del área de hidrocarburos. */
export const SECRETARIOS = enFunciones(gestion.secretarios);
export const SUBSECRETARIOS = enFunciones(gestion.subsecretarios);

/** Funcionario de una lista en funciones a mediados del mes "YYYY-MM". */
export const funcionarioDe = funcionarioEn;

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

export { claveDe };

/**
 * Métricas de la gestión de cada funcionario de la lista (SECRETARIOS o
 * SUBSECRETARIOS): corte real, cumplimiento y gas oil importado. La cuenta,
 * explicada, está en gestionCuentas.js (metricasDeGestion).
 */
export const metricasGestion = (lista) =>
  metricasDeGestion({ lista, corteMensual: CORTE_MENSUAL, importaciones: IMPORTACIONES_JSON, densidadGo: DENSIDAD_GO });
