// Datos y cuentas del área "Del dicho al dato" (/del-dicho-al-dato).
//
// - dicho_dato.json: los 29 episodios, sacados de los videos por
//   scripts/dicho_dato_json.py (no editar a mano).
// - dicho_dato_art39.json: capacidades de la planilla de Explora «Art. 39»,
//   revisión 1, que es la cuenta de los videos (HDO, 15/11/2026).
// - Qué control lleva cada episodio en "Para profundizar". Son pocos tipos
//   que se repiten (pedido de HDO: "no quiero 29 herramientas distintas").
import DATOS from '../data/dicho_dato.json';
import ART39 from '../data/dicho_dato_art39.json';

export const SERIE = DATOS.serie;
export const PEDIDO = DATOS.pedido;
export const ORADORES = DATOS.oradores;
export const EPISODIOS = DATOS.episodios;
export const TOTAL = DATOS.meta.total;
export const PLAYLIST = DATOS.meta.playlist;
export const RUTA = '/del-dicho-al-dato';

export const episodio = (n) => EPISODIOS.find((e) => e.n === Number(n)) || null;
export const miniatura = (n, chica = false) => `/dicho-dato/${String(n).padStart(2, '0')}${chica ? '-ch' : ''}.jpg`;

// Control de cada episodio. `tope`: el simulador del artículo 39 a) i y ii.
// `empresa`: cupo asignado, entregado y exportado por empresa y período.
// `precios`: biodiésel, gas oil fósil e importado en dos meses a elección.
// `surtidor`: qué le pasa al surtidor y al fisco si el corte cambia, en el mes
// que se elija; `inicial` es el mes y los dos cortes con los que abre.
// `integradas`: exportaciones, mercado interno y uso de la capacidad de las
// integradas, año por año; `inicial` son los dos años con los que abre.
// `lectura` es la frase que ata el control con lo que dice el video.
export const CONTROLES = {
  2: {
    tipo: 'tope',
    lectura: 'El video dice que el máximo de 50.000 t les saca 42.000 t a cada una de Unitec Bio, Explora y Diaser el primer año. Mové el máximo o sacalo y mirá qué le pasa a cada una y al total.',
  },
  4: {
    tipo: 'tope',
    lectura: 'El video dice que el primer año la ley manda 919.000 t y sus propios topes dejan vender 731.000. Elegí otro período del sendero y mirá cuánto manda la ley y cuánto dejan vender los topes.',
  },
  5: {
    tipo: 'integradas',
    inicial: { desde: 2019, hasta: 2026 },
    lectura: 'El video dice que Europa no cerró el mercado: las integradas siguen exportando con el acuerdo de 2019, y las no integradas no exportaron ni una tonelada. Elegí los años y mirá cuánto exportó cada grupo.',
  },
  9: {
    tipo: 'tope',
    lectura: 'El video dice que al grupo económico la ley le deja 10% sin máximo y a la empresa sola, 10% con un máximo de 50.000 t. Acá se ve cuánto puede vender cada uno con esa regla, y con otra.',
  },
  12: {
    tipo: 'tope',
    lectura: 'El video dice que Diaser puede usar el 52% de su planta, Unitec Bio el 21% y Explora el 42%, y que el segmento baja a 490.000 t desde 2031. Mové el máximo o cambiá el período y mirá cuánto de su planta puede usar cada una.',
  },
  14: {
    tipo: 'tope',
    lectura: 'El video dice que al grupo le quedan 92.000 t el primer año y a la empresa que no se separó, 50.000. Sacá el máximo y las dos reglas quedan iguales.',
  },
  15: {
    tipo: 'precios',
    lectura: 'El video dice que de febrero a mayo de 2026 el gas oil fósil subió 46% y el biodiésel bajó 2%. Elegí otros dos meses y mirá cuánto se movió cada uno.',
  },
  16: {
    tipo: 'precios',
    lectura: 'El video compara el biodiésel con el gas oil fósil con el que se mezcla: 50% arriba en febrero de 2026 y 1% en mayo. Elegí otros dos meses y mirá los tres precios.',
  },
  17: {
    tipo: 'surtidor',
    inicial: { mes: '2026-02', desde: 7.5, hasta: 15 },
    lectura: 'El video dice que con el corte en 15% en lugar de 7,5% el surtidor subía $ 29 por litro en febrero de 2026 y bajaba $ 21 en mayo. Elegí otro mes u otro corte y mirá la cuenta.',
  },
  18: {
    tipo: 'surtidor',
    inicial: { mes: '2026-05', desde: 7.5, hasta: 15 },
    lectura: 'El video dice que en mayo de 2026, con 7,5 puntos más de corte, el fisco cobraba $ 22 menos por litro y el surtidor bajaba $ 21: el mismo peso, visto del otro lado. Elegí otro mes u otro corte.',
  },
  20: {
    tipo: 'surtidor',
    inicial: { mes: '2026-05', desde: 10, hasta: 15 },
    lectura: 'El video compara un corte de 10% con uno de 15%: en mayo de 2026, cuando habló González, con 15% el gas oil era $ 14 más barato por litro. Elegí febrero, el peor mes, u otros cortes.',
  },
  25: {
    tipo: 'tope',
    lectura: 'El video dice que Unitec Bio, Diaser y Explora pasaron del 14% sin máximo en toneladas al 10% con un máximo de 50.000 t. Poné 14% y sacá el máximo para ver la regla que entró al Senado; volvé a la media sanción para ver la que salió.',
  },
  28: {
    tipo: 'integradas',
    inicial: { desde: 2011, hasta: 2026 },
    lectura: 'El video dice que las integradas usaban el 81% de su capacidad en 2011 y usan el 14% en 2026, y que exportaron 1.286.000 t en 2021 y entre 247.000 y 391.000 desde 2023. Elegí los años y mirá la serie completa.',
  },
  29: {
    tipo: 'empresa',
    lectura: 'El video cuenta siete integradas (sin Patagonia Bioenergía, que sí entregó su cupo) entre febrero de 2014 y enero de 2016. Elegí otra empresa u otro período y mirá cuánto le asignaron, cuánto entregó y cuánto exportó.',
  },
};

