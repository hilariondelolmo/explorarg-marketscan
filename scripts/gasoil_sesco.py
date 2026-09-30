#!/usr/bin/env python3
"""
Ventas de combustibles al mercado interno según las tablas SESCO de la
Secretaría de Energía, para la página Tablas SESCO del mercado de gas oil
(/gas-oil/canales-sesco).

Fuente (requiere /Volumes/comun montado):
  - Mercado Argentino Derivados Petroleo Table.hyper
        una fila por mes × provincia × empresa × sector, con una columna por
        producto. Sale de la tabla dinámica "Ventas, (excluye ventas a
        empresas del sector)" de la SE (TD_Ventas_mercado.xlsx): son ventas
        netas de las transferencias entre empresas del sector.

Salida:
  - public/data/gasoil_sesco.json   cruce mes × provincia × empresa × sector;
        cada producto guarda solo las filas donde tiene venta (i = fila del
        cruce, v = cantidad en la unidad del producto).

Unidades: las de la SE para cada producto (campo "unidad" de la tabla
dinámica): m³ para los líquidos, toneladas para asfaltos, butano, coque, fuel
oil, grasas, mezclas IFO y propano, y miles de m³ para los gases. Quedan
afuera los crudos (columnas "Cuenca ..." y "Crudo importado"), que no son
ventas de combustibles.

Lo llama regenerate_gasoil.py. Solo:

    python3 scripts/gasoil_sesco.py [--dry-run]

No estima datos: si una validación falla, aborta.
"""

import json
import shutil
import sys
import tempfile
import unicodedata
from collections import defaultdict
from datetime import datetime
from pathlib import Path

FUENTE = Path("/Volumes/comun/01. TABLEAU/EXP MKTS DATABASES/Revision Actual/"
              "Mercado Argentino Derivados Petroleo Table.hyper")
RAIZ = Path(__file__).resolve().parent.parent
PUB_DIR = RAIZ / "public" / "data"
MAPA = RAIZ / "src" / "data" / "mapa_argentina.json"
SALIDA = "gasoil_sesco.json"
T = '"Extract"."Extract"'

