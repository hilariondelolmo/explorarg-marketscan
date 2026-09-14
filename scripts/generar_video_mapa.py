#!/usr/bin/env python3
"""Video del mapa de elaboradoras (pedido HDO 10/09/2026), 1920×1080 a 30 fps.

  0. Apertura con texto: "¿Pensaste alguna vez en las implicancias de la
     afirmación que CEPREB repite?" y la afirmación misma.
  1. Elaboradoras de biodiesel en Argentina: las 28 plantas en operación.
  2. La Argentina según CEPREB: una sola aceitera en Puerto General San
     Martín; abajo va apareciendo el listado de las 28 plantas de la más
     lejana a la más cercana con los km por ruta hasta el puerto, y en el
     mapa el recorrido de cada una.
  3. La Argentina real: las 54 aceiteras entran una a una sobre las
     elaboradoras.
  4. Zoom planta por planta (Grupo Bojanich, Pampa Bio y Enresa): las
     aceiteras dentro del radio de cada una, molienda y cobertura.
  (El remate final lo dicta HDO; por ahora el video termina en la escena 4.)

Usa los mismos datos y la misma proyección que el mapa del sitio
(src/data/mapa_argentina.json, capacidad.json, plantas_aceite.json,
empresas.json, puertos.json, rutas_puertos.json) y el encuadre de apertura
del mapa interactivo (28° S a 39,4° S). Dibuja cada cuadro con Pillow
(supermuestreo 2×) y lo codifica con el ffmpeg que trae imageio-ffmpeg.

Requiere: pip install pillow imageio-ffmpeg   (o un venv con ambos)

Uso:
    python3 scripts/generar_video_mapa.py               # output/video/mapa_elaboradoras.mp4
    python3 scripts/generar_video_mapa.py --preview     # solo cuadros clave en PNG
    python3 scripts/generar_video_mapa.py --fps 30 --out ruta.mp4
"""

from __future__ import annotations

import json
import math
import os
import time
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
DATA = RAIZ / "src" / "data"
OUT_DIR = RAIZ / "output" / "video"
# Duraciones reales de la locución (las escribe scripts/generar_locucion_elevenlabs.py): la línea de tiempo se
# calcula a partir de ellas más un aire fijo. Si falta un bloque, vale el respaldo escrito en cada constante.
LOCUCION = OUT_DIR / "voz_hdo" / "eleven" / "duraciones.json"
_DUR = json.loads(LOCUCION.read_text()) if LOCUCION.exists() else {}
AIRE = 0.3  # silencio después de cada bloque, medido desde donde termina de hablar (HDO 14/09: lo más corto posible)


def dur_bloque(i, respaldo):
    return round(float(_DUR.get(f"b{i:02d}", respaldo)), 1)
FUENTE_INTER = Path.home() / "Library/Fonts/Inter-Variable.ttf"
FUENTE_INTER_IT = Path.home() / "Library/Fonts/Inter-Italic-Variable.ttf"
ICONO = RAIZ / "public/brand/explorarg-icon.png"

ANCHO, ALTO = 1920, 1080
SS = 2  # supermuestreo
FPS = 30

# Encuadre de apertura del mapa interactivo (decisión HDO): 28° S a 39,4° S, centrado en -62,3
LAT_NORTE, LAT_SUR, LON_CENTRO = -28.0, -39.4, -62.3
# Panel del mapa (px a escala 1) y panel de texto
MAPA = (60, 60, 1000, 1020)      # x0, y0, x1, y1
TEXTO_X0, TEXTO_X1 = 1070, 1860
MAPA_W, MAPA_H = MAPA[2] - MAPA[0], MAPA[3] - MAPA[1]
ASPECTO = MAPA_W / MAPA_H

# Radios del análisis de proveedores (los de la infografía)
RADIO_KM = 100
RADIO_POR_EMPRESA = {"PAMPA BIO S.A.": 120, "ENRESA": 160, "DIASER S.A.": 250}
RENDIMIENTO_ACEITE, DIAS_OPERACION = 0.19, 300

COL = {
    "papel": (255, 255, 255),
    "tierra": (236, 234, 230),
    "vecino": (245, 244, 241),
    "limite": (185, 180, 172),
    "tinta": (26, 26, 26),
    "tinta2": (55, 65, 81),
    "suave": (107, 114, 128),
    "regla": (209, 205, 199),
    "verde": (77, 139, 49),
    "ambar": (180, 83, 9),
    "navy": (30, 58, 138),
}

# ── datos ──
mapa = json.load(open(DATA / "mapa_argentina.json", encoding="utf-8"))
capacidad = json.load(open(DATA / "capacidad.json", encoding="utf-8"))
aceite = json.load(open(DATA / "plantas_aceite.json", encoding="utf-8"))
puertos = json.load(open(DATA / "puertos.json", encoding="utf-8"))
empresas = {e["empresa"]: e for e in json.load(open(DATA / "empresas.json", encoding="utf-8"))["empresas"]}
rutas_puerto = json.load(open(DATA / "rutas_puertos.json", encoding="utf-8"))["rutas"]
rutas_aceite = json.load(open(DATA / "rutas_aceiteras.json", encoding="utf-8"))["rutas"]

ultimo = max(r["fecha"] for r in capacidad["serie"])
condicion = {r["empresa"]: r["condicion"] for r in capacidad["serie"] if r["fecha"] == ultimo}
# Solo las no integradas (pedido HDO 11/09): son las que compran el aceite a las aceiteras
BIO = sorted(
    [p for p in capacidad["plantas"]
     if p["lat"] is not None and condicion.get(p["empresa"]) == "ON"
     and empresas.get(p["empresa"], {}).get("categoria") != "INTEGRADA"],
    key=lambda p: -p["capacidad"],
)


def cumplimiento_12m(nombre):
    """Ventas al corte / cupo de los últimos 12 meses de vida activa (como en la ficha del sitio)."""
    serie = empresas.get(nombre, {}).get("serie") or []
    idx = lambda f: int(f[:4]) * 12 + int(f[5:7])  # noqa: E731
    activos = [r for r in serie if sum((v or 0) for v in r[1:6]) > 0]
    if not activos:
        return None
    hasta = idx(activos[-1][0])
    vc = sum((r[3] or 0) for r in serie if hasta - 12 < idx(r[0]) <= hasta)
    cupo = sum((r[2] or 0) for r in serie if hasta - 12 < idx(r[0]) <= hasta)
    return vc / cupo * 100 if cupo > 0 else None


def cumplimiento_total(nombre):
    """Ventas al corte / cupo acumulados en todo el período con cupo (desde 2010), como pidió HDO."""
    serie = empresas.get(nombre, {}).get("serie") or []
    vc = sum((r[3] or 0) for r in serie)
    cupo = sum((r[2] or 0) for r in serie)
    return vc / cupo * 100 if cupo > 0 else None


for _p in BIO:
    _p["cumplimiento"] = cumplimiento_total(_p["empresa"])
ACEITERAS = sorted(
    [p for p in aceite["plantas"] if p["lat"] is not None],
    key=lambda p: -(p["molienda_tn_dia"] or 0),
)
PGSM = puertos["puertos"][0]
CAP_BIO_MAX = max(p["capacidad"] for p in BIO)
MOL_MAX = max(p["molienda_tn_dia"] or 0 for p in ACEITERAS)

# ── proyección (la del sitio) ──
P = mapa["proyeccion"]
merc = lambda lat: math.log(math.tan(math.pi / 4 + lat * math.pi / 360))  # noqa: E731
MERC_TOP = merc(P["lat_max"])


def proyectar(lng, lat):
    return (lng - P["lon_min"]) * P["kx"], (MERC_TOP - merc(lat)) * P["ky"]


def km_a_unidades(km, lat):
    return km * P["kx"] / (111.32 * math.cos(math.radians(lat)))


def lat_de_y(y):
    """Ordenada del mapa → latitud (Mercator inverso)."""
    return math.degrees(math.atan(math.sinh(MERC_TOP - y / P["ky"])))


def distancia_km(a, b):
    R = 6371
    dlat, dlng = math.radians(b["lat"] - a["lat"]), math.radians(b["lng"] - a["lng"])
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a["lat"])) * math.cos(math.radians(b["lat"])) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


# Encuadre del país: alto por latitudes, ancho por la proporción del panel
_, _vy0 = proyectar(LON_CENTRO, LAT_NORTE)
_cx, _vy1 = proyectar(LON_CENTRO, LAT_SUR)
VB_PAIS = (_cx - (_vy1 - _vy0) * ASPECTO / 2, _vy0, (_vy1 - _vy0) * ASPECTO, _vy1 - _vy0)


