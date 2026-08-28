import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Area, Bar, Line } from 'recharts';
import { HECHOS_CHARTS } from '../components/propuesta/HechosCharts.jsx';
import { useTheme } from '../lib/theme.jsx';
import contenido from '../content/propuesta-s80926pl.html?raw';
import './ImpresoA3.css';

/**
 * Láminas A3 apaisadas de la Propuesta S80926PL: una por artículo
 * fundamentado (cabecera con número y bajada del cuadro de correspondencia
 * + tres franjas de ancho fijo: el artículo en dos columnas / normas y
 * justificación / respaldo en datos) y una lámina final con el articulado
 * restante. Diseño validado por HDO sobre la maqueta del artículo 12 y su
 * feedback del 25/08: anchos idénticos en todas las láminas.
 *
 * El contenido sale del mismo blob que /propuesta-s0809-2026; los gráficos
 * se montan por portal sobre los placeholders .pl-chart, como en la web.
 * Como las franjas son fijas, el contenido que no entra en una hoja se
 * derrama —medido sobre el DOM ya montado— a una hoja de continuación con
 * la misma grilla (les pasa sólo a los artículos más cargados).
 *
 * Salida en papel: imprimir en A3 apaisado o scripts/generar_laminas_a3.py.
 */

const texto = (nodo) => (nodo?.textContent || '').replace(/\s+/g, ' ').trim();

// Sólo cuando la app bootea en esta ruta: las series de todos los charts
// renderizan sin animación, directo en su posición final. printToPDF
// congela un fotograma arbitrario y una serie animada queda a medio
// dibujar (o invisible si acaba de montarse). Es el mismo remedio que los
// isAnimationActive={false} explícitos de HechosCharts, extendido a los
// componentes del dashboard que se montan por portal. defaultProps se lee
// en cada render, así que la mutación llega antes que cualquier chart; la
// web en las demás rutas conserva sus animaciones.
if (typeof window !== 'undefined' && window.location.pathname.includes('impreso-a3')) {
  [Area, Bar, Line].forEach((C) => {
    C.defaultProps = { ...C.defaultProps, isAnimationActive: false };
  });
}

/**
 * Retoques por lámina pedidos por HDO al revisar página por página.
 * Reciben el popup de "Respaldo en datos" ya marcado (destacado incluido)
 * y pueden reordenar o re-rotular elementos antes de armar la grilla.
 */
