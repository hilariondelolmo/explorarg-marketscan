import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import SectionNav from '../components/SectionNav.jsx';
import { SECCIONES_REFORMA } from '../lib/reforma.js';
import { HECHOS_CHARTS } from '../components/propuesta/HechosCharts.jsx';
import DescargaDocs from '../components/propuesta/DescargaDocs.jsx';
import contenido from '../content/propuesta-s80926pl.html?raw';
import './PropuestaLey.css';

/**
 * Propuesta de Ley S80926PL (rev. cc HDO del 11/08 sobre la versión
 * SE 260729 del Proyecto S-0809/2026): texto completo con las
 * modificaciones incorporadas en rojo subrayado. En los 21 artículos
 * fundamentados por el informe (rev3 del 17/08), tres obleas abren un
 * popup: "Normas que viola el proyecto oficial", "Justificación de la
 * modificación" y "Respaldo en datos" (evidencia fáctica con gráficos).
 *
 * El blob (src/content/propuesta-s80926pl.html) se genera desde los docx
 * con generar_propuesta_html.py; los popups viajan ocultos dentro del
 * blob y el diálogo los muestra por data-art/data-tipo. Los gráficos de
 * evidencia se montan por portal sobre los placeholders .pl-chart del
 * popup abierto (el HTML estático no puede traer componentes).
 */
// Conmutador de la sección FUNDAMENTOS: colorea las 9 citas encapsuladas
// y define qué lado de la confrontación abre el click en cada una
const FUND_ESTADOS = ['inicial', 'articulado', 'cambios', 'fundprop'];
const FUND_ROTULOS = {
  inicial: 'Estado inicial',
  articulado: 'Proyecto Bullrich / SE',
  cambios: 'Propuesta de cambios',
  fundprop: 'Fundamentos propuesta de cambios',
};
const FUND_LEYENDAS = {
  inicial: 'Oprimir para confrontar estos fundamentos con el articulado',
  articulado: 'Cada frase resaltada abre su inconsistencia con el articulado oficial',
  cambios: 'Cada frase resaltada muestra cómo queda con las modificaciones',
  fundprop: 'Fundamentos redactados para la propuesta de cambios · oprimir para volver',
};

