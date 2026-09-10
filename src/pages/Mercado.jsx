import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import SectionNav from '../components/SectionNav.jsx';
import corte from '../data/corte.json';
import { fmt } from '../lib/format.js';
import MercadoHoy from '../components/mercado/MercadoHoy.jsx';
import AsignacionHoy from '../components/mercado/AsignacionHoy.jsx';
import ConclusionesIndicadores from '../components/mercado/ConclusionesIndicadores.jsx';
import DemandaPetroleras from '../components/mercado/DemandaPetroleras.jsx';
import EvolucionVentas from '../components/mercado/EvolucionVentas.jsx';
import MatrizHistorica from '../components/mercado/MatrizHistorica.jsx';
import CategoriasComparadas from '../components/mercado/CategoriasComparadas.jsx';
import CapacidadChart from '../components/mercado/CapacidadChart.jsx';
import CupoUso from '../components/mercado/CupoUso.jsx';
import EmpresaFicha from '../components/mercado/EmpresaFicha.jsx';
import ParticipacionChart from '../components/mercado/ParticipacionChart.jsx';
import GruposAceiteras from '../components/mercado/GruposAceiteras.jsx';
import MapaPlantas from '../components/mercado/MapaPlantas.jsx';
import CorteRealGO from '../components/mercado/CorteRealGO.jsx';
import './Page.css';

// Meses con dato de corte: dominio del mes de análisis de Principales Indicadores
const MESES_ANALISIS = corte.mensual
  .filter((m) => m.fecha >= '2010-01' && m.obligatorio !== null)
  .map((m) => m.fecha);

// El mes de análisis gobierna TODA la sección: los dos análisis (en tabs
// estilo Tablero v16), las conclusiones y el cuadro de demanda por petrolera.
// Desde el encabezado hasta la fila de filtros del tab activo queda fijo al
// scrollear (dos capas sticky; --pi-tope mide la altura de la primera).
function PrincipalesIndicadores({ seccion }) {
  const [mes, setMes] = useState(MESES_ANALISIS.at(-1));
  const [analisis, setAnalisis] = useState('corte');
  const stickyRef = useRef(null);
  const [tope, setTope] = useState(210);
  useEffect(() => {
    const el = stickyRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setTope(el.offsetHeight));
    ro.observe(el);
    setTope(el.offsetHeight);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="pi-seccion" style={{ '--pi-tope': `${tope}px` }}>
      <div className="pi-sticky" ref={stickyRef}>
      <p className="section-kicker">Mercado Biodiesel</p>
      <h2>{seccion?.title ?? 'Principales Indicadores'}</h2>
      {seccion?.intro && <p className="section-intro">{seccion.intro}</p>}
      <div className="empresa-selector-row">
        <label htmlFor="mes-analisis">Mes de análisis</label>
        <select
          id="mes-analisis" className="empresa-select" style={{ minWidth: 150 }}
          value={mes} onChange={(e) => setMes(e.target.value)}
        >
          {[...MESES_ANALISIS].reverse().map((f) => (
            <option key={f} value={f}>{fmt.monthShort(f)}</option>
          ))}
        </select>
      </div>
      <div className="mh-tabs" role="tablist">
        <button
          role="tab" aria-selected={analisis === 'corte'}
          className={analisis === 'corte' ? 'active' : ''}
          onClick={() => setAnalisis('corte')}
        >
          Corte Obligatorio
        </button>
        <button
          role="tab" aria-selected={analisis === 'asignacion'}
          className={analisis === 'asignacion' ? 'active' : ''}
          onClick={() => setAnalisis('asignacion')}
        >
          Asignación Cupos
        </button>
        <button
          role="tab" aria-selected={analisis === 'conclusiones'}
          className={analisis === 'conclusiones' ? 'active' : ''}
          onClick={() => setAnalisis('conclusiones')}
        >
          Conclusiones
        </button>
        <button
          role="tab" aria-selected={analisis === 'tableau'}
          className={`mh-tab-derecha ${analisis === 'tableau' ? 'active' : ''}`}
          onClick={() => setAnalisis('tableau')}
        >
          Ver en Tableau
        </button>
      </div>
      </div>
      {analisis === 'corte' && <MercadoHoy mes={mes} />}
      {analisis === 'asignacion' && <AsignacionHoy mes={mes} />}
      {analisis === 'conclusiones' && (
        <ConclusionesIndicadores mes={mes}>
          <DemandaPetroleras mes={mes} />
        </ConclusionesIndicadores>
      )}
      {analisis === 'tableau' && (
        <iframe
          title="Tablero Tableau - Mercado Interno Biodiesel"
          width="100%"
          height="1200"
          frameBorder="0"
          style={{ margin: 0, padding: 0 }}
          src="https://sd-3088058-w.ferozo.com/tableau/02MARKETINDUSTRY-MERCADOINTERNOBIODIESEL/MERCADOINTERNOIntroExplorarg"
        />
      )}
    </div>
  );
}

