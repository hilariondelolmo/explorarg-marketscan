import { useEffect, useMemo, useRef, useState } from 'react';
import comprasData from '../../data/compras_cupo.json';
import empresasData from '../../data/empresas.json';
import mapa from '../../data/mapa_argentina.json';
import { PRESIDENCIAS } from '../../lib/gestiones.js';
import { fmt } from '../../lib/format.js';
import { useTheme } from '../../lib/theme.jsx';
import { colorHolding, colorPetrolera, textoSobre } from './coloresComprasCupo.js';
import DropdownMulti from './DropdownMulti.jsx';
import './Mercado.css';

/**
 * Compras al cupo por petrolera (vista 'compras', /mercado/compras-cupo) y
 * Ventas al cupo por elaboradora (vista 'ventas', /mercado/ventas-cupo):
 * réplicas de los dashboards EXPLORA QS BUYER (3) y EXPLORA QS SELLER del
 * libro Tableau 02 MERCADO INTERNO BIODIESEL, con los datos del sitio
 * (compras_cupo.json: ventas de cupo de cada elaboradora a cada petrolera,
 * mes a mes; atributos de la elaboradora en empresas.json).
 *
 * Las dos vistas comparten los filtros, la tabla de columnas por período, el
 * treemap, el mapa y las tablas gemelas:
 *  - compras: la tabla lista petroleras; el treemap agrupa y colorea por
 *    grupo económico; las tortas del mapa se parten por grupo;
 *  - ventas: la tabla lista grupos económicos, cada uno con sus petroleras
 *    y, desplegado, sus elaboradoras; el treemap agrupa y colorea por
 *    petrolera; las tortas del mapa se parten por petrolera.
 * Un clic en la tabla (fila, encabezado de período o celda) acota el treemap
 * y el mapa a esa selección; otro clic la suelta.
 *
 * Decisiones (HDO, 12/10/2026): categorías del sitio (integrada / no
 * integrada / comercializadora) y grupos del sitio; segundo porcentaje de la
 * baldosa = participación del vendedor dentro de lo que compró esa
 * petrolera; filas ordenadas por el total del período; el COTAB de 2022
 * queda adentro (la fuente no lo abre por petrolera); umbral de 10 t; con
 * Presidencia la tabla se abre por semestre.
 */

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                      'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const CATEGORIAS = ['INTEGRADA', 'NO INTEGRADA', 'COMERCIALIZADORA'];
const ETIQUETA_CAT = {
  INTEGRADA: 'Integradas',
  'NO INTEGRADA': 'No integradas',
  COMERCIALIZADORA: 'Comercializadoras',
};
const UMBRAL = 10; // t en el período: por debajo la fila no se lista (regla del Tableau)
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

// Textos propios de cada vista
const TEXTOS = {
  compras: {
    tabla: 'Compras de las petroleras',
    tablaSub: (sem) => `toneladas y participación en el ${sem ? 'semestre' : 'mes'} · clic para acotar los gráficos`,
    treemap: 'Quién le vendió a quién',
    treemapSub: 'cada baldosa es una elaboradora y la petrolera a la que le vendió; el tamaño, las toneladas; el color, el grupo económico',
    mapaSub: 'tamaño: participación de la provincia · gajos: grupo económico',
    parte: 'Grupo económico',
    nota: 'Porcentajes de la tabla: participación de la petrolera en las compras del período. En cada baldosa del treemap, los dos porcentajes son la parte de las ventas de la empresa que fue a esa petrolera y la parte de las compras de la petrolera que vino de esa empresa.',
  },
  ventas: {
    tabla: 'Ventas de las elaboradoras',
    tablaSub: (sem) => `toneladas y participación en el ${sem ? 'semestre' : 'mes'} por grupo económico y, desplegado, por elaboradora · clic para acotar los gráficos`,
    treemap: 'A quién le vendió cada uno',
    treemapSub: 'cada baldosa es un grupo económico (o la elaboradora elegida) y la petrolera a la que le vendió; el tamaño, las toneladas; el color, la petrolera',
    mapaSub: 'tamaño: participación de la provincia · gajos: petrolera compradora',
    parte: 'Petrolera',
    nota: 'Porcentajes de la tabla: participación del grupo económico o de la elaboradora en las ventas de cupo del período. En cada baldosa del treemap, los dos porcentajes son la parte de las ventas del vendedor que fue a esa petrolera y la parte de las compras de la petrolera que vino de ese vendedor.',
  },
};

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

