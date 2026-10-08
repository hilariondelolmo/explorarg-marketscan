#!/usr/bin/env python3
"""Precios del relevamiento SE Res. 1104 abiertos por producto, para el Ranking
de precios (página /gas-oil/ranking).

Cruce mes × canal de distribución × tipo de negocio × canal de comercialización
con el precio ponderado por volumen y su peso, para seis productos (gas oil
grado 1, 2 y 3, kerosene, nafta súper y nafta premium) y tres tipos de precio
(surtidor, con impuestos, sin impuestos). Son los productos del relevamiento
que ofrece el filtro Producto del tablero RANKING Actualizado del workbook 05
(su fuente "Precio abierto por producto" pivotea estas mismas columnas); el
gas oil grado 1 solo tiene precio surtidor y datos de 2010 a 2013.

Lo llama regenerate_gasoil.py; solo, necesita /Volumes/comun. Salida:
public/data/gasoil_productos.json (fuera del bundle; la página lo pide al
abrirse). Los índices de mes, tipo de negocio y canal de comercialización son
los de gasoil_precios.json.

Convenciones (las del cruce fino de gas oil, para que las series de gas oil
con los filtros iniciales del ranking den exactamente las precalculadas):
  - la consulta agrega primero cada boca-mes (el relevamiento trae el precio y
    el volumen en filas distintas) y después cada celda fina (mes × provincia ×
    bandera × canal dist × tipo negocio × canal com): por producto, el precio
    de cada tipo ponderado por el volumen de las bocas que informaron ese
    precio, redondeado a centavos, y un único peso, el volumen de las bocas con
    precio con impuestos (si no hay, el de las bocas con precio surtidor);
  - al colapsar provincia y bandera, cada tipo de precio lleva su propio peso:
    la suma de los pesos de las celdas que tienen ese precio. El front hace
    Σ precio × peso / Σ peso sobre las celdas filtradas, como ponderarCol.
"""

import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

T = '"Extract"."Extract"'
PUB_DIR = Path(__file__).resolve().parent.parent / "public" / "data"
SALIDA = "gasoil_productos.json"

TIPOS = {"s": "surtidor", "c": "con impuestos", "n": "sin impuestos"}
# Columnas del hyper por producto y tipo de precio ('v' = volumen). Ojo: la
# nafta súper lleva acento (y doble espacio) en el surtidor y el volumen, y no
# en los precios con y sin impuestos; así vienen en la base.
PRODUCTOS = [
    dict(id="g1", nombre="Gas oil grado 1", densidad=0.845, cols={
        "s": "Gas Oil Grado 1 - Precio Surtidor", "v": "Gas Oil Grado 1 - Volumen"}),
    dict(id="g2", nombre="Gas oil grado 2", densidad=0.845, cols={
        "s": "Gas Oil Grado 2 - Precio Surtidor", "c": "Gas Oil Grado 2 - Precio Con Impuestos",
        "n": "Gas Oil Grado 2 - Precio Sin Impuestos", "v": "Gas Oil Grado 2 - Volumen"}),
    dict(id="g3", nombre="Gas oil grado 3", densidad=0.845, cols={
        "s": "Gas Oil Grado 3 - Precio Surtidor", "c": "Gas Oil Grado 3 - Precio Con Impuestos",
        "n": "Gas Oil Grado 3 - Precio Sin Impuestos", "v": "Gas Oil Grado 3 - Volumen"}),
    dict(id="ke", nombre="Kerosene", densidad=0.845, cols={
        "s": "Kerosene - Precio Surtidor", "c": "Kerosene - Precio Con Impuestos",
        "n": "Kerosene - Precio Sin Impuestos", "v": "Kerosene - Volumen"}),
    dict(id="ns", nombre="Nafta súper", densidad=0.68, cols={
        "s": "Nafta Súper - Precio Surtidor", "c": "Nafta Super - Precio Con Impuestos",
        "n": "Nafta Super - Precio Sin Impuestos", "v": "Nafta Súper -  Volumen"}),
    dict(id="np", nombre="Nafta premium", densidad=0.68, cols={
        "s": "Nafta Premium - Precio Surtidor", "c": "Nafta Premium - Precio Con Impuestos",
        "n": "Nafta Premium - Precio Sin Impuestos", "v": "Nafta Premium - Volumen"}),
]
# Densidades del workbook (columnas "Densidad Gas Oil" y "Densidad Nafta" de su
# fuente pivoteada): 0,845 para gas oil y también para kerosene; 0,68 naftas.