// Tableros del sitio donde están los datos de cada episodio: se enlazan en
// "Para profundizar", debajo del control (o solos, si el episodio no lleva).
const T = {
  corteGO: { label: 'El corte obligatorio, mes a mes', to: '/gas-oil/corte' },
  cumplimiento: { label: 'Cumplimiento del corte', to: '/gestion' },
  compras: { label: 'Compras al cupo, por petrolera', to: '/mercado/compras-cupo' },
  ventas: { label: 'Ventas al cupo, por elaboradora', to: '/mercado/ventas-cupo' },
  grupos: { label: 'Los grupos económicos', to: '/mercado/aceiteras' },
  plantas: { label: 'Mapa de plantas', to: '/mercado/plantas' },
  capacidad: { label: 'Capacidad instalada', to: '/mercado/capacidad' },
  categorias: { label: 'Integradas y no integradas', to: '/mercado/integradas' },
  matriz: { label: 'Detalle de ventas', to: '/mercado/matriz' },
  precios: { label: 'Precios comparados: biodiésel y gas oil', to: '/gas-oil/biodiesel' },
  aceite: { label: 'Relación del precio del aceite', to: '/relacion-precio-aceite' },
  recinto: { label: 'La votación del 17/9, senador por senador', to: '/mapa-recinto?votacion=17-9' },
  diputados: { label: 'Mapa de Diputados: la Ley de Bases de 2024', to: '/mapa-diputados' },
  queSeJuega: { label: 'Qué se discute y qué se juega en Diputados', to: '/que-se-juega-en-diputados' },
};
export const RELACIONADOS = {
  2: [T.queSeJuega],
  4: [T.corteGO, T.cumplimiento],
  5: [T.categorias],
  7: [T.plantas],
  8: [T.queSeJuega],
  9: [T.compras, T.ventas],
  10: [T.aceite],
  12: [T.plantas, T.capacidad],
  14: [T.grupos, T.ventas],
  15: [T.precios],
  16: [T.precios],
  17: [T.precios],
  18: [T.precios],
  20: [T.precios],
  21: [T.compras, T.ventas],
  22: [T.queSeJuega, T.recinto, T.diputados],
  23: [T.corteGO, T.cumplimiento],
  24: [T.diputados],
  25: [T.queSeJuega],
  26: [T.recinto],
  28: [T.capacidad, T.categorias],
  29: [T.matriz],
};

