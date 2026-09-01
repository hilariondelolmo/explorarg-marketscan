import { useRef, useState } from 'react';

/**
 * Descarga de los documentos de la Propuesta con registro de email.
 * Gate real: el archivo solo se entrega vía POST /api/descarga, que valida
 * y registra la dirección antes de responder. La descarga entrega SIEMPRE
 * los dos documentos juntos (un ZIP con el Word de la propuesta y el PDF
 * de fundamentos - decisión HDO 2026-08-17).
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function DescargaDocs({
  doc = 'ambos',
  rotuloPropuesta = 'Propuesta de ley con las modificaciones',
  nombreDefecto = 'Documentos Propuesta S-0809-2026.zip',
  rotuloCuadro = null,
} = {}) {
  const dialogRef = useRef(null);
  const [email, setEmail] = useState('');
  const [estado, setEstado] = useState(null); // null | 'bajando' | 'ok' | mensaje de error
  const emailValido = EMAIL_RE.test(email.trim());

  const abrir = () => dialogRef.current?.showModal();
  const cerrar = () => dialogRef.current?.close();

  const descargar = async () => {
    setEstado('bajando');
    try {
      const r = await fetch('/api/descarga', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), doc }),
      });
      if (!r.ok) {
        const cuerpo = await r.json().catch(() => ({}));
        throw new Error(cuerpo.error || `Error ${r.status}`);
      }
      const blob = await r.blob();
      const nombre = /filename="([^"]+)"/.exec(
        r.headers.get('Content-Disposition') || ''
      )?.[1] || nombreDefecto;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
      setEstado('ok');
    } catch (err) {
      setEstado(err.message || 'No se pudo descargar');
    }
  };

  return (
    <>
      <button type="button" className="pl-oblea pl-oblea-descarga" onClick={abrir}>
        Descargar los documentos
      </button>

      <dialog
        ref={dialogRef}
        className="pl-dialog pl-dialog-just"
        onClick={(e) => {
          if (e.target === dialogRef.current) cerrar();
        }}
      >
        <div className="pl-dialog-marco">
          <header>
            <div>
              <div className="pl-dialog-sub">Documentos de la propuesta</div>
              <h2>Descargar</h2>
            </div>
            <button type="button" className="pl-dialog-cerrar" onClick={cerrar} aria-label="Cerrar">
              ×
            </button>
          </header>
          <div className="pl-dialog-texto">
            <p className="pl-desc-ayuda">
              El paquete incluye los {rotuloCuadro ? 'tres' : 'dos'} documentos:
            </p>
            <ul className="pl-desc-lista">
              <li>
                <strong>{rotuloPropuesta}</strong>
                <span>Word · texto completo con control de cambios</span>
              </li>
              <li>
                <strong>Fundamentos jurídicos y respaldo en datos</strong>
                <span>PDF · informe completo, artículo por artículo</span>
              </li>
              {rotuloCuadro && (
                <li>
                  <strong>{rotuloCuadro}</strong>
                  <span>PDF · qué se cambia y para qué, con la síntesis de la evidencia</span>
                </li>
              )}
            </ul>
            <p className="pl-desc-ayuda">
              Ingresá tu dirección de email para descargarlos.
            </p>
            <div className="pl-desc-form">
              <input
                type="email"
                className="pl-desc-email"
                placeholder="tu@email.com"
                value={email}
                autoComplete="email"
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (estado && estado !== 'bajando') setEstado(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && emailValido && estado !== 'bajando') descargar();
                }}
              />
              <button
                type="button"
                className="pl-desc-boton"
                disabled={!emailValido || estado === 'bajando'}
                onClick={descargar}
              >
                {estado === 'bajando' ? 'Descargando…' : estado === 'ok' ? 'Descargado ✓' : 'Descargar'}
              </button>
            </div>
            {estado && estado !== 'bajando' && estado !== 'ok' && (
              <p className="pl-desc-error">{estado}</p>
            )}
            <p className="pl-desc-nota">
              Usamos tu email únicamente para saber quién consulta estos documentos.
            </p>
          </div>
        </div>
      </dialog>
    </>
  );
}
