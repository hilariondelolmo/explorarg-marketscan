#!/usr/bin/env python3
"""
Precios en planta por reventa a estaciones de servicio (Res. SE 1104/2004),
para la pestaña Gas oil de la página Márgenes (/margenes/gas-oil): es la
fuente "Terminales" del crack spread de refinación, la que usa la hoja
CRACK SPREAD INICIO del workbook 03 "MARKET & INDUSTRY - MARGEN BIODIESEL".

Fuente (requiere /Volumes/comun montado):
  - Precio y volumen en planta por reventa a EESS.hyper   una fila por mes,
        empresa, terminal y producto, con precio ($/l) y volumen (m³) de la
        zona no exenta y de la zona exenta (Patagonia, sin ICL). Los precios
        vienen sin impuestos: la zona exenta vale casi lo mismo que la no
        exenta y quedan por debajo del mayorista sin impuestos del
        relevamiento (verificado el 12/10/2026, ago-2026: gas oil grado 2
        1.330 $/l en planta contra 1.558 mayorista sin impuestos).

Salida:
  - public/data/gasoil_terminales.json   cruce mes × empresa × terminal ×
        producto (gas oil sin grado, grado 2, grado 3, nafta súper y nafta
        premium), con el precio ponderado de las dos zonas ($/l) y el volumen
        (m³) de las filas con precio.

Como el workbook, el precio de cada celda pondera las dos zonas por volumen.
Diferencia: acá el volumen de una zona solo pesa si esa zona trae precio
(en el Tableau el denominador suma el volumen aunque el precio sea nulo).
Los nombres de terminal repetidos con otra grafía (JUNÍN y JUNIN, MONTECRISTO
y MONTE CRISTO, RÍO y RIO GALLEGOS, los "PTA. ..." de 2012) se unifican con
la tabla ALIAS_TERMINAL; las empresas quedan como vienen. La página excluye
al entrar las terminales y los meses que excluye la hoja del workbook
(`excluidas` y `meses_excluidos` del JSON).

Lo llama regenerate_gasoil.py. Solo:

    python3 scripts/gasoil_terminales.py [--dry-run]

No estima datos: si una validación falla, aborta.
"""

import json
import shutil
import sys
import tempfile
from collections import defaultdict
from datetime import datetime
from pathlib import Path

FUENTE = Path("/Volumes/comun/01. TABLEAU/EXP MKTS DATABASES/Revision Actual/Precio y volumen en planta por reventa a EESS.hyper")
RAIZ = Path(__file__).resolve().parent.parent
PUB_DIR = RAIZ / "public" / "data"
SALIDA = "gasoil_terminales.json"
T = '"Extract"."Extract"'
DESDE = "2010-01"

# Producto en la base → id en el JSON (los cinco que entran en el crack spread)
PRODUCTOS = {
    "GAS OIL": "g",
    "GAS OIL GRADO 2": "g2",
    "GAS OIL GRADO 3": "g3",
    "NAFTA SÚPER SIN PLOMO, DE MAS DE 92 RON": "ns",
    "NAFTA PREMIUM SIN PLOMO, DE MAS DE 95 RON": "np",
}
NOMBRE_PRODUCTO = {"g": "Gas oil (sin grado)", "g2": "Gas oil grado 2", "g3": "Gas oil grado 3", "ns": "Nafta súper", "np": "Nafta premium"}
SIN_TERMINAL = "SIN TERMINAL"
# Grafías de la base (casi todas de 2010 a 2012) → nombre único
ALIAS_TERMINAL = {
    "0": SIN_TERMINAL, "": SIN_TERMINAL,
    "JUNÍN": "JUNIN",
    "RÍO GALLEGOS": "RIO GALLEGOS",
    "MONTECRISTO": "MONTE CRISTO",
    "CONCEPCIÓN DEL URUGUAY": "CONCEPCION DEL URUGUAY",
    "TUCUMÁN": "BANDA DEL RIO SALI",
    "REFINOR S.A.": "BANDA DEL RIO SALI",
    "VILELAS": "PUERTO VILELAS",
    "CALETA PAULA": "CALETA OLIVIA",
    "CAMPO DURAN": "AGUARAY",
    "GALVÁN": "PUERTO GALVAN",
    "PUERTO GALVÁN": "PUERTO GALVAN",
    "CUTRAL CO": "PLAZA HUINCUL",
    "DAPSA": "DOCK SUD",
    "PTA. ESSO  CAMPANA": "CAMPANA",
    "PTA. OIL SAN LORENZO": "SAN LORENZO",
    "PTA. YPF S.A. COMODORO RIVADAVIA": "COMODORO RIVADAVIA",
    "REFISAN": "SAN LORENZO",
    "ORIÓN": "ORION",
}
# Lo que excluye la hoja CRACK SPREAD INICIO del workbook (HDO, 12/10/2026: lo mismo acá al entrar)
EXCLUIDAS = [SIN_TERMINAL, "AGUARAY", "ARROYO SECO", "BAHIA BLANCA"]
MESES_EXCLUIDOS = ["2013-02", "2014-07", "2014-08", "2014-09", "2014-10", "2016-08", "2016-09", "2016-10"]


def fail(msg):
    sys.exit(f"ERROR gasoil_terminales: {msg}")


def check(cond, msg):
    if not cond:
        fail(msg)


def ym(d):
    return f"{d.year}-{d.month:02d}"


