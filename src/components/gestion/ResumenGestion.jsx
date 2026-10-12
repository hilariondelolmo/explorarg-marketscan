import corte from '../../data/corte.json';
import gestion from '../../data/gestion.json';
import KPIs from '../KPIs.jsx';
import { fmt } from '../../lib/format.js';

export default function ResumenGestion() {
  const anual = corte.anual.filter((a) => a.anio >= 2010);
  const ultimoCompleto = anual.filter((a) => a.meses === 12).at(-1);
  const deficitAcum = anual.reduce((s, a) => s + (a.deficit_ton || 0), 0);
  const aniosCumplidos = anual.filter((a) => a.real >= a.obligatorio * 0.98).length;

  const desde2010 = gestion.secretarios.filter((s) => !s.hasta || s.hasta >= '2010-01-01');
  const formulas2010 = gestion.formulas_periodos.length;

  const kpis = [
    {
      label: `Corte real ${ultimoCompleto.anio}`,
      value: fmt.pct(ultimoCompleto.real * 100),
      sub: `vs ${fmt.pct(ultimoCompleto.obligatorio * 100)} obligatorio`,
      tone: 'neg',
    },
    {
      label: 'Déficit acumulado 2010-hoy',
      value: fmt.int(deficitAcum),
      sub: 'toneladas de biodiesel no cortadas',
      tone: 'warn',
    },
    {
      label: 'Años con corte cumplido',
      value: `${aniosCumplidos} de ${anual.length}`,
      sub: 'corte real ≥ 98% del obligatorio',
    },
    {
      label: 'Secretarios/as de Energía',
      value: String(desde2010.length),
      sub: 'desde 2010 · rotación del área',
      tone: 'info',
    },
    {
      label: 'Fórmulas de precio',
      value: String(formulas2010),
      sub: 'cambios normativos desde 2010',
      tone: 'info',
    },
  ];

  return <KPIs items={kpis} />;
}
