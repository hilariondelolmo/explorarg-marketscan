import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import GraficoCorte from './GraficoCorte.jsx';
import DiagramaMercado from './DiagramaMercado.jsx';

/**
 * Esquemas, bloques y flujos de la versión "con esquemas" del artículo
 * "Biodiésel en la Argentina: qué se discute y qué se juega en Diputados".
 * Cada esquema usa solo cifras y frases del artículo (su título es, cuando
 * se puede, una oración literal). Son HTML y CSS (QueSeJuegaDiputados.css,
 * sección "Esquemas"): toman el color del capítulo (--acc / --acc-bg) y
 * respetan el tema oscuro y el celular.
 */

/* ── Piezas comunes ── */

// Marco de un esquema: el título va por fuera del recuadro, como encabezado;
// adentro, en la punta superior derecha, el botón "Leer el texto" abre en un
// pop-up los párrafos del artículo que le corresponden (`texto`): en la
// versión con esquemas el capítulo se lee por los cuadros y el texto queda a
// un toque (pedidos de HDO, 19/10/2026).
export function Esq({ titulo, tituloPopup, nota, texto, children, className = '' }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <figure className={`esq ${className}`}>
      {titulo && <figcaption className="esq-titulo">{titulo}</figcaption>}
      <div className={`esq-caja ${texto ? 'con-boton' : ''}`}>
        {texto && (
          <button type="button" className="esq-leer" onClick={() => setAbierto(true)}>
            Leer el texto
          </button>
        )}
        {children}
        {nota && <p className="esq-nota">{nota}</p>}
      </div>
      {abierto && (
        <TextoPopup titulo={tituloPopup || titulo} onClose={() => setAbierto(false)}>
          {texto}
        </TextoPopup>
      )}
    </figure>
  );
}

// Pop-up con el texto del artículo: se cierra con la cruz, con Escape o
// tocando afuera. Va en un portal sobre <body> (los capítulos tienen
// overflow y encabezados fijos que lo recortarían).
function TextoPopup({ titulo, onClose, children }) {
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', tecla);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = previo;
    };
  }, [onClose]);
  return createPortal(
    <div className="esq-popup" role="dialog" aria-modal="true" aria-label={titulo || 'Texto del artículo'}>
      <div className="esq-popup-fondo" onClick={onClose} />
      <div className="esq-popup-panel">
        <div className="esq-popup-cabecera">
          <span className="esq-popup-kicker">Del artículo</span>
          <button type="button" className="esq-popup-cerrar" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        {titulo && <h3 className="esq-popup-titulo">{titulo}</h3>}
        <div className="esq-popup-texto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Cifras({ items }) {
  return (
    <div className="esq-cifras">
      {items.map((c) => (
        <div className={`esq-cifra ${c.tono ? `tono-${c.tono}` : ''}`} key={c.valor}>
          <span className="esq-cifra-valor">{c.valor}</span>
          <span className="esq-cifra-texto">{c.texto}</span>
        </div>
      ))}
    </div>
  );
}

// Barras horizontales con rótulo a la izquierda y valor a la derecha.
// `desde` dibuja la barra corrida (cascada); `tono`: '', 'suave', 'alerta',
// 'oscuro'; `capa` ({ desde, hasta, tono }) superpone un tramo encima.
export function Barras({ filas, max }) {
  return (
    <div className="esq-barras">
      {filas.map((f) => (
        <div className="esq-barra" key={f.label}>
          <span className="esq-barra-label">{f.label}</span>
          <span className="esq-barra-pista">
            <span
              className={`esq-barra-relleno ${f.tono || ''}`}
              style={{ left: `${((f.desde || 0) / max) * 100}%`, width: `${((f.valor - (f.desde || 0)) / max) * 100}%` }}
            />
            {f.capa && (
              <span
                className={`esq-barra-relleno ${f.capa.tono || ''}`}
                style={{ left: `${((f.capa.desde || 0) / max) * 100}%`, width: `${((f.capa.hasta - (f.capa.desde || 0)) / max) * 100}%` }}
              />
            )}
          </span>
          <span className="esq-barra-valor">{f.texto}</span>
        </div>
      ))}
    </div>
  );
}

function Flujo({ pasos }) {
  return (
    <div className="esq-flujo">
      {pasos.map((p, i) => (
        <div className="esq-flujo-item" key={p.titulo || p.texto}>
          {i > 0 && <span className="esq-flecha" aria-hidden="true">→</span>}
          <div className={`esq-paso ${p.destacado ? 'destacado' : ''}`}>
            {p.titulo && <span className="esq-paso-titulo">{p.titulo}</span>}
            {p.texto}
          </div>
        </div>
      ))}
    </div>
  );
}

function Columnas({ cols }) {
  return (
    <div className="esq-cols">
      {cols.map((c) => (
        <div className={`esq-col ${c.destacada ? 'destacada' : ''}`} key={c.titulo}>
          <h4>{c.titulo}</h4>
          {c.items && (
            <ul>
              {c.items.map((it) => <li key={it}>{it}</li>)}
            </ul>
          )}
          {c.texto && <p>{c.texto}</p>}
        </div>
      ))}
    </div>
  );
}

/* ── 1. El mercado en una página ── */

