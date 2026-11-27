import { useMemo, useState } from 'react';
import { aEntradas, diaLargo, valoresDelDia } from '../../lib/crushingDia.js';
import { FUENTES_ACEITE_LOCAL, POSICIONES, fuentesBioFob } from './fuentes.js';

// Crushing integrado - el punto de partida de la cuenta: el día, de dónde se toma cada
// precio y los casilleros con todo lo que se puede cambiar a mano. Lo comparten las
// pantallas Hoy y Qué pasa si.
//
//   const V = useValores(datos);      el estado y los valores
//   <PuntoDePartida V={V} />          los controles y los casilleros
//
// `V.entradas` es lo que se le pasa a `calcular`; `V.entradasDelDia`, lo mismo sin los
// cambios hechos a mano.

const num1 = (v) => (v == null || Number.isNaN(v) ? '-' : v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

// Los campos que se pueden tocar. Los porcentajes se muestran en % y la cuenta los usa en fracción.
export const PRECIOS = [
  { id: 'poroto', label: 'Poroto FOB' },
  { id: 'harina', label: 'Harina FOB' },
  { id: 'aceite', label: 'Aceite FOB' },
  { id: 'aceiteLocal', label: 'Aceite en el mercado local' },
  { id: 'bioFob', label: 'Biodiésel FOB' },
  { id: 'bioLocal', label: 'Biodiésel en el mercado local' },
];
export const RETENCIONES = [
  { id: 'dexPoroto', label: 'Poroto' },
  { id: 'dexHarina', label: 'Harina' },
  { id: 'dexAceite', label: 'Aceite' },
  { id: 'dexBio', label: 'Biodiésel (nominal)' },
];
export const COSTOS = [
  { id: 'rendAceite', label: 'Rendimiento de aceite', unidad: '% de la soja', paso: 0.1 },
  { id: 'rendHarina', label: 'Rendimiento de harina', unidad: '% de la soja', paso: 0.1 },
  { id: 'costoMolienda', label: 'Costo variable de molienda', unidad: 'usd/t soja', paso: 1 },
  { id: 'consumoAceite', label: 'Aceite por tonelada de biodiésel', unidad: 't/t', paso: 0.01 },
  { id: 'metanolPrecio', label: 'Precio del metanol', unidad: 'usd/t', paso: 1 },
  { id: 'metanolConsumo', label: 'Metanol por tonelada de biodiésel', unidad: 'kg/t', paso: 1 },
  { id: 'otrosCostos', label: 'Otros costos de transformación', unidad: 'usd/t bio', paso: 1 },
  { id: 'glicerina', label: 'Crédito por glicerina', unidad: 'usd/t bio', paso: 1 },
  { id: 'otrosCoproductos', label: 'Otros coproductos de la molienda', unidad: 'usd/t soja', paso: 1 },
  { id: 'gastoPoroto', label: 'Gastos de exportar poroto', unidad: 'usd/t', paso: 1 },
  { id: 'gastoHarina', label: 'Gastos de exportar harina', unidad: 'usd/t', paso: 1 },
  { id: 'gastoAceite', label: 'Gastos de exportar aceite', unidad: 'usd/t', paso: 1 },
  { id: 'gastoAceiteLocal', label: 'Gastos de vender aceite local', unidad: 'usd/t', paso: 1 },
  { id: 'gastoBioExpo', label: 'Gastos de exportar biodiésel', unidad: 'usd/t', paso: 1 },
  { id: 'gastoBioLocal', label: 'Gastos de vender biodiésel local', unidad: 'usd/t', paso: 1 },
  { id: 'volumen', label: 'Volumen de soja a evaluar', unidad: 't', paso: 1000 },
];

const rotulo = (lista, id) => lista.find((f) => f.id === id)?.label ?? '';

/** El estado del punto de partida: día, posición, fuentes y lo cambiado a mano. */
export function useValores(datos) {
  const { filas } = datos;
  const primerDia = filas[0][0];
  const ultimoDia = filas.at(-1)[0];
  const [fecha, setFecha] = useState(ultimoDia);
  const [posicion, setPosicion] = useState('');
  const [fuenteAceite, setFuenteAceite] = useState('fas_jj');
  const [fuenteBio, setFuenteBio] = useState('bio_fob_jj');
  const [manual, setManual] = useState({});
  const fuentesBio = useMemo(() => fuentesBioFob(datos), [datos]);

  const { diaUsado, base } = useMemo(
    () => valoresDelDia(datos, { fecha, posicion, fuenteAceite, fuenteBio, rotuloAceite: rotulo(FUENTES_ACEITE_LOCAL, fuenteAceite), rotuloBio: rotulo(fuentesBio, fuenteBio) }),
    [datos, fecha, posicion, fuenteAceite, fuenteBio, fuentesBio]
  );
  const delDia = useMemo(() => Object.fromEntries(Object.entries(base).map(([k, d]) => [k, d.valor])), [base]);
  const v = useMemo(() => ({ ...delDia, ...manual }), [delDia, manual]);

  const cambiar = (id, valor) => setManual((m) => ({ ...m, [id]: valor }));
  const volver = (id) =>
    setManual((m) => {
      const { [id]: _, ...resto } = m;
      return resto;
    });

  return {
    primerDia, ultimoDia, fecha, setFecha, diaUsado,
    posicion, setPosicion,
    fuenteAceite,
    // al cambiar de fuente, el valor escrito a mano en ese casillero deja de tener sentido
    elegirFuenteAceite: (id) => { setFuenteAceite(id); volver('aceiteLocal'); },
    fuenteBio, fuentesBio,
    elegirFuenteBio: (id) => { setFuenteBio(id); volver('bioFob'); },
    base, delDia, v, manual, cambiar, volver,
    volverTodo: () => setManual({}),
    cambiados: Object.keys(manual).length,
    entradas: useMemo(() => aEntradas(v), [v]),
    entradasDelDia: useMemo(() => aEntradas(delDia), [delDia]),
  };
}

export function Casillero({ campo, V, unidad, paso = 1 }) {
  const dato = V.base[campo.id];
  const cambiado = campo.id in V.manual;
  return (
    <div className={`cx-campo ${cambiado ? 'cx-cambiado' : ''}`}>
      <label htmlFor={`cx-${campo.id}`}>{campo.label}</label>
      <div className="cx-entrada">
        <input
          id={`cx-${campo.id}`} type="number" inputMode="decimal" step={campo.paso ?? paso}
          value={V.v[campo.id] ?? ''} placeholder="sin dato"
          onChange={(ev) => V.cambiar(campo.id, ev.target.value === '' ? null : Number(ev.target.value))}
        />
        <span>{campo.unidad ?? unidad}</span>
      </div>
      <p className="cx-origen">
        {cambiado ? (
          <button type="button" onClick={() => V.volver(campo.id)} title="Volver al dato cargado">
            cambiado · volver a {dato?.valor == null ? 'vacío' : num1(dato.valor)}
          </button>
        ) : (
          dato?.nota ?? ' '
        )}
      </p>
    </div>
  );
}

/** Los controles (día, posición y fuentes) y los casilleros de precios, retenciones y costos. */
export default function PuntoDePartida({ V, titulo = 'Precios [usd/t]' }) {
  return (
    <>
      <div className="cx-controles">
        <div className="cx-control">
          <label htmlFor="cx-fecha">Precios del día</label>
          <input id="cx-fecha" type="date" value={V.fecha} min={V.primerDia} max={V.ultimoDia} onChange={(ev) => ev.target.value && V.setFecha(ev.target.value)} />
        </div>
        <div className="cx-control">
          <label htmlFor="cx-posicion">Posición del FOB oficial</label>
          <select id="cx-posicion" className="empresa-select" value={V.posicion} onChange={(ev) => V.setPosicion(ev.target.value)}>
            {POSICIONES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="cx-control">
          <label htmlFor="cx-fuente-aceite">Aceite local, tomado de</label>
          <select id="cx-fuente-aceite" className="empresa-select" value={V.fuenteAceite} onChange={(ev) => V.elegirFuenteAceite(ev.target.value)}>
            {FUENTES_ACEITE_LOCAL.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
        <div className="cx-control">
          <label htmlFor="cx-fuente-bio">Biodiésel FOB, tomado de</label>
          <select id="cx-fuente-bio" className="empresa-select" value={V.fuenteBio} onChange={(ev) => V.elegirFuenteBio(ev.target.value)}>
            {V.fuentesBio.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
      </div>
      <p className="chart-card-subtitle cx-nota">
        Precios del {diaLargo(V.diaUsado)}{V.diaUsado !== V.fecha ? ` (el ${diaLargo(V.fecha)} no hubo circular de precios oficiales)` : ''}
        {V.fecha !== V.ultimoDia && <> · <button type="button" className="cx-enlace" onClick={() => V.setFecha(V.ultimoDia)}>ir al último día ({diaLargo(V.ultimoDia)})</button></>}
        {V.cambiados > 0 && <> · {V.cambiados} {V.cambiados === 1 ? 'valor cambiado' : 'valores cambiados'} a mano · <button type="button" className="cx-enlace" onClick={V.volverTodo}>volver a los datos cargados</button></>}
      </p>

      <div className="chart-card cx-bloque">
        <div className="chart-card-header"><div><span className="chart-card-title">{titulo}</span></div></div>
        <div className="cx-grilla">{PRECIOS.map((c) => <Casillero key={c.id} campo={c} V={V} unidad="usd/t" />)}</div>
        <div className="chart-card-header cx-sub"><div><span className="chart-card-title">Retenciones [%]</span></div></div>
        <div className="cx-grilla">{RETENCIONES.map((c) => <Casillero key={c.id} campo={{ ...c, paso: 0.5 }} V={V} unidad="%" />)}</div>
        <details className="cx-plegable">
          <summary>Costos y rendimientos</summary>
          <div className="cx-grilla">{COSTOS.map((c) => <Casillero key={c.id} campo={c} V={V} />)}</div>
        </details>
      </div>
    </>
  );
}