const AJUSTES_DATOS = {
  // 25/08: texto en una sola columna; la cronología normativa entra tras
  // "...la indefinición operó como barrera de entrada." a lo ancho, y la
  // infografía de las no integradas cierra en página propia (como el 5)
  6: (hechos) => {
    // el gráfico de grupos aceiteros no va en la lámina (HDO)
    hechos.querySelector('.pl-chart[data-chart="grupos-aceiteras"]')?.remove();
    const p1 = [...hechos.querySelectorAll(':scope > p')]
      .find((p) => p.textContent.includes('barrera de entrada'));
    const p2 = [...hechos.querySelectorAll(':scope > p')]
      .find((p) => p.textContent.startsWith('La definición'));
    const p3 = [...hechos.querySelectorAll(':scope > p')]
      .find((p) => p.textContent.startsWith('Las dos lecciones'));
    const crono = hechos.querySelector('.pl-imagen img[src*="cronologia-normativa"]')
      ?.closest('.pl-imagen');
    if (p1 && crono) {
      crono.classList.add('a3-span');
      p1.after(crono);
      // tras el cuadro siguen "La definición..." y "Las dos lecciones..."
      if (p2 && p3) {
        crono.after(p2);
        p2.after(p3);
      }
    }
    // las dos infografías de capacidad (integradas, traída del art. 5, y
    // no integradas) comparten la continuación, bien separadas entre sí;
    // la cronología queda en el flujo de la hoja principal
    ['crecimiento-integradas', 'crecimiento-no-integradas'].forEach((id) =>
      hechos.querySelector(`.pl-imagen img[src*="${id}"]`)
        ?.closest('.pl-imagen')?.classList.add('a3-figura-grande'));
    hechos.querySelectorAll(':scope > p').forEach((p) => p.classList.add('a3-span'));
  },
  // 25/08: el cuadro de los funcionarios del régimen va debajo de los
  // KPIs ("3 años, 3 meses y 27 días" / "10 secretarios")
  10: (hechos) => {
    const secretarios = hechos.querySelector('.pl-chart[data-chart="secretarios"]');
    const kpis = hechos.querySelector('.pl-kpis');
    if (secretarios && kpis) {
      secretarios.classList.add('a3-span');
      kpis.after(secretarios);
    }
    // el texto corre en una sola columna a lo ancho
    hechos.querySelectorAll(':scope > p').forEach((p) => p.classList.add('a3-span'));
  },

  // 25/08: los párrafos del respaldo corren en una sola columna, y el
  // cuadro de eficacia por gestión va pegado a "...el mandato se cumple"
  // (si no entran juntos en la hoja, bajan juntos)
  12: (hechos) => {
    // el ranking de petroleras no va en la lámina (HDO): sin él, el
    // artículo cierra en una sola hoja
    hechos.querySelector('.pl-chart[data-chart="petroleras-cumplimiento"]')?.remove();
    const p2 = [...hechos.querySelectorAll(':scope > p')]
      .find((p) => p.textContent.includes('el mandato se cumple'));
    const eficacia = hechos.querySelector('.pl-chart[data-chart="eficacia-gestiones"]');
    const p3 = [...hechos.querySelectorAll(':scope > p')]
      .find((p) => p.textContent.startsWith('El incumplimiento tuvo beneficiarios'));
    if (p2 && eficacia) {
      const grupo = p2.ownerDocument.createElement('div');
      grupo.className = 'a3-grupo';
      p2.before(grupo);
      grupo.append(p2, eficacia);
      // "El incumplimiento tuvo beneficiarios..." sigue al cuadro en el
      // flujo (sin atarse al grupo, para no arrastrarlo de hoja)
      if (p3) grupo.after(p3);
    }
    hechos.querySelectorAll(':scope > p').forEach((p) => p.classList.add('a3-span'));
  },

  // 25/08: el gráfico del metanol va al ancho del bloque, como el del
  // aceite (HDO)
  20: (hechos) => {
    hechos.querySelector('.pl-chart[data-chart="metanol"]')?.classList.add('a3-span');
  },

  // 25/08: el gráfico de cupo asignado y ventas no va en la lámina (HDO):
  // sin él, el artículo cierra en una sola hoja
  15: (hechos) => {
    hechos.querySelector('.pl-chart[data-chart="asignacion-ventas"]')?.remove();
  },

  // 25/08: el gráfico del corte de gasoil no va en la lámina del
  // bioetanol (HDO)
  13: (hechos) => {
    hechos.querySelector('.pl-chart[data-chart="corte-serie"]')?.remove();
  },

  // 25/08: los párrafos del respaldo corren en una sola columna; fuera el
  // cuadro de concentración; el cuadro de petroleras queda debajo de
  // "...la conducta ya observada" en la misma hoja, y el gráfico de
  // precio le cede el lugar (pasa a la continuación)
  14: (hechos) => {
    hechos.querySelector('.pl-chart[data-chart="concentracion-compradores"]')?.remove();
    const p2 = [...hechos.querySelectorAll(':scope > p')]
      .find((p) => p.textContent.includes('la conducta ya observada'));
    const cuadro = hechos.querySelector('.pl-chart[data-chart="demanda-petroleras"]');
    const precio = hechos.querySelector('.pl-chart[data-chart="precio-formula"]');
    if (p2 && cuadro) {
      cuadro.classList.add('a3-span');
      p2.after(cuadro);
      if (precio) hechos.append(precio);
    }
    hechos.querySelectorAll(':scope > p').forEach((p) => p.classList.add('a3-span'));
  },

  // 25/08: el párrafo de la desigualdad de acceso abre a lo ancho hasta
  // "...USD 2.040 millones."; ahí entra el gráfico de retenciones (de
  // borde a borde) y el resto del párrafo sigue después
  5: (hechos) => {
    // en la lámina van sólo retenciones y la infografía de capacidad;
    // ésta cierra sola la hoja de continuación a página entera (HDO)
    ['asimetria-escala', 'categorias-comparadas', 'grupos-aceiteras'].forEach((id) =>
      hechos.querySelector(`.pl-chart[data-chart="${id}"]`)?.remove());
    hechos.querySelector('.pl-imagen')?.classList.add('a3-pagina-propia');
    const p1 = hechos.querySelector(':scope > p');
    const retenciones = hechos.querySelector('.pl-chart[data-chart="retenciones"]');
    if (!p1 || !retenciones) return;
    p1.classList.add('a3-span');
    const CORTE = 'un acumulado de USD 2.040 millones.';
    const html = p1.innerHTML;
    const fin = html.indexOf(CORTE) + CORTE.length;
    if (fin > CORTE.length) {
      const resto = html.slice(fin).trim();
      p1.innerHTML = html.slice(0, fin);
      if (resto) {
        const p1b = document.createElement('p');
        p1b.innerHTML = resto;
        p1.after(p1b);
      }
    }
    p1.after(retenciones);
    // todo el texto bajo el gráfico corre en una sola columna a lo ancho
    hechos.querySelectorAll(':scope > p').forEach((p) => p.classList.add('a3-span'));
  },
};