def tipos_de(p):
    return [t for t in "scn" if t in p["cols"]]


def columnas():
    """Nombres de las columnas de valores del cruce, en orden fijo."""
    out = []
    for p in PRODUCTOS:
        for t in tipos_de(p):
            out += [f"p{t}_{p['id']}", f"w{t}_{p['id']}"]
    return out


def _sql(desde):
    """Celdas finas con precio ponderado por tipo y peso, para los seis
    productos. Misma estructura que _sql_eess / _sql_ponderado del generador."""
    eess, agg = [], []
    for p in PRODUCTOS:
        k = p["id"]
        eess.append(f'SUM("{p["cols"]["v"]}") v_{k}')
        for t in tipos_de(p):
            eess.append(f'AVG("{p["cols"][t]}") {t}_{k}')
            agg.append(f"SUM(CASE WHEN {t}_{k} IS NOT NULL AND v_{k} > 0 THEN {t}_{k}*v_{k} END)"
                       f"/NULLIF(SUM(CASE WHEN {t}_{k} IS NOT NULL AND v_{k} > 0 THEN v_{k} END),0) p{t}_{k}")
            if t in "sc":
                agg.append(f"SUM(CASE WHEN {t}_{k} IS NOT NULL AND v_{k} > 0 THEN v_{k} END) w{t}_{k}")
    return f'''
      SELECT f, cd, tn, cc, {", ".join(agg)}
      FROM (
        SELECT "Fecha" f, "Provincia" prov, "Bandera" band,
               "Canal Distribución" cd, "Canal de Comercialización" cc, "Tipo Negocio" tn,
               "CUIT" cuit, "Dirección" dir, {", ".join(eess)}
        FROM {T}
        WHERE "Fecha" >= DATE '{desde}-01'
        GROUP BY 1,2,3,4,5,6,7,8
      ) e
      GROUP BY f, prov, band, cd, tn, cc'''


def extraer_productos(query, desde, ix_mes, ix_tn, ix_cc):
    """Devuelve el cruce columnar (mes, cd, tn, cc + columnas()) ya colapsado
    por provincia y bandera. `query(sql)` corre la consulta sobre el hyper del
    relevamiento; los índices son los de gasoil_precios.json."""
    rows = query(_sql(desde))
    # nombres de las columnas de la consulta, en el orden del SELECT
    nombres = []
    for p in PRODUCTOS:
        for t in tipos_de(p):
            nombres.append(f"p{t}_{p['id']}")
            if t in "sc":
                nombres.append(f"w{t}_{p['id']}")
    acum = {}  # (mes, cd, tn, cc) → {col: valor}
    for row in rows:
        f, cd, tn, cc = row[:4]
        vals = dict(zip(nombres, row[4:]))
        clave = (ix_mes(f.strftime("%Y-%m") if hasattr(f, "strftime") else str(f)[:7]),
                 0 if cd == "Minorista" else 1, ix_tn(tn or "N/D"), ix_cc(cc or "N/D"))
        celda = acum.get(clave)
        if celda is None:
            celda = acum[clave] = defaultdict(float)
        for p in PRODUCTOS:
            k = p["id"]
            # peso de la celda fina: volumen de las bocas con precio con
            # impuestos; si no hay, el de las bocas con precio surtidor
            w = int(vals.get(f"wc_{k}") or vals.get(f"ws_{k}") or 0)
            if not w:
                continue
            for t in tipos_de(p):
                # centavos, como el cruce fino: un precio que redondea a 0 es
                # "sin dato" y no aporta peso (feb-2010 trae celdas de 0,002 $/l)
                pv = round(float(vals.get(f"p{t}_{k}") or 0) * 100) / 100
                if not pv:
                    continue
                celda[f"p{t}_{k}"] += pv * w
                celda[f"w{t}_{k}"] += w
    cols = {c: [] for c in ["mes", "cd", "tn", "cc"] + columnas()}
    for clave in sorted(acum):
        celda = acum[clave]
        if not any(celda[c] for c in celda if c.startswith("w")):
            continue
        for c, v in zip(("mes", "cd", "tn", "cc"), clave):
            cols[c].append(v)
        for p in PRODUCTOS:
            k = p["id"]
            for t in tipos_de(p):
                w = celda.get(f"w{t}_{k}", 0)
                cols[f"p{t}_{k}"].append(round(celda[f"p{t}_{k}"] / w, 4) if w else 0)
                cols[f"w{t}_{k}"].append(int(w))
    return cols


