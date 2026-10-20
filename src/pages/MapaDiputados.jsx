import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SectionNav from '../components/SectionNav.jsx';
import { SECCIONES_REFORMA } from '../lib/reforma.js';
import {
  RECINTO,
  BLOQUES,
  ORDEN_BLOQUES,
  DIPUTADOS,
  PRESETS,
  VOTACION,
  DESDE_2024,
  QUIEN_CIERRA,
  LEY_BASES,
  REGLAS,
  FUENTES,
} from '../data/mapa-diputados.js';
import './PropuestaLey.css';
import './MapaFirmas.css';
import './MapaRecinto.css';
import './MapaDiputados.css';

/**
 * Mapa de Diputados: los 257 diputados de hoy en un hemiciclo, con el mismo
 * molde que el Mapa del recinto del Senado. Cada banca tiene tres estados que
 * se recorren tocándola (ausente, presente a favor, presente en contra) y dos
 * que solo carga la votación de referencia: "no estaba en 2024" (gris) y
 * "presidió, no votó" (Menem). Los contadores aplican el Reglamento HCDN:
 * quórum de 129 (art. 15) y mayoría absoluta de los votos emitidos (art. 194).
 *
 * Nómina, umbrales y textos viven en src/data/mapa-diputados.js. Lo marcado
 * se guarda en localStorage (por navegador). Con `?votacion=ley-bases` en la
 * URL la planilla abre con la votación de la Ley de Bases del 2/2/2024
 * proyectada sobre la Cámara actual, por encima de lo guardado.
 */
const CLAVE = 'explorarg-mapa-diputados-2026-10-19';

// Estados que recorre un toque; `noestaba` y `preside` salen del ciclo al tocar.
const ESTADOS = ['ausente', 'favor', 'contra'];
const ETIQUETA = {
  ausente: 'ausente',
  favor: 'presente, a favor',
  contra: 'presente, en contra',
  noestaba: 'no estaba en 2024',
  preside: 'presidió la sesión, no votó',
};
const GUARDABLES = ['favor', 'contra', 'noestaba', 'preside'];

// Cómo votó cada uno en 2024, para el tooltip (solo los 144 que siguen).
const VOTO_2024 = (() => {
  const m = new Map();
  VOTACION.favor.forEach((id) => m.set(id, 'votó a favor'));
  VOTACION.contra.forEach((id) => m.set(id, 'votó en contra'));
  VOTACION.ausentes.forEach((id) => m.set(id, 'estuvo ausente'));
  VOTACION.preside.forEach((id) => m.set(id, 'presidió la sesión y no votó'));
  return m;
})();

// ── geometría del hemiciclo ──────────────────────────────────────────────
// Ocho filas con bancas proporcionales al radio, para que cada bloque ocupe
// una cuña pareja. Las bancas se ordenan por ángulo (de izquierda a derecha)
// y se asignan en el orden político de DIPUTADOS.
const CX = 500;
const CY = 520;
const FILAS = [
  { n: 17, r: 170 },
  { n: 21, r: 214 },
  { n: 26, r: 258 },
  { n: 30, r: 302 },
  { n: 34, r: 346 },
  { n: 39, r: 390 },
  { n: 43, r: 434 },
  { n: 47, r: 478 },
];
const R_BANCA = 12.5;

const BANCAS = (() => {
  const out = [];
  FILAS.forEach(({ n, r }, fila) => {
    for (let i = 0; i < n; i += 1) {
      const ang = Math.PI - (Math.PI * i) / (n - 1);
      out.push({ fila, ang, x: CX + r * Math.cos(ang), y: CY - r * Math.sin(ang) });
    }
  });
  // Izquierda (π) a derecha (0); a igual ángulo, primero la fila interna.
  out.sort((a, b) => b.ang - a.ang || a.fila - b.fila);
  return out;
})();

