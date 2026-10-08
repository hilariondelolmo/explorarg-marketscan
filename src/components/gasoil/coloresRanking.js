// Colores del Ranking de precios: uno por producto, fijo (no cambia con la
// selección), en versión clara y oscura. Los 16 productos principales (los
// once de la selección inicial más Brent, WTI y las naftas y el kerosene en
// surtidor) llevan tonos base buscados para pasar el validador de la guía
// dataviz (banda de luminosidad, croma, separación CVD y normal entre pares
// adyacentes; modo claro sobre #ffffff y oscuro sobre #111820, en el orden
// del catálogo y en el de la selección inicial). Los demás derivan de un tono
// base con un corrimiento de luminosidad y matiz en OKLCH. Generado por
// paleta.py y buscar.js (scratchpad de la sesión 8, 07/10/2026).
export const COLORES_RANKING = {
  light: {
    g2_s: '#e54343', g2_n: '#a10072', g3_s: '#814204', g3_n: '#eb7fcc',
    ns_s: '#693995', np_s: '#a65a81', ke_s: '#06aeab', brent: '#a28dfe',
    wti: '#0a82f3', canadon_seco: '#1e44c2', escalante: '#0a839e', medanito: '#4cb4fe',
    diesel_usa: '#9459df', fame_ara: '#008903', bio_963_m: '#16ca77', aceite_fas: '#e19b16',
    g2_c: '#fe834e', g3_c: '#b36546', g1_s: '#b3075e', ns_c: '#9d56ac',
    ns_n: '#7f62c4', np_c: '#d47d93', np_n: '#d67e7f', ke_c: '#0a7d89',
    ke_n: '#0b886e', magallanes: '#2eb3c0', maria_ines: '#715be6', mendoza_norte: '#3982d3',
    noroeste: '#b154aa', san_sebastian: '#19b9b8', diesel_nwe: '#d87cfb', diesel_nymex: '#4f41c5',
    diesel_ulsd: '#58a9dd', pme_ara: '#17bb8f', sme_arg: '#7d9c0c', sme_usg: '#009d7b',
    jj_bio_fob: '#3e9e27', bio_963_gi: '#00a1ab', bio_963_gni: '#14adae', bio_963_p: '#7dc436',
    aceite_fas_vendedor: '#b46d0a', aceite_fas_minagri: '#a59305', aceite_fob_sagyp: '#db7038', aceite_upriver: '#c96904',
    metanol_usa: '#c590d3', metanol_eu: '#8279dd', metanol_ypf: '#b884c6', glicerina: '#13ac93',
  },
  dark: {
    g2_s: '#d96f56', g2_n: '#99356d', g3_s: '#998700', g3_n: '#d55fb9',
    ns_s: '#6c5094', np_s: '#b44646', ke_s: '#0ba5b6', brent: '#1476de',
    wti: '#aa45aa', canadon_seco: '#5d93e0', escalante: '#1864a0', medanito: '#158c7b',
    diesel_usa: '#7f58d2', fame_ara: '#047341', bio_963_m: '#00ad79', aceite_fas: '#855409',
    g2_c: '#ab5200', g3_c: '#7e5e00', g1_s: '#af465d', ns_c: '#9e6eaf',
    ns_n: '#8477c0', np_c: '#a43e1a', np_n: '#d57630', ke_c: '#007592',
    ke_n: '#0a8079', magallanes: '#2594c5', maria_ines: '#5d65b8', mendoza_norte: '#19a7a1',
    noroeste: '#6e44bc', san_sebastian: '#3757c8', diesel_nwe: '#823bae', diesel_nymex: '#7484fe',
    diesel_ulsd: '#6a85d1', pme_ara: '#16a592', sme_arg: '#5c8c40', sme_usg: '#09816f',
    jj_bio_fob: '#1e853b', bio_963_gi: '#018ca3', bio_963_gni: '#00929c', bio_963_p: '#2f7435',
    aceite_fas_vendedor: '#b9783f', aceite_fas_minagri: '#8c7616', aceite_fob_sagyp: '#ad5f44', aceite_upriver: '#b76e43',
    metanol_usa: '#9e386a', metanol_eu: '#5a5aa0', metanol_ypf: '#d3699a', glicerina: '#079691',
  },
};
