#!/usr/bin/env python3
"""Spec del dossier "Fundamentos + Respaldo en datos" de la PROPUESTA
OPTIMIZADA (rev1 del 27/08 sobre SE 260729).

A diferencia de exportar_dossier_spec.py (que tomaba Normas/Justificación
de un docx aparte), acá la fuente única es el blob del sitio
src/content/propuesta-optimizada.html: intro (Objeto y método / Marco /
Cuadro renumerado), y por artículo Normas + Justificación + Respaldo en
datos, ya con la numeración de la optimizada y los overrides aplicados
por generar_propuesta_optimizada.py.

Uso:  python3 scripts/exportar_dossier_optimizada_spec.py > dossier.json
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from exportar_respaldo_spec import MiniDom, bloques_de_popup  # noqa: E402

HTML = Path(__file__).resolve().parent.parent / 'src/content/propuesta-optimizada.html'

PORTADA = {
    'titulo': ('PROPUESTA DE LEY S80926PL - PROPUESTA OPTIMIZADA DEL '
               '27.08.2026 SOBRE VERSIÓN SE 260729'),
}


def runs_de_p(p):
    """[[texto, negrita]] de un <p> del blob (strong -> negrita)."""
    runs = []

    def walk(nodo, bold):
        for h in nodo.hijos:
            if isinstance(h, str):
                if h:
                    if runs and runs[-1][1] == bold:
                        runs[-1][0] += h
                    else:
                        runs.append([h, bold])
            else:
                walk(h, bold or h.tag == 'strong')
    walk(p, False)
    return [[' '.join(t.split()), b] for t, b in runs if t.strip()]


def parrafos_de(pop):
    """Párrafos del popup, excluyendo los que viven dentro de tablas
    (celdas de anexos) para no volcarlos como texto corrido."""
    out = []

    def walk(nodo, en_tabla):
        for h in nodo.hijos:
            if isinstance(h, str):
                continue
            if h.tag == 'table':
                walk(h, True)
            elif h.tag == 'p' and not en_tabla:
                runs = runs_de_p(h)
                if runs:
                    out.append(runs)
            else:
                walk(h, en_tabla)
    walk(pop, False)
    return out


def cuadro_crudo(html):
    """Filas del cuadro de correspondencia, por regex sobre el HTML crudo
    del popup (el árbol simplificado puede absorber tablas vecinas)."""
    import re
    i = html.find('data-tipo="cuadro"')
    fin = html.find('</table>', i)   # solo la tabla de correspondencia
    seg = html[i:fin if fin > 0 else None]
    filas = []
    for j, mtr in enumerate(re.finditer(r'<tr[^>]*>(.*?)</tr>', seg, re.S)):
        celdas = []
        for mtc in re.finditer(r'<t([dh])[^>]*>(.*?)</t\1>', mtr.group(1), re.S):
            texto = ' '.join(re.sub(r'<[^>]+>', ' ', mtc.group(2)).split())
            celdas.append({'texto': texto,
                           'encabezado': mtc.group(1) == 'h' or j == 0,
                           'rowspan': 1})
        if celdas:
            filas.append(celdas)
    return filas


def main():
    dom = MiniDom()
    dom.feed(HTML.read_text())
    pops = {}
    for n in dom.raiz.buscar(lambda n: 'pl-pop' in n.clase()):
        pops[(n.attrs.get('data-art'), n.attrs.get('data-tipo'))] = n

    intro = {
        'objeto': parrafos_de(pops[('intro', 'objeto')]),
        'marco': parrafos_de(pops[('intro', 'marco')]),
        'cuadro': cuadro_crudo(HTML.read_text()),
    }

    nros = sorted({int(a) for a, t in pops if a and a.isdigit()})
    arts = []
    for nro in nros:
        normas = pops.get((str(nro), 'normas'))
        just = pops.get((str(nro), 'just'))
        hechos = pops.get((str(nro), 'hechos'))
        if not (normas and just and hechos):
            sys.exit(f'ERROR: artículo {nro} incompleto en el blob')
        arts.append({
            'nro': nro,
            'titulo': normas.attrs['data-titulo'],
            'normas': parrafos_de(normas),
            'just': parrafos_de(just),
            'respaldo': bloques_de_popup(hechos),
        })

    json.dump({'portada': PORTADA, 'intro': intro, 'articulos': arts},
              sys.stdout, ensure_ascii=False, indent=1)
    print(f"\n{len(arts)} artículos · intro: objeto {len(intro['objeto'])}p, "
          f"marco {len(intro['marco'])}p, cuadro {len(intro['cuadro'])} filas",
          file=sys.stderr)


if __name__ == '__main__':
    main()
