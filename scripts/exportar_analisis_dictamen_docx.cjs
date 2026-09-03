#!/usr/bin/env node
/**
 * Word del "Análisis del dictamen de comisión" a partir del blob de la
 * página (src/content/analisis-dictamen.html), con el mismo look de los
 * documentos del sitio (armador del dossier: Inter, tipografía compacta,
 * rótulos en versalitas, cajas con filete, pie con paginación).
 *
 * Uso: node scripts/exportar_analisis_dictamen_docx.cjs [salida.docx]
 * Salida por defecto: output/analisis-dictamen-comision.docx (HDO lo revisa y
 * exporta el PDF que se publica en public/docs/analisis-dictamen-comision.pdf)
 */
const fs = require('fs');
const path = require('path');
const {
  AlignmentType, BorderStyle, Document, Footer, PageNumber, Packer, Paragraph,
  ShadingType, Tab, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
} = require('docx');

const RAIZ = path.join(__dirname, '..');
const BLOB = path.join(RAIZ, 'src/content/analisis-dictamen.html');
const SALIDA = process.argv[2] || path.join(RAIZ, 'output/analisis-dictamen-comision.docx');

// Paleta del sitio (tema claro)
const INK = '1A1A1A';
const MUTED = '6B7280';
const AZUL = '1F3A93';   // títulos de sección (--accent-nav del sitio)
const ROJO = 'DC2626';   // --accent-alert
const VERDE = '4D8B31';  // --accent-exp
const FILETE = 'ECEAE6';
const FONDO = 'F9F8F6';
const FONDO_ALERTA = 'FDF3F2';
const ANCHO = 9638;

const CUERPO = 21;
const INTERLINEADO = 250;
const ESP_PARRAFO = 100;

const sinBorde = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const bordeSuave = { style: BorderStyle.SINGLE, size: 4, color: FILETE };
const bordes = (b) => ({ top: b, bottom: b, left: b, right: b });

// ── HTML mínimo → texto/runs ───────────────────────────────────────────
const ENT = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (t) => t.replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENT[m] || m);
const limpiar = (t) => decode(t).replace(/\s+/g, ' ');

/** [[texto, bold, color?]] de un fragmento inline; <strong> → bold,
 *  <ins>/<a> → texto plano, <span class="ad-chip …"> → texto entre corchetes. */
function runsDe(html) {
  const out = [];
  let bold = false;
  // toda etiqueta que no sea inline conocida (p, div, h4, br...) se descarta
  const limpio = html.replace(/<\/?(?!(?:strong|b|ins|a|span)\b)[a-z][a-z0-9]*\b[^>]*>/gi, ' ');
  const re = /<\/?(strong|b|ins|a|span)\b[^>]*>|[^<]+/g;
  let m;
  while ((m = re.exec(limpio))) {
    const tok = m[0];
    if (tok.startsWith('<')) {
      const cierre = tok.startsWith('</');
      const tag = m[1];
      if (tag === 'strong' || tag === 'b') bold = !cierre;
      else if (tag === 'span' && !cierre && /ad-chip/.test(tok)) out.push(['[', false, MUTED]);
      else if (tag === 'span' && cierre) out.push([']', false, MUTED]);
      continue;
    }
    const txt = decode(tok).replace(/\s+/g, ' ');
    if (!txt) continue;
    const enChip = out.length && out[out.length - 1][0] === '[' && out[out.length - 1][2] === MUTED;
    out.push([txt, bold, enChip ? MUTED : undefined]);
  }
  // colapsar y recortar bordes
  const runs = [];
  for (const r of out) {
    const u = runs[runs.length - 1];
    if (u && u[1] === r[1] && u[2] === r[2]) u[0] += r[0];
    else runs.push([...r]);
  }
  if (runs.length) {
    runs[0][0] = runs[0][0].replace(/^\s+/, '');
    runs[runs.length - 1][0] = runs[runs.length - 1][0].replace(/\s+$/, '');
  }
  return runs.filter((r) => r[0]);
}

const textoPlano = (html) => limpiar(html.replace(/<[^>]+>/g, ' ')).trim();

// ── constructores docx ─────────────────────────────────────────────────
const P = (runs, extra = {}) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: ESP_PARRAFO, line: INTERLINEADO },
  children: runs.map(([t, bold, color]) => new TextRun({ text: t, bold, size: CUERPO, color: color || INK })),
  ...extra,
});

const tituloSeccion = (texto) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 360, after: 160 },
  children: [new TextRun({ text: texto.toUpperCase(), bold: true, size: 24, color: AZUL })],
});

const rotulo = (texto, color) => new Paragraph({
  spacing: { before: 0, after: 60 },
  children: [new TextRun({ text: texto.toUpperCase(), bold: true, size: 14, color })],
});

const ayuda = (texto) => new Paragraph({
  spacing: { after: 120 },
  children: [new TextRun({ text: texto, size: 17, color: MUTED })],
});

