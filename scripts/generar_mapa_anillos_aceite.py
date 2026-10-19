#!/usr/bin/env python3
"""Mapa de anillos de la nota de la Secretaría de Energía (precio del aceite, Rosario = 100) para la pestaña
/relacion-precio-aceite del sitio: la Argentina con los anillos de 50, 100, 200 y 600 km en línea recta desde Rosario,
las 24 plantas no integradas en operación con su nombre y, sobre cada anillo, la tarjeta de la zona con cuántas veces
fue la más cara del mes y cuántas la más barata.

Es la lámina 7 del video "CEPREB no quiere competir, quiere repartir" (mapa_anillos.py, 18/10/2026, aprobada por HDO)
pasada a un solo SVG: las tarjetas, que en la lámina eran HTML, acá se dibujan en el SVG para que todo escale junto.
Reglas de HDO para el mapa (18/10): empresas y no ciudades, ninguna recta cruza otra, tarjetas alineadas a la derecha,
puntos de las guías sobre tierra argentina. Posiciones de pilas y tarjetas copiadas de la lámina: no mover sin revisar
los cruces.

Lee src/data/mapa_argentina.json (proyección y provincias), src/data/capacidad.json (coordenadas de las plantas) y
src/data/precio_aceite_rosario.json (conteos de la tarjeta de cada zona). Escribe src/content/mapa_anillos_aceite.svg
(no editar a mano; la página lo importa con ?raw).

Uso: python3 scripts/generar_mapa_anillos_aceite.py
"""
import json
import math
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
mapa = json.load(open(REPO / "src/data/mapa_argentina.json", encoding="utf-8"))
cap = json.load(open(REPO / "src/data/capacidad.json", encoding="utf-8"))
nota = json.load(open(REPO / "src/data/precio_aceite_rosario.json", encoding="utf-8"))

# Las 24 no integradas en operación de la lámina 7 (lista ni.json del análisis de CEPREB, 18/10/2026)
NI = [
    "EXPLORA S.A.", "UNITEC BIO S.A.", "ESTABLECIMIENTO EL ALBARDON S.A.", "ROSARIO BIOENERGY S.A.", "DIFEROIL S.A.",
    "CREMER Y ASOCIADOS S.A.", "LATINBIO S.A.", "BIOBAL ENERGY S.A.", "BIO RAMALLO S.A.", "COLALAO DEL VALLE S.A.",
    "REFINAR BIO S.A.", "BIOCORBA S.A.", "BIO NOGOYA S.A.", "ERA S.A.", "DOBLE L S.A.", "HÉCTOR A. BOLZAN Y CÍA. S.R.L.",
    "BIOBIN S.A.", "AOM S.A.", "PAMPA BIO S.A.", "ARIPAR S.A.", "ENRESA", "DIASER S.A.", "BIOBAHIA S.A.", "AGRO M Y G S.A.",
]

P = mapa["proyeccion"]
merc = lambda lat: math.log(math.tan(math.pi / 4 + lat * math.pi / 360))
TOP = merc(P["lat_max"])


def pr(lng, lat):
    return (lng - P["lon_min"]) * P["kx"], (TOP - merc(lat)) * P["ky"]


def destino(lat, lng, km, rumbo):
    R = 6371.0
    d = km / R
    b = math.radians(rumbo)
    la1, lo1 = math.radians(lat), math.radians(lng)
    la2 = math.asin(math.sin(la1) * math.cos(d) + math.cos(la1) * math.sin(d) * math.cos(b))
    lo2 = lo1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(la1), math.cos(d) - math.sin(la1) * math.sin(la2))
    return math.degrees(la2), math.degrees(lo2)


ROSARIO = (-32.9468, -60.6393)
pos = {p["empresa"]: (p["lat"], p["lng"]) for p in cap["plantas"]}
pos["AGRO M Y G S.A."] = (-35.6367, -59.7778)  # Saladillo (sin coordenadas en el registro)
faltan = [n for n in NI if n not in pos]
assert not faltan, f"sin coordenadas: {faltan}"

# Zonas de la nota: nombre, radio exterior en km (None = el resto), veces la más cara y la más barata (del resumen del JSON)
ZONA_ID = {"Hasta 50 km": "hasta_50", "De 50 a 100 km": "50_100", "De 101 a 200 km": "101_200", "De 201 a 600 km": "201_600", "Más de 600 km": "mas_600"}
resumen = {r["zona"]: r for r in nota["resumen"]}
ZONAS = [(n, km, resumen[ZONA_ID[n]]["mas_cara"], resumen[ZONA_ID[n]]["mas_barata"])
         for n, km in [("Hasta 50 km", 50), ("De 50 a 100 km", 100), ("De 101 a 200 km", 200), ("De 201 a 600 km", 600), ("Más de 600 km", None)]]
TINTA = {"Hasta 50 km": "#f1cfa9", "De 50 a 100 km": "#f8e4cc", "De 101 a 200 km": "#e4efdc", "De 201 a 600 km": "#cde2bf", "Más de 600 km": "#f8e4cc"}
AMBAR, VERDE = "#b45309", "#4d8b31"

