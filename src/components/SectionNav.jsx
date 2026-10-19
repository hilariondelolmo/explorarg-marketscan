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
 * navegar, despliega sus páginas debajo. Un ítem con `deshabilitado` se
 * muestra apagado y no navega (sección anunciada que todavía no tiene páginas).
 * `accion` ({ label, onClick }) dibuja un botón al final de la fila, a la
 * derecha (el "Cómo se usa" que abre el tutorial en video de la página).
 * Una sección con `derecha` se empuja al extremo derecho de la fila (Cámara de
 * Senadores en Reforma, HDO 19/10/2026); las demás quedan a la izquierda.
 * En dispositivos con puntero, la pestaña con menú se despliega al pasar el
 * mouse y se cierra al salir del botón y del menú (HDO, 19/10/2026); el clic
 * sigue alternándola, y en táctil solo funciona el toque.
 */
export default function SectionNav({ sections, basePath, accion }) {
  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  const rutas = basePath || sections.some((s) => s.to || s.menu);
  const active = useActiveSection(rutas ? [] : ids);
  const ruta = (s) => s.to || (s.root ? basePath : `${basePath}/${s.id}`);

  return (
    <nav className="section-nav" aria-label="Secciones de la página">
      <div className="section-nav-inner container">
        <ul>
          {sections.map((s) => (
            <li key={s.id} className={s.derecha ? 'section-nav-derecha' : undefined}>
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
        {accion && (
          <button type="button" className="section-nav-accion" onClick={accion.onClick} title={accion.title}>
            <span className="section-nav-accion-icono" aria-hidden="true">▶</span> {accion.label}
          </button>
        )}
      </div>
    </nav>
  );
}

// Páginas de un ítem: él mismo, o las de su menú (las deshabilitadas no tienen ruta)
const paginas = (m) => (m.menu ? m.menu.flatMap(paginas) : m.deshabilitado ? [] : [m]);

/**
 * Pestaña que despliega un menú con sus páginas. El menú se monta en un portal
 * sobre <body>: la fila de pestañas scrollea en horizontal (lo recortaría) y
 * Safari ancla los position:fixed al backdrop-filter de la barra. Se cierra al
 * elegir, al tocar afuera, con Escape y al scrollear o cambiar el tamaño. Los
 * ítems con menú propio se despliegan dentro del mismo panel.
 */
const CON_PUNTERO = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;

function PestanaMenu({ seccion, ruta }) {
  const { pathname } = useLocation();
  const [pos, setPos] = useState(null); // { left, top } del menú abierto
  const [grupo, setGrupo] = useState(null); // id del ítem con menú propio que está desplegado
  const boton = useRef(null);
  const cierre = useRef(null); // temporizador del cierre por hover
  const contiene = (m) => paginas(m).some((p) => pathname === ruta(p));
  const activa = contiene(seccion);

  useEffect(() => setPos(null), [pathname]);
  useEffect(() => () => clearTimeout(cierre.current), []);
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

  const abrir = () => {
    const r = boton.current.getBoundingClientRect();
    // Abre con el grupo de la página actual ya desplegado
    setGrupo(seccion.menu.find((m) => m.menu && contiene(m))?.id ?? null);
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - ANCHO_MENU - 8)), top: r.bottom });
  };
  const alternar = () => (pos ? setPos(null) : abrir());
  // Hover: abre al entrar al botón; al salir del botón o del menú espera un
  // instante (para cruzar del uno al otro) y cierra
  const entrar = () => {
    if (!CON_PUNTERO) return;
    clearTimeout(cierre.current);
    if (!pos) abrir();
  };
  const salir = () => {
    if (!CON_PUNTERO) return;
    clearTimeout(cierre.current);
    cierre.current = setTimeout(() => setPos(null), 220);
  };
  const quedarse = () => clearTimeout(cierre.current);
  const enlace = (m) =>
    m.deshabilitado ? (
      <span className="section-nav-menu-item deshabilitado" aria-disabled="true">
        {m.label}
      </span>
    ) : (
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
        onMouseEnter={entrar} onMouseLeave={salir}
      >
        {seccion.label} <span className="section-nav-caret">▾</span>
      </button>
      {pos && createPortal(
        <ul
          className="section-nav-menu" style={{ left: pos.left, top: pos.top, minWidth: ANCHO_MENU }}
          onMouseEnter={quedarse} onMouseLeave={salir}
        >
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
