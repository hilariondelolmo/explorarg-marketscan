import { useEffect, useMemo, useState } from 'react';
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import { useCajas, Cajas } from '../gasoil/relevamiento.jsx';
import { MESES_ANOMALOS, MESES_ANOMALOS_PRODUCTOS } from '../../lib/gasoil.js';
import { DENSIDADES, PRIMER_MES, UNIDADES, FICHA_CRUDO, periodosEntre, calcular } from '../../lib/margenesGasoil.js';
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
const pct = (v, d = 1) => (v == null ? '-' : fmt.pct(v, d));
const pctSigno = (v, d = 0) => (v == null ? '-' : `${v > 0 ? '+' : ''}${fmt.pct(v, d)}`);
const variacionPct = (v, base) => (v == null || base == null || base === 0 ? null : (v / base - 1) * 100);
const ejeAnio = (f) => (f.endsWith('-01') ? f.slice(0, 4) : '');
const ejeAnioPar = (f) => (f.endsWith('-01') && Number(f.slice(0, 4)) % 2 === 0 ? f.slice(0, 4) : '');
const MQ_ANGOSTO = '(max-width: 720px)';

function Encabezado({ seccion }) {
  return (
    <>
      <p className="section-kicker">Márgenes</p>
      <h2>{seccion?.title ?? 'Márgenes del gas oil'}</h2>
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

/** Etiqueta con el valor en el primer y el último punto con dato (la del primero debajo del punto). */
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
 * Crack spread de refinación sobre el crudo (pedido de HDO del 12/10/2026):
 * réplica de la hoja CRACK SPREAD INICIO del workbook 03. Precios sin
 * impuestos y ponderados por volumen del relevamiento Res. 1104 (con sus
 * aperturas) o de las terminales (precios en planta por empresa y terminal);
 * gas oil fósil; crudo mezclado con los porcentajes elegidos; ratios 2:1:1,
 * 3:2:1 y 5:3:2. Fórmulas y fuentes en src/lib/margenesGasoil.js.
 */
export default function MargenesGasoil({ seccion }) {
  const C = useChartColors();
  const G = useFiltrosGasoil();
  const { error, cargando, fuenteDef, ratio, pctCrudo, mezclaTexto, meses, ultimoMes, precios, excluidos, recorte } = G;
  const [unidadId, setUnidadId] = useState('bbl');
  const [desde, setDesde] = useState(PRIMER_MES);
  const [hasta, setHasta] = useState('');  // '' = último mes con datos
  const [abiertos, alternar] = useCajas({ resultado: true, precios: true, crack: true });
  const [angosto, setAngosto] = useState(() => typeof window !== 'undefined' && window.matchMedia(MQ_ANGOSTO).matches);
  useEffect(() => {
    const mq = window.matchMedia(MQ_ANGOSTO);
    const fn = (e) => setAngosto(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  const hastaEf = hasta && meses.includes(hasta) ? hasta : ultimoMes;
  const idx = useMemo(() => new Map(meses.map((f, i) => [f, i])), [meses]);
  const PERIODOS = useMemo(() => (ultimoMes ? periodosEntre(PRIMER_MES, ultimoMes) : []), [ultimoMes]);

  const R = useMemo(() => calcular({ precios, meses, excluidos, ratioId: ratio.id, unidadId, pct: pctCrudo, desde, hasta: hastaEf }),
    [precios, meses, excluidos, ratio, unidadId, pctCrudo, desde, hastaEf]);
  const { pts, rotuloUnidad, promedios, primero, ultimo } = R;

  // Intervalo, atajos y presidencias
  const cambiarDesde = (f) => { setDesde(f); if (f > hastaEf) setHasta(f); };
  const cambiarHasta = (f) => { setHasta(f); if (f < desde) setDesde(f); };
  const desdeAtajo = (n) => (n == null ? PRIMER_MES : meses[Math.max(0, (idx.get(ultimoMes) ?? 0) - n + 1)]);
  const atajo = (n) => { setHasta(''); setDesde(desdeAtajo(n)); };
  const atajoActivo = hastaEf !== ultimoMes ? '' : ATAJOS.find(([, n]) => desde === desdeAtajo(n))?.[0] || '';
  const presidenciaActiva = PERIODOS.find((p) => p.desde === desde && p.hasta === hastaEf)?.id || '';
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
    return { naftas: de('naftas'), gasoil: de('gasoil'), crudo: de('crudo'), crack: de('crack'), crackPct: de('crackPct'), crackAcum: de('crackAcum') };
  }, [pts]);

  const largo = pts.length > 48;
  const ejeX = {
    dataKey: 'fecha', tick: { fill: C.tick, fontSize: 11 }, stroke: C.axis, tickLine: false,
    ...(largo ? { tickFormatter: angosto ? ejeAnioPar : ejeAnio, interval: 0, minTickGap: 0 } : { tickFormatter: fmt.monthShort, interval: 'preserveStartEnd', minTickGap: 28 }),
  };
  const ejeValor = (v) => (v === 0 ? '0' : valor(v));
  const ejeY = (ancho = 56, formato = ejeValor) => ({ tick: { fill: C.tick, fontSize: 11 }, stroke: C.axis, tickFormatter: formato, width: ancho });
  const colores = { naftas: C.violeta, gasoil: C.oil, crudo: C.ink, crack: C.oil, crackPct: C.exp, crackAcum: C.ink };
  const refPromedio = (v, fmtV = valor) => (v == null ? null : (
    <ReferenceLine y={v} stroke={C.neutral} strokeDasharray="5 4" label={{ value: `Promedio: ${fmtV(v)}`, position: 'insideBottomLeft', fill: C.tick, fontSize: 11 }} />
  ));
  const lineaProps = { type: 'linear', strokeWidth: 2, dot: false, activeDot: { r: 4 }, isAnimationActive: false, connectNulls: false };

  const TooltipPrecios = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{fmt.monthShort(label)} · {rotuloUnidad}{p.excluido ? ' · mes excluido' : ''}</div>
        <Fila color={colores.naftas} label="Naftas súper y premium">{valor(p.naftas)}</Fila>
        <Fila color={colores.gasoil} label="Gas oil fósil">{valor(p.gasoil)}</Fila>
        <Fila color={colores.crudo} label={`Crudo (${mezclaTexto})`}>{valor(p.crudo)}</Fila>
      </div>
    );
  };
  const TooltipCrack = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{fmt.monthShort(label)} · {rotuloUnidad}{p.excluido ? ' · mes excluido' : ''}</div>
        <Fila color={colores.crack} label={`Crack spread ${ratio.label}`}>{valor(p.crack)}</Fila>
        <Fila color={colores.crackPct} label="Sobre el crudo">{pct(p.crackPct)}</Fila>
        <Fila color={colores.crackAcum} label={`Acumulado desde ${primero ? fmt.monthShort(primero.fecha) : '-'}`}>{pctSigno(p.crackAcum)}</Fila>
        <Fila label={`Naftas × ${ratio.naftas}`}>{valor(p.naftas != null ? p.naftas * ratio.naftas : null)}</Fila>
        <Fila label={`Gas oil fósil × ${ratio.gasoil}`}>{valor(p.gasoil != null ? p.gasoil * ratio.gasoil : null)}</Fila>
        <Fila label={`Crudo × ${ratio.naftas + ratio.gasoil}`}>{valor(p.crudo != null ? p.crudo * (ratio.naftas + ratio.gasoil) : null)}</Fila>
      </div>
    );
  };

  const cajas = [
    { id: 'resultado', titulo: 'Resultado del período', detalle: ultimo ? `Promedios de ${fmt.monthShort(desde)} a ${fmt.monthShort(hastaEf)} · crack spread ${valor(promedios.crack)} ${rotuloUnidad}, ${pct(promedios.crackPct)} del crudo` : 'sin datos' },
    { id: 'precios', titulo: 'Naftas, gas oil fósil y crudo', detalle: `Precios sin impuestos ponderados por volumen, ${fuenteDef.label.toLowerCase()} · crudo ${mezclaTexto}` },
    { id: 'crack', titulo: `Crack spread ${ratio.label}`, detalle: `(${ratio.naftas} × naftas + ${ratio.gasoil} × gas oil - ${ratio.naftas + ratio.gasoil} × crudo) ÷ ${ratio.naftas + ratio.gasoil} · en ${rotuloUnidad}, % del crudo y acumulado` },
  ];
  const tono = (v) => (v == null ? undefined : v < 0 ? 'warn' : 'pos');

  return (
    <div className="go-seccion go-sesco go-margenes go-margenes-go">
      <div className="go-sticky">
        <Encabezado seccion={seccion} />
        <div className="go-filtros go-filtros-margenes-go">
          <div className="go-filtro go-f-intervalo">
            <span className="go-filtro-label">Intervalo</span>
            <div className="go-intervalo-controles">
              <select className="empresa-select" value={desde} onChange={(e) => cambiarDesde(e.target.value)} aria-label="Desde">
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
            <label htmlFor="go-mg-presidencia">Presidencia</label>
            <select id="go-mg-presidencia" className="empresa-select" value={presidenciaActiva} onChange={(e) => elegirPresidencia(e.target.value)}>
              <option value="">Elegir una presidencia…</option>
              {PERIODOS.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} · {fmt.monthShort(p.desde)} a {fmt.monthShort(p.hasta)}</option>
              ))}
            </select>
          </div>
          <SelectFuente G={G} />
          <SelectRatio G={G} />
          <div className="go-filtro">
            <label htmlFor="go-mg-unidad">Unidad</label>
            <select id="go-mg-unidad" className="empresa-select" value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
              {UNIDADES.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
        </div>
        <FilaAperturas G={G} />
        <p className="chart-card-subtitle go-intervalo-nota">
          {R.meses} meses con crack spread, {fmt.monthShort(desde)} a {fmt.monthShort(hastaEf)} · {rotuloUnidad} corrientes · precios sin impuestos, {fuenteDef.nombre}: {recorte}{G.notaExcluidos(desde, hastaEf)}
        </p>
        <Cajas cajas={cajas} abiertos={abiertos} alternar={alternar} />
      </div>

      {error && <div className="section-placeholder">{error}</div>}
      {!error && cargando && <div className="section-placeholder">Cargando los precios…</div>}

      {abiertos.resultado && ultimo && (
        <div className="go-kpi-bloque">
          <div className="go-kpi-cabecera">
            <span className="chart-card-subtitle">Promedios de {fmt.monthShort(desde)} a {fmt.monthShort(hastaEf)} ({R.meses} meses) · {rotuloUnidad} corrientes · último mes {fmt.monthShort(ultimo.fecha)}</span>
          </div>
          <div className="kpi-grid go-kpis-fila">
            <Tarjeta label="Naftas súper y premium" valor={valor(promedios.naftas)} unidad={rotuloUnidad} tono="info" sub={`promedio del período · ${fmt.monthShort(primero.fecha)}: ${valor(primero.naftas)} → ${fmt.monthShort(ultimo.fecha)}: ${valor(ultimo.naftas)} (${pctSigno(variacionPct(ultimo.naftas, primero.naftas), 1)})`} />
            <Tarjeta label="Gas oil fósil" valor={valor(promedios.gasoil)} unidad={rotuloUnidad} tono="warn" sub={`promedio del período · ${fmt.monthShort(primero.fecha)}: ${valor(primero.gasoil)} → ${fmt.monthShort(ultimo.fecha)}: ${valor(ultimo.gasoil)} (${pctSigno(variacionPct(ultimo.gasoil, primero.gasoil), 1)})`} />
            <Tarjeta label={`Crudo: ${mezclaTexto}`} valor={valor(promedios.crudo)} unidad={rotuloUnidad} sub={`promedio del período · ${fmt.monthShort(primero.fecha)}: ${valor(primero.crudo)} → ${fmt.monthShort(ultimo.fecha)}: ${valor(ultimo.crudo)} (${pctSigno(variacionPct(ultimo.crudo, primero.crudo), 1)})`} />
            <Tarjeta
              label={`Crack spread ${ratio.label}`} valor={valor(promedios.crack)} unidad={rotuloUnidad} tono={tono(promedios.crack)}
              sub={`promedio del período, ${pct(promedios.crackPct)} del crudo · ${fmt.monthShort(ultimo.fecha)}: ${valor(ultimo.crack)} (${pct(ultimo.crackPct)}), acumulado ${pctSigno(ultimo.crackAcum, 0)}`}
            />
          </div>
        </div>
      )}

      {abiertos.precios && !cargando && (
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Naftas, gas oil fósil y crudo [{rotuloUnidad}]</span>
              <span className="chart-card-subtitle">Precios sin impuestos ponderados por volumen ({fuenteDef.nombre}) · gas oil neto del biodiésel mezclado · crudo {mezclaTexto}</span>
            </div>
          </div>
          <div className="chart-card-body">
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={pts} margin={{ top: 14, right: 64, left: 0, bottom: 0 }}>
                <XAxis {...ejeX} />
                <YAxis {...ejeY()} />
                <Tooltip content={<TooltipPrecios />} cursor={{ stroke: C.cursorLinea }} />
                <Line {...lineaProps} dataKey="naftas" name="Naftas" stroke={colores.naftas} label={<EtiquetaExtremos extremos={extremos.naftas} color={colores.naftas} />} />
                <Line {...lineaProps} dataKey="gasoil" name="Gas oil fósil" stroke={colores.gasoil} label={<EtiquetaExtremos extremos={extremos.gasoil} color={colores.gasoil} />} />
                <Line {...lineaProps} dataKey="crudo" name="Crudo" stroke={colores.crudo} strokeDasharray="4 3" label={<EtiquetaExtremos extremos={extremos.crudo} color={colores.crudo} />} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colores.naftas }} />Naftas súper y premium [{rotuloUnidad}]</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colores.gasoil }} />Gas oil fósil (grado 2 y 3, neto del biodiésel)</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colores.crudo }} />Crudo: {mezclaTexto}</div>
            </div>
          </div>
        </div>
      )}

      {abiertos.crack && !cargando && (
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Crack spread de refinación sobre el crudo, ratio {ratio.label} [{rotuloUnidad} y %]</span>
              <span className="chart-card-subtitle">
                ({ratio.naftas} × naftas + {ratio.gasoil} × gas oil fósil - {ratio.naftas + ratio.gasoil} × crudo) ÷ {ratio.naftas + ratio.gasoil} · en {rotuloUnidad}, en % del crudo y acumulado desde {primero ? fmt.monthShort(primero.fecha) : '-'}
              </span>
            </div>
          </div>
          <div className="chart-card-body go-crack-paneles">
            <p className="go-crack-rotulo">Crack spread [{rotuloUnidad}] · promedio {valor(promedios.crack)}</p>
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart data={pts} margin={{ top: 14, right: 64, left: 0, bottom: 0 }} syncId="crack-go">
                <XAxis {...ejeX} />
                <YAxis {...ejeY()} />
                <ReferenceLine y={0} stroke={C.axis} />
                {refPromedio(promedios.crack)}
                <Tooltip content={<TooltipCrack />} cursor={{ stroke: C.cursorLinea }} />
                <Line {...lineaProps} dataKey="crack" name="Crack spread" stroke={colores.crack} label={<EtiquetaExtremos extremos={extremos.crack} color={colores.crack} />} />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="go-crack-rotulo">Crack spread [% del crudo] · promedio {pct(promedios.crackPct)}</p>
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart data={pts} margin={{ top: 14, right: 64, left: 0, bottom: 0 }} syncId="crack-go">
                <XAxis {...ejeX} />
                <YAxis {...ejeY(56, (v) => fmt.pct(v, 0))} />
                <ReferenceLine y={0} stroke={C.axis} />
                {refPromedio(promedios.crackPct, (v) => fmt.pct(v, 1))}
                <Tooltip content={<TooltipCrack />} cursor={{ stroke: C.cursorLinea }} />
                <Line {...lineaProps} dataKey="crackPct" name="Crack spread %" stroke={colores.crackPct} label={<EtiquetaExtremos extremos={extremos.crackPct} color={colores.crackPct} formato={(v) => fmt.pct(v, 1)} />} />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="go-crack-rotulo">Crack spread [% acumulado desde {primero ? fmt.monthShort(primero.fecha) : '-'}]</p>
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart data={pts} margin={{ top: 14, right: 64, left: 0, bottom: 0 }} syncId="crack-go">
                <XAxis {...ejeX} />
                <YAxis {...ejeY(56, (v) => fmt.pct(v, 0))} />
                <ReferenceLine y={0} stroke={C.axis} />
                <Tooltip content={<TooltipCrack />} cursor={{ stroke: C.cursorLinea }} />
                <Line {...lineaProps} dataKey="crackAcum" name="Acumulado" stroke={colores.crackAcum} label={<EtiquetaExtremos extremos={extremos.crackAcum} color={colores.crackAcum} formato={(v) => pctSigno(v, 0)} />} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colores.crack }} />Crack spread [{rotuloUnidad}]</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colores.crackPct }} />En % del crudo</div>
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colores.crackAcum }} />Variación acumulada</div>
            </div>
          </div>
        </div>
      )}

      <p className="note go-nota">
        Fuente: Secretaría de Energía, relevamiento Res. 1104/2004 (precios sin impuestos y volúmenes de gas oil grado 2 y 3 y de nafta súper y
        premium, por canal de distribución, tipo de negocio y canal de comercialización) y precios de venta en planta por reventa a estaciones de
        servicio (por empresa y terminal, zona exenta y no exenta ponderadas por volumen; la hoja del workbook deja afuera las terminales
        {G.T ? ` ${G.T.excluidas.map((x) => x.charAt(0) + x.slice(1).toLowerCase()).join(', ')}` : ''} y los meses{G.T ? ` ${G.T.meses_excluidos.map(fmt.monthShort).join(', ')}` : ''}, y así abre esta página); ventas de biodiésel para el corte y precio
        Res. 963 (mediana) para el gas oil fósil = (precio sin impuestos - mezcla real × biodiésel) ÷ (1 - mezcla real); crudos Medanito, Escalante
        y Cañadón Seco del informe de regalías de la SE en usd/m³{FICHA_CRUDO.escalante?.nota ? ` (${FICHA_CRUDO.escalante.nota})` : ''}; tipo de cambio mensual. Naftas y gas oil pasan de $/l a usd/m³ con el TC del mes;
        a la unidad elegida con la densidad de cada producto (gas oil {DENSIDADES.gasoil}, naftas {DENSIDADES.naftas}, crudo {DENSIDADES.crudo} ton/m³; 6,2898 bbl y 264,172 gal por m³). Las naftas no se netean del bioetanol.
        Crack spread = (a × naftas + b × gas oil fósil - (a + b) × crudo) ÷ (a + b), con a:b = 1:1 (ratio 2:1:1), 2:1 (3:2:1) o 3:2 (5:3:2); en % = crack spread ÷ crudo;
        acumulado = variación contra el primer mes del intervalo. Dólares corrientes. Con precios de mercado quedan afuera los meses con precios anómalos del relevamiento: los seis del gas oil que excluye todo el sitio ({[...MESES_ANOMALOS].map(fmt.monthShort).join(', ')}) y los de las naftas sin impuestos ({Object.values(MESES_ANOMALOS_PRODUCTOS).flat().sort().map(fmt.monthShort).join(', ')}; abr y jun-2025 vienen por diez en la nafta premium del minorista y sep-2025 trae la del mayorista a 2.307 $/l).
      </p>
    </div>
  );
}
