import { useMemo, useState } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  MESES, ULTIMO_MES, IDX_MES, PROVINCIAS, BANDERAS, convertir, ponderarCol, desdeRango, fmtPrecio, variacion,
  colorBandera, nombreProvincia, TC, DENSIDAD_GO,
} from '../../lib/gasoil.js';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import MapaProvincias from './MapaProvincias.jsx';
import { useRelevamiento, useCajas, BloqueFijo, Tarjeta, TooltipSerie, RANGOS, TODAS } from './relevamiento.jsx';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import './GasOil.css';

/**
 * Réplica del tablero "PRECIO SURTIDOR DASHBOARD (2)" del workbook 05:
 * relevamiento SE Res. 1104/2004 del gas oil grado 2 y 3. Filtros, en el
 * orden del tablero: mes, tipo de precio, canal de distribución, tipo de
 * negocio (multi), canal de comercialización, bandera, operador y provincia
 * (estado y carga de datos en useRelevamiento, compartido con las demás
 * secciones). Todo (mapa, tarjetas, tabla por bandera y series) responde a
 * los filtros.
 *
 * Precio ponderado = Σ(precio EESS × volumen EESS) / Σ volumen EESS. Los
 * datos finos viven en public/data/gasoil_retail.json y se cargan al abrir.
 */
