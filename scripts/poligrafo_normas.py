#!/usr/bin/env python3
"""Arma la base de textos legales del Polígrafo: src/data/poligrafo_normas.json.

    python3 scripts/poligrafo_normas.py

Tres conjuntos, cada uno partido en piezas citables:

  MS      Media sanción del Senado del 17/9/2026 (CD-76/26), artículo por artículo.
          Fuente: scripts/poligrafo/fuentes/media_sancion_cd76.txt (el texto con el
          que se hizo la serie «Del dicho al dato»).
  L27640  Ley 27.640, texto original publicado en el Boletín Oficial.
          Fuente: scripts/poligrafo/fuentes/ley27640.txt (bajado de argentina.gob.ar).
  ML      Los hitos de la página Marco Legal del sitio (src/data/timeline.json).
  UE245   Decisión de Ejecución (UE) 2019/245 de la Comisión Europea: el acuerdo de
          compromiso con los exportadores argentinos de biodiésel (11/2/2019).
  UE835   Reglamento de Ejecución (UE) 2025/835: la renovación del derecho
          compensatorio, que mantiene la exención para lo exportado bajo el acuerdo.
          Fuente de los dos: texto oficial en español de la Oficina de Publicaciones
          de la Unión Europea (publications.europa.eu/resource/celex/...), pasado a
          texto en scripts/poligrafo/fuentes/ue_*.txt. De cada uno se cargan los
          artículos y los considerandos que hablan del acuerdo, no el texto entero.

  S809    Proyecto S-0809/2026 tal como ingresó al Senado el 14/5/2026 ("Texto
          Original" del expediente). Fuente: scripts/poligrafo/fuentes/s809_texto_original_senado.txt,
          sacado del PDF oficial del Senado. Sirve para lo que se diga del texto
          original o de qué cambió; lo que alguien dice del proyecto se sigue
          contrastando con la media sanción (HDO, 22/11/2026).
  LB      Capítulo de biocombustibles de la Ley de Bases, según el dictamen de
          mayoría de Diputados (Orden del Día 1/2024, artículos 281 a 289): el
          primer proyecto del Poder Ejecutivo actual sobre biocombustibles (HDO,
          22/11/2026). Fuente: scripts/poligrafo/fuentes/ley_bases_od1_2024_biocombustibles.txt,
          sacado del PDF oficial de la Cámara.
  LBR     La reseña de ese capítulo que publica el sitio en el Mapa de Diputados
          (lista LEY_BASES de src/data/mapa-diputados.js): es el resumen del sitio.

El Polígrafo solo da por buena una cita si figura letra por letra en el `texto`
de la pieza: por eso acá no se corrige ni se resume nada. Lo único que se toca
son las marcas que dejó la extracción del Word ([num2.0], barras de la tabla).
No editar el JSON a mano.
"""
import json
import re
import subprocess
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FUENTES = RAIZ / "scripts" / "poligrafo" / "fuentes"
SALIDA = RAIZ / "src" / "data" / "poligrafo_normas.json"

