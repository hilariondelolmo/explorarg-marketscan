#!/usr/bin/env python3
"""Mezcla una locución sobre el video mudo del mapa (generar_video_mapa.py).

Dos usos:
  1. Voz sintética de PRUEBA (solo para chequear que cada bloque del guion
     entra en su escena): genera cada bloque con la voz "Paulina" de macOS
     (no hay voz argentina instalada), la ubica en el tiempo de su escena y
     la mezcla sobre el video.
  2. Locución grabada por HDO: un WAV/M4A por bloque en una carpeta, con los
     nombres b00.wav ... b12.wav en el orden de BLOQUES (o --audio un solo
     archivo ya armado con los tiempos del video).

Los tiempos de inicio de cada bloque salen del propio generador del video
(se importa el módulo y se leen sus constantes), así nunca quedan
desfasados si cambia la línea de tiempo.

Uso:
    python3 scripts/mezclar_locucion.py --solo-tiempos
    python3 scripts/mezclar_locucion.py video_mudo.mp4 salida.mp4                 # voz sintética
    python3 scripts/mezclar_locucion.py video_mudo.mp4 salida.mp4 --voz carpeta/  # bloques grabados
    python3 scripts/mezclar_locucion.py video_mudo.mp4 salida.mp4 --audio pista.wav
    (opcional) --musica fondo.mp3 --nivel 0.18   # música de fondo debajo de la voz

Requiere el mismo entorno que el generador (pillow + imageio-ffmpeg):
    ~/.cache/explorarg/venv-video/bin/python scripts/mezclar_locucion.py ...
"""

from __future__ import annotations

import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generar_video_mapa as v  # noqa: E402  (carga datos y línea de tiempo)

import imageio_ffmpeg  # noqa: E402

FF = imageio_ffmpeg.get_ffmpeg_exe()
VOZ = "Paulina"      # voz de prueba (es_MX); "Mónica" es la otra en español
RITMO = 175          # palabras por minuto de la voz de prueba

# (inicio, fin, texto) - el texto es el del guion en docs/; los tiempos vienen del video
BLOQUES = [
    (0.6, v.PRESENTACION_FIN,
     "Hola, soy Hilarión del Olmo, presidente de Explora. La Ley 27.640 partió al biodiesel en tres compartimentos "
     "estancos y benefició a unos en detrimento de otros, y el Senado está tratando su reforma. Cada sector tira de la "
     "cuerda para llevar agua a su molino. La salida es una ley que desactive los privilegios y abra la competencia. "
     "Empecemos por lo que dice CEPREB."),
    (v.INTRO[0]["t"] + 0.2, v.INTRO_FIN,
     "¿Pensaste en lo que implica la afirmación que CEPREB repite? Que el costo de la materia prima lo determina la "
     "distancia a Puerto General San Martín. ¿Cómo sería la Argentina si eso fuera cierto?"),
    (v.T1 + 0.2, v.T2,
     "Estas son las 22 elaboradoras no integradas en operación, las que compran el aceite. Cada punto es una planta; "
     "su tamaño, la capacidad instalada."),
    (v.T2 + 0.2, v.T2B,
     "Si CEPREB tuviera razón, la Argentina tendría una sola aceitera, en Puerto General San Martín, y cada planta "
     "tendría que ir a buscar el aceite hasta ahí: Biobahía, 810 kilómetros; Diaser, 624; Enresa, 570."),
    (v.T2B + 0.3, v.T3,
     "Si la distancia al puerto mandara, el cumplimiento del cupo seguiría el mismo orden. No lo sigue. Pampa Bio, "
     "Diaser y Enresa, a más de 500 kilómetros, están entre las seis que más cumplen desde 2010. Cremer, Latinbio y "
     "Diferoil, a menos de 70 kilómetros, están últimas."),
    (v.T3 + 0.2, v.T4,
     "Pero la Argentina real tiene 54 aceiteras repartidas por todo el país, cada una con su molienda. El aceite está "
     "donde está el grano, no en un solo puerto."),
    (v.PARADA_T0 + 0.3, v.PARADA_T0 + v.PARADA_DUR,
     "Planta por planta. Las cuatro de Bojanich en Ramallo tienen 17 aceiteras a menos de 100 kilómetros: 33 veces su capacidad."),
    (v.PARADA_T0 + v.PARADA_DUR + 0.3, v.PARADA_T0 + 2 * v.PARADA_DUR,
     "Biobin, en Junín: cuatro aceiteras en el radio, cinco veces y media su capacidad."),
    (v.PARADA_T0 + 2 * v.PARADA_DUR + 0.3, v.PARADA_T0 + 3 * v.PARADA_DUR,
     "Biobahía, en Bahía Blanca: dos aceiteras a menos de 100 kilómetros, tres veces su capacidad."),
    (v.PARADA_T0 + 3 * v.PARADA_DUR + 0.3, v.PARADA_T0 + 4 * v.PARADA_DUR,
     "Diferoil, en Alvear, al lado de Rosario: 21 aceiteras, más de 300 veces su capacidad."),
    (v.PARADA_T0 + 4 * v.PARADA_DUR + 0.3, v.PARADA_T0 + 5 * v.PARADA_DUR,
     "Pampa Bio, en General Pico, La Pampa: con un radio de 120 kilómetros, dos aceiteras, casi tres veces su capacidad."),
    (v.PARADA_T0 + 5 * v.PARADA_DUR + 0.3, v.PARADA_T0 + 6 * v.PARADA_DUR,
     "Enresa, en Catriló: con 160 kilómetros de radio, tres aceiteras, casi cinco veces su capacidad."),
    (v.T5 + 1.5, v.DURACION,
     "El cuadro completo dice lo mismo para las 22: todas tienen a su alrededor más aceite del que pueden convertir en "
     "biodiesel. Esta es la Argentina real, no la ficción que CEPREB plantea para confundir y sostener ventajas que ya "
     "no se justifican. La nueva ley viene a terminar con eso. Gracias."),
]


