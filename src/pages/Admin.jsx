import { useCallback, useEffect, useState } from 'react';
import { PanelPlegable } from '../components/agente/Plegable.jsx';
import { useCuenta } from '../lib/cuenta/Cuenta.jsx';
import { HERRAMIENTAS, enPesos, enTokens } from '../lib/cuenta/config.js';
import './Page.css';
import './Poligrafo.css';
import './Agente.css';

// Administrador (Agente Explorarg): lo que ve quien administra el sitio (HDO, 23/11/2026):
// todas las cuentas, lo que consumió cada una, lo que se cobró contra lo que costó cada
// consulta, las afirmaciones que el Polígrafo no pudo comprobar y las consultas que no se
// cobraron. Con la descarga en planilla para Tableau.
//
// Los datos vienen de /api/admin, que contesta solo si el mail de la sesión figura en
// CUENTAS_ADMIN (server/cuentas/admin.js). Esta pestaña se le muestra solo a esa persona,
// pero el candado es el del servidor. Acá sí hay montos en dólares: son para HDO; a los
// usuarios se les habla siempre en tokens.

const numero = (n) => (n ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
const dolares = (n, decimales = 2) => (n === null || n === undefined ? '-' : `${n < 0 ? '-' : ''}US$ ${Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`);
const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '-');
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-');

const VEREDICTOS = { VERDADERO: 'Verdadero', FALSO: 'Falso', INDETERMINADO: 'Indeterminado', DOBLE_VARA: 'Doble vara', OPINION: 'No se evalúa' };

// ------------------------------------------------------------------ la planilla
// Un CSV que abre bien en el Excel en castellano y en Tableau: columnas separadas por punto
// y coma, decimales con coma y fechas como 2026-11-23 14:05:00 (hora de la Argentina).

const paraPlanilla = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'medium' });
const celda = {
  texto: (v) => `"${String(v ?? '').replace(/"/g, '""')}"`,
  entero: (v) => (v === null || v === undefined || v === '' ? '' : String(Math.round(v))),
  dolares: (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toFixed(6).replace('.', ',')),
  fecha: (v) => (v ? paraPlanilla.format(new Date(v)) : ''),
  siNo: (v) => (v === true ? 'Sí' : v === false ? 'No' : ''),
};

