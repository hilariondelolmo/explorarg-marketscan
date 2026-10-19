import SectionNav from '../components/SectionNav.jsx';
import { SECCIONES_REFORMA } from '../lib/reforma.js';
import './ReformaLey.css';
import './LeyBiocombustiblesVara.css';
import './CeprebRepartir.css';

/**
 * "CEPREB quiere repartir": pestaña propia de la sección Reforma, al lado de
 * Cámara de Diputados (HDO, 19/10/2026). Aloja el video "Reforma Ley
 * Biocombustibles: ¿Nuevamente repartir o finalmente competir?" (YouTube,
 * canal Explora Biodiesel, no listado, 12:47) y el documento completo en PDF
 * (`public/docs/repartir-o-competir.pdf`, 21 páginas, 18/10/2026: la
 * respuesta punto por punto al Documento CEPREB). Título, bajada y firma
 * son los del documento. Reusa el marco del video de LeyBiocombustiblesVara.css.
 */
const VIDEO = { youtube: 'aMF44zXO_nU', duracion: '13 minutos' };
const DOC = { href: '/docs/repartir-o-competir.pdf', paginas: 21, fecha: '18 de octubre de 2026' };

const TITULO = 'Ley de biocombustibles: ¿Nuevamente repartir o finalmente competir?';
const BAJADA =
  'Catorce cierres que no están en ningún artículo. Respuesta, punto por punto y con los datos de la Secretaría de Energía, al Documento CEPREB “Las consecuencias de la ley: el cierre de las pymes regionales del biodiésel”.';

export default function CeprebRepartir() {
  return (
    <>
      <SectionNav sections={SECCIONES_REFORMA} />
      <div className="articulo-reforma lbv cpr">
        <div className="marco lbv-marco">
          <div className="kicker">CEPREB quiere repartir · Reforma Ley 27.640</div>
          <h1>{TITULO}</h1>
          <p className="bajada">{BAJADA}</p>
          <div className="firma lbv-firma">por Hilarión Del Olmo - Presidente - Explora S.A. · explorarg.com / CAPBA</div>

          <figure className="lbv-video">
            <div className="lbv-video-marco">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${VIDEO.youtube}?rel=0&hl=es&cc_lang_pref=es`}
                title="Reforma Ley Biocombustibles: ¿Nuevamente repartir o finalmente competir? (video)"
                allow="encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
            <figcaption>El video · {VIDEO.duracion} · voz en off y láminas</figcaption>
          </figure>

          <section className="cpr-doc" aria-label="El documento completo">
            <div className="cpr-doc-texto">
              <div className="cpr-doc-kicker">El documento completo</div>
              <div className="cpr-doc-titulo">{TITULO}</div>
              <div className="cpr-doc-meta">
                PDF · {DOC.paginas} páginas · {DOC.fecha} · la respuesta en extenso, con los catorce cierres uno por uno
              </div>
            </div>
            <a className="cpr-doc-boton" href={DOC.href} target="_blank" rel="noopener noreferrer">
              Descargar PDF
            </a>
          </section>
        </div>
      </div>
    </>
  );
}
