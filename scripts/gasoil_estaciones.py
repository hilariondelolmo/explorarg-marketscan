#!/usr/bin/env python3
"""
Cantidad de estaciones (bocas) relevadas en cada celda del cruce fino del
relevamiento SE Res. 1104/2004 (public/data/gasoil_retail.json).

Sale de los datos por boca y mes (public/data/gasoil_bocas/*.json). Agrega
cuatro columnas al cruce, alineadas con sus filas:

  q2, q3   bocas con volumen de gas oil grado 2 / grado 3 en la celda
           (mes × provincia × bandera × canal distribución × tipo de negocio ×
           canal comercialización). Sirve con un canal de comercialización
           elegido.
  p2, p3   lo mismo, pero cada boca se cuenta una sola vez por mes: en la
           celda donde más vende. Sirve con todos los canales de
           comercialización a la vez, porque una boca que vende por varios
           canales (al público, agro, transporte) aparece en varias celdas y
           sumando q se contaría más de una vez.

La columna e2 del cruce (filas con precio surtidor) no sirve para esto: sumada
entre celdas cuenta de más (jul-2026: 5.060 contra 4.228 bocas distintas).

Lo llama regenerate_gasoil.py antes de escribir el cruce. Solo, recalcula las
columnas sobre los archivos ya generados, sin necesitar /Volumes/comun:

    python3 scripts/gasoil_estaciones.py [--dry-run]
"""

import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

PUB_DIR = Path(__file__).resolve().parent.parent / "public" / "data"
CELDA = ("mes", "prov", "band", "cd", "tn", "cc")
COLS_ESTACIONES = ["q2", "q3", "p2", "p3"]
NOTA_ESTACIONES = ("q = bocas con volumen en la celda; p = ídem, cada boca contada una sola vez por mes "
                   "(en la celda donde más vende): usar p con todos los canales de comercialización y q con uno solo")


def contar_estaciones(retail, partes):
    """Agrega q2, q3, p2 y p3 a `retail` (columnas del cruce fino) a partir de
    `partes` (lista de particiones columnares por boca y mes). Devuelve un
    resumen: bocas distintas por mes y grado, y filas de boca sin celda."""
    n = len(retail["mes"])
    fila = {tuple(retail[c][i] for c in CELDA): i for i in range(n)}
    en_celda = {g: defaultdict(set) for g in (2, 3)}   # fila → bocas con volumen
    mejor = {g: {} for g in (2, 3)}                    # (mes, boca) → (volumen, fila) de su celda principal
    sin_celda = 0
    for P in partes:
        for j in range(len(P["mes"])):
            i = fila.get(tuple(P[c][j] for c in CELDA))
            if i is None:
                sin_celda += 1
                continue
            boca = P["boca"][j]
            for g in (2, 3):
                w = P[f"w{g}"][j]
                if not w:
                    continue
                en_celda[g][i].add(boca)
                k = (P["mes"][j], boca)
                # a igual volumen gana la fila de menor índice, para que el resultado no dependa del orden de lectura
                if k not in mejor[g] or (w, -i) > (mejor[g][k][0], -mejor[g][k][1]):
                    mejor[g][k] = (w, i)
    por_mes = {}
    for g in (2, 3):
        q = [0] * n
        p = [0] * n
        for i, bocas in en_celda[g].items():
            q[i] = len(bocas)
        distintas = defaultdict(int)
        for (mes, _boca), (_w, i) in mejor[g].items():
            p[i] += 1
            distintas[mes] += 1
        retail[f"q{g}"] = q
        retail[f"p{g}"] = p
        por_mes[g] = dict(distintas)
    return dict(por_mes=por_mes, sin_celda=sin_celda)


def _main(dry):
    destino = PUB_DIR / "gasoil_retail.json"
    payload = json.loads(destino.read_text(encoding="utf-8"))
    archivos = sorted((PUB_DIR / "gasoil_bocas").glob("*.json"), key=lambda a: int(a.stem))
    if len(archivos) != payload["partes"]:
        sys.exit(f"Se esperaban {payload['partes']} particiones y hay {len(archivos)}")
    partes = [json.loads(a.read_text(encoding="utf-8")) for a in archivos]
    retail = {c: payload[c] for c in payload["columnas"] if c not in COLS_ESTACIONES}
    r = contar_estaciones(retail, partes)
    filas_boca = sum(len(P["mes"]) for P in partes)
    print(f"  {filas_boca} filas boca-mes · {r['sin_celda']} sin celda en el cruce")
    if r["sin_celda"] > filas_boca * 0.001:
        sys.exit("Demasiadas filas de boca sin celda en el cruce: los archivos no son de la misma generación")
    ultimo = max(r["por_mes"][2])
    for mes in (ultimo - 18, ultimo - 1, ultimo):
        print(f"  mes {mes}: {r['por_mes'][2].get(mes, 0)} bocas con grado 2 · {r['por_mes'][3].get(mes, 0)} con grado 3")
    # Las columnas nuevas van al final de las del cruce; el resto del archivo queda igual
    columnas = [c for c in payload["columnas"] if c not in COLS_ESTACIONES] + COLS_ESTACIONES
    salida = {}
    for k, v in payload.items():
        if k in COLS_ESTACIONES or k == "generado":
            continue
        salida[k] = columnas if k == "columnas" else v
    nota = payload["nota"].split("; q = ")[0]
    salida["nota"] = f"{nota}; {NOTA_ESTACIONES}"
    for c in COLS_ESTACIONES:
        salida[c] = retail[c]
    salida["generado"] = payload["generado"]
    salida["estaciones_generado"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    texto = json.dumps(salida, ensure_ascii=False, separators=(",", ":"))
    if dry:
        print(f"  [dry-run] public/data/gasoil_retail.json: {len(texto) // 1024} KB")
        return
    destino.write_text(texto, encoding="utf-8")
    print(f"  ✓ public/data/gasoil_retail.json ({len(texto) // 1024} KB)")


if __name__ == "__main__":
    print("Gas oil: contando estaciones…")
    _main(dry="--dry-run" in sys.argv)
    print("Gas oil: terminado.")
