import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import empresasData from '../data/empresas.json';
import mercadoData from '../data/mercado.json';
import corteData from '../data/corte.json';
import capacidadData from '../data/capacidad.json';
import normasData from '../data/poligrafo_normas.json';
import tecnicosData from '../data/datos_tecnicos.json';
import ejemplosSerie from '../data/poligrafo_ejemplos.json';
import petrolerasData from '../data/petroleras.json';
import aceiteData from '../data/precio_aceite_rosario.json';
import gasoilPreciosData from '../data/gasoil_precios.json';
import gasoilRankingData from '../data/gasoil_ranking.json';
import iclIco2Data from '../data/icl_ico2.json';
import naftasData from '../data/naftas_precios.json';
import bioetanolData from '../data/bioetanol_precios.json';
import { SENADORES, VOTACION } from '../data/mapa-recinto.js';
import leyBasesData from '../data/diputados_ley_bases_2024.json';
import art39Data from '../data/dicho_dato_art39.json';
import gestionData from '../data/gestion.json';
import goSectoresData from '../data/go_sectores.json';
import evidenciaData from '../data/evidencia.json';
import rutasPuertosData from '../data/rutas_puertos.json';
import { PanelPlegable } from '../components/agente/Plegable.jsx';
import { useCuenta } from '../lib/cuenta/Cuenta.jsx';
import { MINUTOS_DE_TANDA, aproxTokens, enTokens, horaDe } from '../lib/cuenta/config.js';
import { fmt } from '../lib/format.js';
import { aplicarRespuestas, MAX_CONTEXTO, MAX_ENUNCIADO, normalizarAnalisis } from '../lib/poligrafo/analisis.js';
import { AUTOR, FUENTE_DATOS, LEMA_OPINION } from '../lib/poligrafo/catalogo.js';
import { EJEMPLOS } from '../lib/poligrafo/ejemplos.js';
import { armarContexto } from '../lib/poligrafo/contexto.js';
import {
  describirMedicion,
  describirValor,
  ESTADOS,
  evaluarEnunciado,
  formaVisible,
} from '../lib/poligrafo/motor.js';
import './Page.css';
import './Poligrafo.css';

// Página /poligrafo (prototipo, 22/11/2026): el usuario escribe un enunciado,
// la IA lo traduce a forma lógica (api/poligrafo.js) y esta página lo contrasta
// con los datos del sitio usando el motor de src/lib/poligrafo. La IA no
// calcula nada: todo número de esta pantalla sale de los JSON de los tableros.
// En las afirmaciones sobre normas la IA sí propone el veredicto, y solo se
// muestra si viene con una cita que figura textual en poligrafo_normas.json.
//
// En los textos que ve el público la IA no se nombra: quien lee es
// "explorarg.com" (AUTOR) y los datos llevan su fuente (FUENTE_DATOS). Decisión
// de HDO del 22/11/2026.

const REGLA_CONJUNCION = {
  VERDADERO: 'Todas las afirmaciones que se pueden comprobar coinciden con los datos.',
  FALSO: 'El enunciado afirma todo junto: alcanza con una afirmación falsa para que el conjunto sea falso.',
  INDETERMINADO: 'Ninguna afirmación resultó falsa, pero hay al menos una que no se puede comprobar con los datos y los textos disponibles.',
  DOBLE_VARA: 'Ninguna afirmación resultó falsa, pero al menos una vale solo para una parte: la misma norma no la aplica a la otra.',
};

const RESULTADO_REVISION = {
  se_sostiene: 'se sostiene',
  no_se_sostiene: 'no se sostiene',
  no_alcanza: 'el texto no alcanza para decidirlo',
};

// "22/11/2026": la fecha de una consulta guardada
const fechaCorta = (iso) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

// "A, B y C"
const enLista = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs.join(''));

