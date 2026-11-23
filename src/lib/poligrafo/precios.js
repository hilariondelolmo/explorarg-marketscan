// Polígrafo - precios del biodiésel y del gas oil, e impuestos del gas oil.
//
// Es la misma cuenta que usan los controles de «Del dicho al dato»
// (src/lib/dichoDatoPrecios.js), escrita sin importar los JSON para que corra
// igual en el navegador, en el servidor y en el banco de prueba. Si se cambia
// una fórmula, cambiarla en los dos lados: el banco de prueba coteja estas
// cifras con las que publica la serie.
//
// Todo en pesos corrientes por litro:
//
//  - biodiésel: precio oficial para el corte obligatorio (producto bio_963_m de
//    gasoil_ranking.json, en usd/t), pasado a $/l con la densidad del biodiésel
//    y el tipo de cambio del mes;
//  - gas oil fósil: grado 2 mayorista sin impuestos del relevamiento
//    Res. 1104/2004 (gasoil_precios.json, canal mayorista, ponderado por
//    volumen), neto del biodiésel que llevaba mezclado ese mes (corte real de
//    corte.json): (precio - corte x biodiésel) / (1 - corte);
//  - gas oil importado: CIF de los despachos del mes, puesto en puerto;
//  - surtidor: grado 2 al público (canal minorista), ponderado por volumen;
//  - impuestos: ICL + ICO2 del gas oil, tarifa general (icl_ico2.json, de la
//    DNIAF). El biodiésel no los paga (ley 27.640, artículo 22).
//
// Desde el 22/11/2026, también el bioetanol y las naftas:
//
//  - bioetanol: precio oficial para el corte obligatorio (bioetanol_precios.json,
//    del reporte de la Secretaría de Energía): promedio simple de caña y maíz,
//    porque la ley reparte el corte mitad y mitad;
//  - nafta fósil: nafta súper mayorista sin impuestos (naftas_precios.json, del
//    mismo relevamiento Res. 1104/2004), neta del bioetanol que manda la ley:
//    (precio - 12% x bioetanol) / 88%. Es la "nafta en refinería" de la serie.
//    El sitio no tiene el corte real de bioetanol: se usa el obligatorio;
//  - nafta en el surtidor: súper al público, con impuestos.

export const IVA = 1.21;
export const CORTE_BIOETANOL = 0.12; // ley 27.640, artículo 9

/**
 * Arma los precios por mes. Devuelve null si falta alguno de los archivos.
 * `gasoilPrecios` es gasoil_precios.json, `gasoilRanking` es gasoil_ranking.json,
 * `corte` es corte.json e `iclIco2` es icl_ico2.json (puede faltar: sin impuestos).
 * `naftas` es naftas_precios.json y `bioetanol` es bioetanol_precios.json (pueden
 * faltar: sin esos productos).
 */
