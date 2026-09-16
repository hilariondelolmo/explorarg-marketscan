import { useMemo, useState } from 'react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  MESES, ULTIMO_MES, IDX_MES, CANALES_DIST, CANALES_COM, IMPORTACIONES,
  convertir, ponderarCol, desdeRango, fmtPrecio,
} from '../../lib/gasoil.js';
import corte from '../../data/corte.json';
import evidencia from '../../data/evidencia.json';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import { useRelevamiento, useCajas, BloqueFijo, Tarjeta, TooltipSerie, RANGOS, TODAS } from './relevamiento.jsx';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import './GasOil.css';

const DENSIDAD_BIO = corte.densidad_bio;
const MEZCLA = new Map(corte.mensual.map((m) => [m.fecha, m.real]));
// Precio del biodiesel de cupo (Res. 963, categoría mediana) en $/ton
const PRECIO_BIO = new Map(evidencia.precio_biodiesel.map((p) => [p.fecha, p.mediana]));
const CANAL = [
  { cd: 0, nombre: 'Minorista', clave: 'p0', fosil: 'f0' },
  { cd: 1, nombre: 'Mayorista', clave: 'p1', fosil: 'f1' },
];

/**
 * Réplica del tablero "ARG GO MARKET BTB BTC": precio ponderado del gas oil
 * grado 2 y 3 en el canal minorista y en el mayorista, con la misma apertura
 * que Precio surtidor (los ocho filtros; con operador o estación, sus bocas),
 * y el gas oil importado (CIF). Para el precio sin impuestos se agrega el
 * "gas oil fósil": el precio neto del biodiesel que lleva mezclado, con la
 * mezcla real del mes y el precio 963 (fórmula del workbook).
 */
