// Agente Explorarg - menú de selección múltiple del Analista.
//
// Pedido de HDO (23/11/2026): los menús con que se corrige la consulta dejan tildar
// varias opciones, para combinar el pedido. Es el mismo gesto que los filtros de
// Compras al cupo (un botón que despliega una lista con casillas), con el aspecto
// de los demás menús del Analista. Los estilos están en src/pages/Analista.css (.an-multi).

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

/**
 *   rotulo     el nombre del menú (lo lee el lector de pantalla)
 *   opciones   [[valor, texto]] o, con títulos, [{ titulo, opciones: [[valor, texto]] }]
 *   elegidas   lista de los valores tildados
 *   onChange   (lista, valorTocado) => void. La lista sale en el orden del menú.
 *   vacio      texto del botón cuando no hay nada tildado ("Todas"). Sin `vacio` el menú
 *              pide al menos una opción: la última tildada no se puede destildar.
 *   nota       renglón de ayuda arriba de la lista
 */
export function MenuMultiple({ rotulo, opciones, elegidas, onChange, vacio, nota }) {
  const [abierto, setAbierto] = useState(false);
  const [aLaDerecha, setALaDerecha] = useState(false);
  const caja = useRef(null);
  const boton = useRef(null);
  const panel = useRef(null);
  const id = useId();

  const grupos = opciones.length && !Array.isArray(opciones[0]) ? opciones : [{ titulo: null, opciones }];
  const todas = grupos.flatMap((g) => g.opciones);
  const tildadas = todas.filter(([v]) => elegidas.includes(v));
  const obligatorio = vacio === undefined;

  useEffect(() => {
    if (!abierto) return undefined;
    const afuera = (e) => {
      if (caja.current && !caja.current.contains(e.target)) setAbierto(false);
    };
    const tecla = (e) => {
      if (e.key !== 'Escape') return;
      setAbierto(false);
      boton.current?.focus();
    };
    document.addEventListener('mousedown', afuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', afuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  // si la lista se sale por la derecha de la pantalla, se abre hacia la izquierda
  useLayoutEffect(() => {
    if (!abierto || !panel.current) return;
    if (panel.current.getBoundingClientRect().right > document.documentElement.clientWidth - 8) setALaDerecha(true);
  }, [abierto]);

  const alternar = (valor) => {
    const esta = elegidas.includes(valor);
    if (esta && obligatorio && tildadas.length === 1) return;
    onChange(todas.map(([v]) => v).filter((v) => (v === valor ? !esta : elegidas.includes(v))), valor);
  };

  return (
    <div className="an-multi" ref={caja}>
      <button
        type="button"
        ref={boton}
        className={`an-multi-boton${abierto ? ' abierto' : ''}`}
        aria-expanded={abierto}
        aria-controls={id}
        aria-label={`${rotulo}: ${tildadas.length ? tildadas.map(([, t]) => t).join(', ') : vacio}`}
        onClick={() => {
          setALaDerecha(false);
          setAbierto((v) => !v);
        }}
      >
        <span className="an-multi-texto">{tildadas.length ? tildadas.map(([, t]) => t).join(', ') : vacio}</span>
        {tildadas.length > 1 && <span className="an-multi-cuenta">{tildadas.length}</span>}
        <span className="an-multi-caret" aria-hidden="true" />
      </button>
      {abierto && (
        <div className={`an-multi-panel${aLaDerecha ? ' a-la-derecha' : ''}`} id={id} ref={panel} role="group" aria-label={rotulo}>
          {!obligatorio && (
            <div className="an-multi-acciones">
              <button type="button" onClick={() => onChange([], null)} disabled={!tildadas.length}>
                {vacio}
              </button>
            </div>
          )}
          {nota && <p className="an-multi-nota">{nota}</p>}
          {grupos.map((g) => (
            <div key={g.titulo ?? 'unico'} className="an-multi-grupo">
              {g.titulo && <p className="an-multi-titulo">{g.titulo}</p>}
              {g.opciones.map(([valor, texto]) => {
                const tildada = elegidas.includes(valor);
                const fija = tildada && obligatorio && tildadas.length === 1;
                return (
                  <label key={valor} className="an-multi-item" title={fija ? 'Tiene que quedar al menos una tildada' : undefined}>
                    <input type="checkbox" checked={tildada} disabled={fija} onChange={() => alternar(valor)} />
                    <span>{texto}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
