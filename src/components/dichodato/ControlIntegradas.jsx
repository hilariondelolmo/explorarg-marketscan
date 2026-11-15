import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DATOS from '../../data/empresas.json';
import { serie as CAPACIDAD } from '../../data/capacidad.json';
import { fmt } from '../../lib/format.js';

/**
 * Control "Años" de las integradas (episodios 5 y 28 de "Del dicho al dato"):
 * exportaciones, ventas al mercado interno y uso de la capacidad instalada de
 * las empresas integradas, año por año, en el rango que se elija. Y, al lado,
 * la exportación de las no integradas, que es cero.
 *
 * Mismas definiciones que el cuadro de las integradas del 14/11/2026
 * (output/cuadro-integradas-utilizacion):
 *  - integradas: las de categoría INTEGRADA en empresas.json;
 *  - ventas al mercado interno = ventas al corte + otras ventas;
 *  - exportaciones = producción - ventas al mercado interno (la Secretaría de
 *    Energía no la publica por empresa, y la columna `exp` del sitio deja en 0
 *    a Patagonia, Vicentín y Noble); total vendido = producción;
 *  - utilización = total vendido / capacidad instalada del registro completo
 *    (capacidad.json, con las plantas paradas adentro); el año incompleto,
 *    contra los doceavos de capacidad que corresponden.
 *
 * Da las cifras del episodio 28: 81,1% en 2011 y 14,0% en enero a septiembre
 * de 2026; exportación de 1.285.853 t en 2021, 1.191.656 en 2022, 247.240 en
 * 2023, 390.551 en 2024 y 273.773 en 2025. Las de 2022, 2023 y 2025 dependen
 * de las revisiones de la Secretaría de Energía cargadas en el Excel maestro
 * el 15/11/2026 (13 filas de integradas).
 *
 * `inicial` trae los dos años con los que abre cada episodio.
 */
const [FECHA, PROD, , VC, XQ, EXP] = [0, 1, 2, 3, 4, 5];
const PRIMER_ANIO = 2010;
const ULTIMO = DATOS.ultimo_mes;
const ULTIMO_ANIO = Number(ULTIMO.slice(0, 4));
const MESES_ULTIMO = Number(ULTIMO.slice(5, 7));
const ANIOS = Array.from({ length: ULTIMO_ANIO - PRIMER_ANIO + 1 }, (_, i) => PRIMER_ANIO + i);
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const INTEGRADAS = new Set(DATOS.empresas.filter((e) => e.categoria === 'INTEGRADA').map((e) => e.empresa));

// Año -> producción, ventas al corte y otras ventas de las integradas; y exportación de las no integradas
const POR_ANIO = new Map(ANIOS.map((a) => [a, { prod: 0, vc: 0, otras: 0, expNoIntegradas: 0, cap: 0 }]));
DATOS.empresas.forEach((e) => {
  e.serie.forEach((f) => {
    const a = POR_ANIO.get(Number(f[FECHA].slice(0, 4)));
    if (!a) return;
    if (e.categoria === 'INTEGRADA') {
      a.prod += f[PROD];
      a.vc += f[VC];
      a.otras += f[XQ];
    } else if (e.categoria === 'NO INTEGRADA') {
      a.expNoIntegradas += f[EXP];
    }
  });
});
CAPACIDAD.forEach((r) => {
  const a = POR_ANIO.get(Number(r.fecha.slice(0, 4)));
  if (a && INTEGRADAS.has(r.empresa)) a.cap += r.capacidad;
});
const FILAS = ANIOS.map((anio) => {
  const a = POR_ANIO.get(anio);
  const meses = anio === ULTIMO_ANIO ? MESES_ULTIMO : 12;
  const interno = a.vc + a.otras;
  const capPeriodo = (a.cap * meses) / 12;
  return { anio, meses, exp: a.prod - interno, interno, total: a.prod, cap: a.cap, capPeriodo, util: a.prod / capPeriodo, expNoIntegradas: a.expNoIntegradas };
});

const t = (v) => `${fmt.int(v)} t`;
const pct = (v) => fmt.pct(v * 100);

