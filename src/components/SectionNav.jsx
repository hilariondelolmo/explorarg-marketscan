import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { useActiveSection } from '../hooks/useActiveSection.js';
import './SectionNav.css';

const ANCHO_MENU = 190; // ancho mínimo del menú, para que no se salga de la pantalla

/**
 * Sub-navegación de secciones, pegada debajo de la nav principal.
 * Dos modos:
 *  - con `basePath` (o secciones con `to` absoluto): cada sección es una
 *    página propia (links de ruta);
 *  - sin `basePath`: anclas dentro de la misma página, con scroll-spy.
 * Una sección con `menu` ([{ id, label }]) no navega: despliega un menú con
 * sus páginas. Un ítem del menú puede traer su propio `menu`: en lugar de
 * navegar, despliega sus páginas debajo.
 */
export default function SectionNav({ sections, basePath }) {
  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  const rutas = basePath || sections.some((s) => s.to);
  const active = useActiveSection(rutas ? [] : ids);
  const ruta = (s) => s.to || (s.root ? basePath : `${basePath}/${s.id}`);

  return (
    <nav className="section-nav" aria-label="Secciones de la página">
      <div className="section-nav-inner container">
        <ul>
          {sections.map((s) => (
            <li key={s.id}>
              {s.menu ? (
                <PestanaMenu seccion={s} ruta={ruta} />
              ) : rutas ? (
                <NavLink
                  to={ruta(s)}
                  end
                  className={({ isActive }) => (isActive ? 'active' : '')}
                >
                  {s.label}
                </NavLink>
              ) : (
                <a href={`#${s.id}`} className={active === s.id ? 'active' : ''}>
                  {s.label}
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

// Páginas de un ítem: él mismo, o las de su menú
const paginas = (m) => (m.menu ? m.menu.flatMap(paginas) : [m]);

/**
 * Pestaña que despliega un menú con sus páginas. El menú se monta en un portal
 * sobre <body>: la fila de pestañas scrollea en horizontal (lo recortaría) y
 * Safari ancla los position:fixed al backdrop-filter de la barra. Se cierra al
 * elegir, al tocar afuera, con Escape y al scrollear o cambiar el tamaño. Los
 * ítems con menú propio se despliegan dentro del mismo panel.
 */
function PestanaMenu({ seccion, ruta }) {
  const { pathname } = useLocation();
  const [pos, setPos] = useState(null); // { left, top } del menú abierto
  const [grupo, setGrupo] = useState(null); // id del ítem con menú propio que está desplegado
  const boton = useRef(null);
  const contiene = (m) => paginas(m).some((p) => pathname === ruta(p));
  const activa = contiene(seccion);

  useEffect(() => setPos(null), [pathname]);
  useEffect(() => {
    if (!pos) return undefined;
    const cerrar = () => setPos(null);
    const afuera = (e) => {
      if (!boton.current?.contains(e.target) && !e.target.closest?.('.section-nav-menu')) cerrar();
    };
    const tecla = (e) => {
      if (e.key === 'Escape') cerrar();
    };
    document.addEventListener('pointerdown', afuera);
    document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', cerrar, { passive: true });
    window.addEventListener('resize', cerrar);
    return () => {
      document.removeEventListener('pointerdown', afuera);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('scroll', cerrar);
      window.removeEventListener('resize', cerrar);
    };
  }, [pos]);

  const alternar = () => {
    if (pos) {
      setPos(null);
      return;
    }
    const r = boton.current.getBoundingClientRect();
    // Abre con el grupo de la página actual ya desplegado
    setGrupo(seccion.menu.find((m) => m.menu && contiene(m))?.id ?? null);
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - ANCHO_MENU - 8)), top: r.bottom });
  };
  const enlace = (m) => (
    <NavLink to={ruta(m)} end className={({ isActive }) => `section-nav-menu-item ${isActive ? 'active' : ''}`}>
      {m.label}
    </NavLink>
  );

  return (
    <>
      <button
        ref={boton} type="button"
        className={`section-nav-trigger ${activa ? 'active' : ''} ${pos ? 'abierto' : ''}`}
        aria-haspopup="true" aria-expanded={!!pos} onClick={alternar}
      >
        {seccion.label} <span className="section-nav-caret">▾</span>
      </button>
      {pos && createPortal(
        <ul className="section-nav-menu" style={{ left: pos.left, top: pos.top, minWidth: ANCHO_MENU }}>
          {seccion.menu.map((m) => (
            <li key={m.id}>
              {m.menu ? (
                <>
                  <button
                    type="button" className={`section-nav-menu-item section-nav-menu-grupo ${contiene(m) ? 'contiene' : ''}`}
                    aria-haspopup="true" aria-expanded={grupo === m.id}
                    onClick={() => setGrupo(grupo === m.id ? null : m.id)}
                  >
                    {m.label} <span className="section-nav-caret">{grupo === m.id ? '▴' : '▾'}</span>
                  </button>
                  {grupo === m.id && (
                    <ul className="section-nav-submenu">
                      {m.menu.map((h) => <li key={h.id}>{enlace(h)}</li>)}
                    </ul>
                  )}
                </>
              ) : enlace(m)}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
}
