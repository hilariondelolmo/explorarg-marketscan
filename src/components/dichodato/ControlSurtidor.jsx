import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fmt } from '../../lib/format.js';
import { IVA, MESES_SURTIDOR, VIDEO, efectoCorte } from '../../lib/dichoDatoPrecios.js';

/**
 * Control "Mes y corte" (episodios 17, 18 y 20 de "Del dicho al dato"): qué
 * le pasa al litro de gas oil en el surtidor, y a lo que cobra el fisco, si
 * el corte de biodiésel pasa de un porcentaje a otro, en el mes que se elija.
 *
 * La cuenta es la de las láminas de González (lib/dichoDatoPrecios.js):
 * puntos de corte x (biodiésel - fósil) x 1,21 de IVA, menos puntos x
 * (ICL + ICO2). Con los valores de cada episodio da sus cifras:
 *  - 17: de 7,5% a 15%, febrero de 2026: +$ 29 por litro (+1,6%); mayo: -$ 21 (-0,9%);
 *  - 18: los mismos 7,5 puntos en mayo: el fisco, -$ 22; el surtidor, -$ 21;
 *  - 20: de 10% a 15%, mayo: -$ 14. En febrero da +$ 20 (19,6): el video dice
 *    $ 19 porque resta los dos tramos ya redondeados (29 - 10). Avisado a HDO.
 *
 * `inicial` trae el mes y los dos cortes con los que abre cada episodio.
 */
const pesos = (v) => `$ ${fmt.int(Math.abs(v))}`;
const conSigno = (v) => `${v < -0.5 ? '-' : v > 0.5 ? '+' : ''}${pesos(v)}`;
const pct = (v) => `${v.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
const pctSigno = (v) => `${v > 0 ? '+' : ''}${v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const NOMBRE_VIDEO = { [VIDEO[0]]: 'antes de la suba del petróleo', [VIDEO[1]]: 'cuando habló González' };

// Fuera del componente: si se definiera adentro, React la volvería a montar en cada cambio y la perilla perdería el foco al arrastrarla
function Corte({ id, rotulo, valor, onChange }) {
  return (
    <div className="dd-perilla">
      <label className="dd-perilla-rotulo" htmlFor={id}>{rotulo}: <b>{pct(valor)}</b></label>
      <div className="dd-perilla-fila">
        <input id={id} type="range" min={0} max={20} step={0.5} value={valor} onChange={(e) => onChange(Number(e.target.value))} />
      </div>
    </div>
  );
}

export default function ControlSurtidor({ inicial }) {
  const [mes, setMes] = useState(inicial.mes);
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const r = efectoCorte(mes, desde, hasta);
  const esInicial = mes === inicial.mes && desde === inicial.desde && hasta === inicial.hasta;
  const quieto = Math.abs(r.total) < 0.5;
  const sube = r.total > 0;

  return (
    <div className="dd-control">
      <div className="dd-perillas">
        <div className="dd-perilla dd-perilla-ancha">
          <span className="dd-perilla-rotulo">Mes</span>
          <div className="dd-perilla-fila">
            <span className="dd-mes">
              <select aria-label="Mes" value={mes} onChange={(e) => setMes(e.target.value)}>
                {MESES_SURTIDOR.map((m) => (
                  <option key={m} value={m}>{fmt.monthShort(m)}</option>
                ))}
              </select>
            </span>
            <div className="dd-seg">
              {VIDEO.map((m) => (
                <button key={m} type="button" className={mes === m ? 'activo' : ''} aria-pressed={mes === m} onClick={() => setMes(m)}>
                  {fmt.monthShort(m)} <span className="dd-seg-n">{NOMBRE_VIDEO[m]}</span>
                </button>
              ))}
            </div>
            <button
              type="button" className="dd-boton" disabled={esInicial}
              onClick={() => {
                setMes(inicial.mes);
                setDesde(inicial.desde);
                setHasta(inicial.hasta);
              }}
            >
              Volver a los valores del video
            </button>
          </div>
        </div>
        <Corte id="dd-corte-desde" rotulo="De un corte de" valor={desde} onChange={setDesde} />
        <Corte id="dd-corte-hasta" rotulo="a un corte de" valor={hasta} onChange={setHasta} />
      </div>

      <div className="dd-cifras" aria-live="polite">
        <div className={`dd-cifra ${sube && !quieto ? 'dd-cifra-alerta' : ''}`}>
          <span className="dd-cifra-rotulo">El surtidor</span>
          <span className="dd-cifra-valor">{conSigno(r.total)}</span>
          <span className="dd-cifra-nota">
            por litro{quieto ? '' : `: ${pctSigno(r.pct)} sobre ${pesos(r.surtidor)} al público`}
          </span>
        </div>
        <div className="dd-cifra">
          <span className="dd-cifra-rotulo">Por la diferencia de precio</span>
          <span className="dd-cifra-valor">{conSigno(r.porPrecio)}</span>
          <span className="dd-cifra-nota">biodiésel {pesos(r.bio)} contra fósil {pesos(r.fosil)}, con IVA</span>
        </div>
        <div className="dd-cifra">
          <span className="dd-cifra-rotulo">Por los impuestos: lo que {hasta < desde ? 'vuelve a cobrar' : 'deja de cobrar'} el fisco</span>
          <span className="dd-cifra-valor">{conSigno(r.porImpuestos)}</span>
          <span className="dd-cifra-nota">el fósil paga {pesos(r.impuestos)} por litro de ICL e ICO2; el biodiésel, nada</span>
        </div>
      </div>

      <p className="dd-lectura">
        {hasta === desde && 'Con el mismo corte no cambia nada. Mové uno de los dos.'}
        {hasta !== desde && (
          <>
            En {fmt.monthShort(mes)}, pasar de un corte de {pct(desde)} a uno de {pct(hasta)}{' '}
            {quieto ? 'no movía el precio del surtidor' : <><b>{sube ? 'subía' : 'bajaba'} el surtidor {pesos(r.total)} por litro</b> ({pctSigno(r.pct)})</>}
            : {conSigno(r.porPrecio)} por la diferencia de precio entre el biodiésel y el fósil y {conSigno(r.porImpuestos)} por los impuestos que el
            fósil paga y el biodiésel no. Esos {pesos(r.porImpuestos)} son los que {hasta > desde ? 'deja de cobrar' : 'vuelve a cobrar'} el fisco.
          </>
        )}
      </p>

      <p className="dd-fuente">
        Cuenta: puntos de corte × (biodiésel − fósil) × {IVA.toLocaleString('es-AR')} de IVA, menos puntos de corte × (ICL + ICO2). Secretaría de Energía:
        precio del biodiésel (Res. 963/2023, mediana) y relevamiento Res. 1104/2004 (gas oil grado 2 mayorista sin impuestos, neto del biodiésel mezclado ese
        mes, y precio al público en el surtidor, ponderados por volumen). DNIAF, Secretaría de Hacienda: montos fijos del ICL y del ICO2 del gas oil, tarifa
        general. Pesos corrientes por litro. Las series de precios están en <Link to="/gas-oil/biodiesel">Precios comparados</Link>.
      </p>
    </div>
  );
}