function SelectorAnio({ id, rotulo, valor, onChange }) {
  return (
    <span className="dd-mes">
      <label htmlFor={id}>{rotulo}</label>
      <select id={id} value={valor} onChange={(e) => onChange(Number(e.target.value))}>
        {ANIOS.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
    </span>
  );
}

export default function ControlIntegradas({ inicial }) {
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [d, h] = desde <= hasta ? [desde, hasta] : [hasta, desde];
  const esInicial = desde === inicial.desde && hasta === inicial.hasta;

  const { filas, total, escala } = useMemo(() => {
    const fs = FILAS.filter((f) => f.anio >= d && f.anio <= h);
    const suma = (k) => fs.reduce((s, f) => s + f[k], 0);
    return {
      filas: fs,
      total: { exp: suma('exp'), interno: suma('interno'), util: suma('total') / suma('capPeriodo'), expNoIntegradas: suma('expNoIntegradas') },
      escala: Math.max(...fs.map((f) => f.exp), 1),
    };
  }, [d, h]);
  const rango = d === h ? `en ${d}` : `de ${d} a ${h}`;
  const parcial = h === ULTIMO_ANIO && MESES_ULTIMO < 12;

  return (
    <div className="dd-control">
      <div className="dd-perillas">
        <div className="dd-perilla dd-perilla-ancha">
          <span className="dd-perilla-rotulo">Años</span>
          <div className="dd-perilla-fila">
            <SelectorAnio id="dd-anio-desde" rotulo="Desde" valor={desde} onChange={setDesde} />
            <SelectorAnio id="dd-anio-hasta" rotulo="Hasta" valor={hasta} onChange={setHasta} />
            <button type="button" className="dd-boton" disabled={esInicial} onClick={() => { setDesde(inicial.desde); setHasta(inicial.hasta); }}>
              Volver a los años del video
            </button>
          </div>
        </div>
      </div>

      <div className="dd-cifras" aria-live="polite">
        <div className="dd-cifra">
          <span className="dd-cifra-rotulo">Las integradas exportaron</span>
          <span className="dd-cifra-valor">{t(total.exp)}</span>
          <span className="dd-cifra-nota">{rango}; al mercado interno, {t(total.interno)}</span>
        </div>
        <div className="dd-cifra">
          <span className="dd-cifra-rotulo">Usaron de su capacidad</span>
          <span className="dd-cifra-valor">{pct(total.util)}</span>
          <span className="dd-cifra-nota">total vendido sobre capacidad instalada, {rango}</span>
        </div>
        <div className="dd-cifra dd-cifra-alerta">
          <span className="dd-cifra-rotulo">Las no integradas exportaron</span>
          <span className="dd-cifra-valor">{t(total.expNoIntegradas)}</span>
          <span className="dd-cifra-nota">{rango}: no son parte del acuerdo con la Unión Europea</span>
        </div>
      </div>

      <div className="dd-tabla-caja">
        <table className="dd-tabla dd-tabla-anios">
          <thead>
            <tr>
              <th scope="col">Año</th>
              <th scope="col" className="dd-col-barra">Exportaciones de las integradas</th>
              <th scope="col">Mercado interno</th>
              <th scope="col">Total vendido</th>
              <th scope="col">Capacidad instalada</th>
              <th scope="col">Utilización</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.anio}>
                <th scope="row">{f.anio}{f.meses < 12 ? ` (enero a ${MESES[f.meses - 1]})` : ''}</th>
                <td className="dd-col-barra">
                  <span className="dd-barrita" aria-hidden="true"><i style={{ width: `${Math.max(0, (f.exp / escala) * 100)}%` }} /></span>
                  {t(f.exp)}
                </td>
                <td>{t(f.interno)}</td>
                <td>{t(f.total)}</td>
                <td>{t(f.cap)}</td>
                <td><b>{pct(f.util)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="dd-fuente">
        Secretaría de Energía: producción y ventas por empresa, procesadas en explorarg.com (datos a {fmt.monthShort(ULTIMO)}). Integradas: las
        elaboradoras de grupos aceiteros (doce en toda la serie). Ventas al mercado interno: ventas al corte más otras ventas. Exportaciones: producción menos ventas al mercado
        interno (la Secretaría no las publica por empresa). Utilización: total vendido sobre la capacidad instalada registrada, con las plantas paradas
        adentro{parcial ? `; ${ULTIMO_ANIO}, contra los ${MESES_ULTIMO} doceavos que corresponden` : ''}. La serie por empresa está
        en <Link to="/mercado/matriz">Detalle de ventas</Link>.
      </p>
    </div>
  );
}
