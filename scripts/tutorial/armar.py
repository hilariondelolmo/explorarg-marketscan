#!/usr/bin/env python3
"""Arma el mp4 de un tutorial: recorta el video crudo de grabar.mjs, le pega la
locución en el tiempo de cada paso (tiempos.json) y exporta 1080p y 720p. También
escribe el guion en markdown (output/tutorial/<id>/guion.md) con el minuto de cada
paso, lo que se ve y el texto literal de la voz.

Uso:
    python3 scripts/tutorial/armar.py gasoil              # con la voz de output/tutorial/gasoil/voz/
    python3 scripts/tutorial/armar.py gasoil --sin-voz    # solo el video (borrador mudo)
    python3 scripts/tutorial/armar.py gasoil --solo-guion # solo el markdown
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent.parent
AQUI = Path(__file__).resolve().parent


def mmss(s: float) -> str:
    s = max(0, int(round(s)))
    return f"{s // 60}:{s % 60:02d}"


def resumen_accion(a: dict) -> str:
    t = a.get("tipo")
    sel = a.get("sel")
    obj = sel if isinstance(sel, str) else (sel or {}).get("texto") or (sel or {}).get("sel") or ""
    if t == "click":
        return f"clic en «{obj}»"
    if t in ("hover", "mover"):
        return f"mouse sobre «{obj}»"
    if t == "select":
        return f"elige «{a.get('etiqueta') or a.get('valor')}» en {obj}"
    if t == "escribir":
        return f"escribe «{a.get('texto')}»"
    if t == "resaltar":
        return f"resalta {obj}"
    if t == "scroll":
        return "vuelve arriba" if a.get("arriba") else f"baja hasta {obj or a.get('dy')}"
    if t == "cartel":
        return f"placa «{a.get('titulo')}»"
    if t == "rotulo":
        return f"rótulo «{a.get('texto')}»" if a.get("texto") else "saca el rótulo"
    if t == "tecla":
        return f"tecla {a.get('tecla')}"
    return ""


def guion_md(G: dict, tiempos: dict | None, destino: Path) -> None:
    lineas = [f"# Guion del tutorial: {G.get('titulo', G['id'])}", ""]
    lineas.append(f"Página: {G['url']}  ")
    if tiempos:
        lineas.append(f"Grabado: {tiempos.get('grabado', '')[:16].replace('T', ' ')} · duración {mmss(tiempos.get('duracionTutorial', 0))} · "
                      f"{'con la voz de Fernando' if tiempos.get('conVoz') else 'duraciones estimadas'}  ")
    lineas += ["", "Cada fila es un paso: el minuto en que empieza, lo que hace el cursor en pantalla y el texto literal de la locución.", ""]
    inicio = {p["id"]: p["inicio"] for p in (tiempos or {}).get("pasos", [])}
    for p in G["pasos"]:
        acc = [s for s in (resumen_accion(a) for a in p.get("acciones", [])) if s]
        t = mmss(inicio[p["id"]]) if p["id"] in inicio else "-"
        lineas.append(f"## {p['id']} · {t} · {p.get('titulo', '')}")
        lineas.append("")
        if acc:
            lineas.append("En pantalla: " + "; ".join(acc) + ".")
            lineas.append("")
        if p.get("texto"):
            lineas.append(f"> {p['texto']}")
            lineas.append("")
    lineas.append("---")
    lineas.append("")
    lineas.append("## Texto corrido de la locución")
    lineas.append("")
    for p in G["pasos"]:
        if p.get("texto"):
            lineas.append(f"[{p['id']}] {p['texto']}")
            lineas.append("")
    destino.write_text("\n".join(lineas))


def capitulos(G: dict, tiempos: dict) -> list[dict]:
    """Capítulos del video: un paso por capítulo, salvo los que el guion marca con
    "capitulo": false (se funden con el anterior) o renombra con "capitulo": "...".
    YouTube exige que el primero empiece en 0:00 y que cada uno dure 10 s como mínimo:
    los más cortos se funden con el anterior y se avisa."""
    inicio = {p["id"]: p["inicio"] for p in tiempos["pasos"]}
    caps = []
    for p in G["pasos"]:
        if p.get("capitulo") is False or p["id"] not in inicio:
            continue
        caps.append({"t": int(round(inicio[p["id"]])), "titulo": p.get("capitulo") or p.get("titulo") or p["id"]})
    if caps:
        caps[0]["t"] = 0
    fin = tiempos.get("duracionTutorial", 0)
    res = []
    for i, c in enumerate(caps):
        sig = caps[i + 1]["t"] if i + 1 < len(caps) else fin
        if res and sig - c["t"] < 10:
            print(f"ojo: el capítulo «{c['titulo']}» dura {sig - c['t']} s y se funde con el anterior (YouTube pide 10 s)")
            continue
        res.append(c)
    return res


def escribir_catalogo(G: dict, tiempos: dict, caps: list[dict], out: Path) -> None:
    """Deja la entrada del tutorial en src/data/tutoriales.json (lo lee el sitio: botón
    "Cómo se usa" y página /tutoriales) y el texto para la descripción de YouTube."""
    if not G.get("youtube"):
        print("sin «youtube» en el guion: no se escribe el catálogo del sitio")
        return
    ruta = RAIZ / "src" / "data" / "tutoriales.json"
    lista = json.loads(ruta.read_text()) if ruta.exists() else []
    entrada = {
        "id": G["id"], "titulo": G.get("titulo", G["id"]), "pagina": G.get("pagina"), "youtube": G["youtube"],
        "duracion": int(round(tiempos.get("duracionTutorial", 0))), "grabado": tiempos.get("grabado", "")[:10],
        "descripcion": G.get("descripcion", ""), "capitulos": caps,
    }
    lista = [e for e in lista if e.get("id") != G["id"]] + [entrada]
    ruta.write_text(json.dumps(lista, indent=1, ensure_ascii=False) + "\n")
    print(f"catálogo -> {ruta} ({len(lista)} tutorial{'es' if len(lista) != 1 else ''})")
    lineas = [f"Tutorial · {entrada['titulo']} · Explorarg Marketscan", "", entrada["descripcion"], ""]
    if G.get("pagina"):
        lineas += [f"La página: {G['url'].rstrip('/')}{G['pagina']}", ""]
    lineas += ["Capítulos"] + [f"{mmss(c['t'])} {c['titulo']}" for c in caps]
    (out / "youtube.txt").write_text("\n".join(lineas) + "\n")
    print(f"descripción para YouTube -> {out / 'youtube.txt'}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("id", help="id del guion (scripts/tutorial/guiones/<id>.json)")
    ap.add_argument("--sin-voz", action="store_true")
    ap.add_argument("--solo-guion", action="store_true")
    ap.add_argument("--crf", type=int, default=20)
    a = ap.parse_args()

    G = json.loads((AQUI / "guiones" / f"{a.id}.json").read_text())
    out = RAIZ / "output" / "tutorial" / a.id
    tiempos_path = out / "tiempos.json"
    tiempos = json.loads(tiempos_path.read_text()) if tiempos_path.exists() else None
    guion_md(G, tiempos, out / "guion.md")
    print(f"guion -> {out / 'guion.md'}")
    if tiempos:
        escribir_catalogo(G, tiempos, capitulos(G, tiempos), out)
    if a.solo_guion:
        return 0
    if not tiempos:
        sys.exit("falta tiempos.json: grabá primero con grabar.mjs")

    video = out / "video.webm"
    voz = out / "voz"
    duraciones = json.loads((voz / "duraciones.json").read_text()) if (voz / "duraciones.json").exists() else {}
    pasos_voz = [] if a.sin_voz else [p for p in tiempos["pasos"] if p.get("texto") and (voz / f"{p['id']}.mp3").exists()]
    faltan = [p["id"] for p in tiempos["pasos"] if p.get("texto") and not (voz / f"{p['id']}.mp3").exists()] if not a.sin_voz else []
    if faltan:
        print(f"ojo: sin mp3 para {', '.join(faltan)}")
    if not a.sin_voz and not tiempos.get("conVoz"):
        print("ojo: el video se grabó con duraciones estimadas, no con las de la voz; conviene regrabar")
    for p in pasos_voz:
        d = duraciones.get(p["id"])
        if d and d > p["fin"] - p["inicio"] + 0.05:
            print(f"ojo: {p['id']} la voz dura {d:.1f} s y el paso {p['fin'] - p['inicio']:.1f} s")

    desde = tiempos["videoDesde"]
    adelanto = tiempos.get("adelanto", 0.15)
    cmd = ["ffmpeg", "-y", "-v", "error", "-stats", "-i", str(video)]
    filtros = [f"[0:v]trim=start={desde:.3f},setpts=PTS-STARTPTS,fps=25,format=yuv420p[v]"]
    etiquetas = []
    for i, p in enumerate(pasos_voz, start=1):
        cmd += ["-i", str(voz / f"{p['id']}.mp3")]
        ms = int(round((p["inicio"] + adelanto) * 1000))
        filtros.append(f"[{i}:a]aresample=44100,aformat=channel_layouts=stereo,adelay={ms}:all=1[a{i}]")
        etiquetas.append(f"[a{i}]")
    salida = out / f"tutorial_{a.id}_1080p.mp4"
    if pasos_voz:
        filtros.append("".join(etiquetas) + f"amix=inputs={len(etiquetas)}:normalize=0:dropout_transition=0[a]")
        cmd += ["-filter_complex", ";".join(filtros), "-map", "[v]", "-map", "[a]",
                "-c:a", "aac", "-b:a", "160k"]
    else:
        cmd += ["-filter_complex", ";".join(filtros), "-map", "[v]", "-an"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", str(a.crf), "-movflags", "+faststart", str(salida)]
    subprocess.run(cmd, check=True)
    print(f"✓ {salida.name}")
    salida720 = out / f"tutorial_{a.id}_720p.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(salida), "-vf", "scale=1280:-2", "-c:v", "libx264", "-preset", "medium",
                    "-crf", str(a.crf + 2), "-c:a", "copy", "-movflags", "+faststart", str(salida720)], check=True)
    print(f"✓ {salida720.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
