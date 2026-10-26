import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import DATOS from '../../data/diputados_videos.json';
import './VideoCapitulo.css';

/**
 * Los ocho capítulos del artículo "Biodiésel en la Argentina: qué se discute y qué
 * se juega en Diputados" tienen su video en YouTube (canal Explora Biodiesel,
 * lista PLeGmxZ8X_cyE, subidos el 19/10/2026). Acá viven las tres piezas que
 * los integran a la página sin cambiarle la cara (pedido de HDO, 19/10/2026):
 *
 * - MiniaturaVideo: la miniatura chica con el botón de play y la duración,
 *   para la fila del índice; al tocarla se abre el video en un pop-up.
 * - VideoCapitulo: la tarjeta al lado del título del capítulo, con la
 *   miniatura y el botón "Ver acá" (pop-up).
 * - NotaSerieVideo: la línea de la portada que avisa que hay videos.
 *
 * El pop-up usa el mismo marco que "Leer el texto" (clases .esq-popup de
 * QueSeJuegaDiputados.css) y embebe el reproductor de youtube-nocookie.
 * No hay links que saquen al lector de la página: HDO pidió que todo se vea
 * acá (19/10/2026). Datos (id, duración, título) en
 * src/data/diputados_videos.json.
 */

const { videos } = DATOS;

export const videoDe = (capId) => videos[capId] || null;
const urlMiniatura = (v) => `https://i.ytimg.com/vi/${v.youtube}/mqdefault.jpg`;

/* Botón con la miniatura del video, el play y la duración */
function Miniatura({ video, alt, className = '', onClick }) {
  return (
    <button type="button" className={`dip-video-mini ${className}`} onClick={onClick} aria-label={`Ver el video: ${alt}`}>
      <img src={urlMiniatura(video)} alt="" loading="lazy" />
      <span className="dip-video-play" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
      </span>
      <span className="dip-video-dur">{video.duracion}</span>
    </button>
  );
}

/* Fila del índice: la miniatura a la derecha, antes de la flecha */
export function MiniaturaVideo({ capId, numero, titulo }) {
  const video = videoDe(capId);
  const [abierto, setAbierto] = useState(false);
  if (!video) return null;
  return (
    <>
      <Miniatura
        video={video}
        alt={titulo}
        className="dip-toc-video"
        onClick={(e) => {
          e.stopPropagation();
          setAbierto(true);
        }}
      />
      {abierto && <VideoPopup video={video} numero={numero} titulo={titulo} onClose={() => setAbierto(false)} />}
    </>
  );
}

/* Cabecera del capítulo: tarjeta al lado del título */
export function VideoCapitulo({ capId, numero, titulo }) {
  const video = videoDe(capId);
  const [abierto, setAbierto] = useState(false);
  if (!video) return null;
  return (
    <aside className="dip-video-card" aria-label="Este capítulo en video">
      <Miniatura video={video} alt={titulo} onClick={() => setAbierto(true)} />
      <div className="dip-video-card-texto">
        <span className="dip-video-kicker">Este capítulo en video</span>
        <span className="dip-video-meta">{video.duracion} · voz en off y láminas</span>
        <span className="dip-video-acciones">
          <button type="button" className="dip-video-ver" onClick={() => setAbierto(true)}>
            Ver acá
          </button>
        </span>
      </div>
      {abierto && <VideoPopup video={video} numero={numero} titulo={titulo} onClose={() => setAbierto(false)} />}
    </aside>
  );
}

/* Portada: los ocho capítulos también en video */
export function NotaSerieVideo() {
  return (
    <p className="dip-video-nota">
      Cada capítulo tiene también su video: tocá la miniatura para verlo acá.
    </p>
  );
}

/* Pop-up con el reproductor: cruz, Escape o tocar afuera lo cierran */
function VideoPopup({ video, numero, titulo, onClose }) {
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', tecla);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = previo;
    };
  }, [onClose]);
  const src = `https://www.youtube-nocookie.com/embed/${video.youtube}?autoplay=1&rel=0&modestbranding=1&hl=es&cc_lang_pref=es`;
  return createPortal(
    <div className="esq-popup" role="dialog" aria-modal="true" aria-label={`Video: ${titulo}`}>
      <div className="esq-popup-fondo" onClick={onClose} />
      <div className="esq-popup-panel dip-video-panel">
        <div className="esq-popup-cabecera">
          <span className="esq-popup-kicker">
            En video{numero ? ` · Capítulo ${numero} de 8` : ''} · {video.duracion}
          </span>
          <button type="button" className="esq-popup-cerrar" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <h3 className="esq-popup-titulo">{titulo}</h3>
        <div className="dip-video-marco">
          <iframe
            src={src}
            title={`${titulo} (video)`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
