import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip,
  ReferenceArea, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import corte from '../../data/corte.json';
import { fmt } from '../../lib/format.js';
import { SECRETARIOS, SUBSECRETARIOS, presidenciaDe, funcionarioDe } from '../../lib/gestiones.js';
import ChartTooltip from '../charts/ChartTooltip.jsx';
import '../charts/Chart.css';
import { useChartColors } from '../../lib/theme.jsx';

// El área de trazado empieza después del eje Y y termina antes del margen
// derecho (más el eje del cumplimiento cuando está): las filas de gestiones
// se alinean con esas medidas
const EJE_Y = 60;
const EJE_DER = 52;
const MARGEN_DER = 10;
const PARTICULAS = new Set(['de', 'del', 'la', 'van', 'von']);
// Color de la línea de promedio según la presidencia (pedido de HDO): celeste
// para el FPV / FDT, amarillo para Cambiemos, violeta para LLA
const COLOR_PRESIDENCIA = {
  'Cristina Fernández de Kirchner': 'celeste',
  'Mauricio Macri': 'warn',
  'Alberto Fernández': 'celeste',
  'Javier Milei': 'violeta',
};
// Niveles de gestión: cómo se busca a la persona de un mes y cómo se la nombra
const NIVELES = [
  {
    id: 'pres', rotulo: 'Presid.', titulo: 'Presidente',
    de: (f) => presidenciaDe(f), clave: (p) => `pres|${p.presidente}`, nombre: (p) => p.presidente, corto: (p) => p.corto,
    presidente: (p) => p.presidente, cargo: () => 'Presidente',
  },
  {
    id: 'sec', rotulo: 'Secr.', titulo: 'Secretario/a de Energía',
    de: (f) => funcionarioDe(SECRETARIOS, f), clave: (p) => `sec|${p.nombre}|${p.desde}`, nombre: (p) => p.nombre, corto: (p) => p.nombre,
    presidente: (p) => p.presidente, cargo: (p) => p.cargo,
  },
  {
    id: 'sub', rotulo: 'Subsecr.', titulo: 'Subsecretario · área hidrocarburos',
    de: (f) => funcionarioDe(SUBSECRETARIOS, f), clave: (p) => `sub|${p.nombre}|${p.desde}`, nombre: (p) => p.nombre, corto: (p) => p.nombre,
    presidente: (p) => p.presidente, cargo: (p) => `${p.cargo}${p.nombramiento ? ` · ${p.nombramiento}` : ''}`,
  },
];
const mesesDe = (desde, hasta) => `${fmt.monthShort(desde.slice(0, 7))} a ${hasta ? fmt.monthShort(hasta.slice(0, 7)) : 'hoy'}`;
const pct2 = (v) => `${(v * 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const pct1 = (v) => `${(v * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

// Apellido ("Juan José Aranguren" → "Aranguren", "Luis De Ridder" → "De Ridder") e iniciales
const apellido = (nombre) => {
  const p = nombre.trim().split(/\s+/);
  return p.length > 2 && PARTICULAS.has(p.at(-2).toLowerCase()) ? p.slice(-2).join(' ') : p.at(-1);
};
const iniciales = (nombre) => nombre.trim().split(/\s+/).map((p) => p[0]).join('');
// El texto más largo que entra en el ancho del tramo (unos 6 px por letra)
const queEntra = (opciones, px) => opciones.find((t) => t.length * 6 + 10 <= px) ?? '';

/**
 * Tramos consecutivos de la serie con la misma persona. Devuelve la posición
 * de cada tramo en el área de trazado (0 a 1), de punto medio a punto medio
 * para que los tramos vecinos se toquen.
 */
function tramos(fechas, personaDe) {
  const out = [];
  fechas.forEach((f, i) => {
    const p = personaDe(f);
    const ult = out.at(-1);
    if (ult && ult.persona === p) ult.b = i;
    else out.push({ persona: p, a: i, b: i });
  });
  const n = Math.max(1, fechas.length - 1);
  return out.filter((t) => t.persona).map((t) => ({
    ...t,
    izq: Math.max(0, t.a - 0.5) / n,
    der: Math.min(fechas.length - 1, t.b + 0.5) / n,
  }));
}

/**
 * Corte obligatorio vs. corte real, con área de déficit sombreada. Vista
 * anual o mensual.
 *
 * Con "Gestiones" prendido lleva arriba tres filas alineadas con el gráfico:
 * presidentes, secretarios de Energía y subsecretarios del área de
 * hidrocarburos. Clic en cualquiera de ellos (o, para los presidentes, dentro
 * de su zona del gráfico) deja solo su período; otro clic vuelve a la serie
 * completa. "Promedio" traza en punteado el corte real promedio de cada
 * gestión (biodiésel / gas oil de todos sus meses) y "Cumplimiento" el
 * cumplimiento promedio de cada gestión (corte real promedio / obligatorio
 * promedio) sobre el eje derecho; las dos con el color de la presidencia,
 * por presidencia en la serie completa o de la gestión elegida si se eligió
 * un funcionario (HDO, 30/09/2026: el cumplimiento es siempre el promedio de
 * la gestión de que se trate). La fila de presidentes lleva ese color como
 * fondo muy claro.
 *
 * Sin props muestra la serie del país (corte.json). La página Tablas SESCO
 * del mercado de gas oil le pasa `datos` con la misma forma ({ mensual:
 * [{ fecha, real, obligatorio, bio_m3, go_m3 }], anual: [{ anio, real,
 * obligatorio }] }), calculados para las empresas elegidas, y `detalle` para
 * el subtítulo.
 */
export default function CorteRealChart({ datos = corte, detalle, vistaInicial = 'anual' }) {
  const C = useChartColors();
  const [vista, setVista] = useState(vistaInicial);
  const [conGestiones, setConGestiones] = useState(true);
  const [conPromedio, setConPromedio] = useState(false);
  const [conCumpl, setConCumpl] = useState(false);
  const [foco, setFoco] = useState(null); // { nivel, clave } de la gestión que se ve sola, o null
  // Ancho del área de trazado, para saber qué nombre entra en cada tramo
  const filasRef = useRef(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = filasRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [conGestiones]);

  const anual = vista === 'anual';
  // Mes que representa a cada punto: el propio o, en la vista anual, junio
  const mesDe = (x) => (anual ? `${x}-06` : x);
  const colorDe = (nivel, persona) => C[COLOR_PRESIDENCIA[nivel.presidente(persona)] || 'neutral'];

  // Corte real y cumplimiento promedio de cada gestión, en los tres niveles:
  // biodiésel / gas oil (y / mandato) de sus meses; si la serie no trae
  // volúmenes, el promedio simple de los meses
  const promedios = useMemo(() => {
    const acum = new Map();
    for (const r of datos.mensual) {
      if (r.fecha < '2010-01') continue;
      for (const nivel of NIVELES) {
        const p = nivel.de(r.fecha);
        if (!p) continue;
        const k = nivel.clave(p);
        const a = acum.get(k) || { bio: 0, go: 0, mandato: 0, suma: 0, n: 0, sumaCumpl: 0, nCumpl: 0 };
        if (r.bio_m3 != null && r.go_m3 != null) {
          a.bio += r.bio_m3;
          a.go += r.go_m3;
          if (r.obligatorio) a.mandato += r.obligatorio * r.go_m3;
        }
        a.suma += r.real;
        a.n += 1;
        if (r.obligatorio) {
          a.sumaCumpl += r.real / r.obligatorio;
          a.nCumpl += 1;
        }
        acum.set(k, a);
      }
    }
    return new Map([...acum.entries()].map(([k, a]) => [k, {
      corte: a.go > 0 ? a.bio / a.go : a.suma / a.n,
      cumpl: a.mandato > 0 ? a.bio / a.mandato : a.nCumpl ? a.sumaCumpl / a.nCumpl : null,
    }]));
  }, [datos]);

  const nivelFoco = foco ? NIVELES.find((n) => n.id === foco.nivel) : null;
  const enFoco = (mes) => {
    if (!foco) return true;
    const p = nivelFoco.de(mes);
    return !!p && nivelFoco.clave(p) === foco.clave;
  };
  // La línea de promedio va por presidencia; con un funcionario elegido, por su gestión
  const nivelLinea = nivelFoco || NIVELES[0];

  const base = (anual ? datos.anual : datos.mensual)
    .filter((r) => (anual ? r.anio >= 2010 : r.fecha >= '2010-01'))
    .map((r) => {
      const x = anual ? String(r.anio) : r.fecha;
      const real = r.real * 100;
      const oblig = r.obligatorio === null ? null : r.obligatorio * 100;
      return {
        x,
        real,
        oblig,
        deficit: oblig !== null && oblig > real ? oblig - real : 0,
      };
    })
    .filter((r) => enFoco(mesDe(r.x)));
  const fechas = base.map((r) => r.x);
  const meses = fechas.map(mesDe);
  const tramosLinea = tramos(meses, nivelLinea.de);
  // Una serie por tramo (prom_0 / cumpl_0, prom_1 / cumpl_1, ...) para que cada línea lleve su color
  const serie = base.map((r, i) => {
    const fila = { ...r };
    tramosLinea.forEach((t, k) => {
      if (i < t.a || i > t.b) return;
      const prom = promedios.get(nivelLinea.clave(t.persona));
      fila[`prom_${k}`] = (prom?.corte ?? 0) * 100;
      fila[`cumpl_${k}`] = prom?.cumpl != null ? prom.cumpl * 100 : null;
    });
    return fila;
  });

  // El eje llega a 12% como siempre; si una empresa mezcló más, crece de a 3 puntos hasta 42%
  const maximo = Math.max(0, ...serie.map((r) => Math.max(r.real, r.oblig ?? 0)));
  const tope = Math.min(42, Math.max(12, Math.ceil(maximo / 3) * 3));
  const paso = tope <= 18 ? 3 : 6;
  const marcas = Array.from({ length: Math.floor(tope / paso) + 1 }, (_, i) => i * paso);
  // Eje derecho del cumplimiento: de 25 en 25 hasta cubrir el máximo (125% como mínimo)
  const cumplMax = Math.max(0, ...tramosLinea.map((t) => (promedios.get(nivelLinea.clave(t.persona))?.cumpl ?? 0) * 100));
  const topeCumpl = Math.max(125, Math.ceil(cumplMax / 25) * 25);
  const marcasCumpl = Array.from({ length: topeCumpl / 25 + 1 }, (_, i) => i * 25);

  const presidentes = tramos(meses, NIVELES[0].de);
  const filas = NIVELES.map((nivel) => ({ nivel, tramos: tramos(meses, nivel.de) }));
  const alternarFoco = (nivel, persona) => {
    if (!persona) return;
    const clave = nivel.clave(persona);
    setFoco((f) => (f?.clave === clave ? null : { nivel: nivel.id, clave }));
  };
  const personaFoco = foco && filas.find((f) => f.nivel.id === foco.nivel)?.tramos.find((t) => nivelFoco.clave(t.persona) === foco.clave)?.persona;

  const tickFmt = anual ? undefined : (v) => fmt.monthShort(v);
  const margenDer = MARGEN_DER + (conCumpl ? EJE_DER : 0);

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <div>
          <span className="chart-card-title">Corte obligatorio vs. corte real</span>
          <span className="chart-card-subtitle">
            % de biodiesel en el gas oil · el área sombreada es el déficit{detalle ? ` · ${detalle}` : ''}
            {personaFoco ? ` · ${nivelFoco.id === 'pres' ? 'presidencia de' : 'gestión de'} ${nivelFoco.nombre(personaFoco)}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {foco && (
            <div className="chart-range-selector">
              <button onClick={() => setFoco(null)}>Ver todo el período</button>
            </div>
          )}
          <div className="chart-range-selector">
            <button className={anual ? 'active' : ''} onClick={() => setVista('anual')}>
              Anual
            </button>
            <button className={!anual ? 'active' : ''} onClick={() => setVista('mensual')}>
              Mensual
            </button>
          </div>
          <div className="chart-range-selector">
            <button
              className={conGestiones ? 'active' : ''}
              onClick={() => setConGestiones((v) => !v)}
            >
              Gestiones
            </button>
            <button
              className={conPromedio ? 'active' : ''}
              onClick={() => setConPromedio((v) => !v)}
              title="Corte real promedio de cada gestión, en línea punteada con el color de la presidencia"
            >
              Promedio
            </button>
            <button
              className={conCumpl ? 'active' : ''}
              onClick={() => setConCumpl((v) => !v)}
              title="Cumplimiento promedio de cada gestión (corte real / corte obligatorio), sobre el eje derecho"
            >
              Cumplimiento
            </button>
          </div>
        </div>
      </div>
      <div className="chart-card-body">
        {conGestiones && (
          <div className="corte-gestiones" ref={filasRef} style={{ marginLeft: EJE_Y, marginRight: margenDer }}>
            {filas.map(({ nivel, tramos: lista }) => (
              <div key={nivel.id} className="corte-gestiones-fila">
                <span className="corte-gestiones-rotulo" title={nivel.titulo}>{nivel.rotulo}</span>
                {lista.map((t, i) => {
                  const p = t.persona;
                  const clave = nivel.clave(p);
                  const prom = promedios.get(clave);
                  const px = (t.der - t.izq) * ancho;
                  const color = colorDe(nivel, p);
                  // Con Promedio o Cumplimiento prendidos, la cifra va al lado del nombre
                  const cifras = [
                    conPromedio && prom ? pct2(prom.corte) : '',
                    conCumpl && prom?.cumpl != null ? `cumpl. ${pct1(prom.cumpl)}` : '',
                  ].filter(Boolean);
                  const conProm = cifras.length ? ` · ${cifras.join(' · ')}` : '';
                  const nombre = nivel.nombre(p);
                  const texto = queEntra(
                    [`${nombre}${conProm}`, `${nivel.corto(p)}${conProm}`, `${apellido(nombre)}${conProm}`, apellido(nombre), iniciales(nombre)], px,
                  );
                  const activa = foco?.clave === clave;
                  // Los presidentes llevan su color como fondo muy claro (pedido de HDO); las otras filas, gris
                  const fondo = nivel.id === 'pres' ? { background: `color-mix(in srgb, ${color} ${activa ? 28 : 12}%, var(--bg-2))` } : {};
                  return (
                    <button
                      key={clave} type="button"
                      className={`corte-gestion nivel-${nivel.id}${i % 2 ? ' par' : ''}${activa ? ' activa' : ''}`}
                      style={{ left: `${t.izq * 100}%`, width: `${(t.der - t.izq) * 100}%`, ...fondo }}
                      title={`${nombre} · ${nivel.cargo(p)} · ${mesesDe(p.desde, p.hasta)}${
                        prom ? ` · corte real promedio ${pct2(prom.corte)}${prom.cumpl != null ? ` · cumplimiento ${pct1(prom.cumpl)}` : ''}` : ''
                      } · clic: ${activa ? 'volver a todo el período' : 'ver solo su período'}`}
                      onClick={() => alternarFoco(nivel, p)}
                    >
                      {texto}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart
            data={serie} margin={{ top: 10, right: conCumpl ? 0 : MARGEN_DER, left: 0, bottom: 0 }}
            style={conGestiones ? { cursor: 'pointer' } : undefined}
            onClick={(e) => {
              if (!conGestiones || e?.activeLabel == null) return;
              if (foco) setFoco(null);
              else alternarFoco(NIVELES[0], presidenciaDe(mesDe(e.activeLabel)));
            }}
          >
            <XAxis
              dataKey="x"
              tick={{ fill: C.tick, fontSize: 11 }}
              stroke={C.axis}
              tickFormatter={tickFmt}
              minTickGap={30}
            />
            <YAxis
              yAxisId="corte"
              width={EJE_Y}
              tick={{ fill: C.tick, fontSize: 11 }}
              tickFormatter={(v) => fmt.pct(v, 0)}
              stroke={C.axis}
              domain={[0, tope]}
              ticks={marcas}
              allowDataOverflow
            />
            {conCumpl && (
              <YAxis
                yAxisId="cumpl" orientation="right" width={EJE_DER + MARGEN_DER}
                tick={{ fill: C.tick, fontSize: 11 }}
                tickFormatter={(v) => fmt.pct(v, 0)}
                stroke={C.axis}
                domain={[0, topeCumpl]}
                ticks={marcasCumpl}
              />
            )}
            <Tooltip
              content={<ChartTooltip unit="%" />}
              labelFormatter={anual ? undefined : (l) => fmt.monthShort(l)}
              cursor={{ stroke: C.axis }}
            />
            {conGestiones &&
              presidentes.map((t, i) => (
                <ReferenceArea
                  key={t.persona.presidente}
                  yAxisId="corte"
                  x1={fechas[t.a]}
                  x2={fechas[Math.min(fechas.length - 1, t.b + 1)]}
                  fill={i % 2 ? C.banda : C.bandaSuave}
                  stroke="none"
                />
              ))}
            {conGestiones &&
              presidentes.slice(1).map((t) => (
                <ReferenceLine
                  key={`l-${t.persona.presidente}`}
                  yAxisId="corte"
                  x={fechas[t.a]}
                  stroke={C.axis}
                  strokeDasharray="2 4"
                />
              ))}
            <Area
              yAxisId="corte"
              dataKey="real"
              stackId="corte"
              name="Corte real"
              stroke={C.bio}
              strokeWidth={2}
              fill={C.bioFill}
            />
            <Area
              yAxisId="corte"
              dataKey="deficit"
              stackId="corte"
              name="Déficit"
              stroke="none"
              fill={C.alertFill}
            />
            <Line
              yAxisId="corte"
              dataKey="oblig"
              name="Corte obligatorio"
              stroke={C.exp}
              strokeWidth={2}
              dot={false}
            />
            {conCumpl && tramosLinea.map((t, k) => (
              <Line
                key={`cumpl_${k}`}
                yAxisId="cumpl"
                dataKey={`cumpl_${k}`}
                name={`Cumplimiento promedio · ${nivelLinea.nombre(t.persona)}`}
                type="stepAfter"
                stroke={colorDe(nivelLinea, t.persona)}
                strokeWidth={2}
                strokeDasharray="2 3"
                dot={false}
                activeDot={false}
              />
            ))}
            {conPromedio && tramosLinea.map((t, k) => (
              <Line
                key={`prom_${k}`}
                yAxisId="corte"
                dataKey={`prom_${k}`}
                name={`Promedio · ${nivelLinea.nombre(t.persona)}`}
                type="stepAfter"
                stroke={colorDe(nivelLinea, t.persona)}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
        <div className="chart-legend">
          <div className="chart-legend-item">
            <span className="chart-legend-swatch" style={{ background: C.exp }} />
            <span>Corte obligatorio (normativa vigente)</span>
          </div>
          <div className="chart-legend-item">
            <span className="chart-legend-swatch" style={{ background: C.bio }} />
            <span>Corte real (bio vendido al corte / ventas de gas oil)</span>
          </div>
          <div className="chart-legend-item">
            <span className="chart-legend-swatch" style={{ background: C.alertFill }} />
            <span>Déficit (obligatorio no cumplido)</span>
          </div>
          {conPromedio && (
            <div className="chart-legend-item">
              <span className="chart-legend-swatch" style={{ background: 'none', borderTop: `2px dashed ${C.ink}`, height: 0, alignSelf: 'center' }} />
              <span>
                Corte real promedio {nivelFoco && nivelFoco.id !== 'pres' ? 'de la gestión elegida' : 'de cada presidencia'} (biodiésel / gas oil de todo el período)
              </span>
            </div>
          )}
          {conCumpl && (
            <div className="chart-legend-item">
              <span className="chart-legend-swatch" style={{ background: 'none', borderTop: `2px dotted ${C.ink}`, height: 0, alignSelf: 'center' }} />
              <span>
                Cumplimiento promedio {nivelFoco && nivelFoco.id !== 'pres' ? 'de la gestión elegida' : 'de cada presidencia'} (corte real / obligatorio, eje derecho)
              </span>
            </div>
          )}
          {(conPromedio || conCumpl) && (
            <div className="chart-legend-item">
              <span>Colores: celeste FPV y FDT, amarillo Cambiemos, violeta LLA</span>
            </div>
          )}
        </div>
        {conGestiones && (
          <p className="corte-gestiones-ayuda" style={{ marginTop: '0.6rem' }}>
            Clic en un presidente, secretario o subsecretario (o dentro de la zona de un presidente en el gráfico) deja solo su período; otro clic vuelve a la serie completa.
          </p>
        )}
      </div>
    </div>
  );
}
