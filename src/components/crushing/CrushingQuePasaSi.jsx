import { useMemo, useState } from 'react';
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { useChartColors } from '../../lib/theme.jsx';
import { ALTERNATIVAS } from '../../lib/crushing.js';
import { VARIABLES, asignar, barrer, cruces, evaluar, leer, pasosDe, rangoDe, tablaDoble, variable } from '../../lib/crushingEscenarios.js';
import PuntoDePartida, { useValores } from './PuntoDePartida.jsx';
import '../mercado/Mercado.css';
import '../KPIs.css';
import '../charts/Chart.css';
import './Crushing.css';

// Crushing integrado - qué pasa si (pedido de HDO del 27/11/2026).
//
// Parte de los precios del día, o de los que la persona escriba arriba (el escenario), y
// hace cuatro pruebas con la cuenta de src/lib/crushing.js:
//   1. el escenario contra los datos del día;
//   2. mover una variable y ver en qué valor cambia el mejor destino;
//   3. mover dos variables a la vez;
//   4. repartir un volumen de soja cuando los destinos tienen tope.
// Las cuentas están en src/lib/crushingEscenarios.js.

const DESTINOS = ALTERNATIVAS.filter((a) => a.id !== 'poroto');
const num0 = (v) => (v == null || Number.isNaN(v) ? '-' : Math.round(v).toLocaleString('es-AR'));
const num1 = (v) => (v == null || Number.isNaN(v) ? '-' : v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const signo1 = (v) => (v == null || Number.isNaN(v) ? '-' : `${v > 0 ? '+' : ''}${num1(v)}`);
/** Un valor de una variable, con los decimales que pide: las retenciones con uno, los precios sin ninguno. */
const valorDe = (vr, x) => (x == null ? '-' : vr.clase === 'puntos' ? num1(x) : num0(x));
const PRODUCTO = { aceite_expo: 'aceite', aceite_local: 'aceite', bio_expo: 'biodiésel', bio_local: 'biodiésel' };

function Numero({ id, label, unidad, valor, onChange, paso = 1000, placeholder = 'sin tope' }) {
  return (
    <div className="cx-campo">
      <label htmlFor={id}>{label}</label>
      <div className="cx-entrada">
        <input id={id} type="number" inputMode="decimal" min="0" step={paso} value={valor ?? ''} placeholder={placeholder} onChange={(ev) => onChange(ev.target.value === '' ? null : Number(ev.target.value))} />
        <span>{unidad}</span>
      </div>
    </div>
  );
}

export default function CrushingQuePasaSi({ datos }) {
  const C = useChartColors();
  const V = useValores(datos);
  const { v } = V;
  const colores = { poroto: C.neutral, aceite_expo: C.exp, aceite_local: C.oil, bio_expo: C.celeste, bio_local: C.bio };
  const nombreDe = Object.fromEntries(ALTERNATIVAS.map((a) => [a.id, a.nombre]));

  const R = useMemo(() => evaluar(v), [v]);
  const Rdia = useMemo(() => evaluar(V.delDia), [V.delDia]);

  // ---- una variable
  const [varId, setVarId] = useState('bioLocal');
  const vr = variable(varId);
  const actual = leer(vr, v);
  const rango = useMemo(() => rangoDe(vr, v), [vr, v]);
  const puntos = useMemo(() => (rango ? barrer(vr, v, { ...rango, pasos: 60 }) : []), [vr, v, rango]);
  const listaCruces = useMemo(() => (rango ? cruces(vr, v, rango) : []), [vr, v, rango]);

  // ---- dos variables
  const [idA, setIdA] = useState('bioLocal');
  const [idB, setIdB] = useState('aceite');
  const vrA = variable(idA);
  const vrB = variable(idB);
  const valoresA = useMemo(() => pasosDe(vrA, v), [vrA, v]);
  const valoresB = useMemo(() => pasosDe(vrB, v), [vrB, v]);
  const tabla = useMemo(() => (idA === idB || !valoresA.length || !valoresB.length ? null : tablaDoble(vrA, vrB, v, valoresA, valoresB)), [idA, idB, vrA, vrB, v, valoresA, valoresB]);
  const cambio = (vr2, x) => {
    const base = leer(vr2, v);
    if (base == null) return '';
    if (vr2.clase === 'puntos') return x === base ? 'hoy' : `${x > base ? '+' : ''}${num0(x - base)} pts`;
    return x === base ? 'hoy' : `${x > base ? '+' : ''}${num0((x / base - 1) * 100)}%`;
  };

  // ---- volumen con topes
  const [topes, setTopes] = useState({});
  const [molienda, setMolienda] = useState(null);
  const reparto = useMemo(() => asignar(R, { soja: v.volumen, molienda, topes }), [R, v.volumen, molienda, topes]);

  const linea = { type: 'linear', strokeWidth: 2, dot: false, activeDot: { r: 4 }, isAnimationActive: false };
  const TooltipBarrido = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{vr.label}: {valorDe(vr, p.x)} {vr.unidad}</div>
        {DESTINOS.map((a) => (
          <div key={a.id} className="chart-tooltip-row">
            <span className="chart-tooltip-swatch" style={{ background: colores[a.id] }} />
            <span>{a.nombre}</span><strong>{num1(p[a.id])}</strong>
          </div>
        ))}
        <div className="chart-tooltip-row"><span>Mejor destino</span><strong>{p.mejor ? nombreDe[p.mejor] : '-'}</strong></div>
      </div>
    );
  };

  if (!R) {
    return (
      <div className="cx">
        <PuntoDePartida V={V} titulo="El escenario: precios [usd/t]" />
        <p className="cx-aviso">Faltan datos para hacer la cuenta: como mínimo, el FOB del poroto y de la harina, los rendimientos y el consumo de aceite.</p>
      </div>
    );
  }

  return (
    <div className="cx cx-qps">
      <PuntoDePartida V={V} titulo="El escenario: precios [usd/t]" />

      <div className="chart-card cx-bloque">
        <div className="chart-card-header">
          <div>
            <span className="chart-card-title">El escenario contra los datos del día [usd por tonelada de soja]</span>
            <span className="chart-card-subtitle">
              {V.cambiados === 0
                ? 'Todavía no cambiaste ningún valor: el escenario es el del día. Cambiá un precio, una retención o un costo arriba y acá se ve la diferencia.'
                : `${V.cambiados} ${V.cambiados === 1 ? 'valor cambiado' : 'valores cambiados'} a mano · margen de cada destino contra exportar el poroto`}
            </span>
          </div>
        </div>
        <div className="cx-tabla-scroll">
          <table className="cx-tabla">
            <thead>
              <tr><th>Destino</th><th>Datos del día</th><th>Escenario</th><th>Diferencia</th></tr>
            </thead>
            <tbody>
              {DESTINOS.map((a) => {
                const e = R.alternativas.find((x) => x.id === a.id).margen;
                const d = Rdia?.alternativas.find((x) => x.id === a.id).margen ?? null;
                return (
                  <tr key={a.id} className={R.mejor?.id === a.id ? 'cx-fila-mejor' : ''}>
                    <th><span className="cx-punto" style={{ background: colores[a.id] }} />{a.nombre}{R.mejor?.id === a.id ? ' · el mejor del escenario' : ''}</th>
                    <td>{num1(d)}</td><td>{num1(e)}</td><td>{e == null || d == null ? '-' : signo1(e - d)}</td>
                  </tr>
                );
              })}
              <tr>
                <th>Piso del aceite [usd/t de aceite]</th>
                <td>{num0(Rdia?.piso)}</td><td>{num0(R.piso)}</td><td>{Rdia ? signo1(R.piso - Rdia.piso) : '-'}</td>
              </tr>
              <tr>
                <th>Indiferencia del biodiésel local [usd/t]</th>
                <td>{num0(Rdia?.indiferencia?.bioLocal)}</td><td>{num0(R.indiferencia?.bioLocal)}</td>
                <td>{Rdia?.indiferencia && R.indiferencia ? signo1(R.indiferencia.bioLocal - Rdia.indiferencia.bioLocal) : '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="chart-card cx-bloque">
        <div className="chart-card-header">
          <div>
            <span className="chart-card-title">Mover una variable [usd por tonelada de soja]</span>
            <span className="chart-card-subtitle">Qué deja cada destino a medida que cambia una sola cosa y el resto queda como en el escenario</span>
          </div>
        </div>
        <div className="cx-controles cx-controles-uno">
          <div className="cx-control">
            <label htmlFor="cx-var">Variable que se mueve</label>
            <select id="cx-var" className="empresa-select" value={varId} onChange={(e) => setVarId(e.target.value)}>
              {VARIABLES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </div>
        </div>
        {!rango ? (
          <p className="cx-aviso">Esa variable no tiene valor en el escenario: cargala arriba para poder moverla.</p>
        ) : (
          <>
            <div className="chart-card-body">
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={puntos} margin={{ top: 18, right: 18, left: 0, bottom: 0 }}>
                  <XAxis dataKey="x" type="number" domain={[rango.min, rango.max]} tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickLine={false} tickFormatter={(x) => valorDe(vr, x)} tickCount={8} />
                  <YAxis tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(y) => num0(y)} width={48} domain={['auto', 'auto']} />
                  <ReferenceLine y={0} stroke={C.neutral} />
                  {listaCruces.map((c) => <ReferenceLine key={c.x} x={c.x} stroke={C.neutral} strokeDasharray="3 3" />)}
                  <ReferenceLine x={actual} stroke={C.ink} strokeDasharray="5 4" label={{ value: `escenario: ${valorDe(vr, actual)}`, position: 'insideTopRight', fill: C.tick, fontSize: 11 }} />
                  <Tooltip content={<TooltipBarrido />} cursor={{ stroke: C.cursorLinea }} />
                  {DESTINOS.map((a) => <Line key={a.id} {...linea} dataKey={a.id} name={a.nombre} stroke={colores[a.id]} />)}
                </ComposedChart>
              </ResponsiveContainer>
              <div className="chart-legend">
                {DESTINOS.map((a) => <div key={a.id} className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colores[a.id] }} />{a.nombre}</div>)}
              </div>
            </div>
            <ul className="cx-cruces">
              {listaCruces.length === 0 ? (
                <li>Entre {valorDe(vr, rango.min)} y {valorDe(vr, rango.max)} {vr.unidad} el mejor destino no cambia: es siempre <strong>{nombreDe[puntos[0]?.mejor] ?? '-'}</strong>.</li>
              ) : (
                listaCruces.map((c) => (
                  <li key={c.x}>
                    En <strong>{valorDe(vr, c.x)} {vr.unidad}</strong> cambia el mejor destino: por debajo conviene {nombreDe[c.de]?.toLowerCase() ?? 'ninguno'}; por encima, {nombreDe[c.a]?.toLowerCase() ?? 'ninguno'}.
                    {actual != null && <> El escenario está {valorDe(vr, Math.abs(actual - c.x))} {vr.clase === 'puntos' ? 'puntos' : vr.unidad} {actual >= c.x ? 'arriba' : 'abajo'}.</>}
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </div>

      <div className="chart-card cx-bloque">
        <div className="chart-card-header">
          <div>
            <span className="chart-card-title">Mover dos variables</span>
            <span className="chart-card-subtitle">Cada casillero es una combinación: el color dice qué destino conviene más y el número, cuánto deja en usd por tonelada de soja</span>
          </div>
        </div>
        <div className="cx-controles cx-controles-dos">
          <div className="cx-control">
            <label htmlFor="cx-var-a">En las filas</label>
            <select id="cx-var-a" className="empresa-select" value={idA} onChange={(e) => setIdA(e.target.value)}>
              {VARIABLES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </div>
          <div className="cx-control">
            <label htmlFor="cx-var-b">En las columnas</label>
            <select id="cx-var-b" className="empresa-select" value={idB} onChange={(e) => setIdB(e.target.value)}>
              {VARIABLES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </div>
        </div>
        {!tabla ? (
          <p className="cx-aviso">{idA === idB ? 'Elegí dos variables distintas.' : 'Alguna de las dos variables no tiene valor en el escenario.'}</p>
        ) : (
          <>
            <div className="cx-tabla-scroll">
              <table className="cx-tabla cx-doble">
                <thead>
                  <tr>
                    <th>{vrA.label} ↓ · {vrB.label} →</th>
                    {valoresB.map((x, j) => <th key={j} className={j === 3 ? 'cx-hoy' : ''}>{valorDe(vrB, x)}<small>{cambio(vrB, x)}</small></th>)}
                  </tr>
                </thead>
                <tbody>
                  {tabla.map((filaT, i) => (
                    <tr key={i}>
                      <th className={i === 3 ? 'cx-hoy' : ''}>{valorDe(vrA, valoresA[i])} {vrA.unidad}<small>{cambio(vrA, valoresA[i])}</small></th>
                      {filaT.map((c, j) => (
                        <td key={j} className={i === 3 && j === 3 ? 'cx-centro' : ''} style={{ background: c.mejor ? `${colores[c.mejor]}33` : 'transparent' }} title={c.mejor ? nombreDe[c.mejor] : 'sin dato'}>
                          {num1(c.margen)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="chart-legend">
              {ALTERNATIVAS.filter((a) => tabla.some((f) => f.some((c) => c.mejor === a.id))).map((a) => (
                <div key={a.id} className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: `${colores[a.id]}55` }} />{a.nombre}</div>
              ))}
              <div className="chart-legend-item">el casillero con borde es el escenario</div>
            </div>
          </>
        )}
      </div>

      <div className="chart-card cx-bloque">
        <div className="chart-card-header">
          <div>
            <span className="chart-card-title">Repartir un volumen con topes</span>
            <span className="chart-card-subtitle">Ningún destino absorbe todo. Con el tope de cada uno, la soja va primero al que más deja y después al siguiente; lo que sobra se exporta como poroto</span>
          </div>
        </div>
        <div className="cx-grilla">
          <Numero id="cx-vol" label="Soja disponible" unidad="t" valor={v.volumen} onChange={(x) => V.cambiar('volumen', x)} placeholder="sin dato" />
          <Numero id="cx-molienda" label="Capacidad de molienda" unidad="t de soja" valor={molienda} onChange={setMolienda} />
          {DESTINOS.map((a) => (
            <Numero key={a.id} id={`cx-tope-${a.id}`} label={`Tope: ${a.corto.toLowerCase()}`} unidad={`t de ${PRODUCTO[a.id]}`} valor={topes[a.id]} onChange={(x) => setTopes((t) => ({ ...t, [a.id]: x }))} />
          ))}
        </div>
        {!reparto ? (
          <p className="cx-aviso">Cargá cuánta soja hay para repartir.</p>
        ) : (
          <>
            <div className="cx-tabla-scroll">
              <table className="cx-tabla">
                <thead>
                  <tr><th>Destino, del que más deja al que menos</th><th>Margen usd/t soja</th><th>Soja t</th><th>Producto t</th><th>Deja usd</th></tr>
                </thead>
                <tbody>
                  {reparto.filas.map((f) => (
                    <tr key={f.id}>
                      <th><span className="cx-punto" style={{ background: colores[f.id] }} />{f.nombre}{f.lleno ? ' · llegó al tope' : ''}</th>
                      <td>{num1(f.margen)}</td><td>{num0(f.soja)}</td><td>{num0(f.producto)} de {PRODUCTO[f.id]}</td><td>{num0(f.total)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th><span className="cx-punto" style={{ background: colores.poroto }} />Exportar el poroto</th>
                    <td>0,0</td><td>{num0(reparto.poroto)}</td><td>{num0(reparto.poroto)} de poroto</td><td>0</td>
                  </tr>
                  <tr className="cx-fila-total">
                    <th>Total</th><td>{num1(reparto.promedio)}</td><td>{num0(v.volumen)}</td><td>{num0(reparto.molida)} de soja molida</td><td>{num0(reparto.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="cx-lectura">
              Con esos topes, {num0(v.volumen)} t de soja dejan <strong>{num1(reparto.total / 1e6)} millones de usd</strong> más que exportarlas como poroto: {num1(reparto.promedio)} usd por tonelada en promedio.
              La próxima tonelada iría a <strong>{reparto.siguiente.nombre.toLowerCase()}</strong> y dejaría {num1(reparto.siguiente.margen)} usd.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
