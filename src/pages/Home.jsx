import { Link } from 'react-router-dom';
import tutoriales from '../data/tutoriales.json';
import './Home.css';

/* Video institucional © Explora (comprimido para web desde
   "Explora Reduccion HDO 3.mp4"; original en Desktop/Banco Imágenes). */
function VideoLoop() {
  return (
    <div className="portada-carrusel">
      <video
        src="/portada/explora-loop.mp4"
        poster="/portada/explora-poster.jpg"
        autoPlay
        muted
        loop
        playsInline
        aria-label="Video institucional de la planta de biodiesel de Explora"
      />
      <span className="portada-carrusel-credito">© Explora · Todos los derechos reservados</span>
    </div>
  );
}

export default function Home() {
  return (
    <div className="portada">
      <header className="portada-hero">
        <h1>ExplorArg Marketscan</h1>
        <p className="portada-bajada">Mercado Argentino de Biodiesel · Informe Mensual</p>
      </header>

      <VideoLoop />

      <section className="portada-colaboracion">
        <h2>Biodiesel en colaboración</h2>
        <p>
          ExplorArg Marketscan presenta información de la industria y el mercado argentino de
          biodiesel. Nuestros reportes y contenidos están diseñados para proveer a la comunidad
          de integrantes del sector de biocombustibles y de todos aquellos interesados en
          energías renovables, con información detallada, relevante y actualizada sobre el
          sector. ExplorArg Marketscan también es un ámbito para el debate e intercambio de
          ideas.
        </p>
      </section>

      {tutoriales.length > 0 && (
        <section className="portada-tutoriales">
          <Link to="/tutoriales" className="portada-tutoriales-link">
            <span className="portada-tutoriales-icono" aria-hidden="true">▶</span>
            <span>
              <strong>Tutoriales en video</strong>
              <span className="portada-tutoriales-sub">
                {tutoriales.length === 1 ? 'Cómo se usa la página ' + tutoriales[0].titulo : `Cómo se usa cada página · ${tutoriales.length} videos`}
              </span>
            </span>
            <span className="portada-tutoriales-flecha" aria-hidden="true">→</span>
          </Link>
        </section>
      )}

      <section className="portada-disclaimer">
        <p>
          Esta plataforma y su contenido se nutren de información y datos obtenidos de fuentes
          de acceso público irrestricto. Su objetivo principal es brindar un espacio de
          aprendizaje, cooperación y divulgación en la industria de los biocombustibles. El
          acceso a esta plataforma y el uso de la misma y de sus contenidos por parte de
          terceros queda bajo su propio riesgo y responsabilidad. La información y las
          opiniones incluidas en esta plataforma no constituyen asesoramiento ni recomendación
          de ninguna naturaleza. Consecuentemente, Explora S.A. no asume responsabilidad alguna
          por daños o perjuicios derivados del acceso a esta plataforma o del uso que terceros
          puedan dar a la información, los datos o su contenido, incluyendo, sin limitación, la
          pérdida o interrupción de datos, los daños a sistemas informáticos, o cualquier otro
          tipo de daño o perjuicio. Cualquier vínculo o referencia a otra página web o
          documento se suministra únicamente para la conveniencia de los usuarios. Esta
          plataforma puede incluir opiniones o puntos de vista, que, a menos que se indique
          expresamente lo contrario, no reflejan necesariamente la posición de Explora S.A. con
          respecto a los mismos. Explora S.A. se reserva el derecho de modificar, en cualquier
          momento y sin previo aviso, los contenidos de esta plataforma, así como los términos
          y condiciones de su uso.
        </p>
      </section>
    </div>
  );
}
