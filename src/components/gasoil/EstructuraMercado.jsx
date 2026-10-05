import { useMemo, useState } from 'react';
import { ULTIMO_MES, BANDERAS, CANALES_DIST, CANALES_COM, TIPOS_NEGOCIO, ponderarCol, fmtPrecio, colorBandera } from '../../lib/gasoil.js';
import { fmt } from '../../lib/format.js';
import { useChartColors, useTheme } from '../../lib/theme.jsx';
import { useRelevamiento, useCajas, BloqueFijo, CC_PUBLICO, TODAS, NOTA_MESES_EXCLUIDOS } from './relevamiento.jsx';
import SankeyMercado, { NIVELES } from './SankeyMercado.jsx';
import { paletaSankey } from './coloresSankey.js';
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
 * Réplica del tablero "MARKET STRUCTURE": un Sankey de cuatro tótems con el
 * volumen de gas oil (grados 2 y 3) del relevamiento SE 1104 por bandera →
 * canal de distribución → tipo de negocio → canal de comercialización, para
 * un mes, con la misma apertura que Precio surtidor (los ocho filtros; con
 * operador o estación, sus bocas). Decisiones HDO (16 y 17/09/2026): el ancho
 * es volumen (el workbook usaba precio promedio), el precio va en el tooltip
 * y en las tablas, y al pasar el mouse por una categoría de un tótem se marcan
 * sus flujos. El clic tiene dos modos a elección del usuario (30/09/2026):
 * "Resaltar" deja fija la marca, como el tablero de Tableau, y cada nodo
 * muestra cuánto de su volumen pasa por lo elegido; "Filtrar" (29/09/2026)
 * pasa esa categoría al filtro de arriba que le corresponde (un flujo, sus
 * dos puntas), así el diagrama, las tarjetas y las tablas quedan solo con lo
 * que pasa por ella; otro clic la suelta.
 */