export function DosNegocios({ texto }) {
  return (
    <Esq titulo="El biodiésel argentino son dos negocios distintos que comparten el nombre." texto={texto}>
      <Columnas
        cols={[
          {
            titulo: 'La exportación: las integradas',
            items: [
              'Seis plantas, propiedad de las grandes aceiteras del Gran Rosario: LDC, Renova, T6, Cargill, COFCO y Patagonia Bioenergía',
              '2,6 millones de toneladas de capacidad',
              'Muelen su propio poroto y venden el biodiésel afuera',
            ],
          },
          {
            titulo: 'El corte obligatorio: las no integradas',
            destacada: true,
            items: [
              '24 plantas en cinco provincias: Santa Fe, Buenos Aires, Entre Ríos, La Pampa y San Luis',
              '1,3 millones de toneladas de capacidad',
              'Le compran el aceite de soja, el 76% de su costo, a las mismas aceiteras que compiten con ellas',
              'Solo pueden vender al corte obligatorio del gas oil',
            ],
          },
        ]}
      />
    </Esq>
  );
}

// Capacidad por grupo económico de las 24 no integradas que vendieron al corte
// entre septiembre de 2025 y agosto de 2026 (capacidad.json y empresas.json,
// Excel maestro de Explora sobre datos de la Secretaría de Energía): suma
// 1.306.000 t, los "1,3 millones" del artículo. Nombres públicos de los grupos:
// Bahía Energía (Bojanich en los datos), Rosario Bio (Pucciariello), Bolzan.
// En verde, lo que cada una puede vender con el tope de 50.000 t por empresa
// del artículo 39 (cada planta de un grupo cuenta por separado); ordenado de
// mayor a menor por eso (HDO, 19/10/2026).
const GRUPOS = [
  ['Grupo Bahía Energía', 348000, 348000, 'ocho sociedades'],
  ['Las otras 7 plantas', 241200, 241200, 'ninguna pasa de 50.000 t'],
  ['Grupo Cremer', 100000, 100000, 'dos plantas'],
  ['Grupo Rosario Bio', 100000, 100000, 'dos plantas'],
  ['Grupo Bolzan', 60800, 60800, 'dos plantas'],
  ['Unitec Bio', 240000, 50000, 'una planta'],
  ['Explora', 120000, 50000, 'una planta'],
  ['Diaser', 96000, 50000, 'una planta'],
];

export function CapacidadPorGrupo({ texto }) {
  const f = (v) => v.toLocaleString('es-AR');
  return (
    <Esq
      titulo="Entre las no integradas hay cuatro grupos económicos con más de una planta."
      texto={texto}
      nota="Capacidad registrada de las 24 no integradas que vendieron al corte entre septiembre de 2025 y agosto de 2026: 1.306.000 t en total. El tope de 50.000 toneladas saca de juego 306.000 toneladas de capacidad de Unitec Bio, Explora y Diaser. Fuente: Secretaría de Energía, elaboración explorarg.com."
    >
      <Barras
        max={348000}
        filas={GRUPOS.map(([label, capacidad, vende, detalle]) => ({
          label,
          valor: capacidad,
          tono: 'suave',
          capa: { hasta: vende, tono: 'verde' },
          texto: vende === capacidad ? `${f(capacidad)} t · puede vender todo · ${detalle}` : `${f(capacidad)} t · puede vender 50.000 · ${detalle}`,
        }))}
      />
      <div className="esq-leyenda">
        <span><i className="esq-muestra verde" /> Lo que puede vender con el tope de 50.000 t por empresa</span>
        <span><i className="esq-muestra suave" /> Capacidad que el tope deja afuera</span>
      </div>
    </Esq>
  );
}

export function EscaleraCorte({ texto }) {
  return (
    <Esq titulo="El corte funciona así." texto={texto}>
      <Flujo
        pasos={[
          { titulo: '13,8 millones de m³', texto: 'de gas oil que el país vende por año' },
          { titulo: 'Cada punto de corte', texto: 'son unas 122.500 toneladas de biodiésel' },
          { titulo: '7,5% de corte', texto: 'son 919.294 toneladas por año', destacado: true },
          { titulo: 'Cupo y precio', texto: 'La Secretaría de Energía asigna cada mes un cupo a cada elaboradora y fija el precio (Res. 963/2023): $ 2.012.598 por tonelada en septiembre de 2026, unos USD 1.336' },
        ]}
      />
    </Esq>
  );
}

export function Mostrador({ titulo, texto }) {
  return (
    <Esq titulo={titulo} texto={texto}>
      <div className="esq-cols">
        <div className="esq-col">
          <h4>Quién compra el biodiésel</h4>
          <Barras
            max={60}
            filas={[
              { label: 'YPF', valor: 60, texto: '60%' },
              { label: 'Raízen', valor: 17, texto: '17%' },
              { label: 'Axion', valor: 16, texto: '16%' },
              { label: 'Trafigura', valor: 6, texto: '6%' },
            ]}
          />
          <p className="esq-pie">Cuatro empresas concentran el 99% del volumen.</p>
        </div>
        <div className="esq-col destacada">
          <h4>Quién lo vende: 25 empresas</h4>
          <Barras
            max={60}
            filas={[
              { label: 'Grupo Bahía Energía', valor: 28, texto: '28% · ocho sociedades' },
              { label: 'Grupo Rosario Bio', valor: 11, texto: '11% · dos plantas' },
              { label: 'Grupo Cremer', valor: 9, texto: '9% · dos plantas' },
              { label: 'Grupo Bolzan', valor: 7, texto: '7% · dos plantas' },
              { label: 'Explora', valor: 6, texto: '6%' },
            ]}
          />
          <p className="esq-pie">Misma escala que la columna de la izquierda.</p>
        </div>
      </div>
    </Esq>
  );
}

