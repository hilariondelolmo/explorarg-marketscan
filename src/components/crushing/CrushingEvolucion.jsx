import { useMemo, useState } from 'react';
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { fmt } from '../../lib/format.js';
import { PRESIDENCIAS } from '../../lib/gestiones.js';
import { useChartColors } from '../../lib/theme.jsx';
import { ALTERNATIVAS } from '../../lib/crushing.js';
import { DESTINOS, porMes, resumen, serieDiaria } from '../../lib/crushingSerie.js';
import { FUENTES_ACEITE_LOCAL, fuentesBioFob } from './fuentes.js';
import '../mercado/Mercado.css';
import '../KPIs.css';
import '../charts/Chart.css';
import './Crushing.css';

// Crushing integrado - la evolución (pedido de HDO del 27/11/2026).
//
// La cuenta de la pantalla Hoy, hecha con los precios y las retenciones de cada día y
// promediada por mes (src/lib/crushingSerie.js): qué dejó cada destino de la soja y cuánto
// tuvo que valer el biodiésel para convenir más que vender el aceite. Los costos y los
// rendimientos son los de hoy, iguales para toda la serie.

const ATAJOS = [['12m', 12, '12 m'], ['24m', 24, '24 m'], ['5a', 60, '5 a'], ['todo', null, 'Todo']];
const UNIDADES = [
  { id: 'soja', label: 'Por tonelada de soja', rotulo: 'usd por tonelada de soja' },
  { id: 'aceite', label: 'Por tonelada de aceite', rotulo: 'usd por tonelada de aceite' },
];

