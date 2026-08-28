import { useEffect, useRef } from 'react';
import SectionNav from '../components/SectionNav.jsx';
import { SECCIONES_REFORMA } from '../lib/reforma.js';
import contenido from '../content/reforma-ley-27640.html?raw';
import './ReformaLey.css';

/**
 * Artículo "Una desregulación contra el interés público y el mercado libre"
 * (Reforma de la Ley 27.640), integrado como página del sitio con su look
 * & feel (tokens, tipografía, tema claro/oscuro).
 *
 * El cuerpo es el HTML interactivo autocontenido escrito por HDO
 * (src/content/reforma-ley-27640.html); el encabezado vive acá para poder
 * fijarlo al scrollear (hasta la línea horizontal de la firma, patrón de
 * bloque fijo del sitio; en celular scrollea normal, como el resto).
 *
 * El esquema-índice funciona como filtro: cada bloque muestra ÚNICAMENTE
 * su capítulo (los demás se ocultan) y un botón restaura el artículo
 * completo. Pedido HDO: al navegar no debe verse otro tema por debajo
 * ni por encima del elegido.
 */
export default function ReformaLey({ printMode = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const raiz = ref.current;
    if (!raiz) return undefined;

    // La edición impresa no reconstruye el artículo: muestra el mismo
    // contenido del sitio con todos sus paneles abiertos. El filtrado por
    // capítulos y los controles de navegación pertenecen sólo a la web.
    if (printMode) {
      raiz.querySelectorAll('details').forEach((detalle) => {
        detalle.open = true;
      });
      return undefined;
    }
    const destinos = { art2: 'g-art2', b1: 'g-b1', b2: 'g-b2', b3: 'g-b3', conc: 'g-conc', b4: 'g-b4', ref: 'g-ref' };

    // El esquema principal llega a los bordes del contenedor; en celular
    // la envoltura permite paneo horizontal sin achicar el texto
    const svgPrincipal = raiz.querySelector('.marco > svg');
    const envoltura = document.createElement('div');
    envoltura.className = 'ar-esquema-scroll';
    if (svgPrincipal) {
      svgPrincipal.before(envoltura);
      envoltura.appendChild(svgPrincipal);
    }

    // Botón para volver de un capítulo a la portada
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ar-restaurar';
    btn.textContent = 'Volver al inicio';
    btn.style.display = 'none';
    envoltura.after(btn);

    // Acceso a las notas y fuentes (no tienen bloque en el esquema):
    // link discreto al final de la portada, debajo del esquema
    const linkNotas = document.createElement('button');
    linkNotas.type = 'button';
    linkNotas.className = 'ar-notas-link';
    linkNotas.textContent = 'Notas, fuentes y documentos →';
    btn.after(linkNotas);

    // La página funciona como portada: termina después del párrafo de
    // síntesis. Los capítulos existen solo a través del esquema.
    const portada = () => {
      raiz.querySelectorAll('.grupo').forEach((g) => {
        g.style.display = 'none';
      });
      raiz.querySelectorAll('.apertura').forEach((a) => {
        a.style.display = '';
      });
      btn.style.display = 'none';
      linkNotas.style.display = '';
    };

    // Altura ocupada arriba: nav + sub-nav de sección + encabezado fijo
    const topeSuperior = () => {
      const nav = document.querySelector('.top-nav');
      const subnav = document.querySelector('.section-nav');
      const sticky = document.querySelector('.ar-sticky');
      let tope = (nav?.offsetHeight || 56) + (subnav?.offsetHeight || 0) + 16;
      if (sticky && getComputedStyle(sticky).position === 'sticky') {
        tope += sticky.offsetHeight;
      }
      return tope;
    };

    // Un capítulo a la vista, solo: portada oculta, botón para volver
    const mostrarCapitulo = (id) => {
      const s = raiz.querySelector(`#${id}`);
      if (!s) return;
      raiz.querySelectorAll('.grupo').forEach((g) => {
        g.style.display = g === s ? '' : 'none';
      });
      raiz.querySelectorAll('.apertura').forEach((a) => {
        a.style.display = 'none';
      });
      linkNotas.style.display = 'none';
      btn.style.display = '';
      // Salto directo con doble pasada: el layout recién filtrado puede
      // reacomodarse (sticky que se pega, márgenes colapsados), así que
      // se corrige contra la posición real después del primer scroll
      requestAnimationFrame(() => {
        window.scrollTo(0, Math.max(window.scrollY + s.getBoundingClientRect().top - topeSuperior(), 0));
        requestAnimationFrame(() => {
          const delta = s.getBoundingClientRect().top - topeSuperior();
          if (Math.abs(delta) > 2) window.scrollBy(0, delta);
        });
      });
      s.classList.remove('resaltado');
      void s.offsetWidth;
      s.classList.add('resaltado');
    };

    const volver = () => {
      portada();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    btn.addEventListener('click', volver);
    const irNotas = () => mostrarCapitulo('g-notas');
    linkNotas.addEventListener('click', irNotas);

    const limpiar = [];
    raiz.querySelectorAll('.blk').forEach((b) => {
      const ir = () => mostrarCapitulo(destinos[b.dataset.k]);
      const tecla = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          ir();
        }
      };
      b.addEventListener('click', ir);
      b.addEventListener('keydown', tecla);
      limpiar.push(() => {
        b.removeEventListener('click', ir);
        b.removeEventListener('keydown', tecla);
      });
    });

    portada();

    return () => {
      limpiar.forEach((f) => f());
      btn.removeEventListener('click', volver);
      linkNotas.removeEventListener('click', irNotas);
      btn.remove();
      linkNotas.remove();
      if (svgPrincipal) envoltura.before(svgPrincipal);
      envoltura.remove();
    };
  }, [printMode]);

  return (
    <>
      {/* Fuera de .articulo-reforma: su reset global (* margin/padding 0)
          pisa el centrado de la sub-barra */}
      <SectionNav sections={SECCIONES_REFORMA} />
      <div className="articulo-reforma">
      <div className="ar-sticky">
        <div className="marco ar-encabezado">
          <div className="ar-encabezado-fila">
            <div>
              <div className="kicker">Análisis · Reforma de la Ley 27.640</div>
              <h1>Una desregulación contra el interés público y el mercado libre</h1>
              <p className="bajada">
                Eliminar categorías por calendario, ignorar la reducción certificada de
                emisiones, reconocer sustitutos sin medirlos y dejar el abastecimiento
                sujeto a acuerdos sin adjudicación no libera el mercado: condiciona el
                resultado antes de competir.
              </p>
              <div className="firma">Hilarión Del Olmo - Presidente, Explora S.A.</div>
            </div>
            <a
              className="ar-descargar"
              href="/docs/reforma-ley-27640.pdf"
              download="Una desregulación contra el interés público y el mercado libre.pdf"
            >
              Descargar PDF
            </a>
          </div>
        </div>
      </div>
      <div
        className="ar-contenido"
        ref={ref}
        dangerouslySetInnerHTML={{ __html: contenido }}
      />
      </div>
    </>
  );
}
