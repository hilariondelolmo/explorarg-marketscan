import { Navigate, useLocation, useParams } from 'react-router-dom';
import SectionNav from '../components/SectionNav.jsx';
import ResumenGestion from '../components/gestion/ResumenGestion.jsx';
import CorteRealChart from '../components/gestion/CorteRealChart.jsx';
import DeficitChart from '../components/gestion/DeficitChart.jsx';
import EficaciaGestiones from '../components/gestion/EficaciaGestiones.jsx';
import Secretarios from '../components/gestion/Secretarios.jsx';
import ElaboradorasCumplimiento from '../components/gestion/ElaboradorasCumplimiento.jsx';
import PetrolerasCumplimiento from '../components/gestion/PetrolerasCumplimiento.jsx';
import FormulasPrecios from '../components/gestion/FormulasPrecios.jsx';
import './Page.css';

// La página de apertura: los números gruesos del resumen y, debajo, la serie
// central con las gestiones
function CorteYResumen() {
  return (
    <>
      <ResumenGestion />
      <CorteRealChart />
    </>
  );
}

// Los funcionarios con las métricas de su gestión y el orden por eficacia
const Funcionarios = () => <Secretarios metricas />;

// Blueprint §4 - Eje 04: Cumplimiento de Cupo y Gestión Estatal. Una pestaña
// por tema, cada una con su página, como en Mercado de Gas Oil y Márgenes
// (pedido de HDO del 12/10/2026: la página única que bajaba de tema en tema
// quedó atrás). Gestiones y Quién cumple despliegan un menú con sus dos
// páginas, como las pestañas con menú de Gas Oil. La primera abre en /gestion.
const SECTIONS = [
  {
    id: 'corte', label: 'Corte obligatorio', root: true,
    title: 'El corte, gestión por gestión',
    intro: 'La brecha entre el corte obligatorio que fija la ley y el corte real que administra la Secretaría de Energía, medida gestión por gestión desde 2010. Los números gruesos y, debajo, la serie central del análisis: lo que la norma exige contra lo que efectivamente se mezcló, mes a mes y gestión por gestión. El corte real surge del biodiesel vendido al corte sobre las ventas de gas oil grado 2 y 3, excluidos los destinos exentos.',
    Comp: CorteYResumen,
  },
  {
    id: 'deficit', label: 'Déficit', title: 'El costo del incumplimiento',
    intro: 'Cada punto de corte incumplido son toneladas de biodiesel que no se produjeron y gas oil -en parte importado- que ocupó su lugar.',
    Comp: DeficitChart,
  },
  {
    id: 'gestiones', label: 'Gestiones',
    menu: [
      {
        id: 'eficacia', label: 'Eficacia por presidencia', title: 'Eficacia de la Autoridad de Aplicación',
        intro: 'El mismo mandato legal, administrado por gestiones distintas, produjo resultados distintos. El cumplimiento se mide como biodiesel efectivamente cortado sobre el requerido por la norma vigente en cada mes.',
        Comp: EficaciaGestiones,
      },
      {
        id: 'secretarios', label: 'Funcionarios del régimen', title: 'Los funcionarios del régimen',
        intro: 'Secretarios de Energía y subsecretarios del área hidrocarburos: quiénes administraron el régimen, cuánto duraron y bajo qué presidencia, con el corte real, el cumplimiento y la participación del gas oil importado de cada gestión, y su puesto por eficacia.',
        Comp: Funcionarios,
      },
    ],
  },
  {
    id: 'cumplimiento', label: 'Quién cumple',
    menu: [
      {
        id: 'elaboradoras', label: 'Elaboradoras', title: 'Cumplimiento por elaboradora',
        intro: 'Quién entrega el cupo que se le asigna y quién no.',
        Comp: ElaboradorasCumplimiento,
      },
      {
        id: 'petroleras', label: 'Petroleras', title: 'Cumplimiento de las petroleras',
        intro: 'La otra punta de la cadena: cuánto biodiesel compró cada petrolera contra el que sus ventas de gas oil obligaban a mezclar.',
        Comp: PetrolerasCumplimiento,
      },
    ],
  },
  {
    id: 'formulas', label: 'Fórmulas', title: 'Las fórmulas de precio',
    intro: 'El precio del biodiesel de cupo no lo fija el mercado: lo fija la Secretaría de Energía por resolución, con la fórmula que cambió una veintena de veces desde 2010.',
    Comp: FormulasPrecios,
  },
];
// Páginas: cada pestaña, o las de su menú
const paginas = (s) => (s.menu ? s.menu.flatMap(paginas) : [s]);
const PAGINAS = SECTIONS.flatMap(paginas);
const RAIZ = SECTIONS.find((s) => s.root);
const rutaDe = (s) => (s.root ? '/gestion' : `/gestion/${s.id}`);

export default function Gestion() {
  const { seccion } = useParams();
  const { hash } = useLocation();
  // La sección raíz vive en /gestion: su dirección con nombre lleva ahí
  if (seccion === RAIZ.id) return <Navigate to="/gestion" replace />;
  // Las anclas de la página única de antes (/gestion#deficit) llevan a su pestaña
  if (!seccion && hash) {
    const anclada = hash === '#resumen' ? RAIZ : PAGINAS.find((s) => `#${s.id}` === hash);
    if (anclada) return <Navigate to={rutaDe(anclada)} replace />;
  }
  const activa = PAGINAS.find((s) => s.id === seccion) || RAIZ;
  const { id, title, intro, Comp } = activa;

  return (
    <>
      <SectionNav sections={SECTIONS} basePath="/gestion" />
      <section key={id} id={id} className="page-section">
        <div className="container">
          <p className="section-kicker">Cumplimiento del corte</p>
          <h2>{title}</h2>
          <p className="section-intro">{intro}</p>
          <Comp seccion={activa} />
        </div>
      </section>
    </>
  );
}
