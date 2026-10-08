import { useCallback, useEffect, useMemo, useState } from 'react';
import { ComposedChart, Bar, Cell, Line, XAxis, YAxis, Tooltip, ReferenceArea, ReferenceLine, ResponsiveContainer } from 'recharts';
import {
  MESES, ULTIMO_MES, IDX_MES, PRODUCTOS, COMPARADOS, IMPORTACIONES, TC, CPI_US, DENSIDAD_GO, DENSIDAD_BIO, TIPOS_PRECIO,
  ponderarCol, variacion,
} from '../../lib/gasoil.js';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import { useRelevamiento, FiltrosRelevamiento, NOTA_MESES_EXCLUIDOS } from './relevamiento.jsx';
import { PRESIDENCIAS } from '../../lib/gestiones.js';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import '../DocModal.css';
import './GasOil.css';

const INTERVALO_DEFAULT = 18; // meses hacia atrás al entrar (el tablero abre con Dec/24 a Jul/26)
const ATAJOS = [['12m', 12, '12 m'], ['24m', 24, '24 m'], ['5a', 60, '5 a'], ['todo', null, 'Todo']];
// Presidencias como intervalo (pedido de HDO del 08/10/2026): de diciembre del
// año en que asume a noviembre del año en que termina (la que sigue, hasta el
// último mes con datos); la primera arranca donde arrancan los datos (ene-2010).
const PERIODOS_PRESIDENCIA = PRESIDENCIAS.map((p) => {
  const desde = `${p.desde.slice(0, 4)}-12`;
  const hasta = p.hasta ? `${p.hasta.slice(0, 4)}-11` : ULTIMO_MES;
  return { id: p.presidente, nombre: p.corto, desde: desde < MESES[0] ? MESES[0] : desde, hasta: hasta > ULTIMO_MES ? ULTIMO_MES : hasta };
});
// Tipos de precio del relevamiento, todos en $/l: la unidad y la moneda se eligen aparte
const TIPOS_BASE = TIPOS_PRECIO.filter((t) => t.unidad === '$/l');
// Unidades: cuántas de cada una hay en un m³ (ton: la densidad del producto, en ton/m³)
const UNIDADES = [
  { id: 'ton', label: 'ton', porM3: (d) => d },
  { id: 'm3', label: 'm³', porM3: () => 1 },
  { id: 'l', label: 'l', porM3: () => 1000 },
  { id: 'bbl', label: 'bbl', porM3: () => 6.2898 },
  { id: 'gal', label: 'gal', porM3: () => 264.172 },
];
const MONEDAS = [['usd', 'usd', 'Dólares'], ['ars', '$', 'Pesos']];
// Densidades (ton/m³): gas oil y biodiésel, las del sitio; aceite de soja,
// metanol y crudo Brent, valores de referencia (avisados a HDO el 01/10/2026)
const DENSIDADES = { gasoil: DENSIDAD_GO, bio: DENSIDAD_BIO, aceite: 0.92, metanol: 0.792, brent: 0.835 };
// Gas oil del gráfico de comparación con el biodiésel: grado 2, grado 3 o el ponderado de los dos
const GO_COMPARACION = [['g2', 'GR2', 'Gas oil grado 2'], ['g3', 'GR3', 'Gas oil grado 3'], ['g23', 'GR2 + GR3', 'Gas oil grado 2 y 3']];

function Encabezado({ seccion }) {
  return (
    <>
      <p className="section-kicker">Mercado Gas Oil</p>
      <h2>{seccion?.title ?? 'Precios comparados'}</h2>
      {seccion?.intro && <p className="section-intro">{seccion.intro}</p>}
    </>
  );
}

