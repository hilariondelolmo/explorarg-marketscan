#!/usr/bin/env node
/**
 * Graba un tutorial en video de una página del sitio explorarg (pedido HDO 01/10/2026).
 *
 * Abre la página publicada con el Chrome de la máquina (Playwright, sin ventana),
 * dibuja un cursor que sigue al mouse, hace clic, resalta controles y graba la
 * pantalla a 1920×1080 siguiendo un guion JSON (scripts/tutorial/guiones/<id>.json).
 * Cada paso del guion tiene un texto de locución y una lista de acciones; el paso
 * dura lo que dura su locución (duraciones reales de output/tutorial/<id>/voz/
 * duraciones.json si existen, o una estimación por el largo del texto) más un aire.
 *
 * Deja en output/tutorial/<id>/: video.webm (crudo, con el arranque de la página
 * antes del tutorial), tiempos.json (dónde empieza cada paso, para pegarle la voz
 * con armar.py) y capturas/<paso>.png (el estado de la pantalla al terminar las
 * acciones de cada paso, para revisar sin mirar el video).
 *
 * Uso:
 *   node scripts/tutorial/grabar.mjs guiones/gasoil.json             # con la voz medida, si está
 *   node scripts/tutorial/grabar.mjs guiones/gasoil.json --mudo      # duraciones estimadas por el texto
 *   node scripts/tutorial/grabar.mjs guiones/gasoil.json --rapido    # no espera la locución (probar selectores)
 *   node scripts/tutorial/grabar.mjs guiones/gasoil.json --desde p12 --hasta p14   # solo esos pasos
 *   --out carpeta   (default output/tutorial/<id>)   --ventana (Chrome con ventana)   --sin-capturas
 *
 * Acciones de un paso ("tipo" y sus campos; "sel" es CSS, o { sel, texto, exacto, nth }):
 *   ir {url}                      navega y espera la carga
 *   cargar                        espera a que la página termine de cargar datos
 *   cartel {kicker, titulo, sub, marca} / ocultar_cartel     placa a pantalla completa
 *   rotulo {texto}                pastilla abajo a la izquierda (vacío la saca)
 *   mover | hover {sel}           lleva el cursor al centro del elemento
 *   click {sel, espera}           mover + clic (con destello)
 *   select {sel, valor | etiqueta}   elige una opción de un <select> nativo
 *   escribir {sel, texto, ritmo}  clic en el campo y tipea
 *   tecla {tecla}                 p. ej. Escape
 *   resaltar {sel, solo, margen}  recuadro ámbar alrededor del elemento (sigue al scroll)
 *   limpiar                       saca los recuadros
 *   scroll {sel, margen} | {dy} | {arriba: true}
 *   esperar {s}
 *   js {codigo}                   expresión a evaluar en la página (escape)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const AIRE = 0.35;      // silencio después de cada bloque de locución, en segundos
const ADELANTO = 0.15;  // la voz arranca este tiempo después de que empiezan las acciones del paso
const CPS = 15.5;       // caracteres por segundo de Fernando a velocidad 1,1 (estimación para el modo mudo)
const COLOR = '#f59e0b';

// ---------- argumentos ----------
const argv = process.argv.slice(2);
const opt = { mudo: false, rapido: false, ventana: false, capturas: true };
let guionArg = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--mudo') opt.mudo = true;
  else if (a === '--rapido') { opt.rapido = true; opt.mudo = true; }
  else if (a === '--ventana') opt.ventana = true;
  else if (a === '--sin-capturas') opt.capturas = false;
  else if (a === '--desde') opt.desde = argv[++i];
  else if (a === '--hasta') opt.hasta = argv[++i];
  else if (a === '--out') opt.out = argv[++i];
  else if (!a.startsWith('--')) guionArg = a;
}
if (!guionArg) {
  console.error('uso: node grabar.mjs guiones/<id>.json [--mudo|--rapido] [--desde pNN] [--hasta pNN]');
  process.exit(2);
}
const guionPath = path.isAbsolute(guionArg) ? guionArg : fs.existsSync(path.resolve(guionArg)) ? path.resolve(guionArg) : path.join(AQUI, guionArg);
const G = JSON.parse(fs.readFileSync(guionPath, 'utf8'));
const OUT = opt.out ? path.resolve(opt.out) : path.join(RAIZ, 'output', 'tutorial', G.id);
fs.mkdirSync(OUT, { recursive: true });
if (opt.capturas) fs.mkdirSync(path.join(OUT, 'capturas'), { recursive: true });

// Duraciones reales de la voz (las escribe locucion.py); en modo mudo se estiman
const duracionesPath = path.join(OUT, 'voz', 'duraciones.json');
const duraciones = !opt.mudo && fs.existsSync(duracionesPath) ? JSON.parse(fs.readFileSync(duracionesPath, 'utf8')) : {};
const conVoz = Object.keys(duraciones).length > 0;
const duracion = (p) => (p.texto ? (duraciones[p.id] ?? p.texto.length / CPS) : 0);

// Pasos a correr
let pasos = G.pasos;
if (opt.desde) pasos = pasos.slice(pasos.findIndex((p) => p.id === opt.desde));
if (opt.hasta) pasos = pasos.slice(0, pasos.findIndex((p) => p.id === opt.hasta) + 1);
if (!pasos.length) { console.error('ningún paso con ese --desde / --hasta'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ease = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

// ---------- capa dibujada en la página: cursor, destello, recuadros, placa y rótulo ----------
const INIT = `(() => {
  if (window.__tut) return;
  const Z = 2147483000;
  const COLOR = '${COLOR}';
  const st = document.createElement('style');
  st.textContent = \`
    @keyframes __tut_rip { from { transform: scale(.4); opacity: .95 } to { transform: scale(2.6); opacity: 0 } }
    #__tut_cursor { position: fixed; left: 0; top: 0; pointer-events: none; z-index: \${Z + 2}; opacity: 0; transition: opacity .2s; filter: drop-shadow(0 2px 3px rgba(0,0,0,.4)); }
    .__tut_rip { position: fixed; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; border: 3px solid \${COLOR}; pointer-events: none; z-index: \${Z + 1}; animation: __tut_rip .55s ease-out forwards; }
    .__tut_hl { position: fixed; border: 3px solid \${COLOR}; border-radius: 10px; box-shadow: 0 0 0 4px rgba(245,158,11,.22), 0 0 18px rgba(245,158,11,.35); pointer-events: none; z-index: \${Z}; opacity: 0; transition: opacity .25s; }
    .__tut_hl.on { opacity: 1 }
    #__tut_cartel { position: fixed; inset: 0; z-index: \${Z + 3}; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; padding: 0 160px; background: linear-gradient(135deg, #0b1f4d 0%, #1e3a8a 60%, #1d4ed8 100%); color: #fff; font-family: Inter, -apple-system, "Segoe UI", Roboto, sans-serif; opacity: 0; transition: opacity .45s; pointer-events: none; }
    #__tut_cartel.on { opacity: 1 }
    #__tut_cartel .k { font-size: 22px; letter-spacing: .18em; text-transform: uppercase; opacity: .8; margin-bottom: 18px }
    #__tut_cartel .t { font-size: 76px; font-weight: 700; line-height: 1.05; margin-bottom: 22px }
    #__tut_cartel .s { font-size: 30px; opacity: .9; max-width: 1150px; line-height: 1.35 }
    #__tut_cartel .m { position: absolute; left: 160px; bottom: 70px; font-size: 20px; letter-spacing: .12em; opacity: .7 }
    #__tut_rotulo { position: fixed; left: 24px; bottom: 24px; z-index: \${Z}; background: rgba(15,23,42,.86); color: #fff; font: 600 20px/1 Inter, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 12px 18px; border-radius: 999px; opacity: 0; transition: opacity .3s; pointer-events: none; }
    #__tut_rotulo.on { opacity: 1 }
  \`;
  const hls = [];
  let cursor = null, rotulo = null;
  const ready = (fn) => (document.body ? fn() : document.addEventListener('DOMContentLoaded', fn));
  ready(() => {
    document.head.appendChild(st);
    cursor = document.createElement('div'); cursor.id = '__tut_cursor';
    cursor.innerHTML = '<svg width="36" height="36" viewBox="0 0 24 24"><path d="M4 2.5 L19.5 12.2 L12.3 13.3 L8.6 20.5 Z" fill="#111827" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cursor);
    rotulo = document.createElement('div'); rotulo.id = '__tut_rotulo'; document.body.appendChild(rotulo);
    document.addEventListener('mousemove', (e) => { cursor.style.opacity = '1'; cursor.style.left = e.clientX + 'px'; cursor.style.top = e.clientY + 'px'; }, true);
    document.addEventListener('mousedown', (e) => window.__tut.ripple(e.clientX, e.clientY), true);
    const tick = () => {
      for (const h of hls) {
        const r = h.el.getBoundingClientRect(); const m = h.margen;
        h.box.style.left = (r.left - m) + 'px'; h.box.style.top = (r.top - m) + 'px';
        h.box.style.width = (r.width + 2 * m) + 'px'; h.box.style.height = (r.height + 2 * m) + 'px';
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  window.__tut = {
    ripple(x, y) { const r = document.createElement('div'); r.className = '__tut_rip'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700); },
    resaltar(el, o = {}) {
      if (o.solo !== false) this.limpiar();
      const box = document.createElement('div'); box.className = '__tut_hl'; document.body.appendChild(box);
      hls.push({ el, box, margen: o.margen ?? 6 });
      requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('on')));
    },
    limpiar() { for (const h of hls) { h.box.classList.remove('on'); setTimeout(() => h.box.remove(), 300); } hls.length = 0; },
    cartel(o) {
      let c = document.getElementById('__tut_cartel');
      if (!c) { c = document.createElement('div'); c.id = '__tut_cartel'; document.body.appendChild(c); }
      c.innerHTML = '<div class="k"></div><div class="t"></div><div class="s"></div><div class="m"></div>';
      c.querySelector('.k').textContent = o.kicker || ''; c.querySelector('.t').textContent = o.titulo || '';
      c.querySelector('.s').textContent = o.sub || ''; c.querySelector('.m').textContent = o.marca || '';
      requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('on')));
    },
    ocultarCartel() { const c = document.getElementById('__tut_cartel'); if (c) { c.classList.remove('on'); setTimeout(() => c.remove(), 500); } },
    rotulo(t) { if (!rotulo) return; if (t) { rotulo.textContent = t; rotulo.classList.add('on'); } else rotulo.classList.remove('on'); },
  };
})();`;

// ---------- navegador ----------
const vp = { width: G.viewport?.[0] ?? 1920, height: G.viewport?.[1] ?? 1080 };
const browser = await chromium.launch({ channel: G.canal ?? 'chrome', headless: !opt.ventana });
const ctx = await browser.newContext({
  viewport: vp, deviceScaleFactor: 1, locale: 'es-AR', colorScheme: G.tema ?? 'light',
  recordVideo: { dir: OUT, size: vp },
});
await ctx.addInitScript(INIT);
const page = await ctx.newPage();
const tPage = Date.now();
const M = { x: Math.round(vp.width * 0.55), y: Math.round(vp.height * 0.6) }; // dónde está el cursor

async function esperarCarga(extra = 400) {
  await page.waitForFunction(() => {
    const txt = (el) => el.textContent || '';
    if ([...document.querySelectorAll('.section-placeholder')].some((e) => /cargando/i.test(txt(e)))) return false;
    if ([...document.querySelectorAll('.go-desplegable-boton .chart-card-subtitle')].some((e) => /cargando/i.test(txt(e)))) return false;
    return true;
  }, null, { timeout: 90000 });
  await sleep(extra);
}

function loc(t) {
  if (typeof t === 'string') return page.locator(t).first();
  let l = page.locator(t.sel || 'button, a, label, [role=button]');
  if (t.texto) l = l.filter({ hasText: t.exacto ? new RegExp('^\\s*' + escapeRe(t.texto) + '\\s*$') : t.texto });
  return t.nth != null ? l.nth(t.nth) : l.first();
}

// Bloques que quedan pegados arriba al scrollear (uno por tablero) y paneles fijos:
// lo que está adentro siempre se ve, y lo demás hay que scrollearlo por debajo de ellos
const PEGADOS = '.go-sticky, .mz-controles-sticky, .mapa-cabecera, .pi-sticky';
const FIJOS = `${PEGADOS}, .section-nav, .top-nav, .section-nav-menu, .mh-dropdown-panel, .nav-dropdown-menu, .mapa-detalle, .mz-header-flotante`;

// Borde inferior de lo que queda fijo arriba (sub-nav o bloque pegado)
async function techo() {
  return page.evaluate((sel) => {
    const n = document.querySelector('.section-nav') || document.querySelector('.top-nav');
    let b = n ? n.getBoundingClientRect().bottom : 0;
    for (const s of document.querySelectorAll(sel)) {
      const r = s.getBoundingClientRect();
      if (getComputedStyle(s).position === 'sticky' && r.top <= b + 2 && r.bottom > b) b = Math.max(b, r.bottom);
    }
    return Math.max(0, b);
  }, PEGADOS);
}

async function scrollSuave(delta, ms = 600) {
  if (!delta) return;
  const y0 = await page.evaluate(() => window.scrollY);
  const n = Math.max(6, Math.round(ms / 16));
  for (let i = 1; i <= n; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), y0 + delta * ease(i / n));
    await sleep(16);
  }
  await sleep(120);
}

// Centro del elemento, scrolleando antes si está tapado o fuera de la pantalla
async function centro(l, alinear = true) {
  await l.waitFor({ state: 'visible', timeout: 20000 });
  let b = await l.boundingBox();
  if (!b) throw new Error('el elemento no tiene caja');
  const fijo = await l.evaluate((el, sel) => !!el.closest(sel), FIJOS);
  if (alinear && !fijo) {
    const t = await techo();
    // Un elemento chico tiene que verse entero; de uno grande (un nodo alto del Sankey, un mapa) alcanza con que se vea su centro
    const chico = b.height < 220;
    const cy = b.y + b.height / 2;
    const arriba = chico ? b.y < t + 12 : cy < t + 12;
    const abajo = chico ? b.y + b.height > vp.height - 12 : cy > vp.height - 12;
    if (arriba || abajo) {
      const destino = t + 28;
      await scrollSuave(b.y - destino);
      b = await l.boundingBox();
    }
  }
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
}

async function moverA(x, y) {
  const d = Math.hypot(x - M.x, y - M.y);
  if (d < 1) return;
  const ms = Math.min(1100, Math.max(260, 260 + d * 0.75));
  const n = Math.max(8, Math.round(ms / 16));
  const x0 = M.x, y0 = M.y;
  for (let i = 1; i <= n; i++) {
    const e = ease(i / n);
    await page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
    await sleep(16);
  }
  M.x = x; M.y = y;
}

async function clickEn(l, espera = 0.35) {
  const c = await centro(l);
  await moverA(c.x, c.y);
  await sleep(120);
  await page.mouse.down(); await sleep(90); await page.mouse.up();
  await sleep(espera * 1000);
}

const t = (s) => (opt.rapido ? s * 0.15 : s);
const avisos = [];

// Mover, resaltar o scrollear a algo que no está no justifica tirar una grabación de diez minutos:
// se avisa, queda anotado en tiempos.json y se sigue. Un clic que falla sí corta.
async function ejecutar(a) {
  if (['mover', 'hover', 'resaltar', 'scroll'].includes(a.tipo)) {
    try {
      await Promise.race([
        ejecutarAccion(a),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`${a.tipo}: no apareció en 8 s`)), 8000)),
      ]);
    } catch (e) {
      const sel = typeof a.sel === 'string' ? a.sel : JSON.stringify(a.sel || {});
      avisos.push(`${pasoActual}: ${a.tipo} ${sel} -> ${e.message.split('\n')[0]}`);
      process.stdout.write(`\n  ⚠ ${avisos.at(-1)}\n  `);
    }
    return;
  }
  await ejecutarAccion(a);
}
let pasoActual = '';

async function ejecutarAccion(a) {
  switch (a.tipo) {
    case 'ir': await page.goto(a.url, { waitUntil: 'domcontentloaded' }); await esperarCarga(); break;
    case 'cargar': await esperarCarga(a.extra ?? 400); break;
    case 'cartel': await page.evaluate((o) => window.__tut.cartel(o), a); break;
    case 'ocultar_cartel': await page.evaluate(() => window.__tut.ocultarCartel()); await sleep(500); break;
    case 'rotulo': await page.evaluate((x) => window.__tut.rotulo(x), a.texto || ''); break;
    case 'mover': case 'hover': { const c = await centro(loc(a.sel)); await moverA(c.x + (a.dx ?? 0), c.y + (a.dy ?? 0)); await sleep(t(a.espera ?? 0.3) * 1000); break; }
    case 'click': await clickEn(loc(a.sel), t(a.espera ?? 0.35)); break;
    case 'select': {
      const l = loc(a.sel); const c = await centro(l); await moverA(c.x, c.y); await sleep(150);
      await page.evaluate(([x, y]) => window.__tut.ripple(x, y), [c.x, c.y]);
      await l.selectOption(a.valor != null ? String(a.valor) : { label: a.etiqueta });
      await sleep(t(a.espera ?? 0.4) * 1000); break;
    }
    case 'escribir': { const l = loc(a.sel); await clickEn(l, 0.15); await page.keyboard.type(a.texto, { delay: opt.rapido ? 5 : (a.ritmo ?? 45) }); await sleep(t(a.espera ?? 0.4) * 1000); break; }
    case 'tecla': await page.keyboard.press(a.tecla); await sleep(t(a.espera ?? 0.3) * 1000); break;
    case 'resaltar': { const l = loc(a.sel); await centro(l, a.alinear !== false); await l.evaluate((el, o) => window.__tut.resaltar(el, o), { solo: a.solo !== false, margen: a.margen ?? 6 }); await sleep(t(a.espera ?? 0.3) * 1000); break; }
    case 'limpiar': await page.evaluate(() => window.__tut.limpiar()); break;
    case 'scroll': {
      if (a.arriba) { const y = await page.evaluate(() => window.scrollY); await scrollSuave(-y, 650); }
      else if (a.sel) { const b = await loc(a.sel).boundingBox(); if (!b) throw new Error('scroll: elemento sin caja'); await scrollSuave(b.y - ((await techo()) + (a.margen ?? 24))); }
      else await scrollSuave(a.dy ?? 400);
      await sleep(t(a.espera ?? 0.2) * 1000); break;
    }
    case 'esperar': await sleep(t(a.s ?? 1) * 1000); break;
    case 'js': await page.evaluate(a.codigo); break;
    default: throw new Error(`acción desconocida: ${a.tipo}`);
  }
}

// ---------- grabación ----------
// Con --desde, arranca en la página donde estaría el paso: la última entrada de G.paginas anterior o igual a él
function paginaDe(id) {
  const ids = G.pasos.map((p) => p.id);
  let ruta = null;
  for (const pid of ids) { if (G.paginas?.[pid]) ruta = G.paginas[pid]; if (pid === id) break; }
  return ruta ? new URL(ruta, G.url).toString() : G.url;
}
const inicioUrl = opt.desde ? paginaDe(opt.desde) : G.url;
console.log(`guion ${G.id}: ${pasos.length} pasos, ${conVoz ? 'con duraciones de la voz' : opt.rapido ? 'modo rápido' : 'duraciones estimadas'} -> ${OUT}`);
await page.goto(inicioUrl, { waitUntil: 'domcontentloaded' });
await esperarCarga(600);
await page.mouse.move(M.x, M.y);
// El reloj del tutorial arranca en el instante en que se pide la placa de apertura: su fundido es lo que
// después se busca en el video crudo para saber dónde empieza el tutorial (el reloj de pared no sirve:
// el video no registra el tiempo de carga de la página).
const tInicio = Date.now();
if (G.cartel && !opt.desde) { await page.evaluate((o) => window.__tut.cartel(o), G.cartel); await sleep(700); }
const tiempos = [];
for (const paso of pasos) {
  const t0 = Date.now();
  const dur = duracion(paso);
  pasoActual = paso.id;
  process.stdout.write(`  ${paso.id}  ${(paso.titulo || '').padEnd(42).slice(0, 42)}  voz ${dur.toFixed(1).padStart(5)} s  `);
  try {
    for (const a of paso.acciones || []) await ejecutar(a);
  } catch (e) {
    console.log(`\n  ✗ ${paso.id}: ${e.message.split('\n')[0]}`);
    throw e;
  }
  if (opt.capturas) await page.screenshot({ path: path.join(OUT, 'capturas', `${paso.id}.png`) });
  const objetivo = t0 + (paso.texto ? (ADELANTO + dur + AIRE) : (paso.espera ?? 0.8)) * 1000;
  if (!opt.rapido) { const falta = objetivo - Date.now(); if (falta > 0) await sleep(falta); }
  const fin = Date.now();
  tiempos.push({ id: paso.id, titulo: paso.titulo || '', inicio: (t0 - tInicio) / 1000, fin: (fin - tInicio) / 1000, voz: dur, texto: paso.texto || '' });
  console.log(`paso ${((fin - t0) / 1000).toFixed(1).padStart(5)} s`);
}
await sleep(1200);
const video = page.video();
await ctx.close();
const tCierre = Date.now();
const crudo = await video.path();
await browser.close();

const destino = path.join(OUT, 'video.webm');
fs.renameSync(crudo, destino);
const durVideo = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', destino]).toString().trim());

// Dónde empieza el tutorial dentro del video crudo: el primer cuadro en que la placa de apertura
// (azul marino) empieza a fundirse sobre la página. Sin placa, o con --desde, vale el reloj de pared.
function buscarPlaca() {
  const w = 16, h = 9, fps = 25;
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', destino, '-t', '12', '-vf', `scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 });
  const n = Math.floor(raw.length / (w * h * 3));
  for (let i = 0; i < n; i++) {
    let r = 0, b = 0;
    for (let p = 0; p < w * h; p++) { r += raw[i * w * h * 3 + p * 3]; b += raw[i * w * h * 3 + p * 3 + 2]; }
    if ((b - r) / (w * h) > 15) return Math.max(0, i / fps - 1 / fps);
  }
  return null;
}
const porPared = Math.max(0, (tInicio - tPage) / 1000 - ((tCierre - tPage) / 1000 - durVideo));
const placa = G.cartel && !opt.desde ? buscarPlaca() : null;
const videoDesde = placa ?? porPared;
fs.writeFileSync(path.join(OUT, 'tiempos.json'), JSON.stringify({
  id: G.id, url: G.url, grabado: new Date().toISOString(), viewport: vp, conVoz, adelanto: ADELANTO, aire: AIRE,
  duracionVideo: +durVideo.toFixed(2), videoDesde: +videoDesde.toFixed(3), videoDesdeMetodo: placa != null ? 'placa' : 'reloj',
  duracionTutorial: +((tCierre - tInicio) / 1000).toFixed(2), avisos, pasos: tiempos,
}, null, 1));
if (avisos.length) console.log(`⚠ ${avisos.length} aviso(s):\n  ${avisos.join('\n  ')}`);
console.log(`✓ video ${durVideo.toFixed(1)} s (tutorial desde ${videoDesde.toFixed(2)} s por ${placa != null ? 'la placa' : 'el reloj'}, ${((tCierre - tInicio) / 1000).toFixed(1)} s) -> ${destino}`);
