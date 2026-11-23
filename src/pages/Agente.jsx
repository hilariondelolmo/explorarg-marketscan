import { Suspense, lazy, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import SectionNav from '../components/SectionNav.jsx';
import TutorialModal from '../components/TutorialModal.jsx';
import tutoriales from '../data/tutoriales.json';
import { ProveedorDeCuenta, useCuenta } from '../lib/cuenta/Cuenta.jsx';
import AgenteEntrada from './AgenteEntrada.jsx';
import Analista from './Analista.jsx';
import Panel from './Panel.jsx';
import Poligrafo from './Poligrafo.jsx';
import './Page.css';
import './Agente.css';

// Agente Explorarg (nombre elegido por HDO el 22/11/2026): la sección que reúne las
// dos herramientas que leen lo que la persona escribe con inteligencia artificial y
// responden con los datos del sitio.
//  - Polígrafo: verifica una frase (verdadero, falso, doble vara...).
//  - Analista: responde un pedido de análisis (ranking, evolución, comparación).
// En las dos vale la misma regla: la IA traduce y el programa calcula.
//
// Para entrar hay que estar registrado y logueado en explorarg.com (HDO, 22/11/2026):
//  - sin sesión se ve la página de entrada (AgenteEntrada.jsx);
//  - con ?muestra=1 se ven las herramientas con los ejemplos ya analizados, que no
//    consultan a la IA, y el formulario apagado;
//  - con sesión, las herramientas completas.
// El candado de verdad está en el servidor (server/cuentas/sesion.js).
const SECTIONS = [
  { id: 'poligrafo', label: 'Polígrafo', root: true, Comp: Poligrafo },
  { id: 'analista', label: 'Analista', Comp: Analista },
];
// Solo para quien está logueado: sus tokens, su consumo y sus consultas guardadas
const PANEL = { id: 'panel', label: 'Mi panel', Comp: Panel, derecha: true };
// Solo para quien administra el sitio: todas las cuentas y todas las consultas. La página se
// baja recién cuando esa persona entra a la pestaña; los datos los cuida el servidor (api/admin.js).
const Admin = lazy(() => import('./Admin.jsx'));
const ADMIN = { id: 'admin', label: 'Administrador', Comp: Admin };
const RAIZ = SECTIONS.find((s) => s.root);
const ruta = (s) => (s.root ? '/agente' : `/agente/${s.id}`);

function BarraDeCuenta() {
  const cuenta = useCuenta();
  if (cuenta.estado === 'adentro') {
    return (
      // Solo dice con qué cuenta está ingresado, sin banda gris: el gris queda para las pestañas.
      // Los tokens no van acá: están en Mi panel (HDO, 23/11/2026).
      <div className="ag-barra ag-barra-sesion">
        <div className="container">
          {cuenta.avisoDeCuenta && <span className="ag-barra-error">{cuenta.avisoDeCuenta}</span>}
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
  if (cuenta.modo === 'apagadas') {
    return (
      <div className="ag-barra ag-barra-aviso">
        <div className="container">Copia local: el registro no está configurado y el Agente anda abierto.</div>
      </div>
    );
  }
  return (
    <div className="ag-barra ag-barra-aviso">
      <div className="container">
        <span>Estás viendo los ejemplos ya analizados. Para escribir tus propias consultas:</span>
        <Link to="/agente">ingresá o registrate</Link>
      </div>
    </div>
  );
}

function Contenido() {
  const { seccion } = useParams();
  const [parametros] = useSearchParams();
  const cuenta = useCuenta();
  const [tutorialAbierto, setTutorialAbierto] = useState(false);
  if (seccion === RAIZ.id) return <Navigate to="/agente" replace />;
  const conPanel = cuenta.estado === 'adentro';
  const disponibles = conPanel ? [...SECTIONS, PANEL, ...(cuenta.esAdmin ? [ADMIN] : [])] : SECTIONS;
  const actual = disponibles.find((s) => s.id === seccion) || RAIZ;
  const { Comp } = actual;
  // Tutorial en video de la herramienta que se está viendo (src/data/tutoriales.json, lo escribe
  // scripts/tutorial/armar.py): el id del tutorial es el de la pestaña. Sin entrada en el catálogo no hay botón.
  const tutorial = tutoriales.find((t) => t.id === actual.id);
  const muestra = parametros.get('muestra') === '1';

  if (cuenta.estado === 'cargando') {
    return (
      <section className="page-section">
        <div className="container">
          <p className="ag-cargando">Cargando…</p>
        </div>
      </section>
    );
  }
  if (!cuenta.puedeConsultar && !muestra) return <AgenteEntrada />;

  // en la muestra, las pestañas conservan el ?muestra=1 (si no, al cambiar de pestaña volvería la entrada)
  const secciones = cuenta.puedeConsultar ? disponibles : SECTIONS.map((s) => ({ ...s, to: `${ruta(s)}?muestra=1` }));
  return (
    <>
      <SectionNav
        sections={secciones}
        basePath="/agente"
        accion={tutorial && { label: 'Cómo se usa', title: 'Tutorial en video de esta herramienta', onClick: () => setTutorialAbierto(true) }}
      />
      <TutorialModal tutorial={tutorial} open={!!tutorial && tutorialAbierto} onClose={() => setTutorialAbierto(false)} />
      <BarraDeCuenta />
      <Suspense fallback={null}>
        <Comp soloEjemplos={!cuenta.puedeConsultar} />
      </Suspense>
    </>
  );
}

export default function Agente() {
  return (
    <ProveedorDeCuenta>
      <Contenido />
    </ProveedorDeCuenta>
  );
}
