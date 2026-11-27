import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CREDITO_INICIAL, enTokens } from '../lib/cuenta/config.js';
import { useCuenta } from '../lib/cuenta/Cuenta.jsx';
import TutorialModal, { mmss } from '../components/TutorialModal.jsx';
import tutoriales from '../data/tutoriales.json';
import './Page.css';
import './Agente.css';

// La página de entrada del Agente (HDO, 22/11/2026): quien toca "Agente" sin estar
// logueado ve qué es la sección, qué gana registrándose, el lugar del video
// tutorial y la caja para ingresar.

// Al usuario se le habla en tokens, no en dólares (HDO, 22/11/2026)
const bienvenida = enTokens(CREDITO_INICIAL); // "15.000 tokens"

const BENEFICIOS = [
  {
    titulo: 'Polígrafo',
    // dictado por HDO el 22/11/2026
    texto: 'Escribís una frase sobre el mercado o sobre la ley y te dice si es verdadera, falsa, si tiene una doble vara o si no se puede determinar. Después va afirmación por afirmación, con la fuente de los datos y el análisis que lo demuestra.',
  },
  {
    titulo: 'Analista',
    texto: 'Pedís un ranking, una evolución o una comparación y te lo arma con los datos del sitio, con gráfico y con la tabla para descargar.',
  },
  {
    titulo: 'Tu panel',
    texto: 'Tus consultas quedan guardadas para volver a abrirlas, y ves cuántos tokens llevás usados y cuántos te quedan.',
  },
  {
    titulo: `${bienvenida} de bienvenida`,
    texto: 'Al registrarte recibís esos tokens para tus primeras consultas. Cada consulta descuenta los que usa, y antes de mandarla ves cuánto va a costar. Cuando se terminen vas a poder comprar más.',
  },
];

function Google() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

