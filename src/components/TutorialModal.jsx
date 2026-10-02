import { useEffect, useRef, useState } from 'react';
import './DocModal.css';
import './TutorialModal.css';

// Ventana flotante con el tutorial en video de una página (YouTube) y su índice
// de capítulos al costado. El reproductor recién se carga al abrir la ventana,
// así la página no paga nada por tenerlo. El clic en un capítulo salta a ese
// minuto por la API del reproductor (postMessage con enablejsapi), sin recargar.

export const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

export default function TutorialModal({ tutorial, open, onClose, inicio = 0 }) {
  const iframeRef = useRef(null);
  const [listo, setListo] = useState(false);
  const [tiempo, setTiempo] = useState(0);

  useEffect(() => {
    if (open) document.body.classList.add('modal-open');
    else document.body.classList.remove('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // El reproductor manda su estado (tiempo actual) cuando se le pide "listening"
  useEffect(() => {
    if (!open) { setListo(false); setTiempo(0); return undefined; }
    const onMessage = (e) => {
      if (!/youtube(-nocookie)?\.com$/.test(e.origin) || typeof e.data !== 'string') return;
      let d;
      try { d = JSON.parse(e.data); } catch { return; }
      if (d.event === 'onReady') setListo(true);
      if (d.event === 'infoDelivery' && d.info && typeof d.info.currentTime === 'number') setTiempo(d.info.currentTime);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open]);

  if (!open || !tutorial) return null;

  const origen = typeof window !== 'undefined' ? window.location.origin : '';
  const src = `https://www.youtube-nocookie.com/embed/${tutorial.youtube}?enablejsapi=1&rel=0&autoplay=1&playsinline=1&start=${Math.max(0, Math.floor(inicio))}&origin=${encodeURIComponent(origen)}`;
  const mandar = (func, args = []) => iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  const escuchar = () => iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'tutorial', channel: 'widget' }), '*');
  const irA = (t) => {
    if (listo) { mandar('seekTo', [t, true]); mandar('playVideo'); setTiempo(t); return; }
    // Sin la API todavía: recargar el reproductor en ese minuto
    if (iframeRef.current) iframeRef.current.src = src.replace(/start=\d+/, `start=${Math.floor(t)}`);
  };
  const caps = tutorial.capitulos || [];
  const actual = caps.reduce((acc, c, i) => (tiempo + 0.5 >= c.t ? i : acc), 0);
  const enlace = `https://youtu.be/${tutorial.youtube}`;

  return (
    <div className="doc-modal" role="presentation">
      <div className="doc-modal-backdrop" onClick={onClose} />
      <div className="doc-modal-panel tut-modal-panel" role="dialog" aria-modal="true" aria-labelledby="tut-modal-title">
        <header className="doc-modal-header">
          <div className="doc-modal-title-block">
            <div className="doc-modal-eyebrow">Tutorial en video · {mmss(tutorial.duracion)}</div>
            <div className="doc-modal-title" id="tut-modal-title">{tutorial.titulo}</div>
            <div className="doc-modal-url">{tutorial.descripcion}</div>
          </div>
          <div className="doc-modal-actions">
            <a href={enlace} target="_blank" rel="noopener noreferrer" className="doc-modal-btn">Ver en YouTube ↗</a>
            <button className="doc-modal-close" onClick={onClose} aria-label="Cerrar">×</button>
          </div>
        </header>
        <div className="tut-modal-body">
          <div className="tut-modal-video">
            <iframe
              ref={iframeRef} src={src} title={`Tutorial: ${tutorial.titulo}`} onLoad={escuchar}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          <aside className="tut-modal-capitulos" aria-label="Capítulos">
            <div className="tut-modal-capitulos-titulo">Capítulos</div>
            <ol>
              {caps.map((c, i) => (
                <li key={c.t}>
                  <button type="button" className={i === actual ? 'activo' : ''} onClick={() => irA(c.t)}>
                    <span className="tut-cap-tiempo">{mmss(c.t)}</span>
                    <span className="tut-cap-titulo">{c.titulo}</span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </div>
    </div>
  );
}
