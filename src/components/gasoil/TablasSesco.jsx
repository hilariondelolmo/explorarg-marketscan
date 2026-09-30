import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  IMPORTACIONES, BIO_MENSUAL, BIO_PETROLERAS, CORTE_OBLIGATORIO, DENSIDAD_BIO, cargarSesco, nombreProvincia,
} from '../../lib/gasoil.js';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import CorteRealChart from '../gestion/CorteRealChart.jsx';
import {
  useCajas, Cajas, DropdownMulti, TooltipSerie, RANGOS, mismas,
  PROVINCIAS_FILTRO, SIN_ZONA_FRIA, ACCIONES_PROVINCIA, ROTULO_SIN_ZONA_FRIA,
} from './relevamiento.jsx';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import './GasOil.css';

// La página abre con gas oil grado 2 y grado 3 (pedido de HDO del 30/09/2026)
const GAS_OIL = ['go2', 'go3'];
const ROTULO_GAS_OIL = 'Gas oil grado 2 y 3';
const ROTULO_SIN_BUNKER = 'Sin bunker ni usinas';
// Rótulos cortos de las tarjetas (pedido de HDO): GO GR2, GO GR3, S/Zona Fría, GO Import
const ABREVIADO = { go2: 'GO GR2', go3: 'GO GR3', go1: 'GO GR1' };
const ROTULO_GO_SUMA = 'GO GR2 + GR3';
const ROTULO_SZF_CORTO = 'S/Zona Fría';
const CANAL = [
  { cd: 0, nombre: 'Minorista', clave: 'min' },
  { cd: 1, nombre: 'Mayorista', clave: 'may' },
];
// Unidad de los volúmenes: cuánto vale un m³ en cada una. Solo siguen al
// selector el gas oil (densidad de la fuente, 0,845) y el biodiésel (0,885);
// los demás productos quedan en la unidad de la SE (decisión de HDO).
const UNIDADES = [
  { id: 'm3', label: 'm³', porM3: () => 1 },
  { id: 'ton', label: 'ton', porM3: (densidad) => densidad },
  { id: 'bbl', label: 'bbl', porM3: () => 6.2898 },
  { id: 'gal', label: 'gal', porM3: () => 264.172 }, // galón de EE.UU.
];
const MESES_RANGO = { '12m': 12, '5a': 60, '10a': 120 };
// Con más productos elegidos que estos, los gráficos muestran solo la suma
const MAX_GRAFICOS = 4;
const TABLAS = [['sector', 'Por sector'], ['empresa', 'Por empresa'], ['provincia', 'Por provincia'], ['serie', 'Por período']];
const DIMENSION = { sector: 'Sector', empresa: 'Empresa', provincia: 'Provincia' };
const ACCIONES_EMPRESA = [['Todas', null], ['Ninguna', []]];
// Etiquetas del eje: miles con "K" y millones con "M", con espacio duro para
// que no se partan en dos líneas
const abreviar = (v, divisor, letra) => `${(v / divisor).toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${letra}`;
const eje = (v) => (Math.abs(v) >= 1e6 ? abreviar(v, 1e6, 'M') : Math.abs(v) >= 1000 ? abreviar(v, 1000, 'K') : fmt.int(v));
// "Gas oil grado 2 (común)" → "Gas oil grado 2", para tarjetas y columnas
const corto = (nombre) => nombre.replace(/\s*\(.*\)$/, '');
// ['a', 'b', 'c'] → "a, b y c"
const enLista = (lista, nexo) => (lista.length < 2 ? lista.join('') : `${lista.slice(0, -1).join(', ')} ${nexo} ${lista.at(-1)}`);
const sumar = (lista, campo) => lista.reduce((s, r) => s + r[campo], 0);
const decimales = (v, n) => v.toLocaleString('es-AR', { minimumFractionDigits: n, maximumFractionDigits: n });
const porciento = (v) => (v == null ? '-' : `${decimales(v * 100, 2)}%`);
// Volumen de las tarjetas en millones (MM) o miles (K) de la unidad, para que
// ocupe poco (pedido de HDO): 1.154.514 m³ → "1,15 MMm³", 369.136 m³ → "369,1 Km³"
const PREFIJABLES = new Set(['m³', 'ton', 'bbl', 'gal']);
const compacto = (v, unidad) => {
  if (v == null || Number.isNaN(v)) return { n: '-', u: '' };
  const a = Math.abs(v);
  if (!PREFIJABLES.has(unidad) || a < 1000) return { n: fmt.int(v), u: unidad };
  return a >= 1e6 ? { n: decimales(v / 1e6, 2), u: `MM${unidad}` } : { n: decimales(v / 1e3, 1), u: `K${unidad}` };
};
const textoCompacto = (v, unidad) => {
  const { n, u } = compacto(v, unidad);
  return u ? `${n} ${u}` : n;
};

function Encabezado({ seccion }) {
  return (
    <>
      <p className="section-kicker">Mercado Gas Oil</p>
      <h2>{seccion?.title ?? 'Ventas de combustibles'}</h2>
      {seccion?.intro && <p className="section-intro">{seccion.intro}</p>}
    </>
  );
}

/** Variación contra el período de comparación: en % o, para el corte, en puntos porcentuales. */
function Delta({ valor, base, pct }) {
  if (valor == null || base == null || (!pct && base === 0)) return null;
  const d = pct ? (valor - base) * 100 : (valor / base - 1) * 100;
  return (
    <span className={d >= 0 ? 'delta-pos' : 'delta-neg'}>
      {d >= 0 ? '▲' : '▼'}{pct ? `${decimales(Math.abs(d), 2)} pp` : fmt.pct(Math.abs(d))}
    </span>
  );
}

/**
 * Tarjeta de un indicador con uno o más períodos: el primero va grande (el
 * mes o el año) y los demás (acumulado del año, últimos 12 meses) debajo, cada
 * uno con su variación contra el período comparable.
 */
