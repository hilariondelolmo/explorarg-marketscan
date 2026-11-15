import { Suspense, lazy, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import SectionNav from '../components/SectionNav.jsx';
import { SECCIONES_REFORMA } from '../lib/reforma.js';
import { CONTROLES, EPISODIOS, NOTAS, ORADORES, PEDIDO, RELACIONADOS, RUTA, SERIE, TOTAL, episodio, miniatura } from '../lib/dichoDato.js';
import ControlTope from '../components/dichodato/ControlTope.jsx';
import './DichoDato.css';

// El control por empresa carga empresas.json (la serie mensual de las 52) y el de precios, los
// datos del relevamiento de gas oil: van aparte, y solo se piden al abrir un episodio que los usa
const ControlEmpresa = lazy(() => import('../components/dichodato/ControlEmpresa.jsx'));
const ControlPrecios = lazy(() => import('../components/dichodato/ControlPrecios.jsx'));
const ControlSurtidor = lazy(() => import('../components/dichodato/ControlSurtidor.jsx'));
const ControlIntegradas = lazy(() => import('../components/dichodato/ControlIntegradas.jsx'));

/**
 * "Del dicho al dato" (pestaña de Reforma Ley 27.640; pedido de HDO del
 * 15/11/2026): el área del sitio de la serie de 29 videos cortos del mismo
 * nombre. Cada video cierra con "Las cuentas completas, en explorarg.com":
 * acá están.
 *
 * - /del-dicho-al-dato: el índice de los 29, agrupados por orador, con
 *   filtros por orador y por veredicto.
 * - /del-dicho-al-dato/N: el episodio. Siempre los mismos bloques y en el
 *   mismo orden: el dicho (la cita y el video), el dato (el sello, el resumen
 *   y, donde corresponde, el pedido a Diputados), el video pantalla por
 *   pantalla (cada pantalla con su fuente), "para profundizar" (un control
 *   con los datos del sitio, solo en los episodios que lo tienen) y las fuentes.
 *
 * El texto no se escribe acá: sale de los episodios de los videos por
 * scripts/dicho_dato_json.py (src/data/dicho_dato.json). Los controles son
 * pocos tipos que se repiten (lib/dichoDato.js, CONTROLES).
 */
export default function DichoDato() {
  const { n } = useParams();
  const ep = n ? episodio(n) : null;
  if (n && !ep) return <Navigate to={RUTA} replace />;

  return (
    <>
      <SectionNav sections={SECCIONES_REFORMA} />
      <div className="articulo-reforma dd">
        <div className="ar-sticky">
          <div className="marco ar-encabezado">
            <div className="ar-encabezado-fila dd-encabezado">
              <div className="kicker">
                {ep ? `Del dicho al dato · ${ep.n} de ${TOTAL} · ${ORADORES[ep.orador].nombre}` : 'Serie de videos · Reforma Ley 27.640'}
              </div>
              <h1>{ep ? `«${ep.cita}»` : SERIE.titulo}</h1>
              <div className="firma">por Hilarión Del Olmo - Presidente - Explora S.A.</div>
            </div>
          </div>
        </div>
        <div className="ar-contenido">
          <div className="marco">{ep ? <Episodio key={ep.n} ep={ep} /> : <Indice />}</div>
        </div>
      </div>
    </>
  );
}

/* ── El índice de los 29 ── */

const VEREDICTOS = ['Falso', 'Doble vara', 'Arbitrariedad regulatoria', 'Otros veredictos'];
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function Filtro({ rotulo, opciones, valor, onChange }) {
  return (
    <div className="dd-filtro" role="group" aria-label={rotulo}>
      <span className="dd-filtro-rotulo">{rotulo}</span>
      <div className="dd-seg">
        {opciones.map((o) => (
          <button key={o.id} type="button" className={valor === o.id ? 'activo' : ''} aria-pressed={valor === o.id} onClick={() => onChange(o.id)}>
            {o.label} <span className="dd-seg-n">{o.n}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Indice() {
  const [orador, setOrador] = useState('todos');
  const [veredicto, setVeredicto] = useState('todos');
  const pasa = (e, o = orador, v = veredicto) => (o === 'todos' || e.orador === o) && (v === 'todos' || e.veredicto === v);
  const cuenta = (o, v) => EPISODIOS.filter((e) => pasa(e, o, v)).length;
  const grupos = Object.keys(ORADORES)
    .map((o) => ({ o, eps: EPISODIOS.filter((e) => e.orador === o && pasa(e)) }))
    .filter((g) => g.eps.length);

  return (
    <>
      <p className="dd-bajada">{SERIE.texto}</p>
      <p className="dd-bajada">{SERIE.cuenta} Tocá un episodio para ver el video y el detalle con sus fuentes. {Object.keys(CONTROLES).length} episodios suman una herramienta interactiva para profundizar el análisis.</p>

      <div className="dd-filtros">
        <Filtro
          rotulo="Quién lo dijo" valor={orador} onChange={setOrador}
          opciones={[
            { id: 'todos', label: 'Todos', n: cuenta('todos', veredicto) },
            ...Object.entries(ORADORES).map(([id, o]) => ({ id, label: o.nombre, n: cuenta(id, veredicto) })),
          ]}
        />
        <Filtro
          rotulo="Veredicto" valor={veredicto} onChange={setVeredicto}
          opciones={[
            { id: 'todos', label: 'Todos', n: cuenta(orador, 'todos') },
            ...VEREDICTOS.map((v) => ({ id: v, label: v, n: cuenta(orador, v) })),
          ]}
        />
      </div>

      {grupos.length === 0 && <p className="dd-vacio">Ningún episodio con esos dos filtros a la vez.</p>}

      {grupos.map(({ o, eps }) => (
        <section className="dd-grupo" key={o} aria-labelledby={`dd-grupo-${o}`}>
          <h2 id={`dd-grupo-${o}`}>
            {ORADORES[o].quien} <span>· {eps.length} {eps.length === 1 ? 'episodio' : 'episodios'}</span>
          </h2>
          <p className="dd-grupo-de">{ORADORES[o].de}</p>
          <div className="dd-tarjetas">
            {eps.map((e) => (
              <Link key={e.n} to={`${RUTA}/${e.n}`} className="dd-tarjeta">
                <span className="dd-tarjeta-img">
                  <img src={miniatura(e.n, true)} alt="" loading="lazy" width="90" height="160" />
                  <span className="dd-play" aria-hidden="true" />
                </span>
                <span className="dd-tarjeta-texto">
                  <span className="dd-tarjeta-n">
                    Episodio {e.n}{e.duracion ? ` · ${e.duracion}` : ''}
                  </span>
                  <span className="dd-tarjeta-cita">«{e.cita}»</span>
                  <span className="dd-tarjeta-tema">{mayuscula(e.tema)}</span>
                  <span className="dd-tarjeta-pie">
                    <span className="dd-sello">{e.sello_corto}</span>
                    {/* La marca nombra lo que solo estos episodios tienen (la herramienta),
                        no los datos: todos los episodios están hechos con datos. */}
                    {CONTROLES[e.n] && (
                      <span className="dd-marca">
                        <svg viewBox="0 0 12 12" aria-hidden="true">
                          <path d="M1 3.5h10M1 8.5h10" />
                          <circle cx="4" cy="3.5" r="1.6" />
                          <circle cx="8" cy="8.5" r="1.6" />
                        </svg>
                        Interactivo para profundizar
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/* ── Un episodio ── */

function Pasos({ ep, pie = false }) {
  const anterior = episodio(ep.n - 1);
  const siguiente = episodio(ep.n + 1);
  return (
    <nav className={`dd-pasos ${pie ? 'dd-pasos-pie' : ''}`} aria-label="Episodios">
      <Link to={RUTA} className="dd-paso">← Los {TOTAL} episodios</Link>
      <span className="dd-pasos-lado">
        {anterior && (
          <Link to={`${RUTA}/${anterior.n}`} className="dd-paso" title={`«${anterior.cita}»`}>
            ‹ {pie ? `${anterior.n} · «${anterior.cita}»` : 'Anterior'}
          </Link>
        )}
        {siguiente && (
          <Link to={`${RUTA}/${siguiente.n}`} className="dd-paso" title={`«${siguiente.cita}»`}>
            {pie ? `${siguiente.n} · «${siguiente.cita}»` : 'Siguiente'} ›
          </Link>
        )}
      </span>
    </nav>
  );
}

/* El corto, vertical: primero la miniatura; el reproductor de YouTube se carga recién al tocarla */
function Video({ ep }) {
  const [activo, setActivo] = useState(false);
  return (
    <aside className="dd-video" aria-label="El video">
      <div className="dd-video-marco">
        {activo ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${ep.youtube}?autoplay=1&rel=0&playsinline=1&modestbranding=1&hl=es`}
            title={`Del dicho al dato ${ep.n}: «${ep.cita}» (video)`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button type="button" className="dd-video-poster" onClick={() => setActivo(true)} aria-label={`Ver el video del episodio ${ep.n}`}>
            <img src={miniatura(ep.n)} alt="" width="270" height="480" />
            <span className="dd-play dd-play-grande" aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="dd-video-pie">
        Video {ep.n} de {TOTAL}{ep.duracion ? ` · ${ep.duracion}` : ''}
      </p>
    </aside>
  );
}

function Episodio({ ep }) {
  const control = CONTROLES[ep.n];
  const enlaces = RELACIONADOS[ep.n] || [];
  const nota = NOTAS[ep.n];
  return (
    <>
      <Pasos ep={ep} />

      <div className="dd-arriba">
        <div className="dd-arriba-texto">
          <section aria-labelledby="dd-dicho">
            <h2 className="dd-rotulo" id="dd-dicho">El dicho</h2>
            <blockquote className="dd-cita">{ep.dicho}</blockquote>
            <p className="dd-quien">{ep.quien}</p>
            {/* El clip que entra en el medio del video (episodio 7): otra frase del mismo orador */}
            {ep.dicho_despues.map((d) => (
              <blockquote className="dd-cita dd-cita-despues" key={d}>{d}</blockquote>
            ))}
          </section>
          <section aria-labelledby="dd-dato">
            <h2 className="dd-rotulo" id="dd-dato">
              El dato <span className="dd-sello">{ep.sello}</span>
            </h2>
            <p className="dd-resumen">{ep.resumen}</p>
            {ep.pedido && (
              <div className="dd-pedido">
                <span className="dd-pedido-rotulo">El pedido a Diputados</span>
                <p>{PEDIDO.texto}</p>
              </div>
            )}
          </section>
        </div>
        <Video ep={ep} />
      </div>

      <section className="dd-seccion" aria-labelledby="dd-pantallas">
        <h2 id="dd-pantallas">El video, pantalla por pantalla</h2>
        <p className="dd-seccion-sub">Lo mismo que se ve en el video, con la fuente de cada cifra al pie.</p>
        <div className="dd-pantallas">
          {ep.pantallas.map((p) => (
            <article className="dd-pantalla" key={p.id}>
              {/* La pantalla anterior del video, cuando es solo la pregunta que esta responde */}
              {p.pregunta && <p className="dd-pregunta">{p.pregunta}</p>}
              <div className="ddv" dangerouslySetInnerHTML={{ __html: p.html }} />
              {p.fuente && <p className="dd-fuente">{p.fuente}</p>}
            </article>
          ))}
        </div>
      </section>

      {nota && (
        <section className="dd-seccion dd-nota" aria-labelledby="dd-nota">
          <h2 id="dd-nota">{nota.titulo}</h2>
          <p className="dd-nota-p">{nota.entrada}</p>
          {nota.bloques.map((b) => (
            <div className="dd-nota-bloque" key={b.titulo}>
              <h3>{b.titulo}</h3>
              {b.entrada && <p className="dd-nota-p">{b.entrada}</p>}
              {b.items && (
                <ul>
                  {b.items.map(([fuerte, resto]) => (
                    <li key={fuerte}><strong>{fuerte}</strong> {resto}</li>
                  ))}
                </ul>
              )}
              {b.preguntas && (
                <ol>
                  {b.preguntas.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ol>
              )}
              {b.cierre && <p className="dd-nota-p">{b.cierre}</p>}
            </div>
          ))}
        </section>
      )}

      {(control || enlaces.length > 0) && (
        <section className="dd-seccion dd-profundizar" aria-labelledby="dd-profundizar">
          <h2 id="dd-profundizar">Para profundizar</h2>
          {control && <p className="dd-seccion-sub">{control.lectura}</p>}
          {control?.tipo === 'tope' && <ControlTope />}
          {control && control.tipo !== 'tope' && (
            <Suspense fallback={<p className="dd-vacio">Cargando los datos…</p>}>
              {control.tipo === 'empresa' && <ControlEmpresa />}
              {control.tipo === 'precios' && <ControlPrecios />}
              {control.tipo === 'surtidor' && <ControlSurtidor inicial={control.inicial} />}
              {control.tipo === 'integradas' && <ControlIntegradas inicial={control.inicial} />}
            </Suspense>
          )}
          {enlaces.length > 0 && (
            <p className="dd-enlaces">
              <span>Los datos, en los tableros del sitio:</span>
              {enlaces.map((e) => (
                <Link key={e.to} to={e.to} className="dd-paso">{e.label} →</Link>
              ))}
            </p>
          )}
        </section>
      )}

      <section className="dd-seccion" aria-labelledby="dd-fuentes">
        <h2 id="dd-fuentes">Fuentes</h2>
        <ul className="dd-fuentes">
          {ep.fuentes.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </section>

      <Pasos ep={ep} pie />
    </>
  );
}
