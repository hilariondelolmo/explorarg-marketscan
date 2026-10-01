import { useEffect, useRef, useState } from 'react';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';

const FUENTE_PX = 10;     // tamaño en pantalla de las etiquetas
const MIN_ETIQUETAS_PX = 520; // más angosto que esto, el mapa va sin etiquetas
const ANCHO_MAX = 9;      // px del arco más grueso (el más fino mide 1 px)

/**
 * Mapa mundial de flujos del gas oil importado (réplica del mapa del tablero
 * GO IMPORTS): arcos ámbar de cada país de procedencia a la Argentina y arcos
 * verdes del país de origen al de procedencia cuando no son el mismo, con el
 * ancho por toneladas. Los países de procedencia van pintados en ámbar según
 * su volumen y rotulados con las toneladas; los que son solo origen, en
 * verde con el nombre. Pasar el mouse por un arco, un punto o un país muestra
 * las toneladas y el precio CIF; el clic filtra (lo resuelve la página).
 *   mapa          public/data/mapa_mundo.json (viewBox, proyección y paths por ISO)
 *   procedencias  [{ iso, nombre, lat, lng, ton, cif }]
 *   origenes      [{ iso, nombre, lat, lng, ton, cif }]
 *   flujos        [{ ori, pro, ton, cif }] con ori y pro países distintos
 *   destino       { nombre, lat, lng }
 *   elegidos      { pro: Set(iso) | null, ori: Set(iso) | null }: lo que está filtrado
 *   onPais        (iso, 'pro' | 'ori') => void
 */
