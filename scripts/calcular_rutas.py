#!/usr/bin/env python3
"""
Calcula con OSRM (ruteo libre sobre OpenStreetMap) el recorrido por ruta desde
cada elaboradora de biodiesel en operación hasta cada refinería (o hasta cada
aceitera, con --aceiteras), y escribe src/data/rutas_refinerias.json o
rutas_aceiteras.json con kilómetros, minutos y el trazado simplificado.

Uso:
    python3 scripts/calcular_rutas.py [--aceiteras] [--dry-run] [--solo-faltantes]

Con --aceiteras solo se calculan los pares a menos de MAX_RECTA_KM en línea
recta (los únicos que pueden entrar en el radio máximo del análisis).

Usa el servidor público de OSRM (uso liviano, sin clave). Las rutas ya
calculadas se conservan con --solo-faltantes. No estima: si una ruta falla,
queda registrada como faltante y el script lo informa al final.
"""

import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DATA = RAIZ / "src" / "data"
OUT_REFINERIAS = DATA / "rutas_refinerias.json"
OUT_ACEITERAS = DATA / "rutas_aceiteras.json"
MAX_RECTA_KM = 320  # aceiteras: radio máximo del análisis (300 km) con margen
OSRM = "https://router.project-osrm.org/route/v1/driving/"
PAUSA = 0.25          # segundos entre consultas (cortesía con el servidor público)
TOLERANCIA = 0.004    # grados (~400 m) para simplificar el trazado
REDONDEO = 4          # decimales de las coordenadas guardadas


def cargar_origenes():
    """Elaboradoras de biodiesel geolocalizadas y en operación (mismo criterio que el mapa)."""
    cap = json.load(open(DATA / "capacidad.json", encoding="utf-8"))
    ultimo = max(r["fecha"] for r in cap["serie"])
    condicion = {r["empresa"]: r["condicion"] for r in cap["serie"] if r["fecha"] == ultimo}
    return [p for p in cap["plantas"]
            if p["lat"] is not None and p["lng"] is not None and condicion.get(p["empresa"]) == "ON"]


def cargar_destinos(aceiteras):
    if aceiteras:
        datos = json.load(open(DATA / "plantas_aceite.json", encoding="utf-8"))
        return [dict(d, planta=d["establecimiento"]) for d in datos["plantas"]
                if d["lat"] is not None and d["lng"] is not None]
    ref = json.load(open(DATA / "refinerias.json", encoding="utf-8"))
    return ref["refinerias"]


def recta_km(a, b):
    import math
    R = 6371
    g = math.radians
    dlat, dlng = g(b["lat"] - a["lat"]), g(b["lng"] - a["lng"])
    h = math.sin(dlat / 2) ** 2 + math.cos(g(a["lat"])) * math.cos(g(b["lat"])) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def consultar(o, d):
    coords = f"{o['lng']},{o['lat']};{d['lng']},{d['lat']}"
    url = OSRM + coords + "?" + urllib.parse.urlencode(
        dict(overview="simplified", geometries="geojson", steps="false"))
    req = urllib.request.Request(url, headers={"User-Agent": "explorarg-marketscan/1.0"})
    for intento in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                res = json.load(r)
            if res.get("code") != "Ok" or not res.get("routes"):
                return None
            ruta = res["routes"][0]
            return dict(km=round(ruta["distance"] / 1000, 1),
                        min=round(ruta["duration"] / 60),
                        ruta=simplificar(ruta["geometry"]["coordinates"]))
        except Exception as e:  # noqa: BLE001 - reintento y sigo
            print(f"    reintento {intento + 1}: {e}")
            time.sleep(2 * (intento + 1))
    return None


def simplificar(puntos):
    """Douglas-Peucker sobre lon/lat, para que el JSON quede liviano."""
    def dist(p, a, b):
        (x, y), (x1, y1), (x2, y2) = p, a, b
        dx, dy = x2 - x1, y2 - y1
        if dx == dy == 0:
            return ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
        t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        return ((x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2) ** 0.5

    def dp(pts):
        if len(pts) < 3:
            return pts
        i, dmax = 0, 0
        for k in range(1, len(pts) - 1):
            dk = dist(pts[k], pts[0], pts[-1])
            if dk > dmax:
                i, dmax = k, dk
        if dmax > TOLERANCIA:
            return dp(pts[:i + 1])[:-1] + dp(pts[i:])
        return [pts[0], pts[-1]]

    return [[round(x, REDONDEO), round(y, REDONDEO)] for x, y in dp(puntos)]


def main():
    dry = "--dry-run" in sys.argv
    solo_faltantes = "--solo-faltantes" in sys.argv
    aceiteras = "--aceiteras" in sys.argv
    OUT = OUT_ACEITERAS if aceiteras else OUT_REFINERIAS
    origenes = cargar_origenes()
    destinos = cargar_destinos(aceiteras)
    pares = [(o, d) for o in origenes for d in destinos
             if not aceiteras or recta_km(o, d) <= MAX_RECTA_KM]
    previas = {}
    if solo_faltantes and OUT.exists():
        previas = json.load(open(OUT, encoding="utf-8")).get("rutas", {})
        # Se descartan las rutas de plantas o destinos que ya no están
        vigentes = {f"{o['empresa']}|{d['id']}" for o, d in pares}
        previas = {k: v for k, v in previas.items() if k in vigentes}
    print(f"{len(origenes)} elaboradoras × {len(destinos)} {'aceiteras' if aceiteras else 'refinerías'}"
          f" → {len(pares)} rutas a calcular ({len(previas)} ya calculadas)")

    rutas, faltantes = dict(previas), []
    for o, d in pares:
        if True:
            clave = f"{o['empresa']}|{d['id']}"
            if clave in rutas:
                continue
            res = consultar(o, d)
            if res is None:
                faltantes.append(clave)
                print(f"  ✗ {clave}")
            else:
                rutas[clave] = res
                print(f"  ✓ {o['empresa'][:28]:28} → {d['planta'][:22]:22} {res['km']:7.1f} km  {res['min']:4d} min")
            time.sleep(PAUSA)

    payload = dict(
        rutas=rutas,
        meta=dict(
            generado=datetime.now().strftime("%Y-%m-%d %H:%M"),
            fuentes=["OSRM (router.project-osrm.org) sobre OpenStreetMap, perfil driving"],
            nota="Generado por scripts/calcular_rutas.py - no editar a mano. "
                 "Trazado simplificado (~400 m); km y minutos por ruta según OSRM.",
            faltantes=faltantes,
        ),
    )
    print(f"\n{len(rutas)} rutas · {len(faltantes)} faltantes")
    if dry:
        print(f"[dry-run] {OUT.name}: {len(json.dumps(payload)) // 1024} KB")
        return
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"✓ {OUT.name} ({OUT.stat().st_size // 1024} KB)")
    if faltantes:
        sys.exit(1)


if __name__ == "__main__":
    main()
