// Polígrafo - la llamada al modelo de IA.
//
// Dos motores, la misma consigna y el mismo esquema de salida:
//
//   api    La API de Anthropic con el SDK oficial. Es el que va a producción.
//          Necesita ANTHROPIC_API_KEY (en Vercel, o en .env.local para probar
//          acá). Se paga por consulta.
//   local  El Claude Code instalado en esta Mac (`claude -p`), con la sesión
//          de la suscripción de HDO. Sin costo por consulta. Solo sirve para
//          el prototipo local: en el sitio publicado no existe.
//
// Elección: POLIGRAFO_MOTOR=api|local la fuerza. Si no está, usa "api" cuando
// hay clave o cuando corre en Vercel, y "local" en cualquier otro caso.
//
// El modelo de la API se cambia con POLIGRAFO_MODELO (por defecto claude-opus-5-5).
// El motor local usa POLIGRAFO_MODELO_LOCAL (por defecto "opus": el Opus más
// nuevo que conozca el Claude Code instalado; desde la actualización del
// 22/11/2026 a la versión 2.1.330, eso es claude-opus-5-5, el mismo de la API).

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

export const MODELO = process.env.POLIGRAFO_MODELO || 'claude-opus-5-5';
const MODELO_LOCAL = process.env.POLIGRAFO_MODELO_LOCAL || 'opus';
// Cuánto razona el modelo antes de responder. Sirve para los dos motores.
const ESFUERZO = process.env.POLIGRAFO_ESFUERZO || 'medium';
const ESPERA_LOCAL_MS = 150_000;

export class ErrorMotor extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

export function motorElegido() {
  const pedido = process.env.POLIGRAFO_MOTOR;
  if (pedido === 'api' || pedido === 'local') return pedido;
  if (process.env.ANTHROPIC_API_KEY || process.env.VERCEL) return 'api';
  return 'local';
}

// ------------------------------------------------------------------ api

async function porApi({ consigna, extra, mensaje, esquema, modelo }) {
  let response;
  try {
    const client = new Anthropic();
    response = await client.beta.messages.create({
      model: modelo || MODELO,
      max_tokens: 16000,
      // si el modelo se niega a analizar un texto, la API reintenta sola con otro modelo
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // La parte fija de la consigna se guarda en caché y las consultas siguientes la pagan a una
      // fracción. Los textos a pedido van en un segundo bloque, con su propia marca: si cambian,
      // la parte fija se sigue leyendo de caché.
      system: [
        { type: 'text', text: consigna, cache_control: { type: 'ephemeral' } },
        ...(extra ? [{ type: 'text', text: extra, cache_control: { type: 'ephemeral' } }] : []),
      ],
      output_config: { effort: ESFUERZO, format: { type: 'json_schema', schema: esquema } },
      messages: [{ role: 'user', content: mensaje }],
    });
  } catch (e) {
    // queda en el registro del servidor qué contestó la API (el mensaje no trae la clave)
    if (e instanceof Anthropic.APIError) console.error(`[motor] la API de Anthropic devolvió un error: ${e.status ?? 's/n'} ${String(e.message ?? '').slice(0, 300)}`);
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      throw new ErrorMotor('sin_motor', 'La clave de la API de Anthropic falta o no es válida.');
    }
    if (e instanceof Anthropic.RateLimitError) {
      throw new ErrorMotor('ocupado', 'El servicio de análisis está con mucha demanda. Probá de nuevo en un minuto.');
    }
    if (e instanceof Anthropic.APIConnectionError) {
      throw new ErrorMotor('sin_conexion', 'No se pudo conectar con el servicio de análisis.');
    }
    if (e instanceof Anthropic.APIError) {
      throw new ErrorMotor('falla', `El servicio de análisis devolvió un error (${e.status ?? 's/n'}).`);
    }
    // sin clave ni credenciales, el SDK falla antes de llamar
    console.error('[poligrafo] el SDK no pudo hacer la llamada:', e?.message);
    throw new ErrorMotor('sin_motor', 'El motor de IA no está configurado (falta la clave de la API).');
  }

  if (response.stop_reason === 'refusal') {
    throw new ErrorMotor('rechazo', 'Ese texto no se puede analizar.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new ErrorMotor('falla', 'El análisis quedó cortado. Probá con un enunciado más corto.');
  }
  const texto = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  let json;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new ErrorMotor('falla', 'El análisis no devolvió una respuesta que se pueda leer. Probá de nuevo.');
  }
  const u = response.usage ?? {};
  return {
    json,
    modelo: response.model,
    uso: {
      entrada: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
      entradaDeCache: u.cache_read_input_tokens ?? 0,
      entradaACache: u.cache_creation_input_tokens ?? 0, // lo que se guardó en caché: se paga más caro que la entrada común
      salida: u.output_tokens ?? 0,
    },
  };
}