def duracion(archivo: str) -> float:
    out = subprocess.run([FF, "-i", archivo], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", out)
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else 0.0


def a_wav(entrada: str, salida: str) -> None:
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", entrada, "-ar", "48000", "-ac", "2", salida], check=True)


def main() -> int:
    args = sys.argv[1:]
    if "--solo-tiempos" in args:
        for i, (t0, fin, texto) in enumerate(BLOQUES):
            print(f"bloque {i:2d}  {t0:6.1f} s → {fin:6.1f} s  ({fin - t0:4.1f} s)  {texto[:60]}…")
        print(f"duración del video: {v.DURACION:.1f} s")
        return 0
    video, salida = args[0], args[1]
    carpeta = Path(tempfile.mkdtemp(prefix="locucion_"))
    pistas = []  # (inicio, wav)
    if "--audio" in args:
        pista = str(carpeta / "pista.wav")
        a_wav(args[args.index("--audio") + 1], pista)
        pistas.append((0.0, pista))
    else:
        voz_dir = Path(args[args.index("--voz") + 1]) if "--voz" in args else None
        for i, (t0, fin, texto) in enumerate(BLOQUES):
            wav = str(carpeta / f"b{i:02d}.wav")
            if voz_dir:
                fuente = next(iter(sorted(voz_dir.glob(f"b{i:02d}.*"))), None)
                if fuente is None:
                    print(f"bloque {i:2d}: falta b{i:02d}.* en {voz_dir}", file=sys.stderr)
                    return 1
                a_wav(str(fuente), wav)
            else:
                aiff = str(carpeta / f"b{i:02d}.aiff")
                subprocess.run(["say", "-v", VOZ, "-r", str(RITMO), "-o", aiff, texto], check=True)
                a_wav(aiff, wav)
            dur = duracion(wav)
            estado = "OK" if dur <= fin - t0 else "SE PASA"
            print(f"bloque {i:2d} @ {t0:6.1f} s  dura {dur:5.1f} s  espacio {fin - t0:5.1f} s  {estado}")
            pistas.append((t0, wav))
    entradas = [FF, "-y", "-loglevel", "error", "-i", video]
    filtro, etiquetas = [], []
    for i, (t0, wav) in enumerate(pistas):
        entradas += ["-i", wav]
        ms = int(t0 * 1000)
        filtro.append(f"[{i + 1}:a]adelay={ms}|{ms}[a{i}]")
        etiquetas.append(f"[a{i}]")
    n = len(pistas)
    if "--musica" in args:
        nivel = float(args[args.index("--nivel") + 1]) if "--nivel" in args else 0.18
        entradas += ["-stream_loop", "-1", "-i", args[args.index("--musica") + 1]]
        filtro.append(f"[{n + 1}:a]volume={nivel}[m]")
        etiquetas.append("[m]")
        n += 1
    filtro.append("".join(etiquetas) + f"amix=inputs={n}:normalize=0[mix]")
    entradas += ["-filter_complex", ";".join(filtro), "-map", "0:v", "-map", "[mix]",
                 "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", salida]
    subprocess.run(entradas, check=True)
    print("✓", salida)
    return 0


if __name__ == "__main__":
    sys.exit(main())
