// Cuentas de explorarg.com - los tokens de bienvenida.
//
// Todos reciben los tokens de bienvenida de siempre (CREDITO_INICIAL, en
// src/lib/cuenta/config.js), que es lo que la página anuncia. Puede haber una
// bienvenida distinta según el dominio del mail con que la persona se registra
// (regla de HDO, 24/11/2026): se da una sola vez, al abrir la cuenta, y no se anuncia
// en ningún lado.
//
// Qué dominios y cuántos tokens: en la variable CUENTAS_BIENVENIDA, un JSON en un solo
// renglón con la forma {"dominio": tokens}. Va en .env.local y en Vercel, y no se
// escribe en el repositorio, que es público: ni acá, ni en los comentarios, ni en los
// controles, que usan un dominio de ejemplo. Sin la variable, o si está mal escrita,
// todos reciben la bienvenida de siempre.
//
// El mail llega comprobado (sesion.js): nadie se puede inventar un dominio. Cuenta el
// dominio entero, lo que va después de la arroba: uno parecido no vale.

import { CREDITO_INICIAL } from '../../src/lib/cuenta/config.js';

let avisado = null;

/** Los dominios con bienvenida propia: { dominio: tokens }. Vacío si no hay variable o no se puede leer. */
function especiales() {
  const crudo = process.env.CUENTAS_BIENVENIDA;
  if (!crudo) return {};
  try {
    const lista = JSON.parse(crudo);
    if (!lista || typeof lista !== 'object' || Array.isArray(lista)) throw new Error('no es una lista de dominios');
    return Object.fromEntries(
      Object.entries(lista)
        .filter(([, tokens]) => Number.isInteger(tokens) && tokens >= 0)
        .map(([dominio, tokens]) => [String(dominio).trim().toLowerCase().replace(/^@/, ''), tokens])
    );
  } catch {
    if (avisado !== crudo) {
      avisado = crudo;
      console.error('[cuentas] CUENTAS_BIENVENIDA no se puede leer: todos reciben la bienvenida de siempre.');
    }
    return {};
  }
}

/** Los tokens de bienvenida que le tocan a quien se registra con ese mail. */
export function bienvenidaPara(email) {
  const mail = String(email ?? '').trim().toLowerCase();
  const arroba = mail.lastIndexOf('@');
  if (arroba <= 0) return CREDITO_INICIAL; // sin arroba, o sin nada antes: no es un mail
  const dominio = mail.slice(arroba + 1);
  const lista = especiales();
  return dominio && Object.hasOwn(lista, dominio) ? lista[dominio] : CREDITO_INICIAL;
}