// ------------------------------------------------------------------ local

function binarioClaude() {
  if (process.env.POLIGRAFO_CLAUDE_BIN) return process.env.POLIGRAFO_CLAUDE_BIN;
  const enHome = path.join(os.homedir(), '.local', 'bin', 'claude');
  return existsSync(enHome) ? enHome : 'claude';
}

function porClaudeLocal({ consigna, extra, mensaje, esquema, modeloLocal }) {
  return new Promise((resolve, reject) => {
    // Entorno limpio: si el servidor de desarrollo se levantó desde otra sesión de
    // Claude, hereda variables que le hacen ignorar la sesión propia del programa.
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|ANTHROPIC)/.test(k)));
    // La consigna trae los textos legales completos: va por archivo, no por argumento.
    const carpeta = mkdtempSync(path.join(os.tmpdir(), 'poligrafo-'));
    const archivoConsigna = path.join(carpeta, 'consigna.txt');
    writeFileSync(archivoConsigna, extra ? `${consigna}\n\n${extra}` : consigna, 'utf8');
    const limpiar = () => rmSync(carpeta, { recursive: true, force: true });
    const args = [
      '-p',
      '--output-format', 'json',
      '--model', modeloLocal || MODELO_LOCAL,
      '--effort', ESFUERZO,
      '--tools', '',
      '--no-session-persistence',
      '--strict-mcp-config',
      '--disable-slash-commands',
      '--system-prompt-file', archivoConsigna,
      '--json-schema', JSON.stringify(esquema),
    ];
    let hijo;
    try {
      hijo = spawn(binarioClaude(), args, { cwd: carpeta, env, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      limpiar();
      reject(new ErrorMotor('sin_motor', 'No se pudo iniciar Claude Code en esta Mac.'));
      return;
    }
    let salida = '';
    let errores = '';
    const reloj = setTimeout(() => {
      hijo.kill('SIGKILL');
      limpiar();
      reject(new ErrorMotor('falla', 'El análisis tardó demasiado. Probá de nuevo.'));
    }, ESPERA_LOCAL_MS);

    hijo.stdout.on('data', (d) => { salida += d; });
    hijo.stderr.on('data', (d) => { errores += d; });
    hijo.on('error', () => {
      clearTimeout(reloj);
      limpiar();
      reject(new ErrorMotor('sin_motor', 'No encuentro Claude Code instalado en esta Mac.'));
    });
    hijo.on('close', () => {
      clearTimeout(reloj);
      limpiar();
      let r;
      try {
        r = JSON.parse(salida);
      } catch {
        reject(new ErrorMotor('falla', `Claude Code no devolvió una respuesta que se pueda leer. ${errores.slice(0, 200)}`.trim()));
        return;
      }
      if (r.is_error) {
        const txt = String(r.result ?? '');
        if (/authenticat|oauth|log ?in|api key/i.test(txt)) {
          reject(new ErrorMotor('sin_sesion', 'Claude Code no tiene la sesión iniciada en esta Mac. Abrí una terminal y corré: claude auth login'));
        } else {
          reject(new ErrorMotor('falla', `Claude Code devolvió un error: ${txt.slice(0, 200)}`));
        }
        return;
      }
      let json = r.structured_output;
      if (!json && typeof r.result === 'string') {
        try {
          json = JSON.parse(r.result);
        } catch {
          json = null;
        }
      }
      if (!json) {
        reject(new ErrorMotor('falla', 'El análisis no devolvió una respuesta que se pueda leer. Probá de nuevo.'));
        return;
      }
      const u = r.usage ?? {};
      // Claude Code usa además un modelo chico para tareas internas: el que tradujo es el de más salida
      const usados = Object.entries(r.modelUsage ?? {}).sort((a, b) => (b[1]?.outputTokens ?? 0) - (a[1]?.outputTokens ?? 0));
      resolve({
        json,
        modelo: usados[0]?.[0] ?? (modeloLocal || MODELO_LOCAL),
        uso: {
          entrada: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
          entradaDeCache: u.cache_read_input_tokens ?? 0,
          entradaACache: u.cache_creation_input_tokens ?? 0,
          salida: u.output_tokens ?? 0,
        },
      });
    });
    hijo.stdin.end(mensaje);
  });
}

// ------------------------------------------------------------------

/** Traduce el enunciado a JSON crudo (todavía sin pasar por el control del catálogo). */
export async function traducir({ consigna, extra = '', mensaje, esquema, modelo, modeloLocal }) {
  const motor = motorElegido();
  const r = motor === 'api' ? await porApi({ consigna, extra, mensaje, esquema, modelo }) : await porClaudeLocal({ consigna, extra, mensaje, esquema, modeloLocal });
  return { ...r, motor };
}
