import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import empresasData from '../data/empresas.json';
import mercadoData from '../data/mercado.json';
import corteData from '../data/corte.json';
import capacidadData from '../data/capacidad.json';
import aceiteData from '../data/precio_aceite_rosario.json';
import tecnicosData from '../data/datos_tecnicos.json';
import gasoilPreciosData from '../data/gasoil_precios.json';
import gasoilRankingData from '../data/gasoil_ranking.json';
import iclIco2Data from '../data/icl_ico2.json';
import naftasData from '../data/naftas_precios.json';
import bioetanolData from '../data/bioetanol_precios.json';
import comprasData from '../data/compras_cupo.json';
import { PanelPlegable } from '../components/agente/Plegable.jsx';
import { useCuenta } from '../lib/cuenta/Cuenta.jsx';
import { MINUTOS_DE_TANDA, aproxTokens, enTokens, horaDe } from '../lib/cuenta/config.js';
import { fmt } from '../lib/format.js';
import { useChartColors } from '../lib/theme.jsx';
import { DIMENSIONES, EQUIVALENCIAS, FILTROS_DE, METRICAS, ORDENAR_POR, ORDENES, PRODUCTOS, TIEMPOS, TIPOS } from '../lib/analista/catalogo.js';
import { ajustarConsulta, MAX_PEDIDO, opcionesDeMenu, rangoDe } from '../lib/analista/consulta.js';
import { describirConsulta, ejecutarConsulta, etiquetaGrupo, mesesEntre, mesTxt } from '../lib/analista/motor.js';
import { AUTOR, FUENTE_DATOS } from '../lib/poligrafo/catalogo.js';
import { armarContexto } from '../lib/poligrafo/contexto.js';
import './Page.css';
import './Poligrafo.css';
import './Analista.css';

// Página del Analista (Agente Explorarg, 22/11/2026): la persona escribe un pedido
// de análisis ("ordename las empresas por ventas al cupo entre tal y tal fecha"),
// /api/analista lo traduce a una consulta con IA y el motor de src/lib/analista la
// calcula acá, en el navegador, con los mismos JSON de los tableros. Después la
// consulta se puede corregir con los menús: cada cambio se recalcula sin IA.
// Usa los estilos del Polígrafo (.pg) y suma los propios (.an).

// Pedidos de ejemplo ya traducidos: se abren sin consultar a la IA.
const EJEMPLOS = [
  { id: 'ranking-ventas', titulo: 'Ranking de empresas por ventas al cupo, últimos 12 meses', consulta: { tipo: 'ranking', metrica: 'ventas_cupo', agrupar: 'empresa' } },
  { id: 'grupos', titulo: 'Cuánto vende cada grupo económico entre las no integradas', consulta: { tipo: 'ranking', metrica: 'ventas_cupo', agrupar: 'grupo', filtros: { categoria: 'NO INTEGRADA' } } },
  { id: 'petroleras', titulo: 'Qué petroleras compran el biodiésel', consulta: { tipo: 'ranking', metrica: 'compras', agrupar: 'petrolera' } },
  { id: 'corte', titulo: 'El corte real, año por año', consulta: { tipo: 'evolucion', metrica: 'corte_real', tiempo: 'anio', desde: '2010-01' } },
  { id: 'crecieron', titulo: 'Qué empresas crecieron y cuáles cayeron: 2024 contra 2025', consulta: { tipo: 'comparacion', metrica: 'ventas_cupo', agrupar: 'empresa', desde: '2025-01', hasta: '2025-12', desde0: '2024-01', hasta0: '2024-12' } },
  { id: 'brecha', titulo: 'Biodiésel contra gas oil: la diferencia de precio, mes a mes', consulta: { tipo: 'evolucion', metrica: 'brecha_precio', producto: 'biodiesel', productoBase: 'gasoil_fosil', tiempo: 'mes', desde: '2024-01' } },
  { id: 'aceite', titulo: 'El precio del aceite según la distancia al puerto', consulta: { tipo: 'ranking', metrica: 'precio_aceite', orden: 'menor', desde: '2024-01' } },
  { id: 'capacidad', titulo: 'Cuánto usan de su capacidad las integradas y las no integradas', consulta: { tipo: 'evolucion', metrica: 'uso_capacidad', agrupar: 'categoria', tiempo: 'anio', desde: '2010-01' } },
];

