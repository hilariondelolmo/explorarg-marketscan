import { useEffect, useRef, useState } from 'react';
import { Sankey, Tooltip, Layer, Rectangle, ResponsiveContainer } from 'recharts';
import { fmt } from '../../lib/format.js';
import { fmtPrecio } from '../../lib/gasoil.js';
import { textoSobre } from './coloresSankey.js';

export const NIVELES = ['Bandera', 'Canal de distribución', 'Tipo de negocio', 'Canal de comercialización'];

/**
 * Sankey de cuatro tótems (bandera → canal de distribución → tipo de negocio
 * → canal de comercialización), a la manera del tablero MARKET STRUCTURE de
 * HDO: nodos anchos de colores con la etiqueta adentro, flujos del color del
 * nodo de origen, ancho = volumen. Pasar el mouse por un nodo o un flujo
 * marca los recorridos que pasan por ahí (la parte iluminada de cada flujo
 * es la que corresponde). El clic hace una de dos cosas según `modo` (HDO,
 * 30/09/2026: quería las dos, a elección del usuario):
 *   'resaltar'  deja fija esa marca, como el tablero de Tableau: el mercado
 *               sigue entero y cada nodo muestra cuánto de su volumen pasa
 *               por lo elegido (volumen y porcentaje del nodo);
 *   'filtrar'   avisa con onNodo / onEnlace, la sección pasa la categoría (o
 *               las dos puntas del flujo) a sus filtros y el diagrama se
 *               rearma solo con lo que pasa por ahí (decisión del 29/09/2026).
 * En los dos casos otro clic lo suelta. Los nodos que hoy son filtro van con
 * borde; el resaltado fijo, con borde punteado. El tooltip trae el volumen y
 * el precio ponderado GO2 y GO3, y con una marca activa, cuánto del nodo o
 * del flujo pasa por ella.
 *
 *   nodes     [{ name, nombre, etiqueta, nivel, color, cabecera, filtrable, celdas: Set, w2, pw2, w3, pw3 }]
 *   links     [{ source, target, value, celdas: Map(celda → m³), w2, pw2, w3, pw3 }]
 *   celdaVol  Map(celda → m³), para medir cuánto de cada nodo pasa por la marca
 *   elegidos  Set('nivel|nombre') de los nodos que hoy son filtro
 *   modo      'resaltar' | 'filtrar'
 *   onNodo    (nodo) => void: clic en un nodo filtrable (los agrupados en "Otros" no lo son)
 *   onEnlace  (enlace) => void: clic en un flujo
 */
