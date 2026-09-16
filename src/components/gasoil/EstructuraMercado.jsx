import { useMemo, useState } from 'react';
import { Sankey, Tooltip, Layer, Rectangle, ResponsiveContainer } from 'recharts';
import {
  MESES, ULTIMO_MES, IDX_MES, FLUJOS, CANALES_DIST, CANALES_COM, TIPOS_NEGOCIO,
} from '../../lib/gasoil.js';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import './GasOil.css';

const UMBRAL_OTROS = 0.01; // niveles con menos del 1% del volumen se agrupan en "Otros"

/**
 * Réplica del tablero "MARKET STRUCTURE": un Sankey con el volumen de gas oil
 * (grados 2 y 3) del relevamiento SE 1104 por canal de distribución → tipo
 * de negocio → canal de comercialización, para un mes. Decisión HDO
 * (16/09/2026): el ancho es volumen (el workbook usaba precio promedio).
 */
export default function EstructuraMercado() {
  const C = useChartColors();
  const [mes, setMes] = useState(ULTIMO_MES);
  const [grado, setGrado] = useState('ambos');
  const mi = IDX_MES.get(mes);
  const vol = (r) => (grado === '2' ? r[4] : grado === '3' ? r[5] : r[4] + r[5]);

  const datos = useMemo(() => {
    const filas = FLUJOS.filter((r) => r[0] === mi);
    const total = filas.reduce((s, r) => s + vol(r), 0);
    // Totales por nivel para decidir qué se agrupa en "Otros"
    const porTipo = new Map();
    const porCanal = new Map();
    for (const r of filas) {
      porTipo.set(r[2], (porTipo.get(r[2]) || 0) + vol(r));
      porCanal.set(r[3], (porCanal.get(r[3]) || 0) + vol(r));
    }
    const nombreTipo = (t) => (porTipo.get(t) / total < UMBRAL_OTROS ? 'Otros tipos de negocio' : TIPOS_NEGOCIO[t]);
    const nombreCanal = (c) => (porCanal.get(c) / total < UMBRAL_OTROS ? 'Otros canales' : CANALES_COM[c]);

    const nodos = [];
    const idNodo = new Map();
    const nodo = (nivel, nombre) => {
      const k = `${nivel}|${nombre}`;
      if (!idNodo.has(k)) {
        idNodo.set(k, nodos.length);
        nodos.push({ name: nombre, nivel, color: [C.exp, C.oil, C.neutral][nivel] });
      }
      return idNodo.get(k);
    };
    const enlaces = new Map();
    const enlace = (a, b, v) => {
      const k = `${a}>${b}`;
      enlaces.set(k, (enlaces.get(k) || 0) + v);
    };
    for (const r of filas) {
      const v = vol(r);
      if (v <= 0) continue;
      const n0 = nodo(0, CANALES_DIST[r[1]]);
      const n1 = nodo(1, nombreTipo(r[2]));
      const n2 = nodo(2, nombreCanal(r[3]));
      enlace(n0, n1, v);
      enlace(n1, n2, v);
    }
    const links = [...enlaces.entries()].map(([k, value]) => {
      const [source, target] = k.split('>').map(Number);
      return { source, target, value };
    });
    // Resumen para las tarjetas
    const minorista = filas.filter((r) => r[1] === 0).reduce((s, r) => s + vol(r), 0);
    const publico = filas.filter((r) => CANALES_COM[r[3]] === 'Al público').reduce((s, r) => s + vol(r), 0);
    const tablaCanal = [...porCanal.entries()].map(([c, v]) => ({ nombre: CANALES_COM[c], v })).sort((a, b) => b.v - a.v);
    const tablaTipo = [...porTipo.entries()].map(([t, v]) => ({ nombre: TIPOS_NEGOCIO[t], v })).sort((a, b) => b.v - a.v);
    return { nodes: nodos, links, total, minorista, publico, tablaCanal, tablaTipo };
  }, [mi, grado, C]);

  const etiquetaGrado = grado === 'ambos' ? 'grados 2 y 3' : `grado ${grado}`;

  return (
    <div className="go-seccion">
      <div className="empresa-selector-row go-controles">
        <label htmlFor="go-em-mes">Mes</label>
        <select id="go-em-mes" className="empresa-select" value={mes} onChange={(e) => setMes(e.target.value)}>
          {[...MESES].reverse().map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
        </select>
        <label>Producto</label>
        <div className="chart-range-selector">
          {[['ambos', 'Grados 2 y 3'], ['2', 'Grado 2'], ['3', 'Grado 3']].map(([id, l]) => (
            <button key={id} className={grado === id ? 'active' : ''} onClick={() => setGrado(id)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Volumen relevado</div>
          <div className="kpi-val">{fmt.int(datos.total)} <span className="kpi-unidad">m³</span></div>
          <div className="kpi-sub">{fmt.monthShort(mes)} · gas oil {etiquetaGrado}</div>
        </div>
        <div className="kpi-card tone-info">
          <div className="kpi-label">Canal minorista</div>
          <div className="kpi-val">{fmt.pct(datos.total ? (datos.minorista / datos.total) * 100 : 0)}</div>
          <div className="kpi-sub">{fmt.int(datos.minorista)} m³ · el resto es mayorista</div>
        </div>
        <div className="kpi-card tone-warn">
          <div className="kpi-label">Venta al público</div>
          <div className="kpi-val">{fmt.pct(datos.total ? (datos.publico / datos.total) * 100 : 0)}</div>
          <div className="kpi-sub">{fmt.int(datos.publico)} m³ en surtidor</div>
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-card-header">
          <div>
            <span className="chart-card-title">Canal de distribución → tipo de negocio → canal de comercialización</span>
            <span className="chart-card-subtitle">
              {fmt.monthShort(mes)} · ancho = m³ de gas oil {etiquetaGrado} · niveles con menos del 1% agrupados en "Otros"
            </span>
          </div>
        </div>
        <div className="chart-card-body go-sankey">
          <ResponsiveContainer width="100%" height={560}>
            <Sankey
              data={datos}
              nodeWidth={12}
              nodePadding={14}
              linkCurvature={0.5}
              iterations={48}
              margin={{ top: 10, right: 210, bottom: 10, left: 10 }}
              node={<Nodo C={C} />}
              link={{ stroke: C.tick, strokeOpacity: 0.18 }}
            >
              <Tooltip content={<TooltipSankey total={datos.total} />} />
            </Sankey>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="go-charts-grid">
        <TablaNivel titulo="Por canal de comercialización" filas={datos.tablaCanal} total={datos.total} />
        <TablaNivel titulo="Por tipo de negocio" filas={datos.tablaTipo} total={datos.total} />
      </div>

      <p className="note go-nota">
        Fuente: Secretaría de Energía, relevamiento Res. 1104/2004 (volúmenes declarados por las bocas de expendio y
        comercializadores, minoristas y mayoristas). Último mes: {fmt.monthShort(ULTIMO_MES)}.
      </p>
    </div>
  );
}

function Nodo({ x, y, width, height, index, payload, containerWidth, C }) {
  // Etiquetas siempre a la derecha del nodo; el nivel del medio se abrevia
  // para no pisar el tercero (el margen derecho del Sankey aloja las últimas)
  const largo = payload.nivel === 1 ? 30 : 40;
  const etiqueta = payload.name.length > largo ? `${payload.name.slice(0, largo - 1)}…` : payload.name;
  return (
    <Layer key={`nodo-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill={payload.color} fillOpacity={0.9} />
      {height > 6 && (
        <text
          x={x + width + 6} y={y + height / 2} textAnchor="start" dominantBaseline="middle"
          fontSize={11} fill={C.ink}
        >
          {etiqueta}
          <tspan fill={C.tick}> {fmt.compact(payload.value)}</tspan>
        </text>
      )}
      {containerWidth === undefined && null}
    </Layer>
  );
}

function TooltipSankey({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const nombre = p.source && p.target ? `${p.source.name} → ${p.target.name}` : p.name;
  const v = p.value;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{nombre}</div>
      <div className="chart-tooltip-row">
        <div className="chart-tooltip-row-label"><span>Volumen</span></div>
        <span className="chart-tooltip-row-val">{fmt.int(v)} m³ · {fmt.pct(total ? (v / total) * 100 : 0)}</span>
      </div>
    </div>
  );
}

function TablaNivel({ titulo, filas, total }) {
  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <div><span className="chart-card-title">{titulo}</span></div>
      </div>
      <div className="mh-tabla-scroll">
        <table className="mh-tabla go-tabla go-tabla-quieta">
          <thead>
            <tr><th>Nivel</th><th className="num">m³</th><th className="num">Participación</th></tr>
          </thead>
          <tbody>
            {filas.filter((f) => f.v > 0).map((f) => (
              <tr key={f.nombre}>
                <td>{f.nombre}</td>
                <td className="num">{fmt.int(f.v)}</td>
                <td className="num">{fmt.pct(total ? (f.v / total) * 100 : 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
