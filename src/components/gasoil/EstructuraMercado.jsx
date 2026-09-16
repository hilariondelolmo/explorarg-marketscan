import { useMemo, useState } from 'react';
import { Sankey, Tooltip, Layer, Rectangle, ResponsiveContainer } from 'recharts';
import { ULTIMO_MES, CANALES_DIST, CANALES_COM, TIPOS_NEGOCIO, ponderarCol, fmtPrecio } from '../../lib/gasoil.js';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import { useRelevamiento, useCajas, BloqueFijo, CC_PUBLICO, TODAS } from './relevamiento.jsx';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import './GasOil.css';

const UMBRAL_OTROS = 0.01; // niveles con menos del 1% del volumen se agrupan en "Otros"
const abreviarTipo = (t) => t
  .replace('Bocas de expendio (venta por menor) ', 'Bocas · ')
  .replace('Boca de expendio de sólo ', 'Bocas · sólo ')
  .replace(' (venta a granel mayorista, incluye tambores)', ' (granel, con tambores)')
  .replace(' (venta a granel mayorista)', ' (granel)');
const GRADOS = [['ambos', 'Grados 2 y 3'], ['2', 'Grado 2'], ['3', 'Grado 3']];

/**
 * Réplica del tablero "MARKET STRUCTURE": un Sankey con el volumen de gas oil
 * (grados 2 y 3) del relevamiento SE 1104 por canal de distribución → tipo
 * de negocio → canal de comercialización, para un mes, con la misma apertura
 * que Precio surtidor (los ocho filtros; con operador o estación, sus bocas).
 * Decisión HDO (16/09/2026): el ancho es volumen (el workbook usaba precio
 * promedio); el precio ponderado de cada nivel va en las tablas.
 */
