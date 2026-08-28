#!/usr/bin/env python3
"""Booklet impreso construido desde los contenidos de los anexos A y L.

El cuerpo visual no resume el dashboard desde afuera: convierte cada bloque
del análisis (A) y cada artículo modificado (L) en una unidad editorial.
"""

from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.utils import ImageReader

import generar_booklet_impreso as base
from exportar_respaldo_spec import Nodo, bloques_de_popup


OUT = base.ROOT / "output/pdf/reforma_ley_27640_booklet.pdf"


def nodes_text(nodes):
    return [base.clean(n.texto()) for n in nodes if base.clean(n.texto())]


def truncate(text, n):
    text = base.clean(text)
    if len(text) <= n:
        return text
    cut = text[:n].rsplit(" ", 1)[0]
    return cut + "..."


def detail_source():
    out = []
    for d in base.DOM_REF.raiz.buscar(lambda n: n.tag == "details"):
        summary = next((x for x in d.hijos if isinstance(x, Nodo) and x.tag == "summary"), None)
        ps = nodes_text(d.buscar(lambda n: n.tag == "p"))
        lis = nodes_text(d.buscar(lambda n: n.tag == "li"))
        out.append({"title": base.clean(summary.texto()) if summary else "", "paras": ps, "lis": lis})
    return out


DETAILS = detail_source()


ANALYSIS_CONFIG = [
    ("A.0", "El estándar", [("Artículo 2", "interés público"), ("Seguridad", "energética"), ("Transición", "más limpia")], base.VIOLET),
    ("A.1", "Posiciones distintas", [("Producto", "homogéneo"), ("Actores", "diferentes"), ("Regla", "según posición")], base.RED),
    ("A.1", "Una cadena, varios roles", [("Materia prima", "producción"), ("Biodiésel", "elaboración"), ("Demanda", "mezcla")], base.RED),
    ("A.1", "Qué diferencia importa", [("Costo propio", "no regula"), ("Control ajeno", "sí importa"), ("Atributo", "se certifica")], base.AMBER),
    ("A.1", "La magnitud", [("76,1%", "del costo es aceite"), ("6,3×", "escala integrada"), ("52.240 t", "escala no integrada")], base.RED),
    ("A.1", "La historia de la estructura", [("USD 2.040 M", "efecto estimado"), ("USD 590 M", "inversión 2007-2013"), ("3,5×", "relación estimada")], base.VIOLET),
    ("A.1", "La distorsión presente", [("16 meses", "bajo la fórmula"), ("USD 53 M", "quebranto"), ("USD 83,4 M", "ingresos no percibidos")], base.RED),
    ("A.2", "Dos preguntas", [("Calidad", "aptitud técnica"), ("Emisiones", "resultado ambiental"), ("No son", "equivalentes")], base.GREEN),
    ("A.2", "Segunda generación", [("60-62%", "soja"), ("81%", "oleína"), ("84%", "residuos")], base.GREEN),
    ("A.3", "Precio y eficiencia", [("USD 48", "aceite"), ("USD 14,2", "financiación"), ("USD 67,1", "ventaja estimada")], base.AMBER),
    ("A.3", "La pinza", [("98%", "cuatro compradores"), ("≈60%", "un comprador"), (">90%", "un proveedor de metanol")], base.VIOLET),
    ("A.3", "Subasta sin cierre", [("Oferta", "registrada"), ("Acuerdo", "posterior"), ("Adjudicación", "no asegurada")], base.RED),
    ("A.3", "Sociedad no es competidor", [("50.000 t", "tope por planta"), ("348.000 t", "grupo acumulado"), ("14%", "límite propuesto")], base.VIOLET),
    ("A.4", "Un mismo error", [("Posición", "ignorada"), ("Atributo", "ignorado"), ("Poder", "ignorado")], base.RED),
    ("A.5", "Derogar antes de sustituir", [("1 día", "derogación"), ("Mercado", "no constituido"), ("Abastecimiento", "sin mecanismo")], base.RED),
    ("A.5", "Reducir sin prueba", [("Sin piso", "legal"), ("Sin plazo", "máximo"), ("Sin reposición", "automática")], base.AMBER),
    ("A.5", "Importar por precio", [("Precio", "no alcanza"), ("Calidad", "equivalente"), ("Logística", "comparable")], base.AMBER),
    ("A.5", "Tensiones abiertas", [("6% + 6%", "pisos de etanol"), ("12%", "corte compatible"), ("Silencio", "sólo registral")], base.VIOLET),
    ("A.6", "El antecedente", [("Licitación", "pública"), ("14%", "por grupo"), ("Resultados", "publicados")], base.NAVY),
    ("A.6", "Rectificar sin proteger", [("Precio", "por concurrencia"), ("Límite", "por grupo"), ("Atributo", "certificado")], base.MINT_DARK),
    ("A.7", "Conclusión", [("Mercado", "decide"), ("Ley", "fija reglas"), ("Interés público", "mide coherencia")], base.NAVY),
]


