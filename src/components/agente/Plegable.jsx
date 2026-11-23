// Agente Explorarg - los puntos numerados que se despliegan con la flechita.
//
// Regla de HDO (22/11/2026), para el Polígrafo y el Analista: cada punto y la caja
// de cada frase llevan una flechita; quedan plegados, uno debajo del otro, y cada
// cual abre lo que le interesa.
//
// Es un <details> nativo: se abre con click, con Enter o con la barra, y sigue
// como lo dejó la persona mientras no cambie el caso (la página le pone una `key`
// al bloque del caso para que uno nuevo arranque plegado).
//
// Los estilos están en src/pages/Poligrafo.css (.pg-plegable, .pg-flecha).

import { useRef } from 'react';

/**
 * `abierto`: cómo arranca (después manda lo que toque la persona: si el valor cambia
 * con el bloque ya en pantalla, no se abre ni se cierra solo). Plegado se ve solo el
 * título con su flechita.
 */
export function PanelPlegable({ paso, titulo, abierto = false, children }) {
  const arranca = useRef(abierto).current;
  return (
    <details className="pg-panel pg-plegable" open={arranca}>
      <summary>
        <h3>
          <span className="pg-paso">{paso}</span>
          <span>{titulo}</span>
          <span className="pg-flecha" aria-hidden="true" />
        </h3>
      </summary>
      <div className="pg-plegable-cuerpo">{children}</div>
    </details>
  );
}