export default function SankeyMercado({ nodes, links, celdaVol, total, unidad, conv, C, elegidos, modo = 'filtrar', onNodo, onEnlace, alto = 620 }) {
  const ref = useRef(null);
  const [ancho, setAncho] = useState(1200);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [hover, setHover] = useState(null); // Set de celdas bajo el mouse
  const [fijo, setFijo] = useState(null);   // { clave, celdas }: marca dejada fija con un clic (modo resaltar)
  const nodeWidth = Math.max(64, Math.min(170, Math.round(ancho * 0.14)));
  // La marca que se ve: la fija manda; el mouse solo marca mientras no haya
  // ninguna fija (HDO, 30/09/2026: con YPF fijada, mover el mouse no cambia nada)
  const foco = fijo?.celdas ?? hover ?? null;
  const claveDe = (el, tipo) => (tipo === 'node' ? `n|${el.payload.nivel}|${el.payload.nombre}` : `e|${el.payload.source.nivel}|${el.payload.source.nombre}>${el.payload.target.nombre}`);
  const celdasDe = (el, tipo) => (tipo === 'node' ? el.payload.celdas : new Set(el.payload.celdas.keys()));

  const entrar = (el, tipo) => { if (!fijo) setHover(celdasDe(el, tipo)); };
  const salir = () => setHover(null);
  const clic = (el, tipo) => {
    if (modo === 'resaltar') {
      const clave = claveDe(el, tipo);
      setFijo((f) => (f?.clave === clave ? null : { clave, celdas: celdasDe(el, tipo) }));
      return;
    }
    setHover(null); // el diagrama filtrado se muestra limpio, sin la marca del mouse
    if (tipo === 'node') {
      if (el.payload.filtrable) onNodo?.(el.payload);
    } else onEnlace?.(el.payload);
  };
  // Al cambiar de modo o rearmarse el diagrama, la marca fija ya no corresponde
  useEffect(() => { setFijo(null); }, [modo, nodes]);

  return (
    <div ref={ref} className="go-sankey-marco">
      <ResponsiveContainer width="100%" height={alto}>
        <Sankey
          data={{ nodes, links }}
          nodeWidth={nodeWidth}
          nodePadding={8}
          linkCurvature={0.5}
          iterations={64}
          sort={false}
          margin={{ top: 26, right: 4, bottom: 6, left: 4 }}
          node={<Nodo C={C} foco={foco} celdaVol={celdaVol} elegidos={elegidos} fijo={fijo} />}
          link={<Enlace foco={foco} fijo={fijo} />}
          onMouseEnter={entrar}
          onMouseLeave={salir}
          onClick={clic}
        >
          <Tooltip content={<TooltipSankey total={total} unidad={unidad} conv={conv} foco={foco} celdaVol={celdaVol} />} wrapperStyle={{ zIndex: 5 }} />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}

// Volumen de las celdas de un nodo (Set) que pasan por la marca
function parteNodo(celdas, foco, celdaVol) {
  if (!foco || !celdaVol) return 0;
  let s = 0;
  const [chico, grande] = celdas.size <= foco.size ? [celdas, foco] : [foco, celdas];
  for (const k of chico) if (grande.has(k)) s += celdaVol.get(k) || 0;
  return s;
}

function Nodo({ x, y, width, height, index, payload, C, foco, celdaVol, elegidos, fijo }) {
  const parte = parteNodo(payload.celdas, foco, celdaVol);
  const apagado = !!foco && parte <= 0;
  const elegido = !!elegidos?.has(`${payload.nivel}|${payload.nombre}`);
  const marcado = fijo?.clave === `n|${payload.nivel}|${payload.nombre}`;
  const color = payload.color;
  const texto = textoSobre(color);
  const maxChars = Math.max(4, Math.floor((width - 8) / 6.4));
  const etiqueta = payload.etiqueta.length > maxChars ? `${payload.etiqueta.slice(0, maxChars - 1)}…` : payload.etiqueta;
  const dosLineas = height >= 30;
  // Con una marca activa, la segunda línea dice cuánto del nodo pasa por ella (pedido de HDO)
  const pctParte = payload.value ? (parte / payload.value) * 100 : 0;
  const segunda = foco && parte > 0
    ? (width >= 110 ? `${fmt.compact(parte)} m³ · ${fmt.pct(pctParte)}` : fmt.pct(pctParte))
    : `${fmt.compact(payload.value)} m³`;
  return (
    <Layer key={`nodo-${index}`} className={payload.filtrable ? '' : 'go-nodo-quieto'}>
      {payload.cabecera && (
        <text x={x + width / 2} y={11} textAnchor="middle" fontSize={12} fontWeight={600} fill={C.ink}>{payload.cabecera}</text>
      )}
      <Rectangle
        x={x} y={y} width={width} height={height} fill={color} fillOpacity={apagado ? 0.22 : 1}
        stroke={elegido || marcado ? C.ink : 'none'} strokeWidth={1.5} strokeDasharray={marcado && !elegido ? '4 3' : undefined}
      />
      {height >= 12 && (
        <text
          x={x + width / 2} y={y + height / 2 + (dosLineas ? -5 : 0)} textAnchor="middle" dominantBaseline="middle"
          fontSize={11} fontWeight={600} fill={texto} fillOpacity={apagado ? 0.5 : 1} style={{ pointerEvents: 'none' }}
        >
          {etiqueta}
        </text>
      )}
      {dosLineas && (
        <text
          x={x + width / 2} y={y + height / 2 + 8} textAnchor="middle" dominantBaseline="middle"
          fontSize={10} fill={texto} fillOpacity={apagado ? 0.5 : 0.85} style={{ pointerEvents: 'none' }}
        >
          {segunda}
        </text>
      )}
    </Layer>
  );
}

function Enlace({ sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, index, payload, foco, fijo }) {
  const d = `M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;
  const color = payload.source.color;
  const marcado = fijo?.clave === `e|${payload.source.nivel}|${payload.source.nombre}>${payload.target.nombre}`;
  let parte = 0;
  if (foco) {
    let s = 0;
    for (const [k, v] of payload.celdas) if (foco.has(k)) s += v;
    parte = payload.value ? s / payload.value : 0;
  }
  return (
    <Layer key={`enlace-${index}`} className="go-enlace">
      <path d={d} fill="none" stroke={color} strokeWidth={Math.max(1, linkWidth)} strokeOpacity={foco ? (parte > 0 ? (marcado ? 0.2 : 0.1) : 0.04) : 0.38} />
      {parte > 0 && (
        <path d={d} fill="none" stroke={color} strokeWidth={Math.max(1.2, linkWidth * parte)} strokeOpacity={0.85} style={{ pointerEvents: 'none' }} />
      )}
    </Layer>
  );
}

function TooltipSankey({ active, payload, total, unidad, conv, foco, celdaVol }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload?.payload; // nodo o enlace
  if (!p) return null;
  const esEnlace = !!(p.source && p.target);
  const titulo = esEnlace ? `${p.source.nombre} → ${p.target.nombre}` : p.nombre;
  const v = p.value;
  const precio = (w, pw) => (w ? fmtPrecio(conv(pw / w), unidad) : '-');
  const filas = [
    ['Volumen', `${fmt.int(v)} m³ · ${fmt.pct(total ? (v / total) * 100 : 0)}`],
    [`Grado 2 (${unidad})`, precio(p.w2, p.pw2)],
    [`Grado 3 (${unidad})`, precio(p.w3, p.pw3)],
  ];
  // Con una marca activa: cuánto de este nodo o flujo pasa por ella
  if (foco) {
    const parte = esEnlace ? [...p.celdas].reduce((s, [k, x]) => s + (foco.has(k) ? x : 0), 0) : parteNodo(p.celdas, foco, celdaVol);
    filas.push(['En la marca', `${fmt.int(parte)} m³ · ${fmt.pct(v ? (parte / v) * 100 : 0)}`]);
  }
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{titulo}</div>
      {filas.map(([l, val]) => (
        <div key={l} className="chart-tooltip-row">
          <div className="chart-tooltip-row-label"><span>{l}</span></div>
          <span className="chart-tooltip-row-val">{val}</span>
        </div>
      ))}
    </div>
  );
}
