import { useState } from 'react';
import { Link } from 'react-router-dom';
import TutorialModal, { mmss } from '../components/TutorialModal.jsx';
import tutoriales from '../data/tutoriales.json';
import './Page.css';
import './Tutoriales.css';

// Página /tutoriales: la lista de los tutoriales en video del sitio, uno por
// página. Cada tarjeta muestra la portada del video (una imagen de YouTube, lo
// único que se descarga al abrir esta página), la duración y los capítulos; el
// reproductor recién se carga al hacer clic.

export default function Tutoriales() {
  const [abierto, setAbierto] = useState(null); // { tutorial, inicio }
  const lista = [...tutoriales].sort((a, b) => (a.grabado < b.grabado ? 1 : -1));

  return (
    <>
      <section className="page-section" id="tutoriales">
        <div className="container">
          <p className="section-kicker">Tutoriales</p>
          <h2>Cómo se usa cada página</h2>
          <p className="section-intro">
            Un video por página: cómo se navega, para qué sirve cada filtro y qué muestra cada tablero.
            Los videos están en YouTube y no se cargan hasta que los abrís; cada capítulo lleva al minuto exacto.
          </p>

          <div className="tut-lista">
            {lista.map((t) => (
              <article className="tut-tarjeta" key={t.id}>
                <button type="button" className="tut-portada" onClick={() => setAbierto({ tutorial: t, inicio: 0 })} aria-label={`Ver el tutorial ${t.titulo}`}>
                  <img
                    src={`https://i.ytimg.com/vi/${t.youtube}/maxresdefault.jpg`} alt="" loading="lazy"
                    onError={(e) => { if (!e.currentTarget.dataset.alt) { e.currentTarget.dataset.alt = '1'; e.currentTarget.src = `https://i.ytimg.com/vi/${t.youtube}/hqdefault.jpg`; } }}
                  />
                  <span className="tut-portada-play" aria-hidden="true">▶</span>
                  <span className="tut-portada-duracion">{mmss(t.duracion)}</span>
                </button>
                <div className="tut-cuerpo">
                  <h3>{t.titulo}</h3>
                  <p className="tut-descripcion">{t.descripcion}</p>
                  <div className="tut-acciones">
                    <button type="button" className="tut-boton tut-boton-primario" onClick={() => setAbierto({ tutorial: t, inicio: 0 })}>▶ Ver tutorial</button>
                    {t.pagina && <Link to={t.pagina} className="tut-boton">Abrir la página</Link>}
                    <a href={`https://youtu.be/${t.youtube}`} target="_blank" rel="noopener noreferrer" className="tut-boton">YouTube ↗</a>
                  </div>
                  <details className="tut-capitulos">
                    <summary>{t.capitulos.length} capítulos</summary>
                    <ol>
                      {t.capitulos.map((c) => (
                        <li key={c.t}>
                          <button type="button" onClick={() => setAbierto({ tutorial: t, inicio: c.t })}>
                            <span className="tut-cap-tiempo">{mmss(c.t)}</span> {c.titulo}
                          </button>
                        </li>
                      ))}
                    </ol>
                  </details>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <TutorialModal tutorial={abierto?.tutorial} inicio={abierto?.inicio || 0} open={!!abierto} onClose={() => setAbierto(null)} />
    </>
  );
}