# ── panel y escala (idénticos a la lámina) ──
W, H = 1176, 722
CX_FRAC = 0.37


def anillo_u(km, paso=3):
    return [pr(*destino(*ROSARIO, km, r)[::-1]) for r in range(0, 360, paso)]


a600 = anillo_u(600)
ymin, ymax = min(y for _, y in a600), max(y for _, y in a600)
S = (H - 88) / (ymax - ymin)
cx_u, cy_u = pr(ROSARIO[1], ROSARIO[0])
vb0 = cx_u - CX_FRAC * W / S
vb1 = (ymin + ymax) / 2 - (H / 2 - 22) / S
VB = (vb0, vb1, W / S, H / S)
u = lambda n: n / S  # px del panel → unidades del mapa


def f(x):
    return f"{x:.2f}"


def camino(pts):
    return " ".join(("M" if i == 0 else "L") + f"{x:.2f},{y:.2f}" for i, (x, y) in enumerate(pts)) + "Z"


svg = []
svg.append(f'<rect x="{f(vb0)}" y="{f(vb1)}" width="{f(VB[2])}" height="{f(VB[3])}" fill="#f7f6f2"/>')
svg.append('<defs><clipPath id="rpa-tierra">' + "".join(f'<path d="{p["path"]}"/>' for p in mapa["provincias"]) + "</clipPath></defs>")
svg.append(f'<g fill="#f7f6f2" stroke="#d1cdc7" stroke-width="{f(u(1))}">' + "".join(f'<path d="{v["path"]}"/>' for v in mapa.get("vecinos", [])) + "</g>")
svg.append(f'<g fill="{TINTA["Más de 600 km"]}">' + "".join(f'<path d="{p["path"]}"/>' for p in mapa["provincias"]) + "</g>")
svg.append('<g clip-path="url(#rpa-tierra)">' + "".join(f'<path d="{camino(anillo_u(km))}" fill="{TINTA[n]}"/>' for n, km, *_ in reversed(ZONAS) if km) + "</g>")
svg.append(f'<g fill="none" stroke="#c9c5be" stroke-width="{f(u(1))}">' + "".join(f'<path d="{p["path"]}"/>' for p in mapa["provincias"]) + "</g>")
svg.append(f'<g fill="none" stroke="#1a1a1a" stroke-width="{f(u(1.6))}">' + "".join(f'<path d="{camino(anillo_u(km, 2))}"/>' for n, km, *_ in ZONAS if km) + "</g>")
svg.append("<!--GUIAS-->")
for n in NI:
    lat, lng = pos[n]
    x, y = pr(lng, lat)
    svg.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(u(5))}" fill="#1a1a1a" stroke="#fff" stroke-width="{f(u(1.6))}"/>')
svg.append(f'<circle cx="{f(cx_u)}" cy="{f(cy_u)}" r="{f(u(6.5))}" fill="#dc2626" stroke="#fff" stroke-width="{f(u(2))}"/>')
halo = f'paint-order="stroke" stroke="#fff" stroke-width="{f(u(4))}" stroke-linejoin="round"'


def rotulo(t, x, y, dx, dy, anc, tam=14, peso=600, color="#374151"):
    return f'<text x="{f(x + u(dx))}" y="{f(y + u(dy))}" text-anchor="{anc}" font-size="{f(u(tam))}" font-weight="{peso}" fill="{color}" {halo}>{t}</text>'


def guia(x1, y1, x2, y2):
    return f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="#374151" stroke-width="{f(u(1))}"/>'


dot = lambda emp: pr(pos[emp][1], pos[emp][0])
SUELTAS = [("Bio Nogoyá", "BIO NOGOYA S.A.", -9, 5, "end"), ("Bolzan y Cía", "HÉCTOR A. BOLZAN Y CÍA. S.R.L.", -9, 5, "end"), ("Doble L", "DOBLE L S.A.", 0, -10, "middle"),
           ("ERA", "ERA S.A.", 9, 5, "start"), ("Biobin", "BIOBIN S.A.", 9, 5, "start"), ("AOM", "AOM S.A.", 0, 19, "middle"), ("Agro M y G", "AGRO M Y G S.A.", -9, 5, "end"),
           ("Pampa Bio", "PAMPA BIO S.A.", 9, 5, "start"), ("Aripar", "ARIPAR S.A.", 9, 5, "start"), ("Enresa", "ENRESA", 9, 5, "start"), ("Diaser", "DIASER S.A.", 9, 5, "start"),
           ("Biobahía", "BIOBAHIA S.A.", 9, 5, "start")]
for t, emp, dx, dy, anc in SUELTAS:
    svg.append(rotulo(t, *dot(emp), dx, dy, anc))
# pila 1: las siete de hasta 50 km, arriba a la izquierda, con guía al anillo de 50 km
PILA50 = ["Explora", "Unitec Bio", "El Albardón", "Rosario Bioenergy", "Diferoil", "Cremer", "Latinbio"]
P50 = (vb0 + u(34), vb1 + u(52))
svg.append(rotulo("Hasta 50 km · 7 plantas", *P50, 0, 0, "start", 12, 700, "#6b7280"))
for k, t in enumerate(PILA50):
    svg.append(rotulo(t, *P50, 0, 16 + 16 * k, "start"))
