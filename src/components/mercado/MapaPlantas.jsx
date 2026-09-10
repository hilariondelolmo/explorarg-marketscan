import { useEffect, useMemo, useRef, useState } from 'react';
import mapa from '../../data/mapa_argentina.json';
import capacidad from '../../data/capacidad.json';
import empresasData from '../../data/empresas.json';
import aceiteras from '../../data/plantas_aceite.json';
import infra from '../../data/refinerias.json';
import rutasData from '../../data/rutas_refinerias.json';
import rutasAceiteData from '../../data/rutas_aceiteras.json';
import { fmt } from '../../lib/format.js';
import '../charts/Chart.css';
import './Mercado.css';

// Proyección Web Mercator (generar_mapa.py): x = (lon - lon_min) · kx,
// y = (merc(lat_max) - merc(lat)) · ky. Es la misma de las teselas
// satelitales, así el fondo encaja debajo de las provincias.
const { lon_min, lat_max, kx, ky } = mapa.proyeccion;
const [VB_X, VB_Y, VB_W, VB_H] = mapa.viewBox.split(' ').map(Number);
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const MERC_TOP = merc(lat_max);

function proyectar(lng, lat) {
  return [(lng - lon_min) * kx, (MERC_TOP - merc(lat)) * ky];
}

/** Kilómetros a unidades del mapa a la latitud dada (Mercator no es equidistante). */
const kmAUnidades = (km, lat) => (km * kx) / (111.32 * Math.cos((lat * Math.PI) / 180));