NORMAS = [
    {
        "id": "MS",
        "nombre": "Media sanción del Senado del 17/9/2026 (CD-76/26)",
        "corto": "Media sanción del Senado (CD-76/26)",
        "que_es": "El proyecto de Marco Regulatorio de Biocombustibles que aprobó el Senado el 17/9/2026 y que está en revisión en Diputados. Todavía no es ley. Deroga la Ley 27.640.",
        "ruta": "/que-se-juega-en-diputados",
        "url": None,
    },
    {
        "id": "L27640",
        "nombre": "Ley 27.640 - Marco Regulatorio de Biocombustibles (vigente)",
        "corto": "Ley 27.640 (vigente)",
        "que_es": "La ley que rige hoy, sancionada el 15/7/2021. Texto original publicado en el Boletín Oficial el 4/8/2021.",
        "ruta": "/marco-legal",
        "url": "https://www.argentina.gob.ar/normativa/nacional/ley-27640-352587/texto",
    },
    {
        "id": "UE245",
        "nombre": "Decisión de Ejecución (UE) 2019/245 de la Comisión Europea, del 11/2/2019 (acuerdo de compromiso con los exportadores argentinos de biodiésel)",
        "corto": "Decisión (UE) 2019/245 - acuerdo con la Unión Europea",
        "que_es": "La decisión por la que la Comisión Europea aceptó los compromisos ofrecidos por ocho productores exportadores argentinos de biodiésel junto con CARBIO, después de imponer derechos compensatorios. Fija las condiciones: un precio mínimo de importación y un nivel anual de volumen.",
        "ruta": "/marco-legal",
        "url": "https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:32019D0245",
    },
    {
        "id": "UE835",
        "nombre": "Reglamento de Ejecución (UE) 2025/835 de la Comisión Europea, del 5/5/2025 (renovación del derecho compensatorio al biodiésel argentino)",
        "corto": "Reglamento (UE) 2025/835",
        "que_es": "El reglamento que, tras la reconsideración por expiración, vuelve a imponer el derecho compensatorio al biodiésel argentino y mantiene exentas las importaciones hechas bajo los compromisos de la Decisión (UE) 2019/245.",
        "ruta": "/marco-legal",
        "url": "https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:32025R0835",
    },
    {
        "id": "S809",
        "nombre": "Proyecto S-809/26, texto original que ingresó al Senado el 14/5/2026",
        "corto": "Proyecto S-809/26, texto original",
        "que_es": "El proyecto de Marco Regulatorio de Biocombustibles tal como ingresó al Senado el 14/5/2026, firmado por la senadora Bullrich y otros siete senadores. Es el punto de partida del debate en el Senado: después lo cambiaron el dictamen de comisiones del 3/9/2026 y el recinto, y el texto final es la media sanción (piezas MS). Sirve solo para saber qué decía el proyecto al principio y qué cambió.",
        "ruta": "/marco-legal",
        "url": "https://www.senado.gob.ar/parlamentario/parlamentaria/496663/downloadPdf",
    },
    {
        "id": "LB",
        "nombre": "Ley de Bases, dictamen de mayoría de Diputados (Orden del Día 1/2024): capítulo de biocombustibles",
        "corto": "Ley de Bases 2024, dictamen de Diputados",
        "que_es": "El capítulo de biocombustibles del proyecto de Ley de Bases del Poder Ejecutivo (expediente 25-PE-2023): Título VI, Sección IV, artículos 281 a 289 del dictamen de mayoría. Diputados lo aprobó en general el 2/2/2024 por 144 a 109. Es el primer proyecto del gobierno actual sobre biocombustibles. Nunca fue ley: el 6/2/2024 el proyecto volvió a comisión y el texto que se sancionó después ya no traía este capítulo. Cada artículo sustituye o deroga artículos de la Ley 27.640.",
        "ruta": "/mapa-diputados",
        "url": "https://www4.hcdn.gob.ar/dependencias/dcomisiones/periodo-141/141-1.pdf",
    },
    {
        "id": "LBR",
        "nombre": "Reseña del sitio sobre el capítulo de biocombustibles de la Ley de Bases (Mapa de Diputados)",
        "corto": "Mapa de Diputados del sitio",
        "que_es": "Lo que el sitio resume del capítulo de biocombustibles que Diputados votó el 2/2/2024 y de qué pasó después. Es el resumen del sitio; el texto de los artículos está en las piezas LB.",
        "ruta": "/mapa-diputados",
        "url": None,
        "resena": True,
    },
    {
        "id": "ML",
        "nombre": "Marco Legal de explorarg.com (línea de tiempo)",
        "corto": "Marco Legal del sitio",
        "que_es": "Los hitos normativos que reseña el sitio, de 2006 a hoy: leyes, decretos, resoluciones, medidas de otros países y proyectos. Es el resumen del sitio, con enlace a cada texto oficial; no es el texto de las normas.",
        "ruta": "/marco-legal",
        "url": None,
        "resena": True,
    },
]


def limpio(s):
    """Espacios duros y repetidos fuera; el resto queda como está."""
    return re.sub(r"[ \t ]+", " ", s).strip()


def primera_oracion(texto, maximo=110):
    m = re.match(r"(.{3,%d}?)\.(?:\s|$)" % maximo, texto)
    return (m.group(1) if m else texto[:maximo]).strip()


# ---------------------------------------------------------------- media sanción

ROMANOS = ["i)", "ii)", "iii)", "iv)", "v)", "vi)"]
MARCA_NUM = re.compile(r"^\[num\d+\.\d+\]")


