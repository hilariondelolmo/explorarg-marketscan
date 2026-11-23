// Cuentas de explorarg.com - los pedidos de registro con mail y contraseña.
//
// Regla de HDO (23/11/2026): quien entra con Google, entra directo. Quien se registra con
// mail y contraseña deja un PEDIDO, y alguien de Explora lo autoriza o lo rechaza desde el
// panel de administrador. Recién al autorizar sale el mail de confirmación; la persona toca
// el enlace y entra, con sus tokens de bienvenida.
//
// Cómo queda anotada la autorización: una marca en la cuenta de Firebase de esa persona
// ("autorizada"), que viaja en su credencial. El candado (sesion.js) mira esa marca: sin
// ella, una cuenta de mail y contraseña no consulta aunque tenga el mail confirmado.
//
// El pedido se guarda con base.js: { email, fecha, estado, resuelto, por, mail }.
//   estado   pendiente | autorizada | rechazada
//   mail     qué pasó con el mail de confirmación al autorizar:
//            enviado | fallo | ya_confirmado
//
// El mail de confirmación lo manda Firebase, con su plantilla (la misma de siempre). Firebase
// solo lo manda a pedido de la persona dueña de la cuenta, así que el servidor entra un
// instante en su nombre (con una credencial que fabrica con la llave del servidor y descarta)
// y lo pide. No hace falta ningún servicio de envío de mails.

import { getAuth } from 'firebase-admin/auth';
import { ErrorDeCuenta } from './errores.js';
import { app, estadoCuentas } from './firebase.js';

const auth = () => getAuth(app());

/**
 * El pedido de registro de quien llama. Si es la primera vez, lo anota como pendiente.
 * `quien` es lo que devuelve identificar() de sesion.js. Devuelve { estado }.
 */
export async function pedirRegistro(base, quien, { ahora = new Date() } = {}) {
  // con Google no hay pedido, y quien ya trae la marca tampoco tiene nada que esperar
  if (quien.conGoogle || quien.autorizada) return { estado: 'autorizada' };
  if (!quien.email) throw new ErrorDeCuenta(400, 'sin_mail', 'La cuenta no tiene un mail.');
  let pedido = await base.pedido(quien.uid);
  if (!pedido) {
    pedido = { email: quien.email, fecha: ahora.toISOString(), estado: 'pendiente' };
    await base.guardarPedido(quien.uid, pedido);
  }
  return { estado: pedido.estado };
}

/** Todos los pedidos: primero los pendientes, y dentro de cada grupo los más nuevos arriba. */
export async function pedidosDeRegistro(base) {
  const orden = { pendiente: 0, rechazada: 1, autorizada: 2 };
  return (await base.pedidos()).sort((a, b) => (orden[a.estado] ?? 9) - (orden[b.estado] ?? 9) || (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
}

export const pedidosPendientes = async (base) => (await base.pedidos()).filter((p) => p.estado === 'pendiente').length;

/**
 * Le pide a Firebase que le mande a esa persona el mail de confirmación, con el enlace
 * que vuelve a `volverA`. Tira un error si no sale.
 */
export async function mandarMailDeConfirmacion(uid, volverA) {
  const emulador = estadoCuentas() === 'emulador';
  const raiz = emulador ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1` : 'https://identitytoolkit.googleapis.com/v1';
  // la clave pública del proyecto (la misma que usa la página; no es secreta)
  const clave = emulador ? 'clave-de-prueba' : process.env.VITE_FIREBASE_API_KEY;
  if (!clave) throw new Error('falta VITE_FIREBASE_API_KEY en el servidor');
  const pedir = async (camino, cuerpo) => {
    const r = await fetch(`${raiz}/${camino}?key=${clave}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Firebase-Locale': 'es' }, // el mail sale en castellano
      body: JSON.stringify(cuerpo),
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${camino}: ${datos?.error?.message ?? r.status}`);
    return datos;
  };
  const { idToken } = await pedir('accounts:signInWithCustomToken', { token: await auth().createCustomToken(uid), returnSecureToken: true });
  await pedir('accounts:sendOobCode', { requestType: 'VERIFY_EMAIL', idToken, continueUrl: volverA });
}

/**
 * Autoriza o rechaza un pedido. `decision`: 'autorizar' | 'rechazar'. `por`: el mail de
 * quien decide. `sitio`: la dirección del sitio, para el enlace del mail.
 * Autorizar de nuevo un pedido ya autorizado vuelve a mandar el mail (si todavía no lo confirmó).
 * Devuelve el pedido como quedó (con su `uid`).
 */
export async function resolverPedido(base, uid, decision, { por = null, sitio, ahora = new Date(), mandarMail = mandarMailDeConfirmacion } = {}) {
  if (decision !== 'autorizar' && decision !== 'rechazar') throw new ErrorDeCuenta(400, 'decision_invalida', 'No entendí qué hacer con ese pedido.');
  const pedido = await base.pedido(uid);
  if (!pedido) throw new ErrorDeCuenta(404, 'pedido_no_encontrado', 'No encontré ese pedido de registro.');
  let usuario;
  try {
    usuario = await auth().getUser(uid);
  } catch {
    throw new ErrorDeCuenta(404, 'cuenta_no_encontrada', 'Esa cuenta ya no existe.');
  }
  const autoriza = decision === 'autorizar';
  // primero la marca: si después falla algo, la persona ya quedó como se decidió
  await auth().setCustomUserClaims(uid, { ...(usuario.customClaims ?? {}), autorizada: autoriza });
  const nuevo = { ...pedido, estado: autoriza ? 'autorizada' : 'rechazada', resuelto: ahora.toISOString(), por };
  delete nuevo.mail;
  if (autoriza) {
    if (usuario.emailVerified) {
      nuevo.mail = 'ya_confirmado';
    } else {
      try {
        await mandarMail(uid, `${sitio}/agente`);
        nuevo.mail = 'enviado';
      } catch (e) {
        console.error(`[registro] se autorizó ${uid} pero el mail de confirmación no salió:`, e?.message ?? e);
        nuevo.mail = 'fallo';
      }
    }
  }
  await base.guardarPedido(uid, nuevo);
  return { uid, ...nuevo };
}
