import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fmt } from '../../lib/format.js';
import datos from '../../data/situacion_2026_11_19.json';

/**
 * Edición del 19/11/2026 de "Situación al ...": los dos artículos de HDO de ese día
 * ("La situación del Biodiesel explicada en una carilla", rev. 3, y "Biodiesel: el arte de recibir
 * volumen sin competir, más vivo que nunca.", rev. 3, el de dos carillas) y los cortos de la
 * playlist "Lo que se negocia en Diputados": los dos de ese día y el tercero ("¿Quién gana con el
 * acuerdo que se negocia en Diputados?"), publicado y sumado acá el 26/11/2026 por pedido de HDO.
 *
 * El texto es el de HDO. Sobre sus Word, por decisión suya del 19/11/2026: se corrigieron las
 * erratas, la frase de la competencia quedó como en la carilla ("precio por oferta y demanda...")
 * y salió del pie la remisión al "artículo completo". Los PDF de public/docs/ llevan lo mismo.
 *
 * Las cifras de las piezas interactivas salen de src/data/situacion_2026_11_19.json
 * (python3 scripts/situacion_json.py), las mismas cuentas del artículo.
 */
const t = (v) => `${fmt.int(v)} t`;
const pct = (v, d = 1) => `${v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
const signo = (v) => `${v > 0 ? '+' : v < 0 ? '-' : ''}${fmt.int(Math.abs(v))} t`;

const TITULO = 'Biodiesel: el arte de recibir volumen sin competir, más vivo que nunca.';
const BAJADA =
  'La ley de biocombustibles llegó a Diputados envuelta en la palabra competencia. Mirada sector por sector, lo que cada uno pide produce otra cosa que lo que dice. Y el costo vuelve a caer, como desde 2010, sobre las mismas tres empresas: Unitec Bio, Explora y Diaser, a las que la ley les prohíbe competir por el 10% del mercado que les permite a los demás.';

const PLAYLIST = 'PLK5x1TuYMFRU';
const VIDEOS = [
  {
    youtube: '1bOKbuCgEeE', duracion: '2:33', poster: '/situacion/2026-11-19-video-tope.jpg',
    titulo: 'Sin eliminar el tope de 50.000 t, la ley de biocombustibles será declarada inconstitucional',
  },
  {
    youtube: 'zSlNoewlBUE', duracion: '1:54', poster: '/situacion/2026-11-19-video-bojanich.jpg',
    titulo: 'En el mejor de los casos para las pymes, Bojanich vende 270.000 t sin competir',
  },
  {
    youtube: '1uGekOGZ_ps', duracion: '2:47', poster: '/situacion/2026-11-26-video-acuerdo.jpg',
    titulo: '¿Quién gana con el acuerdo que se negocia en Diputados?',
  },
];

const DOCS = [
  { href: '/docs/situacion-2026-11-19-en-una-carilla.pdf', titulo: 'La situación del Biodiesel explicada en una carilla', meta: 'PDF · 1 página' },
  { href: '/docs/situacion-2026-11-19-discurso-vs-realidad.pdf', titulo: TITULO, meta: 'PDF · 2 páginas' },
];

const VISTAS = [
  { id: 'una-carilla', label: 'En una carilla', nota: 'ocho puntos' },
  { id: 'dos-carillas', label: 'En dos carillas', nota: 'con los datos para tocar' },
  { id: 'videos', label: 'En video', nota: 'tres cortos, 7 minutos' },
];

/* ── La carilla: ocho puntos, cada uno con su cifra ── */
const PUNTOS = [
  {
    rotulo: 'La ley', cifra: '41 a 25', sub: 'media sanción del Senado, 17/9/2026',
    texto: 'El Senado aprobó el 17 de septiembre de 2026, por 41 votos a 25, un nuevo marco para los biocombustibles. Sube el corte de biodiésel de 7,5% a 10% y, hasta 2036, les asigna a las empresas no integradas un segmento propio, con límites de participación: 10% por grupo económico y 10% por empresa. A la empresa, además, le pone un máximo de 50.000 toneladas por año.',
  },
  {
    rotulo: 'A quién perjudica el máximo', cifra: '3 de 24', sub: 'Unitec Bio, Explora y Diaser', alerta: true,
    texto: 'A tres empresas de veinticuatro: Unitec Bio, Explora y Diaser. Cada una pierde 42.272 t por año frente al 10% que la misma ley le permite a un grupo (92.272 t el primer año). Pueden aspirar, como mucho, al 5,4% del segmento.',
  },
  {
    rotulo: 'De dónde salió', cifra: 'En el recinto', sub: 'sin ninguna fundamentación',
    texto: 'No estaba en el proyecto que entró al Senado ni en el dictamen de las comisiones. Apareció en el recinto, sin ninguna fundamentación, y se incorporó a la media sanción.',
  },
  {
    rotulo: 'Lo que se negocia en Diputados', cifra: '18 meses', sub: 'sin límite por grupo económico',
    texto: 'Extender el 4% de las no integradas hasta el final de la ley, eliminar la retroactividad de la definición de grupo económico y darles a los grupos 18 meses en los que el límite por grupo no se aplica. No se elimina la amenaza de inconstitucionalidad, que seguirá presente mientras el tope de 50.000 t no se elimine.',
  },
  {
    rotulo: 'La consecuencia', cifra: '270.721 t', sub: 'del Grupo Bahía Energía, sin competir por una sola', alerta: true,
    texto: 'En el mejor de los casos para las demás empresas, el Grupo Bahía Energía (Bojanich) vende 270.721 t el primer año sin competir por una sola. En el escenario más probable vende su capacidad completa, 348.000 t.',
  },
  {
    rotulo: 'No es nuevo', cifra: '43% menos', sub: 'vendieron las tres entre 2011 y 2025',
    texto: 'Desde 2010, cada cambio de regla se descontó de las mismas tres empresas. Entre 2011 y 2025 el mercado del corte quedó casi igual y ellas vendieron 43% menos. Contra la asignación de abril de 2010, que la Justicia les repuso en 2019, recibieron 1,9 millones de toneladas menos.',
  },
  {
    rotulo: 'La paradoja', cifra: '2 de cada 3', sub: 'toneladas nuevas, al Grupo Bahía Energía',
    texto: 'Explora, la única que apoyó la libre competencia (competir con reglas iguales: subasta, precio por oferta y demanda y el mismo límite de participación de mercado para empresas no integradas independientes y grupos económicos), queda junto con Unitec Bio y Diaser sin posibilidad de competir por el 10%. Dos de cada tres toneladas de las 176.000 toneladas que el corte agrega al segmento no integrado se las lleva el Grupo Bahía Energía (Bojanich) porque desde un despacho eliminaron a sus competidores.',
  },
  {
    rotulo: 'Lo que apoyamos y lo que pedimos', cifra: '9 palabras', sub: 'a eliminar del artículo 39', pedido: true,
    texto: 'Apoyamos extender el corte de 4% para las no integradas hasta que finalice la ley, apoyamos eliminar la retroactividad en la definición de grupo económico y apoyamos se otorguen 18 meses para adecuación. Pedimos eliminar nueve palabras «con un tope máximo de cincuenta mil (50.000) toneladas» del artículo 39 inciso a) apartado i.',
  },
];

/* ── Lo que dice cada sector y lo que obtiene (tabla del artículo de dos carillas) ── */
const SECTORES = [
  {
    id: 'ejecutivo', nombre: 'Ejecutivo y oficialismo',
    dice: '«No creemos en cupos, creemos en la competencia».',
    obtiene: 'Cupos por ley hasta 2036 y topes en toneladas. El primer año la ley manda 7,5% y sus topes permiten 5,9%: faltan 193.905 t.',
  },
  {
    id: 'integradas', nombre: 'Integradas',
    dice: 'Que «no pueden» vender en el mercado interno.',
    obtiene: 'De 0 a 6 puntos del corte sin tope, más el faltante. De febrero de 2014 a enero de 2016 entregaron el 6,7% de su cupo y exportaron 2,3 millones de t. Priorizaron al mercado externo por sobre el mercado interno.',
  },
  {
    id: 'mezcladores', nombre: 'Mezcladores',
    dice: 'Acompañaron el proyecto.',
    obtiene: 'Exención de impuestos al gas oil coprocesado (hasta USD 148 millones por año) y acuerdos entre privados que los benefician. Cuatro compran el 99,3%.',
  },
  {
    id: 'cepreb', nombre: 'CEPREB y los grupos',
    dice: 'Que defienden a las «pymes regionales».',
    obtiene: '10% por grupo sin máximo en toneladas y 18 meses sin límite. El Grupo Bahía Energía (Bojanich) vende 270.721 t sin competir en el mejor caso para las demás, y 348.000 t en el más probable.',
  },
  {
    id: 'capba', nombre: 'CAPBA',
    dice: 'Que el límite sea el mismo para todos.',
    obtiene: 'Si no se elimina el tope de 50.000 t, pierden la posibilidad de ofrecer 42.272 t: pueden aspirar al 5,4% del segmento como máximo; jamás al límite de participación del 10% que se les otorga al resto de las empresas independientes y a los grupos económicos.',
  },
];

/* ── Dieciséis años: los hitos que nombra el artículo ── */
const HITOS = [
  { cuando: '2008', titulo: 'Empiezan a producir', texto: 'Unitec Bio, Explora y Diaser producen desde 2008. Son las únicas no integradas con capacidad de producción mayor a 50.000 toneladas por año: 240.000, 120.000 y 96.000 t.' },
  { cuando: '2010', titulo: 'Entregan biodiésel para el corte', texto: 'En abril de 2010 la Secretaría de Energía les asigna 9.424 t por mes a Unitec Bio, 7.424 a Explora y 6.622 a Diaser.' },
  { cuando: '2011', titulo: 'Resolución 1674/2010', texto: 'Publicada el 31 de enero de 2011. Desde entonces, cada cambio de regla les redujo volumen de asignación.', baja: true },
  { cuando: '2013', titulo: 'La primera planta del Grupo', texto: 'La primera planta del Grupo Bahía Energía recién fue construida en 2013. En 2011 el grupo vendía 0 t.' },
  { cuando: '2014', titulo: 'El techo de 50.000 t', texto: 'Se les fija el techo de una planta de 50.000 t, a plantas de 240.000, 120.000 y 96.000 t.', baja: true },
  { cuando: '2019', titulo: 'Cupo cero, y la Justicia', texto: 'Llegan a cupo cero. Van a la Justicia y la Justicia les da a las tres la razón: les repone la asignación de abril de 2010.', baja: true },
  { cuando: '2021', titulo: 'Ley 27.640', texto: 'Los grupos económicos logran volver a perjudicarlas, burlando a la Justicia al incluir el límite en la nueva ley: tope por empresa, sin límite por grupo.', baja: true },
  { cuando: '2026', titulo: 'La media sanción', texto: 'El 17 de septiembre, en el recinto del Senado, se agrega «con un tope máximo de cincuenta mil (50.000) toneladas». Alcanza a tres empresas de veinticuatro.', baja: true },
];

/* ══════════ Piezas ══════════ */

/* Corto vertical: primero la miniatura; el reproductor de YouTube se carga recién al tocarla */
function Corto({ video }) {
  const [activo, setActivo] = useState(false);
  return (
    <figure className="sit-corto">
      <div className="sit-corto-marco">
        {activo ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.youtube}?autoplay=1&rel=0&playsinline=1&modestbranding=1&hl=es`}
            title={`${video.titulo} (video)`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button type="button" className="sit-corto-poster" onClick={() => setActivo(true)} aria-label={`Ver el video: ${video.titulo}`}>
            <img src={video.poster} alt="" width="270" height="480" loading="lazy" />
            <span className="sit-play" aria-hidden="true" />
          </button>
        )}
      </div>
      <figcaption>
        <b>{video.titulo}</b>
        <span>{video.duracion} · <a href={`https://www.youtube.com/watch?v=${video.youtube}&list=${PLAYLIST}`} target="_blank" rel="noopener noreferrer">YouTube ↗</a></span>
      </figcaption>
    </figure>
  );
}

