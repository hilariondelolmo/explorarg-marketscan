import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './anexoGonzalez.css';

/**
 * Anexo 1 de "Qué se discute y qué se juega en Diputados": "Lo que dijo González y
 * lo que dicen los datos" (plenario de Minería y Presupuesto del Senado,
 * 3/6/2026). Las nueve afirmaciones de Daniel González, secretario de
 * Coordinación de Energía y Minería (la 0 se sumó el 20/10/2026: el porqué
 * del corte según los fundamentos del S-809), con la cita literal, el
 * veredicto y la lámina completa de la serie (public/evidencia/gonzalez/, las
 * mismas del video) en un pop-up. Textos de las láminas del 13 y el 20/10/2026
 * (borrador, HDO los revisa en la página). Pedido de HDO, 19/10/2026.
 */
const IMG = (n) => `/evidencia/gonzalez/gonzalez_afirmacion_0${n}.png`;

export const AFIRMACIONES = [
  { n: 0, tema: 'El porqué del corte', minuto: '0:34',
    cita: 'Ese proyecto implica un aumento del corte de dos puntos y medio en el biodiésel y de tres puntos en el etanol. Como todo proyecto que implica un aumento de corte de biocombustibles, tiene ganadores, perdedores, afectados. El sector que más nos importa a nosotros, del Ejecutivo, es el consumidor.',
    veredicto: 'No dice por qué se sube el corte; los fundamentos del S-809 sí: menos emisiones y precio protegido de la volatilidad. El ganador es la sociedad, es decir el consumidor. Y una ley no tiene que elegir perdedores.' },
  { n: 1, tema: 'El precio del biodiésel', minuto: '1:12',
    cita: 'El biodiésel tiene un costo muchísimo más alto que el fósil con el cual se mezcla. Antes de esta suba del precio del petróleo estábamos hablando de una diferencia de 80% por arriba del fósil. Ahora estamos en un número menor, pero todavía sustancialmente más alto.',
    veredicto: 'Contra el gas oil fósil que se mezcla era 50%, no 80%. Y el día que habló, 1%.' },
  { n: 2, tema: 'Duplicar el corte', minuto: '1:53',
    cita: 'No vemos lógica en duplicar el corte de biodiésel, como proponen algunos proyectos, porque eso implica un aumento en términos reales, estructural y permanente del gasoil que se consume en todo el país. Eso implica un mayor costo para el transporte, para el agro y para los consumidores finales.',
    veredicto: 'Antes de la suba, el doble de corte subía el surtidor 1,6%. El día que habló, lo bajaba 0,9%.' },
  { n: 3, tema: 'El fisco', minuto: '2:43',
    cita: 'Recuerden que los biocombustibles están exentos, entonces cualquier aumento de corte tiene un impacto inmediato negativo en los ingresos del Estado nacional.',
    veredicto: 'El impuesto que el fisco deja de cobrar es el que el consumidor deja de pagar. No pueden perder los dos a la vez.' },
  { n: 4, tema: 'Bioetanol', minuto: '2:57',
    cita: 'El etanol, su costo, a diferencia del biodiésel, es equivalente al costo del fósil con el cual se mezcla, con lo cual no hay un efecto negativo del aumento del corte en el consumidor de nafta.',
    veredicto: 'No es equivalente: por litro vale 23% menos y por energía 16% más. Y los 3 puntos los paga el fisco o el consumidor.' },
  { n: 5, tema: 'El 10%', minuto: '3:48',
    cita: 'Lo que se propone en este proyecto, y que nosotros apoyamos, es un corte del 10%. Es un gran equilibrio entre conceder un beneficio a los productores de biodiésel y de las materias primas, un impacto fiscal moderado y un aumento del costo del gasoil muy moderado. Por eso queremos limitarlo en ese nivel.',
    veredicto: 'Entre 10% y 15% el surtidor se mueve 1% en el peor mes y baja en mayo. El "beneficio" les saca 30% a las no integradas.' },
  { n: 6, tema: 'Cupos y competencia', minuto: '4:18',
    cita: 'El otro problema que tiene la ley actual es que funciona con cupos. Nosotros no creemos en cupos, creemos en la competencia. En el biodiésel, que esa competencia se vaya dando en el tiempo con una reducción gradual de los cupos en cinco años.',
    veredicto: 'El texto que apoya asigna cupos con topes por ley hasta 2036. Y la competencia la abre de un solo lado: el de los que venden, no el de los cuatro que compran.' },
  { n: 7, tema: 'Ganadores y perdedores', minuto: '5:02',
    cita: 'Entendemos que esto es sumamente difícil, que hay ganadores y perdedores. Se me hace difícil imaginar un proyecto de mayor consenso que este, entendiendo que el consenso absoluto no va a existir. Los productores del biodiésel, algunos más y otros menos, pero no están totalmente alineados.',
    veredicto: 'Los perdedores no los hace el corte: los eligen los topes y las definiciones (arts. 36 y 39). Y el "mayor consenso" salió 41 a 25.' },
  { n: 8, tema: 'Mezcla estable', minuto: '5:43',
    cita: 'Las compañías automotrices tienen que calibrar motores para una mezcla que tiene que ser predecible y estable. Por eso, lo que se propone en este proyecto de ley, de que estas mezclas mínimas permanezcan por 15 años, también nos parece una buena idea.',
    veredicto: 'El mismo texto deja cambiar el corte "cuando lo considere conveniente" (art. 12). La mezcla cambió 12 veces desde 2010 y se cumplió 3 años de 16.' },
];

