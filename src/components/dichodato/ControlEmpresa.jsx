import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DATOS from '../../data/empresas.json';
import { fmt } from '../../lib/format.js';

/**
 * Control "Empresa y años" (episodio 29 de "Del dicho al dato": el abandono
 * del mercado interno): cupo asignado, entregado y exportado por las
 * integradas que tuvieron cupo, para la empresa y el período que se elijan.
 *
 * Datos: empresas.json (serie mensual por empresa: fecha, producción, cupo,
 * ventas al corte, otras ventas internas, exportación, COTAB). La exportación
 * por empresa se calcula como producción menos ventas al mercado interno (al
 * corte y otras): la columna `exp` del sitio deja en 0 a Patagonia, Vicentín
 * y Noble, y la Secretaría de Energía no la publica por empresa.
 *
 * Con "Las siete del video" y "Feb 2014 a ene 2016" da las cifras del
 * episodio: 202.133 t asignadas, 13.621 entregadas (6,7%), 2.305.535
 * exportadas, 169 por cada una entregada. Con "2010 a 2013": 618.333 y 772.395.
 */
const [FECHA, PROD, CUPO, VC, XQ] = [0, 1, 2, 3, 4];
const NOMBRES = {
  'RENOVA S.A.': 'Renova',
  'T 6 INDUSTRIAL S.A.': 'T6 Industrial',
  'L.D.C. S.A.': 'LDC',
  'CARGILL S.A.': 'Cargill',
  'VICENTÍN S.A.I.C.': 'Vicentín',
  'MOLINOS S.A.': 'Molinos',
  'NOBLE S.A.': 'Noble',
  'PATAGONIA S.A.': 'Patagonia Bioenergía',
};
const SIETE = Object.keys(NOMBRES).filter((e) => e !== 'PATAGONIA S.A.');
const OPCIONES = [
  { id: 'siete', label: 'Las siete del video (sin Patagonia Bioenergía)', empresas: SIETE },
  ...Object.entries(NOMBRES).map(([id, label]) => ({ id, label, empresas: [id] })),
  { id: 'ocho', label: 'Las ocho integradas que tuvieron cupo', empresas: Object.keys(NOMBRES) },
];
const PERIODOS = [
  { id: 'abandono', label: 'Feb 2014 a ene 2016', desde: '2014-02', hasta: '2016-01' },
  { id: 'cupo', label: '2010 a 2013', desde: '2010-01', hasta: '2013-12' },
  { id: '2015', label: '2015', desde: '2015-01', hasta: '2015-12' },
  { id: '2016', label: '2016', desde: '2016-01', hasta: '2016-12' },
  { id: 'todo', label: '2010 a 2016', desde: '2010-01', hasta: '2016-12' },
];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const SERIES = Object.fromEntries(DATOS.empresas.filter((e) => NOMBRES[e.empresa]).map((e) => [e.empresa, e.serie]));
const PRIMER_ANIO = 2008;
const ULTIMO = DATOS.ultimo_mes;
const ANIOS = Array.from({ length: Number(ULTIMO.slice(0, 4)) - PRIMER_ANIO + 1 }, (_, i) => PRIMER_ANIO + i);

const t = (v) => `${fmt.int(v)} t`;
const pct = (parte, total) => (total > 0 ? fmt.pct((parte / total) * 100) : '-');
const cero = () => ({ cupo: 0, vc: 0, exp: 0 });
const sumar = (a, fila) => {
  a.cupo += fila[CUPO];
  a.vc += fila[VC];
  a.exp += fila[PROD] - fila[VC] - fila[XQ];
  return a;
};