function Videos() {
  return (
    <section className="sit-videos" aria-label="Los videos">
      <p className="sit-entrada">
        Los tres cortos de la lista «Lo que se negocia en Diputados», del canal Explora Biodiesel. El primero explica por qué el tope
        de 50.000 t deja a la ley expuesta a un planteo de inconstitucionalidad; el segundo, quién se queda con el volumen; el tercero,
        del 26 de noviembre, quién gana con el acuerdo que se negocia y qué pedimos.
      </p>
      <div className="sit-videos-fila">
        {VIDEOS.map((v) => <Corto key={v.youtube} video={v} />)}
      </div>
      <p className="sit-videos-pie">
        <a href={`https://www.youtube.com/playlist?list=${PLAYLIST}`} target="_blank" rel="noopener noreferrer">Ver la lista completa en YouTube ↗</a>
      </p>
    </section>
  );
}

function Carilla() {
  const [abiertos, setAbiertos] = useState(() => new Set([0]));
  const todos = abiertos.size === PUNTOS.length;
  const alternar = (i) => setAbiertos((prev) => {
    const s = new Set(prev);
    if (s.has(i)) s.delete(i); else s.add(i);
    return s;
  });
  return (
    <section aria-label="La situación en una carilla">
      <div className="sit-carilla-cabecera">
        <h2>La situación del Biodiesel explicada en una carilla.</h2>
        <button type="button" className="sit-boton-linea" onClick={() => setAbiertos(todos ? new Set() : new Set(PUNTOS.map((_, i) => i)))}>
          {todos ? 'Cerrar todos' : 'Abrir todos'}
        </button>
      </div>
      <p className="sit-ayuda">Ocho puntos. Tocá cada uno para leerlo.</p>
      <div className="sit-puntos">
        {PUNTOS.map((p, i) => {
          const abierto = abiertos.has(i);
          return (
            <article key={p.rotulo} className={`sit-punto ${abierto ? 'abierto' : ''} ${p.alerta ? 'alerta' : ''} ${p.pedido ? 'pedido' : ''}`}>
              <button type="button" className="sit-punto-cabeza" aria-expanded={abierto} onClick={() => alternar(i)}>
                <span className="sit-punto-n">{i + 1}</span>
                <span className="sit-punto-rotulo">{p.rotulo}</span>
                <span className="sit-punto-cifra">{p.cifra}</span>
                <span className="sit-punto-sub">{p.sub}</span>
                <span className="sit-punto-mas" aria-hidden="true">{abierto ? '-' : '+'}</span>
              </button>
              {abierto && <p className="sit-punto-texto">{p.texto}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* Las nueve palabras y lo que cambian: el artículo 39 a) y cuánto puede ofrecer cada uno */
function NuevePalabras() {
  const [sinTope, setSinTope] = useState(false);
  const [adecuacion, setAdecuacion] = useState(false);
  const filas = datos.oferentes.map((o) => {
    const base = sinTope ? o.sin_tope : o.con_tope;
    const puede = adecuacion && o.grupo ? o.adecuacion : base;
    return { ...o, puede, saca: o.sin_tope - base };
  });
  const escala = Math.max(...datos.oferentes.map((o) => o.capacidad));
  const suma = filas.reduce((a, f) => a + f.puede, 0);
  const saldo = suma - datos.segmento;
  const ancho = (v) => `${(v / escala) * 100}%`;
  return (
    <div className="sit-caja">
      <div className="sit-caja-rotulo">Para tocar · Las nueve palabras</div>
      <div className="sit-articulo39">
        <div className="sit-articulo39-titulo">Media sanción, artículo 39, inciso a) · en síntesis</div>
        <p>
          <b>i)</b> Cada empresa elaboradora: hasta el 10% del segmento{' '}
          <span className={`sit-nueve ${sinTope ? 'tachado' : ''}`}>con un tope máximo de cincuenta mil (50.000) toneladas</span>.
        </p>
        <p><b>ii)</b> Cada grupo económico: hasta el 10% del segmento.</p>
        <div className="sit-articulo39-acciones">
          <button type="button" className={`sit-boton ${sinTope ? 'secundario' : ''}`} onClick={() => setSinTope(!sinTope)}>
            {sinTope ? 'Volver a la media sanción' : 'Eliminar las nueve palabras'}
          </button>
          <label className="sit-check">
            <input type="checkbox" checked={adecuacion} onChange={(e) => setAdecuacion(e.target.checked)} />
            <span>Sumar lo que se negocia: 18 meses en los que el límite por grupo no se aplica</span>
          </label>
        </div>
      </div>

      <div className="sit-resumen">
        <div className={`sit-dato ${sinTope ? '' : 'alerta'}`}>
          <span className="sit-dato-rotulo">Explora, Unitec Bio y Diaser pueden ofrecer, cada una</span>
          <span className="sit-dato-valor">{t(sinTope ? datos.diez : datos.tope)}</span>
          <span className="sit-dato-nota">{sinTope ? 'el 10% del segmento, igual que un grupo' : `el ${pct(datos.pct_tope * 100)} del segmento: ${t(datos.pierde_cada_una)} menos que el 10%`}</span>
        </div>
        <div className="sit-dato">
          <span className="sit-dato-rotulo">El Grupo Bahía Energía (Bojanich) puede ofrecer</span>
          <span className="sit-dato-valor">{t(filas[0].puede)}</span>
          <span className="sit-dato-nota">{adecuacion ? `su capacidad completa: el ${pct((filas[0].puede / datos.segmento) * 100)} del segmento` : 'el 10% del segmento'}</span>
        </div>
        <div className={`sit-dato ${saldo < 0 ? 'alerta' : ''}`}>
          <span className="sit-dato-rotulo">Todas juntas pueden ofrecer</span>
          <span className="sit-dato-valor">{t(suma)}</span>
          <span className="sit-dato-nota">
            {saldo < 0 ? `faltan ${t(-saldo)} para las ${t(datos.segmento)} que manda la ley` : `${t(saldo)} más que las ${t(datos.segmento)} que manda la ley: hay por qué competir`}
          </span>
        </div>
      </div>

      <div className="sit-barras" role="table" aria-label="Cuánto puede ofrecer cada empresa o grupo el primer año">
        {filas.map((f) => (
          <div key={f.id} className={`sit-barra-fila ${f.tres ? 'tres' : ''}`} role="row">
            <span className="sit-barra-nombre" role="cell">
              {f.nombre}
              <small>{f.grupo ? `grupo, ${f.sociedades} sociedades` : 'empresa independiente'} · capacidad {t(f.capacidad)}</small>
            </span>
            <span className="sit-barra-pista" role="cell">
              <i className="sit-barra-cap" style={{ width: ancho(f.capacidad) }} />
              {f.saca > 0 && <i className="sit-barra-saca" style={{ width: ancho(f.sin_tope) }} />}
              <i className="sit-barra-puede" style={{ width: ancho(f.puede) }} />
              <i className="sit-barra-diez" style={{ left: ancho(datos.diez) }} />
            </span>
            <span className="sit-barra-valor" role="cell">
              <b>{t(f.puede)}</b>
              {f.saca > 0 && <small>el tope le saca {t(f.saca)}</small>}
            </span>
          </div>
        ))}
      </div>
      <p className="sit-leyenda">
        <span><i className="sit-ley-puede" /> puede ofrecer</span>
        <span><i className="sit-ley-saca" /> lo que saca el tope de 50.000 t</span>
        <span><i className="sit-ley-cap" /> capacidad registrada</span>
        <span><i className="sit-ley-diez" /> 10% del segmento: {t(datos.diez)}</span>
      </p>
      <p className="sit-fuente">
        Primer año de la ley, corte de 7,5%: el segmento no integrado son {t(datos.segmento)} y el 10%, {t(datos.diez)}. Nadie puede ofrecer más que su
        capacidad registrada. Las nueve palabras son cita textual; el resto del artículo está resumido. Datos de la Secretaría de Energía a {datos.corte_datos}.
      </p>
    </div>
  );
}

function Sectores() {
  const [id, setId] = useState(SECTORES[0].id);
  const s = SECTORES.find((x) => x.id === id);
  return (
    <div className="sit-caja">
      <div className="sit-caja-rotulo">Para tocar · Elegí un sector</div>
      <div className="sit-chips" role="tablist" aria-label="Sectores">
        {SECTORES.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={x.id === id} className={x.id === id ? 'activo' : ''} onClick={() => setId(x.id)}>
            {x.nombre}
          </button>
        ))}
      </div>
      <div className="sit-dicho-dato" role="tabpanel">
        <div className="sit-dicho">
          <span className="sit-mini-rotulo">Lo que dice</span>
          <p>{s.dice}</p>
        </div>
        <div className="sit-flecha" aria-hidden="true">→</div>
        <div className="sit-obtiene">
          <span className="sit-mini-rotulo">Lo que obtiene, con el dato</span>
          <p>{s.obtiene}</p>
        </div>
      </div>
    </div>
  );
}

function LineaTiempo() {
  const [i, setI] = useState(0);
  const h = HITOS[i];
  return (
    <div className="sit-caja">
      <div className="sit-caja-rotulo">Para tocar · Dieciséis años, año por año</div>
      <div className="sit-linea" role="tablist" aria-label="Hitos">
        {HITOS.map((x, k) => (
          <button key={x.cuando} type="button" role="tab" aria-selected={k === i} className={`${k === i ? 'activo' : ''} ${x.baja ? 'baja' : ''}`} onClick={() => setI(k)}>
            <span className="sit-linea-punto" aria-hidden="true" />
            <span className="sit-linea-anio">{x.cuando}</span>
          </button>
        ))}
      </div>
      <div className="sit-hito" role="tabpanel">
        <div className="sit-hito-anio">{h.cuando}</div>
        <div>
          <h3>{h.titulo}</h3>
          <p>{h.texto}</p>
        </div>
        <div className="sit-hito-pasos">
          <button type="button" className="sit-boton-linea" disabled={i === 0} onClick={() => setI(i - 1)}>‹ Anterior</button>
          <button type="button" className="sit-boton-linea" disabled={i === HITOS.length - 1} onClick={() => setI(i + 1)}>Siguiente ›</button>
        </div>
      </div>
      <div className="sit-saldo">
        <span className="sit-mini-rotulo">El saldo, contra la asignación de abril de 2010 que la Justicia les repuso</span>
        <div className="sit-saldo-fila">
          {datos.tres.map((e) => (
            <span key={e.id}><b>{t(e.perdio)}</b> menos · {e.nombre}</span>
          ))}
          <span className="total"><b>{t(datos.tres_perdio)}</b> menos · las tres</span>
        </div>
      </div>
    </div>
  );
}

const BLOQUES = [
  { id: 'tres', nombre: 'Unitec Bio, Explora y Diaser' },
  { id: 'bahia', nombre: 'Grupo Bahía Energía (Bojanich)' },
  { id: 'otras', nombre: 'Las demás no integradas' },
  { id: 'integradas', nombre: 'Integradas' },
];

function Grafico2011() {
  const [enPct, setEnPct] = useState(false);
  const [sel, setSel] = useState('tres');
  const b = datos.bloques;
  const tot = datos.totales;
  const maximo = Math.max(...BLOQUES.flatMap((x) => [b['2011'][x.id], b['2025'][x.id]]));
  const valor = (anio, id) => (enPct ? pct((b[anio][id] / tot[anio]) * 100) : t(b[anio][id]));
  const ancho = (anio, id) => `${Math.max((b[anio][id] / maximo) * 100, b[anio][id] ? 0.6 : 0)}%`;
  const cambio = (id) => {
    const a = b['2011'][id];
    const z = b['2025'][id];
    return a ? `${z >= a ? '+' : '-'}${Math.abs(Math.round((z / a - 1) * 100))}%` : 'de cero';
  };
  return (
    <div className="sit-caja">
      <div className="sit-caja-cabecera">
        <div className="sit-caja-rotulo">Para tocar · Quién vende el biodiésel del corte: 2011 y 2025</div>
        <div className="sit-seg" role="group" aria-label="Unidad">
          <button type="button" className={!enPct ? 'activo' : ''} aria-pressed={!enPct} onClick={() => setEnPct(false)}>Toneladas</button>
          <button type="button" className={enPct ? 'activo' : ''} aria-pressed={enPct} onClick={() => setEnPct(true)}>% del mercado</button>
        </div>
      </div>
      <div className="sit-pares">
        {BLOQUES.map((x) => (
          <button key={x.id} type="button" className={`sit-par ${sel === x.id ? 'activo' : ''} sit-par-${x.id}`} aria-pressed={sel === x.id} onClick={() => setSel(x.id)}>
            <span className="sit-par-nombre">{x.nombre} <em>{cambio(x.id)}</em></span>
            <span className="sit-par-barras">
              <span className="sit-par-fila"><small>2011</small><span className="sit-par-pista"><i className="a2011" style={{ width: ancho('2011', x.id) }} /></span><b>{valor('2011', x.id)}</b></span>
              <span className="sit-par-fila"><small>2025</small><span className="sit-par-pista"><i className="a2025" style={{ width: ancho('2025', x.id) }} /></span><b>{valor('2025', x.id)}</b></span>
            </span>
          </button>
        ))}
      </div>
      <div className="sit-detalle" aria-live="polite">
        {sel === 'tres' && (
          <>
            <p>Las tres pasaron de {t(b['2011'].tres)} a {t(b['2025'].tres)}: 43% menos, con el mercado casi igual. Una por una:</p>
            <ul>
              {datos.tres.map((e) => (
                <li key={e.id}><b>{e.nombre}</b>: de {t(e.ventas_2011)} a {t(e.ventas_2025)} ({Math.round((e.ventas_2025 / e.ventas_2011 - 1) * 100)}%)</li>
              ))}
            </ul>
          </>
        )}
        {sel === 'bahia' && <p>Las ocho sociedades del Grupo Bahía Energía pasaron de 0 t a {t(b['2025'].bahia)}. En 2011 el grupo no tenía ninguna planta: la primera recién fue construida en 2013.</p>}
        {sel === 'otras' && <p>Las demás no integradas pasaron de {t(b['2011'].otras)} a {t(b['2025'].otras)}.</p>}
        {sel === 'integradas' && <p>Las integradas pasaron de {t(b['2011'].integradas)} a {t(b['2025'].integradas)} en el corte: priorizaron al mercado externo por sobre el mercado interno.</p>}
      </div>
      <p className="sit-fuente">
        Ventas de biodiésel al corte, en toneladas. Total: {t(tot['2011'])} en 2011 y {t(tot['2025'])} en 2025. Fuente: Secretaría de Energía, procesado en explorarg.com.
      </p>
    </div>
  );
}

const ESCENARIOS = [
  { id: 'hoy', label: 'Hoy', nota: 'Ventas al corte de los últimos doce meses, a septiembre de 2026.' },
  { id: 'mejor', label: 'Mejor caso para las demás', nota: 'Todas las demás venden el máximo que la ley les permite. Lo que falta para cubrir el segmento solo lo puede cubrir el Grupo Bahía Energía.' },
  { id: 'probable', label: 'Más probable', nota: 'Con los 18 meses sin límite por grupo, el Grupo Bahía Energía vende su capacidad completa. ERA, Doble L y Agro M y G quedan sin vender y las demás se reparten el resto.' },
];

function Escenarios() {
  const [id, setId] = useState('probable');
  const e = ESCENARIOS.find((x) => x.id === id);
  const filas = datos.escenarios;
  const maximo = Math.max(...filas.flatMap((f) => [f.hoy, f.mejor, f.probable]));
  const total = filas.reduce((a, f) => a + f[id], 0);
  const bahia = filas[0];
  const parte = (bahia[id] - bahia.hoy) / datos.crece_mercado;
  return (
    <div className="sit-caja">
      <div className="sit-caja-rotulo">Para tocar · A dónde van las {t(datos.crece_mercado)} que suma el corte</div>
      <div className="sit-chips" role="tablist" aria-label="Escenario">
        {ESCENARIOS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={x.id === id} className={x.id === id ? 'activo' : ''} onClick={() => setId(x.id)}>{x.label}</button>
        ))}
      </div>
      <p className="sit-escenario-nota">{e.nota}</p>
      <div className="sit-barras sit-barras-esc">
        {filas.map((f) => {
          const d = f[id] - f.hoy;
          return (
            <div key={f.id} className={`sit-barra-fila ${f.id === 'bahia' ? 'bahia' : ''}`}>
              <span className="sit-barra-nombre">{f.nombre}</span>
              <span className="sit-barra-pista">
                <i className="sit-barra-hoy" style={{ left: `${(f.hoy / maximo) * 100}%` }} />
                <i className="sit-barra-puede" style={{ width: `${(f[id] / maximo) * 100}%` }} />
              </span>
              <span className="sit-barra-valor">
                <b>{t(f[id])}</b>
                {id !== 'hoy' && <small className={d < 0 ? 'baja' : ''}>{signo(d)} contra hoy</small>}
              </span>
            </div>
          );
        })}
      </div>
      {id !== 'hoy' && (
        <p className="sit-veredicto">
          De las {t(datos.crece_mercado)} que el corte le suma al segmento, <b>{t(bahia[id] - bahia.hoy)}</b> van al Grupo Bahía Energía:{' '}
          <b>{id === 'probable' ? 'dos de cada tres' : pct(parte * 100, 0)}</b>
          {id === 'probable' ? ` (${pct(parte * 100, 0)}). Crece ${Math.round((bahia[id] / bahia.hoy - 1) * 100)}%, y lo hace sin competir.` : `. Vende ${t(bahia[id])} sin competir por una sola.`}
        </p>
      )}
      <p className="sit-fuente">
        Segmento no integrado: {t(total)} {id === 'hoy' ? 'vendidas en los últimos doce meses' : 'el primer año de la ley'}. La marca vertical es lo que cada bloque vende hoy.
        Datos de la Secretaría de Energía a {datos.corte_datos}, procesados en explorarg.com.
      </p>
    </div>
  );
}

