import { useEffect, useMemo, useState } from 'react';
import SectionNav from '../components/SectionNav.jsx';
import { SECCIONES_REFORMA } from '../lib/reforma.js';
import {
  PLENARIO,
  COMISIONES,
  BLOQUES,
  ORDEN_BLOQUES,
  SENADORES,
  PRESETS,
  QUIEN_CIERRA,
  PRENSA,
  REGLAS,
  FUENTES,
} from '../data/mapa-firmas.js';
import './PropuestaLey.css';
import './MapaFirmas.css';

/**
 * Mapa de firmas: planilla interactiva para seguir el plenario de las
 * Comisiones de Minería, Energía y Combustibles y de Presupuesto y
 * Hacienda (03/09/2026). Cada integrante es un botón; los contadores
 * aplican el art. 105 del Reglamento (más de la mitad de los miembros
 * reglamentarios de cada comisión, vacantes incluidas en la base). Los
 * senadores que integran ambas comisiones cuentan en las dos.
 *
 * Composición, umbrales y textos viven en src/data/mapa-firmas.js.
 * Lo marcado se guarda en localStorage (por navegador).
 */
const CLAVE = 'explorarg-mapa-firmas-2026-09-03';

function leerGuardado() {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return new Set(arr.filter((id) => SENADORES.some((s) => s.id === id)));
  } catch {
    return null;
  }
}

function Contador({ com, n }) {
  const ok = n >= com.mayoria;
  const pct = Math.min(100, Math.round((n / com.mayoria) * 100));
  return (
    <div className={`mf-contador ${ok ? 'ok' : ''}`}>
      <span className="mf-contador-rotulo">{com.nombre}</span>
      <span className="mf-contador-num">
        {n}{' '}
        <small>
          de {com.mayoria} · {com.bancas} bancas
        </small>
      </span>
      <div className="mf-barra">
        <i style={{ width: `${pct}%` }} />
      </div>
      <span className="mf-pill">
        {ok ? `alcanzado · margen +${n - com.mayoria}` : `faltan ${com.mayoria - n}`}
      </span>
    </div>
  );
}

function Veredicto({ conteo, firmas }) {
  const faltaA = Math.max(0, COMISIONES.A.mayoria - conteo.a);
  const faltaB = Math.max(0, COMISIONES.B.mayoria - conteo.b);

  if (!faltaA && !faltaB) {
    const mA = conteo.a - COMISIONES.A.mayoria;
    const mB = conteo.b - COMISIONES.B.mayoria;
    let cola = '';
    if (!mA && !mB) cola = ' Sin margen en ninguna: cualquier baja lo voltea.';
    else if (!mA) cola = ' Sin margen en Minería.';
    else if (!mB) cola = ' Sin margen en Presupuesto.';
    return (
      <p className="mf-veredicto">
        <strong>Dictamen de mayoría alcanzado.</strong> Margen: Minería +{mA}, Presupuesto +
        {mB}.{cola}
      </p>
    );
  }

  const nombres = (filtro) =>
    SENADORES.filter((s) => filtro(s) && !firmas.has(s.id))
      .map((s) => s.nombre)
      .join(', ');
  const dobles = nombres((s) => s.a && s.b);
  const soloA = nombres((s) => s.a);
  const soloB = nombres((s) => s.b);

  return (
    <p className="mf-veredicto">
      <strong>
        Faltan {faltaA} en Minería y {faltaB} en Presupuesto.
      </strong>
      {faltaA > 0 && faltaB > 0 && dobles && <> Una sola firma cubre ambas: {dobles}.</>}
      {faltaA > 0 && faltaB === 0 && soloA.split(', ').length <= 7 && (
        <> Disponibles en Minería: {soloA}.</>
      )}
      {faltaB > 0 && faltaA === 0 && soloB.split(', ').length <= 7 && (
        <> Disponibles en Presupuesto: {soloB}.</>
      )}
    </p>
  );
}

function Senador({ s, campo, firmado, onToggle }) {
  const rol = s[campo];
  return (
    <button
      type="button"
      className={`mf-sen ${firmado ? 'firmado' : ''}`}
      aria-pressed={firmado}
      onClick={() => onToggle(s.id)}
    >
      <span className="mf-sen-txt">
        <span className="mf-sen-n">{s.nombre}</span>
        <span className="mf-sen-s">
          {s.provincia}
          {rol && rol !== 'vocal' ? ` · ${rol}` : ''}
        </span>
      </span>
      {s.a && s.b && (
        <span className="mf-x2" title="Integra las dos comisiones">
          ×2
        </span>
      )}
    </button>
  );
}

