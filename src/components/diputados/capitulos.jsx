import { Link } from 'react-router-dom';
import DiagramaMercado from './DiagramaMercado.jsx';
import GraficoCorte from './GraficoCorte.jsx';
import * as E from './esquemas.jsx';
import * as ED from './esquemasDatos.jsx';

/**
 * Texto del artículo "Biodiésel en la Argentina: qué pasa y qué se juega en
 * Diputados" (Hilarión Del Olmo, 13/10/2026), literal del Word de HDO,
 * repartido en capítulos. Cada capítulo lleva su color (paleta del artículo
 * de Reforma), la frase del propio artículo que lo presenta en el índice y
 * el cuerpo. Las cifras son las del artículo (datos a agosto de 2026,
 * precios a septiembre) y no se mueven con los tableros.
 *
 * `armarCapitulos(esquemas)`: con `esquemas` en true intercala entre los
 * párrafos los bloques, flujos y gráficos de esquemas.jsx (la versión
 * "con esquemas" del menú de Diputados); el texto es el mismo.
 */

// Fecha que lleva la página (HDO, 19/10/2026); el Word original es del 13/10
export const FECHA = '19 de octubre de 2026';

export const APERTURA =
  'La Argentina tiene un mercado de biodiésel partido en dos desde que existe: las integradas, que tienen el aceite y exportan, y las no integradas, que compran el aceite y solo pueden vender al corte obligatorio del gas oil. En dieciséis años el Estado fijó ese corte y lo cumplió en tres: faltaron 2,6 millones de toneladas. La media sanción que el Senado votó el 17 de septiembre de 2026 sube el corte y lo hace todo biodiésel, pero con los topes que escribió las no integradas no pueden abastecer lo que la misma ley les manda: 6,0% posible contra 7,5% obligatorio el primer año. El expediente está en Diputados sin dictamen. Este artículo cuenta cómo funciona el mercado, cómo se llegó hasta acá, qué cambia la ley nueva y qué habría que corregir.';

export const BAJADA =
  'Cómo funciona el mercado, cómo se llegó hasta acá, qué cambia la ley nueva y qué habría que corregir.';

export const CIERRE = [
  'La ley nueva corrige una cosa importante: el corte sube a 10% y es todo biodiésel. Lo demás lo empeora, y lo empeora para el mismo lado que ya perdía con la ley vieja. Para que un mercado asigne por competencia hacen falta dos cosas: oferta superior a la demanda y libre competencia, que no es lo mismo que libre contratación. Con los topes del artículo 39 no hay lo primero. Con el "acuerdo mutuo" del artículo 14 no hay lo segundo.',
  'Si Diputados aprueba el texto como está, el resultado está escrito antes de jugar: un faltante de una de cada cinco toneladas el primer año, un precio que sube hasta la paridad de importación, un segmento no integrado que las aceiteras pueden comprar de a 50.000 toneladas y un consumidor que paga la diferencia. Si lo corrige, son ocho cambios en cinco artículos.',
  'La ley declara en su artículo 2 que la actividad es de interés público. Declararlo obliga primero a quien lo declara.',
];

// Paleta del artículo de Reforma (ReformaLey.css la lleva al tema oscuro)
const VIOLETA = { acc: '#3C3489', borde: '#534AB7', bg: '#EEEDFE' };
const AMBAR = { acc: '#6E4712', borde: '#8A5A19', bg: '#FAF1E2' };
const GRIS = { acc: '#444441', borde: '#5F5E5A', bg: '#F1EFE8' };
const ROSA = { acc: '#72243E', borde: '#993556', bg: '#FBEAF0' };
const CORAL = { acc: '#712B13', borde: '#993C1D', bg: '#FAECE7' };
const VERDE = { acc: '#085041', borde: '#0F6E56', bg: '#E1F5EE' };