def popup_map():
    return {
        (n.attrs.get("data-art"), n.attrs.get("data-tipo")): n
        for n in base.DOM_PROP.raiz.buscar(lambda n: "pl-pop" in n.clase())
    }


POPS = popup_map()


def popup_paras(art, tipo):
    node = POPS.get((str(art), tipo))
    if not node:
        return []
    return nodes_text(node.buscar(lambda n: n.tag == "p"))


def article_section(art):
    return next(base.DOM_PROP.raiz.buscar(lambda n: n.tag == "section" and n.attrs.get("id") == f"art-{art}"))


def article_inserts(art):
    sec = article_section(art)
    snippets = []
    for n in sec.buscar(lambda n: n.tag == "ins"):
        txt = base.clean(n.texto())
        if len(txt) > 18 and txt not in snippets:
            snippets.append(txt)
    return snippets


def article_title(art):
    sec = article_section(art)
    txt = base.clean(sec.texto())
    m = re.search(r"ARTÍCULO\s+\d+[º°]?[.-]*\s*(.*?)(?:\.|$)", txt, re.I)
    return m.group(1) if m else f"Artículo {art}"


def article_kpis(art):
    node = POPS.get((str(art), "hechos"))
    if not node:
        return []
    blocks = bloques_de_popup(node)
    for b in blocks:
        if b["tipo"] == "kpis":
            return [(base.clean(i["valor"]), base.clean(i["label"])) for i in b["items"]]
    return []


ART_REFS = {
    3: "→ ver A.2 / págs. 12-13", 5: "→ ver A.1 / págs. 8-11", 6: "→ ver A.1 / págs. 6-11",
    10: "→ ver A.5 / pág. 22", 12: "→ ver A.5 / pág. 23", 13: "→ ver A.5 / pág. 25",
    14: "→ ver A.3 / págs. 14-16", 15: "→ ver A.3 / pág. 16", 16: "→ ver A.3 / pág. 16",
    17: "→ ver A.3 / pág. 15", 19: "→ ver A.2 / pág. 13", 20: "→ ver A.3 / pág. 15",
    26: "→ ver A.5 / pág. 24", 28: "→ ver A.5 / págs. 22-23", 33: "→ ver A.5 / págs. 22-23",
    36: "→ ver A.2 / pág. 13", 38: "→ ver A.1 / págs. 9-10", 39: "→ ver A.1 / pág. 9",
    40: "→ ver L.40 / pág. 51", 41: "→ ver A.3 / pág. 17", 42: "→ ver A.5 / pág. 22",
}