function SelectorMes({ id, rotulo, valor, onChange }) {
  const [anio, mes] = valor.split('-');
  return (
    <span className="dd-mes">
      <label htmlFor={id}>{rotulo}</label>
      <select id={id} value={mes} onChange={(e) => onChange(`${anio}-${e.target.value}`)}>
        {MESES.map((m, i) => (
          <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
        ))}
      </select>
      <select aria-label={`${rotulo}: año`} value={anio} onChange={(e) => onChange(`${e.target.value}-${mes}`)}>
        {ANIOS.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
    </span>
  );
}

export default function ControlEmpresa() {
  const [opcionId, setOpcionId] = useState('siete');
  const [desde, setDesde] = useState(PERIODOS[0].desde);
  const [hasta, setHasta] = useState(PERIODOS[0].hasta);
  const opcion = OPCIONES.find((o) => o.id === opcionId);
  // Si el usuario cruza las fechas, se toman en orden
  const [d, h] = desde <= hasta ? [desde, hasta] : [hasta, desde];

  const { total, porEmpresa, porAnio } = useMemo(() => {
    const tot = cero();
    const emp = [];
    const anios = new Map();
    opcion.empresas.forEach((e) => {
      const acc = cero();
      SERIES[e].forEach((fila) => {
        if (fila[FECHA] < d || fila[FECHA] > h) return;
        sumar(acc, fila);
        sumar(tot, fila);
        const anio = fila[FECHA].slice(0, 4);
        if (!anios.has(anio)) anios.set(anio, { ...cero(), meses: new Set() });
        sumar(anios.get(anio), fila).meses.add(fila[FECHA]);
      });
      emp.push({ nombre: NOMBRES[e], ...acc });
    });
    return {
      total: tot,
      porEmpresa: emp,
      porAnio: [...anios.entries()].sort().map(([anio, v]) => ({ anio, ...v, parcial: v.meses.size < 12 })),
    };
  }, [opcion, d, h]);

  const presetActivo = PERIODOS.find((p) => p.desde === d && p.hasta === h)?.id;
  const varias = opcion.empresas.length > 1;
  const porCadaUna = total.vc > 0 ? Math.round(total.exp / total.vc) : null;

  const Tabla = ({ rotulo, filas }) => (
    <div className="dd-tabla-caja">
      <table className="dd-tabla">
        <thead>
          <tr>
            <th scope="col">{rotulo}</th>
            <th scope="col">Cupo asignado</th>
            <th scope="col">Entregado</th>
            <th scope="col">% del cupo</th>
            <th scope="col">Exportado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave}>
              <th scope="row">{f.clave}</th>
              <td>{t(f.cupo)}</td>
              <td className={f.cupo > 0 && f.vc < f.cupo * 0.5 ? 'dd-rojo' : ''}>{t(f.vc)}</td>
              <td>{pct(f.vc, f.cupo)}</td>
              <td>{t(f.exp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="dd-control">
      <div className="dd-perillas">
        <div className="dd-perilla">
          <label className="dd-perilla-rotulo" htmlFor="dd-empresa">Empresa</label>
          <select id="dd-empresa" className="dd-select" value={opcionId} onChange={(e) => setOpcionId(e.target.value)}>
            {OPCIONES.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="dd-perilla">
          <span className="dd-perilla-rotulo">Período</span>
          <div className="dd-perilla-fila">
            <SelectorMes id="dd-desde" rotulo="Desde" valor={desde} onChange={setDesde} />
            <SelectorMes id="dd-hasta" rotulo="Hasta" valor={hasta} onChange={setHasta} />
          </div>
        </div>
        <div className="dd-perilla dd-perilla-ancha">
          <div className="dd-seg">
            {PERIODOS.map((p) => (
              <button
                key={p.id} type="button" className={presetActivo === p.id ? 'activo' : ''} aria-pressed={presetActivo === p.id}
                onClick={() => {
                  setDesde(p.desde);
                  setHasta(p.hasta);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dd-cifras" aria-live="polite">
        <div className="dd-cifra">
          <span className="dd-cifra-rotulo">{varias ? 'Les asignaron' : 'Le asignaron'}</span>
          <span className="dd-cifra-valor">{t(total.cupo)}</span>
          <span className="dd-cifra-nota">cupo para el mercado interno</span>
        </div>
        <div className={`dd-cifra ${total.cupo > 0 && total.vc < total.cupo * 0.5 ? 'dd-cifra-alerta' : ''}`}>
          <span className="dd-cifra-rotulo">{varias ? 'Entregaron' : 'Entregó'}</span>
          <span className="dd-cifra-valor">{t(total.vc)}</span>
          <span className="dd-cifra-nota">{total.cupo > 0 ? `el ${pct(total.vc, total.cupo)} del cupo` : 'sin cupo asignado en el período'}</span>
        </div>
        <div className="dd-cifra">
          <span className="dd-cifra-rotulo">{varias ? 'Exportaron' : 'Exportó'}</span>
          <span className="dd-cifra-valor">{t(total.exp)}</span>
          <span className="dd-cifra-nota">
            {porCadaUna !== null ? `${fmt.int(porCadaUna)} t por cada una entregada acá` : 'no entregó nada al mercado interno'}
          </span>
        </div>
      </div>

      <div className="dd-tablas">
        {varias && <Tabla rotulo="Empresa" filas={porEmpresa.map((f) => ({ ...f, clave: f.nombre }))} />}
        <Tabla rotulo="Año" filas={porAnio.map((f) => ({ ...f, clave: f.parcial ? `${f.anio} (parcial)` : f.anio }))} />
      </div>

      <p className="dd-fuente">
        Secretaría de Energía: cupos asignados, ventas al corte y producción por empresa, procesados en explorarg.com (datos a {fmt.monthShort(ULTIMO)}).
        Exportación: producción menos ventas al mercado interno. "Parcial": el período elegido no cubre el año entero. El detalle mes a mes de todas las
        empresas está en <Link to="/mercado/matriz">Detalle de ventas</Link>.
      </p>
    </div>
  );
}