def extraer_terminales(consulta):
    """Devuelve (payload, resumen) a partir de `consulta(sql) -> filas`."""
    filas = consulta(f'''SELECT "Date", "Empresa", "Terminal", "producto",
            "Zona No Exenta - Precio", "Zona No Exenta - Volumen", "Zona Exenta - Precio", "Zona Exenta - Volumen",
            "Unidad Precio", "Unidad Volumen"
        FROM {T} WHERE "Date" >= DATE '{DESDE}-01' ORDER BY "Date"''')
    check(filas, "la base no devolvió filas desde 2010")
    unidades = {(r[8], r[9]) for r in filas}
    check(unidades == {("$/Litro", "m3")}, f"unidades inesperadas en la base: {unidades}")
    acum = defaultdict(lambda: [0.0, 0.0])  # (mes, empresa, terminal, producto) → [Σ precio × m³, Σ m³]
    sin_nombre = defaultdict(int)
    for d, emp, ter, prod, pne, vne, pe, ve, _, _ in filas:
        pid = PRODUCTOS.get(prod)
        if pid is None:
            continue
        t = (ter or "").strip()
        t = ALIAS_TERMINAL.get(t, t)
        if t == SIN_TERMINAL:
            sin_nombre[ym(d)] += 1
        e = (emp or "").strip()
        check(e, f"empresa vacía en {d} {t} {prod}")
        k = (ym(d), e, t, pid)
        for p, v in ((pne, vne), (pe, ve)):
            if p is not None and v is not None and p > 0 and v > 0:
                acum[k][0] += float(p) * float(v)
                acum[k][1] += float(v)
    check(acum, "ningún producto reconocido en la base")
    meses = sorted({k[0] for k in acum})
    empresas = sorted({k[1] for k in acum})
    terminales = sorted({k[2] for k in acum})
    productos = list(NOMBRE_PRODUCTO)
    ix_mes = {m: i for i, m in enumerate(meses)}
    ix_emp = {e: i for i, e in enumerate(empresas)}
    ix_ter = {t: i for i, t in enumerate(terminales)}
    ix_prod = {p: i for i, p in enumerate(productos)}
    cols = dict(mes=[], emp=[], ter=[], prod=[], p=[], v=[])
    for (m, e, t, pid), (pv, v) in sorted(acum.items()):
        if v <= 0:
            continue
        cols["mes"].append(ix_mes[m]); cols["emp"].append(ix_emp[e]); cols["ter"].append(ix_ter[t]); cols["prod"].append(ix_prod[pid])
        cols["p"].append(round(pv / v, 4)); cols["v"].append(round(v, 1))
    for t in EXCLUIDAS:
        check(t in ix_ter or t == SIN_TERMINAL, f"terminal excluida que no está en la base: {t}")
    # Ancla: gas oil grado 2 del último mes, todas las terminales
    ultimo = meses[-1]
    i_ult, i_g2 = ix_mes[ultimo], ix_prod["g2"]
    pv = sum(cols["p"][i] * cols["v"][i] for i in range(len(cols["mes"])) if cols["mes"][i] == i_ult and cols["prod"][i] == i_g2)
    vol = sum(cols["v"][i] for i in range(len(cols["mes"])) if cols["mes"][i] == i_ult and cols["prod"][i] == i_g2)
    check(vol > 0, f"sin volumen de gas oil grado 2 en {ultimo}")
    payload = dict(
        nota="Precios en planta por reventa a EESS (Res. SE 1104/2004), sin impuestos: precio ponderado de las zonas no exenta y "
             "exenta por el volumen de las filas con precio ($/l); v = m³ de esas filas",
        fuente="Secretaría de Energía, precios de venta en planta por reventa a estaciones de servicio (Res. 1104/2004)",
        desde=meses[0], hasta=ultimo,
        meses=meses, empresas=empresas, terminales=terminales,
        productos=[dict(id=p, nombre=NOMBRE_PRODUCTO[p]) for p in productos],
        excluidas=EXCLUIDAS, meses_excluidos=MESES_EXCLUIDOS,
        columnas=list(cols), filas=len(cols["mes"]), **cols,
    )
    resumen = (f"{len(cols['mes'])} filas · {len(meses)} meses ({meses[0]} a {ultimo}) · {len(empresas)} empresas · "
               f"{len(terminales)} terminales · gas oil grado 2 {ultimo}: {pv / vol:,.3f} $/l, {vol:,.0f} m³"
               + (f" · sin terminal: {sum(sin_nombre.values())} filas" if sin_nombre else ""))
    return payload, resumen


def escribir_terminales(payload, dry):
    payload["generado"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    texto = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if dry:
        print(f"  [dry-run] public/data/{SALIDA}: {len(texto) // 1024} KB")
        return
    PUB_DIR.mkdir(parents=True, exist_ok=True)
    (PUB_DIR / SALIDA).write_text(texto, encoding="utf-8")
    print(f"  ✓ public/data/{SALIDA} ({len(texto) // 1024} KB)")


def main(dry=False):
    try:
        from tableauhyperapi import Connection, HyperProcess, Telemetry
    except ImportError:
        fail("falta tableauhyperapi (usar el python de miniforge)")
    check(FUENTE.exists(), f"no se encuentra {FUENTE}")
    with tempfile.TemporaryDirectory() as tmp:
        local = Path(tmp) / FUENTE.name
        shutil.copy(FUENTE, local)  # la base puede estar abierta en Tableau
        with HyperProcess(telemetry=Telemetry.DO_NOT_SEND_USAGE_DATA_TO_TABLEAU) as hp, Connection(hp.endpoint, str(local)) as con:
            payload, resumen = extraer_terminales(con.execute_list_query)
    print(f"  Terminales: {resumen}")
    escribir_terminales(payload, dry)


if __name__ == "__main__":
    main(dry="--dry-run" in sys.argv)
