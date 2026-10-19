import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider } from './lib/theme.jsx';
import Nav from './components/Nav.jsx';
import Home from './pages/Home.jsx';
import mercadoData from './data/mercado.json';
import { fmt } from './lib/format.js';
// ReformaLey.css se carga acá, global, para que en el build quede siempre ANTES de las hojas de las
// páginas que la extienden (QueSeJuegaDiputados.css): si Vite la sirve como chunk compartido después,
// su reset `.articulo-reforma * { padding: 0 }` pisa los recuadros (visto en producción el 19/10/2026).
import './pages/ReformaLey.css';

const Mercado = lazy(() => import('./pages/Mercado.jsx'));
const Gestion = lazy(() => import('./pages/Gestion.jsx'));
const GasOil = lazy(() => import('./pages/GasOil.jsx'));
const Margenes = lazy(() => import('./pages/Margenes.jsx'));
const MarcoLegal = lazy(() => import('./pages/MarcoLegal.jsx'));
const Articulos = lazy(() => import('./pages/Articulos.jsx'));
const ReformaLey = lazy(() => import('./pages/ReformaLey.jsx'));
const PropuestaLey = lazy(() => import('./pages/PropuestaLey.jsx'));
const PropuestaOptimizada = lazy(() => import('./pages/PropuestaOptimizada.jsx'));
const AnalisisDictamen = lazy(() => import('./pages/AnalisisDictamen.jsx'));
const MapaFirmas = lazy(() => import('./pages/MapaFirmas.jsx'));
const MapaRecinto = lazy(() => import('./pages/MapaRecinto.jsx'));
const ImpresoLey = lazy(() => import('./pages/ImpresoLey.jsx'));
const ImpresoA3 = lazy(() => import('./pages/ImpresoA3.jsx'));
const Infografia = lazy(() => import('./pages/Infografia.jsx'));
const ExportGrafico = lazy(() => import('./pages/ExportGrafico.jsx'));
const CincoMinutos = lazy(() => import('./pages/CincoMinutos.jsx'));
const QueSeJuegaDiputados = lazy(() => import('./pages/QueSeJuegaDiputados.jsx'));
const LeyBiocombustiblesVara = lazy(() => import('./pages/LeyBiocombustiblesVara.jsx'));
const CeprebRepartir = lazy(() => import('./pages/CeprebRepartir.jsx'));
const Tutoriales = lazy(() => import('./pages/Tutoriales.jsx'));
const AcercaDe = lazy(() => import('./pages/AcercaDe.jsx'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
      <ScrollToTop />
      <Nav />
      <Suspense fallback={<div className="page-loading">Cargando…</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/mercado/:seccion?" element={<Mercado />} />
          <Route path="/gestion/:seccion?" element={<Gestion />} />
          <Route path="/gas-oil/:seccion?" element={<GasOil />} />
          <Route path="/margenes/:seccion?" element={<Margenes />} />
          <Route path="/marco-legal" element={<MarcoLegal />} />
          <Route path="/articulos" element={<Articulos />} />
          <Route path="/reforma-ley-27640" element={<ReformaLey />} />
          <Route path="/propuesta-s0809-2026" element={<PropuestaLey />} />
          <Route path="/propuesta-optimizada" element={<PropuestaOptimizada />} />
          <Route path="/analisis-dictamen" element={<AnalisisDictamen />} />
          <Route path="/mapa-firmas" element={<MapaFirmas />} />
          <Route path="/mapa-recinto" element={<MapaRecinto />} />
          <Route path="/impreso-reforma-27640" element={<ImpresoLey />} />
          <Route path="/impreso-a3" element={<ImpresoA3 />} />
          <Route path="/infografia" element={<Infografia />} />
          <Route path="/cinco-minutos" element={<CincoMinutos />} />
          <Route path="/que-se-juega-en-diputados" element={<QueSeJuegaDiputados esquemas />} />
          {/* Respaldo: la versión de texto del artículo, fuera del menú (HDO, 19/10/2026) */}
          <Route path="/que-se-juega-en-diputados-texto" element={<QueSeJuegaDiputados />} />
          <Route path="/que-se-juega-en-diputados-esquemas" element={<Navigate to="/que-se-juega-en-diputados" replace />} />
          <Route path="/ley-biocombustibles-propia-vara" element={<LeyBiocombustiblesVara />} />
          <Route path="/respuesta-documento-cepreb" element={<CeprebRepartir />} />
          <Route path="/cepreb-quiere-repartir" element={<Navigate to="/respuesta-documento-cepreb" replace />} />
          <Route path="/tutoriales" element={<Tutoriales />} />
          <Route path="/acerca-de" element={<AcercaDe />} />
          <Route path="/export-grafico/:id" element={<ExportGrafico />} />
        </Routes>
      </Suspense>
      <footer className="site-footer">
        <div className="container">
          <p>
            Market Analysis, Dashboards and Data Viz by HDO -{' '}
            <strong>
              <a href="https://www.explorarg.com" target="_blank" rel="noopener noreferrer">
                Explorarg
              </a>
            </strong>{' '}
            Copyright © 2022 · Datos agregados de reportes mensuales de la Secretaría de
            Energía · Actualizado con datos hasta {fmt.monthShort(mercadoData.ultimo_mes)}.
          </p>
          <p className="muted">
            El tablero refleja la posición editorial de explorarg sobre el mercado de biodiesel
            en Argentina. Las opiniones son del autor; los datos están verificados contra
            fuentes oficiales.
          </p>
        </div>
      </footer>
      </BrowserRouter>
    </ThemeProvider>
  );
}
