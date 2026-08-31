#!/usr/bin/env node
/**
 * Documento único "Fundamentos jurídicos + Respaldo en datos" (HDO
 * 2026-08-17): intro del informe (Objeto y método / Marco / Cuadro) y, por
 * artículo, Normas violadas + Justificación + Respaldo en datos, con el
 * diseño del Word de Respaldo pero tipografía más compacta. Los rótulos de
 * sección llevan los colores del sitio: violeta / rojo / verde.
 *
 * Pipeline:
 *   1. python3 scripts/exportar_dossier_spec.py > dossier.json
 *   2. gráficos ya capturados con /export-grafico/:id (chrome headless)
 *   3. node scripts/exportar_dossier_docx.cjs dossier.json <dir-charts> <salida.docx>
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
  console.error('uso: node exportar_dossier_docx.cjs dossier.json <dir-charts> <salida.docx>');
  process.exit(1);
}
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const PUBLIC = path.join(__dirname, '..', 'public');

// Paleta del sitio (tema claro)
const INK = '1A1A1A';
const MUTED = '6B7280';
const VERDE = '4D8B31';
const ROJO = 'DC2626';
const VIOLETA = '6941C6';
const FONDO = 'F9F8F6';
const FILETE = 'ECEAE6';
const ANCHO = 9638;

// Tipografía compacta (pedido HDO: menos interlineado y fonts más chicos)
const CUERPO = 21;        // 10,5 pt (HDO: subir de 9,5)
const INTERLINEADO = 250; // ~1,04
const ESP_PARRAFO = 100;

const sinBorde = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const bordeSuave = { style: BorderStyle.SINGLE, size: 4, color: FILETE };
const bordes = (b) => ({ top: b, bottom: b, left: b, right: b });

const dimensionesPng = (file) => {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

const imagen = (file, anchoPulgadas) => {
  const { w, h } = dimensionesPng(file);
  const wpx = anchoPulgadas * 96;
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    children: [new ImageRun({
      type: 'png',
      data: fs.readFileSync(file),
      transformation: { width: wpx, height: Math.round((h / w) * wpx) },
    })],
  });
};

const parrafo = (runs, extra = {}) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: ESP_PARRAFO, line: INTERLINEADO },
  children: runs.map(([t, bold]) => new TextRun({ text: t, bold, size: CUERPO, color: INK })),
  ...extra,
});

const rotulo = (texto, color) => new Paragraph({
  spacing: { before: 160, after: 80 },
  children: [new TextRun({ text: texto.toUpperCase(), bold: true, size: 14, color })],
});

function bloqueKpis(items) {
  const anchoCelda = Math.floor(ANCHO / items.length);
  return new Table({
    columnWidths: items.map(() => anchoCelda),
    width: { size: anchoCelda * items.length, type: WidthType.DXA },
    borders: bordes(sinBorde),
    rows: [new TableRow({
      children: items.map((item) => new TableCell({
        width: { size: anchoCelda, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: FONDO },
        borders: bordes(bordeSuave),
        margins: { top: 110, bottom: 100, left: 130, right: 130 },
        verticalAlign: VerticalAlign.TOP,
        children: [
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: item.valor, bold: true, size: 26, color: INK })],
          }),
          new Paragraph({
            children: [new TextRun({ text: item.label, size: 15, color: MUTED })],
          }),
        ],
      })),
    })],
  });
}

function bloqueFlujo(pasos) {
  const flecha = 360;
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
          children: [new TextRun({ text: '→', size: 20, color: MUTED })],
        })],
      }));
    }
    anchos.push(anchoPaso);
    celdas.push(new TableCell({
      width: { size: anchoPaso, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: FONDO },
      borders: bordes(bordeSuave),
      margins: { top: 90, bottom: 90, left: 120, right: 120 },
      verticalAlign: VerticalAlign.CENTER,
      children: [
        new Paragraph({
          spacing: { after: 30 },
          children: [new TextRun({ text: p.titulo, bold: true, size: 17, color: INK })],
        }),
        new Paragraph({
          children: [new TextRun({ text: p.detalle, size: 15, color: MUTED })],
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

function bloqueTabla(filas, anchosCols) {
  const cols = Math.max(...filas.map((f) => f.length));
  const anchos = anchosCols || Array(cols).fill(Math.floor(ANCHO / cols));
  return new Table({
    columnWidths: anchos,
    width: { size: anchos.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    borders: bordes(bordeSuave),
    rows: filas.map((fila) => new TableRow({
      children: fila.map((c, j) => new TableCell({
        width: { size: anchos[j] ?? anchos[anchos.length - 1], type: WidthType.DXA },
        shading: c.encabezado ? { type: ShadingType.CLEAR, fill: FONDO } : undefined,
        margins: { top: 70, bottom: 70, left: 100, right: 100 },
        children: c.texto.split('\n').map((t) => new Paragraph({
          spacing: { line: INTERLINEADO },
          children: [new TextRun({
            text: c.encabezado ? t.toUpperCase() : t,
            bold: c.encabezado,
            size: c.encabezado ? 13 : 16,
            color: c.encabezado ? MUTED : INK,
          })],
        })),
      })),
    })),
  });
}

const espaciador = () => new Paragraph({ spacing: { after: 80 }, children: [] });

function bloquesRespaldo(bloques) {
  const out = [];
  for (const b of bloques) {
    if (b.tipo === 'kpis') {
      out.push(bloqueKpis(b.items), espaciador());
    } else if (b.tipo === 'flujo') {
      out.push(bloqueFlujo(b.pasos), espaciador());
    } else if (b.tipo === 'p') {
      out.push(parrafo(b.runs));
    } else if (b.tipo === 'imagen') {
      out.push(imagen(path.join(PUBLIC, b.src), 6.5));
    } else if (b.tipo === 'chart') {
      out.push(imagen(path.join(chartsDir, `${b.id}.png`), 6.5));
    } else if (b.tipo === 'tabla') {
      out.push(bloqueTabla(b.filas), espaciador());
    }
  }
  return out;
}

const hijos = [];

// ── encabezado del documento ──
hijos.push(new Paragraph({
  spacing: { after: 60 },
  children: [new TextRun({
    text: (spec.portada && spec.portada.titulo)
      || 'PROPUESTA DE LEY S80926PL - REVISIÓN HDO DEL 11.08.2026 SOBRE VERSIÓN SE 260729',
    bold: true, size: 14, color: MUTED,
  })],
}));
hijos.push(new Paragraph({
  spacing: { after: 80 },
  children: [new TextRun({
    text: 'Fundamentos de las modificaciones propuestas',
    bold: true, size: 36, color: INK,
  })],
}));
hijos.push(new Paragraph({
  spacing: { after: 300 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: FILETE } },
  children: [new TextRun({
    text: 'Fundamentos jurídicos y respaldo en datos, artículo por artículo. Cifras y '
      + 'gráficos elaborados sobre el dashboard de explorarg con datos de la Secretaría '
      + 'de Energía y fuentes oficiales.',
    size: 17, color: MUTED,
  })],
}));

// ── intro: objeto y método / marco normativo / cuadro ──
const seccionIntro = (titulo) => new Paragraph({
  spacing: { before: 240, after: 120 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: FILETE } },
  children: [new TextRun({ text: titulo, bold: true, size: 24, color: INK })],
});
hijos.push(seccionIntro('Objeto y método'));
spec.intro.objeto.forEach((runs) => hijos.push(parrafo(runs)));
hijos.push(seccionIntro('Marco normativo de referencia'));
spec.intro.marco.forEach((runs) => hijos.push(parrafo(runs)));
if (spec.intro.cuadro) {
  hijos.push(seccionIntro('Cuadro de correspondencia'));
  hijos.push(bloqueTabla(spec.intro.cuadro, [950, 3100, 2800, 2788]));
}

// ── artículos ──
spec.articulos.forEach((art) => {
  hijos.push(new Paragraph({ children: [], pageBreakBefore: true }));
  hijos.push(new Paragraph({
    spacing: { after: 140 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: FILETE } },
    children: [new TextRun({ text: art.titulo, bold: true, size: 24, color: INK })],
  }));
  hijos.push(rotulo('Normas que viola el proyecto oficial', VIOLETA));
  art.normas.forEach((runs) => hijos.push(parrafo(runs)));
  hijos.push(rotulo('Justificación de la modificación', ROJO));
  art.just.forEach((runs) => hijos.push(parrafo(runs)));
  hijos.push(rotulo('Respaldo en datos', VERDE));
  hijos.push(...bloquesRespaldo(art.respaldo));
});

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Inter', size: CUERPO, color: INK } } }  // la del sitio,
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
            new TextRun({ text: 'explorarg · Fundamentos y respaldo en datos · ', size: 14, color: MUTED }),
            new TextRun({ children: [PageNumber.CURRENT], size: 14, color: MUTED }),
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
