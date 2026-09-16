import { useEffect, useRef, useState } from 'react';
import { MAPA, proyectar, CAJA_PROVINCIA } from '../../lib/gasoil.js';

const [VX, VY, VW, VH] = MAPA.viewBox.split(' ').map(Number);
const FUENTE_PX = 9;        // tamaño en pantalla de las etiquetas de precio
const MIN_ETIQUETA_PX = 34; // provincias más chicas que esto (alto o ancho en px) van sin etiqueta

/**
 * Mapa de la Argentina por provincia (coroplético) o de puntos (estaciones).
 *   valores     Map(provincia → número) que define la intensidad del relleno
 *   etiquetas   Map(provincia → [línea, …]) texto centrado en cada provincia
 *   color       color base (hex) del relleno
 *   seleccion   provincia seleccionada (o null); clic alterna; clic en el fondo la quita
 *   onSeleccion (provincia | null) => void
 *   encuadre    provincia a la que se acerca el mapa (o null: país entero)
 *   puntos      [{ id, lng, lat, color, titulo, filas, activo }] o null (capa de estaciones)
 *   onPunto     (id) => void: clic sobre una estación
 *   tooltip     (provincia) => { titulo, filas: [{ label, valor }] } o null
 */
export default function MapaProvincias({
  valores, etiquetas, color, seleccion, onSeleccion, encuadre = null, puntos = null, onPunto, tooltip, etiqueta,
}) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null); // { prov | punto, x, y }
  const [anchoPx, setAnchoPx] = useState(0); // ancho real del svg, para etiquetas de tamaño fijo
  useEffect(() => {
    const el = wrapRef.current?.querySelector('svg');
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setAnchoPx(el.clientWidth));
    ro.observe(el);
    setAnchoPx(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const nums = [...(valores?.values() || [])].filter((v) => v != null && !isNaN(v));
  const min = nums.length ? Math.min(...nums) : 0;
  const max = nums.length ? Math.max(...nums) : 1;
  const opacidad = (v) => {
    if (v == null || isNaN(v)) return 0;
    if (max === min) return 0.6;
    return 0.15 + 0.8 * ((v - min) / (max - min));
  };

  // Encuadre: el país entero o la caja de la provincia con un margen
  let vb = [VX, VY, VW, VH];
  const caja = encuadre ? CAJA_PROVINCIA.get(encuadre) : null;
  if (caja) {
    const [x0, y0, x1, y1] = caja;
    const w = x1 - x0, h = y1 - y0;
    const m = Math.max(w, h) * 0.12;
    vb = [x0 - m, y0 - m, w + 2 * m, h + 2 * m];
  }
  const escala = vb[2] / VW; // unidades por "unidad de país": achica puntos al acercar
  const upx = anchoPx ? vb[2] / anchoPx : 1; // unidades del viewBox por píxel en pantalla

  const posicion = (e) => {
    const box = wrapRef.current?.getBoundingClientRect();
    return box ? { x: e.clientX - box.left, y: e.clientY - box.top } : null;
  };
  const moverProv = (prov) => (e) => {
    const p = posicion(e);
    if (p) setHover({ prov, ...p });
  };
  const moverPunto = (punto) => (e) => {
    const p = posicion(e);
    if (p) setHover({ punto, ...p });
  };

  let lineas = null;
  if (hover?.prov) lineas = tooltip?.(hover.prov);
  else if (hover?.punto) lineas = { titulo: hover.punto.titulo, filas: hover.punto.filas || [] };
  const derecha = hover && wrapRef.current && hover.x > wrapRef.current.clientWidth * 0.55;

  return (
    <div className={`go-mapa ${puntos ? 'con-puntos' : ''}`} ref={wrapRef}>
      <svg viewBox={vb.join(' ')} role="img" aria-label={etiqueta || 'Mapa por provincia'}>
        {/* fondo: clic afuera de las provincias quita la selección */}
        <rect x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]} fill="transparent"
          onClick={() => onSeleccion?.(null)} />
        {(MAPA.vecinos || []).map((v) => (
          <path key={v.nombre} className="go-vecino" d={v.path} vectorEffect="non-scaling-stroke"
            onClick={() => onSeleccion?.(null)} />
        ))}
        {MAPA.provincias.map((p) => {
          const v = valores?.get(p.nombre);
          const activa = seleccion === p.nombre;
          return (
            <path
              key={p.nombre}
              className={`go-prov ${activa ? 'activa' : ''} ${seleccion && !activa ? 'apagada' : ''}`}
              d={p.path}
              vectorEffect="non-scaling-stroke"
              style={{ fill: color, fillOpacity: puntos ? 0.06 : opacidad(v) }}
              onMouseMove={puntos ? undefined : moverProv(p.nombre)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSeleccion?.(activa ? null : p.nombre)}
            />
          );
        })}
        {etiquetas && anchoPx > 260 && MAPA.provincias.map((p) => {
          const lin = etiquetas.get(p.nombre);
          const c = CAJA_PROVINCIA.get(p.nombre);
          if (!lin || !c) return null;
          const [x0, y0, x1, y1] = c;
          const anchoProv = (x1 - x0) / upx;
          const altoProv = (y1 - y0) / upx;
          if (anchoProv < MIN_ETIQUETA_PX || altoProv < MIN_ETIQUETA_PX || y1 - y0 > 400) return null;
          const fuente = FUENTE_PX * upx;
          const paso = fuente * 1.15;
          const cx = (x0 + x1) / 2;
          const cy = (y0 + y1) / 2 - ((lin.length - 1) * paso) / 2 + fuente * 0.35;
          return (
            <text key={p.nombre} className="go-etiqueta" x={cx} y={cy} textAnchor="middle"
              style={{ pointerEvents: 'none', fontSize: fuente, strokeWidth: 1.6 * upx }}>
              {lin.map((t, i) => (
                <tspan key={i} x={cx} dy={i === 0 ? 0 : paso} className={i === lin.length - 1 ? 'fuerte' : ''}>{t}</tspan>
              ))}
            </text>
          );
        })}
        {puntos && (
          <g className="go-eess">
            {puntos.map((pt) => {
              const [x, y] = proyectar(pt.lng, pt.lat);
              const r = (pt.activo ? 5 : 2.4) * Math.max(escala, 0.12);
              return (
                <circle
                  key={pt.id} cx={x} cy={y} r={r} fill={pt.color}
                  className={pt.activo ? 'activo' : ''}
                  vectorEffect="non-scaling-stroke"
                  onMouseMove={moverPunto(pt)}
                  onMouseLeave={() => setHover(null)}
                  onClick={(e) => { e.stopPropagation(); onPunto?.(pt.id); }}
                />
              );
            })}
          </g>
        )}
      </svg>
      {hover && lineas && (
        <div
          className={`go-mapa-tooltip ${derecha ? 'izquierda' : ''}`}
          style={{ left: hover.x, top: hover.y }}
        >
          <div className="go-mapa-tooltip-titulo">{lineas.titulo}</div>
          {lineas.filas.map((l, i) => (
            l.separador ? <div key={`s${i}`} className="go-mapa-tooltip-sep" /> : (
              <div key={l.label} className="go-mapa-tooltip-fila">
                <span>{l.label}</span>
                <strong>{l.valor}</strong>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}