// El diagrama del mercado (DiagramaMercado.jsx) en el marco de esquema: su
// título pasa a ser el del esquema, como los demás (HDO, 19/10)
export function DiagramaEsq({ texto }) {
  return (
    <Esq
      titulo="La no integrada compra el aceite al competidor y vende al que tiene el 60%."
      texto={texto}
      nota="Estructura del mercado · cifras de los últimos doce meses, septiembre 2025 a agosto 2026."
    >
      <div className="dip-figura dip-figura-scroll esq-grafico"><DiagramaMercado sinTitulo /></div>
    </Esq>
  );
}

/* ── 2. Cómo llegamos hasta acá ── */

// Hitos de la línea de tiempo. Los de 2008-2009, 2013-2017 y la nota del
// techo por resolución los dictó HDO el 19/10/2026 (no están en el Word del
// 13/10). Fechas de capacidad.json y empresas.json: Unitec Bio 161.096 t en
// 2008 y 240.000 t desde 2009; Explora 120.000 t desde enero de 2009 (primera
// producción en diciembre de 2008); las plantas de 50.000 t del Grupo Bahía
// Energía (Bojanich en los datos) venden al corte desde 2013 (Biobahía), 2014
// (Bio Ramallo, Biobin) y 2017 (Biobal Energy, Biocorba, Refinar Bio); en
// Ramallo están esas tres de 2017 más Bio Ramallo, cuatro de 50.000 t, y
// Colalao del Valle (18.000 t). Rosario Bio: 2010 y 2013; Cremer: 2012 y
// 2014; Bolzan: 2013. Ley Bases: 144 a 109 el 2/2/2024 (sección "Qué debería
// corregir Diputados" del artículo).
const HITOS = [
  ['2006', 'La Ley 26.093 crea el régimen de promoción. No limita la capacidad de producción de ninguna planta.'],
  ['2008 y 2009', 'Unitec Bio y Explora se ponen en marcha. Construyen sus plantas para el mercado local, de 240.000 y 120.000 toneladas, sin ninguna restricción: la ley no la tenía.', true],
  ['mar 2010', 'Empieza a regir el corte: 5%, que sube a 7% ese mismo año.', true],
  ['2010 y 2012', 'Resoluciones 1674/2010 y 56/2012 de la Secretaría de Energía: el corte queda reservado a las elaboradoras que no exportan, con un techo de 50.000 t por año. Ese techo no estaba en la ley: lo puso una resolución. Desde entonces, por más de quince años, deja afuera la capacidad que Unitec Bio y Explora habían construido.', true],
  ['2013', 'La Unión Europea aplica derechos antidumping al biodiésel argentino.'],
  ['2013 a 2017', 'Proliferan los grupos económicos que, para evadir el techo de 50.000 toneladas, arman dos o más sociedades con una planta de hasta 50.000 t cada una: Grupo Rosario Bio, Grupo Cremer, Grupo Bolzan y el Grupo Bahía Energía, que llega a ocho sociedades. Cuatro de ellas, de 50.000 t cada una, están en Ramallo: 200.000 t que la ley cuenta como cuatro empresas, mientras Unitec Bio, con una sola planta de 240.000 t, y Explora, con una de 120.000 t, quedan en 50.000.', true],
  ['2014', 'El corte sube a 10%.', true],
  ['2017', 'Estados Unidos cierra su mercado con derechos de más del 130%.'],
  ['2019', 'La Unión Europea acepta un compromiso de precio mínimo con un cupo de 1,2 millones de t sin arancel, firmado solo por las integradas.'],
  ['2021', 'La Ley 27.640 reemplaza el régimen de promoción: el corte baja de 10% a 5%, con un piso de 3%; el del bioetanol queda en 12%. Mantiene la reserva del corte para las que no exportan, la prorrata por capacidad y el techo de 50.000 t.', true],
  ['nov 2023', 'La Secretaría dicta la Resolución 963/2023, con el artículo 5 que la autoriza a apartarse de su propia fórmula.'],
  ['dic 2023', 'El capítulo de biocombustibles del DNU 70/2023 se retira antes de la firma.'],
  ['2 feb 2024', 'Diputados aprueba el capítulo de biocombustibles de la Ley Bases por 144 votos a 109, con subastas obligatorias y un mismo tope del 14% por empresa o por grupo.', true],
  ['oct 2025', 'Propuesta de la propia Secretaría: la participación de las no integradas bajaba del 7,5% al 2%.'],
  ['nov 2025', 'La Secretaría baja el corte de 7,5% a 7% por la suba del aceite.'],
  ['ene 2026', 'El corte vuelve a 7,5%.'],
  ['may 2026', 'Ingresa al Senado el proyecto S-809/26 de la senadora Bullrich.', true],
  ['3 sep 2026', 'Dictamen de comisiones.'],
  ['17 sep 2026', 'Media sanción del Senado, por 41 votos a 25.', true],
  ['hoy', 'El expediente está en Diputados, sin dictamen.', true],
];

// Eje en el medio, los hitos alternan a izquierda y derecha, letra grande
// (HDO, 19/10: "el timeline es lo importante"). En celular, eje a la izquierda.
export function LineaTiempo({ texto }) {
  return (
    <Esq titulo="El reparto en dos compartimentos no lo inventó la ley que hoy está en Diputados: tiene veinte años." texto={texto}>
      <ol className="esq-tiempo-doble">
        {HITOS.map(([anio, t, hito], i) => (
          <li key={t} className={`${i % 2 ? 'der' : 'izq'} ${hito ? 'hito' : ''}`}>
            <span className="esq-tiempo-anio">{anio}</span>
            <span className="esq-tiempo-texto">{t}</span>
          </li>
        ))}
      </ol>
    </Esq>
  );
}

