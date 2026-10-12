import { useEffect, useMemo, useRef, useState } from 'react';
import comprasData from '../../data/compras_cupo.json';
import empresasData from '../../data/empresas.json';
import mapa from '../../data/mapa_argentina.json';
import { PRESIDENCIAS } from '../../lib/gestiones.js';
import { fmt } from '../../lib/format.js';
import { useTheme } from '../../lib/theme.jsx';
import { colorHolding, textoSobre } from './coloresComprasCupo.js';
import DropdownMulti from './DropdownMulti.jsx';
import './Mercado.css';

/**
 * Compras al cupo por petrolera - réplica del dashboard EXPLORA QS BUYER (3)
 * ("Domestic quota sales - buyers") del libro Tableau 02 MERCADO INTERNO
 * BIODIESEL, con los datos del sitio (compras_cupo.json: ventas de cupo de
 * cada elaboradora a cada petrolera, mes a mes; atributos de la elaboradora
 * en empresas.json).
 *
 * Tres piezas y una fila de filtros:
 *  - tabla: una fila por petrolera, columnas año > trimestre > mes, cada
 *    celda con toneladas y participación en el total del mes; columna Total;
 *  - treemap: una baldosa por elaboradora y petrolera, color por grupo
 *    económico, tamaño por toneladas;
 *  - mapa: una torta por provincia, tamaño por participación de la
 *    provincia, gajos por grupo económico.
 * Un clic en la tabla (petrolera, mes, trimestre, año o celda) acota el
 * treemap y el mapa a esa selección; otro clic la suelta.
 *
 * Decisiones (HDO, 12/10/2026): categorías del sitio (integrada / no
 * integrada / comercializadora) y grupos del sitio; segundo porcentaje de la
 * baldosa = participación de la empresa dentro de lo que compró esa
 * petrolera; petroleras ordenadas por el total del período; el COTAB de 2022
 * queda adentro (la fuente no lo abre por petrolera); umbral de 10 t.
 */

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                      'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const CATEGORIAS = ['INTEGRADA', 'NO INTEGRADA', 'COMERCIALIZADORA'];
const ETIQUETA_CAT = {
  INTEGRADA: 'Integradas',
  'NO INTEGRADA': 'No integradas',
  COMERCIALIZADORA: 'Comercializadoras',
};
const UMBRAL_PETROLERA = 10; // t en el período: por debajo la petrolera no se lista (regla del Tableau)
const pct0 = (n) => fmt.pct(n, 0);

// ---------------------------------------------------------------- datos base

const MESES = comprasData.meses;
const EMPRESAS = comprasData.empresas;
const PETROLERAS = comprasData.petroleras;
// Cada venta: [mes, empresa, petrolera, ton] (índices sobre las tres listas)
const VENTAS = comprasData.ventas;

const ATRIB = new Map(empresasData.empresas.map((e) => [e.empresa, e]));
const atrib = (ei) => ATRIB.get(EMPRESAS[ei]) || {};
const holdingDe = (ei) => atrib(ei).grupo || EMPRESAS[ei];

const MESES_CON_VENTAS = (() => {
  const s = new Set();
  for (const v of VENTAS) s.add(MESES[v[0]]);
  return [...s].sort();
})();
const PRIMER_MES = MESES_CON_VENTAS[0];
const ULTIMO_MES = MESES_CON_VENTAS.at(-1);
const ANIOS = [...new Set(MESES_CON_VENTAS.map((m) => m.slice(0, 4)))].sort().reverse();

// Presidencias como intervalo (misma regla que en Gas Oil): de diciembre del
// año en que asume a noviembre del año en que termina, recortado a los
// meses con datos.
const PERIODOS_PRESIDENCIA = PRESIDENCIAS.map((p) => {
  const desde = `${p.desde.slice(0, 4)}-12`;
  const hasta = p.hasta ? `${p.hasta.slice(0, 4)}-11` : ULTIMO_MES;
  return {
    id: p.presidente, nombre: p.corto,
    desde: desde < PRIMER_MES ? PRIMER_MES : desde,
    hasta: hasta > ULTIMO_MES ? ULTIMO_MES : hasta,
  };
}).filter((p) => p.desde <= p.hasta);

// Provincias: nombre del registro → nombre del mapa y rótulo
const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const PROV_MAPA = { 'PROVINCIA DE BUENOS AIRES': 'BUENOS AIRES', 'CAPITAL FEDERAL': 'CIUDAD AUTONOMA DE BUENOS AIRES' };
const provMapa = (p) => PROV_MAPA[p] || sinAcentos(p || '');
const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y']);
const rotuloProv = (p) => {
  if (p === 'CAPITAL FEDERAL') return 'CABA';
  const s = p === 'PROVINCIA DE BUENOS AIRES' ? 'BUENOS AIRES' : (p || 'Sin provincia');
  return s.toLowerCase().split(' ').map((w, i) => (
    i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
  )).join(' ');
};
const rotuloCamara = (c) => (c === 'INDEPENDIENTE' ? 'Independientes' : c || 'Sin cámara');

const mesesEntre = (desde, hasta) => MESES.filter((m) => m >= desde && m <= hasta);
const trimestreDe = (m) => Math.ceil(Number(m.slice(5, 7)) / 3);
const semestreDe = (m) => (Number(m.slice(5, 7)) <= 6 ? 1 : 2);

// ---------------------------------------------------------------- mapa

