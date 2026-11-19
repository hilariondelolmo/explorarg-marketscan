#!/usr/bin/env python3
"""Cifras de la página "Situación al ..." (/situacion), edición del 19/11/2026.

Toma los hechos del artículo "Discurso vs. Realidad" (output/articulo-tres-empresas/hechos.json,
que hechos.py calcula desde src/data con corte a septiembre de 2026) y deja en
src/data/situacion_2026_11_19.json solo lo que usan los interactivos de la página.
No inventa ninguna cifra: si falta un dato en hechos.json, falla.

Uso:  python3 scripts/situacion_json.py
"""
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HECHOS = RAIZ / 'output/articulo-tres-empresas/hechos.json'
GRAFICOS = RAIZ / 'output/articulo-tres-empresas/graficos.json'
SALIDA = RAIZ / 'src/data/situacion_2026_11_19.json'

NOMBRES = {
    'GRUPO BOJANICH': 'Grupo Bahía Energía (Bojanich)',
    'GRUPO ROSARIO BIO': 'Grupo Rosario Bio',
    'GRUPO CREMER': 'Grupo Cremer',
    'GRUPO BOLZAN': 'Grupo Bolzan',
    'EXPLORA S.A.': 'Explora',
    'UNITEC BIO S.A.': 'Unitec Bio',
    'DIASER S.A.': 'Diaser',
    'PAMPA BIO S.A.': 'Pampa Bio',
    'ENRESA': 'Enresa',
    'AOM S.A.': 'AOM',
    'ARIPAR S.A.': 'Aripar',
    'ERA S.A.': 'ERA',
    'DOBLE L S.A.': 'Doble L',
    'AGRO M Y G S.A.': 'Agro M y G',
}
TRES = ['UNITEC BIO S.A.', 'EXPLORA S.A.', 'DIASER S.A.']
TOPE = 50000


def main():
    h = json.loads(HECHOS.read_text())
    g = json.loads(GRAFICOS.read_text())
    diez = h['diez']

    oferentes = []
    for clave, d in h['grupos'].items():
        grupo = d['n'] > 1
        cap = d['cap']
        # Media sanción, art. 39 a): i) por empresa, 10% con máximo de 50.000 t; ii) por grupo, 10%.
        con_tope = min(cap, diez) if grupo else min(cap, diez, TOPE)
        sin_tope = min(cap, diez)
        oferentes.append({
            'id': clave, 'nombre': NOMBRES[clave], 'grupo': grupo, 'sociedades': d['n'],
            'tres': clave in TRES, 'capacidad': round(cap), 'ventas12': d['vc'],
            'con_tope': round(con_tope), 'sin_tope': round(sin_tope),
            # 18 meses de adecuación: el límite por grupo no se aplica; queda la capacidad registrada.
            'adecuacion': round(cap) if grupo else round(con_tope),
        })
    assert len(oferentes) == 14 and sum(o['sociedades'] for o in oferentes) == h['n_ni'] == 24
    assert abs(sum(min(o['capacidad'], diez) if o['grupo'] else min(o['capacidad'], diez, TOPE) for o in oferentes) - h['topes_ms']) < 1
    assert abs(sum(min(o['capacidad'], diez) for o in oferentes) - h['topes_sin_max']) < 1
    assert sum(o['adecuacion'] for o in oferentes) == round(h['oferta_plazo_con_max'])

    esc = g['escenarios']
    escenarios = [
        {'id': 'bahia', 'nombre': 'Grupo Bahía Energía (Bojanich)',
         'hoy': h['boj_vc12'], 'mejor': round(h['e1_boj']), 'probable': round(h['boj_cap'])},
        {'id': 'tres', 'nombre': 'Unitec Bio, Explora y Diaser',
         'hoy': esc['tres'][0], 'mejor': esc['tres'][1], 'probable': esc['tres'][2]},
        {'id': 'chicas', 'nombre': 'ERA, Doble L y Agro M y G',
         'hoy': h['chicas_vc12'], 'mejor': round(h['chicas_cap']), 'probable': 0},
        {'id': 'demas', 'nombre': 'Las demás no integradas',
         'hoy': esc['demas'][0], 'mejor': round(esc['demas'][1]), 'probable': esc['demas'][2]},
    ]
    assert sum(e['hoy'] for e in escenarios) == h['vc12_ni']
    for k in ('mejor', 'probable'):
        assert abs(sum(e[k] for e in escenarios) - h['seg1']) < 2, k

    tres = [{
        'id': k, 'nombre': NOMBRES[k], 'capacidad': round(h['tres'][k]['cap']),
        'abril_2010': round(h['tres'][k]['abril_2010']), 'perdio': round(h['tres'][k]['perdio']),
        'ventas_2011': h['tres'][k]['anual']['2011'][0], 'ventas_2025': h['tres'][k]['anual']['2025'][0],
    } for k in TRES]
    assert sum(t['ventas_2011'] for t in tres) == h['bloques']['2011']['tres']
    assert abs(sum(t['ventas_2025'] for t in tres) - h['bloques']['2025']['tres']) <= 1
    assert sum(t['perdio'] for t in tres) == round(h['tres_perdio'])

    salida = {
        '_': 'Generado por scripts/situacion_json.py desde output/articulo-tres-empresas/hechos.json. No editar a mano.',
        'corte_datos': 'septiembre de 2026',
        'segmento': round(h['seg1']),
        'diez': round(diez),
        'tope': TOPE,
        'pierde_cada_una': round(h['pierde_cada_una']),
        'pct_tope': h['pct_50000'],
        'faltante_con_tope': round(h['faltante_ms']),
        'faltante_sin_tope': round(h['faltante_sin_max']),
        'corte_posible': h['corte_posible'],
        'crece_mercado': round(h['crece_mercado']),
        'ventas12_ni': h['vc12_ni'],
        'oferentes': oferentes,
        'escenarios': escenarios,
        'tres': tres,
        'tres_perdio': round(h['tres_perdio']),
        'bloques': {a: h['bloques'][a] for a in ('2011', '2025')},
        'totales': {'2011': h['tot_2011'], '2025': h['tot_2025']},
    }
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, indent=1) + '\n')
    print(f'{SALIDA.relative_to(RAIZ)}: {len(oferentes)} oferentes, segmento {salida["segmento"]:,} t, 10% = {salida["diez"]:,} t')


if __name__ == '__main__':
    main()