M3, TON, MILES_M3 = "m³", "ton", "miles de m³"
# Productos del desplegable, en su orden: id, columna de la base, nombre y unidad
PRODUCTOS = [
    ("go2", "Gasoil Grado 2 (Común)", "Gas oil grado 2 (común)", M3),
    ("go3", "Gasoil Grado 3 (Ultra)", "Gas oil grado 3 (ultra)", M3),
    ("go1", "Gasoil Grado 1 (Agrogasoil)", "Gas oil grado 1 (agrogasoil)", M3),
    ("go_otros", "Otros Tipos de Gasoil", "Otros tipos de gas oil", M3),
    ("diesel", "Diesel Oil", "Diesel oil", M3),
    ("nafta2", "Nafta Grado 2 (Súper)", "Nafta grado 2 (súper)", M3),
    ("nafta3", "Nafta Grado 3 (Ultra)", "Nafta grado 3 (ultra)", M3),
    ("nafta1", "Nafta Grado 1 (Común)", "Nafta grado 1 (común)", M3),
    ("nafta_otras", "Otros Tipos de Naftas", "Otros tipos de naftas", M3),
    ("nafta_virgen", "Nafta Virgen", "Nafta virgen", M3),
    ("gasolina", "Gasolina Natural", "Gasolina natural", M3),
    ("jet", "Aerokerosene (Jet)", "Aerokerosene (jet)", M3),
    ("aeronaftas", "Aeronaftas", "Aeronaftas", M3),
    ("kerosene", "Kerosene", "Kerosene", M3),
    ("fueloil", "Fueloil", "Fuel oil", TON),
    ("ifo", "Mezclas IFO", "Mezclas IFO", TON),
    ("propano", "Propano y Otros C3", "Propano y otros C3", TON),
    ("butano", "Butano y Otros C4", "Butano y otros C4", TON),
    ("gas_refineria", "Gas de Refinería", "Gas de refinería", MILES_M3),
    ("gas_natural", "Gas Natural", "Gas natural", MILES_M3),
    ("gnl", "Gas Natural Licuado", "Gas natural licuado", MILES_M3),
    ("aguarras", "Aguarras", "Aguarrás", M3),
    ("asfaltos", "Asfaltos", "Asfaltos", TON),
    ("bases_lub", "Bases Lubricantes", "Bases lubricantes", M3),
    ("coque", "Coque", "Coque", TON),
    ("destilado", "Destilado de Vacío", "Destilado de vacío", M3),
    ("grasas", "Grasas", "Grasas", TON),
    ("lub_auto", "Lubricantes automotrices", "Lubricantes automotrices", M3),
    ("lub_ind", "Lubricantes industriales", "Lubricantes industriales", M3),
    ("lub_mar", "Lubricantes marinos", "Lubricantes marinos", M3),
    ("livianos", "Otros Productos Livianos", "Otros productos livianos", M3),
    ("medianos", "Otros Productos Medianos", "Otros productos medianos", M3),
    ("pesados", "Otros Productos Pesados", "Otros productos pesados", M3),
    ("solv_alif", "Solventes Alifáticos", "Solventes alifáticos", M3),
    ("solv_arom", "Solventes Aromáticos", "Solventes aromáticos", M3),
    ("solv_hex", "Solventes Hexano", "Solventes hexano", M3),
]
# Densidad (ton/m³) de los productos que la página deja pasar de m³ a toneladas:
# solo el gas oil, con la del workbook 05 (decisión HDO 30/09/2026). El resto
# queda en la unidad de la fuente.
DENSIDAD_GO = 0.845
DENSIDAD = {"go2": DENSIDAD_GO, "go3": DENSIDAD_GO, "go1": DENSIDAD_GO, "go_otros": DENSIDAD_GO}
# Empresa de SESCO → nombre con que figura como compradora de biodiésel
# (petroleras.json), para el corte real por empresa. A las mezcladoras que ya
# mapea regenerate_data.py (MAPA_PETROLERAS_GO) se suman estas, que compraron
# biodiésel en años anteriores; las que se llaman igual en las dos bases no
# necesitan entrada.
EMPRESA_BIO_EXTRA = {
    "OIL S.A.": "OIL COMBUSTIBLES S.A.",
    "PETROLERA DEL CONO SUR": "PETROLERA DEL CONOSUR S.A.",
    "PETROIL PETROLEO Y DERIVADOS S.A.": "PETROIL S.A.",
    "ENARSA ENERGIA ARGENTINA S.A.": "ENERGÍA ARGENTINA S.A. (ENARSA)",
    "ENERGIA DERIVADOS DEL PETROLEO S.A.": "ENERGÍA Y DERIVADOS DEL PETRÓLEO S.A.",
}
# Minorista = ventas al público; mayorista = los demás sectores (decisión HDO 30/09/2026)
SECTOR_MINORISTA = "Al Público"
# Sectores que la página abre sin tildar (HDO 30/09/2026)
SECTORES_SIN_TILDAR = ["Bunker Cabotaje", "Bunker Internacional", "Usinas Eléctricas"]
# Provincias: nombre normalizado de la SE → nombre en mapa_argentina.json
PROVINCIA_ALIAS = {"CAPITAL FEDERAL": "CIUDAD AUTONOMA DE BUENOS AIRES"}


def fail(msg):
    sys.exit(f"\n✗ ERROR (SESCO): {msg}\nNo se escribió el archivo.")


def check(cond, msg):
    if not cond:
        fail(msg)


def normalizar_sector(s):
    """La SE trae sectores con mayúscula inicial inconsistente según la época
    ('transporte Público de Pasajeros'): se unifican."""
    s = (s or "S/N").strip()
    return s[0].upper() + s[1:]