def media_sancion():
    lineas = (FUENTES / "media_sancion_cd76.txt").read_text(encoding="utf-8").splitlines()
    piezas, actual, titulo_cap, capitulo, n_romano = [], None, "", "", 0
    dentro = False
    for cruda in lineas:
        l = limpio(cruda)
        if l.startswith("TÍTULO I "):
            dentro = True
        if not dentro:
            continue
        if l.startswith("De acuerdo a lo establecido por el artículo 110"):
            break
        if not l or l == "av":  # "av": resto de la extracción, suelto después de la tabla del art. 38
            continue
        if l.startswith("TÍTULO"):
            titulo_cap, capitulo, actual = l, "", None
            continue
        if re.match(r"^Cap[íi]tulo", l, re.I):
            capitulo, actual = l.replace("–", "-"), None
            continue
        m = re.match(r"^ARTÍCULO (\d+)", l)
        if m:
            actual = {"n": int(m.group(1)), "lineas": [l], "donde": " · ".join(x for x in (titulo_cap, capitulo) if x)}
            piezas.append(actual)
            n_romano = 0
            continue
        if actual is None:
            continue
        # marcas de numeración que dejó la extracción del Word
        if l.startswith("[num1.0]"):
            l = limpio(l[8:])  # el texto ya trae su "a)"
            n_romano = 0
        elif l.startswith("[num2.0]"):  # art. 39 a): apartados i a iv
            l = f"{ROMANOS[n_romano]} {limpio(l[8:])}"
            n_romano += 1
        elif l.startswith("[num4.0]"):  # art. 36: el inciso a) (sigue "b) Empresas No Integradas")
            l = f"a) {limpio(l[8:])}"
        elif MARCA_NUM.match(l):  # numeración que no se puede reponer con certeza
            l = "- " + limpio(MARCA_NUM.sub("", l))
        # filas de la tabla del art. 38
        if " | " in l:
            l = " | ".join(limpio(celda.strip().strip("/")) for celda in l.split("|"))
        actual["lineas"].append(l)

    items = []
    for p in piezas:
        texto = "\n".join(p["lineas"])
        cuerpo = re.sub(r"^ARTÍCULO \d+º?\.?-?\s*", "", p["lineas"][0])
        items.append({
            "id": f"MS-{p['n']}",
            "norma": "MS",
            "rotulo": f"Artículo {p['n']}",
            "titulo": primera_oracion(cuerpo),
            "donde": p["donde"],
            "texto": texto,
        })
    return items


# ---------------------------------------------------------------- ley 27.640

def ley_27640():
    lineas = [limpio(l) for l in (FUENTES / "ley27640.txt").read_text(encoding="utf-8").splitlines()]
    piezas, actual, pendiente = [], None, ""
    for l in lineas:
        if l.startswith("REGISTRADA BAJO"):
            break
        m = re.match(r"^Artículo (\d+)", l)
        if m:
            # el renglón suelto que precede a un artículo es su título de sección
            if actual and len(actual["lineas"]) > 1:
                ult = actual["lineas"][-1]
                if len(ult) < 90 and not re.search(r"[.;:,]$", ult) and not re.match(r"^[a-z]\)", ult):
                    pendiente = actual["lineas"].pop()
            actual = {"n": int(m.group(1)), "lineas": [l], "seccion": pendiente}
            pendiente = ""
            piezas.append(actual)
            continue
        if actual is None:
            pendiente = l if l and len(l) < 90 else pendiente
            continue
        if l:
            actual["lineas"].append(l)

    items = []
    for p in piezas:
        cuerpo = re.sub(r"^Artículo \d+º?\.?\s*[-–]\s*", "", p["lineas"][0])
        seccion = "" if p["seccion"].upper().startswith("MARCO REGULATORIO") else p["seccion"]
        items.append({
            "id": f"L27640-{p['n']}",
            "norma": "L27640",
            "rotulo": f"Artículo {p['n']}",
            "titulo": seccion or primera_oracion(cuerpo, 90),
            "donde": "",
            "texto": "\n".join(p["lineas"]),
        })
    return items


# ---------------------------------------------------------------- marco legal del sitio

def marco_legal():
    hitos = json.loads((RAIZ / "src" / "data" / "timeline.json").read_text(encoding="utf-8"))
    items = []
    for i, h in enumerate(hitos, 1):
        if not h.get("desc"):
            continue
        items.append({
            "id": f"ML-{i}",
            "norma": "ML",
            "rotulo": str(h.get("year", "")),
            "titulo": limpio(h["title"]),
            "donde": "",
            "texto": limpio(h["desc"]),
            "url": h.get("url"),
        })
    return items


# ---------------------------------------------------------------- proyecto S-809/26, texto original

