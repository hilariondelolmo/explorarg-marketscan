import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SectionNav from '../components/SectionNav.jsx';
import { SECCIONES_REFORMA } from '../lib/reforma.js';
import {
  RECINTO,
  BLOQUES,
  ORDEN_BLOQUES,
  SENADORES,
  PRESETS,
  QUIEN_CIERRA,
  PRENSA,
  REGLAS,
  FUENTES,
} from '../data/mapa-recinto.js';
import './PropuestaLey.css';
import './MapaFirmas.css';
import './MapaRecinto.css';

/**
 * Mapa del recinto: los 72 senadores en un hemiciclo, cada banca con tres
 * estados (ausente, presente a favor, presente en contra). Los contadores
 * aplican el Reglamento HSN: quórum de 37 (art. 16) y mayoría absoluta de
 * los presentes (art. 209). Sigue la votación en general del dictamen.
 *
 * Nómina, umbrales y textos viven en src/data/mapa-recinto.js.
 * Lo marcado se guarda en localStorage (por navegador).
 */
const CLAVE = 'explorarg-mapa-recinto-2026-09-09';

const ESTADOS = ['ausente', 'favor', 'contra'];
const ETIQUETA = { ausente: 'ausente', favor: 'presente, a favor', contra: 'presente, en contra' };

// ── geometría del hemiciclo ──────────────────────────────────────────────
// Cuatro filas con bancas proporcionales al radio, para que cada bloque
// ocupe una cuña pareja. Las bancas se ordenan por ángulo (de izquierda a
// derecha) y se asignan en el orden político de SENADORES.
const CX = 500;
const CY = 520;
const FILAS = [
  { n: 11, r: 200 },
  { n: 15, r: 290 },
  { n: 20, r: 380 },
  { n: 26, r: 470 },
];
const R_BANCA = 20;

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
    const valido = (id) => SENADORES.some((s) => s.id === id);
    (obj.favor || []).filter(valido).forEach((id) => m.set(id, 'favor'));
    (obj.contra || []).filter(valido).forEach((id) => m.set(id, 'contra'));
    return m;
  } catch {
    return null;
  }
}

function desdePreset(p) {
  const m = new Map();
  p.favor.forEach((id) => m.set(id, 'favor'));
  p.contra.forEach((id) => m.set(id, 'contra'));
  return m;
}

function mayoriaDe(presentes) {
  return presentes ? Math.floor(presentes / 2) + 1 : 0;
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
  const { presentes, favor, contra, mayoria } = c;

  if (presentes < RECINTO.quorum) {
    const ausentes = ORDEN_BLOQUES.map((code) => {
      const n = SENADORES.filter((s) => s.bloque === code && !votos.has(s.id)).length;
      return n ? `${BLOQUES[code].label} ${n}` : null;
    }).filter(Boolean);
    return (
      <p className="mf-veredicto">
        <strong>Sin quórum: faltan {RECINTO.quorum - presentes} para 37.</strong> La sesión no
        se abre. Ausentes: {ausentes.join(', ')}.
      </p>
    );
  }

  if (favor >= mayoria) {
    const margen = favor - mayoria;
    return (
      <p className="mf-veredicto">
        <strong>
          Dictamen aprobado en general: {favor} a {contra}.
        </strong>{' '}
        Mayoría de {mayoria} sobre {presentes} presentes, margen +{margen}.
        {margen === 0 && ' Sin margen: un voto que se da vuelta lo empata.'}
      </p>
    );
  }

  if (favor === contra) {
    return (
      <p className="mf-veredicto">
        <strong>Empate {favor} a {contra}.</strong> Se reabre la discusión y se repite la
        votación; si persiste, decide la Presidencia (art. 213).
      </p>
    );
  }

  return (
    <p className="mf-veredicto">
      <strong>
        Hay quórum pero el dictamen pierde: {favor} a {contra}.
      </strong>{' '}
      Faltan {mayoria - favor} para la mayoría de {mayoria} sobre {presentes} presentes.
    </p>
  );
}

