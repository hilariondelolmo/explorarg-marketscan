import { useMemo, useState } from 'react';
import { fmt } from '../../lib/format.js';
import { FUENTE_39, MEDIA_SANCION, PERIODOS_39, calcularTopes } from '../../lib/dichoDato.js';

/**
 * Control "Tope, porcentaje y corte" (episodios 2, 9 y 14 de "Del dicho al
 * dato"; sirve también para el 4, el 12 y el 25): el artículo 39 a) de la
 * media sanción, con el máximo en toneladas y el porcentaje a elección.
 *
 * Tres perillas: el período del artículo 38 (cuánto manda la ley para el
 * segmento no integrado), el máximo en toneladas por empresa (50.000 t en la
 * media sanción; se puede mover o sacar) y el porcentaje por empresa y por
 * grupo (10%). Muestra cuánto puede vender cada empresa y cada grupo, cuánto
 * suma y cuánto falta o sobra contra lo que manda la ley.
 *
 * Con los valores de la media sanción da las cifras de los videos: 730.988 t
 * permitidas y 188.306 t de faltante el primer año (planilla «Art. 39» rev. 1).
 *
 * Colores, por la regla de HDO del 11/11/2026: el 10% no es el problema y no
 * va en rojo; en rojo, solo lo que saca el máximo en toneladas.
 */