const PRESIDENCIAS = [
  ['Cristina Fernández', 'ene 2010 a nov 2015', '7,8%', '7,2%', 92, '95.000 t'],
  ['Mauricio Macri', 'dic 2015 a nov 2019', '10,0%', '9,4%', 94, '91.000 t'],
  ['Alberto Fernández', 'dic 2019 a nov 2023', '7,5%', '4,9%', 65, '311.000 t'],
  ['Javier Milei', 'dic 2023 a ago 2026', '7,5%', '6,2%', 83, '151.000 t'],
];

export function Presidencias({ texto }) {
  return (
    <Esq titulo="El problema atraviesa cuatro presidencias y dos leyes." texto={texto} nota="Cumplimiento = corte real sobre corte obligatorio. Faltante por año: biodiésel que la ley mandaba mezclar y no se mezcló.">
      <div className="esq-tarjetas">
        {PRESIDENCIAS.map(([nombre, periodo, oblig, real, cumpl, faltante]) => (
          <div className="esq-tarjeta" key={nombre}>
            <span className="esq-tarjeta-k">{periodo}</span>
            <b>{nombre}</b>
            <p className="esq-tarjeta-linea">Corte obligatorio {oblig} · corte real {real}</p>
            <span className="esq-barra-pista esq-medidor">
              <span className={`esq-barra-relleno ${cumpl < 80 ? 'alerta' : ''}`} style={{ width: `${cumpl}%` }} />
            </span>
            <p className="esq-tarjeta-linea"><b>Cumplimiento {cumpl}%</b> · faltante por año {faltante}</p>
          </div>
        ))}
      </div>
    </Esq>
  );
}

export function CifrasHistoria({ texto }) {
  return (
    <Esq titulo="Dos cifras de la historia" texto={texto}>
      <Cifras
        items={[
          { valor: 'USD 2.040 millones', texto: 'el diferencial de retenciones entre el aceite y el biodiésel, transferido a las integradas' },
          { valor: '23 meses', texto: 'en los que la Secretaría usó el artículo 5 de la Res. 963/2023 entre enero de 2024 y noviembre de 2025: precio 5% debajo de la fórmula en promedio, hasta 18%; unos USD 115 millones sobre el cupo asignado' },
        ]}
      />
    </Esq>
  );
}

// El gráfico del corte por año (GraficoCorte.jsx) en el marco de esquema, con
// el texto del artículo en el pop-up
export function GraficoCumplimiento({ texto }) {
  return (
    <Esq
      titulo="El corte se cumplió en tres de dieciséis años."
      tituloPopup="El dato que ordena toda la historia es el cumplimiento del corte."
      texto={texto}
      nota="Secretaría de Energía, elaboración explorarg.com · años 2010 a 2026 (2026 hasta agosto). La línea gris es lo que la ley mandó cada año y la azul lo que se mezcló; el área entre las dos es el biodiésel que faltó. El hueco más grande es 2020, con la mitad del corte sin cumplir, y el segundo es 2023."
    >
      <div className="dip-figura dip-figura-scroll esq-grafico"><GraficoCorte sinTitulo /></div>
    </Esq>
  );
}

/* ── 3. Los números de hoy ── */

export function Embudo({ texto }) {
  return (
    <Esq titulo="En ese período el corte real fue 6,18% contra un obligatorio de 7,41%: faltaron 152.791 toneladas." texto={texto}>
      <Barras
        max={7.41}
        filas={[
          { label: 'Corte obligatorio', valor: 7.41, texto: '7,41%', tono: 'suave' },
          { label: 'Corte real', valor: 6.18, texto: '6,18% · cumplimiento 83%' },
          { label: 'Faltó mezclar', valor: 7.41, desde: 6.18, texto: '152.791 t', tono: 'alerta' },
        ]}
      />
      <p className="esq-pie">Cupo asignado a las elaboradoras: 859.489 t. Vendido al corte: 756.763 t, el 88% del cupo.</p>
    </Esq>
  );
}

export function PrecioCapas() {
  return (
    <Esq titulo="Precio del biodiésel para el corte, septiembre de 2026: USD 1.336 por tonelada" nota="Margen biodiésel menos aceite: USD 400 por tonelada; promedio desde 2010, USD 325.">
      <div className="esq-apilada" role="img" aria-label="Aceite de soja 936 dólares, el 70% del precio; margen 400 dólares">
        <span style={{ width: '70%' }}>Aceite de soja FAS · USD 936 · 70%</span>
        <span className="suave" style={{ width: '30%' }}>Margen · USD 400</span>
      </div>
    </Esq>
  );
}

export function Tanques() {
  return (
    <Esq titulo="Las no integradas trabajaron al 55% de su capacidad y las integradas exportaron la cuarta parte de lo que exportaban en 2022.">
      <div className="esq-cols">
        <div className="esq-col destacada">
          <h4>No integradas</h4>
          <div className="esq-tanque" role="img" aria-label="Capacidad usada 55%">
            <span className="esq-tanque-nivel" style={{ height: '55%' }} />
            <span className="esq-tanque-texto">55%</span>
          </div>
          <p>Producción 721.006 t sobre 1.295.200 t de capacidad.</p>
        </div>
        <div className="esq-col">
          <h4>Integradas</h4>
          <div className="esq-tanque" role="img" aria-label="Capacidad usada 14%; en 2022 exportaron 968.486 toneladas">
            <span className="esq-tanque-marca" style={{ bottom: '37%' }}><i>2022: 968.486 t exportadas</i></span>
            <span className="esq-tanque-nivel" style={{ height: '14%' }} />
            <span className="esq-tanque-texto">14%</span>
          </div>
          <p>Usan el 14% de sus 2,6 millones de toneladas. Exportación de los últimos doce meses: 238.910 t.</p>
        </div>
      </div>
    </Esq>
  );
}

