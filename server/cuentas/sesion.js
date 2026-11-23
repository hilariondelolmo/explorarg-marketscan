// Cuentas de explorarg.com - el candado del servidor.
//
// Las funciones que gastan (api/poligrafo.js y api/analista.js) llaman a
// exigirSesion antes de hacer nada: sin una sesión válida no consultan a la IA.
// El candado va acá y no solo en la página, porque a una página se la puede
// saltear y a esto no.
//
// La persona ingresa en el navegador con Firebase Authentication (Google, o mail y
// contraseña) y cada pedido trae su credencial en la cabecera
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
 * Quién firma el pedido, sin mirar todavía si puede consultar:
 * { uid, email, nombre, conGoogle, autorizada, mailComprobado }. Sin una credencial
 * válida tira ErrorDeSesion (401). Con las cuentas apagadas (solo en local) devuelve
 * { uid: 'local', local: true }.
 *
 * La usa sola api/registro.js, que es donde llega quien todavía no puede consultar.
 */
export async function identificar(req) {
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
  return {
    uid: datos.uid,
    email: datos.email ?? null,
    nombre: datos.name ?? null,
    // la cuenta tiene un Google asociado: Google ya comprobó que el mail es de esa persona
    conGoogle: Boolean(datos.firebase?.identities?.['google.com']?.length),
    // la marca que pone el servidor cuando alguien de Explora autoriza el registro (registro.js)
    autorizada: datos.autorizada === true,
    mailComprobado: datos.email_verified !== false,
  };
}

/**
 * Devuelve quién hace el pedido: { uid, email, nombre }. Si no puede consultar, tira
 * ErrorDeSesion y la función no sigue. Con las cuentas apagadas (solo en local)
 * devuelve { uid: 'local', local: true }.
 *
 * Quién puede consultar (HDO, 23/11/2026):
 *   - quien entra con Google, directo;
 *   - quien se registró con mail y contraseña, recién cuando alguien de Explora autorizó
 *     su pedido (ahí sale el mail de confirmación) y además confirmó el mail.
 * La autorización se mira en la marca de la credencial y no en si el mail está
 * confirmado: a Firebase se le puede pedir el mail de confirmación (o el de la
 * contraseña nueva, que también lo confirma) sin pasar por el sitio. Como la cuenta
 * corriente se abre en el primer pedido (api/cuenta.js), sin autorización tampoco hay
 * tokens de bienvenida.
 */
export async function exigirSesion(req) {
  const quien = await identificar(req);
  if (quien.local) return quien;
  if (!quien.conGoogle && !quien.autorizada) {
    throw new ErrorDeSesion(403, 'registro_pendiente', 'Tu registro todavía no fue autorizado.');
  }
  if (!quien.email || !quien.mailComprobado) {
    throw new ErrorDeSesion(403, 'mail_sin_comprobar', 'Falta comprobar el mail de la cuenta.');
  }
  return { uid: quien.uid, email: quien.email, nombre: quien.nombre };
}
