import { Link } from 'react-router-dom';
import SectionNav from '../components/SectionNav.jsx';
import { SECCIONES_REFORMA } from '../lib/reforma.js';
import datos from '../content/cinco-minutos.json';
import './PropuestaLey.css';
import './CincoMinutos.css';

/**
 * "Lo que no entra en 5 minutos": sección dentro de Reforma Ley 27.640.
 * Toma afirmaciones formuladas en el debate legislativo sobre biocombustibles
 * y las contrasta con los datos. Cada entrega es un video con su transcripción;
 * el contenido vive en src/content/cinco-minutos.json y el video en
 * public/video/cinco-minutos/ (copia web del original, scripts/generar_video_mapa.py).
 */
export default function CincoMinutos() {
  const entregas = datos.entregas;

  return (
    <div className="propuesta-ley cinco-minutos">
      <SectionNav sections={SECCIONES_REFORMA} />
      <div className="marco pl-encabezado">
        <div className="kicker">Nueva sección · Reforma Ley 27.640</div>
        <h1>Lo que no entra en 5 minutos</h1>
        <p className="bajada">
          Cuando el Congreso debate una ley, convoca a especialistas y cámaras del sector. Cada
          expositor dispone de cinco minutos: alcanzan para una conclusión, no para las evidencias
          que la sostienen. En ese vacío, el prestigio de quien habla suele ocupar el lugar de la
          evidencia. Esta sección toma afirmaciones formuladas en el debate legislativo sobre
          biocombustibles, y en particular sobre el biodiesel, y las contrasta con los datos. No
          pregunta quién tiene autoridad para hablar, sino qué afirmaciones resisten la evidencia.
        </p>
        <div className="cm-byline">por Hilarion Del Olmo / Presidente / Explora S.A.</div>
      </div>

      <div className="marco pl-marco">
        {entregas.map((e) => (
          <article className="cm-entrega" key={e.id} id={e.id}>
            <div className="cm-entrega-kicker">
              {e.numero === 1 ? 'Primera entrega' : `Entrega ${e.numero}`} ·{' '}
              {new Date(`${e.fecha}T12:00:00`).toLocaleDateString('es-AR')}
            </div>
            <h2>{e.titulo}</h2>
            <p className="cm-bajada">{e.bajada}</p>

            <div className="cm-video">
              <video controls preload="metadata" poster={e.poster} playsInline>
                <source src={e.video} type="video/mp4" />
                Tu navegador no reproduce video. Descargalo desde{' '}
                <a href={e.video}>este enlace</a>.
              </video>
            </div>
            <div className="cm-meta">
              Video · {e.duracion} · Datos de la Secretaría de Energía de la Nación
            </div>

            <details className="cm-transcripcion">
              <summary>Transcripción</summary>
              <ol>
                {e.transcripcion.map((b) => (
                  <li key={b.t}>
                    <span className="cm-t">{b.t}</span>
                    <span className="cm-cuadro">{b.cuadro}</span>
                    <p>{b.texto}</p>
                  </li>
                ))}
              </ol>
            </details>

            <div className="cm-pie">
              <section>
                <h3>Fuentes y supuestos</h3>
                <ul>
                  {e.fuentes.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h3>Para seguir</h3>
                <ul>
                  {e.relacionados.map((r) => (
                    <li key={r.to}>
                      <Link to={r.to}>{r.label}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
