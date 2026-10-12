// Colores de los grupos económicos en Compras al cupo (treemap y tortas del
// mapa). Un color fijo por grupo, por nombre - nunca por orden de aparición
// ni por tamaño, así los filtros no repintan a los que quedan. Dos juegos,
// claro y oscuro, buscados en OKLCH con la misma matemática del validador de
// la guía dataviz (buscar.mjs, sesión del 12/10/2026): los dieciséis pasan el
// validador en los dos temas (banda de luminosidad, croma, separación CVD y
// normal entre vecinos, contraste ≥ 3:1 sobre #ffffff y #0a0e12). Los matices
// siguen, cuando se pudo, a los del tablero Tableau de HDO (Bojanich azul,
// Cremer verde, Rosario Bio dorado, Bolzán naranja, AOM violeta…). Como en
// un treemap cualquier par puede quedar vecino, la identidad fina la lleva
// siempre la etiqueta de la baldosa. Los grupos que no figuran (los que
// dejaron de operar hace años) van en grises.
export const COLORES_HOLDING = {
  light: {
    'GRUPO BOJANICH': '#5057f4', 'EXPLORA S.A.': '#cd1755', 'UNITEC BIO S.A.': '#1272ab', 'VILUCO S.A.': '#d86e11',
    'AGRO M Y G S.A.': '#0a97c1', 'GRUPO BOLZÁN': '#922f0a', 'PAMPA BIO S.A.': '#0b9e91', 'ERA S.A.': '#890294',
    'PATAGONIA S.A.': '#6b9316', 'AOM S.A.': '#9b34d1', 'GRUPO CREMER': '#177945', 'ARIPAR S.A.': '#2685fe',
    'DIASER S.A.': '#0ea361', 'DOBLE L S.A.': '#6717c2', 'GRUPO PUCCIARIELLO': '#906104', 'ENRESA': '#be179f',
  },
  dark: {
    'GRUPO BOJANICH': '#3d60f8', 'EXPLORA S.A.': '#bf2f56', 'UNITEC BIO S.A.': '#2d7baf', 'VILUCO S.A.': '#be861d',
    'AGRO M Y G S.A.': '#21a0cb', 'GRUPO BOLZÁN': '#ce4714', 'PAMPA BIO S.A.': '#169b86', 'ERA S.A.': '#9c20bb',
    'PATAGONIA S.A.': '#698639', 'AOM S.A.': '#b752d7', 'GRUPO CREMER': '#14a846', 'ARIPAR S.A.': '#3289fc',
    'DIASER S.A.': '#1b7548', 'DOBLE L S.A.': '#6e41db', 'GRUPO PUCCIARIELLO': '#7e6f08', 'ENRESA': '#c71495',
  },
};

// Grises para los grupos sin color propio, alternados por orden alfabético
const GRISES = {
  light: ['#8a8f98', '#6b7280', '#a3a8b1'],
  dark: ['#7f8995', '#5f6b78', '#99a3ad'],
};

const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7);

/** Color del grupo (holding) en el tema dado. */
export function colorHolding(nombre, tema = 'light') {
  return COLORES_HOLDING[tema][nombre] || GRISES[tema][hash(nombre) % GRISES[tema].length];
}

const hexRgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function luminancia(hex) {
  const [r, g, b] = hexRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Color de texto legible sobre un relleno dado. */
export const textoSobre = (fondo) => (luminancia(fondo) > 0.36 ? '#111111' : '#ffffff');