export default function EstructuraMercado({ seccion }) {
  const C = useChartColors();
  const F = useRelevamiento({ modo: 'abierto' });
  const {
    DX, listo, error, OPERADORES, operador, conOperador, mes, tipo, conv, cdN, ccN, tiposIdx, cambiarCc, tipos, setTipos, disponibles,
    fMes, fBase, fCanal, fBand, fProv, claves, etiquetaCanal, etiquetaFiltro,
  } = F;
  const [abiertos, alternar] = useCajas({ kpi: false, sankey: true, canal: false, tipo: false });
  const [grado, setGrado] = useState('ambos');
  const etiquetaGrado = grado === 'ambos' ? 'grados 2 y 3' : `grado ${grado}`;
  const vol = (i) => (grado === '2' ? DX.w2[i] : grado === '3' ? DX.w3[i] : DX.w2[i] + DX.w3[i]);

  const datos = useMemo(() => {
    if (!listo) return null;
    const filtro = (i) => fMes(i) && fCanal(i) && fBand(i) && fProv(i);
    const celdas = new Map(); // "cd|tn|cc" → m³
    const porCd = new Map();
    const porTipo = new Map();
    const porCanal = new Map();
    let total = 0;
    let w2 = 0;
    let w3 = 0;
    let publico = 0;
    const suma = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
    for (let i = 0; i < DX.mes.length; i++) {
      if (!filtro(i)) continue;
      w2 += DX.w2[i];
      w3 += DX.w3[i];
      const v = vol(i);
      if (!v) continue;
      total += v;
      if (DX.cc[i] === CC_PUBLICO) publico += v;
      suma(porCd, DX.cd[i], v);
      suma(porTipo, DX.tn[i], v);
      suma(porCanal, DX.cc[i], v);
      suma(celdas, `${DX.cd[i]}|${DX.tn[i]}|${DX.cc[i]}`, v);
    }
    // Niveles chicos agrupados en "Otros"; los tipos de boca se abrevian para
    // que no queden dos etiquetas iguales al truncarlas en el diagrama
    const nombreTipo = (t) => (porTipo.get(t) / total < UMBRAL_OTROS ? 'Otros tipos de negocio' : abreviarTipo(TIPOS_NEGOCIO[t]));
    const nombreCanal = (c) => (porCanal.get(c) / total < UMBRAL_OTROS ? 'Otros canales' : CANALES_COM[c]);
    const nodes = [];
    const idNodo = new Map();
    const nodo = (nivel, nombre) => {
      const k = `${nivel}|${nombre}`;
      if (!idNodo.has(k)) {
        idNodo.set(k, nodes.length);
        nodes.push({ name: nombre, nivel, color: [C.exp, C.oil, C.neutral][nivel] });
      }
      return idNodo.get(k);
    };
    const enlaces = new Map();
    for (const [k, v] of celdas) {
      const [cd, tn, cc] = k.split('|').map(Number);
      const n0 = nodo(0, CANALES_DIST[cd]);
      const n1 = nodo(1, nombreTipo(tn));
      const n2 = nodo(2, nombreCanal(cc));
      suma(enlaces, `${n0}>${n1}`, v);
      suma(enlaces, `${n1}>${n2}`, v);
    }
    const links = [...enlaces.entries()].map(([k, value]) => {
      const [source, target] = k.split('>').map(Number);
      return { source, target, value };
    });
    return { nodes, links, total, w2, w3, publico, minorista: porCd.get(0) || 0, mayorista: porCd.get(1) || 0 };
  }, [...claves, grado, C]);

  // Tablas por nivel, con volumen y precio ponderado (tipo de precio elegido).
  // Cada tabla ignora el filtro de su propio nivel (como la tabla por bandera
  // de Precio surtidor): así se pasa de un canal o tipo a otro con un clic;
  // el resto de los filtros sí aplica.
  const tablas = useMemo(() => {
    if (!listo) return null;
    const comun = (i) => fMes(i) && fBase(i) && (cdN == null || DX.cd[i] === cdN) && fBand(i) && fProv(i);
    const nivel = (filtro, clave, nombres) => {
      const v = new Map();
      for (let i = 0; i < DX.mes.length; i++) {
        if (!filtro(i)) continue;
        const k = clave(i);
        v.set(k, (v.get(k) || 0) + vol(i));
      }
      const g2 = ponderarCol(DX, filtro, clave, tipo.campo, 2);
      const g3 = ponderarCol(DX, filtro, clave, tipo.campo, 3);
      const filas = [...v.entries()].filter(([, x]) => x > 0)
        .map(([id, x]) => ({ id, nombre: nombres[id], v: x, g2: conv(g2.get(id)?.precio), g3: conv(g3.get(id)?.precio) }))
        .sort((a, b) => b.v - a.v);
      return { filas, total: filas.reduce((s, f) => s + f.v, 0) };
    };
    return {
      canal: nivel((i) => comun(i) && tiposIdx.has(DX.tn[i]), (i) => DX.cc[i], CANALES_COM),
      tipo: nivel((i) => comun(i) && (ccN == null || DX.cc[i] === ccN), (i) => DX.tn[i], TIPOS_NEGOCIO),
    };
  }, [...claves, grado]);

  if (error) return <div className="section-placeholder">No se pudo cargar el relevamiento: {error}</div>;

  const pct = (v, total = datos?.total) => fmt.pct(total ? (v / total) * 100 : 0);
  const pctGrado = datos && datos.w2 + datos.w3 ? (datos.w3 / (datos.w2 + datos.w3)) * 100 : 0;
  const top = (t) => t.filas.slice(0, 2).map((f) => `${f.nombre} ${pct(f.v, t.total)}`).join(' · ');
  const tipoElegido = tipos.size === 1 ? [...tipos][0] : null;
  const elegirTipo = (nombre) => setTipos(tipoElegido === nombre ? new Set(disponibles.tipos) : new Set([nombre]));
  const elegirCanal = (id) => cambiarCc(ccN === id ? TODAS : String(id));

  const cajas = [
    {
      id: 'kpi', titulo: 'Resultado del relevamiento',
      detalle: datos ? `${fmt.compact(datos.total)} m³ · ${pct(datos.minorista)} minorista · ${pct(datos.publico)} al público` : 'cargando…',
    },
    {
      id: 'sankey', titulo: 'Diagrama de flujos',
      detalle: `Canal de distribución → tipo de negocio → canal de comercialización · ancho = m³ de gas oil ${etiquetaGrado}`,
    },
    {
      id: 'canal', titulo: 'Por canal de comercialización',
      detalle: tablas ? `${top(tablas.canal)} · ${tablas.canal.filas.length} canales` : 'cargando…',
    },
    {
      id: 'tipo', titulo: 'Por tipo de negocio',
      detalle: tablas ? `${top(tablas.tipo)} · ${tablas.tipo.filas.length} tipos` : 'cargando…',
    },
  ];

  const tarjetas = datos && (
    <div className="kpi-grid go-kpis-fila">
      <div className="kpi-card">
        <div className="kpi-label">Volumen relevado</div>
        <div className="kpi-val">{fmt.int(datos.total)} <span className="kpi-unidad">m³</span></div>
        <div className="kpi-sub">{fmt.monthShort(mes)} · gas oil {etiquetaGrado} · {etiquetaCanal}</div>
      </div>
      <div className="kpi-card tone-info">
        <div className="kpi-label">Canal minorista</div>
        <div className="kpi-val">{pct(datos.minorista)}</div>
        <div className="kpi-sub">{fmt.int(datos.minorista)} m³ · mayorista {fmt.int(datos.mayorista)} m³</div>
      </div>
      <div className="kpi-card tone-warn">
        <div className="kpi-label">Venta al público</div>
        <div className="kpi-val">{pct(datos.publico)}</div>
        <div className="kpi-sub">{fmt.int(datos.publico)} m³ al público</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">Gas oil grado 3</div>
        <div className="kpi-val">{fmt.pct(pctGrado)}</div>
        <div className="kpi-sub">{fmt.int(datos.w3)} m³ de grado 3 · {fmt.int(datos.w2)} m³ de grado 2</div>
      </div>
    </div>
  );

  const tablaNivel = (titulo, t, activa, elegir) => (
    <div className="go-desplegable-cuerpo mh-tabla-scroll">
      <table className="mh-tabla go-tabla">
        <thead>
          <tr>
            <th>{titulo}</th>
            <th className="num">Volumen m³</th>
            <th className="num">Participación</th>
            <th className="num">Grado 2 ({tipo.unidad})</th>
            <th className="num">Grado 3 ({tipo.unidad})</th>
          </tr>
        </thead>
        <tbody>
          {t.filas.map((f) => (
            <tr key={f.id} className={activa(f) ? 'activa' : ''} onClick={() => elegir(f)}>
              <td>{f.nombre}</td>
              <td className="num">{fmt.int(f.v)}</td>
              <td className="num">{pct(f.v, t.total)}</td>
              <td className="num">{fmtPrecio(f.g2, tipo.unidad)}</td>
              <td className="num">{fmtPrecio(f.g3, tipo.unidad)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num">{fmt.int(t.total)}</td>
            <td className="num">{fmt.pct(t.total ? 100 : 0)}</td>
            <td className="num" />
            <td className="num" />
          </tr>
        </tfoot>
      </table>
    </div>
  );

  return (
    <div className="go-seccion">
      <BloqueFijo
        seccion={seccion} tituloDefault="Estructura del mercado local" F={F}
        cajas={cajas} abiertos={abiertos} alternar={alternar}
      />

      {abiertos.kpi && datos && <div className="go-desplegable-cuerpo">{tarjetas}</div>}
      {!listo ? (
        <div className="section-placeholder">
          {conOperador ? `Cargando los datos de ${OPERADORES[operador]}…` : 'Cargando el relevamiento de precios (8 MB, una sola vez)…'}
        </div>
      ) : (
        <>
          {abiertos.sankey && (
            <div className="chart-card">
              <div className="chart-card-header">
                <div>
                  <span className="chart-card-title">Canal de distribución → tipo de negocio → canal de comercialización</span>
                  <span className="chart-card-subtitle">
                    {fmt.monthShort(mes)} · {etiquetaCanal}{etiquetaFiltro ? ` · ${etiquetaFiltro}` : ''} · ancho = m³ de gas oil {etiquetaGrado} · niveles con menos del 1% agrupados en "Otros"
                  </span>
                </div>
                <div className="go-selectores-grafico">
                  <div className="chart-range-selector">
                    {GRADOS.map(([id, l]) => (
                      <button key={id} className={grado === id ? 'active' : ''} onClick={() => setGrado(id)}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="chart-card-body go-sankey">
                {datos.links.length ? (
                  <ResponsiveContainer width="100%" height={560}>
                    <Sankey
                      data={{ nodes: datos.nodes, links: datos.links }}
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
                ) : (
                  <div className="section-placeholder">Sin volumen relevado para esta selección en {fmt.monthShort(mes)}.</div>
                )}
              </div>
            </div>
          )}

          {abiertos.canal && tablaNivel('Canal de comercialización', tablas.canal, (f) => ccN === f.id, (f) => elegirCanal(f.id))}
          {abiertos.tipo && tablaNivel('Tipo de negocio', tablas.tipo, (f) => tipoElegido === f.nombre, (f) => elegirTipo(f.nombre))}

          <p className="note go-nota">
            Fuente: Secretaría de Energía, relevamiento Res. 1104/2004 (volúmenes declarados por las bocas de expendio y
            comercializadores, minoristas y mayoristas). Precio de cada nivel ponderado por el volumen de cada boca
            ({tipo.label.toLowerCase()}). Cada tabla muestra su nivel completo aunque esté filtrado: clic en una fila
            filtra ese canal o tipo en el resto de la sección; otro clic lo suelta.
            Último mes: {fmt.monthShort(ULTIMO_MES)}.
          </p>
        </>
      )}
    </div>
  );
}

function Nodo({ x, y, width, height, index, payload, C }) {
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