export default function PropuestaLey({ printMode = false }) {
  const raizRef = useRef(null);
  const dialogRef = useRef(null);
  const avisoRef = useRef(null);
  const navigate = useNavigate();

  // Aviso al entrar (decisión HDO 2026-08-28): en la instancia actual de
  // discusión del dictamen la recomendación es la Propuesta optimizada.
  // Se muestra una vez por sesión de navegación; la elección se respeta.
  useEffect(() => {
    if (printMode) return;
    if (sessionStorage.getItem('pl-aviso-optimizada')) return;
    avisoRef.current?.showModal();
  }, [printMode]);

  const elegirAviso = (irAOptimizada) => {
    try {
      sessionStorage.setItem('pl-aviso-optimizada', '1');
    } catch { /* navegación privada: se mostrará de nuevo */ }
    avisoRef.current?.close();
    if (irAOptimizada) navigate('/propuesta-optimizada');
  };

  const [pop, setPop] = useState(null); // {titulo, sub, tipo, html}
  const [nodosChart, setNodosChart] = useState([]);
  const [fundEstado, setFundEstado] = useState('inicial');

  // El conmutador vive dentro del blob estático: rótulo y estado se
  // actualizan a mano (React no reconcilia el innerHTML inyectado)
  useEffect(() => {
    const toggle = raizRef.current?.querySelector('.pl-fund-toggle');
    if (toggle) {
      toggle.dataset.estado = fundEstado;
      toggle.textContent = FUND_ROTULOS[fundEstado];
    }
    const leyenda = raizRef.current?.querySelector('.pl-fund-leyenda');
    if (leyenda) leyenda.textContent = FUND_LEYENDAS[fundEstado];
  }, [fundEstado]);

  // El contenido del diálogo entra por innerHTML: recién después del
  // render existen los placeholders donde van los gráficos
  useEffect(() => {
    if (printMode) return;
    if (!pop) {
      setNodosChart([]);
      return;
    }
    setNodosChart([
      ...(dialogRef.current?.querySelectorAll('.pl-chart[data-chart]') ?? []),
    ]);
  }, [pop, printMode]);

  // Para papel, cada popup se materializa inmediatamente debajo del
  // artículo que lo invoca. Se reutiliza exactamente la estructura visual
  // del diálogo web (encabezado, color semántico, KPIs, tablas y gráficos).
  useEffect(() => {
    if (!printMode) return undefined;
    const raiz = raizRef.current;
    if (!raiz) return undefined;

    const fuentes = [...raiz.querySelectorAll('.pl-popups > .pl-pop')];
    const insertados = [];

    const crearPanel = (fuente) => {
      const tipo = fuente.dataset.tipo;
      const tono = ['normas', 'articulado'].includes(tipo)
        ? 'normas'
        : ['hechos', 'cambios'].includes(tipo)
          ? 'hechos'
          : tipo === 'confronta'
            ? 'confronta'
            : 'just';
      const panel = document.createElement('div');
      panel.className = `pl-dialog pl-dialog-${tono} pl-print-panel`;
      panel.dataset.tipo = tipo;

      const marco = document.createElement('div');
      marco.className = 'pl-dialog-marco';
      const encabezado = document.createElement('header');
      const titulos = document.createElement('div');
      const subtitulo = document.createElement('div');
      subtitulo.className = 'pl-dialog-sub';
      subtitulo.textContent = fuente.dataset.sub || '';
      const titulo = document.createElement('h2');
      titulo.textContent = fuente.dataset.titulo || '';
      titulos.append(subtitulo, titulo);
      encabezado.append(titulos);

      const texto = document.createElement('div');
      texto.className = 'pl-dialog-texto';
      [...fuente.childNodes].forEach((nodo) => texto.append(nodo.cloneNode(true)));
      marco.append(encabezado, texto);
      panel.append(marco);
      return panel;
    };

    const intro = document.createElement('section');
    intro.className = 'pl-print-intro';
    fuentes
      .filter((fuente) => fuente.dataset.art === 'intro')
      .forEach((fuente) => intro.append(crearPanel(fuente)));
    const ley = raiz.querySelector('.pl-ley');
    if (ley && intro.childElementCount) {
      ley.before(intro);
      insertados.push(intro);
    }

    raiz.querySelectorAll('section.pl-art-informe[id^="art-"]').forEach((articulo) => {
      const numero = articulo.id.replace('art-', '');
      const paneles = document.createElement('div');
      paneles.className = 'pl-print-paneles';
      ['normas', 'just', 'hechos'].forEach((tipo) => {
        const fuente = fuentes.find(
          (item) => item.dataset.art === numero && item.dataset.tipo === tipo
        );
        if (fuente) paneles.append(crearPanel(fuente));
      });
      if (paneles.childElementCount) {
        articulo.append(paneles);
        insertados.push(paneles);
      }
    });

    const confronta = fuentes.find(
      (fuente) => fuente.dataset.art === 'intro' && fuente.dataset.tipo === 'confronta'
    );
    // La confrontación ya se incluye dentro de la apertura. Los popups
    // conf-* repiten sus dos columnas y por eso no se duplican en papel.
    if (confronta) confronta.dataset.printIncluido = 'true';

    setNodosChart([
      ...raiz.querySelectorAll('.pl-print-panel .pl-chart[data-chart]'),
    ]);

    return () => {
      setNodosChart([]);
      insertados.forEach((nodo) => nodo.remove());
    };
  }, [printMode]);

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

  const stickyRef = useRef(null);

  // El encabezado fijo tapa el inicio del artículo si se usa scrollIntoView:
  // se compensa nav + bloque fijo a mano (patrón de ReformaLey)
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

  const alClickear = (e) => {
    const toggle = e.target.closest('.pl-fund-toggle');
    if (toggle) {
      setFundEstado((v) => FUND_ESTADOS[(FUND_ESTADOS.indexOf(v) + 1) % FUND_ESTADOS.length]);
      return;
    }
    const cita = e.target.closest('.pl-fund-cita');
    if (cita) {
      if (fundEstado !== 'inicial') abrirPop(`conf-${cita.dataset.conf}`, fundEstado);
      return;
    }
    const oblea = e.target.closest('.pl-oblea');
    if (oblea) {
      abrirPop(oblea.dataset.art, oblea.dataset.tipo);
      return;
    }
    const fila = e.target.closest('.pl-cuadro-fila');
    if (fila) irAlArticulo(fila.dataset.art);
  };

  // El cuadro de correspondencia y los chips de las confrontaciones viven
  // dentro del popup: al clickearlos se cierra el diálogo y salta al artículo
  const alClickearDialogo = (e) => {
    const destino = e.target.closest('.pl-cuadro-fila, .pl-salto');
    if (destino) {
      cerrar();
      irAlArticulo(destino.dataset.art);
    }
  };

  return (
    <div className="propuesta-ley">
      <SectionNav sections={SECCIONES_REFORMA} />
      <div className="pl-sticky" ref={stickyRef}>
        <div className="marco pl-encabezado">
          <DescargaDocs />
          <div className="kicker">Análisis · Proyecto de Ley S-0809/2026</div>
          <h1>La propuesta, artículo por artículo</h1>
          <p className="bajada">
            Texto completo del proyecto de ley de biocombustibles con las
            modificaciones propuestas incorporadas:{' '}
            <ins className="pl-leyenda">lo subrayado en rojo es texto propuesto</ins>. En
            cada artículo modificado, tres obleas abren los fundamentos: qué normas
            compromete el texto oficial, qué corrige la modificación y su
            respaldo en los datos del mercado.
          </p>
          <div className="pl-obleas pl-obleas-intro">
            {[
              ['objeto', 'Objeto y método'],
              ['marco', 'Marco normativo de referencia'],
              ['cuadro', 'Cuadro de correspondencia'],
              ['cierre', 'Criterio para modificaciones'],
              ['confronta', 'Fundamentos vs. proyecto'],
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
          data-fund={fundEstado}
          ref={raizRef}
          onClick={alClickear}
          dangerouslySetInnerHTML={{ __html: contenido }}
        />
      </div>

      {!printMode && <dialog
        ref={dialogRef}
        className={`pl-dialog pl-dialog-${
          ['normas', 'articulado'].includes(pop?.tipo) ? 'normas'
            : ['hechos', 'cambios'].includes(pop?.tipo) ? 'hechos'
              : pop?.tipo === 'confronta' ? 'confronta'
                : 'just'
        }${['cuadro', 'hechos', 'confronta'].includes(pop?.tipo) ? ' pl-dialog-ancho' : ''}`}
        onClick={(e) => {
          if (e.target === dialogRef.current) {
            cerrar();
            return;
          }
          alClickearDialogo(e);
        }}
        onClose={() => {
          // El evento close es asíncrono: si ya se abrió otro popup (cerrar
          // y abrir en el mismo tick), no hay que pisarlo
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
      </dialog>}
      {printMode && nodosChart.map((nodo) => {
        const Chart = HECHOS_CHARTS[nodo.dataset.chart];
        return Chart ? createPortal(<Chart />, nodo, nodo.dataset.chart) : null;
      })}

      {!printMode && (
        <dialog
          ref={avisoRef}
          className="pl-dialog pl-aviso"
          onClick={(e) => {
            if (e.target === avisoRef.current) elegirAviso(false);
          }}
          onClose={() => {
            try {
              sessionStorage.setItem('pl-aviso-optimizada', '1');
            } catch { /* sin storage */ }
          }}
        >
          <div className="pl-dialog-marco">
            <header>
              <div>
                <div className="pl-dialog-sub">Recomendación</div>
                <h2>Hay una versión para esta etapa</h2>
              </div>
              <button
                type="button"
                className="pl-dialog-cerrar"
                onClick={() => elegirAviso(false)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </header>
            <div className="pl-dialog-texto">
              <p>
                En la instancia actual de discusión del dictamen, la
                recomendación es ceñirse a la <strong>Propuesta optimizada</strong>,
                diagramada a tales efectos: conserva solo las modificaciones que
                la reglamentación no puede suplir.
              </p>
              <div className="pl-aviso-acciones">
                <button
                  type="button"
                  className="pl-desc-boton"
                  onClick={() => elegirAviso(true)}
                >
                  Ir a la Propuesta optimizada (recomendado)
                </button>
                <button
                  type="button"
                  className="pl-aviso-secundario"
                  onClick={() => elegirAviso(false)}
                >
                  Quedarme en esta versión
                </button>
              </div>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