function descargar(nombre, columnas, filas) {
  const lineas = [columnas.map((c) => celda.texto(c.nombre)).join(';'), ...filas.map((f) => columnas.map((c) => celda[c.tipo](c.valor(f))).join(';'))];
  const archivo = new Blob([`﻿${lineas.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(archivo);
  a.download = `explorarg-agente-${nombre}-${paraPlanilla.format(new Date()).slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const COLUMNAS_CONSULTAS = [
  { nombre: 'Fecha', tipo: 'fecha', valor: (c) => c.fecha },
  { nombre: 'Mail', tipo: 'texto', valor: (c) => c.email },
  { nombre: 'Herramienta', tipo: 'texto', valor: (c) => HERRAMIENTAS[c.herramienta] ?? c.herramienta },
  { nombre: 'Pedido', tipo: 'texto', valor: (c) => c.pedido },
  { nombre: 'Contexto', tipo: 'texto', valor: (c) => c.contexto },
  { nombre: 'Resultado', tipo: 'texto', valor: (c) => resultadoTxt(c) },
  { nombre: 'Afirmaciones indeterminadas', tipo: 'entero', valor: (c) => (c.herramienta === 'poligrafo' ? (c.veredicto?.afirmaciones ?? []).filter((a) => a.estado === 'INDETERMINADO').length : '') },
  { nombre: 'Primera de la tanda', tipo: 'siNo', valor: (c) => c.primera },
  { nombre: 'Motor', tipo: 'texto', valor: (c) => c.motor },
  { nombre: 'Modelo', tipo: 'texto', valor: (c) => c.modelo },
  { nombre: 'Tokens del modelo: entrada', tipo: 'entero', valor: (c) => c.entrada },
  { nombre: 'Tokens del modelo: leídos de caché', tipo: 'entero', valor: (c) => c.entradaDeCache },
  { nombre: 'Tokens del modelo: escritos en caché', tipo: 'entero', valor: (c) => c.entradaACache },
  { nombre: 'Tokens del modelo: salida', tipo: 'entero', valor: (c) => c.salida },
  { nombre: 'Tokens de explorarg estimados', tipo: 'entero', valor: (c) => c.estimado },
  { nombre: 'Tokens de explorarg cobrados', tipo: 'entero', valor: (c) => c.precio },
  { nombre: 'Cobrado US$', tipo: 'dolares', valor: (c) => c.cobradoUsd },
  { nombre: 'Costo de lista US$', tipo: 'dolares', valor: (c) => c.costoListaUsd },
  { nombre: 'Costo para Explora US$', tipo: 'dolares', valor: (c) => c.costoExploraUsd },
  { nombre: 'Diferencia US$', tipo: 'dolares', valor: (c) => c.diferenciaUsd },
  { nombre: 'Id de la consulta', tipo: 'texto', valor: (c) => c.id },
];

const COLUMNAS_CUENTAS = [
  { nombre: 'Mail', tipo: 'texto', valor: (c) => c.email },
  { nombre: 'Nombre', tipo: 'texto', valor: (c) => c.nombre },
  { nombre: 'Alta', tipo: 'fecha', valor: (c) => c.creada },
  { nombre: 'Consultas cobradas', tipo: 'entero', valor: (c) => c.consultas },
  { nombre: 'Consultas del Polígrafo', tipo: 'entero', valor: (c) => c.porHerramienta.poligrafo?.consultas },
  { nombre: 'Consultas del Analista', tipo: 'entero', valor: (c) => c.porHerramienta.analista?.consultas },
  { nombre: 'Consultas sin cobrar', tipo: 'entero', valor: (c) => c.sinCobrar },
  { nombre: 'Tokens usados', tipo: 'entero', valor: (c) => c.gastado },
  { nombre: 'Tokens usados con el Polígrafo', tipo: 'entero', valor: (c) => c.porHerramienta.poligrafo?.gastado },
  { nombre: 'Tokens usados con el Analista', tipo: 'entero', valor: (c) => c.porHerramienta.analista?.gastado },
  { nombre: 'Tokens que le quedan', tipo: 'entero', valor: (c) => c.saldo },
  { nombre: 'Tokens de bienvenida', tipo: 'entero', valor: (c) => c.bienvenida },
  { nombre: 'Tokens comprados', tipo: 'entero', valor: (c) => c.comprado },
  { nombre: 'Cobrado US$', tipo: 'dolares', valor: (c) => c.cobradoUsd },
  { nombre: 'Costo para Explora US$', tipo: 'dolares', valor: (c) => c.costoExploraUsd },
  { nombre: 'Última consulta', tipo: 'fecha', valor: (c) => c.ultimaConsulta },
];

const MEDIOS = { mp: 'Mercado Pago' };

const COLUMNAS_COMPRAS = [
  { nombre: 'Fecha', tipo: 'fecha', valor: (c) => c.fecha },
  { nombre: 'Mail', tipo: 'texto', valor: (c) => c.email },
  { nombre: 'Tokens', tipo: 'entero', valor: (c) => c.tokens },
  { nombre: 'Pesos', tipo: 'entero', valor: (c) => c.pesos },
  { nombre: 'Dólar oficial usado', tipo: 'dolares', valor: (c) => c.dolar },
  { nombre: 'Medio de pago', tipo: 'texto', valor: (c) => MEDIOS[c.medio] ?? c.medio },
  { nombre: 'Número de pago', tipo: 'texto', valor: (c) => c.pagoId },
  { nombre: 'Anulada', tipo: 'siNo', valor: (c) => c.anulada },
];

/** El resultado de una consulta, en palabras: el veredicto del Polígrafo o qué armó el Analista. */
function resultadoTxt(c) {
  if (c.herramienta !== 'poligrafo') return c.resultado || '';
  if (c.resultado === 'CON_PREGUNTAS') return 'Depende de lo que conteste la persona';
  return VEREDICTOS[c.resultado] ?? c.resultado ?? '';
}

function Resultado({ c }) {
  if (c.herramienta !== 'poligrafo') return c.resultado || '-';
  if (!c.resultado) return '-';
  if (!VEREDICTOS[c.resultado]) return <span className="ad-chico">{resultadoTxt(c)}</span>;
  return (
    <>
      <span className={`pg-sello pg-${c.resultado.toLowerCase()}`}>{VEREDICTOS[c.resultado]}</span>
      {c.calculadoHoy && <span className="ad-chico ad-bloque">calculado con los datos de hoy</span>}
    </>
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

export default function Admin() {
  const { cabeceras, anotarSaldo } = useCuenta();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [leyendo, setLeyendo] = useState(true);

  const leer = useCallback(async () => {
    setLeyendo(true);
    setError(null);
    try {
      const r = await fetch('/api/admin', { headers: await cabeceras() });
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        anotarSaldo(cuerpo); // si la sesión venció, vuelve a la entrada
        setError(cuerpo.error ?? 'No se pudo leer el panel.');
        return;
      }
      setDatos(cuerpo);
    } catch {
      setError('No se pudo leer el panel. Revisá la conexión.');
    } finally {
      setLeyendo(false);
    }
  }, [cabeceras, anotarSaldo]);

  useEffect(() => {
    leer();
  }, [leer]);

  const t = datos?.totales;
  const conConsultas = datos ? datos.cuentas.filter((c) => c.consultas > 0).length : 0;
  // las consultas hechas con el motor local (Claude Code de esta Mac) no cuestan: el costo es el de lista
  const enEstaMac = datos ? [...datos.consultas, ...datos.sinCobrar].filter((c) => c.motor === 'local').length : 0;
  const deCada = datos ? Object.keys(HERRAMIENTAS).map((h) => `${numero(datos.consultas.filter((c) => c.herramienta === h).length)} del ${HERRAMIENTAS[h]}`) : [];

  return (
    <section className="page-section pg pn ad" id="admin">
      <div className="container">
        <h2>Las cuentas y las consultas del Agente</h2>
        <p className="section-intro pg-intro">
          Acá ves todas las cuentas del Agente Explorarg: cuántos tokens usó cada una, lo que se cobró contra lo que costó cada consulta, las
          afirmaciones que el Polígrafo no pudo comprobar y las consultas que no se cobraron. Este panel lo ves solo vos. Los montos en
          dólares son a precio de lista del modelo: 10.000 tokens de explorarg equivalen a US$ 1.
        </p>

        {error && (
          <div className="pg-error" role="alert">
            <p>{error}</p>
          </div>
        )}
        {!datos && !error && <p className="pg-estado">Leyendo las cuentas…</p>}

        {datos && (
          <>
            <div className="pn-tarjetas">
              <Tarjeta
                rotulo="Cuentas"
                valor={numero(t.cuentas)}
                nota={`${numero(conConsultas)} ${conConsultas === 1 ? 'hizo' : 'hicieron'} al menos una consulta. Entre todas les quedan ${enTokens(t.saldo)} sin usar.`}
              />
              <Tarjeta
                rotulo="Consultas cobradas"
                valor={numero(t.consultas)}
                nota={`${deCada.join(' y ')}. ${t.sinCobrar === 1 ? 'Otra no se cobró' : `Otras ${numero(t.sinCobrar)} no se cobraron`}.`}
              />
              <Tarjeta
                rotulo="Se cobró"
                valor={dolares(t.cobradoUsd)}
                nota={`Son ${enTokens(t.gastado)}. ${t.compras > 0 ? `Se vendieron ${enTokens(t.comprado)} por ${enPesos(t.vendidoPesos)}.` : 'Todavía no hay compras: salen de los tokens de bienvenida.'}`}
              />
              <Tarjeta
                rotulo="Costó"
                valor={dolares(t.costoExploraUsd)}
                nota={`A precio de lista del modelo, con las consultas que no se cobraron. Diferencia: ${dolares(t.diferenciaUsd)}.`}
              />
            </div>

            <div className="ad-barra">
              <button type="button" className="ad-boton" onClick={() => descargar('consultas', COLUMNAS_CONSULTAS, datos.consultas)} disabled={!datos.consultas.length}>
                Descargar las consultas en planilla
              </button>
              <button type="button" className="ad-boton" onClick={() => descargar('cuentas', COLUMNAS_CUENTAS, datos.cuentas)} disabled={!datos.cuentas.length}>
                Descargar las cuentas en planilla
              </button>
              <button type="button" className="ad-boton" onClick={() => descargar('compras', COLUMNAS_COMPRAS, datos.compras)} disabled={!datos.compras.length}>
                Descargar las compras en planilla
              </button>
              <button type="button" className="ad-boton ad-boton-suave" onClick={leer} disabled={leyendo}>
                {leyendo ? 'Actualizando…' : 'Actualizar'}
              </button>
              <span className="ad-chico">Las planillas se abren con Excel y con Tableau. Datos al {fechaHora(datos.generado)}.</span>
            </div>
            {enEstaMac > 0 && (
              <p className="ad-nota ad-nota-arriba">
                {enEstaMac === 1 ? 'Una de estas consultas se hizo' : `${numero(enEstaMac)} de estas consultas se hicieron`} desde esta Mac, con el Claude Code
                instalado acá: a Explora no le {enEstaMac === 1 ? 'costó' : 'costaron'} nada. El costo que figura es el que {enEstaMac === 1 ? 'habría tenido' : 'habrían tenido'} con
                el sitio publicado.
              </p>
            )}

            <PanelPlegable paso={1} titulo={`Cuentas (${numero(datos.cuentas.length)})`} abierto>
              <div className="pg-tabla-wrap">
                <table className="pg-tabla pn-tabla ad-tabla">
                  <thead>
                    <tr>
                      <th>Mail</th>
                      <th>Alta</th>
                      <th className="ad-num">Consultas</th>
                      <th className="ad-num">Tokens usados</th>
                      <th className="ad-num">Le quedan</th>
                      <th className="ad-num">Se cobró</th>
                      <th className="ad-num">Costó</th>
                      <th>Última consulta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.cuentas.map((c) => (
                      <tr key={c.uid}>
                        <td>
                          {c.email}
                          {c.nombre && <span className="ad-chico ad-bloque">{c.nombre}</span>}
                        </td>
                        <td className="ad-fijo">{fecha(c.creada)}</td>
                        <td className="ad-num">
                          {numero(c.consultas)}
                          {c.sinCobrar > 0 && <span className="ad-chico ad-bloque">y {numero(c.sinCobrar)} sin cobrar</span>}
                        </td>
                        <td className="ad-num">{numero(c.gastado)}</td>
                        <td className="ad-num">{numero(c.saldo)}</td>
                        <td className="ad-num">{dolares(c.cobradoUsd, 3)}</td>
                        <td className="ad-num">{dolares(c.costoExploraUsd, 3)}</td>
                        <td className="ad-fijo">{fechaHora(c.ultimaConsulta)}</td>
                      </tr>
                    ))}
                    <tr className="pg-fila-total">
                      <td>Total</td>
                      <td />
                      <td className="ad-num">{numero(t.consultas)}</td>
                      <td className="ad-num">{numero(t.gastado)}</td>
                      <td className="ad-num">{numero(t.saldo)}</td>
                      <td className="ad-num">{dolares(t.cobradoUsd, 3)}</td>
                      <td className="ad-num">{dolares(t.costoExploraUsd, 3)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </PanelPlegable>

            <PanelPlegable paso={2} titulo={`Consultas cobradas (${numero(datos.consultas.length)})`}>
              {datos.consultas.length === 0 ? (
                <p className="pg-estado">Todavía no hay consultas.</p>
              ) : (
                <div className="pg-tabla-wrap">
                  <table className="pg-tabla pn-tabla ad-tabla">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Mail</th>
                        <th>Herramienta</th>
                        <th>Pedido</th>
                        <th>Resultado</th>
                        <th className="ad-num">Tokens</th>
                        <th className="ad-num">Se cobró</th>
                        <th className="ad-num">Costó</th>
                        <th className="ad-num">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.consultas.map((c) => (
                        <tr key={`${c.uid}-${c.id}`}>
                          <td className="ad-fijo">{fechaHora(c.fecha)}</td>
                          <td className="ad-fijo">{c.email}</td>
                          <td className="ad-fijo">{HERRAMIENTAS[c.herramienta] ?? c.herramienta}</td>
                          <td className="ad-pedido" title={c.pedido}>
                            <span>{c.pedido}</span>
                          </td>
                          <td>
                            <Resultado c={c} />
                          </td>
                          <td className="ad-num">
                            {numero(c.precio)}
                            {c.primera === false && <span className="ad-chico ad-bloque">precio reducido</span>}
                          </td>
                          <td className="ad-num">{dolares(c.cobradoUsd, 3)}</td>
                          <td className="ad-num">{dolares(c.costoExploraUsd, 3)}</td>
                          <td className={`ad-num${c.diferenciaUsd < 0 ? ' ad-negativo' : ''}`}>{dolares(c.diferenciaUsd, 3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </PanelPlegable>

            <PanelPlegable paso={3} titulo={`Afirmaciones que el Polígrafo no pudo comprobar (${numero(datos.indeterminadas.length)})`}>
              {datos.indeterminadas.length === 0 ? (
                <p className="pg-estado">Ninguna afirmación quedó como Indeterminado.</p>
              ) : (
                <>
                  <p className="ad-nota">
                    Cada renglón es una afirmación que quedó como Indeterminado, con el motivo: sirve para ver qué dato o qué cálculo le falta
                    al Polígrafo. {numero(t.frasesConIndeterminado)} {t.frasesConIndeterminado === 1 ? 'frase tiene' : 'frases tienen'} al menos una.
                  </p>
                  <div className="pg-tabla-wrap">
                    <table className="pg-tabla pn-tabla ad-tabla">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Mail</th>
                          <th>Afirmación</th>
                          <th>Por qué no se pudo comprobar</th>
                          <th>Frase completa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datos.indeterminadas.map((x, n) => (
                          <tr key={`${x.consultaId}-${n}`}>
                            <td className="ad-fijo">{fechaHora(x.fecha)}</td>
                            <td className="ad-fijo">{x.email}</td>
                            <td>«{x.afirmacion}»</td>
                            <td>
                              {x.motivo || '-'}
                              {x.calculadoHoy && <span className="ad-chico ad-bloque">calculado con los datos de hoy</span>}
                            </td>
                            <td className="ad-pedido" title={x.pedido}>
                              <span>{x.pedido}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </PanelPlegable>

            <PanelPlegable paso={4} titulo={`Consultas que no se cobraron (${numero(datos.sinCobrar.length)})`}>
              {datos.sinCobrar.length === 0 ? (
                <p className="pg-estado">No hay consultas sin cobrar.</p>
              ) : (
                <>
                  <p className="ad-nota">
                    No se cobran las consultas que fallan ni los pedidos que no se pueden responder con los datos del sitio. El pedido queda
                    anotado desde el 23/11/2026: en las anteriores no figura.
                  </p>
                  <div className="pg-tabla-wrap">
                    <table className="pg-tabla pn-tabla ad-tabla">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Mail</th>
                          <th>Herramienta</th>
                          <th>Motivo</th>
                          <th>Pedido</th>
                          <th className="ad-num">Costó</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datos.sinCobrar.map((m) => (
                          <tr key={`${m.uid}-${m.id}`}>
                            <td className="ad-fijo">{fechaHora(m.fecha)}</td>
                            <td className="ad-fijo">{m.email}</td>
                            <td className="ad-fijo">{HERRAMIENTAS[m.herramienta] ?? m.herramienta}</td>
                            <td>{m.motivoTxt}</td>
                            <td className="ad-pedido" title={m.pedido}>
                              <span>{m.pedido || '-'}</span>
                            </td>
                            <td className="ad-num">{dolares(m.costoExploraUsd, 3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </PanelPlegable>

            <PanelPlegable paso={5} titulo={`Compras de tokens (${numero(datos.compras.length)})`}>
              {datos.compras.length === 0 ? (
                <p className="pg-estado">Todavía no hay compras.</p>
              ) : (
                <>
                  <p className="ad-nota">
                    {t.compras === 1 ? 'Una compra vigente' : `${numero(t.compras)} compras vigentes`}, por {enPesos(t.vendidoPesos)} en total.
                    {t.comprasAnuladas > 0 && ` ${t.comprasAnuladas === 1 ? 'Otra se anuló' : `Otras ${numero(t.comprasAnuladas)} se anularon`} (el pago se devolvió o el comprador lo desconoció) y no cuentan.`} El precio en pesos sale del
                    dólar oficial del día de la compra.
                  </p>
                  <div className="pg-tabla-wrap">
                    <table className="pg-tabla pn-tabla ad-tabla">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Mail</th>
                          <th className="ad-num">Tokens</th>
                          <th className="ad-num">Pesos</th>
                          <th className="ad-num">Dólar usado</th>
                          <th>Medio</th>
                          <th>Número de pago</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datos.compras.map((c) => (
                          <tr key={`${c.uid}-${c.id}`}>
                            <td className="ad-fijo">{fechaHora(c.fecha)}</td>
                            <td className="ad-fijo">{c.email}</td>
                            <td className="ad-num">{numero(c.tokens)}</td>
                            <td className="ad-num">{c.pesos === null ? '-' : enPesos(c.pesos)}</td>
                            <td className="ad-num">{c.dolar === null ? '-' : `$ ${c.dolar.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>
                            <td className="ad-fijo">{MEDIOS[c.medio] ?? c.medio}</td>
                            <td className="ad-fijo">{c.pagoId}</td>
                            <td className={c.anulada ? 'ad-fijo ad-negativo' : 'ad-fijo'}>{c.anulada ? 'Anulada' : 'Acreditada'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </PanelPlegable>
          </>
        )}
      </div>
    </section>
  );
}