const { lon_min, lat_max, kx, ky } = mapa.proyeccion;
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const MERC_TOP = merc(lat_max);
const proyectar = (lng, lat) => [(lng - lon_min) * kx, (MERC_TOP - merc(lat)) * ky];
const CAJA_PROVINCIA = new Map(mapa.provincias.map((p) => {
  const nums = p.path.match(/-?\d+(?:\.\d+)?/g).map(Number);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i], y = nums[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [p.nombre, [x0, y0, x1, y1]];
}));
// Dónde va la torta de cada provincia (lat, lng): adentro de la provincia y
// separadas entre sí; las que no figuran usan el centro de su caja
const ANCLA_TORTA = {
  'SANTA FE': [-30.3, -61.7], 'ENTRE RIOS': [-32.4, -58.6], 'BUENOS AIRES': [-36.7, -59.6],
  'CIUDAD AUTONOMA DE BUENOS AIRES': [-34.6, -58.4], CORDOBA: [-32.0, -64.0], 'SAN LUIS': [-33.9, -66.3],
  'LA PAMPA': [-37.3, -65.6], 'SANTIAGO DEL ESTERO': [-27.9, -63.3], TUCUMAN: [-27.0, -65.4],
  NEUQUEN: [-38.7, -69.8], CHACO: [-26.3, -60.6],
};
const centroTorta = (nombreMapa) => {
  const a = ANCLA_TORTA[nombreMapa];
  if (a) return proyectar(a[1], a[0]);
  const c = CAJA_PROVINCIA.get(nombreMapa);
  return c ? [(c[0] + c[2]) / 2, (c[1] + c[3]) / 2] : null;
};

// ---------------------------------------------------------------- treemap

/** Treemap "squarified": reparte `items` ({v, …}, ordenados de mayor a menor) en el rectángulo dado. */
function squarify(items, x, y, w, h) {
  const total = items.reduce((s, i) => s + i.v, 0);
  if (!total || w <= 0 || h <= 0) return [];
  const escala = (w * h) / total;
  const out = [];
  let rx = x, ry = y, rw = w, rh = h;
  let fila = [];
  const peor = (f, lado) => {
    const s = f.reduce((a, b) => a + b.v * escala, 0);
    let max = 0, min = Infinity;
    for (const i of f) { const a = i.v * escala; if (a > max) max = a; if (a < min) min = a; }
    return Math.max((lado * lado * max) / (s * s), (s * s) / (lado * lado * min));
  };
  const volcar = (f) => {
    const s = f.reduce((a, b) => a + b.v * escala, 0);
    if (rw >= rh) {
      const ancho = s / rh;
      let off = 0;
      for (const i of f) { const alto = (i.v * escala) / ancho; out.push({ ...i, x: rx, y: ry + off, w: ancho, h: alto }); off += alto; }
      rx += ancho; rw -= ancho;
    } else {
      const alto = s / rw;
      let off = 0;
      for (const i of f) { const ancho = (i.v * escala) / alto; out.push({ ...i, x: rx + off, y: ry, w: ancho, h: alto }); off += ancho; }
      ry += alto; rh -= alto;
    }
  };
  for (const it of items) {
    if (it.v <= 0) continue;
    const lado = Math.min(rw, rh);
    if (!fila.length || peor([...fila, it], lado) <= peor(fila, lado)) fila.push(it);
    else { volcar(fila); fila = [it]; }
  }
  if (fila.length) volcar(fila);
  return out;
}

function useAncho(ref) {
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setAncho(el.clientWidth));
    ro.observe(el);
    setAncho(el.clientWidth);
    return () => ro.disconnect();
  }, [ref]);
  return ancho;
}

// ---------------------------------------------------------------- componente

