import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart, Bar, Line, Area, Cell, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import {
  MESES, IDX_MES, TC, CPI_US, DENSIDAD_GO, DENSIDAD_BIO, CANALES_DIST, CANALES_COM, MESES_ANOMALOS, cargarImportaciones, ponderarCol,
  nombreProvincia,
} from '../../lib/gasoil.js';
import { mensual as CORTE_JSON } from '../../data/corte.json';
import { precio_biodiesel as PRECIO_BIO_JSON } from '../../data/evidencia.json';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import {
  useRelevamiento, useCajas, Cajas, DropdownMulti, TODAS, PROVINCIAS_FILTRO, ACCIONES_PROVINCIA, mismas,
} from './relevamiento.jsx';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import './GasOil.css';

// Importador → bandera del relevamiento con cuyo precio se compara (HDO,
// 01/10/2026: Trafigura es Puma en la Argentina). Los que no tienen bandera
// se comparan con el país.
const BANDERA_DE = {
  'YPF S.A.': 'YPF', 'RAIZEN S.A.': 'SHELL', 'SHELL C.A.P.S.A.': 'SHELL', 'AXION S.A.': 'AXION', 'TRAFIGURA S.A.': 'PUMA',
  'ESSO PETROLERA ARGENTINA': 'ESSO', 'PETROBRAS ENERGÍA S.A.': 'PETROBRAS', 'REFINOR': 'REFINOR', 'OIL S.A.': 'OIL COMBUSTIBLES',
  'DAPSA': 'DAPSA', 'PAMPA ENERGÍA S.A.': 'PAMPA ENERGIA', 'FOX PETROL S.A.': 'FOX PETROLEO', 'PETROLERA DEL CONO SUR': 'PDV SUR',
};
const IMPORTADOR_DEFAULT = 'YPF S.A.';
const PRIMER_MES = '2010-03'; // primer mes considerado (HDO, 01/10/2026)
// Canales de comercialización que no entran (HDO, 01/10/2026): bunker y usinas eléctricas
const CC_EXCLUIDOS = CANALES_COM.filter((c) => /bunker|usina/i.test(c));
const CC_SIN_BUNKER = CANALES_COM.filter((c) => !CC_EXCLUIDOS.includes(c));
const MEZCLA = new Map(CORTE_JSON.map((m) => [m.fecha, m.real]));
const PRECIO_BIO = new Map(PRECIO_BIO_JSON.map((p) => [p.fecha, p.mediana]));
const RANGOS = [['5a', 60, '5 a'], ['10a', 120, '10 a'], ['todo', null, 'Todo']];

const millones = (usd, n = 0) => `U$ ${(usd / 1e6).toLocaleString('es-AR', { minimumFractionDigits: n, maximumFractionDigits: n })} M`;
const usdM3 = (v) => (v == null ? '-' : `${fmt.int(v)} usd/m³`);

function Encabezado({ seccion }) {
  return (
    <>
      <p className="section-kicker">Mercado Gas Oil</p>
      <h2>{seccion?.title ?? 'Resultado de importar'}</h2>
      {seccion?.intro && <p className="section-intro">{seccion.intro}</p>}
    </>
  );
}

