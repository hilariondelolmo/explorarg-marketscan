/**
 * Plantas del mercado de biodiesel: datos y geometría compartidos por el
 * mapa interactivo (MapaPlantas) y las piezas estáticas (infografía).
 * Proyección, plantas por sector, encuadres, distancias y rutas.
 */
import mapa from '../data/mapa_argentina.json';
import capacidad from '../data/capacidad.json';
import empresasData from '../data/empresas.json';
import aceiteras from '../data/plantas_aceite.json';
import infra from '../data/refinerias.json';
import puertosData from '../data/puertos.json';
import rutasData from '../data/rutas_refinerias.json';
import rutasAceiteData from '../data/rutas_aceiteras.json';
import rutasPuertosData from '../data/rutas_puertos.json';

// Proyección Web Mercator (generar_mapa.py): x = (lon - lon_min) · kx,
// y = (merc(lat_max) - merc(lat)) · ky. Es la misma de las teselas
// satelitales, así el fondo encaja debajo de las provincias.
export const { lon_min, lat_max, kx, ky } = mapa.proyeccion;
export const [VB_X, VB_Y, VB_W, VB_H] = mapa.viewBox.split(' ').map(Number);
export const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
export const MERC_TOP = merc(lat_max);

export function proyectar(lng, lat) {
  return [(lng - lon_min) * kx, (MERC_TOP - merc(lat)) * ky];
}

/** Kilómetros a unidades del mapa a la latitud dada (Mercator no es equidistante). */
export const kmAUnidades = (km, lat) => (km * kx) / (111.32 * Math.cos((lat * Math.PI) / 180));

export const geolocalizada = (p) => p.lat !== null && p.lng !== null;

// Condición de operación: último mes de la serie PROD CAPACITY por empresa.
export const ULTIMO_MES_CAP = capacidad.serie.reduce((m, r) => (r.fecha > m ? r.fecha : m), '');
export const CONDICION = new Map();
for (const r of capacidad.serie) {
  if (r.fecha === ULTIMO_MES_CAP) CONDICION.set(r.empresa, r.condicion);
}

// Plantas de biodiesel: capacidad instalada (Excel maestro) + categoría, grupo
// económico y localidad tomados del detalle de ventas (empresas.json).
export const EMPRESAS = new Map(empresasData.empresas.map((e) => [e.empresa, e]));
// Rótulos solo para este mapa (pedido HDO 2026-09-10): la planta de Terminal 6
// es la de AGD y Bunge. La clave de datos y de rutas sigue siendo la original.
export const ROTULO_MAPA = { 'T 6 INDUSTRIAL S.A.': 'T 6 INDUSTRIAL S.A. (AGD y BUNGE)' };
export const PLANTAS_BIO = capacidad.plantas
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
export const BIO_OPERANDO = PLANTAS_BIO.filter((p) => p.condicion === 'ON');
export const BIO_SIN_OPERAR = PLANTAS_BIO.filter((p) => p.condicion !== 'ON');

// Plantas de molienda de aceite: capacidad en tn/día de molienda.
export const PLANTAS_ACEITE = aceiteras.plantas
  .filter(geolocalizada)
  .map((p) => ({ ...p, id: `aceite-${p.id}`, idFuente: p.id, sector: 'aceite', nombre: p.establecimiento, capacidad: p.molienda_tn_dia }))
  .sort((a, b) => b.capacidad - a.capacidad);

// Refinerías de hidrocarburos (SE) y planta de metanol: sin capacidad en la fuente.
export const REFINERIAS = infra.refinerias
  .map((r) => ({
    ...r, id: `ref-${r.id}`, idFuente: r.id, sector: 'refinerias', nombre: r.planta,
    empresa: r.empresa || 'Sin datos de empresa', capacidad: 0,
  }))
  .sort((a, b) => a.empresa.localeCompare(b.empresa) || a.nombre.localeCompare(b.nombre));
export const METANOL = infra.metanol.map((m) => ({
  ...m, id: `met-${m.id}`, sector: 'metanol', nombre: m.planta, capacidad: 0,
}));

