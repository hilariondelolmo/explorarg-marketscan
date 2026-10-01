import { useMemo, useState } from 'react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  MESES, ULTIMO_MES, IDX_MES, CANALES_DIST, CANALES_COM, IMPORTACIONES, sumarCol, desdeRango,
} from '../../lib/gasoil.js';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import { useRelevamiento, useCajas, BloqueFijo, Tarjeta, TooltipSerie, RANGOS, TODAS } from './relevamiento.jsx';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import './GasOil.css';

const U = 'm³';
// Etiquetas del eje: miles con "K" y millones con "M", con espacio duro para
// que no se partan en dos líneas
const abreviar = (v, divisor, letra) => `${(v / divisor).toLocaleString('es-AR', { maximumFractionDigits: 1 })}\u00A0${letra}`;
const eje = (v) => (Math.abs(v) >= 1e6 ? abreviar(v, 1e6, 'M') : Math.abs(v) >= 1000 ? abreviar(v, 1000, 'K') : fmt.int(v));
const CANAL = [
  { cd: 0, nombre: 'Minorista', clave: 'v0' },
  { cd: 1, nombre: 'Mayorista', clave: 'v1' },
];
// Apertura anual: el año de cada mes y el año en curso, que llega hasta el último mes relevado
const ANIO_DE = MESES.map((m) => Number(m.slice(0, 4)));
const ANIO_ULTIMO = Number(ULTIMO_MES.slice(0, 4));
const ANIO_EN_CURSO = ULTIMO_MES.slice(5, 7) === '12' ? null : String(ANIO_ULTIMO);
const TRAMO_EN_CURSO = `${fmt.monthOnly(`${ANIO_ULTIMO}-01`)} a ${fmt.monthOnly(ULTIMO_MES)}`;
const ejeAnio = (a) => (a === ANIO_EN_CURSO ? `${a}*` : a);
const rotuloAnio = (a) => (a === ANIO_EN_CURSO ? `${a} (${TRAMO_EN_CURSO})` : a);

/**
 * La página de Minorista y mayorista en volumen (pedido de HDO del
 * 29/09/2026): la misma estructura que la de precios, con los m³ de gas oil
 * grado 2 y 3 del canal minorista y del mayorista, y las toneladas de gas oil
 * importado. Sin filtro de tipo de precio. El volumen es el que declararon
 * las bocas que informaron precio en el relevamiento (el mismo de Estructura
 * del mercado): no es el total del mercado y baja cuando informan menos
 * bocas. Por eso cada gráfico trae, en barras, la cantidad de estaciones
 * relevadas (pedido de HDO). Los gráficos se abren por mes o por año (suma de
 * los meses del año; el año en curso va marcado porque está incompleto).
 */
