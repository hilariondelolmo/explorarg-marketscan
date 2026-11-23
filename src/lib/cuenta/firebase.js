// Cuentas de explorarg.com - Firebase Authentication en el navegador.
//
// Las librerías de Firebase se cargan recién cuando alguien entra al Agente (import
// dinámico): el resto del sitio no las baja.
//
// La configuración sale de las variables VITE_FIREBASE_* (en Vercel, o en
// .env.local para probar acá contra el proyecto real). No son secretas: son los
// datos públicos del proyecto, los mismos que viajan en cualquier sitio que usa
// Firebase. La seguridad está en el servidor (server/cuentas/sesion.js).

import { EMULADOR_AUTH, PROYECTO_EMULADOR } from './config.js';

/**
 * Cómo están las cuentas en esta copia del sitio:
 *   real             hay proyecto de Firebase configurado;
 *   emulador         `vite --mode cuentas`: el emulador local, para probar;
 *   apagadas         sin configurar y en desarrollo: el Agente anda abierto, como el prototipo;
 *   sin_configurar   sin configurar y publicado: el Agente no deja consultar.
 */
export function modoCuentas() {
  if (import.meta.env.MODE === 'cuentas') return 'emulador';
  if (import.meta.env.VITE_FIREBASE_API_KEY) return 'real';
  return import.meta.env.DEV ? 'apagadas' : 'sin_configurar';
}

let cargado = null;

/** Carga Firebase una sola vez. Devuelve { auth, fb } (fb = las funciones de firebase/auth). */
export function cargarAuth() {
  if (!cargado) {
    cargado = (async () => {
      const [{ initializeApp }, fb] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
      const emulador = modoCuentas() === 'emulador';
      const app = initializeApp(
        emulador
          ? { apiKey: 'clave-de-prueba', authDomain: `${PROYECTO_EMULADOR}.firebaseapp.com`, projectId: PROYECTO_EMULADOR }
          : {
              apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
              authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
              projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
              appId: import.meta.env.VITE_FIREBASE_APP_ID,
            }
      );
      const auth = fb.getAuth(app);
      auth.languageCode = 'es'; // los mails de Firebase salen en castellano
      if (emulador) fb.connectAuthEmulator(auth, `http://${EMULADOR_AUTH}`, { disableWarnings: true });
      return { auth, fb };
    })();
    cargado.catch(() => {
      cargado = null; // si falló la descarga, el próximo intento vuelve a probar
    });
  }
  return cargado;
}
