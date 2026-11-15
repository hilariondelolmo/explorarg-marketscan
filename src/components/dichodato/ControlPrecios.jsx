import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fmt } from '../../lib/format.js';
import { MESES, VIDEO, precios } from '../../lib/dichoDatoPrecios.js';

/**
 * Control "Dos meses" (episodios 15 y 16 de "Del dicho al dato"): el precio
 * del biodiésel contra el del gas oil fósil con el que se mezcla y contra el
 * del gas oil importado, en los dos meses que se elijan, con la variación
 * entre uno y otro. Las series y cómo se arman, en lib/dichoDatoPrecios.js.
 *
 * Con febrero y mayo de 2026 da las cifras de los episodios: biodiésel
 * $ 1.631 y $ 1.600, fósil $ 1.084 y $ 1.587, importado $ 842; el biodiésel
 * 50% y 1% sobre el fósil; de un mes al otro, el fósil +46% y el biodiésel -2%.
 * El efecto en el surtidor y en el fisco es otro control (ControlSurtidor).
 */
const pesos = (v) => (v === null ? '-' : `$ ${fmt.int(v)}`);
const sobre = (a, b) => (a === null || b === null || !b ? null : (a / b - 1) * 100);
const signo = (v) => (v === null ? '-' : `${v > 0 ? '+' : ''}${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}%`);

function SelectorMes({ id, rotulo, valor, onChange }) {
  return (
    <span className="dd-mes">
      <label htmlFor={id}>{rotulo}</label>
      <select id={id} value={valor} onChange={(e) => onChange(e.target.value)}>
        {MESES.map((m) => (
          <option key={m} value={m}>{fmt.monthShort(m)}</option>
        ))}
      </select>
    </span>
  );
}

export default function ControlPrecios() {
  const [a, setA] = useState(VIDEO[0]);
  const [b, setB] = useState(VIDEO[1]);
  const pa = precios(a);
  const pb = precios(b);
  const esVideo = a === VIDEO[0] && b === VIDEO[1];
  const filas = [
    { rotulo: 'Biodiésel', nota: 'Precio Res. 963/2023', clave: 'bio' },
    { rotulo: 'Gas oil fósil', nota: 'Grado 2 mayorista, sin impuestos', clave: 'fosil' },
    { rotulo: 'Gas oil importado', nota: 'Puesto en puerto (CIF)', clave: 'importado' },
  ];

  return (
    <div className="dd-control">
      <div className="dd-perillas">
        <div className="dd-perilla dd-perilla-ancha">
          <span className="dd-perilla-rotulo">Dos meses para comparar</span>
          <div className="dd-perilla-fila">
            <SelectorMes id="dd-mes-a" rotulo="Mes" valor={a} onChange={setA} />
            <SelectorMes id="dd-mes-b" rotulo="contra" valor={b} onChange={setB} />
            <button type="button" className="dd-boton" disabled={esVideo} onClick={() => { setA(VIDEO[0]); setB(VIDEO[1]); }}>
              Volver a los meses del video
            </button>
          </div>
        </div>
      </div>

      <div className="dd-cifras" aria-live="polite">
        <div className="dd-cifra">
          <span className="dd-cifra-rotulo">Biodiésel sobre el fósil, {fmt.monthShort(a)}</span>
          <span className="dd-cifra-valor">{signo(sobre(pa.bio, pa.fosil))}</span>
          <span className="dd-cifra-nota">{pesos(pa.bio)} contra {pesos(pa.fosil)} por litro</span>
        </div>
        <div className="dd-cifra">
          <span className="dd-cifra-rotulo">Biodiésel sobre el fósil, {fmt.monthShort(b)}</span>
          <span className="dd-cifra-valor">{signo(sobre(pb.bio, pb.fosil))}</span>
          <span className="dd-cifra-nota">{pesos(pb.bio)} contra {pesos(pb.fosil)} por litro</span>
        </div>
        <div className="dd-cifra">
          <span className="dd-cifra-rotulo">De un mes al otro</span>
          <span className="dd-cifra-valor">{signo(sobre(pb.fosil, pa.fosil))}</span>
          <span className="dd-cifra-nota">el gas oil fósil; el biodiésel, {signo(sobre(pb.bio, pa.bio))}</span>
        </div>
      </div>

      <div className="dd-tabla-caja">
        <table className="dd-tabla">
          <thead>
            <tr>
              <th scope="col">Pesos por litro</th>
              <th scope="col">{fmt.monthShort(a)}</th>
              <th scope="col">{fmt.monthShort(b)}</th>
              <th scope="col">Variación</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave}>
                <th scope="row">{f.rotulo} <small>{f.nota}</small></th>
                <td>{pesos(pa[f.clave])}</td>
                <td>{pesos(pb[f.clave])}</td>
                <td>{signo(sobre(pb[f.clave], pa[f.clave]))}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Gas oil fósil sobre el importado <small>Cuánto más caro vendían el fósil que su paridad</small></th>
              <td>{signo(sobre(pa.fosil, pa.importado))}</td>
              <td>{signo(sobre(pb.fosil, pb.importado))}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <p className="dd-fuente">
        Secretaría de Energía: precio del biodiésel (Res. 963/2023, mediana), relevamiento Res. 1104/2004 (gas oil grado 2 mayorista sin impuestos, ponderado
        por volumen y neto del biodiésel mezclado ese mes) e importaciones de gas oil (CIF, sin CAMMESA), procesados en explorarg.com. Pesos corrientes por
        litro, con el tipo de cambio del mes. Un guion quiere decir que ese mes no hubo importaciones. Las series completas, con otros productos y otras
        unidades, están en <Link to="/gas-oil/biodiesel">Precios comparados</Link>.
      </p>
    </div>
  );
}