def s809_original():
    """Un artículo por pieza (1 a 44). La fuente ya viene con un párrafo por renglón."""
    lineas = [l for l in (FUENTES / "s809_texto_original_senado.txt").read_text(encoding="utf-8").splitlines() if not l.startswith("#")]
    piezas, actual, titulo_cap, capitulo = [], None, "", ""
    for cruda in lineas:
        l = limpio(cruda)
        if not l:
            continue
        if l.startswith("TÍTULO"):
            titulo_cap, capitulo, actual = l, "", None
            continue
        if re.match(r"^(Cap[íi]tulo|Sección)", l):
            capitulo, actual = l.replace("–", "-"), None
            continue
        m = re.match(r"^ARTÍCULO (\d+)", l)
        if m:
            actual = {"n": int(m.group(1)), "lineas": [l], "donde": " · ".join(x for x in (titulo_cap, capitulo) if x)}
            piezas.append(actual)
            continue
        if actual is not None:
            actual["lineas"].append(l)
    items = []
    for p in piezas:
        cuerpo = re.sub(r"^ARTÍCULO \d+º?\.?-?\s*", "", p["lineas"][0])
        items.append({
            "id": f"S809-{p['n']}",
            "norma": "S809",
            "rotulo": f"Artículo {p['n']}",
            "titulo": primera_oracion(cuerpo),
            "donde": p["donde"],
            "texto": "\n".join(p["lineas"]),
        })
    return items


# ---------------------------------------------------------------- ley de bases 2024 (dictamen de Diputados)

def ley_bases():
    """Un artículo del dictamen por pieza (281 a 289); cada uno sustituye o deroga artículos de la Ley 27.640."""
    texto = (FUENTES / "ley_bases_od1_2024_biocombustibles.txt").read_text(encoding="utf-8")
    cuerpo = "\n".join(l for l in texto.splitlines() if not l.startswith("#")).strip()
    items = []
    for bloque in re.split(r"\n\s*\n(?=Art\. \d{3}\. –)", cuerpo):
        m = re.match(r"Art\. (\d{3})\. – (.*)", bloque, flags=re.S)
        assert m, f"bloque sin número de artículo: {bloque[:60]}"
        n, resto = m.group(1), m.group(2).strip()
        que = re.match(r"(Sustitúyese el artículo \d+º?|Deróganse los artículos [^.]*?) de la\s+Ley 27\.640", resto)
        titulo = (que.group(1).replace("Sustitúyese", "Sustituye").replace("Deróganse", "Deroga") + " de la Ley 27.640") if que else ""
        items.append({
            "id": f"LB-{n}",
            "norma": "LB",
            "rotulo": f"Artículo {n}",
            "titulo": titulo,
            "donde": "Título VI, Sección IV",
            "texto": f"Art. {n}. – {resto}",
        })
    return items


def resena_ley_bases():
    """La lista LEY_BASES del Mapa de Diputados, tal como la publica el sitio."""
    salida = subprocess.run(
        ["node", "--input-type=module", "-e",
         "import { LEY_BASES } from './src/data/mapa-diputados.js'; console.log(JSON.stringify(LEY_BASES));"],
        cwd=RAIZ, capture_output=True, text=True, check=True).stdout
    items = []
    for i, t in enumerate(json.loads(salida), 1):
        titulo = t.split(":")[0].strip()
        items.append({"id": f"LBR-{i}", "norma": "LBR", "rotulo": "Mapa de Diputados", "titulo": titulo, "donde": "", "texto": limpio(t)})
    return items


# ---------------------------------------------------------------- unión europea

# Qué se carga de cada texto: los considerandos y artículos que hablan del acuerdo.
UE = [
    {
        "norma": "UE245",
        "archivo": "ue_decision_2019_245.txt",
        "considerandos": [4, 5, 6, 8, 9, 13, 14, 15, 17, 34, 59],
        "articulos": {1: None, 2: None},
    },
    {
        "norma": "UE835",
        "archivo": "ue_reglamento_2025_835.txt",
        "considerandos": [2, 243, 337, 355, 364, 367, 442, 443, 444],
        # del artículo 1 solo el apartado 2 (los tipos del derecho por empresa)
        "articulos": {1: ("2. Los tipos del derecho compensatorio", "3. La aplicación de los tipos"), 2: None, 3: None},
    },
]


def sin_llamadas(l):
    """Saca las llamadas a notas al pie, que en el texto pasado quedan como "( 3 )"."""
    l = re.sub(r"\s*\( \d+ \)", "", l)
    return limpio(re.sub(r"\s+([,.;:])", r"\1", l))