// Texto propio de un episodio, además del video: va después de las pantallas.
// Cada bloque es un subtítulo con una lista (`items`, o `preguntas` si va
// numerada) y, si hace falta, un párrafo antes (`entrada`) o después (`cierre`).
export const NOTAS = {
  22: {
    titulo: 'Por qué la vara no es el consenso',
    entrada:
      'El consenso de quienes participan de un mercado no puede ser el valor rector de la ley que lo regula. Sirve como medio, no como fin.',
    bloques: [
      {
        titulo: 'Por qué no puede ser el fin',
        items: [
          ['Los que están en la mesa no son todos los afectados.', 'El que paga el gas oil, el fisco, el que querría entrar al mercado y el que querría crecer no firman el consenso. En un mercado con cupo y precio regulado, el acuerdo entre los que ya están tiende a ser un acuerdo sobre cómo repartir, no sobre cómo funcionar mejor.'],
          ['El consenso es conservador por construcción.', 'Si cada participante tiene poder de veto, sobrevive lo que a nadie le quita nada, que suele ser justamente lo que causó el problema. Y pesa más la voz del que tiene más poder y hace más lobby.'],
          ['La ley tiene un mandato propio.', 'Si el corte obligatorio no se cumple, la ley falla en sus propios términos, por más que todos los regulados estén conformes.'],
        ],
      },
      {
        titulo: 'Qué parte del consenso sí vale',
        items: [
          ['Información.', 'Los participantes saben cosas que el legislador no sabe. Escucharlos es obligatorio; darles la lapicera, no.'],
          ['Durabilidad.', 'Una ley que una parte relevante del sector vive como ilegítima se judicializa, se incumple o se revierte con el próximo gobierno. Un mínimo de aceptación es condición de estabilidad.'],
        ],
      },
      {
        titulo: 'La vara: tres preguntas que cualquiera puede comprobar',
        entrada:
          '«Justa y equilibrada» lo dicen todos de su propia propuesta. Por eso conviene bajarlo a preguntas que se respondan con el texto de la ley y con los datos.',
        preguntas: [
          '¿Se cumple el mandato de corte con este diseño, o la propia ley habilita el incumplimiento?',
          '¿Las reglas son generales, o tienen umbrales y topes que se explican por a quién benefician?',
          '¿Una empresa eficiente puede crecer, o su techo lo fija la norma y no su desempeño?',
        ],
        cierre:
          'Si una regla pasa esas preguntas, es defendible aunque algún participante no la consienta. Si no las pasa, el consenso no la arregla. El video las responde, una por una, para la media sanción.',
      },
    ],
  },
};

/* ── El artículo 39 a): cuánto puede vender cada uno ── */

export const PERIODOS_39 = ART39.periodos.map((p) => ({
  ...p,
  // Toneladas del segmento no integrado: % del gas oil por la densidad del biodiésel
  segmento: (ART39.gasoil_m3 * p.ni * ART39.densidad_bio) / 100,
}));
export const MEDIA_SANCION = ART39.media_sancion;
export const FUENTE_39 = ART39.meta.fuente_publica;

/**
 * La cuenta de la planilla «Art. 39» rev. 1, con el máximo y el porcentaje a
 * elección. Cada sociedad puede vender hasta su capacidad, hasta el `pct` del
 * segmento y hasta el `maximo` en toneladas (null = sin máximo); el grupo,
 * además, hasta el `pct` del segmento entre todas sus sociedades (artículo 39
 * a) ii: sin máximo en toneladas).
 *
 * Por fila devuelve la capacidad, lo que puede vender, lo que podría vender
 * sin el máximo y la diferencia (lo que le saca el máximo).
 */
export function calcularTopes({ periodoId, maximo, pct }) {
  const periodo = PERIODOS_39.find((p) => p.id === periodoId) || PERIODOS_39[0];
  const limite = (periodo.segmento * pct) / 100;
  const filas = ART39.entidades.map((e) => {
    const capacidad = e.sociedades.reduce((s, x) => s + x.capacidad, 0);
    const suma = (tope) => e.sociedades.reduce((s, x) => s + Math.min(x.capacidad, limite, tope ?? Infinity), 0);
    const porGrupo = (v) => (e.tipo === 'grupo' ? Math.min(v, limite) : v);
    const puede = porGrupo(suma(maximo));
    const sinMaximo = porGrupo(suma(null));
    return { ...e, capacidad, puede, sinMaximo, saca: sinMaximo - puede };
  });
  const permitido = filas.reduce((s, f) => s + f.puede, 0);
  return {
    periodo,
    limite,
    filas,
    capacidad: filas.reduce((s, f) => s + f.capacidad, 0),
    permitido,
    saldo: permitido - periodo.segmento, // negativo: falta
    cortePosible: (permitido / ART39.densidad_bio / ART39.gasoil_m3) * 100,
  };
}