// "El texto base presentaba tres problemas. Primero, ... Segundo, ..." se
// presenta como lista numerada; cualquier otro formato queda como vino
function normasDe(nodo) {
  const t = nodo.innerHTML;
  if (/Primero,/.test(t) && /Segundo,/.test(t) && nodo.children.length === 1) {
    const plano = texto(nodo);
    const [intro, ...items] = plano.split(/\s*(?:Primero|Segundo|Tercero|Cuarto),\s*/);
    if (items.length >= 2) {
      return {
        intro,
        items: items.map((i) => i.charAt(0).toUpperCase() + i.slice(1)),
      };
    }
  }
  return { html: t };
}

function parsearLaminas(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pop = (art, tipo) =>
    doc.querySelector(`.pl-pop[data-art="${art}"][data-tipo="${tipo}"]`);

  // HDO 25/08: la infografía de integradas pasa del artículo 5 a la
  // continuación del 6, inmediatamente antes de la de no integradas
  const integradas = pop('5', 'hechos')
    ?.querySelector('.pl-imagen img[src*="crecimiento-integradas"]')
    ?.closest('.pl-imagen');
  const noIntegradas = pop('6', 'hechos')
    ?.querySelector('.pl-imagen img[src*="crecimiento-no-integradas"]')
    ?.closest('.pl-imagen');
  if (integradas && noIntegradas) noIntegradas.before(integradas);

  // HDO 25/08: la oración de la facultad abierta deja de abrir el
  // respaldo del 12 y pasa a cerrar su justificación
  const ORACION_12 = 'La facultad abierta de reducir el corte y la ausencia de '
    + 'consecuencias por su incumplimiento no son riesgos a prevenir: son el '
    + 'mecanismo documentado con el que se vació el mandato durante dieciséis años.';
  const hechos12 = pop('12', 'hechos');
  const just12 = pop('12', 'just');
  const p12 = hechos12 && [...hechos12.querySelectorAll(':scope > p')]
    .find((p) => p.innerHTML.includes(ORACION_12));
  if (p12 && just12) {
    p12.innerHTML = p12.innerHTML.replace(ORACION_12, '').trimStart();
    const cierre = doc.createElement('p');
    cierre.textContent = ORACION_12;
    just12.append(cierre);
  }

  // bajada de cabecera: modificación y efecto del cuadro de correspondencia
  const bajadas = new Map();
  doc.querySelectorAll('.pl-pop[data-tipo="cuadro"] tr.pl-cuadro-fila').forEach((tr) => {
    const celdas = tr.querySelectorAll('td');
    if (celdas.length >= 4) {
      bajadas.set(tr.dataset.art, `${texto(celdas[1])}. ${texto(celdas[3])}.`);
    }
  });

  const laminas = [];
  const resto = [];
  doc.querySelectorAll('section.pl-art').forEach((sec) => {
    const num = sec.id.replace('art-', '');
    sec.querySelectorAll('.pl-obleas').forEach((o) => o.remove());
    if (!sec.classList.contains('pl-art-informe')) {
      resto.push({ num, html: sec.innerHTML });
      return;
    }
    const normas = pop(num, 'normas');
    const just = pop(num, 'just');
    const hechos = pop(num, 'hechos');
    if (!normas || !just || !hechos) return;
    // el primer gráfico de serie temporal larga ocupa el ancho del bloque
    const ANCHOS = new Set([
      'corte-serie', 'corte-real-go', 'deficit', 'utilizacion', 'retenciones',
      'metanol', 'aceite-fas', 'precio-formula', 'demanda-petroleras',
      'asignacion-ventas', 'formulas-precios',
    ]);
    [...hechos.querySelectorAll('.pl-chart[data-chart]')]
      .find((c) => ANCHOS.has(c.dataset.chart))
      ?.classList.add('a3-chart-destacado');
    AJUSTES_DATOS[Number(num)]?.(hechos);
    // HDO 25/08: el texto del respaldo corre siempre en una sola columna
    // (lo resuelve el CSS de .a3-datos-cuerpo > p)
    // "Artículo 3° · Objetivos" → display "3°", rótulo "Objetivos"
    const [cabeza, ...rotulo] = (normas.dataset.titulo || '').split('·');
    laminas.push({
      num,
      display: cabeza.replace(/Artículo\s*/i, '').trim() || num,
      rotulo: rotulo.join('·').trim() || `Artículo ${num}`,
      bajada: bajadas.get(num) || '',
      leyHtml: sec.innerHTML,
      normas: normasDe(normas),
      justHtml: just.innerHTML,
      hechosHtml: hechos.innerHTML,
      conFlujo: !!hechos.querySelector('.pl-flujo'),
    });
  });
  return { laminas, resto };
}

