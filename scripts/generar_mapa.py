#!/usr/bin/env python3
"""
Genera src/data/mapa_argentina.json: contornos de provincias como paths SVG,
disueltos desde el topojson de departamentos del pipeline Tableau.

Se corre una sola vez (o si cambia el topojson). Proyección Web Mercator (la
misma de las teselas satelitales, así el fondo satelital encaja debajo de las
provincias); los parámetros quedan en el JSON para proyectar las plantas en
React con la misma fórmula:  x = (lon - lon_min) * kx ;
y = (merc(lat_max) - merc(lat)) * ky  con  merc(lat) = ln(tan(pi/4 + lat/2)).

Uso:  python3 scripts/generar_mapa.py
"""

import json
import math
import sys
from pathlib import Path

try:
    from shapely.geometry import Polygon, MultiPolygon
    from shapely.ops import unary_union
except ImportError:
    sys.exit("Falta shapely:  pip3 install shapely")

SRC = Path("/Volumes/comun/01. TABLEAU/EXP MKTS DATABASES/Revision Actual/"
           "Geojson Maps/departamentos-argentina.topojson")
# Países limítrofes: Natural Earth 1:50m (dominio público). Se descarga una
# vez a la caché local; el JSON de salida guarda solo los contornos recortados.
NE_URL = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
          "geojson/ne_50m_admin_0_countries.geojson")
NE_CACHE = Path.home() / ".cache" / "explorarg" / "ne_50m_admin_0_countries.geojson"
VECINOS = ["Chile", "Bolivia", "Paraguay", "Brazil", "Uruguay", "Peru"]
RECORTE = (-80.0, -58.0, -45.0, -15.0)  # lon_min, lat_min, lon_max, lat_max
OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "mapa_argentina.json"

ANCHO = 520  # px del viewBox; el alto sale de la relación de aspecto
SIMPLIFICAR = 0.03  # grados; ~3 km, suficiente para un mapa de 500 px


def decodificar_arcos(topo):
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcos = []
    for arc in topo["arcs"]:
        pts, x, y = [], 0, 0
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcos.append(pts)
    return arcos


def anillo(indices, arcos):
    pts = []
    for i in indices:
        seg = arcos[i] if i >= 0 else arcos[~i][::-1]
        pts.extend(seg if not pts else seg[1:])
    return pts


def geometria(geom, arcos):
    if geom["type"] == "Polygon":
        anillos = [anillo(r, arcos) for r in geom["arcs"]]
        return Polygon(anillos[0], anillos[1:])
    if geom["type"] == "MultiPolygon":
        polys = []
        for p in geom["arcs"]:
            anillos = [anillo(r, arcos) for r in p]
            polys.append(Polygon(anillos[0], anillos[1:]))
        return MultiPolygon(polys)
    raise ValueError(geom["type"])


def cargar_vecinos():
    """Contornos de los países limítrofes, recortados a la zona del mapa."""
    from shapely.geometry import shape, box
    if not NE_CACHE.exists():
        import urllib.request
        NE_CACHE.parent.mkdir(parents=True, exist_ok=True)
        print(f"Descargando Natural Earth a {NE_CACHE}…")
        urllib.request.urlretrieve(NE_URL, NE_CACHE)
    datos = json.load(open(NE_CACHE, encoding="utf-8"))
    marco = box(*RECORTE)
    salida = {}
    for f in datos["features"]:
        nombre = f["properties"].get("NAME") or f["properties"].get("ADMIN")
        if nombre in VECINOS:
            salida[nombre] = shape(f["geometry"]).buffer(0).intersection(marco)
    return salida


def main():
    if not SRC.exists():
        sys.exit(f"No se encuentra {SRC} — ¿está montado /Volumes/comun?")
    topo = json.load(open(SRC))
    obj = topo["objects"]["departamentos-argentina"]
    arcos = decodificar_arcos(topo)

    por_provincia = {}
    for g in obj["geometries"]:
        prov = g["properties"]["provincia"]
        try:
            shp = geometria(g, arcos).buffer(0)  # repara autointersecciones
        except Exception as e:
            print(f"  ⚠ {g['properties'].get('departamento')}: {e}")
            continue
        por_provincia.setdefault(prov, []).append(shp)

    # Bounding box continental (excluye Antártida e islas lejanas del viewBox)
    lon_min, lon_max = -73.6, -53.6
    lat_min, lat_max = -55.2, -21.7
    def merc(lat):
        lat = max(-85.0, min(85.0, lat))  # el topojson llega a la Antártida (-90)
        return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))

    kx = ANCHO / (lon_max - lon_min)          # unidades por grado de longitud
    ky = kx * 180 / math.pi                   # unidades por unidad de Mercator (conforme)
    alto = round((merc(lat_max) - merc(lat_min)) * ky)

    def proyectar(lon, lat):
        return (
            round((lon - lon_min) * kx, 1),
            round((merc(lat_max) - merc(lat)) * ky, 1),
        )

    def a_path(shp):
        polys = shp.geoms if isinstance(shp, MultiPolygon) else [shp]
        partes = []
        for p in polys:
            for ring in [p.exterior, *p.interiors]:
                pts = [proyectar(x, y) for x, y in ring.coords]
                d = f"M{pts[0][0]},{pts[0][1]}" + "".join(
                    f"L{x},{y}" for x, y in pts[1:]) + "Z"
                partes.append(d)
        return "".join(partes)

    provincias = []
    for prov, shapes in sorted(por_provincia.items()):
        union = unary_union(shapes).simplify(SIMPLIFICAR)
        provincias.append({"nombre": prov, "path": a_path(union)})
        print(f"  ✓ {prov}")

    vecinos = []
    for nombre, shp in sorted(cargar_vecinos().items()):
        if shp.is_empty:
            continue
        vecinos.append({"nombre": nombre, "path": a_path(shp.simplify(SIMPLIFICAR))})
        print(f"  ✓ vecino: {nombre}")

    salida = {
        "viewBox": f"0 0 {ANCHO} {alto}",
        "proyeccion": {
            "tipo": "mercator", "lon_min": lon_min, "lat_max": lat_max,
            "lat_min": lat_min, "lon_max": lon_max, "kx": kx, "ky": ky,
        },
        "provincias": provincias,
        "vecinos": vecinos,
        "fuente": "departamentos-argentina.topojson (pipeline Tableau Explora), disuelto por provincia; "
                  "países limítrofes de Natural Earth 1:50m (dominio público)",
    }
    OUT.write_text(json.dumps(salida, ensure_ascii=False), encoding="utf-8")
    print(f"\n✓ {OUT.name} ({OUT.stat().st_size // 1024} KB, {len(provincias)} provincias)")


if __name__ == "__main__":
    main()