// Columnas de la tabla según el período: meses (con años y trimestres
// arriba) en un año; semestres (con los años arriba) en una presidencia
function construirColumnas(periodo) {
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
  return { columnas, colDe, encabezados };
}


// ---------------------------------------------------------------- componente

export default function ComprasCupo({ seccion, vista = 'compras' }) {
  const ventas = vista === 'ventas';
  const T = TEXTOS[vista];
  const { theme } = useTheme();
  const [anio, setAnio] = useState(ANIOS[0]);
  const [presidencia, setPresidencia] = useState('');
  // Filtros: se guardan los valores DESTILDADOS, así una provincia, cámara o
  // grupo que aparece al cambiar el período entra tildado
  const [excl, setExcl] = useState({ provincias: new Set(), categorias: new Set(), camaras: new Set(), grupos: new Set() });
  // Selección desde la tabla: { petrolera, grupo, empresa, desde, hasta } (campos en null si no aplican)
  const [sel, setSel] = useState(null);

  // Ventana del período
  const periodo = useMemo(() => {
    const p = PERIODOS_PRESIDENCIA.find((q) => q.id === presidencia);
    if (p) return { desde: p.desde, hasta: p.hasta, rotulo: `${p.nombre} · ${fmt.monthShort(p.desde)} a ${fmt.monthShort(p.hasta)}`, semestres: true };
    const hasta = anio === ULTIMO_MES.slice(0, 4) ? ULTIMO_MES : `${anio}-12`;
    return { desde: `${anio}-01`, hasta, rotulo: anio, semestres: false };
  }, [anio, presidencia]);
  const elegirAnio = (a) => { setAnio(a); setPresidencia(''); setSel(null); };
  const elegirPresidencia = (id) => { setPresidencia(id); setSel(null); };

  // Ventas de la ventana
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

  // Tabla. Compras: una fila por petrolera. Ventas: una fila por grupo
  // económico y, desplegado, sus elaboradoras (las petroleras no van en la
  // tabla: se ven en el treemap y el mapa al elegir una fila - HDO).
  const tabla = useMemo(() => {
    const { columnas, colDe, encabezados } = construirColumnas(periodo);
    const cero = () => columnas.map(() => 0);
    const totalCol = cero();
    const porPet = new Map();
    const grupos = new Map();
    for (const v of base) {
      const ci = colDe.get(MESES[v[0]]);
      if (ci == null) continue;
      const t = v[3];
      totalCol[ci] += t;
      if (ventas) {
        const h = holdingDe(v[1]), e = EMPRESAS[v[1]];
        if (!grupos.has(h)) grupos.set(h, { nombre: h, cols: cero(), total: 0, emps: new Map() });
        const g = grupos.get(h);
        g.cols[ci] += t; g.total += t;
        if (!g.emps.has(e)) g.emps.set(e, { nombre: e, cols: cero(), total: 0 });
        const ge = g.emps.get(e); ge.cols[ci] += t; ge.total += t;
      } else {
        const p = PETROLERAS[v[2]];
        if (!porPet.has(p)) porPet.set(p, { nombre: p, cols: cero(), total: 0 });
        const fp = porPet.get(p);
        fp.cols[ci] += t; fp.total += t;
      }
    }
    const total = totalCol.reduce((s, x) => s + x, 0);
    const lista = (m) => [...m.values()].filter((f) => f.total > UMBRAL).sort((a, b) => b.total - a.total);
    const filasPet = lista(porPet);
    const filasGrupo = lista(grupos).map((g) => ({ ...g, emps: lista(g.emps) }));
    return { columnas, encabezados, totalCol, total, filasPet, filasGrupo };
  }, [base, periodo, ventas]);

  // Selección desde la tabla: alcance del treemap y del mapa
  const alcance = useMemo(() => ({
    petrolera: sel?.petrolera || null,
    grupo: sel?.grupo || null,
    empresa: sel?.empresa || null,
    desde: sel?.desde || periodo.desde,
    hasta: sel?.hasta || periodo.hasta,
  }), [sel, periodo]);
  const alternar = (nuevo) => {
    const n = { petrolera: null, grupo: null, empresa: null, desde: null, hasta: null, ...nuevo };
    setSel((prev) => (
      prev && ['petrolera', 'grupo', 'empresa', 'desde', 'hasta'].every((k) => prev[k] === n[k]) ? null : n
    ));
  };
  const rotuloRango = (desde, hasta) => (
    desde === hasta ? fmt.monthShort(desde)
      : desde.slice(0, 4) === hasta.slice(0, 4) && desde.slice(5) === '01' && (hasta.slice(5) === '12' || hasta === ULTIMO_MES) ? desde.slice(0, 4)
        : `${fmt.monthShort(desde)} a ${fmt.monthShort(hasta)}`
  );

  // Baldosas del treemap, tortas del mapa y tablas gemelas, dentro del alcance
  const detalle = useMemo(() => {
    const iDesde = MESES.indexOf(alcance.desde), iHasta = MESES.indexOf(alcance.hasta);
    const pi = alcance.petrolera ? PETROLERAS.indexOf(alcance.petrolera) : null;
    const enRango = base.filter((v) => (
      v[0] >= iDesde && v[0] <= iHasta
      && (!alcance.grupo || holdingDe(v[1]) === alcance.grupo)
      && (!alcance.empresa || EMPRESAS[v[1]] === alcance.empresa)
    ));
    // En ventas el treemap va por grupo económico, salvo que se haya elegido
    // una elaboradora; en compras siempre por elaboradora
    const porGrupo = ventas && !alcance.empresa;
    const vendedorDe = (ei) => (porGrupo ? holdingDe(ei) : EMPRESAS[ei]);
    const porVend = new Map(); // vendedor → total a todas las petroleras
    const porPet = new Map();  // petrolera → total de todos los vendedores
    for (const v of enRango) {
      const k = vendedorDe(v[1]);
      porVend.set(k, (porVend.get(k) || 0) + v[3]);
      porPet.set(v[2], (porPet.get(v[2]) || 0) + v[3]);
    }
    // Hojas a nivel elaboradora (mapa, tablas gemelas) y a nivel del treemap
    const celdasEmp = new Map(), celdasTm = new Map();
    for (const v of enRango) {
      if (pi != null && v[2] !== pi) continue;
      const ke = `${v[1]}|${v[2]}`;
      celdasEmp.set(ke, (celdasEmp.get(ke) || 0) + v[3]);
      const kt = `${vendedorDe(v[1])}|${v[2]}`;
      celdasTm.set(kt, (celdasTm.get(kt) || 0) + v[3]);
    }
    const hojasEmp = [];
    for (const [k, ton] of celdasEmp) {
      if (ton <= 0.5) continue;
      const [ei, pj] = k.split('|').map(Number);
      hojasEmp.push({ empresa: EMPRESAS[ei], holding: holdingDe(ei), petrolera: PETROLERAS[pj], v: ton, provincia: atrib(ei).provincia || '' });
    }
    const total = hojasEmp.reduce((s, h) => s + h.v, 0);
    // Baldosas: vendedor × petrolera con los dos porcentajes
    const baldosas = [];
    for (const [k, ton] of celdasTm) {
      if (ton <= 0.5) continue;
      const [vendedor, pj] = k.split('|');
      const petrolera = PETROLERAS[Number(pj)];
      baldosas.push({
        vendedor, petrolera, v: ton,
        holding: porGrupo ? vendedor : (ATRIB.get(vendedor)?.grupo || vendedor),
        pVend: ton / (porVend.get(vendedor) || 1), pPet: ton / (porPet.get(Number(pj)) || 1),
      });
    }
    // Grupos del treemap: por grupo económico (compras) o por petrolera (ventas)
    const claveTm = (b) => (ventas ? b.petrolera : b.holding);
    const grupos = new Map();
    for (const b of baldosas) {
      const k = claveTm(b);
      if (!grupos.has(k)) grupos.set(k, { nombre: k, v: 0, hojas: [] });
      const g = grupos.get(k);
      g.v += b.v;
      g.hojas.push(b);
    }
    const gruposOrden = [...grupos.values()].sort((a, b) => b.v - a.v);
    for (const g of gruposOrden) g.hojas.sort((a, b) => b.v - a.v);
    // Tabla gemela izquierda: grupo → elaboradora → petrolera, con los porcentajes a nivel elaboradora
    const totEmp = new Map(), totPetEmp = new Map();
    for (const h of hojasEmp) {
      totEmp.set(h.empresa, (totEmp.get(h.empresa) || 0) + h.v);
      totPetEmp.set(h.petrolera, (totPetEmp.get(h.petrolera) || 0) + h.v);
    }
    const filasDetalle = [...hojasEmp]
      .map((h) => ({ ...h, pEmp: h.v / (totEmp.get(h.empresa) || 1), pPet: h.v / (totPetEmp.get(h.petrolera) || 1) }))
      .sort((a, b) => a.holding.localeCompare(b.holding, 'es') || a.empresa.localeCompare(b.empresa, 'es') || b.v - a.v);
    // Provincias del mapa: provincia → total y partes (grupo o petrolera)
    const clavePart = (h) => (ventas ? h.petrolera : h.holding);
    const provincias = new Map();
    for (const h of hojasEmp) {
      if (!provincias.has(h.provincia)) provincias.set(h.provincia, { provincia: h.provincia, v: 0, partes: new Map() });
      const p = provincias.get(h.provincia);
      p.v += h.v;
      p.partes.set(clavePart(h), (p.partes.get(clavePart(h)) || 0) + h.v);
    }
    const provOrden = [...provincias.values()].map((p) => ({
      ...p, partes: [...p.partes.entries()].map(([nombre, v]) => ({ nombre, v })).sort((a, b) => b.v - a.v),
    })).sort((a, b) => b.v - a.v);
    return { total, grupos: gruposOrden, provincias: provOrden, filasDetalle };
  }, [base, alcance, ventas]);

  const rotuloAlcance = sel
    ? [sel.empresa || sel.grupo, sel.petrolera, sel.desde ? rotuloRango(sel.desde, sel.hasta) : null].filter(Boolean).join(' · ')
    : null;
  const conCotab = periodo.desde <= '2022-11' && periodo.hasta >= '2022-06';
  const colorParte = (nombre) => (ventas ? colorPetrolera(nombre, theme) : colorHolding(nombre, theme));

  return (
    <div className="mh-cuadro mz cc">
      <div className="mz-controles-sticky cc-controles">
        <p className="section-kicker">Mercado Biodiesel</p>
        <h2>{seccion?.title ?? (ventas ? 'Ventas al cupo por elaboradora' : 'Compras al cupo por petrolera')}</h2>
        {seccion?.intro && <p className="section-intro">{seccion.intro}</p>}
        <div className="cc-filtros">
          <div className="cc-filtro">
            <label htmlFor={`cc-anio-${vista}`}>Año</label>
            <select id={`cc-anio-${vista}`} className="empresa-select" value={presidencia ? '' : anio} onChange={(e) => elegirAnio(e.target.value)}>
              {presidencia && <option value="">Elegir un año…</option>}
              {ANIOS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="cc-filtro">
            <label htmlFor={`cc-presidencia-${vista}`}>Presidencia</label>
            <select id={`cc-presidencia-${vista}`} className="empresa-select" value={presidencia} onChange={(e) => elegirPresidencia(e.target.value)}>
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

      <TablaCupo tabla={tabla} sel={sel} alternar={alternar} periodo={periodo} ventas={ventas} T={T} />
      <div className="cc-grilla">
        <Treemap detalle={detalle} ventas={ventas} colorParte={colorParte} rotuloAlcance={rotuloAlcance} soltar={() => setSel(null)} T={T} />
        <MapaProvincias detalle={detalle} colorParte={colorParte} rotuloAlcance={rotuloAlcance} T={T} />
      </div>
      <TablasGemelas detalle={detalle} T={T} />

      <p className="note">
        Fuente: Secretaría de Energía, reportes mensuales de biocombustibles - ventas de biodiesel al
        corte obligatorio (cupo) de cada elaboradora, abiertas por empresa petrolera compradora.
        {' '}{T.nota}
        {conCotab && ' Las ventas de junio a noviembre de 2022 incluyen el COTAB (Res. 638/2022), que la fuente no abre por petrolera.'}
        {' '}No se listan filas con menos de {UMBRAL} t en el período.
      </p>
    </div>
  );
}

/* ── Tabla por período: petroleras (compras) o grupos → petroleras → elaboradoras (ventas) ── */

function TablaCupo({ tabla, sel, alternar, periodo, ventas, T }) {
  const { columnas, encabezados, totalCol, total, filasPet, filasGrupo } = tabla;
  const [abiertos, setAbiertos] = useState(() => new Set());
  const alternarGrupo = (g) => setAbiertos((prev) => { const s = new Set(prev); if (s.has(g)) s.delete(g); else s.add(g); return s; });
  const mismo = (a, b) => ['petrolera', 'grupo', 'empresa', 'desde', 'hasta'].every((k) => (a?.[k] || null) === (b?.[k] || null));
  const esSel = (o) => !!sel && mismo(sel, o);
  // Columna o encabezado dentro del período elegido en la tabla (sin entidad)
  const claseCol = (desde, hasta = desde) => (sel && !sel.petrolera && !sel.grupo && !sel.empresa && sel.desde && hasta >= sel.desde && desde <= sel.hasta ? ' cc-col-sel' : '');
  const nivelClase = ['cc-th-anio', 'cc-th-trim'];
  const ninguna = ventas ? filasGrupo.length === 0 : filasPet.length === 0;

  // Una fila de la tabla: nombre fijo + celdas por columna + total. `ent` es
  // la entidad de la fila ({petrolera, grupo, empresa}); `den(i)` y `denTotal`
  // dan el denominador del porcentaje.
  const Fila = ({ ent, nombre, cols, totalFila, den, denTotal, clase, sangria, toggle }) => (
    <tr className={`${clase || ''}${esSel(ent) ? ' cc-fila-sel' : ''}`}>
      <td className={`mz-fija${sangria ? ` cc-sangria-${sangria}` : ''}`}>
        {toggle}
        <button type="button" className="cc-pet" aria-pressed={esSel(ent)} onClick={() => alternar(ent)}>{nombre}</button>
      </td>
      {cols.map((v, i) => {
        const c = columnas[i];
        const o = { ...ent, desde: c.desde, hasta: c.hasta };
        return (
          <td key={c.key} className={`num${claseCol(c.desde, c.hasta)}`}>
            {v > 0.5 ? (
              <button
                type="button" className={`cc-celda${esSel(o) ? ' cc-sel' : ''}`} aria-pressed={esSel(o)}
                onClick={() => alternar(o)}
                title={`${nombre} · ${c.desde === c.hasta ? fmt.monthShort(c.desde) : `${fmt.monthShort(c.desde)} a ${fmt.monthShort(c.hasta)}`}`}
              >
                <span className="cc-ton">{fmt.int(v)}</span>
                <span className="cc-pct">{den(i) > 0 ? pct0((v / den(i)) * 100) : ''}</span>
              </button>
            ) : <span className="cc-celda cc-celda-vacia" />}
          </td>
        );
      })}
      <td className="num cc-total-col">
        <button type="button" className={`cc-celda${esSel(ent) ? ' cc-sel' : ''}`} aria-pressed={esSel(ent)} onClick={() => alternar(ent)}>
          <span className="cc-ton">{fmt.int(totalFila)}</span>
          <span className="cc-pct">{denTotal > 0 ? pct0((totalFila / denTotal) * 100) : ''}</span>
        </button>
      </td>
    </tr>
  );

  return (
    <div className="cc-tabla-card">
      <div className="cc-titulo">
        <span className="chart-card-title">{T.tabla} · {periodo.rotulo}</span>
        <span className="chart-card-subtitle">{T.tablaSub(periodo.semestres)}</span>
      </div>
      <div className="mh-tabla-scroll">
        <table className={`mh-tabla mz-tabla cc-tabla${ventas ? ' cc-tabla-ventas' : ''}`}>
          <thead>
            {encabezados.map((fila, nivel) => (
              <tr key={nivel}>
                {nivel === 0 && <th rowSpan={encabezados.length + 1} className="mz-fija">{ventas ? 'Grupo económico / elaboradora' : 'Petrolera'}</th>}
                {fila.map((g) => (
                  <th key={g.key} colSpan={g.n} className={`cc-th ${nivelClase[nivel]}${claseCol(g.desde, g.hasta)}`}>
                    <button type="button" aria-pressed={esSel({ desde: g.desde, hasta: g.hasta })} onClick={() => alternar({ desde: g.desde, hasta: g.hasta })}>{g.label}</button>
                  </th>
                ))}
                {nivel === 0 && <th rowSpan={encabezados.length + 1} className="num cc-total-col">Total</th>}
              </tr>
            ))}
            <tr>
              {columnas.map((c) => (
                <th key={c.key} className={`num cc-th cc-th-mes${claseCol(c.desde, c.hasta)}`}>
                  <button type="button" aria-pressed={esSel({ desde: c.desde, hasta: c.hasta })} onClick={() => alternar({ desde: c.desde, hasta: c.hasta })}>{c.label}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ninguna && (
              <tr><td className="mz-fija">Sin ventas</td><td colSpan={columnas.length + 1} className="cc-vacio">No hay ventas de cupo con estos filtros en {periodo.rotulo}.</td></tr>
            )}
            {!ventas && filasPet.map((f) => (
              <Fila key={f.nombre} ent={{ petrolera: f.nombre }} nombre={f.nombre} cols={f.cols} totalFila={f.total} den={(i) => totalCol[i]} denTotal={total} />
            ))}
            {ventas && filasGrupo.map((g) => {
              const conEmpresas = g.emps.length > 1 || (g.emps.length === 1 && g.emps[0].nombre !== g.nombre);
              const abierto = abiertos.has(g.nombre);
              return [
                <Fila
                  key={g.nombre} ent={{ grupo: g.nombre }} nombre={g.nombre} cols={g.cols} totalFila={g.total}
                  den={(i) => totalCol[i]} denTotal={total} clase="cc-fila-grupo"
                  toggle={conEmpresas && (
                    <button type="button" className="cc-desplegar" aria-expanded={abierto} aria-label={abierto ? 'Ocultar elaboradoras' : 'Ver elaboradoras'} onClick={() => alternarGrupo(g.nombre)}>
                      {abierto ? '▾' : '▸'}
                    </button>
                  )}
                />,
                ...(abierto && conEmpresas ? g.emps.map((e) => (
                  <Fila key={`${g.nombre}|${e.nombre}`} ent={{ empresa: e.nombre }} nombre={e.nombre} cols={e.cols} totalFila={e.total} den={(i) => totalCol[i]} denTotal={total} clase="cc-fila-emp" sangria={1} />
                )) : []),
              ];
            })}
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
      {ventas && filasGrupo.some((g) => g.emps.length > 1) && (
        <p className="mz-leyenda">Los grupos con más de una elaboradora se despliegan con la flecha. Las petroleras a las que vendió cada fila se ven en el treemap y en el mapa al hacer clic.</p>
      )}
    </div>
  );
}

/* ── Treemap vendedor × petrolera ──────────────────────────────────────── */

const ALTO_TREEMAP = 520;
const SEP = 2; // px de fondo entre baldosas (guía dataviz)

function Treemap({ detalle, ventas, colorParte, rotuloAlcance, soltar, T }) {
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
  // Etiquetas: compras = grupo - empresa / petrolera; ventas = petrolera / vendedor
  const titulo = (h) => (ventas ? h.petrolera : (h.holding === h.vendedor ? h.vendedor : `${h.holding} - ${h.vendedor}`));
  const subtitulo = (h) => (ventas ? h.vendedor : h.petrolera);
  const colorDe = (h) => colorParte(ventas ? h.petrolera : h.holding);

  return (
    <div className="chart-card cc-treemap-card">
      <div className="cc-titulo">
        <span className="chart-card-title">{T.treemap}</span>
        <span className="chart-card-subtitle">
          {rotuloAlcance ? <>mostrando <strong>{rotuloAlcance}</strong> <button type="button" className="cc-soltar" onClick={soltar}>✕ ver todo</button></> : T.treemapSub}
        </span>
      </div>
      <div className="cc-treemap" ref={ref} style={{ height: ALTO_TREEMAP }}>
        {ancho > 0 && (
          baldosas.length ? (
            <svg width={ancho} height={ALTO_TREEMAP} role="img" aria-label="Treemap de ventas de cupo">
              {baldosas.map((b) => {
                const { hoja } = b;
                const fondo = colorDe(hoja);
                const tinta = textoSobre(fondo);
                const w = Math.max(0, b.w - SEP), h = Math.max(0, b.h - SEP);
                const lineas = h >= 60 && w >= 96 ? 4 : h >= 32 && w >= 70 ? 2 : h >= 16 && w >= 40 ? 1 : 0;
                const maxChars = Math.max(3, Math.floor(w / 6.4));
                return (
                  <g
                    key={`${hoja.vendedor}|${hoja.petrolera}`}
                    tabIndex={0}
                    aria-label={`${titulo(hoja)}, ${subtitulo(hoja)}: ${fmt.int(hoja.v)} toneladas`}
                    onMouseMove={(e) => { const p = posicion(e); if (p) setHover({ hoja, ...p }); }}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover({ hoja, x: b.x + w / 2, y: b.y + h / 2 })}
                    onBlur={() => setHover(null)}
                  >
                    <rect x={b.x + SEP / 2} y={b.y + SEP / 2} width={w} height={h} fill={fondo} rx={2} />
                    {lineas >= 1 && (
                      <text x={b.x + SEP / 2 + 6} y={b.y + SEP / 2 + 14} fill={tinta} fontSize={11} fontWeight={700}>
                        {fmt.truncate(titulo(hoja), maxChars)}
                      </text>
                    )}
                    {lineas >= 2 && (
                      <text x={b.x + SEP / 2 + 6} y={b.y + SEP / 2 + 27} fill={tinta} fontSize={10} opacity={0.9}>
                        {fmt.truncate(subtitulo(hoja), maxChars)}
                      </text>
                    )}
                    {lineas >= 4 && (
                      <>
                        <text x={b.x + SEP / 2 + 6} y={b.y + SEP / 2 + 41} fill={tinta} fontSize={10.5} fontWeight={600}>
                          {fmt.int(hoja.v)} t
                        </text>
                        <text x={b.x + SEP / 2 + 6} y={b.y + SEP / 2 + 54} fill={tinta} fontSize={10} opacity={0.9}>
                          {pct0(hoja.pVend * 100)} · {pct0(hoja.pPet * 100)}
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
            <div className="cc-tooltip-titulo">{hover.hoja.vendedor}</div>
            {hover.hoja.holding !== hover.hoja.vendedor && <div className="cc-tooltip-sub">{hover.hoja.holding}</div>}
            <div className="cc-tooltip-fila"><span>Petrolera</span><strong>{hover.hoja.petrolera}</strong></div>
            <div className="cc-tooltip-fila"><span>Ventas de cupo</span><strong>{fmt.int(hover.hoja.v)} t</strong></div>
            <div className="cc-tooltip-fila"><span>De lo que vendió {ventas && hover.hoja.holding === hover.hoja.vendedor ? 'el grupo' : 'la empresa'}</span><strong>{pct0(hover.hoja.pVend * 100)}</strong></div>
            <div className="cc-tooltip-fila"><span>De lo que compró la petrolera</span><strong>{pct0(hover.hoja.pPet * 100)}</strong></div>
            <div className="cc-tooltip-fila"><span>Del total mostrado</span><strong>{pct0((hover.hoja.v / (total || 1)) * 100)}</strong></div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Mapa: una torta por provincia, gajos por grupo (compras) o por petrolera (ventas) ── */

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
 * Al pasar por un gajo se ve esa parte sola; al pasar por la provincia
 * (fuera de la torta) se ven todas sus partes (pedido HDO, 12/10/2026).
 */
function MapaProvincias({ detalle, colorParte, rotuloAlcance, T }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null); // { prov, parte | null, x, y }
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
  const mover = (prov, parte) => (e) => {
    const q = posicion(e);
    if (q) setHover({ prov, parte, ...q });
  };
  // El mapa va a la derecha de la página: el tooltip se abre hacia la izquierda enseguida
  const derecha = hover && ref.current && hover.x > ref.current.clientWidth * 0.4;
  const fuente = vb[2] / 40; // tamaño de letra en unidades del viewBox
  const parteHover = hover?.parte ? hover.prov.partes.find((h) => h.nombre === hover.parte) : null;

  return (
    <div className="chart-card cc-mapa-card">
      <div className="cc-titulo">
        <span className="chart-card-title">De qué provincias sale</span>
        <span className="chart-card-subtitle">{rotuloAlcance ? <>mostrando <strong>{rotuloAlcance}</strong></> : T.mapaSub}</span>
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
                key={p.nombre} className={`cc-prov${datos ? ' con-ventas' : ''}${hover && !hover.parte && hover.prov.mapa === p.nombre ? ' activa' : ''}`}
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
            const gajos = p.partes.map((h) => {
              const a0 = a;
              a += (h.v / p.v) * 2 * Math.PI;
              return { ...h, d: arco(cx, cy, r, a0, a) };
            });
            const l1 = rotuloProv(p.provincia);
            const l2 = `${fmt.int(p.v)} t · ${pct0(share * 100)}`;
            const w = Math.max(l1.length * 0.64, l2.length * 0.58) * fuente + fuente * 1.4;
            const hCaja = fuente * 2.75;
            const y0 = cy + r + fuente * 0.45;
            return (
              <g
                key={p.provincia} className="cc-torta" tabIndex={0}
                aria-label={`${l1}: ${fmt.int(p.v)} toneladas, ${pct0(share * 100)} del total`}
                onFocus={() => setHover({ prov: p, parte: null, x: 20, y: 20 })}
                onBlur={() => setHover(null)}
              >
                {gajos.map((g) => (
                  <path
                    key={g.nombre} d={g.d} fill={colorParte(g.nombre)}
                    className={`cc-gajo${hover?.parte === g.nombre && hover.prov === p ? ' activo' : ''}`}
                    vectorEffect="non-scaling-stroke"
                    onMouseMove={mover(p, g.nombre)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <title>{`${g.nombre}: ${fmt.int(g.v)} t · ${pct0((g.v / p.v) * 100)} de ${l1}`}</title>
                  </path>
                ))}
                <g className="cc-mapa-rotulo">
                  <rect x={cx - w / 2} y={y0} width={w} height={hCaja} rx={fuente * 0.35} className="cc-mapa-rotulo-caja" />
                  <text x={cx} y={y0 + fuente * 1.15} textAnchor="middle" style={{ fontSize: fuente }}>
                    <tspan x={cx} className="fuerte">{l1}</tspan>
                    <tspan x={cx} dy={fuente * 1.2}>{l2}</tspan>
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
        {!tortas.length && <p className="cc-vacio cc-vacio-mapa">Sin ventas de cupo en esta selección.</p>}
        {hover && (
          <div className={`cc-tooltip ${derecha ? 'izquierda' : ''}`} style={{ left: hover.x, top: hover.y }}>
            {parteHover ? (
              <>
                <div className="cc-tooltip-titulo"><i className="cc-tooltip-swatch" style={{ background: colorParte(parteHover.nombre) }} />{parteHover.nombre}</div>
                <div className="cc-tooltip-sub">{rotuloProv(hover.prov.provincia)}</div>
                <div className="cc-tooltip-fila"><span>Ventas de cupo</span><strong>{fmt.int(parteHover.v)} t</strong></div>
                <div className="cc-tooltip-fila"><span>De la provincia</span><strong>{pct0((parteHover.v / hover.prov.v) * 100)}</strong></div>
                <div className="cc-tooltip-fila"><span>Del total mostrado</span><strong>{pct0((parteHover.v / (total || 1)) * 100)}</strong></div>
              </>
            ) : (
              <>
                <div className="cc-tooltip-titulo">{rotuloProv(hover.prov.provincia)}</div>
                <div className="cc-tooltip-fila"><span>Ventas de cupo</span><strong>{fmt.int(hover.prov.v)} t · {pct0((hover.prov.v / (total || 1)) * 100)}</strong></div>
                <div className="cc-tooltip-sep" />
                {hover.prov.partes.map((h) => (
                  <div key={h.nombre} className="cc-tooltip-fila">
                    <span><i className="cc-tooltip-swatch" style={{ background: colorParte(h.nombre) }} />{h.nombre}</span>
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

function TablasGemelas({ detalle, T }) {
  const { filasDetalle, provincias, total } = detalle;
  return (
    <details className="cc-detalle">
      <summary>Ver como tabla</summary>
      <div className="cc-tablas-gemelas">
        <div>
          <div className="cc-tabla-gemela-titulo">{T.treemap}</div>
          <div className="mh-tabla-scroll">
            <table className="mh-tabla cc-tabla-detalle">
              <thead>
                <tr><th>Grupo económico</th><th>Elaboradora</th><th>Petrolera</th><th className="num">Toneladas</th><th className="num">De la empresa</th><th className="num">De la petrolera</th></tr>
              </thead>
              <tbody>
                {filasDetalle.map((h) => (
                  <tr key={`${h.empresa}|${h.petrolera}`}>
                    <td>{h.holding}</td><td>{h.empresa}</td><td>{h.petrolera}</td>
                    <td className="num">{fmt.int(h.v)}</td><td className="num">{pct0(h.pEmp * 100)}</td><td className="num">{pct0(h.pPet * 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="cc-tabla-gemela-titulo">De qué provincias sale</div>
          <div className="mh-tabla-scroll">
            <table className="mh-tabla cc-tabla-detalle">
              <thead>
                <tr><th>Provincia</th><th>{T.parte}</th><th className="num">Toneladas</th><th className="num">De la provincia</th><th className="num">Del total</th></tr>
              </thead>
              <tbody>
                {provincias.flatMap((p) => p.partes.map((h) => (
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