export function Prorrata() {
  return (
    <Esq titulo="El cupo se reparte por igual, 43.695 toneladas en doce meses para casi todas las plantas, sea de 50.000 o de 240.000 toneladas de capacidad." nota="La barra clara es la capacidad de la planta; la oscura, el cupo que recibió en doce meses.">
      <Barras
        max={240000}
        filas={[
          { label: 'Planta de 50.000 t', valor: 50000, texto: 'cupo 43.695 t', tono: 'suave', capa: { hasta: 43695 } },
          { label: 'Explora, 120.000 t', valor: 120000, texto: 'cupo 43.695 t', tono: 'suave', capa: { hasta: 43695 } },
          { label: 'Unitec Bio, 240.000 t', valor: 240000, texto: 'cupo 43.695 t', tono: 'suave', capa: { hasta: 43695 } },
        ]}
      />
    </Esq>
  );
}

/* ── 4. La media sanción ── */

export function CambioRegimen({ texto }) {
  return (
    <Esq titulo="Reemplaza el reparto del Estado por un reparto con topes, y el precio del Estado por el precio del comprador." texto={texto}>
      <Flujo
        pasos={[
          { titulo: 'Hoy, con la Ley 27.640', texto: 'La Secretaría de Energía asigna cada mes un cupo a cada elaboradora y fija el precio con la fórmula de la Resolución 963/2023.' },
          { titulo: 'Con la media sanción', texto: 'Mercado electrónico con subastas que no son obligatorias, contratos a término y negociaciones entre privados (el "acuerdo mutuo" del artículo 14), con un techo en la paridad de importación. El corte sube de 7,5% a 10% a los doce meses y es todo biodiésel: el coprocesado de las refinerías queda afuera.', destacado: true },
        ]}
      />
    </Esq>
  );
}

const TRANSICION = [
  ['Primer año', 7.5, 0],
  ['Hasta 2028', 6.5, 3.5],
  ['2029', 5.5, 4.5],
  ['2030', 5, 5],
  ['2031 a 2035', 4, 6],
  ['Desde 2036', 0, 10],
];

