#!/usr/bin/env python3
"""Base de precios FOB oficiales del complejo soja: poroto, harina y aceite, día por día.

    python3 scripts/fob_oficiales_soja.py            baja los días que faltan y arma la planilla
    python3 scripts/fob_oficiales_soja.py --sin-bajar  arma la planilla con lo ya bajado
    python3 scripts/fob_oficiales_soja.py --salida CARPETA   deja la planilla en otra carpeta

De dónde sale: del servicio de precios FOB oficiales de la Secretaría de Agricultura,
Ganadería y Pesca (Subsecretaría de Mercados Agropecuarios), el que la propia Secretaría
publica "para conectar de forma automática":

    https://www.magyp.gob.ar/sitio/areas/ss_mercados_agropecuarios/ws/ssma/precios_fob.php?Fecha=dd/mm/aaaa

Devuelve la circular de ese día (Ley 21.453): una fila por posición arancelaria y por
tramo de embarque, con el precio en dólares por tonelada. Un día sin circular (feriado)
devuelve una lista vacía. La misma información se ve a mano en
https://www.magyp.gob.ar/sitio/areas/ss_mercados_agropecuarios/fob_oficiales/_archivoFob/precios_fob.php

Qué guarda (en ~/Explora_projects/_fuentes/fob_oficiales_soja/, fuera del repositorio):

    crudo/fob_oficiales_crudo.jsonl   una línea por día consultado, con todas las posiciones
                                      de soja (1201), harina y pellets (2304) y aceite de
                                      soja (1507) y todos sus tramos de embarque. Es la base:
                                      no se edita a mano. De acá lee scripts/regenerate_crushing.py.
    <fecha> FOB oficiales soja harina aceite - historia diaria.csv / .xlsx
                                      la planilla para mirar o llevar a Tableau: una fila por
                                      día con la posición más cercana y la del mes siguiente
                                      de cada producto. Nunca pisa una planilla anterior: si
                                      ya hay una con la fecha de hoy, escribe "rev2", "rev3"...

El servicio corta si se le pide muy rápido ("Too Many Requests"): el programa va de a un
día, espera entre pedidos y se frena solo cuando lo cortan. La historia entera desde 2010
tarda cerca de una hora; ponerse al día, segundos. Se puede cortar y volver a correr:
sigue desde donde quedó.
"""
import csv
import datetime as dt
import json
import sys
import time
import urllib.request
from pathlib import Path

SERVICIO = "https://www.magyp.gob.ar/sitio/areas/ss_mercados_agropecuarios/ws/ssma/precios_fob.php?Fecha="
BASE = Path(__file__).resolve().parent.parent.parent / "_fuentes" / "fob_oficiales_soja"
CRUDO = BASE / "crudo" / "fob_oficiales_crudo.jsonl"
DESDE = dt.date(2010, 1, 1)
CAPITULOS = ("1201", "2304", "1507")

# La posición que se toma de cada producto para la planilla (la de granel)
PRODUCTOS = [
    ("poroto", "12019000190C", "Poroto de soja (habas de soja, las demás, a granel)"),
    ("harina", "23040010100B", "Harina y pellets de soja (de extracción)"),
    ("aceite", "15071000100Q", "Aceite de soja en bruto, a granel"),
]


def pedir(dia):
    """Las filas de la circular de un día (lista vacía si no hubo circular), o None si no
    hubo caso después de varios intentos."""
    for intento in range(1, 9):
        try:
            req = urllib.request.Request(SERVICIO + dia.strftime("%d/%m/%Y"), headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=45) as r:
                texto = r.read().decode("utf-8", "replace")
            if texto.lstrip().startswith(("{", "[")):
                j = json.loads(texto)
                return j.get("posts", []) if isinstance(j, dict) else j
            if "Too Many" in texto:  # el servicio pide que se vaya más despacio
                time.sleep(5 + 3 * intento)
                continue
        except Exception:
            pass
        time.sleep(4 * intento)
    return None


