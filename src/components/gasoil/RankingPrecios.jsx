import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine,
} from 'recharts';
import {
  MESES, ULTIMO_MES, IDX_MES, PRODUCTOS, TC, CPI_US, TIPOS_NEGOCIO, CANALES_COM, MESES_ANOMALOS_PRODUCTOS, DENSIDAD_GO, DENSIDAD_BIO, variacion,
  cargarProductos, ponderarProducto,
} from '../../lib/gasoil.js';
import { NOTA_MESES_EXCLUIDOS, TIPOS_RETAIL, CC_PUBLICO, TODAS, DropdownMulti, mismas } from './relevamiento.jsx';
import { fmt } from '../../lib/format.js';
import { useChartColors, useTheme } from '../../lib/theme.jsx';
import { COLORES_RANKING } from './coloresRanking.js';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import './GasOil.css';

const BASE_DEFAULT = '2024-01'; // "Fecha Final" del workbook (12/01/2024)
const REZAGO_MAX = 3;           // meses hacia atrás que se admiten si falta el dato del mes

// Productos del relevamiento SE 1104 (public/data/gasoil_productos.json): cada
// producto × tipo de precio es un producto del ranking, como en el filtro
// Producto del Tableau. Densidades del workbook: 0,845 gas oil y kerosene,
// 0,68 naftas. El gas oil grado 1 solo tiene surtidor, de 2010 a 2013.
const TIPOS = { s: 'surtidor', c: 'con impuestos', n: 'sin impuestos' };
const RELEVAMIENTO = [
  { id: 'g2', nombre: 'Gas oil grado 2', densidad: 0.845, tipos: 'scn', familia: 'gasoil' },
  { id: 'g3', nombre: 'Gas oil grado 3', densidad: 0.845, tipos: 'scn', familia: 'gasoil' },
  { id: 'g1', nombre: 'Gas oil grado 1', densidad: 0.845, tipos: 's', familia: 'gasoil' },
  { id: 'ns', nombre: 'Nafta súper', densidad: 0.68, tipos: 'scn', familia: 'naftas' },
  { id: 'np', nombre: 'Nafta premium', densidad: 0.68, tipos: 'scn', familia: 'naftas' },
  { id: 'ke', nombre: 'Kerosene', densidad: 0.845, tipos: 'scn', familia: 'naftas' },
];
const PRODUCTOS_1104 = RELEVAMIENTO.flatMap((p) => [...p.tipos].map((t) => ({
  id: `${p.id}_${t}`, producto: p.id, tipo: t, nombre: `${p.nombre} - ${TIPOS[t]}`, familia: p.familia,
  densidad: p.densidad, unidad: 'usd/ton', fuente: 'SE Res. 1104', relevamiento: true,
})));
// Series precalculadas por el generador con el recorte inicial (minorista, al
// público, bocas y estaciones): valen de respaldo hasta que baja el archivo
const RESPALDO = { g2_s: 'go2_surtidor', g2_n: 'go2_sin_imp', g3_s: 'go3_surtidor', g3_n: 'go3_sin_imp' };
// Los productos de Master data (gasoil_ranking.json), sin las cuatro series precalculadas de gas oil
const PRODUCTOS_MASTER = PRODUCTOS.filter((p) => !p.id.startsWith('go')).map((p) => ({ ...p, familia: p.familia || 'otros' }));
const FAMILIAS = [
  ['gasoil', 'Gas oil (relevamiento SE 1104)'],
  ['naftas', 'Naftas y kerosene (relevamiento SE 1104)'],
  ['crudo', 'Crudos'],
  ['diesel', 'Diésel de referencia'],
  ['bio', 'Biodiésel'],
  ['aceite', 'Aceite de soja'],
  ['metanol', 'Metanol'],
  ['glicerina', 'Glicerina'],
  ['otros', 'Otros'],
];
const CATALOGO = FAMILIAS.flatMap(([f]) => [...PRODUCTOS_1104, ...PRODUCTOS_MASTER].filter((p) => p.familia === f));
const GRUPOS = FAMILIAS.map(([f, titulo]) => ({ titulo, opciones: CATALOGO.filter((p) => p.familia === f).map((p) => p.id) }))
  .filter((g) => g.opciones.length);
