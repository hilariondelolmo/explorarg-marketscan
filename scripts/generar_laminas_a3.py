#!/usr/bin/env python3
"""Genera el PDF de láminas A3 de la Propuesta S80926PL.

Fuente: la ruta local /impreso-a3 (una lámina A3 apaisada por artículo
fundamentado, hojas de continuación para los más cargados y una lámina
final con el articulado restante).

Usa el dev server que esté corriendo (5273/5173); si no hay ninguno,
levanta uno propio y lo apaga al terminar. Requiere Google Chrome.

Salida: output/pdf/propuesta_laminas_a3.pdf (A3 apaisado, medida real)
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output/pdf/propuesta_laminas_a3.pdf"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PUERTOS = (5273, 5173, 5297)
PUERTO_PROPIO = 5297


def sirve_el_dashboard(puerto: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://localhost:{puerto}/", timeout=3) as r:
            return b"explorarg" in r.read().lower()
    except OSError:
        return False


def main() -> int:
    puerto = next((p for p in PUERTOS if sirve_el_dashboard(p)), None)
    server = None
    if puerto is None:
        puerto = PUERTO_PROPIO
        print(f"· sin dev server: levantando uno propio en {puerto}")
        server = subprocess.Popen(
            ["npm", "run", "dev", "--", "--port", str(puerto), "--strictPort"],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,  # el grupo entero se apaga al final
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

    OUT.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            [
                CHROME,
                "--headless",
                "--disable-gpu",
                "--no-pdf-header-footer",
                # ventana más ancha que la hoja (420mm ≈ 1587px): la escala
                # de pantalla queda en 1 y los charts miden su ancho real
                # (ResponsiveContainer mide por getBoundingClientRect, que
                # el transform de pantalla achica; el ResizeObserver que lo
                # corrige no corre en headless)
                "--window-size=1700,1200",
                # tiempo virtual: deja montar los charts y correr el derrame
                "--virtual-time-budget=40000",
                f"--print-to-pdf={OUT}",
                f"http://localhost:{puerto}/impreso-a3",
            ],
            check=True,
            capture_output=True,
        )
    finally:
        if server:
            os.killpg(os.getpgid(server.pid), signal.SIGTERM)
            server.wait(timeout=10)

    print(f"OK → {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
