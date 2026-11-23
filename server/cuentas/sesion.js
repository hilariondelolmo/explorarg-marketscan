// Cuentas de explorarg.com - el candado del servidor.
//
// Las funciones que gastan (api/poligrafo.js y api/analista.js) llaman a
// exigirSesion antes de hacer nada: sin una sesión válida no consultan a la IA.
// El candado va acá y no solo en la página, porque a una página se la puede
// saltear y a esto no.
//
// La persona ingresa en el navegador con Firebase Authentication (Google o un
// enlace al mail) y cada pedido trae su credencial en la cabecera
// "Authorization: Bearer ...". Acá se comprueba que la haya firmado Google para
// el proyecto del sitio.
//
// Los cuatro estados de las cuentas (real, emulador, apagadas, sin_configurar) están
// explicados en firebase.js.

import { getAuth } from 'firebase-admin/auth';
import { app, estadoCuentas } from './firebase.js';

export { estadoCuentas };

export class ErrorDeSesion extends Error {
  constructor(estadoHttp, codigo, mensaje) {
    super(mensaje);
    this.estadoHttp = estadoHttp;
    this.codigo = codigo;
  }
}

// Para comprobar una credencial alcanza con el id del proyecto: las claves públicas
// de Google se bajan solas. No hace falta la llave del servidor.
const auth = () => getAuth(app());

/**
 * Devuelve quién hace el pedido: { uid, email, nombre }. Si no hay sesión válida,
 * tira ErrorDeSesion (401) y la función no sigue. Con las cuentas apagadas (solo
 * en local) devuelve { uid: 'local', local: true }.
 */
export async function exigirSesion(req) {
  const estado = estadoCuentas();
  if (estado === 'apagadas') return { uid: 'local', email: null, nombre: null, local: true };
  if (estado === 'sin_configurar') {
    throw new ErrorDeSesion(503, 'cuentas_sin_configurar', 'El registro de explorarg.com todavía no está habilitado.');
  }

  const cabecera = req.headers?.authorization ?? '';
  const credencial = /^Bearer\s+(\S+)$/i.exec(cabecera)?.[1];
  if (!credencial) {
    throw new ErrorDeSesion(401, 'sin_ingreso', 'Para consultar hay que ingresar a explorarg.com.');
  }

  let datos;
  try {
    datos = await auth().verifyIdToken(credencial);
  } catch {
    throw new ErrorDeSesion(401, 'sesion_vencida', 'La sesión venció. Ingresá de nuevo.');
  }
  // Con Google o con el enlace al mail, el mail llega comprobado. Si alguna vez se
  // habilita otro método, una cuenta con el mail sin comprobar no consulta.
  if (!datos.email || datos.email_verified === false) {
    throw new ErrorDeSesion(403, 'mail_sin_comprobar', 'Falta comprobar el mail de la cuenta.');
  }
  return { uid: datos.uid, email: datos.email, nombre: datos.name ?? null };
}