export function Transicion({ texto }) {
  const f = (v) => v.toLocaleString('es-AR', { maximumFractionDigits: 1 });
  return (
    <Esq texto={texto} titulo="Una transición hasta el 1 de enero de 2036 en la que una parte del corte se reserva a las no integradas. Después, nada." nota="En color, el segmento reservado a las no integradas; en gris, lo que va al total del mercado (integradas incluidas). Porcentajes del gas oil.">
      <div className="esq-apiladas">
        {TRANSICION.map(([periodo, ni, total]) => (
          <div className="esq-apilada-fila" key={periodo}>
            <span className="esq-barra-label">{periodo}</span>
            <div className="esq-apilada" style={{ width: `${((ni + total) / 10) * 100}%` }}>
              {ni > 0 && <span style={{ width: `${(ni / (ni + total)) * 100}%` }}>{f(ni)}%</span>}
              {total > 0 && <span className="suave" style={{ width: `${(total / (ni + total)) * 100}%` }}>{f(total)}%</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="esq-leyenda">
        <span><i className="esq-muestra" /> Segmento no integrado</span>
        <span><i className="esq-muestra suave" /> Total del mercado</span>
      </div>
    </Esq>
  );
}

// Las definiciones del artículo 36 son las del texto legal: el inciso vii) y viii)
// del S-809/26 (cómo entró) y el texto del recinto (cómo salió), dictadas por HDO
// el 19/10/2026 junto con su comentario.
const DEF_ACEITERA = 'un ente individual y/o grupo económico tenedor, entre sus activos, de una o más fábricas de aceites vegetales y harinas proteicas';
const ENTRO_SALIO = [
  {
    art: 'Artículo 36 a) y b)',
    entro: (
      <>
        <span className="esq-def"><b>Empresas integradas:</b> aquellas productoras de biodiésel que forman parte de {DEF_ACEITERA}.</span>
        <span className="esq-def"><b>Empresas no integradas:</b> aquellas productoras de biodiésel que no forman parte de {DEF_ACEITERA}.</span>
      </>
    ),
    salio: (
      <>
        <span className="esq-def"><b>Integrada:</b> productor de biodiésel de más de 50.000 toneladas que forma parte de {DEF_ACEITERA}.</span>
        <span className="esq-def"><b>No integrada:</b> productor de biodiésel de hasta 50.000 toneladas, o que no forma parte de {DEF_ACEITERA}.</span>
      </>
    ),
    juega: 'Juega para Enresa y Pampa Bio, que pertenecen a grupos aceiteros, y para las integradas, que pueden comprar elaboradoras de 50.000 toneladas y entrar en el segmento no integrado.',
    comentario: 'La definición de integrada pasa por la capacidad de producción del producto y no por la propiedad de la materia prima en origen. Si se quisiera restringir, habría que hacerlo por una determinada capacidad de producción de la materia prima, no del producto. Así no haría falta un Frankenstein para que dos compañías que son integradas, que lo fueron siempre y a las que incorrectamente se les asignó cupo, sigan ahora al resguardo de la ley.',
  },
  {
    art: 'Artículo 38',
    entro: 'No integradas 7,5 / 5 / 4 / 3%; coprocesado en la tabla',
    salio: 'No integradas 7,5 / 6,5 / 5,5 / 5 / 4%; total mercado 0 / 3,5 / 4,5 / 5 / 6%',
    juega: 'Juega para las no integradas, en el papel',
  },
  {
    art: 'Artículo 39',
    entro: 'Tope 14% por empresa y por grupo; regiones "podrá"',
    salio: '10% con máximo de 50.000 t por empresa; 10% por grupo; regiones "deberá", 20%',
    juega: 'Juega para los grupos económicos y para las integradas.',
    nota: 'El tope se construyó sobre una presentación de CEPREB sobre las distancias al puerto, demostrada incorrecta con los números presentados por la Secretaría de Energía.',
  },
];

export function EntroSalio({ texto }) {
  return (
    <Esq titulo="Los tres que más pesan, el 36, el 38 y el 39, se leyeron en el recinto y se aceptaron sin que nadie explicara por qué." texto={texto}>
      <div className="esq-entro-salio">
        {ENTRO_SALIO.map(({ art, entro, salio, juega, nota, comentario }) => (
          <div className="esq-entro-salio-fila" key={art}>
            <span className="esq-tarjeta-k">{art}</span>
            <Flujo
              pasos={[
                { titulo: 'Cómo entró (mayo)', texto: entro },
                { titulo: 'Cómo salió (17 de septiembre)', texto: salio, destacado: true },
              ]}
            />
            <p className="esq-juega">{juega}</p>
            {nota && <p className="esq-comentario">{nota}</p>}
            {comentario && <p className="esq-comentario"><b>Comentario:</b> {comentario}</p>}
          </div>
        ))}
      </div>
    </Esq>
  );
}

export function Votacion({ texto }) {
  return (
    <Esq texto={texto} className="esq-votacion">
      <Cifras items={[{ valor: '41 a 25', texto: 'votos con los que el Senado aprobó el nuevo marco regulatorio el 17 de septiembre de 2026' }]} />
      <p className="esq-pie">
        <Link to="/mapa-recinto?votacion=17-9">Ver la votación, senador por senador, en el Mapa del recinto</Link>
      </p>
    </Esq>
  );
}

/* ── 5. Falla 1: el mandato que no se puede cumplir ── */

const MANDA_PERMITE = [
  ['Primer año, 7,5%', 919294, 730988, '188.306 t (20%)', '6,0%'],
  ['Hasta 2028, 6,5%', 796721, 694216, '102.505 t (13%)', '5,7%'],
  ['2029, 5,5%', 674149, 657445, '16.704 t (2%)', '5,4%'],
];

export function MandaPermite({ texto }) {
  return (
    <Esq texto={texto} titulo="La ley manda 7,5% y la misma ley permite 6,0%." nota="La barra gris es lo que manda el artículo 38; la de color, lo que permiten los topes del artículo 39; en rojo, el faltante.">
      {MANDA_PERMITE.map(([periodo, manda, permite, faltante, posible]) => (
        <div className="esq-bloque" key={periodo}>
          <p className="esq-bloque-titulo">{periodo} <span>· corte posible {posible}</span></p>
          <Barras
            max={919294}
            filas={[
              { label: 'Manda el art. 38', valor: manda, texto: `${manda.toLocaleString('es-AR')} t`, tono: 'suave' },
              { label: 'Permiten los topes', valor: permite, texto: `${permite.toLocaleString('es-AR')} t` },
              { label: 'Faltante', valor: manda, desde: permite, texto: faltante, tono: 'alerta' },
            ]}
          />
        </div>
      ))}
    </Esq>
  );
}

export function CascadaCapacidad({ texto }) {
  return (
    <Esq texto={texto} titulo="La capacidad sobra, lo que falta es permiso para usarla." nota="Cifras del primer año. 1.327.200 t de capacidad son 408.000 más que lo que exige el segmento.">
      <Barras
        max={1327200}
        filas={[
          { label: 'Capacidad no integrada', valor: 1327200, texto: '1.327.200 t', tono: 'suave' },
          { label: 'Tope de 50.000 t por empresa', valor: 1327200, desde: 1021200, texto: '−306.000 t · Unitec Bio, Explora y Diaser', tono: 'alerta' },
          { label: 'Tope por grupo', valor: 1021200, desde: 731200, texto: '−290.000 t · casi todas del Grupo Bahía Energía', tono: 'alerta' },
          { label: 'Lo que los topes permiten', valor: 730988, texto: '730.988 t' },
          { label: 'Lo que exige el segmento', valor: 919294, texto: '919.294 t', tono: 'suave' },
        ]}
      />
    </Esq>
  );
}

export function EscaleraParidad({ texto }) {
  return (
    <Esq texto={texto} titulo="Cuando la demanda es obligatoria y la oferta tiene techo, el precio sube hasta el techo que la propia ley fija: la paridad de importación." nota="Puesta en La Plata, septiembre de 2026, dólares por tonelada. Cuál de las tres rige no lo dice la ley: lo define una metodología que el artículo 16 deja abierta.">
      <Barras
        max={2066}
        filas={[
          { label: 'Precio local', valor: 1328, texto: 'USD 1.328', tono: 'suave' },
          { label: 'Paridad de Brasil', valor: 1431, texto: 'USD 1.431 · 7,8% más' },
          { label: 'Paridad del Golfo de EE.UU.', valor: 1539, texto: 'USD 1.539 · 16% más' },
          { label: 'Paridad de Europa', valor: 2066, texto: 'USD 2.066 · 56% más', tono: 'alerta' },
        ]}
      />
    </Esq>
  );
}

export function FlujoPrecio({ texto }) {
  return (
    <Esq texto={texto} titulo="¿Adónde va el faltante?">
      <Flujo
        pasos={[
          { titulo: 'Demanda obligatoria', texto: 'El corte que la ley manda mezclar.' },
          { titulo: 'Oferta con techo', texto: 'Los topes del artículo 39. El faltante "podrá" pasar a las integradas, que hoy usan el 14% de su capacidad, o a la importación.' },
          { titulo: 'El precio sube hasta el techo', texto: 'La paridad de importación que la propia ley fija.', destacado: true },
          { titulo: 'Quién paga, quién cobra', texto: 'La diferencia la paga el consumidor y la cobra el dueño del aceite.', destacado: true },
        ]}
      />
    </Esq>
  );
}

/* ── 6. Falla 2: integrada por tamaño ── */

export function AntesDespues({ texto }) {
  return (
    <Esq texto={texto} titulo="Desde 2010 la condición de integrada se definió por una sola cosa: tener o no la materia prima.">
      <Flujo
        pasos={[
          { titulo: 'Ley 27.640, artículo 11', texto: 'Fuera del corte las elaboradoras vinculadas, directa o indirectamente, con la exportación de biodiésel o de sus insumos principales.' },
          { titulo: 'S-809 de mayo y dictamen del 3 de septiembre', texto: 'Integrada es la que forma parte de un grupo con fábrica de aceite.' },
          { titulo: 'Recinto, artículo 36', texto: 'Integrada es la que tiene más de 50.000 toneladas y aceitera, las dos cosas a la vez.', destacado: true },
        ]}
      />
    </Esq>
  );
}

export function MatrizIntegrada({ texto }) {
  return (
    <Esq texto={texto} titulo="Integrada es la que tiene más de 50.000 toneladas y aceitera, las dos cosas a la vez. No integrada es la que cumple al menos una.">
      <div className="esq-matriz" role="table">
        <span />
        <span className="cab">Más de 50.000 t</span>
        <span className="cab">50.000 t o menos</span>
        <span className="fila">Tiene aceitera</span>
        <div className="celda integrada"><b>Integrada</b>Las seis exportadoras del Gran Rosario: LDC, Renova, T6, Cargill, COFCO y Patagonia Bioenergía.</div>
        <div className="celda"><b>"No integrada"</b>Enresa (Catriló, 50.000 t) y Pampa Bio (General Pico, 50.000 t): entran al segmento reservado con aceite propio.</div>
        <span className="fila">No tiene aceitera</span>
        <div className="celda"><b>No integrada, con tope de 50.000 t</b>Unitec Bio (240.000 t), Explora (120.000 t) y Diaser (96.000 t), sin una gota de aceite propio.</div>
        <div className="celda"><b>No integrada</b>Las demás plantas, que compran todo su aceite.</div>
      </div>
    </Esq>
  );
}

export function Contradicciones({ texto }) {
  return (
    <Esq texto={texto} titulo="Tres contradicciones.">
      <div className="esq-tarjetas">
        {[
          'Una planta de 50.000 toneladas de una aceitera exportadora es "no integrada"; Explora, con 120.000 toneladas y sin una gota de aceite propio, queda con el mismo tope de 50.000.',
          'Si Explora instalara una fábrica de aceite pasaría a integrada; si una aceitera compra una planta de biodiésel de 50.000 toneladas, no.',
          'Cualquier aceitera, incluidas las seis integradas de hoy, puede comprar plantas de hasta 50.000 toneladas, que siguen siendo no integradas.',
        ].map((t, i) => (
          <div className="esq-tarjeta" key={t}>
            <span className="esq-tarjeta-k">{['Una', 'Dos', 'Tres'][i]}</span>
            {t}
          </div>
        ))}
      </div>
    </Esq>
  );
}

export function Catorce({ texto }) {
  return (
    <Esq texto={texto} titulo="Hay catorce de exactamente ese tamaño. Con tres, un grupo ya supera el tope." nota="El segmento reservado a las que no tienen aceite puede terminar en manos de las que lo tienen.">
      <div className="esq-grilla">
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} className={i < 3 ? 'marcada' : ''}>50.000 t</span>
        ))}
      </div>
    </Esq>
  );
}