function TarjetaPeriodos({ ind, periodos }) {
  const { extra } = ind;
  const partes = (v) => (ind.pct ? { n: porciento(v), u: '' } : compacto(v, ind.unidad));
  // El número entero queda al pasar el mouse
  const entero = (v) => (ind.pct || v == null ? undefined : `${fmt.int(v)} ${ind.unidad}`);
  const [p0, ...resto] = periodos.map((p) => ({
    ...p, valor: ind.valor(p.r), base: ind.valor(p.b), extra: extra ? extra.valor(p.r) : null,
  }));
  const d0 = <Delta valor={p0.valor} base={p0.base} pct={ind.pct} />;
  const v0 = partes(p0.valor);
  return (
    <div className={`kpi-card ${ind.tono ? `tone-${ind.tono}` : ''}`}>
      <div className="kpi-label">{ind.label}</div>
      <div className={`kpi-val${extra ? ' go-kpi-val-extra' : ''}`} title={entero(p0.valor)}>
        <span>{v0.n}{v0.u && <> <span className="kpi-unidad">{v0.u}</span></>}</span>
        {extra && <span className="go-kpi-extra">{extra.rotulo} <b>{porciento(p0.extra)}</b></span>}
      </div>
      <div className="kpi-sub">
        {p0.valor != null && p0.base != null && (ind.pct || p0.base !== 0) ? <>{d0} vs. {p0.contra}</> : 'sin dato comparable'}
      </div>
      {resto.length > 0 && (
        <div className="go-kpi-periodos">
          {extra && (
            <div className="go-kpi-periodo con-extra go-kpi-periodo-cab">
              <span /><span className="go-kpi-periodo-val">{extra.columna}</span><span>{extra.corto}</span><span />
            </div>
          )}
          {resto.map((p) => {
            const v = partes(p.valor);
            return (
              <div key={p.id} className={`go-kpi-periodo${extra ? ' con-extra' : ''}`} title={`${p.detalle} contra ${p.contra}${entero(p.valor) ? ` · ${entero(p.valor)}` : ''}`}>
                <span>{p.rotulo}</span>
                <span className="go-kpi-periodo-val">{v.n}{v.u ? ` ${v.u}` : ''}</span>
                {extra && <span className="go-kpi-periodo-val">{porciento(p.extra)}</span>}
                <Delta valor={p.valor} base={p.base} pct={ind.pct} />
              </div>
            );
          })}
        </div>
      )}
      {ind.nota && <div className="kpi-sub go-kpi-nota">{ind.nota}</div>}
    </div>
  );
}

/**
 * Ventas de combustibles según las tablas SESCO de la Secretaría de Energía
 * (pedido de HDO del 30/09/2026): la misma apertura que la página de volumen
 * de la Resolución 1104, con el total del mercado. La fuente es la tabla
 * "Ventas (excluye ventas a empresas del sector)", por mes × provincia ×
 * empresa × sector. SESCO no trae canal de distribución: minorista es el
 * sector Al Público y mayorista los demás (decisión de HDO). Abre con gas oil
 * grado 2 y grado 3 y su suma, y sin bunker ni usinas eléctricas; el filtro de
 * producto deja elegir cualquier otro. Los productos se suman solo entre los
 * de la misma unidad.
 *
 * Los indicadores se ven por mes (con el acumulado del año y los últimos 12
 * meses) o por año, e incluyen el gas oil importado, el biodiésel vendido
 * para el corte, el corte real y su cumplimiento. El corte es el del resto
 * del sitio: biodiésel / gas oil grado 2 + 3 del país sin bunker ni usinas,
 * sin sumar el importado (decisión de HDO). La Zona Fría queda adentro: el
 * art. 11 de la Res. SE 689/2022 obliga al mezclador a compensar en otras
 * regiones el biocombustible exceptuado, así que el mandato se mide sobre el
 * volumen total. Sigue al filtro de empresa y no a los de provincia, sector
 * ni canal, porque el biodiésel no existe con esa apertura.
 */
export default function TablasSesco({ seccion }) {
  const [D, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    cargarSesco().then(setD).catch((e) => setError(e.message));
  }, []);
  if (D) return <Ventas D={D} seccion={seccion} />;
  return (
    <div className="go-seccion">
      <div className="go-sticky"><Encabezado seccion={seccion} /></div>
      <div className="section-placeholder">{error || 'Cargando las tablas SESCO (5 MB, una sola vez)…'}</div>
    </div>
  );
}