function leerGuardado() {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    const m = new Map();
    const valido = (id) => DIPUTADOS.some((d) => d.id === id);
    GUARDABLES.forEach((estado) => (obj[estado] || []).filter(valido).forEach((id) => m.set(id, estado)));
    return m;
  } catch {
    return null;
  }
}

function desdePreset(p) {
  const m = new Map();
  GUARDABLES.forEach((estado) => (p[estado] || []).forEach((id) => m.set(id, estado)));
  return m;
}

function mayoriaDe(emitidos) {
  return emitidos ? Math.floor(emitidos / 2) + 1 : 0;
}

function bloqueDe(d) {
  return d.sub || BLOQUES[d.bloque].label;
}

// Una línea por diputado: nombre, distrito, bloque de hoy, qué hizo en 2024 y
// cómo está marcado en la planilla.
function descripcion(d, estado) {
  const v = VOTO_2024.get(d.id);
  const en2024 = v ? `en 2024: ${d.b2024}, ${v}` : 'no estaba en 2024';
  const ahora = estado === 'noestaba' ? null : `ahora: ${ETIQUETA[estado]}`;
  return [d.completo, d.distrito, bloqueDe(d), `mandato ${d.mandato}`, en2024, ahora].filter(Boolean).join(' · ');
}

function Contador({ rotulo, n, meta, pct, ok, pill }) {
  return (
    <div className={`mf-contador ${ok ? 'ok' : ''}`}>
      <span className="mf-contador-rotulo">{rotulo}</span>
      <span className="mf-contador-num">
        {n} <small>{meta}</small>
      </span>
      <div className="mf-barra">
        <i style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="mf-pill">{pill}</span>
    </div>
  );
}

function Veredicto({ c, votos }) {
  const { presentes, favor, contra, emitidos, mayoria } = c;

  if (presentes < RECINTO.quorum) {
    const ausentes = ORDEN_BLOQUES.map((code) => {
      const n = DIPUTADOS.filter((d) => d.bloque === code && !['favor', 'contra', 'preside'].includes(votos.get(d.id))).length;
      return n ? `${BLOQUES[code].label} ${n}` : null;
    }).filter(Boolean);
    return (
      <p className="mf-veredicto">
        <strong>Sin quórum: faltan {RECINTO.quorum - presentes} para {RECINTO.quorum}.</strong> La
        sesión no se abre. Fuera del recinto: {ausentes.join(', ')}.
      </p>
    );
  }

  if (favor >= mayoria && favor > 0) {
    const margen = favor - mayoria;
    return (
      <p className="mf-veredicto">
        <strong>
          Aprobado en general: {favor} a {contra}.
        </strong>{' '}
        Mayoría de {mayoria} sobre {emitidos} votos emitidos, margen +{margen}.
        {margen === 0 && ' Sin margen: un voto que se da vuelta lo empata.'}
      </p>
    );
  }

  if (favor === contra) {
    return (
      <p className="mf-veredicto">
        <strong>Empate {favor} a {contra}.</strong> Se reabre la discusión y se vota de nuevo; si
        persiste, decide el presidente (art. 196).
      </p>
    );
  }

  return (
    <p className="mf-veredicto">
      <strong>
        Hay quórum pero el proyecto pierde: {favor} a {contra}.
      </strong>{' '}
      Faltan {mayoria - favor} para la mayoría de {mayoria} sobre {emitidos} votos emitidos.
    </p>
  );
}

