// La cuenta del artículo 39 a) de la media sanción: cuánto puede vender cada
// no integrada con los topes, y si entre todas llegan a cubrir lo que el
// artículo 38 les reserva.
//
// Es UNA sola cuenta para todo el sitio. La usan:
//   - el control «Tope, porcentaje y corte» de «Del dicho al dato»
//     (src/lib/dichoDato.js, que le pasa su copia de los datos);
//   - la ficha del Polígrafo (src/lib/poligrafo/ficha.js), para poder decir si
//     las no integradas pueden o no abastecer el corte que la ley les reserva.
// Así las dos partes del sitio dan siempre las mismas cifras.
//
// No importa ningún JSON: recibe los datos de src/data/dicho_dato_art39.json
// (la planilla de Explora «Art. 39», revisión 1) ya leídos, para correr igual en
// el navegador, en el servidor y en los bancos de prueba.

/** Los períodos del artículo 38, cada uno con las toneladas del segmento no integrado. */
export function periodos39(art39) {
  return art39.periodos.map((p) => ({
    ...p,
    // Toneladas del segmento no integrado: % del gas oil por la densidad del biodiésel
    segmento: (art39.gasoil_m3 * p.ni * art39.densidad_bio) / 100,
  }));
}

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
export function calcularTopes39(art39, { periodoId, maximo, pct }) {
  const periodos = periodos39(art39);
  const periodo = periodos.find((p) => p.id === periodoId) || periodos[0];
  const limite = (periodo.segmento * pct) / 100;
  const filas = art39.entidades.map((e) => {
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
    cortePosible: (permitido / art39.densidad_bio / art39.gasoil_m3) * 100,
  };
}