export default function MinoristaMayorista({ seccion }) {
  const C = useChartColors();
  const F = useRelevamiento({ modo: 'abierto' });
  const {
    DX, listo, error, OPERADORES, operador, conOperador, mes, mesAnterior, tipo, conv, cd, cdN, ccN, tiposIdx, cambiarCd, cambiarCc,
    fMes, fBase, fCanal, fBand, fProv, claves, etiquetaCanal, etiquetaFiltro, ambito,
  } = F;
  const [abiertos, alternar] = useCajas({ kpi: false, graficos: true, importado: false, tabla: false });
  const [rango, setRango] = useState('5a');
  const desde = desdeRango(rango, ULTIMO_MES);
  const conFosil = tipo.campo === 'n';

  // Gas oil fósil: neto del biodiesel mezclado (solo tiene sentido sin impuestos), en $/l
  const fosil = (precioArs, f) => {
    if (precioArs == null) return null;
    const mezcla = MEZCLA.get(f);
    const bioTon = PRECIO_BIO.get(f);
    if (mezcla == null || !bioTon) return null;
    const bioL = (bioTon * DENSIDAD_BIO) / 1000; // $/ton → $/l
    return (precioArs - mezcla * bioL) / (1 - mezcla);
  };

  // Series mensuales por canal de distribución (minorista y mayorista) para cada grado
  const series = useMemo(() => {
    if (!listo) return { g2: [], g3: [], canales: [] };
    const f = (i) => fCanal(i) && fBand(i) && fProv(i);
    const armar = (grado) => {
      const m = ponderarCol(DX, f, (i) => DX.cd[i] * 10000 + DX.mes[i], tipo.campo, grado);
      const pts = [];
      for (let i = IDX_MES.get(desde); i < MESES.length; i++) {
        const fecha = MESES[i];
        const p = { fecha };
        for (const c of CANAL) {
          const v = m.get(c.cd * 10000 + i);
          const precioArs = v ? v.precio : null;
          p[c.clave] = convertir(precioArs, fecha, tipo);
          if (grado === 2 && conFosil) p[c.fosil] = convertir(fosil(precioArs, fecha), fecha, tipo);
        }
        pts.push(p);
      }
      return pts;
    };
    const g2 = armar(2);
    const g3 = armar(3);
    const canales = CANAL.filter((c) => (cdN == null || cdN === c.cd)
      && (g2.some((p) => p[c.clave] != null) || g3.some((p) => p[c.clave] != null)));
    return { g2, g3, canales };
  }, [...claves, rango]);

  // Resumen del mes elegido: precio ponderado, volumen y bocas de la selección (o de un canal)
  const resumen = (f, canal) => {
    const idx = IDX_MES.get(f);
    const filtro = (i) => DX.mes[i] === idx && fCanal(i) && fBand(i) && fProv(i) && (canal == null || DX.cd[i] === canal);
    const g2 = ponderarCol(DX, filtro, () => 1, tipo.campo, 2).get(1);
    const g3 = ponderarCol(DX, filtro, () => 1, tipo.campo, 3).get(1);
    return {
      g2: g2 ? convertir(g2.precio, f, tipo) : null,
      g3: g3 ? convertir(g3.precio, f, tipo) : null,
      fosil: g2 ? convertir(fosil(g2.precio, f), f, tipo) : null,
      vol: (g2?.w || 0) + (g3?.w || 0), eess: g2?.e || g3?.e || 0,
    };
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

  // Tabla del mes: precio y volumen por canal de distribución × canal de
  // comercialización. Ignora los dos filtros de canal (como la tabla por
  // bandera de Precio surtidor): así se pasa de un canal a otro con un clic;
  // el resto de los filtros sí aplica.
  const tabla = useMemo(() => {
    if (!listo) return { filas: [], vol: 0, g2: null, g3: null };
    const f = (i) => fMes(i) && fBase(i) && tiposIdx.has(DX.tn[i]) && fBand(i) && fProv(i);
    const clave = (i) => DX.cd[i] * 100 + DX.cc[i];
    const g2 = ponderarCol(DX, f, clave, tipo.campo, 2);
    const g3 = ponderarCol(DX, f, clave, tipo.campo, 3);
    const todas = new Set([...g2.keys(), ...g3.keys()]);
    const filas = [...todas].map((k) => ({
      k, cd: Math.floor(k / 100), cc: k % 100,
      g2: conv(g2.get(k)?.precio), g3: conv(g3.get(k)?.precio),
      vol: (g2.get(k)?.w || 0) + (g3.get(k)?.w || 0),
    }));
    filas.sort((a, b) => a.cd - b.cd || b.vol - a.vol);
    const suma = (m, campo) => [...m.values()].reduce((s, a) => s + a[campo], 0);
    const w2 = suma(g2, 'w');
    const w3 = suma(g3, 'w');
    return {
      filas, vol: w2 + w3,
      g2: w2 ? conv(suma(g2, 'pw') / w2) : null, g3: w3 ? conv(suma(g3, 'pw') / w3) : null,
    };
  }, claves);

  const importaciones = useMemo(() => IMPORTACIONES
    .filter((m) => m.fecha >= desde)
    .map((m) => ({ fecha: m.fecha, ton: m.ton, cif: m.cif_usd_ton })), [desde]);
  const impMes = IMPORTACIONES.find((m) => m.fecha === mes) || null;
  const uImp = importaciones.at(-1);

  if (error) return <div className="section-placeholder">No se pudo cargar el relevamiento: {error}</div>;

  const u = tipo.unidad;
  const ambos = cd === 'ambos';
  const resumenKpi = !kpi ? 'cargando…'
    : ambos
      ? `GO GR2 minorista ${fmtPrecio(kpi.min.g2, u)} · mayorista ${fmtPrecio(kpi.may.g2, u)} · GO GR3 minorista ${fmtPrecio(kpi.min.g3, u)} · mayorista ${fmtPrecio(kpi.may.g3, u)} ${u}`
      : `GO GR2 ${fmtPrecio(kpi.sel.g2, u)} · GO GR3 ${fmtPrecio(kpi.sel.g3, u)} ${u} · ${fmt.compact(kpi.sel.vol)} m³`;
  const cajas = [
    { id: 'kpi', titulo: 'Resultado del relevamiento', detalle: resumenKpi },
    {
      id: 'graficos', titulo: 'Gráficos de precios',
      detalle: `Minorista y mayorista · GO GR2 y GR3 · ${tipo.label.toLowerCase()}${conFosil ? ' · con gas oil fósil' : ''}`,
    },
    {
      id: 'importado', titulo: 'Gas oil importado',
      detalle: uImp ? `CIF ${fmt.int(uImp.cif)} usd/ton · ${fmt.int(uImp.ton)} ton en ${fmt.monthShort(uImp.fecha)}` : 'sin despachos en el período',
    },
    {
      id: 'tabla', titulo: 'Precio por canal',
      detalle: `Canal de distribución × canal de comercialización · GO GR2, GO GR3 y volumen · ${tabla.filas.length} ${tabla.filas.length === 1 ? 'fila' : 'filas'}`,
    },
  ];

  const tarjetas = kpi && (
    <div className="kpi-grid go-kpis-fila">
      {ambos ? (
        <>
          <Tarjeta label={`Minorista · grado 2 (${u})`} valor={kpi.min.g2} base={kpi.minAnt?.g2} unidad={u} mesAnt={mesAnterior} />
          <Tarjeta label={`Mayorista · grado 2 (${u})`} valor={kpi.may.g2} base={kpi.mayAnt?.g2} unidad={u} mesAnt={mesAnterior} tono="info" />
          <Tarjeta label={`Minorista · grado 3 (${u})`} valor={kpi.min.g3} base={kpi.minAnt?.g3} unidad={u} mesAnt={mesAnterior} />
          <Tarjeta label={`Mayorista · grado 3 (${u})`} valor={kpi.may.g3} base={kpi.mayAnt?.g3} unidad={u} mesAnt={mesAnterior} tono="info" />
        </>
      ) : (
        <>
          <Tarjeta label={`${ambito} · grado 2 (${u})`} valor={kpi.sel.g2} base={kpi.selAnt?.g2} unidad={u} mesAnt={mesAnterior} />
          <Tarjeta label={`${ambito} · grado 3 (${u})`} valor={kpi.sel.g3} base={kpi.selAnt?.g3} unidad={u} mesAnt={mesAnterior} />
          {conFosil ? (
            <Tarjeta label={`Gas oil fósil · grado 2 (${u})`} valor={kpi.sel.fosil} base={kpi.selAnt?.fosil} unidad={u} mesAnt={mesAnterior} tono="pos" />
          ) : (
            <div className="kpi-card">
              <div className="kpi-label">Volumen relevado</div>
              <div className="kpi-val">{fmt.compact(kpi.sel.vol)} <span className="kpi-unidad">m³</span></div>
              <div className="kpi-sub">{fmt.monthShort(mes)} · {etiquetaCanal}</div>
            </div>
          )}
          <div className="kpi-card tone-warn">
            <div className="kpi-label">Gas oil importado · CIF (usd/ton)</div>
            <div className="kpi-val">{impMes ? fmt.int(impMes.cif_usd_ton) : '-'}</div>
            <div className="kpi-sub">{impMes ? `${fmt.monthShort(mes)} · ${fmt.int(impMes.ton)} ton` : `sin despachos en ${fmt.monthShort(mes)}`}</div>
          </div>
        </>
      )}
    </div>
  );

  const colorCanal = { 0: C.oil, 1: C.exp };
  const cardSerie = (k, titulo, grado) => (
    <div className="chart-card" key={k}>
      <div className="chart-card-header">
        <div>
          <span className="chart-card-title">{titulo} · precio por canal de distribución</span>
          <span className="chart-card-subtitle">
            {tipo.label} [{u}] · {etiquetaCanal}{etiquetaFiltro ? ` · ${etiquetaFiltro}` : ''}
            {conFosil && grado === 2 ? ' · punteado: gas oil fósil, neto del biodiesel mezclado' : ''}
          </span>
        </div>
        <div className="go-selectores-grafico">
          <div className="chart-range-selector">
            {RANGOS.map(([id, label]) => (
              <button key={id} className={rango === id ? 'active' : ''} onClick={() => setRango(id)}>{label}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="chart-card-body">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={series[k]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.monthShort(v)} minTickGap={40} />
            <YAxis tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmtPrecio(v, u)} domain={['auto', 'auto']} width={58} />
            <Tooltip content={<TooltipSerie unidad={u} />} cursor={{ stroke: C.axis }} />
            {series.canales.map((c) => (
              <Line key={c.clave} dataKey={c.clave} name={`${c.nombre} [${u}]`} stroke={colorCanal[c.cd]} strokeWidth={2} dot={false} connectNulls />
            ))}
            {conFosil && grado === 2 && series.canales.map((c) => (
              <Line key={c.fosil} dataKey={c.fosil} name={`${c.nombre} · gas oil fósil`} stroke={colorCanal[c.cd]} strokeWidth={1.4} strokeDasharray="4 3" dot={false} connectNulls />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
        <div className="chart-legend">
          {series.canales.map((c) => (
            <div key={c.cd} className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colorCanal[c.cd] }} />{c.nombre} · precio ponderado</div>
          ))}
          {conFosil && grado === 2 && (
            <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.ink }} />Punteado: gas oil fósil (neto de biodiesel)</div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="go-seccion">
      <BloqueFijo
        seccion={seccion} tituloDefault="Mercado minorista y mayorista" F={F}
        cajas={cajas} abiertos={abiertos} alternar={alternar}
      />

      {abiertos.kpi && kpi && <div className="go-desplegable-cuerpo">{tarjetas}</div>}
      {!listo ? (
        <div className="section-placeholder">
          {conOperador ? `Cargando los datos de ${OPERADORES[operador]}…` : 'Cargando el relevamiento de precios (8 MB, una sola vez)…'}
        </div>
      ) : (
        <>
          {abiertos.graficos && (
            <div className="go-charts-grid">
              {cardSerie('g2', 'Gas oil grado 2', 2)}
              {cardSerie('g3', 'Gas oil grado 3', 3)}
            </div>
          )}

          {abiertos.importado && (
            <div className="chart-card">
              <div className="chart-card-header">
                <div>
                  <span className="chart-card-title">Gas oil importado · precio CIF y volumen</span>
                  <span className="chart-card-subtitle">usd/ton CIF (despachos de importación) · barras: toneladas del mes · no responde a los filtros del relevamiento</span>
                </div>
                <div className="go-selectores-grafico">
                  <div className="chart-range-selector">
                    {RANGOS.map(([id, label]) => (
                      <button key={id} className={rango === id ? 'active' : ''} onClick={() => setRango(id)}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="chart-card-body">
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={importaciones} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.monthShort(v)} minTickGap={40} />
                    <YAxis yAxisId="p" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.int(v)} width={58} domain={['auto', 'auto']} />
                    <YAxis yAxisId="ton" orientation="right" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.compact(v)} width={52} />
                    <Tooltip content={<TooltipSerie unidad="usd/ton" extraFmt={{ ton: (v) => `${fmt.int(v)} ton` }} />} cursor={{ stroke: C.axis }} />
                    <Bar yAxisId="ton" dataKey="ton" name="Toneladas importadas" fill={C.neutralFill} />
                    <Line yAxisId="p" dataKey="cif" name="CIF [usd/ton]" stroke={C.oil} strokeWidth={2} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="chart-legend">
                  <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.oil }} />Precio CIF usd/ton (eje izquierdo)</div>
                  <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.neutral }} />Toneladas importadas (eje derecho)</div>
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
                    <th className="num">Grado 2 ({u})</th>
                    <th className="num">Grado 3 ({u})</th>
                    <th className="num">Volumen m³</th>
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
                        <td className="num">{fmtPrecio(r.g2, u)}</td>
                        <td className="num">{fmtPrecio(r.g3, u)}</td>
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
                    <td className="num">{fmtPrecio(tabla.g2, u)}</td>
                    <td className="num">{fmtPrecio(tabla.g3, u)}</td>
                    <td className="num">{fmt.int(tabla.vol)}</td>
                    <td className="num">{fmt.pct(tabla.vol ? 100 : 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <p className="note go-nota">
            Fuente: Secretaría de Energía, relevamiento Res. 1104/2004 (ponderado por el volumen de cada boca; el precio
            surtidor solo existe al público) y despachos de importación de gas oil. Gas oil fósil = (precio sin impuestos −
            mezcla real × precio del biodiesel) / (1 − mezcla real), con la mezcla real del mes y el precio Res. 963 de la
            categoría mediana en $/l (densidad {DENSIDAD_BIO}). La tabla muestra todos los canales aunque haya uno
            filtrado: clic en una fila filtra ese canal en el resto de la sección; otro clic lo suelta. Último mes:
            {' '}{fmt.monthShort(ULTIMO_MES)}.
          </p>
        </>
      )}
    </div>
  );
}
