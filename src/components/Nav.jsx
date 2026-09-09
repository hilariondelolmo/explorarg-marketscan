import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { useTheme } from '../lib/theme.jsx';
import './Nav.css';

const DASHBOARDS = [
  { to: '/mercado', label: 'Biodiesel - Principales Indicadores' },
  { to: '/mercado/matriz', label: 'Biodiesel - Detalle de ventas' },
  { to: '/gestion', label: 'Biodiesel - Cumplimiento Corte' },
  { label: 'Biodiesel - Primas y Precios Relativos', disabled: true },
];

// Rutas de la sección Reforma (el link se marca activo en ambas; la
// sub-barra de la sección vive en las páginas)
const RUTAS_REFORMA = [
  '/reforma-ley-27640',
  '/propuesta-s0809-2026',
  '/propuesta-optimizada',
  '/analisis-dictamen',
  '/mapa-recinto',
  '/mapa-firmas',
];

const MQ_ANGOSTO = '(max-width: 560px)';

export default function Nav() {
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const enDashboards = pathname.startsWith('/mercado') || pathname.startsWith('/gestion');
  const enReforma = RUTAS_REFORMA.some((r) => pathname.startsWith(r));

  // En móvil no hay hover (y iOS no enfoca botones al tocar): el desplegable
  // se abre/cierra por estado. Se cierra al navegar o al tocar afuera.
  const [abierto, setAbierto] = useState(null);
  const dropdownRef = useRef(null);

  // En pantallas angostas el menú se monta en un portal sobre <body>:
  // dentro de la barra, Safari ancla los position:fixed al backdrop-filter
  // de .top-nav (y la franja de links scrollea), y el menú queda roto.
  const [angosto, setAngosto] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MQ_ANGOSTO).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(MQ_ANGOSTO);
    const fn = (e) => setAngosto(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  useEffect(() => setAbierto(null), [pathname]);

  useEffect(() => {
    if (!abierto) return undefined;
    const cerrar = (e) => {
      if (!e.target.closest('.nav-dropdown') && !e.target.closest('.nav-dropdown-menu')) {
        setAbierto(null);
      }
    };
    document.addEventListener('pointerdown', cerrar);
    return () => document.removeEventListener('pointerdown', cerrar);
  }, [abierto]);

  const armarMenu = (items) => (
    <ul className="nav-dropdown-menu">
      {items.map((d) =>
        d.disabled ? (
          <li key={d.label}>
            <span className="nav-dropdown-item deshabilitado" aria-disabled="true">
              {d.label}
            </span>
          </li>
        ) : (
          <li key={d.label}>
            <NavLink
              to={d.to}
              className={({ isActive }) => `nav-dropdown-item ${isActive ? 'active' : ''}`}
            >
              {d.label}
            </NavLink>
          </li>
        )
      )}
    </ul>
  );
  const menuDash = armarMenu(DASHBOARDS);

  return (
    <nav className="top-nav">
      <div className="top-nav-inner container">
        <div className="top-nav-brand">
          <img src="/brand/explorarg-icon.png" alt="explorarg" className="brand-icon" />
          <span className="brand-lockup">
            <span className="brand-name">EXPLORARG</span>
            <span className="brand-tag">Marketscan</span>
          </span>
        </div>
        <ul className="top-nav-links">
          <li>
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
              Home
            </NavLink>
          </li>
          <li className={`nav-dropdown ${abierto === 'dash' ? 'abierto' : ''}`} ref={dropdownRef}>
            <button
              type="button"
              className={`nav-dropdown-trigger ${enDashboards ? 'active' : ''}`}
              aria-haspopup="true"
              aria-expanded={abierto === 'dash'}
              onClick={() => setAbierto((o) => (o === 'dash' ? null : 'dash'))}
            >
              Dashboards <span className="nav-dropdown-caret">▾</span>
            </button>
            {angosto ? abierto === 'dash' && createPortal(menuDash, document.body) : menuDash}
          </li>
          <li>
            <NavLink
              to="/marco-legal"
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              Marco Legal
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/articulos"
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              Artículos
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/reforma-ley-27640"
              className={enReforma ? 'active' : ''}
            >
              Reforma Ley 27.640
            </NavLink>
          </li>
          <li>
            <button
              type="button"
              className="theme-toggle"
              onClick={toggle}
              title={theme === 'light' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
              aria-label="Cambiar tema"
            >
              {theme === 'light' ? '◑' : '◐'}
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}