def vb_circulo(lat, lng, km, margen=1.3):
    """Encuadre centrado en un punto que hace entrar el círculo de `km` a lo alto."""
    r = km_a_unidades(km, lat)
    h = 2 * r * margen
    w = h * ASPECTO
    cx, cy = proyectar(lng, lat)
    return (cx - w / 2, cy - h / 2, w, h)


def interpolar_vb(a, b, k):
    """Entre dos encuadres: el centro lineal, el tamaño en escala logarítmica (zoom parejo)."""
    k = suavizar_io(k)
    acx, acy, bcx, bcy = a[0] + a[2] / 2, a[1] + a[3] / 2, b[0] + b[2] / 2, b[1] + b[3] / 2
    w = a[2] * (b[2] / a[2]) ** k
    h = a[3] * (b[3] / a[3]) ** k
    cx, cy = acx + (bcx - acx) * k, acy + (bcy - acy) * k
    return (cx - w / 2, cy - h / 2, w, h)


def a_px(lng, lat, vb, ss=SS):
    x, y = proyectar(lng, lat)
    esc = MAPA_W / vb[2]
    return ((MAPA[0] + (x - vb[0]) * esc) * ss, (MAPA[1] + (y - vb[1]) * esc) * ss)


def en_cuadro(p, vb=VB_PAIS):
    x, y = proyectar(p["lng"], p["lat"])
    return vb[0] <= x <= vb[0] + vb[2] and vb[1] <= y <= vb[1] + vb[3]


FUERA = [p for p in ACEITERAS if not en_cuadro(p)]


# ── utilidades ──
def fuente(tam, peso=400, ss=SS, italica=False):
    f = ImageFont.truetype(str(FUENTE_INTER_IT if italica else FUENTE_INTER), int(tam * ss))
    f.set_variation_by_axes([min(32, max(14, tam)), peso])  # ejes: tamaño óptico, peso
    return f


