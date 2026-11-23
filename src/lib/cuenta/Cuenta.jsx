// Cuentas de explorarg.com - la sesión de la persona, para las páginas del Agente.
//
//   <ProveedorDeCuenta> ... </ProveedorDeCuenta>     envuelve la sección
//   const cuenta = useCuenta();                      en cualquier página de adentro
//
// `cuenta.estado`:
//   'cargando'       todavía no se sabe si hay sesión;
//   'adentro'        hay una persona logueada (cuenta.usuario);
//   'pendiente'      creó su cuenta con mail y contraseña y su pedido de registro espera
//                    que alguien de Explora lo autorice;
//   'rechazada'      el pedido no fue autorizado;
//   'sin_confirmar'  el pedido ya fue autorizado y le llegó el mail de confirmación,
//                    pero todavía no lo abrió;
//                    (en los tres, no consulta ni recibe los tokens de bienvenida)
//   'afuera'         no hay nadie logueado.
// `cuenta.modo` es el de firebase.js (real, emulador, apagadas, sin_configurar).
// `cuenta.puedeConsultar`: si esta persona puede mandarle un pedido a la IA.
// `cuenta.esAdmin`: es quien administra el sitio (ve la pestaña Administrador).
// `cuenta.pedidosPendientes`: solo para quien administra, los pedidos de registro que esperan.
// `cuenta.compraHabilitada`: se pueden comprar tokens (el cartel de "no alcanzan" manda a Mi panel).
// `cuenta.saldo`: los tokens que le quedan (null hasta que llega
// del servidor, o cuando esta copia no lleva cuentas). `cuenta.precioDe(herramienta)`: lo que
// cuesta consultar ahora, en tokens ({ estimado, maximo, enTanda, hasta, siguiente }), o null.
//
// Dos maneras de entrar (HDO, 23/11/2026): con Google, o con mail y contraseña.
//   - Con Google se entra directo, y la cuenta se crea sola la primera vez.
//   - Con mail y contraseña la persona crea la cuenta y deja un pedido de registro.
//     Alguien de Explora lo autoriza desde el panel de administrador; recién ahí sale
//     el mail de confirmación, y con el enlace de ese mail la persona entra.
// Quién puede consultar lo decide el servidor (server/cuentas/sesion.js); acá solo
// se le muestra a cada uno en qué está.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { cargarAuth, modoCuentas } from './firebase.js';

const Contexto = createContext(null);

// Firebase no dice cuál de los dos está mal, ni si el mail tiene cuenta: así no se puede averiguar quién está registrado
const NO_COINCIDEN = 'El mail o la contraseña no coinciden. Si todavía no tenés cuenta, elegí "Crear cuenta".';
const MENSAJES = {
  'auth/invalid-email': 'Ese mail no parece válido. Revisalo y probá de nuevo.',
  'auth/missing-email': 'Escribí tu mail.',
  'auth/missing-password': 'Escribí tu contraseña.',
  'auth/weak-password': 'La contraseña tiene que tener al menos 6 caracteres.',
  'auth/invalid-credential': NO_COINCIDEN,
  'auth/wrong-password': NO_COINCIDEN,
  'auth/user-not-found': NO_COINCIDEN,
  'auth/email-already-in-use': 'Ya hay una cuenta con ese mail. Ingresá con tu contraseña o con Google; si no te la acordás, usá "Olvidé mi contraseña".',
  'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Permitila y probá de nuevo.',
  'auth/network-request-failed': 'No hay conexión. Revisala y probá de nuevo.',
  'auth/too-many-requests': 'Hubo demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.',
  'auth/quota-exceeded': 'Hoy ya no se pueden mandar más mails. Probá mañana, o ingresá con Google.',
  'auth/user-disabled': 'Esta cuenta está deshabilitada.',
  'auth/operation-not-allowed': 'Esa forma de ingresar todavía no está habilitada.',
};
// cerrar la ventana de Google no es un error: la persona se arrepintió
const SIN_MENSAJE = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);
const mensajeDe = (e) => (SIN_MENSAJE.has(e?.code) ? null : (MENSAJES[e?.code] ?? 'No se pudo completar el ingreso. Probá de nuevo.'));

// A dónde vuelve la persona desde el mail de confirmación o desde el de la contraseña nueva
const volverA = () => ({ url: `${window.location.origin}/agente` });

const datosDe = (u) => ({ uid: u.uid, email: u.email, nombre: u.displayName });

const AVISO_SIN_REGISTRO = 'No pudimos comprobar tu pedido de registro. Revisá la conexión; la página lo vuelve a intentar sola.';

