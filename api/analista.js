import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { desdeModelo, ESQUEMA_CONSULTA, MAX_PEDIDO } from '../src/lib/analista/consulta.js';
import { armarContexto, DATOS_DEL_SITIO } from '../src/lib/poligrafo/contexto.js';
import { armarConsignaAnalista, armarMensajeAnalista } from '../server/analista/consigna.js';
import { ErrorMotor, traducir } from '../server/poligrafo/modelo.js';
import { ErrorDeSesion, exigirSesion } from '../server/cuentas/sesion.js';
import { conCobro } from '../server/cuentas/cobro.js';
import { ErrorDeCuenta } from '../server/cuentas/cuenta.js';

/**
 * Analista (Agente Explorarg): traduce un pedido de análisis a una consulta.
 *
 * POST { pedido } -> { ok, consulta, avisos, aclaracion, cuenta } (y, solo en la copia local, motor, modelo y uso)
 *                 o  { ok: false, motivo, ... } cuando el pedido no se puede responder
 *
 * Como en el Polígrafo, este es el único paso que usa IA. El cálculo lo hace la
 * página con el motor de src/lib/analista sobre los mismos JSON de los tableros,
 * y cada cambio que la persona hace en los menús se recalcula sin volver acá.
 *
 * La consigna no lleva textos legales: es de unos 9.000 tokens.
 *
 * Modelo: Sonnet (decisión de HDO del 22/11/2026). En 24 pedidos de prueba tradujo igual
 * que Opus y cuesta la mitad; si entiende mal, se ve en "Así entendí el pedido" y se
 * corrige con un menú. El Polígrafo sigue con Opus. Se cambia con ANALISTA_MODELO (API)
 * y ANALISTA_MODELO_LOCAL (el Claude Code de esta Mac).
 *
 * Para publicar: falta la clave de la API en Vercel, igual que en api/poligrafo.js. Los
 * JSON de src/data y el tiempo máximo (120 segundos) ya están en vercel.json.
 */

const MODELO = process.env.ANALISTA_MODELO || 'claude-sonnet-5-5';
const MODELO_LOCAL = process.env.ANALISTA_MODELO_LOCAL || 'sonnet';

// Lo que necesita el Analista de src/data (no los textos legales ni la votación)
const ARCHIVOS = ['empresas', 'mercado', 'corte', 'capacidad', 'aceite', 'tecnicos', 'gasoilPrecios', 'gasoilRanking', 'iclIco2', 'naftas', 'bioetanol', 'compras'];
const DATOS = ARCHIVOS.map((nombre) => [nombre, DATOS_DEL_SITIO[nombre]]);
const ruta = (archivo) => path.join(process.cwd(), 'src', 'data', `${archivo}.json`);
let cache = null; // { sello, ctx, consigna }

async function contexto() {
  const sello = (await Promise.all(DATOS.map(async ([, archivo]) => (await stat(ruta(archivo))).mtimeMs))).join('-');
  if (!cache || cache.sello !== sello) {
    const d = Object.fromEntries(await Promise.all(DATOS.map(async ([nombre, archivo]) => [nombre, JSON.parse(await readFile(ruta(archivo), 'utf8'))])));
    const ctx = armarContexto(d);
    cache = { sello, ctx, consigna: armarConsignaAnalista(ctx) };
  }
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
  const pedido = typeof req.body?.pedido === 'string' ? req.body.pedido.replace(/\s+/g, ' ').trim() : '';
  if (pedido.length < 8) {
    res.status(400).json({ error: 'Escribí qué querés que analice.' });
    return;
  }
  if (pedido.length > MAX_PEDIDO) {
    res.status(400).json({ error: `El pedido es muy largo: el máximo son ${MAX_PEDIDO} caracteres.` });
    return;
  }

  try {
    // conCobro aparta el precio antes de consultar y lo devuelve si no hubo respuesta (server/cuentas/cobro.js)
    const { resultado, cuenta } = await conCobro(sesion, 'analista', async () => {
      const { ctx, consigna } = await contexto();
      const r = await traducir({
        consigna,
        mensaje: armarMensajeAnalista(pedido, ctx),
        esquema: ESQUEMA_CONSULTA,
        // el Analista va con un modelo distinto del Polígrafo (es una traducción más simple)
        modelo: MODELO,
        modeloLocal: MODELO_LOCAL,
      });
      const c = desdeModelo(r.json, ctx);
      return {
        c,
        r,
        // un pedido que no se puede responder con los datos del sitio no se cobra
        cobrar: c.ok,
        motivo: 'no_se_puede',
        registro: {
          pedido,
          respuestaJson: JSON.stringify({ consulta: c.consulta, avisos: c.avisos, aclaracion: c.aclaracion }),
          motor: r.motor,
        },
        // con el modelo y los tokens se calcula lo que se cobra (server/cuentas/precios.js)
        modelo: r.modelo,
        uso: r.uso,
      };
    }, { pedido });
    const { c, r } = resultado;
    console.log(`[analista] ${sesion.local ? 'local' : sesion.uid} · ${r.motor} ${r.modelo} · entrada ${r.uso.entrada} (caché ${r.uso.entradaDeCache}) · salida ${r.uso.salida} · ${c.ok ? `${c.consulta.tipos.join('+')} de ${c.consulta.metricas.join('+')}` : 'no se puede responder'}${cuenta ? ` · cobrado ${cuenta.cobrado} · saldo ${cuenta.saldo}` : ''}`);
    res.setHeader('Cache-Control', 'no-store');
    // El motor, el modelo y los tokens del modelo solo viajan en la copia local (ver api/poligrafo.js)
    const tecnico = process.env.VERCEL ? {} : { motor: r.motor, modelo: r.modelo, uso: r.uso };
    res.status(200).json({ ...c, ...tecnico, cuenta });
  } catch (e) {
    if (e instanceof ErrorDeCuenta) {
      res.status(e.estadoHttp).json({ error: e.message, codigo: e.codigo, ...e.extra });
      return;
    }
    if (e instanceof ErrorMotor) {
      res.status(ESTADO_HTTP[e.codigo] ?? 500).json({ error: e.message, codigo: e.codigo });
      return;
    }
    console.error('[analista] error:', e);
    res.status(500).json({ error: 'No se pudo analizar el pedido.' });
  }
}
