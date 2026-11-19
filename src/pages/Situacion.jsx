import { Link, Navigate, useParams } from 'react-router-dom';
import SectionNav from '../components/SectionNav.jsx';
import { SECCIONES_REFORMA } from '../lib/reforma.js';
import { EDICIONES, EDICION_VIGENTE, RUTA_SITUACION, edicion, rutaEdicion } from '../lib/situacion.js';
import Edicion20261119 from '../components/situacion/Edicion20261119.jsx';
import './ReformaLey.css';
import './Situacion.css';

/**
 * "Situación al <fecha>": pestaña propia de la sección Reforma, después de "Del dicho al dato"
 * (HDO, 19/11/2026). Una foto fechada de dónde está la ley: los artículos del día y los videos,
 * con piezas para tocar. /situacion abre la edición vigente (la primera de EDICIONES);
 * /situacion/<fecha> abre una anterior.
 */
const COMPONENTES = {
  '2026-11-19': Edicion20261119,
};

export default function Situacion() {
  const { fecha } = useParams();
  const ed = fecha ? edicion(fecha) : EDICION_VIGENTE;
  if (!ed || (fecha && ed === EDICION_VIGENTE)) return <Navigate to={RUTA_SITUACION} replace />;
  const Edicion = COMPONENTES[ed.fecha];
  const selector = EDICIONES.length > 1 && (
    <nav className="sit-ediciones" aria-label="Ediciones">
      <span>Ediciones:</span>
      {EDICIONES.map((e) => (
        <Link key={e.fecha} to={rutaEdicion(e)} className={e === ed ? 'activa' : ''} aria-current={e === ed ? 'page' : undefined}>
          {e.corta}
        </Link>
      ))}
    </nav>
  );
  return (
    <>
      <SectionNav sections={SECCIONES_REFORMA} />
      <Edicion edicion={ed} selector={selector} />
    </>
  );
}
