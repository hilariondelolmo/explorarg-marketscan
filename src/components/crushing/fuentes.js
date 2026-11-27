// Crushing integrado - de dónde se puede tomar el precio del aceite en el mercado local y
// el FOB del biodiésel. Lo comparten las pantallas Hoy y Evolución. Los `id` son los
// campos del conjunto de datos del área reservada (scripts/regenerate_crushing.py).

export const FUENTES_ACEITE_LOCAL = [
  { id: 'fas_jj', label: 'FAS J.J. Hinrichsen, promedio' },
  { id: 'fas_jj_vendedor', label: 'FAS J.J. Hinrichsen, vendedor' },
  { id: 'fas_jj_comprador', label: 'FAS J.J. Hinrichsen, comprador' },
  { id: 'fas_minagri', label: 'FAS teórico (FOB oficial menos retención)' },
];

// La fuente pública del FOB del biodiésel. Las de uso interno no se nombran en el código:
// vienen declaradas en los datos del área reservada (`datos.privadas`).
const FUENTES_BIO_FOB = [{ id: 'bio_fob_jj', label: 'J.J. Hinrichsen, FOB Rosario' }];

/** De dónde se puede tomar el FOB del biodiésel con estos datos: [{ id, label }]. */
export const fuentesBioFob = (datos) => [
  ...FUENTES_BIO_FOB,
  ...(datos.privadas ?? []).filter((x) => x.uso === 'bio_fob').map((x) => ({ id: x.id, label: x.rotulo })),
];

export const POSICIONES = [
  { id: '', label: 'Más cercana' },
  { id: '_sig', label: 'Mes siguiente' },
];
