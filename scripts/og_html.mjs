// Vista previa de enlaces por sección. Corre al final de `npm run build`.
//
// WhatsApp, X, LinkedIn y demás no ejecutan el sitio: leen el HTML crudo. Como
// todas las rutas devolvían el mismo index.html, todas mostraban la misma
// miniatura. Este paso deja en dist/ un index.html por ruta (dist/gas-oil/index.html,
// etc.), idéntico al principal salvo el título, la descripción y la imagen.
// Vercel sirve primero el archivo que existe y recién después aplica el rewrite
// a /index.html, así que el sitio se comporta igual.
//
// La lista sale de scripts/miniaturas.json y de los episodios de
// src/data/dicho_dato.json; las imágenes, de `python3 scripts/generar_miniaturas.py`.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');
const leer = (p) => JSON.parse(readFileSync(join(RAIZ, p), 'utf8'));

const conf = leer('scripts/miniaturas.json');
const dd = leer('src/data/dicho_dato.json');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const recortar = (s, n = 200) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);
const slug = (ruta) => ruta.replace(/^\/|\/$/g, '').replace(/\//g, '-');

const paginas = conf.paginas.map((p) => ({
  ruta: p.ruta,
  titulo: p.titulo.replace(/\n/g, ' - '),
  descripcion: p.descripcion || conf.descripcion,
}));
for (const e of dd.episodios) {
  paginas.push({
    ruta: `/del-dicho-al-dato/${e.n}`,
    titulo: `Del dicho al dato - ${e.n} - «${e.cita}»`,
    descripcion: recortar(`${e.veredicto}. ${e.resumen}`),
  });
}

const base = readFileSync(join(DIST, 'index.html'), 'utf8');
const poner = (html, patron, valor) => {
  if (!patron.test(html)) throw new Error(`og_html: no encontré ${patron} en dist/index.html`);
  return html.replace(patron, (_, antes, despues) => `${antes}${esc(valor)}${despues}`);
};

let hechas = 0;
for (const p of paginas) {
  const imagen = `og/${slug(p.ruta)}.png`;
  if (!existsSync(join(DIST, imagen))) {
    throw new Error(`og_html: falta public/${imagen}. Corré: python3 scripts/generar_miniaturas.py`);
  }
  const titulo = `${p.titulo} · Explorarg Marketscan`;
  const url = `${conf.sitio}/${imagen}`;
  let html = base;
  html = poner(html, /(<title>)[^<]*(<\/title>)/, titulo);
  html = poner(html, /(<meta property="og:title" content=")[^"]*(")/, titulo);
  html = poner(html, /(<meta name="twitter:title" content=")[^"]*(")/, titulo);
  html = poner(html, /(<meta property="og:description" content=")[^"]*(")/, p.descripcion);
  html = poner(html, /(<meta name="twitter:description" content=")[^"]*(")/, p.descripcion);
  html = poner(html, /(<meta property="og:image" content=")[^"]*(")/, url);
  html = poner(html, /(<meta name="twitter:image" content=")[^"]*(")/, url);
  html = html.replace('<meta property="og:type"', `<meta property="og:url" content="${conf.sitio}${p.ruta}" />\n    <meta property="og:type"`);
  const destino = join(DIST, p.ruta, 'index.html');
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, html);
  hechas += 1;
}
console.log(`og_html: ${hechas} páginas con miniatura propia`);
