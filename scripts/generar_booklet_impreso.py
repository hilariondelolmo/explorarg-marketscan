#!/usr/bin/env python3
"""Genera la version impresa y navegable de los dos dashboards legislativos.

Fuente unica: el contenido local que alimenta las rutas publicas
`/reforma-ley-27640` y `/propuesta-s0809-2026`.

Salida: output/pdf/reforma_ley_27640_booklet.pdf
"""

from __future__ import annotations

import html
import json
import math
import re
from pathlib import Path

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Frame, KeepTogether, Paragraph, Spacer

from exportar_respaldo_spec import MiniDom, Nodo, bloques_de_popup, tabla_de


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output/pdf/reforma_ley_27640_booklet.pdf"
REFORMA = ROOT / "src/content/reforma-ley-27640.html"
PROPUESTA = ROOT / "src/content/propuesta-s80926pl.html"
EVIDENCIA = ROOT / "src/data/evidencia.json"
CORTE = ROOT / "src/data/corte.json"
LOGO = ROOT / "public/brand/explorarg-icon.png"
IMG_INTEGRADAS = ROOT / "public/evidencia/crecimiento-integradas.png"
IMG_NO_INTEGRADAS = ROOT / "public/evidencia/crecimiento-no-integradas.png"
IMG_CRONO = ROOT / "public/evidencia/cronologia-normativa-2006-2010.png"

W, H = A4
MM = 72 / 25.4

# Paleta clara inspirada en el dashboard.
INK = HexColor("#182129")
NAVY = HexColor("#173B57")
MINT = HexColor("#22C7B7")
MINT_DARK = HexColor("#128C82")
MINT_PALE = HexColor("#E8F8F5")
RED = HexColor("#B74336")
RED_PALE = HexColor("#FBECEA")
VIOLET = HexColor("#5A4AA0")
VIOLET_PALE = HexColor("#EEEAFB")
AMBER = HexColor("#A8691D")
AMBER_PALE = HexColor("#FBF2E4")
GREEN = HexColor("#3F7D4B")
GREEN_PALE = HexColor("#EAF5EC")
PAPER = HexColor("#FBFAF7")
LIGHT = HexColor("#ECEAE5")
MID = HexColor("#707A80")
SOFT = HexColor("#F3F1EC")


def clean(value: str) -> str:
    """Normaliza espacios y evita rayas Unicode para salida PDF robusta."""
    value = value.replace("\u2014", "-").replace("\u2013", "-").replace("\u2011", "-")
    value = value.replace("\xa0", " ")
    return re.sub(r"\s+", " ", value).strip()


