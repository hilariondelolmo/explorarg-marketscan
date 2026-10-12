import { Link } from 'react-router-dom';
import mercadoData from '../data/mercado.json';
import articles from '../data/articles.json';
import { fmt } from '../lib/format.js';
import './Page.css';
import './AcercaDe.css';

// Página /acerca-de: quién publica ExplorArg Marketscan, por qué se rehízo el
// sitio y qué objetivos persigue cada sección. Reemplaza la solapa "Acerca de"
// del sitio anterior (Wix), con la misma foto.

export default function AcercaDe() {
  return (
    <section className="page-section acerca" id="acerca-de">
      <div className="container">
        <p className="section-kicker">Acerca de</p>
        <h2>ExplorArg Marketscan</h2>
        <p className="section-intro acerca-intro">
          Los reportes de Explora S.A. sobre la industria y el mercado argentino de biodiesel,
          publicados en una plataforma propia: tableros interactivos, datos oficiales
          actualizados mes a mes y la misma calidad de análisis de siempre.
        </p>

        <div className="acerca-grid">
          <aside className="acerca-foto">
            <img
              src="/acerca/hilarion-del-olmo.jpg"
              alt="Hilarión Del Olmo, presidente de Explora S.A., en su escritorio"
              width="960"
              height="1297"
            />
            <p className="acerca-firma">
              <strong>Hilarión Del Olmo</strong>
              <span>Presidente · Explora S.A.</span>
            </p>
            <dl className="acerca-datos">
              <div>
                <dt>Fuente de los datos</dt>
                <dd>Reportes mensuales de la Secretaría de Energía</dd>
              </div>
              <div>
                <dt>Último mes con datos</dt>
                <dd>{fmt.monthShort(mercadoData.ultimo_mes)}</dd>
              </div>
              <div>
                <dt>Artículos publicados</dt>
                <dd>{articles.length}, desde 2023</dd>
              </div>
            </dl>
          </aside>

          <div className="acerca-texto">
            <p>
              ExplorArg Marketscan surge como consecuencia de la decisión de publicar un
              conjunto de reportes elaborados en Explora S.A. sobre la industria y el mercado
              argentino de biodiesel. Explorarg.com es el punto de encuentro con la comunidad de
              los integrantes que conforman el sector de los biocombustibles en general y del
              biodiesel en particular, y de todos aquellos que se interesen por las energías
              renovables. Es también el sitio donde mensualmente se actualizan las distintas
              secciones del informe y un ámbito para el debate e intercambio de ideas.
            </p>
            <p>
              En 2026 el sitio se rehízo de punta a punta. Lo que antes era un informe publicado
              por secciones es hoy una plataforma propia: los tableros son interactivos, los
              datos se actualizan mes a mes a partir de los reportes de la Secretaría de Energía
              y cada página carga en segundos. Cambió la herramienta, no el criterio: los mismos
              datos oficiales, las fórmulas a la vista y el mismo rigor en el análisis.
            </p>

            <h3>Qué hay en el sitio</h3>
            <ul className="acerca-secciones">
              <li>
                <strong>Dashboards.</strong> <Link to="/mercado">Biodiesel</Link> (principales
                indicadores, detalle de ventas y cumplimiento del corte),{' '}
                <Link to="/gas-oil">Gas oil</Link> (mercado, precios e importaciones) y{' '}
                <Link to="/margenes">Márgenes</Link> (biodiésel y gas oil).
              </li>
              <li>
                <strong><Link to="/marco-legal">Marco legal</Link>.</strong> La legislación de
                biocombustibles hito por hito, enlazada a los documentos oficiales.
              </li>
              <li>
                <strong><Link to="/articulos">Artículos</Link>.</strong> Editoriales y análisis
                publicados en explorarg.com, con el texto original completo.
              </li>
              <li>
                <strong><Link to="/reforma-ley-27640">Reforma Ley 27.640</Link>.</strong> La
                propuesta de Explora (S-0809/2026), el dictamen, la media sanción y el mapa del
                Senado, artículo por artículo.
              </li>
              <li>
                <strong><Link to="/tutoriales">Tutoriales</Link>.</strong> Un video por página:
                cómo se navega y qué muestra cada tablero.
              </li>
            </ul>

            <h3>Objetivos - Dashboards (biodiesel, gas oil y márgenes)</h3>
            <ol>
              <li>
                convertir a ExplorArg Marketscan en el informe de consulta y referencia para
                todos aquellos que requieran información de la industria y del mercado,
              </li>
              <li>
                captar la atención de los diversos integrantes del sector al punto de lograr que
                se incorporen al proyecto, aportando sugerencias, artículos, opiniones, etc.,
              </li>
              <li>
                publicar cada actualización dentro de los 30 días de difundidos los datos de la
                Secretaría de Energía,
              </li>
              <li>
                compartir con los funcionarios de la Autoridad de Aplicación, actuales y futuros,
                el tipo de análisis que fundamenta las propuestas presentadas y que utiliza como
                fuente los datos publicados por la propia Autoridad de Aplicación.
              </li>
            </ol>

            <h3>Objetivos - Marco legal y Reforma Ley 27.640</h3>
            <ol>
              <li>
                generar un ámbito propicio para el intercambio de ideas y el debate entre los
                distintos actores de la industria,
              </li>
              <li>
                sumar consenso del sector a las distintas propuestas que se presenten ante la
                Secretaría de Energía y ante el Congreso,
              </li>
              <li>
                informar el grado de avance de cada propuesta y de cada una de las notas que se
                envían a la Secretaría de Energía, al Subsecretario de Hidrocarburos y al
                Director de Biodiesel.
              </li>
            </ol>

            <h3>Objetivos - Artículos</h3>
            <ol>
              <li>
                rebatir con argumentos técnicos (incluidas, pero no limitadas a) noticias,
                afirmaciones, informaciones, análisis, etc. falsos, incorrectos o sesgados
                relacionados con el biodiesel, la industria de biodiesel, la legislación de
                biocombustibles, la historia de los biocombustibles en Argentina, la actualidad
                del mercado y/o de sus integrantes, etc.,
              </li>
              <li>
                aportar al desarrollo de un método objetivo de evaluación aplicable a
                reglamentaciones, regulaciones, proyectos de ley y en general toda propuesta que
                incida sobre el desarrollo del sector.
              </li>
            </ol>

            <p className="acerca-cierre">
              Lograr el éxito de la gesta propuesta será posible cuanto mayor sea el compromiso y
              el aporte de quienes construimos la historia del sector y, por esto, espero la
              colaboración de quienes compartan y también de quienes no compartan esta visión.
            </p>
            <p className="acerca-firma-texto">
              Hilarión Del Olmo
              <br />
              Presidente
              <br />
              Explora S.A.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