function CabLamina({ eyebrow, display, rotulo, bajada, folio }) {
  return (
    <header className="a3-cab">
      <div className="a3-cab-num">
        <span className="a3-cab-art">{eyebrow}</span>
        <span className="a3-cab-nro">{display}</span>
      </div>
      <div className="a3-cab-tit">
        <h1>{rotulo}</h1>
        {bajada && <p className="a3-cab-baj">{bajada}</p>}
      </div>
      <div className="a3-cab-der">
        <div className="a3-cab-proy">
          Proyecto de Ley S-0809/2026
          <small>Texto con las modificaciones propuestas</small>
        </div>
        <div className="a3-cab-marca">
          <img src="/brand/explorarg-icon.png" alt="" />
          <span><b>EXPLORARG</b> <i>Marketscan</i></span>
        </div>
        <div className="a3-cab-folio">{folio}</div>
      </div>
    </header>
  );
}

function PieLamina() {
  return (
    <footer className="a3-pie">
      <span>
        <b>Fuente:</b> Secretaría de Energía de la Nación · elaboración
        EXPLORARG Marketscan sobre el pipeline del dashboard (corte,
        petroleras y gestiones)
      </span>
      <span>
        Análisis del Proyecto de Ley S-0809/2026 · <b>explorarg</b>
      </span>
    </footer>
  );
}

const LEYENDA = (
  <span className="a3-blq-nota">
    <ins>subrayado en rojo</ins> = texto propuesto sobre la versión oficial
  </span>
);

// HDO 25/08: el cuadro de ventas de gas oil y compras de biodiesel del
// art. 14 muestra sólo estas petroleras
const PETROLERAS_14 = new Set([
  'YPF S.A.',
  'RAIZEN (ex SHELL)',
  'AXION ENERGY ARGENTINA S.A.',
  'TRAFIGURA ARGENTINA S.A.',
  'REFINERÍA DEL NORTE S.A.',
  'PETROLERA DEGAB S.A.',
  'NEW AMERICAN OIL S.A.',
  'REFI PAMPA S.A.',
]);

/* ── derrame a hojas de continuación ─────────────────────────────────── */

// hijos que quedaron fuera del recorte: a la derecha en multicol (columnas
// fantasma), abajo en los apilados y grillas. El límite es el contenedor
// que efectivamente recorta (overflow hidden), no el contenido, que crece.
function excedentesDe(bloque, multicol, limite = bloque) {
  const br = limite.getBoundingClientRect();
  return [...bloque.children].filter((h) => {
    const r = h.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    return multicol
      ? r.right > br.right + 2
      : r.bottom > br.bottom + 3;
  });
}

