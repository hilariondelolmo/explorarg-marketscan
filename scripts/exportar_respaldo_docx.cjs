#!/usr/bin/env node
/**
 * Arma el Word "Respaldo en datos" artículo por artículo, replicando el
 * diseño de los popups del sitio (tarjetas de cifras, esquemas causales,
 * gráficos capturados del sitio, infografías y tablas).
 *
 * Pipeline completo:
 *   1. python3 scripts/exportar_respaldo_spec.py > spec.json
 *   2. capturar gráficos: chrome headless sobre /export-grafico/:id (2x)
 *   3. node scripts/exportar_respaldo_docx.js spec.json <dir-charts> <salida.docx>
 */
const fs = require('fs');
const path = require('path');
const {
  AlignmentType, BorderStyle, Document, Footer, ImageRun, PageNumber,
  Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun,
  VerticalAlign, WidthType,
} = require('docx');

const [specPath, chartsDir, salida] = process.argv.slice(2);
if (!salida) {
  console.error('uso: node exportar_respaldo_docx.js spec.json <dir-charts> <salida.docx>');
  process.exit(1);
}
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const PUBLIC = path.join(__dirname, '..', 'public');

// Paleta del sitio (tema claro)
const INK = '1A1A1A';
const MUTED = '6B7280';
const VERDE = '4D8B31';
const ROJO = 'DC2626'; // --accent-alert del sitio (tema claro), tarjetas pl-kpi-neg
const FONDO = 'F9F8F6';
const FILETE = 'ECEAE6';
const ANCHO = 9638; // DXA útiles en A4 con márgenes de 2 cm

const sinBorde = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const bordeSuave = { style: BorderStyle.SINGLE, size: 4, color: FILETE };
const bordes = (b) => ({ top: b, bottom: b, left: b, right: b });

function dimensionesPng(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function imagen(file, anchoPulgadas) {
  const { w, h } = dimensionesPng(file);
  const wpx = anchoPulgadas * 96;
  return new Paragraph({
    spacing: { before: 160, after: 160 },
    children: [new ImageRun({
      type: 'png',
      data: fs.readFileSync(file),
      transformation: { width: wpx, height: Math.round((h / w) * wpx) },
    })],
  });
}

function celdaKpi(item, anchoCelda) {
  return new TableCell({
    width: { size: anchoCelda, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: FONDO },
    borders: bordes(bordeSuave),
    margins: { top: 140, bottom: 120, left: 160, right: 160 },
    verticalAlign: VerticalAlign.TOP,
    children: [
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({
          text: item.valor,
          bold: true,
          size: item.compacto ? 24 : 30,
          color: item.neg ? ROJO : INK,
        })],
      }),
      new Paragraph({
        children: [new TextRun({ text: item.label, size: 17, color: MUTED })],
      }),
    ],
  });
}

function bloqueKpis(items) {
  const anchoCelda = Math.floor(ANCHO / items.length);
  return new Table({
    columnWidths: items.map(() => anchoCelda),
    width: { size: anchoCelda * items.length, type: WidthType.DXA },
    borders: bordes(sinBorde),
    rows: [new TableRow({ children: items.map((i) => celdaKpi(i, anchoCelda)) })],
  });
}

function bloqueFlujo(pasos) {
  const flecha = 400;
  const anchoPaso = Math.floor((ANCHO - flecha * (pasos.length - 1)) / pasos.length);
  const celdas = [];
  const anchos = [];
  pasos.forEach((p, i) => {
    if (i > 0) {
      anchos.push(flecha);
      celdas.push(new TableCell({
        width: { size: flecha, type: WidthType.DXA },
        borders: bordes(sinBorde),
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '→', size: 22, color: MUTED })],
        })],
      }));
    }
    anchos.push(anchoPaso);
    celdas.push(new TableCell({
      width: { size: anchoPaso, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: FONDO },
      borders: bordes(bordeSuave),
      margins: { top: 110, bottom: 110, left: 150, right: 150 },
      verticalAlign: VerticalAlign.CENTER,
      children: [
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: p.titulo, bold: true, size: 19, color: INK })],
        }),
        new Paragraph({
          children: [new TextRun({ text: p.detalle, size: 17, color: MUTED })],
        }),
      ],
    }));
  });
  return new Table({
    columnWidths: anchos,
    width: { size: ANCHO, type: WidthType.DXA },
    borders: bordes(sinBorde),
    rows: [new TableRow({ children: celdas })],
  });
}