gx, gy = pr(*destino(*ROSARIO, 50, 250)[::-1])
svg.append(guia(P50[0] + u(138), P50[1] + u(66), gx, gy))
# pila 2: las cinco de Ramallo (de 50 a 100 km), al norte de los anillos de 100 y 200 km
PILA100 = ["Biobal Energy", "Bio Ramallo", "Biocorba", "Colalao del Valle", "Refinar Bio"]
P100 = (vb0 + u(650), vb1 + u(372))
svg.append(rotulo("De 50 a 100 km · 5 plantas", *P100, 0, 0, "start", 12, 700, "#6b7280"))
for k, t in enumerate(PILA100):
    svg.append(rotulo(t, *P100, 0, 15 + 15 * k, "start"))
rx, ry = dot("BIO RAMALLO S.A.")
svg.append(guia(rx + u(6), ry, P100[0] - u(4), P100[1] + u(40)))
svg.append(rotulo("Rosario", cx_u, cy_u, 6, 52, "middle", 17, 800, "#1a1a1a"))

# ── tarjetas (en el SVG) y sus guías ──
CARD_W, CARD_H = 338, 104
CARD_X = W - CARD_W - 14
POS = {50: (CARD_X, 16, (25, 100)), 100: (CARD_X, 158, (75, 95)), 200: (CARD_X, 300, (150, 90)), 600: (CARD_X, 442, (-35.63, -58.76)), None: (CARD_X, 584, (-38.6, -60.1))}
guias, tarjetas = [], []
for nombre, km, mascara, masbarata in ZONAS:
    caro = mascara > masbarata
    tx, ty, punto = POS[km]
    ax, ay = tx, ty + CARD_H / 2
    if punto[0] < 0:
        gx, gy = pr(punto[1], punto[0])
    else:
        lat, lng = destino(*ROSARIO, *punto)
        gx, gy = pr(lng, lat)
    guias.append(f'<line x1="{f(gx)}" y1="{f(gy)}" x2="{f(vb0 + u(ax))}" y2="{f(vb1 + u(ay))}" stroke="#1a1a1a" stroke-width="{f(u(1.4))}"/>'
                 f'<circle cx="{f(gx)}" cy="{f(gy)}" r="{f(u(7))}" fill="{TINTA[nombre]}" stroke="#1a1a1a" stroke-width="{f(u(1.6))}"/>')
    x, y, w, h, r = vb0 + u(tx), vb1 + u(ty), u(CARD_W), u(CARD_H), u(8)
    color = AMBAR if caro else VERDE
    tarjetas.append(
        f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="{f(r)}" fill="#fff" stroke="#c9c5be" stroke-width="{f(u(1.5))}"/>'
        f'<path d="M{f(x + r)},{f(y)} A{f(r)},{f(r)} 0 0 0 {f(x)},{f(y + r)} V{f(y + h - r)} A{f(r)},{f(r)} 0 0 0 {f(x + r)},{f(y + h)} H{f(x + u(8))} V{f(y)} Z" fill="{color}"/>'
        f'<text x="{f(x + u(18))}" y="{f(y + u(22))}" font-size="{f(u(15))}" font-weight="700" letter-spacing="{f(u(1.8))}" fill="{color}">{"MÁS CARO" if caro else "MÁS BARATO"}</text>'
        f'<text x="{f(x + u(18))}" y="{f(y + u(57))}" font-size="{f(u(31))}" font-weight="800" letter-spacing="{f(-u(0.6))}" fill="#1a1a1a">{nombre}</text>'
        f'<text x="{f(x + u(18))}" y="{f(y + u(86))}" font-size="{f(u(19))}" fill="#374151">la más cara <tspan font-size="{f(u(24))}" font-weight="800" fill="#1a1a1a">{mascara}</tspan>'
        f' · la más barata <tspan font-size="{f(u(24))}" font-weight="800" fill="#1a1a1a">{masbarata}</tspan></text>'
    )

cuerpo = "".join(svg).replace("<!--GUIAS-->", "".join(guias)) + "".join(tarjetas)
SVG = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{f(VB[0])} {f(VB[1])} {f(VB[2])} {f(VB[3])}" preserveAspectRatio="xMidYMid meet" '
       f'font-family="Inter, system-ui, sans-serif" role="img" aria-label="Mapa de la Argentina con los anillos de 50, 100, 200 y 600 km desde Rosario, '
       f'las 24 plantas no integradas en operación y, por zona, cuántas veces fue la más cara y la más barata del mes">'
       f'<!-- Generado por scripts/generar_mapa_anillos_aceite.py: no editar a mano -->{cuerpo}</svg>\n')
out = REPO / "src/content/mapa_anillos_aceite.svg"
out.write_text(SVG, encoding="utf-8")
print(f"{out.relative_to(REPO)}: {len(SVG) / 1024:.0f} KB, {len(NI)} plantas, zonas {[(n, c, b) for n, _, c, b in ZONAS]}")
