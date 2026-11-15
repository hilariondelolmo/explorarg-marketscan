"""Láminas animadas para los videos de explorarg (noviembre de 2026).

Toma la maqueta HTML de una lámina (la misma de los videos de láminas fijas, con sus data-paso) y un plan de tiempos, y
devuelve el segmento mp4 con la lámina construyéndose: cada paso aparece a su hora (la del guion), las barras crecen hasta su
valor, las cifras cuentan, el sello cae. El guion, las voces y la línea de tiempo no cambian: solo la imagen.

Piezas: motor.js (se inyecta en la maqueta; render(T) deja la lámina como está en el segundo T), grabar.mjs (Playwright con el
Chrome local saca un PNG por cuadro solo en los tramos donde algo se mueve) y acá el armado del HTML, la grabación y la
codificación con ffmpeg (misma receta x264 que los videos de láminas fijas).

    seg = segmento(src_html, dir_maqueta, plan, out_mp4, X264, tmp)
    plan = dict(W=1920, H=1080, fps=30, dur=51.3, pasos=[dict(t=0.1, sel=['[data-paso="1"]', ...]), dict(t=23.3, sel='resto')],
                entrada='anterior' | 'blanco' | 'ninguna', png_anterior='/ruta/ultimo.png', t_entrada=0.5, salida_blanco=False, t_salida=0.8)
"""
from __future__ import annotations
import hashlib, json, shutil, subprocess, time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
MOTOR = AQUI / "motor.js"
GRABAR = AQUI / "grabar.mjs"
NODE = shutil.which("node") or "/usr/local/bin/node"


def firma(obj) -> str:
    return hashlib.sha1(json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()


def html_animado(src: str, plan: dict) -> str:
    """Inyecta en la maqueta los velos (imagen anterior y blanco), el plan y el motor."""
    velos = ""
    if plan.get("entrada") == "anterior" and plan.get("png_anterior"):
        velos += f'<img id="__ovl_prev" src="file://{plan["png_anterior"]}" style="position:fixed;left:0;top:0;width:{plan["W"]}px;height:{plan["H"]}px;z-index:9999;pointer-events:none;display:none">'
    velos += '<div id="__ovl_blanco" style="position:fixed;inset:0;background:#fff;z-index:10000;pointer-events:none;display:none"></div>'
    plan_js = json.dumps({k: v for k, v in plan.items() if k != "png_anterior"}, ensure_ascii=False)
    cola = f"{velos}\n<script>window.__PLAN={plan_js};</script>\n<script>{MOTOR.read_text(encoding='utf-8')}</script>\n"
    assert "</body>" in src, "la maqueta no tiene </body>"
    return src.replace("</body>", cola + "</body>")


def grabar(html: Path, plan: dict, carpeta: Path) -> dict:
    carpeta.mkdir(parents=True, exist_ok=True)
    plan_json = carpeta / "plan.json"
    plan_json.write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
    r = subprocess.run([NODE, str(GRABAR), str(html), str(plan_json), str(carpeta)], capture_output=True, text=True, timeout=1800)
    if r.returncode != 0:
        raise RuntimeError(f"grabar.mjs falló para {html.name}:\n{r.stderr[-3000:]}")
    if r.stderr.strip():
        print("    aviso del grabador:", r.stderr.strip()[-500:])
    return json.loads(r.stdout.strip().splitlines()[-1])


def codificar(carpeta: Path, plan: dict, out_mp4: Path, ff: str, x264: list[str]):
    n = round(plan["dur"] * plan["fps"])
    cmd = [ff, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(carpeta / "frames.txt"),
           "-vf", f"fps={plan['fps']},format=yuv420p,setsar=1", "-frames:v", str(n)] + x264 + [str(out_mp4)]
    subprocess.run(cmd, check=True)


def segmento(src: str, dir_maqueta: Path, plan: dict, out_mp4: Path, ff: str, x264: list[str], tmp: Path, nombre: str, guardar_cuadros=False) -> dict:
    """Arma el HTML animado, lo graba y lo codifica. Cachea por firma (maqueta + plan + motor + grabador): si nada cambió, no hace nada."""
    f = firma([src, plan, MOTOR.read_text(encoding="utf-8"), GRABAR.read_text(encoding="utf-8"), x264])
    marca = out_mp4.with_suffix(out_mp4.suffix + ".firma")
    if out_mp4.exists() and marca.exists() and marca.read_text() == f:
        return dict(cache=True)
    t0 = time.time()
    html = dir_maqueta / f"_anim_tmp_{nombre}.html"      # en la carpeta de la maqueta, para que css e img relativos resuelvan
    html.write_text(html_animado(src, plan), encoding="utf-8")
    carpeta = tmp / nombre
    try:
        info = grabar(html, plan, carpeta)
        codificar(carpeta, plan, out_mp4, ff, x264)
    finally:
        html.unlink(missing_ok=True)
        if not guardar_cuadros:
            for p in carpeta.glob("c*.png"):
                p.unlink()
    marca.write_text(f)
    info["segundos"] = round(time.time() - t0)
    return info