def cover(book):
    c = book.begin("A", plain=True)
    c.setFillColor(base.PAPER); c.rect(0, 0, base.W, base.H, 0, 1)
    c.setFillColor(base.NAVY); c.rect(0, 0, base.W * .58, base.H, 0, 1)
    c.setFillColor(base.MINT); c.rect(base.W * .58, 0, base.W * .42, base.H, 0, 1)
    c.drawImage(ImageReader(str(base.LOGO)), 18*base.MM, base.H-33*base.MM, 16*base.MM, 16*base.MM, mask="auto")
    c.setFillColor(white); c.setFont("BookBold", 8); c.drawString(38*base.MM, base.H-24*base.MM, "EXPLORARG · MARKETSCAN")
    y = base.H - 70*base.MM
    y = base.draw_text(c, "Reforma de la Ley 27.640", 18*base.MM, y, base.W*.48, "BookBold", 34, 36, white)
    y -= 6*base.MM
    base.draw_text(c, "Análisis y propuesta, página por página", 18*base.MM, y, base.W*.46, "Book", 17, 21, HexColor("#D8F4F0"))
    c.setFillColor(base.NAVY); c.setFont("BookBold", 54)
    c.drawString(base.W*.63, base.H-86*base.MM, "A")
    c.drawString(base.W*.63, base.H-128*base.MM, "L")
    c.setFont("BookBold", 9); c.drawString(base.W*.72, base.H-76*base.MM, "ANÁLISIS")
    c.drawString(base.W*.72, base.H-118*base.MM, "LEGISLACIÓN")
    c.setFillColor(white); c.setFont("Book", 8)
    c.drawString(18*base.MM, 17*base.MM, "EDICIÓN IMPRESA DE CONSULTA · AGOSTO 2026")


def guide(book):
    c = book.begin("A")
    book.title("Sistema de lectura", "Dos cuerpos. Una conversación.", "A explica el problema. L muestra cómo cambia la norma. Cada referencia permite saltar entre ambos.")
    x, cw = base.content_x(book.page), base.content_w(book.page)
    base.callout(c, x, 445, cw*.46, 150, "A · ANÁLISIS", "21 unidades editoriales. Cada una conserva la tesis, la evidencia y la consecuencia regulatoria de un bloque del artículo.", base.AMBER, base.AMBER_PALE)
    base.callout(c, x+cw*.54, 445, cw*.46, 150, "L · LEGISLACIÓN", "21 artículos modificados. Cada página enfrenta problema, texto propuesto, fundamento y evidencia.", base.NAVY, base.SOFT)
    base.arrow(c, x+cw*.47, 520, x+cw*.53, 520, base.MID, 1.5)
    base.callout(c, x, 275, cw, 105, "REFERENCIAS", "A.3 / pág. 15 lleva al argumento sobre compresión de márgenes. L.14 / pág. 36 lleva al mecanismo de subasta. El texto íntegro permanece en las págs. 53-62.", base.MINT_DARK, base.MINT_PALE)
    base.callout(c, x, 145, cw, 86, "IMPRESIÓN", "A4 · 64 páginas · múltiplo de cuatro · pestañas sobre el borde exterior · folios enfrentados.", base.VIOLET, base.VIOLET_PALE)


def index_page(book):
    c = book.begin("A")
    book.title("Índice visual", "El argumento completo", "Una idea por página: primero la estructura del problema, después la arquitectura de la corrección.")
    x, cw = base.content_x(book.page), base.content_w(book.page)
    items = [
        ("A.0", "Estándar", "05", base.VIOLET), ("A.1", "Categorías", "06-11", base.RED),
        ("A.2", "Emisiones", "12-13", base.GREEN), ("A.3", "Márgenes", "14-17", base.VIOLET),
        ("A.4", "Mismo error", "18", base.RED), ("A.5", "Implementación", "19-22", base.AMBER),
        ("A.6", "Alternativa", "23-24", base.MINT_DARK), ("A.7", "Conclusión", "25", base.NAVY),
        ("A.N", "Notas", "26-27", base.AMBER), ("L", "Artículos", "30-50", base.NAVY),
        ("L.40", "Transición", "51", base.MINT_DARK), ("A/L", "Textos completos", "53-62", base.GREEN),
    ]
    y=560
    for i,(code,title,pages,color) in enumerate(items):
        col=i%2; row=i//2; xx=x+col*(cw/2+5); yy=y-row*68
        base.rounded(c,xx,yy-52,cw/2-10,56,base.SOFT,base.LIGHT,7)
        c.setFillColor(color);c.setFont("BookBold",10);c.drawString(xx+10,yy-20,code)
        c.setFillColor(base.INK);c.setFont("BookBold",9);c.drawString(xx+52,yy-20,title)
        c.setFillColor(base.MID);c.setFont("BookBold",8);c.drawRightString(xx+cw/2-20,yy-20,pages)