function Banca({ d, banca, estado, onToggle, onHover }) {
  const clase = BLOQUES[d.bloque].clase;
  const titulo = descripcion(d, estado);
  return (
    <g
      className={`mr-banca mr-b-${clase} ${estado}`}
      transform={`translate(${banca.x.toFixed(1)} ${banca.y.toFixed(1)})`}
      role="button"
      tabIndex={0}
      aria-label={titulo}
      onClick={() => onToggle(d.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle(d.id);
        }
      }}
      onMouseEnter={() => onHover(d.id)}
      onFocus={() => onHover(d.id)}
    >
      <title>{titulo}</title>
      <circle r={R_BANCA} />
      {estado === 'favor' && <path className="mr-marca" d="M-5 0.3 L-1.6 3.8 L5 -3.8" />}
      {estado === 'contra' && <path className="mr-marca" d="M-4 -4 L4 4 M4 -4 L-4 4" />}
      {estado === 'preside' && <circle className="md-preside" r="3.5" />}
    </g>
  );
}

function Hemiciclo({ votos, onToggle, c }) {
  const [foco, setFoco] = useState(null);
  const d = foco ? DIPUTADOS.find((x) => x.id === foco) : null;
  const estadoDe = (id) => votos.get(id) || 'ausente';

  return (
    <div className="mr-hemi">
      <svg
        viewBox="0 0 1000 548"
        className="mr-svg"
        role="group"
        aria-label="Hemiciclo de la Cámara de Diputados: 257 bancas, tocá una para cambiar su estado"
      >
        {DIPUTADOS.map((dip, i) => (
          <Banca
            key={dip.id}
            d={dip}
            banca={BANCAS[i]}
            estado={estadoDe(dip.id)}
            onToggle={onToggle}
            onHover={setFoco}
          />
        ))}
        <g className="mr-centro" transform={`translate(${CX} ${CY})`}>
          <text className="mr-centro-num favor" x="-80" y="-66">
            {c.favor}
          </text>
          <text className="mr-centro-rot" x="-80" y="-48">
            a favor
          </text>
          <text className="mr-centro-num contra" x="80" y="-66">
            {c.contra}
          </text>
          <text className="mr-centro-rot" x="80" y="-48">
            en contra
          </text>
          <text className="mr-centro-num" x="0" y="-8">
            {c.presentes}
          </text>
          <text className="mr-centro-rot" x="0" y="12">
            presentes · quórum {RECINTO.quorum}
          </text>
        </g>
      </svg>
      <p className="mr-foco" aria-live="polite">
        {d ? (
          <>
            <b>{d.completo}</b> · {descripcion(d, estadoDe(d.id)).split(' · ').slice(1).join(' · ')}
          </>
        ) : (
          'Pasá el cursor por una banca para ver quién es y cómo votó en 2024; tocala para cambiar su estado.'
        )}
      </p>
      <div className="md-estados" aria-label="Bancas por estado">
        <span className="md-estado favor">
          <b>{c.favor}</b> a favor
        </span>
        <span className="md-estado contra">
          <b>{c.contra}</b> en contra
        </span>
        <span className="md-estado">
          <b>{c.ausentes}</b> ausentes
        </span>
        {c.preside > 0 && (
          <span className="md-estado">
            <b>{c.preside}</b> presidió, no votó
          </span>
        )}
        <span className="md-estado noestaba">
          <b>{c.noestaba}</b> no estaban en 2024
        </span>
      </div>
      <div className="mr-leyenda">
        <span className="mr-ley-item">
          <i className="mr-ley-favor" /> presente, a favor
        </span>
        <span className="mr-ley-item">
          <i className="mr-ley-contra" /> presente, en contra
        </span>
        <span className="mr-ley-item">
          <i className="mr-ley-ausente" /> ausente
        </span>
        <span className="mr-ley-item">
          <i className="md-ley-preside" /> presidió, no votó
        </span>
        <span className="mr-ley-item">
          <i className="md-ley-noestaba" /> no estaba en 2024
        </span>
        <span className="mr-ley-sep" />
        {ORDEN_BLOQUES.map((code) => (
          <span className="mr-ley-item" key={code}>
            <i className={`mr-ley-bloque mr-b-${BLOQUES[code].clase}`} />
            {BLOQUES[code].label} {DIPUTADOS.filter((x) => x.bloque === code).length}
          </span>
        ))}
      </div>
    </div>
  );
}