// Puertos de referencia (puertos.json): destino aparte de las refinerías,
// para la distancia de cada elaboradora al punto de exportación.
export const PUERTOS = puertosData.puertos.map((p) => ({
  ...p, id: `puerto-${p.id}`, idFuente: p.id, sector: 'puerto', nombre: p.puerto, capacidad: 0,
}));

export const CATEGORIA_LABEL = { INTEGRADA: 'Integrada', 'NO INTEGRADA': 'No integrada', COMERCIALIZADORA: 'Comercializadora' };
export const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);
/** "PROVINCIA DE BUENOS AIRES" → "Provincia de Buenos Aires" (solo para lugares). */
export const lugar = (s) => (s || '').toLowerCase().split(' ').map((w, i) => (
  i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
)).join(' ');
/** Los grupos ya vienen como "GRUPO X"; a las empresas independientes se les antepone. */
export const nombreGrupo = (g) => (g.startsWith('GRUPO ') ? g : `Grupo ${g}`);

// Encuadre automático: caja de los puntos visibles con margen, tamaño mínimo
// para no perder el contexto y recorte a los límites del mapa base.
export const MIN_LADO = 130;
export function encuadre(puntos, margen = 1.3, aspecto = 1) {
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
export function encuadreCaja(x0, y0, x1, y1, margen = 1.3, aspecto = 1) {
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
export const APERTURA = { latNorte: -28.0, latSur: -39.4, lonCentro: -62.3 };
export function encuadreApertura(aspecto) {
  const [cx, y0] = proyectar(APERTURA.lonCentro, APERTURA.latNorte);
  const [, y1] = proyectar(APERTURA.lonCentro, APERTURA.latSur);
  return encuadreCaja(cx, y0, cx, y1, 1, aspecto);
}

// Zoom fuerte sobre una planta: caja chica centrada en el punto (≈1° de lado).
export const LADO_ZOOM = 36;
export function encuadrePunto(p, aspecto = 1) {
  const [x, y] = proyectar(p.lng, p.lat);
  return encuadreCaja(x - LADO_ZOOM / 2, y - LADO_ZOOM / 2, x + LADO_ZOOM / 2, y + LADO_ZOOM / 2, 1, aspecto);
}

/** Distancia en línea recta entre dos puntos (km, fórmula del haversine). */
export function distanciaKm(a, b) {
  const R = 6371;
  const g = (d) => (d * Math.PI) / 180;
  const dLat = g(b.lat - a.lat);
  const dLng = g(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(g(a.lat)) * Math.cos(g(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const RADIOS_KM = [50, 80, 100, 120, 300];
// Recorridos por ruta (OSRM sobre OpenStreetMap, precalculados con
// scripts/calcular_rutas.py): clave "empresa|id de refinería".
export const RUTAS = rutasData.rutas;
export const RUTAS_ACEITE = rutasAceiteData.rutas; // clave "empresa|id de aceitera" (solo pares < 320 km)
export const RUTAS_PUERTOS = rutasPuertosData.rutas; // clave "empresa|id de puerto"
export const horas = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`);
// De molienda diaria (tn de grano/día) a aceite anual: rendimiento de aceite
// sobre molienda (el de la planilla de margen de crushing) y días de operación.
export const RENDIMIENTO_ACEITE = 0.19;
export const DIAS_OPERACION = 300;
export const veces = (n) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 });
/** Capacidad anual comparable entre sectores (t/año): biodiesel tal cual; aceiteras como aceite anual. */
export const capacidadAnual = (p) => (p.sector === 'aceite' ? p.capacidad * RENDIMIENTO_ACEITE * DIAS_OPERACION : p.capacidad);
export const CAP_ANUAL_MAX = Math.max(...[...BIO_OPERANDO, ...PLANTAS_ACEITE].map(capacidadAnual));

/** Trazado del símbolo según la forma del sector. */
export function simbolo(forma, x, y, r) {
  if (forma === 'cuadrado') return `M${x - r},${y - r} h${2 * r} v${2 * r} h${-2 * r} Z`;
  if (forma === 'rombo') return `M${x},${y - r * 1.3} L${x + r * 1.3},${y} L${x},${y + r * 1.3} L${x - r * 1.3},${y} Z`;
  return null;
}