function crearSlot(cuerpo, oblea, claseOblea, claseCuerpo, claseBlq) {
  const blq = document.createElement('section');
  blq.className = `a3-blq ${claseBlq}`;
  const cab = document.createElement('div');
  cab.className = 'a3-blq-cab';
  const pill = document.createElement('span');
  pill.className = `a3-oblea ${claseOblea}`;
  pill.textContent = oblea;
  cab.append(pill);
  const cont = document.createElement('div');
  cont.className = claseCuerpo;
  blq.append(cab, cont);
  blq.style.display = 'none';
  cuerpo.append(blq);
  return { blq, cont };
}

function crearHojaContinuacion(hoja) {
  const cont = document.createElement('section');
  cont.className = 'a3-lamina a3-continuacion';
  cont.dataset.ajuste = hoja.dataset.ajuste || 'normal';
  const cab = hoja.querySelector('.a3-cab').cloneNode(true);
  const folio = cab.querySelector('.a3-cab-folio');
  if (folio) folio.append(' · continuación');
  cont.append(cab);
  const cuerpo = document.createElement('div');
  cuerpo.className = 'a3-cuerpo';
  cont.append(cuerpo);
  cont.append(hoja.querySelector('.a3-pie').cloneNode(true));
  const marco = document.createElement('div');
  marco.className = 'a3-marco';
  marco.append(cont);
  return { marco, cuerpo };
}

// las piezas marcadas "página propia" cierran el artículo en una hoja
// exclusiva; se extraen antes de medir el derrame normal
function derramarPaginaPropia(hoja) {
  const datos = hoja.querySelector('.a3-datos-cuerpo');
  if (!datos) return null;
  const piezas = [...datos.querySelectorAll(':scope > .a3-pagina-propia')];
  if (!piezas.length) return null;
  const { marco, cuerpo } = crearHojaContinuacion(hoja);
  const slot = crearSlot(cuerpo, 'Respaldo en datos · continuación', 'a3-oblea-datos', 'a3-datos-cuerpo', 'a3-datos');
  const movidos = piezas.map((nodo) => {
    const registro = { nodo, origen: nodo.parentElement, proximo: nodo.nextSibling };
    slot.cont.append(nodo);
    return registro;
  });
  slot.blq.style.display = '';
  cuerpo.style.gridTemplateColumns = '1fr';
  hoja.closest('.a3-marco').after(marco);
  return { marco, movidos };
}

function derramarLamina(hoja) {
  const ley = hoja.querySelector('.a3-ley-texto');
  const just = hoja.querySelector('.a3-just > div, .a3-just-cont');
  const datos = hoja.querySelector('.a3-datos-cuerpo');

  const exLey = ley ? excedentesDe(ley, true) : [];
  const exJust = just
    ? excedentesDe(just, false, just.closest('.a3-analisis'))
    : [];
  // las figuras grandes van siempre al segmento de datos de la
  // continuación (sólo desde la hoja principal: en ella ya llegaron)
  const figuras = hoja.classList.contains('a3-continuacion') || !datos
    ? []
    : [...datos.querySelectorAll(':scope > .a3-figura-grande')];
  const exDatos = datos
    ? [...new Set([
        ...excedentesDe(datos, false, datos.closest('.a3-datos')),
        ...figuras,
      ])]
    : [];
  if (!exLey.length && !exJust.length && !exDatos.length) return null;

  const { marco, cuerpo } = crearHojaContinuacion(hoja);

  const slotLey = crearSlot(cuerpo, 'El artículo · continuación', 'a3-oblea-ley', 'a3-ley-texto', 'a3-ley');
  const slotJust = crearSlot(cuerpo, 'Justificación · continuación', 'a3-oblea-just', 'a3-just-cont', 'a3-analisis');
  const slotDatos = crearSlot(cuerpo, 'Respaldo en datos · continuación', 'a3-oblea-datos', 'a3-datos-cuerpo', 'a3-datos');

  const movidos = [];
  const mover = (nodos, destino) => {
    nodos.forEach((n) => {
      movidos.push({ nodo: n, origen: n.parentElement, proximo: n.nextSibling });
      destino.cont.append(n);
    });
    if (nodos.length) destino.blq.style.display = '';
  };
  mover(exLey, slotLey);
  mover(exJust, slotJust);
  mover(exDatos, slotDatos);

  // el ancho de las franjas activas replica la grilla: la ley conserva su
  // franja; justificación y datos se reparten el resto
  const activas = [];
  if (exLey.length) activas.push('148mm');
  if (exJust.length) activas.push(exDatos.length ? '86mm' : '1fr');
  if (exDatos.length) activas.push('1fr');
  cuerpo.style.gridTemplateColumns = activas.join(' ');

  hoja.closest('.a3-marco').after(marco);
  return { marco, movidos };
}

