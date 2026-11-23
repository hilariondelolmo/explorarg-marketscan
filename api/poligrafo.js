import { ESQUEMA_ANALISIS, MAX_CONTEXTO, MAX_ENUNCIADO, normalizarAnalisis } from '../src/lib/poligrafo/analisis.js';
import { elegirTextos, textosQueFaltan } from '../src/lib/poligrafo/textos.js';
import { armarConsigna, armarMensaje, armarTextosOpcionales } from '../server/poligrafo/consigna.js';
import { contextoDelSitio } from '../server/poligrafo/contexto.js';
import { ErrorMotor, traducir } from '../server/poligrafo/modelo.js';
import { veredictoResumido } from '../server/poligrafo/veredicto.js';
import { ErrorDeSesion, exigirSesion } from '../server/cuentas/sesion.js';
import { conCobro } from '../server/cuentas/cobro.js';
import { ErrorDeCuenta } from '../server/cuentas/cuenta.js';

/**
 * Polígrafo: traduce un enunciado a forma lógica con IA.
 *
 * POST { enunciado, contexto? } -> { analisis, textos, vueltas, cuenta } (y, solo en la copia local, motor, modelo y uso)
 *
 * Es el único paso que usa IA (y el único que cuesta). El cálculo y el
 * veredicto los hace la página con el motor de src/lib/poligrafo, sobre los
 * mismos JSON que usan los tableros. Lo que devuelve el modelo pasa por
 * normalizarAnalisis antes de salir de acá.
 *
 * Desde el 22/11/2026 la IA también contrasta contra los textos legales
 * (src/data/poligrafo_normas.json): ahí sí propone un juicio, y solo se toma
 * si lo respalda con una cita que figura textual en la norma. Para lo que una
 * frase omite puede citar además, por id, los datos de la ficha (ficha.js).
 *
 * Costo (22/11/2026): los textos legales son casi el 70% de lo que se manda. Van siempre
 * la media sanción, la ley vigente y el Marco Legal; el texto original del S-809, la Ley de
 * Bases y los de la Unión Europea se suman solo si la frase los nombra (textos.js). Si el
 * modelo avisa que le faltó uno, la consulta se repite una sola vez con ese texto.
 *
 * Para publicar (hoy es prototipo local):
 *   - Falta ANTHROPIC_API_KEY en Vercel (y probar una vez el motor "api": hasta hoy solo
 *     corrió el motor local).
 *   - Ya está en vercel.json (23/11/2026): los JSON de src/data viajan con la función
 *     ("includeFiles": la lista que se lee es DATOS_DEL_SITIO, en src/lib/poligrafo/contexto.js)
 *     y el tiempo máximo es de 300 segundos (una consulta puede dar dos vueltas).
 *   - El límite por usuario es la cuenta corriente en tokens (server/cuentas/).
 */

// Los mismos JSON que importa la página (server/poligrafo/contexto.js): con ellos se arman
// la lista de nombres, los textos legales y la ficha de datos que la IA puede citar.
// La consigna se arma una vez por cada versión de los datos.
let cache = null; // { ctx, consigna }

async function contexto() {
  const ctx = await contextoDelSitio();
  if (cache?.ctx !== ctx) cache = { ctx, consigna: armarConsigna(ctx) };
  return cache;
}

