import { useEffect, useMemo, useRef, useState } from 'react';
import SectionNav from '../components/SectionNav.jsx';
import { SECCIONES_REFORMA } from '../lib/reforma.js';
import { useTheme, useChartColors } from '../lib/theme.jsx';
import datos from '../data/precio_aceite_rosario.json';
// Mapa de anillos (lámina 7 del video CEPREB) en un solo SVG: lo escribe
// scripts/generar_mapa_anillos_aceite.py; va inline para que herede la tipografía
import mapaAnillos from '../content/mapa_anillos_aceite.svg?raw';
import './RelacionPrecioAceite.css';

/**
 * "Relación del precio del aceite": pestaña propia de la sección Reforma, al
 * lado de la Respuesta al Documento CEPREB (HDO, 19/10/2026). Tablero
 * interactivo de la nota de la Secretaría de Energía del 14/10/2026 (precio
 * de compra del aceite por zona de distancia de la planta a Rosario, base
 * Rosario = 100, enero 2024 a agosto 2026): el gráfico mensual con tooltip y
 * filtro por año, quién compró mejor y peor cada mes, los histogramas de
 * cuántas veces lo fue cada zona y la tabla mes por mes. Réplica en el sitio
 * de la página que HDO aprobó el 16/10 (output/relacion-precio-aceite, v1).
 *
 * Datos: src/data/precio_aceite_rosario.json (los mismos del cuadro 9 del
 * video del mapa y de la lámina 6 del video CEPREB). Los catorce puntos que en
 * el gráfico de la nota quedan tapados por otra serie vienen en `estimados`
 * y se dibujan como círculos huecos. Mejor = índice más bajo del mes, peor =
 * el más alto; los dos empates exactos (jul-2024 mejor, may-2026 peor) se
 * resuelven como en `nota_empates`, así los conteos coinciden con `resumen`.
 */

const ZONAS = [
  { i: 0, id: 'hasta_50', nombre: 'hasta 50 km', largo: 'hasta 50 km de Rosario' },
  { i: 1, id: '50_100', nombre: '50-100 km', largo: 'más de 50 y hasta 100 km' },
  { i: 2, id: '101_200', nombre: '101-200 km', largo: 'más de 101 y hasta 200 km' },
  { i: 3, id: '201_600', nombre: '201-600 km', largo: 'más de 201 y hasta 600 km' },
  { i: 4, id: 'mas_600', nombre: 'más de 600 km', largo: 'más de 600 km de Rosario' },
];
// Paleta categórica validada (daltonismo y contraste) en los dos temas; el
// orden es el de la leyenda y no se cambia
const PALETA = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
};
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const EMPATE = 0.15; // margen de lectura del gráfico: por debajo es empate técnico
const ANIOS = ['all', '2024', '2025', '2026'];

const estimados = new Set(datos.estimados.map((e) => `${e.fecha}|${e.zona}`));
const DATA = datos.meses.map((m) => ({
  fecha: m.fecha,
  y: Number(m.fecha.slice(0, 4)),
  m: Number(m.fecha.slice(5, 7)),
  v: ZONAS.map((z) => m[z.id]),
  est: ZONAS.map((z) => estimados.has(`${m.fecha}|${z.id}`)),
}));

const f1 = (x) => x.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = (x) => x.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const etiqueta = (d) => `${MESES[d.m - 1]} ${d.y}`;

/** Mejor (más bajo) y peor (más alto) del mes. El orden estable del sort
 *  resuelve los dos empates exactos igual que `nota_empates` del JSON. */
function ranking(d) {
  const filas = ZONAS.map((z) => ({ z, v: d.v[z.i], est: d.est[z.i] }));
  const orden = filas.slice().sort((a, b) => a.v - b.v);
  const mejor = orden[0];
  const peor = orden[orden.length - 1];
  return {
    mejor,
    peor,
    orden,
    brecha: peor.v - mejor.v,
    empateMejor: orden.filter((e) => e !== mejor && e.v - mejor.v <= EMPATE).map((e) => e.z),
    empatePeor: orden.filter((e) => e !== peor && peor.v - e.v <= EMPATE).map((e) => e.z),
  };
}

/** Ancho del contenedor, para dibujar los SVG a medida */
function useAncho(ref, inicial = 900) {
  const [ancho, setAncho] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const medir = () => setAncho(Math.max(300, el.clientWidth || inicial));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, inicial]);
  return ancho;
}

