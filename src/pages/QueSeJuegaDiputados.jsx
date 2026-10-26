import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SectionNav from '../components/SectionNav.jsx';
import { SECCIONES_REFORMA } from '../lib/reforma.js';
import { APERTURA, BAJADA, CIERRE, FECHA, armarCapitulos } from '../components/diputados/capitulos.jsx';
import { MiniaturaVideo, VideoCapitulo, NotaSerieVideo, videoDe } from '../components/diputados/VideoCapitulo.jsx';
import './ReformaLey.css';
import './QueSeJuegaDiputados.css';

/**
 * "Biodiésel en la Argentina: qué se discute y qué se juega en Diputados"
 * (Hilarión Del Olmo, 13/10/2026): apertura de la pestaña Cámara de
 * Diputados de la sección Reforma Ley 27.640.
 *
 * Misma forma de presentación que "Una desregulación contra el interés
 * público y el mercado libre": una portada con el índice en bloques y, al
 * tocar uno, su capítulo solo (ni otro tema por arriba ni por abajo), con
 * el botón para volver y el paso al capítulo siguiente. El capítulo abierto
 * va en el hash de la URL (#mercado, #falla-1...), así se puede enlazar
 * directo y el botón "atrás" del navegador vuelve a la portada.
 *
 * El texto, los cuadros y los dos gráficos viven en
 * components/diputados/capitulos.jsx; el look es el del artículo de Reforma
 * (clase .articulo-reforma, ReformaLey.css) más lo propio de esta página.
 *
 * Con `esquemas` (la página del menú de Diputados, /que-se-juega-en-diputados)
 * el artículo se lee por los cuadros, flujos y gráficos de
 * components/diputados/esquemas.jsx y esquemasDatos.jsx, con el texto de cada
 * uno en un pop-up. Sin `esquemas` es la versión de texto original, que queda
 * como respaldo en /que-se-juega-en-diputados-texto, fuera del menú (HDO eligió
 * la de esquemas el 19/10/2026).
 */