/* ── 7. Falla 3: reparto en lugar de competencia ── */

export function Balanza({ texto }) {
  return (
    <Esq texto={texto} titulo="Topes de un solo lado.">
      <Columnas
        cols={[
          { titulo: 'No integradas', destacada: true, items: ['Tope por empresa: 10%, con un máximo de 50.000 toneladas', 'Tope por grupo: 10%'] },
          { titulo: 'Integradas', texto: 'Ninguno.' },
          { titulo: 'Mezcladores', texto: 'Ninguno.' },
        ]}
      />
    </Esq>
  );
}

export function DosVaras({ texto }) {
  return (
    <Esq texto={texto} titulo="Dos varas para el mismo problema.">
      <Columnas
        cols={[
          { titulo: 'Bioetanol de caña y de maíz', items: ['Reserva de 6% y 6%', 'Permanente, porque protege inversiones regionales', 'El productor de caña no le compra el insumo a su competidor'] },
          { titulo: 'Biodiésel no integrado', destacada: true, items: ['Protege 24 plantas en cinco provincias', 'Se extingue en 2036', 'La no integrada le compra el 76% de su costo a su competidor'] },
        ]}
      />
    </Esq>
  );
}

// Los cinco puntos del artículo ("Y el reparto está escrito en las reglas"),
// literales, en tarjetas: `reglas` = [[título en negrita, texto], ...]
export function ReglasReparto({ reglas, texto }) {
  return (
    <Esq titulo="Y el reparto está escrito en las reglas." texto={texto}>
      <div className="esq-tarjetas">
        {reglas.map(([t, cuerpo]) => (
          <div className="esq-tarjeta" key={t}>
            <b>{t}</b> {cuerpo}
          </div>
        ))}
      </div>
    </Esq>
  );
}

