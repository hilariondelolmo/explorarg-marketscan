import { useEffect, useMemo, useState } from 'react';
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer } from 'recharts';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import { useCajas, Cajas } from '../gasoil/relevamiento.jsx';
import {
  MESES, IDX, PRIMER_MES, ULTIMO_MES, PERIODOS, ACEITES, UNIDADES, DENSIDADES, RATIO, FUENTES_GLICERINA, FICHA_GLICERINA, calcular,
} from '../../lib/margenes.js';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import '../gasoil/GasOil.css';

const ATAJOS = [['12m', 12, '12 m'], ['24m', 24, '24 m'], ['5a', 60, '5 a'], ['todo', null, 'Todo']];
const ORDEN_FUENTES = ['rosario', 'usa', 'explora', 'provisorio'];

/** Valor con los decimales que pide su magnitud (0,91 usd/l; 83,3 usd/bbl; 1.336 usd/ton). */
const valor = (v) => {
  if (v == null || isNaN(v)) return '-';
  const a = Math.abs(v);
  const dec = a < 10 ? 2 : a < 200 ? 1 : 0;
  return v.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};
const pct = (v, d = 1) => (v == null ? '-' : fmt.pct(v, d));
const pctSigno = (v, d = 0) => (v == null ? '-' : `${v > 0 ? '+' : ''}${fmt.pct(v, d)}`);
const ejeAnio = (f) => (f.endsWith('-01') ? f.slice(0, 4) : '');
// En pantallas angostas los dieciséis años no entran: uno por medio
const ejeAnioPar = (f) => (f.endsWith('-01') && Number(f.slice(0, 4)) % 2 === 0 ? f.slice(0, 4) : '');
const MQ_ANGOSTO = '(max-width: 720px)';

function Encabezado({ seccion }) {
  return (
    <>
      <p className="section-kicker">Márgenes</p>
      <h2>{seccion?.title ?? 'Márgenes del biodiésel'}</h2>
      {seccion?.intro && <p className="section-intro">{seccion.intro}</p>}
    </>
  );
}