def analysis_opener(book):
    base.section_open(book, "A", "A", "el análisis, desplegado", "Cada bloque del artículo se convierte en una página: idea central, evidencia, mecanismo y consecuencia.", base.AMBER)


def visual_flow(c, x, y, w, items, color):
    bw = (w - 26) / 3
    for i, (a, b) in enumerate(items):
        xx = x + i*(bw+13)
        base.rounded(c, xx, y, bw, 88, base.SOFT if i==1 else white, color, 8)
        c.setFillColor(color); c.setFont("BookBold", 8); c.drawString(xx+10,y+60,base.clean(a).upper())
        base.draw_text(c,b,xx+10,y+42,bw-20,"BookBold",10,12,base.INK,3)
        if i<2: base.arrow(c,xx+bw+2,y+44,xx+bw+11,y+44,color,1)


def mini_line_chart(c, x, y, w, h):
    rows = [r for r in base.EVID_DATA["precio_biodiesel"] if "2023-11" <= r["fecha"] <= "2025-10" and r.get("formula_963")]
    vals = [v for r in rows for v in (r.get("grande_ni"), r.get("formula_963")) if v]
    lo, hi = min(vals), max(vals)
    pad = (hi-lo)*.08 or 1
    lo -= pad; hi += pad
    def pt(i,v):
        return x + i*w/(len(rows)-1), y + (v-lo)*h/(hi-lo)
    c.setStrokeColor(base.LIGHT);c.setLineWidth(.5)
    for j in range(4):
        yy=y+j*h/3;c.line(x,yy,x+w,yy)
    for key,color in [("grande_ni",base.NAVY),("formula_963",base.RED)]:
        p=c.beginPath()
        for i,r in enumerate(rows):
            xx,yy=pt(i,r[key])
            (p.moveTo if i==0 else p.lineTo)(xx,yy)
        c.setStrokeColor(color);c.setLineWidth(1.4);c.drawPath(p,stroke=1,fill=0)
    c.setFont("BookBold",6.4);c.setFillColor(base.NAVY);c.drawString(x,y+h+9,"PRECIO PUBLICADO")
    c.setFillColor(base.RED);c.drawString(x+100,y+h+9,"FÓRMULA 963/2023")
    c.setFillColor(base.MID);c.setFont("Book",5.8);c.drawString(x,y-10,"nov. 2023");c.drawRightString(x+w,y-10,"oct. 2025")