/** Caja de una celda con relleno y borde izquierdo de color */
function caja(parrafos, { fondo, izquierdo }) {
  return new Table({
    width: { size: ANCHO, type: WidthType.DXA },
    columnWidths: [ANCHO],
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: ANCHO, type: WidthType.DXA },
        borders: {
          top: bordeSuave, bottom: bordeSuave, right: bordeSuave,
          left: izquierdo ? { style: BorderStyle.SINGLE, size: 24, color: izquierdo } : bordeSuave,
        },
        shading: fondo ? { type: ShadingType.CLEAR, fill: fondo } : undefined,
        margins: { top: 140, bottom: 100, left: 200, right: 200 },
        children: parrafos,
      })],
    })],
  });
}

const espacio = (after = 160) => Object.assign(new Paragraph({ spacing: { after }, children: [] }), { esEspacio: true });

// ── parseo del blob por bloques de primer nivel dentro de cada section ──
const html = fs.readFileSync(BLOB, 'utf8');
const hijos = [];

// encabezado (texto de la página; el blob no lo incluye)
hijos.push(new Paragraph({
  spacing: { after: 60 },
  children: [new TextRun({ text: 'ANÁLISIS · DICTAMEN DE COMISIÓN · 03/09/2026', bold: true, size: 14, color: MUTED })],
}));
hijos.push(new Paragraph({
  spacing: { after: 100 },
  children: [new TextRun({ text: 'El dictamen, contra el espejo de la propuesta', bold: true, size: 36, color: INK })],
}));
hijos.push(P([[
  'Las Comisiones de Minería, Energía y Combustibles y de Presupuesto y Hacienda del Senado emitieron '
  + 'dictamen de mayoría sobre el Proyecto S-809/26. A continuación el análisis, artículo por artículo, '
  + 'de qué cambió respecto del proyecto oficial, qué recogió de la Propuesta optimizada, qué quedó '
  + 'afuera, el impacto esperado en el mercado y los ajustes que la instancia del recinto todavía permite.',
  false]]));
hijos.push(new Paragraph({
  alignment: AlignmentType.RIGHT,
  spacing: { after: 200 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: FILETE } },
  children: [new TextRun({ text: 'por Hilarion Del Olmo / Presidente / Explora S.A.', size: 17, color: MUTED })],
}));

/** Divide el interior de una sección en bloques de primer nivel. */
function bloquesDe(seccion) {
  const bloques = [];
  const re = /<(h2|p|div|ol|table)\b([^>]*)>/g;
  let m;
  while ((m = re.exec(seccion))) {
    const tag = m[1];
    const ini = m.index;
    let fin;
    if (tag === 'div' || tag === 'table' || tag === 'ol') {
      // cierre balanceado
      let nivel = 0;
      const r2 = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
      r2.lastIndex = ini;
      let mm;
      while ((mm = r2.exec(seccion))) {
        if (mm[0].startsWith('</')) { nivel -= 1; if (nivel === 0) { fin = mm.index + mm[0].length; break; } }
        else nivel += 1;
      }
    } else {
      const cierre = seccion.indexOf(`</${tag}>`, ini);
      fin = cierre + tag.length + 3;
    }
    bloques.push({ tag, attrs: m[2], html: seccion.slice(ini, fin) });
    re.lastIndex = fin;
  }
  return bloques;
}

const interior = (b, tag) => b.html.replace(new RegExp(`^<${tag}\\b[^>]*>`), '').replace(new RegExp(`</${tag}>$`), '');

function renderParrafo(b) {
  const inner = interior(b, 'p');
  if (/pl-cuadro-ayuda|ad-destacados-intro/.test(b.attrs)) {
    let t = textoPlano(inner)
      .replace('Cada fila remite al artículo en la propuesta.', 'Los números de artículo son los de la Propuesta optimizada.');
    if (t.startsWith('Metodología:')) {
      t += ' La Propuesta optimizada, artículo por artículo, y este análisis están publicados en la sección Reforma Ley 27.640 del sitio explorarg.';
    }
    return [ayuda(t)];
  }
  return [P(runsDe(inner))];
}

function renderFicha(b) {
  const inner = interior(b, 'div');
  const h4 = /<h4>([\s\S]*?)<\/h4>/.exec(inner);
  const parrafos = [];
  if (h4) {
    const runs = runsDe(h4[1]).map(([t, , c]) => [t, !c, c]);
    parrafos.push(new Paragraph({
      spacing: { after: 60 },
      children: runs.map(([t, bold, color]) => new TextRun({ text: t, bold, size: 20, color: color || INK })),
    }));
  }
  for (const pm of inner.matchAll(/<p>([\s\S]*?)<\/p>/g)) parrafos.push(P(runsDe(pm[1])));
  return [caja(parrafos, { fondo: null, izquierdo: null }), espacio(120)];
}

