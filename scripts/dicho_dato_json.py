#!/usr/bin/env python3
"""Saca de la serie de videos «Del dicho al dato» el JSON que usa el área del sitio (/del-dicho-al-dato).

La serie vive en `output/video-dicho-dato/` (ignorado por git): un archivo por episodio (`episodios/epNN.py`), lo común en `kit.py`, los textos de YouTube
en `youtube.py` y los ids en `youtube_ids.json`. El sitio no puede importar de ahí, así que este paso copia a `src/data/dicho_dato.json` lo que la página
muestra, para que el texto no se escriba dos veces ni se desincronice de los videos:

  - la cita, quién la dijo, dónde y en qué minuto (`CLIPS`, `youtube.QUIEN`);
  - el sello y el resumen del dato con las cifras en números (`youtube.YT`);
  - cada pantalla del video, en su estado final, con su fuente al pie (`BLOQUES`). El HTML de la pantalla está hecho para 1080x1920: acá se le sacan los
    tamaños, se le antepone `ddv-` a cada clase (para que no choque con las del sitio) y `<h1>` pasa a ser `<div class="ddv-tit">`;
  - el pedido a Diputados en los episodios que lo llevan (`youtube.PEDIDO`), las fuentes, el id de YouTube y la duración del corto.

También copia las miniaturas (`~/Desktop/Subir a YouTube - Del dicho al dato/NN - .../miniatura.jpg`) achicadas a `public/dicho-dato/NN.jpg` (episodio)
y `NN-ch.jpg` (índice).

Uso:  python3 scripts/dicho_dato_json.py            (escribe el JSON y las miniaturas que falten o hayan cambiado)
      python3 scripts/dicho_dato_json.py --dry-run  (solo muestra el resumen)

No commitea: publicar lo decide HDO. Si se corrige un episodio, volver a correr este script después de `serie.py todo` y `youtube.py N`.
"""
from __future__ import annotations
import sys, re, json, html, importlib, subprocess, shutil
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SERIE_DIR = REPO / "output" / "video-dicho-dato"
SALIDA = REPO / "src" / "data" / "dicho_dato.json"
MINIS = REPO / "public" / "dicho-dato"
ESCRITORIO = Path.home() / "Desktop" / "Subir a YouTube - Del dicho al dato"
DRY = "--dry-run" in sys.argv

if not SERIE_DIR.exists():
    sys.exit(f"No está {SERIE_DIR}: la serie vive fuera de git, en la Mac de HDO.")
sys.path.insert(0, str(SERIE_DIR))
sys.argv = ["x"]                      # youtube.py lee sys.argv al importarse
import kit as K        # noqa: E402
import youtube as Y    # noqa: E402

# Pantallas que la página no repite: el sello a pantalla llena (va en el encabezado), el pedido a Diputados (va en su recuadro) y la tarjeta de la serie.
SALTEAR = {"v1", "k1", "k2", "z1"}
# El sello de cada episodio, agrupado para el filtro del índice (la cuenta de la playlist: veinte falsas, dos doble vara, dos arbitrariedades...).
GRUPO_SELLO = {"FALSO": "Falso", "DOBLE VARA": "Doble vara", "ARBITRARIEDAD REGULATORIA": "Arbitrariedad regulatoria", "SIN EFECTO": "Arbitrariedad regulatoria"}
ETIQUETAS_OK = {"div", "span", "b", "i", "small", "mark", "br"}


