// Graba una lámina animada cuadro por cuadro con el Chrome local (Playwright del grabador de tutoriales, canal "chrome").
// Uso: node grabar.mjs <lamina.html> <plan.json> <carpeta de salida>
// Deja cNNNNNN.png solo en los tramos donde algo se mueve (el resto se sostiene) y frames.txt para el concat de ffmpeg.
import { chromium } from '../tutorial/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';

const [html, planPath, out] = process.argv.slice(2);
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (/^c\d{6}\.png$/.test(f) || f === 'frames.txt') fs.unlinkSync(path.join(out, f));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: plan.W, height: plan.H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', e => console.error('error en la página:', e.message));
await page.goto('file://' + html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
const info = await page.evaluate(() => window.__anim.preparar());
const cdp = await ctx.newCDPSession(page);
const fps = plan.fps, n = Math.round(plan.dur * fps), eps = 1e-6;
const activo = t => info.intervalos.some(([a, b]) => t >= a - eps && t <= b + 1 / fps + eps);
const lista = [];
let capturados = 0;
for (let i = 0; i < n; i++) {
  const t = i / fps;
  if (i === 0 || activo(t)) {
    await page.evaluate(T => window.__anim.render(T), t);
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    const f = `c${String(i).padStart(6, '0')}.png`;
    fs.writeFileSync(path.join(out, f), Buffer.from(r.data, 'base64'));
    lista.push({ f, n: 1 }); capturados++;
  } else {
    lista[lista.length - 1].n++;
  }
}
let txt = '';
for (const e of lista) txt += `file '${e.f}'\nduration ${(e.n / fps).toFixed(6)}\n`;
txt += `file '${lista[lista.length - 1].f}'\n`;
fs.writeFileSync(path.join(out, 'frames.txt'), txt);
console.log(JSON.stringify({ cuadros: n, capturados, unidades: info.unidades, efectos: info.efectos, intervalos: info.intervalos.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]) }));
await browser.close();