function Ventas({ D, seccion }) {
  const C = useChartColors();
  const MESES = D.meses;
  const ULTIMO = D.ultimo_mes;
  // Listas e índices que salen de los datos
  const K = useMemo(() => ({
    idxMes: new Map(D.meses.map((f, i) => [f, i])),
    anioDe: D.meses.map((m) => Number(m.slice(0, 4))),
    pub: D.sectores.indexOf(D.sector_minorista),
    sinBunker: D.sectores.filter((s) => !D.sectores_sin_tildar.includes(s)),
    nombre: new Map(D.productos.map((p) => [p.id, p.unidad === 'm³' ? p.nombre : `${p.nombre} [${p.unidad}]`])),
  }), [D]);
  const ACCIONES_SECTOR = [
    ['Todos', D.sectores],
    [ROTULO_SIN_BUNKER, K.sinBunker, `Todos menos ${enLista(D.sectores_sin_tildar, 'y')}`],
    ['Ninguno', []],
  ];
  const ACCIONES_PRODUCTO = [[ROTULO_GAS_OIL, GAS_OIL], ['Ninguno', []]];

  const [mes, setMes] = useState(ULTIMO);
  const [productos, setProductos] = useState(() => new Set(GAS_OIL));
  const [cd, setCd] = useState('ambos'); // '0' minorista · '1' mayorista · 'ambos'
  const [sectores, setSectores] = useState(() => new Set(K.sinBunker)); // abre sin bunker ni usinas
  const [baseSec, setBaseSec] = useState(K.sinBunker); // adonde vuelve la tabla al soltar un sector
  const [empresas, setEmpresas] = useState(null); // null = todas; si no, las tildadas
  const [provincias, setProvincias] = useState(() => new Set(PROVINCIAS_FILTRO));
  const [baseProv, setBaseProv] = useState(PROVINCIAS_FILTRO);
  const [unidadId, setUnidadId] = useState('m3');
  const [abiertos, alternar] = useCajas({ kpi: true, corte: true, graficos: true, importado: false, tablas: true });
  const [kpiVista, setKpiVista] = useState('mes'); // 'mes' | 'anio'
  const [rango, setRango] = useState('5a');
  const [vista, setVista] = useState('mensual'); // 'mensual' | 'anual'
  const [tablaSel, setTablaSel] = useState('sector');

  const anual = vista === 'anual';
  const mi = K.idxMes.get(mes);
  const mesAnterior = mi > 0 ? MESES[mi - 1] : null;
  const cdN = cd === 'ambos' ? null : Number(cd);
  const ambos = cdN == null;
  const ANIO_ULTIMO = Number(ULTIMO.slice(0, 4));
  const ANIO_EN_CURSO = ULTIMO.slice(5, 7) === '12' ? null : String(ANIO_ULTIMO);
  const TRAMO_EN_CURSO = `${fmt.monthOnly(`${ANIO_ULTIMO}-01`)} a ${fmt.monthOnly(ULTIMO)}`;
  const desdeIdx = rango === 'todo' ? 0 : Math.max(0, MESES.length - MESES_RANGO[rango]);
  const desde = MESES[desdeIdx];
  const desdeAnio = K.anioDe[desdeIdx];

  // Unidad elegida: factor y rótulo de cada producto (solo el gas oil la
  // sigue), del gas oil importado (la fuente lo trae en toneladas) y del biodiésel
  const unidadSel = UNIDADES.find((u) => u.id === unidadId);
  const U = unidadSel.label;
  const conv = useMemo(() => new Map(D.productos.map((p) => [
    p.id, p.densidad && p.unidad === 'm³' ? { f: unidadSel.porM3(p.densidad), u: unidadSel.label } : { f: 1, u: p.unidad },
  ])), [D, unidadSel]);
  const fImport = unidadSel.porM3(D.densidad_go) / D.densidad_go; // toneladas de gas oil → unidad elegida
  const fBio = unidadSel.porM3(DENSIDAD_BIO);                     // m³ de biodiésel → unidad elegida

  // La base es la última selección prearmada que quedó tildada
  const cambiarSectores = (n) => {
    setSectores(n);
    if (mismas(n, D.sectores)) setBaseSec(D.sectores);
    else if (mismas(n, K.sinBunker)) setBaseSec(K.sinBunker);
  };
  const cambiarProvincias = (n) => {
    setProvincias(n);
    if (mismas(n, PROVINCIAS_FILTRO)) setBaseProv(PROVINCIAS_FILTRO);
    else if (mismas(n, SIN_ZONA_FRIA)) setBaseProv(SIN_ZONA_FRIA);
  };

  const elegidos = useMemo(() => D.productos.filter((p) => productos.has(p.id)), [D, productos]);

  // Filas del cruce que pasan los filtros de canal, sector y provincia
  // (okBase) y además el de empresa (ok). El mes se mira aparte.
  const [okBase, ok] = useMemo(() => {
    const secOk = D.sectores.map((s, i) => sectores.has(s) && (cdN == null || (i === K.pub ? 0 : 1) === cdN));
    const provOk = D.provincias.map((p) => provincias.has(p));
    const empOk = D.empresas.map((e) => empresas == null || empresas.has(e));
    const a = new Uint8Array(D.filas);
    const b = new Uint8Array(D.filas);
    for (let r = 0; r < D.filas; r++) {
      if (!secOk[D.sec[r]] || !provOk[D.prov[r]]) continue;
      a[r] = 1;
      if (empOk[D.emp[r]]) b[r] = 1;
    }
    return [a, b];
  }, [D, K, sectores, cdN, provincias, empresas]);

  // Empresas con venta de los productos elegidos en el mes, de mayor a menor:
  // son las opciones del filtro, más las ya tildadas que no vendieron ese mes
  const empresasMes = useMemo(() => {
    const vol = new Map();
    for (const p of elegidos) {
      const { i: I, v: V } = D.valores[p.id];
      for (let k = 0; k < I.length; k++) {
        const r = I[k];
        if (okBase[r] && D.mes[r] === mi) vol.set(D.emp[r], (vol.get(D.emp[r]) || 0) + V[k]);
      }
    }
    return [...vol.entries()].sort((x, y) => y[1] - x[1]).map(([e]) => D.empresas[e]);
  }, [D, okBase, elegidos, mi]);
  const opcionesEmpresa = useMemo(
    () => [...empresasMes, ...(empresas ? D.empresas.filter((e) => empresas.has(e) && !empresasMes.includes(e)) : [])],
    [D, empresasMes, empresas],
  );
  // Con todas las opciones tildadas no hay filtro
  const cambiarEmpresas = (n) => setEmpresas(opcionesEmpresa.every((e) => n.has(e)) ? null : n);

  // Serie mensual de cada producto elegido, por canal de distribución
  // (minorista = Al Público), en la unidad elegida, y la suma de los que
  // comparten unidad
  const series = useMemo(() => {
    const n = MESES.length;
    const prods = elegidos.map((p) => {
      const { i: I, v: V } = D.valores[p.id];
      const { f, u } = conv.get(p.id);
      const min = new Float64Array(n);
      const may = new Float64Array(n);
      for (let k = 0; k < I.length; k++) {
        const r = I[k];
        if (ok[r]) (D.sec[r] === K.pub ? min : may)[D.mes[r]] += V[k] * f;
      }
      return { id: p.id, nombre: p.nombre, corta: ABREVIADO[p.id] || corto(p.nombre), unidad: u, min, may };
    });
    const unidades = [...new Set(prods.map((s) => s.unidad))];
    const soloGasOil = prods.length === GAS_OIL.length && GAS_OIL.every((id) => productos.has(id));
    const sumas = [];
    // Totales: uno por unidad (la suma, o el producto si está solo en su unidad)
    const totales = [];
    for (const u of unidades) {
      const grupo = prods.filter((s) => s.unidad === u);
      if (grupo.length < 2) {
        totales.push({ ...grupo[0], solo: true });
        continue;
      }
      const min = new Float64Array(n);
      const may = new Float64Array(n);
      for (const s of grupo) {
        for (let i = 0; i < n; i++) {
          min[i] += s.min[i];
          may[i] += s.may[i];
        }
      }
      // La unidad va siempre al lado del nombre, así que no hace falta repetirla acá
      const nombre = soloGasOil ? 'Gas oil grado 2 + 3'
        : grupo.length === 2 ? grupo.map((s) => corto(s.nombre)).join(' + ')
          : `Suma de ${grupo.length} productos`;
      const corta = soloGasOil ? ROTULO_GO_SUMA : grupo.length === 2 ? grupo.map((s) => s.corta).join(' + ') : nombre;
      const suma = { id: `suma-${u}`, nombre, corta, unidad: u, min, may, suma: true, ids: grupo.map((s) => s.id) };
      sumas.push(suma);
      totales.push(suma);
    }
    // Con pocos productos va cada uno; con muchos, solo las sumas y los que quedan solos en su unidad
    const detalle = (max) => (prods.length <= max ? prods : totales.filter((t) => t.solo));
    return { prods, sumas, totales, unidades, graficos: [...detalle(MAX_GRAFICOS), ...sumas] };
  }, [D, K, ok, elegidos, conv]);

  // Puntos de una serie por mes o por año (el año suma sus meses; el rango
  // solo define desde qué año se muestra)
  const puntos = (s) => {
    const pts = [];
    if (anual) {
      const porAnio = new Map();
      for (let i = 0; i < MESES.length; i++) {
        const a = K.anioDe[i];
        if (a < desdeAnio) continue;
        const p = porAnio.get(a) || { min: 0, may: 0 };
        p.min += s.min[i];
        p.may += s.may[i];
        porAnio.set(a, p);
      }
      for (let a = desdeAnio; a <= ANIO_ULTIMO; a++) {
        const p = porAnio.get(a) || { min: 0, may: 0 };
        pts.push({ fecha: String(a), min: p.min, may: p.may, total: p.min + p.may });
      }
    } else {
      for (let i = desdeIdx; i < MESES.length; i++) pts.push({ fecha: MESES[i], min: s.min[i], may: s.may[i], total: s.min[i] + s.may[i] });
    }
    return pts;
  };
  const graficos = useMemo(() => series.graficos.map((s) => ({ s, pts: puntos(s) })), [series, rango, vista]);

  // Tabla del mes por sector, empresa o provincia: una columna por producto
  // elegido y la suma de los que comparten unidad. Responde a todos los filtros.
  const tablaDim = useMemo(() => {
    if (tablaSel === 'serie') return null;
    const dim = { sector: D.sec, empresa: D.emp, provincia: D.prov }[tablaSel];
    const nombres = { sector: D.sectores, empresa: D.empresas, provincia: D.provincias }[tablaSel];
    const acum = new Map();
    elegidos.forEach((p, j) => {
      const { i: I, v: V } = D.valores[p.id];
      const { f } = conv.get(p.id);
      for (let k = 0; k < I.length; k++) {
        const r = I[k];
        if (!ok[r] || D.mes[r] !== mi) continue;
        let a = acum.get(dim[r]);
        if (!a) {
          a = new Float64Array(elegidos.length);
          acum.set(dim[r], a);
        }
        a[j] += V[k] * f;
      }
    });
    const grupos = series.sumas.map((s) => ({ ...s, idx: elegidos.map((p, j) => (s.ids.includes(p.id) ? j : -1)).filter((j) => j >= 0) }));
    const unaUnidad = series.unidades.length === 1;
    const filas = [...acum.entries()].map(([k, a]) => ({
      k, nombre: nombres[k], vals: a,
      sumas: grupos.map((g) => g.idx.reduce((s, j) => s + a[j], 0)),
      base: unaUnidad ? a.reduce((s, v) => s + v, 0) : a[0],
      cd: k === K.pub ? 0 : 1,
    }));
    filas.sort((x, y) => (tablaSel === 'sector' ? x.cd - y.cd : 0) || y.base - x.base);
    return {
      filas, grupos, unaUnidad,
      totVals: elegidos.map((_, j) => filas.reduce((s, r) => s + r.vals[j], 0)),
      totSumas: grupos.map((_, g) => filas.reduce((s, r) => s + r.sumas[g], 0)),
      totBase: sumar(filas, 'base'),
    };
  }, [D, K, ok, elegidos, series, mi, tablaSel]);

  // Tabla por período: lo mismo que los gráficos, del más nuevo al más viejo
  const tablaSerie = useMemo(() => {
    if (tablaSel !== 'serie') return null;
    const cols = [...series.prods, ...series.sumas];
    const porSerie = cols.map((s) => puntos(s));
    const filas = (porSerie[0] || []).map((p, i) => ({ fecha: p.fecha, celdas: porSerie.map((pts) => pts[i]) })).reverse();
    return { cols, filas, conCanales: ambos && cols.length <= 3 };
  }, [series, rango, vista, tablaSel, ambos]);

  // Gas oil importado de cada mes, en toneladas (null después del último mes con despachos)
  const impTon = useMemo(() => {
    const porMes = new Map(IMPORTACIONES.map((m) => [m.fecha, m.ton || 0]));
    const ultimo = IMPORTACIONES.at(-1)?.fecha;
    return MESES.map((f) => (ultimo && f <= ultimo ? porMes.get(f) ?? 0 : null));
  }, [MESES]);
  const importaciones = useMemo(() => {
    if (!anual) return IMPORTACIONES.filter((m) => m.fecha >= desde).map((m) => ({ fecha: m.fecha, vol: (m.ton || 0) * fImport }));
    const porAnio = new Map();
    for (const m of IMPORTACIONES) porAnio.set(m.fecha.slice(0, 4), (porAnio.get(m.fecha.slice(0, 4)) || 0) + (m.ton || 0));
    const pts = [];
    for (let a = desdeAnio; a <= ANIO_ULTIMO; a++) pts.push({ fecha: String(a), vol: (porAnio.get(String(a)) ?? 0) * fImport });
    return pts;
  }, [desde, vista, fImport]);
  const uImp = IMPORTACIONES.at(-1); // último mes con despachos, para el resumen de la caja

  // Corte real, con la definición del resto del sitio: biodiésel vendido para
  // el corte / gas oil grado 2 + 3 del país sin bunker ni usinas, en m³. La
  // Zona Fría no se descuenta (Res. SE 689/2022, art. 11: lo exceptuado se
  // compensa en otras regiones). De los filtros solo sigue al de empresa (las
  // compras de biodiésel de cada petrolera): el biodiésel no existe por
  // provincia, sector ni canal.
  const bioM3 = useMemo(() => MESES.map((f) => {
    if (!BIO_MENSUAL.has(f)) return null;
    if (empresas == null) return BIO_MENSUAL.get(f);
    const compras = BIO_PETROLERAS.get(f) || {};
    let ton = 0;
    for (const e of empresas) ton += compras[D.empresa_bio[e] ?? e] || 0;
    return ton / DENSIDAD_BIO;
  }), [D, MESES, empresas]);
  const goCorte = useMemo(() => {
    const out = new Float64Array(MESES.length);
    const secOk = D.sectores.map((s) => !D.sectores_sin_tildar.includes(s));
    const empOk = D.empresas.map((e) => empresas == null || empresas.has(e));
    for (const id of GAS_OIL) {
      const { i: I, v: V } = D.valores[id];
      for (let k = 0; k < I.length; k++) {
        const r = I[k];
        if (secOk[D.sec[r]] && empOk[D.emp[r]]) out[D.mes[r]] += V[k];
      }
    }
    return out;
  }, [D, MESES, empresas]);

  // Serie de corte real y obligatorio para el gráfico "Corte obligatorio vs.
  // corte real" (el mismo de Gestión y cupo), con las empresas elegidas. El
  // año pondera el obligatorio de cada mes por su gas oil, como corte.json.
  const corteSerie = useMemo(() => {
    const mensual = [];
    const porAnio = new Map();
    MESES.forEach((f, i) => {
      const go = goCorte[i];
      const bio = bioM3[i];
      if (bio == null || !(go > 0)) return; // sin dato de biodiésel o sin ventas de gas oil ese mes
      const oblig = CORTE_OBLIGATORIO.get(f) ?? null;
      mensual.push({ fecha: f, real: bio / go, obligatorio: oblig, bio_m3: bio, go_m3: go });
      if (oblig == null) return;
      const a = porAnio.get(K.anioDe[i]) || { bio: 0, go: 0, mandato: 0 };
      a.bio += bio;
      a.go += go;
      a.mandato += oblig * go;
      porAnio.set(K.anioDe[i], a);
    });
    const anual = [...porAnio.entries()].map(([a, v]) => ({ anio: a, real: v.bio / v.go, obligatorio: v.mandato / v.go }));
    return { mensual, anual };
  }, [MESES, K, bioM3, goCorte]);

  // ---------------------------------------------------------------- etiquetas
  const resumenProductos = productos.size === 0 ? 'Ningún producto'
    : mismas(productos, GAS_OIL) ? ROTULO_GAS_OIL
      : elegidos.length === 1 ? elegidos[0].nombre : `${elegidos.length} productos`;
  const todosSectores = sectores.size === D.sectores.length;
  const sinBunker = mismas(sectores, K.sinBunker);
  const resumenSectores = todosSectores ? 'Todos los sectores'
    : sinBunker ? ROTULO_SIN_BUNKER
      : sectores.size === 1 ? [...sectores][0]
        : sectores.size ? `${sectores.size} sectores` : 'Ningún sector';
  const elegidasEmp = empresas ? D.empresas.filter((e) => empresas.has(e)) : [];
  const resumenEmpresas = !empresas ? 'Todas'
    : elegidasEmp.length === 1 ? elegidasEmp[0]
      : elegidasEmp.length ? `${elegidasEmp.length} empresas` : 'Ninguna empresa';
  const etiquetaEmpresas = !empresas ? '' : elegidasEmp.length >= 1 && elegidasEmp.length <= 2 ? elegidasEmp.join(' + ') : resumenEmpresas.toLowerCase();
  const conProvincias = provincias.size < PROVINCIAS_FILTRO.length;
  const sinZonaFria = mismas(provincias, SIN_ZONA_FRIA);
  const provElegidas = PROVINCIAS_FILTRO.filter((p) => provincias.has(p)).map(nombreProvincia);
  const cuantasProv = sinZonaFria ? ROTULO_SIN_ZONA_FRIA
    : provElegidas.length ? `${provElegidas.length} provincias` : 'Ninguna provincia';
  const etiquetaProvincias = !conProvincias ? '' : provElegidas.length >= 1 && provElegidas.length <= 3 ? provElegidas.join(' + ') : cuantasProv;
  const resumenProvincias = !conProvincias ? 'Todo el país' : provElegidas.length === 1 ? provElegidas[0] : cuantasProv;
  const etiquetaCanal = ambos ? 'minorista y mayorista' : cdN === 0 ? 'minorista' : 'mayorista';
  const etiquetaFiltro = [
    !todosSectores && resumenSectores.toLowerCase(),
    etiquetaEmpresas,
    etiquetaProvincias,
  ].filter(Boolean).join(' · ');
  // En las tarjetas la selección de provincias va abreviada
  const enProv = !conProvincias ? '' : ` · ${sinZonaFria ? ROTULO_SZF_CORTO : etiquetaProvincias}`;

  // ------------------------------------------------ indicadores y períodos
  // Suma de un valor mensual entre dos meses; null si el rango se sale de la
  // serie o le falta algún mes
  const sumaRango = (fn, [a, b]) => {
    if (a == null || b == null || a < 0 || b >= MESES.length) return null;
    let total = 0;
    for (let i = a; i <= b; i++) {
      const v = fn(i);
      if (v == null) return null;
      total += v;
    }
    return total;
  };
  // Períodos de las tarjetas. Por mes: el mes (contra el anterior), el
  // acumulado del año y los últimos 12 meses (cada uno contra el mismo tramo
  // de un año antes). Por año: el año del mes elegido, hasta el último mes
  // disponible si está en curso, contra los mismos meses del año anterior.
  const anio = K.anioDe[mi];
  const ene = K.idxMes.get(`${anio}-01`);
  const tramo = (a, fin) => (MESES[fin].slice(5) === '12' ? String(a) : `${a} (ene a ${fmt.monthOnly(MESES[fin])})`);
  const acumulado = (a) => (mi === ene ? `ene ${a}` : `ene a ${fmt.monthOnly(mes)} ${a}`);
  let periodos;
  if (kpiVista === 'anio') {
    const fin = anio === ANIO_ULTIMO ? MESES.length - 1 : K.idxMes.get(`${anio}-12`);
    periodos = [{ id: 'anio', rotulo: tramo(anio, fin), detalle: tramo(anio, fin), r: [ene, fin], b: [ene - 12, fin - 12], contra: tramo(anio - 1, fin) }];
  } else {
    periodos = [
      { id: 'mes', rotulo: fmt.monthShort(mes), detalle: fmt.monthShort(mes), r: [mi, mi], b: [mi - 1, mi - 1], contra: mesAnterior ? fmt.monthShort(mesAnterior) : '' },
      { id: 'acum', rotulo: `Acum. ${anio}`, detalle: acumulado(anio), r: [ene, mi], b: [ene - 12, mi - 12], contra: acumulado(anio - 1) },
      {
        id: 'm12', rotulo: '12 meses', detalle: mi >= 11 ? `${fmt.monthShort(MESES[mi - 11])} a ${fmt.monthShort(mes)}` : 'últimos 12 meses',
        r: [mi - 11, mi], b: [mi - 23, mi - 12], contra: 'los 12 meses anteriores',
      },
    ];
  }
  const conGasOil = GAS_OIL.some((id) => productos.has(id));
  const corteSinFiltros = !conProvincias && sinBunker && ambos;
  // Tarjetas (orden pedido por HDO el 30/09/2026): cada producto, abierto por
  // canal si están los dos (la suma no se abre); después GO Import, el total,
  // el biodiésel y el corte real con el cumplimiento adentro. Con gas oil
  // grado 2 y 3 quedan dos filas de cuatro.
  const indicadores = [];
  const canalDe = (s, c) => (i) => (c === 0 ? s.min[i] : c === 1 ? s.may[i] : s.min[i] + s.may[i]);
  const porProducto = series.prods.length <= 2 ? series.prods : [];
  for (const s of porProducto) {
    for (const c of ambos ? CANAL : [CANAL[cdN]]) {
      indicadores.push({
        k: `${s.id}-${c.cd}`, label: `${c.nombre} · ${s.corta}${enProv}`, unidad: s.unidad, tono: ambos && c.cd ? 'info' : undefined,
        valor: (r) => sumaRango(canalDe(s, ambos ? c.cd : null), r),
      });
    }
  }
  indicadores.push({
    k: 'imp', label: 'GO Import', unidad: U, tono: 'warn',
    valor: (r) => sumaRango((i) => (impTon[i] == null ? null : impTon[i] * fImport), r),
    nota: 'Despachos de importación · país',
  });
  for (const s of series.totales) {
    // Un producto solo con un canal elegido ya tiene su tarjeta
    if (s.solo && !ambos && porProducto.length) continue;
    const total = s.corta === ROTULO_GO_SUMA ? 'GO Total · GR2 + GR3' : `Total · ${s.corta}`;
    indicadores.push({
      k: `${s.id}-t`, label: `${ambos ? total : `${CANAL[cdN].nombre} · ${s.corta}`}${enProv}`, unidad: s.unidad, tono: 'pos',
      valor: (r) => sumaRango(canalDe(s, null), r),
    });
  }
  const corte = (r) => {
    const bio = sumaRango((i) => bioM3[i], r);
    const go = sumaRango((i) => goCorte[i], r);
    return bio == null || !go ? null : bio / go;
  };
  // Corte obligatorio del período: el de cada mes ponderado por su gas oil
  const obligatorio = (r) => {
    const mandato = sumaRango((i) => (CORTE_OBLIGATORIO.get(MESES[i]) == null ? null : CORTE_OBLIGATORIO.get(MESES[i]) * goCorte[i]), r);
    const go = sumaRango((i) => goCorte[i], r);
    return mandato == null || !go ? null : mandato / go;
  };
  // Cumplimiento = corte real / corte obligatorio (definición de HDO)
  const cumplimiento = (r) => {
    const real = corte(r);
    const oblig = obligatorio(r);
    return real == null || !oblig ? null : real / oblig;
  };
  if (conGasOil) {
    indicadores.push({
      k: 'bio', label: 'Biodiésel', unidad: U, tono: 'pos',
      valor: (r) => sumaRango((i) => (bioM3[i] == null ? null : bioM3[i] * fBio), r),
      nota: `Ventas para el corte · país${etiquetaEmpresas ? ` · ${etiquetaEmpresas}` : ''}`,
    });
    const oblig0 = obligatorio(periodos[0].r);
    indicadores.push({
      k: 'corte', label: 'Corte real', pct: true, valor: corte,
      extra: { rotulo: 'Cumplimiento', corto: 'cumpl.', columna: 'corte', valor: cumplimiento },
      nota: `Biodiésel / ${ROTULO_GO_SUMA} · país, sin bunker ni usinas${etiquetaEmpresas ? ` · ${etiquetaEmpresas}` : ''}${
        corteSinFiltros ? '' : ' · no sigue los filtros de provincia, sector ni canal'} · cumplimiento = corte real / obligatorio${
        oblig0 != null ? ` (${decimales(oblig0 * 100, 2)}%)` : ''}`,
    });
  }

  const p0 = periodos[0];
  const t0 = series.totales[0];
  const total0 = t0 ? sumaRango(canalDe(t0, null), p0.r) : null;
  const corte0 = corte(p0.r);
  const resumenKpi = !t0 ? 'sin productos elegidos'
    : `${p0.rotulo} · ${t0.corta}${enProv} ${textoCompacto(total0, t0.unidad)}${
      conGasOil && corte0 != null ? ` · corte real ${porciento(corte0)}` : ''}`;
  const explicacion = kpiVista === 'anio'
    ? `${p0.detalle} contra ${p0.contra}`
    : periodos.map((p) => `${p.id === 'mes' ? 'Mes' : p.rotulo}: ${p.detalle}${p.contra ? ` contra ${p.contra}` : ''}`).join(' · ');
  const nFilas = tablaDim ? tablaDim.filas.length : tablaSerie.filas.length;
  const cajas = [
    { id: 'kpi', titulo: kpiVista === 'anio' ? 'Resultado del año' : 'Resultado del mes', detalle: resumenKpi },
    {
      id: 'corte', titulo: 'Corte obligatorio vs. real',
      detalle: corte0 == null ? 'sin dato de biodiésel en el período'
        : `Real ${porciento(corte0)} · oblig. ${porciento(obligatorio(p0.r))} · cumpl. ${porciento(cumplimiento(p0.r))}`,
    },
    { id: 'graficos', titulo: 'Gráficos de volumen', detalle: `${resumenProductos} · ${etiquetaCanal} · por ${anual ? 'año' : 'mes'}` },
    {
      id: 'importado', titulo: 'Gas oil importado',
      detalle: uImp ? `${fmt.int((uImp.ton || 0) * fImport)} ${U} en ${fmt.monthShort(uImp.fecha)}` : 'sin despachos en el período',
    },
    { id: 'tablas', titulo: 'Tablas de volumen', detalle: `Sector, empresa, provincia y período · ${nFilas} ${nFilas === 1 ? 'fila' : 'filas'}` },
  ];

  // Apertura (por mes o por año) antes del rango, como en el resto de la página
  const selectores = (
    <div className="go-selectores-grafico">
      <div className="chart-range-selector">
        <button className={anual ? '' : 'active'} onClick={() => setVista('mensual')}>Mensual</button>
        <button className={anual ? 'active' : ''} onClick={() => setVista('anual')}>Anual</button>
      </div>
      <div className="chart-range-selector">
        {RANGOS.map(([id, label]) => (
          <button key={id} className={rango === id ? 'active' : ''} onClick={() => setRango(id)}>{label}</button>
        ))}
      </div>
    </div>
  );
  const ejeAnio = (a) => (a === ANIO_EN_CURSO ? `${a}*` : a);
  const rotuloAnio = (a) => (a === ANIO_EN_CURSO ? `${a} (${TRAMO_EN_CURSO})` : a);
  const ejeFecha = (v) => (anual ? ejeAnio(v) : fmt.monthShort(v));
  const notaAnio = anual && ANIO_EN_CURSO && (
    <div className="chart-legend-item">* {ANIO_EN_CURSO}: {TRAMO_EN_CURSO}</div>
  );
  const colorCanal = { 0: C.oil, 1: C.exp };

  const cardSerie = ({ s, pts }, i, todas) => {
    const canales = CANAL.filter((c) => (cdN == null || cdN === c.cd) && pts.some((p) => p[c.clave] !== 0));
    // En el gráfico de la suma va también el total de los dos canales (pedido de HDO)
    const conTotal = s.suma && ambos && canales.length === 2;
    // El último de una cantidad impar va a lo ancho
    const ancho = i === todas.length - 1 && todas.length % 2 === 1;
    return (
      <div className={`chart-card${ancho ? ' go-chart-ancho' : ''}`} key={s.id}>
        <div className="chart-card-header">
          <div>
            <span className="chart-card-title">{s.nombre} · volumen por canal de distribución</span>
            <span className="chart-card-subtitle">
              Volumen [{s.unidad}] · total del {anual ? 'año' : 'mes'} · {etiquetaCanal}{etiquetaFiltro ? ` · ${etiquetaFiltro}` : ''}
            </span>
          </div>
          {selectores}
        </div>
        <div className="chart-card-body">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={pts} margin={{ top: 10, right: 26, left: 0, bottom: 0 }}>
              <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={ejeFecha} minTickGap={anual ? 8 : 40} />
              <YAxis tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={eje} domain={[0, 'auto']} width={58} />
              <Tooltip
                content={<TooltipSerie unidad={s.unidad} anual={anual} rotulo={anual ? rotuloAnio : undefined} />}
                cursor={{ stroke: C.axis }}
              />
              {conTotal && <Line dataKey="total" name={`Total [${s.unidad}]`} stroke={C.ink} strokeWidth={2} dot={anual} />}
              {canales.map((c) => (
                <Line key={c.clave} dataKey={c.clave} name={`${c.nombre} [${s.unidad}]`} stroke={colorCanal[c.cd]} strokeWidth={2} dot={anual} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
          <div className="chart-legend">
            {canales.map((c) => (
              <div key={c.cd} className="chart-legend-item">
                <span className="chart-legend-swatch" style={{ background: colorCanal[c.cd] }} />
                {c.nombre}{c.cd === 0 ? ' (al público)' : ' (los demás sectores)'} · volumen del {anual ? 'año' : 'mes'}
              </div>
            ))}
            {conTotal && (
              <div className="chart-legend-item">
                <span className="chart-legend-swatch" style={{ background: C.ink }} />
                Total (minorista + mayorista) · volumen del {anual ? 'año' : 'mes'}
              </div>
            )}
            {!canales.length && <div className="chart-legend-item">Sin ventas con esta selección</div>}
            {notaAnio}
          </div>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------- tablas
  // Clic en una fila: deja solo esa categoría en su filtro; otro clic la suelta
  const filaActiva = (r) => (tablaSel === 'sector' ? sectores.size === 1 && sectores.has(r.nombre)
    : tablaSel === 'empresa' ? empresas?.size === 1 && empresas.has(r.nombre)
      : provincias.size === 1 && provincias.has(r.nombre));
  const elegirFila = (r) => {
    const activa = filaActiva(r);
    if (tablaSel === 'sector') setSectores(new Set(activa ? baseSec : [r.nombre]));
    else if (tablaSel === 'empresa') setEmpresas(activa ? null : new Set([r.nombre]));
    else setProvincias(new Set(activa ? baseProv : [r.nombre]));
  };
  const periodo = (f) => (anual ? rotuloAnio(f) : fmt.monthShort(f));
  const tituloTabla = tablaSel === 'serie'
    ? `Volumen por ${anual ? 'año' : 'mes'}`
    : `Volumen por ${DIMENSION[tablaSel].toLowerCase()} · ${fmt.monthShort(mes)}`;
  const cuerpoTabla = tablaDim ? (
    <table className="mh-tabla go-tabla">
      <thead>
        <tr>
          {tablaSel === 'sector' && <th>Canal de distribución</th>}
          <th>{DIMENSION[tablaSel]}</th>
          {elegidos.map((p) => <th key={p.id} className="num">{corto(p.nombre)} ({conv.get(p.id).u})</th>)}
          {tablaDim.grupos.map((g) => <th key={g.id} className="num">{corto(g.nombre)} ({g.unidad})</th>)}
          {tablaDim.unaUnidad && <th className="num">Participación</th>}
        </tr>
      </thead>
      <tbody>
        {tablaDim.filas.map((r) => (
          <tr key={r.k} className={filaActiva(r) ? 'activa' : ''} onClick={() => elegirFila(r)}>
            {tablaSel === 'sector' && <td>{CANAL[r.cd].nombre}</td>}
            <td>{tablaSel === 'provincia' ? nombreProvincia(r.nombre) : r.nombre}</td>
            {[...r.vals].map((v, j) => <td key={elegidos[j].id} className="num">{fmt.int(v)}</td>)}
            {r.sumas.map((v, g) => <td key={tablaDim.grupos[g].id} className="num">{fmt.int(v)}</td>)}
            {tablaDim.unaUnidad && <td className="num">{fmt.pct(tablaDim.totBase ? (r.base / tablaDim.totBase) * 100 : 0)}</td>}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={tablaSel === 'sector' ? 2 : 1}>Total · {etiquetaCanal}{etiquetaFiltro ? ` · ${etiquetaFiltro}` : ''}</td>
          {tablaDim.totVals.map((v, j) => <td key={elegidos[j].id} className="num">{fmt.int(v)}</td>)}
          {tablaDim.totSumas.map((v, g) => <td key={tablaDim.grupos[g].id} className="num">{fmt.int(v)}</td>)}
          {tablaDim.unaUnidad && <td className="num">{fmt.pct(tablaDim.totBase ? 100 : 0)}</td>}
        </tr>
      </tfoot>
    </table>
  ) : (
    <table className="mh-tabla go-tabla go-tabla-lectura">
      <thead>
        {tablaSerie.conCanales ? (
          <>
            <tr>
              <th rowSpan={2}>{anual ? 'Año' : 'Mes'}</th>
              {tablaSerie.cols.map((s) => <th key={s.id} colSpan={3} className="go-th-grupo">{corto(s.nombre)} ({s.unidad})</th>)}
            </tr>
            <tr>
              {tablaSerie.cols.map((s) => [
                <th key={`${s.id}-0`} className="num go-th-borde">Minorista</th>,
                <th key={`${s.id}-1`} className="num">Mayorista</th>,
                <th key={`${s.id}-t`} className="num">Total</th>,
              ])}
            </tr>
          </>
        ) : (
          <tr>
            <th>{anual ? 'Año' : 'Mes'}</th>
            {tablaSerie.cols.map((s) => <th key={s.id} className="num">{corto(s.nombre)} ({s.unidad})</th>)}
          </tr>
        )}
      </thead>
      <tbody>
        {tablaSerie.filas.map((r) => (
          <tr key={r.fecha}>
            <td>{periodo(r.fecha)}</td>
            {r.celdas.map((p, j) => (tablaSerie.conCanales ? [
              <td key={`${j}-0`} className="num go-th-borde">{fmt.int(p.min)}</td>,
              <td key={`${j}-1`} className="num">{fmt.int(p.may)}</td>,
              <td key={`${j}-t`} className="num">{fmt.int(p.total)}</td>,
            ] : <td key={j} className="num">{fmt.int(p.total)}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="go-seccion go-sesco">
      <div className="go-sticky">
        <Encabezado seccion={seccion} />
        <div className="go-filtros go-filtros-sesco">
          <div className="go-filtro go-f-mes">
            <label htmlFor="ss-mes">Mes</label>
            <select id="ss-mes" className="empresa-select" value={mes} onChange={(e) => setMes(e.target.value)}>
              {[...MESES].reverse().map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
            </select>
          </div>
          <div className="go-filtro go-f-prod">
            <span className="go-filtro-label">Producto</span>
            <DropdownMulti
              opciones={D.productos.map((p) => p.id)} seleccion={productos} resumen={resumenProductos} onCambiar={setProductos}
              rotulo={(id) => K.nombre.get(id)} acciones={ACCIONES_PRODUCTO} clase="go-prov-panel"
            />
          </div>
          <div className="go-filtro go-f-cd">
            <label htmlFor="ss-cd">Canal de distribución</label>
            <select id="ss-cd" className="empresa-select" value={cd} onChange={(e) => setCd(e.target.value)}>
              <option value="0">Minorista</option>
              <option value="1">Mayorista</option>
              <option value="ambos">Ambos</option>
            </select>
          </div>
          <div className="go-filtro go-f-tipos">
            <span className="go-filtro-label">Sector</span>
            <DropdownMulti opciones={D.sectores} seleccion={sectores} resumen={resumenSectores} onCambiar={cambiarSectores} acciones={ACCIONES_SECTOR} />
          </div>
          <div className="go-filtro go-f-band">
            <span className="go-filtro-label">Empresa</span>
            <DropdownMulti
              opciones={opcionesEmpresa} seleccion={empresas ?? new Set(opcionesEmpresa)} resumen={resumenEmpresas}
              onCambiar={cambiarEmpresas} acciones={ACCIONES_EMPRESA}
            />
          </div>
          <div className="go-filtro go-f-prov">
            <span className="go-filtro-label">Provincia</span>
            <DropdownMulti
              opciones={PROVINCIAS_FILTRO} seleccion={provincias} resumen={resumenProvincias} onCambiar={cambiarProvincias}
              rotulo={nombreProvincia} acciones={ACCIONES_PROVINCIA} clase="go-prov-panel"
            />
          </div>
          <div className="go-filtro go-f-unidad">
            <label htmlFor="ss-unidad">Unidad</label>
            <select id="ss-unidad" className="empresa-select" value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
              {UNIDADES.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
        </div>
        <Cajas cajas={cajas} abiertos={abiertos} alternar={alternar} />
      </div>

      {abiertos.kpi && (
        <div className="go-kpi-bloque">
          <div className="go-kpi-cabecera">
            <span className="chart-card-subtitle">{explicacion}</span>
            <div className="chart-range-selector">
              <button className={kpiVista === 'mes' ? 'active' : ''} onClick={() => setKpiVista('mes')}>Mes</button>
              <button className={kpiVista === 'anio' ? 'active' : ''} onClick={() => setKpiVista('anio')}>Año</button>
            </div>
          </div>
          <div className="kpi-grid go-kpis-fila go-kpis-periodos">
            {indicadores.map((ind) => <TarjetaPeriodos key={ind.k} ind={ind} periodos={periodos} />)}
            {/* celdas vacías para completar la última fila de la grilla (cuatro columnas; dos en pantallas angostas) */}
            {Array.from({ length: (4 - (indicadores.length % 4)) % 4 }, (_, i) => (
              <div key={`r${i}`} className={`kpi-card go-kpi-relleno${i === 0 && indicadores.length % 2 ? ' impar' : ''}`} aria-hidden="true" />
            ))}
          </div>
        </div>
      )}

      {abiertos.corte && (
        <CorteRealChart
          datos={corteSerie} vistaInicial="mensual"
          detalle={`país, sin bunker ni usinas${etiquetaEmpresas ? ` · ${etiquetaEmpresas}` : ''}`}
        />
      )}

      {abiertos.graficos && (graficos.length ? (
        <div className="go-charts-grid">{graficos.map(cardSerie)}</div>
      ) : (
        <div className="section-placeholder">Elegí al menos un producto.</div>
      ))}
      {abiertos.graficos && elegidos.length > MAX_GRAFICOS && (
        <p className="note go-nota">
          Con más de {MAX_GRAFICOS} productos elegidos los gráficos muestran la suma; el detalle de cada producto está en las tablas.
        </p>
      )}

      {abiertos.importado && (
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Gas oil importado · volumen</span>
              <span className="chart-card-subtitle">Volumen [{U}] del {anual ? 'año' : 'mes'} (despachos de importación) · no responde a los filtros de las tablas SESCO</span>
            </div>
            {selectores}
          </div>
          <div className="chart-card-body">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={importaciones} margin={{ top: 10, right: 26, left: 0, bottom: 0 }}>
                <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={ejeFecha} minTickGap={anual ? 8 : 40} />
                <YAxis tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={eje} width={58} />
                <Tooltip content={<TooltipSerie unidad={U} anual={anual} rotulo={anual ? rotuloAnio : undefined} />} cursor={{ stroke: C.axis }} />
                <Bar dataKey="vol" name={`Gas oil importado [${U}]`} fill={C.oil} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="chart-legend">
              <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.oil }} />Gas oil importado [{U}]</div>
              {notaAnio}
            </div>
          </div>
        </div>
      )}

      {abiertos.tablas && (
        <div className="chart-card go-sesco-tabla">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">{tituloTabla}</span>
              <span className="chart-card-subtitle">
                {resumenProductos} · {etiquetaCanal}{etiquetaFiltro ? ` · ${etiquetaFiltro}` : ''}
              </span>
            </div>
            <div className="go-selectores-grafico">
              <div className="chart-range-selector">
                {TABLAS.map(([id, label]) => (
                  <button key={id} className={tablaSel === id ? 'active' : ''} onClick={() => setTablaSel(id)}>{label}</button>
                ))}
              </div>
              {tablaSel === 'serie' && selectores}
            </div>
          </div>
          <div className="chart-card-body">
            {elegidos.length ? <div className="mh-tabla-scroll go-sesco-scroll">{cuerpoTabla}</div>
              : <div className="section-placeholder">Elegí al menos un producto.</div>}
          </div>
        </div>
      )}

      <p className="note go-nota">
        Fuente: Secretaría de Energía, tablas SESCO de ventas al mercado (excluye las ventas a empresas del sector),
        despachos de importación de gas oil y ventas de biodiésel para el corte. Minorista es el sector Al Público;
        mayorista, todos los demás sectores. Al entrar no están tildados {enLista(D.sectores_sin_tildar, 'ni')}: se
        agregan desde el filtro Sector. Corte real: biodiésel vendido para el corte sobre el gas oil grado 2 y grado 3
        del país sin bunker ni usinas, en m³, sin sumar el importado; con empresas elegidas, el de esas empresas.
        Cumplimiento: corte real sobre corte obligatorio.
        Unidad: el selector aplica al gas oil ({decimales(D.densidad_go, 3)} ton/m³) y al biodiésel
        ({decimales(DENSIDAD_BIO, 3)} ton/m³), con 6,2898 bbl y 264,172 gal por m³; los demás productos quedan en la
        unidad de la fuente (m³, toneladas o miles de m³) y solo se suman los de la misma unidad. En las tablas por
        sector, por empresa y por provincia, clic en una fila deja solo esa categoría en el resto de la página; otro
        clic la suelta. Último mes: {fmt.monthShort(ULTIMO)}.
      </p>
    </div>
  );
}