export default function MapaMundo({ mapa, procedencias, origenes, flujos, destino, elegidos, onPais, etiqueta }) {
  const C = useChartColors();
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null); // { titulo, filas, x, y }
  const [anchoPx, setAnchoPx] = useState(0);
  useEffect(() => {
    const el = wrapRef.current?.querySelector('svg');
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setAnchoPx(el.clientWidth));
    ro.observe(el);
    setAnchoPx(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const [VX, VY, VW, VH] = mapa.viewBox.split(' ').map(Number);
  const { lon_min, lat_max, kx, ky } = mapa.proyeccion;
  const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const top = merc(lat_max);
  const proyectar = (lng, lat) => [(lng - lon_min) * kx, (top - merc(lat)) * ky];
  const upx = anchoPx ? VW / anchoPx : 1; // unidades del viewBox por píxel en pantalla

  const maxTon = Math.max(1, ...procedencias.map((p) => p.ton), ...flujos.map((f) => f.ton));
  const ancho = (ton) => 1 + (ANCHO_MAX - 1) * (ton / maxTon);
  const maxPro = Math.max(1, ...procedencias.map((p) => p.ton));
  const maxOri = Math.max(1, ...origenes.map((p) => p.ton));
  const pro = new Map(procedencias.map((p) => [p.iso, p]));
  const ori = new Map(origenes.map((p) => [p.iso, p]));
  const apagadoPro = (iso) => !!elegidos.pro && !elegidos.pro.has(iso);
  const apagadoOri = (iso) => !!elegidos.ori && !elegidos.ori.has(iso);
  const activo = (iso) => (elegidos.pro?.has(iso) && elegidos.pro.size === 1) || (elegidos.ori?.has(iso) && elegidos.ori.size === 1);

  // Arco: curva cuadrática que se abomba hacia el norte, proporcional a la distancia
  const arco = (a, b, curva = 0.22) => {
    const [x1, y1] = a;
    const [x2, y2] = b;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const d = Math.hypot(dx, dy) || 1;
    let nx = -dy / d;
    let ny = dx / d;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const cx = (x1 + x2) / 2 + nx * d * curva;
    const cy = (y1 + y2) / 2 + ny * d * curva;
    return `M${x1.toFixed(1)},${y1.toFixed(1)}Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  };
  const posicion = (e) => {
    const box = wrapRef.current?.getBoundingClientRect();
    return box ? { x: e.clientX - box.left, y: e.clientY - box.top } : null;
  };
  const mostrar = (titulo, filas) => (e) => {
    const p = posicion(e);
    if (p) setHover({ titulo, filas, ...p });
  };
  const filasDe = (v) => [
    { label: 'Volumen', valor: `${fmt.int(v.ton)} t` },
    { label: 'Precio CIF', valor: v.ton ? `${fmt.int(v.cif / v.ton)} usd/ton` : '-' },
  ];
  const ocultar = () => setHover(null);
  const derecha = hover && wrapRef.current && hover.x > wrapRef.current.clientWidth * 0.55;

  const pDestino = proyectar(destino.lng, destino.lat);
  const fuente = FUENTE_PX * upx;
  const conEtiquetas = anchoPx >= MIN_ETIQUETAS_PX;
  // Un país puede ser origen y procedencia a la vez: manda la procedencia
  const soloOrigen = origenes.filter((o) => !pro.has(o.iso));
  // Etiquetas sin pisarse: se ubican de mayor a menor volumen y las que caen
  // sobre otra no se dibujan (su dato queda en el tooltip). Las de
  // procedencia (dos líneas) van antes que las de origen (una línea).
  const etiquetas = [];
  if (conEtiquetas) {
    const puestas = [];
    const cabe = (x, y0, y1, w) => !puestas.some((c) => x - w / 2 < c.x1 && x + w / 2 > c.x0 && y0 < c.y1 && y1 > c.y0);
    const candidatas = [
      ...[...procedencias].sort((a, b) => b.ton - a.ton).map((p) => ({ ...p, tipo: 'pro' })),
      ...[...soloOrigen].sort((a, b) => b.ton - a.ton).map((o) => ({ ...o, tipo: 'ori' })),
    ];
    for (const c of candidatas) {
      const [x, y] = proyectar(c.lng, c.lat);
      const f = c.tipo === 'pro' ? fuente : fuente * 0.85;
      const lineas = c.tipo === 'pro' ? [c.nombre, `${fmt.int(c.ton)} t`] : [c.nombre];
      const w = Math.max(...lineas.map((t) => t.length)) * f * 0.58;
      const y1 = y - 5 * upx;
      const y0 = y1 - lineas.length * f * 1.1;
      if (!cabe(x, y0, y1, w)) continue;
      puestas.push({ x0: x - w / 2, x1: x + w / 2, y0, y1 });
      etiquetas.push({ ...c, x, y, f, lineas });
    }
  }

  return (
    <div className="go-mapa go-mundo" ref={wrapRef}>
      <svg viewBox={mapa.viewBox} role="img" aria-label={etiqueta || 'Mapa de flujos del gas oil importado'}>
        <rect x={VX} y={VY} width={VW} height={VH} className="go-mundo-fondo" />
        {mapa.paises.map((p) => {
          const vp = pro.get(p.iso);
          const vo = ori.get(p.iso);
          const esDestino = p.iso === 'AR';
          let style;
          if (vp) style = { fill: C.oil, fillOpacity: apagadoPro(p.iso) ? 0.12 : 0.25 + 0.6 * (vp.ton / maxPro) };
          else if (vo) style = { fill: C.bio, fillOpacity: apagadoOri(p.iso) ? 0.12 : 0.2 + 0.55 * (vo.ton / maxOri) };
          else if (esDestino) style = { fill: C.exp, fillOpacity: 0.5 };
          const conVolumen = !!(vp || vo);
          const filas = conVolumen ? [
            ...(vp ? [{ label: 'Como procedencia', valor: `${fmt.int(vp.ton)} t · ${fmt.int(vp.cif / vp.ton)} usd/ton` }] : []),
            ...(vo ? [{ label: 'Como origen', valor: `${fmt.int(vo.ton)} t · ${fmt.int(vo.cif / vo.ton)} usd/ton` }] : []),
          ] : null;
          return (
            <path
              key={p.iso} d={p.path} vectorEffect="non-scaling-stroke"
              className={`go-pais${conVolumen ? ' con-volumen' : ''}${activo(p.iso) ? ' activo' : ''}`}
              style={style}
              onMouseMove={conVolumen ? mostrar((vp || vo).nombre, filas) : undefined}
              onMouseLeave={conVolumen ? ocultar : undefined}
              onClick={conVolumen ? () => onPais?.(p.iso, vp ? 'pro' : 'ori') : undefined}
            />
          );
        })}
        {/* Origen → procedencia (verde), debajo de los flujos a la Argentina */}
        <g className="go-arcos">
          {flujos.map((f) => {
            const d = arco(proyectar(f.ori.lng, f.ori.lat), proyectar(f.pro.lng, f.pro.lat), 0.18);
            const apagado = apagadoOri(f.ori.iso) || apagadoPro(f.pro.iso);
            const titulo = `${f.ori.nombre} → ${f.pro.nombre}`;
            return (
              <g key={`${f.ori.iso}-${f.pro.iso}`} className={apagado ? 'apagado' : ''}
                onMouseMove={mostrar(titulo, filasDe(f))} onMouseLeave={ocultar} onClick={() => onPais?.(f.ori.iso, 'ori')}>
                <path d={d} className="go-arco-hit" />
                <path d={d} className="go-arco" stroke={C.bio} strokeWidth={ancho(f.ton)} vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
          {procedencias.map((p) => {
            const d = arco(proyectar(p.lng, p.lat), pDestino);
            const titulo = `${p.nombre} → ${destino.nombre}`;
            return (
              <g key={p.iso} className={apagadoPro(p.iso) ? 'apagado' : ''}
                onMouseMove={mostrar(titulo, filasDe(p))} onMouseLeave={ocultar} onClick={() => onPais?.(p.iso, 'pro')}>
                <path d={d} className="go-arco-hit" />
                <path d={d} className="go-arco" stroke={C.oil} strokeWidth={ancho(p.ton)} vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
        </g>
        <g className="go-puntos">
          {soloOrigen.map((o) => {
            const [x, y] = proyectar(o.lng, o.lat);
            return (
              <circle key={o.iso} cx={x} cy={y} r={3 * upx} fill={C.bio} className={`go-punto${apagadoOri(o.iso) ? ' apagado' : ''}`}
                vectorEffect="non-scaling-stroke"
                onMouseMove={mostrar(`${o.nombre} (origen)`, filasDe(o))} onMouseLeave={ocultar} onClick={() => onPais?.(o.iso, 'ori')} />
            );
          })}
          {procedencias.map((p) => {
            const [x, y] = proyectar(p.lng, p.lat);
            return (
              <circle key={p.iso} cx={x} cy={y} r={3.6 * upx} fill={C.oil} className={`go-punto${apagadoPro(p.iso) ? ' apagado' : ''}`}
                vectorEffect="non-scaling-stroke"
                onMouseMove={mostrar(`${p.nombre} → ${destino.nombre}`, filasDe(p))} onMouseLeave={ocultar} onClick={() => onPais?.(p.iso, 'pro')} />
            );
          })}
          <circle cx={pDestino[0]} cy={pDestino[1]} r={3.6 * upx} fill={C.exp} className="go-punto" vectorEffect="non-scaling-stroke" />
        </g>
        {etiquetas.length > 0 && (
          <g className="go-etiquetas">
            {etiquetas.map((e) => {
              const apagado = e.tipo === 'pro' ? apagadoPro(e.iso) : apagadoOri(e.iso);
              return (
                <text key={`${e.tipo}-${e.iso}`} className={`go-etiqueta${apagado ? ' apagado' : ''}`} x={e.x} y={e.y - 5 * upx} textAnchor="middle"
                  style={{ pointerEvents: 'none', fontSize: e.f, strokeWidth: 1.6 * upx }}>
                  {e.lineas.length === 1 ? e.lineas[0] : (
                    <>
                      <tspan x={e.x} dy={-e.f * 1.05}>{e.lineas[0]}</tspan>
                      <tspan x={e.x} dy={e.f * 1.05} className="fuerte">{e.lineas[1]}</tspan>
                    </>
                  )}
                </text>
              );
            })}
          </g>
        )}
      </svg>
      {hover && (
        <div className={`go-mapa-tooltip ${derecha ? 'izquierda' : ''}`} style={{ left: hover.x, top: hover.y }}>
          <div className="go-mapa-tooltip-titulo">{hover.titulo}</div>
          {hover.filas.map((l) => (
            <div key={l.label} className="go-mapa-tooltip-fila">
              <span>{l.label}</span>
              <strong>{l.valor}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