// Selección inicial (HDO, 07/10/2026): los cuatro gas oil, los dos crudos que se
// consumen en la Argentina (Cañadón Seco y Escalante; Medanito quedó afuera) en
// lugar de Brent y WTI, el diésel USA, el FAME, el biodiésel del corte
// obligatorio y el aceite
const INICIAL = ['g2_s', 'g2_n', 'g3_s', 'g3_n', 'canadon_seco', 'escalante', 'diesel_usa', 'fame_ara', 'bio_963_m', 'aceite_fas'];
const TODOS_IDS = CATALOGO.map((p) => p.id);
const ACCIONES_PRODUCTOS = [['Selección inicial', INICIAL, 'Los productos con que abre la página'], ['Todos', null], ['Ninguno', []]];
const TIPOS_RETAIL_LISTA = TIPOS_NEGOCIO.filter((t) => TIPOS_RETAIL.has(t));
// Unidad de medida (pedido de HDO del 07/10/2026): cuántas de cada una hay en un
// m³ (ton: la densidad del producto). Mismas conversiones que Precios comparados.
const UNIDADES = [
  { id: 'ton', label: 'ton', porM3: (d) => d },
  { id: 'm3', label: 'm³', porM3: () => 1 },
  { id: 'l', label: 'l', porM3: () => 1000 },
  { id: 'bbl', label: 'bbl', porM3: () => 6.2898 },
  { id: 'gal', label: 'gal', porM3: () => 264.172 },
];
// Densidades (ton/m³) por familia: gas oil y biodiésel, las del sitio; naftas
// 0,68 y kerosene 0,845 como el workbook; aceite de soja, metanol y crudos,
// los valores de referencia de Precios comparados; glicerina cruda 1,26.
const DENSIDADES = { gasoil: DENSIDAD_GO, naftas: 0.68, crudo: 0.835, diesel: DENSIDAD_GO, bio: DENSIDAD_BIO, aceite: 0.92, metanol: 0.792, glicerina: 1.26, otros: 1 };
// Valores de la tabla y el tooltip: decimales según la magnitud (en $/l o usd/gal el precio es chico)
const fmtValor = (v) => {
  if (v == null || isNaN(v)) return 's/d';
  const a = Math.abs(v);
  const dec = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
  return v.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};
const NOTA_DENSIDADES = 'gas oil, kerosene y diésel 0,845; naftas 0,68; biodiésel 0,885; aceite de soja 0,92; metanol 0,792; crudos 0,835; glicerina 1,26 ton/m³';
// Nota de los meses sin precio propios de las naftas: "nafta premium - sin impuestos de ene 2015 y feb 2017, ..."
const NOTA_ANOMALOS_PRODUCTOS = Object.entries(MESES_ANOMALOS_PRODUCTOS).map(([col, fechas]) => {
  const [, tipo, producto] = col.match(/^p(\w)_(\w+)$/);
  const p = PRODUCTOS_1104.find((q) => q.producto === producto && q.tipo === tipo);
  return `${p ? p.nombre.toLowerCase() : col} de ${fechas.map(fmt.monthShort).join(' y ')}`;
}).join(', ni la ');

/**
 * Réplica del tablero "RANKING Actualizado": variación % acumulada del precio
 * de cada producto desde una fecha base hasta el mes de análisis, con carrera
 * de barras mes a mes (Play), la misma variación en líneas y la tabla de
 * valores. Moneda usd o $ (TC mensual), valores corrientes o constantes
 * (deflactados con el CPI de Estados Unidos, como en el workbook).
 *
 * Desde el 07/10/2026 (pedido de HDO) ofrece los 48 productos del filtro
 * Producto del tablero: los 16 del relevamiento SE 1104 (gas oil grado 1, 2 y
 * 3, kerosene y naftas por tipo de precio), que se ponderan acá con los tres
 * filtros del relevamiento (canal de distribución, tipo de negocio y canal de
 * comercialización) sobre public/data/gasoil_productos.json, y los 32 de
 * Master data (crudos, diésel, biodiésel, aceite, metanol, glicerina). Abre
 * con los diez de siempre y el recorte del tablero (minorista, al público,
 * bocas y estaciones), que reproduce las series precalculadas.
 */