class Limpia(HTMLParser):
    """El HTML de una pantalla, sin tamaños ni estilos del video: clases con prefijo `ddv-`, lo oculto a la vista, `<h1>` como `<div class="ddv-tit">`."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.pila: list[str | None] = []     # etiqueta de cierre que le toca a cada apertura (None: no se emitió)
        self.raras: set[str] = set()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        originales = (a.get("class") or "").split()
        clases = [c for c in originales if c != "o"]       # "o" = todavía no entró: en la página se ve todo
        estilo = a.get("style") or ""
        if tag == "br":                    # los renglones están cortados para la pantalla vertical: en la página el texto corre
            self.out.append(" ")
            return
        if tag == "h1":
            tag, clases = "div", ["tit"] + clases        # "tit" y no "h": `.sello.h` ya es el sello hueco del video
        elif tag not in ETIQUETAS_OK:
            self.raras.add(tag)
            tag = "span"
        if "text-transform:none" in estilo.replace(" ", ""):
            clases.append("min")
        ancho = re.search(r"width:\s*([\d.]+)%", estilo)
        if tag == "div" and originales == ["o"] and not ancho:      # el envoltorio de `ver()`: no agrega nada (un <div> sin clase sí: es una columna de `.par`)
            self.pila.append(None)
            return
        attr = (f' class="{" ".join("ddv-" + c for c in clases)}"' if clases else "") + (f' style="width:{ancho.group(1)}%"' if ancho else "")
        self.out.append(f"<{tag}{attr}>")
        self.pila.append(tag)

    def handle_endtag(self, tag):
        if tag == "br" or not self.pila:
            return
        t = self.pila.pop()
        if t:
            self.out.append(f"</{t}>")

    def handle_data(self, data):
        self.out.append(html.escape(data, quote=False))


def limpiar(cuerpo: str) -> tuple[str, set[str]]:
    p = Limpia()
    p.feed(re.sub(r"<svg\b.*?</svg>", "", cuerpo, flags=re.S))       # el mapa del episodio 26 es un SVG para el video: la página enlaza al Mapa del recinto
    p.close()
    return "".join(p.out), p.raras


def texto(cuerpo: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", cuerpo))).strip()


def pantallas(E) -> list[dict]:
    """Una entrada por pantalla: los estados sucesivos de una misma pantalla (mismo texto, con renglones todavía ocultos) cuentan una vez, en el último."""
    out: list[dict] = []
    for tanda in E.BLOQUES:
        for fr in tanda:
            pid, cuerpo, fuente = fr[1], fr[2], fr[4]
            if pid in SALTEAR:
                continue
            # Un clip de otro orador que entra después de esta pantalla (episodio 22: dos frases de Bullrich): la pantalla lo anuncia, así que la cita va en la tarjeta
            for c in getattr(E, "CLIPS_TRAS", {}).get(pid, []):
                if c.get("orador"):
                    o = K.ORADORES[c["orador"]]
                    cuerpo += (f'<div class="cita">{re.search("«[^»]+»", c["dicho"]).group(0)}</div>'
                               f'<div class="sub ch">{o["quien"]}. {o["donde"]}.</div>')
            firma = texto(cuerpo)
            nueva = dict(id=pid, _firma=firma, cuerpo=cuerpo, fuente=texto(fuente))
            if out and firma and (firma == out[-1]["_firma"] or firma.startswith(out[-1]["_firma"])):
                out[-1] = nueva
            else:
                out.append(nueva)
    res = []
    pregunta = None
    for i, p in enumerate(out):
        limpio, raras = limpiar(p["cuerpo"])
        if raras:
            print(f"   ojo, etiquetas no previstas en {p['id']}: {sorted(raras)}")
        # Una pantalla que es solo una pregunta ("¿Competencia?") no va como tarjeta propia: encabeza la tarjeta que la responde
        solo_titulo = re.fullmatch(r'<div class="ddv-tit[^"]*">.*?</div>', limpio, flags=re.S) and limpio.count("<div") == 1
        if solo_titulo and not p["fuente"] and p["_firma"].endswith("?") and pregunta is None and i + 1 < len(out):
            pregunta = p["_firma"]
            continue
        res.append(dict(id=p["id"], pregunta=pregunta, html=limpio, fuente=p["fuente"]))
        pregunta = None
    return res


def duracion(n: int) -> str | None:
    mp4 = SERIE_DIR / f"ep{n:02d}" / "video" / f"dicho-dato-{n:02d}.mp4"
    ffprobe = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
    if not mp4.exists() or not Path(ffprobe).exists():
        return None
    r = subprocess.run([ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp4)], capture_output=True, text=True)
    try:
        s = round(float(r.stdout.strip()))
    except ValueError:
        return None
    return f"{s // 60}:{s % 60:02d}"


def miniatura(n: int, E) -> bool:
    """Dos copias achicadas de la miniatura de YouTube (1080x1920): `NN.jpg`, de 480 px de ancho, para la página del episodio, y `NN-ch.jpg`, de 180 px,
    para el índice. Devuelve si existen en `public/`."""
    src = ESCRITORIO / f"{n:02d} - {K.ORADORES[E.ORADOR]['corto']} - {E.ARCHIVO}" / "miniatura.jpg"
    copias = [(MINIS / f"{n:02d}.jpg", "854", "72"), (MINIS / f"{n:02d}-ch.jpg", "320", "70")]
    for dst, alto, calidad in copias:
        if src.exists() and not DRY and (not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime):
            MINIS.mkdir(parents=True, exist_ok=True)
            subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", calidad, "-Z", alto, str(src), "--out", str(dst)], capture_output=True, check=True)
    return all(dst.exists() for dst, _, _ in copias)


def episodio(n: int, ids: dict) -> dict:
    E = importlib.import_module(f"episodios.ep{n:02d}")
    yt = Y.YT[n]
    sello = yt.get("sello", Y.sello_yt(n, E))
    fuentes: list[str] = []
    for tanda in E.BLOQUES:
        for fr in tanda:
            f = texto(fr[4])
            if f and f not in fuentes:
                fuentes.append(f)
    if "fuentes" in yt:
        fuentes = [yt["fuentes"]]
    return dict(
        n=n, orador=E.ORADOR, tema=E.TEMA, cita=yt["cita"], sello=sello, sello_corto=Y.sello_yt(n, E), veredicto=GRUPO_SELLO.get(Y.sello_yt(n, E), "Otros veredictos"),
        dicho=" ".join(c["dicho"] for c in E.CLIPS),
        # Clips que entran en el medio del video (episodio 7): otra frase del orador, con su aclaración
        dicho_despues=[c["dicho"] for clips in getattr(E, "CLIPS_TRAS", {}).values() for c in clips if c.get("dicho")],
        quien=Y.QUIEN[E.ORADOR].format(reloj=E.CLIPS[0].get("reloj", "")),
        resumen=yt["resumen"], pedido=n in Y.PEDIDO, pantallas=pantallas(E), fuentes=fuentes,
        youtube=ids[n]["id"], duracion=duracion(n), borrador=E.BORRADOR, miniatura=miniatura(n, E),
    )


def main():
    ids = {d["n"]: d for d in json.loads((SERIE_DIR / "youtube_ids.json").read_text(encoding="utf-8"))}
    eps = [episodio(n, ids) for n in range(1, Y.TOTAL + 1)]
    for e in eps:
        assert e["borrador"] == ids[e["n"]]["borrador"], f"episodio {e['n']}: el borrador vigente ({e['borrador']}) no es el que está en YouTube ({ids[e['n']]['borrador']})"
    datos = dict(
        meta=dict(generado=datetime.now().strftime("%Y-%m-%d %H:%M"), nota="Generado por scripts/dicho_dato_json.py desde output/video-dicho-dato - no editar a mano",
                  total=Y.TOTAL, playlist="PLAZvJgHCG9cI"),
        serie=dict(titulo=K.SERIE, texto=Y.SERIE_TXT, cuenta=Y.PLAYLIST_DESC.split("\n\n")[1], firma="Hilarión Del Olmo - Presidente de Explora S.A."),
        pedido=dict(texto=Y.PEDIDO_TXT, fuente=K.F_PEDIDO),
        oradores={o: dict(nombre=Y.NOMBRE[o], quien=K.ORADORES[o]["quien"], de=K.ORADORES[o]["de"][0].upper() + K.ORADORES[o]["de"][1:]) for o in K.ORADORES},
        episodios=eps,
    )
    volcado = json.dumps(datos, ensure_ascii=False, indent=1) + "\n"
    assert "—" not in volcado and "–" not in volcado, "hay una raya larga en los textos (regla de HDO: guion corto)"
    print(f"{'N':>2}  {'orador':9} {'sello':28} {'dur':>5} {'pant':>4} {'yt':11} mini  cita")
    for e in eps:
        print(f"{e['n']:>2}  {Y.NOMBRE[e['orador']]:9} {e['sello'][:28]:28} {e['duracion'] or '-':>5} {len(e['pantallas']):>4} {e['youtube']:11} "
              f"{'sí' if e['miniatura'] else 'NO':4}  «{e['cita']}»")
    if DRY:
        print(f"\n(simulacro: no se escribió {SALIDA.relative_to(REPO)})")
        return
    SALIDA.write_text(volcado, encoding="utf-8")
    print(f"\n{SALIDA.relative_to(REPO)} · {len(eps)} episodios · {len(volcado) // 1024} KB · miniaturas en {MINIS.relative_to(REPO)}/")


if __name__ == "__main__":
    main()