def union_europea():
    items = []
    for doc in UE:
        lineas = [limpio(l) for l in (FUENTES / doc["archivo"]).read_text(encoding="utf-8").splitlines()]
        lineas = [l for l in lineas if l]
        # el cuerpo termina donde empiezan las notas al pie y los anexos
        fin = next(i for i, l in enumerate(lineas) if l.startswith("Hecho en Bruselas"))
        cuerpo = lineas[:fin]

        # título: desde "DECISIÓN/REGLAMENTO DE EJECUCIÓN" hasta antes de "LA COMISIÓN EUROPEA,"
        i0 = next(i for i, l in enumerate(cuerpo) if re.match(r"^(DECISIÓN|REGLAMENTO) DE EJECUCIÓN", l))
        i1 = next(i for i, l in enumerate(cuerpo) if l.startswith("LA COMISIÓN EUROPEA"))
        items.append({
            "id": f"{doc['norma']}-T", "norma": doc["norma"], "rotulo": "Título", "titulo": "",
            "donde": "", "texto": " ".join(cuerpo[i0:i1]),
        })

        inicio_articulos = next(i for i, l in enumerate(cuerpo) if re.match(r"^Artículo 1$", l) and i > i1)
        for n in doc["considerandos"]:
            i = next(k for k, l in enumerate(cuerpo[:inicio_articulos]) if l == f"({n})")
            items.append({
                "id": f"{doc['norma']}-C{n}", "norma": doc["norma"], "rotulo": f"Considerando {n}", "titulo": "",
                "donde": "", "texto": sin_llamadas(cuerpo[i + 1]),
            })

        marcas = [(k, int(l.split()[1])) for k, l in enumerate(cuerpo) if k >= inicio_articulos and re.match(r"^Artículo \d+$", l)]
        for j, (k, n) in enumerate(marcas):
            if n not in doc["articulos"]:
                continue
            hasta = marcas[j + 1][0] if j + 1 < len(marcas) else len(cuerpo)
            texto = [sin_llamadas(l) for l in cuerpo[k + 1:hasta]]
            tramo = doc["articulos"][n]
            rotulo = f"Artículo {n}"
            if tramo:
                a = next(x for x, l in enumerate(texto) if l.startswith(tramo[0]))
                b = next(x for x, l in enumerate(texto) if l.startswith(tramo[1]))
                texto = texto[a:b]
                rotulo = f"Artículo {n}, apartado {tramo[0][0]}"
            items.append({
                "id": f"{doc['norma']}-{n}", "norma": doc["norma"], "rotulo": rotulo, "titulo": "",
                "donde": "", "texto": "\n".join(texto),
            })
    return items


def main():
    items = media_sancion() + ley_27640() + s809_original() + ley_bases() + resena_ley_bases() + union_europea() + marco_legal()
    ids = [x["id"] for x in items]
    assert len(ids) == len(set(ids)), "ids repetidos"
    por_norma = {n["id"]: sum(1 for x in items if x["norma"] == n["id"]) for n in NORMAS}
    assert por_norma["MS"] == 44, f"la media sanción tiene 44 artículos, salieron {por_norma['MS']}"
    assert por_norma["L27640"] == 25, f"la Ley 27.640 tiene 25 artículos, salieron {por_norma['L27640']}"
    assert por_norma["S809"] == 44, f"el proyecto S-809/26 tiene 44 artículos, salieron {por_norma['S809']}"
    assert por_norma["LB"] == 9, f"el capítulo de la Ley de Bases tiene 9 artículos (281 a 289), salieron {por_norma['LB']}"
    assert not any("[num" in x["texto"] for x in items), "quedó una marca de numeración sin limpiar"

    SALIDA.write_text(json.dumps({
        "meta": {
            "generado": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "nota": "Generado por scripts/poligrafo_normas.py - no editar a mano",
        },
        "normas": NORMAS,
        "items": items,
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    total = sum(len(x["texto"]) for x in items)
    assert por_norma["UE245"] == 14 and por_norma["UE835"] == 13, f"piezas de la Unión Europea: {por_norma['UE245']} y {por_norma['UE835']}"
    print(f"{SALIDA.relative_to(RAIZ)}: {len(items)} piezas, {total:,} caracteres de texto")
    for n in NORMAS:
        car = sum(len(x["texto"]) for x in items if x["norma"] == n["id"])
        print(f"  {n['id']:7} {por_norma[n['id']]:3} piezas · {car:>7,} caracteres · {n['corto']}")


if __name__ == "__main__":
    main()
