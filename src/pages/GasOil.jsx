import { Navigate, useParams } from 'react-router-dom';
import SectionNav from '../components/SectionNav.jsx';
import PrecioSurtidor from '../components/gasoil/PrecioSurtidor.jsx';
import EstructuraMercado from '../components/gasoil/EstructuraMercado.jsx';
import RankingPrecios from '../components/gasoil/RankingPrecios.jsx';
import MinoristaMayorista from '../components/gasoil/MinoristaMayorista.jsx';
import MinoristaMayoristaVolumen from '../components/gasoil/MinoristaMayoristaVolumen.jsx';
import TablasSesco from '../components/gasoil/TablasSesco.jsx';
import './Page.css';

// Réplica de cuatro tableros del workbook Tableau 05 "MARKET & INDUSTRY -
// MERCADO INTERNO GAS OIL VERSION ONLINE I" (decisión HDO 16/09/2026). Orden y
// nombres de las pestañas definidos por HDO el 29/09/2026; la primera es la
// que abre en /gas-oil. Minorista y mayorista no navega: despliega un menú
// con su página de precios y, dentro de Volumen, las dos fuentes de volumen:
// el relevamiento de la Resolución 1104 y las tablas SESCO.
const SECTIONS = [
  {
    id: 'estructura', label: 'Estructura Mercado', root: true, tableau: 'MARKET STRUCTURE',
    title: 'Estructura del mercado local',
    intro: 'Por dónde pasa el gas oil: canal de distribución, tipo de negocio y canal de comercialización, en volumen, con los mismos filtros que el precio en surtidor.',
    Comp: EstructuraMercado,
    encabezadoPropio: true, // encabezado, filtros y cajas quedan fijos al scrollear (bloque fijo)
  },
  {
    id: 'canales', label: 'Minorista y mayorista', tableau: 'ARG GO MARKET BTB BTC',
    menu: [
      {
        id: 'canales', label: 'Precio',
        title: 'Mercado minorista y mayorista',
        intro: 'Precio ponderado del gas oil grado 2 y grado 3 en el canal minorista y en el mayorista, con los mismos filtros que el precio en surtidor, y el gas oil importado.',
        Comp: MinoristaMayorista,
        encabezadoPropio: true,
      },
      {
        id: 'volumen', label: 'Volumen',
        menu: [
          {
            id: 'canales-volumen', label: 'Resolución 1104',
            title: 'Volumen minorista y mayorista',
            intro: 'Volumen de gas oil grado 2 y grado 3 vendido por el canal minorista y por el mayorista, con los mismos filtros que el precio en surtidor, y el gas oil importado.',
            Comp: MinoristaMayoristaVolumen,
            encabezadoPropio: true,
          },
          {
            id: 'canales-sesco', label: 'Tablas SESCO',
            title: 'Tablas SESCO',
            Comp: TablasSesco,
          },
        ],
      },
    ],
  },
  {
    id: 'surtidor', label: 'Precio surtidor', tableau: 'PRECIO SURTIDOR DASHBOARD (2)',
    title: 'Precio del gas oil en surtidor',
    intro: 'El relevamiento de precios de la Resolución SE 1104/2004: qué paga el público por el gas oil en cada provincia y bandera, y cómo se movió mes a mes.',
    Comp: PrecioSurtidor,
    encabezadoPropio: true,
  },
  {
    id: 'ranking', label: 'Ranking precios', tableau: 'RANKING Actualizado',
    title: 'Ranking de variación de precios',
    intro: 'Cuánto subió cada precio desde una fecha base: el gas oil en surtidor y sin impuestos contra el crudo, el diesel, el biodiesel y el aceite.',
    Comp: RankingPrecios,
  },
];
// Páginas: cada pestaña, o las de su menú (que puede tener un segundo nivel)
const paginas = (s) => (s.menu ? s.menu.flatMap(paginas) : [s]);
const PAGINAS = SECTIONS.flatMap(paginas);
const RAIZ = SECTIONS.find((s) => s.root);

export default function GasOil() {
  const { seccion } = useParams();
  // La sección raíz vive en /gas-oil: su dirección con nombre (la de antes) lleva ahí
  if (seccion === RAIZ.id) return <Navigate to="/gas-oil" replace />;
  const activa = PAGINAS.find((s) => s.id === seccion) || RAIZ;
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
              {intro && <p className="section-intro">{intro}</p>}
            </>
          )}
          <Comp seccion={activa} />
        </div>
      </section>
    </>
  );
}