/**
 * En qué está la persona logueada: 'adentro', 'pendiente', 'rechazada' o 'sin_confirmar'.
 * Deja la credencial al día: la guardada en el navegador dura una hora y puede ser anterior
 * a la autorización o a la confirmación del mail.
 */
async function ubicar(u) {
  const alDia = async () => {
    const { claims } = await u.getIdTokenResult();
    if (claims.email_verified !== true) await u.getIdToken(true);
  };
  // con Google se entra directo (y Google ya comprobó el mail)
  if (u.providerData.some((p) => p.providerId === 'google.com')) {
    await alDia();
    return 'adentro';
  }
  // con mail y contraseña: ¿ya lo autorizaron? Lo dice la marca de la credencial
  const { claims } = await u.getIdTokenResult();
  if (claims.autorizada !== true) {
    // se le pregunta al servidor, que la primera vez deja anotado el pedido
    const r = await fetch('/api/registro', { method: 'POST', headers: { Authorization: `Bearer ${await u.getIdToken()}` } });
    const cuerpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(cuerpo.error ?? 'registro');
    if (cuerpo.estado !== 'autorizada') return cuerpo.estado === 'rechazada' ? 'rechazada' : 'pendiente';
    await u.getIdToken(true); // la credencial nueva ya trae la marca
  }
  await u.reload();
  if (!u.emailVerified) return 'sin_confirmar';
  await alDia();
  return 'adentro';
}

