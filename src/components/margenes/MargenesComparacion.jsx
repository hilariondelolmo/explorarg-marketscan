import { useEffect, useMemo, useState } from 'react';
import { ComposedChart, Line, Bar, Cell, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import { useCajas, Cajas } from '../gasoil/relevamiento.jsx';
import {
  MESES as MESES_BIO, ACEITES, UNIDADES, FUENTES_GLICERINA, calcular as calcularBio,
} from '../../lib/margenes.js';
import { periodosEntre, calcular as calcularGo } from '../../lib/margenesGasoil.js';
import { useFiltrosGasoil, SelectFuente, SelectRatio, FilaAperturas } from './filtrosGasoil.jsx';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import '../gasoil/GasOil.css';

const ATAJOS = [['12m', 12, '12 m'], ['24m', 24, '24 m'], ['5a', 60, '5 a'], ['todo', null, 'Todo']];

const valor = (v) => {
  if (v == null || isNaN(v)) return '-';
  const a = Math.abs(v);
  const dec = a < 10 ? 2 : a < 200 ? 1 : 0;
  return v.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};
const conSigno = (v) => (v == null ? '-' : `${v > 0 ? '+' : ''}${valor(v)}`);
const pct = (v, d = 1) => (v == null ? '-' : fmt.pct(v, d));
const ejeAnio = (f) => (f.endsWith('-01') ? f.slice(0, 4) : '');
const ejeAnioPar = (f) => (f.endsWith('-01') && Number(f.slice(0, 4)) % 2 === 0 ? f.slice(0, 4) : '');
const MQ_ANGOSTO = '(max-width: 720px)';

function Encabezado({ seccion }) {
  return (
    <>
      <p className="section-kicker">Márgenes</p>
      <h2>{seccion?.title ?? 'Biodiésel y gas oil, comparados'}</h2>
      {seccion?.intro && <p className="section-intro">{seccion.intro}</p>}
    </>
  );
}

function Tarjeta({ label, valor: v, unidad, sub, tono }) {
  return (
    <div className={`kpi-card ${tono ? `tone-${tono}` : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-val">{v}{unidad && <> <span className="kpi-unidad">{unidad}</span></>}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

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
 * Biodiésel y gas oil, comparados (pedido de HDO del 12/10/2026): el crack
 * spread del biodiésel (10:9:1 sobre el aceite FAS, pestaña Biodiésel) contra
 * el de refinación (2:1:1, 3:2:1 o 5:3:2 sobre el crudo, pestaña Gas oil),
 * en la misma unidad y el mismo intervalo, con las variables de cada uno a
 * mano: el aceite del biodiésel; la fuente de precios, las aperturas, el
 * ratio y la mezcla de crudo de la refinación. La diferencia es refinación
 * menos biodiésel (HDO, 12/10/2026). Reutiliza los cálculos de las
 * dos pestañas (src/lib/margenes.js y src/lib/margenesGasoil.js); los
 * promedios van sobre los meses en que existen los dos crack spreads.
 */
export default function MargenesComparacion({ seccion }) {
  const C = useChartColors();
  const G = useFiltrosGasoil();
  const [aceiteId, setAceiteId] = useState('minagri');
  const [unidadId, setUnidadId] = useState('ton'); // HDO (12/10/2026): abre en ton
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [abiertos, alternar] = useCajas({ resultado: true, crack: true });
  const [angosto, setAngosto] = useState(() => typeof window !== 'undefined' && window.matchMedia(MQ_ANGOSTO).matches);
  useEffect(() => {
    const mq = window.matchMedia(MQ_ANGOSTO);
    const fn = (e) => setAngosto(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  // Meses de la comparación: los que tienen las dos series (feb-2010 a ago-2026)
  const meses = useMemo(() => {
    const go = new Set(G.meses);
    return MESES_BIO.filter((f) => go.has(f));
  }, [G.meses]);
  const primerMes = meses[0] || '';
  const ultimoMes = meses.at(-1) || '';
  const desdeEf = desde && meses.includes(desde) ? desde : primerMes;
  const hastaEf = hasta && meses.includes(hasta) ? hasta : ultimoMes;
  const idx = useMemo(() => new Map(meses.map((f, i) => [f, i])), [meses]);
  const PERIODOS = useMemo(() => (ultimoMes ? periodosEntre(primerMes, ultimoMes) : []), [primerMes, ultimoMes]);
  const aceite = ACEITES.find((a) => a.id === aceiteId) || ACEITES[0];
  const unidad = UNIDADES.find((u) => u.id === unidadId) || UNIDADES[0];
  const rotuloUnidad = `usd/${unidad.label}`;

  // Los dos crack spreads en la misma unidad y el mismo intervalo
  const RB = useMemo(() => calcularBio({ aceiteId, unidadId, desde: desdeEf, hasta: hastaEf }), [aceiteId, unidadId, desdeEf, hastaEf]);
  const RG = useMemo(() => calcularGo({ precios: G.precios, meses: G.meses, excluidos: G.excluidos, ratioId: G.ratio.id, unidadId, pct: G.pctCrudo, desde: desdeEf, hasta: hastaEf }),
    [G.precios, G.meses, G.excluidos, G.ratio, unidadId, G.pctCrudo, desdeEf, hastaEf]);
  const R = useMemo(() => {
    const bio = new Map(RB.pts.map((p) => [p.fecha, p]));
    const go = new Map(RG.pts.map((p) => [p.fecha, p]));
    const pts = meses.filter((f) => f >= desdeEf && f <= hastaEf).map((f) => {
      const b = bio.get(f);
      const g = go.get(f);
      const ambos = b?.crack != null && g?.crack != null;
      return {
        fecha: f, bio: b?.crack ?? null, bioPct: b?.crackPct ?? null, go: g?.crack ?? null, goPct: g?.crackPct ?? null,
        dif: ambos ? g.crack - b.crack : null, glicFuente: b?.glicFuente ?? null, excluido: !!g?.excluido, // refinación menos biodiésel (HDO, 12/10/2026)
      };
    });
    const con = pts.filter((p) => p.dif != null);
    const promedio = (k) => (con.length ? con.reduce((s, p) => s + p[k], 0) / con.length : null);
    return {
      pts, n: con.length, primero: con[0] || null, ultimo: con.at(-1) || null,
      promedios: { bio: promedio('bio'), bioPct: promedio('bioPct'), go: promedio('go'), goPct: promedio('goPct'), dif: promedio('dif') },
      refArriba: con.filter((p) => p.dif > 0).length,
    };
  }, [RB, RG, meses, desdeEf, hastaEf]);
  const { pts, promedios, primero, ultimo } = R;

  // Intervalo, atajos y presidencias (sobre los meses comunes)
  const cambiarDesde = (f) => { setDesde(f); if (f > hastaEf) setHasta(f); };
  const cambiarHasta = (f) => { setHasta(f); if (f < desdeEf) setDesde(f); };
  const desdeAtajo = (n) => (n == null ? primerMes : meses[Math.max(0, (idx.get(ultimoMes) ?? 0) - n + 1)]);
  const atajo = (n) => { setHasta(''); setDesde(desdeAtajo(n)); };
  const atajoActivo = hastaEf !== ultimoMes ? '' : ATAJOS.find(([, n]) => desdeEf === desdeAtajo(n))?.[0] || '';
  const presidenciaActiva = PERIODOS.find((p) => p.desde === desdeEf && p.hasta === hastaEf)?.id || '';
  const elegirPresidencia = (id) => {
    const p = PERIODOS.find((q) => q.id === id);
    if (p) { setDesde(p.desde); setHasta(p.hasta); }
  };

  const extremos = useMemo(() => {
    const de = (k) => {
      const i0 = pts.findIndex((p) => p[k] != null);
      if (i0 < 0) return null;
      let i1 = pts.length - 1;
      while (i1 > i0 && pts[i1][k] == null) i1 -= 1;
      return [i0, i1];
    };
    return { bio: de('bio'), go: de('go'), bioPct: de('bioPct'), goPct: de('goPct') };
  }, [pts]);

  const largo = pts.length > 48;
  const ejeX = {
    dataKey: 'fecha', tick: { fill: C.tick, fontSize: 11 }, stroke: C.axis, tickLine: false,
    ...(largo ? { tickFormatter: angosto ? ejeAnioPar : ejeAnio, interval: 0, minTickGap: 0 } : { tickFormatter: fmt.monthShort, interval: 'preserveStartEnd', minTickGap: 28 }),
  };
  const ejeValor = (v) => (v === 0 ? '0' : valor(v));
  const ejeY = (ancho = 56, formato = ejeValor) => ({ tick: { fill: C.tick, fontSize: 11 }, stroke: C.axis, tickFormatter: formato, width: ancho });
  const colores = { bio: C.bio, go: C.oil, dif: C.exp };
  const lineaProps = { type: 'linear', strokeWidth: 2, dot: false, activeDot: { r: 4 }, isAnimationActive: false, connectNulls: false };
  // Rótulo del promedio arriba de su línea (las etiquetas del primer valor van debajo del punto, así no se pisan)
  const refPromedio = (v, color, nombre, fmtV = valor) => (v == null ? null : (
    <ReferenceLine y={v} stroke={color} strokeDasharray="5 4" strokeOpacity={0.8} label={{ value: `Promedio ${nombre}: ${fmtV(v)}`, position: 'insideBottomLeft', fill: color, fontSize: 11 }} />
  ));

  const TooltipCrack = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{fmt.monthShort(label)} · {rotuloUnidad}{p.excluido ? ' · mes excluido en refinación' : ''}</div>
        <Fila color={colores.bio} label="Crack spread biodiésel 10:9:1">{valor(p.bio)}{p.bioPct != null ? ` (${pct(p.bioPct)} del aceite)` : ''}</Fila>
        <Fila color={colores.go} label={`Crack spread refinación ${G.ratio.label}`}>{valor(p.go)}{p.goPct != null ? ` (${pct(p.goPct)} del crudo)` : ''}</Fila>
        <Fila color={colores.dif} label="Refinación menos biodiésel">{conSigno(p.dif)}</Fila>
        {p.glicFuente && p.glicFuente !== 'rosario' && <Fila label="Glicerina">{FUENTES_GLICERINA[p.glicFuente]}</Fila>}
      </div>
    );
  };

  const cajas = [
    { id: 'resultado', titulo: 'Resultado del período', detalle: ultimo ? `Promedios de ${fmt.monthShort(desdeEf)} a ${fmt.monthShort(hastaEf)} · biodiésel ${valor(promedios.bio)} · refinación ${valor(promedios.go)} ${rotuloUnidad}` : 'sin datos' },
    { id: 'crack', titulo: 'Crack spread, uno contra otro', detalle: `Biodiésel 10:9:1 sobre ${aceite.label} y refinación ${G.ratio.label} sobre el crudo · en ${rotuloUnidad}, en % de su materia prima y la diferencia refinación menos biodiésel` },
  ];
  const tono = (v) => (v == null ? undefined : v < 0 ? 'warn' : 'pos');
  const cargando = G.cargando;

  return (
    <div className="go-seccion go-sesco go-margenes go-margenes-comparacion">
      <div className="go-sticky">
        <Encabezado seccion={seccion} />
        <div className="go-filtros go-filtros-margenes">
          <div className="go-filtro go-f-intervalo">
            <span className="go-filtro-label">Intervalo</span>
            <div className="go-intervalo-controles">
              <select className="empresa-select" value={desdeEf} onChange={(e) => cambiarDesde(e.target.value)} aria-label="Desde">
                {[...meses].reverse().map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
              </select>
              <span className="go-filtro-label">a</span>
              <select className="empresa-select" value={hastaEf} onChange={(e) => cambiarHasta(e.target.value)} aria-label="Hasta">
                {[...meses].reverse().map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
              </select>
              <div className="chart-range-selector">
                {ATAJOS.map(([id, n, label]) => (
                  <button key={id} className={atajoActivo === id ? 'active' : ''} onClick={() => atajo(n)}>{label}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="go-filtro">
            <label htmlFor="go-mc-presidencia">Presidencia</label>
            <select id="go-mc-presidencia" className="empresa-select" value={presidenciaActiva} onChange={(e) => elegirPresidencia(e.target.value)}>
              <option value="">Elegir una presidencia…</option>
              {PERIODOS.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} · {fmt.monthShort(p.desde)} a {fmt.monthShort(p.hasta)}</option>
              ))}
            </select>
          </div>
          <div className="go-filtro">
            <label htmlFor="go-mc-aceite">Aceite del biodiésel</label>
            <select id="go-mc-aceite" className="empresa-select" value={aceiteId} onChange={(e) => setAceiteId(e.target.value)}>
              {ACEITES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div className="go-filtro">
            <label htmlFor="go-mc-unidad">Unidad</label>
            <select id="go-mc-unidad" className="empresa-select" value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
              {UNIDADES.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
        </div>
        <div className="go-filtros go-filtros-comparacion-go">
          <SelectFuente G={G} id="go-mc-fuente" label="Precios del gas oil" />
          <SelectRatio G={G} id="go-mc-ratio" label="Ratio de refinación" />
          <div className="go-filtro go-f-nota-go">
            <span className="go-filtro-label">Refinación</span>
            <span className="go-filtro-texto">{G.fuenteDef.nombre}: {G.recorte} · crudo {G.mezclaTexto}</span>
          </div>
        </div>
        <FilaAperturas G={G} idBase="go-mc" />
        <p className="chart-card-subtitle go-intervalo-nota">
          {R.n} meses con los dos crack spreads, {fmt.monthShort(desdeEf)} a {fmt.monthShort(hastaEf)} · {rotuloUnidad} corrientes · biodiésel 10:9:1 sobre {aceite.label} · refinación {G.ratio.label} sobre {G.mezclaTexto}{G.notaExcluidos(desdeEf, hastaEf)}
        </p>
        <Cajas cajas={cajas} abiertos={abiertos} alternar={alternar} />
      </div>

      {G.error && <div className="section-placeholder">{G.error}</div>}
      {!G.error && cargando && <div className="section-placeholder">Cargando los precios…</div>}

      {abiertos.resultado && ultimo && (
        <div className="go-kpi-bloque">
          <div className="go-kpi-cabecera">
            <span className="chart-card-subtitle">Promedios de {fmt.monthShort(desdeEf)} a {fmt.monthShort(hastaEf)} sobre los {R.n} meses con los dos crack spreads · {rotuloUnidad} corrientes · último mes {fmt.monthShort(ultimo.fecha)}</span>
          </div>
          <div className="kpi-grid go-kpis-fila">
            <Tarjeta label={`Crack spread biodiésel 10:9:1 · ${aceite.label}`} valor={valor(promedios.bio)} unidad={rotuloUnidad} tono="pos" sub={`${pct(promedios.bioPct)} del aceite en promedio · ${fmt.monthShort(ultimo.fecha)}: ${valor(ultimo.bio)} (${pct(ultimo.bioPct)})`} />
            <Tarjeta label={`Crack spread refinación ${G.ratio.label}`} valor={valor(promedios.go)} unidad={rotuloUnidad} tono="warn" sub={`${pct(promedios.goPct)} del crudo en promedio · ${fmt.monthShort(ultimo.fecha)}: ${valor(ultimo.go)} (${pct(ultimo.goPct)})`} />
            <Tarjeta label="Refinación menos biodiésel" valor={conSigno(promedios.dif)} unidad={rotuloUnidad} tono={promedios.dif == null ? undefined : promedios.dif > 0 ? 'warn' : 'pos'} sub={`promedio del período · ${fmt.monthShort(ultimo.fecha)}: ${conSigno(ultimo.dif)}`} />
            <Tarjeta label="Meses con la refinación arriba" valor={`${R.refArriba} de ${R.n}`} tono={R.refArriba * 2 >= R.n ? 'warn' : 'pos'} sub={`${pct(R.n ? (R.refArriba / R.n) * 100 : null, 0)} de los meses el crack spread de refinación superó al del biodiésel`} />
          </div>
        </div>
      )}

      {abiertos.crack && !cargando && (
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Crack spread del biodiésel y de la refinación [{rotuloUnidad} y %]</span>
              <span className="chart-card-subtitle">Biodiésel: 0,9 × biodiésel + 0,1 × glicerina - {aceite.enFrase} · refinación: ({G.ratio.naftas} × naftas + {G.ratio.gasoil} × gas oil fósil - {G.ratio.naftas + G.ratio.gasoil} × crudo) ÷ {G.ratio.naftas + G.ratio.gasoil} · cada % sobre su materia prima</span>
            </div>
          </div>
          <div className="chart-card-body go-crack-paneles">
            <p className="go-crack-rotulo">Crack spread [{rotuloUnidad}] · promedios: biodiésel {valor(promedios.bio)}, refinación {valor(promedios.go)}</p>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={pts} margin={{ top: 14, right: 64, left: 0, bottom: 0 }} syncId="comparacion">
                <XAxis {...ejeX} />
                <YAxis {...ejeY()} />
                <ReferenceLine y={0} stroke={C.axis} />
                {refPromedio(promedios.bio, colores.bio, 'biodiésel')}
                {refPromedio(promedios.go, colores.go, 'refinación')}
                <Tooltip content={<TooltipCrack />} cursor={{ stroke: C.cursorLinea }} />
                <Line {...lineaProps} dataKey="bio" name="Biodiésel" stroke={colores.bio} label={<EtiquetaExtremos extremos={extremos.bio} color={colores.bio} />} />
                <Line {...lineaProps} dataKey="go" name="Refinación" stroke={colores.go} label={<EtiquetaExtremos extremos={extremos.go} color={colores.go} />} />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="go-crack-rotulo">Crack spread [% de su materia prima] · promedios: biodiésel {pct(promedios.bioPct)} del aceite, refinación {pct(promedios.goPct)} del crudo</p>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={pts} margin={{ top: 14, right: 64, left: 0, bottom: 0 }} syncId="comparacion">
                <XAxis {...ejeX} />
                <YAxis {...ejeY(56, (v) => fmt.pct(v, 0))} />
                <ReferenceLine y={0} stroke={C.axis} />
                {refPromedio(promedios.bioPct, colores.bio, 'biodiésel', (v) => fmt.pct(v, 1))}
                {refPromedio(promedios.goPct, colores.go, 'refinación', (v) => fmt.pct(v, 1))}
                <Tooltip content={<TooltipCrack />} cursor={{ stroke: C.cursorLinea }} />
                <Line {...lineaProps} dataKey="bioPct" name="Biodiésel %" stroke={colores.bio} label={<EtiquetaExtremos extremos={extremos.bioPct} color={colores.bio} formato={(v) => fmt.pct(v, 1)} />} />
                <Line {...lineaProps} dataKey="goPct" name="Refinación %" stroke={colores.go} label={<EtiquetaExtremos extremos={extremos.goPct} color={colores.go} formato={(v) => fmt.pct(v, 1)} />} />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="go-crack-rotulo">Refinación menos biodiésel [{rotuloUnidad}] · promedio {conSigno(promedios.dif)} · la refinación arriba en {R.refArriba} de {R.n} meses</p>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={pts} margin={{ top: 14, right: 64, left: 0, bottom: 0 }} syncId="comparacion" barCategoryGap={1}>
                <XAxis {...ejeX} />
                <YAxis {...ejeY()} />
                <ReferenceLine y={0} stroke={C.axis} />
                {promedios.dif != null && <ReferenceLine y={promedios.dif} stroke={colores.dif} strokeDasharray="5 4" label={{ value: `Promedio: ${conSigno(promedios.dif)}`, position: 'insideBottomLeft', fill: colores.dif, fontSize: 11 }} />}
                <Tooltip content={<TooltipCrack />} cursor={{ fill: C.cursor }} />
                <Bar dataKey="dif" name="Refinación menos biodiésel" isAnimationActive={false}>
                  {pts.map((p) => <Cell key={p.fecha} fill={p.dif == null ? 'transparent' : p.dif >= 0 ? colores.go : colores.bio} />)}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colores.bio }} />Crack spread biodiésel 10:9:1 sobre {aceite.label}</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colores.go }} />Crack spread refinación {G.ratio.label} sobre el crudo ({G.fuenteDef.label.toLowerCase()})</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colores.dif }} />Diferencia: barra ámbar cuando la refinación deja más, verde cuando deja más el biodiésel</div>
            </div>
          </div>
        </div>
      )}

      <p className="note go-nota">
        Los dos crack spreads son los de las pestañas Biodiésel y Gas oil, con sus mismas fuentes y fórmulas, pasados a la misma unidad
        (biodiésel 0,885, aceite 0,92, glicerina 1,26, gas oil 0,845, naftas 0,68 y crudo 0,835 ton/m³; 6,2898 bbl y 264,172 gal por m³) y
        comparados mes a mes sobre el intervalo común (desde feb-2010, primer mes con precio de biodiésel; hasta el último mes con precios del
        gas oil). Los promedios y la cuenta de meses se calculan solo sobre los meses en que existen los dos. El % de cada uno es sobre su
        propia materia prima: el aceite FAS para el biodiésel, la mezcla de crudo para la refinación. Dólares corrientes.
      </p>
    </div>
  );
}
