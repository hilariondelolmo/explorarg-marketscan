import { useEffect, useMemo, useState } from 'react';
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import { useCajas, Cajas, DropdownMulti, TODAS } from '../gasoil/relevamiento.jsx';
import { TIPOS_NEGOCIO, CANALES_COM } from '../../lib/gasoil.js';
import {
  RATIOS, CRUDOS, PCT_INICIAL, DENSIDADES, FUENTES, PRIMER_MES, UNIDADES, FICHA_CRUDO,
  cargarProductos, cargarTerminales, preciosMercado, preciosTerminales, periodosEntre, calcular,
} from '../../lib/margenesGasoil.js';
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
  const [D, setD] = useState(null);       // relevamiento abierto por producto
  const [T, setT] = useState(null);       // precios en planta
  const [error, setError] = useState(null);
  const [fuente, setFuente] = useState('mercado');
  const [ratioId, setRatioId] = useState('321');
  const [unidadId, setUnidadId] = useState('bbl');
  const [pctCrudo, setPctCrudo] = useState(PCT_INICIAL); // % de cada crudo en la mezcla
  const [desde, setDesde] = useState(PRIMER_MES);
  const [hasta, setHasta] = useState('');  // '' = último mes con datos
  // Mercado: mayorista, todos los tipos y canales al entrar (HDO, 12/10/2026)
  const [cd, setCd] = useState('1');
  const [tipos, setTipos] = useState(() => new Set(TIPOS_NEGOCIO));
  const [cc, setCc] = useState(TODAS);
  // Terminales: todas las empresas; las terminales sin las que excluye el workbook
  const [empresas, setEmpresas] = useState(null);
  const [terminales, setTerminales] = useState(null);
  const [abiertos, alternar] = useCajas({ resultado: true, precios: true, crack: true });
  const [angosto, setAngosto] = useState(() => typeof window !== 'undefined' && window.matchMedia(MQ_ANGOSTO).matches);
  useEffect(() => {
    const mq = window.matchMedia(MQ_ANGOSTO);
    const fn = (e) => setAngosto(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  useEffect(() => {
    cargarProductos().then(setD).catch((e) => setError(e.message));
    cargarTerminales().then((t) => {
      setT(t);
      setEmpresas(new Set(t.empresas));
      setTerminales(new Set(t.terminales.filter((x) => !t.excluidas.includes(x))));
    }).catch((e) => setError(e.message));
  }, []);

  const TN = D?.tipos_negocio || TIPOS_NEGOCIO;
  const CC = D?.canales_com || CANALES_COM;
  const meses = (fuente === 'mercado' ? D?.meses : T?.meses) || [];
  const ultimoMes = meses.at(-1) || '';
  const hastaEf = hasta && meses.includes(hasta) ? hasta : ultimoMes;
  const idx = useMemo(() => new Map(meses.map((f, i) => [f, i])), [meses]);
  const PERIODOS = useMemo(() => (ultimoMes ? periodosEntre(PRIMER_MES, ultimoMes) : []), [ultimoMes]);

  const cdN = cd === 'ambos' ? null : Number(cd);
  const ccN = cc === TODAS ? null : Number(cc);
  const tiposIdx = useMemo(() => new Set(TN.map((t, i) => (tipos.has(t) ? i : -1)).filter((i) => i >= 0)), [TN, tipos]);
  const disponibles = useMemo(() => {
    if (!D) return { tipos: [...TN].sort(), canales: [...CC].sort() };
    const tn = new Set();
    const ccs = new Set();
    for (let i = 0; i < D.mes.length; i++) {
      if (cdN != null && D.cd[i] !== cdN) continue;
      tn.add(D.tn[i]);
      ccs.add(D.cc[i]);
    }
    return { tipos: [...tn].map((i) => TN[i]).sort(), canales: [...ccs].map((i) => CC[i]).sort() };
  }, [D, cdN, TN, CC]);
  const cambiarCd = (v) => { setCd(v); setTipos(new Set(TN)); setCc(TODAS); };
  const resumenTipos = tipos.size >= disponibles.tipos.length ? 'Todos los tipos'
    : `${[...tipos].filter((t) => disponibles.tipos.includes(t)).length} de ${disponibles.tipos.length} tipos`;
  const resumenEmpresas = !T || !empresas ? '…' : empresas.size >= T.empresas.length ? 'Todas las empresas' : `${empresas.size} de ${T.empresas.length} empresas`;
  const sinExcluidas = T ? T.terminales.filter((x) => !T.excluidas.includes(x)) : [];
  const resumenTerminales = !T || !terminales ? '…'
    : terminales.size >= T.terminales.length ? 'Todas las terminales'
      : sinExcluidas.length === terminales.size && sinExcluidas.every((x) => terminales.has(x)) ? 'Sin las excluidas del workbook'
        : `${terminales.size} de ${T.terminales.length} terminales`;
  const ACCIONES_TERMINALES = T ? [['Todas', T.terminales, 'Todas las terminales'], ['Sin excluidas', sinExcluidas, `Sin ${T.excluidas.join(', ').toLowerCase()}, como la hoja del workbook`], ['Ninguna', [], '']] : [];
  const ACCIONES_EMPRESAS = T ? [['Todas', T.empresas, ''], ['Ninguna', [], '']] : [];

  // Precios por mes ($/l) de la fuente elegida
  const precios = useMemo(() => {
    if (fuente === 'mercado') {
      if (!D) return new Map();
      const filtro = (i) => (cdN == null || D.cd[i] === cdN) && tiposIdx.has(D.tn[i]) && (ccN == null || D.cc[i] === ccN);
      return preciosMercado(D, filtro);
    }
    if (!T || !empresas || !terminales) return new Map();
    return preciosTerminales(T, empresas, terminales);
  }, [fuente, D, T, cdN, tiposIdx, ccN, empresas, terminales]);
  const excluidos = useMemo(() => new Set(fuente === 'terminales' && T ? T.meses_excluidos : []), [fuente, T]);
  const R = useMemo(() => calcular({ precios, meses, excluidos, ratioId, unidadId, pct: pctCrudo, desde, hasta: hastaEf }),
    [precios, meses, excluidos, ratioId, unidadId, pctCrudo, desde, hastaEf]);
  const { pts, ratio, rotuloUnidad, promedios, primero, ultimo } = R;
  const fuenteDef = FUENTES.find((f) => f.id === fuente);
  const sumaPct = CRUDOS.reduce((s, c) => s + (Number(pctCrudo[c.id]) || 0), 0);
  const recorte = fuente === 'mercado'
    ? `${cd === 'ambos' ? 'minorista y mayorista' : cd === '0' ? 'minorista' : 'mayorista'} · ${resumenTipos.toLowerCase()} · ${ccN == null ? 'todos los canales' : CC[ccN].toLowerCase()}`
    : `${resumenEmpresas.toLowerCase()} · ${resumenTerminales.toLowerCase()}`;
  const mezclaTexto = CRUDOS.filter((c) => Number(pctCrudo[c.id]) > 0).map((c) => `${c.nombre} ${fmt.pct((Number(pctCrudo[c.id]) / (sumaPct || 1)) * 100, 0)}`).join(' + ') || 'sin crudo';

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
  const cambiarPct = (id, v) => setPctCrudo((p) => ({ ...p, [id]: Math.max(0, Math.min(100, Number(v) || 0)) }));

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
  const cargando = fuente === 'mercado' ? !D : !T;

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
          <div className="go-filtro">
            <label htmlFor="go-mg-fuente">Precios</label>
            <select id="go-mg-fuente" className="empresa-select" value={fuente} onChange={(e) => setFuente(e.target.value)}>
              {FUENTES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
          <div className="go-filtro">
            <label htmlFor="go-mg-ratio">Ratio</label>
            <select id="go-mg-ratio" className="empresa-select" value={ratioId} onChange={(e) => setRatioId(e.target.value)}>
              {RATIOS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div className="go-filtro">
            <label htmlFor="go-mg-unidad">Unidad</label>
            <select id="go-mg-unidad" className="empresa-select" value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
              {UNIDADES.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
        </div>
        <div className={`go-filtros go-filtros-margenes-go2 ${fuente === 'mercado' ? 'con-mercado' : 'con-terminales'}`}>
          {fuente === 'mercado' ? (
            <>
              <div className="go-filtro">
                <label htmlFor="go-mg-cd">Canal de distribución</label>
                <select id="go-mg-cd" className="empresa-select" value={cd} onChange={(e) => cambiarCd(e.target.value)}>
                  <option value="1">Mayorista</option>
                  <option value="0">Minorista</option>
                  <option value="ambos">Ambos</option>
                </select>
              </div>
              <div className="go-filtro">
                <span className="go-filtro-label">Tipo de negocio</span>
                <DropdownMulti opciones={disponibles.tipos} seleccion={tipos} resumen={resumenTipos} onCambiar={setTipos} />
              </div>
              <div className="go-filtro">
                <label htmlFor="go-mg-cc">Canal de comercialización</label>
                <select id="go-mg-cc" className="empresa-select" value={cc} onChange={(e) => setCc(e.target.value)}>
                  <option value={TODAS}>Todos los canales</option>
                  {disponibles.canales.map((c) => <option key={c} value={String(CC.indexOf(c))}>{c}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="go-filtro">
                <span className="go-filtro-label">Empresa</span>
                {T && empresas && <DropdownMulti opciones={T.empresas} seleccion={empresas} resumen={resumenEmpresas} onCambiar={setEmpresas} acciones={ACCIONES_EMPRESAS} />}
              </div>
              <div className="go-filtro">
                <span className="go-filtro-label">Terminal</span>
                {T && terminales && <DropdownMulti opciones={T.terminales} seleccion={terminales} resumen={resumenTerminales} onCambiar={setTerminales} acciones={ACCIONES_TERMINALES} rotulo={(t) => t.charAt(0) + t.slice(1).toLowerCase()} />}
              </div>
            </>
          )}
          <div className="go-filtro go-f-crudo">
            <span className="go-filtro-label">Crudo, % de la mezcla</span>
            <div className="go-crudo-mezcla">
              {CRUDOS.map((c) => (
                <label key={c.id} className="go-crudo-item">
                  <span>{c.nombre}</span>
                  <input type="number" min="0" max="100" step="5" value={pctCrudo[c.id]} onChange={(e) => cambiarPct(c.id, e.target.value)} aria-label={`${c.nombre}, % de la mezcla`} />
                </label>
              ))}
              {sumaPct !== 100 && <span className="go-crudo-aviso">{sumaPct > 0 ? `suman ${sumaPct}%: se reparten en proporción` : 'sin crudo'}</span>}
            </div>
          </div>
        </div>
        <p className="chart-card-subtitle go-intervalo-nota">
          {R.meses} meses con crack spread, {fmt.monthShort(desde)} a {fmt.monthShort(hastaEf)} · {rotuloUnidad} corrientes · precios sin impuestos, {fuenteDef.nombre}: {recorte}
          {excluidos.size > 0 && ` · sin ${[...excluidos].filter((f) => f >= desde && f <= hastaEf).length} meses que excluye la hoja del workbook`}
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
        {T ? ` ${T.excluidas.map((x) => x.charAt(0) + x.slice(1).toLowerCase()).join(', ')}` : ''} y los meses{T ? ` ${T.meses_excluidos.map(fmt.monthShort).join(', ')}` : ''}, y así abre esta página); ventas de biodiésel para el corte y precio
        Res. 963 (mediana) para el gas oil fósil = (precio sin impuestos - mezcla real × biodiésel) ÷ (1 - mezcla real); crudos Medanito, Escalante
        y Cañadón Seco del informe de regalías de la SE en usd/m³{FICHA_CRUDO.escalante?.nota ? ` (${FICHA_CRUDO.escalante.nota})` : ''}; tipo de cambio mensual. Naftas y gas oil pasan de $/l a usd/m³ con el TC del mes;
        a la unidad elegida con la densidad de cada producto (gas oil {DENSIDADES.gasoil}, naftas {DENSIDADES.naftas}, crudo {DENSIDADES.crudo} ton/m³; 6,2898 bbl y 264,172 gal por m³). Las naftas no se netean del bioetanol.
        Crack spread = (a × naftas + b × gas oil fósil - (a + b) × crudo) ÷ (a + b), con a:b = 1:1 (ratio 2:1:1), 2:1 (3:2:1) o 3:2 (5:3:2); en % = crack spread ÷ crudo;
        acumulado = variación contra el primer mes del intervalo. Dólares corrientes. Quedan afuera los meses con precios anómalos del relevamiento que excluye todo el sitio.
      </p>
    </div>
  );
}
