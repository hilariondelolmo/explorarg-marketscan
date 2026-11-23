import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PanelPlegable } from '../components/agente/Plegable.jsx';
import { useCuenta } from '../lib/cuenta/Cuenta.jsx';
import { HERRAMIENTAS, aproxTokens, enPesos, enTokens } from '../lib/cuenta/config.js';
import './Page.css';
import './Poligrafo.css';
import './Agente.css';

// Mi panel (Agente Explorarg): lo que ve cada persona de su cuenta (HDO, 22/11/2026):
// cuántos tokens le quedan, cuánto lleva usado con cada herramienta y las consultas que
// hizo, guardadas para volver a abrirlas. Reabrir una consulta no gasta tokens: ya está
// traducida, y el resultado se calcula de nuevo en el navegador con los datos de hoy.
//
// Los datos vienen de /api/cuenta?detalle=1 (server/cuentas/cuenta.js, panel): cada uno
// ve solo lo suyo. Todo se muestra en tokens, nunca en dólares.
//
// Desde acá también se compran tokens (HDO, 23/11/2026): tres paquetes, que se pagan con
// Mercado Pago, en pesos. La persona elige uno, paga en la página de Mercado Pago y vuelve
// a este panel; el servidor le pregunta a Mercado Pago por el pago y recién ahí suma los
// tokens (api/compra.js). Los precios se muestran en pesos: el dólar no aparece.