export default function ComprasCupo({ seccion }) {
  const { theme } = useTheme();
  const [anio, setAnio] = useState(ANIOS[0]);
  const [presidencia, setPresidencia] = useState('');
  // Filtros: se guardan los valores DESTILDADOS, así una provincia, cámara o
  // grupo que aparece al cambiar el período entra tildado
  const [excl, setExcl] = useState({ provincias: new Set(), categorias: new Set(), camaras: new Set(), grupos: new Set() });
  const [sel, setSel] = useState(null); // { petrolera, desde, hasta, rotulo } desde la tabla

  // Ventana del período
  const periodo = useMemo(() => {
    const p = PERIODOS_PRESIDENCIA.find((q) => q.id === presidencia);
    if (p) return { desde: p.desde, hasta: p.hasta, rotulo: `${p.nombre} · ${fmt.monthShort(p.desde)} a ${fmt.monthShort(p.hasta)}`, semestres: true };
    const hasta = anio === ULTIMO_MES.slice(0, 4) ? ULTIMO_MES : `${anio}-12`;
    return { desde: `${anio}-01`, hasta, rotulo: anio, semestres: false };
  }, [anio, presidencia]);
  const elegirAnio = (a) => { setAnio(a); setPresidencia(''); setSel(null); };
  const elegirPresidencia = (id) => { setPresidencia(id); setSel(null); };

  // Ventas de la ventana con los atributos de cada elaboradora
  const ventanaVentas = useMemo(() => {
    const iDesde = MESES.indexOf(periodo.desde);
    const iHasta = MESES.indexOf(periodo.hasta);
    return VENTAS.filter((v) => v[0] >= iDesde && v[0] <= iHasta);
  }, [periodo]);

  // Opciones de los filtros: lo que hay en la ventana
  const opciones = useMemo(() => {
    const prov = new Set(), cam = new Set(), grp = new Set();
    for (const v of ventanaVentas) {
      const a = atrib(v[1]);
      prov.add(a.provincia || '');
      cam.add(a.camara || '');
      grp.add(holdingDe(v[1]));
    }
    const orden = (s) => [...s].sort((x, y) => x.localeCompare(y, 'es'));
    return { provincias: orden(prov), categorias: CATEGORIAS, camaras: orden(cam), grupos: orden(grp) };
  }, [ventanaVentas]);
  const tildadas = (k) => new Set(opciones[k].filter((o) => !excl[k].has(o)));
  const cambiar = (k) => (n) => {
    setExcl((prev) => ({ ...prev, [k]: new Set(opciones[k].filter((o) => !n.has(o))) }));
    setSel(null);
  };
  const resumen = (k, todas) => {
    const n = tildadas(k).size;
    const total = opciones[k].length;
    return n === total ? `${todas} (${total})` : n === 0 ? 'Ninguna' : `${n} de ${total}`;
  };

  // Ventas filtradas: la base de la tabla
  const base = useMemo(() => {
    const p = tildadas('provincias'), c = tildadas('categorias'), m = tildadas('camaras'), g = tildadas('grupos');
    return ventanaVentas.filter((v) => {
      const a = atrib(v[1]);
      return p.has(a.provincia || '') && c.has(a.categoria) && m.has(a.camara || '') && g.has(holdingDe(v[1]));
    });
  }, [ventanaVentas, excl, opciones]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tabla: petrolera × columna. En un año las columnas son los meses (con
  // años y trimestres arriba); en una presidencia, los semestres (con los
  // años arriba), así el mandato entero entra en la tabla (HDO, 12/10/2026).
  const tabla = useMemo(() => {
    const meses = mesesEntre(periodo.desde, periodo.hasta);
    const columnas = [];
    if (periodo.semestres) {
      for (const m of meses) {
        const k = `${m.slice(0, 4)}-S${semestreDe(m)}`;
        if (columnas.at(-1)?.key === k) columnas.at(-1).hasta = m;
        else columnas.push({ key: k, label: `S${semestreDe(m)}`, desde: m, hasta: m });
      }
    } else {
      for (const m of meses) columnas.push({ key: m, label: MESES_CORTOS[Number(m.slice(5, 7)) - 1], desde: m, hasta: m });
    }
    const colDe = new Map();
    columnas.forEach((c, i) => { for (const m of mesesEntre(c.desde, c.hasta)) colDe.set(m, i); });
    const porPet = new Map();
    const totalCol = columnas.map(() => 0);
    for (const v of base) {
      const ci = colDe.get(MESES[v[0]]);
      if (ci == null) continue;
      const p = PETROLERAS[v[2]];
      if (!porPet.has(p)) porPet.set(p, { petrolera: p, cols: columnas.map(() => 0), total: 0 });
      const f = porPet.get(p);
      f.cols[ci] += v[3];
      f.total += v[3];
      totalCol[ci] += v[3];
    }
    const filas = [...porPet.values()].filter((f) => f.total > UMBRAL_PETROLERA).sort((a, b) => b.total - a.total);
    const total = totalCol.reduce((s, x) => s + x, 0);
    // Filas de encabezado sobre las columnas: años y, con meses, trimestres
    const agrupar = (clave, label) => {
      const out = [];
      for (const c of columnas) {
        const k = clave(c);
        if (out.at(-1)?.key === k) { out.at(-1).n += 1; out.at(-1).hasta = c.hasta; }
        else out.push({ key: k, label: label(c), n: 1, desde: c.desde, hasta: c.hasta });
      }
      return out;
    };
    const encabezados = [agrupar((c) => c.desde.slice(0, 4), (c) => c.desde.slice(0, 4))];
    if (!periodo.semestres) encabezados.push(agrupar((c) => `${c.desde.slice(0, 4)}-T${trimestreDe(c.desde)}`, (c) => `T${trimestreDe(c.desde)}`));
    return { columnas, filas, totalCol, total, encabezados };
  }, [base, periodo]);

  // Selección desde la tabla: alcance del treemap y del mapa
  const alcance = useMemo(() => ({
    petrolera: sel?.petrolera || null,
    desde: sel?.desde || periodo.desde,
    hasta: sel?.hasta || periodo.hasta,
  }), [sel, periodo]);
  const alternar = (nuevo) => {
    setSel((prev) => (
      prev && prev.petrolera === nuevo.petrolera && prev.desde === nuevo.desde && prev.hasta === nuevo.hasta
        ? null : nuevo
    ));
  };
  const rotuloRango = (desde, hasta) => (
    desde === hasta ? fmt.monthShort(desde)
      : desde.slice(0, 4) === hasta.slice(0, 4) && desde.slice(5) === '01' && (hasta.slice(5) === '12' || hasta === ULTIMO_MES) ? desde.slice(0, 4)
        : `${fmt.monthShort(desde)} a ${fmt.monthShort(hasta)}`
  );

  // Baldosas del treemap y tortas del mapa, dentro del alcance
  const detalle = useMemo(() => {
    const iDesde = MESES.indexOf(alcance.desde), iHasta = MESES.indexOf(alcance.hasta);
    const enRango = base.filter((v) => v[0] >= iDesde && v[0] <= iHasta);
    const porEmp = new Map(); // empresa → total a todas las petroleras (para el % de la empresa)
    const porPet = new Map(); // petrolera → total de todas las empresas (para el % de la petrolera)
    for (const v of enRango) {
      porEmp.set(v[1], (porEmp.get(v[1]) || 0) + v[3]);
      porPet.set(v[2], (porPet.get(v[2]) || 0) + v[3]);
    }
    const pi = alcance.petrolera ? PETROLERAS.indexOf(alcance.petrolera) : null;
    const celdas = new Map(); // empresa|petrolera → ton
    for (const v of enRango) {
      if (pi != null && v[2] !== pi) continue;
      const k = `${v[1]}|${v[2]}`;
      celdas.set(k, (celdas.get(k) || 0) + v[3]);
    }
    const hojas = [];
    for (const [k, ton] of celdas) {
      if (ton <= 0.5) continue;
      const [ei, pj] = k.split('|').map(Number);
      hojas.push({
        empresa: EMPRESAS[ei], holding: holdingDe(ei), petrolera: PETROLERAS[pj], v: ton,
        pEmp: ton / (porEmp.get(ei) || 1), pPet: ton / (porPet.get(pj) || 1),
        provincia: atrib(ei).provincia || '',
      });
    }
    const total = hojas.reduce((s, h) => s + h.v, 0);
    // Grupos del treemap: holding → hojas
    const grupos = new Map();
    for (const h of hojas) {
      if (!grupos.has(h.holding)) grupos.set(h.holding, { nombre: h.holding, v: 0, hojas: [] });
      const g = grupos.get(h.holding);
      g.v += h.v;
      g.hojas.push(h);
    }
    const gruposOrden = [...grupos.values()].sort((a, b) => b.v - a.v);
    for (const g of gruposOrden) g.hojas.sort((a, b) => b.v - a.v);
    // Provincias del mapa: provincia → total y holdings
    const provincias = new Map();
    for (const h of hojas) {
      if (!provincias.has(h.provincia)) provincias.set(h.provincia, { provincia: h.provincia, v: 0, holdings: new Map() });
      const p = provincias.get(h.provincia);
      p.v += h.v;
      p.holdings.set(h.holding, (p.holdings.get(h.holding) || 0) + h.v);
    }
    const provOrden = [...provincias.values()].map((p) => ({
      ...p, holdings: [...p.holdings.entries()].map(([nombre, v]) => ({ nombre, v })).sort((a, b) => b.v - a.v),
    })).sort((a, b) => b.v - a.v);
    return { hojas, total, grupos: gruposOrden, provincias: provOrden };
  }, [base, alcance]);

  const rotuloAlcance = sel
    ? [sel.petrolera, sel.desde ? rotuloRango(sel.desde, sel.hasta) : null].filter(Boolean).join(' · ')
    : null;
  const conCotab = periodo.desde <= '2022-11' && periodo.hasta >= '2022-06';

  return (
    <div className="mh-cuadro mz cc">
      <div className="mz-controles-sticky cc-controles">
        <p className="section-kicker">Mercado Biodiesel</p>
        <h2>{seccion?.title ?? 'Compras al cupo por petrolera'}</h2>
        {seccion?.intro && <p className="section-intro">{seccion.intro}</p>}
        <div className="cc-filtros">
          <div className="cc-filtro">
            <label htmlFor="cc-anio">Año</label>
            <select id="cc-anio" className="empresa-select" value={presidencia ? '' : anio} onChange={(e) => elegirAnio(e.target.value)}>
              {presidencia && <option value="">Elegir un año…</option>}
              {ANIOS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="cc-filtro">
            <label htmlFor="cc-presidencia">Presidencia</label>
            <select id="cc-presidencia" className="empresa-select" value={presidencia} onChange={(e) => elegirPresidencia(e.target.value)}>
              <option value="">Elegir una presidencia…</option>
              {PERIODOS_PRESIDENCIA.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} · {fmt.monthShort(p.desde)} a {fmt.monthShort(p.hasta)}</option>
              ))}
            </select>
          </div>
          <div className="cc-filtro">
            <span className="cc-filtro-label">Provincia</span>
            <DropdownMulti
              opciones={opciones.provincias} seleccion={tildadas('provincias')} onCambiar={cambiar('provincias')}
              resumen={resumen('provincias', 'Todas')} rotulo={rotuloProv} clase="cc-panel-prov"
            />
          </div>
          <div className="cc-filtro">
            <span className="cc-filtro-label">Categoría</span>
            <DropdownMulti
              opciones={opciones.categorias} seleccion={tildadas('categorias')} onCambiar={cambiar('categorias')}
              resumen={resumen('categorias', 'Todas')} rotulo={(c) => ETIQUETA_CAT[c]}
            />
          </div>
          <div className="cc-filtro">
            <span className="cc-filtro-label">Cámara</span>
            <DropdownMulti
              opciones={opciones.camaras} seleccion={tildadas('camaras')} onCambiar={cambiar('camaras')}
              resumen={resumen('camaras', 'Todas')} rotulo={rotuloCamara}
            />
          </div>
          <div className="cc-filtro">
            <span className="cc-filtro-label">Grupo económico</span>
            <DropdownMulti
              opciones={opciones.grupos} seleccion={tildadas('grupos')} onCambiar={cambiar('grupos')}
              resumen={resumen('grupos', 'Todos')} acciones={[['Todos', null], ['Ninguno', []]]} clase="cc-panel-grupos"
            />
          </div>
        </div>
      </div>

      <TablaPetroleras tabla={tabla} sel={sel} alternar={alternar} periodo={periodo} />
      <div className="cc-grilla">
        <Treemap detalle={detalle} tema={theme} rotuloAlcance={rotuloAlcance} soltar={() => setSel(null)} />
        <MapaProvincias detalle={detalle} tema={theme} rotuloAlcance={rotuloAlcance} />
      </div>
      <TablasGemelas detalle={detalle} />

      <p className="note">
        Fuente: Secretaría de Energía, reportes mensuales de biocombustibles - ventas de biodiesel al
        corte obligatorio (cupo) de cada elaboradora, abiertas por empresa petrolera compradora.
        Porcentajes de la tabla: participación de la petrolera en las compras del mes. En cada
        baldosa del treemap, los dos porcentajes son la parte de las ventas de la empresa que fue a
        esa petrolera y la parte de las compras de la petrolera que vino de esa empresa.
        {conCotab && ' Las compras de junio a noviembre de 2022 incluyen el COTAB (Res. 638/2022), que la fuente no abre por petrolera.'}
        {' '}No se listan petroleras con menos de {UMBRAL_PETROLERA} t en el período.
      </p>
    </div>
  );
}