export function CitaGonzalez({ texto }) {
  return (
    <Esq titulo="Una ley que elige a los ganadores antes de que se juegue no es una ley de competencia." texto={texto}>
      <blockquote className="esq-cita">
        <p>"Entendemos que esto es sumamente difícil, que hay ganadores y perdedores."</p>
        <footer>Daniel González, secretario de Energía, ante las comisiones del Senado, 3 de junio de 2026</footer>
      </blockquote>
    </Esq>
  );
}

/* ── 8. Qué debería corregir Diputados ── */

export function DiceDebeDecir({ filas, texto }) {
  return (
    <Esq texto={texto} titulo="Con ocho cambios en cinco artículos, más dos de resguardo, la media sanción pasa de repartir a hacer competir.">
      <div className="esq-tarjetas esq-tarjetas-anchas">
        {filas.map(([art, dice, debe]) => (
          <div className="esq-tarjeta" key={art}>
            <span className="esq-tarjeta-k">Artículo {art}</span>
            <p className="esq-tarjeta-linea"><b>Dice:</b> {dice}</p>
            <p className="esq-tarjeta-linea esq-debe"><b>Debe decir:</b> {debe}</p>
          </div>
        ))}
      </div>
    </Esq>
  );
}

// La misma cuenta con los topes tal como salieron del Senado (art. 39: 10% por
// empresa con máximo de 50.000 t y 10% por grupo, sobre lo que exige el
// segmento). Años 1 a 3: las cifras del artículo (planilla Art 39 rev.1);
// años 4 y 5 en adelante, mismo método (mín(capacidad, tope) por planta y por
// grupo): 2030, segmento 5% = 612.863 t, permiten 639.059 (+4,3%); 2031 a
// 2035, segmento 4% = 490.290 t, permiten 584.690 (+19,3%).
export function CuentaMediaSancion({ texto }) {
  return (
    <Esq
      texto={texto}
      titulo="Con los topes de la media sanción, la cuenta no cierra los tres primeros años."
      nota="Topes del artículo 39 tal como salió del Senado: 10% por empresa con un máximo de 50.000 toneladas y 10% por grupo, sobre lo que exige el segmento no integrado. Del cuarto año en adelante el segmento baja a 5% y a 4% y la cuenta pasa a sobrar. Planilla Art 39 rev.1."
    >
      <Barras
        max={919294}
        filas={[
          { label: 'Exige el segmento, primer año', valor: 919294, texto: '919.294 t', tono: 'suave' },
          { label: 'Permiten los topes', valor: 730988, texto: '730.988 t' },
          { label: 'Faltante', valor: 919294, desde: 730988, texto: '188.306 t, el 20%', tono: 'alerta' },
        ]}
      />
      <Cifras
        items={[
          { valor: '-20%', texto: 'falta en el primer año: 188.306 t', tono: 'rojo' },
          { valor: '-13%', texto: 'falta en el segundo: 102.505 t', tono: 'rojo' },
          { valor: '-2%', texto: 'falta en el tercero (2029): 16.704 t', tono: 'rojo' },
          { valor: '+4,3%', texto: 'sobra en el cuarto (2030), con el segmento en 5%: menos que con la propuesta', tono: 'amarillo' },
          { valor: '+19%', texto: 'sobra de 2031 a 2035, con el segmento fijo en 4%', tono: 'verde' },
        ]}
      />
    </Esq>
  );
}

export function CuentaCierra({ texto }) {
  return (
    <Esq texto={texto} titulo="Con las modificaciones propuestas, la cuenta cierra todos los años." nota="Con 12%, 10,5% y 9,5% sin las 50.000 toneladas (planilla Art 39 rev.1; con 11,5% el primer año faltaban 937 t). Del cuarto año en adelante el segmento baja y el tope del 9,5% queda fijo, así que la sobra crece. Dentro de la oferta, en color más oscuro, las 100.000 toneladas de Enresa y Pampa Bio: sin ellas la cuenta no cierra ningún año.">
      <Barras
        max={932146}
        filas={[
          { label: 'Exige el segmento, primer año', valor: 919294, texto: '919.294 t', tono: 'suave' },
          { label: 'Pueden ofrecer las no integradas', valor: 932146, texto: '932.146 t · sobran 12.852 t, el 1,4%', capa: { desde: 832146, hasta: 932146, tono: 'oscuro' } },
        ]}
      />
      <Cifras
        items={[
          { valor: '+1,4%', texto: 'sobra en el primer año, con el tope de 12%', tono: 'verde' },
          { valor: '+1,3%', texto: 'sobra en el segundo año, con 10,5%', tono: 'verde' },
          { valor: '+2,2%', texto: 'sobra en el tercero (2029), con 9,5%', tono: 'verde' },
          { valor: '+6,4%', texto: 'sobra en el cuarto (2030), con el segmento en 5% y el tope en 9,5%', tono: 'verde' },
          { valor: '+14%', texto: 'sobra de 2031 a 2035, con el segmento fijo en 4% y el tope en 9,5%', tono: 'verde' },
        ]}
      />
    </Esq>
  );
}

export function LeyBases({ texto }) {
  return (
    <Esq texto={texto} titulo="Diputados ya votó algo parecido.">
      <Cifras items={[{ valor: '144 a 109', texto: 'votos con los que Diputados aprobó el 2 de febrero de 2024 el capítulo de biocombustibles de la Ley Bases, que tenía un mismo tope del 14% por empresa o por grupo' }]} />
    </Esq>
  );
}
