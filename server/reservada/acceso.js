// Área reservada de explorarg.com - quién puede entrar.
//
// El área reservada (HDO, 27/11/2026) es de uso interno: para ver su contenido hay que
// estar logueado Y estar autorizado de antemano. No alcanza con tener cuenta en el sitio:
// al Agente entra cualquiera que se registre; acá, solo quien figura en la lista.
//
// La lista va en la variable CUENTAS_RESERVADA (.env.local y Vercel; nunca en el
// repositorio, que es público): mails separados por comas, y también dominios enteros
// escritos con la arroba adelante. Ejemplo de la forma, con datos de mentira:
//
//   CUENTAS_RESERVADA=persona@ejemplo.test,@empresa.test
//
// Quien administra el sitio (CUENTAS_ADMIN) entra siempre. Con la lista vacía entran
// solo los administradores.
//
// El candado está en el servidor (api/reservada.js): los datos del área no viajan con la
// página ni están en el repositorio, así que sin pasar por acá no hay nada que ver.

import { esAdmin } from '../cuentas/admin.js';

export const autorizados = () =>
  String(process.env.CUENTAS_RESERVADA ?? '')
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/**
 * Si la persona de esta sesión puede ver el área reservada. `sesion` es lo que devuelve
 * exigirSesion: { uid, email, nombre }, o { uid: 'local', local: true } en la copia local
 * sin cuentas configuradas, que anda abierta.
 */
export function puedeEntrar(sesion) {
  if (sesion?.local) return true;
  const mail = String(sesion?.email ?? '').toLowerCase();
  if (!mail) return false;
  if (esAdmin(sesion)) return true;
  return autorizados().some((regla) => (regla.startsWith('@') ? mail.endsWith(regla) : mail === regla));
}
