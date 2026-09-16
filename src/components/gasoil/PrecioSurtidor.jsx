import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  MESES, ULTIMO_MES, IDX_MES, PROVINCIAS, BANDERAS, CANALES_COM, TIPOS_NEGOCIO,
  TIPOS_PRECIO, tipoPrecio, convertir, ponderarCol, cargarRetail, cargarParte, cargarMes, desdeRango, fmtPrecio, variacion,
  colorBandera, nombreProvincia, TC, DENSIDAD_GO,
} from '../../lib/gasoil.js';
import { fmt } from '../../lib/format.js';
import { useChartColors } from '../../lib/theme.jsx';
import MapaProvincias from './MapaProvincias.jsx';
import '../mercado/Mercado.css';
import '../charts/Chart.css';
import '../KPIs.css';
import './GasOil.css';

const TODAS = 'todas';
const RANGOS = [['12m', '12 m'], ['5a', '5 a'], ['10a', '10 a'], ['todo', 'Todo']];
// Tipos de negocio que el workbook selecciona por defecto en el minorista
const TIPOS_RETAIL = new Set([
  'Bocas de expendio (venta por menor) Combustibles Líquidos + PRVE',
  'Bocas de expendio (venta por menor) Combustibles líquidos únicamente',
  'Bocas de expendio (venta por menor) Duales (líquidos + GLPA)',
  'Bocas de expendio (venta por menor) Duales (líquidos + GNC)',
  'Bocas de expendio (venta por menor) Sólo GNC',
  'Estación de servicio',
]);
const CC_PUBLICO = CANALES_COM.indexOf('Al público');

/**
 * Réplica del tablero "PRECIO SURTIDOR DASHBOARD (2)" del workbook 05:
 * relevamiento SE Res. 1104/2004 del gas oil grado 2 y 3. Filtros, en el
 * orden del tablero: mes, tipo de precio, canal de distribución, tipo de
 * negocio (multi), canal de comercialización, bandera y provincia. Todo
 * (mapa, tarjetas, tabla por bandera y series) responde a los filtros.
 *
 * Precio ponderado = Σ(precio EESS × volumen EESS) / Σ volumen EESS. Los
 * datos finos viven en public/data/gasoil_retail.json y se cargan al abrir.
 */
