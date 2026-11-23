#!/usr/bin/env python3
"""
Baja el precio oficial del bioetanol (caña y maíz) del sitio de la Secretaría
de Energía y arma src/data/bioetanol_precios.json.

El bioetanol no está en los hypers de /Volumes/comun: su única fuente es el
"Reporte de precios de bioetanol" de la Secretaría (decisión de HDO del
22/11/2026: consultarlo ahí y sumarlo a la actualización de datos).

    https://glp.se.gob.ar/biocombustible/reporte_precios_bioetanol.php

Uso:
    python3 scripts/regenerate_bioetanol.py [--dry-run] [--archivo reporte.html]

Lo llama regenerate_data.py al final, después del gas oil. No necesita
/Volumes/comun, sí internet. Si la Secretaría no responde prueba con la última
copia de archive.org; si tampoco, deja el JSON como estaba y avisa (no corta la
actualización del resto del sitio). --archivo lee un HTML ya bajado.

Qué toma: la tabla "Precios de Bioetanol desde 14 de mayo 2018", en $/l. Cada
fila es un precio que rige desde una fecha (el día 1 del mes, o la fecha que
diga la fila: "A partir del 28/12/2023", "vigente a partir del 21/8"). Con eso
arma la serie mensual:
  - precio del mes = promedio de los precios vigentes, ponderado por los días
    que rigió cada uno (en los meses con un solo precio, ese precio);
  - un mes sin fila propia sigue con el último precio publicado (el precio rige
    hasta la resolución siguiente) y queda marcado como no publicado;
  - la serie termina en el mes de la última fila: no se proyecta.
No estima nada más. Las tablas anteriores a mayo de 2018 no se cargan.
"""

import calendar
import html
import json
import re
import sys
import urllib.request
from datetime import date, datetime
from pathlib import Path

URL = "https://glp.se.gob.ar/biocombustible/reporte_precios_bioetanol.php"
ARCHIVO_API = "https://archive.org/wayback/available?url=glp.se.gob.ar/biocombustible/reporte_precios_bioetanol.php"
SALIDA = Path(__file__).resolve().parent.parent / "src" / "data" / "bioetanol_precios.json"
TITULO_TABLA = "desde 14 de mayo 2018"
PRIMER_MES = "2018-06"  # primer mes completo de la tabla
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]


class Aviso(Exception):
    """Algo no salió, pero no es motivo para cortar la actualización."""


def _bajar(url, espera=45):
    # cliente genérico: no se manda ningún dato del sitio ni de quien lo corre
    pedido = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept-Encoding": "identity"})
    with urllib.request.urlopen(pedido, timeout=espera) as r:
        return r.read()


def _texto(crudo):
    """El reporte viene en windows-1252; la copia de archive.org, en utf-8."""
    for cod in ("utf-8", "windows-1252"):
        try:
            return crudo.decode(cod)
        except UnicodeDecodeError:
            continue
    return crudo.decode("latin-1")


def leer_reporte():
    """Devuelve (html, de dónde se leyó). Primero la Secretaría; si no, archive.org."""
    errores = []
    for intento in range(2):
        try:
            t = _texto(_bajar(URL))
            if TITULO_TABLA in t:
                return t, "sitio de la Secretaría de Energía"
            errores.append("la Secretaría respondió sin la tabla de precios")
        except Exception as e:  # red caída, 5xx, tiempo de espera
            errores.append(f"la Secretaría no respondió ({e})")
    for intento in range(2):
        try:
            copia = json.loads(_bajar(ARCHIVO_API, 30))["archived_snapshots"].get("closest")
            if copia and copia.get("status") == "200":
                sello = copia["timestamp"]
                t = _texto(_bajar(f"https://web.archive.org/web/{sello}/{URL}", 60))
                if TITULO_TABLA in t:
                    return t, f"copia de archive.org del {sello[6:8]}/{sello[4:6]}/{sello[:4]} (la Secretaría no respondía)"
            errores.append("archive.org no tiene una copia que sirva")
            break
        except Exception as e:
            errores.append(f"archive.org no respondió ({e})")
    raise Aviso("; ".join(errores))