const ESTADO_HTTP = { sin_motor: 503, sin_sesion: 503, ocupado: 503, sin_conexion: 503, rechazo: 422, falla: 502 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  // el candado: sin sesión no se consulta a la IA (server/cuentas/sesion.js)
  let sesion;
  try {
    sesion = await exigirSesion(req);
  } catch (e) {
    if (e instanceof ErrorDeSesion) {
      res.status(e.estadoHttp).json({ error: e.message, codigo: e.codigo });
      return;
    }
    throw e;
  }
  const enunciado = typeof req.body?.enunciado === 'string' ? req.body.enunciado.replace(/\s+/g, ' ').trim() : '';
  if (enunciado.length < 12) {
    res.status(400).json({ error: 'Escribí el enunciado que querés evaluar.' });
    return;
  }
  if (enunciado.length > MAX_ENUNCIADO) {
    res.status(400).json({ error: `El enunciado es muy largo: el máximo son ${MAX_ENUNCIADO} caracteres.` });
    return;
  }

  // opcional: quién lo dijo, cuándo y sobre qué (no se evalúa, solo orienta la lectura)
  const marco = typeof req.body?.contexto === 'string' ? req.body.contexto.replace(/\s+/g, ' ').trim().slice(0, MAX_CONTEXTO) : '';

  try {
    // conCobro aparta el precio antes de consultar y lo devuelve si no hubo respuesta (server/cuentas/cobro.js)
    const { resultado, cuenta } = await conCobro(sesion, 'poligrafo', async () => {
      const { ctx, consigna } = await contexto();
      const mensaje = armarMensaje(enunciado, ctx, marco);
      let textos = elegirTextos(enunciado, marco);
      let r = await traducir({ consigna, extra: armarTextosOpcionales(ctx, textos), mensaje, esquema: ESQUEMA_ANALISIS });
      // red de seguridad: el modelo avisa si le faltó un texto que no se cargó; se repite una vez con ese texto
      const faltan = textosQueFaltan(r.json?.textos_necesarios, textos);
      let vueltas = 1;
      if (faltan.length) {
        textos = [...textos, ...faltan];
        const r2 = await traducir({ consigna, extra: armarTextosOpcionales(ctx, textos), mensaje, esquema: ESQUEMA_ANALISIS });
        const suma = (k) => (r.uso?.[k] ?? 0) + (r2.uso?.[k] ?? 0);
        r = { ...r2, uso: { entrada: suma('entrada'), entradaDeCache: suma('entradaDeCache'), entradaACache: suma('entradaACache'), salida: suma('salida') } };
        vueltas = 2;
      }
      const analisis = normalizarAnalisis(r.json, ctx);
      return {
        analisis,
        r,
        textos,
        vueltas,
        faltan,
        // un texto en el que no se encontró ninguna afirmación no se cobra
        cobrar: analisis.afirmaciones.length > 0,
        motivo: 'sin_afirmaciones',
        registro: {
          pedido: enunciado,
          contexto: marco,
          respuestaJson: JSON.stringify(analisis),
          motor: r.motor,
          // cómo terminó, con los datos de hoy: para la lista de Indeterminados del panel de administrador
          veredicto: veredictoResumido(analisis, ctx),
        },
        // con el modelo y los tokens se calcula lo que se cobra (server/cuentas/precios.js)
        modelo: r.modelo,
        uso: r.uso,
      };
    }, { pedido: enunciado });
    const { analisis, r, textos, vueltas, faltan } = resultado;
    console.log(`[poligrafo] ${sesion.local ? 'local' : sesion.uid} · ${r.motor} ${r.modelo} · entrada ${r.uso.entrada} (caché ${r.uso.entradaDeCache}) · salida ${r.uso.salida} · ${analisis.afirmaciones.length} afirmaciones · textos a pedido: ${textos.join(', ') || 'ninguno'}${vueltas > 1 ? ` (se repitió para sumar ${faltan.join(', ')})` : ''}${cuenta ? ` · cobrado ${cuenta.cobrado} · saldo ${cuenta.saldo}` : ''}`);
    res.setHeader('Cache-Control', 'no-store');
    if (!analisis.afirmaciones.length) {
      res.status(422).json({ error: 'No encontré ninguna afirmación en ese texto. No se descontó ningún token.', cuenta });
      return;
    }
    // El motor, el modelo y los tokens del modelo solo viajan en la copia local (la página los muestra
    // solo ahí): con ellos y con lo cobrado se podría deducir el margen.
    const tecnico = process.env.VERCEL ? {} : { motor: r.motor, modelo: r.modelo, uso: r.uso };
    res.status(200).json({ analisis, ...tecnico, textos, vueltas, cuenta });
  } catch (e) {
    if (e instanceof ErrorDeCuenta) {
      res.status(e.estadoHttp).json({ error: e.message, codigo: e.codigo, ...e.extra });
      return;
    }
    if (e instanceof ErrorMotor) {
      res.status(ESTADO_HTTP[e.codigo] ?? 500).json({ error: e.message, codigo: e.codigo });
      return;
    }
    console.error('[poligrafo] error:', e);
    res.status(500).json({ error: 'No se pudo analizar el enunciado.' });
  }
}