pdfmetrics.registerFont(TTFont("Book", "/System/Library/Fonts/Supplemental/Arial.ttf"))
pdfmetrics.registerFont(TTFont("BookBold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))
pdfmetrics.registerFont(TTFont("BookItalic", "/System/Library/Fonts/Supplemental/Arial Italic.ttf"))
pdfmetrics.registerFont(TTFont("Narrow", "/System/Library/Fonts/Supplemental/Arial Narrow.ttf"))
pdfmetrics.registerFont(TTFont("NarrowBold", "/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf"))


def parse_dom(path: Path) -> MiniDom:
    dom = MiniDom()
    dom.feed(path.read_text(encoding="utf-8"))
    return dom


DOM_REF = parse_dom(REFORMA)
DOM_PROP = parse_dom(PROPUESTA)


def find_first(root: Nodo, predicate):
    return next(root.buscar(predicate))


def extract_article_cards():
    pop = find_first(
        DOM_PROP.raiz,
        lambda n: "pl-pop" in n.clase()
        and n.attrs.get("data-art") == "intro"
        and n.attrs.get("data-tipo") == "cuadro",
    )
    table = find_first(pop, lambda n: n.tag == "table" and "pl-cuadro" in n.clase())
    rows = tabla_de(table)[1:]
    pop_hechos = {
        int(n.attrs["data-art"]): n
        for n in DOM_PROP.raiz.buscar(
            lambda n: "pl-pop" in n.clase()
            and n.attrs.get("data-tipo") == "hechos"
            and n.attrs.get("data-art", "").isdigit()
        )
    }
    cards = []
    for row in rows:
        art = int(re.sub(r"\D", "", row[0]["texto"]))
        bloques = bloques_de_popup(pop_hechos[art])
        kpis = []
        for b in bloques:
            if b["tipo"] == "kpis":
                kpis = [(clean(x["valor"]), clean(x["label"])) for x in b["items"]]
                break
        cards.append(
            {
                "art": art,
                "mod": clean(row[1]["texto"]),
                "norma": clean(row[2]["texto"]),
                "efecto": clean(row[3]["texto"]),
                "kpis": kpis,
            }
        )
    return cards


ARTICLE_CARDS = extract_article_cards()
EVID_DATA = json.loads(EVIDENCIA.read_text())
CUT_DATA = json.loads(CORTE.read_text())


def inner_margin(page: int) -> float:
    return 24 * MM if page % 2 else 18 * MM


def outer_margin(page: int) -> float:
    return 18 * MM if page % 2 else 24 * MM


def content_x(page: int) -> float:
    return inner_margin(page) if page % 2 else outer_margin(page)


def content_w(page: int) -> float:
    return W - inner_margin(page) - outer_margin(page)


def text_width(text: str, font: str, size: float) -> float:
    return pdfmetrics.stringWidth(text, font, size)


def wrap_lines(text: str, font: str, size: float, width: float) -> list[str]:
    words = clean(text).split()
    lines, current = [], ""
    for word in words:
        candidate = word if not current else current + " " + word
        if text_width(candidate, font, size) <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_text(
    c: Canvas,
    text: str,
    x: float,
    y: float,
    width: float,
    font: str = "Book",
    size: float = 10,
    leading: float | None = None,
    color=INK,
    max_lines: int | None = None,
) -> float:
    leading = leading or size * 1.25
    lines = wrap_lines(text, font, size, width)
    if max_lines is not None:
        lines = lines[:max_lines]
        if len(wrap_lines(text, font, size, width)) > max_lines and lines:
            last = lines[-1]
            while last and text_width(last + "...", font, size) > width:
                last = last[:-1]
            lines[-1] = last.rstrip() + "..."
    c.setFont(font, size)
    c.setFillColor(color)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def rounded(c, x, y, w, h, fill, stroke=None, radius=8, sw=0.7):
    c.setLineWidth(sw)
    c.setFillColor(fill)
    c.setStrokeColor(stroke or fill)
    c.roundRect(x, y, w, h, radius, stroke=1 if stroke else 0, fill=1)


def arrow(c, x1, y1, x2, y2, color=MID, width=1.2):
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(width)
    c.line(x1, y1, x2, y2)
    ang = math.atan2(y2 - y1, x2 - x1)
    head = 5
    pts = [
        (x2, y2),
        (x2 - head * math.cos(ang - 0.55), y2 - head * math.sin(ang - 0.55)),
        (x2 - head * math.cos(ang + 0.55), y2 - head * math.sin(ang + 0.55)),
    ]
    p = c.beginPath()
    p.moveTo(*pts[0]); p.lineTo(*pts[1]); p.lineTo(*pts[2]); p.close()
    c.drawPath(p, stroke=0, fill=1)


SECTION_META = {
    "R": ("R", "REFORMA", RED),
    "E": ("E", "EVIDENCIA", VIOLET),
    "P": ("P", "PROPUESTA", MINT_DARK),
    "A": ("A", "ANEXO ANALISIS", AMBER),
    "L": ("L", "ANEXO LEGAL", NAVY),
    "F": ("F", "FUENTES", GREEN),
}


class Booklet:
    def __init__(self, path: Path):
        self.path = path
        self.c = Canvas(str(path), pagesize=A4, pageCompression=1)
        self.c.setTitle("Reforma de la Ley 27.640 - booklet impreso")
        self.c.setAuthor("Explorarg · Marketscan · Hilarión Del Olmo")
        self.c.setSubject("Versión impresa navegable de los dashboards de análisis y propuesta S-0809/2026")
        self.c.setKeywords("biodiesel, Ley 27.640, S-0809/2026, reforma, Argentina")
        self.page = 0
        self.current_section = "R"

    def begin(self, section="R", plain=False):
        if self.page:
            self.c.showPage()
        self.page += 1
        self.current_section = section
        self.c.setFillColor(PAPER)
        self.c.rect(0, 0, W, H, stroke=0, fill=1)
        if not plain:
            self.chrome(section)
        return self.c

    def chrome(self, section):
        code, label, color = SECTION_META[section]
        x = content_x(self.page)
        cw = content_w(self.page)
        self.c.setFillColor(MID)
        self.c.setFont("BookBold", 6.7)
        self.c.drawString(x, H - 16 * MM, f"{code} · {label}")
        self.c.setStrokeColor(LIGHT)
        self.c.setLineWidth(0.6)
        self.c.line(x, H - 18 * MM, x + cw, H - 18 * MM)
        # Pestaña siempre sobre el borde exterior de la hoja.
        tab_w, tab_h = 9 * MM, 25 * MM
        tab_y = H - (38 + list(SECTION_META).index(section) * 28) * MM
        if self.page % 2:
            tab_x = W - tab_w
        else:
            tab_x = 0
        self.c.setFillColor(color)
        self.c.rect(tab_x, tab_y, tab_w, tab_h, stroke=0, fill=1)
        self.c.saveState()
        self.c.setFillColor(white)
        self.c.setFont("BookBold", 8)
        if self.page % 2:
            self.c.translate(tab_x + tab_w / 2 + 2, tab_y + 3 * MM)
            self.c.rotate(90)
        else:
            self.c.translate(tab_x + tab_w / 2 - 2, tab_y + tab_h - 3 * MM)
            self.c.rotate(-90)
        self.c.drawString(0, 0, code)
        self.c.restoreState()
        self.c.setFillColor(MID)
        self.c.setFont("Book", 7)
        page_text = f"{self.page:02d}"
        if self.page % 2:
            self.c.drawString(x, 10 * MM, "EXPLORARG · MARKETSCAN")
            self.c.drawRightString(x + cw, 10 * MM, page_text)
        else:
            self.c.drawString(x, 10 * MM, page_text)
            self.c.drawRightString(x + cw, 10 * MM, "EXPLORARG · MARKETSCAN")

    def title(self, kicker, title, subtitle="", color=INK, size=27):
        x = content_x(self.page)
        cw = content_w(self.page)
        y = H - 29 * MM
        self.c.setFont("BookBold", 7.5)
        self.c.setFillColor(color)
        self.c.drawString(x, y, clean(kicker).upper())
        y -= 8 * MM
        y = draw_text(self.c, title, x, y, cw, "BookBold", size, size * 1.05, INK)
        if subtitle:
            y -= 3 * MM
            y = draw_text(self.c, subtitle, x, y, cw * 0.92, "Book", 11, 14, MID)
        return y

    def save(self):
        self.c.save()


def kpi(c, x, y, w, h, value, label, accent=MINT_DARK, pale=MINT_PALE, value_size=29):
    rounded(c, x, y, w, h, pale, LIGHT, 8)
    c.setFillColor(accent)
    c.rect(x, y, 3, h, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("BookBold", value_size)
    c.drawString(x + 11, y + h - value_size - 7, clean(value))
    draw_text(c, label, x + 11, y + 16, w - 22, "Book", 8.2, 10.2, MID, 3)


def callout(c, x, y, w, h, title, body, accent=MINT_DARK, pale=MINT_PALE):
    rounded(c, x, y, w, h, pale, accent, 8, 0.8)
    c.setFillColor(accent)
    c.setFont("BookBold", 7.5)
    c.drawString(x + 12, y + h - 18, title.upper())
    draw_text(c, body, x + 12, y + h - 35, w - 24, "Book", 9.2, 12, INK, 8)


def section_open(book: Booklet, section, num, title, deck, color):
    c = book.begin(section, plain=True)
    c.setFillColor(color)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    c.setFillColor(Color(1, 1, 1, alpha=0.12))
    c.circle(W - 55, H - 100, 145, stroke=0, fill=1)
    c.circle(65, 70, 95, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont("BookBold", 110)
    c.drawString(20 * MM, H - 82 * MM, num)
    c.setFont("BookBold", 30)
    y = H - 105 * MM
    y = draw_text(c, title, 20 * MM, y, W - 40 * MM, "BookBold", 30, 32, white)
    y -= 8 * MM
    draw_text(c, deck, 20 * MM, y, W - 48 * MM, "Book", 13, 17, white)
    c.setFont("BookBold", 7)
    c.drawString(20 * MM, 16 * MM, f"{num} · APERTURA DE SECCION")
    c.drawRightString(W - 20 * MM, 16 * MM, f"{book.page:02d}")


def bar_chart(c, x, y, w, h, items, max_value=None, suffix="", colors=None):
    max_value = max_value or max(v for _, v in items)
    colors = colors or [MINT_DARK] * len(items)
    label_w = w * 0.35
    gap = h / len(items)
    for i, ((label, value), color) in enumerate(zip(items, colors)):
        yy = y + h - (i + 0.68) * gap
        c.setFillColor(MID)
        c.setFont("BookBold", 7.2)
        c.drawRightString(x + label_w - 8, yy + 2, clean(label))
        bw = (w - label_w - 42) * value / max_value
        rounded(c, x + label_w, yy - 5, max(3, bw), 13, color, radius=4)
        c.setFillColor(INK)
        c.setFont("BookBold", 8.5)
        c.drawString(x + label_w + bw + 7, yy - 1, f"{str(value).replace('.', ',')}{suffix}")


def page_cover(book: Booklet):
    c = book.begin("R", plain=True)
    c.setFillColor(NAVY)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    c.setFillColor(MINT)
    c.circle(W - 62, H - 70, 110, stroke=0, fill=1)
    c.setFillColor(Color(1, 1, 1, alpha=0.09))
    for r in (56, 112, 168, 224):
        c.circle(W - 62, H - 70, r, stroke=1, fill=0)
    c.drawImage(ImageReader(str(LOGO)), 18 * MM, H - 31 * MM, 15 * MM, 15 * MM, mask="auto")
    c.setFillColor(white)
    c.setFont("BookBold", 9)
    c.drawString(36 * MM, H - 23 * MM, "EXPLORARG · MARKETSCAN")
    c.setFont("BookBold", 37)
    y = H - 76 * MM
    y = draw_text(c, "Reforma de la Ley 27.640", 18 * MM, y, W - 40 * MM, "BookBold", 37, 39, white)
    y -= 5 * MM
    y = draw_text(c, "Del diagnóstico a una propuesta verificable", 18 * MM, y, W - 48 * MM, "Book", 19, 23, HexColor("#D9F5F1"))
    c.setFillColor(MINT)
    c.rect(18 * MM, 47 * MM, 52 * MM, 3, stroke=0, fill=1)
    draw_text(
        c,
        "Versión impresa navegable de los dashboards Análisis Proyecto Secretaría de Energía y Propuesta S-0809/2026.",
        18 * MM,
        40 * MM,
        W - 48 * MM,
        "Book",
        10,
        13,
        white,
    )
    c.setFont("BookBold", 7)
    c.drawString(18 * MM, 16 * MM, "EDICION DE CONSULTA · AGOSTO 2026")


def page_guide(book: Booklet):
    c = book.begin("R")
    y = book.title("Cómo usar este informe", "Una interfaz hecha de papel", "No hace falta leer de principio a fin: cada página resuelve una pregunta y remite al siguiente nivel de detalle.")
    x, cw = content_x(book.page), content_w(book.page)
    cols = [
        ("R", "Reforma", "El problema y su evidencia", RED, RED_PALE),
        ("E", "Evidencia", "Los números que sostienen el diagnóstico", VIOLET, VIOLET_PALE),
        ("P", "Propuesta", "Qué modifica el texto HDO", MINT_DARK, MINT_PALE),
        ("A", "Anexo análisis", "Artículo completo y notas", AMBER, AMBER_PALE),
        ("L", "Anexo legal", "Proyecto completo con cambios en rojo", NAVY, SOFT),
    ]
    y -= 10
    for code, title, body, accent, pale in cols:
        rounded(c, x, y - 48, cw, 42, pale, LIGHT, 7)
        rounded(c, x + 8, y - 39, 26, 26, accent, radius=6)
        c.setFillColor(white); c.setFont("BookBold", 11); c.drawCentredString(x + 21, y - 30, code)
        c.setFillColor(INK); c.setFont("BookBold", 10); c.drawString(x + 46, y - 24, title)
        c.setFillColor(MID); c.setFont("Book", 8); c.drawString(x + 46, y - 37, body)
        y -= 54
    callout(c, x, 82, cw, 68, "Referencia cruzada", "→ ver P.14 / pág. 28 significa: pestaña Propuesta, artículo 14, página física 28. Los códigos permanecen en el borde exterior de todas las hojas.", NAVY, SOFT)


def page_index(book: Booklet):
    c = book.begin("R")
    book.title("Mapa general", "Tres problemas. Una misma falla de diseño.", "El artículo 2 fija el estándar; la estructura del proyecto debe medirse contra él.")
    x, cw = content_x(book.page), content_w(book.page)
    top_y = H - 105 * MM
    callout(c, x + cw * .19, top_y, cw * .62, 56, "ARTÍCULO 2 · INTERÉS PÚBLICO", "Seguridad energética · transición hacia energías más limpias", VIOLET, VIOLET_PALE)
    boxes = [
        ("01", "Categorías", "La fecha elimina la categoría; no la diferencia estructural.", RED, RED_PALE),
        ("02", "Emisiones", "El mejor desempeño no recibe valor; el sustituto puede no medirse.", AMBER, AMBER_PALE),
        ("03", "Márgenes", "Oferta de insumos y demanda final están concentradas.", VIOLET, VIOLET_PALE),
    ]
    by = 285
    bw = (cw - 20) / 3
    for i, (n, t, b, accent, pale) in enumerate(boxes):
        xx = x + i * (bw + 10)
        rounded(c, xx, by, bw, 150, pale, accent, 9)
        c.setFillColor(accent); c.setFont("BookBold", 23); c.drawString(xx + 12, by + 112, n)
        c.setFillColor(INK); c.setFont("BookBold", 12); c.drawString(xx + 12, by + 86, t)
        draw_text(c, b, xx + 12, by + 66, bw - 24, "Book", 8.5, 11, MID, 6)
        arrow(c, x + cw / 2, top_y, xx + bw / 2, by + 150, MID, .8)
    callout(c, x + cw * .13, 120, cw * .74, 78, "RESULTADO", "No desregula: condiciona quién puede competir y con qué ventajas antes de la primera oferta.", RED, RED_PALE)


def page_standard(book: Booklet):
    c = book.begin("R")
    y = book.title("R.2 · El estándar", "El interés público obliga a quien lo declara", "La declaración del artículo 2 no es decorativa: convierte sus fines en la medida de coherencia de todo el régimen.")
    x, cw = content_x(book.page), content_w(book.page)
    y -= 12
    kpi(c, x, y - 130, cw * .48, 120, "2 fines", "seguridad energética + transición hacia energías más limpias", VIOLET, VIOLET_PALE, 31)
    kpi(c, x + cw * .52, y - 130, cw * .48, 120, "3 pruebas", "posición estructural + atributo ambiental + poder de mercado", RED, RED_PALE, 31)
    callout(c, x, 135, cw, 118, "REGLA DE LECTURA", "Cada decisión debe responder tres preguntas: ¿preserva el abastecimiento?, ¿premia una reducción de emisiones verificable?, ¿permite competir sin que una parte controle el insumo o la demanda de la otra?", NAVY, SOFT)


def page_categories_problem(book: Booklet):
    c = book.begin("R")
    book.title("R.1 · Categorías", "La categoría puede desaparecer. La diferencia, no.", "Integradas y no integradas producen el mismo biodiésel, pero no compiten desde la misma posición.")
    x, cw = content_x(book.page), content_w(book.page)
    kpi(c, x, 455, cw * .31, 112, "76,1%", "del costo previo al retorno corresponde al aceite", RED, RED_PALE)
    kpi(c, x + cw * .345, 455, cw * .31, 112, "6,3×", "escala media de la planta integrada", VIOLET, VIOLET_PALE)
    kpi(c, x + cw * .69, 455, cw * .31, 112, ">75%", "del costo se compra a competidores directos", AMBER, AMBER_PALE)
    c.setFillColor(MID); c.setFont("BookBold", 7); c.drawString(x, 422, "ESTRUCTURA DEL COSTO · AGOSTO 2025")
    bar_chart(c, x, 250, cw, 145, [("Aceite", 76.1), ("Otros costos", 23.9)], 100, "%", [RED, LIGHT])
    callout(c, x, 125, cw, 80, "PROBLEMA → EFECTO", "Eliminar categorías por calendario transforma una asimetría observada en una ventaja sin regla. El efecto probable es mayor concentración del abastecimiento.", RED, RED_PALE)


def page_categories_solution(book: Booklet):
    c = book.begin("P")
    book.title("P.6 + P.39", "Reconocer posiciones mientras la evidencia las distinga", "La propuesta define integrada, no integrada y grupo económico para todo el régimen; la transición termina por indicadores, no sólo por fecha.")
    x, cw = content_x(book.page), content_w(book.page)
    steps = [
        ("Definir", "La unidad económica real", VIOLET, VIOLET_PALE),
        ("Medir", "Concentración, acceso a insumos, utilización y exportación", AMBER, AMBER_PALE),
        ("Decidir", "Fin o prórroga automática según umbrales", MINT_DARK, MINT_PALE),
    ]
    y = 500
    for i, (t, b, ac, pale) in enumerate(steps):
        callout(c, x + i * (cw / 3), y, cw / 3 - 10, 115, t, b, ac, pale)
        if i < 2:
            arrow(c, x + (i + 1) * cw / 3 - 16, y + 57, x + (i + 1) * cw / 3 - 2, y + 57, MID)
    kpi(c, x, 315, cw * .48, 120, "3 de 5", "umbrales de prórroga se verificarían hoy", MINT_DARK, MINT_PALE)
    kpi(c, x + cw * .52, 315, cw * .48, 120, "43%", "uso de capacidad de pequeñas elaboradoras en 2023", RED, RED_PALE)
    callout(c, x, 145, cw, 100, "NO ES PROTECCIÓN PERMANENTE", "La regla no garantiza volumen ni rentabilidad. Mantiene resguardos sólo mientras subsisten hechos verificables que impiden una competencia equivalente.", NAVY, SOFT)


def page_history(book: Booklet, integrated=True):
    c = book.begin("E")
    title = "La escala actual tiene historia" if integrated else "La multiplicación societaria también"
    subtitle = (
        "El diferencial de retenciones alteró durante años el precio relativo entre aceite y biodiésel."
        if integrated else
        "Los topes por sociedad permitieron acumular capacidad mediante varias plantas formalmente independientes."
    )
    book.title("E.1 · Formación de la estructura", title, subtitle)
    x, cw = content_x(book.page), content_w(book.page)
    img = IMG_INTEGRADAS if integrated else IMG_NO_INTEGRADAS
    c.drawImage(ImageReader(str(img)), x, 245, cw, 300, preserveAspectRatio=True, anchor="c", mask="auto")
    if integrated:
        kpi(c, x, 120, cw * .48, 98, "USD 2.040 M", "efecto económico acumulado estimado en el análisis", VIOLET, VIOLET_PALE, 22)
        kpi(c, x + cw * .52, 120, cw * .48, 98, "3,5×", "aproximadamente la inversión acumulada", RED, RED_PALE, 25)
        draw_text(c, "Corte conservador citado en la matriz de evidencia: al menos USD 1.890 M frente a USD 770 M invertidos.", x, 104, cw, "BookItalic", 6.8, 8, MID)
    else:
        kpi(c, x, 120, cw * .48, 98, ">340.000 t", "acumuladas por grupos mediante plantas de 50.000 t", RED, RED_PALE, 22)
        kpi(c, x + cw * .52, 120, cw * .48, 98, "14%", "límite propuesto por empresa y grupo económico", MINT_DARK, MINT_PALE, 25)


def page_emissions_problem(book: Booklet):
    c = book.begin("R")
    book.title("R.2 · Emisiones", "Calidad no es desempeño ambiental", "Cumplir la especificación técnica permite funcionar. Reducir emisiones exige medir otro atributo.")
    x, cw = content_x(book.page), content_w(book.page)
    by = 425
    callout(c, x, by, cw * .46, 145, "CALIDAD", "¿El combustible cumple la norma para operar de forma segura?", NAVY, SOFT)
    callout(c, x + cw * .54, by, cw * .46, 145, "DESEMPEÑO", "¿Cuánto CO2 equivalente evita frente al fósil sustituido?", GREEN, GREEN_PALE)
    c.setFillColor(RED); c.setFont("BookBold", 26); c.drawCentredString(x + cw / 2, 350, "≠")
    callout(c, x, 160, cw, 130, "LA INVERSIÓN DEL INCENTIVO", "El biodiésel certificado de segunda generación reduce más, pero el texto base no le asigna valor. El coprocesado puede computarse sin exigir que su fracción renovable y su reducción sean verificadas.", RED, RED_PALE)


def page_emissions_data(book: Booklet):
    c = book.begin("E")
    book.title("E.2 · Reducción certificada", "60% · 81% · 84%", "La materia prima y el proceso importan. Los atributos ya se certifican bajo esquemas reconocidos internacionalmente.")
    x, cw = content_x(book.page), content_w(book.page)
    bar_chart(c, x, 380, cw, 190, [("Aceite de soja", 60), ("Oleína", 81), ("Residuos", 84)], 100, "%", [AMBER, VIOLET, GREEN])
    kpi(c, x, 215, cw * .48, 112, "≥90%", "umbral propuesto para biodiésel de segunda generación", GREEN, GREEN_PALE, 30)
    kpi(c, x + cw * .52, 215, cw * .48, 112, "≥60%", "umbral mínimo para computar biodiésel en el mandato", MINT_DARK, MINT_PALE, 30)
    draw_text(c, "→ ver P.3, P.5, P.6, P.12, P.19, P.28, P.36 y P.40", x, 170, cw, "BookBold", 8, 10, MID)


def page_coprocessing(book: Booklet):
    c = book.begin("P")
    book.title("P.19 · Coprocesamiento", "Sólo se computa lo medido", "Entrada al proceso, componente renovable y crédito regulatorio son magnitudes distintas.")
    x, cw = content_x(book.page), content_w(book.page)
    steps = [
        ("1", "Materia prima no fósil", "Dato de entrada; no equivale al contenido final", AMBER, AMBER_PALE),
        ("2", "Componente biogénico", "Fracción renovable medida y certificada", GREEN, GREEN_PALE),
        ("3", "Cómputo regulatorio", "Reconocimiento jurídico sin doble conteo", VIOLET, VIOLET_PALE),
    ]
    y = 505
    for i, (n, t, b, ac, pale) in enumerate(steps):
        xx = x + i * (cw / 3)
        rounded(c, xx, y, cw / 3 - 10, 150, pale, ac, 9)
        c.setFont("BookBold", 22); c.setFillColor(ac); c.drawString(xx + 12, y + 112, n)
        c.setFont("BookBold", 9.5); c.setFillColor(INK); c.drawString(xx + 12, y + 86, t)
        draw_text(c, b, xx + 12, y + 68, cw / 3 - 34, "Book", 8.1, 10.2, MID, 5)
        if i < 2: arrow(c, xx + cw / 3 - 20, y + 75, xx + cw / 3 - 2, y + 75)
    kpi(c, x, 290, cw * .48, 120, "55%", "reducción mínima propuesta para el componente coprocesado", MINT_DARK, MINT_PALE, 31)
    kpi(c, x + cw * .52, 290, cw * .48, 120, "Sólo refinadores", "disponen de infraestructura para coprocesar", RED, RED_PALE, 18)
    callout(c, x, 145, cw, 90, "EFECTO", "La ventaja fiscal y el cómputo quedan limitados a la fracción renovable efectivamente certificada.", NAVY, SOFT)


def page_margin_problem(book: Booklet):
    c = book.begin("R")
    book.title("R.3 · Compresión de márgenes", "Una pinza sobre el productor no integrado", "Compra dos insumos concentrados y vende a una demanda todavía más concentrada.")
    x, cw = content_x(book.page), content_w(book.page)
    center_x, center_y = x + cw / 2, 365
    callout(c, x, 470, cw * .38, 95, "ACEITE", "Más de 75% del costo; lo venden competidores directos", RED, RED_PALE)
    callout(c, x, 230, cw * .38, 95, "METANOL", ">90% proviene de un proveedor", RED, RED_PALE)
    callout(c, x + cw * .62, 470, cw * .38, 95, "4 COMPRADORES", "Concentran 98% de la demanda", VIOLET, VIOLET_PALE)
    callout(c, x + cw * .62, 230, cw * .38, 95, "UNO DOMINA", "Cerca de 60% de las compras", VIOLET, VIOLET_PALE)
    rounded(c, center_x - 62, center_y - 45, 124, 90, SOFT, NAVY, 10)
    c.setFillColor(INK); c.setFont("BookBold", 11); c.drawCentredString(center_x, center_y + 8, "PRODUCTOR")
    c.drawCentredString(center_x, center_y - 8, "NO INTEGRADO")
    for sx, sy in [(x + cw*.38, 515), (x + cw*.38, 275)]: arrow(c, sx, sy, center_x - 66, center_y)
    for ex, ey in [(x + cw*.62, 515), (x + cw*.62, 275)]: arrow(c, center_x + 66, center_y, ex, ey)
    c.setFillColor(RED); c.setFont("BookBold", 8); c.drawCentredString(center_x, 175, "MISMO ACTOR: PROVEEDOR DOMINANTE DE METANOL + COMPRADOR DOMINANTE")


def page_margin_solution(book: Booklet):
    c = book.begin("P")
    book.title("P.14 + P.20", "Competencia con reglas previas", "La propuesta no fija quién gana. Elimina el veto del comprador y exige conducta no discriminatoria sobre insumos esenciales.")
    x, cw = content_x(book.page), content_w(book.page)
    callout(c, x, 485, cw, 92, "SUBASTA VINCULANTE", "Demanda obligatoria · orden de mérito · precio único de cierre · garantías take or pay / deliver or pay", MINT_DARK, MINT_PALE)
    arrow(c, x + cw/2, 475, x + cw/2, 442, MINT_DARK, 1.4)
    callout(c, x, 340, cw, 92, "INSUMOS SIN DISCRIMINACIÓN", "Libertad de precios, pero igualdad de acceso, condiciones equivalentes y trazabilidad de operaciones entre integradas y no integradas.", VIOLET, VIOLET_PALE)
    arrow(c, x + cw/2, 330, x + cw/2, 297, MINT_DARK, 1.4)
    callout(c, x, 195, cw, 92, "LÍMITES POR GRUPO", "El 14% rige para toda la obligación y para la unidad económica real, cualquiera sea la sociedad o el canal contractual.", NAVY, SOFT)


def page_price(book: Booklet):
    c = book.begin("E")
    book.title("E.3 · Precio y consumidor", "La reducción no llegó al surtidor", "Los documentos del dashboard conservan dos cortes de actualización; por eso se muestran ambas series de cifras.")
    x, cw = content_x(book.page), content_w(book.page)
    kpi(c, x, 460, cw * .31, 118, "USD 78,8 M", "ingresos no percibidos · corte del fundamento inicial", RED, RED_PALE, 20)
    kpi(c, x + cw * .345, 460, cw * .31, 118, "USD 45,5 M", "quebranto · corte del fundamento inicial", RED, RED_PALE, 20)
    kpi(c, x + cw * .69, 460, cw * .31, 118, "$4,3/l", "ahorro estimado en surtidor", MINT_DARK, MINT_PALE, 25)
    callout(c, x, 322, cw, 88, "SERIE ACTUALIZADA EN EL ARTÍCULO 14", "USD 83,4 M de ingresos no percibidos y USD 53 M de quebranto operativo; dieciséis meses de precios publicados bajo la fórmula.", VIOLET, VIOLET_PALE)
    kpi(c, x, 165, cw * .48, 108, "$95,9/l", "incidencia impositiva durante el período comparado", AMBER, AMBER_PALE, 28)
    kpi(c, x + cw * .52, 165, cw * .48, 108, "10", "resoluciones de precio fuera de la metodología legal", RED, RED_PALE, 31)


def page_cut(book: Booklet):
    c = book.begin("E")
    book.title("E.4 · Cumplimiento", "El mandato nominal no garantiza mezcla física", "Asignación, contrato y porcentaje legal necesitan reglas de verificación y consecuencias.")
    x, cw = content_x(book.page), content_w(book.page)
    kpi(c, x, 470, cw * .31, 115, "2,581 Mt", "déficit acumulado desde 2010", RED, RED_PALE, 25)
    kpi(c, x + cw * .345, 470, cw * .31, 115, "3 de 16", "años completos con corte cumplido", RED, RED_PALE, 27)
    kpi(c, x + cw * .69, 470, cw * .31, 115, "USD 1.466 M", "beneficio estimado de mezcladoras", VIOLET, VIOLET_PALE, 19)
    bar_chart(c, x, 300, cw, 120, [("2023 real", 4.6), ("2023 obligación", 7.5), ("2024 real", 6.6), ("2024 obligación", 7.5)], 8, "%", [RED, NAVY, AMBER, NAVY])
    callout(c, x, 155, cw, 92, "PROBLEMA → EVIDENCIA → CORRECCIÓN", "Facultad abierta y ausencia de sanción → déficit documentado → piso físico, causal definida, plazo máximo, reposición automática y fiscalización de créditos.", MINT_DARK, MINT_PALE)


def page_implementation(book: Booklet, solution=False):
    c = book.begin("P" if solution else "R")
    if solution:
        book.title("P.42 · Continuidad", "Sustituir antes de derogar", "La derogación opera cuando el sistema nuevo está listo y, como máximo, dentro de doce meses.")
        items = [
            ("Mercado operativo", "Operador, rondas, adjudicación y garantías"),
            ("Registros vigentes", "Sujetos y habilitaciones con continuidad"),
            ("Métodos publicados", "Paridades, certificación y fiscalización"),
            ("Derogación efectiva", "Sin vacío de abastecimiento"),
        ]
        accent, pale = MINT_DARK, MINT_PALE
    else:
        book.title("R.4 · Implementación", "Derogar hoy. Construir mañana.", "El texto base elimina el régimen existente al día siguiente, aunque el sustituto todavía no puede operar.")
        items = [
            ("Día 1", "Derogación de Ley 27.640 y reglamentación"),
            ("Pendiente", "Operador independiente y Mercado Electrónico"),
            ("Pendiente", "Registros, garantías y metodología"),
            ("Resultado", "Intervalo sin mecanismo de abastecimiento"),
        ]
        accent, pale = RED, RED_PALE
    x, cw = content_x(book.page), content_w(book.page)
    y = 500
    for i, (t, b) in enumerate(items):
        callout(c, x + i * cw/4, y, cw/4 - 10, 118, t, b, accent if i in (0,3) else NAVY, pale if i in (0,3) else SOFT)
        if i < 3: arrow(c, x + (i+1)*cw/4 - 20, y + 58, x + (i+1)*cw/4 - 3, y + 58, accent)
    left_value = "≤12 meses" if solution else "1 día"
    left_label = "límite propuesto, con continuidad hasta que el sistema opere" if solution else "plazo del texto base para derogar todo el régimen"
    left_accent = MINT_DARK if solution else RED
    left_pale = MINT_PALE if solution else RED_PALE
    kpi(c, x, 295, cw * .48, 120, left_value, left_label, left_accent, left_pale, 31)
    kpi(c, x + cw * .52, 295, cw * .48, 120, "3 años, 3 meses, 27 días", "demoró la metodología exigida por la ley vigente", AMBER, AMBER_PALE, 17)
    callout(c, x, 145, cw, 90, "REFERENCIA", "→ ver P.10, P.28, P.33 y P.42 · continuidad registral, control y sanciones antes de la sustitución.", NAVY, SOFT)


def page_imports(book: Booklet):
    c = book.begin("P")
    book.title("P.26 · Importaciones", "Comparar bienes equivalentes", "Un precio menor sólo informa si calidad, certificación, impuestos, logística y punto de entrega son comparables.")
    x, cw = content_x(book.page), content_w(book.page)
    callout(c, x, 430, cw * .46, 145, "COMPARACIÓN INVÁLIDA", "Biodiésel importado terminado vs. aceite o metanol nacional · condiciones tributarias o logísticas distintas.", RED, RED_PALE)
    callout(c, x + cw * .54, 430, cw * .46, 145, "COMPARACIÓN EQUIVALENTE", "Biodiésel vs. biodiésel · misma calidad, certificación, tributación, logística y punto de entrega.", MINT_DARK, MINT_PALE)
    arrow(c, x + cw*.47, 500, x + cw*.53, 500, MID, 1.5)
    kpi(c, x, 245, cw * .48, 120, "USD 67,1/t", "ventaja estructural inicial estimada sobre el aceite", AMBER, AMBER_PALE, 25)
    kpi(c, x + cw * .52, 245, cw * .48, 120, "USD 448/t", "prima documentada del metanol", RED, RED_PALE, 25)
    draw_text(c, "La apertura por precio no puede ignorar las condiciones que forman ese precio.", x, 185, cw, "BookBold", 11, 14, INK)


def page_design_principles(book: Booklet):
    c = book.begin("P")
    book.title("P · Criterio común", "Siete reglas para que el mercado decida", "Todas las modificaciones responden al mismo principio: reglas generales, previas e impersonales.")
    x, cw = content_x(book.page), content_w(book.page)
    rules = [
        ("01", "Concurrencia", "Precio por ofertas y orden de mérito"),
        ("02", "Demanda vinculante", "Sin veto posterior del comprador"),
        ("03", "Medición", "Sólo computar volumen certificado"),
        ("04", "Unidad económica", "Límites por empresa y grupo"),
        ("05", "Causas enumeradas", "Plazo y reposición automática"),
        ("06", "Acceso equivalente", "Insumos y mercados externos"),
        ("07", "Continuidad", "Derogar cuando el sustituto opera"),
    ]
    y = 535
    for i, (n,t,b) in enumerate(rules):
        xx = x + (i % 2) * (cw/2 + 5)
        yy = y - (i//2) * 94
        rounded(c, xx, yy-70, cw/2-10, 78, MINT_PALE if i%2==0 else SOFT, LIGHT, 7)
        c.setFillColor(MINT_DARK); c.setFont("BookBold", 18); c.drawString(xx+10, yy-25, n)
        c.setFillColor(INK); c.setFont("BookBold", 9.5); c.drawString(xx+48, yy-22, t)
        draw_text(c,b,xx+48,yy-38,cw/2-70,"Book",7.8,9.5,MID,3)


def page_article_map_open(book: Booklet):
    section_open(book, "P", "21", "artículos modificados", "Cada ficha reúne cuatro capas: qué cambia, qué norma compromete el texto base, qué efecto produce la corrección y qué evidencia la respalda.", MINT_DARK)


def article_card(c, x, y, w, h, item):
    rounded(c, x, y, w, h, white, LIGHT, 8)
    c.setFillColor(MINT_DARK)
    c.rect(x, y + h - 30, w, 30, stroke=0, fill=1)
    c.setFillColor(white); c.setFont("BookBold", 11)
    c.drawString(x + 10, y + h - 20, f"P.{item['art']}")
    c.setFillColor(INK); c.setFont("BookBold", 8.4)
    draw_text(c, item["mod"], x + 10, y + h - 45, w - 20, "BookBold", 8.4, 10, INK, 2)
    labels = [("NORMA", item["norma"], RED), ("EFECTO", item["efecto"], MINT_DARK)]
    yy = y + h - 80
    for lab, txt, color in labels:
        c.setFillColor(color); c.setFont("BookBold", 6.2); c.drawString(x + 10, yy, lab)
        yy = draw_text(c, txt, x + 55, yy, w - 65, "Book", 7.2, 8.6, MID, 2) - 4
    if item["kpis"]:
        v, l = item["kpis"][0]
        rounded(c, x + 10, y + 10, w - 20, 38, SOFT, radius=6)
        c.setFillColor(INK); c.setFont("BookBold", 11); c.drawString(x + 18, y + 28, v)
        draw_text(c, l, x + 88, y + 30, w - 108, "Book", 6.7, 7.8, MID, 2)


def article_card_pages(book: Booklet):
    groups = [ARTICLE_CARDS[i:i+3] for i in range(0, len(ARTICLE_CARDS), 3)]
    for idx, group in enumerate(groups, 1):
        c = book.begin("P")
        book.title("P · Mapa artículo por artículo", f"Correcciones {idx:02d}/{len(groups):02d}", "Fichas de consulta rápida. El articulado completo comienza en el anexo L.", size=23)
        x, cw = content_x(book.page), content_w(book.page)
        y_top = 540
        card_h = 148
        for j, item in enumerate(group):
            article_card(c, x, y_top - j * (card_h + 14), cw, card_h, item)


def page_transition(book: Booklet):
    c = book.begin("P")
    book.title("P.40 · Transición", "Separar producto, componente y crédito", "La tabla propuesta hace fiscalizable qué parte del 10% es biodiésel físico y qué parte corresponde a otros cómputos.")
    x, cw = content_x(book.page), content_w(book.page)
    cols = ["Hasta corte", "2028", "2029", "2030", "2031"]
    rows = [
        ("No integradas · mínimo", [7.5, 6.5, 5.5, 5.0, 3.0], MINT_DARK),
        ("Biogénico · máximo", [0, .5, 1, 1, 1.5], VIOLET),
        ("Crédito 2G · máximo", [0, .5, 1, 1, 1.5], GREEN),
        ("Biodiésel 1G remanente", [0, 2.5, 2.5, 3, 4], AMBER),
        ("Corte regulatorio", [7.5, 10, 10, 10, 10], NAVY),
        ("Biodiésel físico total", [7.5, 9, 8, 8, 7], RED),
    ]
    table_y = 470
    label_w = cw * .38
    cell_w = (cw - label_w) / len(cols)
    c.setFillColor(NAVY); c.rect(x, table_y, cw, 34, stroke=0, fill=1)
    c.setFillColor(white); c.setFont("BookBold", 6.8)
    for i, col in enumerate(cols): c.drawCentredString(x+label_w+i*cell_w+cell_w/2, table_y+12, col)
    y = table_y - 45
    for label, vals, accent in rows:
        c.setFillColor(SOFT if int((table_y-y)/45)%2 else white); c.rect(x, y, cw, 40, stroke=0, fill=1)
        c.setFillColor(accent); c.rect(x, y, 3, 40, stroke=0, fill=1)
        c.setFillColor(INK); c.setFont("BookBold", 7.4); c.drawString(x+10,y+15,label)
        for i,v in enumerate(vals):
            c.setFont("BookBold", 8); c.setFillColor(accent)
            c.drawCentredString(x+label_w+i*cell_w+cell_w/2,y+15,f"{str(v).replace('.',',')}%")
        y -= 45
    callout(c, x, 125, cw, 78, "CLAVE", "El corte regulatorio puede incluir créditos. Por eso el volumen físico resultante debe mostrarse por separado.", MINT_DARK, MINT_PALE)


def page_summary(book: Booklet):
    c = book.begin("P")
    book.title("Síntesis", "Hoy / propuesta", "La doble página conceptual del informe, reunida en una sola matriz de consulta.")
    x, cw = content_x(book.page), content_w(book.page)
    left, right = cw*.48, cw*.48
    c.setFillColor(RED); c.setFont("BookBold", 12); c.drawString(x, 560, "HOY / TEXTO BASE")
    c.setFillColor(MINT_DARK); c.drawString(x+cw*.52, 560, "PROPUESTA HDO")
    pairs = [
        ("Categorías terminan por fecha", "Resguardos terminan por indicadores"),
        ("Acuerdo posterior del comprador", "Adjudicación y demanda vinculante"),
        ("Cómputo sin medición suficiente", "Volumen y componente certificados"),
        ("Límite por sociedad", "Límite por empresa y grupo"),
        ("Reducción del corte abierta", "Causales, piso, plazo y reposición"),
        ("Derogación al día siguiente", "Continuidad hasta sistema operativo"),
    ]
    y=510
    for a,b in pairs:
        callout(c,x,y-58,left,62,"PROBLEMA",a,RED,RED_PALE)
        callout(c,x+cw*.52,y-58,right,62,"CORRECCIÓN",b,MINT_DARK,MINT_PALE)
        arrow(c,x+left+4,y-28,x+cw*.52-4,y-28,MID,.9)
        y-=72


def page_paths(book: Booklet):
    c=book.begin("R")
    book.title("Rutas de lectura", "Entrar por la pregunta", "Cinco recorridos posibles para usar el informe sin leerlo linealmente.")
    x,cw=content_x(book.page),content_w(book.page)
    routes=[
        ("¿Por qué no basta eliminar categorías?","R.1 → E.1 → P.6 → P.39 → P.41",RED,RED_PALE),
        ("¿Cómo se premia la reducción real?","R.2 → E.2 → P.3 → P.12 → P.19",GREEN,GREEN_PALE),
        ("¿La subasta produce competencia?","R.3 → E.3 → P.14 → P.15 → P.16",VIOLET,VIOLET_PALE),
        ("¿Puede bajar el corte?","E.4 → P.12 → P.13 → P.33",AMBER,AMBER_PALE),
        ("¿Cuándo se deroga la ley vigente?","R.4 → P.10 → P.28 → P.42",NAVY,SOFT),
    ]
    y=535
    for q,path,ac,pale in routes:
        rounded(c,x,y-76,cw,68,pale,ac,8)
        c.setFillColor(INK);c.setFont("BookBold",10);c.drawString(x+12,y-30,q)
        c.setFillColor(ac);c.setFont("BookBold",8);c.drawString(x+12,y-50,path)
        y-=84


def page_appendix_menu(book: Booklet):
    c=book.begin("A")
    book.title("Material de consulta", "El texto completo queda al final", "El cuerpo principal explica; los anexos permiten verificar cada formulación.")
    x,cw=content_x(book.page),content_w(book.page)
    callout(c,x,420,cw,145,"A · ANÁLISIS COMPLETO","Una desregulación contra el interés público y el mercado libre: capítulos, desplegables, conclusión, 27 notas y documentos considerados.",AMBER,AMBER_PALE)
    callout(c,x,235,cw,145,"L · PROYECTO COMPLETO","Artículos 1 a 46 y fundamentos. Las incorporaciones propuestas se conservan en rojo y subrayado.",NAVY,SOFT)
    draw_text(c,"Las páginas de anexo usan tipografía compacta y dos columnas exclusivamente como material de consulta.",x,175,cw,"BookItalic",9,12,MID)


def rich_from_node(node: Nodo, inherited=None) -> str:
    """Convierte un nodo del MiniDom en markup seguro para Paragraph."""
    out=[]
    for child in node.hijos:
        if isinstance(child,str):
            out.append(html.escape(clean(child)))
            continue
        inner=rich_from_node(child,inherited)
        if child.tag in ("strong","b"):
            out.append(f"<b>{inner}</b>")
        elif child.tag in ("em","i"):
            out.append(f"<i>{inner}</i>")
        elif child.tag=="ins":
            out.append(f'<font color="#B74336"><u>{inner}</u></font>')
        elif child.tag=="br":
            out.append("<br/>")
        else:
            out.append(inner)
    return " ".join(x for x in out if x)


APP_BODY = ParagraphStyle("app-body", fontName="Narrow", fontSize=5.9, leading=6.8,
                          textColor=INK, alignment=TA_LEFT, spaceAfter=2.8)
APP_BODY_RED = ParagraphStyle("app-body-red", parent=APP_BODY, textColor=RED)
APP_H1 = ParagraphStyle("app-h1", fontName="NarrowBold", fontSize=10.5, leading=11.5,
                        textColor=INK, spaceBefore=5, spaceAfter=4)
APP_H2 = ParagraphStyle("app-h2", fontName="NarrowBold", fontSize=8.2, leading=9.1,
                        textColor=NAVY, spaceBefore=4.5, spaceAfter=3)
APP_H3 = ParagraphStyle("app-h3", fontName="NarrowBold", fontSize=6.8, leading=7.7,
                        textColor=MINT_DARK, spaceBefore=3.5, spaceAfter=2)
APP_NOTE = ParagraphStyle("app-note", fontName="Narrow", fontSize=5.3, leading=6.2,
                          textColor=MID, spaceAfter=2)


def reforma_story():
    story=[]
    story.append(Paragraph("Una desregulación contra el interés público y el mercado libre", APP_H1))
    for node in DOM_REF.raiz.buscar(lambda n: n.tag in ("h2","details")):
        if node.tag=="h2" and "pl-fund-titulo" not in node.clase():
            story.append(Paragraph(html.escape(clean(node.texto())),APP_H2))
        elif node.tag=="details":
            summary=next((h for h in node.hijos if isinstance(h,Nodo) and h.tag=="summary"),None)
            if summary:
                story.append(Paragraph(html.escape(clean(summary.texto())),APP_H3))
            for el in node.buscar(lambda n:n.tag in ("p","li")):
                txt=rich_from_node(el)
                if txt:
                    story.append(Paragraph(txt,APP_BODY))
    return story


def legal_story():
    story=[]
    ley=find_first(DOM_PROP.raiz,lambda n:"pl-ley" in n.clase())
    story.append(Paragraph("Proyecto de Ley S-0809/2026 con modificaciones propuestas",APP_H1))
    for node in ley.buscar(lambda n:n.tag in ("h2","h3","section")):
        if node.tag=="h2" and "pl-fund-titulo" not in node.clase():
            story.append(Paragraph(html.escape(clean(node.texto())),APP_H2))
        elif node.tag=="h3":
            story.append(Paragraph(html.escape(clean(node.texto())),APP_H3))
        elif node.tag=="section" and "pl-art" in node.clase():
            art_title=clean(node.texto()).split(". ",1)[0]
            story.append(Paragraph(html.escape(art_title),APP_H3))
            for p in node.buscar(lambda n:n.tag in ("p","li")):
                markup=rich_from_node(p)
                if markup:
                    story.append(Paragraph(markup,APP_BODY))
    # Fundamentos oficiales y propuestos son parte de la misma pagina web.
    for block_class,title in [("pl-fund-oficial","Fundamentos del proyecto oficial"),("pl-fund-propuesta","Fundamentos de la propuesta de cambios")]:
        block=next(ley.buscar(lambda n:block_class in n.clase()),None)
        if block:
            story.append(Paragraph(title,APP_H1))
            for p in block.buscar(lambda n:n.tag in ("p","li","h4")):
                style=APP_H3 if p.tag=="h4" else APP_BODY
                markup=rich_from_node(p)
                if markup: story.append(Paragraph(markup,style))
    return story


def flow_appendix(book: Booklet, story, section, running_title, bookmark):
    c=book.c
    pages=0
    while story:
        book.begin(section)
        pages+=1
        if pages==1:
            c.bookmarkPage(bookmark)
            c.addOutlineEntry(running_title,bookmark,level=0,closed=False)
        x=content_x(book.page)
        cw=content_w(book.page)
        top=H-24*MM
        bottom=17*MM
        gap=7*MM
        col=(cw-gap)/2
        c.setFillColor(SECTION_META[section][2]);c.setFont("BookBold",8)
        c.drawString(x,top+4,running_title.upper())
        for i in range(2):
            frame=Frame(x+i*(col+gap),bottom,col,top-bottom-8,showBoundary=0,
                        leftPadding=0,rightPadding=0,topPadding=2,bottomPadding=0)
            before=len(story)
            frame.addFromList(story,c)
            if len(story)==before:
                raise RuntimeError(f"No se pudo avanzar el anexo {section} en pagina {book.page}")
            if not story: break
    return pages


def sources_page(book: Booklet):
    c=book.begin("F")
    book.title("Fuentes y alcance", "Qué se imprimió", "Edición construida a partir de las fuentes que alimentan las dos páginas web, verificadas contra su versión pública.")
    x,cw=content_x(book.page),content_w(book.page)
    items=[
        ("Fuente editorial", "Una desregulación contra el interés público y el mercado libre · Hilarión Del Olmo."),
        ("Proyecto", "S-0809/2026 · versión Secretaría de Energía 260729 · revisión HDO 11/08/2026."),
        ("Datos", "Secretaría de Energía, normativa citada, certificados y documentos listados en las notas del anexo A."),
        ("Actualización", "Dashboard: datos agregados hasta junio de 2026. Textos y propuesta: agosto de 2026."),
        ("Criterio", "Las cifras con cortes distintos se conservan y se identifican; no se homogeneizaron silenciosamente."),
    ]
    y=535
    for t,b in items:
        callout(c,x,y-70,cw,64,t,b,GREEN,GREEN_PALE)
        y-=78
    c.setFillColor(MID);c.setFont("Book",6.5)
    c.drawString(x,125,"biodiesel-argentina-dashboard.vercel.app/reforma-ley-27640")
    c.drawString(x,112,"biodiesel-argentina-dashboard.vercel.app/propuesta-s0809-2026")


def back_cover(book: Booklet):
    c=book.begin("F",plain=True)
    c.setFillColor(NAVY);c.rect(0,0,W,H,stroke=0,fill=1)
    c.drawImage(ImageReader(str(LOGO)),W/2-18*MM,H/2+25*MM,36*MM,36*MM,mask="auto")
    c.setFillColor(white);c.setFont("BookBold",18)
    c.drawCentredString(W/2,H/2+8*MM,"EXPLORARG")
    c.setFillColor(MINT);c.setFont("BookBold",8)
    c.drawCentredString(W/2,H/2-2*MM,"MARKETSCAN · DATOS PARA DISCUTIR REGLAS")
    draw_text(c,"Una versión en papel para navegar evidencia, problemas y soluciones sin perder la lógica del dashboard.",35*MM,H/2-28*MM,W-70*MM,"Book",10,13,white)
    c.setFont("Book",7);c.drawCentredString(W/2,18*MM,"AGOSTO 2026")


def build():
    OUT.parent.mkdir(parents=True,exist_ok=True)
    book=Booklet(OUT)
    page_cover(book)                    # 01
    page_guide(book)                    # 02
    page_index(book)                    # 03
    section_open(book,"R","01","el estándar y sus contradicciones","Una reforma se mide contra los fines que ella misma declara: seguridad energética, transición limpia y competencia.",RED) #04
    page_standard(book)                 #05
    page_categories_problem(book)       #06
    page_categories_solution(book)      #07
    page_history(book,True)             #08
    page_history(book,False)            #09
    page_emissions_problem(book)        #10
    page_emissions_data(book)           #11
    page_coprocessing(book)              #12
    page_margin_problem(book)           #13
    page_margin_solution(book)          #14
    page_price(book)                    #15
    page_cut(book)                      #16
    page_implementation(book,False)     #17
    page_implementation(book,True)      #18
    page_imports(book)                  #19
    page_design_principles(book)        #20
    page_article_map_open(book)         #21
    article_card_pages(book)            #22-28
    page_transition(book)               #29
    page_summary(book)                  #30
    page_paths(book)                    #31
    page_appendix_menu(book)            #32

    ref_pages=flow_appendix(book,reforma_story(),"A","Anexo A · Análisis completo","anexo-a")
    legal_pages=flow_appendix(book,legal_story(),"L","Anexo L · Proyecto completo","anexo-l")
    sources_page(book)
    # El total debe ser múltiplo de cuatro para imposición de cuadernillo.
    while (book.page + 1) % 4:
        c=book.begin("F")
        x,cw=content_x(book.page),content_w(book.page)
        c.setFillColor(LIGHT);c.setFont("BookItalic",8)
        c.drawCentredString(x+cw/2,H/2,"Página reservada para notas")
    back_cover(book)
    book.save()
    print(json.dumps({"output":str(OUT),"pages":book.page,"analysis_pages":ref_pages,"legal_pages":legal_pages},ensure_ascii=False))


if __name__=="__main__":
    build()
