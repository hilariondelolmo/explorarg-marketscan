import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import SectionNav from '../components/SectionNav.jsx';
import { SECCIONES_REFORMA } from '../lib/reforma.js';
import { HECHOS_CHARTS } from '../components/propuesta/HechosCharts.jsx';
import DescargaDocs from '../components/propuesta/DescargaDocs.jsx';
import contenido from '../content/propuesta-optimizada.html?raw';
import './PropuestaLey.css';

/**
 * Propuesta optimizada (rev1 del 27/08 sobre la versión SE 260729 del
 * Proyecto S-0809/2026): versión breve para la discusión del dictamen.
 * Conserva solo las modificaciones que la reglamentación no podría
 * suplir; el resto se delega expresamente. Texto completo con las
 * modificaciones incorporadas en rojo subrayado y, en los artículos
 * fundamentados, las tres obleas de la propuesta completa (los popups
 * provienen del informe, con la numeración remapeada al texto base).
 *
 * El blob (src/content/propuesta-optimizada.html) se genera desde el
 * docx con scripts/generar_propuesta_optimizada.py.
 */
export default function PropuestaOptimizada() {
  const raizRef = useRef(null);
  const dialogRef = useRef(null);
  const [pop, setPop] = useState(null); // {titulo, sub, tipo, html}
  const [nodosChart, setNodosChart] = useState([]);

  // El contenido del diálogo entra por innerHTML: recién después del
  // render existen los placeholders donde van los gráficos
  useEffect(() => {
    if (!pop) {
      setNodosChart([]);
      return;
    }
    setNodosChart([
      ...(dialogRef.current?.querySelectorAll('.pl-chart[data-chart]') ?? []),
    ]);
  }, [pop]);

  const abrirPop = (art, tipo) => {
    const fuente = raizRef.current?.querySelector(
      `.pl-pop[data-art="${art}"][data-tipo="${tipo}"]`
    );
    if (!fuente) return;
    setPop({
      titulo: fuente.dataset.titulo,
      sub: fuente.dataset.sub,
      tipo,
      html: fuente.innerHTML,
    });
    requestAnimationFrame(() => dialogRef.current?.showModal());
  };

  const cerrar = () => {
    dialogRef.current?.close();
    setPop(null);
  };

  const alClickear = (e) => {
    const oblea = e.target.closest('.pl-oblea');
    if (oblea) abrirPop(oblea.dataset.art, oblea.dataset.tipo);
  };

  const stickyRef = useRef(null);

  // El encabezado fijo tapa el inicio del artículo si se usa scrollIntoView:
  // se compensa nav + bloque fijo a mano (patrón de PropuestaLey)
  const irAlArticulo = (nro) => {
    const destino = document.getElementById(`art-${nro}`);
    if (!destino) return;
    const nav = document.querySelector('.top-nav');
    const subnav = document.querySelector('.section-nav');
    const sticky = stickyRef.current;
    let tope = (nav?.offsetHeight || 56) + (subnav?.offsetHeight || 0) + 16;
    if (sticky && getComputedStyle(sticky).position === 'sticky') {
      tope += sticky.offsetHeight;
    }
    window.scrollTo({
      top: Math.max(window.scrollY + destino.getBoundingClientRect().top - tope, 0),
      behavior: 'smooth',
    });
  };

  // Las filas del cuadro de correspondencia viven dentro del popup: al
  // clickearlas se cierra el diálogo y salta al artículo (numeración ya
  // remapeada por el generador)
  const alClickearDialogo = (e) => {
    const fila = e.target.closest('.pl-cuadro-fila');
    if (fila) {
      cerrar();
      irAlArticulo(fila.dataset.art);
    }
  };

  return (
    <div className="propuesta-ley">
      <SectionNav sections={SECCIONES_REFORMA} />
      <div className="pl-sticky" ref={stickyRef}>
        <div className="marco pl-encabezado">
          <DescargaDocs
            doc="ambos-optimizada"
            rotuloPropuesta="Propuesta de ley optimizada"
            nombreDefecto="Documentos Propuesta optimizada S-0809-2026.zip"
            rotuloCuadro="Cuadro de correspondencia"
          />
          <div className="kicker">Análisis · Proyecto de Ley S-0809/2026</div>
          <h1>Propuesta optimizada</h1>
          <p className="bajada">
            Versión breve de la propuesta, pensada para la discusión del
            dictamen: conserva únicamente las modificaciones que la
            reglamentación no puede suplir y delega expresamente lo
            operativo. Texto completo del proyecto oficial con los cambios
            incorporados:{' '}
            <ins className="pl-leyenda">lo subrayado en rojo es texto propuesto</ins>. En
            los artículos fundamentados, las obleas abren los fundamentos de
            la propuesta completa.
          </p>
          <div className="pl-obleas pl-obleas-intro">
            {[
              ['objeto', 'Objeto y método'],
              ['marco', 'Marco normativo de referencia'],
              ['cuadro', 'Cuadro de correspondencia'],
              ['cierre', 'Criterio para modificaciones'],
            ].map(([clave, rotulo]) => (
              <button
                key={clave}
                type="button"
                className="pl-oblea pl-oblea-intro"
                onClick={() => abrirPop('intro', clave)}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="marco pl-marco">
        <div
          className="pl-cuerpo"
          ref={raizRef}
          onClick={alClickear}
          dangerouslySetInnerHTML={{ __html: contenido }}
        />
      </div>

      <dialog
        ref={dialogRef}
        className={`pl-dialog pl-dialog-${
          pop?.tipo === 'normas' ? 'normas' : pop?.tipo === 'hechos' ? 'hechos' : 'just'
        }${['hechos', 'cuadro'].includes(pop?.tipo) ? ' pl-dialog-ancho' : ''}`}
        onClick={(e) => {
          if (e.target === dialogRef.current) {
            cerrar();
            return;
          }
          alClickearDialogo(e);
        }}
        onClose={() => {
          if (!dialogRef.current?.open) setPop(null);
        }}
      >
        {pop && (
          <div className="pl-dialog-marco">
            <header>
              <div>
                <div className="pl-dialog-sub">{pop.sub}</div>
                <h2>{pop.titulo}</h2>
              </div>
              <button type="button" className="pl-dialog-cerrar" onClick={cerrar} aria-label="Cerrar">
                ×
              </button>
            </header>
            <div
              className="pl-dialog-texto"
              dangerouslySetInnerHTML={{ __html: pop.html }}
            />
          </div>
        )}
        {nodosChart.map((nodo) => {
          const Chart = HECHOS_CHARTS[nodo.dataset.chart];
          return Chart ? createPortal(<Chart />, nodo, nodo.dataset.chart) : null;
        })}
      </dialog>
    </div>
  );
}