// Teselas satelitales (Esri World Imagery + capa de límites y nombres) dentro
// del SVG: cada tesela es un <image> ubicado con la misma proyección.
const TESELAS = {
  imagen: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  nombres: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`,
};
const MAX_TESELAS = 64; // por capa; si el encuadre pide más, se baja un nivel de zoom
function teselas(vx, vy, vw, vh, anchoPx) {
  // Zoom tal que una tesela de 256 px se dibuje a ~1:1 en pantalla
  let z = Math.max(3, Math.min(17, Math.round(Math.log2((360 * kx * anchoPx) / (vw * 256)))));
  const cuenta = (zz) => {
    const nn = 2 ** zz;
    const cols = Math.floor((((vx + vw) / kx + lon_min + 180) / 360) * nn) - Math.floor(((vx / kx + lon_min + 180) / 360) * nn) + 1;
    const filas = Math.floor(((1 - (MERC_TOP - (vy + vh) / ky) / Math.PI) / 2) * nn) - Math.floor(((1 - (MERC_TOP - vy / ky) / Math.PI) / 2) * nn) + 1;
    return cols * filas;
  };
  while (z > 3 && cuenta(z) > MAX_TESELAS) z -= 1;
  const n = 2 ** z;
  const lado = (360 / n) * kx; // unidades del mapa por tesela (cuadradas: ky = kx·180/π)
  const lonA = vx / kx + lon_min; const lonB = (vx + vw) / kx + lon_min;
  const mA = MERC_TOP - vy / ky; const mB = MERC_TOP - (vy + vh) / ky;
  const tx0 = Math.max(0, Math.floor(((lonA + 180) / 360) * n));
  const tx1 = Math.min(n - 1, Math.floor(((lonB + 180) / 360) * n));
  const ty0 = Math.max(0, Math.floor(((1 - mA / Math.PI) / 2) * n));
  const ty1 = Math.min(n - 1, Math.floor(((1 - mB / Math.PI) / 2) * n));
  const lista = [];
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      lista.push({
        z, tx, ty,
        x: ((tx / n) * 360 - 180 - lon_min) * kx,
        y: (MERC_TOP - Math.PI * (1 - (2 * ty) / n)) * ky,
        lado,
      });
    }
  }
  return lista;
}

const geolocalizada = (p) => p.lat !== null && p.lng !== null;

// Condición de operación: último mes de la serie PROD CAPACITY por empresa.
const ULTIMO_MES_CAP = capacidad.serie.reduce((m, r) => (r.fecha > m ? r.fecha : m), '');
const CONDICION = new Map();
for (const r of capacidad.serie) {
  if (r.fecha === ULTIMO_MES_CAP) CONDICION.set(r.empresa, r.condicion);
}

// Plantas de biodiesel: capacidad instalada (Excel maestro) + categoría, grupo
// económico y localidad tomados del detalle de ventas (empresas.json).
const EMPRESAS = new Map(empresasData.empresas.map((e) => [e.empresa, e]));
// Rótulos solo para este mapa (pedido HDO 2026-09-10): la planta de Terminal 6
// es la de AGD y Bunge. La clave de datos y de rutas sigue siendo la original.
const ROTULO_MAPA = { 'T 6 INDUSTRIAL S.A.': 'T 6 INDUSTRIAL S.A. (AGD y BUNGE)' };
const PLANTAS_BIO = capacidad.plantas
  .filter(geolocalizada)
  .map((p) => {
    const e = EMPRESAS.get(p.empresa) || {};
    const rotulo = ROTULO_MAPA[p.empresa] || p.empresa;
    return {
      id: p.empresa,
      sector: 'biodiesel',
      nombre: rotulo,
      empresa: rotulo,
      claveRuta: p.empresa,
      capacidad: p.capacidad || 0,
      lat: p.lat,
      lng: p.lng,
      categoria: e.categoria || null,
      grupo: (e.grupo || p.holding || p.empresa) === p.empresa ? rotulo : (e.grupo || p.holding || p.empresa),
      supergrupo: e.supergrupo || null,
      segmento: p.segmento,
      localidad: e.localidad || null,
      provincia: e.provincia || null,
      condicion: CONDICION.get(p.empresa) || null,
    };
  })
  .sort((a, b) => b.capacidad - a.capacidad);
const BIO_OPERANDO = PLANTAS_BIO.filter((p) => p.condicion === 'ON');
const BIO_SIN_OPERAR = PLANTAS_BIO.filter((p) => p.condicion !== 'ON');

// Plantas de molienda de aceite: capacidad en tn/día de molienda.
const PLANTAS_ACEITE = aceiteras.plantas
  .filter(geolocalizada)
  .map((p) => ({ ...p, id: `aceite-${p.id}`, idFuente: p.id, sector: 'aceite', nombre: p.establecimiento, capacidad: p.molienda_tn_dia }))
  .sort((a, b) => b.capacidad - a.capacidad);

// Refinerías de hidrocarburos (SE) y planta de metanol: sin capacidad en la fuente.
const REFINERIAS = infra.refinerias
  .map((r) => ({
    ...r, id: `ref-${r.id}`, idFuente: r.id, sector: 'refinerias', nombre: r.planta,
    empresa: r.empresa || 'Sin datos de empresa', capacidad: 0,
  }))
  .sort((a, b) => a.empresa.localeCompare(b.empresa) || a.nombre.localeCompare(b.nombre));
const METANOL = infra.metanol.map((m) => ({
  ...m, id: `met-${m.id}`, sector: 'metanol', nombre: m.planta, capacidad: 0,
}));

const SECTORES = {
  biodiesel: {
    label: 'Elaboradoras de biodiesel', plural: 'plantas', unidad: 'ton/año', corta: 't/a', forma: 'circulo',
    plantas: BIO_OPERANDO, capMax: BIO_OPERANDO[0]?.capacidad || 1,
    intro: `Plantas en operación a ${fmt.monthShort(ULTIMO_MES_CAP)} según la serie de capacidad instalada; no se muestran ${BIO_SIN_OPERAR.length} plantas paradas o sin registro. El tamaño del punto es proporcional a la capacidad.`,
  },
  aceite: {
    label: 'Elaboradoras de aceite', plural: 'plantas', unidad: 'tn/día', corta: 't/d', forma: 'circulo',
    plantas: PLANTAS_ACEITE, capMax: PLANTAS_ACEITE[0]?.capacidad || 1,
    intro: 'Plantas de molienda de aceite con su capacidad diaria. El tamaño del punto es proporcional a la molienda.',
  },
  refinerias: {
    label: 'Refinerías', plural: 'refinerías', unidad: null, corta: null, forma: 'cuadrado',
    plantas: REFINERIAS, capMax: 1,
    intro: 'Refinerías de hidrocarburos habilitadas por la Secretaría de Energía (Res. 419/1998 y 1102/2004). La fuente no informa capacidad.',
  },
  metanol: {
    label: 'Metanol', plural: 'planta de metanol', unidad: null, corta: null, forma: 'rombo',
    plantas: METANOL, capMax: 1,
    intro: 'Planta de metanol de YPF en el complejo petroquímico de Plaza Huincul, según el dataset de petroquímicas de la Secretaría de Energía.',
  },
};

const CATEGORIA_LABEL = { INTEGRADA: 'Integrada', 'NO INTEGRADA': 'No integrada', COMERCIALIZADORA: 'Comercializadora' };
const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);
/** "PROVINCIA DE BUENOS AIRES" → "Provincia de Buenos Aires" (solo para lugares). */
const lugar = (s) => (s || '').toLowerCase().split(' ').map((w, i) => (
  i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
)).join(' ');
/** Los grupos ya vienen como "GRUPO X"; a las empresas independientes se les antepone. */
const nombreGrupo = (g) => (g.startsWith('GRUPO ') ? g : `Grupo ${g}`);

/** Opciones de empresa (nombre, cantidad de plantas) ordenadas por capacidad y nombre. */
function opcionesEmpresa(plantas) {
  const acum = new Map();
  for (const p of plantas) {
    const a = acum.get(p.empresa) || { n: 0, cap: 0 };
    acum.set(p.empresa, { n: a.n + 1, cap: a.cap + p.capacidad });
  }
  return [...acum.entries()].sort((a, b) => b[1].cap - a[1].cap || a[0].localeCompare(b[0]));
}

// Encuadre automático: caja de los puntos visibles con margen, tamaño mínimo
// para no perder el contexto y recorte a los límites del mapa base.
const MIN_LADO = 130;
function encuadre(puntos, margen = 1.3, aspecto = 1) {
  if (puntos.length === 0) return encuadreCaja(VB_X, VB_Y, VB_X + VB_W, VB_Y + VB_H, 1, aspecto);
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const p of puntos) {
    const [x, y] = proyectar(p.lng, p.lat);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return encuadreCaja(x0, y0, x1, y1, margen, aspecto);
}
// `aspecto` es la proporción ancho/alto del espacio disponible en pantalla:
// el encuadre nunca es más alto que eso, así el mapa entra completo sin
// scroll y las plantas quedan centradas (con aire a los costados si sobra).
function encuadreCaja(x0, y0, x1, y1, margen = 1.3, aspecto = 1) {
  let w = Math.max((x1 - x0) * margen, MIN_LADO);
  let h = Math.max((y1 - y0) * margen, MIN_LADO);
  if (w / h < aspecto) w = h * aspecto; // más alto que la pantalla: ensanchar
  const maxAspecto = Math.max(2.2, aspecto);
  if (w / h > maxAspecto) h = w / maxAspecto; // tira finita: dar alto
  // Centrado en los puntos, aunque quede espacio vacío a los costados: el
  // dibujo del país está pegado al oeste y, si se recortara al viewBox base,
  // las plantas (todas al este) quedarían corridas a la derecha.
  return [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h];
}

// Encuadre de apertura de cada sector: todas sus plantas centradas, con aire
// alrededor (margen mayor que el de los filtros) para no perder el contexto.
// Encuadre de apertura, igual para los cuatro sectores (pedido HDO): desde el
// límite norte de Santa Fe hasta un poco al sur de Bahía Blanca, centrado en
// la zona núcleo. El ancho lo da la proporción de la pantalla.
const APERTURA = { latNorte: -28.0, latSur: -39.4, lonCentro: -62.3 };
function encuadreApertura(aspecto) {
  const [cx, y0] = proyectar(APERTURA.lonCentro, APERTURA.latNorte);
  const [, y1] = proyectar(APERTURA.lonCentro, APERTURA.latSur);
  return encuadreCaja(cx, y0, cx, y1, 1, aspecto);
}

// Zoom fuerte sobre una planta: caja chica centrada en el punto (≈1° de lado).
const LADO_ZOOM = 36;
function encuadrePunto(p, aspecto = 1) {
  const [x, y] = proyectar(p.lng, p.lat);
  return encuadreCaja(x - LADO_ZOOM / 2, y - LADO_ZOOM / 2, x + LADO_ZOOM / 2, y + LADO_ZOOM / 2, 1, aspecto);
}

/** Distancia en línea recta entre dos puntos (km, fórmula del haversine). */
function distanciaKm(a, b) {
  const R = 6371;
  const g = (d) => (d * Math.PI) / 180;
  const dLat = g(b.lat - a.lat);
  const dLng = g(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(g(a.lat)) * Math.cos(g(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const RADIOS_KM = [50, 80, 100, 120, 300];
// Recorridos por ruta (OSRM sobre OpenStreetMap, precalculados con
// scripts/calcular_rutas.py): clave "empresa|id de refinería".
const RUTAS = rutasData.rutas;
const RUTAS_ACEITE = rutasAceiteData.rutas; // clave "empresa|id de aceitera" (solo pares < 320 km)
const horas = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`);
// De molienda diaria (tn de grano/día) a aceite anual: rendimiento de aceite
// sobre molienda (el de la planilla de margen de crushing) y días de operación.
const RENDIMIENTO_ACEITE = 0.19;
const DIAS_OPERACION = 300;
const veces = (n) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 });
/** Capacidad anual comparable entre sectores (t/año): biodiesel tal cual; aceiteras como aceite anual. */
const capacidadAnual = (p) => (p.sector === 'aceite' ? p.capacidad * RENDIMIENTO_ACEITE * DIAS_OPERACION : p.capacidad);
const CAP_ANUAL_MAX = Math.max(...[...BIO_OPERANDO, ...PLANTAS_ACEITE].map(capacidadAnual));

