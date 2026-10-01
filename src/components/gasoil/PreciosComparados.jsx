import { useMemo, useState } from 'react';
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  MESES, ULTIMO_MES, IDX_MES, PRODUCTOS, COMPARADOS, IMPORTACIONES, TC, CPI_US, DENSIDAD_GO, DENSIDAD_BIO, TIPOS_PRECIO,
  ponderarCol, variacion,
} from '../../lib/gasoil.js';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import { useRelevamiento, FiltrosRelevamiento } from './relevamiento.jsx';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import './GasOil.css';

const INTERVALO_DEFAULT = 18; // meses hacia atrás al entrar (el tablero abre con Dec/24 a Jul/26)
const ATAJOS = [['12m', 12, '12 m'], ['24m', 24, '24 m'], ['5a', 60, '5 a'], ['todo', null, 'Todo']];
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
function Variacion({ puntos }) {
  const conDato = puntos.filter((p) => p.valor != null);
  if (conDato.length < 2) return <div className="go-variacion"><span className="go-variacion-sin">sin dos valores en el intervalo</span></div>;
  const a = conDato[0];
  const b = conDato.at(-1);
  const d = variacion(b.valor, a.valor);
  return (
    <div className="go-variacion" title={`Variación acumulada entre ${fmt.monthShort(a.fecha)} y ${fmt.monthShort(b.fecha)}`}>
      <span className={`go-variacion-delta ${d >= 0 ? 'delta-pos' : 'delta-neg'}`}>{d >= 0 ? '▲' : '▼'}{fmt.pct(Math.abs(d), Math.abs(d) >= 100 ? 0 : 1)}</span>
      <span className="go-variacion-valores">{valor(a.valor)} → {valor(b.valor)}</span>
      <span className="go-variacion-fechas">{fmt.monthShort(a.fecha)} → {fmt.monthShort(b.fecha)}</span>
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

  // Gas oil grado 2 y 3: ponderado por mes con los filtros y el tipo de precio del relevamiento ($/l)
  const gasOil = useMemo(() => {
    if (!listo) return { g2: new Map(), g3: new Map() };
    const f = (i) => fCanal(i) && fBand(i) && fProv(i);
    return {
      g2: ponderarCol(DX, f, (i) => DX.mes[i], tipo.campo, 2),
      g3: ponderarCol(DX, f, (i) => DX.mes[i], tipo.campo, 3),
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
      { id: 'go2', titulo: 'Gas oil grado 2', sub: `${sufijoGo} · ${etiquetaCanal}`, unidad: rotuloUnidad, color: C.oil, puntos: puntos(go(gasOil.g2), ars(DENSIDADES.gasoil)) },
      { id: 'go3', titulo: 'Gas oil grado 3', sub: `${sufijoGo} · ${etiquetaCanal}`, unidad: rotuloUnidad, color: C.exp, puntos: puntos(go(gasOil.g3), ars(DENSIDADES.gasoil)) },
      { id: 'imp', titulo: 'Gas oil importado', sub: 'CIF, despachos sin CAMMESA', unidad: rotuloUnidad, color: C.warn, puntos: puntos((f) => imp.get(f), usdTon(DENSIDADES.gasoil)) },
      { id: 'brent', titulo: 'Crudo Brent', sub: 'EIA, informe de regalías de la SE', unidad: rotuloUnidad, color: C.ink, puntos: puntos((f) => brent.get(f), { moneda: 'usd', unidad: 'm3', densidad: DENSIDADES.brent }) },
      { id: 'bio', titulo: 'Biodiésel', sub: 'precio Res. 963 (mediana)', unidad: rotuloUnidad, color: C.bio, puntos: puntos((f) => bio.get(f), usdTon(DENSIDADES.bio)) },
      { id: 'aceite', titulo: 'Aceite de soja FAS MINAGRI', sub: 'FOB oficial menos retención', unidad: rotuloUnidad, color: C.oil, puntos: puntos((f) => aceite.get(f), usdTon(DENSIDADES.aceite)) },
      { id: 'metanol', titulo: 'Metanol YPF', sub: comparado('metanol_ypf') ? `hasta ${fmt.monthShort(comparado('metanol_ypf').hasta)}` : 'sin serie', unidad: rotuloUnidad, color: C.celeste, puntos: puntos((f) => metanol.get(f), usdTon(DENSIDADES.metanol)) },
      { id: 'tc', titulo: 'Tipo de cambio', sub: 'promedio mensual', unidad: '$/usd', color: C.bio, puntos: puntos((f) => TC.get(f), null) },
    ];
  }, [rango, gasOil, tipo, etiquetaCanal, etiquetaFiltro, C, unidadId, moneda, constantes, cpiBase]);

  const TooltipPanel = ({ active, payload, label, unidad: u }) => {
    if (!active || !payload?.length || payload[0].value == null) return null;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{fmt.monthShort(label)}</div>
        <div className="chart-tooltip-row"><span>{payload[0].name}</span><strong>{valor(payload[0].value)} {u}</strong></div>
      </div>
    );
  };
  const eje = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`
    : Math.abs(v) >= 1e5 ? `${Math.round(v / 1000)} K` : valor(v));

  const controles = (
    <div className="go-intervalo">
      <span className="go-filtro-label">Intervalo</span>
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
      <span className="go-filtro-label">Unidad</span>
      <select className="empresa-select" value={unidadId} onChange={(e) => setUnidadId(e.target.value)} aria-label="Unidad">
        {UNIDADES.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
      </select>
      <span className="go-filtro-label">Moneda</span>
      <select className="empresa-select" value={moneda} onChange={(e) => setMoneda(e.target.value)} aria-label="Moneda">
        {MONEDAS.map(([id, s, nombre]) => <option key={id} value={id}>{nombre} ({s})</option>)}
      </select>
      <span className="go-filtro-label">Valores</span>
      <div className="chart-range-selector">
        <button className={constantes ? '' : 'active'} onClick={() => setConstantes(false)}>Corrientes</button>
        <button className={constantes ? 'active' : ''} onClick={() => setConstantes(true)}>Constantes</button>
      </div>
      <span className="chart-card-subtitle">
        {rango.length} meses · {rotuloUnidad} {constantes && baseCpi ? `constantes de ${fmt.monthShort(baseCpi)} (CPI EE.UU.)` : 'corrientes'} · los filtros mueven solo los dos gas oil
      </span>
    </div>
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
            <div className="chart-card" key={p.id}>
              <div className="chart-card-header">
                <span className="chart-card-title">{p.titulo} <span className="kpi-unidad">[{p.unidad}]</span></span>
                <span className="chart-card-subtitle">{p.sub}</span>
              </div>
              <div className="chart-card-body go-comparado-cuerpo">
                <div className="go-comparado-grafico">
                  <ResponsiveContainer width="100%" height={190}>
                    <ComposedChart data={p.puntos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 10 }} stroke={C.axis} tickFormatter={fmt.monthShort} minTickGap={36} />
                      <YAxis tick={{ fill: C.tick, fontSize: 10 }} stroke={C.axis} width={50} domain={['auto', 'auto']} tickFormatter={eje} />
                      <Tooltip content={<TooltipPanel unidad={p.unidad} />} cursor={{ stroke: C.axis }} />
                      <Line dataKey="valor" name={p.titulo} stroke={p.color} strokeWidth={2} dot={false} connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <Variacion puntos={p.puntos} />
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="note go-nota">
        Fuente: Secretaría de Energía, relevamiento Res. 1104/2004 (gas oil grado 2 y 3: el mismo ponderado por volumen de la
        página Precio surtidor, con sus filtros y su tipo de precio) y despachos de importación de gas oil (CIF, sin CAMMESA);
        Brent en usd/m³ del informe de regalías de crudo; precio del biodiésel Res. 963 (mediana publicada por la SE); aceite de
        soja FAS MINAGRI (FOB oficial menos retención); metanol YPF y tipo de cambio de la base Explora. Cada serie va hasta su
        último mes con dato. Unidad: las series se pasan a la elegida con la densidad de cada producto (gas oil {DENSIDADES.gasoil},
        biodiésel {DENSIDADES.bio}, aceite de soja {DENSIDADES.aceite}, metanol {DENSIDADES.metanol}, crudo Brent {DENSIDADES.brent} ton/m³;
        6,2898 bbl y 264,172 gal por m³). Moneda: con el tipo de cambio promedio del mes. Valores constantes: deflactados con el
        CPI de Estados Unidos al último mes del intervalo, en ambas monedas, como el ranking. La tarjeta de cada gráfico compara
        el primer y el último valor del intervalo elegido. Último mes del relevamiento: {fmt.monthShort(ULTIMO_MES)}.
      </p>
    </div>
  );
}