function renderDestacado(b) {
  const inner = interior(b, 'div');
  const parrafos = [];
  const eyebrow = /<div class="ad-destacado-eyebrow">([\s\S]*?)<\/div>/.exec(inner);
  if (eyebrow) parrafos.push(rotulo(textoPlano(eyebrow[1]), ROJO));
  const h3 = /<h3>([\s\S]*?)<\/h3>/.exec(inner);
  if (h3) parrafos.push(new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text: textoPlano(h3[1]), bold: true, size: 24, color: INK })],
  }));
  for (const pm of inner.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const esCierre = /ad-destacado-cierre/.test(pm[1]);
    parrafos.push(P(runsDe(pm[2]), esCierre ? {
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'E5B4B0', space: 4 } },
      spacing: { before: 120, after: 40, line: INTERLINEADO },
    } : {}));
  }
  return [caja(parrafos, { fondo: FONDO_ALERTA, izquierdo: ROJO }), espacio(160)];
}

function renderRiesgo(b) {
  const inner = interior(b, 'div');
  return [P(runsDe(inner), {
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: ROJO, space: 8 } },
    indent: { left: 120 },
    spacing: { after: 140, line: INTERLINEADO },
  })];
}

function renderFirma(b) {
  const inner = interior(b, 'div');
  const lineas = [...inner.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => textoPlano(m[1]));
  const out = [new Paragraph({
    spacing: { before: 360, after: 0 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: FILETE } },
    children: [],
  })];
  lineas.forEach((l, i) => out.push(new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 0 },
    children: [new TextRun({ text: l, bold: i === 0, size: 18, color: i === 0 ? INK : MUTED })],
  })));
  return out;
}

function renderLista(b) {
  const inner = interior(b, 'ol');
  const out = [];
  let n = 0;
  for (const li of inner.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    n += 1;
    const cuerpo = runsDe(li[1]).map(([t, bold, color]) => new TextRun({ text: t, bold, size: CUERPO, color: color || INK }));
    out.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { left: 360, hanging: 360 },
      spacing: { after: 120, line: INTERLINEADO },
      children: [
        new TextRun({ text: `${n}.`, bold: true, size: CUERPO, color: VERDE }),
        new TextRun({ children: [new Tab()] }),
        ...cuerpo,
      ],
    }));
  }
  return out;
}

function renderTabla(b) {
  const filas = [...b.html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
    [...tr[1].matchAll(/<t([dh])[^>]*>([\s\S]*?)<\/t\1>/g)].map((c) => ({ th: c[1] === 'h', html: c[2] })));
  const anchos = [700, 3300, 3700, 1938];
  const rows = filas.map((celdas, i) => new TableRow({
    tableHeader: i === 0,
    children: celdas.map((c, j) => new TableCell({
      width: { size: anchos[j], type: WidthType.DXA },
      borders: bordes(bordeSuave),
      verticalAlign: VerticalAlign.TOP,
      shading: c.th ? { type: ShadingType.CLEAR, fill: FONDO } : undefined,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      children: [new Paragraph({
        spacing: { after: 0, line: INTERLINEADO },
        children: c.th
          ? [new TextRun({ text: textoPlano(c.html).toUpperCase(), bold: true, size: 13, color: MUTED })]
          : runsDe(c.html).map(([t, bold, color]) => new TextRun({ text: t, bold, size: 16, color: color || INK })),
      })],
    })),
  }));
  return [new Table({ width: { size: ANCHO, type: WidthType.DXA }, columnWidths: anchos, rows }), espacio(120)];
}

for (const sec of html.matchAll(/<section class="pl-art[^"]*">([\s\S]*?)<\/section>/g)) {
  for (const b of bloquesDe(sec[1])) {
    if (b.tag === 'h2') {
      if (hijos.length && hijos[hijos.length - 1].esEspacio) hijos.pop();
      hijos.push(tituloSeccion(textoPlano(interior(b, 'h2'))));
    }
    else if (b.tag === 'p') hijos.push(...renderParrafo(b));
    else if (b.tag === 'table') hijos.push(...renderTabla(b));
    else if (b.tag === 'ol') hijos.push(...renderLista(b));
    else if (b.tag === 'div') {
      if (/ad-destacado\b/.test(b.attrs)) hijos.push(...renderDestacado(b));
      else if (/ad-ficha/.test(b.attrs)) hijos.push(...renderFicha(b));
      else if (/ad-riesgo/.test(b.attrs)) hijos.push(...renderRiesgo(b));
      else if (/ad-firma/.test(b.attrs)) hijos.push(...renderFirma(b));
      else if (/pl-tabla-scroll/.test(b.attrs)) {
        const t = /<table[\s\S]*<\/table>/.exec(b.html);
        if (t) hijos.push(...renderTabla({ html: t[0] }));
      }
    }
  }
}

const doc = new Document({
  styles: { default: { document: { run: { font: 'Inter', size: CUERPO, color: INK } } } },
  sections: [{
    properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'explorarg · Análisis del dictamen de comisión · ', size: 14, color: MUTED }),
            new TextRun({ children: [PageNumber.CURRENT], size: 14, color: MUTED }),
          ],
        })],
      }),
    },
    children: hijos,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, buf);
  console.log(`OK → ${SALIDA} (${Math.round(buf.length / 1024)} KB, ${hijos.length} bloques)`);
});