def serie_filtrada(cols, meses, producto, tipo, filtro):
    """Precio ponderado por mes ($/l) del producto y tipo sobre las filas que
    pasan `filtro(i)`: control del generador y de los números del sitio."""
    P, W = cols[f"p{tipo}_{producto}"], cols[f"w{tipo}_{producto}"]
    pw, ww = defaultdict(float), defaultdict(float)
    for i in range(len(cols["mes"])):
        if P[i] and W[i] and filtro(i):
            pw[cols["mes"][i]] += P[i] * W[i]
            ww[cols["mes"][i]] += W[i]
    return {meses[m]: pw[m] / ww[m] for m in ww}


def escribir_productos(cols, meses, tipos_negocio, canales_com, dry):
    payload = dict(
        nota="Relevamiento SE Res. 1104 abierto por producto para el Ranking de precios: "
             "p = precio ponderado en $/l (0 = sin dato), w = m3 ponderador de ese precio; "
             "índices de mes, tipo de negocio y canal como en gasoil_precios.json",
        generado=datetime.now().strftime("%Y-%m-%d %H:%M"),
        productos=[dict(id=p["id"], nombre=p["nombre"], densidad=p["densidad"], tipos=tipos_de(p)) for p in PRODUCTOS],
        tipos=TIPOS, meses=meses, tipos_negocio=tipos_negocio, canales_com=canales_com,
        columnas=list(cols), filas=len(cols["mes"]),
        **cols,
    )
    texto = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if dry:
        print(f"  [dry-run] public/data/{SALIDA}: {len(texto) // 1024} KB · {len(cols['mes'])} filas")
        return
    PUB_DIR.mkdir(parents=True, exist_ok=True)
    (PUB_DIR / SALIDA).write_text(texto, encoding="utf-8")
    print(f"  ✓ public/data/{SALIDA} ({len(texto) // 1024} KB · {len(cols['mes'])} filas)")


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from regenerate_gasoil import DESDE, Hyper, Indice, OUT_DIR, VOL, check, meses_entre, ym
    check(VOL.exists(), "El volumen /Volumes/comun no está montado")
    precios = json.loads((OUT_DIR / "gasoil_precios.json").read_text(encoding="utf-8"))
    ix_mes, ix_tn, ix_cc = Indice(), Indice(), Indice()
    for f in precios["meses"]:
        ix_mes(f)
    for t in precios["tipos_negocio"]:
        ix_tn(t)
    for c in precios["canales_comercializacion"]:
        ix_cc(c)
    hy = Hyper()
    try:
        cols = extraer_productos(lambda sql: hy.query("p1104", sql), DESDE, ix_mes, ix_tn, ix_cc)
    finally:
        hy.close()
    escribir_productos(cols, precios["meses"], ix_tn.valores, ix_cc.valores, "--dry-run" in sys.argv)
