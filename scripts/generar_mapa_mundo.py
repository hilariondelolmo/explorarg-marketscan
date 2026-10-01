#!/usr/bin/env python3
"""
Genera public/data/mapa_mundo.json: contornos de todos los países como paths
SVG, para el mapa de flujos de la página Importaciones del mercado de gas oil
(/gas-oil/importaciones).

Fuente: Natural Earth 1:50m admin 0 countries (dominio público), el mismo
archivo en caché que usa generar_mapa.py para los países limítrofes. Cada país
va con su código ISO 3166-1 alfa-2 (campo ISO_A2_EH, que a diferencia de
ISO_A2 trae también Francia, Noruega y Taiwán), que es la clave con que
gasoil_importaciones.py identifica el país de origen y el de procedencia.

Proyección Web Mercator, como el mapa de provincias: x = (lon - lon_min) * kx ;
y = (merc(lat_max) - merc(lat)) * ky con merc(lat) = ln(tan(pi/4 + lat/2)).
Los parámetros quedan en el JSON para proyectar en React los centroides de
los países y dibujar los arcos con la misma fórmula. Se recorta entre 58° S
y 76° N (sin la Antártida) y se simplifica para que pese poco: las islas más
chicas que un cuarto de grado cuadrado no van.

Se corre una sola vez (o si cambia la fuente):

    python3 scripts/generar_mapa_mundo.py
"""

import json
import math
import sys
from pathlib import Path

try:
    from shapely.geometry import MultiPolygon, Polygon, box, shape
except ImportError:
    sys.exit("Falta shapely:  pip3 install shapely")

NE_CACHE = Path.home() / ".cache" / "explorarg" / "ne_50m_admin_0_countries.geojson"
NE_URL = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
          "geojson/ne_50m_admin_0_countries.geojson")
OUT = Path(__file__).resolve().parent.parent / "public" / "data" / "mapa_mundo.json"

ANCHO = 1000                 # px del viewBox; el alto sale de la proyección
LON_MIN, LON_MAX = -180.0, 180.0
LAT_MIN, LAT_MAX = -58.0, 76.0
SIMPLIFICAR = 0.3            # grados (~33 km en el ecuador)
AREA_MINIMA = 0.25           # grados cuadrados: islas más chicas no se dibujan


def merc(lat):
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def main():
    if not NE_CACHE.exists():
        import urllib.request
        NE_CACHE.parent.mkdir(parents=True, exist_ok=True)
        print(f"Descargando Natural Earth a {NE_CACHE}…")
        urllib.request.urlretrieve(NE_URL, NE_CACHE)
    datos = json.load(open(NE_CACHE, encoding="utf-8"))

    kx = ANCHO / (LON_MAX - LON_MIN)
    ky = kx * 180 / math.pi
    alto = round((merc(LAT_MAX) - merc(LAT_MIN)) * ky)
    marco = box(LON_MIN, LAT_MIN, LON_MAX, LAT_MAX)

    def proyectar(lon, lat):
        return (round((lon - LON_MIN) * kx, 1), round((merc(LAT_MAX) - merc(lat)) * ky, 1))

    def a_path(shp):
        polys = shp.geoms if isinstance(shp, MultiPolygon) else [shp]
        partes = []
        for p in polys:
            if p.area < AREA_MINIMA:
                continue
            for ring in [p.exterior, *p.interiors]:
                pts = [proyectar(x, y) for x, y in ring.coords]
                # Puntos repetidos tras el redondeo: afuera
                limpios = [pts[0]] + [q for i, q in enumerate(pts[1:], 1) if q != pts[i - 1]]
                if len(limpios) < 4:
                    continue
                partes.append(f"M{limpios[0][0]},{limpios[0][1]}" + "".join(f"L{x},{y}" for x, y in limpios[1:]) + "Z")
        return "".join(partes)

    paises = []
    sin_iso = []
    for f in datos["features"]:
        p = f["properties"]
        iso = p.get("ISO_A2_EH") or p.get("ISO_A2")
        nombre = p.get("NAME_EN") or p.get("NAME") or p.get("ADMIN")
        if iso in (None, "-99") or iso == "AQ":
            sin_iso.append(nombre)
            continue
        shp = shape(f["geometry"]).buffer(0).intersection(marco)
        if shp.is_empty:
            continue
        path = a_path(shp.simplify(SIMPLIFICAR))
        if not path:
            continue
        paises.append({"iso": iso, "nombre": nombre, "path": path})
    paises.sort(key=lambda c: c["iso"])
    isos = [c["iso"] for c in paises]
    repetidos = sorted({i for i in isos if isos.count(i) > 1})
    if repetidos:
        sys.exit(f"Códigos ISO repetidos en Natural Earth: {repetidos}")

    salida = {
        "viewBox": f"0 0 {ANCHO} {alto}",
        "proyeccion": {
            "tipo": "mercator", "lon_min": LON_MIN, "lon_max": LON_MAX,
            "lat_min": LAT_MIN, "lat_max": LAT_MAX, "kx": kx, "ky": ky,
        },
        "paises": paises,
        "fuente": "Natural Earth 1:50m admin 0 countries (dominio público), simplificado",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"✓ public/data/{OUT.name} ({OUT.stat().st_size // 1024} KB, {len(paises)} países, viewBox 0 0 {ANCHO} {alto})")
    if sin_iso:
        print(f"  sin código ISO (no se dibujan): {', '.join(sin_iso)}")


if __name__ == "__main__":
    main()
