import { Fragment, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import empresasData from '../data/empresas.json';
import { fmt } from '../lib/format.js';
import { PALETAS, useTheme } from '../lib/theme.jsx';
import {
  PLANTAS_BIO, BIO_OPERANDO, PLANTAS_ACEITE, REFINERIAS, PUERTOS, RUTAS, RUTAS_ACEITE, RUTAS_PUERTOS,
  distanciaKm, proyectar, kmAUnidades, horas, lugar, nombreGrupo, CATEGORIA_LABEL,
  RENDIMIENTO_ACEITE, DIAS_OPERACION, veces,
} from '../lib/plantas.js';
import {
  mesOffset, mesesEntre, sumaSerie, ventanaActiva, acumular,
} from '../components/mercado/kpiHelpers.jsx';
import MapaEstatico from '../components/mercado/MapaEstatico.jsx';
import './Infografia.css';

/**
 * Infografía del mercado de biodiesel (A3 apaisada, una hoja por pieza):
 * portada con el resumen del mercado, una hoja por elaboradora en
 * operación (KPIs, evolución mensual desde su inicio, aceiteras a 100 km
 * y distancia a refinerías y al puerto), una por grupo económico y el
 * ranking de distancias. Pieza de impresión: siempre en tema claro.
 *
 * PDF: scripts/generar_infografia.py (Chrome headless sobre esta ruta).
 * ?empresa=NOMBRE muestra solo la hoja de esa elaboradora.
 */

const MM = 96 / 25.4; // px CSS por milímetro
const RADIO_KM = 100;
// Radio distinto para las plantas lejos de la zona núcleo (pedido HDO 10/09/2026)
const RADIO_POR_EMPRESA = { 'PAMPA BIO S.A.': 120, ENRESA: 160, 'DIASER S.A.': 250 };
const radioDe = (p) => RADIO_POR_EMPRESA[p.claveRuta] || RADIO_KM;
/** "120 km para Pampa Bio, 160 km para Enresa y 250 km para Diaser" */
const textoRadios = () => {
  const partes = Object.entries(RADIO_POR_EMPRESA).map(([e, km]) => `${km} km para ${lugar(e.replace(/ S\.A\.$/, ''))}`);
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}` : partes[0] || '';
};
const MAX_FILAS_PROV = 12;
const C = PALETAS.light;

// ── datos ──
const REGISTRO = new Map(empresasData.empresas.map((e) => [e.empresa, e]));
const SERIE_MERCADO = sumaSerie(empresasData.empresas);
// Una hoja por planta en operación con coordenadas, en orden alfabético
const PLANTAS = [...BIO_OPERANDO].sort((a, b) => a.claveRuta.localeCompare(b.claveRuta, 'es'));
// Grupos económicos que consolidan más de una empresa (como en la ficha)
const GRUPOS = (() => {
  const m = new Map();
  for (const e of empresasData.empresas) {
    for (const g of [e.grupo, e.supergrupo]) {
      if (!g) continue;
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(e);
    }
  }
  return [...m.entries()].filter(([, l]) => l.length > 1).sort(([a], [b]) => a.localeCompare(b, 'es'));
})();

/** KPIs de una serie: últimos 12 meses de vida activa, 12 previos y total histórico. */
function kpisSerie(serie) {
  const { desde, hasta } = ventanaActiva(serie);
  if (!hasta) return null;
  return {
    desde, hasta, meses: mesesEntre(desde, hasta),
    u12: acumular(serie, mesOffset(hasta, -12), hasta),
    prev: acumular(serie, mesOffset(hasta, -24), mesOffset(hasta, -12)),
    total: acumular(serie, mesOffset(desde, -1), hasta),
  };
}
const KPI_MERCADO = kpisSerie(SERIE_MERCADO);

/** Eje Y: "300 K", "1,2 M" (sin decimales en miles, para que no parta la etiqueta). */
const ejeY = (v) => (Math.abs(v) >= 1e6 ? fmt.compact(v) : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)} K` : String(v));

/** "SAN LORENZO" + "SANTA FE" → "San Lorenzo, Santa Fe" (sin el "Provincia de"). */
const lugarCorto = (localidad, provincia) => (localidad
  ? `${lugar(localidad)}, ${lugar(provincia).replace(/^Provincia de /, '')}`
  : '-');

/** "2025-08" → "Ago 2025" */
const mesLargo = (f) => { const m = fmt.monthShort(f); return m.charAt(0).toUpperCase() + m.slice(1); };

/** Filas del gráfico mensual entre dos meses. */
const filasMensuales = (serie, desde, hasta) => serie
  .filter(([f]) => f >= desde && f <= hasta)
  .map(([f, , cupo, vc, xq, exp]) => ({
    x: f,
    Cupo: cupo ? Math.round(cupo) : null,
    Ventas_corte: Math.round(vc || 0),
    Fuera_de_corte: Math.round(xq || 0),
    Exportaciones: Math.round(exp || 0),
  }));

// ── distancias (mismos criterios que el mapa interactivo) ──
const conRuta = (tabla, origen, destino) => {
  const r = tabla[`${origen.claveRuta}|${destino.idFuente}`] || null;
  return {
    distanciaKm: distanciaKm(origen, destino),
    kmRuta: r ? r.km : null, minRuta: r ? r.min : null, trazado: r ? r.ruta : null,
  };
};
const porKm = (a, b) => (a.kmRuta ?? a.distanciaKm) - (b.kmRuta ?? b.distanciaKm);
const kmDe = (d) => Math.round(d.kmRuta ?? d.distanciaKm);
const proveedoresDe = (p, radioKm = radioDe(p)) => PLANTAS_ACEITE
  .map((a) => ({ ...a, ...conRuta(RUTAS_ACEITE, p, a) }))
  .filter((a) => a.distanciaKm <= radioKm)
  .sort(porKm);
const refineriasDe = (p) => REFINERIAS.map((r) => ({ ...r, ...conRuta(RUTAS, p, r) })).sort(porKm);
const puertosDe = (p) => PUERTOS.map((r) => ({ ...r, ...conRuta(RUTAS_PUERTOS, p, r) })).sort(porKm);

// Radio del punto en px (área ∝ capacidad). Escalas separadas por sector
// (pedido HDO 10/09/2026: elaboradoras de biodiesel bien visibles, aceiteras
// un poco menores): cada sector se mide contra su planta mayor.
const CAP_BIO_MAX = Math.max(...BIO_OPERANDO.map((p) => p.capacidad));
const CAP_ACEITE_MAX = Math.max(...PLANTAS_ACEITE.map((p) => p.capacidad));
const rPx = (p) => (p.sector === 'aceite'
  ? 3.2 + Math.sqrt(p.capacidad / CAP_ACEITE_MAX) * 8.5
  : 4.5 + Math.sqrt(p.capacidad / CAP_BIO_MAX) * 9);

// Nombres del padrón SE, normalizados para la pieza
const NOMBRE_REF = {
  Elicabe: 'Bahía Blanca (Elicabe)',
  'Planta Yacimiento Medanito Este': 'Medanito',
  'Lujan de Cuyo': 'Luján de Cuyo',
  'Campo Duran': 'Campo Durán',
};
const nombreRef = (r) => NOMBRE_REF[r.nombre] || r.nombre;
const empresaCorta = (e) => fmt.truncate(
  (e || '').replace(/ S\.A\.U\..*$| SL - SUCURSAL ARGENTINA$/i, '').replace(/ \(ex .*\)$/i, ''), 24,
);