function Comision({ com, campo, firmas, onToggle }) {
  const designadas = SENADORES.filter((s) => s[campo]).length;
  return (
    <div className="mf-com">
      <h2>{com.nombre}</h2>
      <p className="mf-com-sub">
        {com.bancas} bancas · {designadas} designadas · mayoría {com.mayoria} · preside{' '}
        {com.preside}
      </p>
      {ORDEN_BLOQUES.map((code) => {
        const miembros = SENADORES.filter((s) => s.bloque === code && s[campo]);
        if (!miembros.length) return null;
        const n = miembros.filter((s) => firmas.has(s.id)).length;
        return (
          <div className="mf-grupo" key={code}>
            <div className="mf-grupo-cab">
              <span className={`mf-chip mf-chip-${BLOQUES[code].clase}`}>{BLOQUES[code].label}</span>
              <span className="mf-grupo-n">
                <b>{n}</b>/{miembros.length}
              </span>
            </div>
            <div className="mf-lista">
              {miembros.map((s) => (
                <Senador
                  key={s.id}
                  s={s}
                  campo={campo}
                  firmado={firmas.has(s.id)}
                  onToggle={onToggle}
                />
              ))}
            </div>
          </div>
        );
      })}
      <div className="mf-grupo mf-vacantes">
        <div className="mf-grupo-cab">
          <span className="mf-chip mf-chip-vac">Vacantes · bloque Justicialista</span>
          <span className="mf-grupo-n">{com.vacantes} bancas</span>
        </div>
        <div className="mf-vac-fila" style={{ gridTemplateColumns: `repeat(${com.vacantes}, 1fr)` }}>
          {Array.from({ length: com.vacantes }, (_, i) => (
            <i key={i} />
          ))}
        </div>
        <p className="mf-vac-nota">
          Sin ocupar. Cuentan en la base del art. 105: por eso la mayoría es {com.mayoria} y no{' '}
          {Math.floor(designadas / 2) + 1}.
        </p>
      </div>
    </div>
  );
}

export default function MapaFirmas() {
  const [firmas, setFirmas] = useState(() => leerGuardado() ?? new Set(PRESETS[0].ids));

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify([...firmas]));
    } catch {
      /* modo privado */
    }
  }, [firmas]);

  const toggle = (id) =>
    setFirmas((prev) => {
      const sig = new Set(prev);
      if (sig.has(id)) sig.delete(id);
      else sig.add(id);
      return sig;
    });

  const conteo = useMemo(() => {
    let a = 0;
    let b = 0;
    SENADORES.forEach((s) => {
      if (!firmas.has(s.id)) return;
      if (s.a) a += 1;
      if (s.b) b += 1;
    });
    return { a, b };
  }, [firmas]);

  return (
    <div className="propuesta-ley mapa-firmas">
      <SectionNav sections={SECCIONES_REFORMA} />
      <div className="marco pl-encabezado">
        <div className="kicker">Reforma Ley 27.640 · Plenario de comisiones · 03/09/2026</div>
        <h1>Mapa de firmas</h1>
        <p className="bajada">
          Planilla para seguir el plenario de las Comisiones de Minería, Energía y
          Combustibles y de Presupuesto y Hacienda del Senado ({PLENARIO.fecha}). El
          dictamen de mayoría exige la firma de más de la mitad de los miembros
          reglamentarios de cada comisión (art. 105 del Reglamento): 10 de 19 y 9 de 17,
          con las bancas vacantes contadas en la base. Tocá un nombre para marcar su
          firma; los senadores con ×2 integran las dos comisiones y cuentan en ambas.
        </p>
        <p className="mf-exptes">Expedientes en tratamiento: {PLENARIO.expedientes}.</p>
      </div>

      <div className="marco pl-marco">
        <div className="mf-tally" aria-live="polite">
          <div className="mf-contadores">
            <Contador com={COMISIONES.A} n={conteo.a} />
            <Contador com={COMISIONES.B} n={conteo.b} />
          </div>
          <Veredicto conteo={conteo} firmas={firmas} />
        </div>

        <div className="mf-presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="mf-preset"
              onClick={() => setFirmas(new Set(p.ids))}
            >
              {p.label}
            </button>
          ))}
          <p className="mf-ayuda">
            Escenarios de un toque. Lo marcado queda guardado en este navegador.
          </p>
        </div>

        <div className="mf-cols">
          <Comision com={COMISIONES.A} campo="a" firmas={firmas} onToggle={toggle} />
          <Comision com={COMISIONES.B} campo="b" firmas={firmas} onToggle={toggle} />
        </div>

        <div className="mf-txt">
          <h2>Quién cierra el dictamen</h2>
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
          <h2>Lo que decía la prensa el 2/9</h2>
          <ul>
            {PRENSA.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>

        <div className="mf-txt">
          <h2>Reglas que juegan en el plenario</h2>
          <ul>
            {REGLAS.map((r) => (
              <li key={r.b}>
                <b>{r.b}</b> {r.t}
              </li>
            ))}
          </ul>
        </div>

        <p className="mf-fuentes">
          Composición verificada en senado.gob.ar el {PLENARIO.verificado}:{' '}
          {FUENTES.map((f, i) => (
            <span key={f.href}>
              <a href={f.href} target="_blank" rel="noopener noreferrer">
                {f.label}
              </a>
              {i < FUENTES.length - 1 ? ' · ' : '.'}
            </span>
          ))}{' '}
          Prensa: Infobae 26/8 y 1/9, El Economista 2/9, El Cronista 2/9, Infocampo 26/8.
        </p>
      </div>
    </div>
  );
}
