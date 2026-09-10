#!/usr/bin/env python3
"""
Descarga de datos.energia.gob.ar (Secretaría de Energía) la ubicación de las
refinerías de hidrocarburos y de la planta de metanol de YPF en Plaza Huincul
(dataset de petroquímicas) y escribe src/data/refinerias.json para el mapa
de plantas.

Uso:
    python3 scripts/descargar_refinerias.py [--dry-run]

No estima nada: si la fuente cambia de formato o falta la planta de metanol,
aborta con mensaje explícito. Revisar el diff antes de commitear.
"""

import csv
import io
import json
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "refinerias.json"

FUENTES = {
    "refinerias": ("Refinación Hidrocarburos - Refinerías (Res. 419/1998 y 1102/2004)",
                   "http://datos.energia.gob.ar/dataset/a9eed347-78ab-45c0-a489-b227fe42ee1b/"
                   "resource/fcad1e1a-1cb1-4ef8-8529-ea4ee5ef548a/download/"
                   "refinacin-hidrocarburos-refineras.csv"),
    "petroquimicas": ("Refinación Hidrocarburos - Petroquímicas",
                      "http://datos.energia.gob.ar/dataset/8fc4e505-bd4d-431e-863e-1e44b4f6ee01/"
                      "resource/f4a44571-73ae-4e91-b7e2-22f71b752bd6/download/"
                      "refinacin-hidrocarburos-petroqumicas.csv"),
}

# Plantas del padrón que HDO pidió no mostrar (2026-09-10): Fátima (Nueva
# Energía Argentina, Pilar), General Rodríguez (sin empresa en la fuente),
# Ramallo (Delta Energía y Ambiente) y San Lorenzo (YPF).
EXCLUIR = {"FATIMA", "GENERAL RODRIGUEZ", "RAMALLO", "SAN LORENZO"}
# Dock Sud figura dos veces en el padrón (Raízen y Destilería Argentina de
# Petróleo, CUIT 30-55025533-9); HDO pidió mostrar una sola, la de Raízen.
EXCLUIR_CUIT = {"30-55025533-9"}
# Empresa que falta en la fuente y HDO indicó (2026-09-10): la segunda planta
# de Luján de Cuyo (Cerro Santa Elena, parque industrial) es de YPF.
EMPRESA_FALTANTE = {("LUJAN DE CUYO", "CERRO SANTA ELENA S/N - PARQUE INDUSTRIAL"): "YPF S.A."}

# La planta de metanol de YPF está dentro del complejo petroquímico de Plaza
# Huincul; en el dataset de petroquímicas figura como "YPF / PLAZA HUINCUL".
METANOL = dict(planta="YPF", localidad="PLAZA HUINCUL")


def check(cond, msg):
    if not cond:
        sys.exit(f"ERROR: {msg}")


def leer_csv(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        raw = r.read()
    for enc in ("utf-8-sig", "latin-1"):
        try:
            txt = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    return list(csv.DictReader(io.StringIO(txt)))


def punto(geojson):
    g = json.loads(geojson)
    check(g.get("type") == "Point", f"Geometría no puntual: {geojson}")
    lng, lat = g["coordinates"]
    return float(lat), float(lng)


def titulo(s):
    minus = {"de", "del", "la", "las", "los", "y", "e"}
    return " ".join(w if (i and w in minus) else w.capitalize()
                    for i, w in enumerate((s or "").lower().split()))


def main():
    dry = "--dry-run" in sys.argv
    print("Descargando refinerías…")
    rows = leer_csv(FUENTES["refinerias"][1])
    check(rows and "geojson" in rows[0] and "planta" in rows[0],
          "El CSV de refinerías cambió de formato")
    refinerias = []
    excluidas = 0
    for i, r in enumerate(rows):
        if r["planta"].strip().upper() in EXCLUIR or r["cuit"].strip() in EXCLUIR_CUIT:
            excluidas += 1
            continue
        lat, lng = punto(r["geojson"])
        empresa = r["empresa"].strip() or EMPRESA_FALTANTE.get(
            (r["planta"].strip().upper(), r["direccion"].strip().upper()))
        refinerias.append(dict(
            id=i,
            planta=titulo(r["planta"]),
            empresa=empresa or None,
            cuit=r["cuit"].strip() or None,
            direccion=r["direccion"].strip() or None,
            localidad=titulo(r["aglomeracion_urbana"] or r["departamento"]),
            provincia=r["provincia"].strip(),
            habilitacion=r["hab_res1102"].strip() or None,
            resolucion=r["resolucion"].strip() or None,
            lat=lat, lng=lng,
        ))
    refinerias.sort(key=lambda p: (p["provincia"], p["planta"]))

    print("Descargando petroquímicas (planta de metanol)…")
    rows = leer_csv(FUENTES["petroquimicas"][1])
    check(rows and "geojson" in rows[0] and "localidad" in rows[0],
          "El CSV de petroquímicas cambió de formato")
    hits = [r for r in rows
            if r["planta"].strip().upper() == METANOL["planta"]
            and r["localidad"].strip().upper() == METANOL["localidad"]]
    check(len(hits) == 1, f"Se esperaba 1 planta YPF en Plaza Huincul, hay {len(hits)}")
    lat, lng = punto(hits[0]["geojson"])
    metanol = [dict(
        id=0,
        planta="Planta de metanol de YPF",
        empresa="YPF S.A.",
        localidad="Plaza Huincul",
        provincia="NEUQUEN",
        lat=lat, lng=lng,
        nota="Complejo petroquímico de Plaza Huincul (dataset de petroquímicas de la SE)",
    )]

    payload = dict(
        refinerias=refinerias,
        metanol=metanol,
        meta=dict(
            generado=datetime.now().strftime("%Y-%m-%d %H:%M"),
            fuentes=[f"{n}: {u}" for n, u in FUENTES.values()],
            nota="Generado por scripts/descargar_refinerias.py - no editar a mano",
        ),
    )
    check(excluidas == len(EXCLUIR) + len(EXCLUIR_CUIT),
          f"Se esperaba excluir {len(EXCLUIR) + len(EXCLUIR_CUIT)} plantas, se excluyeron {excluidas}")
    check(all(r["empresa"] for r in refinerias),
          "Quedó una refinería sin empresa: " + ", ".join(r["planta"] for r in refinerias if not r["empresa"]))
    print(f"  {len(refinerias)} refinerías ({excluidas} excluidas) · {len(metanol)} planta de metanol")
    if dry:
        print(f"  [dry-run] refinerias.json: {len(json.dumps(payload))//1024} KB")
        return
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")
    print(f"  ✓ {OUT.name} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
