#!/usr/bin/env python3
"""Extrae los popups "Respaldo en datos" del HTML generado de la propuesta
a un JSON estructurado, para armar el Word con exportar_respaldo_docx.js.

Fuente única: src/content/propuesta-s80926pl.html (ya trae overrides,
cifras destacadas y orden final). Bloques por artículo, en orden:
kpis | flujo | p | imagen | chart | tabla.

Uso:  python3 scripts/exportar_respaldo_spec.py > <salida.json>
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

HTML = Path(__file__).resolve().parent.parent / 'src/content/propuesta-s80926pl.html'


class Nodo:
    def __init__(self, tag, attrs):
        self.tag = tag
        self.attrs = dict(attrs)
        self.hijos = []   # Nodo | str

    def clase(self):
        return self.attrs.get('class', '')

    def texto(self):
        out = []
        for h in self.hijos:
            out.append(h if isinstance(h, str) else h.texto())
        return ''.join(out)

    def buscar(self, pred):
        for h in self.hijos:
            if isinstance(h, Nodo):
                if pred(h):
                    yield h
                yield from h.buscar(pred)


class MiniDom(HTMLParser):
    """Arma un árbol simple de todo el documento."""
    VACIAS = {'img', 'br', 'hr'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.raiz = Nodo('raiz', [])
        self.pila = [self.raiz]

    def handle_starttag(self, tag, attrs):
        n = Nodo(tag, attrs)
        self.pila[-1].hijos.append(n)
        if tag not in self.VACIAS:
            self.pila.append(n)

    def handle_endtag(self, tag):
        for i in range(len(self.pila) - 1, 0, -1):
            if self.pila[i].tag == tag:
                del self.pila[i:]
                break

    def handle_data(self, data):
        if data:
            self.pila[-1].hijos.append(data)


def runs_de_parrafo(p):
    """[(texto, negrita)] preservando strong/em anidados como negrita."""
    runs = []

    def walk(n, bold):
        for h in n.hijos:
            if isinstance(h, str):
                if h:
                    runs.append([h, bold])
            elif h.tag in ('strong', 'b'):
                walk(h, True)
            else:
                walk(h, bold)
    walk(p, False)
    # colapsar corridas contiguas del mismo estilo
    comp = []
    for t, b in runs:
        if comp and comp[-1][1] == b:
            comp[-1][0] += t
        else:
            comp.append([t, b])
    return [[re.sub(r'\s+', ' ', t), b] for t, b in comp if t.strip()]


def tabla_de(nodo_tabla):
    filas = []
    for tr in nodo_tabla.buscar(lambda n: n.tag == 'tr'):
        celdas = []
        for c in tr.hijos:
            if isinstance(c, Nodo) and c.tag in ('td', 'th'):
                parrafos = [re.sub(r'\s+', ' ', p.texto()).strip()
                            for p in c.buscar(lambda n: n.tag == 'p')]
                parrafos = [p for p in parrafos if p] or \
                           [re.sub(r'\s+', ' ', c.texto()).strip()]
                celdas.append({'texto': '\n'.join(parrafos),
                               'encabezado': c.tag == 'th',
                               'rowspan': int(c.attrs.get('rowspan', 1))})
        if celdas:
            filas.append(celdas)
    return filas


def bloques_de_popup(pop):
    bloques = []
    for h in pop.hijos:
        if not isinstance(h, Nodo):
            continue
        cl = h.clase()
        if 'pl-kpis' in cl:
            bloques.append({'tipo': 'kpis', 'items': [
                {'valor': re.sub(r'\s+', ' ', next(k.buscar(lambda n: 'pl-kpi-valor' in n.clase())).texto()).strip(),
                 'label': re.sub(r'\s+', ' ', next(k.buscar(lambda n: 'pl-kpi-label' in n.clase())).texto()).strip(),
                 'neg': 'pl-kpi-neg' in k.clase(),
                 'compacto': 'pl-kpi-compacto' in k.clase()}
                for k in h.hijos if isinstance(k, Nodo) and 'pl-kpi' in k.clase()
            ]})
        elif 'pl-flujo' in cl and 'flecha' not in cl:
            pasos = []
            for p in h.hijos:
                if isinstance(p, Nodo) and 'pl-flujo-paso' in p.clase():
                    tit = next(p.buscar(lambda n: n.tag == 'strong')).texto()
                    det = next(p.buscar(lambda n: n.tag == 'span')).texto()
                    pasos.append({'titulo': tit.strip(), 'detalle': det.strip()})
            bloques.append({'tipo': 'flujo', 'pasos': pasos})
        elif h.tag == 'p':
            runs = runs_de_parrafo(h)
            if runs:
                bloques.append({'tipo': 'p', 'runs': runs})
        elif 'pl-imagen' in cl:
            img = next(h.buscar(lambda n: n.tag == 'img'))
            bloques.append({'tipo': 'imagen', 'src': img.attrs['src'],
                            'alt': img.attrs.get('alt', '')})
        elif 'pl-chart' in cl:
            bloques.append({'tipo': 'chart', 'id': h.attrs.get('data-chart')})
        elif 'pl-tabla-scroll' in cl:
            t = next(h.buscar(lambda n: n.tag == 'table'))
            bloques.append({'tipo': 'tabla', 'filas': tabla_de(t)})
    return bloques


def main():
    dom = MiniDom()
    dom.feed(HTML.read_text())
    pops = [n for n in dom.raiz.buscar(
        lambda n: 'pl-pop' in n.clase() and n.attrs.get('data-tipo') == 'hechos'
        and n.attrs.get('data-art', '').isdigit())]
    arts = []
    for p in sorted(pops, key=lambda n: int(n.attrs['data-art'])):
        arts.append({
            'nro': int(p.attrs['data-art']),
            'titulo': p.attrs.get('data-titulo', ''),
            'sub': p.attrs.get('data-sub', ''),
            'bloques': bloques_de_popup(p),
        })
    json.dump(arts, sys.stdout, ensure_ascii=False, indent=1)
    print(f"\n{len(arts)} artículos", file=sys.stderr)


if __name__ == '__main__':
    main()