/** Texto del detalle según el sector del punto. */
function detalle(p, unidad) {
  switch (p.sector) {
    case 'biodiesel':
      return [
        p.categoria ? (CATEGORIA_LABEL[p.categoria] || p.categoria) : null,
        p.grupo && p.grupo !== p.nombre ? nombreGrupo(p.grupo) : null,
        `${fmt.int(p.capacidad)} ${unidad}`,
        p.localidad ? `${lugar(p.localidad)}, ${lugar(p.provincia)}` : null,
      ];
    case 'aceite':
      return [
        p.empresa !== p.nombre ? p.empresa : null,
        p.tipo,
        p.grano || 's/d',
        `molienda ${fmt.int(p.capacidad)} ${unidad}`,
        p.refinado_tn_dia ? `refinado ${fmt.int(p.refinado_tn_dia)} ${unidad}` : null,
        p.localidad ? `${p.localidad}, ${lugar(p.provincia)}` : null,
        p.kmRuta != null ? `${fmt.int(Math.round(p.kmRuta))} km por ruta (${horas(p.minRuta)})` : null,
        p.distanciaKm != null ? `${Math.round(p.distanciaKm)} km en línea recta` : null,
      ];
    case 'refinerias':
      return [
        p.empresa,
        p.habilitacion ? `habilitada como ${p.habilitacion.toLowerCase()} (${p.resolucion})` : p.resolucion,
        p.direccion ? lugar(p.direccion) : null,
        `${p.localidad}, ${lugar(p.provincia)}`,
        p.kmRuta != null ? `${fmt.int(Math.round(p.kmRuta))} km por ruta (${horas(p.minRuta)})` : null,
        p.distanciaKm != null ? `${Math.round(p.distanciaKm)} km en línea recta` : null,
      ];
    case 'metanol':
      return [p.empresa, `${p.localidad}, ${lugar(p.provincia)}`, p.nota];
    default:
      return [];
  }
}

/** Trazado del símbolo según la forma del sector. */
function simbolo(forma, x, y, r) {
  if (forma === 'cuadrado') return `M${x - r},${y - r} h${2 * r} v${2 * r} h${-2 * r} Z`;
  if (forma === 'rombo') return `M${x},${y - r * 1.3} L${x + r * 1.3},${y} L${x},${y + r * 1.3} L${x - r * 1.3},${y} Z`;
  return null;
}

// Título e intro del encabezado según el sector activo y el análisis elegido.
const ENCABEZADOS = {
  biodiesel: {
    titulo: 'Elaboradoras de biodiesel',
    intro: 'Las plantas de biodiesel en operación, con su capacidad instalada. Se pueden filtrar por integradas / no integradas, por grupo económico o por empresa.',
  },
  aceite: {
    titulo: 'Elaboradoras de aceite',
    intro: 'Las plantas de molienda de aceite del país, con su capacidad diaria. Son la materia prima del biodiesel: elegí una empresa para ver dónde están sus plantas.',
  },
  refinerias: {
    titulo: 'Refinerías',
    intro: 'Las refinerías de hidrocarburos habilitadas por la Secretaría de Energía, es decir, las plantas que elaboran el gas oil que el biodiesel corta.',
  },
  metanol: {
    titulo: 'Metanol',
    intro: 'La planta de metanol de YPF en Plaza Huincul, el otro insumo del biodiesel.',
  },
  refinerias_analisis: {
    titulo: 'Análisis de distancia a refinerías',
    intro: 'Elegí una elaboradora de biodiesel: el mapa traza la línea desde su planta hasta cada refinería habilitada y muestra la distancia a cada una, de la más cercana a la más lejana. Sirve para ver qué tan cerca está cada elaboradora de los puntos donde el biodiesel se mezcla con el gas oil.',
  },
  proveedores: {
    titulo: 'Análisis de distancia a proveedores',
    intro: 'Elegí una elaboradora de biodiesel y un radio en kilómetros: el mapa muestra las aceiteras que tiene alrededor con su molienda diaria, el aceite anual que representan y cuántas veces cubren la capacidad de esa planta. Sirve para ver qué tan cerca está cada elaboradora de su materia prima.',
  },
};