function Tarjeta({ label, valor: v, unidad, sub, tono, title }) {
  return (
    <div className={`kpi-card ${tono ? `tone-${tono}` : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-val" title={title}>{v}{unidad && <> <span className="kpi-unidad">{unidad}</span></>}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

/** Etiqueta con el valor en el primer y el último punto con dato de una línea, como el tablero
 *  (la del primero va debajo del punto, así no se pisa con el rótulo del promedio, que va arriba de su línea). */
function EtiquetaExtremos({ x, y, value, index, extremos, color, formato = valor }) {
  if (value == null || !extremos || (index !== extremos[0] && index !== extremos[1])) return null;
  const inicio = index === extremos[0] && index !== extremos[1];
  return (
    <text x={x + 5} y={y} dy={inicio ? 15 : 4} textAnchor="start" fill={color} fontSize={12} fontWeight={600}>{formato(value)}</text>
  );
}

function Fila({ color, label, children }) {
  return (
    <div className="chart-tooltip-row">
      {color && <span className="chart-tooltip-swatch" style={{ background: color }} />}
      <span>{label}</span><strong>{children}</strong>
    </div>
  );
}

/**
 * Márgenes del biodiésel (pedido de HDO del 12/10/2026): réplica de las hojas
 * del workbook 03 "MARKET & INDUSTRY - MARGEN BIODIESEL" que comparan el
 * precio del biodiésel de corte con el aceite de soja FAS desde el inicio del
 * corte obligatorio: precios y margen sobre aceite, el margen solo con su
 * promedio, y el crack spread 10:9:1 en valor, en % del aceite y acumulado.
 * Intervalo libre con presidencias, aceite FAS Minagri o FAS JJ y unidad.
 * Solo dólares corrientes, como el workbook. Las fórmulas y las fuentes
 * están en src/lib/margenes.js.
 */
export default function MargenesBiodiesel({ seccion }) {
  const C = useChartColors();
  const [desde, setDesde] = useState(PRIMER_MES);
  const [hasta, setHasta] = useState(ULTIMO_MES);
  const [aceiteId, setAceiteId] = useState('minagri');
  const [unidadId, setUnidadId] = useState('ton');
  const [abiertos, alternar] = useCajas({ resultado: true, precios: true, margen: true, crack: true });
  const [angosto, setAngosto] = useState(() => typeof window !== 'undefined' && window.matchMedia(MQ_ANGOSTO).matches);
  useEffect(() => {
    const mq = window.matchMedia(MQ_ANGOSTO);
    const fn = (e) => setAngosto(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const aceite = ACEITES.find((a) => a.id === aceiteId) || ACEITES[0];
  const R = useMemo(() => calcular({ aceiteId, unidadId, desde, hasta }), [aceiteId, unidadId, desde, hasta]);
  const { pts, rotuloUnidad, promedios, primero, ultimo, primerCrack, ultimoCrack } = R;

  // Intervalo: desde / hasta, atajos hasta el último mes y presidencias (se
  // sueltan al mover una fecha a mano, como en Precios comparados)
  const cambiarDesde = (f) => { setDesde(f); if (f > hasta) setHasta(f); };
  const cambiarHasta = (f) => { setHasta(f); if (f < desde) setDesde(f); };
  const atajo = (n) => {
    setHasta(ULTIMO_MES);
    setDesde(n == null ? PRIMER_MES : MESES[Math.max(0, IDX.get(ULTIMO_MES) - n + 1)]);
  };
  const atajoActivo = hasta !== ULTIMO_MES ? '' : ATAJOS.find(([, n]) => desde === (n == null ? PRIMER_MES : MESES[Math.max(0, IDX.get(ULTIMO_MES) - n + 1)]))?.[0] || '';
  const presidenciaActiva = PERIODOS.find((p) => p.desde === desde && p.hasta === hasta)?.id || '';
  const elegirPresidencia = (id) => {
    const p = PERIODOS.find((q) => q.id === id);
    if (p) { setDesde(p.desde); setHasta(p.hasta); }
  };

  // Primer y último punto con dato de cada línea, para las etiquetas
  const extremos = useMemo(() => {
    const de = (k) => {
      const i0 = pts.findIndex((p) => p[k] != null);
      if (i0 < 0) return null;
      let i1 = pts.length - 1;
      while (i1 > i0 && pts[i1][k] == null) i1 -= 1;
      return [i0, i1];
    };
    return { bio: de('bio'), aceite: de('aceite'), margen: de('margen'), crack: de('crack'), crackPct: de('crackPct'), crackAcum: de('crackAcum') };
  }, [pts]);

  // De dónde salió la glicerina en el intervalo (resumen por fuente) y los
  // tramos con precio de Explora, que se sombrean en el crack spread
  const glicerina = useMemo(() => {
    const porFuente = {};
    for (const p of pts) {
      if (!p.glicFuente) continue;
      const g = porFuente[p.glicFuente] || (porFuente[p.glicFuente] = { n: 0, desde: p.fecha, hasta: p.fecha });
      g.n += 1;
      g.hasta = p.fecha;
    }
    const resumen = ORDEN_FUENTES.filter((k) => porFuente[k]).map((k) => {
      const g = porFuente[k];
      const tramo = g.desde === g.hasta ? fmt.monthShort(g.desde) : `${fmt.monthShort(g.desde)} a ${fmt.monthShort(g.hasta)}`;
      return `${FUENTES_GLICERINA[k]} (${tramo}${g.n > 1 ? `, ${g.n} meses` : ''})`;
    });
    const tramos = [];
    for (const p of pts) {
      const explora = p.glicFuente === 'explora' || p.glicFuente === 'provisorio';
      const t = tramos.at(-1);
      if (explora && t && t.abierto) t.hasta = p.fecha;
      else if (explora) tramos.push({ desde: p.fecha, hasta: p.fecha, abierto: true });
      else if (t) t.abierto = false;
    }
    const mayor = tramos.reduce((a, t) => (!a || IDX.get(t.hasta) - IDX.get(t.desde) > IDX.get(a.hasta) - IDX.get(a.desde) ? t : a), null);
    return { resumen, tramos, mayor };
  }, [pts]);

  const largo = pts.length > 48;
  const ejeX = {
    dataKey: 'fecha', tick: { fill: C.tick, fontSize: 11 }, stroke: C.axis, tickLine: false,
    ...(largo ? { tickFormatter: angosto ? ejeAnioPar : ejeAnio, interval: 0, minTickGap: 0 } : { tickFormatter: fmt.monthShort, interval: 'preserveStartEnd', minTickGap: 28 }),
  };
  const ejeValor = (v) => (v === 0 ? '0' : valor(v));
  const ejeY = (ancho = 56, formato = ejeValor) => ({ tick: { fill: C.tick, fontSize: 11 }, stroke: C.axis, tickFormatter: formato, width: ancho });
  const colores = { bio: C.bio, aceite: C.alert, margen: C.celeste, crack: C.bio, crackPct: C.exp, crackAcum: C.celeste };
  const refPromedio = (v, fmtV = valor) => (v == null ? null : (
    <ReferenceLine y={v} stroke={C.neutral} strokeDasharray="5 4" label={{ value: `Promedio: ${fmtV(v)}`, position: 'insideBottomLeft', fill: C.tick, fontSize: 11 }} />
  ));
  const sombraExplora = (conRotulo) => glicerina.tramos.map((t) => (
    <ReferenceArea
      key={t.desde} x1={t.desde} x2={t.hasta} fill={C.banda} stroke="none" ifOverflow="extendDomain"
      label={conRotulo && t === glicerina.mayor ? { value: 'glicerina: precio de Explora', position: 'insideTop', fill: C.tick, fontSize: 11 } : undefined}
    />
  ));

  const TooltipPrecios = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{fmt.monthShort(label)} · {rotuloUnidad}</div>
        <Fila color={colores.bio} label="Biodiésel">{valor(p.bio)}</Fila>
        <Fila color={colores.aceite} label={aceite.nombre}>{valor(p.aceite)}</Fila>
        <Fila color={colores.margen} label="Margen sobre aceite">{valor(p.margen)}</Fila>
      </div>
    );
  };
  const TooltipMargen = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{fmt.monthShort(label)} · {rotuloUnidad}</div>
        <Fila color={colores.margen} label="Margen sobre aceite">{valor(p.margen)}</Fila>
        <Fila label="Biodiésel">{valor(p.bio)}</Fila>
        <Fila label={aceite.nombre}>{valor(p.aceite)}</Fila>
        <Fila label="Promedio del intervalo">{valor(promedios.margen)}</Fila>
      </div>
    );
  };
  const TooltipCrack = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{fmt.monthShort(label)} · {rotuloUnidad}</div>
        <Fila color={colores.crack} label="Crack spread 10:9:1">{valor(p.crack)}</Fila>
        <Fila color={colores.crackPct} label="Sobre el aceite">{pct(p.crackPct)}</Fila>
        <Fila color={colores.crackAcum} label={`Acumulado desde ${primerCrack ? fmt.monthShort(primerCrack.fecha) : '-'}`}>{pctSigno(p.crackAcum)}</Fila>
        <Fila label="Biodiésel × 0,9">{valor(p.bio != null ? p.bio * RATIO.bio : null)}</Fila>
        <Fila label={`Glicerina × 0,1${p.glicFuente ? ` (${FUENTES_GLICERINA[p.glicFuente]})` : ''}`}>{valor(p.glic != null ? p.glic * RATIO.glicerina : null)}</Fila>
        <Fila label={aceite.nombre}>{valor(p.aceite)}</Fila>
      </div>
    );
  };

  const cajas = [
    { id: 'resultado', titulo: 'Resultado', detalle: ultimo ? `${fmt.monthShort(ultimo.fecha)} · biodiésel ${valor(ultimo.bio)} · ${aceite.label} ${valor(ultimo.aceite)} ${rotuloUnidad}` : 'sin datos' },
    { id: 'precios', titulo: 'Biodiésel y aceite FAS', detalle: `Precio del biodiésel de corte, ${aceite.enFrase} y el margen entre los dos` },
    { id: 'margen', titulo: 'Margen sobre aceite', detalle: `Biodiésel menos aceite · promedio ${valor(promedios.margen)} ${rotuloUnidad}` },
    { id: 'crack', titulo: 'Crack spread 10:9:1', detalle: `0,9 × biodiésel + 0,1 × glicerina - aceite · promedio ${valor(promedios.crack)} ${rotuloUnidad}, ${pct(promedios.crackPct)} del aceite` },
  ];
  const tono = (v) => (v == null ? undefined : v < 0 ? 'warn' : 'pos');
  const lineaProps = { type: 'linear', strokeWidth: 2, dot: false, activeDot: { r: 4 }, isAnimationActive: false, connectNulls: true };

  return (
    <div className="go-seccion go-sesco go-margenes">
      <div className="go-sticky">
        <Encabezado seccion={seccion} />
        <div className="go-filtros go-filtros-margenes">
          <div className="go-filtro go-f-intervalo">
            <span className="go-filtro-label">Intervalo</span>
            <div className="go-intervalo-controles">
              <select className="empresa-select" value={desde} onChange={(e) => cambiarDesde(e.target.value)} aria-label="Desde">
                {[...MESES].reverse().map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
              </select>
              <span className="go-filtro-label">a</span>
              <select className="empresa-select" value={hasta} onChange={(e) => cambiarHasta(e.target.value)} aria-label="Hasta">
                {[...MESES].reverse().map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
              </select>
              <div className="chart-range-selector">
                {ATAJOS.map(([id, n, label]) => (
                  <button key={id} className={atajoActivo === id ? 'active' : ''} onClick={() => atajo(n)}>{label}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="go-filtro">
            <label htmlFor="go-mb-presidencia">Presidencia</label>
            <select id="go-mb-presidencia" className="empresa-select" value={presidenciaActiva} onChange={(e) => elegirPresidencia(e.target.value)}>
              <option value="">Elegir una presidencia…</option>
              {PERIODOS.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} · {fmt.monthShort(p.desde)} a {fmt.monthShort(p.hasta)}</option>
              ))}
            </select>
          </div>
          <div className="go-filtro">
            <label htmlFor="go-mb-aceite">Aceite</label>
            <select id="go-mb-aceite" className="empresa-select" value={aceiteId} onChange={(e) => setAceiteId(e.target.value)}>
              {ACEITES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div className="go-filtro">
            <label htmlFor="go-mb-unidad">Unidad</label>
            <select id="go-mb-unidad" className="empresa-select" value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
              {UNIDADES.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
        </div>
        <p className="chart-card-subtitle go-intervalo-nota">
          {R.meses} meses, {fmt.monthShort(desde)} a {fmt.monthShort(hasta)} · {rotuloUnidad} corrientes · {aceite.detalle} · glicerina: {glicerina.resumen.join(' · ') || 'sin precio'}
        </p>
        <Cajas cajas={cajas} abiertos={abiertos} alternar={alternar} />
      </div>

      {abiertos.resultado && ultimo && (
        <div className="go-kpi-bloque">
          <div className="go-kpi-cabecera">
            <span className="chart-card-subtitle">{fmt.monthShort(ultimo.fecha)} · {rotuloUnidad} corrientes · promedios de {fmt.monthShort(desde)} a {fmt.monthShort(hasta)}</span>
          </div>
          <div className="kpi-grid go-kpis-fila">
            <Tarjeta label="Biodiésel" valor={valor(ultimo.bio)} unidad={rotuloUnidad} tono="pos" sub={`corte obligatorio, precio mediana Res. 963 · ${fmt.monthShort(primero.fecha)}: ${valor(primero.bio)}`} />
            <Tarjeta label={aceite.nombre} valor={valor(ultimo.aceite)} unidad={rotuloUnidad} tono="warn" sub={`${aceite.detalle} · ${fmt.monthShort(primero.fecha)}: ${valor(primero.aceite)}`} />
            <Tarjeta label="Margen sobre aceite" valor={valor(ultimo.margen)} unidad={rotuloUnidad} tono={tono(ultimo.margen)} sub={`biodiésel menos aceite · promedio del intervalo ${valor(promedios.margen)}`} />
            <Tarjeta
              label="Crack spread 10:9:1" valor={ultimoCrack ? valor(ultimoCrack.crack) : '-'} unidad={rotuloUnidad} tono={tono(ultimoCrack?.crack)}
              sub={ultimoCrack ? `${fmt.monthShort(ultimoCrack.fecha)}, ${pct(ultimoCrack.crackPct)} del aceite · promedio ${valor(promedios.crack)} (${pct(promedios.crackPct)})` : 'sin precio de glicerina'}
            />
          </div>
        </div>
      )}

      {abiertos.precios && (
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Biodiésel y {aceite.enFrase} [{rotuloUnidad}]</span>
              <span className="chart-card-subtitle">Desde el inicio del corte obligatorio · precio del biodiésel de corte (mediana Res. 963), aceite y margen sobre aceite</span>
            </div>
          </div>
          <div className="chart-card-body">
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={pts} margin={{ top: 14, right: 64, left: 0, bottom: 0 }}>
                <XAxis {...ejeX} />
                <YAxis {...ejeY()} />
                <ReferenceLine y={0} stroke={C.axis} />
                <Tooltip content={<TooltipPrecios />} cursor={{ stroke: C.cursorLinea }} />
                <Line {...lineaProps} dataKey="bio" name="Biodiésel" stroke={colores.bio} label={<EtiquetaExtremos extremos={extremos.bio} color={colores.bio} />} />
                <Line {...lineaProps} dataKey="aceite" name={aceite.nombre} stroke={colores.aceite} label={<EtiquetaExtremos extremos={extremos.aceite} color={colores.aceite} />} />
                <Line {...lineaProps} dataKey="margen" name="Margen sobre aceite" stroke={colores.margen} label={<EtiquetaExtremos extremos={extremos.margen} color={colores.margen} />} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colores.bio }} />Biodiésel [{rotuloUnidad}]</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colores.aceite }} />{aceite.nombre}</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colores.margen }} />Margen sobre aceite</div>
            </div>
          </div>
        </div>
      )}

      {abiertos.margen && (
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Margen entre el biodiésel y el aceite FAS [{rotuloUnidad}]</span>
              <span className="chart-card-subtitle">Biodiésel menos {aceite.enFrase}, mes a mes · promedio del intervalo {valor(promedios.margen)} {rotuloUnidad}</span>
            </div>
          </div>
          <div className="chart-card-body">
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={pts} margin={{ top: 14, right: 64, left: 0, bottom: 0 }}>
                <XAxis {...ejeX} />
                <YAxis {...ejeY()} />
                <ReferenceLine y={0} stroke={C.axis} />
                {refPromedio(promedios.margen)}
                <Tooltip content={<TooltipMargen />} cursor={{ stroke: C.cursorLinea }} />
                <Line {...lineaProps} dataKey="margen" name="Margen sobre aceite" stroke={colores.bio} label={<EtiquetaExtremos extremos={extremos.margen} color={colores.bio} />} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {abiertos.crack && (
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Crack spread del biodiésel sobre el aceite FAS, ratio 10:9:1 [{rotuloUnidad} y %]</span>
              <span className="chart-card-subtitle">
                0,9 × biodiésel + 0,1 × glicerina - {aceite.enFrase} · en {rotuloUnidad}, en % del aceite y acumulado desde {primerCrack ? fmt.monthShort(primerCrack.fecha) : '-'}
              </span>
            </div>
          </div>
          <div className="chart-card-body go-crack-paneles">
            <p className="go-crack-rotulo">Crack spread [{rotuloUnidad}] · promedio {valor(promedios.crack)}</p>
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart data={pts} margin={{ top: 14, right: 64, left: 0, bottom: 0 }} syncId="crack">
                <XAxis {...ejeX} />
                <YAxis {...ejeY()} />
                {sombraExplora(true)}
                <ReferenceLine y={0} stroke={C.axis} />
                {refPromedio(promedios.crack)}
                <Tooltip content={<TooltipCrack />} cursor={{ stroke: C.cursorLinea }} />
                <Line {...lineaProps} dataKey="crack" name="Crack spread" stroke={colores.crack} label={<EtiquetaExtremos extremos={extremos.crack} color={colores.crack} />} />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="go-crack-rotulo">Crack spread [% del aceite] · promedio {pct(promedios.crackPct)}</p>
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart data={pts} margin={{ top: 14, right: 64, left: 0, bottom: 0 }} syncId="crack">
                <XAxis {...ejeX} />
                <YAxis {...ejeY(56, (v) => fmt.pct(v, 0))} />
                {sombraExplora(false)}
                <ReferenceLine y={0} stroke={C.axis} />
                {refPromedio(promedios.crackPct, (v) => fmt.pct(v, 1))}
                <Tooltip content={<TooltipCrack />} cursor={{ stroke: C.cursorLinea }} />
                <Line {...lineaProps} dataKey="crackPct" name="Crack spread %" stroke={colores.crackPct} label={<EtiquetaExtremos extremos={extremos.crackPct} color={colores.crackPct} formato={(v) => fmt.pct(v, 1)} />} />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="go-crack-rotulo">Crack spread [% acumulado desde {primerCrack ? fmt.monthShort(primerCrack.fecha) : '-'}]</p>
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart data={pts} margin={{ top: 14, right: 64, left: 0, bottom: 0 }} syncId="crack">
                <XAxis {...ejeX} />
                <YAxis {...ejeY(56, (v) => fmt.pct(v, 0))} />
                {sombraExplora(false)}
                <ReferenceLine y={0} stroke={C.axis} />
                <Tooltip content={<TooltipCrack />} cursor={{ stroke: C.cursorLinea }} />
                <Line {...lineaProps} dataKey="crackAcum" name="Acumulado" stroke={colores.crackAcum} label={<EtiquetaExtremos extremos={extremos.crackAcum} color={colores.crackAcum} formato={(v) => pctSigno(v, 0)} />} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colores.crack }} />Crack spread [{rotuloUnidad}]</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colores.crackPct }} />En % del aceite</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colores.crackAcum }} />Variación acumulada</div>
              {glicerina.tramos.length > 0 && <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.banda, border: `1px solid ${C.axis}` }} />Meses con la glicerina al precio de venta de Explora</div>}
            </div>
          </div>
        </div>
      )}

      <p className="note go-nota">
        Fuente: Secretaría de Energía (precio del biodiésel para el corte obligatorio, categoría mediana, en $/ton pasado a dólares con el
        tipo de cambio del mes), SAGyP (FOB oficial del aceite de soja y retención: FAS Minagri = FOB × (1 - retención), día a día y
        promediado por mes), J.J. Hinrichsen (FAS Rosario: vendedor desde mar-2023, antes el promedio), F.O. Licht (glicerina cruda 80%
        Rosario fob{FICHA_GLICERINA.rosario?.hasta ? `, hasta ${fmt.monthShort(FICHA_GLICERINA.rosario.hasta)}` : ''}; en los meses sin precio, la de USA exw{FICHA_GLICERINA.usa?.hasta ? `, hasta ${fmt.monthShort(FICHA_GLICERINA.usa.hasta)}` : ''}) y, cuando ninguna de las dos
        cotiza, el precio de venta de la glicerina 80% de Explora del Reporte de Gestión (ponderado de ventas locales y de exportación{FICHA_GLICERINA.explora?.hasta ? `, hasta ${fmt.monthShort(FICHA_GLICERINA.explora.hasta)}; los meses posteriores repiten ese último precio` : ''}).
        Margen sobre aceite = biodiésel - aceite. Crack spread 10:9:1 = {RATIO.bio} × biodiésel + {RATIO.glicerina} × glicerina - aceite (diez de aceite dan
        nueve de biodiésel y una de glicerina); en % = crack spread ÷ aceite; acumulado = variación del crack spread contra el primer mes del
        intervalo. Unidad: cada precio pasa de usd/ton a la unidad elegida con su densidad (biodiésel {DENSIDADES.bio}, aceite de soja {DENSIDADES.aceite},
        glicerina {DENSIDADES.glicerina} ton/m³; 6,2898 bbl y 264,172 gal por m³). Dólares corrientes.
      </p>
    </div>
  );
}