// Etiquetas fijas del mapa de refinerías (padrón fijo: corrimientos a mano,
// en px, para que no se pisen). La segunda de Luján de Cuyo comparte rótulo.
const ETIQUETAS_REF = {
  8: { texto: 'Campana', dx: -6, dy: -4, anchor: 'end' },
  2: { texto: 'Dock Sud', dx: 6, dy: 2 },
  14: { texto: 'La Plata', dx: 6, dy: 11 },
  9: { texto: 'Bahía Blanca', dx: 6, dy: 3 },
  1: { texto: 'Luján de Cuyo (2)', dx: 6, dy: 3 },
  5: { texto: 'Neuquén', dx: -6, dy: -3, anchor: 'end' },
  12: { texto: 'Plaza Huincul', dx: 6, dy: 10 },
  0: { texto: 'Medanito', dx: -6, dy: 3, anchor: 'end' },
  4: { texto: 'Campo Durán', dx: 6, dy: 3 },
};

/** Razón social sin la forma jurídica, para cuadros angostos. */
const razonCorta = (n) => n.replace(/ (S\.A\.I\.C\.A?|S\.A\.C\.I\.|S\.A\.?|S A|SA|SAICA|S\.R\.L\.?|SRL|Y CÍA\. S\.R\.L\.)$/i, '');

/** Encuadre de un conjunto de puntos con márgenes distintos a lo ancho y a lo alto (lugar para etiquetas). */
function encuadrePuntos(puntos, margenX, margenY, aspecto) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const p of puntos) {
    const [x, y] = proyectar(p.lng, p.lat);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  let w = (x1 - x0) * margenX;
  let h = (y1 - y0) * margenY;
  if (w / h < aspecto) w = h * aspecto; else h = w / aspecto;
  return [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h];
}

/** Encuadre centrado en un punto que hace entrar el círculo de `km` a lo alto. */
function encuadreCirculo(p, km, aspecto, margen = 1.16) {
  const [cx, cy] = proyectar(p.lng, p.lat);
  const r = kmAUnidades(km, p.lat);
  const h = 2 * r * margen;
  const w = h * aspecto;
  return [cx - w / 2, cy - h / 2, w, h];
}

// ── piezas ──
function Var({ actual, base, formato, etiqueta = '12 meses previos' }) {
  if (base == null || actual == null || base === 0) return <div className="ig-kpi-delta">sin base de comparación</div>;
  const d = (actual / base - 1) * 100;
  return (
    <div className="ig-kpi-delta">
      <span className={d >= 0 ? 'pos' : 'neg'}>{d >= 0 ? '▲' : '▼'} {fmt.pct(Math.abs(d))}</span>
      {' '}vs. {etiqueta} ({formato})
    </div>
  );
}

function Kpi({ label, value, unidad, sub, tone, children }) {
  return (
    <div className={`ig-kpi ${tone ? `tone-${tone}` : ''}`}>
      <div className="ig-kpi-label">{label}</div>
      <div className="ig-kpi-val">{value}{unidad && <span className="ig-kpi-unidad"> {unidad}</span>}</div>
      {sub && <div className="ig-kpi-sub">{sub}</div>}
      {children}
    </div>
  );
}

function ChartMensual({ datos, ancho, alto }) {
  const ticks = datos.filter((d) => d.x.endsWith('-01')).map((d) => d.x);
  return (
    <ComposedChart width={ancho} height={alto} data={datos} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={C.grid} vertical={false} />
      <XAxis
        dataKey="x" ticks={ticks} tickFormatter={(v) => v.slice(0, 4)}
        tick={{ fill: C.tick, fontSize: 10 }} stroke={C.axis} tickLine={false}
      />
      <YAxis
        tick={{ fill: C.tick, fontSize: 10 }} tickFormatter={ejeY}
        stroke={C.axis} tickLine={false} axisLine={false} width={46}
      />
      <Area dataKey="Ventas_corte" stackId="v" stroke="none" fill={C.bio} fillOpacity={0.6} isAnimationActive={false} />
      <Area dataKey="Fuera_de_corte" stackId="v" stroke="none" fill={C.neutral} fillOpacity={0.45} isAnimationActive={false} />
      <Area dataKey="Exportaciones" stackId="v" stroke="none" fill={C.oil} fillOpacity={0.55} isAnimationActive={false} />
      <Line dataKey="Cupo" stroke={C.exp} strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
    </ComposedChart>
  );
}

const LEYENDA_CHART = [
  ['Ventas al corte obligatorio', C.bio],
  ['Mercado interno fuera de corte', C.neutral],
  ['Exportaciones', C.oil],
  ['Cupo asignado (línea)', C.exp],
];

function Cabecera({ kicker, titulo, bajada, folio, total }) {
  return (
    <header className="ig-cab">
      <div className="ig-cab-izq">
        <span className="ig-kicker">{kicker}</span>
        <h1>{titulo}</h1>
        {bajada && <p className="ig-cab-baj">{bajada}</p>}
      </div>
      <div className="ig-cab-der">
        <div className="ig-cab-proy">
          Infografía del mercado de biodiesel
          <small>Datos a {mesLargo(KPI_MERCADO.hasta)} · Secretaría de Energía de la Nación</small>
        </div>
        <div className="ig-cab-autor">por <b>Hilarión del Olmo</b> - Presidente - Explora S.A.</div>
        <div className="ig-cab-marca">
          <img src="/brand/explorarg-icon.png" alt="" />
          <span><b>EXPLORARG</b> <i>Marketscan</i></span>
        </div>
        <div className="ig-cab-folio">Hoja {folio} de {total}</div>
      </div>
    </header>
  );
}

function Pie({ nota }) {
  return (
    <footer className="ig-pie">
      <span>
        <b>Fuentes:</b> Secretaría de Energía de la Nación (ventas, cupo, capacidad instalada, padrón de
        refinerías) · plantas aceiteras: relevamiento oct-2024 · distancias por ruta: OSRM sobre OpenStreetMap
        {nota ? ` · ${nota}` : ''}
      </span>
      <span>Elaboración <b>EXPLORARG</b> Marketscan · explorarg.com</span>
    </footer>
  );
}

