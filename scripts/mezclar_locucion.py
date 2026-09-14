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
    (0.6, v.PRESENTACION_FIN,  # texto de HDO, versión media (14/09, rev. 6)
     "Cuando el Congreso debate una ley, convoca a especialistas y cámaras del sector, que hablan por sus asociados. "
     "Cada expositor dispone de cinco minutos: alcanzan para una conclusión, no para las evidencias que la sostienen. "
     "En ese vacío prospera el sesgo de autoridad: sin tiempo ni datos para contrastar, el prestigio de quien habla "
     "ocupa el lugar de la evidencia, y una afirmación no demostrada termina influyendo en decisiones públicas. Por "
     "eso, y ante el debate de una nueva ley de biocombustibles, en Explorarg inauguramos una sección: tomaremos "
     "afirmaciones del debate legislativo y las contrastaremos con los datos. No preguntaremos quién tiene autoridad, "
     "sino qué resiste la evidencia. La primera es de CEPREB. Dice así:"),
    (v.INTRO[0]["t"] + 0.2, v.INTRO_FIN,  # cuadro 2, versión corta (14/09)
     "CEPREB sostiene que el costo de la materia prima depende de la distancia al puerto de Rosario, su kilómetro cero "
     "del aceite. Antes de discutirlo, veamos qué implica: si fuera cierto, ¿qué mapa productivo deberíamos esperar? "
     "Dibujémoslo, empezando por quienes compran el aceite."),
    (v.T1 + 0.2, v.T2,  # cuadro 3 (texto de HDO, 14/09). Sin total. Colalao del Valle (no integrada, en operación,
     # 18.000 t) se ubicó en COMIRSA II, Ramallo, el 14/09: son 23 en el mapa.
     "Seis plantas de biodiesel son integradas: muelen su propia soja y el aceite no lo compran, lo producen. La "
     "afirmación de CEPREB habla de las otras, las que salen a comprarlo: las 23 que aparecen sobre el mapa, con un "
     "diámetro proporcional a su capacidad de producción. En el cuadro de la derecha, al lado de cada una, hay dos "
     "datos que van a servir después: cuánto puede producir y cuánto del cupo cumplió desde 2010. Ahora que ubicamos "
     "a las elaboradoras de biodiesel, ¿por qué no ubicar también a las de aceite, tal como las supone la hipótesis "
     "de CEPREB?"),
    (v.T2 + 0.2, v.T2B,  # cuadro 4: texto de HDO, 14/09/2026 (precio fijado por la SE, igual para todos)
     "Si CEPREB tuviera razón, la Argentina tendría una sola aceitera, en Puerto General San Martín, y cada planta "
     "tendría que ir a buscar el aceite hasta ahí. El listado las ordena de la más lejana a la más cercana, con los "
     "kilómetros reales por ruta. En esa Argentina, ese orden sería también el orden del costo de compra de la "
     "materia prima. Pero un momento: si el precio de venta del biodiesel lo fija la Secretaría de Energía y es "
     "igual para todos los elaboradores, entonces un costo mayor debería notarse en algo. Por ejemplo, en cuánto "
     "del cupo cumple cada una. Pongamos las dos listas una al lado de la otra."),
    (v.T2B + 0.3, v.T3,  # cuadro 5 (14/09): cómo leer los dos cuadros; la distancia no decide; nexo con la Argentina real
     "Si la hipótesis fuera cierta, las líneas irían derechas: la planta más lejana, abajo en los dos cuadros; la más "
     "cercana, arriba en los dos. Miren lo que pasa. Las líneas se cruzan. Tres de las plantas más lejanas del puerto "
     "están entre las que más cumplen. Y tres de las más cercanas están últimas. No es que la distancia no cueste "
     "nada: es que no decide. Algo más pesa. Y ese algo aparece cuando dejamos de mirar la Argentina de CEPREB y "
     "miramos la real."),
    (v.T3 + 0.2, v.T4,  # cuadro 6 (14/09): el aceite está donde está el grano; lo que cuenta es lo que hay cerca; nexo con el zoom
     "Esto es lo que la hipótesis deja fuera del mapa. El aceite no sale de un puerto: sale de las aceiteras, y las "
     "aceiteras están donde está el grano. Es cierto que la mayor molienda se concentra sobre el Paraná, en Santa Fe. "
     "Pero hay aceiteras en Buenos Aires, en Córdoba, en Entre Ríos, en La Pampa. Y para una planta de biodiesel lo "
     "que cuenta no es cuánto muele el país, sino cuánto aceite tiene a la distancia de un camión. Veámoslo de cerca, "
     "planta por planta."),
    # cuadro 7, seis paradas (14/09): el orden es el de PARADAS del generador (Ramallo, Bahía Blanca, Junín, Alvear,
    # General Pico, Catriló); la voz interpreta cada parada y engancha con la siguiente
    (v.PARADA_INICIOS[0] + 0.3, v.PARADA_INICIOS[0] + v.PARADA_DURS[0],
     "Primera parada: Ramallo, donde el Grupo Bojanich concentra cinco plantas: Bio Ramallo, Biobal Energy, Biocorba, "
     "Refinar Bio y Colalao del Valle. Están a cien kilómetros del puerto, pero eso no importa: a esa misma distancia, a la redonda, tienen diecisiete aceiteras. Aceite para treinta "
     "veces lo que pueden producir. Ahora, al otro extremo del país."),
    (v.PARADA_INICIOS[1] + 0.3, v.PARADA_INICIOS[1] + v.PARADA_DURS[1],
     "Biobahía, en Bahía Blanca. Es la planta más lejana del puerto: ochocientos kilómetros. En la Argentina de CEPREB sería la "
     "más castigada. En la real, tiene dos aceiteras al lado, con aceite para tres veces su capacidad."),
    (v.PARADA_INICIOS[2] + 0.3, v.PARADA_INICIOS[2] + v.PARADA_DURS[2],
     "Biobin, en Junín, provincia de Buenos Aires, a doscientos cincuenta kilómetros del puerto. Cuatro aceiteras en el radio: "
     "cinco veces y media lo que la planta puede convertir. Sin río, sin puerto, con aceite."),
    (v.PARADA_INICIOS[3] + 0.3, v.PARADA_INICIOS[3] + v.PARADA_DURS[3],
     "Diferoil, en Alvear, al lado de Rosario. En el mapa de CEPREB es la planta privilegiada: cincuenta kilómetros del puerto y "
     "veintiuna aceiteras alrededor, aceite para trescientas veces su capacidad. Y sin embargo está entre las que "
     "menos cumplen el cupo. Aceite no le falta: lo que le pasa no es la distancia."),
    (v.PARADA_INICIOS[4] + 0.3, v.PARADA_INICIOS[4] + v.PARADA_DURS[4],
     "Pampa Bio, en General Pico, La Pampa: quinientos kilómetros del puerto. Hubo que ampliar el radio a ciento veinte kilómetros "
     "para encontrar aceiteras. Son dos, y alcanzan para casi tres veces su capacidad. Y es una de las plantas que "
     "más cumple el cupo desde 2010."),
    (v.PARADA_INICIOS[5] + 0.3, v.PARADA_INICIOS[5] + v.PARADA_DURS[5],
     "Enresa, en Catriló, también en La Pampa, más lejos todavía. Con ciento sesenta kilómetros de radio, tres aceiteras y "
     "aceite para casi cinco veces su capacidad. Otra de las que más cumplen. Lo mismo, planta por planta, para las "
     "veintitrés: veámoslo todo junto."),
    (v.T5 + 1.5, v.DURACION,  # cuadro 8: texto de HDO, 14/09/2026 (definitivo)
     "El cuadro completo revela el mismo patrón en las veintitrés plantas: todas cuentan, en su entorno, con más "
     "aceite del que podrían transformar en biodiesel. Incluso en el caso menos favorable, la oferta supera en un "
     "30 % las necesidades de la planta; en la mayoría, las excede varias decenas de veces. "
     "Cinco minutos bastan para formular dos afirmaciones: a, que el costo de la materia prima puesta en una planta "
     "de biodiesel se compone del precio del aceite a la salida de la planta productora y del costo de "
     "transportarlo hasta la planta elaboradora; y b, que ese transporte depende de la distancia entre la planta de "
     "biodiesel y el puerto. "
     "Demostrar, como acabamos de hacer, que el transporte sí depende de la distancia, pero no de la distancia al "
     "puerto, exige algo más de tiempo. La distancia relevante es la que separa a la planta de biodiesel del "
     "proveedor más cercano con capacidad de molienda disponible. "
     "La conclusión es clara: el planteo de CEPREB es errado. Busca establecer una categorización de las empresas "
     "según su distancia al puerto que los datos no verifican. Todas las plantas tienen, en un radio de cien "
     "kilómetros, o de hasta doscientos cincuenta en las zonas más aisladas, aceite suficiente para cubrir su "
     "producción anual; y la mayoría, para varias veces esa producción."),
]


def duracion(archivo: str) -> float:
    out = subprocess.run([FF, "-i", archivo], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", out)
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else 0.0


def duracion_voz(archivo: str) -> float:
    """Duración hasta el final de la voz, descontando el silencio final (mismo criterio que generar_locucion_elevenlabs)."""
    total = duracion(archivo)
    out = subprocess.run([FF, "-i", archivo, "-af", "silencedetect=n=-45dB:d=0.15", "-f", "null", "-"], capture_output=True, text=True).stderr
    inicios = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", out)]
    fines = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", out)]
    if inicios and (len(fines) < len(inicios) or fines[-1] >= total - 0.05):
        return round(min(total, inicios[-1] + 0.1), 1)
    return total


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
            dur = duracion_voz(wav)  # hasta donde termina de hablar (el silencio final del mp3 no cuenta)
            estado = "OK" if dur <= fin - t0 else "SE PASA"
            print(f"bloque {i:2d} @ {t0:6.1f} s  habla {dur:5.1f} s  espacio {fin - t0:5.1f} s  {estado}")
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
