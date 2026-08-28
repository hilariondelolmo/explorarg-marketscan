#!/usr/bin/env python3
"""Genera src/content/propuesta-optimizada.html desde el docx rev0 de HDO.

Propuesta optimizada (27/08): versión breve para la discusión del dictamen,
control de cambios sobre el texto base SE_260729 del Proyecto S-0809/2026.
Mismo criterio visual que la página de la propuesta completa: texto final =
orig + ins (los del se descartan), inserciones como <ins> rojo subrayado.
Sin obleas ni popups: esta versión no tiene informe punto a punto.

Reutiliza el parseo/render de scripts/generar_propuesta_html.py.
"""
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from generar_propuesta_html import (  # noqa: E402
    extraer, fusionar_encabezados, render_p, render_runs, render_tabla,
    texto_final,
)

CARPETA = ('/Users/hilariondelolmo/Desktop/01. Notas, articulos/Ley Ejecutivo/'
           'Finales/Propuestas Secretaria de Energia/Ultima Version/')
DOCX = CARPETA + '2026.08.27 Propuesta ley S80926PL SE_260729 cc HDO rev1.docx'
SALIDA = str(Path(__file__).parent.parent / 'src/content/propuesta-optimizada.html')
BLOB_COMPLETA = str(Path(__file__).parent.parent / 'src/content/propuesta-s80926pl.html')

# La numeración de la propuesta optimizada es la del texto base SE_260729
# (44 artículos); la propuesta completa (y su informe) usan la numeración
# del cc del 11/08, que insertaba dos artículos nuevos (15 Registro y
# 20 Integradas) y corría el resto. Mapeo: artículo optimizada -> artículo
# del informe cuyo popup le corresponde. Los cc 15 y 20 quedaron fusionados
# dentro de los arts. 14 y 39 y no tienen oblea propia.
ART_A_INFORME = {
    3: 3, 5: 5, 6: 6, 10: 10, 12: 12, 13: 13, 14: 14,
    15: 16,   # Mercado a término
    16: 17,   # Precios de referencia de paridad
    18: 19,   # Co-procesamiento
    24: 26,   # Importaciones
    31: 33,   # Infracciones
    34: 36,   # Exención tributaria
    36: 38,   # Definiciones del Período de Transición
    37: 39,   # Funciones durante la transición y prórroga
    38: 40,   # Tabla de cupos
    39: 41,   # Pautas
    40: 42,   # Derogación
}


# Filas del cuadro de correspondencia: numeración del informe -> optimizada.
# cc15 (Registro) y cc20 (Integradas) quedaron fusionados dentro de los
# arts. 14 y 39: sus filas se remapean ahí (dos filas pueden compartir
# número). La fila cc28 (Fiscalización del sistema de créditos) se elimina:
# esa modificación no existe en la versión optimizada.
CC_A_BASE = {cc: base for base, cc in ART_A_INFORME.items()}
CC_A_BASE.update({15: 14, 20: 39})
CC_ELIMINADAS = {28}


def remapear_cuadro(pop):
    """Renumera las filas del cuadro (data-art y celda del número), quita
    las de modificaciones que no están en la optimizada y reordena por el
    número nuevo."""
    filas = list(re.finditer(r'<tr class="pl-cuadro-fila"[^>]*data-art="(\d+)">.*?</tr>',
                             pop, re.S))
    if not filas:
        return pop
    nuevas = []
    for orden, m in enumerate(filas):
        cc = int(m.group(1))
        if cc in CC_ELIMINADAS:
            continue
        base = CC_A_BASE[cc]
        fila = m.group(0)
        fila = fila.replace(f'data-art="{cc}"', f'data-art="{base}"', 1)
        rotulo = f'{base}°' if base < 10 else str(base)
        fila = re.sub(r'(<td><p>)\d+°?(</p></td>)', rf'\g<1>{rotulo}\g<2>', fila, count=1)
        nuevas.append((base, orden, fila))
    nuevas.sort()
    cuerpo = ''.join(f for _, _, f in nuevas)
    return pop[:filas[0].start()] + cuerpo + pop[filas[-1].end():]


