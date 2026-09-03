import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider } from './lib/theme.jsx';
import Nav from './components/Nav.jsx';
import Home from './pages/Home.jsx';
import mercadoData from './data/mercado.json';
import { fmt } from './lib/format.js';

const Mercado = lazy(() => import('./pages/Mercado.jsx'));
const Gestion = lazy(() => import('./pages/Gestion.jsx'));
const MarcoLegal = lazy(() => import('./pages/MarcoLegal.jsx'));
const Articulos = lazy(() => import('./pages/Articulos.jsx'));
const ReformaLey = lazy(() => import('./pages/ReformaLey.jsx'));
const PropuestaLey = lazy(() => import('./pages/PropuestaLey.jsx'));
const PropuestaOptimizada = lazy(() => import('./pages/PropuestaOptimizada.jsx'));
const AnalisisDictamen = lazy(() => import('./pages/AnalisisDictamen.jsx'));
const ImpresoLey = lazy(() => import('./pages/ImpresoLey.jsx'));
const ImpresoA3 = lazy(() => import('./pages/ImpresoA3.jsx'));
const ExportGrafico = lazy(() => import('./pages/ExportGrafico.jsx'));

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
          <Route path="/gestion" element={<Gestion />} />
          <Route path="/marco-legal" element={<MarcoLegal />} />
          <Route path="/articulos" element={<Articulos />} />
          <Route path="/reforma-ley-27640" element={<ReformaLey />} />
          <Route path="/propuesta-s0809-2026" element={<PropuestaLey />} />
          <Route path="/propuesta-optimizada" element={<PropuestaOptimizada />} />
          <Route path="/analisis-dictamen" element={<AnalisisDictamen />} />
          <Route path="/impreso-reforma-27640" element={<ImpresoLey />} />
          <Route path="/impreso-a3" element={<ImpresoA3 />} />
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