function Banca({ s, banca, estado, onToggle, onHover }) {
  const clase = BLOQUES[s.bloque].clase;
  const titulo = `${s.completo} · ${s.provincia} · ${s.sub || BLOQUES[s.bloque].label} · ${ETIQUETA[estado]}`;
  return (
    <g
      className={`mr-banca mr-b-${clase} ${estado}`}
      transform={`translate(${banca.x.toFixed(1)} ${banca.y.toFixed(1)})`}
      role="button"
      tabIndex={0}
      aria-label={titulo}
      onClick={() => onToggle(s.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle(s.id);
        }
      }}
      onMouseEnter={() => onHover(s.id)}
      onFocus={() => onHover(s.id)}
    >
      <title>{titulo}</title>
      <circle r={R_BANCA} />
      {estado === 'favor' && (
        <path className="mr-marca" d="M-8 0.5 L-2.5 6 L8 -6" />
      )}
      {estado === 'contra' && (
        <path className="mr-marca" d="M-6 -6 L6 6 M6 -6 L-6 6" />
      )}
    </g>
  );
}

function Hemiciclo({ votos, onToggle, c }) {
  const [foco, setFoco] = useState(null);
  const s = foco ? SENADORES.find((x) => x.id === foco) : null;
  const estadoDe = (id) => votos.get(id) || 'ausente';

  return (
    <div className="mr-hemi">
      <svg
        viewBox="0 0 1000 548"
        className="mr-svg"
        role="group"
        aria-label="Hemiciclo del Senado: 72 bancas, tocá una para cambiar su estado"
      >
        {SENADORES.map((sen, i) => (
          <Banca
            key={sen.id}
            s={sen}
            banca={BANCAS[i]}
            estado={estadoDe(sen.id)}
            onToggle={onToggle}
            onHover={setFoco}
          />
        ))}
        <g className="mr-centro" transform={`translate(${CX} ${CY})`}>
          <text className="mr-centro-num favor" x="-82" y="-70">
            {c.favor}
          </text>
          <text className="mr-centro-rot" x="-82" y="-50">
            a favor
          </text>
          <text className="mr-centro-num contra" x="82" y="-70">
            {c.contra}
          </text>
          <text className="mr-centro-rot" x="82" y="-50">
            en contra
          </text>
          <text className="mr-centro-num" x="0" y="-8">
            {c.presentes}
          </text>
          <text className="mr-centro-rot" x="0" y="14">
            presentes · quórum {RECINTO.quorum}
          </text>
        </g>
      </svg>
      <p className="mr-foco" aria-live="polite">
        {s ? (
          <>
            <b>{s.completo}</b> · {s.provincia} · {s.sub || BLOQUES[s.bloque].label} ·{' '}
            {ETIQUETA[estadoDe(s.id)]}
          </>
        ) : (
          'Pasá el cursor por una banca para ver quién es; tocala para cambiar su estado.'
        )}
      </p>
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
        <span className="mr-ley-sep" />
        {ORDEN_BLOQUES.map((code) => (
          <span className="mr-ley-item" key={code}>
            <i className={`mr-ley-bloque mr-b-${BLOQUES[code].clase}`} />
            {BLOQUES[code].label} {SENADORES.filter((x) => x.bloque === code).length}
          </span>
        ))}
      </div>
    </div>
  );
}

function Senador({ s, estado, onToggle }) {
  return (
    <button
      type="button"
      className={`mf-sen mr-sen ${estado}`}
      aria-pressed={estado !== 'ausente'}
      title={`${s.completo} · ${ETIQUETA[estado]}`}
      onClick={() => onToggle(s.id)}
    >
      <span className="mf-sen-txt">
        <span className="mf-sen-n">{s.nombre}</span>
        <span className="mf-sen-s">
          {s.provincia}
          {s.sub ? ` · ${s.sub}` : ''}
        </span>
      </span>
    </button>
  );
}

