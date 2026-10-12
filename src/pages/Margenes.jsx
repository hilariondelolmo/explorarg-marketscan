import { Navigate, useParams } from 'react-router-dom';
import SectionNav from '../components/SectionNav.jsx';
import MargenesBiodiesel from '../components/margenes/MargenesBiodiesel.jsx';
import MargenesGasoil from '../components/margenes/MargenesGasoil.jsx';
import MargenesComparacion from '../components/margenes/MargenesComparacion.jsx';
import './Page.css';

// Márgenes del biodiésel y del gas oil (pedido de HDO del 12/10/2026, en el
// lugar de "Biodiesel - Primas y Precios Relativos" del menú). Réplica de las
// hojas del workbook Tableau 03 "MARKET & INDUSTRY - MARGEN BIODIESEL": el
// biodiésel, el gas oil (crack spread de refinación) y la comparación entre
// los dos crack spreads, las tres del 12/10/2026.
const SECTIONS = [
  {
    id: 'biodiesel', label: 'Biodiésel', root: true, tableau: 'Margenes BIO Inicio / CRACK SPREAD BIO INICIAL',
    title: 'Márgenes del biodiésel',
    intro: 'El precio del biodiésel de corte contra el aceite de soja FAS desde el inicio del corte obligatorio: el margen sobre el aceite y el crack spread 10:9:1 (nueve de biodiésel y una de glicerina por diez de aceite), en la unidad y el intervalo que se elijan.',
    Comp: MargenesBiodiesel,
    encabezadoPropio: true,
  },
  {
    id: 'gas-oil', label: 'Gas oil', tableau: 'CRACK SPREAD INICIO',
    title: 'Crack spread de refinación',
    intro: 'Qué deja refinar un barril de crudo: las naftas y el gas oil fósil sin impuestos, ponderados por volumen, contra el crudo argentino, con los ratios 2:1:1, 3:2:1 y 5:3:2, desde el inicio del corte obligatorio. Precios del relevamiento con sus aperturas o de las terminales, y la mezcla de crudo que se elija.',
    Comp: MargenesGasoil,
    encabezadoPropio: true,
  },
  {
    id: 'comparacion', label: 'Comparación', tableau: 'CRACK SPREAD COMPARADO (2)',
    title: 'Biodiésel y gas oil, comparados',
    intro: 'El crack spread del biodiésel contra el de la refinación, mes a mes y en la misma unidad, con las variables de cada uno a mano: el aceite del biodiésel; la fuente de precios, sus aperturas, el ratio y la mezcla de crudo de la refinación.',
    Comp: MargenesComparacion,
    encabezadoPropio: true,
  },
];
const RAIZ = SECTIONS.find((s) => s.root);

export default function Margenes() {
  const { seccion } = useParams();
  if (seccion === RAIZ.id) return <Navigate to="/margenes" replace />;
  const activa = SECTIONS.find((s) => s.id === seccion) || RAIZ;
  const { id, title, intro, Comp } = activa;

  return (
    <>
      <SectionNav sections={SECTIONS} basePath="/margenes" />
      <section key={id} id={id} className={`page-section${activa.encabezadoPropio ? ' page-section-compacta' : ''}`}>
        <div className="container">
          {!activa.encabezadoPropio && (
            <>
              <p className="section-kicker">Márgenes</p>
              <h2>{title}</h2>
              {intro && <p className="section-intro">{intro}</p>}
            </>
          )}
          <Comp seccion={activa} />
        </div>
      </section>
    </>
  );
}