export default function RankingPrecios({ seccion }) {
  const C = useChartColors();
  const { theme } = useTheme();
  const [base, setBase] = useState(BASE_DEFAULT);
  const [mes, setMes] = useState(ULTIMO_MES);
  const [moneda, setMoneda] = useState('usd');
  const [unidadId, setUnidadId] = useState('ton');
  const [valores, setValores] = useState('cte');
  const [destacado, setDestacado] = useState(null); // producto resaltado con un clic en su barra
  const [jugando, setJugando] = useState(false);
  const [seleccion, setSeleccion] = useState(() => new Set(INICIAL));
  const [D, setD] = useState(null);
  const [error, setError] = useState(null);
  // Filtros del relevamiento (modo surtidor del workbook: minorista, bocas y estaciones, al público)
  const [cd, setCd] = useState('0');
  const [tipos, setTipos] = useState(() => new Set(TIPOS_RETAIL_LISTA));
  const [cc, setCc] = useState(CC_PUBLICO >= 0 ? String(CC_PUBLICO) : TODAS);
  const timer = useRef(null);

  useEffect(() => {
    cargarProductos().then(setD).catch((e) => setError(e.message));
  }, []);

  // Listas de tipos y canales: las del archivo (mismos índices que gasoil_precios.json)
  const TN = D?.tipos_negocio || TIPOS_NEGOCIO;
  const CC = D?.canales_com || CANALES_COM;
  const cdN = cd === 'ambos' ? null : Number(cd);
  const ccN = cc === TODAS ? null : Number(cc);
  const tiposIdx = useMemo(() => new Set(TN.map((t, i) => (tipos.has(t) ? i : -1)).filter((i) => i >= 0)), [TN, tipos]);
  // Opciones disponibles según el canal de distribución elegido
  const disponibles = useMemo(() => {
    const tn = new Set();
    const ccs = new Set();
    if (D) {
      for (let i = 0; i < D.mes.length; i++) {
        if (cdN != null && D.cd[i] !== cdN) continue;
        tn.add(D.tn[i]);
        ccs.add(D.cc[i]);
      }
      return { tipos: [...tn].map((i) => TN[i]).sort(), canales: [...ccs].map((i) => CC[i]).sort() };
    }
    return { tipos: [...TN].sort(), canales: [...CC].sort() };
  }, [D, cdN, TN, CC]);
  const cambiarCd = (v) => {
    setCd(v);
    // Minorista: bocas y estaciones (default del workbook); mayorista y ambos: todos los tipos
    setTipos(new Set(v === '0' ? TN.filter((t) => TIPOS_RETAIL.has(t)) : TN));
    setCc(v === '1' ? TODAS : (CC_PUBLICO >= 0 ? String(CC_PUBLICO) : TODAS));
  };
  const enRecorteInicial = cd === '0' && ccN === CC_PUBLICO && mismas(tipos, TIPOS_RETAIL_LISTA);
  const resumenTipos = mismas(tipos, TIPOS_RETAIL_LISTA) ? 'Bocas y estaciones'
    : tipos.size >= disponibles.tipos.length ? 'Todos los tipos'
      : `${[...tipos].filter((t) => disponibles.tipos.includes(t)).length} de ${disponibles.tipos.length} tipos`;
  const recorte = `${cd === 'ambos' ? 'minorista y mayorista' : cd === '0' ? 'minorista' : 'mayorista'} · `
    + `${ccN == null ? 'todos los canales' : CC[ccN].toLowerCase()} · ${resumenTipos.toLowerCase()}`;

  const elegidos = useMemo(() => CATALOGO.filter((p) => seleccion.has(p.id)), [seleccion]);
  const resumenProductos = mismas(seleccion, INICIAL) ? 'Selección inicial'
    : seleccion.size === CATALOGO.length ? 'Todos los productos'
      : `${seleccion.size} de ${CATALOGO.length} productos`;

  // Series en su unidad nativa: id → Map(fecha → valor). Relevamiento en $/l
  // (ponderado con los filtros); Master data en usd/ton; crudos en usd/m³. Hasta
  // que baje el archivo, las cuatro de gas oil usan las precalculadas (usd/ton,
  // vueltas a $/l) si el recorte es el inicial.
  const nativoDe = (p) => (p.relevamiento ? { moneda: 'ars', unidad: 'l', densidad: p.densidad }
    : { moneda: 'usd', unidad: p.unidad === 'usd/m³' ? 'm3' : 'ton', densidad: DENSIDADES[p.familia] ?? 1 });
  const nativas = useMemo(() => {
    const out = new Map();
    const filtro = (i) => (cdN == null || D.cd[i] === cdN) && tiposIdx.has(D.tn[i]) && (ccN == null || D.cc[i] === ccN);
    for (const p of elegidos) {
      if (!p.relevamiento) {
        out.set(p.id, new Map(p.serie));
      } else if (D) {
        out.set(p.id, ponderarProducto(D, filtro, p.producto, p.tipo));
      } else if (RESPALDO[p.id] && enRecorteInicial) {
        const m = new Map();
        for (const [f, usdTon] of PRODUCTOS.find((q) => q.id === RESPALDO[p.id])?.serie || []) {
          const tc = TC.get(f);
          if (tc) m.set(f, (usdTon * tc * p.densidad) / 1000);
        }
        out.set(p.id, m);
      } else {
        out.set(p.id, new Map());
      }
    }
    return out;
  }, [D, elegidos, cdN, tiposIdx, ccN, enRecorteInicial]);

  // Series por producto en la unidad, moneda y valores elegidos: id → Map(fecha → valor).
  // De la unidad nativa a la elegida con la densidad del producto, a la moneda
  // con el TC del mes y, si corresponde, a constantes con el CPI a la fecha base.
  const unidad = UNIDADES.find((u) => u.id === unidadId) || UNIDADES[0];
  const series = useMemo(() => {
    const cpiBase = CPI_US.get(base);
    const out = new Map();
    for (const p of elegidos) {
      const nativo = nativoDe(p);
      const factorUnidad = UNIDADES.find((u) => u.id === nativo.unidad).porM3(nativo.densidad) / unidad.porM3(nativo.densidad);
      const m = new Map();
      for (const [f, v0] of nativas.get(p.id) || []) {
        let v = v0 * factorUnidad;
        if (nativo.moneda !== moneda) {
          const tc = TC.get(f);
          if (!tc) continue;
          v = moneda === 'usd' ? v / tc : v * tc;
        }
        if (valores === 'cte') {
          const cpi = CPI_US.get(f);
          if (!cpi || !cpiBase) continue;
          v *= cpiBase / cpi;
        }
        m.set(f, v);
      }
      out.set(p.id, m);
    }
    return out;
  }, [nativas, elegidos, unidad, moneda, valores, base]);

  // Valor de un producto en un mes, admitiendo hasta REZAGO_MAX meses de atraso
  const valorEn = (id, f) => {
    const m = series.get(id);
    let i = IDX_MES.get(f);
    for (let k = 0; k <= REZAGO_MAX && i - k >= 0; k++) {
      const v = m.get(MESES[i - k]);
      if (v != null) return { v, fecha: MESES[i - k] };
    }
    return null;
  };

  const rotuloUnidad = `${moneda === 'usd' ? 'usd' : '$'}/${unidad.label}`;
  const filas = useMemo(() => elegidos.map((p) => {
    const b = series.get(p.id)?.get(base);
    const a = valorEn(p.id, mes);
    return {
      id: p.id, nombre: p.nombre, unidad: rotuloUnidad,
      fuente: p.relevamiento ? `${p.fuente} · ${recorte}` : p.fuente, nota: p.nota, hasta: p.hasta,
      base: b ?? null, actual: a?.v ?? null, fechaActual: a?.fecha ?? null,
      variacion: b != null && a ? variacion(a.v, b) : null,
    };
  }), [elegidos, series, base, mes, rotuloUnidad, recorte]);
  const ranking = filas
    .filter((f) => f.variacion != null)
    .sort((a, b) => b.variacion - a.variacion);

  // Líneas: variación acumulada desde la base, mes a mes
  const lineas = useMemo(() => {
    const desde = IDX_MES.get(base);
    const hasta = IDX_MES.get(mes);
    const pts = [];
    for (let i = desde; i <= hasta; i++) {
      const f = MESES[i];
      const row = { fecha: f };
      for (const p of elegidos) {
        const b = series.get(p.id).get(base);
        const v = series.get(p.id).get(f);
        row[p.id] = b != null && v != null ? variacion(v, b) : null;
      }
      pts.push(row);
    }
    return pts;
  }, [elegidos, series, base, mes]);

  // Carrera: avanza un mes por segundo desde la base
  useEffect(() => {
    if (!jugando) return undefined;
    timer.current = setInterval(() => {
      setMes((m) => {
        const i = IDX_MES.get(m);
        if (i >= MESES.length - 1) {
          setJugando(false);
          return m;
        }
        return MESES[i + 1];
      });
    }, 900);
    return () => clearInterval(timer.current);
  }, [jugando]);
  const play = () => {
    if (!jugando && mes === ULTIMO_MES) setMes(MESES[Math.min(IDX_MES.get(base) + 1, MESES.length - 1)]);
    setJugando((j) => !j);
  };

  // Un color por producto, fijo (coloresRanking.js); el trazo distingue el tipo de precio
  const color = (id) => (COLORES_RANKING[theme] || COLORES_RANKING.light)[id] || C.neutral;
  const trazo = (p) => (p.tipo === 'n' ? '3 3' : p.tipo === 'c' ? '7 3' : undefined);
  const quitar = (id) => setSeleccion((s) => {
    const n = new Set(s);
    n.delete(id);
    return n;
  });
  // Clic en una barra: resalta ese producto en los dos gráficos y en la tabla;
  // otro clic lo suelta. Si el producto sale de la selección, se suelta solo.
  const resaltar = (id) => setDestacado((d) => (d === id ? null : id));
  const activo = destacado && seleccion.has(destacado) ? destacado : null;
  const apagado = (id) => (activo != null && id !== activo);
  const nombreDe = (id) => CATALOGO.find((p) => p.id === id)?.nombre || id;
  const alto = Math.max(260, 34 * Math.max(ranking.length, 1) + 30);

  return (
    <div className="go-seccion go-ranking">
      {/* Bloque fijo (pedido de HDO del 07/10/2026): encabezado y las dos filas de
          controles quedan pegados al scrollear, con el rótulo arriba de cada control */}
      <div className="go-sticky">
      <Encabezado seccion={seccion} />
      <div className="go-filtros go-filtros-ranking-1">
        <div className="go-filtro">
          <label htmlFor="go-rk-base">Fecha base</label>
          <select id="go-rk-base" className="empresa-select" value={base} onChange={(e) => { setBase(e.target.value); if (e.target.value > mes) setMes(ULTIMO_MES); }}>
            {[...MESES].reverse().filter((f) => f < ULTIMO_MES).map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
          </select>
        </div>
        <div className="go-filtro">
          <label htmlFor="go-rk-mes">Mes de análisis</label>
          <select id="go-rk-mes" className="empresa-select" value={mes} onChange={(e) => setMes(e.target.value)}>
            {[...MESES].reverse().filter((f) => f > base).map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
          </select>
        </div>
        <div className="go-filtro">
          <span className="go-filtro-label">Carrera</span>
          <button type="button" className={`empresa-select go-play ${jugando ? 'activo' : ''}`} onClick={play}>
            {jugando ? '❚❚ Pausa' : '▶ Reproducir'}
          </button>
        </div>
        <div className="go-filtro">
          <span className="go-filtro-label">Moneda</span>
          <div className="chart-range-selector">
            <button className={moneda === 'usd' ? 'active' : ''} onClick={() => setMoneda('usd')}>usd</button>
            <button className={moneda === 'ars' ? 'active' : ''} onClick={() => setMoneda('ars')}>$</button>
          </div>
        </div>
        <div className="go-filtro">
          <label htmlFor="go-rk-unidad">Unidad</label>
          <select id="go-rk-unidad" className="empresa-select" value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
            {UNIDADES.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </div>
        <div className="go-filtro">
          <span className="go-filtro-label">Valores</span>
          <div className="chart-range-selector">
            <button className={valores === 'cte' ? 'active' : ''} onClick={() => setValores('cte')}>Constantes</button>
            <button className={valores === 'cor' ? 'active' : ''} onClick={() => setValores('cor')}>Corrientes</button>
          </div>
        </div>
      </div>

      {/* Productos y los tres filtros del relevamiento */}
      <div className="go-filtros go-filtros-ranking">
        <div className="go-filtro go-f-prod">
          <span className="go-filtro-label">Productos</span>
          <DropdownMulti
            opciones={TODOS_IDS} grupos={GRUPOS} seleccion={seleccion} resumen={resumenProductos} onCambiar={setSeleccion}
            rotulo={nombreDe} acciones={ACCIONES_PRODUCTOS} clase="go-prod-panel"
          />
        </div>
        <div className="go-filtro go-f-cd">
          <label htmlFor="go-rk-cd">Canal de distribución</label>
          <select id="go-rk-cd" className="empresa-select" value={cd} onChange={(e) => cambiarCd(e.target.value)}>
            <option value="0">Minorista</option>
            <option value="1">Mayorista</option>
            <option value="ambos">Ambos</option>
          </select>
        </div>
        <div className="go-filtro go-f-tipos">
          <span className="go-filtro-label">Tipo de negocio</span>
          <DropdownMulti opciones={disponibles.tipos} seleccion={tipos} resumen={resumenTipos} onCambiar={setTipos} />
        </div>
        <div className="go-filtro go-f-cc">
          <label htmlFor="go-rk-cc">Canal de comercialización</label>
          <select id="go-rk-cc" className="empresa-select" value={cc} onChange={(e) => setCc(e.target.value)}>
            <option value={TODAS}>Todos los canales</option>
            {disponibles.canales.map((c) => <option key={c} value={String(CC.indexOf(c))}>{c}</option>)}
          </select>
        </div>
      </div>
      </div>
      {error && <p className="note go-nota">No se pudieron cargar los productos del relevamiento: {error}</p>}

      <div className="go-charts-grid go-ranking-grid">
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Ranking · variación desde {fmt.monthShort(base)} hasta {fmt.monthShort(mes)}</span>
              <span className="chart-card-subtitle">
                {rotuloUnidad} {valores === 'cte' ? 'constantes (CPI EE.UU.)' : 'corrientes'} · {elegidos.length} productos · {recorte} · clic en una barra la resalta
              </span>
            </div>
          </div>
          <div className="chart-card-body">
            <ResponsiveContainer width="100%" height={alto}>
              <BarChart data={ranking} layout="vertical" margin={{ top: 4, right: 70, left: 8, bottom: 4 }}>
                <XAxis type="number" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.pct(v, 0)} />
                <YAxis type="category" dataKey="nombre" width={230} tick={{ fill: C.ink, fontSize: 11 }} stroke={C.axis} interval={0} />
                <ReferenceLine x={0} stroke={C.axis} />
                <Tooltip content={<TooltipRanking />} cursor={{ fill: C.cursor }} />
                <Bar dataKey="variacion" isAnimationActive animationDuration={700} radius={[0, 2, 2, 0]} cursor="pointer"
                  onClick={(d) => resaltar(d?.id ?? d?.payload?.id)}>
                  {ranking.map((r) => <Cell key={r.id} fill={color(r.id)} fillOpacity={apagado(r.id) ? 0.22 : 1} stroke={r.id === activo ? C.ink : 'none'} strokeWidth={r.id === activo ? 1.5 : 0} />)}
                  <LabelList dataKey="variacion" position="right" formatter={(v) => fmt.pct(v, 0)} fill={C.ink} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <span className="chart-card-title">Variación acumulada mes a mes</span>
              <span className="chart-card-subtitle">desde {fmt.monthShort(base)} · {rotuloUnidad} {valores === 'cte' ? 'constantes' : 'corrientes'}{activo ? ` · resaltado: ${nombreDe(activo)}` : ''}</span>
            </div>
          </div>
          <div className="chart-card-body">
            <ResponsiveContainer width="100%" height={alto}>
              <LineChart data={lineas} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.monthShort(v)} minTickGap={40} />
                <YAxis tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis} tickFormatter={(v) => fmt.pct(v, 0)} width={52} />
                <ReferenceLine y={0} stroke={C.axis} />
                <Tooltip content={<TooltipLineas />} cursor={{ stroke: C.axis }} />
                {elegidos.map((p) => (
                  <Line key={p.id} dataKey={p.id} name={p.nombre} stroke={color(p.id)}
                    strokeWidth={p.id === activo ? 3.2 : p.familia === 'gasoil' ? 2 : 1.4} strokeOpacity={apagado(p.id) ? 0.16 : 1}
                    strokeDasharray={trazo(p)} dot={false} connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-card-header">
          <div>
            <span className="chart-card-title">Valores</span>
            <span className="chart-card-subtitle">
              {rotuloUnidad} {valores === 'cte' ? `constantes de ${fmt.monthShort(base)}` : 'corrientes'} · clic en una fila saca el producto; el desplegable Productos lo vuelve a poner
            </span>
          </div>
        </div>
        <div className="mh-tabla-scroll">
          <table className="mh-tabla go-tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="num">{fmt.monthShort(base)}</th>
                <th className="num">{fmt.monthShort(mes)}</th>
                <th className="num">Variación</th>
                <th>Fuente</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className={f.id === activo ? 'destacada' : apagado(f.id) ? 'apagada' : ''} onClick={() => quitar(f.id)} title="Clic: sacar del ranking">
                  <td><span className="go-swatch" style={{ background: color(f.id) }} />{f.nombre}</td>
                  <td className="num">{fmtValor(f.base)}</td>
                  <td className="num">
                    {fmtValor(f.actual)}
                    {f.fechaActual && f.fechaActual !== mes && <span className="muted"> ({fmt.monthShort(f.fechaActual)})</span>}
                  </td>
                  <td className={`num ${f.variacion == null ? '' : f.variacion >= 0 ? 'delta-pos' : 'delta-neg'}`}>
                    {f.variacion != null ? fmt.pct(f.variacion) : '-'}
                  </td>
                  <td className="muted">
                    {f.fuente}{f.nota ? ` · ${f.nota}` : ''}
                    {f.hasta && f.hasta < ULTIMO_MES && !f.nota ? ` · hasta ${fmt.monthShort(f.hasta)}` : ''}
                  </td>
                </tr>
              ))}
              {!filas.length && <tr><td colSpan={5} className="muted">Ningún producto elegido: abrí el desplegable Productos.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <p className="note go-nota">
        Gas oil, naftas y kerosene: precio ponderado por volumen del relevamiento SE Res. 1104 ({recorte}), en $/l, pasado a la
        moneda con el TC mensual. El precio surtidor solo existe al público: con otro canal esas filas quedan sin dato. Crudos:
        usd por m³ del informe de regalías de crudo de la SE; el resto, usd por tonelada de Master data. Cambio de unidad con
        las densidades {NOTA_DENSIDADES} (las del workbook para el relevamiento; las demás son valores de referencia). Valores
        constantes: deflactados con el CPI de Estados Unidos a la fecha base, en ambas monedas, como en el workbook. Cuando falta el dato del mes se toma el último disponible hasta
        {' '}{REZAGO_MAX} meses atrás (se indica entre paréntesis). {NOTA_MESES_EXCLUIDOS} Tampoco se muestra la {NOTA_ANOMALOS_PRODUCTOS}, por
        valores anómalos de esas series (los demás precios de esos meses sí).
      </p>
    </div>
  );
}

function Encabezado({ seccion }) {
  return (
    <>
      <p className="section-kicker">Mercado Gas Oil</p>
      <h2>{seccion?.title ?? 'Ranking de variación de precios'}</h2>
      {seccion?.intro && <p className="section-intro">{seccion.intro}</p>}
    </>
  );
}

function TooltipRanking({ active, payload }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{r.nombre}</div>
      <div className="chart-tooltip-row"><div className="chart-tooltip-row-label"><span>Base</span></div><span className="chart-tooltip-row-val">{fmtValor(r.base)} {r.unidad}</span></div>
      <div className="chart-tooltip-row"><div className="chart-tooltip-row-label"><span>{fmt.monthShort(r.fechaActual)}</span></div><span className="chart-tooltip-row-val">{fmtValor(r.actual)} {r.unidad}</span></div>
      <div className="chart-tooltip-row"><div className="chart-tooltip-row-label"><span>Variación</span></div><span className="chart-tooltip-row-val">{fmt.pct(r.variacion)}</span></div>
    </div>
  );
}

function TooltipLineas({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const orden = [...payload].filter((p) => p.value != null).sort((a, b) => b.value - a.value);
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{fmt.monthShort(label)}</div>
      {orden.map((p) => (
        <div key={p.dataKey} className="chart-tooltip-row">
          <div className="chart-tooltip-row-label"><span className="chart-tooltip-swatch" style={{ background: p.color }} /><span>{p.name}</span></div>
          <span className="chart-tooltip-row-val">{fmt.pct(p.value)}</span>
        </div>
      ))}
    </div>
  );
}
