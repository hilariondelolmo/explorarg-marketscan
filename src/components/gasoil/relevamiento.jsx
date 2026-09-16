// Piezas compartidas por las secciones del mercado de gas oil que abren el
// relevamiento SE 1104 con la misma apertura que Precio surtidor: el estado de
// los ocho filtros y la carga de los datos finos (useRelevamiento), la fila de
// filtros, el encabezado dentro del bloque fijo y la fila de cajas
// desplegables cuyos cuerpos abren debajo (estructura aprobada por HDO el
// 16/09/2026 para Precio surtidor y extendida a Estructura del mercado y
// Minorista y mayorista).
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MESES, ULTIMO_MES, IDX_MES, PROVINCIAS, BANDERAS, CANALES_COM, TIPOS_NEGOCIO,
  TIPOS_PRECIO, tipoPrecio, convertir, ponderarCol, cargarRetail, cargarParte, cargarMes,
  fmtPrecio, variacion, nombreProvincia,
} from '../../lib/gasoil.js';
import { fmt } from '../../lib/format.js';

export const TODAS = 'todas';
export const RANGOS = [['12m', '12 m'], ['5a', '5 a'], ['10a', '10 a'], ['todo', 'Todo']];
// Tipos de negocio que el workbook selecciona por defecto en el minorista
export const TIPOS_RETAIL = new Set([
  'Bocas de expendio (venta por menor) Combustibles Líquidos + PRVE',
  'Bocas de expendio (venta por menor) Combustibles líquidos únicamente',
  'Bocas de expendio (venta por menor) Duales (líquidos + GLPA)',
  'Bocas de expendio (venta por menor) Duales (líquidos + GNC)',
  'Bocas de expendio (venta por menor) Sólo GNC',
  'Estación de servicio',
]);
export const CC_PUBLICO = CANALES_COM.indexOf('Al público');

/**
 * Estado de los ocho filtros del relevamiento y carga de los datos finos
 * (public/data/gasoil_retail.json; con operador o estación, su partición por
 * boca). Devuelve el estado, los manejadores, los predicados de filtro sobre
 * el índice de fila y las etiquetas que describen la selección.
 *
 *   modo 'surtidor' (tablero PRECIO SURTIDOR): arranca en minorista, seis tipos
 *        de bocas/estación, al público y precio surtidor; al cambiar el canal de
 *        distribución ajusta tipos y canal de comercialización como el workbook.
 *   modo 'abierto' (Estructura, Minorista y mayorista): arranca con todo el
 *        mercado (ambos canales, todos los tipos y canales, precio sin
 *        impuestos) y cada filtro se mueve solo.
 *   conMes: carga además las bocas relevadas del mes (mapa de estaciones).
 *
 * En todos los modos, el precio surtidor solo existe al público: al salir de
 * ese canal el tipo de precio salta a "con impuestos" (precio final del
 * workbook).
 */
export function useRelevamiento({ modo = 'surtidor', conMes = false } = {}) {
  const abierto = modo === 'abierto';
  const [D, setD] = useState(null);
  const [error, setError] = useState(null);
  const [mes, setMes] = useState(ULTIMO_MES);
  const [tipoId, setTipoId] = useState(abierto ? 'sin_imp' : 'surtidor');
  const [cd, setCd] = useState(abierto ? 'ambos' : '0'); // '0' minorista · '1' mayorista · 'ambos'
  const [tipos, setTipos] = useState(() => new Set(abierto ? TIPOS_NEGOCIO : TIPOS_NEGOCIO.filter((t) => TIPOS_RETAIL.has(t))));
  const [cc, setCc] = useState(!abierto && CC_PUBLICO >= 0 ? String(CC_PUBLICO) : TODAS);
  const [bandera, setBandera] = useState(TODAS);
  const [operador, setOperador] = useState(null); // índice en D.operadores
  const [opTexto, setOpTexto] = useState('');
  const [boca, setBoca] = useState(null);         // nro de inscripción de la estación
  const [provincia, setProvincia] = useState(null);
  const [parte, setParte] = useState(null);       // { k, datos }: partición por boca del operador
  const [mesDatos, setMesDatos] = useState(null); // { f, datos }: bocas relevadas en el mes elegido

  useEffect(() => {
    if (!conMes) return undefined;
    let vivo = true;
    cargarMes(mes).then((datos) => { if (vivo) setMesDatos({ f: mes, datos }); }).catch((e) => setError(e.message));
    return () => { vivo = false; };
  }, [mes, conMes]);

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
    if (!abierto) {
      // Minorista: bocas y estaciones (default del workbook); mayorista: todos los tipos
      if (v === '0') setTipos(new Set(TIPOS_NEGOCIO.filter((t) => TIPOS_RETAIL.has(t))));
      else setTipos(new Set(TIPOS_NEGOCIO));
      if (v === '1') setCc(TODAS);
      else setCc(CC_PUBLICO >= 0 ? String(CC_PUBLICO) : TODAS);
    }
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

  // Banderas con datos en el mes para la selección de canales (opciones del filtro)
  const banderasMes = useMemo(() => {
    if (!listo) return [];
    const m = ponderarCol(DX, (i) => fMes(i) && fCanal(i), (i) => DX.band[i], tipo.campo, 2);
    return [...m.entries()].sort((a, b) => b[1].w - a[1].w).map(([b]) => BANDERAS[b]);
  }, claves);

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
  const mesAnterior = mi > 0 ? MESES[mi - 1] : null;

  return {
    D, DX, listo, error, OPERADORES, BOCAS, operadoresOrden, disponibles, resumenTipos, banderasMes,
    mes, setMes, mi, mesAnterior, tipoId, setTipoId, tipo, cd, cambiarCd, cdN, tipos, setTipos, tiposIdx,
    cc, cambiarCc, ccN, bandera, setBandera, bi, operador, opTexto, elegirOperador, conOperador,
    boca, elegirBoca, bocaSel, provincia, setProvincia, pi, mesDatos,
    fBase, fCanal, fBand, fProv, fMes, conv, claves, etiquetaCanal, etiquetaFiltro, ambito,
  };
}