function Tabla({ cab, filas, min }) {
  return (
    <div className="dip-tabla-scroll">
      <table style={min ? { minWidth: min } : undefined}>
        <thead>
          <tr>{cab.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>{f.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CAMBIOS = [
            ['39 a) i y ii', '10% por empresa con máximo de 50.000 t; 10% por grupo sin máximo', 'Eliminar las 50.000 t. Un mismo porcentaje para la empresa y para el grupo, sobre el segmento no integrado: 11,5% el primer año, 10,5% el segundo y 9,5% desde entonces'],
            ['39 b)', 'El faltante "podrá" pasar al total del mercado', 'El faltante del segmento se ofrece primero entre no integradas; los topes ceden solo por ese volumen; pasa al total del mercado solo lo que no tenga oferta a paridad o menos'],
            ['12', 'La autoridad puede reducir el corte', 'Reducción solo con causa acreditada, por seis meses, sin tocar el segmento no integrado. Incorporar el biodiésel de segunda generación, el que certifica 90% o más de reducción de emisiones: computa doble para el corte, con un máximo fijado en la ley'],
            ['14', 'Subasta sujeta al "acuerdo mutuo" y a la modalidad que fije la autoridad', 'Subasta como único mecanismo de adjudicación, sin que la autoridad pueda usar otro'],
            ['15', 'Contratos a término por fuera del mercado', 'Solo en el mercado electrónico, por subasta, hasta seis meses y fuera del segmento no integrado'],
            ['36 a) y b)', 'Integrada = más de 50.000 t y aceitera', 'Integrada es la que elabora el aceite, por sí o por su grupo, cualquiera sea su capacidad. Enresa y Pampa Bio, como excepción expresa y fundada'],
            ['39 a) iv', 'Regiones obligatorias, 20%, sin definir', 'Regiones definidas en la ley, o ninguna'],
            ['35 y 38', 'La transición termina por fecha, en 2036', 'Termina cuando la Autoridad Nacional de la Competencia verifique que hay competencia'],
            ['40', 'Derogación inmediata de la ley 27.640', 'Derogación cuando el mercado nuevo esté operativo, con un máximo de doce meses'],
];

// Párrafos de "El mercado en una página": en flujo en la versión de texto, en el
// pop-up de cada cuadro en la versión con esquemas.
const MERCADO = {
  p1: <p>El biodiésel argentino son dos negocios distintos que comparten el nombre. El primero es la exportación: seis plantas integradas, propiedad de las grandes aceiteras del Gran Rosario (LDC, Renova, T6, Cargill, COFCO y Patagonia Bioenergía), con 2,6 millones de toneladas de capacidad, que muelen su propio poroto y venden el biodiésel afuera. El segundo es el corte obligatorio: la ley obliga a mezclar biodiésel en todo el gas oil que se vende en el país, y ese volumen se reparte por cupo entre las elaboradoras que no exportan y no tienen aceitera: las no integradas.</p>,
  p2: <p>Las no integradas son 24 plantas en cinco provincias (Santa Fe, Buenos Aires, Entre Ríos, La Pampa y San Luis) con 1,3 millones de toneladas de capacidad. Le compran el aceite de soja, que es el 76% de su costo, a las mismas aceiteras que compiten con ellas en el biodiésel. Veintiuna tienen 50.000 toneladas o menos; solo tres son más grandes: Unitec Bio (240.000 t), Explora (120.000 t) y Diaser (96.000 t).</p>,
  p3: <p>El corte funciona así. El país vende unos 13,8 millones de metros cúbicos de gas oil por año, así que cada punto de corte son unas 122.500 toneladas de biodiésel. La Secretaría de Energía asigna cada mes un cupo a cada elaboradora y fija el precio con la fórmula de la Resolución 963/2023: en septiembre de 2026, 2.012.598 pesos por tonelada, unos 1.336 dólares. Las elaboradoras le venden a los mezcladores, que son las petroleras obligadas a mezclar. Del lado de la compra hay cuatro empresas que concentran el 99% del volumen, y una sola, YPF, compra el 60%.</p>,
  p4: <p>Al corte venden hoy 25 empresas. Tres de ellas tienen aceitera propia o del mismo grupo: Patagonia Bioenergía, Enresa y, según la información pública disponible, Pampa Bio. Las otras 22 son pymes que compran todo su aceite. Entre las no integradas hay cuatro grupos económicos con más de una planta: el Grupo Bahía Energía, con ocho sociedades y el 28% del corte, el Grupo Rosario Bio, con dos plantas y el 11%, el Grupo Cremer, con dos plantas y el 9%, y el Grupo Bolzan, con dos plantas y el 7%. La empresa individual más grande, Explora, tiene el 6%.</p>,
};

// Párrafos de "Cómo llegamos hasta acá"
const HISTORIA = {
  p1: <p>El reparto en dos compartimentos no lo inventó la ley que hoy está en Diputados: tiene veinte años. La Ley 26.093 de 2006 creó el régimen de promoción y el corte empezó a regir en marzo de 2010, con 5% que subió a 7% ese mismo año y a 10% en 2014. Las resoluciones 1674/2010 y 56/2012 de la Secretaría de Energía reservaron el corte a las elaboradoras que no exportaban y les pusieron un techo de 50.000 toneladas por año. Las aceiteras se quedaron con la exportación, que entre 2008 y hoy sumó 14,7 millones de toneladas; las no integradas exportaron cero.</p>,
  p2: <p>La exportación tuvo sus propios golpes. La Unión Europea aplicó derechos antidumping en 2013 y Estados Unidos cerró su mercado en 2017 con derechos de más del 130%. En 2019 la Unión Europea aceptó un compromiso de precio mínimo con un cupo de 1,2 millones de toneladas sin arancel, firmado solo por las integradas. Lo que sostuvo el negocio exportador fue el diferencial de retenciones entre el aceite y el biodiésel, que según los cálculos de Explora transfirió a las integradas unos 2.040 millones de dólares.</p>,
  p3: <p>La Ley 27.640 de 2021 reemplazó el régimen de promoción y bajó el corte de 10% a 5%, con un piso de 3%, mientras dejó el del bioetanol en 12%. Mantuvo la reserva del corte para las que no exportan (artículo 11), la prorrata por capacidad y el techo de 50.000 toneladas. Ordenó además una metodología de precio que la Secretaría recién dictó en noviembre de 2023, la Resolución 963/2023, con un artículo 5 que la autoriza a apartarse de su propia fórmula. Entre enero de 2024 y noviembre de 2025 usó esa cláusula en 23 meses: el precio publicado quedó en promedio 5% debajo de la fórmula, con un máximo de 18% en enero de 2024, y el descuento acumulado sobre el cupo asignado equivale a unos 115 millones de dólares. Explora tiene esa cláusula demandada en la justicia federal. Desde diciembre de 2025 el precio publicado volvió a coincidir con la fórmula.</p>,
  p4: <p>El dato que ordena toda la historia es el cumplimiento del corte. El Estado fija el porcentaje y los mezcladores lo cumplen o no; la Secretaría tiene las herramientas para exigirlo y casi nunca las usó. De dieciséis años completos, el corte real alcanzó al obligatorio en tres: 2012, 2013 y 2017. El faltante acumulado desde 2010 es de 2.582.908 toneladas de biodiésel que la ley mandaba mezclar y no se mezclaron, unos 3.400 millones de dólares a precio de hoy. El problema atraviesa cuatro presidencias y dos leyes.</p>,
  p5: <p>El gobierno actual llegó con la idea de desregular. El capítulo de biocombustibles del DNU 70/2023 se retiró antes de la firma y el de la Ley Bases se cayó en la negociación con las provincias productoras. Después vinieron un proyecto redactado por la Secretaría y presentado por la diputada Villaverde, que extinguía el corte en 2031, y en octubre de 2025 una propuesta de la propia Secretaría que bajaba la participación de las no integradas del 7,5% al 2%. En noviembre de 2025 la Secretaría bajó el corte de 7,5% a 7% por la suba del aceite y en enero de 2026 lo restableció. En mayo de 2026 ingresó al Senado el proyecto S-809/26 de la senadora Bullrich, que fue la base del dictamen del 3 de septiembre y de la media sanción del 17.</p>,
};

// Párrafos de "Los números de hoy"
const NUMEROS = {
  p1: <p>Los últimos doce meses con datos oficiales van de septiembre de 2025 a agosto de 2026. En ese período el corte real fue 6,18% contra un obligatorio de 7,41%: faltaron 152.791 toneladas. Las no integradas trabajaron al 55% de su capacidad y las integradas exportaron la cuarta parte de lo que exportaban en 2022.</p>,
  p2: <p>Dos cosas se leen en el cuadro. La primera: el cupo se reparte por igual, 43.695 toneladas en doce meses para casi todas las plantas, sea de 50.000 o de 240.000 toneladas de capacidad. Es la prorrata con techo de la ley 27.640 en los hechos. La segunda: las integradas, que en 2021 y 2022 exportaron un millón de toneladas por año, hoy usan el 14% de sus 2,6 millones de toneladas de capacidad. Ese es el motivo por el que quieren entrar al corte, y la clave para leer la ley nueva.</p>,
};

// Párrafos de "La media sanción del 17 de septiembre"
const LEY = {
  p1: <p>El Senado aprobó el 17 de septiembre de 2026, por 41 votos a 25, el nuevo marco regulatorio de biocombustibles. Deroga la Ley 27.640, lleva el corte de biodiésel de 7,5% a 10% a los doce meses y lo hace todo biodiésel: el coprocesado de las refinerías quedó afuera del corte. Reemplaza el cupo y el precio fijado por el Estado por un mercado electrónico con subastas y un techo en la paridad de importación. Y fija una transición hasta el 1 de enero de 2036 en la que una parte del corte se reserva a las no integradas: 7,5% el primer año, 6,5% hasta 2028, 5,5% en 2029, 5% en 2030 y 4% de 2031 a 2035. Después, nada.</p>,
  p2: <p>Entre el proyecto que ingresó en mayo y el texto que salió del recinto cambiaron once artículos de fondo. Los tres que más pesan, el 36, el 38 y el 39, se leyeron en el recinto y se aceptaron sin que nadie explicara por qué.</p>,
  p3: <p>Lo que no cambió pesa tanto como lo que cambió. La autoridad puede reducir el corte (artículo 12). La subasta queda subordinada al "acuerdo mutuo" entre las partes y a la modalidad que la autoridad decida (artículo 14). La ley 27.640 se deroga de un día para el otro, antes de que el mercado nuevo funcione (artículo 40). El corte solo se cumple con biocombustible elaborado en el país y con materia prima nacional (artículo 24). La reserva de 6% y 6% para el bioetanol de caña y de maíz es permanente (artículo 13), mientras la del biodiésel no integrado se extingue en 2036.</p>,
};

// Párrafos de la falla 1
const FALLA1 = {
  p1: <p>El artículo 38 manda a las no integradas abastecer el 7,5% del gas oil el primer año, el 6,5% hasta 2028 y el 5,5% en 2029. El artículo 39 les pone dos topes: 10% por empresa con un máximo de 50.000 toneladas, y 10% por grupo. Con la estructura actual del mercado, los topes suman menos que el mandato.</p>,
  p2: <p>El tope de 50.000 toneladas saca de juego 306.000 toneladas de capacidad de Unitec Bio, Explora y Diaser. El tope por grupo saca otras 290.000, casi todas del Grupo Bahía Energía. La capacidad no integrada es de 1.327.200 toneladas, 408.000 más que lo que exige el segmento el primer año: la capacidad sobra, lo que falta es permiso para usarla. La ley manda 7,5% y la misma ley permite 6,0%.</p>,
  p3: <p>¿Adónde va el faltante? El artículo 39 b) dice que "podrá" pasar al total del mercado: a las integradas, que hoy usan el 14% de su capacidad, o a la importación. Y cuando la demanda es obligatoria y la oferta tiene techo, el precio sube hasta el techo que la propia ley fija: la paridad de importación. Puesta en La Plata en septiembre de 2026, contra 1.328 dólares por tonelada del precio local, la paridad de Brasil es 1.431 (7,8% más), la del Golfo de Estados Unidos 1.539 (16% más) y la de Europa 2.066 (56% más). Cuál de las tres rige no lo dice la ley: lo define una metodología que el artículo 16 deja abierta. La diferencia la paga el consumidor y la cobra el dueño del aceite.</p>,
};

// Párrafos de la falla 2
const FALLA2 = {
  p1: <p>Desde 2010 la condición de integrada se definió por una sola cosa: tener o no la materia prima. El artículo 11 de la ley 27.640 dejaba fuera del corte a las elaboradoras vinculadas, directa o indirectamente, con la exportación de biodiésel o de sus insumos principales. El proyecto que ingresó al Senado y el dictamen del 3 de septiembre seguían esa línea: integrada era la que formaba parte de un grupo con fábrica de aceite. En el recinto, el artículo 36 cambió el criterio. Integrada es la que tiene más de 50.000 toneladas y aceitera, las dos cosas a la vez. No integrada es la que cumple al menos una: 50.000 toneladas o menos, o no tener aceitera.</p>,
  p2: <p>Esa definición tiene nombre y apellido. Enresa (Catriló, 50.000 t) tiene los mismos accionistas que la aceitera Gente de La Pampa, está en el predio contiguo y recibe de ella el aceite. Pampa Bio (General Pico, 50.000 t) es del grupo Lartirigoyen, que la información pública disponible asocia a Viterra, hoy Bunge. Con el texto de mayo eran integradas; con el del recinto son "no integradas" y entran al segmento reservado con aceite propio, compitiendo contra las que lo compran. Tampoco es nuevo: Enresa, Pampa Bio y Patagonia Bioenergía recibieron cupo bajo la ley 27.640 como si el artículo 11 no existiera, 195.000 toneladas cada una desde septiembre de 2021.</p>,
  p3: <p>Tres contradicciones. Una planta de 50.000 toneladas de una aceitera exportadora es "no integrada"; Explora, con 120.000 toneladas y sin una gota de aceite propio, queda con el mismo tope de 50.000. Si Explora instalara una fábrica de aceite pasaría a integrada; si una aceitera compra una planta de biodiésel de 50.000 toneladas, no. Y la puerta queda abierta: cualquier aceitera, incluidas las seis integradas de hoy, puede comprar plantas de hasta 50.000 toneladas, que siguen siendo no integradas. Hay catorce de exactamente ese tamaño. Con tres, un grupo ya supera el tope. El segmento reservado a las que no tienen aceite puede terminar en manos de las que lo tienen.</p>,
};

// Párrafos y reglas de la falla 3
const FALLA3 = {
  p1: <p>La ley dice que no cree en cupos y que cree en la competencia. Pero cuando la oferta permitida es menor que la demanda obligatoria, lo que asigna no es la competencia: es el reparto. Y el reparto está escrito en las reglas.</p>,
  p2: <p>El secretario de Energía, Daniel González, lo dijo ante las comisiones del Senado el 3 de junio de 2026: "Entendemos que esto es sumamente difícil, que hay ganadores y perdedores". Una ley que elige a los ganadores antes de que se juegue no es una ley de competencia.</p>,
  reglas: [
    ['Topes de un solo lado.', 'Las no integradas tienen tope por empresa y por grupo. Las integradas no tienen ninguno. Los mezcladores tampoco.'],
    ['El mismo 10% con dos varas.', 'La empresa individual tiene máximo de 50.000 toneladas; el grupo no. El tope se cuenta por sociedad, y un grupo tiene ocho.'],
    ['Regiones obligatorias sin definir.', 'El 20% del volumen "deberá" negociarse en regiones que la ley no nombra. Las nombra la autoridad.'],
    ['La subasta subordinada.', 'El artículo 14 admite el "acuerdo mutuo" entre elaborador y mezclador y deja que la autoridad determine la modalidad. Del lado de la compra, cuatro empresas tienen el 99% y una el 60%; del lado de la venta, la más grande tiene el 6%. En un acuerdo entre privados la ventaja es del que compra. Libre contratación no es libre competencia.'],
    ['Dos varas para el mismo problema.', 'La reserva de 6% y 6% para la caña y el maíz es permanente porque protege inversiones regionales. La del biodiésel no integrado, que protege 24 plantas en cinco provincias, se extingue en 2036. Y el productor de caña no le compra el insumo a su competidor; la no integrada le compra el 76% de su costo al suyo.'],
  ],
};

// Párrafos de Qué debería corregir Diputados
const CORREGIR = {
  p1: <p>No hace falta otra ley. Con ocho cambios en cinco artículos, más dos de resguardo, la media sanción pasa de repartir a hacer competir. Casi todo está redactado: son las propuestas que Explora presentó en el Senado entre agosto y octubre de 2026.</p>,
  p2: <p>La cuenta cierra. Con 11,5%, 10,5% y 9,5% sin las 50.000 toneladas, las no integradas pueden ofrecer 918.356 toneladas el primer año contra 919.294 que exige el segmento: faltan 937 toneladas, el 0,1%, que cubre la regla del 39 b). En el segundo año sobra 1,3% y en el tercero 2,2%. Esa oferta incluye las 100.000 toneladas de Enresa y Pampa Bio; sin ellas la cuenta no cierra ningún año, y por eso la excepción tiene que ser expresa y no un cambio de definición que les abra la puerta a todas las aceiteras.</p>,
  p3: <p>Diputados ya votó algo parecido. El capítulo de biocombustibles de la Ley Bases que aprobó el 2 de febrero de 2024, por 144 votos a 109, tenía un mismo tope del 14% por empresa o por grupo.</p>,
};

// En la versión con esquemas (HDO, 19/10/2026): el 39 a) i y ii con 12% el
// primer año (en vez de 11,5%) y el 39 a) iv debe decir eliminar las regiones;
// la versión de texto conserva las filas literales del Word
const CAMBIOS_ESQ = CAMBIOS.map((f) => {
  if (f[0] === '39 a) i y ii') return [f[0], f[1], 'Eliminar las 50.000 t. Un mismo porcentaje para la empresa y para el grupo, sobre el segmento no integrado: 12% el primer año, 10,5% el segundo y 9,5% desde entonces'];
  if (f[0] === '39 a) iv') return [f[0], f[1], 'Eliminar las regiones obligatorias.'];
  return f;
});

// El párrafo de la cuenta, con los números del 12% (la cuenta del artículo,
// con 11,5%, daba 918.356 t y un faltante de 937 t)
const CUENTA_12 = (
  <p>La cuenta cierra. Con 12%, 10,5% y 9,5% sin las 50.000 toneladas, las no integradas pueden ofrecer 932.146 toneladas el primer año contra 919.294 que exige el segmento: sobran 12.852 toneladas, el 1,4%. En el segundo año sobra 1,3% y en el tercero 2,2%; en el cuarto, con el segmento en 5%, sobra 6,4%, y de 2031 a 2035, con el segmento fijo en 4%, 14%. Esa oferta incluye las 100.000 toneladas de Enresa y Pampa Bio; sin ellas la cuenta no cierra ningún año, y por eso la excepción tiene que ser expresa y no un cambio de definición que les abra la puerta a todas las aceiteras.</p>
);

export const armarCapitulos = (esq = false) => [
  {
    id: 'mercado',
    titulo: 'El mercado en una página',
    pal: VIOLETA,
    frase: 'El biodiésel argentino son dos negocios distintos que comparten el nombre.',
    detalle: 'La no integrada compra el aceite al competidor y vende al que tiene el 60%.',
    // Con esquemas, el capítulo se lee por los cuadros: cada uno lleva su
    // párrafo en el pop-up "Leer el texto" (HDO, 19/10/2026).
    cuerpo: esq ? (
      <>
        <E.DosNegocios texto={MERCADO.p1} />
        <E.CapacidadPorGrupo texto={MERCADO.p2} />
        <E.EscaleraCorte texto={MERCADO.p3} />
        <E.Mostrador titulo="Del lado de la compra hay cuatro empresas que concentran el 99% del volumen, y una sola, YPF, compra el 60%." texto={MERCADO.p4} />
        <E.DiagramaEsq texto={<p>La no integrada está en el medio: le compra el insumo a quien compite con ella y le vende a un comprador que decide el 60% del mercado, con un cupo y un precio que fija el Estado.</p>} />
      </>
    ) : (
      <>
        {MERCADO.p1}
        {MERCADO.p2}
        {MERCADO.p3}
        {MERCADO.p4}
        <figure className="dip-figura">
          <div className="dip-figura-scroll"><DiagramaMercado /></div>
          <figcaption>
            <p className="dip-figura-fuente">estructura del mercado · cifras de los últimos doce meses, septiembre 2025 a agosto 2026</p>
            <p className="dip-figura-lectura">La no integrada está en el medio: le compra el insumo a quien compite con ella y le vende a un comprador que decide el 60% del mercado, con un cupo y un precio que fija el Estado.</p>
          </figcaption>
        </figure>
      </>
    ),
  },
  {
    id: 'historia',
    titulo: 'Cómo llegamos hasta acá',
    pal: AMBAR,
    frase: 'El reparto en dos compartimentos no lo inventó la ley que hoy está en Diputados: tiene veinte años.',
    detalle: 'De dieciséis años completos, el corte real alcanzó al obligatorio en tres.',
    // Con esquemas (orden de HDO, 19/10/2026): la línea de tiempo primero,
    // después el gráfico del cumplimiento, las cuatro presidencias y las dos
    // cifras; el texto de cada uno en su pop-up.
    cuerpo: esq ? (
      <>
        <E.LineaTiempo texto={<>{HISTORIA.p1}{HISTORIA.p5}</>} />
        <E.GraficoCumplimiento texto={HISTORIA.p4} />
        <E.Presidencias texto={HISTORIA.p4} />
        <E.CifrasHistoria texto={<>{HISTORIA.p2}{HISTORIA.p3}</>} />
      </>
    ) : (
      <>
        {HISTORIA.p1}
        {HISTORIA.p2}
        {HISTORIA.p3}
        {HISTORIA.p4}
        <Tabla
          cab={['Presidencia (meses con corte vigente)', 'Corte obligatorio', 'Corte real', 'Cumplimiento', 'Faltante por año']}
          filas={[
            ['Cristina Fernández, ene 2010 a nov 2015', '7,8%', '7,2%', '92%', '95.000 t'],
            ['Mauricio Macri, dic 2015 a nov 2019', '10,0%', '9,4%', '94%', '91.000 t'],
            ['Alberto Fernández, dic 2019 a nov 2023', '7,5%', '4,9%', '65%', '311.000 t'],
            ['Javier Milei, dic 2023 a ago 2026', '7,5%', '6,2%', '83%', '151.000 t'],
          ]}
        />
        <figure className="dip-figura">
          <div className="dip-figura-scroll"><GraficoCorte /></div>
          <figcaption>
            <p className="dip-figura-fuente">Secretaría de Energía, elaboración explorarg.com · años 2010 a 2026 (2026 hasta agosto)</p>
            <p className="dip-figura-lectura">La línea gris es lo que la ley mandó cada año y la azul lo que se mezcló; el área entre las dos es el biodiésel que faltó. El hueco más grande es 2020, con la mitad del corte sin cumplir, y el segundo es 2023.</p>
          </figcaption>
        </figure>
        {HISTORIA.p5}
      </>
    ),
  },
  {
    id: 'numeros',
    titulo: 'Los números de hoy',
    pal: GRIS,
    frase: 'Los últimos doce meses con datos oficiales van de septiembre de 2025 a agosto de 2026.',
    detalle: 'El corte real fue 6,18% contra un obligatorio de 7,41%: faltaron 152.791 toneladas.',
    // Con esquemas (orden de HDO, 19/10/2026): el corte contra el obligatorio,
    // el cumplimiento por mezcladora, las importaciones de gas oil, los precios
    // comparados de la página de Gas Oil y el cupo por grupo; sin la tabla,
    // el precio en capas ni la capacidad usada.
    cuerpo: esq ? (
      <>
        <E.Embudo texto={NUMEROS.p1} />
        <ED.CumplimientoMezcladoras />
        <ED.ImportacionesGasoil />
        <ED.PreciosComparadosEsq />
        <ED.CupoPorGrupo texto={NUMEROS.p2} />
      </>
    ) : (
      <>
        {NUMEROS.p1}
        <Tabla
          cab={['Qué', 'Cifra', 'Fuente']}
          filas={[
            ['Gas oil vendido en el país (grados 2 y 3, sin bunker ni usinas)', '13.844.735 m³', 'Secretaría de Energía, tablas SESCO'],
            ['Corte obligatorio promedio', '7,41% (7,5%, salvo noviembre y diciembre de 2025 al 7%)', 'Res. SE 445/2025 y 612/2025'],
            ['Corte real', '6,18%', <>explorarg.com, <Link to="/gestion">Cumplimiento del corte</Link></>],
            ['Cumplimiento', '83%', ''],
            ['Biodiésel que faltó mezclar', '152.791 t', ''],
            ['Cupo asignado a las elaboradoras', '859.489 t', 'Secretaría de Energía'],
            ['Vendido al corte', '756.763 t, el 88% del cupo', ''],
            ['Producción de las no integradas', '721.006 t, el 55% de 1.295.200 t de capacidad', ''],
            ['Exportación de las integradas', '238.910 t (968.486 t en 2022)', ''],
            ['Precio del biodiésel para el corte, septiembre 2026', '$ 2.012.598 por tonelada, USD 1.336', 'Res. SE 963/2023, precio mensual'],
            ['Aceite de soja FAS, septiembre 2026', 'USD 936 por tonelada, el 70% del precio del biodiésel', 'SAGyP'],
            ['Margen biodiésel menos aceite', 'USD 400 por tonelada; promedio desde 2010, USD 325', <>explorarg.com, <Link to="/margenes">Márgenes</Link></>],
            ['Gas oil importado', '319.464 t, el 2,7% del gas oil vendido', 'Despachos de importación, sin CAMMESA'],
            ['Quién compra el biodiésel', 'YPF 60%, Raízen 17%, Axion 16%, Trafigura 6%', 'Secretaría de Energía'],
            ['Efecto del corte en el surtidor', 'cada punto de corte mueve el precio del litro menos de 0,1%', <>explorarg.com, <Link to="/gas-oil">Gas oil</Link></>],
          ]}
        />
        {NUMEROS.p2}
      </>
    ),
  },
  {
    id: 'ley',
    titulo: 'La media sanción del 17 de septiembre: qué cambia',
    pal: ROSA,
    frase: 'Deroga la Ley 27.640, lleva el corte de biodiésel de 7,5% a 10% a los doce meses y lo hace todo biodiésel.',
    detalle: 'Entre el proyecto que ingresó en mayo y el texto que salió del recinto cambiaron once artículos de fondo.',
    // Con esquemas: solo cuadros, el texto en los pop-ups (HDO, 19/10/2026)
    cuerpo: esq ? (
      <>
        <E.CambioRegimen texto={LEY.p1} />
        <E.Transicion />
        <E.Votacion />
        <E.EntroSalio texto={LEY.p2} />
        <E.Esq titulo="Los once artículos de fondo que cambiaron entre mayo y el recinto, y el 14, que no cambió." texto={LEY.p3}>
        <Tabla
            min="760px"
            cab={['Artículo', 'Cómo entró (S-809/26, mayo)', 'Cómo salió (17 de septiembre)', 'Para quién juega']}
            filas={[
              ['9', 'Sin tope en bioetanol', 'Tope de 20% por empresa en bioetanol', 'Nadie llega al 20%: sin efecto'],
              ['12', 'Excepciones al corte a criterio de la autoridad', 'Define las zonas frías patagónicas', 'Mezcladores'],
              ['13', 'Remanente del etanol', 'Abierto a biomasa forestal y otras materias primas, con cupo de la autoridad', 'A criterio de la autoridad'],
              ['14', 'Subasta sujeta al "acuerdo mutuo" entre las partes y a la modalidad que fije la autoridad', 'Igual: no obliga a las subastas y admite los acuerdos mutuos entre las partes', 'Mezcladoras. Lo que hay que garantizar es la libre competencia, y los acuerdos entre partes no la garantizan'],
            ['15', 'Contratos a término', 'Con mecanismos de transparencia y publicación', 'Mezcladoras, a full; en contra de las no integradas'],
              ['16', 'Paridad de importación', 'Paridad = "costo de reemplazo real"', 'Indefinido: lo define la autoridad'],
              ['18 y 34', 'Coprocesado computa hasta 3% del corte', 'Coprocesado fuera del corte, exento de ICL e ICO2 hasta 5%', 'Refinerías: hasta USD 148 millones por año de impuestos'],
              ['35', 'Transición hasta el 31-12-2031', 'Hasta el 1-1-2036', 'El segmento dura más, pero al 4%'],
              ['36 a) y b)', 'Integrada = grupo con aceitera', 'Integrada = más de 50.000 t y aceitera, las dos cosas', 'Plantas de 50.000 t de grupos aceiteros'],
              ['36 c)', 'Grupo económico', 'Grupo ampliado, con continuidad al 31-12-2025', 'Candado contra la fragmentación'],
              ['38', 'No integradas 7,5 / 5 / 4 / 3%; coprocesado en la tabla', 'No integradas 7,5 / 6,5 / 5,5 / 5 / 4%; total mercado 0 / 3,5 / 4,5 / 5 / 6%', 'No integradas, en el papel'],
              ['39', 'Tope 14% por empresa y por grupo; regiones "podrá"', '10% con máximo de 50.000 t por empresa; 10% por grupo; regiones "deberá", 20%', 'Grupos, regiones y aceiteras; pierden las tres no integradas grandes'],
            ]}
          />
        </E.Esq>
      </>
    ) : (
      <>
        {LEY.p1}
        {LEY.p2}
        <Tabla
          min="760px"
          cab={['Artículo', 'Cómo entró (S-809/26, mayo)', 'Cómo salió (17 de septiembre)', 'Para quién juega']}
          filas={[
            ['9', 'Sin tope en bioetanol', 'Tope de 20% por empresa en bioetanol', 'Nadie llega al 20%: sin efecto'],
            ['12', 'Excepciones al corte a criterio de la autoridad', 'Define las zonas frías patagónicas', 'Mezcladores'],
            ['13', 'Remanente del etanol', 'Abierto a biomasa forestal y otras materias primas, con cupo de la autoridad', 'A criterio de la autoridad'],
            ['15', 'Contratos a término', 'Con mecanismos de transparencia y publicación', 'Neutro'],
            ['16', 'Paridad de importación', 'Paridad = "costo de reemplazo real"', 'Indefinido: lo define la autoridad'],
            ['18 y 34', 'Coprocesado computa hasta 3% del corte', 'Coprocesado fuera del corte, exento de ICL e ICO2 hasta 5%', 'Refinerías: hasta USD 148 millones por año de impuestos'],
            ['35', 'Transición hasta el 31-12-2031', 'Hasta el 1-1-2036', 'El segmento dura más, pero al 4%'],
            ['36 a) y b)', 'Integrada = grupo con aceitera', 'Integrada = más de 50.000 t y aceitera, las dos cosas', 'Plantas de 50.000 t de grupos aceiteros'],
            ['36 c)', 'Grupo económico', 'Grupo ampliado, con continuidad al 31-12-2025', 'Candado contra la fragmentación'],
            ['38', 'No integradas 7,5 / 5 / 4 / 3%; coprocesado en la tabla', 'No integradas 7,5 / 6,5 / 5,5 / 5 / 4%; total mercado 0 / 3,5 / 4,5 / 5 / 6%', 'No integradas, en el papel'],
            ['39', 'Tope 14% por empresa y por grupo; regiones "podrá"', '10% con máximo de 50.000 t por empresa; 10% por grupo; regiones "deberá", 20%', 'Grupos, regiones y aceiteras; pierden las tres no integradas grandes'],
          ]}
        />
        {LEY.p3}
      </>
    ),
  },
  {
    id: 'falla-1',
    grupo: 'Tres fallas de la ley',
    titulo: '1. El mandato que no se puede cumplir',
    pal: CORAL,
    frase: 'La ley manda 7,5% y la misma ley permite 6,0%.',
    detalle: 'La capacidad sobra, lo que falta es permiso para usarla.',
    // Con esquemas: solo cuadros, el texto en los pop-ups (HDO, 19/10/2026)
    cuerpo: esq ? (
      <>
        <E.MandaPermite texto={FALLA1.p1} />
        <E.CascadaCapacidad texto={FALLA1.p2} />
        <E.EscaleraParidad texto={FALLA1.p3} />
        <E.FlujoPrecio />
      </>
    ) : (
      <>
        {FALLA1.p1}
        <Tabla
          cab={['Período', 'Manda el art. 38', 'Permiten los topes del art. 39', 'Faltante', 'Corte posible']}
          filas={[
            ['Primer año, 7,5%', '919.294 t', '730.988 t', '188.306 t (20%)', '6,0%'],
            ['Hasta 2028, 6,5%', '796.721 t', '694.216 t', '102.505 t (13%)', '5,7%'],
            ['2029, 5,5%', '674.149 t', '657.445 t', '16.704 t (2%)', '5,4%'],
          ]}
        />
        {FALLA1.p2}
        {FALLA1.p3}
      </>
    ),
  },
  {
    id: 'falla-2',
    grupo: 'Tres fallas de la ley',
    titulo: '2. Integrada por tamaño',
    pal: CORAL,
    frase: 'Integrada es la que tiene más de 50.000 toneladas y aceitera, las dos cosas a la vez.',
    detalle: 'Esa definición tiene nombre y apellido.',
    cuerpo: esq ? (
      <>
        <E.AntesDespues texto={FALLA2.p1} />
        <E.MatrizIntegrada texto={FALLA2.p2} />
        <E.Contradicciones texto={FALLA2.p3} />
        <E.Catorce />
      </>
    ) : (
      <>
        {FALLA2.p1}
        {FALLA2.p2}
        {FALLA2.p3}
      </>
    ),
  },
  {
    id: 'falla-3',
    grupo: 'Tres fallas de la ley',
    titulo: '3. Reparto en lugar de competencia',
    pal: CORAL,
    frase: 'Cuando la oferta permitida es menor que la demanda obligatoria, lo que asigna no es la competencia: es el reparto.',
    detalle: 'Libre contratación no es libre competencia.',
    cuerpo: esq ? (
      <>
        <E.Balanza texto={FALLA3.p1} />
        <E.ReglasReparto reglas={FALLA3.reglas} />
        <E.Mostrador titulo="En un acuerdo entre privados la ventaja es del que compra. Libre contratación no es libre competencia." texto={<p>{FALLA3.reglas[3][0]} {FALLA3.reglas[3][1]}</p>} />
        <E.DosVaras texto={<p>{FALLA3.reglas[4][0]} {FALLA3.reglas[4][1]}</p>} />
        <E.CitaGonzalez texto={FALLA3.p2} />
      </>
    ) : (
      <>
        {FALLA3.p1}
        <ul>
          {FALLA3.reglas.map(([a, b]) => (
            <li key={a}><strong>{a}</strong> {b}</li>
          ))}
        </ul>
        {FALLA3.p2}
      </>
    ),
  },
  {
    id: 'corregir',
    titulo: 'Qué debería corregir Diputados',
    pal: VERDE,
    frase: 'No hace falta otra ley.',
    detalle: 'Con ocho cambios en cinco artículos, más dos de resguardo, la media sanción pasa de repartir a hacer competir.',
    cuerpo: esq ? (
      <>
        <E.DiceDebeDecir filas={CAMBIOS_ESQ} texto={CORREGIR.p1} />
        <E.CuentaMediaSancion />
        <E.CuentaCierra texto={CUENTA_12} />
        <E.LeyBases texto={CORREGIR.p3} />
      </>
    ) : (
      <>
        {CORREGIR.p1}
        <Tabla min="700px" cab={['Artículo', 'Qué dice la media sanción', 'Qué hay que cambiar']} filas={CAMBIOS} />
        {CORREGIR.p2}
        {CORREGIR.p3}
      </>
    ),
  },
  {
    id: 'fuentes',
    titulo: 'Fuentes y notas sobre las cifras',
    pal: GRIS,
    notas: true,
    cuerpo: (
      <ul>
        <li>Datos de mercado, corte, cumplimiento, precios y márgenes: explorarg.com, tableros <Link to="/gestion">Cumplimiento del corte</Link>, <Link to="/mercado">Mercado</Link>, <Link to="/margenes">Márgenes</Link> y <Link to="/gas-oil">Gas oil</Link>, construidos sobre las estadísticas de biocombustibles y las tablas SESCO de la Secretaría de Energía. Datos hasta agosto de 2026; precios hasta septiembre de 2026.</li>
        <li>Corte real = biodiésel vendido para el corte sobre el gas oil grados 2 y 3 vendido en el país, sin bunker ni usinas y con la Zona Fría adentro (artículo 11 de la Res. SE 689/2022). Cumplimiento = corte real sobre corte obligatorio.</li>
        <li>Faltante de los tres primeros años, capacidades y propuesta de topes: planilla "Art 39 rev.1" de Explora (gas oil de 13.850.000 m³, capacidad no integrada de 1.327.200 t). El tope del 10% por grupo se mide sobre el segmento no integrado; con la lectura literal del artículo 39, sobre el total del corte, el faltante del primer año es el mismo y los de 2028 y 2029 son menores.</li>
        <li>Diferencial de retenciones (USD 2.040 millones), exportaciones acumuladas y déficit valuado: cálculos de Explora sobre datos oficiales.</li>
        <li>Textos legales: Ley 26.093, Ley 27.640, Res. SE 963/2023, Res. SE 445/2025 y Res. SE 612/2025.</li>
        <li>Trámite parlamentario: expediente S-809/26, texto sancionado por el Senado y acta de la votación del 17-9-2026. El proyecto artículo por artículo, con la propuesta de Explora: <Link to="/propuesta-s0809-2026">explorarg.com/propuesta-s0809-2026</Link> y <Link to="/analisis-dictamen">análisis del dictamen</Link>.</li>
        <li>Enresa y Pampa Bio: Boletín Oficial de La Pampa del 3-12-2010, diario La Arena (2011 y 2014) y Moody's Local (marzo de 2026) para Enresa; para Pampa Bio, información pública sobre el grupo Lartirigoyen.</li>
      </ul>
    ),
  },
];
