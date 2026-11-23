// Cuentas de explorarg.com - la sesión de la persona, para las páginas del Agente.
//
//   <ProveedorDeCuenta> ... </ProveedorDeCuenta>     envuelve la sección
//   const cuenta = useCuenta();                      en cualquier página de adentro
//
// `cuenta.estado`:
//   'cargando'  todavía no se sabe si hay sesión;
//   'adentro'   hay una persona logueada (cuenta.usuario);
//   'afuera'    no hay nadie logueado.
// `cuenta.modo` es el de firebase.js (real, emulador, apagadas, sin_configurar).
// `cuenta.puedeConsultar`: si esta persona puede mandarle un pedido a la IA.
// `cuenta.esAdmin`: es quien administra el sitio (ve la pestaña Administrador).
// `cuenta.compraHabilitada`: se pueden comprar tokens (el cartel de "no alcanzan" manda a Mi panel).
// `cuenta.saldo`: los tokens que le quedan (null hasta que llega
// del servidor, o cuando esta copia no lleva cuentas). `cuenta.precioDe(herramienta)`: lo que
// cuesta consultar ahora, en tokens ({ estimado, maximo, enTanda, hasta, siguiente }), o null.
//
// Dos maneras de entrar, las dos sin contraseña: con Google, o con un enlace que
// llega al mail. La primera vez la cuenta se crea sola: registrarse e ingresar son
// el mismo paso.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cargarAuth, modoCuentas } from './firebase.js';

const CLAVE_MAIL = 'explorarg:mail-de-ingreso';
const Contexto = createContext(null);

const MENSAJES = {
  'auth/invalid-email': 'Ese mail no parece válido. Revisalo y probá de nuevo.',
  'auth/missing-email': 'Escribí tu mail.',
  'auth/invalid-action-code': 'Ese enlace ya se usó o venció. Pedí uno nuevo.',
  'auth/expired-action-code': 'Ese enlace venció. Pedí uno nuevo.',
  'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Permitila y probá de nuevo.',
  'auth/network-request-failed': 'No hay conexión. Revisala y probá de nuevo.',
  'auth/too-many-requests': 'Hubo demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.',
  'auth/quota-exceeded': 'Hoy ya no se pueden mandar más enlaces por mail. Ingresá con Google o probá mañana.',
  'auth/user-disabled': 'Esta cuenta está deshabilitada.',
  'auth/operation-not-allowed': 'Esa forma de ingresar todavía no está habilitada.',
};
// cerrar la ventana de Google no es un error: la persona se arrepintió
const SIN_MENSAJE = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);
const mensajeDe = (e) => (SIN_MENSAJE.has(e?.code) ? null : (MENSAJES[e?.code] ?? 'No se pudo completar el ingreso. Probá de nuevo.'));

const guardado = {
  leer: () => {
    try {
      return window.localStorage.getItem(CLAVE_MAIL);
    } catch {
      return null;
    }
  },
  poner: (mail) => {
    try {
      window.localStorage.setItem(CLAVE_MAIL, mail);
    } catch {
      /* sin almacenamiento (modo privado): al volver del mail se le pide de nuevo */
    }
  },
  borrar: () => {
    try {
      window.localStorage.removeItem(CLAVE_MAIL);
    } catch {
      /* nada */
    }
  },
};

// El enlace del mail sirve una sola vez. En desarrollo React monta dos veces cada
// componente: sin este candado, el segundo montaje lo intentaría de nuevo y fallaría.
const enlacesEnCurso = new Map();
function entrarConEnlace(fb, auth, mail, url) {
  if (!enlacesEnCurso.has(url)) enlacesEnCurso.set(url, fb.signInWithEmailLink(auth, mail, url));
  return enlacesEnCurso.get(url);
}

export function ProveedorDeCuenta({ children }) {
  const modo = modoCuentas();
  const conCuentas = modo === 'real' || modo === 'emulador';
  const navegar = useNavigate();
  const [estado, setEstado] = useState(conCuentas ? 'cargando' : 'afuera');
  const [usuario, setUsuario] = useState(null);
  const [error, setError] = useState(null);
  // la persona abrió el enlace del mail en otro navegador: hay que pedirle el mail de nuevo
  const [enlacePendiente, setEnlacePendiente] = useState(null);
  // la cuenta corriente: la lleva el servidor (api/cuenta.js); acá solo se muestra
  const [saldo, setSaldo] = useState(null);
  const [precios, setPrecios] = useState(null);
  const [avisoDeCuenta, setAvisoDeCuenta] = useState(null);
  // quien administra el sitio ve una pestaña más (lo decide el servidor: server/cuentas/admin.js)
  const [esAdmin, setEsAdmin] = useState(false);
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
        const url = window.location.href;
        if (fb.isSignInWithEmailLink(auth, url)) {
          const mail = guardado.leer();
          if (mail) {
            try {
              await entrarConEnlace(fb, auth, mail, url);
              guardado.borrar();
            } catch (e) {
              if (vivo) setError(mensajeDe(e));
            }
            // saca el código del enlace de la barra de direcciones
            if (vivo) navegar('/agente', { replace: true });
          } else if (vivo) {
            setEnlacePendiente(url);
          }
        }
        if (!vivo) return;
        soltar = fb.onAuthStateChanged(auth, (u) => {
          if (!vivo) return;
          setUsuario(u ? { uid: u.uid, email: u.email, nombre: u.displayName } : null);
          setEstado(u ? 'adentro' : 'afuera');
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
    // `navegar` no cambia de una pasada a la otra: el efecto corre una vez por montaje
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /** Manda el enlace al mail. La persona lo abre y vuelve a /agente ya logueada. */
  const pedirEnlace = useCallback(
    (mail) =>
      intentar(async ({ auth, fb }) => {
        await fb.sendSignInLinkToEmail(auth, mail, { url: `${window.location.origin}/agente`, handleCodeInApp: true });
        guardado.poner(mail);
      }),
    [intentar]
  );

  /** El enlace se abrió en otro navegador: se completa con el mail que la persona escribe de nuevo. */
  const completarEnlace = useCallback(
    async (mail) => {
      const ok = await intentar(({ auth, fb }) => entrarConEnlace(fb, auth, mail, enlacePendiente));
      if (ok) {
        setEnlacePendiente(null);
        navegar('/agente', { replace: true });
      } else {
        enlacesEnCurso.delete(enlacePendiente); // que pueda corregir el mail y reintentar
      }
      return ok;
    },
    [intentar, enlacePendiente, navegar]
  );

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
          setCompraHabilitada(cuerpo.compra === true);
        } else if (r.status === 401) {
          // el servidor no reconoce la sesión
          if (await esSesionActual()) await cerrarPorVencida();
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
    enlacePendiente: Boolean(enlacePendiente),
    // con las cuentas apagadas (solo en desarrollo) el prototipo anda abierto
    puedeConsultar: modo === 'apagadas' || estado === 'adentro',
    saldo,
    esAdmin,
    compraHabilitada,
    precioDe,
    avisoDeCuenta,
    anotarSaldo,
    ingresarConGoogle,
    pedirEnlace,
    completarEnlace,
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