// La caja para ingresar (HDO, 23/11/2026): con Google, que entra directo, o con mail y contraseña.
// Quien crea su cuenta con mail y contraseña deja un pedido de registro; alguien de Explora lo
// autoriza desde el panel de administrador y recién ahí le llega el mail de confirmación. Hasta
// que lo abre no consulta ni recibe los tokens de bienvenida (el candado está en el servidor).
// Las caras de la caja: ingresar o crear la cuenta, pedido pendiente, pedido no autorizado,
// confirmar el mail, pedir una contraseña nueva y el aviso de que ese mail ya salió.
export function CajaDeIngreso() {
  const cuenta = useCuenta();
  const [modo, setModo] = useState('ingresar'); // ingresar | crear | recuperar
  const [mail, setMail] = useState('');
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [recuperoA, setRecuperoA] = useState(null); // a qué mail se mandó el de la contraseña nueva
  const [reenviado, setReenviado] = useState(false);

  const conEspera = async (paso) => {
    setOcupado(true);
    try {
      return await paso();
    } finally {
      setOcupado(false);
    }
  };
  const pasarA = (otro) => {
    setModo(otro);
    setRecuperoA(null);
    cuenta.limpiarError();
  };
  const enviar = (e) => {
    e.preventDefault();
    const m = mail.trim();
    if (!m || !clave || ocupado) return;
    conEspera(() => (modo === 'crear' ? cuenta.crearCuenta(m, clave) : cuenta.ingresarConClave(m, clave)));
  };
  const recuperar = async (e) => {
    e.preventDefault();
    const m = mail.trim();
    if (!m || ocupado) return;
    if (await conEspera(() => cuenta.recuperarClave(m))) setRecuperoA(m);
  };
  const error = cuenta.error && (
    <p className="ag-error" role="alert">
      {cuenta.error}
    </p>
  );

  if (cuenta.modo === 'sin_configurar') {
    return (
      <aside className="ag-ingreso">
        <h3>Ingresar o registrarte</h3>
        <p className="ag-aviso">El registro todavía no está habilitado. Mientras tanto podés mirar los ejemplos ya analizados.</p>
      </aside>
    );
  }

  const otraCuenta = (
    <button
      type="button"
      className="ag-enlace"
      disabled={ocupado}
      onClick={() => {
        setReenviado(false);
        setClave('');
        conEspera(cuenta.salir);
      }}
    >
      Usar otra cuenta
    </button>
  );

  // creó la cuenta con mail y contraseña y el pedido espera que alguien de Explora lo autorice
  if (cuenta.estado === 'pendiente') {
    return (
      <aside className="ag-ingreso">
        <h3>Tu registro está pendiente</h3>
        <p>
          Recibimos tu pedido de registro con <strong>{cuenta.usuario?.email}</strong>. Cuando lo autoricemos te va a llegar un mail para
          confirmar tu dirección: con eso entrás y recibís tus {bienvenida} de bienvenida.
        </p>
        {error}
        <p className="ag-chico">No hace falta que te quedes en esta página.</p>
        {otraCuenta}
      </aside>
    );
  }

  if (cuenta.estado === 'rechazada') {
    return (
      <aside className="ag-ingreso">
        <h3>Tu registro no fue autorizado</h3>
        <p>
          El pedido de registro con <strong>{cuenta.usuario?.email}</strong> no fue autorizado.
        </p>
        {error}
        {otraCuenta}
      </aside>
    );
  }

  // el pedido ya fue autorizado y todavía no abrió el mail de confirmación
  if (cuenta.estado === 'sin_confirmar') {
    return (
      <aside className="ag-ingreso">
        <h3>Confirmá tu mail</h3>
        <p>
          Tu registro ya fue autorizado. Te mandamos un mail a <strong>{cuenta.usuario?.email}</strong>: abrilo y tocá el enlace. Así
          confirmás que la dirección es tuya y recibís tus {bienvenida} de bienvenida.
        </p>
        <button type="button" className="pg-boton" onClick={() => conEspera(cuenta.revisarConfirmacion)} disabled={ocupado}>
          {ocupado ? 'Revisando…' : 'Ya lo confirmé'}
        </button>
        {error}
        {reenviado && !cuenta.error && <p className="ag-chico">Te lo mandamos de nuevo.</p>}
        <p className="ag-chico">Si no lo ves, fijate en el correo no deseado.</p>
        <div className="ag-enlaces">
          <button
            type="button"
            className="ag-enlace"
            disabled={ocupado}
            onClick={async () => {
              setReenviado(false);
              if (await conEspera(cuenta.reenviarConfirmacion)) setReenviado(true);
            }}
          >
            Mandármelo de nuevo
          </button>
          {otraCuenta}
        </div>
      </aside>
    );
  }

  if (modo === 'recuperar') {
    if (recuperoA) {
      return (
        <aside className="ag-ingreso">
          <h3>Revisá tu mail</h3>
          <p>
            Si hay una cuenta con <strong>{recuperoA}</strong>, te mandamos un enlace para elegir una contraseña nueva. Después volvé acá e
            ingresá con ella.
          </p>
          <p className="ag-chico">Si no lo ves, fijate en el correo no deseado.</p>
          <button type="button" className="ag-enlace" onClick={() => pasarA('ingresar')}>
            Volver a ingresar
          </button>
        </aside>
      );
    }
    return (
      <aside className="ag-ingreso">
        <h3>Elegir una contraseña nueva</h3>
        <p>Escribí el mail de tu cuenta y te mandamos un enlace para elegir una contraseña nueva.</p>
        <form onSubmit={recuperar}>
          <label htmlFor="ag-mail">Tu mail</label>
          <input id="ag-mail" type="email" autoComplete="email" value={mail} onChange={(e) => setMail(e.target.value)} placeholder="nombre@ejemplo.com" required />
          <button type="submit" className="pg-boton" disabled={ocupado || !mail.trim()}>
            {ocupado ? 'Enviando…' : 'Mandame el mail'}
          </button>
        </form>
        {error}
        <button type="button" className="ag-enlace" onClick={() => pasarA('ingresar')}>
          Volver
        </button>
      </aside>
    );
  }

  const creando = modo === 'crear';
  return (
    <aside className="ag-ingreso">
      <h3>Ingresar o registrarte</h3>
      <p>Con tu cuenta de Google, o con tu mail y una contraseña.</p>

      <button type="button" className="ag-google" onClick={() => conEspera(cuenta.ingresarConGoogle)} disabled={ocupado}>
        <Google /> Continuar con Google
      </button>

      <p className="ag-separador">
        <span>o con tu mail</span>
      </p>

      <div className="ag-modos" role="group" aria-label="¿Ya tenés cuenta?">
        <button type="button" aria-pressed={!creando} onClick={() => pasarA('ingresar')}>
          Ya tengo cuenta
        </button>
        <button type="button" aria-pressed={creando} onClick={() => pasarA('crear')}>
          Crear cuenta
        </button>
      </div>

      <form onSubmit={enviar}>
        <label htmlFor="ag-mail">Tu mail</label>
        <input id="ag-mail" type="email" autoComplete="email" value={mail} onChange={(e) => setMail(e.target.value)} placeholder="nombre@ejemplo.com" required />
        <label htmlFor="ag-clave">{creando ? 'Elegí una contraseña' : 'Tu contraseña'}</label>
        <div className="ag-clave">
          <input
            id="ag-clave"
            type={verClave ? 'text' : 'password'}
            autoComplete={creando ? 'new-password' : 'current-password'}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            minLength={creando ? 6 : undefined}
            required
          />
          <button type="button" onClick={() => setVerClave((v) => !v)} aria-pressed={verClave}>
            {verClave ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
        {creando && (
          <p className="ag-ayuda">
            Al menos 6 caracteres. El registro con mail se autoriza: cuando esté autorizado te llega un mail para confirmar tu dirección.
          </p>
        )}
        <button type="submit" className="pg-boton" disabled={ocupado || !mail.trim() || !clave}>
          {ocupado ? (creando ? 'Enviando…' : 'Entrando…') : creando ? 'Pedir mi registro' : 'Ingresar'}
        </button>
      </form>

      {error}
      {!creando && (
        <button type="button" className="ag-enlace" onClick={() => pasarA('recuperar')}>
          Olvidé mi contraseña
        </button>
      )}
      <p className="ag-chico">Guardamos tu mail y tus consultas para mostrarte tu historial y tu consumo.</p>
    </aside>
  );
}

// Los tutoriales en video del Agente, uno por herramienta (src/data/tutoriales.json, que escribe
// scripts/tutorial/armar.py). Cada uno es la portada de YouTube con su botón: el reproductor recién
// se carga al abrirlo. Mientras una herramienta no tenga el suyo, no aparece; si no hay ninguno,
// queda el lugar con "En preparación".
const HERRAMIENTAS_CON_VIDEO = [
  { id: 'poligrafo', nombre: 'el Polígrafo' },
  { id: 'analista', nombre: 'el Analista' },
];

function VideosDelAgente() {
  const [abierto, setAbierto] = useState(null);
  const videos = HERRAMIENTAS_CON_VIDEO.map((h) => ({ ...h, tutorial: tutoriales.find((t) => t.id === h.id) })).filter((h) => h.tutorial);
  if (!videos.length) {
    return (
      <div className="ag-video" role="img" aria-label="Lugar del video tutorial">
        <span className="ag-video-icono" aria-hidden="true">
          ▶
        </span>
        <span>Video: cómo se usa el Agente</span>
        <span className="ag-chico">En preparación</span>
      </div>
    );
  }
  return (
    <>
      <div className={`ag-videos ${videos.length > 1 ? 'ag-videos-varios' : ''}`}>
        {videos.map(({ id, nombre, tutorial }) => (
          <button type="button" className="ag-video ag-video-listo" key={id} onClick={() => setAbierto(tutorial)} aria-label={`Ver el video: cómo se usa ${nombre}`}>
            <img
              src={`https://i.ytimg.com/vi/${tutorial.youtube}/maxresdefault.jpg`}
              alt=""
              loading="lazy"
              onError={(e) => {
                if (!e.currentTarget.dataset.alt) {
                  e.currentTarget.dataset.alt = '1';
                  e.currentTarget.src = `https://i.ytimg.com/vi/${tutorial.youtube}/hqdefault.jpg`;
                }
              }}
            />
            <span className="ag-video-icono" aria-hidden="true">
              ▶
            </span>
            <span className="ag-video-pie">
              <span>Video: cómo se usa {nombre}</span>
              <span className="ag-video-duracion">{mmss(tutorial.duracion)}</span>
            </span>
          </button>
        ))}
      </div>
      <TutorialModal tutorial={abierto} open={!!abierto} onClose={() => setAbierto(null)} />
    </>
  );
}

export default function AgenteEntrada() {
  return (
    <section className="page-section pg ag" id="agente">
      <div className="container">
        {/* Título y texto de entrada: de HDO (22 y 23/11/2026). No reescribir.
            El nombre se escribe "Explorarg", sin RG en mayúscula.
            El título va con el tamaño y las distancias del título de Reforma Ley 27.640
            ("Biodiésel en la Argentina: qué se discute...", pedido de HDO del 23/11/2026).
            En escritorio este bloque queda fijo debajo de la barra al hacer scroll; en el celular
            se mueve con el resto (patrón de bloque fijo del sitio; ver Agente.css). */}
        <div className="ag-fijo">
        <h2 className="ag-titulo">Agente Explorarg</h2>
        {/* Debajo del título no hay bajada en otro tamaño: lo único con tamaño de título es "Agente Explorarg".
            El primer párrafo une la frase que dictó HDO el 23/11/2026 con su párrafo anterior ("integra dos
            herramientas..."); el texto unido lo aprobó él ese día. Va en letra común y sin negrita. */}
        <div className="ag-caput">
          <p>
            El Agente Explorarg integra dos herramientas que te permiten hacer consultas sobre el mercado del biodiésel, el gas oil y los
            precios, y chequear afirmaciones vertidas por terceros, todo con tu lenguaje natural, con la información publicada por la
            Secretaría de Energía y procesada por <strong>explorarg.com</strong>.
          </p>
          <p>
            Para acceder a estas herramientas, solo necesitás registrarte en <strong>explorarg.com</strong> e iniciar sesión con tu cuenta.
          </p>
          <p>
            <strong>El registro es gratuito e incluye {bienvenida} de bienvenida</strong> para realizar tus primeras consultas.
          </p>
        </div>
        </div>

        <div className="ag-dos">
          <div>
            <ul className="ag-beneficios">
              {BENEFICIOS.map((b) => (
                <li key={b.titulo}>
                  <strong>{b.titulo}</strong>
                  <span>{b.texto}</span>
                </li>
              ))}
            </ul>

            <VideosDelAgente />
          </div>

          <CajaDeIngreso />
        </div>

        <p className="ag-muestra">
          ¿Querés ver cómo funciona antes de registrarte? <Link to="/agente?muestra=1">Mirá los ejemplos ya analizados</Link>: no
          hace falta ingresar.
        </p>
      </div>
    </section>
  );
}