const RUTA = { poligrafo: '/agente', analista: '/agente/analista' };
const fechaHora = (iso) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const numero = (n) => n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
const conSigno = (n) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${numero(Math.abs(n))}`;

// Lo que se le dice a la persona al volver de Mercado Pago, según cómo terminó el pago
const AVISO_DE_COMPRA = {
  acreditado: (r) => ({ tipo: 'bien', texto: `Listo: se sumaron ${enTokens(r.tokens)} a tu cuenta.` }),
  ya_acreditado: (r) => ({ tipo: 'bien', texto: `Los ${enTokens(r.tokens)} de esta compra ya están en tu cuenta.` }),
  pendiente: () => ({ tipo: 'espera', texto: 'Tu pago está pendiente. Cuando Mercado Pago lo confirme, los tokens se suman solos.' }),
  rechazado: () => ({ tipo: 'mal', texto: 'El pago no se aprobó. No se sumó ningún token.' }),
  devuelto: () => ({ tipo: 'mal', texto: 'Ese pago se devolvió: los tokens de esa compra ya no están en tu cuenta.' }),
  no_corresponde: () => ({ tipo: 'mal', texto: 'No encontramos ese pago. Si pagaste, los tokens se van a sumar en unos minutos.' }),
};
const SIN_PAGO = { tipo: 'mal', texto: 'No se completó el pago. No se sumó ningún token.' };
const FALLO_AL_VOLVER = { tipo: 'espera', texto: 'No pudimos confirmar el pago ahora. Si pagaste, los tokens se van a sumar en unos minutos.' };

// Al volver de Mercado Pago se confirma el pago una sola vez (en desarrollo React monta dos veces cada componente)
const confirmaciones = new Map();

/** Los paquetes de tokens que se pueden comprar. `alcanzaPara(tokens)` dice para cuántas consultas da cada uno. */
function ComprarTokens({ cabeceras, alcanzaPara }) {
  const [oferta, setOferta] = useState(null); // null: leyendo
  const [yendo, setYendo] = useState(null); // el paquete con el que se está abriendo Mercado Pago
  const [error, setError] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch('/api/compra', { headers: await cabeceras() });
        const cuerpo = await r.json().catch(() => ({}));
        if (vivo) setOferta(r.ok ? cuerpo : { habilitada: false, aviso: cuerpo.error ?? null });
      } catch {
        if (vivo) setOferta({ habilitada: false });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [cabeceras]);

  const comprar = async (paquete) => {
    setYendo(paquete);
    setError(null);
    try {
      const r = await fetch('/api/compra', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await cabeceras()) }, body: JSON.stringify({ paquete }) });
      const cuerpo = await r.json().catch(() => ({}));
      if (r.ok && cuerpo.url) {
        window.location.assign(cuerpo.url); // a la página de Mercado Pago
        return;
      }
      setError(cuerpo.error ?? 'No se pudo abrir el pago. Probá de nuevo en un rato.');
    } catch {
      setError('No se pudo abrir el pago. Revisá la conexión.');
    }
    setYendo(null);
  };

  return (
    <div className="pn-comprar">
      <span className="pn-tarjeta-rotulo">Comprar tokens</span>
      {!oferta && <p className="pn-compra">Leyendo los precios…</p>}
      {oferta && !oferta.habilitada && <p className="pn-compra">{oferta.aviso ?? 'La compra de tokens todavía no está habilitada.'}</p>}
      {oferta?.habilitada && (
        <>
          <div className="pn-paquetes">
            {oferta.paquetes.map((p) => (
              <div className="pn-paquete" key={p.id}>
                <span className="pn-paquete-tokens">{enTokens(p.tokens)}</span>
                <span className="pn-paquete-precio">{enPesos(p.pesos)}</span>
                <span className="pn-tarjeta-nota">{alcanzaPara(p.tokens)}</span>
                <button type="button" className="pg-boton" onClick={() => comprar(p.id)} disabled={Boolean(yendo)}>
                  {yendo === p.id ? 'Abriendo Mercado Pago…' : 'Comprar'}
                </button>
              </div>
            ))}
          </div>
          <p className="pn-compra">Pagás con Mercado Pago, en pesos. El precio se actualiza cada día hábil. Los tokens no vencen.</p>
        </>
      )}
      {error && (
        <p className="pn-aviso pn-aviso-mal" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Tarjeta({ rotulo, valor, nota }) {
  return (
    <div className="pn-tarjeta">
      <span className="pn-tarjeta-rotulo">{rotulo}</span>
      <span className="pn-tarjeta-valor">{valor}</span>
      {nota && <span className="pn-tarjeta-nota">{nota}</span>}
    </div>
  );
}

export default function Panel() {
  const cuenta = useCuenta();
  const { cabeceras, anotarSaldo } = cuenta;
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [parametros, setParametros] = useSearchParams();
  const [avisoDeCompra, setAvisoDeCompra] = useState(null); // { tipo: 'bien' | 'espera' | 'mal', texto }
  const [vuelta, setVuelta] = useState(0); // cambia cuando hay que leer el panel de nuevo

  // La vuelta de Mercado Pago: la dirección trae el número del pago (payment_id). Se le
  // pide al servidor que lo confirme; lo que diga la dirección no suma nada por sí solo.
  const volvio = parametros.has('payment_id') || parametros.has('collection_id') || parametros.has('status');
  const pagoQueVuelve = [parametros.get('payment_id'), parametros.get('collection_id')].find((x) => x && /^\d+$/.test(x)) ?? null;
  useEffect(() => {
    if (!volvio) return;
    let vivo = true;
    (async () => {
      let aviso = SIN_PAGO;
      if (pagoQueVuelve) {
        if (!confirmaciones.has(pagoQueVuelve)) {
          confirmaciones.set(
            pagoQueVuelve,
            (async () => {
              const r = await fetch('/api/compra', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await cabeceras()) }, body: JSON.stringify({ pago: pagoQueVuelve }) });
              return r.ok ? r.json() : null;
            })().catch(() => null)
          );
        }
        const r = await confirmaciones.get(pagoQueVuelve);
        aviso = r ? (AVISO_DE_COMPRA[r.estado]?.(r) ?? FALLO_AL_VOLVER) : FALLO_AL_VOLVER;
      }
      if (!vivo) return;
      setAvisoDeCompra(aviso);
      setParametros({}, { replace: true }); // saca los datos del pago de la barra de direcciones
      setVuelta((n) => n + 1);
    })();
    return () => {
      vivo = false;
    };
    // `setParametros` no cambia de una pasada a la otra
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volvio, pagoQueVuelve, cabeceras]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch('/api/cuenta?detalle=1', { headers: await cabeceras() });
        const cuerpo = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) {
          anotarSaldo(cuerpo); // si la sesión venció, vuelve a la entrada
          setError(cuerpo.error ?? 'No se pudo leer tu panel.');
          return;
        }
        setDatos(cuerpo);
        anotarSaldo({ cuenta: { saldo: cuerpo.saldo, precios: cuerpo.precios } }); // de paso, la barra queda al día
      } catch {
        if (vivo) setError('No se pudo leer tu panel. Revisá la conexión.');
      }
    })();
    return () => {
      vivo = false;
    };
  }, [cabeceras, anotarSaldo, vuelta]);

  const herramientas = datos ? Object.keys(HERRAMIENTAS).map((h) => ({ id: h, nombre: HERRAMIENTAS[h], ...datos.porHerramienta[h] })) : [];
  // para cuántas consultas alcanza lo que queda, con el precio de la primera de cada tanda
  const consultasCon = (tokens) => (datos ? Object.keys(HERRAMIENTAS).map((h) => `${numero(Math.floor(tokens / datos.precios[h].primera.estimado))} del ${HERRAMIENTAS[h]}`) : []);
  const alcanza = datos ? consultasCon(datos.saldo) : [];

  return (
    <section className="page-section pg pn" id="panel">
      <div className="container">
        <h2>Tus tokens y tus consultas</h2>
        <p className="section-intro pg-intro">
          Acá ves cuántos tokens te quedan, cuántos llevás usados con cada herramienta y las consultas que hiciste, guardadas para volver a
          abrirlas. Volver a abrir una consulta guardada no gasta tokens: el resultado se calcula de nuevo con los datos de hoy.
        </p>

        {avisoDeCompra && (
          <p className={`pn-aviso pn-aviso-${avisoDeCompra.tipo}`} role="status">
            {avisoDeCompra.texto}
          </p>
        )}
        {error && (
          <div className="pg-error" role="alert">
            <p>{error}</p>
          </div>
        )}
        {!datos && !error && <p className="pg-estado">Leyendo tu cuenta…</p>}

        {datos && (
          <>
            <div className="pn-tarjetas">
              <Tarjeta rotulo="Te quedan" valor={enTokens(datos.saldo)} nota={`Alcanza para unas ${alcanza.join(' o ')}, si son la primera de cada tanda.`} />
              <Tarjeta rotulo="Usaste" valor={enTokens(datos.gastado)} nota={`En ${datos.consultasHechas} ${datos.consultasHechas === 1 ? 'consulta' : 'consultas'}.`} />
              <Tarjeta
                rotulo="Recibiste"
                valor={enTokens(datos.bienvenida + datos.comprado)}
                nota={datos.comprado > 0 ? `${numero(datos.bienvenida)} de bienvenida y ${numero(datos.comprado)} comprados.` : 'De bienvenida, al registrarte.'}
              />
            </div>
            <ComprarTokens cabeceras={cabeceras} alcanzaPara={(tokens) => `Alcanza para unas ${consultasCon(tokens).join(' o ').replace(' del ', ' consultas del ')}.`} />

            <PanelPlegable paso={1} titulo={`Tus consultas (${datos.consultas.length})`} abierto>
              {datos.consultas.length === 0 ? (
                <p className="pg-estado">
                  Todavía no hiciste ninguna consulta. Empezá por el <Link to="/agente">Polígrafo</Link> o por el <Link to="/agente/analista">Analista</Link>.
                </p>
              ) : (
                <ul className="pn-consultas">
                  {datos.consultas.map((c) => (
                    <li key={c.id}>
                      <span className={`pn-herramienta pn-${c.herramienta}`}>{HERRAMIENTAS[c.herramienta] ?? c.herramienta}</span>
                      <span className="pn-consulta-texto">
                        <span className="pn-pedido">{c.pedido}</span>
                        <span className="pn-consulta-dato">
                          {fechaHora(c.fecha)} · costó {enTokens(c.precio)}
                        </span>
                      </span>
                      <Link className="pn-abrir" to={`${RUTA[c.herramienta] ?? '/agente'}?consulta=${c.id}`} title="Volver a abrir esta consulta, sin gastar tokens">
                        Abrir
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </PanelPlegable>

            <PanelPlegable paso={2} titulo="Lo que llevás usado con cada herramienta">
              <div className="pg-tabla-wrap">
                <table className="pg-tabla pn-tabla">
                  <thead>
                    <tr>
                      <th>Herramienta</th>
                      <th>Consultas</th>
                      <th>Tokens usados</th>
                      <th>Promedio por consulta</th>
                      <th>Cuánto cuesta ahora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {herramientas.map((h) => (
                      <tr key={h.id}>
                        <td>{h.nombre}</td>
                        <td>{numero(h.consultas)}</td>
                        <td>{numero(h.gastado)}</td>
                        <td>{h.consultas ? numero(Math.round(h.gastado / h.consultas)) : '-'}</td>
                        <td>
                          cerca de {aproxTokens(datos.precios[h.id].primera.estimado)} la primera y de {aproxTokens(datos.precios[h.id].siguiente.estimado)} las
                          siguientes
                        </td>
                      </tr>
                    ))}
                    <tr className="pg-fila-total">
                      <td>Total</td>
                      <td>{numero(datos.consultasHechas)}</td>
                      <td>{numero(datos.gastado)}</td>
                      <td>{datos.consultasHechas ? numero(Math.round(datos.gastado / datos.consultasHechas)) : '-'}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </PanelPlegable>

            <PanelPlegable paso={3} titulo={`Movimientos de tu cuenta (${datos.movimientos.length})`}>
              <div className="pg-tabla-wrap">
                <table className="pg-tabla pn-tabla">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Movimiento</th>
                      <th>Tokens</th>
                      <th>Te quedaban</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.movimientos.map((m) => (
                      <tr key={m.id}>
                        <td>{fechaHora(m.fecha)}</td>
                        <td>
                          {m.detalle}
                          {m.estado === 'en_curso' ? ' (en curso)' : m.tipo === 'consulta' && m.primera === false ? ' · precio reducido' : ''}
                        </td>
                        <td className={m.monto > 0 ? 'pn-suma' : ''}>{conSigno(m.monto)}</td>
                        <td>{numero(m.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PanelPlegable>
          </>
        )}
      </div>
    </section>
  );
}