/** Mapa SVG de plantas por sector: biodiesel, aceite, refinerías y metanol. */
export default function MapaPlantas({ seccion }) {
  const [sector, setSector] = useState('biodiesel');
  const [filtroCat, setFiltroCat] = useState('todas');
  const [grupo, setGrupo] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [analisis, setAnalisis] = useState(''); // biodiesel: '' | 'proveedores' | 'refinerias'
  const proveedores = analisis === 'proveedores';
  const aRefinerias = analisis === 'refinerias';
  const setProveedores = (f) => setAnalisis((a) => ((typeof f === 'function' ? f(a === 'proveedores') : f) ? 'proveedores' : ''));
  const [radioKm, setRadioKm] = useState(100);
  const [satelital, setSatelital] = useState(false); // fondo: dibujo o imagen satelital
  const [anchoPx, setAnchoPx] = useState(700); // ancho real del SVG, para elegir el zoom de las teselas
  const [aspecto, setAspecto] = useState(1.2); // ancho/alto disponible para el mapa en pantalla
  const [manual, setManual] = useState(null); // encuadre fijado por el usuario (zoom / arrastre); null = automático
  const [activa, setActiva] = useState(null);
  const [hover, setHover] = useState(null); // {id, zoom}: desde la lista acerca el mapa
  const [pos, setPos] = useState(null); // posición del tooltip dentro del mapa
  const svgRef = useRef(null);

  // Panel de la derecha detenido: se ancla en posición fija justo debajo del
  // bloque fijo del encabezado, en la columna que le reserva la grilla, y se
  // acota al alto de pantalla; la lista scrollea adentro con el título fijo.
  // La página scrollea normal (el mapa es grande) y cuando el final de la
  // sección sube por el pie, el panel se acorta para no taparlo ni irse
  // debajo del encabezado. Un sticky no alcanza para esto.
  const cabRef = useRef(null);
  const colRef = useRef(null);
  const wrapRef = useRef(null);
  const [fijo, setFijo] = useState(null);
  useEffect(() => {
    let ultimo = '';
    const sincronizar = () => {
      const cab = cabRef.current;
      const col = colRef.current;
      const wrap = wrapRef.current;
      if (!cab || !col || !wrap) return;
      if (window.innerWidth <= 780) { // en pantallas chicas el panel scrollea normal
        if (ultimo !== 'static') { ultimo = 'static'; setFijo(null); }
        return;
      }
      const c = col.getBoundingClientRect();
      const top = Math.round(cab.getBoundingClientRect().bottom) + 8;
      const finSeccion = Math.round(wrap.getBoundingClientRect().bottom);
      const alto = Math.min(window.innerHeight - top - 12, finSeccion - top);
      const estilo = {
        position: 'fixed', top, left: Math.round(c.left), width: Math.round(c.width),
        height: Math.max(0, alto), visibility: alto < 48 ? 'hidden' : 'visible',
      };
      const clave = JSON.stringify(estilo);
      if (clave !== ultimo) { ultimo = clave; setFijo(estilo); }
    };
    sincronizar();
    window.addEventListener('scroll', sincronizar, { passive: true });
    window.addEventListener('resize', sincronizar);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sincronizar) : null;
    if (ro) { ro.observe(cabRef.current); ro.observe(colRef.current); ro.observe(wrapRef.current); }
    return () => {
      window.removeEventListener('scroll', sincronizar);
      window.removeEventListener('resize', sincronizar);
      if (ro) ro.disconnect();
    };
  }, []);

  const cfg = SECTORES[sector];
  const esBio = sector === 'biodiesel';

  // Biodiesel: filtro integradas / no integradas.
  const bioPorCategoria = useMemo(() => BIO_OPERANDO.filter((p) => (
    filtroCat === 'todas'
    || (filtroCat === 'integradas' && p.categoria === 'INTEGRADA')
    || (filtroCat === 'no-integradas' && p.categoria === 'NO INTEGRADA')
  )), [filtroCat]);

  // Opciones de grupo económico: los grupos con más de una planta primero,
  // después las empresas independientes. Solo sobre las plantas visibles.
  const opcionesGrupo = useMemo(() => {
    const cuenta = new Map();
    for (const p of bioPorCategoria) {
      cuenta.set(p.grupo, (cuenta.get(p.grupo) || 0) + 1);
      if (p.supergrupo) cuenta.set(p.supergrupo, (cuenta.get(p.supergrupo) || 0) + 1);
    }
    const todos = [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return {
      grupos: todos.filter(([, n]) => n > 1),
      independientes: todos.filter(([, n]) => n === 1),
    };
  }, [bioPorCategoria]);

  const base = esBio
    ? (grupo ? bioPorCategoria.filter((p) => p.grupo === grupo || p.supergrupo === grupo) : bioPorCategoria)
    : cfg.plantas;
  const empresas = useMemo(() => opcionesEmpresa(base), [base]);
  const seleccion = empresa ? base.filter((p) => p.empresa === empresa) : base;

  // Modo "distancia a proveedores": la planta de biodiesel elegida y las
  // aceiteras a menos de radioKm, ordenadas por distancia.
  const modoProveedores = esBio && proveedores && seleccion.length === 1;
  const central = modoProveedores ? seleccion[0] : null;
  const cercanas = useMemo(() => {
    if (!central) return [];
    return PLANTAS_ACEITE
      .map((a) => {
        const ruta = RUTAS_ACEITE[`${central.claveRuta}|${a.idFuente}`] || null;
        return {
          ...a, id: `prov-${a.id}`, distanciaKm: distanciaKm(central, a),
          kmRuta: ruta ? ruta.km : null, minRuta: ruta ? ruta.min : null, trazado: ruta ? ruta.ruta : null,
        };
      })
      .filter((a) => a.distanciaKm <= radioKm) // el radio es geométrico (el círculo del mapa)
      .sort((a, b) => (a.kmRuta ?? a.distanciaKm) - (b.kmRuta ?? b.distanciaKm));
  }, [central, radioKm]);
  // Modo "distancia a refinerías": la planta elegida y todas las refinerías,
  // ordenadas por distancia en línea recta.
  const modoRefinerias = esBio && aRefinerias && seleccion.length === 1;
  const origen = modoRefinerias ? seleccion[0] : null;
  const refineriasDist = useMemo(() => {
    if (!origen) return [];
    return REFINERIAS
      .map((r) => {
        const ruta = RUTAS[`${origen.claveRuta}|${r.idFuente}`] || null;
        return {
          ...r, id: `refdist-${r.id}`, distanciaKm: distanciaKm(origen, r),
          kmRuta: ruta ? ruta.km : null, minRuta: ruta ? ruta.min : null, trazado: ruta ? ruta.ruta : null,
        };
      })
      .sort((a, b) => (a.kmRuta ?? a.distanciaKm) - (b.kmRuta ?? b.distanciaKm));
  }, [origen]);
  const plantas = modoProveedores ? [central, ...cercanas]
    : modoRefinerias ? [origen, ...refineriasDist] : seleccion;

  const total = (modoProveedores ? cercanas : plantas).reduce((s, p) => s + p.capacidad, 0);
  // Aceite anual de las aceiteras del radio y cuántas veces cubre la
  // capacidad anual de biodiesel de la elaboradora (≈1 t de aceite por t de biodiesel).
  const aceiteAnual = modoProveedores ? total * RENDIMIENTO_ACEITE * DIAS_OPERACION : 0;
  const cobertura = central && central.capacidad > 0 ? aceiteAnual / central.capacidad : null;
  // Planta con tooltip: la que está bajo el mouse (en el mapa o en la lista)
  // o, si no hay ninguna, la fijada con un clic. El encabezado del panel no
  // cambia nunca: el detalle vive en el tooltip anclado al punto del mapa.
  const objetivo = plantas.find((p) => p.id === hover?.id) || plantas.find((p) => p.id === activa);
  // Zoom fuerte solo con intención: cuando el cursor se queda quieto sobre una
  // fila de la lista un instante, o con la planta fijada por clic. Pasar por
  // encima de la lista no mueve el mapa; sobre el punto del mapa tampoco.
  const [zoomId, setZoomId] = useState(null);
  useEffect(() => {
    if (hover?.zoom) {
      const t = setTimeout(() => setZoomId(hover.id), 380);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setZoomId(null), 150);
    return () => clearTimeout(t);
  }, [hover]);
  const conZoom = !modoProveedores && !modoRefinerias && objetivo && (activa === objetivo.id || zoomId === objetivo.id);

  // Encuadre objetivo y encuadre animado (tween corto entre uno y otro).
  // Encuadre común del país al abrir y con los filtros de categoría (siguen
  // siendo vistas de todo el sector); recién al elegir un grupo o una empresa
  // el mapa se acerca a esas plantas.
  const hayFiltro = grupo !== '' || empresa !== '';
  const encuadreFiltro = useMemo(() => {
    if (central) {
      // Caja del círculo de alcance alrededor de la planta elegida
      const [cx, cy] = proyectar(central.lng, central.lat);
      const r = kmAUnidades(radioKm, central.lat);
      return encuadreCaja(cx - r, cy - r, cx + r, cy + r, 1.3, aspecto);
    }
    if (modoRefinerias) return encuadre(plantas, 1.2, aspecto);
    return hayFiltro ? encuadre(plantas, 1.3, aspecto) : encuadreApertura(aspecto);
  }, [plantas, hayFiltro, central, radioKm, aspecto, modoRefinerias]);
  const destino = conZoom ? encuadrePunto(objetivo, aspecto) : (manual || encuadreFiltro);
  // Cualquier cambio de filtro o análisis vuelve al encuadre automático
  const claveFiltro = encuadreFiltro.map((v) => Math.round(v)).join(',');
  useEffect(() => { setManual(null); }, [claveFiltro]);
  const [vb, setVb] = useState(destino);
  const vbRef = useRef(destino);
  useEffect(() => {
    const desde = vbRef.current;
    const hasta = destino;
    if (desde.every((v, i) => Math.abs(v - hasta[i]) < 0.01)) return undefined;
    const t0 = performance.now();
    const DUR = 320;
    let raf;
    const paso = (t) => {
      // El timestamp del primer cuadro puede ser anterior a t0: acotar a [0, 1]
      const k = Math.min(1, Math.max(0, (t - t0) / DUR));
      const e = 1 - (1 - k) ** 3; // ease-out
      const v = desde.map((d, i) => d + (hasta[i] - d) * e);
      vbRef.current = v;
      setVb(v);
      if (k < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    // Cierre garantizado: si el navegador frena los cuadros (pestaña en
    // segundo plano) igual se llega al encuadre final.
    const fin = setTimeout(() => {
      cancelAnimationFrame(raf);
      vbRef.current = hasta;
      setVb(hasta);
    }, DUR + 40);
    return () => { cancelAnimationFrame(raf); clearTimeout(fin); };
  }, [destino.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const [vx, vy, vw, vh] = vb;
  const escala = vw / VB_W; // 1 px en pantalla ≈ escala unidades del viewBox
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    // Ancho en píxeles físicos: en pantallas retina se piden teselas más nítidas
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const medir = () => {
      const ancho = el.getBoundingClientRect().width || 700;
      setAnchoPx(ancho * dpr);
      // Alto libre bajo el bloque fijo del encabezado (con un margen chico)
      const cab = cabRef.current ? cabRef.current.getBoundingClientRect().bottom : 0;
      const altoLibre = Math.max(320, window.innerHeight - cab - 28);
      setAspecto(Math.round((ancho / altoLibre) * 100) / 100);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    if (cabRef.current) ro.observe(cabRef.current);
    window.addEventListener('resize', medir);
    return () => { ro.disconnect(); window.removeEventListener('resize', medir); };
  }, []);
  // El zoom de las teselas se elige con el encuadre destino (no cambia durante la animación)
  const capaSatelital = useMemo(
    () => (satelital ? teselas(vx, vy, vw, vh, anchoPx * (vw / destino[2])) : []),
    [satelital, vx, vy, vw, vh, anchoPx, destino],
  );
  // Tamaño del punto con la misma escala para biodiesel y aceiteras: ambas en
  // toneladas por año (aceiteras: molienda diaria → aceite anual con el
  // rendimiento y los días de operación de arriba). Área ∝ toneladas.
  const radio = (p) => {
    const c = SECTORES[p.sector];
    return (c.unidad ? 3 + Math.sqrt(capacidadAnual(p) / CAP_ANUAL_MAX) * 9 : 4.5) * escala;
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!objetivo || !svg || !svg.getScreenCTM) { setPos(null); return; }
    const [x, y] = proyectar(objetivo.lng, objetivo.lat);
    const pt = svg.createSVGPoint();
    pt.x = x; pt.y = y;
    const sp = pt.matrixTransform(svg.getScreenCTM());
    const caja = svg.parentElement.getBoundingClientRect();
    // El tooltip queda a una distancia media del punto, en diagonal hacia
    // arriba: a la izquierda, o a la derecha si el punto cae en el borde
    // izquierdo del mapa; hacia abajo si cae en el borde superior.
    const px = sp.x - caja.left;
    const py = sp.y - caja.top;
    const SEP = 44; // distancia del punto a la esquina del tooltip
    // Si no hay lugar para el tooltip (≈240 × 130 px) de ese lado, va al otro
    setPos({
      x: px, y: py, sep: SEP,
      derecha: px - SEP < 250,
      abajo: py - SEP < 140,
    });
  }, [objetivo, vx, vy, vw, vh]); // eslint-disable-line react-hooks/exhaustive-deps

  const encabezado = ENCABEZADOS[esBio && proveedores ? 'proveedores' : esBio && aRefinerias ? 'refinerias_analisis' : sector];

  // Zoom manual alrededor del centro del encuadre actual; el tope de alejar es
  // el país entero y el de acercar ~10 km de ancho.
  const zoomManual = (factor) => {
    const [x, y, w, h] = vbRef.current;
    const nw = Math.max(3, Math.min(VB_W * 2.5, w * factor));
    const nh = nw * (h / w);
    setManual([x + w / 2 - nw / 2, y + h / 2 - nh / 2, nw, nh]);
  };
  const recentrar = () => { setManual(null); setActiva(null); };
  const arrastre = useRef(null);
  const alArrastrar = {
    onPointerDown: (e) => {
      if (e.button !== 0 || e.target.closest('.planta')) return;
      arrastre.current = { x: e.clientX, y: e.clientY, vb: vbRef.current, movio: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e) => {
      const a = arrastre.current;
      if (!a) return;
      const caja = e.currentTarget.getBoundingClientRect();
      const [x, y, w, h] = a.vb;
      const dx = ((e.clientX - a.x) / caja.width) * w;
      const dy = ((e.clientY - a.y) / caja.height) * h;
      if (!a.movio && Math.hypot(e.clientX - a.x, e.clientY - a.y) < 3) return;
      a.movio = true;
      const nuevo = [x - dx, y - dy, w, h];
      vbRef.current = nuevo; setVb(nuevo); setManual(nuevo); // sin animación mientras se arrastra
    },
    onPointerUp: () => { arrastre.current = null; },
    onPointerCancel: () => { arrastre.current = null; },
    onWheel: (e) => {
      if (!(e.ctrlKey || e.metaKey)) return; // la rueda sola sigue scrolleando la página
      e.preventDefault();
      zoomManual(e.deltaY > 0 ? 1.25 : 0.8);
    },
  };

  const cambiarSector = (s) => { setSector(s); setFiltroCat('todas'); setGrupo(''); setEmpresa(''); setAnalisis(''); setActiva(null); setHover(null); setZoomId(null); setManual(null); };
  const cambiarCategoria = (c) => { setFiltroCat(c); setGrupo(''); setEmpresa(''); setActiva(null); setManual(null); };
  const cambiarGrupo = (g) => { setGrupo(g); setEmpresa(''); setActiva(null); setManual(null); };
  const cambiarEmpresa = (e) => { setEmpresa(e); setActiva(null); setManual(null); };

  const eventos = (p, zoom) => ({
    onClick: () => setActiva((a) => (a === p.id ? null : p.id)), // clic fija o suelta el tooltip
    onMouseEnter: () => setHover({ id: p.id, zoom }),
    onMouseLeave: () => setHover((h) => (h?.id === p.id ? null : h)),
  });
  const resaltada = (p) => activa === p.id || hover?.id === p.id;
  const extraFila = (p) => {
    if (sector === 'aceite' || sector === 'metanol') return p.localidad;
    if (sector === 'refinerias') return p.empresa;
    return null;
  };

  return (
    <div className="mapa-plantas">
      {/* Bloque fijo: del encabezado a la base de los filtros nada se mueve al
          scrollear (mismo patrón que la matriz y la ficha por empresa) */}
      <div className="mapa-cabecera" ref={cabRef}>
      <p className="section-kicker">Mercado Biodiesel</p>
      <h2>{seccion?.title ?? 'Mapa de plantas'} - {encabezado.titulo}</h2>
      <p className="section-intro">{encabezado.intro}</p>
      <div className="mapa-sectores" role="tablist" aria-label="Sector">
        {Object.entries(SECTORES).map(([id, s]) => (
          <button
            key={id}
            role="tab"
            aria-selected={sector === id}
            className={`mapa-sector ${sector === id ? 'activo' : ''}`}
            onClick={() => cambiarSector(id)}
          >
            <span className={`mapa-simbolo ${s.forma} ${id}`} aria-hidden="true" />
            {s.label}
            <span className="mapa-sector-n">{s.plantas.length}</span>
          </button>
        ))}
        <label className="mapa-switch" title="Fondo del mapa">
          <span className={!satelital ? 'activo' : ''}>Mapa</span>
          <input type="checkbox" role="switch" checked={satelital}
            onChange={(e) => setSatelital(e.target.checked)} aria-label="Fondo satelital" />
          <span className="mapa-switch-pista" aria-hidden="true"><span className="mapa-switch-boton" /></span>
          <span className={satelital ? 'activo' : ''}>Satelital</span>
        </label>
      </div>

      <div className="mapa-filtros">
        {esBio && (
          <>
            <label className="mapa-select">
              <select value={filtroCat} onChange={(e) => cambiarCategoria(e.target.value)} aria-label="Categoría">
                <option value="todas">Todos los segmentos</option>
                <option value="integradas">Integradas</option>
                <option value="no-integradas">No integradas</option>
              </select>
            </label>
            <label className="mapa-select">
              <select value={grupo} onChange={(e) => cambiarGrupo(e.target.value)} aria-label="Grupo económico">
                <option value="">Todos los grupos</option>
                {opcionesGrupo.grupos.length > 0 && (
                  <optgroup label="Grupos con varias plantas">
                    {opcionesGrupo.grupos.map(([g, n]) => (
                      <option key={g} value={g}>{`${g} (${n})`}</option>
                    ))}
                  </optgroup>
                )}
                {opcionesGrupo.independientes.length > 0 && (
                  <optgroup label="Empresas independientes">
                    {opcionesGrupo.independientes.map(([g]) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
          </>
        )}
        {esBio && (
          <div className="chart-range-selector" role="group" aria-label="Análisis">
            <button className={proveedores ? 'active' : ''}
              aria-pressed={proveedores}
              onClick={() => { setAnalisis((a) => (a === 'proveedores' ? '' : 'proveedores')); setActiva(null); setManual(null); }}>
              Distancia a proveedores
            </button>
            <button className={aRefinerias ? 'active' : ''}
              aria-pressed={aRefinerias}
              onClick={() => { setAnalisis((a) => (a === 'refinerias' ? '' : 'refinerias')); setActiva(null); setManual(null); }}>
              Distancia a refinerías
            </button>
          </div>
        )}
        {esBio && proveedores && (
          <label className="mapa-select">
            <span>Radio</span>
            <select value={radioKm} onChange={(e) => { setRadioKm(Number(e.target.value)); setActiva(null); setManual(null); }}>
              {RADIOS_KM.map((r) => <option key={r} value={r}>{r} km</option>)}
            </select>
          </label>
        )}
        {empresas.length > 1 && (
          <label className="mapa-select">
            <select value={empresa} onChange={(e) => cambiarEmpresa(e.target.value)} aria-label="Empresa">
              <option value="">Todas las empresas</option>
              {empresas.map(([nombre, { n }]) => (
                <option key={nombre} value={nombre}>{n > 1 ? `${nombre} (${n})` : nombre}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      </div>

      <div className="mapa-plantas-wrap" ref={wrapRef}>
        <div className="mapa-lienzo">
        <svg ref={svgRef} className={`mapa-svg ${satelital ? 'satelital' : ''} ${manual ? 'manual' : ''}`}
          viewBox={`${vx} ${vy} ${vw} ${vh}`} role="img" {...alArrastrar}
          aria-label={`Mapa de ${cfg.plural} en Argentina: ${cfg.label}`}>
          {satelital && (
            <g className="teselas">
              {capaSatelital.map((t) => (
                <image key={`i${t.z}-${t.tx}-${t.ty}`} href={TESELAS.imagen(t.z, t.tx, t.ty)}
                  x={t.x} y={t.y} width={t.lado} height={t.lado} preserveAspectRatio="none" />
              ))}
              {capaSatelital.map((t) => (
                <image key={`n${t.z}-${t.tx}-${t.ty}`} href={TESELAS.nombres(t.z, t.tx, t.ty)}
                  x={t.x} y={t.y} width={t.lado} height={t.lado} preserveAspectRatio="none" />
              ))}
            </g>
          )}
          {(mapa.vecinos || []).map((v) => (
            <path key={v.nombre} className="vecino" d={v.path} vectorEffect="non-scaling-stroke">
              <title>{v.nombre}</title>
            </path>
          ))}
          {mapa.provincias.map((p) => (
            <path key={p.nombre} className="provincia" d={p.path} vectorEffect="non-scaling-stroke">
              <title>{p.nombre}</title>
            </path>
          ))}
          {central && (() => {
            const [cx, cy] = proyectar(central.lng, central.lat);
            return (
              <circle className="radio-proveedores" cx={cx} cy={cy}
                r={kmAUnidades(radioKm, central.lat)} vectorEffect="non-scaling-stroke" />
            );
          })()}
          {(origen || central) && (() => {
            const desde = origen || central;
            const destinos = origen ? refineriasDist : cercanas;
            const [ox, oy] = proyectar(desde.lng, desde.lat);
            // Las rutas resaltadas se dibujan al final para que queden encima
            const orden = [...destinos].sort((a, b) => (resaltada(a) ? 1 : 0) - (resaltada(b) ? 1 : 0));
            return orden.map((r) => {
              const clase = `ruta ${resaltada(r) ? 'activa' : ''}`;
              if (r.trazado) {
                const puntos = r.trazado.map(([lng, lat]) => proyectar(lng, lat).map((v) => v.toFixed(1)).join(',')).join(' ');
                return <polyline key={`ruta-${r.id}`} className={clase} points={puntos} vectorEffect="non-scaling-stroke" />;
              }
              const [x, y] = proyectar(r.lng, r.lat);
              return (
                <line key={`ruta-${r.id}`} className={clase}
                  x1={ox} y1={oy} x2={x} y2={y} vectorEffect="non-scaling-stroke" />
              );
            });
          })()}
          {plantas.map((p) => {
            const [x, y] = proyectar(p.lng, p.lat);
            const r = radio(p);
            const c = SECTORES[p.sector];
            const titulo = c.unidad ? `${p.nombre} · ${fmt.int(p.capacidad)} ${c.unidad}` : p.nombre;
            const clase = `planta ${p.sector} ${resaltada(p) ? 'activa' : ''}`;
            const d = simbolo(c.forma, x, y, r);
            return d ? (
              <path key={p.id} className={clase} d={d} vectorEffect="non-scaling-stroke"
                aria-label={titulo} {...eventos(p, false)} />
            ) : (
              <circle key={p.id} className={clase} cx={x} cy={y} r={r} vectorEffect="non-scaling-stroke"
                aria-label={titulo} {...eventos(p, false)} />
            );
          })}
          {satelital && (
            <text className="mapa-atribucion" x={vx + vw - 2 * escala} y={vy + vh - 3 * escala}
              fontSize={7 * escala} textAnchor="end">Imágenes © Esri</text>
          )}
        </svg>
        <div className="mapa-controles-zoom" role="group" aria-label="Zoom del mapa">
          <button type="button" onClick={() => zoomManual(0.6)} title="Acercar (o Ctrl + rueda)" aria-label="Acercar">+</button>
          <button type="button" onClick={() => zoomManual(1 / 0.6)} title="Alejar" aria-label="Alejar">−</button>
          <button type="button" className={`recentrar ${manual ? 'activo' : ''}`} onClick={recentrar}
            title="Volver al encuadre automático" aria-label="Recentrar">⌖</button>
        </div>
        {objetivo && pos && Number.isFinite(pos.x) && (
          <div
            className={`mapa-tooltip ${pos.derecha ? 'derecha' : ''} ${pos.abajo ? 'abajo' : ''}`}
            style={{
              left: pos.derecha ? pos.x + pos.sep : pos.x - pos.sep,
              top: pos.abajo ? pos.y + pos.sep : pos.y - pos.sep,
            }}
          >
            <div className="mapa-tooltip-titulo">{objetivo.nombre}</div>
            {detalle(objetivo, SECTORES[objetivo.sector].unidad).filter(Boolean).map((linea) => (
              <div key={linea} className="mapa-tooltip-linea">{linea}</div>
            ))}
          </div>
        )}
        </div>
        <div className="mapa-detalle-col" ref={colRef}>
        <div className="mapa-detalle" style={fijo || undefined}>
          {modoProveedores ? (
            <>
              <div className="mapa-detalle-titulo">
                {cercanas.length} {cercanas.length === 1 ? 'aceitera' : 'aceiteras'} a menos de {radioKm} km
                {cercanas.length > 0 ? ` · ${fmt.int(total)} tn/día de molienda / ${fmt.int(aceiteAnual)} tn/año de aceite` : ''}
              </div>
              <div className="mapa-detalle-sub">
                {cercanas.length > 0 && cobertura != null
                  ? `Ese aceite cubre ${veces(cobertura)} veces la capacidad anual de ${central.nombre} (${fmt.int(central.capacidad)} ton/año de biodiesel). `
                  : ''}
                Aceiteras alrededor de {central.nombre}
                {central.localidad ? ` (${lugar(central.localidad)})` : ''}: el radio es en línea recta y
                la lista va por kilómetros de ruta (OSRM sobre OpenStreetMap).
                Aceite anual = molienda × {Math.round(RENDIMIENTO_ACEITE * 100)}% de rendimiento × {DIAS_OPERACION} días.
              </div>
            </>
          ) : modoRefinerias ? (
            <>
              <div className="mapa-detalle-titulo">
                {refineriasDist.length} refinerías desde {origen.nombre}
                {refineriasDist.length > 0
                  ? ` · la más cercana a ${fmt.int(Math.round(refineriasDist[0].kmRuta ?? refineriasDist[0].distanciaKm))} km por ruta`
                  : ''}
              </div>
              <div className="mapa-detalle-sub">
                Recorrido por ruta desde la planta{origen.localidad ? ` de ${lugar(origen.localidad)}` : ''} a cada
                refinería habilitada, de la más cercana a la más lejana, con el tiempo estimado de viaje
                (OSRM sobre OpenStreetMap). Pasá el mouse por una fila para resaltar su recorrido.
              </div>
            </>
          ) : (
            <>
              <div className="mapa-detalle-titulo">
                {plantas.length} {plantas.length === 1 && cfg.plural === 'plantas' ? 'planta' : cfg.plural}
                {cfg.unidad ? ` · ${fmt.int(total)} ${cfg.unidad}` : ''}
              </div>
              <div className="mapa-detalle-sub">
                {esBio && proveedores
                  ? 'Elegí una empresa en el selector para ver las aceiteras que tiene alrededor.'
                  : esBio && aRefinerias
                    ? 'Elegí una empresa en el selector para ver la distancia desde su planta a cada refinería.'
                    : `${cfg.intro} Pasá el mouse por una planta para ver su detalle; si el cursor se queda sobre una fila, el mapa se acerca a esa planta. Con un clic queda fijo.`}
              </div>
            </>
          )}
          <div className="mapa-lista">
            {modoProveedores && (
              <div key={central.id} className={`mapa-lista-row central ${resaltada(central) ? 'activa' : ''}`} {...eventos(central, false)}>
                <span>{fmt.truncate(central.nombre, 34)}<span className="mapa-lista-loc"> · elaboradora</span></span>
                <span className="mapa-lista-cap">{fmt.int(central.capacidad)} t/a</span>
              </div>
            )}
            {modoProveedores && cercanas.map((p) => (
              <div key={p.id} className={`mapa-lista-row ${resaltada(p) ? 'activa' : ''}`} {...eventos(p, false)}>
                <span>
                  {fmt.truncate(p.nombre, 30)}
                  <span className="mapa-lista-loc">
                    {' · '}{p.localidad}{' · '}
                    {p.kmRuta != null ? `${fmt.int(Math.round(p.kmRuta))} km por ruta` : `${Math.round(p.distanciaKm)} km`}
                  </span>
                </span>
                <span className="mapa-lista-cap">{fmt.int(p.capacidad)} t/d</span>
              </div>
            ))}
            {modoProveedores && cercanas.length === 0 && (
              <div className="mapa-lista-row mapa-lista-vacia">Sin aceiteras en ese radio</div>
            )}
            {modoRefinerias && (
              <div key={origen.id} className={`mapa-lista-row central ${resaltada(origen) ? 'activa' : ''}`} {...eventos(origen, false)}>
                <span>{fmt.truncate(origen.nombre, 34)}<span className="mapa-lista-loc"> · elaboradora</span></span>
                <span className="mapa-lista-cap">{fmt.int(origen.capacidad)} t/a</span>
              </div>
            )}
            {modoRefinerias && refineriasDist.map((p) => (
              <div key={p.id} className={`mapa-lista-row ${resaltada(p) ? 'activa' : ''}`} {...eventos(p, false)}>
                <span>
                  {fmt.truncate(p.nombre, 30)}
                  <span className="mapa-lista-loc"> · {p.empresa}{p.minRuta != null ? ` · ${horas(p.minRuta)}` : ''}</span>
                </span>
                <span className="mapa-lista-cap">{fmt.int(Math.round(p.kmRuta ?? p.distanciaKm))} km</span>
              </div>
            ))}
            {!modoProveedores && !modoRefinerias && plantas.map((p) => (
              <div key={p.id} className={`mapa-lista-row ${resaltada(p) ? 'activa' : ''}`} {...eventos(p, true)}>
                <span>
                  {fmt.truncate(p.nombre, 34)}
                  {extraFila(p) ? <span className="mapa-lista-loc"> · {extraFila(p)}</span> : null}
                </span>
                {cfg.corta ? <span className="mapa-lista-cap">{fmt.int(p.capacidad)} {cfg.corta}</span> : <span />}
              </div>
            ))}
            {!modoProveedores && !modoRefinerias && plantas.length === 0 && (
              <div className="mapa-lista-row mapa-lista-vacia">Sin plantas para ese filtro</div>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
