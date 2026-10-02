#!/usr/bin/env python3
"""Locución de un tutorial con la voz de Fernando (ElevenLabs).

Lee el guion JSON (scripts/tutorial/guiones/<id>.json), manda a la API el texto
de cada paso que tenga locución y deja output/tutorial/<id>/voz/<paso>.mp3 más
duraciones.json (segundos hasta donde termina de hablar, sin el silencio final),
que grabar.mjs usa para dar a cada paso el tiempo de su voz.

Misma receta que el video CEPREB (decisión HDO 13 y 14/09/2026): Fernando
(nJQVs11nHR9UflbVG2og), eleven_turbo_v2_5 con idioma es, velocidad 1,1. La
clave se lee de ~/.cache/explorarg/elevenlabs.key (o ELEVENLABS_API_KEY) y
nunca se imprime.

Uso:
    python3 scripts/tutorial/locucion.py guiones/gasoil.json            # todos los pasos con texto
    python3 scripts/tutorial/locucion.py guiones/gasoil.json --solo p03,p07
    python3 scripts/tutorial/locucion.py guiones/gasoil.json --medir    # solo mide los mp3 que ya están
    python3 scripts/tutorial/locucion.py guiones/gasoil.json --listar   # muestra los textos como los recibe la API
    (opcional) --seed N  --modelo eleven_turbo_v2_5  --voz <voice_id>
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

API = "https://api.elevenlabs.io/v1"
CLAVE = Path.home() / ".cache" / "explorarg" / "elevenlabs.key"
RAIZ = Path(__file__).resolve().parent.parent.parent
AQUI = Path(__file__).resolve().parent
FERNANDO = "nJQVs11nHR9UflbVG2og"
MODELO = "eleven_turbo_v2_5"
VOICE_SETTINGS = dict(stability=0.7, similarity_boost=0.85, style=0.0, use_speaker_boost=True, speed=1.1)

# Cómo se escribe para que la voz lo lea bien (no cambia el guion, solo lo que se manda a la API)
PARA_TTS = [
    ("Res. 963", "Resolución 963"),
    ("963", "novecientos sesenta y tres"),
    ("1104", "mil ciento cuatro"),
    ("27.640", "veintisiete mil seiscientos cuarenta"),
    ("26.093", "veintiséis mil noventa y tres"),
    ("YPF", "i pe efe"),       # la voz leía "u i pe efe" (HDO 02/10/2026)
    ("SESCO", "Sesco"),
    ("CAMMESA", "Cammesa"),
    ("CIF", "cif"),
    ("m³", "metros cúbicos"),
    ("usd", "dólares"),
    ("Explorarg", "Explorarg"),
]


def clave() -> str:
    k = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not k and CLAVE.exists():
        k = CLAVE.read_text().strip()
    if not k:
        sys.exit(f"falta la clave: guardala en {CLAVE} (o ELEVENLABS_API_KEY)")
    return k


def llamar(metodo: str, ruta: str, key: str, cuerpo: dict | None = None, binario: bool = False):
    import urllib.error
    import urllib.request
    req = urllib.request.Request(API + ruta, method=metodo, headers={"xi-api-key": key, "accept": "*/*"})
    datos = None
    if cuerpo is not None:
        req.add_header("content-type", "application/json")
        datos = json.dumps(cuerpo).encode()
    try:
        with urllib.request.urlopen(req, datos, timeout=180) as r:
            return r.read() if binario else json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs {metodo} {ruta} -> {e.code}: {e.read().decode()[:400]}")


def texto_tts(paso: dict) -> str:
    texto = paso.get("tts") or paso["texto"]
    for a, b in PARA_TTS:
        texto = texto.replace(a, b)
    return texto


def duracion(archivo: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(archivo)],
                         capture_output=True, text=True).stdout.strip()
    return float(out) if out else 0.0


def duracion_efectiva(archivo: Path) -> float:
    """Hasta donde termina de hablar: descuenta el silencio final del mp3 (HDO 14/09: lo más corto posible)."""
    total = duracion(archivo)
    out = subprocess.run(["ffmpeg", "-i", str(archivo), "-af", "silencedetect=n=-45dB:d=0.15", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    inicios = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", out)]
    fines = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", out)]
    if inicios and (len(fines) < len(inicios) or fines[-1] >= total - 0.05):
        return round(min(total, inicios[-1] + 0.1), 2)
    return round(total, 2)


def guardar_duracion(carpeta: Path, pid: str, d: float) -> None:
    archivo = carpeta / "duraciones.json"
    datos = json.loads(archivo.read_text()) if archivo.exists() else {}
    datos[pid] = d
    archivo.write_text(json.dumps(dict(sorted(datos.items())), indent=1, ensure_ascii=False))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("guion")
    ap.add_argument("--solo", help="pasos a generar, ej. p03 o p03,p07 (por defecto todos los que tienen texto)")
    ap.add_argument("--medir", action="store_true", help="mide los mp3 que ya están y escribe duraciones.json")
    ap.add_argument("--listar", action="store_true", help="muestra los textos como los recibe la API y sale")
    ap.add_argument("--voz", default=FERNANDO)
    ap.add_argument("--modelo", default=MODELO)
    ap.add_argument("--seed", type=int)
    ap.add_argument("--out", type=Path)
    a = ap.parse_args()

    ruta = Path(a.guion)
    if not ruta.exists():
        ruta = AQUI / a.guion
    G = json.loads(ruta.read_text())
    out = a.out or (RAIZ / "output" / "tutorial" / G["id"] / "voz")
    pasos = [p for p in G["pasos"] if p.get("texto")]
    textos = {p["id"]: texto_tts(p) for p in pasos}

    if a.listar:
        for p in pasos:
            print(f"[{p['id']}] {len(textos[p['id']])} car.\n{textos[p['id']]}\n")
        print(f"{len(pasos)} bloques, {sum(len(t) for t in textos.values())} caracteres")
        return 0
    if a.medir:
        for p in pasos:
            mp3 = out / f"{p['id']}.mp3"
            if mp3.exists():
                d = duracion_efectiva(mp3)
                guardar_duracion(out, p["id"], d)
                print(f"  {p['id']}  {d:5.1f} s (archivo {duracion(mp3):.1f} s)")
        return 0

    key = clave()
    elegidos = set(a.solo.split(",")) if a.solo else {p["id"] for p in pasos}
    out.mkdir(parents=True, exist_ok=True)
    total = 0
    for i, p in enumerate(pasos):
        if p["id"] not in elegidos:
            continue
        cuerpo = dict(
            text=textos[p["id"]], model_id=a.modelo, voice_settings=VOICE_SETTINGS,
            language_code="es" if "v2_5" in a.modelo else None,
            seed=p.get("seed", a.seed),
            previous_text=textos[pasos[i - 1]["id"]] if i > 0 else None,
            next_text=textos[pasos[i + 1]["id"]] if i + 1 < len(pasos) else None,
        )
        cuerpo = {k: v for k, v in cuerpo.items() if v is not None}
        mp3 = llamar("POST", f"/text-to-speech/{a.voz}?output_format=mp3_44100_128", key, cuerpo, binario=True)
        destino = out / f"{p['id']}.mp3"
        destino.write_bytes(mp3)
        d = duracion_efectiva(destino)
        guardar_duracion(out, p["id"], d)
        total += len(textos[p["id"]])
        print(f"  {p['id']}  {len(textos[p['id']]):4d} car.  {d:5.1f} s  -> {destino.name}")
    print(f"✓ {total} caracteres en {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