function bloqueTabla(filas) {
  const cols = Math.max(...filas.map((f) => f.length));
  const anchoCelda = Math.floor(ANCHO / cols);
  return new Table({
    columnWidths: Array(cols).fill(anchoCelda),
    width: { size: anchoCelda * cols, type: WidthType.DXA },
    borders: bordes(bordeSuave),
    rows: filas.map((fila) => new TableRow({
      children: fila.map((c) => new TableCell({
        width: { size: anchoCelda, type: WidthType.DXA },
        shading: c.encabezado
          ? { type: ShadingType.CLEAR, fill: FONDO }
          : undefined,
        margins: { top: 90, bottom: 90, left: 120, right: 120 },
        children: c.texto.split('\n').map((t) => new Paragraph({
          children: [new TextRun({
            text: c.encabezado ? t.toUpperCase() : t,
            bold: c.encabezado,
            size: c.encabezado ? 15 : 18,
            color: c.encabezado ? MUTED : INK,
          })],
        })),
      })),
    })),
  });
}

function bloquesDeArticulo(art, esUltimo) {
  const out = [];
  out.push(new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({
      text: art.sub.toUpperCase(), bold: true, size: 15, color: VERDE,
    })],
  }));
  out.push(new Paragraph({
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: FILETE } },
    children: [new TextRun({ text: art.titulo, bold: true, size: 26, color: INK })],
  }));

  for (const b of art.bloques) {
    if (b.tipo === 'kpis') {
      out.push(bloqueKpis(b.items));
      out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    } else if (b.tipo === 'flujo') {
      out.push(bloqueFlujo(b.pasos));
      out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    } else if (b.tipo === 'p') {
      out.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 140, line: 300 },
        children: b.runs.map(([t, bold]) => new TextRun({ text: t, bold, size: 21, color: INK })),
      }));
    } else if (b.tipo === 'imagen') {
      out.push(imagen(path.join(PUBLIC, b.src), 6.5));
    } else if (b.tipo === 'chart') {
      out.push(imagen(path.join(chartsDir, `${b.id}.png`), 6.5));
    } else if (b.tipo === 'tabla') {
      out.push(bloqueTabla(b.filas));
      out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    }
  }
  if (!esUltimo) out.push(new Paragraph({ pageBreakBefore: false, children: [], spacing: { after: 0 } }));
  return out;
}

const hijos = [];
// Encabezado del documento
hijos.push(new Paragraph({
  spacing: { after: 60 },
  children: [new TextRun({
    text: 'PROPUESTA DE LEY S80926PL - PROYECTO S-0809/2026',
    bold: true, size: 15, color: MUTED,
  })],
}));
hijos.push(new Paragraph({
  spacing: { after: 80 },
  children: [new TextRun({ text: 'Respaldo en datos', bold: true, size: 40, color: INK })],
}));
hijos.push(new Paragraph({
  spacing: { after: 360 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: FILETE } },
  children: [new TextRun({
    text: 'Evidencia fáctica de las modificaciones propuestas, artículo por artículo. '
      + 'Cifras y gráficos elaborados sobre el dashboard de explorarg con datos de la '
      + 'Secretaría de Energía y fuentes oficiales.',
    size: 19, color: MUTED,
  })],
}));

spec.forEach((art, i) => {
  if (i > 0) {
    hijos.push(new Paragraph({ children: [], pageBreakBefore: true }));
  }
  hijos.push(...bloquesDeArticulo(art, i === spec.length - 1));
});

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 21, color: INK } },
    },
  },
  sections: [{
    properties: {
      page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } },
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'explorarg · Respaldo en datos · ', size: 15, color: MUTED }),
            new TextRun({ children: [PageNumber.CURRENT], size: 15, color: MUTED }),
          ],
        })],
      }),
    },
    children: hijos,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(salida, buf);
  console.log(`OK → ${salida} (${Math.round(buf.length / 1024)} KB)`);
});