export function armarPrecios({ gasoilPrecios, gasoilRanking, corte, iclIco2, naftas, bioetanol } = {}) {
  if (!gasoilPrecios?.canales || !gasoilRanking?.productos || !corte?.mensual) return null;

  const mesesRel = gasoilPrecios.meses;
  const MAYORISTA = gasoilPrecios.canales_distribucion.indexOf('Mayorista');
  const MINORISTA = gasoilPrecios.canales_distribucion.indexOf('Minorista');
  const AL_PUBLICO = gasoilPrecios.canales_comercializacion.indexOf('Al público');
  const [MES, DIST, COM, VOL2, SURT2, , SINIMP2] = [0, 1, 2, 3, 4, 5, 6];

  // promedio ponderado por volumen de una columna de precio, por mes
  const ponderar = (filtro, columna) => {
    const acc = new Map();
    for (const f of gasoilPrecios.canales) {
      if (!filtro(f) || !f[VOL2] || !f[columna]) continue;
      const a = acc.get(f[MES]) || { num: 0, den: 0 };
      a.num += f[VOL2] * f[columna];
      a.den += f[VOL2];
      acc.set(f[MES], a);
    }
    return new Map([...acc].map(([i, a]) => [mesesRel[i], a.num / a.den]));
  };
  const mayorista = ponderar((f) => f[DIST] === MAYORISTA, SINIMP2);
  const surtidor = ponderar((f) => f[DIST] === MINORISTA && f[COM] === AL_PUBLICO, SURT2);

  const tc = new Map(gasoilRanking.tc);
  const densidadGo = gasoilRanking.densidad_go;
  const densidadBio = corte.densidad_bio;
  const bioUsd = new Map((gasoilRanking.productos.find((p) => p.id === 'bio_963_m')?.serie ?? []).filter(([, v]) => v));
  const corteReal = new Map(corte.mensual.map((m) => [m.fecha, m.real]));
  const cif = new Map((gasoilRanking.importaciones ?? []).filter((m) => m.cif_usd_ton).map((m) => [m.fecha, m.cif_usd_ton]));
  const impuestos = new Map((iclIco2?.gasoil ?? []).map(([fecha, icl, , ico2]) => [fecha, { icl, ico2, total: icl + ico2 }]));

  // naftas: [fecha, súper mayorista sin imp, m3, súper surtidor, m3, premium ...]
  const nafta = new Map((naftas?.mensual ?? []).map((f) => [f[0], { mayorista: f[1], surtidor: f[3] }]));
  // bioetanol: [fecha, caña, maíz, publicado]
  const etanol = new Map((bioetanol?.mensual ?? []).map(([fecha, cana, maiz]) => [fecha, { cana, maiz, promedio: (cana + maiz) / 2 }]));

  const todos = [...new Set([...mesesRel, ...bioUsd.keys(), ...impuestos.keys(), ...nafta.keys(), ...etanol.keys()])].sort();
  const porMes = new Map();
  for (const mes of todos) {
    const cambio = tc.get(mes);
    const bio = bioUsd.has(mes) && cambio ? (bioUsd.get(mes) * densidadBio * cambio) / 1000 : null;
    const mezcla = mayorista.get(mes) ?? null;
    const c = corteReal.get(mes) || 0;
    const imp = impuestos.get(mes);
    const et = etanol.get(mes);
    const nf = nafta.get(mes);
    const fila = {
      mes,
      biodiesel: bio,
      gasoil_fosil: mezcla !== null && bio !== null ? (mezcla - c * bio) / (1 - c) : null,
      gasoil_importado: cif.has(mes) && cambio ? (cif.get(mes) * densidadGo * cambio) / 1000 : null,
      gasoil_surtidor: surtidor.get(mes) ?? null,
      impuestos_gasoil: imp ? imp.total : null,
      icl: imp ? imp.icl : null,
      ico2: imp ? imp.ico2 : null,
      bioetanol: et ? et.promedio : null,
      nafta_fosil: et && nf?.mayorista ? (nf.mayorista - CORTE_BIOETANOL * et.promedio) / (1 - CORTE_BIOETANOL) : null,
      nafta_surtidor: nf?.surtidor ?? null,
      bioetanolCana: et ? et.cana : null,
      bioetanolMaiz: et ? et.maiz : null,
      naftaMezcla: nf?.mayorista ?? null, // la súper mayorista tal como se releva, con el bioetanol adentro
      mezcla, // el mayorista tal como se releva, con el biodiésel adentro
      corteReal: c,
      biodieselUsdT: bioUsd.get(mes) ?? null,
      tc: cambio ?? null,
    };
    if (['biodiesel', 'gasoil_fosil', 'gasoil_importado', 'gasoil_surtidor', 'impuestos_gasoil', 'bioetanol', 'nafta_fosil', 'nafta_surtidor'].some((k) => fila[k] !== null)) {
      porMes.set(mes, fila);
    }
  }

  const con = (mes, claves) => claves.every((k) => porMes.get(mes)?.[k] !== null && porMes.get(mes)?.[k] !== undefined);
  const meses = [...porMes.keys()];
  // meses con todo lo que pide la cuenta del surtidor
  const mesesSurtidor = meses.filter((m) => con(m, ['biodiesel', 'gasoil_fosil', 'gasoil_surtidor', 'impuestos_gasoil']));

  /**
   * Qué le pasa al litro de gas oil en el surtidor si el corte pasa de `desde`
   * a `hasta` (en % del gas oil): cuánto por la diferencia de precio (con IVA),
   * cuánto por los impuestos que deja de pagar (lo que el fisco deja de cobrar)
   * y el total, en $/l y en % del precio al público. null si falta algún dato.
   */
  const efectoCorte = (mes, desde, hasta) => {
    if (!con(mes, ['biodiesel', 'gasoil_fosil', 'gasoil_surtidor', 'impuestos_gasoil'])) return null;
    const p = porMes.get(mes);
    const puntos = (hasta - desde) / 100;
    const porPrecio = puntos * (p.biodiesel - p.gasoil_fosil) * IVA;
    const porImpuestos = -puntos * p.impuestos_gasoil;
    const total = porPrecio + porImpuestos;
    return { mes, porPrecio, porImpuestos, total, pct: (total / p.gasoil_surtidor) * 100 };
  };

  /**
   * Cuánto más caro (%) es el litro de `a` que el de `b` en un mes; null si falta alguno.
   * `factor` pasa la comparación a igual energía: es la energía de un litro de `b`
   * dividida por la de un litro de `a` (1 = litro contra litro).
   */
  const brecha = (mes, a, b, factor = 1) => {
    const p = porMes.get(mes);
    if (!p || p[a] === null || p[b] === null || !p[b]) return null;
    return ((p[a] / p[b]) * factor - 1) * 100;
  };

  /** Meses de un período (desde..hasta, 'AAAA-MM') que tienen todas las claves pedidas. */
  const mesesCon = (claves, desde, hasta) => meses.filter((m) => (!desde || m >= desde) && (!hasta || m <= hasta) && con(m, claves));

  return { porMes, meses, mesesSurtidor, de: (mes) => porMes.get(mes) ?? null, efectoCorte, brecha, mesesCon };
}