export default function PrecioSurtidor({ seccion }) {
  const C = useChartColors();
  const F = useRelevamiento({ modo: 'surtidor', conMes: true });
  const {
    D, DX, listo, error, OPERADORES, BOCAS, mes, mi, mesAnterior, tipo, cdN, ccN, tiposIdx, bi, pi,
    bandera, setBandera, operador, conOperador, boca, elegirBoca, bocaSel, provincia, setProvincia, mesDatos,
    fCanal, fBand, fProv, fMes, conv, claves, etiquetaCanal, etiquetaFiltro, ambito,
  } = F;
  const [rango, setRango] = useState('5a');
  const [abiertos, alternar] = useCajas({ tabla: false, kpi: false, mapas: false, graficos: true });
  const [vista, setVista] = useState('mensual'); // 'mensual' | 'anual'

  const porProv = useMemo(() => {
    if (!listo) return null;
    const f = (i) => fMes(i) && fCanal(i) && fBand(i);
    return {
      g2: ponderarCol(DX, f, (i) => DX.prov[i], tipo.campo, 2),
      g3: ponderarCol(DX, f, (i) => DX.prov[i], tipo.campo, 3),
    };
  }, claves);

  const valoresMapa = useMemo(() => {
    const m = new Map();
    if (porProv) for (const [p, a] of porProv.g2) m.set(PROVINCIAS[p], conv(a.precio));
    return m;
  }, [porProv, tipo, mes]);

  const resumen = (f, conProv) => {
    const idx = IDX_MES.get(f);
    const filtro = (i) => DX.mes[i] === idx && fCanal(i) && fBand(i) && (!conProv || fProv(i));
    const g2 = ponderarCol(DX, filtro, () => 1, tipo.campo, 2).get(1);
    const g3 = ponderarCol(DX, filtro, () => 1, tipo.campo, 3).get(1);
    return {
      g2: g2 ? convertir(g2.precio, f, tipo) : null,
      g3: g3 ? convertir(g3.precio, f, tipo) : null,
      eess: g2?.e || g3?.e || 0, vol: (g2?.w || 0) + (g3?.w || 0),
    };
  };
  const pais = useMemo(() => (listo ? resumen(mes, false) : null), claves);
  const paisAnt = useMemo(() => (listo && mesAnterior ? resumen(mesAnterior, false) : null), claves);
  const prov = useMemo(() => (listo && provincia ? resumen(mes, true) : null), claves);
  const provAnt = useMemo(() => (listo && provincia && mesAnterior ? resumen(mesAnterior, true) : null), claves);

  const tabla = useMemo(() => {
    if (!listo) return [];
    const f = (i) => fMes(i) && fCanal(i) && fProv(i);
    const g2 = ponderarCol(DX, f, (i) => DX.band[i], tipo.campo, 2);
    const g3 = ponderarCol(DX, f, (i) => DX.band[i], tipo.campo, 3);
    const todas = new Set([...g2.keys(), ...g3.keys()]);
    const filas = [...todas].map((b) => ({
      bandera: BANDERAS[b],
      eess: g2.get(b)?.e || g3.get(b)?.e || 0,
      vol: (g2.get(b)?.w || 0) + (g3.get(b)?.w || 0),
      g2: conv(g2.get(b)?.precio), g3: conv(g3.get(b)?.precio),
    }));
    filas.sort((a, b) => b.vol - a.vol);
    return filas;
  }, claves);

  const series = useMemo(() => {
    if (!listo) return { g2: [], g3: [] };
    const f = (i) => fCanal(i) && fBand(i) && fProv(i);
    const desde = desdeRango(rango, ULTIMO_MES);
    const anual = vista === 'anual';
    // Anual: ponderado por volumen de todo el año; en usd, con el TC promedio del año
    const clave = anual ? (i) => MESES[DX.mes[i]].slice(0, 4) : (i) => DX.mes[i];
    const g2 = ponderarCol(DX, f, clave, tipo.campo, 2);
    const g3 = ponderarCol(DX, f, clave, tipo.campo, 3);
    const convAnual = (v, anio) => {
      if (tipo.moneda === 'ars') return v;
      const tcs = MESES.filter((m) => m.startsWith(anio)).map((m) => TC.get(m)).filter(Boolean);
      if (!tcs.length) return null;
      const tc = tcs.reduce((a, b) => a + b, 0) / tcs.length;
      const usdL = v / tc;
      return tipo.ton ? (usdL * 1000) / DENSIDAD_GO : usdL;
    };
    const armar = (m) => {
      const pts = [];
      if (anual) {
        for (let a = Number(desde.slice(0, 4)); a <= Number(ULTIMO_MES.slice(0, 4)); a++) {
          const v = m.get(String(a));
          pts.push({ fecha: String(a), precio: v ? convAnual(v.precio, String(a)) : null });
        }
      } else {
        for (let i = IDX_MES.get(desde); i < MESES.length; i++) {
          const v = m.get(i);
          pts.push({ fecha: MESES[i], precio: v ? convertir(v.precio, MESES[i], tipo) : null });
        }
      }
      const base = pts.find((p) => p.precio != null)?.precio;
      let prev = null;
      for (const p of pts) {
        p.acumulada = variacion(p.precio, base);
        p.mensual = variacion(p.precio, prev);
        if (p.precio != null) prev = p.precio;
      }
      return pts;
    };
    return { g2: armar(g2), g3: armar(g3) };
  }, [...claves, rango, vista]);

  // Estaciones del mapa de la derecha: las bocas relevadas en el mes, con
  // los mismos filtros que el resto del tablero (y el operador/estación elegidos)
  const puntos = useMemo(() => {
    if (!D || !mesDatos || mesDatos.f !== mes) return [];
    const M = mesDatos.datos;
    const out = [];
    const u = tipo.unidad;
    for (let i = 0; i < M.boca.length; i++) {
      const b = BOCAS.get(M.boca[i]);
      if (!b || b[6] == null) continue;
      if (cdN != null && M.cd[i] !== cdN) continue;
      if (!tiposIdx.has(M.tn[i])) continue;
      if (ccN != null && M.cc[i] !== ccN) continue;
      if (bi != null && M.band[i] !== bi) continue;
      if (pi != null && b[3] !== pi) continue;
      if (conOperador && M.op[i] !== operador) continue;
      if (boca != null && M.boca[i] !== boca) continue;
      const precio = (cent) => (cent ? fmtPrecio(conv(cent / 100), u) : '-');
      const filas = [
        { label: 'Período', valor: fmt.monthShort(mes) },
        { label: 'Bandera', valor: BANDERAS[M.band[i]] },
        { label: 'Empresa', valor: OPERADORES[M.op[i]] },
        { label: 'Dirección', valor: b[5] },
        { label: 'Localidad', valor: `${b[4]}, ${nombreProvincia(PROVINCIAS[b[3]])}` },
        { separador: true },
        { label: `GO GR2 surtidor (${u})`, valor: precio(M.s2[i]) },
        { label: `GO GR3 surtidor (${u})`, valor: precio(M.s3[i]) },
        { label: `GO GR2 con imp. (${u})`, valor: precio(M.c2[i]) },
        { label: `GO GR3 con imp. (${u})`, valor: precio(M.c3[i]) },
        { separador: true },
        { label: 'GO GR2 volumen', valor: `${fmt.int(M.w2[i])} m³` },
        { label: 'GO GR3 volumen', valor: `${fmt.int(M.w3[i])} m³` },
      ];
      out.push({
        id: M.boca[i], lng: b[6], lat: b[7], color: colorBandera(BANDERAS[M.band[i]]),
        titulo: `${b[4]} · ${BANDERAS[M.band[i]]}`, filas, activo: M.boca[i] === boca,
      });
    }
    out.sort((a, b) => (a.activo ? 1 : 0) - (b.activo ? 1 : 0)); // la elegida se dibuja última
    return out;
  }, [D, mesDatos, mes, cdN, tiposIdx, ccN, bi, pi, conOperador, operador, boca, tipo]);

  const banderasPuntos = useMemo(() => {
    const n = new Map();
    for (const p of puntos) {
      const b = p.titulo.split(' · ')[1];
      n.set(b, (n.get(b) || 0) + 1);
    }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [puntos]);

  // Ponderado GR2 + GR3 de una provincia (por volumen de ambos grados)
  const ponderadoProv = (i) => {
    const g2 = porProv?.g2.get(i);
    const g3 = porProv?.g3.get(i);
    const w = (g2?.w || 0) + (g3?.w || 0);
    return w ? ((g2?.pw || 0) + (g3?.pw || 0)) / w : null;
  };
  const tooltipMapa = (p) => {
    const i = PROVINCIAS.indexOf(p);
    const g2 = porProv?.g2.get(i);
    const g3 = porProv?.g3.get(i);
    if (!g2 && !g3) return { titulo: nombreProvincia(p), filas: [{ label: 'Sin relevamiento', valor: '' }] };
    return {
      titulo: nombreProvincia(p),
      filas: [
        { label: 'Período', valor: fmt.monthShort(mes) },
        { label: `GO GR2 (${tipo.unidad})`, valor: fmtPrecio(conv(g2?.precio), tipo.unidad) },
        { label: `GO GR3 (${tipo.unidad})`, valor: fmtPrecio(conv(g3?.precio), tipo.unidad) },
        { label: `GO ponderado (${tipo.unidad})`, valor: fmtPrecio(conv(ponderadoProv(i)), tipo.unidad) },
        { separador: true },
        { label: 'Bocas con precio', valor: fmt.int(g2?.e || g3?.e || 0) },
        { label: 'Volumen (m³)', valor: fmt.int((g2?.w || 0) + (g3?.w || 0)) },
      ],
    };
  };

  if (error) return <div className="section-placeholder">No se pudo cargar el relevamiento: {error}</div>;

  const tarjetas = listo && (
    <div className="kpi-grid go-kpis-fila">
      <Tarjeta label={`${ambito} · grado 2 (${tipo.unidad})`} valor={pais.g2} base={paisAnt?.g2} unidad={tipo.unidad} mesAnt={mesAnterior} />
      <Tarjeta label={`${ambito} · grado 3 (${tipo.unidad})`} valor={pais.g3} base={paisAnt?.g3} unidad={tipo.unidad} mesAnt={mesAnterior} />
      {prov ? (
        <>
          <Tarjeta label={`${nombreProvincia(provincia)} · grado 2`} valor={prov.g2} base={provAnt?.g2} unidad={tipo.unidad} mesAnt={mesAnterior} tono="info" />
          <Tarjeta label={`${nombreProvincia(provincia)} · grado 3`} valor={prov.g3} base={provAnt?.g3} unidad={tipo.unidad} mesAnt={mesAnterior} tono="info" />
        </>
      ) : (
        <>
          <div className="kpi-card">
            <div className="kpi-label">Bocas con precio</div>
            <div className="kpi-val">{fmt.int(pais.eess)}</div>
            <div className="kpi-sub">{fmt.monthShort(mes)} · {etiquetaCanal}{bandera !== TODAS ? ` · ${bandera}` : ''}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Volumen relevado</div>
            <div className="kpi-val">{fmt.compact(pais.vol)} <span className="kpi-unidad">m³</span></div>
            <div className="kpi-sub">grado 2 + grado 3, bocas con precio</div>
          </div>
        </>
      )}
    </div>
  );

  const resumenKpi = listo
    ? `GO GR2 ${fmtPrecio(pais.g2, tipo.unidad)} · GO GR3 ${fmtPrecio(pais.g3, tipo.unidad)} ${tipo.unidad} · ${fmt.int(pais.eess)} ${pais.eess === 1 ? 'boca' : 'bocas'}`
    : 'cargando…';

  const cuerpoTabla = (
    <>
      {abiertos.tabla && listo && (
        <div className="go-desplegable-cuerpo mh-tabla-scroll">
          <table className="mh-tabla go-tabla">
            <thead>
              <tr>
                <th>Bandera</th>
                <th className="num">Bocas</th>
                <th className="num">Grado 2</th>
                <th className="num">Grado 3</th>
                <th className="num">Volumen m³</th>
              </tr>
            </thead>
            <tbody>
              {tabla.map((r) => (
                <tr key={r.bandera} className={r.bandera === bandera ? 'activa' : ''} onClick={() => setBandera(r.bandera === bandera ? TODAS : r.bandera)}>
                  <td><span className="go-swatch" style={{ background: colorBandera(r.bandera) }} />{r.bandera}</td>
                  <td className="num">{fmt.int(r.eess)}</td>
                  <td className="num">{fmtPrecio(r.g2, tipo.unidad)}</td>
                  <td className="num">{fmtPrecio(r.g3, tipo.unidad)}</td>
                  <td className="num">{fmt.int(r.vol)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{fmt.int(tabla.reduce((s, r) => s + r.eess, 0))}</td>
                <td className="num">{fmtPrecio(provincia ? prov?.g2 : pais?.g2, tipo.unidad)}</td>
                <td className="num">{fmtPrecio(provincia ? prov?.g3 : pais?.g3, tipo.unidad)}</td>
                <td className="num">{fmt.int(tabla.reduce((s, r) => s + r.vol, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
  const cuerpoKpi = (
    <>
      {abiertos.kpi && <div className="go-desplegable-cuerpo">{tarjetas}</div>}
    </>
  );

  const cajas = [
    { id: 'kpi', titulo: 'Resultado del relevamiento', detalle: resumenKpi },
    { id: 'graficos', titulo: 'Gráficos de precios', detalle: `Var. mensual y acum. · GO GR2 y GR3 · ${tipo.label.toLowerCase()}` },
    { id: 'tabla', titulo: 'Bocas y precio por bandera', detalle: `Bocas, GO GR2, GO GR3 y volumen · ${tabla.length} banderas` },
    { id: 'mapas', titulo: 'Distribución geográfica', detalle: `Precio por provincia · ${listo ? fmt.int(puntos.length) : '…'} estaciones geolocalizadas` },
  ];

  return (
    <div className="go-seccion">
      <BloqueFijo
        seccion={seccion} tituloDefault="Precio del gas oil en surtidor" F={F}
        cajas={cajas} abiertos={abiertos} alternar={alternar}
      />

      {cuerpoKpi}
      {!listo ? (
        <div className="section-placeholder">
          {conOperador ? `Cargando los datos de ${OPERADORES[operador]}…` : 'Cargando el relevamiento de precios (8 MB, una sola vez)…'}
        </div>
      ) : (
        <>
          {abiertos.graficos && (
          <div className="go-charts-grid">
            {[['g2', 'Gas oil grado 2'], ['g3', 'Gas oil grado 3']].map(([k, titulo]) => (
              <div className="chart-card" key={k}>
                <div className="chart-card-header">
                  <div>
                    <span className="chart-card-title">{titulo} · variación {vista === 'anual' ? 'interanual' : 'mensual'} y acumulada</span>
                    <span className="chart-card-subtitle">
                      {tipo.label} [{tipo.unidad}] · {etiquetaCanal}{etiquetaFiltro ? ` · ${etiquetaFiltro}` : ''} · acumulada desde el inicio del período
                    </span>
                  </div>
                  <div className="go-selectores-grafico">
                    <div className="chart-range-selector">
                      <button className={vista === 'mensual' ? 'active' : ''} onClick={() => setVista('mensual')}>Mensual</button>
                      <button className={vista === 'anual' ? 'active' : ''} onClick={() => setVista('anual')}>Anual</button>
                    </div>
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
                      <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis}
                        tickFormatter={(v) => (vista === 'anual' ? v : fmt.monthShort(v))} minTickGap={40} />
                      <YAxis yAxisId="p" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis}
                        tickFormatter={(v) => fmtPrecio(v, tipo.unidad)} domain={['auto', 'auto']} width={58} />
                      <YAxis yAxisId="pct" orientation="right" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis}
                        tickFormatter={(v) => fmt.pct(v, 0)} width={52} />
                      <ReferenceLine yAxisId="pct" y={0} stroke={C.axis} />
                      <Tooltip content={<TooltipSerie unidad={tipo.unidad} anual={vista === 'anual'} />} cursor={{ stroke: C.axis }} />
                      <Line yAxisId="p" dataKey="precio" name={`Precio [${tipo.unidad}]`} stroke={C.oil} strokeWidth={2} dot={vista === 'anual'} connectNulls />
                      <Line yAxisId="pct" dataKey="acumulada" name="Variación acumulada" stroke={C.ink} strokeWidth={1.3} dot={false} strokeDasharray="4 3" connectNulls />
                      <Line yAxisId="pct" dataKey="mensual" name={vista === 'anual' ? 'Variación interanual' : 'Variación mensual'} stroke={C.neutral} strokeWidth={1} dot={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div className="chart-legend">
                    <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.oil }} />Precio ponderado (eje izquierdo)</div>
                    <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.ink }} />Variación acumulada % (eje derecho)</div>
                    <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.neutral }} />Variación {vista === 'anual' ? 'interanual' : 'mensual'} %</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}

          {cuerpoTabla}
          {abiertos.mapas && (
          <div className="go-mapas">
            <div className="chart-card go-mapa-card">
              <div className="chart-card-header">
                <div>
                  <span className="chart-card-title">{tipo.label} [{tipo.unidad}]</span>
                  <span className="chart-card-subtitle">
                    {fmt.monthShort(mes)} · {etiquetaCanal} · color: precio del grado 2 · pasá el mouse para ver los tres precios · clic en una provincia la selecciona, clic afuera la suelta
                  </span>
                </div>
              </div>
              <MapaProvincias
                valores={valoresMapa} color={C.oil} seleccion={provincia} onSeleccion={setProvincia}
                tooltip={tooltipMapa} etiqueta="Precio del gas oil grado 2 por provincia"
              />
              <div className="go-escala">
                <span>menor</span>
                <span className="go-escala-barra" style={{ background: `linear-gradient(90deg, ${C.oil}26, ${C.oil}f2)` }} />
                <span>mayor</span>
              </div>
            </div>
            <div className="chart-card go-mapa-card">
              <div className="chart-card-header">
                <div>
                  <span className="chart-card-title">Estaciones</span>
                  <span className="chart-card-subtitle">
                    {fmt.int(puntos.length)} bocas relevadas en {fmt.monthShort(mes)}{conOperador ? ` de ${OPERADORES[operador]}` : ''}{provincia ? ` en ${nombreProvincia(provincia)}` : ''} · clic en una la selecciona
                    {bocaSel ? ` · elegida: ${bocaSel[5]}, ${bocaSel[4]}` : ''}
                  </span>
                </div>
                {bocaSel && (
                  <button type="button" className="go-quitar-boca" onClick={() => elegirBoca(boca)}>Quitar estación</button>
                )}
              </div>
              <MapaProvincias
                valores={null} color={C.oil} seleccion={provincia} onSeleccion={setProvincia} encuadre={provincia}
                puntos={puntos} onPunto={elegirBoca} etiqueta="Estaciones de servicio relevadas"
              />
              <div className="chart-legend go-leyenda-banderas">
                {banderasPuntos.map(([b, n]) => (
                  <div key={b} className="chart-legend-item">
                    <span className="chart-legend-swatch" style={{ background: colorBandera(b) }} />
                    <span>{b} ({fmt.int(n)})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          )}

          <p className="note go-nota">
            Fuente: Secretaría de Energía, relevamiento de precios Res. 1104/2004. Precio ponderado por el volumen de
            cada boca de expendio. El precio surtidor solo existe en el canal "al público"; para los demás canales usar
            precio con o sin impuestos. Estaciones georreferenciadas: padrón de la SE cruzado por número de inscripción
            ({fmt.int((D?.bocas || []).filter((b) => b[6] != null).length)} de {fmt.int((D?.bocas || []).length)} bocas).
            Último mes: {fmt.monthShort(ULTIMO_MES)}.
          </p>
        </>
      )}
    </div>
  );
}