// Blueprint §3 - Eje 02: Mercado Interno Biodiesel (2.1–2.10; 2.11 y 2.12 en Fase 2).
// Títulos editoriales propuestos; se revisan con HDO antes de publicar.
const SECTIONS = [
  {
    id: 'kpis', label: 'KPIs', title: 'Principales Indicadores', root: true,
    encabezadoPropio: true, // fija su encabezado y filtros al scrollear
    intro: 'Los indicadores centrales del corte y de la asignación de cupos - en el mes elegido, el acumulado del año y los últimos doce meses.',
    Comp: PrincipalesIndicadores,
  },
  {
    id: 'evolucion', label: 'Evolución', title: 'Evolución de ventas',
    intro: 'Producción vendida por destino desde 2008: corte obligatorio, mercado voluntario y exportación.',
    Comp: EvolucionVentas,
  },
  {
    id: 'matriz', label: 'Detalle de ventas', title: 'Detalle de ventas',
    intro: 'La matriz completa del mercado: cada empresa elaboradora contra cada año desde el inicio del régimen, con la métrica que elijas y comparación de períodos.',
    Comp: MatrizHistorica,
    encabezadoPropio: true, // la matriz fija su encabezado junto a los controles
  },
  {
    id: 'empresa', label: 'por Grupo Económico / Empresa', title: 'Detalle por Empresa y/o Grupo Económico',
    intro: 'Elegí cualquier empresa del registro para ver su cupo, sus ventas y su cumplimiento, año por año o mes a mes.',
    Comp: EmpresaFicha,
    encabezadoPropio: true, // fija encabezado y selectores al scrollear
  },
  {
    id: 'integradas', label: 'Categorías',
    title: 'Un producto. Una industria. Dos categorías de productores. Dos formas de organización empresarial.',
    intro: 'El biodiesel constituye un único producto elaborado por una única industria. Dentro de ella existen dos categorías de productores: integrados y no integrados. A su vez, estos pueden organizarse como empresas independientes o formar parte de grupos económicos. Comprender estas diferencias resulta esencial para diseñar un marco regulatorio que promueva la competencia, evite la concentración del mercado y garantice igualdad de oportunidades para todos los productores.',
    Comp: CategoriasComparadas,
  },
  {
    id: 'capacidad', label: 'Capacidad', title: 'Capacidad instalada',
    intro: 'Cuánta capacidad de producción tiene el país y cuánta se usa.',
    Comp: CapacidadChart,
  },
  {
    id: 'cupo', label: 'Cupo', title: 'Cumplimiento y uso del cupo',
    intro: 'El cupo que la Secretaría de Energía asigna y lo que efectivamente se vende contra él.',
    Comp: CupoUso,
  },
  {
    id: 'participacion', label: 'Participación', title: 'Quién es quién en el mercado',
    intro: 'Participación de los últimos doce meses por elaboradora, por petrolera compradora y por provincia.',
    Comp: ParticipacionChart,
  },
  {
    id: 'aceiteras', label: 'Grupos', title: 'Los grupos económicos',
    intro: 'La producción agrupada por holding. Los grupos integrados son la industria aceitera operando dentro del biodiesel.',
    Comp: GruposAceiteras,
  },
  {
    id: 'plantas', label: 'Plantas', title: 'Mapa de plantas',
    intro: 'Cuatro sectores en un mismo mapa: las plantas de biodiesel en operación con su capacidad instalada, las plantas de molienda de aceite, las refinerías de hidrocarburos y la planta de metanol de Plaza Huincul. Cada sector tiene sus propios filtros.',
    Comp: MapaPlantas,
    encabezadoPropio: true, // fija encabezado, sectores y filtros al scrollear
  },
  {
    id: 'corte-real', label: 'Corte real', title: 'Gas oil y corte real',
    intro: 'El mercado de gas oil que el biodiesel debe cortar, y el porcentaje efectivamente alcanzado.',
    Comp: CorteRealGO,
  },
];

// Partición para la nav "Dashboards": Principales Indicadores agrupa KPIs y
// Evolución; Detalle de ventas agrupa el resto de las secciones del eje.
const IDS_INDICADORES = ['kpis', 'evolucion'];
const GRUPO_INDICADORES = SECTIONS.filter((s) => IDS_INDICADORES.includes(s.id));
const GRUPO_DETALLE = SECTIONS.filter((s) => !IDS_INDICADORES.includes(s.id));

export default function Mercado() {
  const { seccion } = useParams();
  const activa = SECTIONS.find((s) => s.id === seccion) || SECTIONS[0];
  const { id, title, intro, Comp } = activa;
  const grupo = IDS_INDICADORES.includes(id) ? GRUPO_INDICADORES : GRUPO_DETALLE;

  return (
    <>
      <SectionNav sections={grupo} basePath="/mercado" />
      <section
        key={id} id={id}
        className={`page-section${activa.encabezadoPropio ? ' page-section-compacta' : ''}`}
      >
        <div className="container">
          {!activa.encabezadoPropio && (
            <>
              <p className="section-kicker">Mercado Biodiesel</p>
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