def analysis_page(book, idx, detail, config):
    code, short, flow, color = config
    c=book.begin("A")
    title=detail["title"]
    book.title(f"{code} · {short}",title,truncate(detail["paras"][0] if detail["paras"] else "",210),color,22)
    x,cw=base.content_x(book.page),base.content_w(book.page)
    visual_flow(c,x,485,cw,flow,color)
    ps=detail["paras"]
    evidence=[]
    for p in ps:
        if re.search(r"\d",p) and p not in evidence:
            evidence.append(p)
    if not evidence: evidence=ps[1:3]
    base.callout(c,x,305,cw*.48,135,"EVIDENCIA",truncate(" ".join(evidence[:2]),520),color,base.SOFT)
    conclusion=ps[-1] if ps else ""
    base.callout(c,x+cw*.52,305,cw*.48,135,"CONSECUENCIA",truncate(conclusion,470),base.NAVY,base.SOFT)
    middle=max(ps[1:-1] or ps,key=len) if ps else ""
    if idx == 6:
        base.rounded(c,x,135,cw,120,white,base.LIGHT,7)
        c.drawImage(ImageReader(str(base.IMG_INTEGRADAS)),x+8,143,cw-16,104,preserveAspectRatio=True,anchor="c",mask="auto")
    elif idx == 7:
        base.rounded(c,x,135,cw,120,white,base.LIGHT,7)
        mini_line_chart(c,x+22,157,cw-44,70)
    elif idx == 9:
        base.rounded(c,x,135,cw,120,white,base.LIGHT,7)
        base.bar_chart(c,x+14,155,cw-28,76,[("Soja",60),("Oleína",81),("Residuos",84)],100,"%",[base.AMBER,base.VIOLET,base.GREEN])
    elif idx == 13:
        base.rounded(c,x,135,cw,120,white,base.LIGHT,7)
        c.drawImage(ImageReader(str(base.IMG_NO_INTEGRADAS)),x+8,143,cw-16,104,preserveAspectRatio=True,anchor="c",mask="auto")
    elif idx == 16:
        base.rounded(c,x,135,cw,120,white,base.LIGHT,7)
        base.bar_chart(c,x+14,155,cw-28,76,[("2023 real",4.6),("2023 obligación",7.5),("2024 real",6.6),("2024 obligación",7.5)],8,"%",[base.RED,base.NAVY,base.AMBER,base.NAVY])
    else:
        base.callout(c,x,145,cw,108,"MECANISMO",truncate(middle,620),base.MINT_DARK,base.MINT_PALE)
    c.setFillColor(color);c.setFont("BookBold",7)
    c.drawRightString(x+cw,125,f"→ texto completo: anexo A · págs. 53-56")


def notes_page(book, documents=False):
    d=DETAILS[22 if documents else 21]
    c=book.begin("A")
    title="Documentos considerados" if documents else "27 notas para verificar cada afirmación"
    book.title("A.N · Trazabilidad",title,"Las fuentes no quedan como pie ornamental: son el nivel final de navegación.",base.AMBER,22)
    x,cw=base.content_x(book.page),base.content_w(book.page)
    items=d["paras"]
    cols=2; gap=12; colw=(cw-gap)/2
    y=[555,555]
    for i,t in enumerate(items[:14 if documents else 18]):
        col=min(range(cols),key=lambda j:y[j])
        xx=x+col*(colw+gap)
        h=58 if documents else 46
        base.rounded(c,xx,y[col]-h,colw,h-6,base.SOFT,base.LIGHT,6)
        c.setFillColor(base.AMBER);c.setFont("BookBold",7);c.drawString(xx+8,y[col]-18,f"{i+1:02d}")
        base.draw_text(c,truncate(t,220),xx+30,y[col]-17,colw-38,"Book",6.9,8.3,base.INK,4)
        y[col]-=h
    c.setFillColor(base.MID);c.setFont("BookItalic",7);c.drawString(x,120,"Listado íntegro y notas completas → anexo A · págs. 53-56")


def legal_opener(book):
    base.section_open(book,"L","L","la propuesta, artículo por artículo","Cada página conserva el problema jurídico, el fragmento modificado, su justificación y la evidencia que motivó el cambio.",base.NAVY)


