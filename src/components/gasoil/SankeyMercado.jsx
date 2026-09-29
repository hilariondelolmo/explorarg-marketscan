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
 * es la que corresponde). Clic en un nodo filtra (decisión HDO 29/09/2026):
 * avisa con onNodo, la sección lo pasa a su filtro y el diagrama se rearma
 * solo con lo que pasa por ese nodo; otro clic lo suelta. Los nodos que hoy
 * son filtro van con borde. El tooltip trae el volumen y el precio ponderado
 * GO2 y GO3.
 *
 *   nodes     [{ name, nombre, etiqueta, nivel, color, cabecera, filtrable, celdas: Set, w2, pw2, w3, pw3 }]
 *   links     [{ source, target, value, celdas: Map(celda → m³), w2, pw2, w3, pw3 }]
 *   elegidos  Set('nivel|nombre') de los nodos que hoy son filtro
 *   onNodo    (nodo) => void: clic en un nodo filtrable (los agrupados en "Otros" no lo son)
 */
export default function SankeyMercado({ nodes, links, total, unidad, conv, C, elegidos, onNodo, alto = 620 }) {
  const ref = useRef(null);
  const [ancho, setAncho] = useState(1200);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [foco, setFoco] = useState(null); // Set de celdas bajo el mouse
  const nodeWidth = Math.max(64, Math.min(170, Math.round(ancho * 0.14)));

  const entrar = (el, tipo) => {
    const p = el.payload;
    setFoco(tipo === 'node' ? p.celdas : new Set(p.celdas.keys()));
  };
  const salir = () => setFoco(null);
  const clic = (el, tipo) => {
    if (tipo !== 'node' || !el.payload.filtrable) return;
    setFoco(null); // el diagrama filtrado se muestra limpio, sin la marca del mouse
    onNodo?.(el.payload);
  };

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
          node={<Nodo C={C} foco={foco} elegidos={elegidos} />}
          link={<Enlace foco={foco} />}
          onMouseEnter={entrar}
          onMouseLeave={salir}
          onClick={clic}
        >
          <Tooltip content={<TooltipSankey total={total} unidad={unidad} conv={conv} />} wrapperStyle={{ zIndex: 5 }} />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}

function intersecta(a, b) {
  if (!a || !b) return false;
  const [chico, grande] = a.size <= b.size ? [a, b] : [b, a];
  for (const k of chico) if (grande.has(k)) return true;
  return false;
}

function Nodo({ x, y, width, height, index, payload, C, foco, elegidos }) {
  const apagado = !!foco && !intersecta(payload.celdas, foco);
  const elegido = !!elegidos?.has(`${payload.nivel}|${payload.nombre}`);
  const color = payload.color;
  const texto = textoSobre(color);
  const maxChars = Math.max(4, Math.floor((width - 8) / 6.4));
  const etiqueta = payload.etiqueta.length > maxChars ? `${payload.etiqueta.slice(0, maxChars - 1)}…` : payload.etiqueta;
  const dosLineas = height >= 30;
  return (
    <Layer key={`nodo-${index}`} className={payload.filtrable ? '' : 'go-nodo-quieto'}>
      {payload.cabecera && (
        <text x={x + width / 2} y={11} textAnchor="middle" fontSize={12} fontWeight={600} fill={C.ink}>{payload.cabecera}</text>
      )}
      <Rectangle
        x={x} y={y} width={width} height={height} fill={color} fillOpacity={apagado ? 0.22 : 1}
        stroke={elegido ? C.ink : 'none'} strokeWidth={1.5}
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
          {fmt.compact(payload.value)} m³
        </text>
      )}
    </Layer>
  );
}

function Enlace({ sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, index, payload, foco }) {
  const d = `M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;
  const color = payload.source.color;
  let parte = 0;
  if (foco) {
    let s = 0;
    for (const [k, v] of payload.celdas) if (foco.has(k)) s += v;
    parte = payload.value ? s / payload.value : 0;
  }
  return (
    <Layer key={`enlace-${index}`}>
      <path d={d} fill="none" stroke={color} strokeWidth={Math.max(1, linkWidth)} strokeOpacity={foco ? (parte > 0 ? 0.1 : 0.04) : 0.38} />
      {parte > 0 && (
        <path d={d} fill="none" stroke={color} strokeWidth={Math.max(1.2, linkWidth * parte)} strokeOpacity={0.85} style={{ pointerEvents: 'none' }} />
      )}
    </Layer>
  );
}

function TooltipSankey({ active, payload, total, unidad, conv }) {
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
