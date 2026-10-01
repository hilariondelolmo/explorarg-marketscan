import { useMemo, useState } from 'react';
import {
  ComposedChart, Bar, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { MESES, IDX_MES, TC, CPI_US, DENSIDAD_GO, DENSIDAD_BIO, IMPORTACIONES, MESES_ANOMALOS, ponderarCol } from '../../lib/gasoil.js';
import { mensual as CORTE_JSON } from '../../data/corte.json';
import { precio_biodiesel as PRECIO_BIO_JSON } from '../../data/evidencia.json';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import { useRelevamiento, useCajas, Cajas } from './relevamiento.jsx';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import './GasOil.css';

const REF_26093 = 0.10;        // corte que mandaba la ley 26.093
const DESDE_27640 = '2021-07'; // la 27.640 lo bajó a 5% y después a 7,5%
const PRECIO_BIO = new Map(PRECIO_BIO_JSON.map((p) => [p.fecha, p.mediana])); // 963 publicado, $/ton
const CIF = new Map(IMPORTACIONES.map((m) => [m.fecha, m.ton ? m.cif_usd_ton : null]));
const SUSTITUTOS = [
  ['imp', 'Gas oil importado (CIF)'],
  ['go2', 'Gas oil fósil grado 2'],
  ['go3', 'Gas oil fósil grado 3'],
  ['go23', 'Gas oil fósil grado 2 y 3'],
];
const RANGOS = [['5a', 60, '5 a'], ['10a', 120, '10 a'], ['todo', null, 'Todo']];

const pct = (v, n = 1) => (v == null ? '-' : fmt.pct(v * 100, n));
const millones = (usd) => `U$ ${(usd / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 0 })} M`;

function Encabezado({ seccion }) {
  return (
    <>
      <p className="section-kicker">Mercado Gas Oil</p>
      <h2>{seccion?.title ?? 'El corte obligatorio, mes a mes'}</h2>
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
 * El corte obligatorio, mes a mes (pedido de HDO del 01/10/2026; réplica del
 * tablero MERCARG GO V (2) "Mercado argentino de gas oil con mandato de corte
 * obligatorio - GASOILBIO" del workbook 05).
 *
 * Composición del gas oil vendido en el país (sin bunker ni usinas), por mes
 * desde 2010: biodiésel real (mezcla real = biodiésel al corte / gas oil
 * grado 2 + 3, la de corte.json), gas oil importado que desplazó al biodiésel
 * faltante (obligatorio menos real, cuando es positivo), gas oil importado
 * por la reducción del corte (10% de la ley 26.093 menos el obligatorio
 * vigente, desde jul-2021: la 27.640 lo bajó a 5% y después a 7,5%; esa
 * diferencia va para los mezcladores, definición de HDO) y gas oil fósil
 * argentino, el resto.
 *
 * Ganancia o pérdida de los mezcladores: cada uno de esos dos volúmenes por
 * la diferencia entre el precio del biodiésel sin impuestos (Res. 963,
 * mediana publicada, con la densidad del biodiésel y el TC del mes) y el del
 * sustituto elegido, en usd/m³: gas oil importado CIF (por defecto, decisión
 * de HDO; sin CAMMESA) o gas oil fósil grado 2, 3 o ambos (precio sin
 * impuestos del relevamiento, minorista al público, neto del biodiésel).
 * Acumulada desde 2010, en dólares corrientes o constantes (CPI de EE.UU.
 * al último mes con datos, como el ranking).
 */
export default function CorteObligatorio({ seccion }) {
  const C = useChartColors();
  const F = useRelevamiento({ modo: 'surtidor' }); // cruce fino para el gas oil fósil (minorista, al público, bocas)
  const { DX, listo, error, fCanal } = F;
  const [rango, setRango] = useState('todo');
  const [sustituto, setSustituto] = useState('imp');
  const [constantes, setConstantes] = useState(false);
  const [abiertos, alternar] = useCajas({ resultado: true, composicion: true, ganancia: true });
  const [zoom, setZoom] = useState(true); // escala 85 a 100: lo que importa es el 10% de arriba

  // Gas oil fósil grado 2 y 3 en usd/m³ por mes (y la mezcla ponderada por volumen)
  const fosil = useMemo(() => {
    const out = new Map();
    if (!listo) return out;
    const m2 = ponderarCol(DX, fCanal, (i) => DX.mes[i], 'n', 2);
    const m3 = ponderarCol(DX, fCanal, (i) => DX.mes[i], 'n', 3);
    for (const [mi, v2] of m2) {
      const f = MESES[mi];
      const v3 = m3.get(mi);
      const mezcla = CORTE_JSON.find((m) => m.fecha === f)?.real;
      const bioTon = PRECIO_BIO.get(f);
      const tc = TC.get(f);
      if (mezcla == null || !bioTon || !tc || MESES_ANOMALOS.has(f)) continue;
      const bioL = (bioTon * DENSIDAD_BIO) / 1000;
      const neto = (p) => (p == null ? null : (((p - mezcla * bioL) / (1 - mezcla)) / tc) * 1000); // $/l → usd/m³
      const g2 = neto(v2.precio);
      const g3 = v3 ? neto(v3.precio) : null;
      const w = (v2.w || 0) + (v3?.w || 0);
      out.set(f, { go2: g2, go3: g3, go23: g3 != null && w ? (g2 * v2.w + g3 * v3.w) / w : g2 });
    }
    return out;
  }, [DX, listo]);

  // Serie mensual completa: composición, precios, ganancia del mes y acumulada
  const serie = useMemo(() => {
    const filas = CORTE_JSON.filter((m) => m.obligatorio != null && m.go_m3 > 0);
    const baseCpi = [...filas].reverse().find((m) => CPI_US.has(m.fecha))?.fecha;
    const cpiBase = baseCpi ? CPI_US.get(baseCpi) : null;
    let acumReemp = 0;
    let acumRed = 0;
    const pts = filas.map((m) => {
      const f = m.fecha;
      const desplazado = Math.max(m.obligatorio - m.real, 0);
      const reduccion = f >= DESDE_27640 ? REF_26093 - m.obligatorio : 0;
      const arg = 1 - m.real - desplazado - reduccion;
      const tc = TC.get(f);
      const bioUsd = PRECIO_BIO.get(f) && tc ? (PRECIO_BIO.get(f) * DENSIDAD_BIO) / tc : null;
      const sust = sustituto === 'imp' ? (CIF.get(f) != null ? CIF.get(f) * DENSIDAD_GO : null) : (fosil.get(f)?.[sustituto] ?? null);
      const dif = bioUsd != null && sust != null ? bioUsd - sust : null;
      const k = constantes ? (cpiBase && CPI_US.has(f) ? cpiBase / CPI_US.get(f) : null) : 1;
      const reemp = dif != null && k != null ? desplazado * m.go_m3 * dif * k : null;
      const red = dif != null && k != null ? reduccion * m.go_m3 * dif * k : null;
      if (reemp != null) acumReemp += reemp;
      if (red != null) acumRed += red;
      return {
        fecha: f, bio: m.real * 100, desplazado: desplazado * 100, reduccion: reduccion * 100, arg: arg * 100,
        obligatorio: m.obligatorio, go_m3: m.go_m3, bioUsd, sust, dif, reemp, red,
        acumReemp: acumReemp / 1e6, acumRed: acumRed / 1e6, acumTotal: (acumReemp + acumRed) / 1e6,
        sinPrecio: dif == null,
      };
    });
    return { pts, baseCpi };
  }, [fosil, sustituto, constantes]);

  const desde = rango === 'todo' ? serie.pts[0]?.fecha : MESES[Math.max(0, IDX_MES.get(serie.pts.at(-1).fecha) - RANGOS.find((r) => r[0] === rango)[1] + 1)];
  const datos = useMemo(() => serie.pts.filter((p) => p.fecha >= desde), [serie, desde]);
  const ultimo = serie.pts.at(-1);
  const ultimoConPrecio = [...serie.pts].reverse().find((p) => !p.sinPrecio);
  const nombreSust = SUSTITUTOS.find((s) => s[0] === sustituto)[1];
  const rotuloValores = constantes && serie.baseCpi ? `dólares constantes de ${fmt.monthShort(serie.baseCpi)} (CPI EE.UU.)` : 'dólares corrientes';
  const sinFosil = sustituto !== 'imp' && !listo;

  const cajas = [
    { id: 'resultado', titulo: 'Resultado', detalle: ultimo ? `${fmt.monthShort(ultimo.fecha)} · biodiésel ${pct(ultimo.bio / 100)} · obligatorio ${pct(ultimo.obligatorio)}` : '' },
    { id: 'composicion', titulo: 'Composición del gas oil', detalle: 'Biodiésel, importado que desplazó biodiésel, importado por la reducción del corte y fósil argentino' },
    { id: 'ganancia', titulo: 'Ganancia o pérdida acumulada', detalle: ultimoConPrecio ? `${millones(ultimoConPrecio.acumTotal * 1e6)} a ${fmt.monthShort(ultimoConPrecio.fecha)} · contra ${nombreSust.toLowerCase()}` : 'sin precios' },
  ];

  const TooltipComposicion = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{fmt.monthShort(label)} · obligatorio {pct(p.obligatorio, 2)}</div>
        <div className="chart-tooltip-row"><span className="chart-tooltip-swatch" style={{ background: C.bio }} /><span>Biodiésel real</span><strong>{fmt.pct(p.bio, 2)}</strong></div>
        <div className="chart-tooltip-row"><span className="chart-tooltip-swatch" style={{ background: C.warn }} /><span>Importado que desplazó biodiésel</span><strong>{fmt.pct(p.desplazado, 2)}</strong></div>
        <div className="chart-tooltip-row"><span className="chart-tooltip-swatch" style={{ background: C.exp }} /><span>Importado por la reducción del corte</span><strong>{fmt.pct(p.reduccion, 2)}</strong></div>
        <div className="chart-tooltip-row"><span className="chart-tooltip-swatch" style={{ background: C.oil }} /><span>Gas oil fósil argentino</span><strong>{fmt.pct(p.arg, 2)}</strong></div>
        <div className="chart-tooltip-row"><span>Gas oil grado 2 + 3</span><strong>{fmt.int(p.go_m3)} m³</strong></div>
      </div>
    );
  };
  const TooltipGanancia = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{fmt.monthShort(label)} · acumulado {millones(p.acumTotal * 1e6)}</div>
        <div className="chart-tooltip-row"><span className="chart-tooltip-swatch" style={{ background: C.oil }} /><span>Por reemplazar biodiésel faltante</span><strong>{millones(p.acumReemp * 1e6)}</strong></div>
        <div className="chart-tooltip-row"><span className="chart-tooltip-swatch" style={{ background: C.exp }} /><span>Por la reducción del corte</span><strong>{millones(p.acumRed * 1e6)}</strong></div>
        {p.dif != null ? (
          <>
            <div className="chart-tooltip-row"><span>Biodiésel sin impuestos</span><strong>{fmt.int(p.bioUsd)} usd/m³</strong></div>
            <div className="chart-tooltip-row"><span>{nombreSust}</span><strong>{fmt.int(p.sust)} usd/m³</strong></div>
            <div className="chart-tooltip-row"><span>Diferencia</span><strong>{p.dif >= 0 ? '+' : ''}{fmt.int(p.dif)} usd/m³</strong></div>
            <div className="chart-tooltip-row"><span>Ganancia del mes</span><strong>{millones((p.reemp || 0) + (p.red || 0))}</strong></div>
          </>
        ) : <div className="chart-tooltip-row"><span>Sin precio del sustituto este mes</span></div>}
      </div>
    );
  };
  const ejeAnio = (f) => (f.endsWith('-01') ? f.slice(0, 4) : '');

  return (
    <div className="go-seccion go-sesco go-corte">
      <div className="go-sticky">
        <Encabezado seccion={seccion} />
        <div className="go-intervalo">
          <span className="go-filtro-label">Período</span>
          <div className="chart-range-selector">
            {RANGOS.map(([id, , label]) => <button key={id} className={rango === id ? 'active' : ''} onClick={() => setRango(id)}>{label}</button>)}
          </div>
          <span className="go-filtro-label">Sustituto</span>
          <select className="empresa-select" value={sustituto} onChange={(e) => setSustituto(e.target.value)} aria-label="Sustituto">
            {SUSTITUTOS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <span className="go-filtro-label">Valores</span>
          <div className="chart-range-selector">
            <button className={constantes ? '' : 'active'} onClick={() => setConstantes(false)}>Corrientes</button>
            <button className={constantes ? 'active' : ''} onClick={() => setConstantes(true)}>Constantes</button>
          </div>
          <span className="chart-card-subtitle">{datos.length} meses · {rotuloValores}</span>
        </div>
        <Cajas cajas={cajas} abiertos={abiertos} alternar={alternar} />
      </div>

      {abiertos.resultado && ultimo && (
        <div className="go-kpi-bloque">
          <div className="go-kpi-cabecera">
            <span className="chart-card-subtitle">{fmt.monthShort(ultimo.fecha)}, país sin bunker ni usinas · acumulado desde {fmt.monthShort(serie.pts[0].fecha)} contra {nombreSust.toLowerCase()}, {rotuloValores}</span>
          </div>
          <div className="kpi-grid go-kpis-fila">
            <Tarjeta label="Biodiésel real" valor={fmt.pct(ultimo.bio, 2)} tono="pos" sub={`corte obligatorio ${pct(ultimo.obligatorio, 2)} · ${fmt.int(ultimo.go_m3)} m³ de gas oil`} />
            <Tarjeta label="Importado que desplazó biodiésel" valor={fmt.pct(ultimo.desplazado, 2)} tono="warn" sub="obligatorio menos real, cuando falta biodiésel" />
            <Tarjeta label="Importado por la reducción del corte" valor={fmt.pct(ultimo.reduccion, 2)} tono="info" sub={`10% de la ley 26.093 menos el obligatorio${ultimo.fecha >= DESDE_27640 ? '' : ' · desde jul-2021'}`} />
            <Tarjeta
              label="Ganancia acumulada de los mezcladores" valor={ultimoConPrecio ? millones(ultimoConPrecio.acumTotal * 1e6) : '-'} tono={ultimoConPrecio?.acumTotal < 0 ? 'warn' : 'pos'}
              sub={ultimoConPrecio ? `${millones(ultimoConPrecio.acumReemp * 1e6)} por reemplazar biodiésel + ${millones(ultimoConPrecio.acumRed * 1e6)} por la reducción · a ${fmt.monthShort(ultimoConPrecio.fecha)}` : ''}
            />
          </div>
        </div>
      )}

      {abiertos.composicion && (
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Composición del gas oil grado 2 + 3 [%]</span>
              <span className="chart-card-subtitle">País sin bunker ni usinas · biodiésel real, gas oil importado que desplazó al biodiésel faltante, importado por la reducción del corte y gas oil fósil argentino</span>
            </div>
            <div className="chart-range-selector">
              <button className={zoom ? 'active' : ''} onClick={() => setZoom(true)}>85 a 100%</button>
              <button className={zoom ? '' : 'active'} onClick={() => setZoom(false)}>0 a 100%</button>
            </div>
          </div>
          <div className="chart-card-body">
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={datos} margin={{ top: 10, right: 16, left: 0, bottom: 0 }} barCategoryGap={0}>
                <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={ejeAnio} interval={0} minTickGap={0} tickLine={false} />
                <YAxis tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => `${v}%`} width={46}
                  domain={zoom ? [85, 100] : [0, 100]} ticks={zoom ? [85, 90, 95, 100] : [0, 25, 50, 75, 100]} allowDataOverflow />
                <Tooltip content={<TooltipComposicion />} cursor={{ fill: C.cursor }} />
                <Bar dataKey="arg" name="Gas oil fósil argentino" stackId="c" fill={C.oil} fillOpacity={0.55} isAnimationActive={false} />
                <Bar dataKey="reduccion" name="Importado por la reducción del corte" stackId="c" fill={C.exp} fillOpacity={0.8} isAnimationActive={false} />
                <Bar dataKey="desplazado" name="Importado que desplazó biodiésel" stackId="c" fill={C.warn} isAnimationActive={false} />
                <Bar dataKey="bio" name="Biodiésel real" stackId="c" fill={C.bio} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.bio }} />Biodiésel real</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.warn }} />Importado que desplazó biodiésel (obligatorio menos real)</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.exp }} />Importado por la reducción del corte (10% menos obligatorio, desde jul-2021)</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.oil, opacity: 0.55 }} />Gas oil fósil argentino</div>
            </div>
          </div>
        </div>
      )}

      {abiertos.ganancia && (
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Ganancia o pérdida acumulada de los mezcladores [U$ M]</span>
              <span className="chart-card-subtitle">
                Volumen desplazado por la diferencia entre el biodiésel sin impuestos y {nombreSust.toLowerCase()}, en usd/m³, acumulado desde {fmt.monthShort(serie.pts[0].fecha)} · {rotuloValores}
              </span>
            </div>
          </div>
          <div className="chart-card-body">
            {sinFosil ? <div className="section-placeholder">{error || 'Cargando el relevamiento para el gas oil fósil (10 MB, una sola vez)…'}</div> : (
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={datos} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={ejeAnio} interval={0} minTickGap={0} tickLine={false} />
                  <YAxis tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.int(v)} width={56} />
                  <ReferenceLine y={0} stroke={C.axis} />
                  <Tooltip content={<TooltipGanancia />} cursor={{ stroke: C.axis }} />
                  <Area dataKey="acumReemp" name="Por reemplazar biodiésel faltante" stackId="g" stroke={C.oil} fill={C.oil} fillOpacity={0.45} isAnimationActive={false} />
                  <Area dataKey="acumRed" name="Por la reducción del corte" stackId="g" stroke={C.exp} fill={C.exp} fillOpacity={0.45} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            <div className="chart-legend">
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.oil }} />Por reemplazar el biodiésel faltante con {nombreSust.toLowerCase()}</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.exp }} />Por la reducción del corte de la ley 27.640 (desde jul-2021)</div>
              {ultimoConPrecio && <div className="chart-legend-item go-imp-leyenda-total">Acumulado a {fmt.monthShort(ultimoConPrecio.fecha)}: {millones(ultimoConPrecio.acumTotal * 1e6)}</div>}
            </div>
          </div>
        </div>
      )}

      <p className="note go-nota">
        Fuente: Secretaría de Energía, ventas de biodiésel para el corte y tablas SESCO (gas oil grado 2 y 3 del país sin bunker ni
        usinas), precio del biodiésel Res. 963 (mediana publicada), despachos de importación de gas oil (CIF, sin CAMMESA),
        relevamiento Res. 1104/2004 (gas oil fósil: precio sin impuestos minorista al público, neto del biodiésel mezclado),
        tipo de cambio y CPI de Estados Unidos. Mezcla real = biodiésel vendido para el corte / gas oil grado 2 + 3, en m³.
        Importado que desplazó biodiésel = corte obligatorio menos mezcla real, cuando es positivo. Importado por la reducción del
        corte = 10% de la ley 26.093 menos el obligatorio vigente, desde jul-2021 (la ley 27.640 lo bajó a 5% y después a 7,5%).
        Ganancia de los mezcladores = cada uno de esos volúmenes por (precio del biodiésel sin impuestos menos precio del
        sustituto), en usd/m³ con las densidades {DENSIDAD_BIO} y {DENSIDAD_GO} ton/m³ y el tipo de cambio del mes; positiva
        cuando el biodiésel era más caro que el sustituto. Con un sustituto fósil no se computan los meses con precios anómalos
        del relevamiento ({[...MESES_ANOMALOS].map(fmt.monthShort).join(', ')}). Valores constantes: deflactados con el CPI de Estados Unidos al último
        mes con datos.
      </p>
    </div>
  );
}
