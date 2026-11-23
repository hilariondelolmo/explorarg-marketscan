// Cuentas de explorarg.com (Agente Explorarg) - lo que comparten el navegador y el servidor.
//
// Para entrar al Agente hay que estar registrado y logueado (HDO, 22/11/2026). Las
// cuentas viven en Firebase Authentication, en un proyecto propio del sitio.

// LOS TOKENS (decisión de HDO, 22/11/2026). Al usuario no se le habla de dólares: su saldo,
// lo que cuesta cada consulta y el regalo de bienvenida se muestran en tokens de explorarg.
// Un token vale un diezmilésimo de dólar (10.000 tokens = US$ 1). No es el token del
// modelo de IA, que tiene varios precios según sea de entrada, de salida o de caché: es la
// moneda del sitio, y lo que consume una consulta se convierte a esta moneda.
// Todo se guarda en tokens enteros: así las sumas y las restas dan exacto.
export const POR_DOLAR = 10000; // tokens por dólar

/** Tokens de bienvenida al registrarse: 15.000, que equivalen a US$ 1,50. */
export const CREDITO_INICIAL = 15000;

/**
 * Las consultas que una persona hace con la misma herramienta dentro de estos minutos
 * desde la primera cuestan menos (la regla completa y los márgenes, que no viajan al
 * navegador, están en server/cuentas/precios.js).
 */
export const MINUTOS_DE_TANDA = 5;

export const HERRAMIENTAS = { poligrafo: 'Polígrafo', analista: 'Analista' };

/**
 * Una consulta que falla o que no se puede responder no se cobra, pero a Explora
 * le cuesta igual. Este es el tope de consultas sin cargo por persona y por día:
 * pasado ese número, hasta el día siguiente no puede consultar.
 */
export const TOPE_SIN_CARGO_POR_DIA = 10;

/**
 * LA VENTA DE TOKENS (decisiones de HDO, 23/11/2026). Tres paquetes; el precio en pesos
 * sale del dólar oficial del día, sin recargo (lo calcula el servidor: server/pagos/);
 * los tokens no vencen. En la Argentina se paga con Mercado Pago.
 */
export const PAQUETES = [
  { id: 't50', tokens: 50000 },
  { id: 't100', tokens: 100000 },
  { id: 't250', tokens: 250000 },
];

const miles = (n) => n.toLocaleString('es-AR', { maximumFractionDigits: 0 });

/** 8007 -> "$ 8.007": un precio en pesos, sin centavos. */
export const enPesos = (pesos) => `$ ${miles(pesos)}`;

/** 14412 -> "14.412 tokens": un monto exacto (el saldo, lo que costó una consulta). */
export const enTokens = (tokens) => `${miles(tokens)} ${tokens === 1 ? 'token' : 'tokens'}`;

/**
 * 5176 -> "5.200 tokens": un monto estimado, redondeado a dos cifras para que se lea
 * fácil (7764 -> 7.800; 1046 -> 1.000; 540 -> 540; 101 -> 100).
 */
export function aproxTokens(tokens) {
  if (tokens < 100) return enTokens(tokens);
  const paso = 10 ** (Math.floor(Math.log10(tokens)) - 1);
  return enTokens(Math.round(tokens / paso) * paso);
}

/** 15000 -> "US$ 1,50": la equivalencia en dólares, para el panel de HDO y los controles. */
export const enDolares = (tokens) =>
  `US$ ${(tokens / POR_DOLAR).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: tokens !== 0 && Math.abs(tokens) < POR_DOLAR / 10 ? 3 : 2 })}`;

/** "21:43": la hora, para decir hasta cuándo dura el precio reducido. */
export const horaDe = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

// Para probar acá sin tocar el proyecto real: el emulador de Firebase, con un
// proyecto de mentira (los que empiezan con "demo-" no salen a internet).
// Se levanta con las configuraciones "cuentas-emulador" y "marketscan-con-cuentas"
// de .claude/launch.json (vite --mode cuentas).
export const PROYECTO_EMULADOR = 'demo-explorarg';
export const EMULADOR_AUTH = '127.0.0.1:9099';