function DosCarillas() {
  return (
    <section className="sit-nota" aria-label="El artículo de dos carillas">
      <p className="sit-resumen-nota">
        <b>Resumen.</b> La ley de biocombustibles llegó a Diputados envuelta en la palabra competencia. Lo que cada sector pide produce otra cosa
        que lo que dice, y el costo vuelve a caer sobre las mismas tres empresas.
      </p>

      <h2>Situación actual</h2>
      <p>
        La media sanción del Senado (17/9/2026, 41 a 25) sube el corte de biodiésel de 7,5% a 10% y les asigna a las 24 empresas no integradas un
        segmento propio hasta 2036, con dos límites: 10% por grupo económico y 10% por empresa, a la que en el recinto se agregó «con un tope máximo
        de cincuenta mil (50.000) toneladas».
      </p>
      <p>
        En Diputados se negocian tres cambios: extender el 4% hasta el final de la ley, eliminar la retroactividad de la definición de grupo económico
        y otorgar 18 meses de adecuación en los que el límite por grupo económico no se aplica. Buscan evitar que el Grupo Bahía Energía (Bojanich)
        plantee en la Justicia la inconstitucionalidad de la ley. Pero dejan abierto otro planteo: el del tope de 50.000 t, que alcanza únicamente a
        tres empresas. En el mejor de los casos, esas tres pueden aspirar al 5,4% del segmento; un grupo económico, al 10%. El tope viola el derecho a
        ejercer toda industria lícita, la igualdad ante la ley, la propiedad, la razonabilidad y la defensa de la competencia (Constitución, artículos
        14, 16, 17, 28 y 42), y el daño es concreto y demostrable: 42.272 t que no puede ofrecer. Solo eliminando el tope, que no estaba en la
        propuesta inicial del Ejecutivo ni en el dictamen de comisión, la ley queda a salvo de ese planteo.
      </p>
      <NuevePalabras />

      <h2>Lo que dice cada sector y lo que obtiene</h2>
      <Sectores />

      <h2>Dieciséis años siendo variable de ajuste</h2>
      <p>
        Unitec Bio, Explora y Diaser producen desde 2008 y son las únicas no integradas con capacidad de producción mayor a 50.000 toneladas por año.
        Desde el año 2010 entregaron biodiésel para el corte. Desde entonces, cada cambio de regla les redujo volumen de asignación (Resolución
        1674/2010 del 31 de enero de 2011), en 2014 se les fijó el techo de una planta de 50.000 t, en 2019 llegaron a cupo cero. Fueron a la Justicia
        y la Justicia les dio a las tres la razón: les repuso la asignación de abril de 2010, pero los grupos económicos lograron volver a
        perjudicarlas, burlando a la Justicia al incluir el límite en la nueva Ley 27.640. Contra esa asignación recibieron 1.921.122 t menos. Entre
        2011 y 2025, con el mercado casi igual, vendieron 43% menos (223.322 a 126.646 t); las ocho sociedades del Grupo Bahía Energía pasaron de 0 t
        a 214.123 t. ¡Y la primera planta del Grupo recién fue construida en el año 2013!
      </p>
      <LineaTiempo />
      <Grafico2011 />

      <h2>Lo que ocurre no es producto de un descuido, es totalmente intencional.</h2>
      <ul className="sit-lista">
        <li>El máximo no estaba en el proyecto (14% y 14%) ni en el dictamen (10% y 10%). Apareció en el recinto, sin fundamento escrito y sin que nadie explicase por qué.</li>
        <li>Alcanza a tres empresas de veinticuatro. Al grupo económico le deja el 10% sin máximo.</li>
        <li>En junio de 2026, la propuesta llevada al Senado en nombre de las «pymes regionales» pedía ese mismo máximo. Y la Ley 27.640 ya había hecho lo mismo: tope por empresa, sin límite por grupo.</li>
      </ul>

      <h2>La paradoja</h2>
      <p>
        Explora es la única que apoyó la libre competencia (competir con reglas iguales: subasta, precio por oferta y demanda y el mismo límite de
        participación de mercado para empresas no integradas independientes y grupos económicos): lo sostuvo con la Ley Bases en 2024, ante el Senado
        en junio de 2026 y en sus propuestas de redacción. Es una de las tres a las que la ley les prohíbe competir por el 10%. Bojanich se opuso a
        que la Ley 27.640 se modificase. Paradójicamente, el grupo podrá ofrecer 348.000 t, el 37,7% del segmento (el límite no les aplica a los
        grupos durante el período de adecuación), y Explora nunca más que 50.000, es decir, 5,4% de participación máxima.
      </p>

      <h2>Las consecuencias si no se elimina el tope de 50.000 toneladas</h2>
      <p>
        El corte le suma 176.516 t al mercado de las no integradas. En el escenario más probable, dos de cada tres van al Grupo Bahía Energía, que
        crece 51%; y lo hace sin competir.
      </p>
      <Escenarios />

      <h2>Lo que pedimos</h2>
      <div className="sit-pedido">
        <p>
          Apoyamos extender el corte de 4% para las no integradas hasta que finalice la ley, apoyamos eliminar la retroactividad en la definición de
          grupo económico y apoyamos se otorguen 18 meses para adecuación. Pero exigimos que se elimine del artículo 39, inciso a), apartado i, la
          frase «con un tope máximo de cincuenta mil (50.000) toneladas». El límite tiene que permitir que todos puedan llegar al 10%, y no que tres
          empresas puedan aspirar, como mucho, al 5,4%.
        </p>
        <p>
          Si alguna empresa aumenta su volumen, que sea por haberlo ganado compitiendo, y no porque desde un despacho le allanaron el camino
          eliminando a sus competidores. <b>Reclamamos igualdad y competencia.</b>
        </p>
      </div>
    </section>
  );
}

