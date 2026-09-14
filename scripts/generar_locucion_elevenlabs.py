#!/usr/bin/env python3
"""Genera los bloques de locución del video con una voz de ElevenLabs.

Toma los textos y los tiempos de BLOQUES en scripts/mezclar_locucion.py, pide
cada bloque a la API de ElevenLabs y deja b00.mp3 ... b12.mp3 en una carpeta
lista para `mezclar_locucion.py ... --voz carpeta/`.

La clave de API se lee de ~/.cache/explorarg/elevenlabs.key (o de la variable
ELEVENLABS_API_KEY). Nunca se imprime.

Uso:
    VENV/bin/python scripts/generar_locucion_elevenlabs.py --listar
    VENV/bin/python scripts/generar_locucion_elevenlabs.py --voz Fernando --solo 0
    VENV/bin/python scripts/generar_locucion_elevenlabs.py --voz Fernando          # los 13 bloques
    (opcional) --out carpeta/  --modelo eleven_turbo_v2_5

"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mezclar_locucion as ml  # noqa: E402  (BLOQUES y tiempos del video)

API = "https://api.elevenlabs.io/v1"
CLAVE = Path.home() / ".cache" / "explorarg" / "elevenlabs.key"
SALIDA = Path(__file__).resolve().parent.parent / "output" / "video" / "voz_hdo" / "eleven"

# Cómo se escribe para que la voz lo lea bien (no cambia el guion, solo lo que se manda a la API)
PARA_TTS = [
    ("27.640", "veintisiete mil seiscientos cuarenta"),
    ("CEPREB", "Cepréb"),   # aguda: Fernando la leía grave (HDO 14/09)
]

# Elegido por HDO el 13/09/2026: turbo v2.5 con idioma forzado sostiene el acento argentino de Fernando
VOICE_SETTINGS = dict(stability=0.7, similarity_boost=0.85, style=0.0, use_speaker_boost=True, speed=1.1)  # velocidad 1,1 (HDO 14/09)


def clave() -> str:
    k = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not k and CLAVE.exists():
        k = CLAVE.read_text().strip()
    if not k:
        sys.exit(f"falta la clave: guardala en {CLAVE} (o ELEVENLABS_API_KEY)")
    return k


def llamar(metodo: str, ruta: str, key: str, cuerpo: dict | None = None, binario: bool = False):
    req = urllib.request.Request(API + ruta, method=metodo, headers={"xi-api-key": key, "accept": "*/*"})
    datos = None
    if cuerpo is not None:
        req.add_header("content-type", "application/json")
        datos = json.dumps(cuerpo).encode()
    try:
        with urllib.request.urlopen(req, datos, timeout=120) as r:
            return r.read() if binario else json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs {metodo} {ruta} -> {e.code}: {e.read().decode()[:400]}")


def mis_voces(key: str) -> list[dict]:
    return llamar("GET", "/voices", key)["voices"]


def buscar_voz(key: str, nombre: str) -> str:
    """voice_id de una voz por nombre: primero entre las propias, si no en la biblioteca (y la agrega)."""
    n = nombre.lower()
    for v in mis_voces(key):
        if v["name"].lower().startswith(n):
            print(f"voz: {v['name']!r} ({v['voice_id']}, {v.get('category')})")
            return v["voice_id"]
    q = urllib.parse.urlencode({"search": nombre, "page_size": 20, "language": "es"})
    cand = [v for v in llamar("GET", f"/shared-voices?{q}", key)["voices"] if v["name"].lower().startswith(n)]
    if not cand:
        sys.exit(f"no encontré la voz {nombre!r} ni entre las propias ni en la biblioteca")
    v = cand[0]
    print(f"voz de biblioteca: {v['name']!r} ({v['voice_id']}, {v.get('accent')}, {v.get('language')}) -> la agrego a tus voces")
    r = llamar("POST", f"/voices/add/{v['public_owner_id']}/{v['voice_id']}", key, {"new_name": v["name"]})
    return r["voice_id"]


def texto_tts(texto: str) -> str:
    for a, b in PARA_TTS:
        texto = texto.replace(a, b)
    return texto


def duracion(archivo: Path) -> float:
    try:
        import imageio_ffmpeg
        out = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-i", str(archivo)], capture_output=True, text=True).stderr
        m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", out)
        return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else 0.0
    except ImportError:
        return 0.0


def duracion_efectiva(archivo: Path) -> float:
    """Duración hasta donde termina de hablar: descuenta el silencio final que trae el mp3 (HDO 14/09: menos aire)."""
    total = duracion(archivo)
    try:
        import imageio_ffmpeg
        out = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-i", str(archivo), "-af", "silencedetect=n=-45dB:d=0.15",
                              "-f", "null", "-"], capture_output=True, text=True).stderr
    except ImportError:
        return total
    inicios = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", out)]
    fines = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", out)]
    if inicios and (len(fines) < len(inicios) or fines[-1] >= total - 0.05):
        return round(min(total, inicios[-1] + 0.1), 1)
    return total


def guardar_duracion(carpeta: Path, i: int, d: float) -> None:
    """Registra la duración del bloque en duraciones.json (el generador del video arma la línea de tiempo con esto)."""
    archivo = carpeta / "duraciones.json"
    datos = json.loads(archivo.read_text()) if archivo.exists() else {}
    datos[f"b{i:02d}"] = round(d, 1)
    archivo.write_text(json.dumps(dict(sorted(datos.items())), indent=1))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--listar", action="store_true", help="lista tus voces y sale")
    ap.add_argument("--medir", action="store_true", help="mide los mp3 que ya están en --out y escribe duraciones.json")
    ap.add_argument("--voz", default="Fernando", help="nombre (o voice_id) de la voz")
    ap.add_argument("--solo", help="bloques a generar, ej. 0 o 0,3,12 (por defecto todos)")
    ap.add_argument("--out", type=Path, default=SALIDA)
    ap.add_argument("--modelo", default="eleven_turbo_v2_5")
    ap.add_argument("--seed", type=int, help="semilla de ElevenLabs, para repetir una toma (ej. bloque 2: 23)")
    a = ap.parse_args()
    if a.medir:
        for mp3 in sorted(a.out.glob("b[0-9][0-9].mp3")):
            d = duracion_efectiva(mp3); guardar_duracion(a.out, int(mp3.stem[1:]), d)
            print(f"  {mp3.name}  {d:5.1f} s (archivo {duracion(mp3):.1f} s)")
        return 0
    key = clave()
    if a.listar:
        for v in mis_voces(key):
            print(f"  {v['voice_id']}  {v['name']!r}  {v.get('category')}  {v.get('labels')}")
        return 0
    voice_id = a.voz if re.fullmatch(r"[A-Za-z0-9]{20}", a.voz) else buscar_voz(key, a.voz)
    indices = [int(x) for x in a.solo.split(",")] if a.solo else list(range(len(ml.BLOQUES)))
    a.out.mkdir(parents=True, exist_ok=True)
    textos = [texto_tts(t) for _, _, t in ml.BLOQUES]
    total = 0
    for i in indices:
        t0, fin, _ = ml.BLOQUES[i]
        cuerpo = dict(text=textos[i], model_id=a.modelo, voice_settings=VOICE_SETTINGS,
                      language_code="es" if "v2_5" in a.modelo else None,
                      seed=a.seed,
                      previous_text=textos[i - 1] if i > 0 else None,
                      next_text=textos[i + 1] if i + 1 < len(textos) else None)
        cuerpo = {k: v for k, v in cuerpo.items() if v is not None}
        mp3 = llamar("POST", f"/text-to-speech/{voice_id}?output_format=mp3_44100_128", key, cuerpo, binario=True)
        destino = a.out / f"b{i:02d}.mp3"
        destino.write_bytes(mp3)
        total += len(textos[i])
        d = duracion_efectiva(destino)
        guardar_duracion(a.out, i, d)
        estado = "OK" if d <= fin - t0 else "SE PASA"
        print(f"bloque {i:2d}  {len(textos[i]):4d} car.  dura {d:5.1f} s  espacio {fin - t0:5.1f} s  {estado}  -> {destino.name}")
    print(f"✓ {len(indices)} bloques, {total} caracteres, en {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