function Diputado({ d, estado, onToggle }) {
  return (
    <button
      type="button"
      className={`mf-sen mr-sen md-dip ${estado}`}
      aria-pressed={estado !== 'ausente'}
      title={descripcion(d, estado)}
      onClick={() => onToggle(d.id)}
    >
      <span className="mf-sen-txt">
        <span className="mf-sen-n">{d.nombre}</span>
        <span className="mf-sen-s">
          {d.distrito}
          {d.sub ? ` · ${d.sub}` : ''}
        </span>
      </span>
    </button>
  );
}

function Bloque({ code, votos, onToggle }) {
  const miembros = DIPUTADOS.filter((d) => d.bloque === code);
  const cuenta = (estado) => miembros.filter((d) => (votos.get(d.id) || 'ausente') === estado).length;
  const nf = cuenta('favor');
  const nc = cuenta('contra');
  const np = cuenta('preside');
  const nn = cuenta('noestaba');
  const na = miembros.length - nf - nc - np - nn;
  return (
    <div className="mf-grupo">
      <div className="mf-grupo-cab">
        <span className={`mf-chip mf-chip-${BLOQUES[code].clase}`}>
          {BLOQUES[code].label} {miembros.length}
        </span>
        <span className="mf-grupo-n">
          <b>{nf}</b> a favor · {nc} en contra · {na} ausentes
          {np > 0 && ` · ${np} presidió`}
          {nn > 0 && ` · ${nn} no estaban en 2024`}
        </span>
      </div>
      <div className="mf-lista mr-lista">
        {miembros.map((d) => (
          <Diputado key={d.id} d={d} estado={votos.get(d.id) || 'ausente'} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

export default function MapaDiputados() {
  const [params] = useSearchParams();
  const abreConVotacion = params.get('votacion') === VOTACION.param;
  const [votos, setVotos] = useState(() =>
    abreConVotacion ? desdePreset(PRESETS[0]) : (leerGuardado() ?? desdePreset(PRESETS[0]))
  );

  useEffect(() => {
    try {
      const obj = Object.fromEntries(GUARDABLES.map((e) => [e, []]));
      votos.forEach((v, id) => obj[v] && obj[v].push(id));
      localStorage.setItem(CLAVE, JSON.stringify(obj));
    } catch {
      /* modo privado */
    }
  }, [votos]);

  const toggle = (id) =>
    setVotos((prev) => {
      const sig = new Map(prev);
      const actual = sig.get(id) || 'ausente';
      // Desde "no estaba" o "presidió" el primer toque va a presente a favor.
      const prox = ESTADOS[(Math.max(0, ESTADOS.indexOf(actual)) + 1) % ESTADOS.length];
      if (prox === 'ausente') sig.delete(id);
      else sig.set(id, prox);
      return sig;
    });

  const c = useMemo(() => {
    let favor = 0;
    let contra = 0;
    let preside = 0;
    let noestaba = 0;
    votos.forEach((v) => {
      if (v === 'favor') favor += 1;
      else if (v === 'contra') contra += 1;
      else if (v === 'preside') preside += 1;
      else if (v === 'noestaba') noestaba += 1;
    });
    const emitidos = favor + contra;
    const presentes = emitidos + preside;
    return {
      favor,
      contra,
      preside,
      noestaba,
      emitidos,
      presentes,
      ausentes: RECINTO.bancas - presentes - noestaba,
      mayoria: mayoriaDe(emitidos),
      dosTercios: Math.ceil((2 * emitidos) / 3),
    };
  }, [votos]);

  const hayQuorum = c.presentes >= RECINTO.quorum;

  return (
    <div className="propuesta-ley mapa-firmas mapa-recinto mapa-diputados">
      <SectionNav sections={SECCIONES_REFORMA} />
      <div className="marco pl-encabezado">
        <div className="kicker">Reforma Ley 27.640 · Recinto de Diputados · la Cámara de hoy y la votación de la Ley de Bases del 2/2/2024</div>
        <h1>Mapa de Diputados</h1>
        <p className="bajada">
          El 2/2/2024 Diputados aprobó en general la Ley de Bases por 144 a 109, con 3 ausentes y el
          presidente sin votar (
          <a href={VOTACION.url} target="_blank" rel="noopener noreferrer">
            acta {VOTACION.acta}
          </a>
          ). Aquel texto traía un capítulo de biocombustibles distinto al de la media sanción del
          17/9/2026 que la Cámara trata ahora: todas las elaboradoras con derecho a participar, dos
          segmentos, integradas y no integradas, con el mismo factor de utilización todo el tiempo,
          licitaciones con tope del 14% por empresa y corte del 10% al 12,5%. La planilla pone esa
          votación sobre la Cámara de hoy: de los 257 diputados actuales, 144 estuvieron en el
          recinto aquel día ({VOTACION.siguen.favor} votaron a favor, {VOTACION.siguen.contra} en
          contra, {VOTACION.siguen.ausentes} faltaron y Martín Menem presidió); los otros{' '}
          {VOTACION.siguen.noestaba} no estaban y van en gris. Son 257 bancas: la sesión se abre
          con 129 presentes (art. 15 del Reglamento) y un proyecto se aprueba con más de la mitad
          de los votos emitidos (art. 194). Tocá una banca del hemiciclo o un nombre de la lista
          para pasarlo de ausente a presente a favor, y de ahí a presente en contra; el primer
          botón vuelve a la votación de 2024. La votación del Senado del 17/9/2026 está en el{' '}
          <Link to="/mapa-recinto?votacion=17-9">Mapa del recinto</Link>.
        </p>
        <p className="mf-exptes">{RECINTO.expediente}. {RECINTO.fecha}.</p>
      </div>

      <div className="marco pl-marco">
        <div className="mf-tally" aria-live="polite">
          <div className="mf-contadores mr-contadores">
            <Contador
              rotulo="Presentes · quórum"
              n={c.presentes}
              meta={`de ${RECINTO.quorum} · ${RECINTO.bancas} bancas`}
              pct={(c.presentes / RECINTO.quorum) * 100}
              ok={hayQuorum}
              pill={hayQuorum ? `quórum · margen +${c.presentes - RECINTO.quorum}` : `faltan ${RECINTO.quorum - c.presentes}`}
            />
            <Contador
              rotulo="A favor · mayoría de los votos emitidos"
              n={c.favor}
              meta={c.emitidos ? `de ${c.mayoria} · más de la mitad de ${c.emitidos}` : 'nadie votó'}
              pct={c.mayoria ? (c.favor / c.mayoria) * 100 : 0}
              ok={hayQuorum && c.favor >= c.mayoria}
              pill={
                !c.emitidos
                  ? 'sin votos'
                  : c.favor >= c.mayoria
                    ? `mayoría · margen +${c.favor - c.mayoria}`
                    : `faltan ${c.mayoria - c.favor}`
              }
            />
            <Contador
              rotulo="En contra · dos tercios"
              n={c.contra}
              meta={c.emitidos ? `en contra · 2/3 de ${c.emitidos} son ${c.dosTercios}` : 'nadie votó'}
              pct={c.emitidos ? (c.contra / c.emitidos) * 100 : 0}
              ok={c.emitidos > 0 && c.favor >= c.dosTercios}
              pill={
                !c.emitidos
                  ? 'sin votos'
                  : c.favor >= c.dosTercios
                    ? 'a favor supera los 2/3 (sobre tablas, insistencia)'
                    : `sin 2/3: faltan ${c.dosTercios - c.favor} a favor`
              }
            />
          </div>
          <Veredicto c={c} votos={votos} />
        </div>

        <div className="mf-presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="mf-preset"
              onClick={() => setVotos(desdePreset(p))}
            >
              {p.label}
            </button>
          ))}
          <p className="mf-ayuda">
            Escenarios de un toque. Lo marcado queda guardado en este navegador.
          </p>
        </div>

        <Hemiciclo votos={votos} onToggle={toggle} c={c} />

        <div className="mr-bloques">
          {ORDEN_BLOQUES.map((code) => (
            <Bloque key={code} code={code} votos={votos} onToggle={toggle} />
          ))}
        </div>

        <div className="mf-txt">
          <h2>Qué queda de la votación de 2024 en la Cámara de hoy</h2>
          <p className="md-tabla-nota">
            Bloque de hoy y cómo votaron sus integrantes el 2/2/2024. De los 144 que votaron a favor
            siguen {VOTACION.siguen.favor}; de los 109 en contra, {VOTACION.siguen.contra}. Entre los
            que siguen hay cambios de bloque: 9 que votaron a favor por el PRO hoy están en LLA, 6 de
            Hacemos Coalición Federal en Provincias Unidas y 5 de Innovación Federal en Argentina
            Federal; el tooltip de cada banca dice en qué bloque votó.
          </p>
          <div className="md-tabla-marco">
            <table className="md-tabla">
              <thead>
                <tr>
                  <th>Bloque de hoy</th>
                  <th>Bancas</th>
                  <th>A favor en 2024</th>
                  <th>En contra</th>
                  <th>Ausentes</th>
                  <th>Presidió</th>
                  <th>No estaban</th>
                </tr>
              </thead>
              <tbody>
                {DESDE_2024.map((f) => (
                  <tr key={f.code}>
                    <td>
                      <i className={`md-punto mr-b-${BLOQUES[f.code].clase}`} /> {f.bloque}
                    </td>
                    <td>{f.bancas}</td>
                    <td>{f.favor || ''}</td>
                    <td>{f.contra || ''}</td>
                    <td>{f.ausentes || ''}</td>
                    <td>{f.preside || ''}</td>
                    <td>{f.noestaba || ''}</td>
                  </tr>
                ))}
                <tr className="md-total">
                  <td>Total</td>
                  <td>{RECINTO.bancas}</td>
                  <td>{VOTACION.siguen.favor}</td>
                  <td>{VOTACION.siguen.contra}</td>
                  <td>{VOTACION.siguen.ausentes}</td>
                  <td>{VOTACION.siguen.preside}</td>
                  <td>{VOTACION.siguen.noestaba}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mf-txt">
          <h2>Quién cierra la votación</h2>
          <dl className="mf-kv">
            {QUIEN_CIERRA.map((f) => (
              <div className="mf-kv-fila" key={f.dt}>
                <dt>{f.dt}</dt>
                <dd>
                  <b>{f.b}</b> {f.t}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mf-txt">
          <h2>Qué decía el capítulo de biocombustibles que Diputados votó en 2024</h2>
          <ul>
            {LEY_BASES.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>

        <div className="mf-txt">
          <h2>Reglas que juegan en el recinto</h2>
          <ul>
            {REGLAS.map((r) => (
              <li key={r.b}>
                <b>{r.b}</b> {r.t}
              </li>
            ))}
          </ul>
        </div>

        <p className="mf-fuentes">
          Nómina bajada de hcdn.gob.ar el {RECINTO.verificado}; {RECINTO.pendiente}. Fuentes:{' '}
          {FUENTES.map((f, i) => (
            <span key={f.href}>
              <a href={f.href} target="_blank" rel="noopener noreferrer">
                {f.label}
              </a>
              {i < FUENTES.length - 1 ? ' · ' : '.'}
            </span>
          ))}{' '}
          El orden de las bancas en el hemiciclo es ilustrativo, de izquierda a derecha por bloque;
          no reproduce la ubicación real en el recinto.
        </p>
      </div>
    </div>
  );
}