function Sello({ estado, grande }) {
  return (
    <span className={`pg-sello pg-${estado.toLowerCase()}${grande ? ' pg-sello-grande' : ''}`}>
      {ESTADOS[estado].etiqueta}
    </span>
  );
}

function Detalle({ detalle }) {
  if (!detalle?.filas?.length) return null;
  return (
    <details className="pg-detalle">
      <summary>Ver los datos</summary>
      <div className="pg-tabla-wrap">
        <table className="pg-tabla">
          <thead>
            <tr>
              {detalle.columnas.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detalle.filas.map((fila, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <tr key={i} className={fila[0] === 'Total' || fila[0] === 'Participación' || fila[0] === 'Variación' ? 'pg-fila-total' : ''}>
                {fila.map((celda, j) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <td key={j}>{celda}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function CitaLegal({ c }) {
  return (
    <figure className="pg-cita-legal">
      <figcaption>
        <strong>{c.norma}</strong> · {c.rotulo}
        {c.titulo && c.normaId !== 'L27640' ? ` - ${c.titulo}` : ''}
      </figcaption>
      <blockquote>«{c.texto}»</blockquote>
      <details className="pg-detalle">
        <summary>{c.resena ? 'Ver la reseña completa' : 'Ver el artículo completo'}</summary>
        <p className="pg-articulo">{c.completo}</p>
        <p className="pg-fuente">
          {c.url ? (
            <a href={c.url} target="_blank" rel="noopener noreferrer">
              Texto oficial
            </a>
          ) : (
            <Link to={c.ruta}>Ver en el sitio</Link>
          )}
        </p>
      </details>
    </figure>
  );
}

function DatoFicha({ d }) {
  return (
    <figure className="pg-cita-legal pg-dato-ficha">
      <figcaption>
        <strong>{d.tema}</strong>
      </figcaption>
      <blockquote>{d.texto}</blockquote>
      <p className="pg-fuente">
        {d.fuente ?? FUENTE_DATOS}{' '}
        {d.url ? (
          <a href={d.url} target="_blank" rel="noopener noreferrer">
            Texto oficial
          </a>
        ) : (
          <Link to={d.ruta}>Ver el tablero</Link>
        )}
      </p>
    </figure>
  );
}

// Una opinión no se evalúa, salvo que dé por cierto algo que los textos o los
// datos desmienten: ahí es falsa, y se muestra con qué choca (HDO, 22/11/2026).
function OpinionContraLosHechos({ v }) {
  if (v.origen !== 'opinion') return null;
  return (
    <div className="pg-norma">
      <p className="pg-linea">
        <span className="pg-rotulo">Da por cierto</span>
        {v.hecho}
      </p>
      {v.citas.map((c) => (
        <CitaLegal key={`${c.id}-${c.texto.slice(0, 24)}`} c={c} />
      ))}
      {v.datos.map((d) => (
        <DatoFicha key={d.id} d={d} />
      ))}
      {v.explicacion && (
        <p className="pg-linea">
          <span className="pg-rotulo">Lectura de {AUTOR}</span>
          {v.explicacion}
        </p>
      )}
      <p className="pg-lema">{LEMA_OPINION}</p>
    </div>
  );
}

// La segunda lectura: qué omite una frase que al pie de la letra es cierta. La
// "verdad a medias" es un paso intermedio (no un sello); la doble vara sí es sello.
function SegundaLectura({ v }) {
  const r = v.revision;
  if (!r) return null;
  const doble = r.tipo === 'doble_vara';
  return (
    <div className="pg-segunda">
      <p className="pg-segunda-titulo">
        <span className="pg-rotulo">Segunda lectura</span>
        Al pie de la letra es cierto. {doble ? 'Pero vale solo para una parte.' : 'Pero es una verdad a medias: omite algo.'}
      </p>
      {doble ? (
        <dl className="pg-partes">
          <div>
            <dt>Vale para</dt>
            <dd>{r.vale_para}</dd>
          </div>
          <div>
            <dt>No vale para</dt>
            <dd>{r.no_vale_para}</dd>
          </div>
        </dl>
      ) : (
        r.omite && (
          <p className="pg-linea">
            <span className="pg-rotulo">Lo que omite</span>
            {r.omite}
          </p>
        )
      )}
      {r.citas.map((c) => (
        <CitaLegal key={`${c.id}-${c.texto.slice(0, 24)}`} c={c} />
      ))}
      {r.datos.map((d) => (
        <DatoFicha key={d.id} d={d} />
      ))}
      {r.explicacion && (
        <p className="pg-linea">
          <span className="pg-rotulo">Lectura de {AUTOR}</span>
          {r.explicacion}
        </p>
      )}
      {!doble && (
        <p className="pg-linea pg-segunda-cierre">
          <span className="pg-rotulo">Con lo omitido incorporado</span>
          La afirmación {RESULTADO_REVISION[r.resultado]}. Por eso el sello es <strong>{ESTADOS[v.estado].etiqueta}</strong>.
        </p>
      )}
      <p className="pg-margen">
        {r.citas.length > 0 && 'Cada cita figura textual en la norma. '}
        La segunda lectura es de {AUTOR}: contrastala con lo citado.
      </p>
    </div>
  );
}

function Citas({ v }) {
  if (v.origen !== 'norma') return null;
  return (
    <div className="pg-norma">
      {v.citas.map((c) => (
        <CitaLegal key={`${c.id}-${c.texto.slice(0, 24)}`} c={c} />
      ))}
      {(v.datos ?? []).map((d) => (
        <DatoFicha key={d.id} d={d} />
      ))}
      {v.explicacion && (
        <p className="pg-linea">
          <span className="pg-rotulo">Lectura de {AUTOR}</span>
          {v.explicacion}
        </p>
      )}
      {v.citas.length > 0 && (
        <p className="pg-margen">
          Cada cita figura textual en la norma. Que el texto respalde o contradiga lo dicho es la lectura de {AUTOR}:
          contrastala con la cita.
        </p>
      )}
    </div>
  );
}

function Veredicto({ v }) {
  return (
    <details className={`pg-afirmacion pg-plegable pg-borde-${v.estado.toLowerCase()}`}>
      {/* plegada se ve la frase con su sello; el porqué se despliega con la flechita */}
      <summary>
        <span className="pg-afirmacion-cab">
          <span className="pg-id">{v.id}</span>
          <Sello estado={v.estado} />
          <span className="pg-afirmacion-frase">
            <span className="pg-cita">«{v.cita}»</span>
            {v.estado === 'OPINION' && <span className="pg-aclara">es una opinión</span>}
            {v.origen === 'opinion' && <span className="pg-aclara">es una opinión, pero choca con los hechos</span>}
          </span>
          <span className="pg-flecha" aria-hidden="true" />
        </span>
      </summary>
      <div className="pg-plegable-cuerpo">

      {v.lectura && (
        <p className="pg-linea">
          <span className="pg-rotulo">Se mide</span>
          {v.lectura}
        </p>
      )}

      {v.dato !== undefined && (
        <>
          <dl className="pg-cotejo">
            <div>
              <dt>Dijo</dt>
              <dd>{v.dicho}</dd>
            </div>
            <div>
              <dt>Dato</dt>
              {/* el color sigue a la comparación al pie de la letra, no al sello final */}
              <dd className={`pg-dato pg-texto-${(v.literal ?? v.estado).toLowerCase()}`}>{v.dato}</dd>
            </div>
            {v.diferencia && (
              <div>
                <dt>Diferencia</dt>
                <dd>{v.diferencia}</dd>
              </div>
            )}
          </dl>
          <p className="pg-margen">{v.margen}</p>
        </>
      )}

      {v.origen === 'norma' && (
        <p className="pg-linea">
          <span className="pg-rotulo">Se contrasta con</span>
          {v.normas.length ? enLista(v.normas) : 'los textos legales y los datos técnicos cargados en el sitio'}
        </p>
      )}
      {v.motivo && <p className="pg-motivo">{v.motivo}</p>}
      <Citas v={v} />
      <OpinionContraLosHechos v={v} />
      {v.notas?.map((n) => (
        <p key={n} className="pg-nota">
          {n}
        </p>
      ))}

      <Detalle detalle={v.detalle} />
      <SegundaLectura v={v} />

      {v.fuente && v.dato !== undefined && (
        <p className="pg-fuente">
          {v.fuente.origen ?? FUENTE_DATOS} Ver el tablero: <Link to={v.fuente.ruta}>{v.fuente.etiqueta}</Link>
        </p>
      )}
      </div>
    </details>
  );
}

// `soloEjemplos`: la persona no ingresó; ve los ejemplos ya analizados (no consultan a la IA) y el formulario apagado.
export default function Poligrafo({ soloEjemplos = false }) {
  const cuenta = useCuenta();
  // lo que cuesta consultar ahora: llega del servidor (null en la copia local sin cuentas)
  const precio = cuenta.precioDe('poligrafo');
  const sinCredito = precio !== null && cuenta.saldo < precio.estimado;
  const ctx = useMemo(
    () =>
      armarContexto({
        empresas: empresasData,
        mercado: mercadoData,
        corte: corteData,
        capacidad: capacidadData,
        normas: normasData,
        petroleras: petrolerasData,
        aceite: aceiteData,
        tecnicos: tecnicosData,
        gasoilPrecios: gasoilPreciosData,
        gasoilRanking: gasoilRankingData,
        iclIco2: iclIco2Data,
        naftas: naftasData,
        bioetanol: bioetanolData,
        leyBases: leyBasesData,
        art39: art39Data,
        gestion: gestionData,
        goSectores: goSectoresData,
        evidencia: evidenciaData,
        rutasPuertos: rutasPuertosData,
        recinto: { SENADORES, VOTACION },
      }),
    []
  );

  const [texto, setTexto] = useState('');
  const [contexto, setContexto] = useState('');
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState(null);
  const [caso, setCaso] = useState(null); // { enunciado, analisis, origen }
  const [respuestas, setRespuestas] = useState({});
  const anclaRef = useRef(null);
  const numeroDeCaso = useRef(0); // la `key` del bloque: un caso nuevo arranca con todo plegado

  const abrirCaso = (nuevo) => {
    numeroDeCaso.current += 1;
    setCaso({ ...nuevo, n: numeroDeCaso.current });
    setRespuestas({});
    setError(null);
  };

  useEffect(() => {
    if (caso) anclaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [caso]);

  async function evaluar(e) {
    e.preventDefault();
    const enunciado = texto.replace(/\s+/g, ' ').trim();
    if (enunciado.length < 12 || analizando || soloEjemplos || sinCredito) return;
    setAnalizando(true);
    setError(null);
    setCaso(null);
    try {
      const r = await fetch('/api/poligrafo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await cuenta.cabeceras()) },
        body: JSON.stringify({ enunciado, contexto: contexto.trim() }),
      });
      const cuerpo = await r.json().catch(() => null);
      cuenta.anotarSaldo(cuerpo); // el servidor informa cómo quedó el saldo de tokens, se haya cobrado o no
      if (!r.ok || !cuerpo?.analisis) {
        setError({ mensaje: cuerpo?.error ?? 'No se pudo analizar el enunciado. Probá de nuevo.', codigo: cuerpo?.codigo });
        return;
      }
      // segundo control, del lado de la página, contra el mismo catálogo
      const controlado = normalizarAnalisis(cuerpo.analisis, ctx);
      const avisosServidor = (cuerpo.analisis.avisos ?? []).filter((a) => typeof a === 'string');
      abrirCaso({
        enunciado,
        analisis: { ...controlado, avisos: [...new Set([...avisosServidor, ...controlado.avisos])] },
        origen: { tipo: 'ia', motor: cuerpo.motor, modelo: cuerpo.modelo, uso: cuerpo.uso, cuenta: cuerpo.cuenta ?? null },
      });
    } catch {
      setError({ mensaje: 'No se pudo conectar con el servidor. Probá de nuevo.' });
    } finally {
      setAnalizando(false);
    }
  }

  // Ejemplos ya analizados: el de arranque (ejemplos.js) y los episodios de «Del dicho
  // al dato» que ya pasaron por el Polígrafo (poligrafo_ejemplos.json, que arma
  // scripts/poligrafo_ejemplos.mjs). Traen la forma lógica guardada: no consultan a la IA.
  function usarEjemplo(id) {
    const ej = [...EJEMPLOS, ...ejemplosSerie.ejemplos].find((x) => x.id === id);
    if (!ej) return;
    setTexto(ej.enunciado);
    setContexto(ej.contexto ?? '');
    abrirCaso({
      enunciado: ej.enunciado,
      analisis: normalizarAnalisis(ej.analisis, ctx),
      origen: { tipo: 'ejemplo', id: ej.id, episodio: ej.episodio ?? null, modelo: ej.modelo ?? null },
    });
  }

  // Una consulta guardada, abierta desde Mi panel (/agente?consulta=ID): no consulta a la IA
  // ni gasta tokens. La forma lógica viene guardada y el resultado se calcula con los datos de hoy.
  const [parametros, setParametros] = useSearchParams();
  const idGuardada = parametros.get('consulta');
  useEffect(() => {
    if (!idGuardada || soloEjemplos) return undefined;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/cuenta?consulta=${encodeURIComponent(idGuardada)}`, { headers: await cuenta.cabeceras() });
        const g = await r.json().catch(() => null);
        if (!vivo) return;
        if (!r.ok || !g?.respuestaJson || g.herramienta !== 'poligrafo') {
          cuenta.anotarSaldo(g);
          setError({ mensaje: g?.error ?? 'No se pudo abrir esa consulta guardada.' });
        } else {
          setTexto(g.pedido);
          setContexto(g.contexto ?? '');
          abrirCaso({ enunciado: g.pedido, analisis: normalizarAnalisis(JSON.parse(g.respuestaJson), ctx), origen: { tipo: 'guardada', fecha: g.fecha } });
        }
      } catch {
        if (vivo) setError({ mensaje: 'No se pudo abrir esa consulta guardada. Revisá la conexión.' });
      }
      // la dirección queda limpia: si recarga la página no la vuelve a pedir
      if (vivo) setParametros({}, { replace: true });
    })();
    return () => {
      vivo = false;
    };
    // se abre una vez por cada id que llega en la dirección
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idGuardada, soloEjemplos]);

  const analisis = caso?.analisis;
  const resuelto = useMemo(() => (analisis ? aplicarRespuestas(analisis, respuestas) : null), [analisis, respuestas]);
  const faltan = analisis ? analisis.preguntas.filter((q) => !respuestas[q.id]).length : 0;
  const resultado = useMemo(() => (resuelto && faltan === 0 ? evaluarEnunciado(resuelto, ctx) : null), [resuelto, faltan, ctx]);

  // las opiniones quedan fuera de la cuenta, salvo las que chocan con los hechos
  const enForma = resuelto ? resuelto.afirmaciones.filter((a) => a.tipo !== 'opinion' || a.choca) : [];
  const opiniones = resuelto ? resuelto.afirmaciones.filter((a) => a.tipo === 'opinion' && !a.choca) : [];
  const formaTxt = resultado?.forma ?? analisis?.forma ?? '';
  const esConjuncion = formaTxt && !/\bo\b|\bno\b|\(/.test(formaTxt);
  const sinMotor = error?.codigo === 'sin_sesion' || error?.codigo === 'sin_motor';

  return (
    <section className="page-section pg" id="poligrafo">
      <div className="container">
        {/* Título y caput: texto de HDO (23/11/2026; el caput es su segunda versión, de tres párrafos). No reescribir.
            El nombre se escribe "Explorarg", sin RG en mayúscula. */}
        <h2>Polígrafo Explorarg</h2>
        <div className="pg-caput">
          <p>
            Evaluar la solidez de una conclusión exige verificar que sus premisas estén respaldadas por evidencia empírica y mediciones
            objetivas, y que el razonamiento que las vincula sea lógicamente válido (deductivo) o razonablemente plausible (inductivo o
            abductivo). No se trata de limitar las opiniones, sino de destacar que ni la trayectoria, el poder, el cargo, la edad o el sexo de
            quien habla constituyen prueba de la veracidad de lo que afirma.
          </p>
          <p>
            El Polígrafo destierra el sesgo de autoridad del debate sobre el biodiésel, la evaluación de la veracidad de un argumento se basa en
            una estructura que respeta los principios de la lógica y en el contraste con los datos oficiales y el marco normativo.
          </p>
          <p>
            Su uso ayudará a elevar la calidad del debate público. Permite a periodistas repreguntar en tiempo real y a cualquier ciudadano
            examinar, con el mismo rigor, los argumentos de empresarios, funcionarios, dirigentes y grupos de interés.
          </p>
        </div>

        <form className="pg-form" onSubmit={evaluar}>
          <label htmlFor="pg-enunciado" className="pg-label">
            El enunciado
          </label>
          <textarea
            id="pg-enunciado"
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, MAX_ENUNCIADO))}
            rows={5}
            placeholder="Por ejemplo: «En 2025 las integradas vendieron menos del 10% del cupo.»"
            disabled={soloEjemplos}
          />
          <label htmlFor="pg-contexto" className="pg-label pg-label-contexto">
            Contexto <span>(opcional): quién lo dijo, cuándo y sobre qué</span>
          </label>
          <input
            id="pg-contexto"
            type="text"
            value={contexto}
            onChange={(e) => setContexto(e.target.value.slice(0, MAX_CONTEXTO))}
            placeholder="Por ejemplo: senadora Bullrich, cierre del debate de la ley de biocombustibles en el Senado, 17/9/2026"
            disabled={soloEjemplos}
          />
          <div className="pg-form-pie">
            <span className="pg-contador">
              {texto.length} / {MAX_ENUNCIADO}
            </span>
            <button type="submit" className="pg-boton" disabled={soloEjemplos || sinCredito || analizando || texto.trim().length < 12}>
              {soloEjemplos ? 'Ingresá para evaluar tu frase' : analizando ? 'Analizando…' : precio !== null ? `Evaluar · aprox. ${aproxTokens(precio.estimado)}` : 'Evaluar'}
            </button>
          </div>
          {precio !== null && !sinCredito && !soloEjemplos && (
            <p className="pg-costo">
              {precio.enTanda ? (
                <>
                  Precio reducido hasta las {horaDe(precio.hasta)}: esta consulta cuesta cerca de {aproxTokens(precio.estimado)}, nunca más de{' '}
                  {aproxTokens(precio.maximo)}.
                </>
              ) : (
                <>
                  Costo estimado: {aproxTokens(precio.estimado)}, nunca más de {aproxTokens(precio.maximo)}. Se descuenta lo que la consulta use. Las que
                  hagas en los {MINUTOS_DE_TANDA} minutos siguientes cuestan cerca de {aproxTokens(precio.siguiente)}.
                </>
              )}
            </p>
          )}
          {sinCredito && (
            <p className="pg-sin-credito" role="status">
              Tus tokens no alcanzan: te quedan {enTokens(cuenta.saldo)} y esta consulta del Polígrafo cuesta cerca de {aproxTokens(precio.estimado)}.{' '}
              {cuenta.compraHabilitada ? (
                <>
                  Podés comprar más en <Link to="/agente/panel">Mi panel</Link>.
                </>
              ) : (
                'La compra de tokens todavía no está habilitada.'
              )}
            </p>
          )}
        </form>

        <div className="pg-ejemplos">
          <label htmlFor="pg-ejemplo">{soloEjemplos ? 'Elegí un ejemplo ya analizado:' : 'O probá con un ejemplo ya analizado:'}</label>
          <select
            id="pg-ejemplo"
            value={caso?.origen.tipo === 'ejemplo' ? caso.origen.id : ''}
            onChange={(e) => usarEjemplo(e.target.value)}
          >
            <option value="" disabled>
              Elegí un ejemplo
            </option>
            <optgroup label="Mercado">
              {EJEMPLOS.map((ej) => (
                <option key={ej.id} value={ej.id}>
                  {ej.titulo}
                </option>
              ))}
            </optgroup>
            <optgroup label={`Del dicho al dato (${ejemplosSerie.ejemplos.length} episodios)`}>
              {ejemplosSerie.ejemplos.map((ej) => (
                <option key={ej.id} value={ej.id}>
                  {ej.titulo}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {analizando && <p className="pg-estado">Partiendo el enunciado en afirmaciones. Puede tardar hasta un minuto.</p>}

        {error && (
          <div className="pg-error" role="alert">
            <p>{error.mensaje}</p>
            {sinMotor && <p>Mientras tanto podés probar con un ejemplo ya analizado.</p>}
          </div>
        )}

        {analisis && (
          <div className="pg-caso" ref={anclaRef} key={caso.n}>
            {caso.origen.episodio && (
              <p className="pg-episodio">
                Episodio {caso.origen.episodio.n} de «Del dicho al dato». Sello de la serie:{' '}
                <strong>{caso.origen.episodio.sello}</strong>.{' '}
                <Link to={caso.origen.episodio.ruta}>Ver el episodio</Link>
              </p>
            )}
            {analisis.avisos.map((a) => (
              <p key={a} className="pg-nota">
                {a}
              </p>
            ))}

            {analisis.preguntas.length > 0 && (
              <PanelPlegable paso={1} titulo="Antes de medir: ¿qué quiso decir?" abierto>
                <p className="pg-panel-intro">
                  El enunciado admite más de una lectura. Elegí cuál se evalúa: el resultado puede cambiar según la
                  respuesta.
                </p>
                {analisis.preguntas.map((q) => (
                  <fieldset key={q.id} className="pg-pregunta">
                    <legend>
                      {q.pregunta} <span className="pg-aplica">Vale para {q.aplica_a.join(', ')}</span>
                    </legend>
                    {q.opciones.map((o) => (
                      <label key={o.valor} className={`pg-opcion ${respuestas[q.id] === o.valor ? 'elegida' : ''}`}>
                        <input
                          type="radio"
                          name={q.id}
                          value={o.valor}
                          checked={respuestas[q.id] === o.valor}
                          onChange={() => setRespuestas((r) => ({ ...r, [q.id]: o.valor }))}
                        />
                        <span>{o.etiqueta}</span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </PanelPlegable>
            )}

            <PanelPlegable paso={analisis.preguntas.length ? 2 : 1} titulo="La forma lógica que se evalúa">
              <ul className="pg-forma-lista">
                {enForma.map((a) => (
                  <li key={a.id}>
                    <span className="pg-id">{a.id}</span>
                    <span>
                      {a.tipo === 'dato' ? (
                        <>
                          {describirMedicion(a, ctx)} <strong>{describirValor(a)}</strong>
                        </>
                      ) : a.tipo === 'norma' ? (
                        <>
                          «{a.cita}»{' '}
                          <em>
                            (se contrasta con{' '}
                            {a.citas?.length || !a.datos?.length
                              ? 'el texto legal'
                              : a.datos.every((id) => id.startsWith('T-'))
                                ? 'los datos técnicos'
                                : 'los datos'}
                            )
                          </em>
                        </>
                      ) : a.tipo === 'opinion' ? (
                        <>
                          «{a.cita}» <em>(es una opinión, pero da por cierto {a.opinion_hecho})</em>
                        </>
                      ) : (
                        <>
                          «{a.cita}» <em>(el sitio no tiene datos para medirlo)</em>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {enForma.length > 0 && (
                <p className="pg-formula">
                  <span className="pg-rotulo">Fórmula</span>
                  <code>{formaVisible(formaTxt)}</code>
                  {enForma.length > 1 && (
                    <span className="pg-formula-ayuda">
                      {esConjuncion
                        ? 'Se lee «y»: el enunciado es verdadero solo si todas las afirmaciones lo son.'
                        : '∧ se lee «y», ∨ se lee «o», ¬ se lee «no».'}
                    </span>
                  )}
                </p>
              )}
              {opiniones.length > 0 && (
                <p className="pg-fuera">
                  No {opiniones.length === 1 ? 'entra' : 'entran'} en la cuenta por ser opinión:{' '}
                  {opiniones.map((a) => `${a.id} «${a.cita}»`).join(' · ')}
                </p>
              )}
            </PanelPlegable>

            {faltan > 0 && (
              <p className="pg-estado">
                {faltan === 1 ? 'Falta responder una pregunta' : `Faltan responder ${faltan} preguntas`} para ver el
                resultado.
              </p>
            )}

            {resultado && (
              <PanelPlegable paso={analisis.preguntas.length ? 3 : 2} titulo="Resultado" abierto>
                <div className={`pg-general pg-borde-${resultado.estado.toLowerCase()}`}>
                  <Sello estado={resultado.estado} grande />
                  <div>
                    <p className="pg-resumen">{resultado.resumen}</p>
                    {esConjuncion && REGLA_CONJUNCION[resultado.estado] && (
                      <p className="pg-regla">{REGLA_CONJUNCION[resultado.estado]}</p>
                    )}
                  </div>
                </div>
                {resultado.veredictos.map((v) => (
                  <Veredicto key={v.id} v={v} />
                ))}
              </PanelPlegable>
            )}

            <p className="pg-pie">
              {caso.origen.tipo === 'ejemplo'
                ? 'Ejemplo ya analizado: la lectura del enunciado viene guardada.'
                : caso.origen.tipo === 'guardada'
                  ? `Consulta guardada del ${fechaCorta(caso.origen.fecha)}: volver a abrirla no gasta tokens. El resultado se calculó de nuevo con los datos de hoy.`
                  : `El análisis es automático: ${AUTOR} lee el enunciado con un modelo de inteligencia artificial.`}{' '}
              Los números son datos de la Secretaría de Energía, procesados por www.explorarg.com, a{' '}
              {fmt.monthShort(ctx.ultimo)}.
              {resultado?.veredictos.some((v) => v.origen === 'norma') &&
                ' En las afirmaciones que se contrastan con un texto o con un dato, el veredicto solo se muestra si lo respalda una cita textual o un dato del sitio.'}
              {caso.origen.cuenta?.cobrado > 0 && (
                <span className="pg-cobrado">
                  {' '}
                  Esta consulta costó {enTokens(caso.origen.cuenta.cobrado)} (el estimado era {aproxTokens(caso.origen.cuenta.estimado)}).
                </span>
              )}
              {import.meta.env.DEV && caso.origen.uso && (
                <span className="pg-uso">
                  {' '}
                  Consumo del modelo (solo se ve en la copia local): {fmt.int(caso.origen.uso.entrada)} de entrada y {fmt.int(caso.origen.uso.salida)} de
                  salida (motor {caso.origen.motor}).
                </span>
              )}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