export default function ImpresoA3() {
  const raizRef = useRef(null);
  const [nodosChart, setNodosChart] = useState([]);
  const { laminas, resto } = useMemo(() => parsearLaminas(contenido), []);

  // Los charts leen la paleta del tema activo: en papel siempre la clara
  const { theme, toggle } = useTheme();
  useEffect(() => {
    if (theme === 'dark') toggle();
  }, [theme, toggle]);

  useEffect(() => {
    setNodosChart([
      ...(raizRef.current?.querySelectorAll('.pl-chart[data-chart]') ?? []),
    ]);
  }, []);

  // Derrame: con los charts ya montados y medidos, lo que excede cada
  // franja fija pasa a una hoja de continuación. Antes de derramar se
  // prueba el ajuste compacto de la hoja (tipografía y gráficos menores).
  const derramado = useRef(false);
  const [remontar, setRemontar] = useState(false);
  useEffect(() => {
    const raiz = raizRef.current;
    if (!raiz || derramado.current || !nodosChart.length) return undefined;
    const insertadas = [];
    const t = setTimeout(() => {
      // el cuadro de demanda por petrolera queda con la lista acordada
      raiz.querySelectorAll('.a3-lamina[data-art="14"] .mh-tabla tbody tr').forEach((tr) => {
        const nombre = tr.querySelector('td')?.textContent.trim();
        if (nombre && !PETROLERAS_14.has(nombre)) tr.remove();
      });
      raiz.querySelectorAll('.a3-lamina[data-art]').forEach((hoja) => {
        const bloques = [
          [hoja.querySelector('.a3-ley-texto'), true, null],
          [hoja.querySelector('.a3-just > div'), false, hoja.querySelector('.a3-analisis')],
          [hoja.querySelector('.a3-datos-cuerpo'), false, hoja.querySelector('.a3-datos')],
        ];
        if (bloques.some(([b, m, lim]) => b && excedentesDe(b, m, lim || b)
          .some((e) => !e.classList.contains('a3-pagina-propia')))) {
          hoja.dataset.ajuste = 'compacta';
        }
        // primero la hoja exclusiva de las piezas "página propia": salen
        // del flujo antes de medir el derrame normal
        const resPropia = derramarPaginaPropia(hoja);
        if (resPropia) insertadas.push(resPropia);
        const res = derramarLamina(hoja);
        if (res) {
          insertadas.push(res);
          // segunda pasada: si la continuación tampoco alcanza, deriva
          // su propio exceso a una hoja más
          const res2 = derramarLamina(res.marco.querySelector('.a3-lamina'));
          if (res2) insertadas.push(res2);
        }
      });
      raiz.dispatchEvent(new Event('a3-derrame'));
      derramado.current = true;
      setRemontar(true);
    }, 500);
    return () => {
      clearTimeout(t);
      // con el derrame ya asentado no hay vuelta atrás: el remonte de los
      // charts re-dispara este efecto y revertir duplicaría/rompería hojas
      if (derramado.current) return;
      insertadas.reverse().forEach(({ marco, movidos }) => {
        movidos.reverse().forEach(({ nodo, origen, proximo }) => {
          origen.insertBefore(nodo, proximo);
        });
        marco.remove();
      });
    };
  }, [nodosChart]);

  // Con la grilla definitiva (derrame incluido) los portals se desmontan y
  // remontan una vez: cada ResponsiveContainer mide su slot final —también
  // los movidos a una continuación— y renderiza estático donde corresponde.
  // Sin esto, el re-medido tardío deja el eje re-acomodado al ancho nuevo
  // con los datos del layout viejo (lo congelaba el printToPDF).
  useEffect(() => {
    if (!remontar) return undefined;
    setNodosChart([]);
    // setTimeout y no requestAnimationFrame: el headless de impresión no
    // produce frames, pero el tiempo virtual sí corre los timers
    const t = setTimeout(() => {
      const raiz = raizRef.current;
      if (raiz) {
        setNodosChart([...raiz.querySelectorAll('.pl-chart[data-chart]')]);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [remontar]);

  // Escala de pantalla: la hoja mide 420mm; se encoge al ancho disponible.
  // En papel manda @page y la transformación se anula por CSS.
  useEffect(() => {
    const raiz = raizRef.current;
    if (!raiz) return undefined;
    const ajustar = () => {
      const hoja = raiz.querySelector('.a3-lamina');
      if (!hoja) return;
      const esc = Math.min(1, raiz.clientWidth / hoja.offsetWidth);
      raiz.style.setProperty('--a3-escala', esc);
      raiz.style.setProperty('--a3-alto', `${hoja.offsetHeight * esc}px`);
    };
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);

  return (
    <main className="impreso-a3" ref={raizRef} lang="es">
      {laminas.map((l) => (
        <div className="a3-marco" key={l.num}>
          <section className="a3-lamina" data-art={l.num}>
            <CabLamina
              eyebrow="Artículo"
              display={l.display}
              rotulo={l.rotulo}
              bajada={l.bajada}
              folio={
                <>Lámina <b>{l.display}</b> · serie de {laminas.length} artículos fundamentados</>
              }
            />
            <div className="a3-cuerpo">
              <section className="a3-blq a3-ley">
                <div className="a3-blq-cab">
                  <span className="a3-oblea a3-oblea-ley">El artículo</span>
                  {LEYENDA}
                </div>
                <div
                  className="a3-ley-texto"
                  dangerouslySetInnerHTML={{ __html: l.leyHtml }}
                />
              </section>
              <div className="a3-analisis">
                <section className="a3-blq a3-normas">
                  <div className="a3-blq-cab">
                    <span className="a3-oblea a3-oblea-normas">
                      Normas que viola el proyecto oficial
                    </span>
                  </div>
                  {l.normas.items ? (
                    <>
                      <p className="a3-normas-intro">{l.normas.intro}</p>
                      <ol className="a3-normas-lista">
                        {l.normas.items.map((item) => (
                          <li key={item.slice(0, 32)}>{item}</li>
                        ))}
                      </ol>
                    </>
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: l.normas.html }} />
                  )}
                </section>
                <section className="a3-blq a3-just">
                  <div className="a3-blq-cab">
                    <span className="a3-oblea a3-oblea-just">
                      Justificación de la modificación
                    </span>
                  </div>
                  <div dangerouslySetInnerHTML={{ __html: l.justHtml }} />
                </section>
              </div>
              <section className="a3-blq a3-datos" data-flujo={l.conFlujo || undefined}>
                <div className="a3-blq-cab">
                  <span className="a3-oblea a3-oblea-datos">Respaldo en datos</span>
                  <span className="a3-blq-nota">pipeline del dashboard EXPLORARG</span>
                </div>
                <div
                  className="a3-datos-cuerpo"
                  dangerouslySetInnerHTML={{ __html: l.hechosHtml }}
                />
              </section>
            </div>
            <PieLamina />
          </section>
        </div>
      ))}

      <div className="a3-marco">
        <section className="a3-lamina a3-lamina-resto">
          <CabLamina
            eyebrow="Articulado"
            display="1–46"
            rotulo="El articulado restante"
            bajada="Artículos del proyecto sin modificaciones fundamentadas por el informe, con el texto propuesto incorporado."
            folio={<>Lámina final · {resto.length} artículos sin modificaciones fundamentadas</>}
          />
          <div className="a3-blq-cab">
            <span className="a3-oblea a3-oblea-ley">Los artículos</span>
            {LEYENDA}
          </div>
          <div className="a3-resto-texto">
            {resto.map((r) => (
              <div
                className="a3-resto-art"
                key={r.num}
                dangerouslySetInnerHTML={{ __html: r.html }}
              />
            ))}
          </div>
          <PieLamina />
        </section>
      </div>

      {nodosChart.map((nodo, i) => {
        const Chart = HECHOS_CHARTS[nodo.dataset.chart];
        return Chart
          ? createPortal(<Chart />, nodo, `${nodo.dataset.chart}-${i}`)
          : null;
      })}
    </main>
  );
}
