#!/usr/bin/env python3
"""Miniaturas de enlace (Open Graph): una imagen 1200x630 por sección.

Toma la imagen de marca (public/brand/og-explorarg.png) y le escribe al pie el
título de la sección, alineado a la derecha en verde agua, bajo una línea tenue
(diseño "E", elegido por HDO el 15/11/2026).

Entrada:  scripts/miniaturas.json (páginas) y src/data/dicho_dato.json (episodios).
Salida:   public/og/<slug>.png, donde slug = ruta sin la barra inicial y con
          "-" en lugar de "/". El HTML por ruta lo arma scripts/og_html.mjs al
          final de `npm run build`.

Uso:  python3 scripts/generar_miniaturas.py
Necesita Pillow y la tipografía Inter instalada (~/Library/Fonts/Inter-Variable.ttf).
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
BASE = RAIZ / 'public/brand/og-explorarg.png'
SALIDA = RAIZ / 'public/og'
INTER = Path.home() / 'Library/Fonts/Inter-Variable.ttf'

VERDE = (58, 222, 193)
LINEA = (40, 110, 98)
X_DER = 1160          # borde derecho del logotipo
X_LOGO = 270          # borde izquierdo de la palabra EXPLORARG
X_MIN = 40            # borde izquierdo del isotipo: lo más a la izquierda que puede llegar un título largo
Y_LINEA = 462
TAMANOS = [52, 48, 44, 40, 36, 32, 28]


def fuente(tam):
    f = ImageFont.truetype(str(INTER), tam)
    f.set_variation_by_name('Bold')
    return f


def partir(d, texto, f, ancho):
    """Parte en renglones respetando los saltos puestos a mano."""
    renglones = []
    for parte in texto.split('\n'):
        actual = ''
        for palabra in parte.split():
            prueba = f'{actual} {palabra}'.strip()
            if actual and d.textlength(prueba, font=f) > ancho:
                renglones.append(actual)
                actual = palabra
            else:
                actual = prueba
        renglones.append(actual)
    return renglones


def miniatura(titulo, destino):
    im = Image.open(BASE).convert('RGB')
    d = ImageDraw.Draw(im)
    # Un renglón si entra bajo el logotipo; si no, hasta dos, achicando la letra.
    for tam in TAMANOS:
        f = fuente(tam)
        ancho = (X_DER - X_LOGO) if tam >= 44 else (X_DER - X_MIN)
        renglones = partir(d, titulo, f, ancho)
        if len(renglones) <= 2 and (len(renglones) == 1 or tam <= 44):
            break
    else:
        print(f'  ojo: no entra en dos renglones: {titulo!r}', file=sys.stderr)
    anchos = [d.textlength(r, font=f) for r in renglones]
    x_linea = min(X_LOGO, X_DER - max(anchos))
    d.line([(x_linea, Y_LINEA), (X_DER, Y_LINEA)], fill=LINEA, width=2)
    interlinea = round(tam * 1.25)
    y = 505 if len(renglones) == 1 else 490
    for r, w in zip(renglones, anchos):
        d.text((X_DER - w, y), r, font=f, fill=VERDE)
        y += interlinea
    im.save(destino, optimize=True)


def slug(ruta):
    return ruta.strip('/').replace('/', '-')


def lista():
    """(ruta, título para la imagen). La misma lista la arma og_html.mjs."""
    conf = json.loads((RAIZ / 'scripts/miniaturas.json').read_text(encoding='utf-8'))
    items = [(p['ruta'], p['titulo']) for p in conf['paginas']]
    dd = json.loads((RAIZ / 'src/data/dicho_dato.json').read_text(encoding='utf-8'))
    for e in dd['episodios']:
        items.append((f"/del-dicho-al-dato/{e['n']}", f"Del dicho al dato - {e['n']}\n«{e['cita']}»"))
    return items


def main():
    if not INTER.exists():
        sys.exit(f'Falta la tipografía Inter: {INTER}')
    SALIDA.mkdir(parents=True, exist_ok=True)
    items = lista()
    esperados = set()
    for ruta, titulo in items:
        destino = SALIDA / f'{slug(ruta)}.png'
        miniatura(titulo, destino)
        esperados.add(destino.name)
    for viejo in SALIDA.glob('*.png'):
        if viejo.name not in esperados:
            viejo.unlink()
            print(f'  borrada (ya no está en la lista): {viejo.name}')
    print(f'{len(items)} miniaturas en {SALIDA.relative_to(RAIZ)}/')


if __name__ == '__main__':
    main()
