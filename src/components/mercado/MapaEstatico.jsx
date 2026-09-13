import mapa from '../../data/mapa_argentina.json';
import { proyectar, kmAUnidades, simbolo } from '../../lib/plantas.js';

/**
 * Mapa SVG estático para piezas impresas (infografía): mismo dibujo y
 * proyección que el mapa interactivo (provincias, países vecinos, círculo
 * de alcance, rutas y puntos) sin hover, zoom ni tooltip, y con etiquetas
 * fijas opcionales. Los tamaños de puntos y letras se dan en px a escala 1
 * y se convierten a unidades del viewBox, así no dependen del encuadre.
 *
 * @param {number[]} viewBox   [x, y, w, h] en unidades del mapa (ver encuadres de lib/plantas)
 * @param {object}   circulo   { lat, lng, km } círculo de alcance alrededor de un punto
 * @param {object[]} rutas     [{ trazado | (desde, lat, lng), clase }]
 * @param {object[]} puntos    [{ lat, lng, rPx, forma, clase }]
 * @param {object[]} etiquetas [{ lat, lng, texto, dx, dy, anchor, tam, clase }] (dx/dy en px)
 */
export default function MapaEstatico({
  ancho, alto, viewBox, circulo = null, rutas = [], puntos = [], etiquetas = [], className = '',
}) {
  const [vx, vy, vw, vh] = viewBox;
  const u = vw / ancho; // unidades del viewBox por px
  return (
    <svg
      className={`mapa-estatico ${className}`}
      width={ancho} height={alto}
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      role="img" aria-label="Mapa"
    >
      <rect className="mapa-fondo" x={vx} y={vy} width={vw} height={vh} />
      {(mapa.vecinos || []).map((v) => (
        <path key={v.nombre} className="vecino" d={v.path} vectorEffect="non-scaling-stroke" />
      ))}
      {mapa.provincias.map((p) => (
        <path key={p.nombre} className="provincia" d={p.path} vectorEffect="non-scaling-stroke" />
      ))}
      {circulo && (() => {
        const [cx, cy] = proyectar(circulo.lng, circulo.lat);
        return (
          <circle className="radio-proveedores" cx={cx} cy={cy}
            r={kmAUnidades(circulo.km, circulo.lat)} vectorEffect="non-scaling-stroke" />
        );
      })()}
      {rutas.map((r, i) => {
        const clase = `ruta ${r.clase || ''}`;
        if (r.trazado) {
          const puntosRuta = r.trazado
            .map(([lng, lat]) => proyectar(lng, lat).map((v) => v.toFixed(1)).join(','))
            .join(' ');
          return <polyline key={i} className={clase} points={puntosRuta} vectorEffect="non-scaling-stroke" />;
        }
        const [x1, y1] = proyectar(r.desde.lng, r.desde.lat);
        const [x2, y2] = proyectar(r.lng, r.lat);
        return <line key={i} className={clase} x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />;
      })}
      {puntos.map((p, i) => {
        const [x, y] = proyectar(p.lng, p.lat);
        const r = (p.rPx || 4) * u;
        const clase = `planta ${p.clase || ''}`;
        const d = simbolo(p.forma, x, y, r);
        return d
          ? <path key={i} className={clase} d={d} vectorEffect="non-scaling-stroke" />
          : <circle key={i} className={clase} cx={x} cy={y} r={r} vectorEffect="non-scaling-stroke" />;
      })}
      {etiquetas.map((e, i) => {
        const [x, y] = proyectar(e.lng, e.lat);
        return (
          <text
            key={i}
            className={`mapa-etiqueta ${e.clase || ''}`}
            x={x + (e.dx || 0) * u} y={y + (e.dy || 0) * u}
            fontSize={(e.tam || 9) * u}
            textAnchor={e.anchor || 'start'}
            vectorEffect="non-scaling-stroke"
          >
            {e.texto}
          </text>
        );
      })}
    </svg>
  );
}