/** Estado de las cajas desplegables: cuáles están abiertas y cómo alternarlas. */
export function useCajas(inicial) {
  const [abiertos, setAbiertos] = useState(inicial);
  const alternar = (k) => setAbiertos((a) => ({ ...a, [k]: !a[k] }));
  return [abiertos, alternar];
}

/**
 * Fila única de los ocho filtros del relevamiento, con el título arriba
 * alineado al borde del control (orden del tablero PRECIO SURTIDOR).
 */
export function FiltrosRelevamiento({ F }) {
  const {
    mes, setMes, tipoId, setTipoId, cd, cambiarCd, disponibles, tipos, setTipos, resumenTipos,
    cc, cambiarCc, bandera, setBandera, banderasMes, opTexto, elegirOperador, operadoresOrden,
    provincia, setProvincia,
  } = F;
  return (
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
  );
}

/** Fila de cajas al mismo nivel: título, detalle de dos líneas como máximo y flecha. */
export function Cajas({ cajas, abiertos, alternar }) {
  return (
    <div className="go-desplegables go-desplegables-4">
      {cajas.map((c) => (
        <button
          key={c.id} type="button" className={`go-desplegable-boton ${abiertos[c.id] ? 'abierto' : ''}`}
          onClick={() => alternar(c.id)} aria-expanded={!!abiertos[c.id]}
        >
          <span className="chart-card-title">{c.titulo}</span>
          <span className="chart-card-subtitle">{c.detalle}</span>
          <span className="go-desplegable-flecha">{abiertos[c.id] ? '▴' : '▾'}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Bloque fijo de la sección: encabezado, fila de filtros y fila de cajas.
 * Queda pegado bajo la sub-nav al scrollear; los cuerpos de las cajas los
 * dibuja cada sección debajo, en el mismo orden que las cajas.
 */
export function BloqueFijo({ seccion, tituloDefault, F, cajas, abiertos, alternar }) {
  return (
    <div className="go-sticky">
      <p className="section-kicker">Mercado Gas Oil</p>
      <h2>{seccion?.title ?? tituloDefault}</h2>
      {seccion?.intro && <p className="section-intro">{seccion.intro}</p>}
      <FiltrosRelevamiento F={F} />
      <Cajas cajas={cajas} abiertos={abiertos} alternar={alternar} />
    </div>
  );
}

/** Dropdown multi-selección de tipos de negocio (mismo estilo que los sectores de gas oil). */
export function TiposDropdown({ opciones, seleccion, resumen, onCambiar }) {
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

/** Tarjeta KPI de precio con la variación contra el mes anterior. */
export function Tarjeta({ label, valor, base, unidad, mesAnt, tono }) {
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

/**
 * Tooltip de las series de precio: las variaciones (acumulada, mensual) en %,
 * el resto como precio en la unidad elegida; extraFmt permite un formato
 * propio por dataKey (por ejemplo toneladas).
 */
export function TooltipSerie({ active, payload, label, unidad, anual, extraFmt = {} }) {
  if (!active || !payload?.length) return null;
  const esPct = (k) => k === 'acumulada' || k === 'mensual';
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{anual ? label : fmt.monthShort(label)}</div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.dataKey} className="chart-tooltip-row">
          <div className="chart-tooltip-row-label">
            <span className="chart-tooltip-swatch" style={{ background: p.color || p.fill }} />
            <span>{p.name}</span>
          </div>
          <span className="chart-tooltip-row-val">
            {extraFmt[p.dataKey] ? extraFmt[p.dataKey](p.value)
              : esPct(p.dataKey) ? fmt.pct(p.value)
                : `${fmtPrecio(p.value, unidad)} ${unidad}`}
          </span>
        </div>
      ))}
    </div>
  );
}