/* ── Tabla petrolera × mes ─────────────────────────────────────────────── */

function TablaPetroleras({ tabla, sel, alternar, periodo }) {
  const { columnas, filas, totalCol, total, encabezados } = tabla;
  const esSel = (petrolera, desde, hasta) =>
    !!sel && sel.petrolera === petrolera && sel.desde === desde && sel.hasta === hasta;
  // Columna o encabezado dentro del período elegido en la tabla (sin petrolera)
  const claseCol = (desde, hasta = desde) => (sel && !sel.petrolera && sel.desde && hasta >= sel.desde && desde <= sel.hasta ? ' cc-col-sel' : '');
  const nivelClase = ['cc-th-anio', 'cc-th-trim'];
  const subtitulo = periodo.semestres
    ? 'toneladas y participación en el semestre · clic para acotar los gráficos'
    : 'toneladas y participación en el mes · clic para acotar los gráficos';
  const claseFila = (p) => (sel && sel.petrolera === p && !sel.desde ? ' cc-fila-sel' : '');
  const ninguna = filas.length === 0;
  return (
    <div className="cc-tabla-card">
      <div className="cc-titulo">
        <span className="chart-card-title">Compras de las petroleras · {periodo.rotulo}</span>
        <span className="chart-card-subtitle">{subtitulo}</span>
      </div>
      <div className="mh-tabla-scroll">
        <table className="mh-tabla mz-tabla cc-tabla">
          <thead>
            {encabezados.map((fila, nivel) => (
              <tr key={nivel}>
                {nivel === 0 && <th rowSpan={encabezados.length + 1} className="mz-fija">Petrolera</th>}
                {fila.map((g) => (
                  <th key={g.key} colSpan={g.n} className={`cc-th ${nivelClase[nivel]}${claseCol(g.desde, g.hasta)}`}>
                    <button type="button" aria-pressed={esSel(null, g.desde, g.hasta)} onClick={() => alternar({ petrolera: null, desde: g.desde, hasta: g.hasta })}>{g.label}</button>
                  </th>
                ))}
                {nivel === 0 && <th rowSpan={encabezados.length + 1} className="num cc-total-col">Total</th>}
              </tr>
            ))}
            <tr>
              {columnas.map((c) => (
                <th key={c.key} className={`num cc-th cc-th-mes${claseCol(c.desde, c.hasta)}`}>
                  <button type="button" aria-pressed={esSel(null, c.desde, c.hasta)} onClick={() => alternar({ petrolera: null, desde: c.desde, hasta: c.hasta })}>{c.label}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ninguna && (
              <tr><td className="mz-fija">Sin compras</td><td colSpan={columnas.length + 1} className="cc-vacio">No hay ventas de cupo con estos filtros en {periodo.rotulo}.</td></tr>
            )}
            {filas.map((f) => (
              <tr key={f.petrolera} className={claseFila(f.petrolera)}>
                <td className="mz-fija">
                  <button type="button" className="cc-pet" aria-pressed={esSel(f.petrolera, null, null)} onClick={() => alternar({ petrolera: f.petrolera, desde: null, hasta: null })}>
                    {f.petrolera}
                  </button>
                </td>
                {f.cols.map((v, i) => {
                  const c = columnas[i];
                  return (
                    <td key={c.key} className={`num${claseCol(c.desde, c.hasta)}`}>
                      {v > 0.5 ? (
                        <button
                          type="button" className={`cc-celda${esSel(f.petrolera, c.desde, c.hasta) ? ' cc-sel' : ''}`}
                          aria-pressed={esSel(f.petrolera, c.desde, c.hasta)}
                          onClick={() => alternar({ petrolera: f.petrolera, desde: c.desde, hasta: c.hasta })}
                          title={`${f.petrolera} · ${c.desde === c.hasta ? fmt.monthShort(c.desde) : `${fmt.monthShort(c.desde)} a ${fmt.monthShort(c.hasta)}`}`}
                        >
                          <span className="cc-ton">{fmt.int(v)}</span>
                          <span className="cc-pct">{totalCol[i] > 0 ? pct0((v / totalCol[i]) * 100) : ''}</span>
                        </button>
                      ) : <span className="cc-celda cc-celda-vacia" />}
                    </td>
                  );
                })}
                <td className="num cc-total-col">
                  <button type="button" className={`cc-celda${esSel(f.petrolera, null, null) ? ' cc-sel' : ''}`} aria-pressed={esSel(f.petrolera, null, null)} onClick={() => alternar({ petrolera: f.petrolera, desde: null, hasta: null })}>
                    <span className="cc-ton">{fmt.int(f.total)}</span>
                    <span className="cc-pct">{total > 0 ? pct0((f.total / total) * 100) : ''}</span>
                  </button>
                </td>
              </tr>
            ))}
            {!ninguna && (
              <tr className="mz-total">
                <td className="mz-fija">Total</td>
                {totalCol.map((v, i) => (
                  <td key={columnas[i].key} className={`num${claseCol(columnas[i].desde, columnas[i].hasta)}`}>
                    <span className="cc-celda"><span className="cc-ton">{v > 0.5 ? fmt.int(v) : ''}</span><span className="cc-pct">{v > 0.5 ? '100%' : ''}</span></span>
                  </td>
                ))}
                <td className="num cc-total-col">
                  <span className="cc-celda"><span className="cc-ton">{fmt.int(total)}</span><span className="cc-pct">100%</span></span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Treemap elaboradora × petrolera, color por grupo ──────────────────── */

const ALTO_TREEMAP = 520;
const SEP = 2; // px de fondo entre baldosas (guía dataviz)

function Treemap({ detalle, tema, rotuloAlcance, soltar }) {
  const ref = useRef(null);
  const ancho = useAncho(ref);
  const [hover, setHover] = useState(null); // { hoja, x, y }
  const { grupos, total } = detalle;

  const baldosas = useMemo(() => {
    if (!ancho || !grupos.length) return [];
    // (squarify devuelve x/y/w/h: el grupo y la hoja viajan con otros nombres)
    const marcos = squarify(grupos.map((g) => ({ v: g.v, grupo: g })), 0, 0, ancho, ALTO_TREEMAP);
    const out = [];
    for (const m of marcos) {
      const hojas = squarify(m.grupo.hojas.map((h) => ({ v: h.v, hoja: h })), m.x + SEP / 2, m.y + SEP / 2, Math.max(0, m.w - SEP), Math.max(0, m.h - SEP));
      for (const b of hojas) out.push(b);
    }
    return out;
  }, [ancho, grupos]);

  const posicion = (e) => {
    const box = ref.current?.getBoundingClientRect();
    return box ? { x: e.clientX - box.left, y: e.clientY - box.top } : null;
  };
  const derecha = hover && ancho && hover.x > ancho * 0.55;

  const colorDe = (holding) => colorHolding(holding, tema);
  return (
    <div className="chart-card cc-treemap-card">
      <div className="cc-titulo">
        <span className="chart-card-title">Quién le vendió a quién</span>
        <span className="chart-card-subtitle">
          {rotuloAlcance ? <>mostrando <strong>{rotuloAlcance}</strong> <button type="button" className="cc-soltar" onClick={soltar}>✕ ver todo</button></> : 'cada baldosa es una elaboradora y la petrolera a la que le vendió; el tamaño, las toneladas; el color, el grupo económico'}
        </span>
      </div>
      <div className="cc-treemap" ref={ref} style={{ height: ALTO_TREEMAP }}>
        {ancho > 0 && (
          baldosas.length ? (
            <svg width={ancho} height={ALTO_TREEMAP} role="img" aria-label="Treemap de ventas de cupo por elaboradora y petrolera">
              {baldosas.map((b) => {
                const { hoja } = b;
                const fondo = colorDe(hoja.holding);
                const tinta = textoSobre(fondo);
                const w = Math.max(0, b.w - SEP), h = Math.max(0, b.h - SEP);
                const lineas = h >= 60 && w >= 96 ? 4 : h >= 32 && w >= 70 ? 2 : h >= 16 && w >= 40 ? 1 : 0;
                const maxChars = Math.max(3, Math.floor(w / 6.4));
                const titulo = hoja.holding === hoja.empresa ? hoja.empresa : `${hoja.holding} - ${hoja.empresa}`;
                return (
                  <g
                    key={`${hoja.empresa}|${hoja.petrolera}`}
                    tabIndex={0}
                    aria-label={`${titulo}, ${hoja.petrolera}: ${fmt.int(hoja.v)} toneladas`}
                    onMouseMove={(e) => { const p = posicion(e); if (p) setHover({ hoja, ...p }); }}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover({ hoja, x: b.x + w / 2, y: b.y + h / 2 })}
                    onBlur={() => setHover(null)}
                  >
                    <rect x={b.x + SEP / 2} y={b.y + SEP / 2} width={w} height={h} fill={fondo} rx={2} />
                    {lineas >= 1 && (
                      <text x={b.x + SEP / 2 + 6} y={b.y + SEP / 2 + 14} fill={tinta} fontSize={11} fontWeight={700}>
                        {fmt.truncate(titulo, maxChars)}
                      </text>
                    )}
                    {lineas >= 2 && (
                      <text x={b.x + SEP / 2 + 6} y={b.y + SEP / 2 + 27} fill={tinta} fontSize={10} opacity={0.9}>
                        {fmt.truncate(hoja.petrolera, maxChars)}
                      </text>
                    )}
                    {lineas >= 4 && (
                      <>
                        <text x={b.x + SEP / 2 + 6} y={b.y + SEP / 2 + 41} fill={tinta} fontSize={10.5} fontWeight={600}>
                          {fmt.int(hoja.v)} t
                        </text>
                        <text x={b.x + SEP / 2 + 6} y={b.y + SEP / 2 + 54} fill={tinta} fontSize={10} opacity={0.9}>
                          {pct0(hoja.pEmp * 100)} · {pct0(hoja.pPet * 100)}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
          ) : <p className="cc-vacio">Sin ventas de cupo en esta selección.</p>
        )}
        {hover && (
          <div className={`cc-tooltip ${derecha ? 'izquierda' : ''}`} style={{ left: hover.x, top: hover.y }}>
            <div className="cc-tooltip-titulo">{hover.hoja.empresa}</div>
            {hover.hoja.holding !== hover.hoja.empresa && <div className="cc-tooltip-sub">{hover.hoja.holding}</div>}
            <div className="cc-tooltip-fila"><span>Petrolera</span><strong>{hover.hoja.petrolera}</strong></div>
            <div className="cc-tooltip-fila"><span>Ventas de cupo</span><strong>{fmt.int(hover.hoja.v)} t</strong></div>
            <div className="cc-tooltip-fila"><span>De lo que vendió la empresa</span><strong>{pct0(hover.hoja.pEmp * 100)}</strong></div>
            <div className="cc-tooltip-fila"><span>De lo que compró la petrolera</span><strong>{pct0(hover.hoja.pPet * 100)}</strong></div>
            <div className="cc-tooltip-fila"><span>Del total mostrado</span><strong>{pct0((hover.hoja.v / (total || 1)) * 100)}</strong></div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Mapa: una torta por provincia, gajos por grupo ────────────────────── */

const R_MIN = 6, R_MAX = 42; // radio de las tortas en unidades del mapa

function arco(cx, cy, r, a0, a1) {
  // sector de círculo de a0 a a1 (radianes, desde arriba, horario)
  if (a1 - a0 >= 2 * Math.PI - 1e-6) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  }
  const x0 = cx + r * Math.sin(a0), y0 = cy - r * Math.cos(a0);
  const x1 = cx + r * Math.sin(a1), y1 = cy - r * Math.cos(a1);
  const grande = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${grande} 1 ${x1} ${y1} Z`;
}

/**
 * Mapa con una torta por provincia. Al pasar por un gajo se ve ese grupo
 * solo; al pasar por la provincia (fuera de la torta) se ven todos sus
 * grupos (pedido HDO, 12/10/2026).
 */
function MapaProvincias({ detalle, tema, rotuloAlcance }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null); // { prov, holding | null, x, y }
  const { provincias, total } = detalle;

  // Encuadre: las provincias con ventas (o el país) con un margen
  const tortas = provincias
    .map((p) => ({ ...p, mapa: provMapa(p.provincia), centro: centroTorta(provMapa(p.provincia)) }))
    .filter((p) => p.centro);
  const porMapa = new Map(tortas.map((p) => [p.mapa, p]));
  const cajas = tortas.map((p) => CAJA_PROVINCIA.get(p.mapa)).filter(Boolean);
  let vb = mapa.viewBox.split(' ').map(Number);
  if (cajas.length) {
    const x0 = Math.min(...cajas.map((c) => c[0])), y0 = Math.min(...cajas.map((c) => c[1]));
    const x1 = Math.max(...cajas.map((c) => c[2])), y1 = Math.max(...cajas.map((c) => c[3]));
    const w = x1 - x0, h = y1 - y0, m = Math.max(w, h) * 0.08 + R_MAX;
    vb = [x0 - m, y0 - m, w + 2 * m, h + 2 * m];
  }
  const posicion = (e) => {
    const box = ref.current?.getBoundingClientRect();
    return box ? { x: e.clientX - box.left, y: e.clientY - box.top } : null;
  };
  const mover = (prov, holding) => (e) => {
    const q = posicion(e);
    if (q) setHover({ prov, holding, ...q });
  };
  // El mapa va a la derecha de la página: el tooltip se abre hacia la izquierda enseguida
  const derecha = hover && ref.current && hover.x > ref.current.clientWidth * 0.4;
  const fuente = vb[2] / 40; // tamaño de letra en unidades del viewBox
  const gajoHover = hover?.holding ? hover.prov.holdings.find((h) => h.nombre === hover.holding) : null;

  return (
    <div className="chart-card cc-mapa-card">
      <div className="cc-titulo">
        <span className="chart-card-title">De qué provincias sale</span>
        <span className="chart-card-subtitle">{rotuloAlcance ? <>mostrando <strong>{rotuloAlcance}</strong></> : 'tamaño: participación de la provincia · gajos: grupo económico'}</span>
      </div>
      <div className="cc-mapa" ref={ref}>
        <svg viewBox={vb.join(' ')} role="img" aria-label="Mapa de ventas de cupo por provincia">
          {(mapa.vecinos || []).map((v) => (
            <path key={v.nombre} className="cc-vecino" d={v.path} vectorEffect="non-scaling-stroke" />
          ))}
          {mapa.provincias.map((p) => {
            const datos = porMapa.get(p.nombre);
            return (
              <path
                key={p.nombre} className={`cc-prov${datos ? ' con-ventas' : ''}${hover && !hover.holding && hover.prov.mapa === p.nombre ? ' activa' : ''}`}
                d={p.path} vectorEffect="non-scaling-stroke"
                onMouseMove={datos ? mover(datos, null) : undefined}
                onMouseLeave={datos ? () => setHover(null) : undefined}
              />
            );
          })}
          {tortas.map((p) => {
            const [cx, cy] = p.centro;
            const share = total > 0 ? p.v / total : 0;
            const r = R_MIN + (R_MAX - R_MIN) * Math.sqrt(share);
            let a = 0;
            const gajos = p.holdings.map((h) => {
              const a0 = a;
              a += (h.v / p.v) * 2 * Math.PI;
              return { ...h, d: arco(cx, cy, r, a0, a) };
            });
            return (
              <g
                key={p.provincia} className="cc-torta" tabIndex={0}
                aria-label={`${rotuloProv(p.provincia)}: ${fmt.int(p.v)} toneladas, ${pct0(share * 100)} del total`}
                onFocus={() => setHover({ prov: p, holding: null, x: 20, y: 20 })}
                onBlur={() => setHover(null)}
              >
                {gajos.map((g) => (
                  <path
                    key={g.nombre} d={g.d} fill={colorHolding(g.nombre, tema)}
                    className={`cc-gajo${hover?.holding === g.nombre && hover.prov === p ? ' activo' : ''}`}
                    vectorEffect="non-scaling-stroke"
                    onMouseMove={mover(p, g.nombre)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <title>{`${g.nombre}: ${fmt.int(g.v)} t · ${pct0((g.v / p.v) * 100)} de ${rotuloProv(p.provincia)}`}</title>
                  </path>
                ))}
                {(() => {
                  // Cajita de rótulo (como las etiquetas del Tableau): dos líneas,
                  // ancho estimado por la cantidad de caracteres
                  const l1 = rotuloProv(p.provincia);
                  const l2 = `${fmt.int(p.v)} t · ${pct0(share * 100)}`;
                  const w = Math.max(l1.length * 0.64, l2.length * 0.58) * fuente + fuente * 1.4;
                  const h = fuente * 2.75;
                  const y0 = cy + r + fuente * 0.45;
                  return (
                    <g className="cc-mapa-rotulo">
                      <rect x={cx - w / 2} y={y0} width={w} height={h} rx={fuente * 0.35} className="cc-mapa-rotulo-caja" />
                      <text x={cx} y={y0 + fuente * 1.15} textAnchor="middle" style={{ fontSize: fuente }}>
                        <tspan x={cx} className="fuerte">{l1}</tspan>
                        <tspan x={cx} dy={fuente * 1.2}>{l2}</tspan>
                      </text>
                    </g>
                  );
                })()}
              </g>
            );
          })}
        </svg>
        {!tortas.length && <p className="cc-vacio cc-vacio-mapa">Sin ventas de cupo en esta selección.</p>}
        {hover && (
          <div className={`cc-tooltip ${derecha ? 'izquierda' : ''}`} style={{ left: hover.x, top: hover.y }}>
            {gajoHover ? (
              <>
                <div className="cc-tooltip-titulo"><i className="cc-tooltip-swatch" style={{ background: colorHolding(gajoHover.nombre, tema) }} />{gajoHover.nombre}</div>
                <div className="cc-tooltip-sub">{rotuloProv(hover.prov.provincia)}</div>
                <div className="cc-tooltip-fila"><span>Ventas de cupo</span><strong>{fmt.int(gajoHover.v)} t</strong></div>
                <div className="cc-tooltip-fila"><span>De la provincia</span><strong>{pct0((gajoHover.v / hover.prov.v) * 100)}</strong></div>
                <div className="cc-tooltip-fila"><span>Del total mostrado</span><strong>{pct0((gajoHover.v / (total || 1)) * 100)}</strong></div>
              </>
            ) : (
              <>
                <div className="cc-tooltip-titulo">{rotuloProv(hover.prov.provincia)}</div>
                <div className="cc-tooltip-fila"><span>Ventas de cupo</span><strong>{fmt.int(hover.prov.v)} t · {pct0((hover.prov.v / (total || 1)) * 100)}</strong></div>
                <div className="cc-tooltip-sep" />
                {hover.prov.holdings.map((h) => (
                  <div key={h.nombre} className="cc-tooltip-fila">
                    <span><i className="cc-tooltip-swatch" style={{ background: colorHolding(h.nombre, tema) }} />{h.nombre}</span>
                    <strong>{fmt.int(h.v)} t · {pct0((h.v / hover.prov.v) * 100)}</strong>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Un solo "Ver como tabla": las dos tablas gemelas, lado a lado ─────── */

function TablasGemelas({ detalle }) {
  const { grupos, provincias, total } = detalle;
  return (
    <details className="cc-detalle">
      <summary>Ver como tabla</summary>
      <div className="cc-tablas-gemelas">
        <div>
          <div className="cc-tabla-gemela-titulo">Quién le vendió a quién</div>
          <div className="mh-tabla-scroll">
            <table className="mh-tabla cc-tabla-detalle">
              <thead>
                <tr><th>Grupo económico</th><th>Elaboradora</th><th>Petrolera</th><th className="num">Toneladas</th><th className="num">De la empresa</th><th className="num">De la petrolera</th></tr>
              </thead>
              <tbody>
                {grupos.flatMap((g) => g.hojas.map((h) => (
                  <tr key={`${h.empresa}|${h.petrolera}`}>
                    <td>{h.holding}</td><td>{h.empresa}</td><td>{h.petrolera}</td>
                    <td className="num">{fmt.int(h.v)}</td><td className="num">{pct0(h.pEmp * 100)}</td><td className="num">{pct0(h.pPet * 100)}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="cc-tabla-gemela-titulo">De qué provincias sale</div>
          <div className="mh-tabla-scroll">
            <table className="mh-tabla cc-tabla-detalle">
              <thead>
                <tr><th>Provincia</th><th>Grupo económico</th><th className="num">Toneladas</th><th className="num">De la provincia</th><th className="num">Del total</th></tr>
              </thead>
              <tbody>
                {provincias.flatMap((p) => p.holdings.map((h) => (
                  <tr key={`${p.provincia}|${h.nombre}`}>
                    <td>{rotuloProv(p.provincia)}</td><td>{h.nombre}</td>
                    <td className="num">{fmt.int(h.v)}</td><td className="num">{pct0((h.v / p.v) * 100)}</td><td className="num">{pct0((h.v / (total || 1)) * 100)}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </details>
  );
}