def _celdas(fila):
    return [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", c))).strip()
            for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", fila, flags=re.S)]


def _numero(celda):
    """'1.083,222' -> 1083.222; '118,482 (vigentes desde del 03/11)' -> 118.482."""
    m = re.match(r"\s*(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)", celda)
    return float(m.group(1).replace(".", "").replace(",", ".")) if m else None


def _mes(nombre):
    n = nombre.lower().replace("setiembre", "septiembre")
    return MESES.index(n) + 1 if n in MESES else None


def _desde(periodo):
    """Fecha desde la que rige la fila, según cómo venga escrito el período."""
    p = periodo.strip()
    m = re.fullmatch(r"([A-Za-zñ]+) (\d{4})", p)  # Octubre 2026
    if m and _mes(m.group(1)):
        return date(int(m.group(2)), _mes(m.group(1)), 1)
    m = re.fullmatch(r"(\d{1,2})\s*[-/]\s*(\d{4})", p)  # 02/2024, 11-2022
    if m:
        return date(int(m.group(2)), int(m.group(1)), 1)
    m = re.search(r"(\d{1,2})[-/](\d{1,2})[-/](\d{4})", p)  # A partir del 28/12/2023, 09-05-2022, Desde 14-05-2018 a ...
    if m:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    return None


def _desde_de_la_celda(celda, base):
    """'88,240 (vigente a partir del 21/8)' cambia el día desde el que rige ese precio."""
    m = re.search(r"vigentes? (?:desde(?: del)?|a partir del) (\d{1,2})/(\d{1,2})", celda)
    return date(base.year, int(m.group(2)), int(m.group(1))) if m else base


def parsear(texto):
    """Lista de vigencias por producto: {'cana': [(fecha, precio, rótulo)], 'maiz': [...]}."""
    sin_comentarios = re.sub(r"<!--.*?-->", "", texto, flags=re.S)
    i = sin_comentarios.find(TITULO_TABLA)
    tabla = re.search(r"<table.*?</table>", sin_comentarios[i:], flags=re.S) if i >= 0 else None
    if not tabla:
        raise Aviso("el reporte no trae la tabla de precios desde mayo de 2018")
    vig = {"cana": [], "maiz": []}
    salteadas = []
    for fila in re.findall(r"<tr.*?</tr>", tabla.group(0), flags=re.S):
        c = _celdas(fila)
        if len(c) != 3 or c[0].upper().startswith("PER"):
            if c and not c[0].upper().startswith("PER"):
                salteadas.append(" | ".join(c))
            continue
        base = _desde(c[0])
        precios = (_numero(c[1]), _numero(c[2]))
        if not base or None in precios:
            salteadas.append(" | ".join(c))
            continue
        for clave, celda, precio in (("cana", c[1], precios[0]), ("maiz", c[2], precios[1])):
            vig[clave].append((_desde_de_la_celda(celda, base), precio, c[0]))
    for clave in vig:
        vig[clave].sort()
    return vig, salteadas


def _mes_siguiente(y, m):
    return (y + 1, 1) if m == 12 else (y, m + 1)


def serie_mensual(vig):
    """[[AAAA-MM, caña, maíz, publicado]]: promedio ponderado por días de los precios vigentes."""
    def del_mes(lista, y, m):
        dias = calendar.monthrange(y, m)[1]
        ini, fin = date(y, m, 1), date(y, m, dias)
        previos = [v for v in lista if v[0] <= ini]
        tramos = ([(ini, previos[-1][1])] if previos else []) + [(v[0], v[1]) for v in lista if ini < v[0] <= fin]
        if not tramos:
            return None, False
        total = 0.0
        cubiertos = 0
        for k, (d0, precio) in enumerate(tramos):
            d1 = tramos[k + 1][0] if k + 1 < len(tramos) else date(*_mes_siguiente(y, m), 1)
            n = (d1 - d0).days
            total += precio * n
            cubiertos += n
        publicado = any(ini <= v[0] <= fin for v in lista)
        return round(total / cubiertos, 3), publicado

    ultimo = max(v[-1][0] for v in vig.values())
    y, m = (int(x) for x in PRIMER_MES.split("-"))
    filas = []
    while (y, m) <= (ultimo.year, ultimo.month):
        cana, pub_c = del_mes(vig["cana"], y, m)
        maiz, pub_m = del_mes(vig["maiz"], y, m)
        if cana is not None and maiz is not None:
            filas.append([f"{y}-{m:02d}", cana, maiz, bool(pub_c or pub_m)])
        y, m = _mes_siguiente(y, m)
    return filas


def controlar(filas):
    if len(filas) < 60:
        raise Aviso(f"la serie salió con {len(filas)} meses: el reporte cambió de formato")
    for (f0, c0, m0, _), (f1, c1, m1, _) in zip(filas, filas[1:]):
        for nombre, a, b in (("caña", c0, c1), ("maíz", m0, m1)):
            if not (0.6 <= b / a <= 2.2):
                raise Aviso(f"salto raro en el precio de {nombre} entre {f0} ({a}) y {f1} ({b}): revisar el reporte")


def generar(dry=False, archivo=None):
    """Devuelve True si el JSON quedó al día (o se simuló); False si se dejó como estaba."""
    print("Bioetanol: precio oficial de la Secretaría de Energía…")
    previo = json.loads(SALIDA.read_text(encoding="utf-8")) if SALIDA.exists() else None
    try:
        if archivo:
            texto, origen = _texto(Path(archivo).read_bytes()), f"archivo {Path(archivo).name}"
        else:
            texto, origen = leer_reporte()
        vig, salteadas = parsear(texto)
        filas = serie_mensual(vig)
        controlar(filas)
    except Aviso as e:
        print(f"  ! No se actualizó el bioetanol: {e}.")
        print(f"    {'Queda la serie anterior, hasta ' + previo['ultimo_mes'] if previo else 'Todavía no hay serie cargada'}.")
        return False

    ultimo = filas[-1]
    if previo:
        if previo["ultimo_mes"] > ultimo[0]:
            print(f"  ! Lo leído llega a {ultimo[0]} y la serie cargada llega a {previo['ultimo_mes']}: se deja la cargada ({origen}).")
            return False
        antes = {f[0]: f for f in previo["mensual"]}
        cambios = [f"{f[0]} (caña {antes[f[0]][1]} → {f[1]}, maíz {antes[f[0]][2]} → {f[2]})"
                   for f in filas if f[0] in antes and (abs(antes[f[0]][1] - f[1]) > 0.0005 or abs(antes[f[0]][2] - f[2]) > 0.0005)]
        if cambios:
            print(f"  ! La Secretaría corrigió meses ya publicados: {'; '.join(cambios[:8])}{' …' if len(cambios) > 8 else ''}")
    if salteadas:
        print(f"  · filas del reporte que no se toman ({len(salteadas)}): {'; '.join(salteadas[:3])}")

    sin_fila = [f[0] for f in filas if not f[3]]
    payload = {
        "meta": {
            "generado": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "fuente": "Secretaría de Energía, Reporte de precios de bioetanol",
            "url": URL,
            "leido_de": origen,
            "nota": "Generado por scripts/regenerate_bioetanol.py - no editar a mano. Precio mínimo de adquisición del "
                    "bioetanol para el corte obligatorio, en $/l. Precio del mes = promedio de los precios vigentes "
                    "ponderado por días; un mes sin resolución propia (publicado = false) sigue con el último precio.",
        },
        "unidad": "$/l",
        "desde": filas[0][0],
        "ultimo_mes": ultimo[0],
        "campos": ["fecha", "cana", "maiz", "publicado"],
        "mensual": filas,
    }
    ar = lambda n: f"{n:,.3f}".replace(",", "#").replace(".", ",").replace("#", ".")
    resumen = (f"{len(filas)} meses, {filas[0][0]} a {ultimo[0]} · último: caña $ {ar(ultimo[1])} y maíz $ {ar(ultimo[2])} por litro"
               f" · {len(sin_fila)} meses sin resolución propia · leído de: {origen}")
    if dry:
        print(f"  [dry-run] bioetanol_precios.json: {resumen}")
        return True
    # una línea por mes, como los demás JSON chicos de src/data: el diff muestra qué mes cambió
    cuerpo = json.dumps({k: v for k, v in payload.items() if k != "mensual"}, ensure_ascii=False, indent=1)[:-2]
    lineas = ",\n".join("  " + json.dumps(f, ensure_ascii=False) for f in filas)
    SALIDA.write_text(f'{cuerpo},\n "mensual": [\n{lineas}\n ]\n}}\n', encoding="utf-8")
    print(f"  ✓ src/data/bioetanol_precios.json ({resumen})")
    return True


if __name__ == "__main__":
    ruta = sys.argv[sys.argv.index("--archivo") + 1] if "--archivo" in sys.argv else None
    generar(dry="--dry-run" in sys.argv, archivo=ruta)
    print("Bioetanol: terminado.")
