#!/usr/bin/env python3
"""Genera el PDF de la infografía del mercado de biodiesel.

Fuente: la ruta local /infografia (A3 apaisada: portada con el resumen del
mercado, una hoja por elaboradora en operación, una por grupo económico y
el ranking de distancias a refinerías y al puerto).

Uso:
    python3 scripts/generar_infografia.py                    # documento completo
    python3 scripts/generar_infografia.py --empresa "EXPLORA S.A."   # una sola hoja
    python3 scripts/generar_infografia.py --puerto 5273                # dev server a usar

Usa el dev server que esté corriendo (5273/5173); si no hay ninguno,
levanta uno propio y lo apaga al terminar. Requiere Google Chrome.

Salida: output/pdf/infografia_biodiesel.pdf (o infografia_<empresa>.pdf)
"""

from __future__ import annotations

import os
import re
import signal
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "output/pdf"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PUERTOS = (5273, 5173, 5297)
PUERTO_PROPIO = 5297


def sirve_el_dashboard(puerto: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://localhost:{puerto}/", timeout=3) as r:
            return b"explorarg" in r.read().lower()
    except OSError:
        return False


def slug(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", s.lower().replace("ñ", "n"))
    return s.strip("_")


def main() -> int:
    args = sys.argv[1:]
    empresa = None
    if "--empresa" in args:
        empresa = args[args.index("--empresa") + 1]
    salida = OUT_DIR / (f"infografia_{slug(empresa)}.pdf" if empresa else "infografia_biodiesel.pdf")
    if "--out" in args:
        salida = Path(args[args.index("--out") + 1])

    puerto = int(args[args.index("--puerto") + 1]) if "--puerto" in args else None
    if puerto is None:
        puerto = next((p for p in PUERTOS if sirve_el_dashboard(p)), None)
    server = None
    if puerto is None:
        puerto = PUERTO_PROPIO
        print(f"· sin dev server: levantando uno propio en {puerto}")
        server = subprocess.Popen(
            ["npm", "run", "dev", "--", "--port", str(puerto), "--strictPort"],
            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
        )
        for _ in range(120):
            if sirve_el_dashboard(puerto):
                break
            time.sleep(0.5)
        else:
            print("no arrancó el dev server", file=sys.stderr)
            return 1
    else:
        print(f"· usando el dev server de {puerto}")

    url = f"http://localhost:{puerto}/infografia"
    if empresa:
        url += "?" + urllib.parse.urlencode({"empresa": empresa})
    salida.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            [
                CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer",
                # ventana más ancha que la hoja (420mm ≈ 1587px): escala 1 en
                # pantalla, así los charts y mapas miden su ancho real
                "--window-size=1700,1200",
                # tiempo virtual para que monten los charts y las fuentes
                "--virtual-time-budget=30000",
                f"--print-to-pdf={salida}",
                url,
            ],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    finally:
        if server is not None:
            os.killpg(os.getpgid(server.pid), signal.SIGTERM)
    try:
        nombre = salida.relative_to(ROOT)
    except ValueError:
        nombre = salida
    print(f"✓ {nombre} ({salida.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
