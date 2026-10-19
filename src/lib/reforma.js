// Sub-barra de la sección Reforma Ley 27.640 (compartida por todas sus
// páginas): mismo patrón que la sub-nav de los dashboards. Dos pestañas,
// una por cámara, cada una despliega el menú con sus páginas.
//  - Cámara de Senadores: la etapa del Senado (proyecto del Ejecutivo,
//    propuesta, dictamen, mapas y la media sanción del 17/9/2026).
//  - Cámara de Diputados: la etapa que sigue; se va llenando pieza por pieza.

export const PAGINAS_SENADORES = [
  { id: 'analisis', label: 'Análisis Proyecto Secretaría Energía', to: '/reforma-ley-27640' },
  { id: 'propuesta', label: 'Propuesta modificaciones al Proyecto', to: '/propuesta-s0809-2026' },
  { id: 'optimizada', label: 'Propuesta optimizada', to: '/propuesta-optimizada' },
  { id: 'dictamen', label: 'Análisis del dictamen', to: '/analisis-dictamen' },
  { id: 'firmas', label: 'Mapa de firmas', to: '/mapa-firmas' },
  { id: 'recinto', label: 'Mapa del recinto', to: '/mapa-recinto' },
  { id: 'cinco-minutos', label: 'Lo que no entra en 5 minutos', to: '/cinco-minutos' },
];

// La versión de texto del artículo sigue en /que-se-juega-en-diputados-texto
// como respaldo, fuera del menú (HDO, 19/10/2026)
export const PAGINAS_DIPUTADOS = [
  { id: 'que-se-juega', label: 'Qué pasa y qué se juega en Diputados', to: '/que-se-juega-en-diputados' },
  { id: 'propia-vara', label: 'Ley de biocombustibles - El proyecto medido contra su propia vara', to: '/ley-biocombustibles-propia-vara' },
];

// Diputados primero, a la izquierda (al lado irán más títulos); Senadores al
// extremo derecho de la barra (HDO, 19/10/2026)
export const SECCIONES_REFORMA = [
  { id: 'diputados', label: 'Cámara de Diputados', menu: PAGINAS_DIPUTADOS },
  // Pestaña propia, sin menú: el video y el documento de la respuesta al Documento CEPREB
  // (HDO, 19/10/2026; el rótulo tiene que decir de frente que es una respuesta)
  { id: 'cepreb', label: 'Respuesta al Documento CEPREB en Diputados', to: '/respuesta-documento-cepreb' },
  { id: 'senadores', label: 'Cámara de Senadores', menu: PAGINAS_SENADORES, derecha: true },
];