const MODOS_CLIC = [['resaltar', 'Resaltar'], ['filtrar', 'Filtrar']];
export default function EstructuraMercado({ seccion }) {
  const C = useChartColors();
  const { theme } = useTheme();
  const paleta = useMemo(() => paletaSankey(C, theme, TIPOS_NEGOCIO, CANALES_COM, colorBandera), [C, theme]);
  const F = useRelevamiento({ modo: 'abierto' });
  const {
    DX, listo, error, OPERADORES, operador, conOperador, mes, tipo, conv, cdN, ccN, tiposIdx, cambiarCd, cambiarCc, tipos, setTipos, disponibles,
    bandera, setBandera, fMes, fBase, fCanal, fBand, fProv, claves, etiquetaCanal, etiquetaFiltro, etiquetaProvincias,
  } = F;
  const [abiertos, alternar] = useCajas({ kpi: false, sankey: true, canal: false, tipo: false });
  const [grado, setGrado] = useState('ambos');
  const [modoClic, setModoClic] = useState('filtrar');
  const etiquetaGrado = grado === 'ambos' ? 'grados 2 y 3' : `grado ${grado}`;
  const vol = (i) => (grado === '2' ? DX.w2[i] : grado === '3' ? DX.w3[i] : DX.w2[i] + DX.w3[i]);

  const datos = useMemo(() => {
    if (!listo) return null;
    const filtro = (i) => fMes(i) && fCanal(i) && fBand(i) && fProv(i);
    const P2 = DX[`${tipo.campo}2`];
    const P3 = DX[`${tipo.campo}3`];
    // Celdas = recorridos bandera → canal dist → tipo → canal com, con volumen
    // (de los grados elegidos) y sumas para el precio ponderado de cada grado
    const celdas = new Map();
    const volNivel = [new Map(), new Map(), new Map(), new Map()];
    const suma = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
    let total = 0;
    let w2 = 0;
    let w3 = 0;
    let publico = 0;
    for (let i = 0; i < DX.mes.length; i++) {
      if (!filtro(i)) continue;
      const v2 = DX.w2[i] || 0;
      const v3 = DX.w3[i] || 0;
      w2 += v2;
      w3 += v3;
      const v = grado === '2' ? v2 : grado === '3' ? v3 : v2 + v3;
      if (!v) continue;
      total += v;
      if (DX.cc[i] === CC_PUBLICO) publico += v;
      const ids = [DX.band[i], DX.cd[i], DX.tn[i], DX.cc[i]];
      const k = ids.join('|');
      let c = celdas.get(k);
      if (!c) {
        c = { ids, v: 0, w2: 0, pw2: 0, w3: 0, pw3: 0 };
        celdas.set(k, c);
      }
      c.v += v;
      if (P2[i] && v2) { c.w2 += v2; c.pw2 += (P2[i] / 100) * v2; }
      if (P3[i] && v3) { c.w3 += v3; c.pw3 += (P3[i] / 100) * v3; }
      ids.forEach((id, n) => suma(volNivel[n], id, v));
    }
    // Nombre de cada valor por nivel; los menores al 1 % se agrupan en "Otros"
    const LISTAS = [BANDERAS, CANALES_DIST, TIPOS_NEGOCIO, CANALES_COM];
    const OTROS = ['Otras banderas', null, 'Otros tipos de negocio', 'Otros canales'];
    const nombre = (n, id) => (OTROS[n] && volNivel[n].get(id) / total < UMBRAL_OTROS ? OTROS[n] : LISTAS[n][id]);
    const colorDe = (n, nm) => {
      if (nm === OTROS[n]) return paleta.otros;
      if (n === 0) return paleta.bandera(nm);
      if (n === 1) return paleta.distribucion(nm);
      return (n === 2 ? paleta.tipo : paleta.canal).get(nm) || paleta.otros;
    };
    // Nodos por nivel en orden alfabético ("Otros" al final), como el tablero
    const nodes = [];
    const idNodo = new Map();
    for (let n = 0; n < 4; n++) {
      const nombres = [...new Set([...volNivel[n].keys()].map((id) => nombre(n, id)))]
        .sort((a, b) => (a === OTROS[n]) - (b === OTROS[n]) || a.localeCompare(b));
      nombres.forEach((nm, j) => {
        idNodo.set(`${n}|${nm}`, nodes.length);
        nodes.push({
          name: nm, nombre: nm, etiqueta: n === 2 ? abreviarTipo(nm) : nm, nivel: n, color: colorDe(n, nm),
          cabecera: j === 0 ? NIVELES[n] : null, filtrable: nm !== OTROS[n], celdas: new Set(), w2: 0, pw2: 0, w3: 0, pw3: 0,
        });
      });
    }
    // Enlaces entre niveles consecutivos, con las celdas que pasan por cada uno
    const enlaces = new Map();
    for (const [k, c] of celdas) {
      const ruta = c.ids.map((id, n) => idNodo.get(`${n}|${nombre(n, id)}`));
      for (const ni of ruta) {
        const nd = nodes[ni];
        nd.celdas.add(k);
        nd.w2 += c.w2; nd.pw2 += c.pw2; nd.w3 += c.w3; nd.pw3 += c.pw3;
      }
      for (let t = 0; t < 3; t++) {
        const ke = `${ruta[t]}>${ruta[t + 1]}`;
        let e = enlaces.get(ke);
        if (!e) {
          e = { source: ruta[t], target: ruta[t + 1], value: 0, celdas: new Map(), w2: 0, pw2: 0, w3: 0, pw3: 0 };
          enlaces.set(ke, e);
        }
        e.value += c.v;
        e.celdas.set(k, c.v);
        e.w2 += c.w2; e.pw2 += c.pw2; e.w3 += c.w3; e.pw3 += c.pw3;
      }
    }
    return {
      nodes, links: [...enlaces.values()], total, w2, w3, publico,
      celdaVol: new Map([...celdas].map(([k, c]) => [k, c.v])),
      minorista: volNivel[1].get(0) || 0, mayorista: volNivel[1].get(1) || 0,
    };
  }, [...claves, grado, paleta]);

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
  // Clic en un nodo del Sankey: su categoría pasa al filtro de su tótem; si ya lo era, lo suelta
  const elegirNodo = (n) => {
    if (n.nivel === 0) setBandera(bandera === n.nombre ? TODAS : n.nombre);
    else if (n.nivel === 1) cambiarCd(cdN === CANALES_DIST.indexOf(n.nombre) ? 'ambos' : String(CANALES_DIST.indexOf(n.nombre)));
    else if (n.nivel === 2) elegirTipo(n.nombre);
    else elegirCanal(CANALES_COM.indexOf(n.nombre));
  };
  const elegidos = new Set([
    bandera !== TODAS && `0|${bandera}`,
    cdN != null && `1|${CANALES_DIST[cdN]}`,
    tipoElegido && `2|${tipoElegido}`,
    ccN != null && `3|${CANALES_COM[ccN]}`,
  ].filter(Boolean));
  // Clic en un flujo: sus dos puntas pasan a ser filtro; si ya lo eran las dos, se sueltan
  const elegirEnlace = (e) => {
    const puntas = [e.source, e.target].filter((n) => n.filtrable);
    const yaElegidas = puntas.every((n) => elegidos.has(`${n.nivel}|${n.nombre}`));
    for (const n of puntas) {
      if (yaElegidas || !elegidos.has(`${n.nivel}|${n.nombre}`)) elegirNodo(n);
    }
  };

  const cajas = [
    {
      id: 'kpi', titulo: 'Resultado del relevamiento',
      detalle: datos ? `${fmt.compact(datos.total)} m³ · ${pct(datos.minorista)} minorista · ${pct(datos.publico)} al público` : 'cargando…',
    },
    {
      id: 'sankey', titulo: 'Diagrama de flujos',
      detalle: `Bandera → canal de distribución → tipo de negocio → canal de comercialización · ancho = m³ de gas oil ${etiquetaGrado}`,
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
        <div className="kpi-sub">{fmt.monthShort(mes)} · gas oil {etiquetaGrado} · {etiquetaCanal}{etiquetaProvincias ? ` · ${etiquetaProvincias}` : ''}</div>
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
          {conOperador ? `Cargando los datos de ${OPERADORES[operador]}…` : 'Cargando el relevamiento de precios (10 MB, una sola vez)…'}
        </div>
      ) : (
        <>
          {abiertos.sankey && (
            <div className="chart-card">
              <div className="chart-card-header">
                <div>
                  <span className="chart-card-title">Bandera → canal de distribución → tipo de negocio → canal de comercialización</span>
                  <span className="chart-card-subtitle">
                    {fmt.monthShort(mes)} · {etiquetaCanal}{etiquetaFiltro ? ` · ${etiquetaFiltro}` : ''} · ancho = m³ de gas oil {etiquetaGrado} · pasá el mouse por un nodo o un flujo para ver volumen y precio y marcar su recorrido · clic en un nodo o en un flujo: {modoClic === 'resaltar'
                      ? 'deja fija la marca y cada nodo muestra cuánto de su volumen pasa por ahí'
                      : 'deja solo lo que pasa por ahí'}, otro clic lo suelta · menores al 1% agrupados en "Otros"
                  </span>
                </div>
                <div className="go-selectores-grafico">
                  <div className="chart-range-selector">
                    {GRADOS.map(([id, l]) => (
                      <button key={id} className={grado === id ? 'active' : ''} onClick={() => setGrado(id)}>{l}</button>
                    ))}
                  </div>
                  <div className="chart-range-selector" title="Qué hace el clic en un nodo o en un flujo del diagrama">
                    <span className="go-selector-rotulo">Clic</span>
                    {MODOS_CLIC.map(([id, l]) => (
                      <button key={id} className={modoClic === id ? 'active' : ''} onClick={() => setModoClic(id)}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="chart-card-body go-sankey">
                {datos.links.length ? (
                  <SankeyMercado
                    nodes={datos.nodes} links={datos.links} celdaVol={datos.celdaVol} total={datos.total} unidad={tipo.unidad} conv={conv} C={C}
                    elegidos={elegidos} modo={modoClic} onNodo={elegirNodo} onEnlace={elegirEnlace}
                  />
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
            {' '}{NOTA_MESES_EXCLUIDOS} Último mes: {fmt.monthShort(ULTIMO_MES)}.
          </p>
        </>
      )}
    </div>
  );
}
