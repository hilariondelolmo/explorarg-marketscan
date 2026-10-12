import { useEffect, useRef, useState } from 'react';

/**
 * Desplegable de selección múltiple con casillas, con el estilo de los
 * selectores del sitio (mismo componente que usa el relevamiento de gas oil,
 * copiado acá para no cargar los datos de esa página en el eje Mercado).
 *   opciones   lista de valores
 *   seleccion  Set de los tildados
 *   resumen    texto del botón
 *   onCambiar  (Set) => void
 *   rotulo     texto de cada opción
 *   acciones   [[nombre, lista | null]]: selecciones prearmadas (null = todas)
 */
export default function DropdownMulti({
  opciones, seleccion, resumen, onCambiar, rotulo = (t) => t,
  acciones = [['Todas', null], ['Ninguna', []]], clase = '',
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!abierto) return undefined;
    const cerrar = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abierto]);
  const toggle = (t) => {
    const n = new Set(seleccion);
    if (n.has(t)) n.delete(t); else n.add(t);
    onCambiar(n);
  };
  return (
    <div className="mh-dropdown" ref={ref}>
      <button
        type="button" className={`empresa-select mh-dropdown-boton ${abierto ? 'abierto' : ''}`}
        onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}
      >
        <span>{resumen}</span><span className="mh-dropdown-caret">▾</span>
      </button>
      {abierto && (
        <div className={`mh-dropdown-panel ${clase}`}>
          <div className="cc-acciones">
            {acciones.map(([nombre, lista]) => (
              <button key={nombre} type="button" onClick={() => onCambiar(new Set(lista || opciones))}>{nombre}</button>
            ))}
          </div>
          {opciones.map((t) => (
            <label key={t} className="mh-dropdown-item">
              <input type="checkbox" checked={seleccion.has(t)} onChange={() => toggle(t)} />
              <span>{rotulo(t)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
