// Colores del Sankey de Estructura del mercado. Cada nodo tiene un color fijo
// por entidad (nunca por orden de aparición ni por tamaño) y los flujos salen
// con el color del nodo de origen, como en el tablero Tableau de HDO.
//
// Banderas: la paleta de marcas del mapa de estaciones. Canal de distribución:
// minorista ámbar, mayorista azul. Tipos de negocio y canales de
// comercialización: familias de un tono (minorista/retail ámbar, mayorista y
// transporte azul, agro verde, el resto gris) con dos tonos validados por
// familia, alternados entre miembros por orden alfabético de la lista maestra
// (estable entre meses y filtros). Validado con el validador de paleta de la
// skill dataviz (17/09/2026): pares vecinos ΔE ≥ 15 en modo claro; en modo
// oscuro la paleta pastel del sitio deja algunos pares por debajo, y la
// identidad fina la lleva siempre la etiqueta dentro del nodo.

const hexRgb = (h) => {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbHex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

/** Mezcla lineal de dos colores hex (t = 0 → a, t = 1 → b). */
export function mezclar(a, b, t) {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return rgbHex(...A.map((v, i) => v + (B[i] - v) * t));
}

export function luminancia(hex) {
  const [r, g, b] = hexRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Color de texto legible sobre un fondo dado. */
export const textoSobre = (fondo) => (luminancia(fondo) > 0.4 ? '#1a1a1a' : '#ffffff');

// Segundo tono de cada familia, por tema (el primero es el color base del sitio)
export const ALTERNOS = {
  light: { retail: '#f59e0b', mayorista: '#3b82f6', transporte: '#3b82f6', otros: '#a3a9b3' },
  dark: { retail: '#9a6b34', mayorista: '#8fc3d6', transporte: '#8fc3d6', otros: '#5b6a7b' },
};

const familiaTipo = (t) => (/boca|estaci/i.test(t) ? 'retail' : /comercializador|distribuidor|revendedor/i.test(t) ? 'mayorista' : 'otros');
const familiaCanal = (c) => (/p[úu]blico|estaciones de servicio|reventa/i.test(c) ? 'retail'
  : /transporte|veh[íi]culos/i.test(c) ? 'transporte' : /agro/i.test(c) ? 'agro' : 'otros');

/**
 * Mapa nombre → color para un nivel: dentro de cada familia los miembros se
 * ordenan alfabéticamente (lista maestra completa) y alternan los dos tonos,
 * empezando por el alterno (así "Al público" queda en ámbar claro junto a
 * Agro, el par que el validador marca en ámbar oscuro).
 */
export function coloresNivel(nombres, familiaDe, tonos) {
  const porFamilia = new Map();
  nombres.forEach((n) => {
    const f = familiaDe(n);
    if (!porFamilia.has(f)) porFamilia.set(f, []);
    porFamilia.get(f).push(n);
  });
  const out = new Map();
  for (const [f, lista] of porFamilia) {
    const par = tonos[f] || tonos.otros;
    [...lista].sort((a, b) => a.localeCompare(b)).forEach((n, i) => out.set(n, par[(i + 1) % 2]));
  }
  return out;
}

/** Paleta completa del Sankey para un tema (C = colores del tema). */
export function paletaSankey(C, theme, tiposNegocio, canalesCom, colorBandera) {
  const alt = ALTERNOS[theme] || ALTERNOS.light;
  const tonos = {
    retail: [C.oil, alt.retail], mayorista: [C.exp, alt.mayorista], transporte: [C.exp, alt.transporte],
    agro: [C.bio, C.bio], otros: [C.neutral, alt.otros],
  };
  return {
    bandera: (b) => (b.startsWith('Otras') ? alt.otros : colorBandera(b)),
    distribucion: (n) => (n === 'Minorista' ? C.oil : n === 'Mayorista' ? C.exp : alt.otros),
    tipo: coloresNivel(tiposNegocio, familiaTipo, tonos),
    canal: coloresNivel(canalesCom, familiaCanal, tonos),
    otros: alt.otros,
  };
}