def bajar():
    CRUDO.parent.mkdir(parents=True, exist_ok=True)
    hechos = set()
    if CRUDO.exists():
        for ln in CRUDO.open(encoding="utf-8"):
            try:
                hechos.add(json.loads(ln)["dia"])
            except Exception:
                pass
    hoy = dt.date.today()
    # Los últimos cinco días hábiles se vuelven a pedir siempre: la circular del día puede
    # no estar publicada todavía a la hora en que se corre esto.
    faltan, d, recientes = [], hoy, 0
    while d >= DESDE:
        if d.weekday() < 5:
            reciente = recientes < 5
            recientes += 1
            if reciente or d.isoformat() not in hechos:
                faltan.append(d)
        d -= dt.timedelta(days=1)
    if not faltan:
        return
    print(f"Bajando {len(faltan)} días ({faltan[-1]} a {faltan[0]})...")
    espera, racha, nuevos = 0.6, 0, {}
    for n, dia in enumerate(faltan, 1):
        filas = pedir(dia)
        if filas is None:
            print(f"  no se pudo bajar {dia}; queda para la próxima corrida")
            continue
        sel = [[f["posicion"], f["mesDesde"], f["añoDesde"], f["mesHasta"], f["añoHasta"], f["precio"]] for f in filas if f["posicion"][:4] in CAPITULOS]
        nuevos[dia.isoformat()] = {"dia": dia.isoformat(), "n": len(filas), "circular": filas[0]["circular"] if filas else None, "filas": sel}
        racha += 1
        if racha >= 40:
            espera, racha = max(espera * 0.9, 0.35), 0
        if n % 200 == 0:
            print(f"  {n} de {len(faltan)} (voy por {dia})")
            guardar(nuevos)
            nuevos = {}
        time.sleep(espera)
    guardar(nuevos)


def guardar(nuevos):
    """Agrega o reemplaza días en el crudo, que queda ordenado por fecha."""
    if not nuevos:
        return
    dias = {}
    if CRUDO.exists():
        for ln in CRUDO.open(encoding="utf-8"):
            try:
                d = json.loads(ln)
                dias[d["dia"]] = d
            except Exception:
                pass
    dias.update(nuevos)
    tmp = CRUDO.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        for k in sorted(dias):
            f.write(json.dumps(dias[k], ensure_ascii=False) + "\n")
    tmp.replace(CRUDO)


def tramos(filas, posicion, dia):
    """(precio cercano, embarque cercano, precio del mes siguiente) de una posición en un día."""
    mias = sorted((f[1:] for f in filas if f[0] == posicion), key=lambda f: (f[1], f[0]))
    if not mias:
        return None, "", None
    m0 = mias[0]
    embarque = f"{m0[0]:02d}/{m0[1]}" + ("" if (m0[0], m0[1]) == (m0[2], m0[3]) else f" a {m0[2]:02d}/{m0[3]}")
    y, m = (dia.year + 1, 1) if dia.month == 12 else (dia.year, dia.month + 1)
    clave = y * 12 + m
    sig = next((f[4] for f in mias if f[1] * 12 + f[0] <= clave <= f[3] * 12 + f[2]), None)
    return m0[4], embarque, sig