export function ProveedorDeCuenta({ children }) {
  const modo = modoCuentas();
  const conCuentas = modo === 'real' || modo === 'emulador';
  const [estado, setEstado] = useState(conCuentas ? 'cargando' : 'afuera');
  const [usuario, setUsuario] = useState(null);
  const [error, setError] = useState(null);
  // la cuenta corriente: la lleva el servidor (api/cuenta.js); acá solo se muestra
  const [saldo, setSaldo] = useState(null);
  const [precios, setPrecios] = useState(null);
  const [avisoDeCuenta, setAvisoDeCuenta] = useState(null);
  // quien administra el sitio ve una pestaña más (lo decide el servidor: server/cuentas/admin.js)
  const [esAdmin, setEsAdmin] = useState(false);
  const [pedidosPendientes, setPedidosPendientes] = useState(0);
  // si se pueden comprar tokens (hay un medio de pago configurado en el servidor)
  const [compraHabilitada, setCompraHabilitada] = useState(false);

  useEffect(() => {
    if (!conCuentas) return undefined;
    let vivo = true;
    let soltar = () => {};
    (async () => {
      try {
        const { auth, fb } = await cargarAuth();
        if (!vivo) return;
        soltar = fb.onAuthStateChanged(auth, async (u) => {
          if (!vivo) return;
          if (!u) {
            setUsuario(null);
            setEstado('afuera');
            return;
          }
          setUsuario(datosDe(u));
          setEstado('cargando'); // mientras se averigua en qué está
          let donde;
          try {
            donde = await ubicar(u);
          } catch {
            // sin conexión, o el servidor no contestó: quien entró con Google sigue; el resto espera
            const conGoogle = u.providerData.some((p) => p.providerId === 'google.com');
            donde = conGoogle ? 'adentro' : 'pendiente';
            if (!conGoogle && vivo) setError(AVISO_SIN_REGISTRO);
          }
          if (vivo && auth.currentUser?.uid === u.uid) setEstado(donde);
        });
      } catch {
        if (!vivo) return;
        setEstado('afuera');
        setError('No se pudo cargar el ingreso. Revisá la conexión y recargá la página.');
      }
    })();
    return () => {
      vivo = false;
      soltar();
    };
  }, [conCuentas]);

  /** Corre un paso del ingreso y deja el error, si lo hubo, en palabras. Devuelve si salió bien. */
  const intentar = useCallback(async (paso) => {
    setError(null);
    try {
      await paso(await cargarAuth());
      return true;
    } catch (e) {
      setError(mensajeDe(e));
      return false;
    }
  }, []);

  const ingresarConGoogle = useCallback(
    () =>
      intentar(({ auth, fb }) => {
        const google = new fb.GoogleAuthProvider();
        google.setCustomParameters({ prompt: 'select_account' });
        return fb.signInWithPopup(auth, google);
      }),
    [intentar]
  );

  const ingresarConClave = useCallback((mail, clave) => intentar(({ auth, fb }) => fb.signInWithEmailAndPassword(auth, mail, clave)), [intentar]);

  /**
   * Crea la cuenta. Con eso la persona queda logueada y su pedido de registro, anotado
   * (lo hace `ubicar` cuando Firebase avisa que entró): estado 'pendiente'. El mail de
   * confirmación no sale acá: lo manda el servidor cuando alguien autoriza el pedido.
   */
  const crearCuenta = useCallback((mail, clave) => intentar(({ auth, fb }) => fb.createUserWithEmailAndPassword(auth, mail, clave)), [intentar]);

  /** Manda otra vez el mail de confirmación a quien ya tiene el pedido autorizado. */
  const reenviarConfirmacion = useCallback(
    () =>
      intentar(async ({ auth, fb }) => {
        if (auth.currentUser) await fb.sendEmailVerification(auth.currentUser, volverA());
      }),
    [intentar]
  );

  /**
   * Vuelve a mirar en qué está la persona (¿ya la autorizaron?, ¿ya confirmó el mail?) y
   * la deja donde corresponde. Devuelve si quedó adentro. Con `avisar`, si sigue sin
   * confirmar el mail se lo dice (es el botón "Ya lo confirmé").
   */
  const revisarConfirmacion = useCallback(async ({ avisar = true } = {}) => {
    try {
      const { auth } = await cargarAuth();
      const u = auth.currentUser;
      if (!u) return false;
      const donde = await ubicar(u);
      if (auth.currentUser?.uid !== u.uid) return false;
      setError(donde === 'sin_confirmar' && avisar ? 'Todavía no figura confirmado. Abrí el mail que te mandamos y tocá el enlace.' : null);
      setEstado(donde);
      return donde === 'adentro';
    } catch (e) {
      if (avisar) setError(e?.code ? mensajeDe(e) : AVISO_SIN_REGISTRO);
      return false;
    }
  }, []);

  // Mientras falta algo, la página mira sola: seguido cuando solo falta que la persona abra
  // el mail (vuelve del correo y entra sin tocar nada), y cada tanto cuando el pedido espera
  // que alguien de Explora lo autorice, que puede tardar.
  useEffect(() => {
    if (estado !== 'sin_confirmar' && estado !== 'pendiente') return undefined;
    const mirar = () => {
      if (document.visibilityState === 'visible') revisarConfirmacion({ avisar: false });
    };
    const reloj = setInterval(mirar, estado === 'sin_confirmar' ? 5000 : 60000);
    window.addEventListener('focus', mirar);
    document.addEventListener('visibilitychange', mirar);
    return () => {
      clearInterval(reloj);
      window.removeEventListener('focus', mirar);
      document.removeEventListener('visibilitychange', mirar);
    };
  }, [estado, revisarConfirmacion]);

  /**
   * Manda el mail para elegir una contraseña nueva. Firebase no dice si ese mail tiene
   * cuenta (así no se puede averiguar quién está registrado): el aviso es el mismo siempre.
   */
  const recuperarClave = useCallback((mail) => intentar(({ auth, fb }) => fb.sendPasswordResetEmail(auth, mail, volverA())), [intentar]);

  const salir = useCallback(() => intentar(({ auth, fb }) => fb.signOut(auth)), [intentar]);

  /**
   * La sesión dejó de valer (la cuenta se borró o se deshabilitó, o la credencial no se
   * pudo renovar): se cierra acá también, y la persona vuelve a la página de entrada.
   */
  const cerrarPorVencida = useCallback(async () => {
    try {
      const { auth, fb } = await cargarAuth();
      await fb.signOut(auth);
    } catch {
      /* si ni siquiera se puede cerrar, queda el aviso */
    }
    setError('Tu sesión venció. Ingresá de nuevo.');
  }, []);

  /** La cabecera que el servidor exige para consultar. Vacía si no hay sesión. */
  const cabeceras = useCallback(async () => {
    if (!conCuentas) return {};
    const { auth } = await cargarAuth();
    let credencial;
    try {
      credencial = await auth.currentUser?.getIdToken();
    } catch (e) {
      if (e?.code === 'auth/network-request-failed') throw e; // sin conexión: no es que la sesión venció
      await cerrarPorVencida();
      return {};
    }
    return credencial ? { Authorization: `Bearer ${credencial}` } : {};
  }, [conCuentas, cerrarPorVencida]);

  // Al entrar se pide la cuenta: el saldo y los precios. La primera vez, el servidor
  // la crea con los tokens de bienvenida.
  useEffect(() => {
    if (!conCuentas || estado !== 'adentro') {
      setSaldo(null);
      setAvisoDeCuenta(null);
      setEsAdmin(false);
      setPedidosPendientes(0);
      setCompraHabilitada(false);
      return undefined;
    }
    let vivo = true;
    // que siga habiendo alguien logueado (si `cabeceras` ya cerró la sesión, no hay nada más que hacer)
    const esSesionActual = async () => Boolean((await cargarAuth()).auth.currentUser);
    (async () => {
      try {
        const r = await fetch('/api/cuenta', { headers: await cabeceras() });
        const cuerpo = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (r.ok && Number.isInteger(cuerpo.saldo)) {
          setSaldo(cuerpo.saldo);
          setPrecios(cuerpo.precios ?? null);
          setAvisoDeCuenta(null);
          setEsAdmin(cuerpo.admin === true);
          setPedidosPendientes(Number.isInteger(cuerpo.pedidos) ? cuerpo.pedidos : 0);
          setCompraHabilitada(cuerpo.compra === true);
        } else if (r.status === 401) {
          // el servidor no reconoce la sesión
          if (await esSesionActual()) await cerrarPorVencida();
        } else if (cuerpo.codigo === 'mail_sin_comprobar' || cuerpo.codigo === 'registro_pendiente') {
          // para el servidor todavía falta algo: se vuelve a la caja que lo dice
          setEstado(cuerpo.codigo === 'mail_sin_comprobar' ? 'sin_confirmar' : 'pendiente');
        } else {
          setAvisoDeCuenta(cuerpo.error ?? 'No se pudo leer tu saldo de tokens.');
        }
      } catch {
        if (vivo) setAvisoDeCuenta('No se pudo leer tu saldo de tokens. Revisá la conexión.');
      }
    })();
    return () => {
      vivo = false;
    };
  }, [conCuentas, estado, usuario?.uid, cabeceras, cerrarPorVencida]);

  /** El servidor informa el saldo y los precios en cada respuesta ({ cuenta: { saldo, precios } } o { saldo } en un rechazo). */
  const anotarSaldo = useCallback(
    (cuerpo) => {
      const nuevo = cuerpo?.cuenta?.saldo ?? cuerpo?.saldo;
      if (Number.isInteger(nuevo)) setSaldo(nuevo);
      if (cuerpo?.cuenta?.precios) setPrecios(cuerpo.cuenta.precios);
      // el servidor rechazó el pedido porque no reconoce la sesión
      if (cuerpo?.codigo === 'sin_ingreso' || cuerpo?.codigo === 'sesion_vencida') cerrarPorVencida();
    },
    [cerrarPorVencida]
  );

  // Las consultas siguientes a la primera cuestan menos durante unos minutos. Cuando ese
  // plazo se cumple hay que volver a dibujar, para que el botón muestre el precio de primera.
  const [, setReloj] = useState(0);
  useEffect(() => {
    const plazos = Object.values(precios ?? {})
      .map((x) => (x.tandaHasta ? Date.parse(x.tandaHasta) - Date.now() : null))
      .filter((ms) => ms !== null && ms > 0);
    if (!plazos.length) return undefined;
    const aviso = setTimeout(() => setReloj((n) => n + 1), Math.min(...plazos) + 500);
    return () => clearTimeout(aviso);
  }, [precios]);

  /**
   * Lo que cuesta consultar ahora con una herramienta: { estimado, maximo, enTanda,
   * hasta, siguiente } en tokens, o null si esta copia no lleva cuentas.
   * `enTanda`: la persona ya hizo su primera consulta hace menos de cinco minutos.
   */
  const precioDe = (herramienta) => {
    const x = precios?.[herramienta];
    if (saldo === null || !x) return null;
    const enTanda = Boolean(x.tandaHasta) && Date.now() < Date.parse(x.tandaHasta);
    return { ...(enTanda ? x.siguiente : x.primera), enTanda, hasta: enTanda ? x.tandaHasta : null, siguiente: x.siguiente.estimado };
  };

  const valor = {
    modo,
    estado,
    usuario,
    error,
    // con las cuentas apagadas (solo en desarrollo) el prototipo anda abierto
    puedeConsultar: modo === 'apagadas' || estado === 'adentro',
    saldo,
    esAdmin,
    pedidosPendientes,
    setPedidosPendientes,
    compraHabilitada,
    precioDe,
    avisoDeCuenta,
    anotarSaldo,
    ingresarConGoogle,
    ingresarConClave,
    crearCuenta,
    reenviarConfirmacion,
    revisarConfirmacion,
    recuperarClave,
    salir,
    cabeceras,
    limpiarError: () => setError(null),
  };

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useCuenta() {
  const cuenta = useContext(Contexto);
  if (!cuenta) throw new Error('useCuenta se usa dentro de <ProveedorDeCuenta>');
  return cuenta;
}
