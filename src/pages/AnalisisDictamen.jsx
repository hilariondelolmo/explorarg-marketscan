import { useRef } from 'react';
import SectionNav from '../components/SectionNav.jsx';
import { SECCIONES_REFORMA } from '../lib/reforma.js';
import contenido from '../content/analisis-dictamen.html?raw';
import './PropuestaLey.css';
import './AnalisisDictamen.css';

/**
 * Análisis del dictamen de comisión (Minería, Energía y Combustibles +
 * Presupuesto y Hacienda, votado el 03/09/2026) contra el proyecto
 * oficial SE 260729 y la Propuesta optimizada: qué mejoró, qué se
 * adoptó, qué quedó afuera, el impacto esperado en el mercado, los
 * problemas que se vislumbran y los ajustes recomendados.
 *
 * El contenido vive en src/content/analisis-dictamen.html; los saltos
 * a artículos remiten a la Propuesta optimizada.
 */
export default function AnalisisDictamen() {
  const raizRef = useRef(null);

  return (
    <div className="propuesta-ley analisis-dictamen">
      <SectionNav sections={SECCIONES_REFORMA} />
      <div className="pl-sticky">
        <div className="marco pl-encabezado">
          <div className="kicker">Análisis · Dictamen de comisión · 03/09/2026</div>
          <h1>El dictamen, contra el espejo de la propuesta</h1>
          <p className="bajada">
            Las Comisiones de Minería, Energía y Combustibles y de Presupuesto y
            Hacienda del Senado emitieron dictamen de mayoría sobre el Proyecto
            S-809/26. A continuación el análisis, artículo por artículo, de qué
            cambió respecto del proyecto oficial, qué recogió de la{' '}
            <a href="/propuesta-optimizada">Propuesta optimizada</a>, qué quedó
            afuera, el impacto esperado en el mercado y los ajustes que la
            instancia del recinto todavía permite.
          </p>
          <div className="ad-byline">por Hilarion Del Olmo / Presidente / Explora S.A.</div>
        </div>
      </div>

      <div className="marco pl-marco">
        <div
          className="pl-cuerpo"
          ref={raizRef}
          dangerouslySetInnerHTML={{ __html: contenido }}
        />
      </div>
    </div>
  );
}
