import { useMemo } from 'react';
import { calcular } from '../../lib/crushing.js';
import { diaLargo as dia } from '../../lib/crushingDia.js';
import PuntoDePartida, { RETENCIONES, useValores } from './PuntoDePartida.jsx';
import '../mercado/Mercado.css';
import '../KPIs.css';
import '../charts/Chart.css';
import './Crushing.css';

// Crushing integrado - la cuenta del día (pedido de HDO del 27/11/2026).
//
// Una sola pantalla en lugar de las siete hojas de la planilla: los precios del día ya
// cargados, todo editable (PuntoDePartida.jsx), y abajo qué deja cada destino de la soja
// y los precios de indiferencia. La cuenta está en src/lib/crushing.js; los datos y los
// parámetros los entrega el servidor a quien está autorizado (api/reservada.js) y no
// están en el repositorio.

const num0 = (v) => (v == null || Number.isNaN(v) ? '-' : Math.round(v).toLocaleString('es-AR'));
const num1 = (v) => (v == null || Number.isNaN(v) ? '-' : v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

export default function CrushingHoy({ datos }) {
  const { meta } = datos;
  const V = useValores(datos);
  const { v } = V;
  const R = useMemo(() => calcular(V.entradas), [V.entradas]);
  const faltaRetencion = ['dexPoroto', 'dexHarina', 'dexAceite'].filter((k) => v[k] == null);

  // Barras: del menor margen al mayor, con el cero donde caiga
  const barras = R ? R.alternativas.filter((a) => a.margen != null) : [];
  const minimo = Math.min(0, ...barras.map((a) => a.margen));
  const maximo = Math.max(0, ...barras.map((a) => a.margen));
  const rango = maximo - minimo || 1;
  const cero = ((0 - minimo) / rango) * 100;
  const volumen = v.volumen ?? 0;
  const brecha = (cargado, indiferencia) => {
    if (cargado == null || indiferencia == null) return null;
    const d = cargado - indiferencia;
    return `el cargado (${num0(cargado)}) está ${num0(Math.abs(d))} ${d >= 0 ? 'arriba' : 'abajo'}`;
  };

  return (
    <div className="cx">
      <PuntoDePartida V={V} />

      {faltaRetencion.length > 0 && (
        <p className="cx-aviso">Falta la retención de {faltaRetencion.map((k) => RETENCIONES.find((r) => r.id === k).label.toLowerCase()).join(', ')}: la cuenta la toma como cero hasta que se cargue.</p>
      )}

      {!R ? (
        <p className="cx-aviso">Faltan datos para hacer la cuenta: como mínimo, el FOB del poroto y de la harina, los rendimientos y el consumo de aceite.</p>
      ) : (
        <>
          <div className="chart-card cx-bloque">
            <div className="chart-card-header">
              <div>
                <span className="chart-card-title">Qué deja cada destino [usd por tonelada de soja]</span>
                <span className="chart-card-subtitle">Contra exportar el poroto sin moler · a la derecha, cuánto paga ese destino por la tonelada de aceite</span>
              </div>
            </div>
            <div className="cx-barras">
              {R.alternativas.map((a) => {
                const esMejor = R.mejor?.id === a.id;
                if (a.margen == null) {
                  return (
                    <div key={a.id} className="cx-fila cx-sin-dato">
                      <span className="cx-nombre">{a.nombre}</span>
                      <div className="cx-pista" />
                      <span className="cx-valor">sin precio</span>
                      <span className="cx-equiv" />
                    </div>
                  );
                }
                const izquierda = ((Math.min(a.margen, 0) - minimo) / rango) * 100;
                const ancho = (Math.abs(a.margen) / rango) * 100;
                return (
                  <div key={a.id} className={`cx-fila ${esMejor ? 'cx-mejor' : ''} ${a.margen < 0 ? 'cx-negativo' : ''}`}>
                    <span className="cx-nombre">{a.nombre}</span>
                    <div className="cx-pista">
                      <span className="cx-cero" style={{ left: `${cero}%` }} />
                      <span className="cx-barra" style={{ left: `${izquierda}%`, width: `${Math.max(ancho, 0.4)}%` }} />
                    </div>
                    <span className="cx-valor">{num1(a.margen)}</span>
                    <span className="cx-equiv">{a.id === 'poroto' ? `piso ${num0(a.x)}` : `aceite a ${num0(a.x)}`}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="kpi-grid cx-tarjetas">
            <div className="kpi-card">
              <div className="kpi-label">Piso del aceite</div>
              <div className="kpi-val">{num0(R.piso)} <span className="kpi-unidad">usd/t</span></div>
              <div className="kpi-sub">Lo que tiene que valer el aceite para que moler deje lo mismo que exportar el poroto. En biodiésel: {num0(R.pisoBio)} usd/t.</div>
            </div>
            <div className="kpi-card tone-pos">
              <div className="kpi-label">Mejor destino</div>
              <div className="kpi-val kpi-val-texto">{R.mejor?.nombre ?? '-'}</div>
              <div className="kpi-sub">
                {R.mejor ? `${num1(R.mejor.margen)} usd por tonelada de soja` : ''}
                {R.mejor && volumen > 0 ? ` · ${num1((R.mejor.margen * volumen) / 1e6)} millones de usd en ${num0(volumen)} t` : ''}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Biodiésel local: indiferencia</div>
              <div className="kpi-val">{num0(R.indiferencia?.bioLocal)} <span className="kpi-unidad">usd/t</span></div>
              <div className="kpi-sub">Por encima conviene más que {R.mejorSinBio?.corto.toLowerCase() ?? '-'}{brecha(v.bioLocal, R.indiferencia?.bioLocal) ? `; ${brecha(v.bioLocal, R.indiferencia?.bioLocal)}.` : '.'}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Biodiésel FOB: indiferencia</div>
              <div className="kpi-val">{num0(R.indiferencia?.bioFob)} <span className="kpi-unidad">usd/t</span></div>
              <div className="kpi-sub">Por encima conviene más que {R.mejorSinBio?.corto.toLowerCase() ?? '-'}{brecha(v.bioFob, R.indiferencia?.bioFob) ? `; ${brecha(v.bioFob, R.indiferencia?.bioFob)}.` : '.'}</div>
            </div>
          </div>

          <details className="chart-card cx-bloque cx-plegable">
            <summary>Matriz de precios de indiferencia</summary>
            <p className="chart-card-subtitle">Cada fila es un destino; cada columna, el precio que tendría que tener ese producto para dejar lo mismo que el destino de la fila. En usd/t.</p>
            <div className="cx-tabla-scroll">
              <table className="cx-tabla">
                <thead>
                  <tr><th>Para igualar a</th><th>Aceite neto</th><th>Aceite FOB</th><th>Biodiésel local</th><th>Biodiésel FOB</th><th>Margen usd/t soja</th></tr>
                </thead>
                <tbody>
                  {R.matriz.map((m) => (
                    <tr key={m.id}>
                      <th>{m.nombre}</th>
                      <td>{num0(m.aceite)}</td><td>{num0(m.aceiteFob)}</td><td>{num0(m.bioLocal)}</td><td>{num0(m.bioFob)}</td><td>{num1(m.margen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <details className="chart-card cx-bloque cx-plegable">
            <summary>Cómo se llega a cada número</summary>
            <div className="cx-tabla-scroll">
              <table className="cx-tabla cx-tabla-pasos">
                <tbody>
                  <tr><th>Poroto neto de exportación</th><td>{num1(R.netos.poroto)}</td><td>FOB menos retención y gastos</td></tr>
                  <tr><th>Harina neta de exportación</th><td>{num1(R.netos.harina)}</td><td>FOB menos retención y gastos</td></tr>
                  <tr><th>Aceite neto de exportación</th><td>{num1(R.netos.aceite)}</td><td>FOB menos retención y gastos</td></tr>
                  <tr><th>Biodiésel neto de exportación</th><td>{num1(R.netos.bioExpo)}</td><td>FOB dividido (1 + retención), menos gastos</td></tr>
                  <tr><th>Costo de transformar aceite en biodiésel</th><td>{num1(R.transformacion)}</td><td>metanol ({num1(R.costoMetanol)}) más otros costos, menos glicerina · por tonelada de biodiésel</td></tr>
                  <tr><th>Falta recuperar por tonelada de soja</th><td>{num1(R.faltaRecuperar)}</td><td>poroto neto más molienda, menos lo que deja la harina</td></tr>
                  <tr><th>Piso del aceite</th><td>{num1(R.piso)}</td><td>lo anterior, repartido en el aceite que da la tonelada de soja</td></tr>
                  <tr><th>Biodiésel por tonelada de soja</th><td>{R.bioPorSoja.toLocaleString('es-AR', { maximumFractionDigits: 4 })}</td><td>toneladas</td></tr>
                  <tr><th>Efecto de la harina sobre el piso</th><td>{num1(R.sensibilidadHarina)}</td><td>usd/t de aceite por cada dólar que sube la harina neta</td></tr>
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}

      <details className="chart-card cx-bloque cx-plegable">
        <summary>De dónde sale cada dato</summary>
        <ul className="cx-fuentes">
          <li><strong>Poroto, harina y aceite FOB:</strong> {meta.fuentes.fob}.</li>
          <li><strong>Aceite en el mercado local:</strong> {meta.fuentes.fas_jj}; o {meta.fuentes.fas_minagri}.</li>
          <li><strong>Biodiésel FOB:</strong> {[meta.fuentes.bio_fob_jj, ...(datos.privadas ?? []).filter((x) => x.uso === 'bio_fob').map((x) => x.fuente)].join('; o ')}.</li>
          <li><strong>Biodiésel en el mercado local:</strong> {meta.fuentes.bio_oficial}.</li>
          <li><strong>Retenciones:</strong> {meta.fuentes.retenciones}. La del biodiésel es nominal sobre la base que no incluye el propio derecho.</li>
          <li><strong>Costos y rendimientos:</strong> parámetros de trabajo del modelo; se pueden cambiar arriba.</li>
        </ul>
        <p className="chart-card-subtitle">Datos del {dia(meta.desde)} al {dia(meta.hasta)}, armados el {meta.generado}. Cálculo marginal, con capacidad ociosa: no incluye costos fijos, inversión, IVA ni financiación.</p>
      </details>
    </div>
  );
}