def correspondence(book):
    c=book.begin("L")
    book.title("L · Correspondencia", "21 correcciones dentro de una sola arquitectura", "Los artículos no son piezas aisladas: varios corrigen el mismo mecanismo desde lugares distintos.")
    x,cw=base.content_x(book.page),base.content_w(book.page)
    groups=[
        ("ATRIBUTO AMBIENTAL","3 · 5 · 6 · 12 · 19 · 28 · 36 · 40",base.GREEN),
        ("COMPETENCIA Y PRECIO","14 · 15 · 16 · 17 · 20 · 26",base.VIOLET),
        ("CUMPLIMIENTO Y SANCIÓN","10 · 12 · 13 · 28 · 33",base.RED),
        ("TRANSICIÓN Y CONCENTRACIÓN","38 · 39 · 40 · 41",base.AMBER),
        ("CONTINUIDAD NORMATIVA","10 · 28 · 33 · 42",base.NAVY),
    ]
    y=535
    for title,arts,color in groups:
        base.callout(c,x,y-72,cw,68,title,arts,color,base.SOFT)
        y-=82


def article_page(book, art):
    c=book.begin("L")
    title=article_title(art)
    book.title(f"L.{art} · ARTÍCULO MODIFICADO",title,ART_REFS.get(art,"→ ver anexo A"),base.NAVY,21)
    x,cw=base.content_x(book.page),base.content_w(book.page)
    norms=popup_paras(art,"normas")
    just=popup_paras(art,"just")
    hechos=popup_paras(art,"hechos")
    inserts=article_inserts(art)
    base.callout(c,x,455,cw*.48,132,"PROBLEMA DEL TEXTO BASE",truncate(" ".join(norms[:2]),560),base.RED,base.RED_PALE)
    base.callout(c,x+cw*.52,455,cw*.48,132,"QUÉ CORRIGE",truncate(" ".join(just[:2]),560),base.MINT_DARK,base.MINT_PALE)
    ins_text=" · ".join(truncate(s,260) for s in inserts[:3]) or "Sin incorporación textual extensa."
    base.callout(c,x,300,cw,118,"TEXTO PROPUESTO · FRAGMENTOS",truncate(ins_text,950),base.NAVY,base.SOFT)
    kpis=article_kpis(art)
    if kpis:
        n=min(3,len(kpis)); gap=10; kw=(cw-gap*(n-1))/n
        for i,(v,l) in enumerate(kpis[:n]):
            base.kpi(c,x+i*(kw+gap),165,kw,92,v,l,base.VIOLET,base.VIOLET_PALE,18 if len(v)>12 else 24)
    else:
        base.callout(c,x,165,cw,92,"EVIDENCIA",truncate(" ".join(hechos[:2]),600),base.VIOLET,base.VIOLET_PALE)
    c.setFillColor(base.NAVY);c.setFont("BookBold",7)
    c.drawRightString(x+cw,142,"→ articulado completo y fundamentos: anexo L · págs. 57-62")


def transition_page(book):
    # Reutiliza la tabla editorial ya verificada, ahora como cierre de L.
    base.page_transition(book)


def synthesis(book):
    c=book.begin("L")
    book.title("A ↔ L", "Del diagnóstico a la regla", "El documento se cierra donde empezó: cada problema debe poder seguirse hasta una consecuencia normativa verificable.")
    x,cw=base.content_x(book.page),base.content_w(book.page)
    rows=[
        ("Diferencia estructural", "Categorías + grupo económico", "L.6 · L.38 · L.39 · L.41"),
        ("Reducción de emisiones", "Certificación + umbrales", "L.3 · L.12 · L.19 · L.36"),
        ("Poder de veto", "Demanda vinculante + precio único", "L.14 · L.15 · L.16"),
        ("Insumo esencial", "Conducta no discriminatoria", "L.17 · L.20 · L.26"),
        ("Incumplimiento", "Registro + tipo + sanción", "L.12 · L.28 · L.33"),
        ("Vacío normativo", "Continuidad hasta operación", "L.10 · L.42"),
    ]
    y=535
    for a,b,refs in rows:
        base.rounded(c,x,y-62,cw,56,base.SOFT,base.LIGHT,7)
        c.setFillColor(base.RED);c.setFont("BookBold",8);c.drawString(x+10,y-24,a.upper())
        base.arrow(c,x+cw*.29,y-28,x+cw*.35,y-28,base.MID,.8)
        c.setFillColor(base.MINT_DARK);c.setFont("BookBold",8);c.drawString(x+cw*.37,y-24,b)
        c.setFillColor(base.NAVY);c.setFont("BookBold",7);c.drawRightString(x+cw-10,y-24,refs)
        y-=68


