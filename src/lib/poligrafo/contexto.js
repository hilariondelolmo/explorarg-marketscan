// Polígrafo - el contexto de cálculo, armado en un solo lugar.
//
// La página, la función del servidor y el banco de prueba tienen que trabajar
// con los mismos datos y la misma ficha: los tres llaman a armarContexto con
// los JSON del sitio ya leídos (cada uno los lee a su manera: import, fs).
//
// Regla de HDO (22/11/2026): todo lo que está en explorarg.com se puede usar
// para evaluar. Cuando se conecta un dato nuevo del sitio, se suma acá (y en
// DATOS_DEL_SITIO, que es la lista de archivos que hay que leer).

import { agregarFicha } from './ficha.js';
import { prepararDatos } from './motor.js';
import { armarPrecios } from './precios.js';

/** Los JSON de src/data que usa el Polígrafo, por el nombre con que los espera armarContexto. */
export const DATOS_DEL_SITIO = {
  empresas: 'empresas',
  mercado: 'mercado',
  corte: 'corte',
  capacidad: 'capacidad',
  normas: 'poligrafo_normas',
  petroleras: 'petroleras',
  aceite: 'precio_aceite_rosario',
  tecnicos: 'datos_tecnicos',
  gasoilPrecios: 'gasoil_precios',
  gasoilRanking: 'gasoil_ranking',
  iclIco2: 'icl_ico2',
  naftas: 'naftas_precios',
  bioetanol: 'bioetanol_precios',
  leyBases: 'diputados_ley_bases_2024',
  compras: 'compras_cupo',
  art39: 'dicho_dato_art39', // la planilla del artículo 39: capacidad de cada no integrada y topes de la media sanción
  gestion: 'gestion', // presidencias, secretarios de Energía y fórmulas de precio (página /gestion)
  goSectores: 'go_sectores', // gas oil vendido por sector (página /gas-oil)
  evidencia: 'evidencia', // precio publicado del biodiésel en pesos y retenciones
  rutasPuertos: 'rutas_puertos', // kilómetros por ruta de cada planta al puerto (mapa de plantas)
};

/**
 * `d` trae los JSON con los nombres de DATOS_DEL_SITIO, más `recinto`
 * ({ SENADORES, VOTACION } de src/data/mapa-recinto.js). Lo que falte se saltea:
 * los indicadores y los datos de la ficha que dependan de eso no se arman.
 */
export function armarContexto(d) {
  const precios = armarPrecios({
    gasoilPrecios: d.gasoilPrecios,
    gasoilRanking: d.gasoilRanking,
    corte: d.corte,
    iclIco2: d.iclIco2,
    naftas: d.naftas,
    bioetanol: d.bioetanol,
  });
  const ctx = agregarFicha(
    prepararDatos({ empresas: d.empresas, mercado: d.mercado, corte: d.corte, capacidad: d.capacidad, normas: d.normas, precios, tecnicos: d.tecnicos }),
    { petroleras: d.petroleras, aceite: d.aceite, tecnicos: d.tecnicos, recinto: d.recinto, leyBases: d.leyBases, art39: d.art39, gestion: d.gestion, ranking: d.gasoilRanking, sectores: d.goSectores, evidencia: d.evidencia, rutasPuertos: d.rutasPuertos, densidadBio: d.corte?.densidad_bio }
  );
  // Para el Analista: el precio del aceite por distancia a Rosario, mes por mes y por
  // zona, y las compras de cada petrolera a cada elaboradora (pueden faltar).
  ctx.aceite = d.aceite ?? null;
  ctx.compras = d.compras ?? null;
  // El gas oil vendido por sector y por petrolera, y lo que compra y vende cada petrolera (para su corte).
  ctx.gasoilSectores = d.goSectores ?? null;
  ctx.petroleras = d.petroleras ?? null;
  // Y todas las series de precio del sitio, tal como vienen (src/lib/analista/productos.js las pasa de unidad).
  ctx.fuentesPrecio = {
    gasoilPrecios: d.gasoilPrecios ?? null,
    gasoilRanking: d.gasoilRanking ?? null,
    naftas: d.naftas ?? null,
    iclIco2: d.iclIco2 ?? null,
    evidencia: d.evidencia ?? null,
    densidadBio: d.corte?.densidad_bio ?? null,
  };
  return ctx;
}
