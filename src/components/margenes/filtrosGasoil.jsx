import { useEffect, useMemo, useState } from 'react';
import { fmt } from '../../lib/format.js';
import { DropdownMulti, TODAS } from '../gasoil/relevamiento.jsx';
import { TIPOS_NEGOCIO, CANALES_COM } from '../../lib/gasoil.js';
import {
  RATIOS, CRUDOS, PCT_INICIAL, FUENTES, EXCLUIDOS_MERCADO, cargarProductos, cargarTerminales, preciosMercado, preciosTerminales,
} from '../../lib/margenesGasoil.js';

/**
 * Filtros del crack spread de refinación, compartidos por la pestaña Gas oil
 * y la Comparación (HDO, 12/10/2026: en la comparación, las variables que
 * definen a cada crack spread tienen que estar disponibles). El hook carga
 * las dos fuentes (relevamiento abierto por producto y precios en planta),
 * guarda la fuente, el ratio, la mezcla de crudo y las aperturas de cada
 * fuente, y devuelve los precios por mes ($/l) y los meses excluidos; los
 * componentes de abajo dibujan los controles.
 */
export function useFiltrosGasoil() {
  const [D, setD] = useState(null);       // relevamiento abierto por producto
  const [T, setT] = useState(null);       // precios en planta
  const [error, setError] = useState(null);
  const [fuente, setFuente] = useState('mercado');
  const [ratioId, setRatioId] = useState('321');
  const [pctCrudo, setPctCrudo] = useState(PCT_INICIAL); // % de cada crudo en la mezcla
  // Mercado: mayorista, todos los tipos y canales al entrar (HDO, 12/10/2026)
  const [cd, setCd] = useState('1');
  const [tipos, setTipos] = useState(() => new Set(TIPOS_NEGOCIO));
  const [cc, setCc] = useState(TODAS);
  // Terminales: todas las empresas; las terminales sin las que excluye el workbook
  const [empresas, setEmpresas] = useState(null);
  const [terminales, setTerminales] = useState(null);
  useEffect(() => {
    cargarProductos().then(setD).catch((e) => setError(e.message));
    cargarTerminales().then((t) => {
      setT(t);
      setEmpresas(new Set(t.empresas));
      setTerminales(new Set(t.terminales.filter((x) => !t.excluidas.includes(x))));
    }).catch((e) => setError(e.message));
  }, []);

  const TN = D?.tipos_negocio || TIPOS_NEGOCIO;
  const CC = D?.canales_com || CANALES_COM;
  const meses = (fuente === 'mercado' ? D?.meses : T?.meses) || [];
  const ultimoMes = meses.at(-1) || '';
  const cdN = cd === 'ambos' ? null : Number(cd);
  const ccN = cc === TODAS ? null : Number(cc);
  const tiposIdx = useMemo(() => new Set(TN.map((t, i) => (tipos.has(t) ? i : -1)).filter((i) => i >= 0)), [TN, tipos]);
  const disponibles = useMemo(() => {
    if (!D) return { tipos: [...TN].sort(), canales: [...CC].sort() };
    const tn = new Set();
    const ccs = new Set();
    for (let i = 0; i < D.mes.length; i++) {
      if (cdN != null && D.cd[i] !== cdN) continue;
      tn.add(D.tn[i]);
      ccs.add(D.cc[i]);
    }
    return { tipos: [...tn].map((i) => TN[i]).sort(), canales: [...ccs].map((i) => CC[i]).sort() };
  }, [D, cdN, TN, CC]);
  const cambiarCd = (v) => { setCd(v); setTipos(new Set(TN)); setCc(TODAS); };
  const resumenTipos = tipos.size >= disponibles.tipos.length ? 'Todos los tipos'
    : `${[...tipos].filter((t) => disponibles.tipos.includes(t)).length} de ${disponibles.tipos.length} tipos`;
  const resumenEmpresas = !T || !empresas ? '…' : empresas.size >= T.empresas.length ? 'Todas las empresas' : `${empresas.size} de ${T.empresas.length} empresas`;
  const sinExcluidas = T ? T.terminales.filter((x) => !T.excluidas.includes(x)) : [];
  const resumenTerminales = !T || !terminales ? '…'
    : terminales.size >= T.terminales.length ? 'Todas las terminales'
      : sinExcluidas.length === terminales.size && sinExcluidas.every((x) => terminales.has(x)) ? 'Sin las excluidas del workbook'
        : `${terminales.size} de ${T.terminales.length} terminales`;
  const accionesTerminales = T ? [['Todas', T.terminales, 'Todas las terminales'], ['Sin excluidas', sinExcluidas, `Sin ${T.excluidas.join(', ').toLowerCase()}, como la hoja del workbook`], ['Ninguna', [], '']] : [];
  const accionesEmpresas = T ? [['Todas', T.empresas, ''], ['Ninguna', [], '']] : [];

  // Precios por mes ($/l) de la fuente elegida y meses que se saltean
  const precios = useMemo(() => {
    if (fuente === 'mercado') {
      if (!D) return new Map();
      const filtro = (i) => (cdN == null || D.cd[i] === cdN) && tiposIdx.has(D.tn[i]) && (ccN == null || D.cc[i] === ccN);
      return preciosMercado(D, filtro);
    }
    if (!T || !empresas || !terminales) return new Map();
    return preciosTerminales(T, empresas, terminales);
  }, [fuente, D, T, cdN, tiposIdx, ccN, empresas, terminales]);
  const excluidos = useMemo(() => (fuente === 'terminales' ? new Set(T ? T.meses_excluidos : []) : EXCLUIDOS_MERCADO), [fuente, T]);
  const fuenteDef = FUENTES.find((f) => f.id === fuente);
  const ratio = RATIOS.find((r) => r.id === ratioId) || RATIOS[1];
  const sumaPct = CRUDOS.reduce((s, c) => s + (Number(pctCrudo[c.id]) || 0), 0);
  const recorte = fuente === 'mercado'
    ? `${cd === 'ambos' ? 'minorista y mayorista' : cd === '0' ? 'minorista' : 'mayorista'} · ${resumenTipos.toLowerCase()} · ${ccN == null ? 'todos los canales' : CC[ccN].toLowerCase()}`
    : `${resumenEmpresas.toLowerCase()} · ${resumenTerminales.toLowerCase()}`;
  const mezclaTexto = CRUDOS.filter((c) => Number(pctCrudo[c.id]) > 0).map((c) => `${c.nombre} ${fmt.pct((Number(pctCrudo[c.id]) / (sumaPct || 1)) * 100, 0)}`).join(' + ') || 'sin crudo';
  const cambiarPct = (id, v) => setPctCrudo((p) => ({ ...p, [id]: Math.max(0, Math.min(100, Number(v) || 0)) }));
  const cargando = fuente === 'mercado' ? !D : !T;
  const excluidosEn = (desde, hasta) => [...excluidos].filter((f) => f >= desde && f <= hasta).length;
  const notaExcluidos = (desde, hasta) => {
    const n = excluidosEn(desde, hasta);
    return n ? ` · sin ${n} meses ${fuente === 'terminales' ? 'que excluye la hoja del workbook' : 'con precios anómalos del relevamiento'}` : '';
  };

  return {
    D, T, error, cargando, fuente, setFuente, fuenteDef, ratioId, setRatioId, ratio, pctCrudo, cambiarPct, sumaPct, mezclaTexto,
    cd, cambiarCd, tipos, setTipos, cc, setCc, CC, disponibles, resumenTipos,
    empresas, setEmpresas, terminales, setTerminales, resumenEmpresas, resumenTerminales, accionesEmpresas, accionesTerminales,
    meses, ultimoMes, precios, excluidos, recorte, notaExcluidos,
  };
}