export default function PrecioSurtidor({ seccion }) {
  const C = useChartColors();
  const [D, setD] = useState(null);
  const [error, setError] = useState(null);
  const [mes, setMes] = useState(ULTIMO_MES);
  const [tipoId, setTipoId] = useState('surtidor');
  const [cd, setCd] = useState('0'); // '0' minorista · '1' mayorista · 'ambos'
  const [tipos, setTipos] = useState(() => new Set(TIPOS_NEGOCIO.filter((t) => TIPOS_RETAIL.has(t))));
  const [cc, setCc] = useState(CC_PUBLICO >= 0 ? String(CC_PUBLICO) : TODAS);
  const [bandera, setBandera] = useState(TODAS);
  const [operador, setOperador] = useState(null); // índice en D.operadores
  const [opTexto, setOpTexto] = useState('');
  const [boca, setBoca] = useState(null);         // nro de inscripción de la estación
  const [provincia, setProvincia] = useState(null);
  const [rango, setRango] = useState('5a');
  const [abiertos, setAbiertos] = useState({ tabla: false, kpi: false, mapas: false, graficos: true });
  const alternar = (k) => setAbiertos((a) => ({ ...a, [k]: !a[k] }));
  const [vista, setVista] = useState('mensual'); // 'mensual' | 'anual'
  const [parte, setParte] = useState(null);       // { k, datos }: partición por boca del operador
  const [mesDatos, setMesDatos] = useState(null); // { f, datos }: bocas relevadas en el mes elegido

  useEffect(() => {
    let vivo = true;
    cargarMes(mes).then((datos) => { if (vivo) setMesDatos({ f: mes, datos }); }).catch((e) => setError(e.message));
    return () => { vivo = false; };
  }, [mes]);

  useEffect(() => {
    cargarRetail().then(setD).catch((e) => setError(e.message));
  }, []);

  // Partición del operador elegido (o del operador de la estación elegida)
  const k = operador != null && D ? operador % D.partes : null;
  useEffect(() => {
    if (k == null) return undefined;
    let vivo = true;
    cargarParte(k).then((datos) => { if (vivo) setParte({ k, datos }); }).catch((e) => setError(e.message));
    return () => { vivo = false; };
  }, [k]);

  const tipo = tipoPrecio(tipoId);
  const mi = IDX_MES.get(mes);
  const bi = bandera === TODAS ? null : BANDERAS.indexOf(bandera);
  const pi = provincia ? PROVINCIAS.indexOf(provincia) : null;
  const cdN = cd === 'ambos' ? null : Number(cd);
  const ccN = cc === TODAS ? null : Number(cc);
  const tiposIdx = useMemo(() => new Set(TIPOS_NEGOCIO.map((t, i) => (tipos.has(t) ? i : -1)).filter((i) => i >= 0)), [tipos]);

  const OPERADORES = D?.operadores || [];
  const BOCAS = useMemo(() => new Map((D?.bocas || []).map((b) => [b[0], b])), [D]);
  const operadoresOrden = useMemo(
    () => OPERADORES.map((n, i) => [n, i]).sort((x, y) => x[0].localeCompare(y[0])), [OPERADORES],
  );
  // Datos efectivos: el cruce general o, con operador/estación, su partición por boca
  const conOperador = operador != null;
  const DX = conOperador ? (parte && parte.k === k ? parte.datos : null) : D;
  const listo = DX != null;

  // Opciones disponibles según el canal de distribución elegido
  const disponibles = useMemo(() => {
    const tn = new Set();
    const ccs = new Set();
    if (D) {
      for (let i = 0; i < D.mes.length; i++) {
        if (cdN != null && D.cd[i] !== cdN) continue;
        tn.add(D.tn[i]);
        ccs.add(D.cc[i]);
      }
    }
    return { tipos: [...tn].map((i) => TIPOS_NEGOCIO[i]).sort(), canales: [...ccs].map((i) => CANALES_COM[i]).sort() };
  }, [D, cdN]);

  const cambiarCd = (v) => {
    setCd(v);
    // Minorista: bocas y estaciones (default del workbook); mayorista: todos los tipos
    if (v === '0') setTipos(new Set(TIPOS_NEGOCIO.filter((t) => TIPOS_RETAIL.has(t))));
    else setTipos(new Set(TIPOS_NEGOCIO));
    if (v === '1') setCc(TODAS);
    else setCc(CC_PUBLICO >= 0 ? String(CC_PUBLICO) : TODAS);
    // El surtidor solo existe al público: fuera de ese canal, "precio final"
    // del workbook = precio con impuestos
    if (v === '1' && tipoId === 'surtidor') setTipoId('con_imp');
  };
  const cambiarCc = (v) => {
    setCc(v);
    if (v !== String(CC_PUBLICO) && tipoId === 'surtidor') setTipoId('con_imp');
  };
  const elegirOperador = (texto) => {
    setOpTexto(texto);
    const t = texto.trim().toLowerCase();
    if (!t) {
      setOperador(null);
      setBoca(null);
      return;
    }
    const idx = OPERADORES.findIndex((n) => n.toLowerCase() === t);
    if (idx >= 0 && idx !== operador) {
      setOperador(idx);
      setBoca(null);
    }
  };
  const elegirBoca = (id) => {
    if (id === boca) {
      setBoca(null);
      return;
    }
    const b = BOCAS.get(id);
    if (!b) return;
    setBoca(id);
    if (b[1] !== operador) {
      setOperador(b[1]);
      setOpTexto(OPERADORES[b[1]] || '');
    }
  };

  // Filtros combinables sobre el índice de fila
  const fBase = (i) => !conOperador || (DX.op[i] === operador && (boca == null || DX.boca[i] === boca));
  const fCanal = (i) => fBase(i) && (cdN == null || DX.cd[i] === cdN) && tiposIdx.has(DX.tn[i]) && (ccN == null || DX.cc[i] === ccN);
  const fBand = (i) => bi == null || DX.band[i] === bi;
  const fProv = (i) => pi == null || DX.prov[i] === pi;
  const fMes = (i) => DX.mes[i] === mi;
  const conv = (v, f = mes) => convertir(v, f, tipo);
  const claves = [DX, mi, cdN, tiposIdx, ccN, bi, pi, tipo, operador, boca];

  const banderasMes = useMemo(() => {
    if (!listo) return [];
    const m = ponderarCol(DX, (i) => fMes(i) && fCanal(i), (i) => DX.band[i], tipo.campo, 2);
    return [...m.entries()].sort((a, b) => b[1].w - a[1].w).map(([b]) => BANDERAS[b]);
  }, claves);

  const porProv = useMemo(() => {
    if (!listo) return null;
    const f = (i) => fMes(i) && fCanal(i) && fBand(i);
    return {
      g2: ponderarCol(DX, f, (i) => DX.prov[i], tipo.campo, 2),
      g3: ponderarCol(DX, f, (i) => DX.prov[i], tipo.campo, 3),
    };
  }, claves);

  const valoresMapa = useMemo(() => {
    const m = new Map();
    if (porProv) for (const [p, a] of porProv.g2) m.set(PROVINCIAS[p], conv(a.precio));
    return m;
  }, [porProv, tipo, mes]);

  const resumen = (f, conProv) => {
    const idx = IDX_MES.get(f);
    const filtro = (i) => DX.mes[i] === idx && fCanal(i) && fBand(i) && (!conProv || fProv(i));
    const g2 = ponderarCol(DX, filtro, () => 1, tipo.campo, 2).get(1);
    const g3 = ponderarCol(DX, filtro, () => 1, tipo.campo, 3).get(1);
    return {
      g2: g2 ? convertir(g2.precio, f, tipo) : null,
      g3: g3 ? convertir(g3.precio, f, tipo) : null,
      eess: g2?.e || g3?.e || 0, vol: (g2?.w || 0) + (g3?.w || 0),
    };
  };
  const mesAnterior = mi > 0 ? MESES[mi - 1] : null;
  const pais = useMemo(() => (listo ? resumen(mes, false) : null), claves);
  const paisAnt = useMemo(() => (listo && mesAnterior ? resumen(mesAnterior, false) : null), claves);
  const prov = useMemo(() => (listo && provincia ? resumen(mes, true) : null), claves);
  const provAnt = useMemo(() => (listo && provincia && mesAnterior ? resumen(mesAnterior, true) : null), claves);

  const tabla = useMemo(() => {
    if (!listo) return [];
    const f = (i) => fMes(i) && fCanal(i) && fProv(i);
    const g2 = ponderarCol(DX, f, (i) => DX.band[i], tipo.campo, 2);
    const g3 = ponderarCol(DX, f, (i) => DX.band[i], tipo.campo, 3);
    const todas = new Set([...g2.keys(), ...g3.keys()]);
    const filas = [...todas].map((b) => ({
      bandera: BANDERAS[b],
      eess: g2.get(b)?.e || g3.get(b)?.e || 0,
      vol: (g2.get(b)?.w || 0) + (g3.get(b)?.w || 0),
      g2: conv(g2.get(b)?.precio), g3: conv(g3.get(b)?.precio),
    }));
    filas.sort((a, b) => b.vol - a.vol);
    return filas;
  }, claves);

  const series = useMemo(() => {
    if (!listo) return { g2: [], g3: [] };
    const f = (i) => fCanal(i) && fBand(i) && fProv(i);
    const desde = desdeRango(rango, ULTIMO_MES);
    const anual = vista === 'anual';
    // Anual: ponderado por volumen de todo el año; en usd, con el TC promedio del año
    const clave = anual ? (i) => MESES[DX.mes[i]].slice(0, 4) : (i) => DX.mes[i];
    const g2 = ponderarCol(DX, f, clave, tipo.campo, 2);
    const g3 = ponderarCol(DX, f, clave, tipo.campo, 3);
    const convAnual = (v, anio) => {
      if (tipo.moneda === 'ars') return v;
      const tcs = MESES.filter((m) => m.startsWith(anio)).map((m) => TC.get(m)).filter(Boolean);
      if (!tcs.length) return null;
      const tc = tcs.reduce((a, b) => a + b, 0) / tcs.length;
      const usdL = v / tc;
      return tipo.ton ? (usdL * 1000) / DENSIDAD_GO : usdL;
    };
    const armar = (m) => {
      const pts = [];
      if (anual) {
        for (let a = Number(desde.slice(0, 4)); a <= Number(ULTIMO_MES.slice(0, 4)); a++) {
          const v = m.get(String(a));
          pts.push({ fecha: String(a), precio: v ? convAnual(v.precio, String(a)) : null });
        }
      } else {
        for (let i = IDX_MES.get(desde); i < MESES.length; i++) {
          const v = m.get(i);
          pts.push({ fecha: MESES[i], precio: v ? convertir(v.precio, MESES[i], tipo) : null });
        }
      }
      const base = pts.find((p) => p.precio != null)?.precio;
      let prev = null;
      for (const p of pts) {
        p.acumulada = variacion(p.precio, base);
        p.mensual = variacion(p.precio, prev);
        if (p.precio != null) prev = p.precio;
      }
      return pts;
    };
    return { g2: armar(g2), g3: armar(g3) };
  }, [...claves, rango, vista]);

  // Estaciones del mapa de la derecha: las bocas relevadas en el mes, con
  // los mismos filtros que el resto del tablero (y el operador/estación elegidos)
  const puntos = useMemo(() => {
    if (!D || !mesDatos || mesDatos.f !== mes) return [];
    const M = mesDatos.datos;
    const out = [];
    const u = tipo.unidad;
    for (let i = 0; i < M.boca.length; i++) {
      const b = BOCAS.get(M.boca[i]);
      if (!b || b[6] == null) continue;
      if (cdN != null && M.cd[i] !== cdN) continue;
      if (!tiposIdx.has(M.tn[i])) continue;
      if (ccN != null && M.cc[i] !== ccN) continue;
      if (bi != null && M.band[i] !== bi) continue;
      if (pi != null && b[3] !== pi) continue;
      if (conOperador && M.op[i] !== operador) continue;
      if (boca != null && M.boca[i] !== boca) continue;
      const precio = (cent) => (cent ? fmtPrecio(conv(cent / 100), u) : '-');
      const filas = [
        { label: 'Período', valor: fmt.monthShort(mes) },
        { label: 'Bandera', valor: BANDERAS[M.band[i]] },
        { label: 'Empresa', valor: OPERADORES[M.op[i]] },
        { label: 'Dirección', valor: b[5] },
        { label: 'Localidad', valor: `${b[4]}, ${nombreProvincia(PROVINCIAS[b[3]])}` },
        { separador: true },
        { label: `GO GR2 surtidor (${u})`, valor: precio(M.s2[i]) },
        { label: `GO GR3 surtidor (${u})`, valor: precio(M.s3[i]) },
        { label: `GO GR2 con imp. (${u})`, valor: precio(M.c2[i]) },
        { label: `GO GR3 con imp. (${u})`, valor: precio(M.c3[i]) },
        { separador: true },
        { label: 'GO GR2 volumen', valor: `${fmt.int(M.w2[i])} m³` },
        { label: 'GO GR3 volumen', valor: `${fmt.int(M.w3[i])} m³` },
      ];
      out.push({
        id: M.boca[i], lng: b[6], lat: b[7], color: colorBandera(BANDERAS[M.band[i]]),
        titulo: `${b[4]} · ${BANDERAS[M.band[i]]}`, filas, activo: M.boca[i] === boca,
      });
    }
    out.sort((a, b) => (a.activo ? 1 : 0) - (b.activo ? 1 : 0)); // la elegida se dibuja última
    return out;
  }, [D, mesDatos, mes, cdN, tiposIdx, ccN, bi, pi, conOperador, operador, boca, tipo]);

  const banderasPuntos = useMemo(() => {
    const n = new Map();
    for (const p of puntos) {
      const b = p.titulo.split(' · ')[1];
      n.set(b, (n.get(b) || 0) + 1);
    }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [puntos]);

  // Ponderado GR2 + GR3 de una provincia (por volumen de ambos grados)
  const ponderadoProv = (i) => {
    const g2 = porProv?.g2.get(i);
    const g3 = porProv?.g3.get(i);
    const w = (g2?.w || 0) + (g3?.w || 0);
    return w ? ((g2?.pw || 0) + (g3?.pw || 0)) / w : null;
  };
  const tooltipMapa = (p) => {
    const i = PROVINCIAS.indexOf(p);
    const g2 = porProv?.g2.get(i);
    const g3 = porProv?.g3.get(i);
    if (!g2 && !g3) return { titulo: nombreProvincia(p), filas: [{ label: 'Sin relevamiento', valor: '' }] };
    return {
      titulo: nombreProvincia(p),
      filas: [
        { label: 'Período', valor: fmt.monthShort(mes) },
        { label: `GO GR2 (${tipo.unidad})`, valor: fmtPrecio(conv(g2?.precio), tipo.unidad) },
        { label: `GO GR3 (${tipo.unidad})`, valor: fmtPrecio(conv(g3?.precio), tipo.unidad) },
        { label: `GO ponderado (${tipo.unidad})`, valor: fmtPrecio(conv(ponderadoProv(i)), tipo.unidad) },
        { separador: true },
        { label: 'Bocas con precio', valor: fmt.int(g2?.e || g3?.e || 0) },
        { label: 'Volumen (m³)', valor: fmt.int((g2?.w || 0) + (g3?.w || 0)) },
      ],
    };
  };

  const etiquetaCanal = `${cd === 'ambos' ? 'minorista y mayorista' : cd === '0' ? 'minorista' : 'mayorista'}${ccN != null ? ` · ${CANALES_COM[ccN].toLowerCase()}` : ''}`;
  const bocaSel = boca != null ? BOCAS.get(boca) : null;
  const etiquetaFiltro = [
    bandera !== TODAS && bandera,
    conOperador && OPERADORES[operador],
    bocaSel && `${bocaSel[5]}, ${bocaSel[4]}`,
    provincia && nombreProvincia(provincia),
  ].filter(Boolean).join(' · ');
  const ambito = bocaSel ? 'Estación' : conOperador ? 'Operador' : 'País';
  const resumenTipos = tipos.size === disponibles.tipos.length || tipos.size >= TIPOS_NEGOCIO.length
    ? 'Todos los tipos'
    : `${[...tipos].filter((t) => disponibles.tipos.includes(t)).length} de ${disponibles.tipos.length} tipos`;

  if (error) return <div className="section-placeholder">No se pudo cargar el relevamiento: {error}</div>;

  const tarjetas = listo && (
    <div className="kpi-grid go-kpis-fila">
      <Tarjeta label={`${ambito} · grado 2 (${tipo.unidad})`} valor={pais.g2} base={paisAnt?.g2} unidad={tipo.unidad} mesAnt={mesAnterior} />
      <Tarjeta label={`${ambito} · grado 3 (${tipo.unidad})`} valor={pais.g3} base={paisAnt?.g3} unidad={tipo.unidad} mesAnt={mesAnterior} />
      {prov ? (
        <>
          <Tarjeta label={`${nombreProvincia(provincia)} · grado 2`} valor={prov.g2} base={provAnt?.g2} unidad={tipo.unidad} mesAnt={mesAnterior} tono="info" />
          <Tarjeta label={`${nombreProvincia(provincia)} · grado 3`} valor={prov.g3} base={provAnt?.g3} unidad={tipo.unidad} mesAnt={mesAnterior} tono="info" />
        </>
      ) : (
        <>
          <div className="kpi-card">
            <div className="kpi-label">Bocas con precio</div>
            <div className="kpi-val">{fmt.int(pais.eess)}</div>
            <div className="kpi-sub">{fmt.monthShort(mes)} · {etiquetaCanal}{bandera !== TODAS ? ` · ${bandera}` : ''}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Volumen relevado</div>
            <div className="kpi-val">{fmt.compact(pais.vol)} <span className="kpi-unidad">m³</span></div>
            <div className="kpi-sub">grado 2 + grado 3, bocas con precio</div>
          </div>
        </>
      )}
    </div>
  );

  const resumenKpi = listo
    ? `GO GR2 ${fmtPrecio(pais.g2, tipo.unidad)} · GO GR3 ${fmtPrecio(pais.g3, tipo.unidad)} ${tipo.unidad} · ${fmt.int(pais.eess)} ${pais.eess === 1 ? 'boca' : 'bocas'}`
    : 'cargando…';

  const cuerpoTabla = (
    <>
      {abiertos.tabla && listo && (
        <div className="go-desplegable-cuerpo mh-tabla-scroll">
          <table className="mh-tabla go-tabla">
            <thead>
              <tr>
                <th>Bandera</th>
                <th className="num">Bocas</th>
                <th className="num">Grado 2</th>
                <th className="num">Grado 3</th>
                <th className="num">Volumen m³</th>
              </tr>
            </thead>
            <tbody>
              {tabla.map((r) => (
                <tr key={r.bandera} className={r.bandera === bandera ? 'activa' : ''} onClick={() => setBandera(r.bandera === bandera ? TODAS : r.bandera)}>
                  <td><span className="go-swatch" style={{ background: colorBandera(r.bandera) }} />{r.bandera}</td>
                  <td className="num">{fmt.int(r.eess)}</td>
                  <td className="num">{fmtPrecio(r.g2, tipo.unidad)}</td>
                  <td className="num">{fmtPrecio(r.g3, tipo.unidad)}</td>
                  <td className="num">{fmt.int(r.vol)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{fmt.int(tabla.reduce((s, r) => s + r.eess, 0))}</td>
                <td className="num">{fmtPrecio(provincia ? prov?.g2 : pais?.g2, tipo.unidad)}</td>
                <td className="num">{fmtPrecio(provincia ? prov?.g3 : pais?.g3, tipo.unidad)}</td>
                <td className="num">{fmt.int(tabla.reduce((s, r) => s + r.vol, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
  const cuerpoKpi = (
    <>
      {abiertos.kpi && <div className="go-desplegable-cuerpo">{tarjetas}</div>}
    </>
  );

  const desplegables = (
    <>
      <div className="go-desplegables go-desplegables-4">
        <button type="button" className={`go-desplegable-boton ${abiertos.kpi ? 'abierto' : ''}`}
          onClick={() => alternar('kpi')} aria-expanded={abiertos.kpi}>
          <span className="chart-card-title">Resultado del relevamiento</span>
          <span className="chart-card-subtitle">{resumenKpi}</span>
          <span className="go-desplegable-flecha">{abiertos.kpi ? '▴' : '▾'}</span>
        </button>
        <button type="button" className={`go-desplegable-boton ${abiertos.graficos ? 'abierto' : ''}`}
          onClick={() => alternar('graficos')} aria-expanded={abiertos.graficos}>
          <span className="chart-card-title">Gráficos de precios</span>
          <span className="chart-card-subtitle">Var. mensual y acum. · GO GR2 y GR3 · {tipo.label.toLowerCase()}</span>
          <span className="go-desplegable-flecha">{abiertos.graficos ? '▴' : '▾'}</span>
        </button>
        <button type="button" className={`go-desplegable-boton ${abiertos.tabla ? 'abierto' : ''}`}
          onClick={() => alternar('tabla')} aria-expanded={abiertos.tabla}>
          <span className="chart-card-title">Bocas y precio por bandera</span>
          <span className="chart-card-subtitle">Bocas, GO GR2, GO GR3 y volumen · {tabla.length} banderas</span>
          <span className="go-desplegable-flecha">{abiertos.tabla ? '▴' : '▾'}</span>
        </button>
        <button type="button" className={`go-desplegable-boton ${abiertos.mapas ? 'abierto' : ''}`}
          onClick={() => alternar('mapas')} aria-expanded={abiertos.mapas}>
          <span className="chart-card-title">Distribución geográfica</span>
          <span className="chart-card-subtitle">Precio por provincia · {listo ? fmt.int(puntos.length) : '…'} estaciones geolocalizadas</span>
          <span className="go-desplegable-flecha">{abiertos.mapas ? '▴' : '▾'}</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="go-seccion">
      <div className="go-sticky">
      <p className="section-kicker">Mercado Gas Oil</p>
      <h2>{seccion?.title ?? 'Precio del gas oil en surtidor'}</h2>
      {seccion?.intro && <p className="section-intro">{seccion.intro}</p>}
      <div className="go-filtros">
        <div className="go-filtro go-f-mes">
          <label htmlFor="go-mes">Mes</label>
          <select id="go-mes" className="empresa-select" value={mes} onChange={(e) => setMes(e.target.value)}>
            {[...MESES].reverse().map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
          </select>
        </div>
        <div className="go-filtro go-f-tipo">
          <label htmlFor="go-tipo">Tipo de precio</label>
          <select id="go-tipo" className="empresa-select" value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
            {TIPOS_PRECIO.map((t) => <option key={t.id} value={t.id}>{t.label} [{t.unidad}]</option>)}
          </select>
        </div>
        <div className="go-filtro go-f-cd">
          <label htmlFor="go-cd">Canal de distribución</label>
          <select id="go-cd" className="empresa-select" value={cd} onChange={(e) => cambiarCd(e.target.value)}>
            <option value="0">Minorista</option>
            <option value="1">Mayorista</option>
            <option value="ambos">Ambos</option>
          </select>
        </div>
        <div className="go-filtro go-f-tipos">
          <span className="go-filtro-label">Tipo de negocio</span>
          <TiposDropdown opciones={disponibles.tipos} seleccion={tipos} resumen={resumenTipos} onCambiar={setTipos} />
        </div>
        <div className="go-filtro go-f-cc">
          <label htmlFor="go-cc">Canal de comercialización</label>
          <select id="go-cc" className="empresa-select" value={cc} onChange={(e) => cambiarCc(e.target.value)}>
            <option value={TODAS}>Todos los canales</option>
            {disponibles.canales.map((c) => <option key={c} value={String(CANALES_COM.indexOf(c))}>{c}</option>)}
          </select>
        </div>
        <div className="go-filtro go-f-band">
          <label htmlFor="go-bandera">Bandera</label>
          <select id="go-bandera" className="empresa-select" value={bandera} onChange={(e) => setBandera(e.target.value)}>
            <option value={TODAS}>Todas</option>
            {banderasMes.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="go-filtro go-f-op">
          <label htmlFor="go-op">Operador</label>
          <div className="go-op-caja">
            <input
              id="go-op" className="empresa-select" list="go-op-lista" value={opTexto}
              placeholder="Todos · escribí para buscar" autoComplete="off"
              onChange={(e) => elegirOperador(e.target.value)}
            />
            {opTexto && (
              <button type="button" className="go-op-limpiar" aria-label="Quitar operador" onClick={() => elegirOperador('')}>×</button>
            )}
            <datalist id="go-op-lista">
              {operadoresOrden.map(([n, i]) => <option key={i} value={n} />)}
            </datalist>
          </div>
        </div>
        <div className="go-filtro go-f-prov">
          <label htmlFor="go-prov">Provincia</label>
          <select id="go-prov" className="empresa-select" value={provincia || ''} onChange={(e) => setProvincia(e.target.value || null)}>
            <option value="">Todo el país</option>
            {PROVINCIAS.filter((p) => p !== 'N/D').map((p) => <option key={p} value={p}>{nombreProvincia(p)}</option>)}
          </select>
        </div>
      </div>
      {desplegables}
      </div>

      {cuerpoKpi}
      {!listo ? (
        <div className="section-placeholder">
          {conOperador ? `Cargando los datos de ${OPERADORES[operador]}…` : 'Cargando el relevamiento de precios (8 MB, una sola vez)…'}
        </div>
      ) : (
        <>
          {abiertos.graficos && (
          <div className="go-charts-grid">
            {[['g2', 'Gas oil grado 2'], ['g3', 'Gas oil grado 3']].map(([k, titulo]) => (
              <div className="chart-card" key={k}>
                <div className="chart-card-header">
                  <div>
                    <span className="chart-card-title">{titulo} · variación {vista === 'anual' ? 'interanual' : 'mensual'} y acumulada</span>
                    <span className="chart-card-subtitle">
                      {tipo.label} [{tipo.unidad}] · {etiquetaCanal}{etiquetaFiltro ? ` · ${etiquetaFiltro}` : ''} · acumulada desde el inicio del período
                    </span>
                  </div>
                  <div className="go-selectores-grafico">
                    <div className="chart-range-selector">
                      <button className={vista === 'mensual' ? 'active' : ''} onClick={() => setVista('mensual')}>Mensual</button>
                      <button className={vista === 'anual' ? 'active' : ''} onClick={() => setVista('anual')}>Anual</button>
                    </div>
                    <div className="chart-range-selector">
                      {RANGOS.map(([id, label]) => (
                        <button key={id} className={rango === id ? 'active' : ''} onClick={() => setRango(id)}>{label}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="chart-card-body">
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={series[k]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <XAxis dataKey="fecha" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis}
                        tickFormatter={(v) => (vista === 'anual' ? v : fmt.monthShort(v))} minTickGap={40} />
                      <YAxis yAxisId="p" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis}
                        tickFormatter={(v) => fmtPrecio(v, tipo.unidad)} domain={['auto', 'auto']} width={58} />
                      <YAxis yAxisId="pct" orientation="right" tick={{ fill: C.tick, fontSize: 11 }} stroke={C.axis}
                        tickFormatter={(v) => fmt.pct(v, 0)} width={52} />
                      <ReferenceLine yAxisId="pct" y={0} stroke={C.axis} />
                      <Tooltip content={<TooltipSerie unidad={tipo.unidad} anual={vista === 'anual'} />} cursor={{ stroke: C.axis }} />
                      <Line yAxisId="p" dataKey="precio" name={`Precio [${tipo.unidad}]`} stroke={C.oil} strokeWidth={2} dot={vista === 'anual'} connectNulls />
                      <Line yAxisId="pct" dataKey="acumulada" name="Variación acumulada" stroke={C.ink} strokeWidth={1.3} dot={false} strokeDasharray="4 3" connectNulls />
                      <Line yAxisId="pct" dataKey="mensual" name={vista === 'anual' ? 'Variación interanual' : 'Variación mensual'} stroke={C.neutral} strokeWidth={1} dot={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div className="chart-legend">
                    <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.oil }} />Precio ponderado (eje izquierdo)</div>
                    <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.ink }} />Variación acumulada % (eje derecho)</div>
                    <div className="chart-legend-item"><span className="chart-legend-swatch" style={{ background: C.neutral }} />Variación {vista === 'anual' ? 'interanual' : 'mensual'} %</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}

          {cuerpoTabla}
          {abiertos.mapas && (
          <div className="go-mapas">
            <div className="chart-card go-mapa-card">
              <div className="chart-card-header">
                <div>
                  <span className="chart-card-title">{tipo.label} [{tipo.unidad}]</span>
                  <span className="chart-card-subtitle">
                    {fmt.monthShort(mes)} · {etiquetaCanal} · color: precio del grado 2 · pasá el mouse para ver los tres precios · clic en una provincia la selecciona, clic afuera la suelta
                  </span>
                </div>
              </div>
              <MapaProvincias
                valores={valoresMapa} color={C.oil} seleccion={provincia} onSeleccion={setProvincia}
                tooltip={tooltipMapa} etiqueta="Precio del gas oil grado 2 por provincia"
              />
              <div className="go-escala">
                <span>menor</span>
                <span className="go-escala-barra" style={{ background: `linear-gradient(90deg, ${C.oil}26, ${C.oil}f2)` }} />
                <span>mayor</span>
              </div>
            </div>
            <div className="chart-card go-mapa-card">
              <div className="chart-card-header">
                <div>
                  <span className="chart-card-title">Estaciones</span>
                  <span className="chart-card-subtitle">
                    {fmt.int(puntos.length)} bocas relevadas en {fmt.monthShort(mes)}{conOperador ? ` de ${OPERADORES[operador]}` : ''}{provincia ? ` en ${nombreProvincia(provincia)}` : ''} · clic en una la selecciona
                    {bocaSel ? ` · elegida: ${bocaSel[5]}, ${bocaSel[4]}` : ''}
                  </span>
                </div>
                {bocaSel && (
                  <button type="button" className="go-quitar-boca" onClick={() => setBoca(null)}>Quitar estación</button>
                )}
              </div>
              <MapaProvincias
                valores={null} color={C.oil} seleccion={provincia} onSeleccion={setProvincia} encuadre={provincia}
                puntos={puntos} onPunto={elegirBoca} etiqueta="Estaciones de servicio relevadas"
              />
              <div className="chart-legend go-leyenda-banderas">
                {banderasPuntos.map(([b, n]) => (
                  <div key={b} className="chart-legend-item">
                    <span className="chart-legend-swatch" style={{ background: colorBandera(b) }} />
                    <span>{b} ({fmt.int(n)})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          )}

          <p className="note go-nota">
            Fuente: Secretaría de Energía, relevamiento de precios Res. 1104/2004. Precio ponderado por el volumen de
            cada boca de expendio. El precio surtidor solo existe en el canal "al público"; para los demás canales usar
            precio con o sin impuestos. Estaciones georreferenciadas: padrón de la SE cruzado por número de inscripción
            ({fmt.int((D?.bocas || []).filter((b) => b[6] != null).length)} de {fmt.int((D?.bocas || []).length)} bocas).
            Último mes: {fmt.monthShort(ULTIMO_MES)}.
          </p>
        </>
      )}
    </div>
  );
}

/** Dropdown multi-selección de tipos de negocio (mismo estilo que los sectores de gas oil). */
function TiposDropdown({ opciones, seleccion, resumen, onCambiar }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!abierto) return undefined;
    const cerrar = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abierto]);
  const toggle = (t) => {
    const n = new Set(seleccion);
    if (n.has(t)) n.delete(t); else n.add(t);
    onCambiar(n);
  };
  return (
    <div className="mh-dropdown" ref={ref}>
      <button type="button" className={`empresa-select mh-dropdown-boton ${abierto ? 'abierto' : ''}`}
        onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
        <span>{resumen}</span><span className="mh-dropdown-caret">▾</span>
      </button>
      {abierto && (
        <div className="mh-dropdown-panel go-tipos-panel">
          <div className="go-tipos-acciones">
            <button type="button" onClick={() => onCambiar(new Set(opciones))}>Todos</button>
            <button type="button" onClick={() => onCambiar(new Set())}>Ninguno</button>
          </div>
          {opciones.map((t) => (
            <label key={t} className="mh-dropdown-item">
              <input type="checkbox" checked={seleccion.has(t)} onChange={() => toggle(t)} />
              <span>{t}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Tarjeta({ label, valor, base, unidad, mesAnt, tono }) {
  const d = variacion(valor, base);
  return (
    <div className={`kpi-card ${tono ? `tone-${tono}` : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-val">{fmtPrecio(valor, unidad)}</div>
      {d != null ? (
        <div className="kpi-sub">
          <span className={d >= 0 ? 'delta-pos' : 'delta-neg'}>{d >= 0 ? '▲' : '▼'}{fmt.pct(Math.abs(d))}</span>
          {' '}vs. {fmt.monthShort(mesAnt)}
        </div>
      ) : (
        <div className="kpi-sub">sin dato comparable</div>
      )}
    </div>
  );
}

function TooltipSerie({ active, payload, label, unidad, anual }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{anual ? label : fmt.monthShort(label)}</div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.dataKey} className="chart-tooltip-row">
          <div className="chart-tooltip-row-label">
            <span className="chart-tooltip-swatch" style={{ background: p.color }} />
            <span>{p.name}</span>
          </div>
          <span className="chart-tooltip-row-val">
            {p.dataKey === 'precio' ? `${fmtPrecio(p.value, unidad)} ${unidad}` : fmt.pct(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