def sources(book):
    c=book.begin("F")
    book.title("Fuentes", "La navegación termina en documentos", "Textos, cifras y gráficos provienen de las mismas fuentes que alimentan las dos páginas web.")
    x,cw=base.content_x(book.page),base.content_w(book.page)
    items=[
        ("ANÁLISIS","Una desregulación contra el interés público y el mercado libre · Hilarión Del Olmo."),
        ("PROYECTO","S-0809/2026 · versión SE 260729 · revisión HDO 11/08/2026."),
        ("SERIES","Secretaría de Energía · mercado de biodiésel · actualización hasta junio de 2026."),
        ("TRAZABILIDAD","27 notas y 14 documentos considerados en el anexo A."),
        ("CRITERIO","Cuando la web conserva cifras con cortes diferentes, esta edición las mantiene identificadas."),
    ]
    y=535
    for t,b in items:
        base.callout(c,x,y-72,cw,66,t,b,base.GREEN,base.GREEN_PALE);y-=80
    c.setFillColor(base.MID);c.setFont("Book",6.5)
    c.drawString(x,120,"biodiesel-argentina-dashboard.vercel.app/reforma-ley-27640")
    c.drawString(x,108,"biodiesel-argentina-dashboard.vercel.app/propuesta-s0809-2026")


def back(book):
    c=book.begin("F",plain=True)
    c.setFillColor(base.NAVY);c.rect(0,0,base.W,base.H,0,1)
    c.drawImage(ImageReader(str(base.LOGO)),base.W/2-18*base.MM,base.H/2+22*base.MM,36*base.MM,36*base.MM,mask="auto")
    c.setFillColor(white);c.setFont("BookBold",17);c.drawCentredString(base.W/2,base.H/2+4*base.MM,"EXPLORARG")
    c.setFillColor(base.MINT);c.setFont("BookBold",8);c.drawCentredString(base.W/2,base.H/2-6*base.MM,"MARKETSCAN · DATOS PARA DISCUTIR REGLAS")
    base.draw_text(c,"A explica. L corrige. El papel conecta ambos.",48*base.MM,base.H/2-30*base.MM,base.W-96*base.MM,"Book",11,14,white)


def build():
    book=base.Booklet(OUT)
    cover(book)                         # 01
    guide(book)                         # 02
    index_page(book)                    # 03
    analysis_opener(book)               # 04
    for i in range(21):                 # 05-25
        analysis_page(book,i+1,DETAILS[i],ANALYSIS_CONFIG[i])
    notes_page(book,False)              # 26
    notes_page(book,True)               # 27
    legal_opener(book)                  # 28
    correspondence(book)                # 29
    for card in base.ARTICLE_CARDS:      # 30-50
        article_page(book,card["art"])
    transition_page(book)               # 51
    synthesis(book)                     # 52
    a_pages=base.flow_appendix(book,base.reforma_story(),"A","Anexo A · Análisis completo","anexo-a") #53-56
    l_pages=base.flow_appendix(book,base.legal_story(),"L","Anexo L · Proyecto completo","anexo-l")   #57-62
    sources(book)                        # 63
    while (book.page+1)%4:
        c=book.begin("F");c.setFillColor(base.MID);c.setFont("BookItalic",8);c.drawCentredString(base.W/2,base.H/2,"Página reservada para notas")
    back(book)                           # 64
    book.save()
    print({"output":str(OUT),"pages":book.page,"analysis_appendix":a_pages,"legal_appendix":l_pages})


if __name__=="__main__":
    build()