export default function Edicion20261119({ edicion, selector }) {
  const inicial = () => {
    const h = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    return VISTAS.some((v) => v.id === h) ? h : VISTAS[0].id;
  };
  const [vista, setVista] = useState(inicial);
  useEffect(() => {
    const alCambiar = () => setVista(inicial());
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);
  const elegir = (id, subir = false) => {
    setVista(id);
    window.history.replaceState(null, '', `${window.location.pathname}#${id}`);
    if (subir) window.scrollTo({ top: 0 });
  };
  const k = VISTAS.findIndex((v) => v.id === vista);
  const sigue = VISTAS[(k + 1) % VISTAS.length];

  return (
    <div className="articulo-reforma sit">
      <div className="ar-sticky">
        <div className="marco ar-encabezado">
          <div className="sit-encabezado">
            <div className="kicker">Situación al {edicion.larga} · Reforma Ley 27.640 · Cámara de Diputados</div>
            <h1>{TITULO}</h1>
            <div className="firma">por Hilarión Del Olmo - Presidente de Explora S.A. · explorarg.com</div>
          </div>
          <div className="sit-vistas" role="tablist" aria-label="Cuánto querés leer">
            {VISTAS.map((v) => (
              <button key={v.id} type="button" role="tab" aria-selected={v.id === vista} className={v.id === vista ? 'activo' : ''} onClick={() => elegir(v.id)}>
                {v.label} <small>{v.nota}</small>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ar-contenido">
        <div className="marco">
          {selector}
          {vista !== 'dos-carillas' && <p className="sit-bajada">{BAJADA}</p>}

          {vista === 'una-carilla' && <Carilla />}
          {vista === 'dos-carillas' && <DosCarillas />}
          {vista === 'videos' && <Videos />}

          <div className="sit-sigue">
            <button type="button" className="sit-boton" onClick={() => elegir(sigue.id, true)}>
              Seguir: {sigue.label.toLowerCase()} <small>{sigue.nota}</small> →
            </button>
          </div>

          <div className="sit-firma">
            <b>Hilarión Del Olmo</b>
            <span>Presidente de Explora S.A.</span>
          </div>

          <section className="sit-docs" aria-label="Descargas">
            <div className="sit-mini-rotulo">Los dos artículos, para descargar</div>
            <div className="sit-docs-fila">
              {DOCS.map((d) => (
                <a key={d.href} className="sit-doc" href={d.href} target="_blank" rel="noopener noreferrer">
                  <span className="sit-doc-titulo">{d.titulo}</span>
                  <span className="sit-doc-meta">{d.meta} · {edicion.larga}</span>
                  <span className="sit-doc-boton">Descargar PDF</span>
                </a>
              ))}
            </div>
          </section>

          <p className="sit-pie">
            Datos: Secretaría de Energía, procesados en explorarg.com, a septiembre de 2026. Lo que se negocia en Diputados es información del autor a
            noviembre de 2026. Las frases de cada sector, con el video y el minuto, están en <Link to="/del-dicho-al-dato">Del dicho al dato</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