const FAMILIAS = { empresas: 'Elaboradoras', compras: 'Petroleras', corte: 'Corte obligatorio', precios: 'Precios', aceite: 'Aceite' };
const ROTULO_FILTRO = { categoria: 'Categoría', provincia: 'Provincia', grupo: 'Grupo económico', camara: 'Cámara', empresa: 'Empresa', petrolera: 'Petrolera' };
const TOPES = [5, 10, 15, 20, 30, 60];

const nf = (n, d = 0) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });

function celda(valor, c) {
  if (valor === '' || valor === undefined) return '';
  if (valor === null) return '-';
  if (c.tipo === 'texto' || c.tipo === 'puesto') return String(valor);
  const signo = valor < 0 ? '-' : c.signo && valor > 0 ? '+' : '';
  return `${signo}${c.unidad === '$/l' ? '$ ' : ''}${nf(Math.abs(valor), c.decimales ?? 0)}${c.unidad === '%' ? '%' : ''}`;
}

function cifraTxt({ valor, unidad, decimales }) {
  if (unidad === '%') return `${nf(valor, decimales)}%`;
  if (unidad === '$/l') return `$ ${nf(valor, decimales)} por litro`;
  return `${nf(valor, decimales)} ${unidad}`;
}

/** La tabla tal como se ve, en un CSV que abre bien en el Excel en castellano. */
function descargarCsv(resultado) {
  const txt = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const num = (v, c) => (v === null || v === undefined || v === '' ? '' : Number(v).toFixed(c.decimales ?? 0).replace('.', ','));
  const lineas = [
    txt(`${resultado.titulo}${resultado.bajada ? ` - ${resultado.bajada}` : ''}`),
    resultado.columnas.map((c) => txt(c.nombre)).join(';'),
    ...resultado.filas.map((f) => f.celdas.map((v, i) => (resultado.columnas[i].tipo === 'numero' ? num(v, resultado.columnas[i]) : txt(v))).join(';')),
    '',
    txt(`${resultado.fuente.origen ?? FUENTE_DATOS} Calculado en www.explorarg.com/agente/analista`),
  ];
  const archivo = new Blob([`﻿${lineas.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(archivo);
  a.download = `explorarg-${resultado.titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 60)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Grafico({ g }) {
  const C = useChartColors();
  const colores = [C.exp, C.bio, C.oil, C.alert, C.violeta, C.celeste, C.neutral, C.warn, C.ink];
  const datos = g.categorias.map((nombre, i) => ({ nombre, ...Object.fromEntries(g.series.map((s, k) => [`s${k}`, s.valores[i]])) }));
  const u = g.unidad === '%' ? '%' : '';
  const eje = (v) => (Math.abs(v) >= 10000 ? fmt.compact(v) : `${nf(v, Math.abs(v) < 20 && !Number.isInteger(v) ? 1 : 0)}${u}`);
  const valor = (v, nombre) => [v === null || v === undefined ? '-' : `${g.unidad === '$/l' ? '$ ' : ''}${nf(v, g.decimales)}${u}${g.unidad === '%' || g.unidad === '$/l' ? '' : ` ${g.unidad}`}`, nombre];
  const estiloTooltip = { background: 'var(--bg-3)', border: '1px solid var(--rule)', borderRadius: 6, color: 'var(--ink)', fontSize: 12 };
  const tick = { fill: C.tick, fontSize: 11 };
  const corto = (t) => (String(t).length > 26 ? `${String(t).slice(0, 25)}…` : t);
  const varias = g.series.length > 1;
  // el eje de las barras siempre incluye el cero (también cuando todos los valores son negativos)
  const numeros = g.series.flatMap((s) => s.valores).filter((v) => typeof v === 'number');
  const [menor, mayor] = [Math.min(0, ...numeros), Math.max(0, ...numeros)];
  const dominioBarras = menor < 0 && mayor === 0 ? [Math.floor(menor), 0] : menor < 0 ? ['auto', 'auto'] : [0, 'auto'];

  if (g.tipo === 'barrasH') {
    return (
      <ResponsiveContainer width="100%" height={Math.max(150, datos.length * (varias ? 40 : 28) + 50)}>
        <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barCategoryGap={varias ? '22%' : '28%'}>
          <CartesianGrid stroke={C.grid} horizontal={false} />
          <XAxis type="number" tick={tick} stroke={C.axis} tickFormatter={eje} domain={dominioBarras} />
          <YAxis type="category" dataKey="nombre" tick={tick} stroke={C.axis} width={178} tickFormatter={corto} interval={0} />
          <Tooltip formatter={valor} contentStyle={estiloTooltip} cursor={{ fill: C.cursor }} />
          {varias && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {g.series.map((s, k) => (
            <Bar key={s.nombre} dataKey={`s${k}`} name={s.nombre} fill={varias ? colores[k === 0 ? 6 : 0] : colores[0]} radius={[0, 3, 3, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }
  const Tipo = g.tipo === 'barras' ? BarChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height={320}>
      <Tipo data={datos} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="nombre" tick={tick} stroke={C.axis} minTickGap={18} />
        <YAxis tick={tick} stroke={C.axis} tickFormatter={eje} width={54} domain={g.tipo === 'barras' ? [0, 'auto'] : ['auto', 'auto']} />
        <Tooltip formatter={valor} contentStyle={estiloTooltip} cursor={g.tipo === 'barras' ? { fill: C.cursor } : { stroke: C.cursorLinea }} />
        {varias && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {g.series.map((s, k) =>
          g.tipo === 'barras' ? (
            <Bar key={s.nombre} dataKey={`s${k}`} name={s.nombre} fill={colores[k % colores.length]} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          ) : (
            <Line key={s.nombre} dataKey={`s${k}`} name={s.nombre} stroke={colores[k % colores.length]} strokeWidth={2} dot={datos.length <= 24} connectNulls isAnimationActive={false} />
          )
        )}
      </Tipo>
    </ResponsiveContainer>
  );
}

function Campo({ rotulo, children, ancho }) {
  return (
    <label className={`an-campo${ancho ? ' an-campo-ancho' : ''}`}>
      <span>{rotulo}</span>
      {children}
    </label>
  );
}

function Opciones({ valor, onChange, opciones, vacio }) {
  return (
    <select value={valor ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {vacio && <option value="">{vacio}</option>}
      {opciones.map(([v, t]) => (
        <option key={v} value={v}>
          {t}
        </option>
      ))}
    </select>
  );
}

/** Los menús con que se corrige la consulta. Cada cambio se recalcula en el momento, sin IA. */
function Controles({ q, ctx, cambiar }) {
  const m = METRICAS[q.metrica];
  const menus = useMemo(() => opcionesDeMenu(ctx), [ctx]);
  const [min, max] = rangoDe(q, ctx);
  const meses = useMemo(() => mesesEntre(min, max).map((x) => [x, mesTxt(x)]), [min, max]);
  const filtro = (f, valor) => cambiar({ filtros: { ...q.filtros, [f]: valor } });
  const esPrecio = m.familia === 'precios';
  const productos = Object.entries(PRODUCTOS).filter(([, p]) => q.metrica !== 'brecha_precio' || !p.soloNivel).map(([k, p]) => [k, p.etiqueta.charAt(0).toUpperCase() + p.etiqueta.slice(1)]);

  return (
    <div className="an-controles">
      <Campo rotulo="Qué mostrar">
        <Opciones valor={q.tipo} onChange={(v) => cambiar({ tipo: v })} opciones={Object.entries(TIPOS).map(([k, t]) => [k, t.etiqueta])} />
      </Campo>
      <Campo rotulo="Medida" ancho>
        <select value={q.metrica} onChange={(e) => cambiar({ metrica: e.target.value })}>
          {Object.entries(FAMILIAS).map(([familia, titulo]) => (
            <optgroup key={familia} label={titulo}>
              {Object.entries(METRICAS)
                .filter(([, x]) => x.familia === familia)
                .map(([k, x]) => (
                  <option key={k} value={k}>
                    {x.nombre}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </Campo>
      {esPrecio && (
        <Campo rotulo={q.metrica === 'brecha_precio' ? 'Producto' : 'De qué'}>
          <Opciones valor={q.producto} onChange={(v) => cambiar({ producto: v })} opciones={productos} />
        </Campo>
      )}
      {q.metrica === 'brecha_precio' && (
        <>
          <Campo rotulo="Contra">
            <Opciones valor={q.productoBase} onChange={(v) => cambiar({ productoBase: v })} opciones={productos.filter(([k]) => k !== q.producto)} />
          </Campo>
          <Campo rotulo="Cómo se compara">
            <Opciones valor={q.equivalencia} onChange={(v) => cambiar({ equivalencia: v })} opciones={Object.entries(EQUIVALENCIAS).map(([k, e]) => [k, e.etiqueta.charAt(0).toUpperCase() + e.etiqueta.slice(1)])} />
          </Campo>
        </>
      )}
      {m.dims.length > 0 && !m.agruparSiempre && (
        <Campo rotulo="Agrupar por">
          <Opciones
            valor={q.agrupar === 'ninguno' ? '' : q.agrupar}
            onChange={(v) => cambiar({ agrupar: v ?? 'ninguno' })}
            opciones={m.dims.map((d) => [d, DIMENSIONES[d].titulo])}
            vacio={q.tipo === 'ranking' ? undefined : 'Sin agrupar'}
          />
        </Campo>
      )}
      {q.tipo === 'evolucion' && (
        <Campo rotulo="En el tiempo">
          <Opciones valor={q.tiempo} onChange={(v) => cambiar({ tiempo: v })} opciones={Object.entries(TIEMPOS)} />
        </Campo>
      )}
      {FILTROS_DE[m.familia].map((f) => (
        <Campo key={f} rotulo={ROTULO_FILTRO[f]}>
          <Opciones valor={q.filtros[f]} onChange={(v) => filtro(f, v)} opciones={menus[f].map((v) => [v, etiquetaGrupo(f, v, ctx)])} vacio="Todas" />
        </Campo>
      ))}
      {q.tipo === 'comparacion' && (
        <>
          <Campo rotulo="Período inicial: desde">
            <Opciones valor={q.desde0} onChange={(v) => cambiar({ desde0: v })} opciones={meses} />
          </Campo>
          <Campo rotulo="Período inicial: hasta">
            <Opciones valor={q.hasta0} onChange={(v) => cambiar({ hasta0: v })} opciones={meses} />
          </Campo>
        </>
      )}
      {!m.sinTiempo && (
        <>
          <Campo rotulo={q.tipo === 'comparacion' ? 'Período final: desde' : 'Desde'}>
            <Opciones valor={q.desde} onChange={(v) => cambiar({ desde: v })} opciones={meses} />
          </Campo>
          <Campo rotulo={q.tipo === 'comparacion' ? 'Período final: hasta' : 'Hasta'}>
            <Opciones valor={q.hasta} onChange={(v) => cambiar({ hasta: v })} opciones={meses} />
          </Campo>
        </>
      )}
      {q.tipo === 'comparacion' && q.agrupar !== 'ninguno' && (
        <Campo rotulo="Ordenar">
          <Opciones valor={q.ordenarPor} onChange={(v) => cambiar({ ordenarPor: v })} opciones={Object.entries(ORDENAR_POR).filter(([k]) => k !== 'variacion' || m.unidad !== '%')} />
        </Campo>
      )}
      {(q.tipo === 'ranking' || (q.tipo === 'comparacion' && q.agrupar !== 'ninguno')) && (
        <Campo rotulo="Orden">
          <Opciones valor={q.orden} onChange={(v) => cambiar({ orden: v })} opciones={Object.entries(ORDENES)} />
        </Campo>
      )}
      {q.agrupar !== 'ninguno' && !m.agruparSiempre && q.tipo !== 'total' && (
        <Campo rotulo="Cuántas mostrar">
          <Opciones valor={String(q.tope)} onChange={(v) => cambiar({ tope: Number(v) })} opciones={[...new Set([...TOPES, q.tope])].sort((a, b) => a - b).map((n) => [String(n), n === 60 ? 'Todas (hasta 60)' : `Las primeras ${n}`])} />
        </Campo>
      )}
    </div>
  );
}

// `soloEjemplos`: la persona no ingresó; ve los pedidos de ejemplo (no consultan a la IA) y el formulario apagado.
export default function Analista({ soloEjemplos = false }) {
  const cuenta = useCuenta();
  // lo que cuesta consultar ahora: llega del servidor (null en la copia local sin cuentas)
  const precio = cuenta.precioDe('analista');
  const sinCredito = precio !== null && cuenta.saldo < precio.estimado;
  const ctx = useMemo(
    () =>
      armarContexto({
        empresas: empresasData,
        mercado: mercadoData,
        corte: corteData,
        capacidad: capacidadData,
        aceite: aceiteData,
        tecnicos: tecnicosData,
        gasoilPrecios: gasoilPreciosData,
        gasoilRanking: gasoilRankingData,
        iclIco2: iclIco2Data,
        naftas: naftasData,
        bioetanol: bioetanolData,
        compras: comprasData,
      }),
    []
  );

  const [texto, setTexto] = useState('');
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState(null);
  const [caso, setCaso] = useState(null); // { pedido, consulta, avisos, aclaracion, origen }
  const anclaRef = useRef(null);
  const numeroDeCaso = useRef(0); // la `key` del bloque: un pedido nuevo arranca plegado; un cambio de menú, no

  const mostrar = (nuevo) => {
    numeroDeCaso.current += 1;
    setCaso({ ...nuevo, n: numeroDeCaso.current });
    setError(null);
    requestAnimationFrame(() => anclaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  async function analizar(e) {
    e.preventDefault();
    const pedido = texto.trim();
    if (pedido.length < 8 || analizando || soloEjemplos || sinCredito) return;
    setAnalizando(true);
    setError(null);
    try {
      const r = await fetch('/api/analista', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await cuenta.cabeceras()) }, body: JSON.stringify({ pedido }) });
      const cuerpo = await r.json().catch(() => ({}));
      cuenta.anotarSaldo(cuerpo); // el servidor informa cómo quedó el saldo de tokens, se haya cobrado o no
      if (!r.ok) {
        setError({ mensaje: cuerpo.error || 'No se pudo analizar el pedido.', codigo: cuerpo.codigo });
      } else if (!cuerpo.ok) {
        setCaso(null);
        setError({ mensaje: cuerpo.motivo, noSePuede: true });
      } else {
        // el control corre otra vez acá, con los datos de la página
        const { consulta, avisos } = ajustarConsulta(cuerpo.consulta, ctx);
        mostrar({ pedido, consulta, avisos: [...new Set([...(cuerpo.avisos ?? []), ...avisos])], aclaracion: cuerpo.aclaracion, origen: { tipo: 'ia', motor: cuerpo.motor, uso: cuerpo.uso, cuenta: cuerpo.cuenta ?? null } });
      }
    } catch {
      setError({ mensaje: 'No se pudo conectar con el servicio de análisis.' });
    } finally {
      setAnalizando(false);
    }
  }

  function usarEjemplo(id) {
    const ej = EJEMPLOS.find((x) => x.id === id);
    if (!ej) return;
    const { consulta, avisos } = ajustarConsulta(ej.consulta, ctx);
    setTexto('');
    mostrar({ pedido: ej.titulo, consulta, avisos, aclaracion: '', origen: { tipo: 'ejemplo', id } });
  }

  // Un pedido guardado, abierto desde Mi panel (/agente/analista?consulta=ID): no consulta a la
  // IA ni gasta tokens. La consulta viene guardada y el resultado se calcula con los datos de hoy.
  const [parametros, setParametros] = useSearchParams();
  const idGuardada = parametros.get('consulta');
  useEffect(() => {
    if (!idGuardada || soloEjemplos) return undefined;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/cuenta?consulta=${encodeURIComponent(idGuardada)}`, { headers: await cuenta.cabeceras() });
        const g = await r.json().catch(() => null);
        const guardado = r.ok && g?.respuestaJson && g.herramienta === 'analista' ? JSON.parse(g.respuestaJson) : null;
        if (!vivo) return;
        if (!guardado?.consulta) {
          cuenta.anotarSaldo(g);
          setError({ mensaje: g?.error ?? 'No se pudo abrir ese pedido guardado.' });
        } else {
          const { consulta, avisos } = ajustarConsulta(guardado.consulta, ctx);
          setTexto(g.pedido);
          mostrar({ pedido: g.pedido, consulta, avisos: [...new Set([...(guardado.avisos ?? []), ...avisos])], aclaracion: guardado.aclaracion ?? '', origen: { tipo: 'guardada', fecha: g.fecha } });
        }
      } catch {
        if (vivo) setError({ mensaje: 'No se pudo abrir ese pedido guardado. Revisá la conexión.' });
      }
      // la dirección queda limpia: si recarga la página no lo vuelve a pedir
      if (vivo) setParametros({}, { replace: true });
    })();
    return () => {
      vivo = false;
    };
    // se abre una vez por cada id que llega en la dirección
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idGuardada, soloEjemplos]);

  // un cambio de menú: se vuelve a controlar la consulta y se recalcula, sin IA
  const cambiar = (parcial) =>
    setCaso((c) => {
      const { consulta, avisos } = ajustarConsulta({ ...c.consulta, ...parcial }, ctx);
      return { ...c, consulta, avisos, editado: true };
    });

  const resultado = useMemo(() => (caso ? ejecutarConsulta(caso.consulta, ctx) : null), [caso, ctx]);
  const sinMotor = error?.codigo === 'sin_sesion' || error?.codigo === 'sin_motor';

  return (
    <section className="page-section pg an" id="analista">
      <div className="container">
        {/* Título y caput: texto de HDO (23/11/2026). No reescribir.
            El nombre se escribe "Explorarg", sin RG en mayúscula. */}
        <h2>Analista Explorarg</h2>
        <div className="pg-caput">
          <p>Las buenas decisiones comienzan con buenas preguntas.</p>
          <p>
            Toda transacción voluntaria supone que las partes conservan la libertad de rechazarla y que cada una considera que el valor de lo
            que recibe supera al de aquello que entrega. Esta asimetría de valoraciones, fundada en necesidades, circunstancias y expectativas
            diferentes, permite que ambas esperen beneficiarse de un mismo intercambio.
          </p>
          <p>
            La calidad de una decisión no se determina por sus resultados futuros, sino por la información disponible al momento de tomarla y
            el rigor del razonamiento que la sustenta.
          </p>
          <p>
            Pero los datos, por sí solos, no constituyen conocimiento. Es necesario analizarlos, relacionarlos e interpretarlos para
            identificar tendencias, descubrir relaciones, formular hipótesis y construir conclusiones fundamentadas.
          </p>
          <p>
            El Analista Explorarg pone esa capacidad al alcance de cualquier persona. Te permite investigar el mercado argentino de biodiésel
            formulando tus propias preguntas y obteniendo respuestas a partir de los datos oficiales de la Secretaría de Energía, procesados
            por explorarg.com, sin necesidad de trabajar con bases de datos, construir planillas ni tener conocimientos de programación.
          </p>
          <p>
            El Analista no reemplaza la curiosidad ni el criterio de quien investiga: multiplica su capacidad de encontrar respuestas y amplía
            los horizontes de la investigación.
          </p>
          <p>
            La inteligencia artificial expande el universo de respuestas posibles. La inteligencia humana descubre qué preguntas vale la pena
            formular.
          </p>
        </div>

        <form className="pg-form" onSubmit={analizar}>
          <label htmlFor="an-pedido" className="pg-label">
            El pedido
          </label>
          <textarea
            id="an-pedido"
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, MAX_PEDIDO))}
            rows={3}
            placeholder="Por ejemplo: ordename las empresas por lo que vendieron al cupo entre enero de 2023 y diciembre de 2024."
            disabled={soloEjemplos}
          />
          <div className="pg-form-pie">
            <span className="pg-contador">
              {texto.length} / {MAX_PEDIDO}
            </span>
            <button type="submit" className="pg-boton" disabled={soloEjemplos || sinCredito || analizando || texto.trim().length < 8}>
              {soloEjemplos ? 'Ingresá para pedir tu análisis' : analizando ? 'Analizando…' : precio !== null ? `Analizar · aprox. ${aproxTokens(precio.estimado)}` : 'Analizar'}
            </button>
          </div>
          {precio !== null && !sinCredito && !soloEjemplos && (
            <p className="pg-costo">
              {precio.enTanda ? (
                <>
                  Precio reducido hasta las {horaDe(precio.hasta)}: esta consulta cuesta cerca de {aproxTokens(precio.estimado)}, nunca más de{' '}
                  {aproxTokens(precio.maximo)}.
                </>
              ) : (
                <>
                  Costo estimado: {aproxTokens(precio.estimado)}, nunca más de {aproxTokens(precio.maximo)}. Se descuenta lo que la consulta use. Las que
                  hagas en los {MINUTOS_DE_TANDA} minutos siguientes cuestan cerca de {aproxTokens(precio.siguiente)}.
                </>
              )}
            </p>
          )}
          {sinCredito && (
            <p className="pg-sin-credito" role="status">
              Tus tokens no alcanzan: te quedan {enTokens(cuenta.saldo)} y esta consulta del Analista cuesta cerca de {aproxTokens(precio.estimado)}.{' '}
              {cuenta.compraHabilitada ? (
                <>
                  Podés comprar más en <Link to="/agente/panel">Mi panel</Link>.
                </>
              ) : (
                'La compra de tokens todavía no está habilitada.'
              )}
            </p>
          )}
        </form>

        <div className="pg-ejemplos">
          <label htmlFor="an-ejemplo">{soloEjemplos ? 'Elegí un pedido de ejemplo:' : 'O probá con un pedido de ejemplo:'}</label>
          <select id="an-ejemplo" value={caso?.origen.tipo === 'ejemplo' ? caso.origen.id : ''} onChange={(e) => usarEjemplo(e.target.value)}>
            <option value="">Elegí un ejemplo</option>
            {EJEMPLOS.map((ej) => (
              <option key={ej.id} value={ej.id}>
                {ej.titulo}
              </option>
            ))}
          </select>
        </div>

        {analizando && <p className="pg-estado">Leyendo el pedido. Tarda unos segundos.</p>}

        {error && (
          <div className="pg-error" role="alert">
            <p>{error.mensaje}</p>
            {error.noSePuede && (
              <p>
                El Analista responde con las medidas de su catálogo. Para verificar una frase está el <Link to="/agente">Polígrafo</Link>.
              </p>
            )}
            {error.noSePuede && cuenta.saldo !== null && <p>No se descontó ningún token.</p>}
            {sinMotor && <p>Mientras tanto podés probar con un pedido de ejemplo.</p>}
          </div>
        )}

        {caso && (
          <div className="pg-caso" ref={anclaRef} key={caso.n}>
            {/* Los dos puntos arrancan plegados (HDO, 22/11/2026): se ven solo los dos títulos, cada uno con su flechita */}
            <PanelPlegable paso={1} titulo="Así entendí el pedido">
              <p className="an-entendido">{describirConsulta(caso.consulta, ctx)}</p>
              {caso.avisos.map((a) => (
                <p key={a} className="pg-nota">
                  {a}
                </p>
              ))}
              {caso.aclaracion && !caso.editado && (
                <p className="pg-linea">
                  <span className="pg-rotulo">Lectura de {AUTOR}</span>
                  {caso.aclaracion}
                </p>
              )}
              <p className="pg-panel-intro">Si no era esto, cambialo acá: se recalcula en el momento.</p>
              <Controles q={caso.consulta} ctx={ctx} cambiar={cambiar} />
            </PanelPlegable>

            {/* si el pedido no se pudo calcular, arranca abierto: el motivo no puede quedar escondido */}
            <PanelPlegable paso={2} titulo="Resultado" abierto={!resultado.ok}>
              {!resultado.ok ? (
                <p className="pg-motivo">{resultado.motivo}</p>
              ) : (
                <>
                  <div className="an-encabezado">
                    <div>
                      <h4 className="an-titulo">{resultado.titulo}</h4>
                      {resultado.bajada && <p className="an-bajada">{resultado.bajada}</p>}
                    </div>
                    <button type="button" className="an-descarga" onClick={() => descargarCsv(resultado)}>
                      Descargar la tabla
                    </button>
                  </div>

                  {resultado.cifra && <p className="an-cifra">{cifraTxt(resultado.cifra)}</p>}

                  {resultado.grafico && (
                    <div className="an-grafico">
                      {resultado.grafico.leyenda && <p className="an-grafico-leyenda">{resultado.grafico.leyenda}</p>}
                      <Grafico g={resultado.grafico} />
                    </div>
                  )}

                  <div className="pg-tabla-wrap an-tabla-wrap">
                    <table className="pg-tabla an-tabla">
                      <thead>
                        <tr>
                          {resultado.columnas.map((c) => (
                            <th key={c.nombre} className={c.tipo === 'texto' ? 'an-texto' : c.tipo === 'puesto' ? 'an-puesto' : ''}>
                              {c.nombre}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {resultado.filas.map((f, i) => (
                          // eslint-disable-next-line react/no-array-index-key
                          <tr key={i} className={f.clase === 'total' ? 'pg-fila-total' : f.clase === 'resto' ? 'an-fila-resto' : ''}>
                            {f.celdas.map((v, j) => (
                              // eslint-disable-next-line react/no-array-index-key
                              <td key={j} className={resultado.columnas[j].tipo === 'texto' ? 'an-texto' : resultado.columnas[j].tipo === 'puesto' ? 'an-puesto' : ''}>
                                {celda(v, resultado.columnas[j])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {resultado.notas.map((n) => (
                    <p key={n} className="pg-nota">
                      {n}
                    </p>
                  ))}
                  <p className="pg-fuente">
                    {resultado.fuente.origen ?? FUENTE_DATOS} Ver el tablero: <Link to={resultado.fuente.ruta}>{resultado.fuente.etiqueta}</Link>
                  </p>
                </>
              )}
            </PanelPlegable>

            <p className="pg-pie">
              {caso.origen.tipo === 'ejemplo'
                ? 'Pedido de ejemplo: ya venía traducido.'
                : caso.origen.tipo === 'guardada'
                  ? `Pedido guardado del ${new Date(caso.origen.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}: volver a abrirlo no gasta tokens.`
                  : `${AUTOR} lee el pedido con un modelo de inteligencia artificial y lo traduce a la consulta de arriba.`}{' '}
              Los números los calcula el programa con los datos del sitio, a {fmt.monthShort(ctx.ultimo)}: la inteligencia
              artificial no toca ninguna cifra.
              {caso.origen.cuenta?.cobrado > 0 && (
                <span className="pg-cobrado">
                  {' '}
                  Este pedido costó {enTokens(caso.origen.cuenta.cobrado)} (el estimado era {aproxTokens(caso.origen.cuenta.estimado)}).
                </span>
              )}
              {import.meta.env.DEV && caso.origen.uso && (
                <span className="pg-uso">
                  {' '}
                  Consumo del modelo (solo se ve en la copia local): {fmt.int(caso.origen.uso.entrada)} de entrada y {fmt.int(caso.origen.uso.salida)} de salida (motor {caso.origen.motor}).
                </span>
              )}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