def extraer_popups_remapeados():
    """Extrae del blob de la propuesta completa los popups pl-pop de los
    artículos del informe y los re-etiqueta con la numeración optimizada
    (data-art y el número del data-titulo). El cuerpo de cada popup queda
    tal cual: puede citar números de la numeración del cc."""
    blob = open(BLOB_COMPLETA, encoding='utf-8').read()

    def bloque_div(desde):
        nivel = 0
        i = desde
        while True:
            m = re.search(r'<div\b|</div>', blob[i:])
            if not m:
                raise ValueError('div sin cierre')
            i += m.start()
            if blob[i:i + 4] == '<div':
                nivel += 1
                i += 4
            else:
                nivel -= 1
                i += len('</div>')
                if nivel == 0:
                    return blob[desde:i]

    popups = {}
    for m in re.finditer(r'<div class="pl-pop" data-art="(\d+)" data-tipo="(\w+)"', blob):
        popups[(int(m.group(1)), m.group(2))] = bloque_div(m.start())

    out = []
    for base, cc in ART_A_INFORME.items():
        for tipo in ('normas', 'just', 'hechos'):
            pop = popups.get((cc, tipo))
            if not pop:
                continue
            pop = pop.replace(f'data-art="{cc}"', f'data-art="{base}"', 1)
            pop = re.sub(r'(data-titulo="Artículo )(\d+)(°?)',
                         lambda m2: m2.group(1) + str(base) + ('°' if base < 10 else ''),
                         pop, count=1)
            out.append(pop)

    # popups de introducción (Objeto y método / Marco normativo / Cuadro /
    # Criterio): el cuadro se renumera; los demás solo citan normas (CN,
    # leyes) o el art. 2°, que conserva su número
    for m in re.finditer(r'<div class="pl-pop" data-art="intro" data-tipo="(\w+)"', blob):
        tipo = m.group(1)
        if tipo not in ('objeto', 'marco', 'cuadro', 'cierre'):
            continue
        pop = bloque_div(m.start())
        if tipo == 'cuadro':
            pop = remapear_cuadro(pop)
        out.append(pop)
    return out


def generar(bloques):
    out = []
    abierta = None   # nro de artículo abierto

    def cerrar():
        nonlocal abierta
        if abierta is None:
            return
        if abierta in ART_A_INFORME:
            out.append(
                '<div class="pl-obleas">'
                f'<button type="button" class="pl-oblea pl-oblea-normas" data-art="{abierta}" data-tipo="normas">'
                'Normas que viola el proyecto oficial</button>'
                f'<button type="button" class="pl-oblea pl-oblea-just" data-art="{abierta}" data-tipo="just">'
                'Justificación de la modificación</button>'
                f'<button type="button" class="pl-oblea pl-oblea-hechos" data-art="{abierta}" data-tipo="hechos">'
                'Respaldo en datos</button>'
                '</div>')
        out.append('</section>')
        abierta = None

    for b in bloques:
        if b['tipo'] == 'tabla':
            out.append(render_tabla(b))
            continue
        txt = texto_final(b['runs']).strip()
        if not txt:
            continue
        style = b['style']
        m = re.match(r'ART[IÍ]CULO\s+(\d+)', txt)
        if m:
            cerrar()
            nro = int(m.group(1))
            abierta = nro
            clases = 'pl-art' + (' pl-art-informe' if nro in ART_A_INFORME else '')
            out.append(f'<section class="{clases}" id="art-{nro}">')
            out.append(render_p(b, 'pl-art-p1'))
            continue
        if style == 'Heading1':
            cerrar()
            out.append(f'<h2 class="pl-titulo">{render_runs(b["runs"])}</h2>')
            continue
        if style == 'Heading2':
            cerrar()
            out.append(f'<h3 class="pl-capitulo">{render_runs(b["runs"])}</h3>')
            continue
        if abierta is None:
            if txt == 'PROYECTO DE LEY':
                out.append(f'<p class="pl-rotulo">{html.escape(txt)}</p>')
            elif re.match(r'\(S-', txt):
                out.append(f'<p class="pl-expediente">{html.escape(txt)}</p>')
            else:
                out.append(render_p(b))
            continue
        out.append(render_p(b))
    cerrar()
    return '\n'.join(out)


def main():
    ley = generar(fusionar_encabezados(extraer(DOCX)))
    popups = extraer_popups_remapeados()
    doc = (
        '<!-- Generado desde el docx rev1 de HDO (propuesta optimizada,\n'
        '     cc 27/08 sobre SE_260729). Los popups de las obleas provienen\n'
        '     del blob de la propuesta completa (numeración remapeada).\n'
        '     Script: scripts/generar_propuesta_optimizada.py — no editar a\n'
        '     mano los textos legales; regenerar desde el docx. -->\n'
        f'<div class="pl-ley">\n{ley}\n</div>\n'
        f'<div class="pl-popups" hidden>\n{chr(10).join(popups)}\n</div>\n'
    )
    with open(SALIDA, 'w') as f:
        f.write(doc)
    print(f'OK → {SALIDA}')
    print(f'  <ins>: {doc.count("<ins>")} · obleas: {doc.count("pl-oblea ")} · '
          f'popups: {len(popups)} · tablas: {doc.count("pl-tabla-scroll")} · '
          f'charts: {doc.count("pl-chart")}')


if __name__ == '__main__':
    main()
