import { Navigate, useParams } from 'react-router-dom';
import SectionNav from '../components/SectionNav.jsx';
import CrushingEvolucion from '../components/crushing/CrushingEvolucion.jsx';
import CrushingHoy from '../components/crushing/CrushingHoy.jsx';
import CrushingQuePasaSi from '../components/crushing/CrushingQuePasaSi.jsx';
import { ProveedorDeCuenta, useCuenta } from '../lib/cuenta/Cuenta.jsx';
import { useReservada } from '../lib/reservada.js';
import { CajaDeIngreso } from './AgenteEntrada.jsx';
import './Page.css';
import './Agente.css';

// Área reservada (pedido de HDO del 27/11/2026): herramientas de uso interno. Para ver
// el contenido hay que estar logueado en explorarg.com y estar autorizado de antemano.
//  - sin sesión se ve la caja de ingreso, la misma del Agente;
//  - con sesión pero sin autorización, un cartel que lo dice;
//  - con sesión y autorización, las herramientas.
// El candado de verdad está en el servidor (api/reservada.js): los datos no viajan con
// la página ni están en el repositorio. Acá solo se le muestra a cada uno en qué quedó.
//
// Los títulos y los textos de entrada son provisorios: los define HDO.
const SECTIONS = [
  {
    id: 'crushing', label: 'Crushing: hoy', root: true, Comp: CrushingHoy,
    titulo: 'Crushing integrado: qué destino le conviene a la soja',
    caput:
      'Una tonelada de soja da aceite y harina. La harina se exporta siempre; lo que cambia de un destino a otro es cuánto paga por el aceite. Esta página compara, con los precios del día, los cinco destinos posibles: exportar el poroto sin moler, exportar el aceite, venderlo en el mercado local, o convertirlo en biodiésel para exportar o para el corte obligatorio. El resultado está en dólares por tonelada de soja, contra exportar el poroto. Es un cálculo marginal: solo cuenta los costos que se evitan si no se muele.',
  },
  {
    id: 'evolucion', label: 'Crushing: evolución', Comp: CrushingEvolucion,
    titulo: 'Crushing integrado: cómo se movió cada destino',
    caput:
      'La cuenta de la pantalla Hoy, hecha con los precios y las retenciones de cada día y promediada por mes: qué dejó cada destino de la soja y cuánto tuvo que valer el biodiésel para convenir más que vender el aceite. Los costos y los rendimientos son los de hoy, iguales para toda la serie: lo que se ve moverse son los precios y las retenciones.',
  },
  {
    id: 'que-pasa-si', label: 'Crushing: qué pasa si', Comp: CrushingQuePasaSi,
    titulo: 'Crushing integrado: qué pasa si cambia algo',
    caput:
      'Partiendo de los precios del día, o de los que escribas, cuatro pruebas: comparar tu escenario con los datos del día; mover una variable y ver en qué valor cambia el destino que más conviene; mover dos a la vez; y repartir un volumen de soja cuando los destinos tienen tope, porque ni el mercado local ni el corte obligatorio absorben todo.',
  },
];
const RAIZ = SECTIONS.find((s) => s.root);

function Cartel({ children }) {
  return <p className="ag-cargando">{children}</p>;
}

function Cabecera({ titulo, children }) {
  return (
    <>
      <h2 className="ag-titulo">{titulo}</h2>
      <div className="ag-caput">{children}</div>
    </>
  );
}

function BarraDeSesion() {
  const cuenta = useCuenta();
  if (cuenta.estado !== 'adentro') return null;
  return (
    <div className="ag-barra ag-barra-sesion">
      <div className="container">
        <span>
          Ingresaste como <strong>{cuenta.usuario.email}</strong>
        </span>
        <button type="button" onClick={cuenta.salir}>
          Salir
        </button>
      </div>
    </div>
  );
}

// Lo que ve quien ya ingresó. Recién acá se piden los datos: si el servidor dice que la
// cuenta no está autorizada, no se muestra ni la descripción de las herramientas.
function Adentro({ activa }) {
  const { estado, datos, error } = useReservada('crushing');
  const { Comp } = activa;
  if (estado === 'no_autorizado') {
    return (
      <>
        <BarraDeSesion />
        <section className="page-section pg ag" id="suscriptores">
          <div className="container">
            <Cabecera titulo="Área de suscriptores">
              <p>
                Esta sección es de uso interno y tu cuenta no está habilitada para verla. Si te corresponde, pedile el acceso a Explora.
              </p>
            </Cabecera>
          </div>
        </section>
      </>
    );
  }
  return (
    <>
      <SectionNav sections={SECTIONS} basePath="/suscriptores" />
      <BarraDeSesion />
      {/* La herramienta va al ancho general del sitio y con la cabecera estándar (reglas de HDO del 23/11/2026);
          la caja angosta de .pg.ag queda solo para la página de ingreso. */}
      <section key={activa.id} className="page-section pagina-cabecera" id={activa.id}>
        <div className="container">
          <div className="section-header cx-cabecera">
            <h2>{activa.titulo}</h2>
            <p>{activa.caput}</p>
          </div>
          {estado === 'cargando' && <Cartel>Cargando…</Cartel>}
          {(estado === 'sin_datos' || estado === 'error') && <Cartel>{error}</Cartel>}
          {estado === 'listo' && <Comp datos={datos} />}
        </div>
      </section>
    </>
  );
}

function Contenido() {
  const { seccion } = useParams();
  const cuenta = useCuenta();
  if (seccion === RAIZ.id) return <Navigate to="/suscriptores" replace />;

  if (cuenta.estado === 'cargando') {
    return (
      <section className="page-section">
        <div className="container"><Cartel>Cargando…</Cartel></div>
      </section>
    );
  }
  if (!cuenta.puedeConsultar) {
    return (
      <section className="page-section pg ag" id="suscriptores">
        <div className="container">
          <Cabecera titulo="Área de suscriptores">
            <p>
              Esta sección es de uso interno. Para ver su contenido hay que ingresar a <strong>explorarg.com</strong> con una cuenta
              habilitada por Explora.
            </p>
          </Cabecera>
          <div className="ag-dos">
            <div />
            <CajaDeIngreso />
          </div>
        </div>
      </section>
    );
  }
  return <Adentro activa={SECTIONS.find((x) => x.id === seccion) || RAIZ} />;
}

export default function Suscriptores() {
  return (
    <ProveedorDeCuenta>
      <Contenido />
    </ProveedorDeCuenta>
  );
}