function Bloque({ code, votos, onToggle }) {
  const miembros = SENADORES.filter((s) => s.bloque === code);
  const nf = miembros.filter((s) => votos.get(s.id) === 'favor').length;
  const nc = miembros.filter((s) => votos.get(s.id) === 'contra').length;
  return (
    <div className="mf-grupo">
      <div className="mf-grupo-cab">
        <span className={`mf-chip mf-chip-${BLOQUES[code].clase}`}>{BLOQUES[code].label}</span>
        <span className="mf-grupo-n">
          <b>{nf}</b> a favor · {nc} en contra · {miembros.length - nf - nc} ausentes
        </span>
      </div>
      <div className="mf-lista mr-lista">
        {miembros.map((s) => (
          <Senador key={s.id} s={s} estado={votos.get(s.id) || 'ausente'} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

export default function MapaRecinto() {
  const [votos, setVotos] = useState(() => leerGuardado() ?? desdePreset(PRESETS[0]));

  useEffect(() => {
    try {
      const favor = [];
      const contra = [];
      votos.forEach((v, id) => (v === 'favor' ? favor : contra).push(id));
      localStorage.setItem(CLAVE, JSON.stringify({ favor, contra }));
    } catch {
      /* modo privado */
    }
  }, [votos]);

  const toggle = (id) =>
    setVotos((prev) => {
      const sig = new Map(prev);
      const actual = sig.get(id) || 'ausente';
      const prox = ESTADOS[(ESTADOS.indexOf(actual) + 1) % ESTADOS.length];
      if (prox === 'ausente') sig.delete(id);
      else sig.set(id, prox);
      return sig;
    });

  const c = useMemo(() => {
    let favor = 0;
    let contra = 0;
    votos.forEach((v) => (v === 'favor' ? (favor += 1) : (contra += 1)));
    const presentes = favor + contra;
    return { favor, contra, presentes, mayoria: mayoriaDe(presentes) };
  }, [votos]);

  const dosTercios = Math.ceil((2 * c.presentes) / 3);
  const hayQuorum = c.presentes >= RECINTO.quorum;

  return (
    <div className="propuesta-ley mapa-firmas mapa-recinto">
      <SectionNav sections={SECCIONES_REFORMA} />
      <div className="marco pl-encabezado">
        <div className="kicker">Reforma Ley 27.640 · Recinto del Senado · sesión del 10/9/2026</div>
        <h1>Mapa del recinto</h1>
        <p className="bajada">
          Planilla para seguir la votación en general del dictamen de biocombustibles en el
          recinto del Senado. Son 72 bancas: la sesión se abre con 37 presentes (art. 16 del
          Reglamento) y el dictamen se aprueba con más de la mitad de los presentes (art.
          209). Tocá una banca del hemiciclo o un nombre de la lista para pasarlo de ausente a
          presente a favor, y de ahí a presente en contra. Las firmas del plenario de
          comisiones están en el <Link to="/mapa-firmas">Mapa de firmas</Link>.
        </p>
        <p className="mf-exptes">{RECINTO.dictamen}. {RECINTO.fecha}.</p>
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
              rotulo="A favor · mayoría de presentes"
              n={c.favor}
              meta={c.presentes ? `de ${c.mayoria} · más de la mitad de ${c.presentes}` : 'nadie presente'}
              pct={c.mayoria ? (c.favor / c.mayoria) * 100 : 0}
              ok={hayQuorum && c.favor >= c.mayoria}
              pill={
                !c.presentes
                  ? 'sin votos'
                  : c.favor >= c.mayoria
                    ? `mayoría · margen +${c.favor - c.mayoria}`
                    : `faltan ${c.mayoria - c.favor}`
              }
            />
            <Contador
              rotulo="En contra · dos tercios"
              n={c.contra}
              meta={c.presentes ? `en contra · 2/3 de ${c.presentes} son ${dosTercios}` : 'nadie presente'}
              pct={c.presentes ? (c.contra / c.presentes) * 100 : 0}
              ok={c.presentes > 0 && c.favor >= dosTercios}
              pill={
                !c.presentes
                  ? 'sin votos'
                  : c.favor >= dosTercios
                    ? 'a favor supera los 2/3 (sobre tablas)'
                    : `sin 2/3: faltan ${dosTercios - c.favor} a favor`
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
          <h2>Lo que decía la prensa al 9/9</h2>
          <ul>
            {PRENSA.map((t, i) => (
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
          Nómina verificada en senado.gob.ar el {RECINTO.verificado}:{' '}
          {FUENTES.map((f, i) => (
            <span key={f.href}>
              <a href={f.href} target="_blank" rel="noopener noreferrer">
                {f.label}
              </a>
              {i < FUENTES.length - 1 ? ' · ' : '.'}
            </span>
          ))}{' '}
          El orden de las bancas en el hemiciclo es ilustrativo, de izquierda a derecha por
          bloque; no reproduce la ubicación real en el recinto.
        </p>
      </div>
    </div>
  );
}
