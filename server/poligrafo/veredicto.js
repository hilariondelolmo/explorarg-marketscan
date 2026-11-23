// Polígrafo - el veredicto de una consulta, en chico, para guardarlo con ella.
//
// El veredicto lo calcula la página, con el motor de src/lib/poligrafo. Acá se calcula
// lo mismo, con el mismo motor y los mismos datos, para dejar anotado cómo terminó cada
// consulta: así el panel de administrador puede listar las frases que dieron
// Indeterminado sin volver a abrir una por una.
//
// Si el análisis trae preguntas para la persona (el resultado depende de lo que
// conteste), no hay un veredicto único: queda como 'CON_PREGUNTAS'.

import { aplicarRespuestas } from '../../src/lib/poligrafo/analisis.js';
import { evaluarEnunciado } from '../../src/lib/poligrafo/motor.js';

/**
 * { estado, afirmaciones: [{ id, cita, estado, motivo? }], preguntas? } o null si no se
 * pudo calcular. `analisis` es el que devuelve normalizarAnalisis.
 */
export function veredictoResumido(analisis, ctx) {
  try {
    if (!analisis?.afirmaciones?.length) return null;
    const chica = (v) => ({ id: v.id, cita: v.cita ?? '', estado: v.estado, ...(v.motivo ? { motivo: v.motivo } : {}) });
    const preguntas = analisis.preguntas?.length ?? 0;
    if (preguntas) {
      // De las afirmaciones que no dependen de ninguna pregunta sí se sabe cómo terminan
      const dependen = new Set(analisis.preguntas.flatMap((q) => q.aplica_a ?? []));
      let firmes = [];
      try {
        firmes = evaluarEnunciado(aplicarRespuestas(analisis, {}), ctx).veredictos.filter((v) => !dependen.has(v.id)).map(chica);
      } catch {
        firmes = [];
      }
      return { estado: 'CON_PREGUNTAS', preguntas, afirmaciones: firmes };
    }
    const r = evaluarEnunciado(aplicarRespuestas(analisis, {}), ctx);
    return { estado: r.estado, afirmaciones: r.veredictos.map(chica) };
  } catch (e) {
    // que no se pueda anotar el veredicto nunca frena la consulta
    console.error('[poligrafo] no se pudo anotar el veredicto:', e);
    return null;
  }
}
