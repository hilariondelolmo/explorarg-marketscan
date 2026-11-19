// Ediciones de la página "Situación al ..." (/situacion, pestaña de Reforma; HDO, 19/11/2026).
// Cada edición es una foto fechada: los artículos y los videos de ese día. La más nueva va PRIMERA:
// es la que abre /situacion y la que le da la fecha al rótulo de la pestaña. Las anteriores quedan
// en /situacion/<fecha> y aparecen en el selector "Ediciones" de la página.
// Para sumar una edición: agregarla acá arriba y registrar su componente en src/pages/Situacion.jsx.
export const RUTA_SITUACION = '/situacion';

export const EDICIONES = [
  { fecha: '2026-11-19', corta: '19/11/2026', larga: '19 de noviembre de 2026' },
];

export const EDICION_VIGENTE = EDICIONES[0];
export const ROTULO_SITUACION = `Situación al ${EDICION_VIGENTE.corta}`;
export const edicion = (fecha) => EDICIONES.find((e) => e.fecha === fecha);
export const rutaEdicion = (e) => (e === EDICION_VIGENTE ? RUTA_SITUACION : `${RUTA_SITUACION}/${e.fecha}`);
