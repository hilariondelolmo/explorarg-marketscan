import ReformaLey from './ReformaLey.jsx';
import PropuestaLey from './PropuestaLey.jsx';
import './ImpresoLey.css';

/**
 * Edición para papel de las dos páginas del dashboard.
 * No introduce un sistema gráfico nuevo: abre y pagina los componentes
 * existentes para que la interacción de la web permanezca visible.
 */
export default function ImpresoLey() {
  return (
    <main className="impreso-ley">
      <ReformaLey printMode />
      <PropuestaLey printMode />
    </main>
  );
}