const MAX_MIN = 20000;
const MAX_MAX = 100000;
const t = (v) => `${fmt.int(v)} t`;
const pctTexto = (v) => `${v.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
const lista = (nombres) => (nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : nombres[0] || '');

export default function ControlTope() {
  const [periodoId, setPeriodoId] = useState(PERIODOS_39[0].id);
  const [conMaximo, setConMaximo] = useState(true);
  const [maximo, setMaximo] = useState(MEDIA_SANCION.maximo);
  const [pct, setPct] = useState(MEDIA_SANCION.pct);

  const r = useMemo(
    () => calcularTopes({ periodoId, maximo: conMaximo ? maximo : null, pct }),
    [periodoId, conMaximo, maximo, pct],
  );
  const esMediaSancion = conMaximo && maximo === MEDIA_SANCION.maximo && pct === MEDIA_SANCION.pct;
  const restablecer = () => {
    setConMaximo(true);
    setMaximo(MEDIA_SANCION.maximo);
    setPct(MEDIA_SANCION.pct);
  };

  const escala = Math.max(...r.filas.map((f) => f.capacidad));
  const afectadas = r.filas.filter((f) => f.saca > 0.5);
  const mismaPerdida = afectadas.length > 0 && afectadas.every((f) => Math.abs(f.saca - afectadas[0].saca) < 1);
  const falta = r.saldo < -0.5;

  return (
    <div className="dd-control">
      <div className="dd-perillas">
        <div className="dd-perilla dd-perilla-ancha">
          <span className="dd-perilla-rotulo">Período de la ley (artículo 38): corte reservado a las no integradas</span>
          <div className="dd-seg">
            {PERIODOS_39.map((p) => (
              <button key={p.id} type="button" className={periodoId === p.id ? 'activo' : ''} aria-pressed={periodoId === p.id} onClick={() => setPeriodoId(p.id)}>
                {p.label} <span className="dd-seg-n">{pctTexto(p.ni)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="dd-perilla">
          <label className="dd-perilla-rotulo" htmlFor="dd-maximo">
            Máximo en toneladas por empresa: <b>{conMaximo ? t(maximo) : 'sin máximo'}</b>
          </label>
          <div className="dd-perilla-fila">
            <input
              id="dd-maximo" type="range" min={MAX_MIN} max={MAX_MAX} step={5000} value={maximo} disabled={!conMaximo}
              onChange={(e) => setMaximo(Number(e.target.value))}
            />
            <div className="dd-seg">
              <button type="button" className={conMaximo ? 'activo' : ''} aria-pressed={conMaximo} onClick={() => setConMaximo(true)}>Con máximo</button>
              <button type="button" className={!conMaximo ? 'activo' : ''} aria-pressed={!conMaximo} onClick={() => setConMaximo(false)}>Sin máximo</button>
            </div>
          </div>
        </div>

        <div className="dd-perilla">
          <label className="dd-perilla-rotulo" htmlFor="dd-pct">
            Porcentaje por empresa y por grupo: <b>{pctTexto(pct)}</b> <span>= {t(r.limite)}</span>
          </label>
          <div className="dd-perilla-fila">
            <input id="dd-pct" type="range" min={5} max={20} step={0.5} value={pct} onChange={(e) => setPct(Number(e.target.value))} />
            <button type="button" className="dd-boton" onClick={restablecer} disabled={esMediaSancion}>
              Volver a la media sanción
            </button>
          </div>
        </div>
      </div>

      <div className="dd-cifras" aria-live="polite">
        <div className="dd-cifra">
          <span className="dd-cifra-rotulo">La ley manda</span>
          <span className="dd-cifra-valor">{t(r.periodo.segmento)}</span>
          <span className="dd-cifra-nota">{pctTexto(r.periodo.ni)} del gas oil, {r.periodo.label.toLowerCase()}</span>
        </div>
        <div className="dd-cifra">
          <span className="dd-cifra-rotulo">Los topes dejan vender</span>
          <span className="dd-cifra-valor">{t(r.permitido)}</span>
          <span className="dd-cifra-nota">corte posible: {r.cortePosible.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% del gas oil</span>
        </div>
        <div className={`dd-cifra ${falta ? 'dd-cifra-alerta' : ''}`}>
          <span className="dd-cifra-rotulo">{falta ? 'Falta' : 'Sobra'}</span>
          <span className="dd-cifra-valor">{t(Math.abs(r.saldo))}</span>
          <span className="dd-cifra-nota">
            {falta ? 'el artículo 39 b) se las abre a las integradas' : 'las no integradas pueden cubrir todo el segmento'}
          </span>
        </div>
      </div>

      <p className="dd-lectura">
        {esMediaSancion && <b>Así quedó en la media sanción. </b>}
        {!conMaximo && `Sin el máximo en toneladas, la empresa sola y el grupo económico tienen el mismo límite: ${pctTexto(pct)}, ${t(r.limite)}.`}
        {conMaximo && afectadas.length === 0 && `Con un máximo de ${t(maximo)} y ${pctTexto(pct)}, el máximo no le saca nada a nadie: a todas las frena antes su capacidad o el porcentaje.`}
        {conMaximo && afectadas.length > 0 && mismaPerdida &&
          `El máximo de ${t(maximo)} ${afectadas.length > 1 ? `les saca ${t(afectadas[0].saca)} a cada una de` : `le saca ${t(afectadas[0].saca)} a`} ${lista(afectadas.map((f) => f.nombre))}. Un grupo económico puede vender hasta ${t(r.limite)}.`}
        {conMaximo && afectadas.length > 0 && !mismaPerdida &&
          `El máximo de ${t(maximo)} les saca ${t(afectadas.reduce((s, f) => s + f.saca, 0))} en total a ${lista(afectadas.map((f) => f.nombre))}. Un grupo económico puede vender hasta ${t(r.limite)}.`}
      </p>

      <div className="dd-barras" role="table" aria-label="Cuánto puede vender cada empresa y cada grupo">
        {r.filas.map((f) => (
          <div className="dd-barra-fila" role="row" key={f.nombre}>
            <span className="dd-barra-nombre" role="cell">
              {f.nombre}
              <small>{f.tipo === 'grupo' ? `Grupo económico · ${f.detalle}` : 'Empresa no integrada independiente'}</small>
            </span>
            <span className="dd-barra-pista" role="cell" aria-hidden="true">
              <span className="dd-barra-cap" style={{ width: `${(f.capacidad / escala) * 100}%` }} />
              <span className="dd-barra-saca" style={{ left: `${(f.puede / escala) * 100}%`, width: `${(f.saca / escala) * 100}%` }} />
              <span className="dd-barra-puede" style={{ width: `${(f.puede / escala) * 100}%` }} />
            </span>
            <span className="dd-barra-valor" role="cell">
              <b>{t(f.puede)}</b>
              <small>
                {Math.round((f.puede / f.capacidad) * 100)}% de sus {t(f.capacidad)}
                {f.saca > 0.5 && <i> · el máximo le saca {t(f.saca)}</i>}
              </small>
            </span>
          </div>
        ))}
      </div>
      <div className="dd-leyenda">
        <span><i className="dd-muestra dd-muestra-puede" /> Lo que puede vender</span>
        <span><i className="dd-muestra dd-muestra-saca" /> Lo que le saca el máximo en toneladas</span>
        <span><i className="dd-muestra dd-muestra-cap" /> Capacidad de la planta o del grupo</span>
      </div>

      <p className="dd-fuente">
        Media sanción del Senado (CD-76/26), artículos 38 y 39 a): la empresa, {pctTexto(MEDIA_SANCION.pct)} con un máximo de {t(MEDIA_SANCION.maximo)}; el grupo
        económico, {pctTexto(MEDIA_SANCION.pct)} sin máximo en toneladas. El porcentaje se aplica al biodiésel del segmento no integrado de cada período, sobre
        13.850.000 m³ de gas oil por año. Capacidad de las 24 no integradas que venden al corte: {FUENTE_39}.
      </p>
    </div>
  );
}