/** Desplegable Precios (Mercado / Terminales). */
export function SelectFuente({ G, id = 'go-mg-fuente', label = 'Precios' }) {
  return (
    <div className="go-filtro">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="empresa-select" value={G.fuente} onChange={(e) => G.setFuente(e.target.value)}>
        {FUENTES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
    </div>
  );
}

/** Desplegable Ratio (2:1:1, 3:2:1, 5:3:2). */
export function SelectRatio({ G, id = 'go-mg-ratio', label = 'Ratio' }) {
  return (
    <div className="go-filtro">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="empresa-select" value={G.ratioId} onChange={(e) => G.setRatioId(e.target.value)}>
        {RATIOS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select>
    </div>
  );
}

/** Las aperturas de la fuente (Mercado: canal, tipo y canal de comercialización; Terminales: empresa y terminal). */
export function FiltrosFuente({ G, idBase = 'go-mg' }) {
  const { T } = G;
  if (G.fuente === 'mercado') {
    return (
      <>
        <div className="go-filtro">
          <label htmlFor={`${idBase}-cd`}>Canal de distribución</label>
          <select id={`${idBase}-cd`} className="empresa-select" value={G.cd} onChange={(e) => G.cambiarCd(e.target.value)}>
            <option value="1">Mayorista</option>
            <option value="0">Minorista</option>
            <option value="ambos">Ambos</option>
          </select>
        </div>
        <div className="go-filtro">
          <span className="go-filtro-label">Tipo de negocio</span>
          <DropdownMulti opciones={G.disponibles.tipos} seleccion={G.tipos} resumen={G.resumenTipos} onCambiar={G.setTipos} />
        </div>
        <div className="go-filtro">
          <label htmlFor={`${idBase}-cc`}>Canal de comercialización</label>
          <select id={`${idBase}-cc`} className="empresa-select" value={G.cc} onChange={(e) => G.setCc(e.target.value)}>
            <option value={TODAS}>Todos los canales</option>
            {G.disponibles.canales.map((c) => <option key={c} value={String(G.CC.indexOf(c))}>{c}</option>)}
          </select>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="go-filtro">
        <span className="go-filtro-label">Empresa</span>
        {T && G.empresas && <DropdownMulti opciones={T.empresas} seleccion={G.empresas} resumen={G.resumenEmpresas} onCambiar={G.setEmpresas} acciones={G.accionesEmpresas} />}
      </div>
      <div className="go-filtro">
        <span className="go-filtro-label">Terminal</span>
        {T && G.terminales && <DropdownMulti opciones={T.terminales} seleccion={G.terminales} resumen={G.resumenTerminales} onCambiar={G.setTerminales} acciones={G.accionesTerminales} rotulo={(t) => t.charAt(0) + t.slice(1).toLowerCase()} />}
      </div>
    </>
  );
}

/** La mezcla de crudo: tres casillas con el % de Medanito, Escalante y Cañadón Seco. */
export function MezclaCrudo({ G, idBase = 'go-mg' }) {
  return (
    <div className="go-filtro go-f-crudo">
      <span className="go-filtro-label">Crudo, % de la mezcla</span>
      <div className="go-crudo-mezcla">
        {CRUDOS.map((c) => (
          <label key={c.id} className="go-crudo-item">
            <span>{c.nombre}</span>
            <input id={`${idBase}-crudo-${c.id}`} type="number" min="0" max="100" step="5" value={G.pctCrudo[c.id]} onChange={(e) => G.cambiarPct(c.id, e.target.value)} aria-label={`${c.nombre}, % de la mezcla`} />
          </label>
        ))}
        {G.sumaPct !== 100 && <span className="go-crudo-aviso">{G.sumaPct > 0 ? `suman ${G.sumaPct}%: se reparten en proporción` : 'sin crudo'}</span>}
      </div>
    </div>
  );
}

/** Fila con las aperturas de la fuente y la mezcla de crudo. */
export function FilaAperturas({ G, idBase = 'go-mg' }) {
  return (
    <div className={`go-filtros go-filtros-margenes-go2 ${G.fuente === 'mercado' ? 'con-mercado' : 'con-terminales'}`}>
      <FiltrosFuente G={G} idBase={idBase} />
      <MezclaCrudo G={G} idBase={idBase} />
    </div>
  );
}