/* Pop-up con una lámina entera (mismo marco que "Leer el texto") */
function LaminaPopup({ src, titulo, onClose }) {
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
    <div className="esq-popup" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="esq-popup-fondo" onClick={onClose} />
      <div className="esq-popup-panel agz-popup-panel">
        <div className="esq-popup-cabecera">
          <span className="esq-popup-kicker">La lámina</span>
          <button type="button" className="esq-popup-cerrar" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <h3 className="esq-popup-titulo">{titulo}</h3>
        <img className="agz-popup-img" src={src} alt={titulo} />
      </div>
    </div>,
    document.body,
  );
}

function Tarjeta({ a }) {
  const [abierta, setAbierta] = useState(false);
  const titulo = `Afirmación ${a.n} · ${a.tema}`;
  return (
    <article className="agz-card">
      <div className="agz-card-cab">
        <span className="agz-card-kicker">Afirmación {a.n} · {a.tema}</span>
        <span className="agz-card-min">minuto {a.minuto}</span>
      </div>
      <blockquote className="agz-cita">
        <span className="agz-comillas" aria-hidden="true">“</span>
        {a.cita}
      </blockquote>
      <div className="agz-quien">Daniel González, secretario de Coordinación de Energía y Minería</div>
      <div className="agz-veredicto">
        <span className="agz-sello" aria-label="Veredicto: falso">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" strokeWidth="2" /></svg>
          FALSO
        </span>
        <p>{a.veredicto}</p>
      </div>
      <button type="button" className="agz-lamina" onClick={() => setAbierta(true)} aria-label={`Ver la lámina: ${titulo}`}>
        <img src={IMG(a.n)} alt="" loading="lazy" />
        <span className="agz-lamina-rotulo">Ver la lámina con los datos</span>
      </button>
      {abierta && <LaminaPopup src={IMG(a.n)} titulo={titulo} onClose={() => setAbierta(false)} />}
    </article>
  );
}

export default function AnexoGonzalez() {
  const [contexto, setContexto] = useState(false);
  return (
    <div className="agz">
      <div className="agz-contexto">
        <p>
          El 3 de junio de 2026 el Poder Ejecutivo fijó posición ante el plenario de Minería y Presupuesto del Senado, con siete
          proyectos de biocombustibles en el temario. Habló <b>Daniel González</b>, secretario de Coordinación de Energía y
          Minería, seis minutos: el Gobierno apoya el <b>S-809 de la senadora Bullrich</b>, “con los lineamientos con los que
          venimos trabajando hace casi dos años”.
        </p>
        <p>
          Cada afirmación del secretario se contrasta con el texto que apoyó, con la media sanción y con los datos públicos de la
          Secretaría de Energía procesados en explorarg.com.
        </p>
        <button type="button" className="agz-contexto-boton" onClick={() => setContexto(true)}>
          Ver el contexto: el mercado del que habló
        </button>
        {contexto && (
          <LaminaPopup src="/evidencia/gonzalez/gonzalez_apertura.png" titulo="El contexto: quién habla y sobre qué" onClose={() => setContexto(false)} />
        )}
      </div>

      <div className="agz-marcador" role="note">
        <span className="agz-marcador-n">9</span>
        <span className="agz-marcador-texto">afirmaciones, contrastadas una por una con los datos</span>
        <span className="agz-marcador-n agz-marcador-rojo">9</span>
        <span className="agz-marcador-texto">sellos: <b>FALSO</b></span>
      </div>

      <div className="agz-grilla">
        {AFIRMACIONES.map((a) => <Tarjeta key={a.n} a={a} />)}
      </div>

      <p className="agz-pie">
        Fuentes: plenario del 3/6/2026 (Senado Argentina, YouTube); S-809/26 inicial y media sanción del 17/9/2026; Secretaría de
        Energía (precios Res. 963, relevamiento Res. 1104, ventas al corte, cumplimiento del corte), procesada en explorarg.com.
        El detalle de cada cuenta está en la lámina.
      </p>
    </div>
  );
}