export default function MinoristaMayoristaVolumen({ seccion }) {
  const C = useChartColors();
  const F = useRelevamiento({ modo: 'abierto' });
  const {
    D, DX, listo, error, OPERADORES, operador, conOperador, mes, mesAnterior, cd, cdN, ccN, tiposIdx, cambiarCd, cambiarCc,
    fMes, fBase, fCanal, fBand, fProv, claves, etiquetaCanal, etiquetaFiltro, etiquetaProvincias, ambitoProv,
  } = F;
  const [abiertos, alternar] = useCajas({ kpi: false, graficos: true, importado: false, tabla: false });
  const [rango, setRango] = useState('5a');
  const [vista, setVista] = useState('mensual'); // 'mensual' | 'anual'
  const anual = vista === 'anual';
  const desde = desdeRango(rango, ULTIMO_MES);
  const desdeAnio = Number(desde.slice(0, 4));
  // Meses (y años) con relevamiento: en ellos un canal sin ventas vale 0; en los demás no hay dato
  const relevados = useMemo(() => new Set(D?.mes), [D]);
  const aniosRelevados = useMemo(() => new Set([...relevados].map((i) => ANIO_DE[i])), [relevados]);

  // Series por canal de distribución (minorista y mayorista) para cada grado,
  // por mes o por año. El año suma todos sus meses relevados, así que el rango
  // solo define desde qué año se muestra.
  const series = useMemo(() => {
    if (!listo) return { g2: [], g3: [], canales: [] };
    const f = (i) => fCanal(i) && fBand(i) && fProv(i);
    const periodo = anual ? (i) => ANIO_DE[DX.mes[i]] : (i) => DX.mes[i];
    // Estaciones relevadas de cada mes (bocas distintas con volumen del grado).
    // Con operador o estación, los datos vienen por boca y se cuentan
    // directo. Si no, salen de las columnas del cruce: p cuenta cada boca una
    // sola vez (todos los canales de comercialización) y q las de un canal.
    const estaciones = (grado) => {
      const W = DX[`w${grado}`];
      const porMes = new Map();
      if (conOperador) {
        const bocas = new Map();
        for (let i = 0; i < DX.mes.length; i++) {
          if (!W[i] || !f(i)) continue;
          if (!bocas.has(DX.mes[i])) bocas.set(DX.mes[i], new Set());
          bocas.get(DX.mes[i]).add(DX.boca[i]);
        }
        for (const [m, s] of bocas) porMes.set(m, s.size);
      } else {
        const N = DX[`${ccN != null ? 'q' : 'p'}${grado}`];
        for (let i = 0; i < DX.mes.length; i++) {
          if (N[i] && f(i)) porMes.set(DX.mes[i], (porMes.get(DX.mes[i]) || 0) + N[i]);
        }
      }
      return porMes;
    };
    // En la apertura anual, el promedio de los meses relevados del año
    const estacionesAnio = (porMes, a) => {
      let suma = 0;
      let meses = 0;
      for (const i of relevados) {
        if (ANIO_DE[i] !== a) continue;
        suma += porMes.get(i) || 0;
        meses += 1;
      }
      return meses ? suma / meses : null;
    };
    const armar = (grado) => {
      const m = sumarCol(DX, f, (i) => DX.cd[i] * 10000 + periodo(i), grado);
      const est = estaciones(grado);
      const pts = [];
      const punto = (fecha, k, hayDato) => {
        const p = { fecha, est: anual ? estacionesAnio(est, k) : est.get(k) ?? (hayDato ? 0 : null) };
        for (const c of CANAL) p[c.clave] = m.get(c.cd * 10000 + k) ?? (hayDato ? 0 : null);
        pts.push(p);
      };
      if (anual) for (let a = desdeAnio; a <= ANIO_ULTIMO; a++) punto(String(a), a, aniosRelevados.has(a));
      else for (let i = IDX_MES.get(desde); i < MESES.length; i++) punto(MESES[i], i, relevados.has(i));
      return pts;
    };
    const g2 = armar(2);
    const g3 = armar(3);
    const canales = CANAL.filter((c) => (cdN == null || cdN === c.cd)
      && (g2.some((p) => p[c.clave] > 0) || g3.some((p) => p[c.clave] > 0)));
    return { g2, g3, canales };
  }, [...claves, rango, vista, relevados]);

  // Resumen del mes elegido: volumen de la selección (o de un canal)
  const resumen = (f, canal) => {
    const idx = IDX_MES.get(f);
    const filtro = (i) => DX.mes[i] === idx && fCanal(i) && fBand(i) && fProv(i) && (canal == null || DX.cd[i] === canal);
    const g2 = sumarCol(DX, filtro, () => 1, 2).get(1) || 0;
    const g3 = sumarCol(DX, filtro, () => 1, 3).get(1) || 0;
    return { g2, g3, total: g2 + g3 };
  };
  const kpi = useMemo(() => {
    if (!listo) return null;
    const ant = (canal) => (mesAnterior ? resumen(mesAnterior, canal) : null);
    return {
      sel: resumen(mes, null), selAnt: ant(null),
      min: resumen(mes, 0), minAnt: ant(0),
      may: resumen(mes, 1), mayAnt: ant(1),
    };
  }, claves);

  // Tabla del mes: volumen por canal de distribución × canal de
  // comercialización. Ignora los dos filtros de canal (como la tabla de la
  // página de precios): así se pasa de un canal a otro con un clic; el resto
  // de los filtros sí aplica.
  const tabla = useMemo(() => {
    if (!listo) return { filas: [], g2: 0, g3: 0, vol: 0 };
    const f = (i) => fMes(i) && fBase(i) && tiposIdx.has(DX.tn[i]) && fBand(i) && fProv(i);
    const clave = (i) => DX.cd[i] * 100 + DX.cc[i];
    const g2 = sumarCol(DX, f, clave, 2);
    const g3 = sumarCol(DX, f, clave, 3);
    const todas = new Set([...g2.keys(), ...g3.keys()]);
    const filas = [...todas].map((k) => {
      const v2 = g2.get(k) || 0;
      const v3 = g3.get(k) || 0;
      return { k, cd: Math.floor(k / 100), cc: k % 100, g2: v2, g3: v3, vol: v2 + v3 };
    });
    filas.sort((a, b) => a.cd - b.cd || b.vol - a.vol);
    const suma = (campo) => filas.reduce((s, r) => s + r[campo], 0);
    return { filas, g2: suma('g2'), g3: suma('g3'), vol: suma('vol') };
  }, claves);

  const importaciones = useMemo(() => {
    if (!anual) return IMPORTACIONES.filter((m) => m.fecha >= desde).map((m) => ({ fecha: m.fecha, ton: m.ton }));
    const porAnio = new Map();
    for (const m of IMPORTACIONES) porAnio.set(m.fecha.slice(0, 4), (porAnio.get(m.fecha.slice(0, 4)) || 0) + (m.ton || 0));
    const pts = [];
    for (let a = desdeAnio; a <= ANIO_ULTIMO; a++) pts.push({ fecha: String(a), ton: porAnio.get(String(a)) ?? 0 });
    return pts;
  }, [desde, vista]);
  const impMes = IMPORTACIONES.find((m) => m.fecha === mes) || null;
  const impAnt = IMPORTACIONES.find((m) => m.fecha === mesAnterior) || null;
  const uImp = [...IMPORTACIONES].reverse().find((m) => m.ton > 0); // último mes con despachos, para el resumen de la caja

  if (error) return <div className="section-placeholder">No se pudo cargar el relevamiento: {error}</div>;

  const ambos = cd === 'ambos';
  // Los volúmenes son totales: con provincias elegidas, las tarjetas y el resumen lo dicen
  const enProv = etiquetaProvincias ? ` · ${etiquetaProvincias}` : '';
  // En el resumen de la caja van abreviados para entrar en dos líneas; las tarjetas traen el número entero
  const resumenKpi = !kpi ? 'cargando…'
    : `${etiquetaProvincias ? `${etiquetaProvincias} · ` : ''}${ambos
      ? `GO GR2 minorista ${fmt.compact(kpi.min.g2)} · mayorista ${fmt.compact(kpi.may.g2)} · GO GR3 minorista ${fmt.compact(kpi.min.g3)} · mayorista ${fmt.compact(kpi.may.g3)} ${U}`
      : `GO GR2 ${fmt.compact(kpi.sel.g2)} · GO GR3 ${fmt.compact(kpi.sel.g3)} · total ${fmt.compact(kpi.sel.total)} ${U}`}`;
  const cajas = [
    { id: 'kpi', titulo: 'Resultado del relevamiento', detalle: resumenKpi },
    { id: 'graficos', titulo: 'Gráficos de volumen', detalle: `Minorista y mayorista · GO GR2 y GR3 · ${U} por ${anual ? 'año' : 'mes'}` },
    {
      id: 'importado', titulo: 'Gas oil importado',
      detalle: uImp ? `${fmt.int(uImp.ton)} ton en ${fmt.monthShort(uImp.fecha)}` : 'sin despachos en el período',
    },
    {
      id: 'tabla', titulo: 'Volumen por canal',
      detalle: `Canal de distribución × canal de comercialización · GO GR2, GO GR3 y total · ${tabla.filas.length} ${tabla.filas.length === 1 ? 'fila' : 'filas'}`,
    },
  ];

  const tarjetas = kpi && (
    <div className="kpi-grid go-kpis-fila">
      {ambos ? (
        <>
          <Tarjeta label={`Minorista · grado 2${enProv}`} valor={kpi.min.g2} base={kpi.minAnt?.g2} unidad={U} sufijo={U} mesAnt={mesAnterior} />
          <Tarjeta label={`Mayorista · grado 2${enProv}`} valor={kpi.may.g2} base={kpi.mayAnt?.g2} unidad={U} sufijo={U} mesAnt={mesAnterior} tono="info" />
          <Tarjeta label={`Minorista · grado 3${enProv}`} valor={kpi.min.g3} base={kpi.minAnt?.g3} unidad={U} sufijo={U} mesAnt={mesAnterior} />
          <Tarjeta label={`Mayorista · grado 3${enProv}`} valor={kpi.may.g3} base={kpi.mayAnt?.g3} unidad={U} sufijo={U} mesAnt={mesAnterior} tono="info" />
        </>
      ) : (
        <>
          <Tarjeta label={`${ambitoProv} · grado 2`} valor={kpi.sel.g2} base={kpi.selAnt?.g2} unidad={U} sufijo={U} mesAnt={mesAnterior} />
          <Tarjeta label={`${ambitoProv} · grado 3`} valor={kpi.sel.g3} base={kpi.selAnt?.g3} unidad={U} sufijo={U} mesAnt={mesAnterior} />
          <Tarjeta label={`${ambitoProv} · grados 2 y 3`} valor={kpi.sel.total} base={kpi.selAnt?.total} unidad={U} sufijo={U} mesAnt={mesAnterior} tono="pos" />
          <Tarjeta label="Gas oil importado" valor={impMes?.ton ?? null} base={impAnt?.ton} unidad="ton" sufijo="ton" mesAnt={mesAnterior} tono="warn" />
        </>
      )}
    </div>
  );

  // Apertura (por mes o por año) antes del rango, como en Precio surtidor
  const selectores = (
    <div className="go-selectores-grafico">
      <div className="chart-range-selector">
        <button className={anual ? '' : 'active'} onClick={() => setVista('mensual')}>Mensual</button>
        <button className={anual ? 'active' : ''} onClick={() => setVista('anual')}>Anual</button>
      </div>
      <div className="chart-range-selector">
        {RANGOS.map(([id, label]) => (
          <button key={id} className={rango === id ? 'active' : ''} onClick={() => setRango(id)}>{label}</button>
        ))}
      </div>
    </div>
  );
  const ejeFecha = (v) => (anual ? ejeAnio(v) : fmt.monthShort(v));
  const notaAnio = anual && ANIO_EN_CURSO && (
    <div className="chart-legend-item">* {ANIO_EN_CURSO}: {TRAMO_EN_CURSO}</div>
  );

  const colorCanal = { 0: C.oil, 1: C.exp };
  const cardSerie = (k, titulo) => (
    <div className="chart-card" key={k}>
      <div className="chart-card-header">
        <div>
          <span className="chart-card-title">{titulo} · volumen por canal de distribución</span>
          <span className="chart-card-subtitle">
            Volumen [{U}] · total del {anual ? 'año' : 'mes'} · {etiquetaCanal}{etiquetaFiltro ? ` · ${etiquetaFiltro}` : ''} · barras:
            estaciones relevadas{anual ? ', promedio mensual del año' : ''}
          </span>
        </div>
        {selectores}
      </div>
      <div className="chart-card-body">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={series[k]} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={ejeFecha} minTickGap={anual ? 8 : 40} />
            <YAxis yAxisId="est" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.int(v)} domain={[0, 'auto']} width={52} />
            <YAxis yAxisId="vol" orientation="right" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={eje} domain={[0, 'auto']} width={58} />
            <Tooltip
              content={<TooltipSerie unidad={U} anual={anual} rotulo={anual ? rotuloAnio : undefined} extraFmt={{ est: (v) => fmt.int(v) }} />}
              cursor={{ stroke: C.axis }}
            />
            <Bar yAxisId="est" dataKey="est" name={`Estaciones relevadas${anual ? ' (promedio mensual)' : ''}`} fill={C.neutralFill} />
            {series.canales.map((c) => (
              <Line key={c.clave} yAxisId="vol" dataKey={c.clave} name={`${c.nombre} [${U}]`} stroke={colorCanal[c.cd]} strokeWidth={2} dot={anual} connectNulls />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
        <div className="chart-legend">
          {series.canales.map((c) => (
            <div key={c.cd} className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colorCanal[c.cd] }} />{c.nombre} · volumen del {anual ? 'año' : 'mes'} (eje derecho)</div>
          ))}
          <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.neutral }} />Estaciones relevadas{anual ? ', promedio mensual' : ''} (eje izquierdo)</div>
          {notaAnio}
        </div>
      </div>
    </div>
  );

  return (
    <div className="go-seccion">
      <BloqueFijo
        seccion={seccion} tituloDefault="Volumen minorista y mayorista" F={F}
        cajas={cajas} abiertos={abiertos} alternar={alternar} sinTipoPrecio
      />

      {abiertos.kpi && kpi && <div className="go-desplegable-cuerpo">{tarjetas}</div>}
      {!listo ? (
        <div className="section-placeholder">
          {conOperador ? `Cargando los datos de ${OPERADORES[operador]}…` : 'Cargando el relevamiento (10 MB, una sola vez)…'}
        </div>
      ) : (
        <>
          {abiertos.graficos && (
            <div className="go-charts-grid">
              {cardSerie('g2', 'Gas oil grado 2')}
              {cardSerie('g3', 'Gas oil grado 3')}
            </div>
          )}

          {abiertos.importado && (
            <div className="chart-card">
              <div className="chart-card-header">
                <div>
                  <span className="chart-card-title">Gas oil importado · volumen</span>
                  <span className="chart-card-subtitle">toneladas del {anual ? 'año' : 'mes'} (despachos de importación, sin CAMMESA) · no responde a los filtros del relevamiento</span>
                </div>
                {selectores}
              </div>
              <div className="chart-card-body">
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={importaciones} margin={{ top: 10, right: 26, left: 0, bottom: 0 }}>
                    <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={ejeFecha} minTickGap={anual ? 8 : 40} />
                    <YAxis tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={eje} width={58} />
                    <Tooltip content={<TooltipSerie unidad="ton" anual={anual} rotulo={anual ? rotuloAnio : undefined} />} cursor={{ stroke: C.axis }} />
                    <Bar dataKey="ton" name="Toneladas importadas" fill={C.oil} />
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="chart-legend">
                  <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.oil }} />Toneladas importadas</div>
                  {notaAnio}
                </div>
              </div>
            </div>
          )}

          {abiertos.tabla && (
            <div className="go-desplegable-cuerpo mh-tabla-scroll">
              <table className="mh-tabla go-tabla">
                <thead>
                  <tr>
                    <th>Canal de distribución</th>
                    <th>Canal de comercialización</th>
                    <th className="num">Grado 2 ({U})</th>
                    <th className="num">Grado 3 ({U})</th>
                    <th className="num">Total ({U})</th>
                    <th className="num">Participación</th>
                  </tr>
                </thead>
                <tbody>
                  {tabla.filas.map((r) => {
                    const activa = cdN === r.cd && ccN === r.cc;
                    return (
                      <tr
                        key={r.k} className={activa ? 'activa' : ''}
                        onClick={() => { cambiarCd(activa ? 'ambos' : String(r.cd)); cambiarCc(activa ? TODAS : String(r.cc)); }}
                      >
                        <td>{CANALES_DIST[r.cd]}</td>
                        <td>{CANALES_COM[r.cc]}</td>
                        <td className="num">{fmt.int(r.g2)}</td>
                        <td className="num">{fmt.int(r.g3)}</td>
                        <td className="num">{fmt.int(r.vol)}</td>
                        <td className="num">{fmt.pct(tabla.vol ? (r.vol / tabla.vol) * 100 : 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td>minorista y mayorista, todos los canales</td>
                    <td className="num">{fmt.int(tabla.g2)}</td>
                    <td className="num">{fmt.int(tabla.g3)}</td>
                    <td className="num">{fmt.int(tabla.vol)}</td>
                    <td className="num">{fmt.pct(tabla.vol ? 100 : 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <p className="note go-nota">
            Fuente: Secretaría de Energía, relevamiento de precios Res. 1104/2004 y despachos de importación de gas oil
            (sin CAMMESA, que importa para las usinas eléctricas; como la página Importaciones).
            El volumen es el que declararon las bocas de expendio y los comercializadores que informaron precio en el
            mes: no es el total del mercado, y baja cuando informan menos bocas. Estaciones relevadas: bocas distintas
            con volumen de ese grado, cada una contada una sola vez. La tabla muestra todos los canales aunque haya uno
            filtrado: clic en una fila filtra ese canal en el resto de la sección; otro clic lo suelta. Último mes:
            {' '}{fmt.monthShort(ULTIMO_MES)}.
          </p>
        </>
      )}
    </div>
  );
}