// ── hoja por empresa ──
function HojaEmpresa({ planta, folio, total }) {
  const reg = REGISTRO.get(planta.claveRuta) || { serie: [] };
  const k = useMemo(() => kpisSerie(reg.serie), [reg]);
  const datos = useMemo(() => (k ? filasMensuales(reg.serie, k.desde, k.hasta) : []), [reg, k]);
  const radioKm = radioDe(planta);
  const proveedores = useMemo(() => proveedoresDe(planta, radioKm), [planta, radioKm]);
  const refinerias = useMemo(() => refineriasDe(planta), [planta]);
  const puertos = useMemo(() => puertosDe(planta), [planta]);

  const molienda = proveedores.reduce((s, a) => s + a.capacidad, 0);
  const aceite = molienda * RENDIMIENTO_ACEITE * DIAS_OPERACION;
  const cobertura = planta.capacidad > 0 ? aceite / planta.capacidad : null;
  const visibles = proveedores.slice(0, MAX_FILAS_PROV);
  const resto = proveedores.slice(MAX_FILAS_PROV);
  const puerto = puertos[0];
  const destinos = [...refinerias];

  // Mapas: el de proveedores encuadra el círculo de 100 km; el de refinerías, el país
  const mapaProv = { ancho: Math.round(106 * MM), alto: Math.round(120 * MM) };
  const mapaRef = { ancho: Math.round(82 * MM), alto: Math.round(120 * MM) };
  const vbProv = encuadreCirculo(planta, radioKm, mapaProv.ancho / mapaProv.alto);
  const vbRef = encuadrePuntos([planta, ...REFINERIAS, ...PUERTOS], 1.6, 1.14, mapaRef.ancho / mapaRef.alto);

  const categoria = planta.categoria ? CATEGORIA_LABEL[planta.categoria] || planta.categoria : null;
  const grupoReal = GRUPOS.some(([g]) => g === reg.grupo) ? reg.grupo : null;
  const kicker = ['Elaboradora de biodiesel', categoria, grupoReal ? nombreGrupo(grupoReal) : 'Empresa independiente']
    .filter(Boolean).join(' · ');
  const bajada = [
    planta.localidad ? `${lugar(planta.localidad)}, ${lugar(planta.provincia)}` : null,
    `Capacidad instalada ${fmt.int(planta.capacidad)} t/año`,
    reg.camara ? `Cámara ${reg.camara}` : null,
    k ? `En el registro desde ${mesLargo(k.desde)} (${k.meses} meses)` : null,
  ].filter(Boolean).join(' · ');

  const participacion = k && KPI_MERCADO.u12.vc > 0 ? (k.u12.vc / KPI_MERCADO.u12.vc) * 100 : null;
  const participacionPrev = k && KPI_MERCADO.prev.vc > 0 ? (k.prev.vc / KPI_MERCADO.prev.vc) * 100 : null;
  const cumpl = k && k.u12.cupo > 0 ? (k.u12.vc / k.u12.cupo) * 100 : null;
  const cumplPrev = k && k.prev.cupo > 0 ? (k.prev.vc / k.prev.cupo) * 100 : null;
  const uso = k && planta.capacidad > 0 ? (k.u12.prod / planta.capacidad) * 100 : null;

  return (
    <section className="ig-hoja ig-hoja-empresa" data-empresa={planta.claveRuta}>
      <Cabecera kicker={kicker} titulo={planta.nombre} bajada={bajada} folio={folio} total={total} />

      {k && (
        <div className="ig-kpis">
          <p className="ig-kpi-periodo">
            Acumulado últimos 12 meses · {mesLargo(mesOffset(k.hasta, -11))} / {mesLargo(k.hasta)} ·
            variación contra los 12 meses previos
          </p>
          <div className="ig-kpi-grid">
            <Kpi label="Producción" value={fmt.int(k.u12.prod)} unidad="ton">
              <Var actual={k.u12.prod} base={k.prev.prod} formato={`${fmt.compact(k.prev.prod)} ton`} />
            </Kpi>
            <Kpi label="Ventas al corte" value={fmt.int(k.u12.vc)} unidad="ton">
              <Var actual={k.u12.vc} base={k.prev.vc} formato={`${fmt.compact(k.prev.vc)} ton`} />
            </Kpi>
            <Kpi
              label="Cumplimiento del cupo"
              value={cumpl != null ? fmt.pct(cumpl, 0) : '-'}
              sub={cumpl != null ? `${fmt.int(k.u12.cupo)} ton asignadas` : 'sin cupo asignado'}
              tone={cumpl == null ? null : cumpl >= 95 ? 'pos' : 'neg'}
            >
              {cumpl != null && <Var actual={cumpl} base={cumplPrev} formato={cumplPrev != null ? fmt.pct(cumplPrev, 0) : '-'} />}
            </Kpi>
            <Kpi
              label="Exportaciones"
              value={fmt.int(k.u12.exp)} unidad="ton"
              sub={k.u12.exp === 0 && k.prev.exp === 0 ? 'sin exportaciones en el período' : null}
            >
              {(k.u12.exp > 0 || k.prev.exp > 0) && (
                <Var actual={k.u12.exp} base={k.prev.exp} formato={`${fmt.compact(k.prev.exp)} ton`} />
              )}
            </Kpi>
            <Kpi
              label="Participación"
              value={participacion != null ? fmt.pct(participacion, 1) : '-'}
              sub="de las ventas al corte del mercado"
              tone="info"
            >
              <Var actual={participacion} base={participacionPrev} formato={participacionPrev != null ? fmt.pct(participacionPrev, 1) : '-'} />
            </Kpi>
            <Kpi
              label="Uso de la capacidad"
              value={uso != null ? fmt.pct(uso, 0) : '-'}
              sub={`producción sobre ${fmt.int(planta.capacidad)} t/año instaladas`}
              tone="info"
            >
              <div className="ig-kpi-delta">
                acumulado histórico: {fmt.int(k.total.prod)} ton producidas · {fmt.int(k.total.vc)} ton al corte
              </div>
            </Kpi>
          </div>
        </div>
      )}

      <div className="ig-chart">
        <div className="ig-blq-cab">
          <span className="ig-oblea">Evolución mensual{k ? ` desde ${mesLargo(k.desde)}` : ''}</span>
          <span className="ig-blq-nota">toneladas por mes · ventas por destino, apiladas · línea: cupo asignado</span>
        </div>
        <ChartMensual datos={datos} ancho={Math.round(398 * MM)} alto={Math.round(64 * MM)} />
        <div className="ig-leyenda">
          {LEYENDA_CHART.map(([t, c]) => (
            <span key={t}><i style={{ background: c }} />{t}</span>
          ))}
        </div>
      </div>

      <div className="ig-paneles">
        <section className="ig-panel">
          <div className="ig-blq-cab">
            <span className="ig-oblea">Proveedores de aceite a menos de {radioKm} km</span>
            <span className="ig-blq-nota">radio en línea recta · lista por km de ruta</span>
          </div>
          <p className="ig-panel-resumen">
            <b>{proveedores.length} {proveedores.length === 1 ? 'aceitera' : 'aceiteras'}</b>
            {proveedores.length > 0 && (
              <>
                {' '}· {fmt.int(molienda)} t/día de molienda · {fmt.int(aceite)} t/año de aceite
                {cobertura != null && (
                  <> · cubre <b>{veces(cobertura)} veces</b> la capacidad anual de la planta</>
                )}
              </>
            )}
          </p>
          <div className="ig-panel-cuerpo">
            <div className="ig-mapa" style={{ width: mapaProv.ancho, height: mapaProv.alto }}>
              <MapaEstatico
                ancho={mapaProv.ancho} alto={mapaProv.alto} viewBox={vbProv}
                circulo={{ lat: planta.lat, lng: planta.lng, km: radioKm }}
                rutas={proveedores.filter((a) => a.trazado).map((a) => ({ trazado: a.trazado, clase: 'suave' }))}
                puntos={[
                  ...proveedores.map((a) => ({ lat: a.lat, lng: a.lng, rPx: rPx(a), clase: 'aceite' })),
                  { lat: planta.lat, lng: planta.lng, rPx: rPx(planta), clase: 'origen' },
                ]}
                etiquetas={[
                  { lat: planta.lat, lng: planta.lng, texto: fmt.truncate(planta.nombre, 30), dx: -rPx(planta) - 5, dy: 3.5, anchor: 'end', tam: 10, clase: 'origen' },
                ]}
              />
            </div>
            <table className="ig-tabla">
              <colgroup><col style={{ width: '6.5mm' }} /><col /><col style={{ width: '24mm' }} /><col style={{ width: '12mm' }} /><col style={{ width: '13mm' }} /></colgroup>
              <thead>
                <tr><th>#</th><th>Aceitera</th><th>Localidad</th><th className="num">km ruta</th><th className="num">t/día</th></tr>
              </thead>
              <tbody>
                {visibles.map((a, i) => (
                  <tr key={a.id}>
                    <td className="num">{i + 1}</td>
                    <td>{fmt.truncate(razonCorta(a.nombre), 30)}</td>
                    <td>{fmt.truncate(a.localidad, 16)}</td>
                    <td className="num">{a.kmRuta != null ? fmt.int(Math.round(a.kmRuta)) : `${Math.round(a.distanciaKm)}*`}</td>
                    <td className="num">{fmt.int(a.capacidad)}</td>
                  </tr>
                ))}
                {resto.length > 0 && (
                  <tr className="ig-tabla-resto">
                    <td />
                    <td colSpan={3}>y {resto.length} más en el radio ({kmDe(resto[0])} a {kmDe(resto.at(-1))} km por ruta)</td>
                    <td className="num">{fmt.int(resto.reduce((s, a) => s + a.capacidad, 0))}</td>
                  </tr>
                )}
                {proveedores.length === 0 && (
                  <tr><td colSpan={5} className="ig-tabla-vacia">Sin aceiteras a menos de {radioKm} km</td></tr>
                )}
              </tbody>
              {proveedores.length > 0 && (
                <tfoot>
                  <tr><td /><td colSpan={2}>Molienda total en el radio (t/día)</td><td colSpan={2} className="num">{fmt.int(molienda)}</td></tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        <section className="ig-panel">
          <div className="ig-blq-cab">
            <span className="ig-oblea">Distancia a refinerías y al puerto</span>
            <span className="ig-blq-nota">recorrido por ruta desde la planta · de la más cercana a la más lejana</span>
          </div>
          <p className="ig-panel-resumen">
            Refinería más cercana: <b>{nombreRef(destinos[0])}</b> ({empresaCorta(destinos[0].empresa)}) a <b>{fmt.int(kmDe(destinos[0]))} km</b>
            {puerto && <> · {puerto.nombre} a <b>{fmt.int(kmDe(puerto))} km</b></>}
          </p>
          <div className="ig-panel-cuerpo">
            <div className="ig-mapa" style={{ width: mapaRef.ancho, height: mapaRef.alto }}>
              <MapaEstatico
                ancho={mapaRef.ancho} alto={mapaRef.alto} viewBox={vbRef}
                rutas={[
                  ...destinos.map((r) => (r.trazado
                    ? { trazado: r.trazado }
                    : { desde: planta, lat: r.lat, lng: r.lng, clase: 'recta' })),
                  ...(puerto ? [puerto.trazado ? { trazado: puerto.trazado, clase: 'puerto' } : { desde: planta, lat: puerto.lat, lng: puerto.lng, clase: 'puerto recta' }] : []),
                ]}
                puntos={[
                  ...destinos.map((r) => ({ lat: r.lat, lng: r.lng, rPx: 3.4, forma: 'cuadrado', clase: 'refinerias' })),
                  ...(puerto ? [{ lat: puerto.lat, lng: puerto.lng, rPx: 3.6, forma: 'rombo', clase: 'puerto' }] : []),
                  { lat: planta.lat, lng: planta.lng, rPx: 5.5, clase: 'origen' },
                ]}
                etiquetas={destinos
                  .filter((r) => ETIQUETAS_REF[r.idFuente])
                  .map((r) => ({ lat: r.lat, lng: r.lng, tam: 8.5, ...ETIQUETAS_REF[r.idFuente] }))}
              />
            </div>
            <table className="ig-tabla">
              <colgroup><col style={{ width: '6.5mm' }} /><col /><col style={{ width: '36mm' }} /><col style={{ width: '13mm' }} /><col style={{ width: '19mm' }} /></colgroup>
              <thead>
                <tr><th>#</th><th>Destino</th><th>Empresa</th><th className="num">km ruta</th><th className="num">tiempo</th></tr>
              </thead>
              <tbody>
                {puerto && (
                  <tr className="ig-tabla-puerto">
                    <td><i className="ig-rombo" /></td>
                    <td>{puerto.nombre.replace(/^Puerto /, 'Pto. ')}</td>
                    <td>puerto de exportación</td>
                    <td className="num">{fmt.int(kmDe(puerto))}</td>
                    <td className="num">{puerto.minRuta != null ? horas(puerto.minRuta) : '-'}</td>
                  </tr>
                )}
                {destinos.map((r, i) => (
                  <tr key={r.id}>
                    <td className="num">{i + 1}</td>
                    <td>{nombreRef(r)}</td>
                    <td>{empresaCorta(r.empresa)}</td>
                    <td className="num">{fmt.int(kmDe(r))}{r.kmRuta == null ? '*' : ''}</td>
                    <td className="num">{r.minRuta != null ? horas(r.minRuta) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Pie nota={`aceite anual = molienda × ${Math.round(RENDIMIENTO_ACEITE * 100)}% de rendimiento × ${DIAS_OPERACION} días · * = distancia en línea recta (sin ruta calculada)`} />
    </section>
  );
}

// ── portada: resumen del mercado ──
const CAPACIDAD_OPERANDO = BIO_OPERANDO.reduce((s, p) => s + p.capacidad, 0);
const cumplimientoDe = (a) => (a.cupo > 0 ? (a.vc / a.cupo) * 100 : null);

function KpisMercado({ k }) {
  const cumpl = cumplimientoDe(k.u12);
  const cumplPrev = cumplimientoDe(k.prev);
  return (
    <div className="ig-kpis">
      <p className="ig-kpi-periodo">
        Acumulado últimos 12 meses · {mesLargo(mesOffset(k.hasta, -11))} / {mesLargo(k.hasta)} ·
        variación contra los 12 meses previos · todas las elaboradoras
      </p>
      <div className="ig-kpi-grid">
        <Kpi label="Producción" value={fmt.int(k.u12.prod)} unidad="ton">
          <Var actual={k.u12.prod} base={k.prev.prod} formato={`${fmt.compact(k.prev.prod)} ton`} />
        </Kpi>
        <Kpi label="Ventas al corte" value={fmt.int(k.u12.vc)} unidad="ton">
          <Var actual={k.u12.vc} base={k.prev.vc} formato={`${fmt.compact(k.prev.vc)} ton`} />
        </Kpi>
        <Kpi
          label="Cumplimiento del cupo" value={cumpl != null ? fmt.pct(cumpl, 0) : '-'}
          sub={`${fmt.int(k.u12.cupo)} ton asignadas`} tone={cumpl == null ? null : cumpl >= 95 ? 'pos' : 'neg'}
        >
          <Var actual={cumpl} base={cumplPrev} formato={cumplPrev != null ? fmt.pct(cumplPrev, 0) : '-'} />
        </Kpi>
        <Kpi label="Exportaciones" value={fmt.int(k.u12.exp)} unidad="ton">
          <Var actual={k.u12.exp} base={k.prev.exp} formato={`${fmt.compact(k.prev.exp)} ton`} />
        </Kpi>
        <Kpi label="Elaboradoras" value={String(empresasData.empresas.length)} sub="en el registro histórico" tone="info">
          <div className="ig-kpi-delta">{BIO_OPERANDO.length} plantas en operación con hoja propia</div>
        </Kpi>
        <Kpi label="Capacidad instalada" value={fmt.int(CAPACIDAD_OPERANDO)} unidad="t/año" sub="plantas en operación" tone="info">
          <div className="ig-kpi-delta">
            uso: {fmt.pct((k.u12.prod / CAPACIDAD_OPERANDO) * 100, 0)} de la capacidad con la producción de 12 meses
          </div>
        </Kpi>
      </div>
    </div>
  );
}

function Portada({ folio, total, hojas }) {
  const k = KPI_MERCADO;
  const datos = useMemo(() => filasMensuales(SERIE_MERCADO, k.desde, k.hasta), [k]);
  const mapa = { ancho: Math.round(96 * MM), alto: Math.round(124 * MM) };
  const vb = encuadrePuntos(BIO_OPERANDO, 1.5, 1.14, mapa.ancho / mapa.alto);
  const folioDe = new Map(hojas.filter((h) => h.tipo === 'empresa').map((h) => [h.planta.claveRuta, h.folio]));
  // Índice: las 28 plantas por capacidad, con sus KPIs de 12 meses
  const indice = [...BIO_OPERANDO].map((p) => {
    const reg = REGISTRO.get(p.claveRuta);
    const kp = reg ? kpisSerie(reg.serie) : null;
    return { planta: p, reg, kp, folio: folioDe.get(p.claveRuta) };
  });
  const grupos = hojas.filter((h) => h.tipo === 'grupo');
  return (
    <section className="ig-hoja ig-hoja-portada">
      <Cabecera
        kicker="Infografía · Mercado de biodiesel en Argentina"
        titulo="El mercado de biodiesel, planta por planta"
        bajada={`Resumen del mercado, el cuadro de proveedores de aceite por grupo económico, una hoja por elaboradora en operación (${BIO_OPERANDO.length}) con su evolución mensual, sus proveedores de aceite en un radio de ${RADIO_KM} km (${textoRadios()}) y su distancia a refinerías y al puerto, una hoja por grupo económico (${grupos.length}) y el ranking de distancias.`}
        folio={folio} total={total}
      />
      <KpisMercado k={k} />
      <div className="ig-chart">
        <div className="ig-blq-cab">
          <span className="ig-oblea">Evolución mensual del mercado desde {mesLargo(k.desde)}</span>
          <span className="ig-blq-nota">toneladas por mes · ventas por destino, apiladas · línea: cupo asignado</span>
        </div>
        <ChartMensual datos={datos} ancho={Math.round(398 * MM)} alto={Math.round(52 * MM)} />
        <div className="ig-leyenda">
          {LEYENDA_CHART.map(([t, c]) => <span key={t}><i style={{ background: c }} />{t}</span>)}
        </div>
      </div>
      <div className="ig-paneles ig-paneles-portada">
        <section className="ig-panel">
          <div className="ig-blq-cab">
            <span className="ig-oblea">Plantas en operación</span>
            <span className="ig-blq-nota">punto proporcional a la capacidad</span>
          </div>
          <div className="ig-mapa" style={{ width: mapa.ancho, height: mapa.alto }}>
            <MapaEstatico
              ancho={mapa.ancho} alto={mapa.alto} viewBox={vb}
              puntos={BIO_OPERANDO.map((p) => ({ lat: p.lat, lng: p.lng, rPx: rPx(p) }))}
              etiquetas={[
                { lat: -32.95, lng: -60.65, texto: 'Rosario', dx: -8, dy: 3, anchor: 'end', tam: 8, clase: 'lugar' },
                { lat: -34.6, lng: -58.4, texto: 'Buenos Aires', dx: 8, dy: 3, tam: 8, clase: 'lugar' },
                { lat: -38.72, lng: -62.27, texto: 'Bahía Blanca', dx: -8, dy: 3, anchor: 'end', tam: 8, clase: 'lugar' },
                { lat: -31.4, lng: -64.18, texto: 'Córdoba', dx: -8, dy: 3, anchor: 'end', tam: 8, clase: 'lugar' },
              ]}
            />
          </div>
        </section>
        <section className="ig-panel">
          <div className="ig-blq-cab">
            <span className="ig-oblea">Índice · las {BIO_OPERANDO.length} elaboradoras en operación, por capacidad instalada</span>
            <span className="ig-blq-nota">últimos 12 meses de cada planta · hoja: número de página de su ficha</span>
          </div>
          <table className="ig-tabla ig-tabla-indice">
            <colgroup>
              <col style={{ width: '6mm' }} /><col /><col style={{ width: '22mm' }} /><col style={{ width: '40mm' }} />
              <col style={{ width: '19mm' }} /><col style={{ width: '19mm' }} /><col style={{ width: '19mm' }} /><col style={{ width: '15mm' }} /><col style={{ width: '9mm' }} />
            </colgroup>
            <thead>
              <tr>
                <th>#</th><th>Elaboradora</th><th>Categoría</th><th>Localidad</th>
                <th className="num">Capacidad<br />t/año</th><th className="num">Producción<br />ton</th><th className="num">Ventas al<br />corte ton</th><th className="num">Cumpli-<br />miento</th><th className="num">Hoja</th>
              </tr>
            </thead>
            <tbody>
              {indice.map(({ planta, kp, folio: f }, i) => {
                const c = kp ? cumplimientoDe(kp.u12) : null;
                return (
                  <tr key={planta.id}>
                    <td className="num">{i + 1}</td>
                    <td>{planta.nombre}</td>
                    <td>{planta.categoria ? CATEGORIA_LABEL[planta.categoria] || planta.categoria : '-'}</td>
                    <td>{lugarCorto(planta.localidad, planta.provincia)}</td>
                    <td className="num">{fmt.int(planta.capacidad)}</td>
                    <td className="num">{kp ? fmt.int(kp.u12.prod) : '-'}</td>
                    <td className="num">{kp ? fmt.int(kp.u12.vc) : '-'}</td>
                    <td className={`num ${c == null ? '' : c >= 95 ? 'pos' : 'neg'}`}>{c != null ? fmt.pct(c, 0) : '-'}</td>
                    <td className="num">{f}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
      <Pie />
    </section>
  );
}

// ── hoja por grupo económico ──
function HojaGrupo({ grupo, miembros, folio, total, hojas }) {
  const serie = useMemo(() => sumaSerie(miembros), [miembros]);
  const k = useMemo(() => kpisSerie(serie), [serie]);
  const datos = useMemo(() => (k ? filasMensuales(serie, k.desde, k.hasta) : []), [serie, k]);
  const nombres = new Set(miembros.map((e) => e.empresa));
  const plantas = PLANTAS_BIO.filter((p) => nombres.has(p.claveRuta));
  const operando = plantas.filter((p) => p.condicion === 'ON');
  const capacidad = operando.reduce((s, p) => s + p.capacidad, 0);
  const folioDe = new Map(hojas.filter((h) => h.tipo === 'empresa').map((h) => [h.planta.claveRuta, h.folio]));
  const cats = new Set(miembros.map((e) => e.categoria).filter(Boolean));
  const kicker = ['Grupo económico', `${miembros.length} empresas`, cats.size === 1 ? CATEGORIA_LABEL[[...cats][0]] || [...cats][0] : null]
    .filter(Boolean).join(' · ');
  const bajada = [
    `${operando.length} ${operando.length === 1 ? 'planta' : 'plantas'} en operación · capacidad instalada ${fmt.int(capacidad)} t/año`,
    k ? `En el registro desde ${mesLargo(k.desde)}` : null,
  ].filter(Boolean).join(' · ');

  const participacion = k && KPI_MERCADO.u12.vc > 0 ? (k.u12.vc / KPI_MERCADO.u12.vc) * 100 : null;
  const participacionPrev = k && KPI_MERCADO.prev.vc > 0 ? (k.prev.vc / KPI_MERCADO.prev.vc) * 100 : null;
  const cumpl = k ? cumplimientoDe(k.u12) : null;
  const cumplPrev = k ? cumplimientoDe(k.prev) : null;
  const uso = k && capacidad > 0 ? (k.u12.prod / capacidad) * 100 : null;

  const mapa = { ancho: Math.round(150 * MM), alto: Math.round(118 * MM) };
  const vb = operando.length
    ? encuadrePuntos(operando, 1.7, 1.5, mapa.ancho / mapa.alto)
    : encuadrePuntos(BIO_OPERANDO, 1.3, 1.14, mapa.ancho / mapa.alto);
  // Rótulos: las plantas de una misma localidad (a menos de ~5 km) comparten
  // un rótulo, y los rótulos alternan izquierda / derecha para no pisarse
  const racimos = new Map();
  for (const p of operando) {
    const clave = `${Math.round(p.lat * 20)},${Math.round(p.lng * 20)}`;
    if (!racimos.has(clave)) racimos.set(clave, []);
    racimos.get(clave).push(p);
  }
  const corto = razonCorta;
  const etiquetas = [...racimos.values()].sort((a, b) => a[0].lat - b[0].lat).map((ps, i) => ({
    lat: ps[0].lat, lng: ps[0].lng, tam: 9, clase: 'origen',
    texto: ps.length === 1
      ? corto(ps[0].claveRuta)
      : `${lugar(ps[0].localidad || '')}: ${ps.map((p) => corto(p.claveRuta)).join(' · ')}`,
    dx: (i % 2 ? 1 : -1) * (Math.max(...ps.map(rPx)) + 5), dy: 3.5, anchor: i % 2 ? 'start' : 'end',
  }));
  // Cuadro de empresas del grupo: KPIs de 12 meses de cada una
  const filas = miembros.map((e) => {
    const kp = kpisSerie(e.serie);
    const planta = plantas.find((p) => p.claveRuta === e.empresa);
    return { e, kp, planta, folio: folioDe.get(e.empresa) };
  }).sort((a, b) => (b.kp?.u12.vc || 0) - (a.kp?.u12.vc || 0));

  return (
    <section className="ig-hoja ig-hoja-grupo" data-grupo={grupo}>
      <Cabecera kicker={kicker} titulo={grupo} bajada={bajada} folio={folio} total={total} />
      {k && (
        <div className="ig-kpis">
          <p className="ig-kpi-periodo">
            Acumulado últimos 12 meses · {mesLargo(mesOffset(k.hasta, -11))} / {mesLargo(k.hasta)} ·
            variación contra los 12 meses previos · suma de las {miembros.length} empresas del grupo
          </p>
          <div className="ig-kpi-grid">
            <Kpi label="Producción" value={fmt.int(k.u12.prod)} unidad="ton">
              <Var actual={k.u12.prod} base={k.prev.prod} formato={`${fmt.compact(k.prev.prod)} ton`} />
            </Kpi>
            <Kpi label="Ventas al corte" value={fmt.int(k.u12.vc)} unidad="ton">
              <Var actual={k.u12.vc} base={k.prev.vc} formato={`${fmt.compact(k.prev.vc)} ton`} />
            </Kpi>
            <Kpi
              label="Cumplimiento del cupo" value={cumpl != null ? fmt.pct(cumpl, 0) : '-'}
              sub={cumpl != null ? `${fmt.int(k.u12.cupo)} ton asignadas` : 'sin cupo asignado'}
              tone={cumpl == null ? null : cumpl >= 95 ? 'pos' : 'neg'}
            >
              {cumpl != null && <Var actual={cumpl} base={cumplPrev} formato={cumplPrev != null ? fmt.pct(cumplPrev, 0) : '-'} />}
            </Kpi>
            <Kpi
              label="Exportaciones" value={fmt.int(k.u12.exp)} unidad="ton"
              sub={k.u12.exp === 0 && k.prev.exp === 0 ? 'sin exportaciones en el período' : null}
            >
              {(k.u12.exp > 0 || k.prev.exp > 0) && (
                <Var actual={k.u12.exp} base={k.prev.exp} formato={`${fmt.compact(k.prev.exp)} ton`} />
              )}
            </Kpi>
            <Kpi label="Participación" value={participacion != null ? fmt.pct(participacion, 1) : '-'} sub="de las ventas al corte del mercado" tone="info">
              <Var actual={participacion} base={participacionPrev} formato={participacionPrev != null ? fmt.pct(participacionPrev, 1) : '-'} />
            </Kpi>
            <Kpi label="Uso de la capacidad" value={uso != null ? fmt.pct(uso, 0) : '-'} sub={`producción sobre ${fmt.int(capacidad)} t/año en operación`} tone="info">
              <div className="ig-kpi-delta">
                acumulado histórico: {fmt.int(k.total.prod)} ton producidas · {fmt.int(k.total.vc)} ton al corte
              </div>
            </Kpi>
          </div>
        </div>
      )}
      <div className="ig-chart">
        <div className="ig-blq-cab">
          <span className="ig-oblea">Evolución mensual del grupo{k ? ` desde ${mesLargo(k.desde)}` : ''}</span>
          <span className="ig-blq-nota">toneladas por mes · suma de las empresas del grupo · línea: cupo asignado</span>
        </div>
        <ChartMensual datos={datos} ancho={Math.round(398 * MM)} alto={Math.round(60 * MM)} />
        <div className="ig-leyenda">
          {LEYENDA_CHART.map(([t, c]) => <span key={t}><i style={{ background: c }} />{t}</span>)}
        </div>
      </div>
      <div className="ig-paneles ig-paneles-grupo">
        <section className="ig-panel">
          <div className="ig-blq-cab">
            <span className="ig-oblea">Disposición de las plantas</span>
            <span className="ig-blq-nota">plantas en operación del grupo · tamaño según capacidad</span>
          </div>
          <div className="ig-mapa" style={{ width: mapa.ancho, height: mapa.alto }}>
            <MapaEstatico
              ancho={mapa.ancho} alto={mapa.alto} viewBox={vb}
              puntos={[
                ...BIO_OPERANDO.filter((p) => !nombres.has(p.claveRuta)).map((p) => ({ lat: p.lat, lng: p.lng, rPx: rPx(p), clase: 'otras' })),
                ...operando.map((p) => ({ lat: p.lat, lng: p.lng, rPx: rPx(p), clase: 'origen' })),
              ]}
              etiquetas={etiquetas}
            />
          </div>
        </section>
        <section className="ig-panel">
          <div className="ig-blq-cab">
            <span className="ig-oblea">Las empresas del grupo</span>
            <span className="ig-blq-nota">últimos 12 meses de cada empresa · hoja: página de su ficha (solo plantas en operación)</span>
          </div>
          <table className="ig-tabla">
            <colgroup>
              <col /><col style={{ width: '44mm' }} /><col style={{ width: '17mm' }} />
              <col style={{ width: '19mm' }} /><col style={{ width: '19mm' }} /><col style={{ width: '19mm' }} /><col style={{ width: '15mm' }} /><col style={{ width: '9mm' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Empresa</th><th>Localidad</th><th>Planta</th>
                <th className="num">Capacidad<br />t/año</th><th className="num">Producción<br />ton</th><th className="num">Ventas al<br />corte ton</th><th className="num">Cumpli-<br />miento</th><th className="num">Hoja</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ e, kp, planta, folio: f }) => {
                const c = kp ? cumplimientoDe(kp.u12) : null;
                return (
                  <tr key={e.empresa}>
                    <td>{e.empresa}</td>
                    <td>{lugarCorto(e.localidad, e.provincia)}</td>
                    <td>{planta ? (planta.condicion === 'ON' ? 'operando' : 'parada') : 'sin planta'}</td>
                    <td className="num">{planta ? fmt.int(planta.capacidad) : '-'}</td>
                    <td className="num">{kp ? fmt.int(kp.u12.prod) : '-'}</td>
                    <td className="num">{kp ? fmt.int(kp.u12.vc) : '-'}</td>
                    <td className={`num ${c == null ? '' : c >= 95 ? 'pos' : 'neg'}`}>{c != null ? fmt.pct(c, 0) : '-'}</td>
                    <td className="num">{f || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total del grupo</td>
                <td className="num">{fmt.int(capacidad)}</td>
                <td className="num">{k ? fmt.int(k.u12.prod) : '-'}</td>
                <td className="num">{k ? fmt.int(k.u12.vc) : '-'}</td>
                <td className="num">{cumpl != null ? fmt.pct(cumpl, 0) : '-'}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </section>
      </div>
      <Pie nota="sin planta propia = empresa del grupo que vende desde una planta de otra sociedad" />
    </section>
  );
}

// ── ranking de distancias ──
// Destinos del ranking: el puerto y las refinerías principales (ids del padrón SE)
const RANKING_DESTINOS = [
  { tipo: 'puerto', id: 0, titulo: 'Puerto General San Martín', sub: 'puerto de exportación' },
  { tipo: 'cercana', titulo: 'Refinería más cercana', sub: 'la de menor recorrido para cada planta' },
  { tipo: 'refineria', id: 14, titulo: 'La Plata', sub: 'YPF' },
  { tipo: 'refineria', id: 2, titulo: 'Dock Sud', sub: 'Raízen' },
  { tipo: 'refineria', id: 8, titulo: 'Campana', sub: 'Pan American Energy' },
  { tipo: 'refineria', id: 1, titulo: 'Luján de Cuyo', sub: 'YPF' },
  { tipo: 'refineria', id: 9, titulo: 'Bahía Blanca', sub: 'Refinería Bahía Blanca (Elicabe)' },
];

function HojaRanking({ folio, total, hojas }) {
  const folioDe = new Map(hojas.filter((h) => h.tipo === 'empresa').map((h) => [h.planta.claveRuta, h.folio]));
  const tablas = RANKING_DESTINOS.map((d) => {
    const filas = BIO_OPERANDO.map((p) => {
      if (d.tipo === 'cercana') {
        const r = refineriasDe(p)[0];
        return { planta: p, km: kmDe(r), detalle: nombreRef(r).replace(' (Elicabe)', '') };
      }
      const destino = d.tipo === 'puerto' ? PUERTOS.find((x) => x.idFuente === d.id) : REFINERIAS.find((x) => x.idFuente === d.id);
      const tabla = d.tipo === 'puerto' ? RUTAS_PUERTOS : RUTAS;
      const r = conRuta(tabla, p, destino);
      return { planta: p, km: Math.round(r.kmRuta ?? r.distanciaKm), recta: r.kmRuta == null };
    }).sort((a, b) => a.km - b.km);
    return { ...d, filas };
  });
  return (
    <section className="ig-hoja ig-hoja-ranking">
      <Cabecera
        kicker="Ranking de distancias · kilómetros por ruta"
        titulo={`Las ${BIO_OPERANDO.length} elaboradoras, de la más cercana a la más lejana`}
        bajada="Recorrido por ruta (OSRM sobre OpenStreetMap) desde cada planta en operación hasta el puerto de exportación, hasta la refinería más cercana y hasta las principales refinerías habilitadas por la Secretaría de Energía."
        folio={folio} total={total}
      />
      <div className="ig-ranking">
        {tablas.map((t) => (
          <section className="ig-panel" key={t.titulo}>
            <div className="ig-blq-cab">
              <span className="ig-oblea">{t.titulo}</span>
            </div>
            <p className="ig-panel-resumen">{t.sub}</p>
            <table className={`ig-tabla ig-tabla-ranking ${t.tipo === 'cercana' ? 'con-detalle' : ''}`}>
              <colgroup>
                <col style={{ width: '5.5mm' }} /><col />
                {t.tipo === 'cercana' && <col style={{ width: '23mm' }} />}
                <col style={{ width: '11mm' }} />
              </colgroup>
              <thead>
                <tr><th>#</th><th>Elaboradora</th>{t.tipo === 'cercana' && <th>Refinería</th>}<th className="num">km</th></tr>
              </thead>
              <tbody>
                {t.filas.map(({ planta, km, detalle, recta }, i) => (
                  <tr key={planta.id}>
                    <td className="num">{i + 1}</td>
                    <td>{razonCorta(planta.claveRuta)}</td>
                    {t.tipo === 'cercana' && <td>{detalle}</td>}
                    <td className="num">{fmt.int(km)}{recta ? '*' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <Pie nota={`hoja de cada elaboradora: ver el índice de la portada · * = distancia en línea recta (sin ruta calculada)`} />
    </section>
  );
}

// ── resumen: proveedores de aceite por grupo económico ──
// Cada planta con su radio, sus aceiteras, la molienda y la cobertura; las
// plantas se agrupan por grupo económico (supergrupo si lo hay) y las
// independientes por categoría. Los totales de grupo cuentan aceiteras
// distintas (la unión de los radios de sus plantas).
const filaProveedores = (planta) => {
  const radio = radioDe(planta);
  const prov = proveedoresDe(planta, radio);
  const molienda = prov.reduce((t, a) => t + a.capacidad, 0);
  const aceite = molienda * RENDIMIENTO_ACEITE * DIAS_OPERACION;
  const reg = REGISTRO.get(planta.claveRuta) || {};
  return {
    planta, reg, radio, prov, molienda, aceite,
    cobertura: planta.capacidad > 0 ? aceite / planta.capacidad : null,
    cercana: prov[0] || null,
    subgrupo: reg.supergrupo && reg.grupo !== reg.supergrupo ? reg.grupo : null,
  };
};
const totalesDe = (filas) => {
  const distintas = new Map();
  for (const f of filas) for (const a of f.prov) distintas.set(a.id, a);
  const molienda = [...distintas.values()].reduce((t, a) => t + a.capacidad, 0);
  const aceite = molienda * RENDIMIENTO_ACEITE * DIAS_OPERACION;
  const capacidad = filas.reduce((t, f) => t + f.planta.capacidad, 0);
  return { plantas: filas.length, capacidad, aceiteras: distintas.size, molienda, aceite, cobertura: capacidad > 0 ? aceite / capacidad : null };
};
const porCapacidad = (a, b) => b.planta.capacidad - a.planta.capacidad;
const SECCIONES_RESUMEN = (() => {
  const grupos = new Map();
  const noIntegradas = [];
  // Solo las no integradas (pedido HDO): las integradas muelen su propio aceite
  for (const p of BIO_OPERANDO.filter((x) => x.categoria !== 'INTEGRADA')) {
    const f = filaProveedores(p);
    const g = f.reg.supergrupo || (GRUPOS.some(([x]) => x === f.reg.grupo) ? f.reg.grupo : null);
    if (g) {
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g).push(f);
    } else noIntegradas.push(f);
  }
  const secciones = [...grupos.entries()]
    .map(([nombre, filas]) => ({ nombre, tipo: 'grupo', filas: filas.sort(porCapacidad), tot: totalesDe(filas) }))
    .sort((a, b) => b.tot.capacidad - a.tot.capacidad);
  secciones.push({ nombre: 'Empresas no integradas independientes', tipo: 'seccion', filas: noIntegradas.sort(porCapacidad), tot: totalesDe(noIntegradas) });
  return secciones;
})();
const TOTAL_RESUMEN = totalesDe(SECCIONES_RESUMEN.flatMap((x) => x.filas));

// Siempre en verde (pedido HDO): el semáforo no va; solo el cero queda gris
const tonoCobertura = (c) => (c > 0 ? 'pos' : 'nulo');
/** Barra de cobertura en escala logarítmica (0,1× a 1.000×) con la marca de 1×. */
function BarraCobertura({ valor }) {
  const pos = valor > 0 ? Math.max(0, Math.min(1, (Math.log10(valor) + 1) / 4)) : 0;
  return (
    <div className={`ig-barra tono-${tonoCobertura(valor)}`}>
      <i className="ig-barra-relleno" style={{ width: `${(pos * 100).toFixed(1)}%` }} />
      <i className="ig-barra-marca" />
    </div>
  );
}

function HojaResumenProveedores({ folio, total, hojas }) {
  const folioDe = new Map(hojas.filter((h) => h.tipo === 'empresa').map((h) => [h.planta.claveRuta, h.folio]));
  const cortas = SECCIONES_RESUMEN.flatMap((x) => x.filas).filter((f) => f.cobertura != null && f.cobertura < 1);
  const celdasTot = (t, etiqueta) => (
    <>
      <td className="num">{fmt.int(t.capacidad)}</td>
      <td className="num" />
      <td className="num">{t.aceiteras}{etiqueta ? <small> distintas</small> : null}</td>
      <td />
      <td className="num">{fmt.int(t.molienda)}</td>
      <td className="num">{fmt.int(t.aceite)}</td>
      <td className={`num cob tono-${tonoCobertura(t.cobertura)}`}>{t.cobertura != null ? `${veces(t.cobertura)}×` : '-'}</td>
      <td><BarraCobertura valor={t.cobertura} /></td>
      <td />
    </>
  );
  return (
    <section className="ig-hoja ig-hoja-resumen">
      <Cabecera
        kicker="Resumen · Proveedores de aceite de las elaboradoras no integradas, por grupo económico"
        titulo="Cuánto aceite tiene cada elaboradora a su alrededor"
        bajada={`Para cada planta no integrada en operación (las integradas muelen su propio aceite), las aceiteras dentro del radio de ${RADIO_KM} km (${textoRadios()}), su molienda diaria, el aceite anual que representan y cuántas veces ese aceite cubre la capacidad de biodiesel de la planta. Las plantas van agrupadas por grupo económico; los totales de grupo cuentan aceiteras distintas.`}
        folio={folio} total={total}
      />
      <div className="ig-kpis">
        <div className="ig-kpi-grid ig-kpi-grid-4">
          <Kpi label="Plantas no integradas en operación" value={String(TOTAL_RESUMEN.plantas)} sub={`${fmt.int(TOTAL_RESUMEN.capacidad)} t/año de capacidad instalada`} tone="info" />
          <Kpi label="Aceiteras en algún radio" value={`${TOTAL_RESUMEN.aceiteras} de ${PLANTAS_ACEITE.length}`} sub={`${fmt.int(TOTAL_RESUMEN.molienda)} t/día de molienda · ${fmt.int(TOTAL_RESUMEN.aceite)} t/año de aceite`} tone="info" />
          <Kpi label="Cobertura del conjunto" value={`${veces(TOTAL_RESUMEN.cobertura)}×`} sub="aceite de los radios sobre la capacidad total de biodiesel" tone={tonoCobertura(TOTAL_RESUMEN.cobertura)} />
          <Kpi label="Plantas con menos de 1×" value={`${cortas.length} de ${TOTAL_RESUMEN.plantas}`} sub={cortas.length ? cortas.map((f) => razonCorta(f.planta.claveRuta)).join(' · ') : 'todas cubren su capacidad'} tone="pos" />
        </div>
      </div>
      <table className="ig-tabla ig-tabla-resumen">
        <colgroup>
          <col /><col style={{ width: '48mm' }} /><col style={{ width: '22mm' }} /><col style={{ width: '13mm' }} /><col style={{ width: '24mm' }} />
          <col style={{ width: '80mm' }} /><col style={{ width: '20mm' }} /><col style={{ width: '22mm' }} /><col style={{ width: '17mm' }} /><col style={{ width: '38mm' }} /><col style={{ width: '9mm' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Elaboradora · grupo económico</th><th>Localidad</th>
            <th className="num">Capacidad<br />biodiesel t/año</th><th className="num">Radio<br />km</th><th className="num">Aceiteras<br />en el radio</th>
            <th>Aceitera más cercana · km por ruta</th>
            <th className="num">Molienda<br />t/día</th><th className="num">Aceite<br />t/año</th><th className="num">Cobertura<br />veces</th>
            <th>Barra de cobertura<br />escala log · marca = 1×</th><th className="num">Hoja</th>
          </tr>
        </thead>
        <tbody>
          {SECCIONES_RESUMEN.map((sec) => (
            <Fragment key={sec.nombre}>
              <tr className={`ig-res-cab ${sec.tipo}`}>
                <td colSpan={2}>
                  {sec.nombre}
                  <small> · {sec.tot.plantas} {sec.tot.plantas === 1 ? 'planta' : 'plantas'}</small>
                </td>
                {celdasTot(sec.tot, true)}
              </tr>
              {sec.filas.map((f) => (
                <tr key={f.planta.id} className="ig-res-fila">
                  <td className="ig-res-nombre">
                    {f.planta.nombre}
                    {f.subgrupo && <small> · {nombreGrupo(f.subgrupo)}</small>}
                  </td>
                  <td>{lugarCorto(f.planta.localidad, f.planta.provincia)}</td>
                  <td className="num">{fmt.int(f.planta.capacidad)}</td>
                  <td className="num">{f.radio}</td>
                  <td className="num">{f.prov.length}</td>
                  <td>
                    {f.cercana
                      ? <>{fmt.truncate(razonCorta(f.cercana.nombre), 28)} <small>· {f.cercana.localidad} · {fmt.int(kmDe(f.cercana))} km</small></>
                      : <small>sin aceiteras en el radio</small>}
                  </td>
                  <td className="num">{fmt.int(f.molienda)}</td>
                  <td className="num">{fmt.int(f.aceite)}</td>
                  <td className={`num cob tono-${tonoCobertura(f.cobertura)}`}>{f.cobertura != null ? `${veces(f.cobertura)}×` : '-'}</td>
                  <td><BarraCobertura valor={f.cobertura} /></td>
                  <td className="num">{folioDe.get(f.planta.claveRuta)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Todas las no integradas en operación <small>· {TOTAL_RESUMEN.plantas} plantas</small></td>
            {celdasTot(TOTAL_RESUMEN, true)}
          </tr>
        </tfoot>
      </table>
      <Pie nota={`aceite anual = molienda × ${Math.round(RENDIMIENTO_ACEITE * 100)}% de rendimiento × ${DIAS_OPERACION} días · cobertura = aceite anual del radio / capacidad de biodiesel (≈ 1 t de aceite por t de biodiesel) · radio en línea recta, km de la más cercana por ruta`} />
    </section>
  );
}

// ── página ──
export default function Infografia() {
  const raizRef = useRef(null);
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const soloEmpresa = params.get('empresa');
  const soloGrupo = params.get('grupo');
  const soloTipo = params.get('solo'); // portada | resumen | ranking | empresas | grupos

  // Los charts leen la paleta del tema activo: en papel siempre la clara
  const { theme, toggle } = useTheme();
  useEffect(() => {
    if (theme === 'dark') toggle();
  }, [theme, toggle]);

  // Orden del documento (el folio es global aunque se muestre una sola hoja)
  const hojas = useMemo(() => {
    const lista = [
      { tipo: 'portada' },
      { tipo: 'resumen' },
      ...PLANTAS.map((p) => ({ tipo: 'empresa', planta: p })),
      ...GRUPOS.map(([g, miembros]) => ({ tipo: 'grupo', grupo: g, miembros })),
      { tipo: 'ranking' },
    ];
    return lista.map((h, i) => ({ ...h, folio: i + 1 }));
  }, []);
  const total = hojas.length;
  const visibles = hojas.filter((h) => {
    if (soloEmpresa) return h.tipo === 'empresa' && h.planta.claveRuta === soloEmpresa;
    if (soloGrupo) return h.tipo === 'grupo' && h.grupo === soloGrupo;
    if (soloTipo === 'empresas') return h.tipo === 'empresa';
    if (soloTipo === 'grupos') return h.tipo === 'grupo';
    if (soloTipo) return h.tipo === soloTipo;
    return true;
  });

  // En pantalla la hoja se escala al ancho disponible; en papel va 1:1
  useEffect(() => {
    const raiz = raizRef.current;
    if (!raiz) return undefined;
    const ajustar = () => {
      const hoja = raiz.querySelector('.ig-hoja');
      if (!hoja) return;
      const esc = Math.min(1, raiz.clientWidth / hoja.offsetWidth);
      raiz.style.setProperty('--ig-escala', esc);
      raiz.style.setProperty('--ig-alto', `${hoja.offsetHeight * esc}px`);
    };
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, [visibles.length]);

  return (
    <main className="infografia" ref={raizRef} lang="es">
      {visibles.map((h) => (
        <div className="ig-marco" key={h.folio}>
          {h.tipo === 'portada' && <Portada folio={h.folio} total={total} hojas={hojas} />}
          {h.tipo === 'resumen' && <HojaResumenProveedores folio={h.folio} total={total} hojas={hojas} />}
          {h.tipo === 'empresa' && <HojaEmpresa planta={h.planta} folio={h.folio} total={total} />}
          {h.tipo === 'grupo' && <HojaGrupo grupo={h.grupo} miembros={h.miembros} folio={h.folio} total={total} hojas={hojas} />}
          {h.tipo === 'ranking' && <HojaRanking folio={h.folio} total={total} hojas={hojas} />}
        </div>
      ))}
      {visibles.length === 0 && (
        <p className="ig-vacio">No hay ninguna hoja para "{soloEmpresa || soloGrupo || soloTipo}".</p>
      )}
    </main>
  );
}