def suavizar(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def suavizar_io(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def pop(t):
    """Aparición con leve rebote (0 → 1,15 → 1)."""
    t = max(0.0, min(1.0, t))
    return 1.15 * math.sin(t * math.pi / 2) if t < 0.6 else 1.15 - 0.15 * suavizar((t - 0.6) / 0.4)


def mezclar(color, alpha):
    """Color sobre papel con opacidad `alpha` (texto que se funde)."""
    return tuple(int(c + (255 - c) * (1 - alpha)) for c in color)


def miles(n):
    return f"{int(round(n)):,}".replace(",", ".")


def razon_corta(n):
    import re
    return re.sub(r" (S\.A\.I\.C\.A?|S\.A\.C\.I\.|S\.A\.?|S A|SA|SAICA|S\.R\.L\.?|SRL|Y CÍA\. S\.R\.L\.)$", "", n, flags=re.I)


def lugar(s):
    minus = {"de", "del", "la", "las", "los", "y", "e"}
    return " ".join(w if (i and w in minus) else w.capitalize() for i, w in enumerate((s or "").lower().split()))


def lugar_corto(e):
    return f"{lugar(e['localidad'])}, {lugar(e['provincia']).replace('Provincia de ', '')}"


def envolver(texto, f, ancho):
    lineas, actual = [], ""
    for palabra in texto.split():
        prueba = f"{actual} {palabra}".strip()
        if f.getlength(prueba) <= ancho or not actual:
            actual = prueba
        else:
            lineas.append(actual)
            actual = palabra
    if actual:
        lineas.append(actual)
    return lineas


def poligonos(path):
    """Path SVG "M x,y L x,y … Z" → lista de polígonos (solo M/L/Z)."""
    salida = []
    for tramo in path.replace("Z", "").split("M"):
        tramo = tramo.strip()
        if not tramo:
            continue
        pts = []
        for par in tramo.split("L"):
            par = par.strip()
            if par:
                x, y = par.split(",")
                pts.append((float(x), float(y)))
        if len(pts) >= 3:
            salida.append(pts)
    return salida


VECINOS_POL = [pol for v in mapa.get("vecinos", []) for pol in poligonos(v["path"])]
PROV_POL = [pol for prov in mapa["provincias"] for pol in poligonos(prov["path"])]
_cache_base = {}


def base_mapa(vb):
    """Papel + mapa dibujado para un encuadre, a escala SS (con caché por encuadre)."""
    clave = tuple(round(v, 3) for v in vb)
    if clave in _cache_base:
        return _cache_base[clave]
    im = Image.new("RGB", (ANCHO * SS, ALTO * SS), COL["papel"])
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = [v * SS for v in MAPA]
    capa = Image.new("RGB", (x1 - x0, y1 - y0), COL["papel"])
    dc = ImageDraw.Draw(capa)
    esc = MAPA_W / vb[2]

    def px(pt):
        return ((pt[0] - vb[0]) * esc * SS, (pt[1] - vb[1]) * esc * SS)

    for pol in VECINOS_POL:
        dc.polygon([px(p) for p in pol], fill=COL["vecino"], outline=COL["limite"], width=1 * SS)
    for pol in PROV_POL:
        dc.polygon([px(p) for p in pol], fill=COL["tierra"], outline=COL["limite"], width=1 * SS)
    im.paste(capa, (x0, y0))
    d.rectangle([x0, y0, x1, y1], outline=COL["regla"], width=1 * SS)
    if len(_cache_base) > 8:
        _cache_base.clear()
    _cache_base[clave] = im
    return im


def circulo(capa, xy, r, color, alpha, borde=None, ancho=0, alpha_borde=None):
    x, y = xy
    d = ImageDraw.Draw(capa)
    d.ellipse([x - r, y - r, x + r, y + r], fill=(*color, int(255 * alpha)),
              outline=(*borde, int(255 * (alpha if alpha_borde is None else alpha_borde))) if borde else None, width=ancho)


def anillo(capa, xy, r, color, alpha, ancho):
    x, y = xy
    ImageDraw.Draw(capa).ellipse([x - r, y - r, x + r, y + r], outline=(*color, int(255 * alpha)), width=ancho)


def r_bio(p, ss=SS):
    return (5 + math.sqrt(p["capacidad"] / CAP_BIO_MAX) * 16) * ss


def r_aceite(p, ss=SS):
    return (4 + math.sqrt((p["molienda_tn_dia"] or 0) / MOL_MAX) * 12) * ss


# ── guion ──
# Tarjeta de presentación (HDO 14/09/2026): sin nombre ni cargo. Explorarg propone discutir el fondo y no la
# autoridad: la pantalla lleva el método en tres líneas; la voz (bloque 0 del mezclador) lleva el diagnóstico.
PRESENTACION = dict(
    linea="NUEVA SECCIÓN EN EXPLORARG.COM",
    titulo="Lo que no entra en cinco minutos",   # HDO 14/09
    bajada=["Tomamos afirmaciones formuladas en el debate legislativo sobre biocombustibles, y en particular sobre el biodiesel.",
            "Las contrastamos con los datos.",
            "Vemos cuáles resisten la evidencia."],
    entrega="Primera entrega · La Argentina según CEPREB",
)
# Tiempos ajustados a la locución de Fernando (ElevenLabs, turbo v2.5; bloques en output/video/voz_hdo/eleven), 13/09/2026
PRESENTACION_FIN = 0.6 + dur_bloque(0, 40.3) + AIRE   # el bloque 0 arranca a los 0,6 s
INTRO_DESFASE = PRESENTACION_FIN - 0.6
# (las frases van al ritmo de la locución del guion: docs/…Guion de audio…)
# Cuadro 2 (HDO 14/09/2026): en pantalla los hechos (comunicados, kilómetro cero, "afirmada, nunca demostrada");
# la voz (bloque 1 del mezclador) saca la consecuencia y abre el mapa. Tiempos al ritmo de la locución de Fernando.
INTRO = [
    dict(t=0.8 + INTRO_DESFASE, texto="Desde el inicio del debate por la reforma de la ley, CEPREB sostuvo que las plantas más "
         "alejadas del Puerto de Rosario cargan con un mayor costo logístico: el que resulta de la diferencia de distancia "
         "con las plantas más cercanas a ese puerto.", tam=32, peso=600, color="tinta2"),
    dict(t=4.5 + INTRO_DESFASE, texto="Primero dijo Puerto de Rosario; después, Puerto General San Martín. Es un detalle: podrían haber propuesto "
         "Chicago, para el caso es igual de ridículo.",
         tam=32, peso=600, color="tinta2"),
    dict(t=4.5 + INTRO_DESFASE, texto="Comunicados de CEPREB del 25 de septiembre y del 13 de octubre de 2025.",
         tam=20, peso=500, color="suave"),
    dict(t=9.0 + INTRO_DESFASE, texto="Una desventaja afirmada, nunca demostrada.", tam=36, peso=800, color="ambar"),
    dict(t=12.5 + INTRO_DESFASE, texto="Antes de discutirla, pensemos qué significa. Si fuera cierta, ¿qué deberíamos encontrar?",
         tam=32, peso=600, color="tinta"),
    dict(t=16.5 + INTRO_DESFASE, texto="¿Qué Argentina configura esta afirmación?", tam=38, peso=800, color="tinta"),
]
INTRO_FIN = 1.0 + dur_bloque(1, 35.1) + AIRE + INTRO_DESFASE   # el bloque 1 arranca a los 1,0 s del desfase
T1 = INTRO_FIN + 0.6
T2 = T1 + 0.2 + dur_bloque(2, 37.1) + AIRE
T2B = T2 + 0.2 + dur_bloque(3, 34.8) + AIRE          # cuadro por distancia vs. cuadro por cumplimiento
T3 = T2B + 0.3 + dur_bloque(4, 33.0) + AIRE
T4 = T3 + 0.2 + dur_bloque(5, 31.3) + AIRE
ESCENAS = [
    dict(t0=T1, titulo="Elaboradoras no integradas de biodiesel",
         sub=f"Las {len(BIO)} plantas no integradas en operación: las que compran el aceite. El tamaño de cada punto es proporcional a su capacidad instalada.",
         leyenda=[("verde", f"Elaboradoras no integradas · {len(BIO)}")]),
    dict(t0=T2, titulo="La Argentina según CEPREB",
         sub="Una sola aceitera, en Puerto General San Martín: todo el aceite saldría de ahí y todas las plantas comprarían en el mismo lugar.",
         leyenda=[("verde", f"Elaboradoras no integradas · {len(BIO)}"), ("ambar", "Aceitera según CEPREB · 1")]),
    dict(t0=T2B, titulo="Si la distancia mandara, el cumplimiento seguiría el mismo orden",
         sub=f"A la izquierda, las {len(BIO)} plantas por distancia por ruta a Puerto General San Martín. A la derecha, por cumplimiento del cupo acumulado desde 2010. Cada línea une la misma planta en los dos cuadros.",
         leyenda=[]),
    dict(t0=T3, titulo="La Argentina real",
         sub="54 aceiteras repartidas por el país, cada una con su molienda. El aceite está donde está el grano, no en un solo puerto.",
         leyenda=[("verde", f"Elaboradoras no integradas · {len(BIO)}"), ("ambar", "Aceiteras · 54")]),
    dict(t0=T4, titulo="Las aceiteras alrededor de cada planta",
         sub="Un zoom sobre las plantas del Grupo Bojanich y sobre las dos de La Pampa: cuántas aceiteras tienen a menos de 100 km (120 y 160 km en La Pampa).",
         leyenda=[("verde", "Elaboradora señalada"), ("ambar", "Aceiteras dentro del radio"), ("anillo", "Otras aceiteras")]),
    dict(t0=None, titulo="Cuánto aceite tiene cada planta a su alrededor",
         sub="Para cada elaboradora no integrada: las aceiteras dentro de su radio, la molienda diaria, el aceite anual y cuántas veces ese aceite cubre su capacidad de biodiesel.",
         leyenda=[("verde", f"Elaboradoras no integradas · {len(BIO)}"), ("ambar", "Aceiteras · 54")]),
]
FUNDIDO = 0.6

# Escena 4: aceiteras y molienda por provincia (para el cuadro de la Argentina real)
_PROV = {"CORDOBA": "Córdoba", "ENTRE RIOS": "Entre Ríos", "SANTIAGO DEL ESTERO": "Santiago del Estero"}
def _por_provincia():
    acc = {}
    for a in ACEITERAS:
        prov = (a.get("provincia") or "").upper()
        c, m = acc.get(prov, (0, 0.0))
        acc[prov] = (c + 1, m + (a.get("molienda_tn_dia") or 0))
    return sorted([(_PROV.get(k, k.title()), c, m) for k, (c, m) in acc.items()], key=lambda x: -x[2])
ACEITE_PROV = _por_provincia()

# Cruce distancia / cumplimiento: las que están lejos y cumplen, y las que están cerca y no
LEJOS_CUMPLEN = {"PAMPA BIO S.A.", "ENRESA", "DIASER S.A."}
CERCA_NO = {"CREMER Y ASOCIADOS S.A.", "LATINBIO S.A.", "DIFEROIL S.A."}
CRUCE_LINEAS, CRUCE_DESTACA, CRUCE_NOTA = 3.0, 8.0, 12.5  # segundos desde T2B

# Escena 2: listado de la más lejana a la más cercana (km por ruta hasta PGSM)
LISTA_PGSM = sorted(
    [dict(p, km=rutas_puerto[f"{p['empresa']}|{PGSM['id']}"]["km"], ruta=rutas_puerto[f"{p['empresa']}|{PGSM['id']}"]["ruta"])
     for p in BIO if f"{p['empresa']}|{PGSM['id']}" in rutas_puerto],
    key=lambda p: -p["km"],
)
LISTA_T0, LISTA_PASO = T2 + 2.6, 0.28

# Escena 4: paradas del zoom. Las plantas de una misma localidad van juntas.
PARADAS_ORDEN = [("GRUPO BOJANICH", None), ("PAMPA BIO S.A.", None), ("ENRESA", None)]


def armar_paradas():
    paradas = []
    por_lugar = {}
    for p in BIO:
        e = empresas.get(p["empresa"], {})
        if e.get("grupo") == "GRUPO BOJANICH":
            por_lugar.setdefault(e["localidad"], []).append(p)
    for plantas in sorted(por_lugar.values(), key=lambda l: -sum(p["capacidad"] for p in l)):
        paradas.append(("Grupo Bojanich", plantas))
    for nombre in ("PAMPA BIO S.A.", "ENRESA"):
        p = next(x for x in BIO if x["empresa"] == nombre)
        paradas.append(("Empresa independiente", [p]))
    salida = []
    for grupo, plantas in paradas:
        lat = sum(p["lat"] for p in plantas) / len(plantas)
        lng = sum(p["lng"] for p in plantas) / len(plantas)
        km = RADIO_POR_EMPRESA.get(plantas[0]["empresa"], RADIO_KM)
        centro = {"lat": lat, "lng": lng}
        dentro = [a for a in ACEITERAS if distancia_km(centro, a) <= km]
        def km_ruta(a):
            kms = [rutas_aceite[f"{p['empresa']}|{a['id']}"]["km"] for p in plantas if f"{p['empresa']}|{a['id']}" in rutas_aceite]
            return min(kms) if kms else None
        lista = sorted([dict(a, km_ruta=km_ruta(a), recta=distancia_km(centro, a)) for a in dentro],
                       key=lambda a: a["km_ruta"] if a["km_ruta"] is not None else a["recta"])
        molienda = sum(a["molienda_tn_dia"] or 0 for a in dentro)
        cap = sum(p["capacidad"] for p in plantas)
        salida.append(dict(
            grupo=grupo, plantas=plantas, lat=lat, lng=lng, km=km, dentro={a["id"] for a in dentro}, lista=lista,
            n=len(dentro), molienda=molienda, aceite=molienda * RENDIMIENTO_ACEITE * DIAS_OPERACION, cap=cap,
            cobertura=(molienda * RENDIMIENTO_ACEITE * DIAS_OPERACION / cap) if cap else 0,
            lugar=lugar_corto(empresas[plantas[0]["empresa"]]),
            vb=vb_circulo(lat, lng, km),
        ))
    return salida


PARADAS = armar_paradas()
PARADA_T0, PARADA_TRANS = T4 + 0.3, 1.6
# Cada parada dura lo que dura su locución (bloques 6 a 11) más el aire; mínimo 8 s para el zoom
PARADA_DURS = [round(max(8.0, 0.3 + dur_bloque(6 + k, 10.5) + AIRE), 1) for k in range(len(PARADAS))]
PARADA_INICIOS = [round(PARADA_T0 + sum(PARADA_DURS[:k]), 1) for k in range(len(PARADAS))]
T5 = PARADA_T0 + sum(PARADA_DURS)  # resumen final: el mapa vuelve al país
ESCENAS[5]["t0"] = T5
RESUMEN_T0 = T5 + 1.8
DURACION = T5 + 1.5 + dur_bloque(12, 19.4) + 2.5   # el bloque 12 arranca a los 1,5 s; 2,5 s de cierre


# ── resumen final: cada planta con su radio, aceiteras, molienda, aceite y cobertura ──
def fila_resumen(p):
    km = RADIO_POR_EMPRESA.get(p["empresa"], RADIO_KM)
    dentro = [a for a in ACEITERAS if distancia_km(p, a) <= km]
    molienda = sum(a["molienda_tn_dia"] or 0 for a in dentro)
    aceite = molienda * RENDIMIENTO_ACEITE * DIAS_OPERACION
    return dict(nombre=razon_corta(p["empresa"]), km=km, n=len(dentro), ids={a["id"] for a in dentro},
                molienda=molienda, aceite=aceite, cap=p["capacidad"], cobertura=aceite / p["capacidad"] if p["capacidad"] else 0)


def armar_resumen():
    grupos, sueltas = {}, []
    for p in BIO:
        e = empresas.get(p["empresa"], {})
        g = e.get("supergrupo") or e.get("grupo")
        if g and g != p["empresa"] and g.startswith("GRUPO"):
            grupos.setdefault(g, []).append(fila_resumen(p))
        else:
            sueltas.append(fila_resumen(p))
    secciones = []
    for nombre, filas in grupos.items():
        ids = set().union(*(f["ids"] for f in filas))
        molienda = sum(a["molienda_tn_dia"] or 0 for a in ACEITERAS if a["id"] in ids)
        cap = sum(f["cap"] for f in filas)
        secciones.append(dict(nombre=lugar(nombre), filas=filas, n=len(ids), molienda=molienda,
                              aceite=molienda * RENDIMIENTO_ACEITE * DIAS_OPERACION, cap=cap,
                              cobertura=molienda * RENDIMIENTO_ACEITE * DIAS_OPERACION / cap if cap else 0))
    secciones.sort(key=lambda x: -x["cap"])
    if sueltas:
        ids = set().union(*(f["ids"] for f in sueltas))
        molienda = sum(a["molienda_tn_dia"] or 0 for a in ACEITERAS if a["id"] in ids)
        cap = sum(f["cap"] for f in sueltas)
        secciones.append(dict(nombre="Empresas independientes", filas=sueltas, n=len(ids), molienda=molienda,
                              aceite=molienda * RENDIMIENTO_ACEITE * DIAS_OPERACION, cap=cap,
                              cobertura=molienda * RENDIMIENTO_ACEITE * DIAS_OPERACION / cap if cap else 0))
    return secciones


RESUMEN = armar_resumen()


def escena_en(t):
    """Índice de escena activa y avance del fundido con la anterior (0..1)."""
    if t < ESCENAS[0]["t0"]:
        return -1, 0.0
    idx = max(i for i, e in enumerate(ESCENAS) if t >= e["t0"])
    return idx, suavizar((t - ESCENAS[idx]["t0"]) / FUNDIDO)


def parada_en(t):
    """Parada activa del zoom (índice, avance de la transición 0..1) o (None, 0)."""
    if t < PARADA_T0 or t >= T5:
        return None, 0.0
    i = max(k for k, t0 in enumerate(PARADA_INICIOS) if t >= t0)
    return i, suavizar_io((t - PARADA_INICIOS[i]) / PARADA_TRANS)


def encuadre_en(t):
    if t >= T5:  # vuelta al país para el resumen
        return interpolar_vb(PARADAS[-1]["vb"], VB_PAIS, (t - T5) / PARADA_TRANS)
    i, k = parada_en(t)
    if i is None:
        return VB_PAIS
    origen = VB_PAIS if i == 0 else PARADAS[i - 1]["vb"]
    return interpolar_vb(origen, PARADAS[i]["vb"], k)


MAX_FILAS_PARADA = 16


def panel_parada(d, t, alpha, x0, x1, parada, i_par):
    """Panel de la escena 4: título corto, leyenda en línea y la parada activa con
    sus cifras y el listado de aceiteras del radio (como en la infografía)."""
    ancho = x1 - x0
    e = ESCENAS[4]
    d.text((x0, 140 * SS), "Aceiteras alrededor de cada planta", font=fuente(44, 800), fill=mezclar(COL["tinta"], alpha))
    x = x0
    for color, texto in e["leyenda"]:
        if color == "anillo":
            d.ellipse([x, 212 * SS, x + 16 * SS, 228 * SS], outline=mezclar(COL["ambar"], alpha), width=int(2.5 * SS))
        else:
            d.ellipse([x, 212 * SS, x + 16 * SS, 228 * SS], fill=mezclar(COL[color], alpha))
        f = fuente(18, 500)
        d.text((x + 24 * SS, 208 * SS), texto, font=f, fill=mezclar(COL["tinta2"], alpha))
        x += 24 * SS + f.getlength(texto) + 30 * SS
    if parada is None:
        return
    t_par = t - PARADA_INICIOS[i_par]
    vis = suavizar((t_par - 0.5) / 0.5) * alpha
    if t_par > PARADA_DURS[i_par] - 0.35:
        vis *= 1 - suavizar((t_par - (PARADA_DURS[i_par] - 0.35)) / 0.3)
    if vis <= 0:
        return
    y = 258 * SS
    f_nom = fuente(28, 800)
    for linea in envolver(" · ".join(razon_corta(p["empresa"]) for p in parada["plantas"]), f_nom, ancho):
        d.text((x0, y), linea, font=f_nom, fill=mezclar(COL["tinta"], vis))
        y += 36 * SS
    y += 2 * SS
    grupo = f"Grupo económico: {parada['grupo']}" if parada["grupo"].startswith("Grupo") else parada["grupo"]
    d.text((x0, y), grupo, font=fuente(19, 600), fill=mezclar(COL["tinta2"], vis))
    y += 27 * SS
    d.text((x0, y), parada["lugar"], font=fuente(19, 500), fill=mezclar(COL["suave"], vis))
    y += 36 * SS
    cifras = [
        (str(parada["n"]), f"aceiteras a menos de {parada['km']} km"),
        (f"{miles(parada['molienda'])} t/día", "de molienda de grano en ese radio"),
        (f"{miles(parada['aceite'])} t/año", "de aceite (19% de rendimiento × 300 días)"),
        (f"{parada['cobertura']:.1f}".replace(".", ",") + " veces", f"su capacidad de biodiesel ({miles(parada['cap'])} t/año)"),
    ]
    col_w = ancho / 2
    for n, (grande, chico) in enumerate(cifras):
        cx0 = x0 + (n % 2) * col_w
        cy = y + (n // 2) * 70 * SS
        d.text((cx0, cy), grande, font=fuente(32, 800), fill=mezclar(COL["verde"], vis))
        d.text((cx0, cy + 40 * SS), chico, font=fuente(15, 500), fill=mezclar(COL["tinta2"], vis))
    y += 2 * 70 * SS + 8 * SS
    f_cab = fuente(13, 700)
    d.text((x0, y), "ACEITERA · LOCALIDAD", font=f_cab, fill=mezclar(COL["suave"], vis))
    d.text((x1, y), "KM POR RUTA · MOLIENDA T/DÍA", font=f_cab, fill=mezclar(COL["suave"], vis), anchor="ra")
    y += 22 * SS
    d.line([(x0, y), (x1, y)], fill=mezclar(COL["tinta"], vis), width=1 * SS)
    y += 4 * SS
    lista = parada["lista"]
    max_filas = max(4, min(MAX_FILAS_PARADA, int((912 * SS - y) / (23 * SS))))
    visibles = lista if len(lista) <= max_filas else lista[:max_filas - 1]
    f_fila, f_val, f_gris = fuente(17, 500), fuente(17, 700), fuente(15, 500)
    for n, a in enumerate(visibles):
        vis_f = vis * suavizar((t_par - 0.9 - n * 0.06) / 0.35)
        if vis_f <= 0:
            continue
        cy = y + n * 23 * SS
        nombre = razon_corta(a["establecimiento"])
        nombre = nombre if len(nombre) <= 30 else nombre[:29] + "…"
        d.text((x0, cy), nombre, font=f_fila, fill=mezclar(COL["tinta2"], vis_f))
        d.text((x0 + f_fila.getlength(nombre) + 8 * SS, cy + 2 * SS), f"· {a['localidad']}", font=f_gris, fill=mezclar(COL["suave"], vis_f))
        d.text((x1, cy), f"{miles(a['molienda_tn_dia'] or 0)}", font=f_val, fill=mezclar(COL["tinta"], vis_f), anchor="ra")
        km = f"{miles(a['km_ruta'])} km" if a["km_ruta"] is not None else f"{miles(a['recta'])} km*"
        d.text((x1 - 90 * SS, cy + 2 * SS), km, font=f_gris, fill=mezclar(COL["suave"], vis_f), anchor="ra")
        d.line([(x0, cy + 21 * SS), (x1, cy + 21 * SS)], fill=mezclar(COL["regla"], vis_f), width=1)
    if len(lista) > max_filas:
        resto = lista[max_filas - 1:]
        cy = y + len(visibles) * 23 * SS
        vis_f = vis * suavizar((t_par - 0.9 - len(visibles) * 0.06) / 0.35)
        if vis_f > 0:
            d.text((x0, cy), f"y {len(resto)} aceiteras más en el radio", font=fuente(17, 500, italica=True), fill=mezclar(COL["suave"], vis_f))
            d.text((x1, cy), miles(sum(a["molienda_tn_dia"] or 0 for a in resto)), font=f_val, fill=mezclar(COL["tinta"], vis_f), anchor="ra")


def panel_cruce(d, t, alpha, x0, x1):
    """Cuadro I (por distancia) y cuadro II (por cumplimiento), unidos planta a planta."""
    ancho = x1 - x0
    e = ESCENAS[2]
    y = 140 * SS
    f_tit = fuente(36, 800)
    for linea in envolver(e["titulo"], f_tit, ancho):
        d.text((x0, y), linea, font=f_tit, fill=mezclar(COL["tinta"], alpha))
        y += 44 * SS
    y += 4 * SS
    f_sub = fuente(19, 450)
    for linea in envolver(e["sub"], f_sub, ancho):
        d.text((x0, y), linea, font=f_sub, fill=mezclar(COL["tinta2"], alpha))
        y += 26 * SS
    y += 18 * SS
    t_c = t - T2B
    filas = [(p["empresa"], p["km"], p["cumplimiento"]) for p in LISTA_PGSM]
    por_dist = sorted(filas, key=lambda f: f[1])
    por_cumpl = sorted(filas, key=lambda f: -(f[2] or 0))
    izq_w, der_w = 300 * SS, 290 * SS
    xi0, xi1 = x0, x0 + izq_w              # cuadro I
    xd0, xd1 = x1 - der_w, x1              # cuadro II
    alto = 23 * SS
    f_cab, f_fila, f_val = fuente(12, 700), fuente(15, 500), fuente(15, 700)
    d.text((xi0, y), "CUADRO I · POR DISTANCIA AL PUERTO", font=f_cab, fill=mezclar(COL["suave"], alpha))
    d.text((xd1, y), "CUADRO II · POR CUMPLIMIENTO DEL CUPO", font=f_cab, fill=mezclar(COL["suave"], alpha), anchor="ra")
    y += 20 * SS
    d.line([(xi0, y), (xi1, y)], fill=mezclar(COL["tinta"], alpha), width=1 * SS)
    d.line([(xd0, y), (xd1, y)], fill=mezclar(COL["tinta"], alpha), width=1 * SS)
    y += 3 * SS
    resaltar = suavizar((t_c - CRUCE_DESTACA) / 0.8)
    fila_y = {}

    def color_de(emp, base, vis):
        if resaltar > 0 and emp in LEJOS_CUMPLEN:
            return mezclar(COL["verde"], vis)
        if resaltar > 0 and emp in CERCA_NO:
            return mezclar(COL["ambar"], vis)
        return mezclar(base, vis * (1 - 0.45 * resaltar))

    for n, (emp, km, cumpl) in enumerate(por_dist):
        vis = suavizar((t_c - 0.3 - n * 0.06) / 0.4) * alpha
        cy = y + n * alto
        fila_y.setdefault(emp, {})["izq"] = cy
        if vis <= 0:
            continue
        fuerte = resaltar > 0 and emp in LEJOS_CUMPLEN | CERCA_NO
        nombre = razon_corta(emp).replace("ESTABLECIMIENTO ", "EST. ")
        d.text((xi0, cy + 3 * SS), f"{n + 1:2d}", font=f_fila, fill=mezclar(COL["suave"], vis))
        d.text((xi0 + 26 * SS, cy + 3 * SS), nombre, font=f_val if fuerte else f_fila, fill=color_de(emp, COL["tinta2"], vis))
        d.text((xi1 - 4 * SS, cy + 3 * SS), f"{miles(km)} km", font=f_val, fill=color_de(emp, COL["tinta"], vis), anchor="ra")
        d.line([(xi0, cy + alto - 1), (xi1, cy + alto - 1)], fill=mezclar(COL["regla"], vis), width=1)
    for n, (emp, km, cumpl) in enumerate(por_cumpl):
        vis = suavizar((t_c - 0.3 - n * 0.06) / 0.4) * alpha
        cy = y + n * alto
        fila_y.setdefault(emp, {})["der"] = cy
        if vis <= 0:
            continue
        fuerte = resaltar > 0 and emp in LEJOS_CUMPLEN | CERCA_NO
        nombre = razon_corta(emp).replace("ESTABLECIMIENTO ", "EST. ")
        d.text((xd0 + 4 * SS, cy + 3 * SS), f"{cumpl:.0f} %" if cumpl is not None else "-", font=f_val, fill=color_de(emp, COL["tinta"], vis))
        d.text((xd1, cy + 3 * SS), f"{nombre}  {n + 1:2d}", font=f_val if fuerte else f_fila, fill=color_de(emp, COL["tinta2"], vis), anchor="ra")
        d.line([(xd0, cy + alto - 1), (xd1, cy + alto - 1)], fill=mezclar(COL["regla"], vis), width=1)
    # líneas que unen la misma planta en los dos cuadros (las destacadas, encima)
    vis_l = suavizar((t_c - CRUCE_LINEAS) / 1.5) * alpha
    if vis_l > 0:
        orden = sorted(fila_y.items(), key=lambda kv: kv[0] in LEJOS_CUMPLEN | CERCA_NO)
        for emp, ys in orden:
            if "izq" not in ys or "der" not in ys:
                continue
            fuerte = resaltar > 0 and emp in LEJOS_CUMPLEN | CERCA_NO
            col = COL["verde"] if emp in LEJOS_CUMPLEN else COL["ambar"] if emp in CERCA_NO else COL["suave"]
            a = vis_l * (1.0 if fuerte else 0.55 - 0.35 * resaltar)
            y1, y2 = ys["izq"] + alto / 2, ys["der"] + alto / 2
            xa, xb = xi1 + 8 * SS, xd0 - 8 * SS
            pts = [(xa + (xb - xa) * k / 24, y1 + (y2 - y1) * suavizar_io(k / 24)) for k in range(25)]
            d.line(pts, fill=mezclar(col if fuerte else COL["suave"], a), width=int((3 if fuerte else 1.5) * SS), joint="curve")
    # nota final
    vis_n = suavizar((t_c - CRUCE_NOTA) / 0.6) * alpha
    if vis_n > 0:
        ny = y + len(por_dist) * alto + 10 * SS
        lejos = [p for p in LISTA_PGSM if p["empresa"] in LEJOS_CUMPLEN]
        cerca = [p for p in LISTA_PGSM if p["empresa"] in CERCA_NO]
        nota1 = "Lejos y cumplen: " + " · ".join(f"{razon_corta(p['empresa'])} {miles(p['km'])} km, {p['cumplimiento']:.0f} %" for p in sorted(lejos, key=lambda p: -p["km"]))
        nota2 = "Cerca y no: " + " · ".join(f"{razon_corta(p['empresa'])} {miles(p['km'])} km, {p['cumplimiento']:.0f} %" for p in sorted(cerca, key=lambda p: p["km"]))
        f_n = fuente(16, 600)
        for linea in envolver(nota1, f_n, ancho):
            d.text((x0, ny), linea, font=f_n, fill=mezclar(COL["verde"], vis_n)); ny += 22 * SS
        for linea in envolver(nota2, f_n, ancho):
            d.text((x0, ny), linea, font=f_n, fill=mezclar(COL["ambar"], vis_n)); ny += 22 * SS


def panel_resumen(d, t, alpha, x0, x1):
    """Panel de la escena 5: el cuadro resumen de las no integradas por grupo."""
    ancho = x1 - x0
    e = ESCENAS[5]
    y = 140 * SS
    f_tit = fuente(40, 800)
    for linea in envolver(e["titulo"], f_tit, ancho):
        d.text((x0, y), linea, font=f_tit, fill=mezclar(COL["tinta"], alpha))
        y += 48 * SS
    y += 4 * SS
    f_sub = fuente(20, 450)
    for linea in envolver(e["sub"], f_sub, ancho):
        d.text((x0, y), linea, font=f_sub, fill=mezclar(COL["tinta2"], alpha))
        y += 28 * SS
    y += 16 * SS
    # columnas (borde derecho de cada una, en px)
    cols = [("RADIO KM", 330), ("ACEITERAS", 420), ("MOLIENDA T/DÍA", 560), ("ACEITE T/AÑO", 690), ("COBERTURA", 790)]
    f_cab = fuente(12, 700)
    d.text((x0, y), "ELABORADORA · GRUPO ECONÓMICO", font=f_cab, fill=mezclar(COL["suave"], alpha))
    for texto, xr in cols:
        d.text((x0 + xr * SS, y), texto, font=f_cab, fill=mezclar(COL["suave"], alpha), anchor="ra")
    y += 20 * SS
    d.line([(x0, y), (x1, y)], fill=mezclar(COL["tinta"], alpha), width=1 * SS)
    y += 3 * SS
    f_fila, f_val, f_grp = fuente(16, 500), fuente(16, 700), fuente(16, 800)
    alto = 22 * SS
    n = 0
    for sec in RESUMEN:
        vis = suavizar((t - RESUMEN_T0 - n * 0.1) / 0.4) * alpha
        if vis > 0:
            d.rectangle([x0, y, x1, y + alto - 2 * SS], fill=mezclar((243, 241, 236), vis))
            d.text((x0 + 4 * SS, y + 2 * SS), f"{sec['nombre']} · {len(sec['filas'])} plantas", font=f_grp, fill=mezclar(COL["tinta"], vis))
            for (texto, xr), val in zip(cols, ["", f"{sec['n']} dist.", miles(sec["molienda"]), miles(sec["aceite"]), f"{sec['cobertura']:.1f}".replace(".", ",") + "×"]):
                d.text((x0 + xr * SS, y + 2 * SS), val, font=f_grp, fill=mezclar(COL["verde"] if texto == "COBERTURA" else COL["tinta"], vis), anchor="ra")
        y += alto
        n += 1
        for f in sec["filas"]:
            vis = suavizar((t - RESUMEN_T0 - n * 0.1) / 0.4) * alpha
            if vis > 0:
                d.text((x0 + 14 * SS, y + 2 * SS), f["nombre"].replace("ESTABLECIMIENTO ", "EST. "), font=f_fila, fill=mezclar(COL["tinta2"], vis))
                vals = [str(f["km"]), str(f["n"]), miles(f["molienda"]), miles(f["aceite"]), f"{f['cobertura']:.1f}".replace(".", ",") + "×"]
                for (texto, xr), val in zip(cols, vals):
                    d.text((x0 + xr * SS, y + 2 * SS), val, font=f_val if texto == "COBERTURA" else f_fila,
                           fill=mezclar(COL["verde"] if texto == "COBERTURA" else COL["tinta2"], vis), anchor="ra")
                d.line([(x0, y + alto - 2 * SS), (x1, y + alto - 2 * SS)], fill=mezclar(COL["regla"], vis), width=1)
            y += alto
            n += 1


def cuadro(t, icono):
    idx, avance = escena_en(t)
    vb = encuadre_en(t)
    im = base_mapa(vb).copy()
    capa = Image.new("RGBA", im.size, (0, 0, 0, 0))
    i_par, k_par = parada_en(t)
    parada = PARADAS[i_par] if i_par is not None else None
    en_zoom = parada is not None

    # ── escena 2: recorridos hasta PGSM, uno por fila del listado ──
    if idx in (1, 2) or (idx == 3 and t < T3 + 1.0):
        apag = 1.0 if idx < 3 else 1 - suavizar((t - T3) / 1.0)
        d = ImageDraw.Draw(capa)
        resaltar = suavizar((t - T2B - CRUCE_DESTACA) / 0.8) if idx == 2 else 0.0
        for n, p in enumerate(LISTA_PGSM):
            vis = suavizar((t - LISTA_T0 - n * LISTA_PASO) / 0.5) * apag
            if vis <= 0:
                continue
            pts = [a_px(lng, lat, vb) for lng, lat in p["ruta"]]
            if resaltar > 0 and p["empresa"] in LEJOS_CUMPLEN | CERCA_NO:
                col = COL["verde"] if p["empresa"] in LEJOS_CUMPLEN else COL["ambar"]
                d.line(pts, fill=(*col, int(255 * 0.9 * vis * resaltar)), width=int(4 * SS), joint="curve")
            else:
                d.line(pts, fill=(*COL["tinta2"], int(255 * (0.45 - 0.25 * resaltar) * vis)), width=int(2 * SS), joint="curve")
    # ── escena 1 en adelante: elaboradoras de biodiesel (capa de base) ──
    if idx >= 0:
        t1 = T1 + 0.6
        for i, p in enumerate(BIO):
            k = pop((t - t1 - i * 0.1) / 0.5)
            if k <= 0:
                continue
            if en_zoom and any(q["empresa"] == p["empresa"] for q in parada["plantas"]):
                continue  # las de la parada se dibujan al final, encima de las aceiteras
            circulo(capa, a_px(p["lng"], p["lat"], vb), r_bio(p) * k, COL["verde"], 0.85 * min(1, k), (255, 255, 255), 1 * SS)
    # ── escena 4: círculo de alcance de la parada ──
    if en_zoom:
        crece = suavizar((t - PARADA_INICIOS[i_par] - PARADA_TRANS + 0.3) / 0.6)
        if crece > 0:
            xy = a_px(parada["lng"], parada["lat"], vb)
            r = km_a_unidades(parada["km"], parada["lat"]) * (MAPA_W / vb[2]) * SS * crece
            circulo(capa, xy, r, COL["verde"], 0.07, COL["verde"], int(2 * SS), 0.75)
    # ── escena "real" en adelante: aceiteras como anillos ámbar, de mayor a menor molienda ──
    if idx >= 3:
        t3 = T3 + 0.8
        for i, p in enumerate(ACEITERAS):
            k = pop((t - t3 - i * 0.085) / 0.5)
            if k <= 0 or not en_cuadro(p, vb):
                continue
            adentro = en_zoom and p["id"] in parada["dentro"]
            if adentro:
                circulo(capa, a_px(p["lng"], p["lat"], vb), r_aceite(p) * 1.1, COL["ambar"], 0.9, (255, 255, 255), int(2 * SS), 1.0)
            else:
                circulo(capa, a_px(p["lng"], p["lat"], vb), r_aceite(p) * k, COL["ambar"], 0.18 * min(1, k), COL["ambar"], int(2.5 * SS), 0.92 * min(1, k))
    # ── escena 4: las plantas de la parada, encima de todo ──
    if en_zoom:
        for p in parada["plantas"]:
            circulo(capa, a_px(p["lng"], p["lat"], vb), r_bio(p) * 1.3, COL["verde"], 0.95, (255, 255, 255), int(2.5 * SS))
    # ── escena 2: la aceitera única de CEPREB en PGSM, encima de todo ──
    if idx >= 1 and not en_zoom:
        t2 = T2 + 0.8
        k = pop((t - t2) / 0.6)
        vis = 1.0 if idx < 3 else 1 - suavizar((t - T3) / 0.8)
        if k > 0 and vis > 0:
            xy = a_px(PGSM["lng"], PGSM["lat"], vb)
            for n in range(2):  # ondas
                fase = ((t - t2 - 0.4 - n * 0.6) % 1.4) / 1.4 if t > t2 + 0.4 else -1
                if 0 <= fase < 1:
                    anillo(capa, xy, (30 + fase * 70) * SS, COL["ambar"], 0.55 * (1 - fase) * vis, 2 * SS)
            circulo(capa, xy, 26 * SS * k, COL["ambar"], 0.96 * vis, (255, 255, 255), 3 * SS)
    # la capa de puntos y rutas se recorta al panel del mapa
    mx0, my0, mx1, my1 = [v * SS for v in MAPA]
    region = Image.alpha_composite(im.crop((mx0, my0, mx1, my1)).convert("RGBA"), capa.crop((mx0, my0, mx1, my1)))
    im.paste(region.convert("RGB"), (mx0, my0))

    # durante la apertura el mapa espera, atenuado; se enciende con la primera escena
    k_mapa = 0.3 + 0.7 * suavizar((t - INTRO_FIN) / 0.8)
    if k_mapa < 1:
        x0, y0, x1, y1 = [v * SS for v in MAPA]
        region = im.crop((x0, y0, x1, y1))
        im.paste(Image.blend(Image.new("RGB", region.size, COL["papel"]), region, k_mapa), (x0, y0))

    d = ImageDraw.Draw(im)
    # rótulo de PGSM
    if idx >= 1 and not en_zoom:
        vis = suavizar((t - T2 - 1.3) / 0.5) * (1.0 if idx < 3 else 1 - suavizar((t - T3) / 0.8))
        if vis > 0:
            x, y = a_px(PGSM["lng"], PGSM["lat"], vb)
            d.text((x + 34 * SS, y - 12 * SS), "Puerto General San Martín", font=fuente(20, 700), fill=mezclar(COL["ambar"], vis),
                   stroke_width=3 * SS, stroke_fill=(255, 255, 255))
    # radio marcado desde el centro del círculo hasta el borde, con su medida (pedido HDO)
    if en_zoom and k_par > 0.9:
        vis = suavizar((k_par - 0.9) / 0.1)
        cx, cy = a_px(parada["lng"], parada["lat"], vb)
        r = km_a_unidades(parada["km"], parada["lat"]) * (MAPA_W / vb[2]) * SS
        ang = math.radians(38)  # hacia abajo a la derecha, lejos del rótulo de la empresa
        ex, ey = cx + r * math.cos(ang), cy + r * math.sin(ang)
        col = mezclar(COL["verde"], vis)
        d.line([(cx, cy), (ex, ey)], fill=col, width=int(2.5 * SS))
        d.line([(ex - 8 * SS * math.sin(ang), ey + 8 * SS * math.cos(ang)), (ex + 8 * SS * math.sin(ang), ey - 8 * SS * math.cos(ang))],
               fill=col, width=int(2.5 * SS))
        mx, my = cx + r * 0.55 * math.cos(ang), cy + r * 0.55 * math.sin(ang)
        d.text((mx + 14 * SS, my - 16 * SS), f"{parada['km']} km", font=fuente(21, 800), fill=col,
               stroke_width=3 * SS, stroke_fill=(255, 255, 255), anchor="ls")
        # nombre de la empresa junto al punto (dos renglones si son varias plantas)
        nombres = [razon_corta(p["empresa"]) for p in parada["plantas"]]
        lineas = [" · ".join(nombres[i:i + 2]) for i in range(0, len(nombres), 2)]  # de a dos nombres por renglón
        for i, linea in enumerate(lineas):
            d.text((cx + 30 * SS, cy - 14 * SS - (len(lineas) - 1) * 13 * SS + i * 26 * SS), linea, font=fuente(22, 800),
                   fill=col, stroke_width=3 * SS, stroke_fill=(255, 255, 255))
    # nota de las aceiteras fuera del cuadro (solo con el país completo)
    if idx == 3 and FUERA:
        vis = suavizar((t - T3 - 5.2) / 0.6)
        if vis > 0:
            nota = "Fuera del cuadro: " + " · ".join(f"{p['localidad']} ({p['provincia'].title()})" for p in FUERA)
            d.text(((MAPA[0] + 16) * SS, (MAPA[3] - 34) * SS), nota, font=fuente(17, 500), fill=mezclar(COL["suave"], vis))

    # ── panel de texto ──
    x0, x1 = TEXTO_X0 * SS, TEXTO_X1 * SS
    ancho = x1 - x0
    d.text((x0, 76 * SS), "INFOGRAFÍA · MERCADO DE BIODIESEL EN ARGENTINA", font=fuente(17, 700), fill=COL["verde"])
    if idx < 0 and t < PRESENTACION_FIN + 0.6:
        # tarjeta de presentación: explorarg anuncia la sección nueva (sin nombre ni cargo)
        apag = 1 - suavizar((t - PRESENTACION_FIN) / 0.5)
        vis = suavizar((t - 0.6) / 0.7) * apag
        y = 150 * SS
        if vis > 0:
            d.text((x0, y), PRESENTACION["linea"], font=fuente(18, 700), fill=mezclar(COL["verde"], vis))
            f_tit = fuente(46, 800)
            lin_t = envolver(PRESENTACION["titulo"], f_tit, ancho)
            for i, linea in enumerate(lin_t):
                d.text((x0, y + (40 + i * 56) * SS), linea, font=f_tit, fill=mezclar(COL["tinta"], vis))
            y += (40 + len(lin_t) * 56 + 22) * SS
        vis_b = suavizar((t - (0.6 + dur_bloque(0, 40.3) * 0.58)) / 0.7) * apag   # cuando la voz llega a "Para enfrentar este problema"
        if vis_b > 0:
            f_baj = fuente(24, 450)
            for parrafo in PRESENTACION["bajada"]:
                lin_b = envolver(parrafo, f_baj, ancho)
                for i, linea in enumerate(lin_b):
                    d.text((x0, y + i * 33 * SS), linea, font=f_baj, fill=mezclar(COL["tinta2"], vis_b))
                y += (len(lin_b) * 33 + 12) * SS
            y += 22 * SS
        vis_e = suavizar((t - (0.6 + dur_bloque(0, 40.3) * 0.96)) / 0.7) * apag   # cuando dice "La primera proviene de CEPREB"
        if vis_e > 0:
            f_ent = fuente(24, 700)
            for i, linea in enumerate(envolver(PRESENTACION["entrega"], f_ent, ancho)):
                d.text((x0, y + i * 33 * SS), linea, font=f_ent, fill=mezclar(COL["ambar"], vis_e))
    if idx < 0:
        apagado = 1 - suavizar((t - INTRO_FIN) / 0.6)
        y = 190 * SS
        for fr in INTRO:
            vis = suavizar((t - fr["t"]) / 0.7) * apagado
            f = fuente(fr["tam"], fr["peso"], italica=fr.get("italica", False))
            lineas = envolver(fr["texto"], f, ancho)
            if vis > 0:
                desplaz = int((1 - vis) * 18 * SS)
                for i, linea in enumerate(lineas):
                    d.text((x0, y + desplaz + i * fr["tam"] * 1.25 * SS), linea, font=f, fill=mezclar(COL[fr["color"]], vis))
            y += (len(lineas) * fr["tam"] * 1.25 + 30) * SS
    else:
        for j, alpha in ((idx - 1, 1 - avance), (idx, avance)):
            if j < 0 or alpha <= 0:
                continue
            e = ESCENAS[j]
            d.text((x1, 76 * SS), f"{j + 1} / {len(ESCENAS)}", font=fuente(17, 600), fill=mezclar(COL["suave"], alpha), anchor="ra")
            if j == 2:
                panel_cruce(d, t, alpha, x0, x1)
                continue
            if j == 4:
                panel_parada(d, t, alpha, x0, x1, parada, i_par)
                continue
            if j == 5:
                panel_resumen(d, t, alpha, x0, x1)
                continue
            y = 150 * SS
            f_tit = fuente(58, 800)
            for linea in envolver(e["titulo"], f_tit, ancho):
                d.text((x0, y), linea, font=f_tit, fill=mezclar(COL["tinta"], alpha))
                y += 66 * SS
            y += 14 * SS
            f_sub = fuente(27, 450)
            for linea in envolver(e["sub"], f_sub, ancho):
                d.text((x0, y), linea, font=f_sub, fill=mezclar(COL["tinta2"], alpha))
                y += 38 * SS
            y += 30 * SS
            f_ley = fuente(21, 500)
            for color, texto in e["leyenda"]:
                if color == "anillo":
                    d.ellipse([x0, y + 6 * SS, x0 + 18 * SS, y + 24 * SS], outline=mezclar(COL["ambar"], alpha), width=int(2.5 * SS))
                else:
                    d.ellipse([x0, y + 6 * SS, x0 + 18 * SS, y + 24 * SS], fill=mezclar(COL[color], alpha))
                d.text((x0 + 30 * SS, y), texto, font=f_ley, fill=mezclar(COL["tinta2"], alpha))
                y += 36 * SS
            y += 26 * SS
            # escena 4 (la Argentina real): aceiteras y molienda por provincia (HDO 14/09: la pantalla lleva los hechos)
            if j == 3:
                vis_t = suavizar((t - T3 - 4.0) / 0.6) * alpha
                if vis_t > 0:
                    d.text((x0, y), "ACEITERAS POR PROVINCIA · PLANTAS · MOLIENDA T/DÍA · PARTICIPACIÓN",
                           font=fuente(14, 700), fill=mezclar(COL["suave"], vis_t))
                    yy = y + 34 * SS
                    f_fila, f_val = fuente(21, 500), fuente(21, 700)
                    total = sum(m for _, _, m in ACEITE_PROV)
                    for n, (prov, cant, mol) in enumerate(ACEITE_PROV + [("Total", len(ACEITERAS), total)]):
                        vis = suavizar((t - T3 - 4.4 - n * 0.25) / 0.5) * alpha
                        if vis <= 0:
                            continue
                        es_total = prov == "Total"
                        f_n = f_val if es_total else f_fila
                        if es_total:
                            d.line([(x0, yy - 4 * SS), (x1, yy - 4 * SS)], fill=mezclar(COL["suave"], vis), width=int(1.5 * SS))
                        d.text((x0, yy), prov, font=f_n, fill=mezclar(COL["tinta"] if es_total else COL["tinta2"], vis))
                        d.text((x0 + 430 * SS, yy), str(cant), font=f_n, fill=mezclar(COL["tinta"], vis), anchor="ra")
                        d.text((x0 + 610 * SS, yy), miles(mol), font=f_n, fill=mezclar(COL["tinta"], vis), anchor="ra")
                        d.text((x1, yy), f"{mol / total * 100:.0f} %", font=f_n, fill=mezclar(COL["verde"], vis), anchor="ra")
                        yy += 33 * SS
            # escena 1: listado de las plantas a medida que aparecen (capacidad y cumplimiento)
            if j == 0:
                t1 = T1 + 0.6
                vis_cab = suavizar((t - t1 + 0.3) / 0.5) * alpha
                if vis_cab > 0:
                    d.text((x0, y), "CAPACIDAD INSTALADA (T/AÑO) · CUMPLIMIENTO DEL CUPO DESDE 2010",
                           font=fuente(14, 700), fill=mezclar(COL["suave"], vis_cab))
                y += 34 * SS
                filas = math.ceil(len(BIO) / 2)
                col_w = (ancho - 30 * SS) / 2
                f_fila, f_val, f_gris = fuente(19, 500), fuente(19, 700), fuente(17, 500)
                for n, p in enumerate(BIO):
                    vis = suavizar((t - t1 - n * 0.1) / 0.45) * alpha
                    if vis <= 0:
                        continue
                    cx0 = x0 + (n // filas) * (col_w + 30 * SS)
                    cy = y + (n % filas) * 29 * SS + int((1 - vis) * 10 * SS)
                    nombre = razon_corta(p["empresa"]).replace("ESTABLECIMIENTO ", "EST. ")
                    while f_fila.getlength(nombre) > col_w - 160 * SS and len(nombre) > 6:
                        nombre = nombre[:-2].rstrip() + "…"
                    d.text((cx0, cy), nombre, font=f_fila, fill=mezclar(COL["tinta2"], vis))
                    d.text((cx0 + col_w - 64 * SS, cy), miles(p["capacidad"]), font=f_val, fill=mezclar(COL["tinta"], vis), anchor="ra")
                    cumpl = f"{p['cumplimiento']:.0f} %" if p["cumplimiento"] is not None else "-"
                    d.text((cx0 + col_w, cy + 1 * SS), cumpl, font=f_gris, fill=mezclar(COL["verde"], vis), anchor="ra")
                    d.line([(cx0, cy + 27 * SS), (cx0 + col_w, cy + 27 * SS)], fill=mezclar(COL["regla"], vis), width=1)
            # escena 2: listado de distancias en dos columnas
            if j == 1:
                vis_cab = suavizar((t - LISTA_T0 + 0.5) / 0.5) * alpha
                if vis_cab > 0:
                    d.text((x0, y), "KILÓMETROS POR RUTA HASTA PUERTO GENERAL SAN MARTÍN · DE LA MÁS LEJANA A LA MÁS CERCANA",
                           font=fuente(14, 700), fill=mezclar(COL["suave"], vis_cab))
                y += 34 * SS
                filas = math.ceil(len(LISTA_PGSM) / 2)
                col_w = (ancho - 30 * SS) / 2
                f_fila = fuente(19, 500)
                f_km = fuente(19, 700)
                for n, p in enumerate(LISTA_PGSM):
                    vis = suavizar((t - LISTA_T0 - n * LISTA_PASO) / 0.45) * alpha
                    if vis <= 0:
                        continue
                    cx0 = x0 + (n // filas) * (col_w + 30 * SS)
                    cy = y + (n % filas) * 29 * SS + int((1 - vis) * 10 * SS)
                    d.text((cx0, cy), razon_corta(p["empresa"]), font=f_fila, fill=mezclar(COL["tinta2"], vis))
                    d.text((cx0 + col_w, cy), f"{miles(p['km'])} km", font=f_km, fill=mezclar(COL["tinta"], vis), anchor="ra")
                    d.line([(cx0, cy + 27 * SS), (cx0 + col_w, cy + 27 * SS)], fill=mezclar(COL["regla"], vis), width=1)

    # ── pie ──
    d.line([(x0, 930 * SS), (x1, 930 * SS)], fill=COL["regla"], width=1 * SS)
    f_pie = fuente(15, 500)
    y = 942 * SS
    for linea in envolver("Fuente: Secretaría de Energía de la Nación (plantas en operación y capacidad instalada) · aceiteras: relevamiento oct-2024 · rutas: OSRM sobre OpenStreetMap",
                          f_pie, ancho - 300 * SS):
        d.text((x0, y), linea, font=f_pie, fill=COL["suave"])
        y += 21 * SS
    d.text((x0, y + 6 * SS), "por Hilarión del Olmo - Presidente - Explora S.A.", font=fuente(16, 600), fill=COL["tinta2"])
    ic = icono.resize((42 * SS, 30 * SS), Image.LANCZOS)
    im.paste(ic, (x1 - 236 * SS, 944 * SS), ic)
    d.text((x1, 944 * SS), "EXPLORARG", font=fuente(19, 800), fill=COL["tinta"], anchor="ra")
    d.text((x1, 970 * SS), "Marketscan · explorarg.com", font=fuente(14, 500), fill=COL["suave"], anchor="ra")

    if t < 0.8:  # fundido de entrada
        im = Image.blend(Image.new("RGB", im.size, COL["papel"]), im, suavizar(t / 0.8))
    return im.resize((ANCHO, ALTO), Image.LANCZOS)


_ICONO_PROCESO = None


def _iniciar_proceso():
    """Cada proceso carga el ícono una vez; los datos y las fuentes ya vienen con el módulo."""
    global _ICONO_PROCESO
    _ICONO_PROCESO = Image.open(ICONO).convert("RGBA")


def _render_cuadro(args):
    i, fps = args
    return cuadro(i / fps, _ICONO_PROCESO).tobytes()


def main() -> int:
    args = sys.argv[1:]
    fps = int(args[args.index("--fps") + 1]) if "--fps" in args else FPS
    salida = Path(args[args.index("--out") + 1]) if "--out" in args else OUT_DIR / "mapa_elaboradoras.mp4"
    icono = Image.open(ICONO).convert("RGBA")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"· {len(PARADAS)} paradas del zoom · duración {DURACION:.1f} s")

    if "--preview" in args:
        tiempos = [24.0, 31.5, 37.0] + [t0 + 2.4 for t0 in PARADA_INICIOS]
        if "--t" in args:
            tiempos = [float(x) for x in args[args.index("--t") + 1].split(",")]
        for t in tiempos:
            ruta = OUT_DIR / f"preview_{t:05.1f}s.png"
            cuadro(t, icono).save(ruta)
            print(f"· {ruta.relative_to(RAIZ)}")
        return 0

    import imageio_ffmpeg
    hasta = float(args[args.index("--hasta") + 1]) if "--hasta" in args else DURACION  # render parcial (revisión)
    desde = float(args[args.index("--desde") + 1]) if "--desde" in args else 0.0      # rehacer solo la cola
    n = int(min(DURACION, hasta) * fps)
    i0 = int(round(desde * fps))
    escritor = imageio_ffmpeg.write_frames(
        str(salida), (ANCHO, ALTO), fps=fps, quality=8, codec="libx264",
        pix_fmt_out="yuv420p", macro_block_size=8, output_params=["-movflags", "+faststart"],
    )
    escritor.send(None)
    # Render en paralelo (HDO 14/09): cada cuadro depende solo de su segundo, así que se reparten entre procesos.
    # El orden lo garantiza imap; la imagen es idéntica a la del render en un solo proceso.
    nucleos = int(args[args.index("--nucleos") + 1]) if "--nucleos" in args else max(1, (os.cpu_count() or 2) - 1)
    t_ini = time.time()
    if nucleos > 1:
        from multiprocessing import Pool
        with Pool(nucleos, initializer=_iniciar_proceso) as pool:
            for k, datos in enumerate(pool.imap(_render_cuadro, ((i, fps) for i in range(i0, n)), chunksize=4)):
                escritor.send(datos)
                i = i0 + k
                if i % (fps * 5) == 0:
                    print(f"  {i / fps:5.1f} s / {n / fps:.0f} s", flush=True)
    else:
        for i in range(i0, n):
            escritor.send(cuadro(i / fps, icono).tobytes())
            if i % (fps * 5) == 0:
                print(f"  {i / fps:5.1f} s / {n / fps:.0f} s", flush=True)
    escritor.close()
    print(f"  render: {time.time() - t_ini:.0f} s con {nucleos} proceso(s)")
    print(f"✓ {salida.relative_to(RAIZ) if salida.is_relative_to(RAIZ) else salida} ({salida.stat().st_size // 1024} KB, {n - i0} cuadros desde el {i0})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
