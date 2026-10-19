import SectionNav from '../components/SectionNav.jsx';
import { SECCIONES_REFORMA } from '../lib/reforma.js';
import './ReformaLey.css';
import './LeyBiocombustiblesVara.css';

/**
 * "Ley de biocombustibles - El proyecto medido contra su propia vara": segunda
 * página de la pestaña Cámara de Diputados (HDO, 19/10/2026). El texto es la
 * introducción del video, literal de HDO, y debajo va el video embebido desde
 * YouTube (canal Explora Biodiesel, no listado; 31 láminas, 33:39). Sin links
 * que saquen al lector de la página. Misma cara que el resto de la sección
 * (clases .articulo-reforma de ReformaLey.css).
 */
const VIDEO = { youtube: 'gF50_qpcWfE', duracion: '34 minutos' };

const TITULO = 'Ley de biocombustibles - El proyecto medido contra su propia vara';

const PARRAFOS = [
  'El 17 de septiembre de 2026 el Senado le dio media sanción a una nueva ley de biocombustibles: 44 artículos y quince años de vigencia. Ahora la tiene Diputados, y todavía se puede corregir. Una ley así merece algo más que estar a favor o en contra. Merece un examen. Este video la somete a dos.',
  'La primera manera mira para atrás. Desde 2010 cada litro de gas oil lleva por ley una parte de biodiésel. Pasaron dos leyes y cuatro gobiernos, y el corte obligatorio se cumplió en tres de dieciséis años. Por qué falló lo escribió Explora en noviembre de 2024, en once motivos, cuando este proyecto no existía. Eso es lo que los vuelve una vara: no se hicieron para esta ley. Al final del video, motivo por motivo, qué resuelve el proyecto, qué deja igual y qué empeora. El balance: no resuelve ninguno y empeora siete.',
  'La segunda manera no mira para atrás: mira el texto de frente. No le pregunta si nos gusta. Le pregunta si cumple lo que él mismo declara. El artículo 2° del proyecto declara de interés público las actividades que regula “en tanto contribuyan a la seguridad energética y a la transición hacia energías más limpias”. Esa es la vara, y la eligió la propia ley. Con ella, las cuatro preguntas que la Constitución le toma a cualquier ley: si trata igual a los que están en la misma posición, si los medios sirven a los fines que declara, si había caminos menos dañinos, y si el daño que causa guarda proporción con el beneficio que promete. Cuatro preguntas, ninguna superada.',
  'Las dos maneras se contestan con lo mismo: lo que dice el texto, lo que se dijo en el recinto y lo que muestran los datos de la Secretaría de Energía, procesados en explorarg.com. Nada más. El video cierra con lo que la Cámara de Diputados todavía puede corregir: nueve cambios para que una ley así no elija ganadores, y el resultado lo decida la competencia y no el diseño.',
  'Basado en «Observaciones al proyecto de ley S-0809/2026. Análisis de razonabilidad, proporcionalidad e igualdad», de Hilarión Del Olmo, Presidente de Explora S.A., y la Dra. Agustina Mendiburu Eliçabe, CAPBA. Duración: 34 minutos.',
];

export default function LeyBiocombustiblesVara() {
  return (
    <>
      <SectionNav sections={SECCIONES_REFORMA} />
      <div className="articulo-reforma lbv">
        <div className="marco lbv-marco">
          <div className="kicker">Cámara de Diputados · Reforma Ley 27.640</div>
          <h1>{TITULO}</h1>
          <div className="firma lbv-firma">
            por Hilarión Del Olmo - Presidente - Explora S.A. · Dra. Agustina Mendiburu Eliçabe - CAPBA
          </div>

          <div className="apertura lbv-texto">
            {PARRAFOS.map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>

          <figure className="lbv-video">
            <div className="lbv-video-marco">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${VIDEO.youtube}?rel=0&hl=es&cc_lang_pref=es`}
                title={`${TITULO} (video)`}
                allow="encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
            <figcaption>El video completo · {VIDEO.duracion} · voz en off y láminas</figcaption>
          </figure>
        </div>
      </div>
    </>
  );
}