export default function RelacionPrecioAceite() {
  const { theme } = useTheme();
  const S = PALETA[theme] || PALETA.light;
  const [anio, setAnio] = useState('all');
  const [ocultas, setOcultas] = useState(() => new Set());
  const [tabla, setTabla] = useState(false);
  const data = useMemo(() => (anio === 'all' ? DATA : DATA.filter((d) => String(d.y) === anio)), [anio]);
  const filas = useMemo(() => data.map((d) => ({ d, r: ranking(d) })), [data]);

  // Control contra el resumen del JSON (el de los videos): mismos conteos en "Todo"
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const todo = DATA.map(ranking);
    datos.resumen.forEach((r) => {
      const z = ZONAS.find((x) => x.id === r.zona);
      const mb = todo.filter((t) => t.mejor.z === z).length;
      const mc = todo.filter((t) => t.peor.z === z).length;
      if (mb !== r.mas_barata || mc !== r.mas_cara) console.warn('precio_aceite: conteo distinto del resumen', r.zona, mb, mc, r);
    });
  }, []);

  const alternar = (i) => setOcultas((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const periodo = anio === 'all' ? `los ${data.length} meses de enero de 2024 a agosto de 2026` : `los ${data.length} meses de ${anio}`;

  return (
    <>
      <SectionNav sections={SECCIONES_REFORMA} />
      <div className="articulo-reforma rpa">
        <div className="ar-sticky">
          <div className="marco ar-encabezado">
            <div className="ar-encabezado-fila">
              <div>
                <div className="kicker">Nota de la Secretaría de Energía del 14/10/2026 · Reforma Ley 27.640</div>
                <h1>Relación del precio del aceite</h1>
                <div className="firma">por Hilarión Del Olmo - Presidente - Explora S.A. · explorarg.com / CAPBA</div>
              </div>
            </div>
          </div>
        </div>

        <div className="ar-contenido">
          <div className="marco">
            <p className="rpa-bajada">
              Precio de compra del aceite que informan las elaboradoras, por zona de distancia de la planta a Rosario, con
              Rosario = 100. Mensual, de enero de 2024 a agosto de 2026. Un valor menor que 100 es un aceite más barato que en
              Rosario. Es la respuesta de la Secretaría de Energía al pedido de CASFER y CAPBA del 8/9/2026.
            </p>

            <div className="rpa-filtros" role="group" aria-label="Período">
              <span className="rpa-filtro-label">Período</span>
              <div className="chart-range-selector">
                {ANIOS.map((a) => (
                  <button key={a} type="button" className={anio === a ? 'active' : ''} aria-pressed={anio === a} onClick={() => setAnio(a)}>
                    {a === 'all' ? 'Todo' : a}
                  </button>
                ))}
              </div>
            </div>

            <section className="rpa-card" aria-labelledby="rpa-t1">
              <div className="rpa-card-cab">
                <div>
                  <h2 id="rpa-t1">Índice mensual por distancia a Rosario</h2>
                  <p className="rpa-sub">Rosario = 100. Pasá el puntero o usá las flechas del teclado para leer un mes; tocá la leyenda para prender y apagar series.</p>
                </div>
                <button type="button" className="rpa-boton" aria-pressed={tabla} onClick={() => setTabla((t) => !t)}>
                  {tabla ? 'Ver como gráfico' : 'Ver como tabla'}
                </button>
              </div>
              <Leyenda S={S} ocultas={ocultas} alternar={alternar} />
              {tabla ? <TablaDatos filas={filas} /> : <GraficoLineas data={data} ocultas={ocultas} S={S} />}
              <p className="rpa-nota">
                Los círculos huecos son los catorce puntos que en el gráfico de la nota quedan tapados por otra serie; su valor está
                acotado, con un margen de más o menos 0,15.
              </p>
            </section>

            <section className="rpa-card" aria-labelledby="rpa-t2">
              <div className="rpa-card-cab">
                <div>
                  <h2 id="rpa-t2">Quién compró mejor y quién peor</h2>
                  <p className="rpa-sub">Mejor es la zona con el índice más bajo del mes y peor la del más alto, en {periodo}.</p>
                </div>
              </div>
              <Fichas data={data} filas={filas} S={S} />
              <div className="rpa-hists">
                <Histograma titulo="Meses en que compró mejor (el índice más bajo)" filas={filas} cual="mejor" S={S} />
                <Histograma titulo="Meses en que compró peor (el índice más alto)" filas={filas} cual="peor" S={S} />
              </div>
              <p className="rpa-nota">
                Cuando la diferencia con el segundo es menor que 0,15 puntos, el empate técnico se marca con ≈ en la tabla: está
                dentro del margen de lectura del gráfico.
              </p>
            </section>

            {/* El mapa va entre el ranking y la tabla mes por mes (HDO, 19/10/2026); sus
                conteos son siempre los de los 32 meses, no siguen el filtro de período */}
            <section className="rpa-card" aria-labelledby="rpa-t0">
              <div className="rpa-card-cab">
                <div>
                  <h2 id="rpa-t0">Las zonas en el mapa</h2>
                  <p className="rpa-sub">
                    Las cinco zonas de la nota, con las 24 plantas no integradas en operación. Rosario es la base 100 y los anillos
                    son la distancia en línea recta desde Rosario: 50, 100, 200 y 600 km. En cada zona, cuántas veces fue la más cara
                    del mes y cuántas la más barata, en los 32 meses.
                  </p>
                </div>
              </div>
              <div className="rpa-mapa-scroll">
                {/* SVG propio, generado por el script del repo: no viene de un tercero */}
                <div className="rpa-mapa" dangerouslySetInnerHTML={{ __html: mapaAnillos }} />
              </div>
              <div className="rpa-mapa-leyenda">
                <span><i className="rpa-swatch" style={{ background: '#f1cfa9' }} /> Zona que fue más veces la más cara del mes</span>
                <span><i className="rpa-swatch" style={{ background: '#cde2bf' }} /> Zona que fue más veces la más barata del mes</span>
                <span><i className="rpa-swatch rpa-swatch-planta" /> Plantas no integradas en operación</span>
                <span><i className="rpa-swatch rpa-swatch-rosario" /> Rosario</span>
              </div>
              <p className="rpa-nota">
                Plantas: registro de la Secretaría de Energía, coordenadas procesadas en explorarg.com. Las siete plantas de hasta 50 km y
                las cinco de Ramallo van en pilas con una guía a su punto.
              </p>
            </section>

            <section className="rpa-card" aria-labelledby="rpa-t3">
              <div className="rpa-card-cab">
                <div>
                  <h2 id="rpa-t3">Mes por mes</h2>
                  <p className="rpa-sub">Mejor y peor comprador de cada mes y la brecha entre ambos, en puntos del índice.</p>
                </div>
              </div>
              <TablaMeses filas={filas} S={S} />
            </section>

            <p className="rpa-fuente">
              Fuente: {datos.fuente} Los valores son la lectura píxel a píxel del gráfico de la nota, con una precisión de más o
              menos 0,1 puntos.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function Clave({ color, fino }) {
  return <span className="rpa-clave" style={{ borderTopColor: color, borderTopWidth: fino ? 1 : 2 }} aria-hidden="true" />;
}

function Leyenda({ S, ocultas, alternar }) {
  return (
    <div className="rpa-leyenda">
      {ZONAS.map((z) => (
        <button key={z.id} type="button" aria-pressed={!ocultas.has(z.i)} onClick={() => alternar(z.i)} title="Prender o apagar la serie">
          <Clave color={S[z.i]} /> {z.largo}
        </button>
      ))}
      <span className="rpa-leyenda-ref"><Clave color="var(--rule)" fino /> Rosario = 100 (referencia)</span>
    </div>
  );
}

/* ── Gráfico de líneas: SVG propio, tooltip con todas las series del mes ── */

function GraficoLineas({ data, ocultas, S }) {
  const CC = useChartColors();
  const { theme } = useTheme();
  const cajaRef = useRef(null);
  const W = useAncho(cajaRef, 900);
  const [hover, setHover] = useState(-1);
  const angosto = W < 560;
  const H = angosto ? 340 : 440;
  const m = { l: 40, r: 14, t: 14, b: 50 };
  const n = data.length;
  const g = useMemo(() => {
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const todos = data.flatMap((d) => d.v);
    const y0 = Math.floor((Math.min(100, ...todos) - 0.5) / 2) * 2;
    const y1 = Math.ceil((Math.max(100, ...todos) + 0.5) / 2) * 2;
    return {
      pw, ph, y0, y1,
      xs: (i) => m.l + (pw * (i + 0.5)) / n,
      ys: (v) => m.t + ph * (1 - (v - y0) / (y1 - y0)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, data, n]);
  useEffect(() => { if (hover >= n) setHover(-1); }, [n, hover]);

  const superficie = theme === 'dark' ? '#111820' : '#FFFFFF';
  const cuadricula = [];
  for (let v = g.y0; v <= g.y1; v += (g.y1 - g.y0) > 14 ? 2 : 1) cuadricula.push(v);
  const cadaCuanto = n > 24 ? (angosto ? 3 : 1) : angosto ? 2 : 1;
  const anios = [];
  let ini = 0;
  data.forEach((d, i) => {
    const ultimo = i === n - 1 || data[i + 1].y !== d.y;
    if (ultimo) { anios.push({ y: d.y, xa: m.l + (g.pw * ini) / n, xb: m.l + (g.pw * (i + 1)) / n, corte: i < n - 1 }); ini = i + 1; }
  });

  const masCercano = (evt) => {
    const rect = evt.currentTarget.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) * W) / rect.width;
    if (x < m.l - 10 || x > W - m.r + 10) return -1;
    let mejor = 0; let dist = Infinity;
    for (let i = 0; i < n; i++) { const dd = Math.abs(g.xs(i) - x); if (dd < dist) { dist = dd; mejor = i; } }
    return mejor;
  };
  const teclas = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setHover((h) => Math.min(n - 1, h < 0 ? 0 : h + 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setHover((h) => Math.max(0, h < 0 ? n - 1 : h - 1)); }
    else if (e.key === 'Escape') setHover(-1);
  };

  const d = hover >= 0 && hover < n ? data[hover] : null;
  const r = d ? ranking(d) : null;
  const anchoTip = 250;
  const px = d ? g.xs(hover) : 0;
  const tipIzq = d ? (px + 14 + anchoTip > W ? Math.max(0, px - 14 - anchoTip) : px + 14) : 0;
  const tipArriba = d ? Math.max(0, g.ys(100) - 40) : 0;

  return (
    <div className="rpa-caja" ref={cajaRef}>
      <svg
        className="rpa-svg" viewBox={`0 0 ${W} ${H}`} role="img" tabIndex={0}
        aria-label="Líneas del índice de precio de aceite por distancia a Rosario"
        onPointerMove={(e) => setHover(masCercano(e))} onPointerLeave={() => setHover(-1)}
        onKeyDown={teclas} onFocus={() => { if (hover < 0) setHover(n - 1); }} onBlur={() => setHover(-1)}
      >
        {cuadricula.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={g.ys(v)} y2={g.ys(v)} stroke={CC.grid} strokeWidth={1} shapeRendering="crispEdges" />
            <text x={m.l - 8} y={g.ys(v) + 4} textAnchor="end" fill={CC.ink} fontSize={11.5} opacity={0.75}>{v}</text>
          </g>
        ))}
        <line x1={m.l} x2={W - m.r} y1={g.ys(100)} y2={g.ys(100)} stroke={CC.axis} strokeWidth={1.5} />
        <text x={W - m.r} y={g.ys(100) - 5} textAnchor="end" fill={CC.ink} fontSize={11} opacity={0.75}>Rosario = 100</text>
        {data.map((dd, i) => ((i % cadaCuanto === 0 || (i > 0 && dd.m === 1)) ? (
          <text key={dd.fecha} x={g.xs(i)} y={H - m.b + 18} textAnchor="middle" fill={CC.tick} fontSize={11.5}>{dd.m}</text>
        ) : null))}
        {anios.map((a) => (
          <g key={a.y}>
            <text x={(a.xa + a.xb) / 2} y={H - m.b + 38} textAnchor="middle" fill={CC.ink} fontSize={12} fontWeight={600} opacity={0.8}>{a.y}</text>
            {a.corte && <line x1={a.xb} x2={a.xb} y1={m.t} y2={H - m.b + 42} stroke={CC.grid} strokeWidth={1} shapeRendering="crispEdges" />}
          </g>
        ))}
        <line x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} stroke={CC.axis} strokeWidth={1} shapeRendering="crispEdges" />
        {ZONAS.map((z) => (ocultas.has(z.i) ? null : (
          <path
            key={z.id} className="rpa-linea" fill="none" stroke={S[z.i]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
            d={data.map((dd, i) => `${i ? 'L' : 'M'}${g.xs(i).toFixed(1)} ${g.ys(dd.v[z.i]).toFixed(1)}`).join(' ')}
          />
        )))}
        {ZONAS.map((z) => (ocultas.has(z.i) ? null : data.map((dd, i) => (dd.est[z.i] ? (
          <circle key={`${z.id}-${dd.fecha}`} cx={g.xs(i)} cy={g.ys(dd.v[z.i])} r={3.2} fill={superficie} stroke={S[z.i]} strokeWidth={1.5} />
        ) : null))))}
        {d && (
          <g>
            <line x1={px} x2={px} y1={m.t} y2={H - m.b} stroke={CC.ink} strokeWidth={1} strokeOpacity={0.5} shapeRendering="crispEdges" />
            {ZONAS.map((z) => (ocultas.has(z.i) ? null : (
              <circle key={z.id} cx={px} cy={g.ys(d.v[z.i])} r={4.5} fill={S[z.i]} stroke={superficie} strokeWidth={2} />
            )))}
          </g>
        )}
      </svg>
      {d && (
        <div className="rpa-tip" style={{ left: tipIzq, top: tipArriba }}>
          <div className="rpa-tip-mes">{etiqueta(d)} · Rosario = 100</div>
          <table>
            <tbody>
              {r.orden.map((e) => (ocultas.has(e.z.i) ? null : (
                <tr key={e.z.id}>
                  <td className="rpa-tip-v">{f1(e.v)}{e.est ? '*' : ''}</td>
                  <td><Clave color={S[e.z.i]} /></td>
                  <td>{e.z.largo}</td>
                  <td className="rpa-tip-tag">{e === r.mejor ? 'mejor' : e === r.peor ? 'peor' : ''}</td>
                </tr>
              )))}
            </tbody>
          </table>
          <div className="rpa-tip-brecha">Brecha mejor-peor: {f1(r.brecha)} puntos</div>
        </div>
      )}
    </div>
  );
}

/* ── Tabla de valores (la vista "Ver como tabla" del gráfico) ── */

function TablaDatos({ filas }) {
  return (
    <div className="rpa-scroll">
      <table className="rpa-tabla">
        <thead>
          <tr>
            <th>Mes</th>
            <th className="num">Rosario</th>
            {ZONAS.map((z) => <th key={z.id} className="num">{z.nombre}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.map(({ d, r }, i) => (
            <tr key={d.fecha} className={i === filas.length - 1 || filas[i + 1].d.y !== d.y ? 'rpa-fin-anio' : undefined}>
              <td>{etiqueta(d)}</td>
              <td className="num">100,0</td>
              {ZONAS.map((z) => {
                const es = r.mejor.z === z ? 'mejor' : r.peor.z === z ? 'peor' : '';
                return (
                  <td key={z.id} className={`num${es ? ` rpa-${es}` : ''}`}>
                    {es === 'mejor' ? '↓ ' : es === 'peor' ? '↑ ' : ''}{f2(d.v[z.i])}{d.est[z.i] ? '*' : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="rpa-nota">↓ el más bajo del mes (compró mejor), ↑ el más alto (compró peor). * valor estimado: en el gráfico de la nota lo tapa otra serie.</p>
    </div>
  );
}

/* ── Fichas de resumen ── */

function Fichas({ data, filas, S }) {
  const N = data.length;
  const prom = (z) => data.reduce((a, d) => a + d.v[z.i], 0) / N;
  const cuenta = (cual) => ZONAS.map((z) => ({ z, c: filas.filter(({ r }) => r[cual].z === z).length }));
  const topMejor = cuenta('mejor').sort((a, b) => b.c - a.c)[0];
  const topPeor = cuenta('peor').sort((a, b) => b.c - a.c)[0];
  const brecha = filas.reduce((a, { r }) => a + r.brecha, 0) / N;
  const masBarata = ZONAS.slice().sort((a, b) => prom(a) - prom(b))[0];
  const Ficha = ({ titulo, z, valor, detalle }) => (
    <div className="rpa-ficha">
      <div className="rpa-ficha-l">{titulo}</div>
      <div className="rpa-ficha-v">{z && <span className="rpa-clave rpa-clave-gruesa" style={{ borderTopColor: S[z.i] }} aria-hidden="true" />}{valor}</div>
      <div className="rpa-ficha-d">{detalle}</div>
    </div>
  );
  return (
    <div className="rpa-fichas">
      <Ficha titulo="Compró mejor más veces" z={topMejor.z} valor={topMejor.z.nombre} detalle={`${topMejor.c} de ${N} meses · promedio ${f1(prom(topMejor.z))}`} />
      <Ficha titulo="Compró peor más veces" z={topPeor.z} valor={topPeor.z.nombre} detalle={`${topPeor.c} de ${N} meses · promedio ${f1(prom(topPeor.z))}`} />
      <Ficha titulo="Brecha promedio entre mejor y peor" valor={`${f1(brecha)} puntos`} detalle="índice del peor menos índice del mejor, mes a mes" />
      <Ficha
        titulo="Promedio más bajo del período" z={masBarata} valor={masBarata.nombre}
        detalle={`índice promedio ${f1(prom(masBarata))} · ${ZONAS.map((z) => `${z.nombre} ${f1(prom(z))}`).join(', ')}`}
      />
    </div>
  );
}

/* ── Histograma: meses en que cada zona fue la mejor / la peor ── */

function Histograma({ titulo, filas, cual, S }) {
  const CC = useChartColors();
  const cajaRef = useRef(null);
  const W = useAncho(cajaRef, 480);
  const N = filas.length;
  const conteos = ZONAS.map((z) => filas.filter(({ r }) => r[cual].z === z).length);
  const filaH = 34; const m = { l: 112, r: 44, t: 6, b: 24 };
  const H = m.t + filaH * ZONAS.length + m.b;
  const pw = W - m.l - m.r;
  const xmax = Math.max(4, Math.ceil(Math.max(1, ...conteos) / 2) * 2);
  const xs = (c) => m.l + (pw * c) / xmax;
  const ticks = []; for (let c = 0; c <= xmax; c += xmax > 12 ? 4 : 2) ticks.push(c);
  return (
    <div className="rpa-hist" ref={cajaRef}>
      <h3>{titulo}</h3>
      <svg className="rpa-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo}>
        {ticks.map((c) => (
          <g key={c}>
            <line x1={xs(c)} x2={xs(c)} y1={m.t} y2={H - m.b} stroke={CC.grid} strokeWidth={1} shapeRendering="crispEdges" />
            <text x={xs(c)} y={H - 6} textAnchor="middle" fill={CC.tick} fontSize={12}>{c}</text>
          </g>
        ))}
        <line x1={m.l} x2={m.l} y1={m.t} y2={H - m.b} stroke={CC.axis} strokeWidth={1} shapeRendering="crispEdges" />
        {ZONAS.map((z, i) => {
          const y = m.t + filaH * i + (filaH - 22) / 2; const c = conteos[i]; const w = Math.max(0, xs(c) - m.l); const rr = Math.min(4, w / 2);
          return (
            <g key={z.id}>
              <title>{`${z.nombre}: compró ${cual} en ${c} de ${N} meses`}</title>
              <text x={m.l - 10} y={y + 15} textAnchor="end" fill={CC.ink} fontSize={12.5} opacity={0.85}>{z.nombre}</text>
              {w > 0 && <path d={`M${m.l} ${y} H${m.l + w - rr} a${rr} ${rr} 0 0 1 ${rr} ${rr} V${y + 22 - rr} a${rr} ${rr} 0 0 1 ${-rr} ${rr} H${m.l} Z`} fill={S[z.i]} />}
              <text x={m.l + w + 8} y={y + 15} fill={CC.ink} fontSize={12.5} fontWeight={650}>{c}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Tabla mes por mes: mejor, peor y brecha ── */

function TablaMeses({ filas, S }) {
  const Celda = ({ e, empates }) => (
    <td className="rpa-zona">
      <Clave color={S[e.z.i]} /> {e.z.nombre}
      {empates.length > 0 && <span className="rpa-empate" title="Empate técnico: diferencia menor que 0,15">≈ {empates.map((z) => z.nombre).join(', ')}</span>}
    </td>
  );
  return (
    <div className="rpa-scroll">
      <table className="rpa-tabla">
        <thead>
          <tr>
            <th>Mes</th><th>Compró mejor</th><th className="num">Índice</th><th>Compró peor</th><th className="num">Índice</th><th className="num">Brecha</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(({ d, r }, i) => (
            <tr key={d.fecha} className={i === filas.length - 1 || filas[i + 1].d.y !== d.y ? 'rpa-fin-anio' : undefined}>
              <td>{etiqueta(d)}</td>
              <Celda e={r.mejor} empates={r.empateMejor} />
              <td className="num">{f1(r.mejor.v)}{r.mejor.est ? '*' : ''}</td>
              <Celda e={r.peor} empates={r.empatePeor} />
              <td className="num">{f1(r.peor.v)}{r.peor.est ? '*' : ''}</td>
              <td className="num">{f1(r.brecha)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="rpa-nota">* valor estimado: en el gráfico de la nota lo tapa otra serie. ≈ empate técnico con la zona indicada.</p>
    </div>
  );
}