def planilla(carpeta):
    if not CRUDO.exists():
        sys.exit(f"No hay nada bajado todavía ({CRUDO}).")
    cabecera = ["Fecha", "Circular"]
    for clave, pos, nombre in PRODUCTOS:
        corto = {"poroto": "Poroto de soja", "harina": "Harina y pellets de soja", "aceite": "Aceite de soja"}[clave]
        cabecera += [f"{corto} FOB oficial USD/t (posición cercana)", f"{corto} embarque de la posición cercana", f"{corto} FOB oficial USD/t (mes siguiente)"]
    filas, feriados = [], 0
    for ln in CRUDO.open(encoding="utf-8"):
        d = json.loads(ln)
        if not d["filas"]:
            feriados += 1
            continue
        dia = dt.date.fromisoformat(d["dia"])
        fila = [d["dia"], d["circular"]]
        for _, pos, _ in PRODUCTOS:
            fila += list(tramos(d["filas"], pos, dia))
        filas.append(fila)
    filas.sort()
    if not filas:
        sys.exit("El crudo no tiene ningún día con precios.")

    carpeta.mkdir(parents=True, exist_ok=True)
    hoy = dt.date.today().strftime("%Y.%m.%d")
    base = f"{hoy} FOB oficiales soja harina aceite - historia diaria"
    nombre, rev = base, 1
    while (carpeta / f"{nombre}.csv").exists() or (carpeta / f"{nombre}.xlsx").exists():
        rev += 1
        nombre = f"{base} rev{rev}"

    with (carpeta / f"{nombre}.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(cabecera)
        w.writerows(filas)

    try:
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font
        from openpyxl.utils import get_column_letter
    except ImportError:
        print("  (sin openpyxl: queda solo el CSV)")
    else:
        wb = Workbook()
        ws = wb.active
        ws.title = "Por fecha"
        ws.append(cabecera)
        for fila in filas:
            ws.append([dt.date.fromisoformat(fila[0])] + fila[1:])
        for c in range(1, len(cabecera) + 1):
            celda = ws.cell(row=1, column=c)
            celda.font = Font(bold=True)
            celda.alignment = Alignment(wrap_text=True, vertical="top")
            ws.column_dimensions[get_column_letter(c)].width = 14 if c > 1 else 12
        ws.row_dimensions[1].height = 62
        for row in ws.iter_rows(min_row=2, max_col=1):
            row[0].number_format = "dd/mm/yyyy"
        ws.freeze_panes = "B2"
        info = wb.create_sheet("De dónde sale")
        for renglon in [
            ["Qué es", "Precios FOB oficiales del complejo soja (Ley 21.453), en dólares por tonelada, una fila por día con circular."],
            ["Fuente", "Secretaría de Agricultura, Ganadería y Pesca - Subsecretaría de Mercados Agropecuarios."],
            ["Servicio", SERVICIO + "dd/mm/aaaa"],
            ["Consulta a mano", "https://www.magyp.gob.ar/sitio/areas/ss_mercados_agropecuarios/fob_oficiales/_archivoFob/precios_fob.php"],
            ["Poroto", "Posición 1201.90.00.190C - Habas de soja, las demás, a granel con hasta un 15% embolsado."],
            ["Harina", "Posición 2304.00.10.100B - Pellets y harina de soja, de extracción."],
            ["Aceite", "Posición 1507.10.00.100Q - Aceite de soja en bruto, a granel."],
            ["Posición cercana", "El primer tramo de embarque de la circular de ese día (la columna de al lado dice cuál es)."],
            ["Mes siguiente", "El tramo de embarque que cubre el mes siguiente al de la fecha."],
            ["Días sin fila", f"Fines de semana y feriados: no hay circular. En el período hay {feriados} días hábiles sin circular."],
            ["Período", f"{filas[0][0]} a {filas[-1][0]} - {len(filas)} días."],
            ["Cómo se actualiza", "python3 scripts/fob_oficiales_soja.py, en el repositorio explorarg-marketscan. Baja los días que faltan y escribe una planilla nueva."],
            ["Armado", dt.datetime.now().strftime("%d/%m/%Y %H:%M")],
        ]:
            info.append(renglon)
        info.column_dimensions["A"].width = 22
        info.column_dimensions["B"].width = 120
        for row in info.iter_rows(max_col=1):
            row[0].font = Font(bold=True)
        wb.save(carpeta / f"{nombre}.xlsx")

    print(f"Planilla: {carpeta / nombre}.csv y .xlsx - {len(filas)} días, {filas[0][0]} a {filas[-1][0]}")
    u = filas[-1]
    print(f"  último día {u[0]}: poroto {u[2]}, harina {u[5]}, aceite {u[8]}")


def main():
    if "--sin-bajar" not in sys.argv:
        bajar()
    carpeta = BASE
    if "--salida" in sys.argv:
        carpeta = Path(sys.argv[sys.argv.index("--salida") + 1]).expanduser()
    planilla(carpeta)


if __name__ == "__main__":
    main()