const num0 = (v) => (v == null || Number.isNaN(v) ? '-' : Math.round(v).toLocaleString('es-AR'));
const num1 = (v) => (v == null || Number.isNaN(v) ? '-' : v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const signo = (v, f = num0) => (v == null ? '-' : `${v > 0 ? '+' : ''}${f(v)}`);
const ejeAnio = (f) => (f.endsWith('-01') ? f.slice(0, 4) : '');

function Fila({ color, label, children, punteada }) {
  return (
    <div className="chart-tooltip-row">
      {color && <span className="chart-tooltip-swatch" style={punteada ? { background: 'none', borderTop: `2px dashed ${color}`, height: 0 } : { background: color }} />}
      <span>{label}</span><strong>{children}</strong>
    </div>
  );
}

function Leyenda({ items }) {
  return (
    <div className="chart-legend">
      {items.map((it) => (
        <div key={it.label} className="chart-legend-item">
          <span className="chart-legend-swatch" style={it.punteada ? { background: 'none', borderTop: `2px dashed ${it.color}`, height: 0 } : { background: it.color }} />
          {it.label}
        </div>
      ))}
    </div>
  );
}

export default function CrushingEvolucion({ datos }) {
  const C = useChartColors();
  const [fuenteAceite, setFuenteAceite] = useState('fas_jj');
  const [fuenteBio, setFuenteBio] = useState('bio_fob_jj');
  const [unidadId, setUnidadId] = useState('soja');
  const fuentesBio = useMemo(() => fuentesBioFob(datos), [datos]);

  const meses = useMemo(() => porMes(serieDiaria(datos, { fuenteAceite, fuenteBio })), [datos, fuenteAceite, fuenteBio]);
  const lista = useMemo(() => meses.map((m) => m.fecha), [meses]);
  const primerMes = lista[0];
  const ultimoMes = lista.at(-1);
  const [desde, setDesde] = useState(primerMes);
  const [hasta, setHasta] = useState(ultimoMes);

  const periodos = useMemo(
    () =>
      PRESIDENCIAS.map((p) => {
        const d = `${p.desde.slice(0, 4)}-12`;
        const h = p.hasta ? `${p.hasta.slice(0, 4)}-11` : ultimoMes;
        return { id: p.presidente, nombre: p.corto, desde: d < primerMes ? primerMes : d, hasta: h > ultimoMes ? ultimoMes : h };
      }).filter((p) => p.desde <= p.hasta),
    [primerMes, ultimoMes]
  );

  const cambiarDesde = (f) => { setDesde(f); if (f > hasta) setHasta(f); };
  const cambiarHasta = (f) => { setHasta(f); if (f < desde) setDesde(f); };
  const inicioDe = (n) => (n == null ? primerMes : lista[Math.max(0, lista.length - n)]);
  const atajo = (n) => { setHasta(ultimoMes); setDesde(inicioDe(n)); };
  const atajoActivo = hasta !== ultimoMes ? '' : ATAJOS.find(([, n]) => desde === inicioDe(n))?.[0] || '';
  const presidenciaActiva = periodos.find((p) => p.desde === desde && p.hasta === hasta)?.id || '';
  const elegirPresidencia = (id) => {
    const p = periodos.find((q) => q.id === id);
    if (p) { setDesde(p.desde); setHasta(p.hasta); }
  };

  const pts = useMemo(() => meses.filter((m) => m.fecha >= desde && m.fecha <= hasta), [meses, desde, hasta]);
  const unidad = UNIDADES.find((u) => u.id === unidadId);
  const prefijo = unidadId === 'soja' ? 'm_' : 'x_';
  const colores = { poroto: C.neutral, aceite_expo: C.exp, aceite_local: C.oil, bio_expo: C.celeste, bio_local: C.bio };
  const nombreDe = Object.fromEntries(ALTERNATIVAS.map((a) => [a.id, a.nombre]));

  const R = useMemo(() => {
    const porDestino = {};
    for (const a of ALTERNATIVAS) {
      const conDato = pts.filter((m) => m[`m_${a.id}`] != null);
      porDestino[a.id] = {
        ...resumen(pts, `${prefijo}${a.id}`),
        primero: conDato[0] ?? null,
        ultimo: conDato.at(-1) ?? null,
        mejorEn: pts.filter((m) => m.mejor === a.id).length,
      };
    }
    const brecha = (campo) => {
      const v = pts.map((m) => m[campo]).filter((n) => n != null);
      return { ...resumen(pts, campo), arriba: v.filter((n) => n > 0).length };
    };
    return {
      porDestino,
      piso: resumen(pts, 'piso'),
      bioLocal: resumen(pts, 'bioLocal'),
      indifBioLocal: resumen(pts.filter((m) => m.bioLocal != null), 'indifBioLocal'),
      brechaLocal: brecha('brechaBioLocal'),
      bioFob: resumen(pts, 'bioFob'),
      indifBioFob: resumen(pts.filter((m) => m.bioFob != null), 'indifBioFob'),
      brechaFob: brecha('brechaBioFob'),
    };
  }, [pts, prefijo]);

  const largo = pts.length > 48;
  const ejeX = {
    dataKey: 'fecha', tick: { fill: C.tick, fontSize: 11 }, stroke: C.axis, tickLine: false,
    ...(largo ? { tickFormatter: ejeAnio, interval: 0, minTickGap: 0 } : { tickFormatter: fmt.monthShort, interval: 'preserveStartEnd', minTickGap: 28 }),
  };
  const ejeY = { tick: { fill: C.tick, fontSize: 11 }, stroke: C.axis, tickFormatter: (v) => num0(v), width: 52, domain: ['auto', 'auto'] };
  const linea = { type: 'linear', strokeWidth: 2, dot: false, activeDot: { r: 4 }, isAnimationActive: false, connectNulls: false };
  const margenGrafico = { top: 14, right: 18, left: 0, bottom: 0 };

  const TooltipDestinos = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const m = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{fmt.monthShort(label)} · {unidad.rotulo}</div>
        {DESTINOS.map((a) => <Fila key={a.id} color={colores[a.id]} label={a.nombre}>{num1(m[`${prefijo}${a.id}`])}</Fila>)}
        {unidadId === 'aceite' && <Fila color={colores.poroto} punteada label="Piso del aceite">{num1(m.piso)}</Fila>}
        <Fila label="Mejor destino">{m.mejor ? nombreDe[m.mejor] : '-'}</Fila>
      </div>
    );
  };
  const tooltipBrecha = (precio, indif, brecha, rotuloPrecio) => function TooltipBrecha({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    const m = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{fmt.monthShort(label)} · usd por tonelada de biodiésel</div>
        <Fila color={C.bio} label={rotuloPrecio}>{num0(m[precio])}</Fila>
        <Fila color={C.neutral} punteada label="Precio de indiferencia">{num0(m[indif])}</Fila>
        <Fila label="Diferencia">{signo(m[brecha])}</Fila>
      </div>
    );
  };

  const fuenteBioLabel = fuentesBio.find((f) => f.id === fuenteBio)?.label ?? '';
  const sinOficial = pts.filter((m) => m.m_bio_local == null).length;
  const tramo = `${fmt.monthShort(desde)} a ${fmt.monthShort(hasta)}`;

  return (
    <div className="cx cx-evo">
      <div className="cx-controles cx-controles-evo">
        <div className="cx-control cx-intervalo">
          <label htmlFor="cx-desde">Intervalo</label>
          <div className="cx-intervalo-fila">
            <select id="cx-desde" className="empresa-select" value={desde} onChange={(e) => cambiarDesde(e.target.value)} aria-label="Desde">
              {[...lista].reverse().map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
            </select>
            <span>a</span>
            <select className="empresa-select" value={hasta} onChange={(e) => cambiarHasta(e.target.value)} aria-label="Hasta">
              {[...lista].reverse().map((f) => <option key={f} value={f}>{fmt.monthShort(f)}</option>)}
            </select>
            <div className="chart-range-selector">
              {ATAJOS.map(([id, n, label]) => (
                <button key={id} type="button" className={atajoActivo === id ? 'active' : ''} onClick={() => atajo(n)}>{label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="cx-control">
          <label htmlFor="cx-presidencia">Presidencia</label>
          <select id="cx-presidencia" className="empresa-select" value={presidenciaActiva} onChange={(e) => elegirPresidencia(e.target.value)}>
            <option value="">Elegir una presidencia…</option>
            {periodos.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {fmt.monthShort(p.desde)} a {fmt.monthShort(p.hasta)}</option>)}
          </select>
        </div>
        <div className="cx-control">
          <label htmlFor="cx-evo-aceite">Aceite local, tomado de</label>
          <select id="cx-evo-aceite" className="empresa-select" value={fuenteAceite} onChange={(e) => setFuenteAceite(e.target.value)}>
            {FUENTES_ACEITE_LOCAL.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
        <div className="cx-control">
          <label htmlFor="cx-evo-bio">Biodiésel FOB, tomado de</label>
          <select id="cx-evo-bio" className="empresa-select" value={fuenteBio} onChange={(e) => setFuenteBio(e.target.value)}>
            {fuentesBio.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
        <div className="cx-control">
          <label htmlFor="cx-evo-unidad">Ver</label>
          <select id="cx-evo-unidad" className="empresa-select" value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
            {UNIDADES.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </div>
      </div>
      <p className="chart-card-subtitle cx-nota">
        {pts.length} meses, {tramo} · promedios mensuales de la cuenta de cada día · dólares corrientes · costos y rendimientos de hoy en toda la serie
      </p>

      <div className="kpi-grid cx-tarjetas cx-tarjetas-evo">
        {DESTINOS.map((a) => {
          const d = R.porDestino[a.id];
          const campo = `${prefijo}${a.id}`;
          return (
            <div key={a.id} className="kpi-card">
              <div className="kpi-label"><span className="cx-punto" style={{ background: colores[a.id] }} />{a.nombre}</div>
              <div className="kpi-val">{d.promedio == null ? '-' : unidadId === 'soja' ? num1(d.promedio) : num0(d.promedio)} <span className="kpi-unidad">{unidadId === 'soja' ? 'usd/t soja' : 'usd/t aceite'}</span></div>
              <div className="kpi-sub">
                {d.promedio == null
                  ? 'sin datos en el intervalo'
                  : `promedio de ${d.meses} ${d.meses === 1 ? 'mes' : 'meses'} · ${fmt.monthShort(d.primero.fecha)}: ${num1(d.primero[campo])} → ${fmt.monthShort(d.ultimo.fecha)}: ${num1(d.ultimo[campo])} · fue el mejor destino en ${d.mejorEn} de ${pts.length} meses`}
              </div>
            </div>
          );
        })}
      </div>

      <div className="chart-card cx-bloque">
        <div className="chart-card-header">
          <div>
            <span className="chart-card-title">{unidadId === 'soja' ? 'Qué dejó cada destino' : 'Cuánto pagó cada destino por el aceite'} [{unidad.rotulo}]</span>
            <span className="chart-card-subtitle">
              {unidadId === 'soja'
                ? 'Margen contra exportar el poroto sin moler: por debajo de cero convenía no moler'
                : `Valor neto de la tonelada de aceite en cada destino, y el piso: lo que tiene que valer para que moler convenga (promedio ${num0(R.piso.promedio)})`}
            </span>
          </div>
        </div>
        <div className="chart-card-body">
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={pts} margin={margenGrafico}>
              <XAxis {...ejeX} />
              <YAxis {...ejeY} />
              {unidadId === 'soja' && <ReferenceLine y={0} stroke={C.neutral} />}
              <Tooltip content={<TooltipDestinos />} cursor={{ stroke: C.cursorLinea }} />
              {unidadId === 'aceite' && <Line {...linea} dataKey="piso" name="Piso del aceite" stroke={colores.poroto} strokeDasharray="5 4" />}
              {DESTINOS.map((a) => <Line key={a.id} {...linea} dataKey={`${prefijo}${a.id}`} name={a.nombre} stroke={colores[a.id]} />)}
            </ComposedChart>
          </ResponsiveContainer>
          <Leyenda items={[...DESTINOS.map((a) => ({ label: a.nombre, color: colores[a.id] })), ...(unidadId === 'aceite' ? [{ label: 'Piso del aceite', color: colores.poroto, punteada: true }] : [])]} />
        </div>
      </div>

      <div className="chart-card cx-bloque">
        <div className="chart-card-header">
          <div>
            <span className="chart-card-title">Biodiésel local: el precio oficial contra su precio de indiferencia [usd/t]</span>
            <span className="chart-card-subtitle">
              La indiferencia es lo que tiene que valer el biodiésel para dejar lo mismo que el mejor destino sin biodiésel
              {R.brechaLocal.promedio != null && <> · el oficial quedó {R.brechaLocal.promedio >= 0 ? 'arriba' : 'abajo'} por {num0(Math.abs(R.brechaLocal.promedio))} usd/t en promedio, y arriba en {R.brechaLocal.arriba} de {R.brechaLocal.meses} meses</>}
            </span>
          </div>
        </div>
        <div className="chart-card-body">
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={pts} margin={margenGrafico}>
              <XAxis {...ejeX} />
              <YAxis {...ejeY} />
              <Tooltip content={tooltipBrecha('bioLocal', 'indifBioLocal', 'brechaBioLocal', 'Precio oficial')} cursor={{ stroke: C.cursorLinea }} />
              <Line {...linea} dataKey="indifBioLocal" name="Precio de indiferencia" stroke={C.neutral} strokeDasharray="5 4" />
              <Line {...linea} dataKey="bioLocal" name="Precio oficial" stroke={C.bio} />
            </ComposedChart>
          </ResponsiveContainer>
          <Leyenda items={[{ label: 'Precio oficial del biodiésel (Res. 963, mediana)', color: C.bio }, { label: 'Precio de indiferencia', color: C.neutral, punteada: true }]} />
        </div>
      </div>

      <div className="chart-card cx-bloque">
        <div className="chart-card-header">
          <div>
            <span className="chart-card-title">Biodiésel exportado: el FOB contra su precio de indiferencia [usd/t]</span>
            <span className="chart-card-subtitle">
              FOB de {fuenteBioLabel}
              {R.brechaFob.promedio != null && <> · quedó {R.brechaFob.promedio >= 0 ? 'arriba' : 'abajo'} por {num0(Math.abs(R.brechaFob.promedio))} usd/t en promedio, y arriba en {R.brechaFob.arriba} de {R.brechaFob.meses} meses</>}
            </span>
          </div>
        </div>
        <div className="chart-card-body">
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={pts} margin={margenGrafico}>
              <XAxis {...ejeX} />
              <YAxis {...ejeY} />
              <Tooltip content={tooltipBrecha('bioFob', 'indifBioFob', 'brechaBioFob', 'FOB')} cursor={{ stroke: C.cursorLinea }} />
              <Line {...linea} dataKey="indifBioFob" name="Precio de indiferencia" stroke={C.neutral} strokeDasharray="5 4" />
              <Line {...linea} dataKey="bioFob" name="FOB" stroke={C.celeste} />
            </ComposedChart>
          </ResponsiveContainer>
          <Leyenda items={[{ label: `FOB del biodiésel (${fuenteBioLabel})`, color: C.celeste }, { label: 'Precio de indiferencia', color: C.neutral, punteada: true }]} />
        </div>
      </div>

      <div className="chart-card cx-bloque">
        <div className="chart-card-header">
          <div>
            <span className="chart-card-title">El mejor destino de cada mes</span>
            <span className="chart-card-subtitle">Un casillero por mes, del color del destino que más dejó · {tramo}{sinOficial > 0 && <> · más claro: {sinOficial === 1 ? 'el mes' : `los ${sinOficial} meses`} sin precio oficial del biodiésel</>}</span>
          </div>
        </div>
        <div className="chart-card-body">
          <div className="cx-franja" style={{ gridTemplateColumns: `repeat(${pts.length}, minmax(0, 1fr))` }}>
            {pts.map((m) => (
              // un mes sin precio oficial del biodiésel (el que está en curso) va más claro: le falta un destino
              <span
                key={m.fecha}
                title={`${fmt.monthShort(m.fecha)}: ${m.mejor ? nombreDe[m.mejor] : 'sin dato'}${m.m_bio_local == null ? ' (sin precio oficial del biodiésel ese mes)' : ''}`}
                style={{ background: m.mejor ? colores[m.mejor] : 'transparent', opacity: m.m_bio_local == null ? 0.4 : 1 }}
              />
            ))}
          </div>
          <div className="cx-franja-eje"><span>{fmt.monthShort(desde)}</span><span>{fmt.monthShort(hasta)}</span></div>
          <Leyenda items={ALTERNATIVAS.map((a) => ({ label: `${a.nombre}: ${R.porDestino[a.id].mejorEn} ${R.porDestino[a.id].mejorEn === 1 ? 'mes' : 'meses'}`, color: colores[a.id] }))} />
        </div>
      </div>
    </div>
  );
}