export default function QueSeJuegaDiputados({ esquemas = false }) {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const capitulos = useMemo(() => armarCapitulos(esquemas), [esquemas]);
  const porId = useMemo(() => Object.fromEntries(capitulos.map((c) => [c.id, c])), [capitulos]);
  const actual = porId[hash.slice(1)] || null;

  // Cada cambio de capítulo (o la vuelta a la portada) arranca arriba
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [hash]);

  const ir = (id) => navigate(id ? `${pathname}#${id}` : pathname);

  return (
    <>
      <SectionNav sections={SECCIONES_REFORMA} />
      <div className="articulo-reforma art-dip">
        <div className="ar-sticky">
          <div className="marco ar-encabezado">
            {/* Con esquemas el encabezado fijo lleva solo kicker y título: el
                párrafo de apertura y la firma van debajo, en la portada (HDO, 19/10) */}
            <div className={`ar-encabezado-fila ${esquemas ? 'dip-sin-linea' : ''}`}>
              <div>
                <div className="kicker">Cámara de Diputados · Reforma Ley 27.640{!esquemas && ' · versión de texto (respaldo)'}</div>
                <h1>Biodiésel en la Argentina: qué se discute y qué se juega en Diputados</h1>
                {/* La firma va debajo del título general, a la derecha, y queda fija al scrollear
                    también en la portada (HDO, 19/10/2026); en la portada lleva la fecha */}
                {esquemas && (
                  <div className="firma dip-firma-encabezado">
                    por Hilarión Del Olmo - Presidente - Explora S.A.{!actual && ` · ${FECHA}`}
                  </div>
                )}
                {!esquemas && <p className="bajada">{BAJADA}</p>}
                {!esquemas && <div className="firma">Hilarión Del Olmo - Presidente, Explora S.A. · {FECHA}</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="ar-contenido">
          <div className="marco">
            {actual ? (
              <Capitulo cap={actual} capitulos={capitulos} ir={ir} />
            ) : (
              <Portada capitulos={capitulos} esquemas={esquemas} ir={ir} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Portada({ capitulos, esquemas, ir }) {
  const porId = Object.fromEntries(capitulos.map((c) => [c.id, c]));
  const Tarjeta = ({ id }) => <TarjetaIndice c={porId[id]} ir={ir} />;
  return (
    <>
      <div className="apertura apertura-inicial">
        <p>{APERTURA}</p>
      </div>
      <div className="ayuda">
        {esquemas
          ? 'Tocá un capítulo para abrirlo. Cada capítulo se lee solo, y desde su final se pasa al siguiente.'
          : 'El esquema es el índice: tocá un bloque para ir a su capítulo. Cada capítulo se lee solo, y desde su final se pasa al siguiente.'}
      </div>

      {esquemas && <NotaSerieVideo />}

      {esquemas ? <IndiceLista capitulos={capitulos} ir={ir} /> : (
      <nav className="dip-indice" aria-label="Índice del artículo">
        <Tarjeta id="mercado" />
        <Conector />
        <Tarjeta id="historia" />
        <Conector />
        <Tarjeta id="numeros" />
        <Conector />
        <Tarjeta id="ley" />
        <Conector />
        <div className="dip-grupo-fallas">
          <div className="dip-grupo-rotulo">Tres fallas de la ley</div>
          <div className="dip-fila-3">
            <Tarjeta id="falla-1" />
            <Tarjeta id="falla-2" />
            <Tarjeta id="falla-3" />
          </div>
        </div>
        <Conector />
        <Tarjeta id="corregir" />
      </nav>
      )}

      <div className="dip-cierre">
        <div className="kicker">Cierre</div>
        {CIERRE.map((p) => (
          <p key={p.slice(0, 24)}>{p}</p>
        ))}
      </div>

      <button type="button" className="ar-notas-link" onClick={() => ir('fuentes')}>
        Fuentes y notas sobre las cifras →
      </button>
    </>
  );
}

/**
 * Índice de la versión con esquemas (prueba para HDO, 19/10/2026): una tabla
 * de contenidos numerada, una fila por capítulo con su color, el título y la
 * frase del artículo; las tres fallas agrupadas bajo su rótulo. Los números
 * siguen a los del "Capítulo N de 8" de cada capítulo.
 */
function IndiceLista({ capitulos, ir }) {
  const contenido = capitulos.filter((c) => !c.notas);
  const capitulosNum = contenido.filter((c) => !c.anexo); // los anexos van como A1, A2...
  const fila = (c) => (
    <li key={c.id} className={`dip-toc-fila ${videoDe(c.id) ? 'con-video' : ''}`}>
      <button
        type="button"
        className="dip-toc-item"
        style={{ '--acc': c.pal.acc, '--acc-borde': c.pal.borde, '--acc-bg': c.pal.bg }}
        onClick={() => ir(c.id)}
      >
        <span className="dip-toc-n">{c.anexo ? `A${c.anexo}` : capitulosNum.indexOf(c) + 1}</span>
        <span className="dip-toc-cuerpo">
          <span className="dip-toc-titulo">{c.titulo.replace(/^\d+\.\s/, '')}</span>
          <span className="dip-toc-frase">{c.frase}</span>
        </span>
        <span className="dip-toc-flecha" aria-hidden="true">→</span>
      </button>
      <MiniaturaVideo capId={c.id} numero={c.anexo ? null : capitulosNum.indexOf(c) + 1} titulo={c.titulo.replace(/^\d+\.\s/, '')} />
    </li>
  );
  const sueltos = (ids) => contenido.filter((c) => ids.includes(c.id)).map(fila);
  const fallas = contenido.filter((c) => c.grupo && !c.anexo);
  const anexos = contenido.filter((c) => c.anexo);
  return (
    <nav className="dip-toc" aria-label="Índice del artículo">
      <ol>
        {sueltos(['mercado', 'historia', 'numeros', 'ley'])}
        <li className="dip-toc-grupo">
          <span className="dip-toc-grupo-rotulo">{fallas[0]?.grupo}</span>
          <ol>{fallas.map(fila)}</ol>
        </li>
        {sueltos(['corregir'])}
        {anexos.length > 0 && (
          <li className="dip-toc-grupo dip-toc-anexos">
            <span className="dip-toc-grupo-rotulo">Anexos</span>
            <ol>{anexos.map(fila)}</ol>
          </li>
        )}
      </ol>
    </nav>
  );
}

function TarjetaIndice({ c, ir }) {
  return (
    <button
      type="button"
      className="dip-tarjeta"
      style={{ '--acc': c.pal.acc, '--acc-borde': c.pal.borde, '--acc-bg': c.pal.bg }}
      onClick={() => ir(c.id)}
    >
      <span className="dip-tarjeta-titulo">{c.titulo}</span>
      <span className="dip-tarjeta-frase">{c.frase}</span>
      {c.detalle && <span className="dip-tarjeta-detalle">{c.detalle}</span>}
    </button>
  );
}

function Conector() {
  return <div className="dip-conector" aria-hidden="true" />;
}

function Capitulo({ cap, capitulos, ir }) {
  const i = capitulos.findIndex((c) => c.id === cap.id);
  const sig = i >= 0 && i < capitulos.length - 1 ? capitulos[i + 1] : null;
  const contenido = capitulos.filter((c) => !c.notas && !c.anexo);
  const pos = contenido.findIndex((c) => c.id === cap.id);

  return (
    <>
      <div className="dip-capitulo-nav">
        <button type="button" className="ar-restaurar" onClick={() => ir(null)}>
          ← Volver al inicio
        </button>
        {cap.anexo ? (
          <span className="dip-capitulo-pos">Anexo {cap.anexo}</span>
        ) : pos >= 0 && (
          <span className="dip-capitulo-pos">
            Capítulo {pos + 1} de {contenido.length}
          </span>
        )}
      </div>

      <section
        id={`g-${cap.id}`}
        className="grupo dip-grupo"
        style={{ '--acc': cap.pal.acc, '--acc-bg': cap.pal.bg }}
      >
        {cap.grupo && <div className="kicker">{cap.grupo}</div>}
        <div className="dip-cap-cabecera">
          <h2>{cap.titulo}</h2>
          <VideoCapitulo capId={cap.id} numero={!cap.anexo && pos >= 0 ? pos + 1 : null} titulo={cap.titulo.replace(/^\d+\.\s/, '')} />
        </div>
        {/* Línea debajo del título (el anexo de González: "Lic. Daniel González (ex CEO de YPF)", HDO 19/10/2026) */}
        {cap.subtitulo && <div className="dip-subtitulo">{cap.subtitulo}</div>}
        {cap.cuerpo}
      </section>

      <div className="dip-pie-capitulo">
        <button type="button" className="ar-restaurar" onClick={() => ir(null)}>
          Volver al inicio
        </button>
        {sig && (
          <button type="button" className="dip-siguiente" onClick={() => ir(sig.id)}>
            Siguiente: {sig.titulo} →
          </button>
        )}
      </div>
    </>
  );
}
