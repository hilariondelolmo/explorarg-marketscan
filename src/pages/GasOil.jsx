import { useParams } from 'react-router-dom';
import SectionNav from '../components/SectionNav.jsx';
import PrecioSurtidor from '../components/gasoil/PrecioSurtidor.jsx';
import EstructuraMercado from '../components/gasoil/EstructuraMercado.jsx';
import RankingPrecios from '../components/gasoil/RankingPrecios.jsx';
import MinoristaMayorista from '../components/gasoil/MinoristaMayorista.jsx';
import './Page.css';

// Réplica de cuatro tableros del workbook Tableau 05 "MARKET & INDUSTRY -
// MERCADO INTERNO GAS OIL VERSION ONLINE I" (decisión HDO 16/09/2026).
const SECTIONS = [
  {
    id: 'surtidor', label: 'Precio surtidor', root: true, tableau: 'PRECIO SURTIDOR DASHBOARD (2)',
    title: 'Precio del gas oil en surtidor',
    intro: 'El relevamiento de precios de la Resolución SE 1104/2004: qué paga el público por el gas oil en cada provincia y bandera, y cómo se movió mes a mes.',
    Comp: PrecioSurtidor,
    encabezadoPropio: true, // encabezado, filtros y cajas quedan fijos al scrollear (bloque fijo)
  },
  {
    id: 'estructura', label: 'Estructura del mercado', tableau: 'MARKET STRUCTURE',
    title: 'Estructura del mercado local',
    intro: 'Por dónde pasa el gas oil: canal de distribución, tipo de negocio y canal de comercialización, en volumen, con los mismos filtros que el precio en surtidor.',
    Comp: EstructuraMercado,
    encabezadoPropio: true,
  },
  {
    id: 'ranking', label: 'Ranking de precios', tableau: 'RANKING Actualizado',
    title: 'Ranking de variación de precios',
    intro: 'Cuánto subió cada precio desde una fecha base: el gas oil en surtidor y sin impuestos contra el crudo, el diesel, el biodiesel y el aceite.',
    Comp: RankingPrecios,
  },
  {
    id: 'canales', label: 'Minorista y mayorista', tableau: 'ARG GO MARKET BTB BTC',
    title: 'Mercado minorista y mayorista',
    intro: 'Precio ponderado del gas oil grado 2 y grado 3 en el canal minorista y en el mayorista, con los mismos filtros que el precio en surtidor, y el gas oil importado.',
    Comp: MinoristaMayorista,
    encabezadoPropio: true,
  },
];

export default function GasOil() {
  const { seccion } = useParams();
  const activa = SECTIONS.find((s) => s.id === seccion) || SECTIONS[0];
  const { id, title, intro, Comp } = activa;

  return (
    <>
      <SectionNav sections={SECTIONS} basePath="/gas-oil" />
      <section key={id} id={id} className={`page-section${activa.encabezadoPropio ? ' page-section-compacta' : ''}`}>
        <div className="container">
          {!activa.encabezadoPropio && (
            <>
              <p className="section-kicker">Mercado Gas Oil</p>
              <h2>{title}</h2>
              <p className="section-intro">{intro}</p>
            </>
          )}
          <Comp seccion={activa} />
        </div>
      </section>
    </>
  );
}
