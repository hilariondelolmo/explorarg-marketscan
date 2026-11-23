// Polígrafo - qué textos legales viajan en cada consulta.
//
// Los textos legales son casi el 70% de lo que se le manda al modelo, y eso es lo
// que cuesta. Medido el 22/11/2026 con los 29 episodios de «Del dicho al dato»:
// la media sanción y la ley vigente se usan casi siempre; el texto original del
// S-809, la Ley de Bases y los textos de la Unión Europea, en cuatro de 29.
// Decisión de HDO (22/11/2026): recortar, y seguir con Opus.
//
//  - El núcleo va siempre: media sanción, Ley 27.640 y Marco Legal.
//  - Los opcionales se suman solo si la frase los nombra (elegirTextos).
//  - Red de seguridad: si igual hacía falta uno que no se cargó, el modelo lo
//    pide (campo textos_necesarios) y la consulta se repite con ese texto.
//
// Para sumar un texto nuevo a pedido: agregarlo acá con sus normas y su patrón.

export const NUCLEO = ['MS', 'L27640', 'ML'];

// `patron` se busca en el enunciado; `patronContexto`, en el contexto que escribe
// la persona (más estricto: el contexto nombra cargos y lugares sin hablar del tema).
// Los dos se aplican sobre el texto en minúsculas y sin tildes.
export const TEXTOS_OPCIONALES = {
  UE: {
    normas: ['UE245', 'UE835'],
    nombre: 'los textos de la Unión Europea sobre el acuerdo de 2019 con los exportadores argentinos de biodiésel',
    cuando: 'cuando se habla de Europa, de exportar o de aranceles',
    patron: /europ|\bue\b|arancel|anti-?dumping|compensatori|countervailing|compromiso de precios|exporta|mercado(s)? extern/,
    patronContexto: /europ|\bue\b/,
  },
  LB: {
    normas: ['LB', 'LBR'],
    nombre: 'el capítulo de biocombustibles de la Ley de Bases de 2024 (el proyecto original del Poder Ejecutivo)',
    cuando: 'cuando se habla de la Ley de Bases o del proyecto original del Poder Ejecutivo',
    patron: /ley (de )?bases|ley omnibus|proyecto original|primer proyecto|poder ejecutivo|del ejecutivo|oficialismo|el gobierno (propuso|mando|envio)|\b2024\b/,
    patronContexto: /ley (de )?bases|ley omnibus/,
  },
  S809: {
    normas: ['S809'],
    nombre: 'el texto original del proyecto S-809/26, tal como ingresó al Senado el 14/5/2026',
    cuando: 'cuando se habla de cómo era el proyecto al principio o de qué se le cambió',
    patron:
      /proyecto original|texto original|proyecto que (ingreso|entro)|(ingreso|entro) al senado|como (ingreso|entro)|ajustes|cambios|modific|se le hicieron|al principio|se cambio|retoc|no estaba en el proyecto|consensuad/,
    patronContexto: /texto original|proyecto original/,
  },
};

const plano = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Las claves de los textos opcionales que la frase (o su contexto) nombra. */
export function elegirTextos(enunciado, contexto = '') {
  const e = plano(enunciado);
  const c = plano(contexto);
  return Object.entries(TEXTOS_OPCIONALES)
    .filter(([, t]) => t.patron.test(e) || t.patronContexto.test(c))
    .map(([k]) => k);
}

/** De lo que pide el modelo, las claves válidas que todavía no estaban cargadas. */
export function textosQueFaltan(pedidos, cargados) {
  return [...new Set(Array.isArray(pedidos) ? pedidos : [])].filter((k) => TEXTOS_OPCIONALES[k] && !cargados.includes(k));
}