/** Valor con los decimales que pide su magnitud (0,91 usd/l; 83,3 usd/bbl; 1.810 usd/ton). */
const valor = (v) => {
  if (v == null || isNaN(v)) return '-';
  const dec = Math.abs(v) < 10 ? 3 : Math.abs(v) < 200 ? 1 : 0;
  return v.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

/**
 * Tarjeta de variación al costado de cada gráfico (pedido de HDO del
 * 01/10/2026, en lugar de la línea roja de variación acumulada del tablero):
 * la variación entre el primer y el último valor del intervalo, y esos dos
 * valores con sus meses.
 */
function Variacion({ puntos, rotulo }) {
  const conDato = puntos.filter((p) => p.valor != null);
  if (conDato.length < 2) {
    return (
      <div className="go-variacion">
        {rotulo && <span className="go-variacion-rotulo">{rotulo}</span>}
        <span className="go-variacion-sin">sin dos valores en el intervalo</span>
      </div>
    );
  }
  const a = conDato[0];
  const b = conDato.at(-1);
  const d = variacion(b.valor, a.valor);
  return (
    <div className="go-variacion" title={`Variación acumulada entre ${fmt.monthShort(a.fecha)} y ${fmt.monthShort(b.fecha)}`}>
      {rotulo && <span className="go-variacion-rotulo">{rotulo}</span>}
      <span className={`go-variacion-delta ${d >= 0 ? 'delta-pos' : 'delta-neg'}`}>{d >= 0 ? '▲' : '▼'}{fmt.pct(Math.abs(d), Math.abs(d) >= 100 ? 0 : 1)}</span>
      <span className="go-variacion-valores">{valor(a.valor)} → {valor(b.valor)}</span>
      <span className="go-variacion-fechas">{fmt.monthShort(a.fecha)} → {fmt.monthShort(b.fecha)}</span>
    </div>
  );
}

const eje = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`
  : Math.abs(v) >= 1e5 ? `${Math.round(v / 1000)} K` : valor(v));

function TooltipPanel({ active, payload, label, unidad }) {
  if (!active || !payload?.length || payload[0].value == null) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{fmt.monthShort(label)}</div>
      <div className="chart-tooltip-row"><span>{payload[0].name}</span><strong>{valor(payload[0].value)} {unidad}</strong></div>
    </div>
  );
}

/** Brecha del biodiésel sobre el gas oil, en % con signo. */
const brechaPct = (bio, go) => (bio == null || !go ? null : (bio / go - 1) * 100);
const conSigno = (d) => `${d >= 0 ? '+' : '-'}${fmt.pct(Math.abs(d), 1)}`;

function TooltipComparacion({ active, payload, label, unidad }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const d = brechaPct(p.bio, p.go);
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{fmt.monthShort(label)}</div>
      {payload.filter((s) => s.dataKey !== 'brecha' && s.value != null).map((s) => (
        <div className="chart-tooltip-row" key={s.dataKey}><span style={{ color: s.color }}>{s.name}</span><strong>{valor(s.value)} {unidad}</strong></div>
      ))}
      {d != null && <div className="chart-tooltip-row"><span>Biodiésel sobre gas oil</span><strong>{conSigno(d)}</strong></div>}
    </div>
  );
}

const MESES_EN_TOOLTIP = 8;
function TooltipHistograma({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const c = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">Biodiésel entre {c.rotulo} sobre el gas oil</div>
      <div className="chart-tooltip-row"><span>Meses</span><strong>{c.n} de {total} ({fmt.pct((c.n / total) * 100)})</strong></div>
      {c.n > 0 && (
        <div className="chart-tooltip-row">
          <span>
            {c.meses.slice(0, MESES_EN_TOOLTIP).map(fmt.monthShort).join(', ')}
            {c.n > MESES_EN_TOOLTIP ? ` y ${c.n - MESES_EN_TOOLTIP} más` : ''}
          </span>
        </div>
      )}
    </div>
  );
}

/** El gráfico de un panel: chico en la grilla, grande en la ventana ampliada. */
function Grafico({ p, C, alto, grande }) {
  const letra = grande ? 12 : 10;
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <ComposedChart data={p.puntos} margin={{ top: 8, right: grande ? 16 : 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: letra }} stroke={C.axis} tickFormatter={fmt.monthShort} minTickGap={grande ? 48 : 36} />
        <YAxis tick={{ fill: C.tick, fontSize: letra }} stroke={C.axis} width={grande ? 62 : 50} domain={['auto', 'auto']} tickFormatter={eje} />
        <Tooltip content={<TooltipPanel unidad={p.unidad} />} cursor={{ stroke: C.axis }} />
        <Line dataKey="valor" name={p.titulo} stroke={p.color} strokeWidth={grande ? 2.5 : 2} dot={grande && p.puntos.length <= 36 ? { r: 2.5 } : false} connectNulls={!!p.unir} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/**
 * Ventana flotante con un gráfico de la grilla en grande (pedido de HDO del
 * 05/10/2026): se abre con un clic en el gráfico y se cierra con Esc, con la
 * cruz o con un clic afuera. Sigue los mismos filtros y controles de la página.
 */
function GraficoAmpliado({ p, C, onClose }) {
  useEffect(() => {
    document.body.classList.add('modal-open');
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="doc-modal" role="presentation">
      <div className="doc-modal-backdrop" onClick={onClose} />
      <div className="doc-modal-panel go-ampliado-panel" role="dialog" aria-modal="true" aria-labelledby="go-ampliado-titulo">
        <header className="doc-modal-header">
          <div className="doc-modal-title-block">
            <div className="doc-modal-eyebrow">Precios comparados</div>
            <div className="doc-modal-title" id="go-ampliado-titulo">{p.titulo} <span className="kpi-unidad">[{p.unidad}]</span></div>
            <div className="doc-modal-url">{p.sub}</div>
          </div>
          <div className="doc-modal-actions">
            <button className="doc-modal-close" onClick={onClose} aria-label="Cerrar">×</button>
          </div>
        </header>
        <div className="go-comparado-cuerpo go-ampliado-cuerpo">
          <div className="go-comparado-grafico go-ampliado-grafico"><Grafico p={p} C={C} alto="100%" grande /></div>
          <Variacion puntos={p.puntos} />
        </div>
      </div>
    </div>
  );
}

/**
 * Precios comparados: réplica del tablero ARG GO MARKET SIDE BY SIDE del
 * workbook 05 (pedido de HDO del 01/10/2026). Ocho gráficos chicos para un
 * intervalo elegido libremente (mes y año desde / hasta): gas oil grado 2 y
 * grado 3 del relevamiento (con los filtros y el tipo de precio de Precio
 * surtidor), gas oil importado CIF, crudo Brent, biodiésel Res. 963, aceite
 * de soja FAS MINAGRI, metanol YPF y tipo de cambio. En lugar de la línea
 * roja de variación acumulada del tablero, cada gráfico lleva al costado una
 * tarjeta con la variación entre el primer y el último valor del intervalo.
 *
 * El usuario elige la unidad (ton, m³, l, bbl, gal), la moneda (usd o $, con
 * el TC del mes) y si los valores son corrientes o constantes (deflactados
 * con el CPI de Estados Unidos al último mes del intervalo, en ambas monedas,
 * como el ranking y el workbook); pedido de HDO del 01/10/2026. Las siete
 * series de precio se pasan a esa unidad con la densidad de cada producto;
 * el tipo de cambio queda en $/usd.
 *
 * Diferencia con el tablero, avisada a HDO: el Tableau pondera el surtidor
 * sobre todas las filas, incluidas las que no tienen precio surtidor (no es
 * "al público"), así que sus niveles salen diluidos (432 $/l en ene-2025).
 * Acá el gas oil es el de Precio surtidor: al público, bocas de expendio,
 * ponderado por volumen solo entre las bocas con ese precio.
 *
 * Debajo de los ocho, un gráfico a todo el ancho compara el biodiésel con el
 * gas oil ponderado (grado 2, grado 3 o los dos juntos, a elección), siempre
 * con el precio sin impuestos del relevamiento, que es la comparación pareja
 * con el precio Res. 963 (pedido y definición de HDO del 05/10/2026); las
 * barras del eje derecho son la diferencia del mes en % (biodiésel sobre gas
 * oil) y, debajo, un histograma cuenta los meses del intervalo por tramo de
 * esa diferencia. Cada gráfico chico se abre en grande con un clic.
 */
export default function PreciosComparados({ seccion }) {
  const C = useChartColors();
  const F = useRelevamiento({ modo: 'surtidor' });
  const { DX, listo, error, tipo, fCanal, fBand, fProv, claves, etiquetaCanal, etiquetaFiltro } = F;
  const iUltimo = IDX_MES.get(ULTIMO_MES);
  const [hasta, setHasta] = useState(ULTIMO_MES);
  const [desde, setDesde] = useState(MESES[Math.max(0, iUltimo - INTERVALO_DEFAULT)]);
  const [unidadId, setUnidadId] = useState('ton');
  const [moneda, setMoneda] = useState('usd');
  const [constantes, setConstantes] = useState(false);
  const [goComp, setGoComp] = useState('g23');
  const [ampliado, setAmpliado] = useState(null); // id del panel abierto en grande
  const cerrarAmpliado = useCallback(() => setAmpliado(null), []);
  const iDesde = IDX_MES.get(desde);
  const iHasta = IDX_MES.get(hasta);
  const rango = useMemo(() => MESES.slice(iDesde, iHasta + 1), [iDesde, iHasta]);
  const atajo = (n) => {
    setHasta(ULTIMO_MES);
    setDesde(n == null ? MESES[0] : MESES[Math.max(0, iUltimo - n + 1)]);
  };
  const atajoActivo = ATAJOS.find(([, n]) => hasta === ULTIMO_MES && desde === (n == null ? MESES[0] : MESES[Math.max(0, iUltimo - n + 1)]))?.[0];
  const cambiarDesde = (f) => { setDesde(f); if (f > hasta) setHasta(f); };
  const cambiarHasta = (f) => { setHasta(f); if (f < desde) setDesde(f); };
  // Presidencia elegida: la que coincide exactamente con el intervalo (si el usuario mueve una fecha, se suelta)
  const presidenciaActiva = PERIODOS_PRESIDENCIA.find((p) => p.desde === desde && p.hasta === hasta)?.id || '';
  const elegirPresidencia = (id) => {
    const p = PERIODOS_PRESIDENCIA.find((q) => q.id === id);
    if (p) { setDesde(p.desde); setHasta(p.hasta); }
  };

  const unidad = UNIDADES.find((u) => u.id === unidadId);
  const simbolo = MONEDAS.find((m) => m[0] === moneda)[1];
  const rotuloUnidad = `${simbolo}/${unidad.label}`;
  // Valores constantes: a precios del último mes del intervalo con CPI (si ese mes no tiene CPI, el último que lo tenga)
  const baseCpi = useMemo(() => {
    for (let i = iHasta; i >= 0; i--) if (CPI_US.has(MESES[i])) return MESES[i];
    return null;
  }, [iHasta]);
  const cpiBase = baseCpi ? CPI_US.get(baseCpi) : null;

  /**
   * Pasa un valor de su unidad nativa a la elegida: a $ o usd por m³ con la
   * densidad del producto, de ahí a la unidad pedida, a la moneda con el TC
   * del mes y, si corresponde, a valores constantes con el CPI.
   *   nativo  { moneda: 'usd' | 'ars', unidad: id de UNIDADES, densidad }
   */
  const convertir = (v, f, nativo) => {
    if (v == null || isNaN(v)) return null;
    const porM3Nativo = UNIDADES.find((u) => u.id === nativo.unidad).porM3(nativo.densidad);
    let x = (v * porM3Nativo) / unidad.porM3(nativo.densidad); // por m³ y luego por unidad elegida
    if (nativo.moneda !== moneda) {
      const tc = TC.get(f);
      if (!tc) return null;
      x = moneda === 'usd' ? x / tc : x * tc;
    }
    if (constantes) {
      const cpi = CPI_US.get(f);
      if (!cpi || !cpiBase) return null;
      x *= cpiBase / cpi;
    }
    return x;
  };

  // Gas oil grado 2 y 3: ponderado por mes con los filtros y el tipo de precio del relevamiento ($/l);
  // n2 y n3, lo mismo con el precio sin impuestos, para la comparación con el biodiésel
  const gasOil = useMemo(() => {
    if (!listo) return { g2: new Map(), g3: new Map(), n2: new Map(), n3: new Map() };
    const f = (i) => fCanal(i) && fBand(i) && fProv(i);
    const g2 = ponderarCol(DX, f, (i) => DX.mes[i], tipo.campo, 2);
    const g3 = ponderarCol(DX, f, (i) => DX.mes[i], tipo.campo, 3);
    const sinImp = tipo.campo === 'n';
    return {
      g2,
      g3,
      n2: sinImp ? g2 : ponderarCol(DX, f, (i) => DX.mes[i], 'n', 2),
      n3: sinImp ? g3 : ponderarCol(DX, f, (i) => DX.mes[i], 'n', 3),
    };
  }, claves);

  const serieDe = (id) => new Map((PRODUCTOS.find((p) => p.id === id)?.serie || []));
  const comparado = (id) => COMPARADOS.find((p) => p.id === id);
  const paneles = useMemo(() => {
    const imp = new Map(IMPORTACIONES.map((m) => [m.fecha, m.ton ? m.cif_usd_ton : null]));
    const brent = serieDe('brent');
    const bio = serieDe('bio_963_m');
    const aceite = new Map(comparado('aceite_minagri')?.serie || []);
    const metanol = new Map(comparado('metanol_ypf')?.serie || []);
    const puntos = (fn, nativo) => rango.map((f) => ({ fecha: f, valor: nativo ? convertir(fn(f), f, nativo) : (fn(f) ?? null) }));
    const go = (m) => (f) => { const v = m.get(IDX_MES.get(f)); return v ? v.precio : null; };
    const sufijoGo = `${tipo.label.toLowerCase()}${etiquetaFiltro ? ` · ${etiquetaFiltro}` : ''}`;
    const ars = (densidad) => ({ moneda: 'ars', unidad: 'l', densidad });
    const usdTon = (densidad) => ({ moneda: 'usd', unidad: 'ton', densidad });
    return [
      // unir: la línea salta los meses sin precio (los excluidos por anómalos) en vez de cortarse
      { id: 'go2', titulo: 'Gas oil grado 2', sub: `${sufijoGo} · ${etiquetaCanal}`, unidad: rotuloUnidad, color: C.oil, unir: true, puntos: puntos(go(gasOil.g2), ars(DENSIDADES.gasoil)) },
      { id: 'go3', titulo: 'Gas oil grado 3', sub: `${sufijoGo} · ${etiquetaCanal}`, unidad: rotuloUnidad, color: C.exp, unir: true, puntos: puntos(go(gasOil.g3), ars(DENSIDADES.gasoil)) },
      { id: 'imp', titulo: 'Gas oil importado', sub: 'CIF, despachos sin CAMMESA', unidad: rotuloUnidad, color: C.warn, puntos: puntos((f) => imp.get(f), usdTon(DENSIDADES.gasoil)) },
      { id: 'brent', titulo: 'Crudo Brent', sub: 'EIA, informe de regalías de la SE', unidad: rotuloUnidad, color: C.ink, puntos: puntos((f) => brent.get(f), { moneda: 'usd', unidad: 'm3', densidad: DENSIDADES.brent }) },
      { id: 'bio', titulo: 'Biodiésel', sub: 'precio Res. 963 (mediana)', unidad: rotuloUnidad, color: C.bio, puntos: puntos((f) => bio.get(f), usdTon(DENSIDADES.bio)) },
      { id: 'aceite', titulo: 'Aceite de soja FAS MINAGRI', sub: 'FOB oficial menos retención', unidad: rotuloUnidad, color: C.oil, puntos: puntos((f) => aceite.get(f), usdTon(DENSIDADES.aceite)) },
      { id: 'metanol', titulo: 'Metanol YPF', sub: comparado('metanol_ypf') ? `hasta ${fmt.monthShort(comparado('metanol_ypf').hasta)}` : 'sin serie', unidad: rotuloUnidad, color: C.celeste, puntos: puntos((f) => metanol.get(f), usdTon(DENSIDADES.metanol)) },
      { id: 'tc', titulo: 'Tipo de cambio', sub: 'promedio mensual', unidad: '$/usd', color: C.bio, puntos: puntos((f) => TC.get(f), null) },
    ];
  }, [rango, gasOil, tipo, etiquetaCanal, etiquetaFiltro, C, unidadId, moneda, constantes, cpiBase]);

  // Biodiésel contra el gas oil sin impuestos: grado 2, grado 3 o el ponderado por volumen de los dos
  const comparacion = useMemo(() => {
    const bio = serieDe('bio_963_m');
    const goSinImp = (f) => {
      const i = IDX_MES.get(f);
      const a = goComp === 'g3' ? null : gasOil.n2.get(i);
      const b = goComp === 'g2' ? null : gasOil.n3.get(i);
      const w = (a?.w || 0) + (b?.w || 0);
      return w ? ((a?.pw || 0) + (b?.pw || 0)) / w : null;
    };
    const puntos = rango.map((f) => {
      const b = convertir(bio.get(f), f, { moneda: 'usd', unidad: 'ton', densidad: DENSIDADES.bio });
      const g = convertir(goSinImp(f), f, { moneda: 'ars', unidad: 'l', densidad: DENSIDADES.gasoil });
      return { fecha: f, bio: b, go: g, brecha: brechaPct(b, g) };
    });
    // Eje derecho de la brecha: marcas redondas y siempre con el cero adentro
    const brechas = puntos.map((p) => p.brecha).filter((v) => v != null);
    const lo = Math.min(0, ...brechas);
    const hi = Math.max(0, ...brechas);
    const paso = [5, 10, 20, 25, 50, 100].find((n) => Math.ceil(hi / n) - Math.floor(lo / n) <= 6) || 200;
    const marcas = [];
    for (let v = Math.floor(lo / paso) * paso; v <= Math.ceil(hi / paso) * paso; v += paso) marcas.push(v);
    if (marcas.length < 2) marcas.splice(0, marcas.length, -paso, 0, paso);
    return { puntos, marcas, ultimo: puntos.findLast((p) => p.bio != null && p.go != null) };
  }, [rango, gasOil, goComp, unidadId, moneda, constantes, cpiBase]);
  const goElegido = GO_COMPARACION.find((g) => g[0] === goComp);
  const colorGo = { g2: C.oil, g3: C.exp, g23: C.ink }[goComp];
  const brecha = comparacion.ultimo ? brechaPct(comparacion.ultimo.bio, comparacion.ultimo.go) : null;

  // Histograma de la brecha: cuántos meses del intervalo cayeron en cada clase de
  // diferencia (clases de ancho parejo, alineadas al cero: [desde, hasta))
  const histograma = useMemo(() => {
    const obs = comparacion.puntos.filter((p) => p.brecha != null);
    if (!obs.length) return null;
    const orden = obs.map((p) => p.brecha).sort((a, b) => a - b);
    const lo = orden[0];
    const hi = orden.at(-1);
    const paso = [1, 2, 2.5, 5, 10, 20, 25, 50, 100].find((n) => Math.floor(hi / n) - Math.floor(lo / n) + 1 <= 12) || 200;
    const i0 = Math.floor(lo / paso);
    const borde = (v) => `${v > 0 ? '+' : ''}${v.toLocaleString('es-AR', { maximumFractionDigits: 1 })}`;
    const clases = Array.from({ length: Math.floor(hi / paso) - i0 + 1 }, (_, k) => {
      const desde = (i0 + k) * paso;
      return { desde, hasta: desde + paso, rotulo: `${borde(desde)} y ${borde(desde + paso)}%`, eje: `${borde(desde)} a ${borde(desde + paso)}`, meses: [], n: 0 };
    });
    for (const p of obs) {
      const c = clases[Math.floor(p.brecha / paso) - i0];
      c.meses.push(p.fecha);
      c.n += 1;
    }
    const mitad = orden.length >> 1;
    const de = (v) => obs.find((p) => p.brecha === v).fecha;
    return {
      clases, total: obs.length, paso,
      caro: obs.filter((p) => p.brecha > 0).length,
      barato: obs.filter((p) => p.brecha < 0).length,
      mediana: orden.length % 2 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2,
      promedio: orden.reduce((a, b) => a + b, 0) / orden.length,
      min: { v: lo, fecha: de(lo) }, max: { v: hi, fecha: de(hi) },
      claseUltimo: clases[Math.floor(obs.at(-1).brecha / paso) - i0], ultimo: obs.at(-1).fecha,
      negativas: clases.filter((c) => c.hasta <= 0), positivas: clases.filter((c) => c.desde >= 0),
    };
  }, [comparacion]);
  const panelAmpliado = ampliado ? paneles.find((p) => p.id === ampliado) : null;

  // Segunda fila de controles con el nombre arriba de cada uno, como la fila
  // de filtros (pedido de HDO del 08/10/2026): Intervalo (desde, hasta y los
  // atajos), Presidencia, Unidad, Moneda y Valores (desplegable, como los otros)
  const controles = (
    <>
      <div className="go-filtros go-filtros-comparados">
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
          <label htmlFor="go-pc-presidencia">Presidencia</label>
          <select id="go-pc-presidencia" className="empresa-select" value={presidenciaActiva} onChange={(e) => elegirPresidencia(e.target.value)}>
            <option value="">Elegir una presidencia…</option>
            {PERIODOS_PRESIDENCIA.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre} · {fmt.monthShort(p.desde)} a {fmt.monthShort(p.hasta)}</option>
            ))}
          </select>
        </div>
        <div className="go-filtro">
          <label htmlFor="go-pc-unidad">Unidad</label>
          <select id="go-pc-unidad" className="empresa-select" value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
            {UNIDADES.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </div>
        <div className="go-filtro">
          <label htmlFor="go-pc-moneda">Moneda</label>
          <select id="go-pc-moneda" className="empresa-select" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            {MONEDAS.map(([id, s, nombre]) => <option key={id} value={id}>{nombre} ({s})</option>)}
          </select>
        </div>
        <div className="go-filtro">
          <label htmlFor="go-pc-valores">Valores</label>
          <select id="go-pc-valores" className="empresa-select" value={constantes ? 'cte' : 'cor'} onChange={(e) => setConstantes(e.target.value === 'cte')}>
            <option value="cor">Corrientes</option>
            <option value="cte">Constantes</option>
          </select>
        </div>
      </div>
      <p className="chart-card-subtitle go-intervalo-nota">
        {rango.length} meses · {rotuloUnidad} {constantes && baseCpi ? `constantes de ${fmt.monthShort(baseCpi)} (CPI EE.UU.)` : 'corrientes'} · los filtros mueven solo el gas oil
      </p>
    </>
  );

  return (
    <div className="go-seccion go-comparados-pagina">
      <div className="go-sticky">
        <Encabezado seccion={seccion} />
        <FiltrosRelevamiento F={F} sinMes tiposPrecio={TIPOS_BASE} />
        {controles}
      </div>
      {!listo && !error && <div className="section-placeholder">Cargando el relevamiento (10 MB, una sola vez)…</div>}
      {error && <div className="section-placeholder">{error}</div>}
      {listo && (
        <div className="go-comparados">
          {paneles.map((p) => (
            <div
              className="chart-card go-comparado-card" key={p.id} role="button" tabIndex={0} title="Clic para ampliar"
              onClick={() => setAmpliado(p.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAmpliado(p.id); } }}
            >
              <div className="chart-card-header">
                <span className="chart-card-title">{p.titulo} <span className="kpi-unidad">[{p.unidad}]</span></span>
                <span className="chart-card-subtitle">{p.sub}</span>
                <span className="go-ampliar" aria-hidden="true">⤢</span>
              </div>
              <div className="chart-card-body go-comparado-cuerpo">
                <div className="go-comparado-grafico"><Grafico p={p} C={C} alto={190} /></div>
                <Variacion puntos={p.puntos} />
              </div>
            </div>
          ))}
        </div>
      )}
      {listo && (
        <div className="chart-card go-comparacion">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Biodiésel vs. {goElegido[2].toLowerCase()} sin impuestos <span className="kpi-unidad">[{rotuloUnidad}]</span></span>
              <span className="chart-card-subtitle">
                Biodiésel: precio Res. 963 (mediana) · gas oil: precio sin impuestos del relevamiento, ponderado por volumen{etiquetaFiltro ? ` · ${etiquetaFiltro}` : ''} · {etiquetaCanal}
              </span>
            </div>
            <div className="chart-range-selector" role="group" aria-label="Gas oil a comparar">
              {GO_COMPARACION.map(([id, label]) => (
                <button key={id} className={goComp === id ? 'active' : ''} onClick={() => setGoComp(id)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="chart-card-body go-comparado-cuerpo go-comparacion-cuerpo">
            <div className="go-comparado-grafico">
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={comparacion.puntos} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={fmt.monthShort} minTickGap={40} />
                  <YAxis yAxisId="precio" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} width={62} domain={['auto', 'auto']} tickFormatter={eje} />
                  {/* Eje derecho: la brecha en %, siempre con el cero a la vista */}
                  <YAxis
                    yAxisId="brecha" orientation="right" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} width={48}
                    domain={[comparacion.marcas[0], comparacion.marcas.at(-1)]} ticks={comparacion.marcas}
                    tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}%`}
                  />
                  <ReferenceLine yAxisId="brecha" y={0} stroke={C.axis} />
                  <Tooltip content={<TooltipComparacion unidad={rotuloUnidad} />} cursor={{ stroke: C.axis }} />
                  <Bar yAxisId="brecha" dataKey="brecha" name="Biodiésel sobre gas oil" fill={C.neutralFill} maxBarSize={22} />
                  <Line yAxisId="precio" dataKey="go" name={goElegido[2]} stroke={colorGo} strokeWidth={2.2} dot={false} connectNulls />
                  <Line yAxisId="precio" dataKey="bio" name="Biodiésel" stroke={C.bio} strokeWidth={2.2} dot={false} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="chart-legend">
                <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.bio }} />Biodiésel Res. 963</div>
                <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: colorGo }} />{goElegido[2]} sin impuestos</div>
                <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.neutralFill }} />Biodiésel sobre gas oil, en % (eje derecho)</div>
              </div>
            </div>
            <div className="go-comparacion-tarjetas">
              <div className="go-variacion" title="Cuánto más caro (+) o más barato (-) es el biodiésel que el gas oil en el último mes con los dos precios">
                <span className="go-variacion-rotulo">Biodiésel sobre gas oil</span>
                {brecha == null ? <span className="go-variacion-sin">sin los dos precios en el intervalo</span> : (
                  <>
                    <span className="go-variacion-delta">{conSigno(brecha)}</span>
                    <span className="go-variacion-valores">{valor(comparacion.ultimo.bio)} vs. {valor(comparacion.ultimo.go)}</span>
                    <span className="go-variacion-fechas">{fmt.monthShort(comparacion.ultimo.fecha)}</span>
                  </>
                )}
              </div>
              <Variacion rotulo="Biodiésel" puntos={comparacion.puntos.map((p) => ({ fecha: p.fecha, valor: p.bio }))} />
              <Variacion rotulo={goElegido[2]} puntos={comparacion.puntos.map((p) => ({ fecha: p.fecha, valor: p.go }))} />
            </div>
          </div>
        </div>
      )}
      {listo && histograma && (
        <div className="chart-card go-comparacion">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Distribución de la diferencia: biodiésel sobre {goElegido[2].toLowerCase()} <span className="kpi-unidad">[meses]</span></span>
              <span className="chart-card-subtitle">
                Cuántos meses del intervalo cayeron en cada tramo de diferencia · {histograma.total} meses con los dos precios · tramos de {histograma.paso.toLocaleString('es-AR')} puntos · precios en {rotuloUnidad}
              </span>
            </div>
          </div>
          <div className="chart-card-body go-comparado-cuerpo go-comparacion-cuerpo">
            <div className="go-comparado-grafico">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={histograma.clases} margin={{ top: 10, right: 16, left: 0, bottom: 0 }} barCategoryGap="8%">
                  <XAxis dataKey="eje" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} minTickGap={8} />
                  <YAxis tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} width={62} allowDecimals={false} />
                  {histograma.negativas.length > 0 && (
                    <ReferenceArea
                      x1={histograma.negativas[0].eje} x2={histograma.negativas.at(-1).eje} fill={C.banda} strokeOpacity={0}
                      label={{ value: 'Biodiésel más barato', position: 'insideTopLeft', fill: C.tick, fontSize: 11 }}
                    />
                  )}
                  {histograma.positivas.length > 0 && (
                    <ReferenceArea
                      x1={histograma.positivas[0].eje} x2={histograma.positivas.at(-1).eje} fillOpacity={0} strokeOpacity={0}
                      label={{ value: 'Biodiésel más caro', position: 'insideTopRight', fill: C.tick, fontSize: 11 }}
                    />
                  )}
                  <Tooltip content={<TooltipHistograma total={histograma.total} />} cursor={{ fill: C.cursor }} />
                  <Bar dataKey="n" name="Meses">
                    {histograma.clases.map((c) => <Cell key={c.desde} fill={c === histograma.claseUltimo ? C.neutral : C.neutralFill} />)}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
              <div className="chart-legend">
                <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.neutralFill }} />Meses en cada tramo de diferencia (%)</div>
                <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.neutral }} />Tramo del último mes ({fmt.monthShort(histograma.ultimo)})</div>
              </div>
            </div>
            <div className="go-comparacion-tarjetas">
              <div className="go-variacion" title="Meses del intervalo con el biodiésel por encima del gas oil">
                <span className="go-variacion-rotulo">Biodiésel más caro</span>
                <span className="go-variacion-delta">{histograma.caro} de {histograma.total}</span>
                <span className="go-variacion-valores">{fmt.pct((histograma.caro / histograma.total) * 100)} de los meses</span>
              </div>
              <div className="go-variacion" title="Meses del intervalo con el biodiésel por debajo del gas oil">
                <span className="go-variacion-rotulo">Biodiésel más barato</span>
                <span className="go-variacion-delta">{histograma.barato} de {histograma.total}</span>
                <span className="go-variacion-valores">{fmt.pct((histograma.barato / histograma.total) * 100)} de los meses</span>
              </div>
              <div className="go-variacion" title="Mediana, promedio y extremos de la diferencia en el intervalo">
                <span className="go-variacion-rotulo">Mediana</span>
                <span className="go-variacion-delta">{conSigno(histograma.mediana)}</span>
                <span className="go-variacion-valores">promedio {conSigno(histograma.promedio)}</span>
                <span className="go-variacion-fechas">
                  de {conSigno(histograma.min.v)} ({fmt.monthShort(histograma.min.fecha)}) a {conSigno(histograma.max.v)} ({fmt.monthShort(histograma.max.fecha)})
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      {panelAmpliado && <GraficoAmpliado p={panelAmpliado} C={C} onClose={cerrarAmpliado} />}
      <p className="note go-nota">
        Fuente: Secretaría de Energía, relevamiento Res. 1104/2004 (gas oil grado 2 y 3: el mismo ponderado por volumen de la
        página Precio surtidor, con sus filtros y su tipo de precio) y despachos de importación de gas oil (CIF, sin CAMMESA);
        Brent en usd/m³ del informe de regalías de crudo; precio del biodiésel Res. 963 (mediana publicada por la SE); aceite de
        soja FAS MINAGRI (FOB oficial menos retención); metanol YPF y tipo de cambio de la base Explora. Cada serie va hasta su
        último mes con dato. Unidad: las series se pasan a la elegida con la densidad de cada producto (gas oil {DENSIDADES.gasoil},
        biodiésel {DENSIDADES.bio}, aceite de soja {DENSIDADES.aceite}, metanol {DENSIDADES.metanol}, crudo Brent {DENSIDADES.brent} ton/m³;
        6,2898 bbl y 264,172 gal por m³). Moneda: con el tipo de cambio promedio del mes. Valores constantes: deflactados con el
        CPI de Estados Unidos al último mes del intervalo, en ambas monedas, como el ranking. La tarjeta de cada gráfico compara
        el primer y el último valor del intervalo elegido. El gráfico de abajo compara el biodiésel con el gas oil siempre a
        precio sin impuestos (el del relevamiento, ponderado por volumen, con los mismos filtros; grado 2 y 3 juntos es el
        ponderado por volumen de los dos grados), cualquiera sea el tipo de precio elegido arriba; las barras del eje derecho
        son la diferencia del mes en % (biodiésel / gas oil - 1) y el histograma cuenta cuántos meses del intervalo cayeron en
        cada tramo de esa diferencia; la brecha depende de la
        unidad, porque el biodiésel y el gas oil tienen distinta densidad. {NOTA_MESES_EXCLUIDOS} Último mes del relevamiento:
        {' '}{fmt.monthShort(ULTIMO_MES)}.
      </p>
    </div>
  );
}
