import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import SectionNav from '../components/SectionNav.jsx';
import TutorialModal from '../components/TutorialModal.jsx';
import tutoriales from '../data/tutoriales.json';
import PrecioSurtidor from '../components/gasoil/PrecioSurtidor.jsx';
import EstructuraMercado from '../components/gasoil/EstructuraMercado.jsx';
import RankingPrecios from '../components/gasoil/RankingPrecios.jsx';
import MinoristaMayorista from '../components/gasoil/MinoristaMayorista.jsx';
import MinoristaMayoristaVolumen from '../components/gasoil/MinoristaMayoristaVolumen.jsx';
import TablasSesco from '../components/gasoil/TablasSesco.jsx';
import Importaciones from '../components/gasoil/Importaciones.jsx';
import PreciosComparados from '../components/gasoil/PreciosComparados.jsx';
import Res963 from '../components/gasoil/Res963.jsx';
import CorteObligatorio from '../components/gasoil/CorteObligatorio.jsx';
import ResultadoImportar from '../components/gasoil/ResultadoImportar.jsx';
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
    id: 'canales', label: 'Ventas', tableau: 'ARG GO MARKET BTB BTC',
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
            title: 'Ventas de combustibles',
            intro: 'Volumen de combustibles vendido en el mercado interno según las tablas SESCO de la Secretaría de Energía, por sector, empresa y provincia, y el gas oil importado (neto de transferencia entre empresas del sector).',
            Comp: TablasSesco,
            encabezadoPropio: true,
          },
        ],
      },
    ],
  },
  {
    id: 'importaciones', label: 'Importaciones', tableau: 'GO IMPORTS / GO IMPORTS II / GO IMPORTS III / MERCADO GO IXN',
    menu: [
      {
        id: 'importaciones', label: 'Despachos',
        title: 'Gas oil importado',
        intro: 'De dónde viene el gas oil importado y quién lo trae: los despachos de importación por país de origen, país de procedencia e importador, con el precio CIF y el egreso de dólares.',
        Comp: Importaciones,
        encabezadoPropio: true,
      },
      {
        id: 'importaciones-resultado', label: 'Resultado de importar',
        title: 'Qué dejó importar',
        intro: 'El gas oil importado por cada importador contra el precio local del gas oil fósil de su bandera, mes a mes desde 2010: cuánto ganó o perdió por importar en vez de comprar acá.',
        Comp: ResultadoImportar,
        encabezadoPropio: true,
      },
    ],
  },
  {
    id: 'biodiesel', label: 'Biodiésel vs. gas oil', tableau: 'ARG GO MARKET SIDE BY SIDE / Dashboard 31 / AJUSTE PRECIO GASOILBIO',
    menu: [
      {
        id: 'biodiesel', label: 'Precios comparados',
        title: 'Precios comparados: gas oil y biodiésel',
        intro: 'Ocho precios en el mismo intervalo: los dos gas oil del surtidor, el importado y el crudo arriba; el biodiésel, el aceite, el metanol y el tipo de cambio abajo, cada uno con su variación acumulada y ampliable con un clic. Al pie, el biodiésel contra el gas oil sin impuestos.',
        Comp: PreciosComparados,
        encabezadoPropio: true,
      },
      {
        id: 'biodiesel-963', label: 'Res. 963 y ajustes',
        title: 'Precio Res. 963: publicado vs. fórmula',
        intro: 'El precio del biodiésel que publica la Secretaría de Energía contra el que da la fórmula de la Res. 963, mes a mes desde noviembre de 2023, y cómo se ajustaron el biodiésel, el gas oil fósil y el tipo de cambio.',
        Comp: Res963,
        encabezadoPropio: true,
      },
    ],
  },
  {
    id: 'corte', label: 'Corte obligatorio', tableau: 'MERCARG GO V (2)',
    title: 'El corte obligatorio, mes a mes',
    intro: 'Qué parte del gas oil fue biodiésel y qué parte gas oil importado que ocupó su lugar, desde 2010, y cuánto ganaron los mezcladores por no mezclar lo que mandaba la ley, valorizado contra el sustituto.',
    Comp: CorteObligatorio,
    encabezadoPropio: true,
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
    intro: 'Cuánto subió cada precio desde una fecha base: el gas oil, las naftas y el kerosene del relevamiento contra los crudos, el diésel, el biodiésel, el aceite y el metanol. Se eligen los productos y el recorte del relevamiento.',
    Comp: RankingPrecios,
    encabezadoPropio: true,
  },
];
// Páginas: cada pestaña, o las de su menú (que puede tener un segundo nivel)
const paginas = (s) => (s.menu ? s.menu.flatMap(paginas) : [s]);
const PAGINAS = SECTIONS.flatMap(paginas);
const RAIZ = SECTIONS.find((s) => s.root);
// Tutorial en video de la página (src/data/tutoriales.json, lo escribe scripts/tutorial/armar.py)
const TUTORIAL = tutoriales.find((t) => t.id === 'gasoil');

export default function GasOil() {
  const { seccion } = useParams();
  const [tutorialAbierto, setTutorialAbierto] = useState(false);
  // La sección raíz vive en /gas-oil: su dirección con nombre (la de antes) lleva ahí
  if (seccion === RAIZ.id) return <Navigate to="/gas-oil" replace />;
  const activa = PAGINAS.find((s) => s.id === seccion) || RAIZ;
  const { id, title, intro, Comp } = activa;

  return (
    <>
      <SectionNav
        sections={SECTIONS} basePath="/gas-oil"
        accion={TUTORIAL && { label: 'Cómo se usa', title: 'Tutorial en video de esta página', onClick: () => setTutorialAbierto(true) }}
      />
      <TutorialModal tutorial={TUTORIAL} open={tutorialAbierto} onClose={() => setTutorialAbierto(false)} />
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