def normalizar_provincia(s):
    """'Tucuman', 'Neuquén', 'Capital Federal' → los nombres del mapa del sitio
    (mayúsculas sin tildes), que son los del relevamiento 1104."""
    sin = "".join(c for c in unicodedata.normalize("NFD", (s or "").strip()) if unicodedata.category(c) != "Mn")
    sin = sin.upper()
    return PROVINCIA_ALIAS.get(sin, sin)


def numero(x):
    """Hasta tres decimales (los de la fuente); los enteros sin '.0'."""
    r = round(float(x), 3)
    return int(r) if r == int(r) else r


def extraer_sesco(consulta):
    """Arma el cruce. `consulta(sql)` devuelve las filas de la base."""
    cols = ", ".join(f'SUM(COALESCE("{col}", 0))' for _, col, _, _ in PRODUCTOS)
    filas = consulta(f'SELECT "FECHA", "PROVINCIA", "empresa", "SECTOR", {cols} FROM {T} '
                     f'WHERE "FECHA" IS NOT NULL GROUP BY 1, 2, 3, 4')
    # Se agrupa de nuevo acá: al unificar sectores y provincias pueden caer dos filas en la misma celda
    celdas = defaultdict(lambda: [0.0] * len(PRODUCTOS))
    for fecha, prov, emp, sector, *vals in filas:
        check(prov and emp, f"Fila sin provincia o empresa en {fecha}")
        k = (f"{fecha.year:04d}-{fecha.month:02d}", normalizar_provincia(prov), emp.strip(), normalizar_sector(sector))
        acum = celdas[k]
        for j, v in enumerate(vals):
            acum[j] += float(v or 0)

    meses = sorted({k[0] for k in celdas})
    provincias = sorted({k[1] for k in celdas})
    empresas = sorted({k[2] for k in celdas})
    sectores = sorted({k[3] for k in celdas})
    ix = [{v: i for i, v in enumerate(lista)} for lista in (meses, provincias, empresas, sectores)]
    # Orden fijo (mes, provincia, empresa, sector) para que el archivo no cambie entre corridas
    orden = sorted(
        (tuple(ix[d][k[d]] for d in range(4)), vals)
        for k, vals in celdas.items() if any(numero(v) for v in vals)
    )
    dims = dict(mes=[], prov=[], emp=[], sec=[])
    valores = {pid: dict(i=[], v=[]) for pid, _, _, _ in PRODUCTOS}
    for fila, ((m, p, e, s), vals) in enumerate(orden):
        dims["mes"].append(m)
        dims["prov"].append(p)
        dims["emp"].append(e)
        dims["sec"].append(s)
        for (pid, _, _, _), v in zip(PRODUCTOS, vals):
            n = numero(v)
            if n:
                valores[pid]["i"].append(fila)
                valores[pid]["v"].append(n)

    # ------------------------------------------------------------ validar
    # Cada mes del rango tiene que estar: la serie de la SE es continua
    y, m = int(meses[0][:4]), int(meses[0][5:])
    esperados = []
    while f"{y:04d}-{m:02d}" <= meses[-1]:
        esperados.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    check(meses == esperados, f"Faltan meses en la serie: {sorted(set(esperados) - set(meses))[:6]}")
    check(SECTOR_MINORISTA in ix[3], f"Falta el sector '{SECTOR_MINORISTA}'")
    for s in SECTORES_SIN_TILDAR:
        check(s in ix[3], f"Falta el sector '{s}'")
    nombres_mapa = {p["nombre"] for p in json.loads(MAPA.read_text(encoding="utf-8"))["provincias"]}
    for p in provincias:
        check(p in nombres_mapa, f"Provincia '{p}' no existe en mapa_argentina.json")
    check(len(provincias) == 24, f"Se esperaban 24 provincias y hay {len(provincias)}")
    # El cruce tiene que sumar lo mismo que la base, producto por producto
    totales = consulta(f"SELECT {cols} FROM {T} WHERE \"FECHA\" IS NOT NULL")[0]
    for (pid, _, nombre, _), t in zip(PRODUCTOS, totales):
        suma = sum(valores[pid]["v"])
        check(abs(suma - float(t or 0)) <= 0.5 + 1e-7 * abs(float(t or 0)),
              f"'{nombre}': el cruce suma {suma:,.1f} y la base {float(t or 0):,.1f}")
    ult = ix[0][meses[-1]]
    go = {pid: sum(v for i, v in zip(valores[pid]["i"], valores[pid]["v"]) if dims["mes"][i] == ult)
          for pid in ("go2", "go3")}
    check(go["go2"] > 0 and go["go3"] > 0, f"Sin gas oil en {meses[-1]}")
    # Cifra ancla: jul-2026, gas oil grado 2 + grado 3 de todos los sectores = 1.260.883 m³
    if meses[-1] == "2026-07":
        check(abs(go["go2"] + go["go3"] - 1260883) < 1,
              f"Gas oil jul-2026 = {go['go2'] + go['go3']:,.0f} m³, esperado 1.260.883")

    productos = []
    for pid, _, nombre, unidad in PRODUCTOS:
        con_dato = sorted({dims["mes"][i] for i in valores[pid]["i"]})
        if not con_dato:
            del valores[pid]  # producto sin ninguna venta en la serie: no va al desplegable
            continue
        productos.append(dict(id=pid, nombre=nombre, unidad=unidad, densidad=DENSIDAD.get(pid),
                              desde=meses[con_dato[0]], hasta=meses[con_dato[-1]]))
    # Nombre de cada empresa como compradora de biodiésel (mismo mapa que el tablero de biodiésel)
    from regenerate_data import MAPA_PETROLERAS_GO, alias_petrolera
    empresa_bio = {e: alias_petrolera(b) for e, b in {**MAPA_PETROLERAS_GO, **EMPRESA_BIO_EXTRA}.items()}
    for e in empresa_bio:
        check(e in ix[2], f"Empresa '{e}' del mapa de biodiésel no está en la base SESCO")
    resumen = (f"{len(dims['mes'])} filas · {len(meses)} meses ({meses[0]} a {meses[-1]}) · {len(empresas)} empresas · "
               f"{len(sectores)} sectores · {len(productos)} productos · gas oil {meses[-1]}: "
               f"{go['go2'] + go['go3']:,.0f} m³")
    return dict(
        fuente="Secretaría de Energía, tablas SESCO: Ventas (excluye ventas a empresas del sector)",
        nota="cruce mes × provincia × empresa × sector (índices a las listas); valores[producto] = { i: fila del "
             "cruce, v: cantidad en la unidad del producto }; solo las filas con venta",
        ultimo_mes=meses[-1], meses=meses, provincias=provincias, empresas=empresas, sectores=sectores,
        sector_minorista=SECTOR_MINORISTA, sectores_sin_tildar=SECTORES_SIN_TILDAR,
        densidad_go=DENSIDAD_GO, empresa_bio=empresa_bio,
        productos=productos, filas=len(dims["mes"]), **dims, valores=valores,
    ), resumen


def escribir_sesco(payload, dry):
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
        sys.exit("Falta tableauhyperapi:  pip3 install tableauhyperapi")
    check(FUENTE.exists(), f"Fuente no encontrada: {FUENTE}")
    tmp = Path(tempfile.mkdtemp(prefix="regen_sesco_"))
    try:
        local = tmp / "sesco.hyper"
        shutil.copy(FUENTE, local)
        with HyperProcess(telemetry=Telemetry.DO_NOT_SEND_USAGE_DATA_TO_TABLEAU) as hp:
            with Connection(endpoint=hp.endpoint, database=str(local)) as conn:
                payload, resumen = extraer_sesco(conn.execute_list_query)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"  SESCO: {resumen}")
    escribir_sesco(payload, dry)


if __name__ == "__main__":
    main(dry="--dry-run" in sys.argv)
    print("SESCO: terminado.")