function Tarjeta({ label, valor, unidad, sub, tono, title }) {
  return (
    <div className={`kpi-card ${tono ? `tone-${tono}` : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-val" title={title}>{valor}{unidad && <> <span className="kpi-unidad">{unidad}</span></>}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

/**
 * Resultado de importar (pedido de HDO del 01/10/2026; réplica del tablero
 * MERCADO GO IXN "Resultado importación gas oil" del workbook 05). Para el
 * importador elegido, por mes desde 2010: m³ importados y cuatro precios en
 * usd/m³: gas oil fósil grado 2 y grado 3 de la bandera del importador
 * (precio sin impuestos del relevamiento, con los filtros de la fila, neto
 * del biodiésel mezclado con la mezcla real del mes y el precio Res. 963),
 * el ponderado por la participación de cada grado en el volumen de esa
 * bandera, y el CIF importado (usd/ton × 0,845). Resultado del mes =
 * (fósil ponderado - importado) × m³ importados: positivo cuando importar
 * salió más barato que el precio local del fósil. Acumulado desde 2010, en
 * dólares corrientes o constantes (CPI de EE.UU. al último mes con datos).
 * CAMMESA no entra (importa para las usinas). Al elegir importador la
 * bandera se pone sola (Trafigura contra Puma); se puede cambiar.
 */
export default function ResultadoImportar({ seccion }) {
  const [D, setD] = useState(null);
  const [errorImp, setErrorImp] = useState(null);
  useEffect(() => {
    cargarImportaciones().then(setD).catch((e) => setErrorImp(e.message));
  }, []);
  const F = useRelevamiento({ modo: 'abierto' });
  if (D) return <Resultado D={D} F={F} seccion={seccion} />;
  return (
    <div className="go-seccion">
      <div className="go-sticky"><Encabezado seccion={seccion} /></div>
      <div className="section-placeholder">{errorImp || 'Cargando los despachos de importación…'}</div>
    </div>
  );
}

function Resultado({ D, F, seccion }) {
  const C = useChartColors();
  const {
    DX, listo, error, fBase, fBand, fProv, tiposIdx, tipos, setTipos, resumenTipos, disponibles, bandera, setBandera, banderasMes,
    provincias, cambiarProvincias, resumenProvincias, etiquetaProvincias, bi, provIdx, operador, boca,
  } = F;
  const importadores = useMemo(
    () => D.importadores.map((im, i) => ({ ...im, i })).filter(({ i }) => i !== D.cammesa),
    [D],
  );
  const opcionesImp = useMemo(() => importadores.map((im) => im.i), [importadores]);
  const [imps, setImps] = useState(() => new Set([importadores.find((im) => im.nombre === IMPORTADOR_DEFAULT)?.i ?? importadores[0].i]));
  const [cds, setCds] = useState(() => new Set(CANALES_DIST.map((_, i) => i)));
  const [ccs, setCcs] = useState(() => new Set(CC_SIN_BUNKER));
  const MESES_PERIODO = useMemo(() => MESES.filter((f) => f >= PRIMER_MES && f <= D.ultimo_mes), [D]);
  const [desde, setDesde] = useState(PRIMER_MES);
  const [hasta, setHasta] = useState(D.ultimo_mes);
  const [constantes, setConstantes] = useState(false);
  const [abiertos, alternar] = useCajas({ resultado: true, precios: true, mensual: true, acumulado: true, grados: false });
  const elegidosImp = importadores.filter((im) => imps.has(im.i));
  const nombreImp = elegidosImp.length === 0 ? 'ningún importador'
    : elegidosImp.length <= 2 ? elegidosImp.map((im) => im.nombre).join(' + ') : `${elegidosImp.length} importadores`;
  const resumenImp = elegidosImp.length === importadores.length ? 'Todos (sin CAMMESA)' : nombreImp;
  // Con un solo importador la bandera se pone sola (o el país si no tiene); con varios, el país. Se puede cambiar después.
  const unico = elegidosImp.length === 1 ? elegidosImp[0].nombre : null;
  useEffect(() => { setBandera(unico ? (BANDERA_DE[unico] ?? TODAS) : TODAS); }, [unico]);
  const cambiarDesde = (f) => { setDesde(f); if (f > hasta) setHasta(f); };
  const cambiarHasta = (f) => { setHasta(f); if (f < desde) setDesde(f); };
  const ultimoIdx = IDX_MES.get(D.ultimo_mes) ?? MESES.length - 1;
  const atajo = (n) => { setHasta(D.ultimo_mes); setDesde(n == null ? PRIMER_MES : MESES[Math.max(IDX_MES.get(PRIMER_MES), ultimoIdx - n + 1)]); };
  const ccIdx = useMemo(() => new Set(CANALES_COM.map((c, i) => (ccs.has(c) ? i : -1)).filter((i) => i >= 0)), [ccs]);
  const resumenCd = cds.size === CANALES_DIST.length ? 'Ambos' : cds.size ? CANALES_DIST[[...cds][0]] : 'Ninguno';
  const resumenCc = mismas(ccs, CANALES_COM) ? 'Todos los canales' : mismas(ccs, CC_SIN_BUNKER) ? 'Sin bunker ni usinas'
    : ccs.size === 1 ? [...ccs][0] : ccs.size ? `${ccs.size} canales` : 'Ningún canal';
  const etiquetaCanal = `${resumenCd === 'Ambos' ? 'minorista y mayorista' : resumenCd.toLowerCase()} · ${resumenCc.toLowerCase()}`;
  const etiquetaFiltro = [bandera !== TODAS && bandera, etiquetaProvincias].filter(Boolean).join(' · ');

  // Importaciones de los importadores elegidos por mes: toneladas y CIF
  const importado = useMemo(() => {
    const m = new Map();
    for (let r = 0; r < D.filas; r++) {
      if (!imps.has(D.imp[r])) continue;
      const f = D.meses[D.mes[r]];
      const a = m.get(f) || { ton: 0, cif: 0 };
      a.ton += D.ton[r];
      a.cif += D.cif[r];
      m.set(f, a);
    }
    return m;
  }, [D, imps]);

  // Gas oil fósil de la bandera (o del país) por mes: precio neto de biodiésel en usd/m³ y participación de cada grado
  const fosil = useMemo(() => {
    const out = new Map();
    if (!listo) return out;
    const f = (i) => fBase(i) && cds.has(DX.cd[i]) && tiposIdx.has(DX.tn[i]) && ccIdx.has(DX.cc[i]) && fBand(i) && fProv(i);
    const m2 = ponderarCol(DX, f, (i) => DX.mes[i], 'n', 2);
    const m3 = ponderarCol(DX, f, (i) => DX.mes[i], 'n', 3);
    for (const mi of new Set([...m2.keys(), ...m3.keys()])) {
      const fecha = MESES[mi];
      const mezcla = MEZCLA.get(fecha);
      const bioTon = PRECIO_BIO.get(fecha);
      const tc = TC.get(fecha);
      if (mezcla == null || !bioTon || !tc || MESES_ANOMALOS.has(fecha)) continue;
      const bioL = (bioTon * DENSIDAD_BIO) / 1000;
      const neto = (v) => (v ? (((v.precio - mezcla * bioL) / (1 - mezcla)) / tc) * 1000 : null);
      const v2 = m2.get(mi);
      const v3 = m3.get(mi);
      const w2 = v2?.w || 0;
      const w3 = v3?.w || 0;
      const g2 = neto(v2);
      const g3 = neto(v3);
      const s2 = w2 + w3 ? w2 / (w2 + w3) : null;
      const ponderado = g2 != null && g3 != null ? g2 * s2 + g3 * (1 - s2) : g2 ?? g3;
      out.set(fecha, { go2: g2, go3: g3, s2, ponderado });
    }
    return out;
  }, [DX, listo, cds, tiposIdx, ccIdx, bi, provIdx, operador, boca]);

  // Serie mensual desde el primer mes con importaciones de los importadores elegidos (no antes de mar-2010)
  const serie = useMemo(() => {
    const meses = D.meses.filter((f) => f >= desde && f <= hasta && importado.has(f) && importado.get(f).ton > 0);
    if (!meses.length) return { pts: [], baseCpi: null };
    const primero = meses[0];
    const baseCpi = [...D.meses].reverse().find((f) => CPI_US.has(f) && f <= hasta);
    const cpiBase = baseCpi ? CPI_US.get(baseCpi) : null;
    let acum = 0;
    const pts = D.meses.filter((f) => f >= primero && f <= hasta).map((f) => {
      const im = importado.get(f);
      const fo = fosil.get(f);
      const m3 = im ? im.ton / DENSIDAD_GO : 0;
      const pImp = im && im.ton ? (im.cif / im.ton) * DENSIDAD_GO : null;
      const k = constantes ? (cpiBase && CPI_US.has(f) ? cpiBase / CPI_US.get(f) : null) : 1;
      const dif = pImp != null && fo?.ponderado != null ? fo.ponderado - pImp : null;
      const resultado = dif != null && k != null ? dif * m3 * k : null;
      if (resultado != null) acum += resultado;
      return {
        fecha: f, m3, km3: m3 / 1000, pImp, go2: fo?.go2 ?? null, go3: fo?.go3 ?? null, ponderado: fo?.ponderado ?? null,
        s2: fo?.s2 != null ? fo.s2 * 100 : null, s3: fo?.s2 != null ? (1 - fo.s2) * 100 : null,
        dif, resultado: resultado != null ? resultado / 1e6 : null, acum: acum / 1e6,
      };
    });
    return { pts, baseCpi };
  }, [D, importado, fosil, constantes, desde, hasta]);

  const datos = serie.pts;
  const ultimo = [...serie.pts].reverse().find((p) => p.m3 > 0);
  const total = serie.pts.at(-1);
  const conResultado = serie.pts.filter((p) => p.resultado != null).length;
  const rotuloValores = constantes && serie.baseCpi ? `dólares constantes de ${fmt.monthShort(serie.baseCpi)} (CPI EE.UU.)` : 'dólares corrientes';
  const contra = bandera === TODAS ? 'del país' : `de la bandera ${bandera}`;
  const detalleFosil = `${contra} · ${etiquetaCanal}${etiquetaFiltro && bandera === TODAS ? ` · ${etiquetaFiltro}` : ''}`;

  const cajas = [
    { id: 'resultado', titulo: 'Resultado', detalle: ultimo ? `${nombreImp} · acumulado ${total ? millones(total.acum * 1e6) : '-'} · ${conResultado} meses con importaciones y precio` : `${nombreImp}: sin importaciones en el período` },
    { id: 'precios', titulo: 'Importado y precios', detalle: `m³ importados por mes y precios en usd/m³: fósil grado 2 y 3 ${contra}, ponderado e importado` },
    { id: 'mensual', titulo: 'Resultado del mes', detalle: '(fósil ponderado menos importado) × m³ importados' },
    { id: 'acumulado', titulo: 'Resultado acumulado', detalle: total ? `${millones(total.acum * 1e6)} a ${fmt.monthShort(total.fecha)}` : '' },
    { id: 'grados', titulo: 'Grado 2 y grado 3', detalle: `Participación de cada grado en el volumen ${contra}` },
  ];

  const TooltipPrecios = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{fmt.monthShort(label)}</div>
        <div className="chart-tooltip-row"><span>Importado</span><strong>{fmt.int(p.m3)} m³</strong></div>
        <div className="chart-tooltip-row"><span className="chart-tooltip-swatch" style={{ background: C.warn }} /><span>Precio importado CIF</span><strong>{usdM3(p.pImp)}</strong></div>
        <div className="chart-tooltip-row"><span className="chart-tooltip-swatch" style={{ background: C.oil }} /><span>Fósil grado 2</span><strong>{usdM3(p.go2)}</strong></div>
        <div className="chart-tooltip-row"><span className="chart-tooltip-swatch" style={{ background: C.celeste }} /><span>Fósil grado 3</span><strong>{usdM3(p.go3)}</strong></div>
        <div className="chart-tooltip-row"><span className="chart-tooltip-swatch" style={{ background: C.ink }} /><span>Fósil ponderado</span><strong>{usdM3(p.ponderado)}</strong></div>
        {p.dif != null && <div className="chart-tooltip-row"><span>Diferencia</span><strong>{p.dif >= 0 ? '+' : ''}{fmt.int(p.dif)} usd/m³</strong></div>}
        {p.resultado != null && <div className="chart-tooltip-row"><span>Resultado del mes</span><strong>{millones(p.resultado * 1e6, 1)}</strong></div>}
      </div>
    );
  };
  const TooltipResultado = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{fmt.monthShort(label)}</div>
        <div className="chart-tooltip-row"><span>Resultado del mes</span><strong>{p.resultado != null ? millones(p.resultado * 1e6, 1) : 'sin precio'}</strong></div>
        <div className="chart-tooltip-row"><span>Acumulado</span><strong>{millones(p.acum * 1e6)}</strong></div>
        <div className="chart-tooltip-row"><span>Importado</span><strong>{fmt.int(p.m3)} m³</strong></div>
      </div>
    );
  };
  const TooltipGrados = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{fmt.monthShort(label)}</div>
        <div className="chart-tooltip-row"><span className="chart-tooltip-swatch" style={{ background: C.exp }} /><span>Grado 2</span><strong>{p.s2 != null ? fmt.pct(p.s2) : '-'}</strong></div>
        <div className="chart-tooltip-row"><span className="chart-tooltip-swatch" style={{ background: C.bio }} /><span>Grado 3</span><strong>{p.s3 != null ? fmt.pct(p.s3) : '-'}</strong></div>
      </div>
    );
  };
  const ejeAnio = (f) => (f.endsWith('-01') ? f.slice(0, 4) : '');
  const ejeX = <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={ejeAnio} interval={0} minTickGap={0} tickLine={false} />;
  const cargando = !listo && !error;

  return (
    <div className="go-seccion go-sesco go-resultado-imp">
      <div className="go-sticky">
        <Encabezado seccion={seccion} />
        <div className="go-filtros go-filtros-resultado">
          <div className="go-filtro go-f-prod">
            <span className="go-filtro-label">Importador</span>
            <DropdownMulti
              opciones={opcionesImp} seleccion={imps} resumen={resumenImp} onCambiar={setImps}
              rotulo={(i) => D.importadores[i].nombre} acciones={[['Todos', null], ['Ninguno', []]]} clase="go-prov-panel"
            />
          </div>
          <div className="go-filtro go-f-cd">
            <span className="go-filtro-label">Canal de distribución</span>
            <DropdownMulti
              opciones={CANALES_DIST.map((_, i) => i)} seleccion={cds} resumen={resumenCd} onCambiar={setCds}
              rotulo={(i) => CANALES_DIST[i]} acciones={[['Ambos', null], ['Ninguno', []]]}
            />
          </div>
          <div className="go-filtro go-f-tipos">
            <span className="go-filtro-label">Tipo de negocio</span>
            <DropdownMulti opciones={disponibles.tipos} seleccion={tipos} resumen={resumenTipos} onCambiar={setTipos} />
          </div>
          <div className="go-filtro go-f-cc">
            <span className="go-filtro-label">Canal de comercialización</span>
            <DropdownMulti
              opciones={CANALES_COM} seleccion={ccs} resumen={resumenCc} onCambiar={setCcs}
              acciones={[['Todos', null], ['Sin bunker ni usinas', CC_SIN_BUNKER, `Todos menos ${CC_EXCLUIDOS.join(', ')}`], ['Ninguno', []]]} clase="go-prov-panel"
            />
          </div>
          <div className="go-filtro go-f-band">
            <label htmlFor="go-bandera">Bandera</label>
            <select id="go-bandera" className="empresa-select" value={bandera} onChange={(e) => setBandera(e.target.value)}>
              <option value={TODAS}>Todas</option>
              {bandera !== TODAS && !banderasMes.includes(bandera) && <option value={bandera}>{bandera}</option>}
              {banderasMes.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="go-filtro go-f-prov">
            <span className="go-filtro-label">Provincia</span>
            <DropdownMulti
              opciones={PROVINCIAS_FILTRO} seleccion={provincias} resumen={resumenProvincias} onCambiar={cambiarProvincias}
              rotulo={nombreProvincia} acciones={ACCIONES_PROVINCIA} clase="go-prov-panel"
            />
          </div>
        </div>
        <div className="go-intervalo">
          <span className="go-filtro-label">Período</span>
          <select className="empresa-select" value={desde} onChange={(e) => cambiarDesde(e.target.value)} aria-label="Desde">
            {[...MESES_PERIODO].reverse().map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
          </select>
          <span className="go-filtro-label">a</span>
          <select className="empresa-select" value={hasta} onChange={(e) => cambiarHasta(e.target.value)} aria-label="Hasta">
            {[...MESES_PERIODO].reverse().map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
          </select>
          <div className="chart-range-selector">
            {RANGOS.map(([id, n, label]) => <button key={id} className={desde === (n == null ? PRIMER_MES : MESES[Math.max(IDX_MES.get(PRIMER_MES), ultimoIdx - n + 1)]) && hasta === D.ultimo_mes ? 'active' : ''} onClick={() => atajo(n)}>{label}</button>)}
          </div>
          <span className="go-filtro-label">Valores</span>
          <div className="chart-range-selector">
            <button className={constantes ? '' : 'active'} onClick={() => setConstantes(false)}>Corrientes</button>
            <button className={constantes ? 'active' : ''} onClick={() => setConstantes(true)}>Constantes</button>
          </div>
          <span className="chart-card-subtitle">fósil {detalleFosil} · {rotuloValores}</span>
        </div>
        <Cajas cajas={cajas} abiertos={abiertos} alternar={alternar} />
      </div>

      {cargando && <div className="section-placeholder">Cargando el relevamiento para el gas oil fósil (10 MB, una sola vez)…</div>}
      {error && <div className="section-placeholder">{error}</div>}

      {abiertos.resultado && ultimo && !cargando && (
        <div className="go-kpi-bloque">
          <div className="go-kpi-cabecera">
            <span className="chart-card-subtitle">{nombreImp} · último mes con importaciones: {fmt.monthShort(ultimo.fecha)} · fósil {detalleFosil} · {rotuloValores}</span>
          </div>
          <div className="kpi-grid go-kpis-fila">
            <Tarjeta label="Importado en el mes" valor={fmt.int(ultimo.m3)} unidad="m³" tono="warn" sub={`${fmt.int(ultimo.m3 * DENSIDAD_GO)} t · CIF ${usdM3(ultimo.pImp)}`} />
            <Tarjeta label="Fósil ponderado" valor={ultimo.ponderado != null ? fmt.int(ultimo.ponderado) : '-'} unidad="usd/m³" tono="info"
              sub={ultimo.ponderado != null ? `grado 2 ${fmt.int(ultimo.go2)} · grado 3 ${fmt.int(ultimo.go3)} · ${fmt.pct(ultimo.s2)} grado 2` : 'sin precio del relevamiento ese mes'} />
            <Tarjeta label="Resultado del mes" valor={ultimo.resultado != null ? millones(ultimo.resultado * 1e6, 1) : '-'} tono={ultimo.resultado != null && ultimo.resultado < 0 ? 'warn' : 'pos'}
              sub={ultimo.dif != null ? `${ultimo.dif >= 0 ? '+' : ''}${fmt.int(ultimo.dif)} usd/m³ por ${fmt.int(ultimo.m3)} m³` : ''} />
            <Tarjeta label="Resultado acumulado" valor={total ? millones(total.acum * 1e6) : '-'} tono={total && total.acum < 0 ? 'warn' : 'pos'}
              sub={`desde ${fmt.monthShort(serie.pts[0].fecha)} · ${conResultado} meses con importaciones y precio`} />
          </div>
        </div>
      )}

      {abiertos.precios && !cargando && (
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Gas oil importado y precios · {nombreImp}</span>
              <span className="chart-card-subtitle">Barras: miles de m³ importados por mes (eje izquierdo) · líneas: usd/m³ (eje derecho) del fósil grado 2 y 3 {contra}, su ponderado por volumen y el CIF importado</span>
            </div>
          </div>
          <div className="chart-card-body">
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={datos} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                {ejeX}
                <YAxis yAxisId="vol" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => `${fmt.int(v)} K`} width={56} />
                <YAxis yAxisId="precio" orientation="right" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={fmt.int} width={56} />
                <Tooltip content={<TooltipPrecios />} cursor={{ fill: C.cursor }} />
                <Bar yAxisId="vol" dataKey="km3" name="Importado [Km³]" fill={C.warn} fillOpacity={0.35} isAnimationActive={false} />
                <Line yAxisId="precio" dataKey="go2" name="Fósil grado 2" stroke={C.oil} strokeWidth={1.6} dot={false} connectNulls />
                <Line yAxisId="precio" dataKey="go3" name="Fósil grado 3" stroke={C.celeste} strokeWidth={1.6} dot={false} connectNulls />
                <Line yAxisId="precio" dataKey="ponderado" name="Fósil ponderado" stroke={C.ink} strokeWidth={2} dot={false} connectNulls />
                <Line yAxisId="precio" dataKey="pImp" name="Importado CIF" stroke={C.warn} strokeWidth={2} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.warn, opacity: 0.4 }} />Importado [miles de m³]</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.oil }} />Fósil grado 2 sin impuestos, neto de biodiésel [usd/m³]</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.celeste }} />Fósil grado 3 [usd/m³]</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.ink }} />Fósil ponderado por volumen [usd/m³]</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.warn }} />Importado CIF [usd/m³]</div>
            </div>
          </div>
        </div>
      )}

      {abiertos.mensual && !cargando && (
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Resultado del mes [U$ M]</span>
              <span className="chart-card-subtitle">(fósil ponderado menos importado) × m³ importados · positivo cuando importar salió más barato que el precio local · {rotuloValores}</span>
            </div>
          </div>
          <div className="chart-card-body">
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={datos} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                {ejeX}
                <YAxis tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.int(v)} width={56} />
                <ReferenceLine y={0} stroke={C.axis} />
                <Tooltip content={<TooltipResultado />} cursor={{ fill: C.cursor }} />
                <Bar dataKey="resultado" name="Resultado del mes" isAnimationActive={false}>
                  {datos.map((p) => <Cell key={p.fecha} fill={p.resultado != null && p.resultado < 0 ? C.alert : C.bio} fillOpacity={0.8} />)}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {abiertos.acumulado && !cargando && (
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Resultado acumulado [U$ M]</span>
              <span className="chart-card-subtitle">Suma del resultado mensual desde {serie.pts[0] ? fmt.monthShort(serie.pts[0].fecha) : ''} · {rotuloValores}</span>
            </div>
          </div>
          <div className="chart-card-body">
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={datos} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                {ejeX}
                <YAxis tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.int(v)} width={56} />
                <ReferenceLine y={0} stroke={C.axis} />
                <Tooltip content={<TooltipResultado />} cursor={{ stroke: C.axis }} />
                <Area dataKey="acum" name="Acumulado" stroke={C.oil} fill={C.oil} fillOpacity={0.3} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              {total && <div className="chart-legend-item go-imp-leyenda-total">Acumulado a {fmt.monthShort(total.fecha)}: {millones(total.acum * 1e6)}</div>}
            </div>
          </div>
        </div>
      )}

      {abiertos.grados && !cargando && (
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Participación del grado 2 y del grado 3 [%]</span>
              <span className="chart-card-subtitle">En el volumen de gas oil {contra} según el relevamiento · pesos del fósil ponderado</span>
            </div>
          </div>
          <div className="chart-card-body">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={datos} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                {ejeX}
                <YAxis tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => `${v}%`} width={46} domain={[0, 100]} />
                <Tooltip content={<TooltipGrados />} cursor={{ stroke: C.axis }} />
                <Line dataKey="s2" name="Grado 2" stroke={C.exp} strokeWidth={1.8} dot={false} connectNulls />
                <Line dataKey="s3" name="Grado 3" stroke={C.bio} strokeWidth={1.8} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <p className="note go-nota">
        Fuente: despachos de importación de gasoil por aduana (CIF; sin CAMMESA, que importa para las usinas), relevamiento
        Res. 1104/2004 (precio sin impuestos ponderado por volumen de la bandera elegida, con los filtros de la fila; al elegir
        un solo importador la bandera se pone sola: Raizen y Shell contra SHELL, Trafigura contra PUMA, los que no tienen bandera y
        las selecciones de varios importadores contra el país; el canal de comercialización abre sin bunker ni usinas eléctricas;
        primer mes considerado, mar-2010), ventas de biodiésel para el corte y precio Res. 963 (mediana publicada). Gas oil fósil = precio sin impuestos neto del
        biodiésel mezclado, con la mezcla real del mes (densidad del biodiésel {DENSIDAD_BIO} ton/m³), pasado a usd/m³ con el tipo
        de cambio del mes; el ponderado pesa cada grado por su volumen en el relevamiento. Importado: m³ = toneladas / {DENSIDAD_GO};
        precio = CIF usd/ton × {DENSIDAD_GO}. Resultado = (fósil ponderado menos importado) × m³ importados; sin resultado en los meses
        sin precio del relevamiento ni en los meses excluidos por precios anómalos del relevamiento ({[...MESES_ANOMALOS].map(fmt.monthShort).join(', ')}). Valores constantes: deflactados con el CPI de Estados Unidos al último mes con datos.
      </p>
    </div>
  );
}
