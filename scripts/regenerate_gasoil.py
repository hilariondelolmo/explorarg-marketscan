#!/usr/bin/env python3
"""
Regenera los JSON del mercado de gas oil (src/data/gasoil_*.json) desde las
bases del workbook Tableau 05 (MERCADO INTERNO GAS OIL VERSION ONLINE I).

Fuentes (requiere /Volumes/comun montado):
  - Precio derivados petroleo 1104 minorista y mayorista new.hyper
        relevamiento SE Res. 1104/2004: precio y volumen por EESS-mes, canal,
        bandera, provincia (fuente de Precio surtidor, Estructura y BTB BTC)
  - Master data database.hyper   Brent, WTI, TC, CPI US, FoLicht, 963, aceite
  - Informe Regalias CRUDO.xlsx  Brent y WTI de los meses que todavía no estén
        en Master data (es la hoja de donde los toma el flujo de Prep)
  - Go Imports.hyper             despachos de importación de gas oil (CIF)
  - EESS Localidad departamento provincia.hyper   estaciones georreferenciadas
  - Mercado Argentino Derivados Petroleo Table.hyper   ventas al mercado de las
        tablas SESCO (página Tablas SESCO; lo arma gasoil_sesco.py)

Salidas:
  - gasoil_precios.json  retail (mes × provincia × bandera), canales
                         (mes × canal distribución × canal comercialización ×
                         bandera), flujos para el Sankey y EESS del mapa
  - gasoil_ranking.json  series mensuales en usd/ton para el ranking, tipo de
                         cambio, CPI US, importaciones, las series de Precios
                         comparados (aceite FAS MINAGRI, metanol YPF) y el precio
                         Res. 963 publicado vs. fórmula (res963)
  - public/data/         cruce fino del relevamiento (gasoil_retail.json, con
                         la cantidad de estaciones de cada celda que arma
                         gasoil_estaciones.py), datos por boca y por mes
  - public/data/gasoil_sesco.json   ventas de combustibles de las tablas SESCO
                         (mes × provincia × empresa × sector, por producto)
  - public/data/gasoil_importaciones.json   despachos de importación de gas oil
                         (mes × importador × origen × procedencia; lo arma
                         gasoil_importaciones.py para la página Importaciones)

Uso:
    python3 scripts/regenerate_gasoil.py [--dry-run]

Lo llama también regenerate_data.py al final. No estima datos: si una
validación falla, aborta.

Decisiones de cálculo (16/09/2026, ver memoria project-gasoil-pagina):
  - Precio ponderado = Σ(precio EESS × volumen EESS) / Σ volumen EESS, con el
    precio y el volumen de cada estación en el mes. El workbook pondera al
    nivel del parámetro "Primer nivel apertura" (provincia): difere ≈0,6%.
  - "Precio final" (workbook) = surtidor si canal comercialización = Al
    público, si no precio con impuestos. Acá se guardan los tres precios y el
    front elige.
  - usd/ton = $/l ÷ TC mensual × 1000 ÷ 0,845 (densidad gas oil del propio
    workbook; sus hojas BTB usan 0,885, que es la del biodiesel).
"""

import json
import shutil
import sys
import tempfile
import warnings
from collections import defaultdict
from datetime import datetime
from pathlib import Path

try:
    from tableauhyperapi import Connection, HyperProcess, Telemetry
except ImportError:
    sys.exit("Falta tableauhyperapi:  pip3 install tableauhyperapi")

from gasoil_estaciones import COLS_ESTACIONES, NOTA_ESTACIONES, contar_estaciones
from gasoil_importaciones import CAMMESA, escribir_despachos, extraer_despachos
from gasoil_productos import escribir_productos, extraer_productos, serie_filtrada
from gasoil_sesco import FUENTE as FUENTE_SESCO, escribir_sesco, extraer_sesco

VOL = Path("/Volumes/comun/01. TABLEAU")
DB = VOL / "EXP MKTS DATABASES/Revision Actual"
SRC = {
    "p1104": DB / "Precio derivados petroleo 1104 minorista y mayorista new.hyper",
    "master": DB / "Master data database.hyper",
    "imports": DB / "Go Imports.hyper",
    "eess": DB / "EESS Localidad departamento provincia.hyper",
    "sesco": FUENTE_SESCO,
}
# Informe de regalías de crudo de la SE: de su hoja "Tabla precios (2)" toma el
# flujo de Prep las columnas BRENT y WTI de Master data. Si la base quedó
# atrás, los meses que le falten se leen directo de acá (decisión HDO
# 30/09/2026); los meses que Master data ya tiene no se tocan.
REGALIAS = VOL / "EXP MKTSCAN - DATASOURCES/Revision Actual/Informe Regalias CRUDO.xlsx"
# Precio del biodiésel Res. 963: la columna "Fórmula" la calcula y carga HDO
# (precio por fórmula); el publicado por la SE es la MEDIANA de Master data
# y, solo si falta, la columna "Publicado" (página Res. 963 y ajustes).
RES963 = VOL / "EXP MKTSCAN - DATASOURCES/Revision Actual/Database Precio Formula 963.xlsx"
HOJA_REGALIAS = "Tabla precios (2)"
OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "data"
MAPA = OUT_DIR / "mapa_argentina.json"

DESDE = "2010-01"           # el relevamiento minorista arranca en 2010
DENSIDAD_GO = 0.845         # ton/m3 (columna "Densidad Gas Oil" del workbook)
T = '"Extract"."Extract"'

# Tipos de negocio que el workbook incluye por defecto en el relevamiento
# minorista (bocas de expendio y estaciones; excluye distribuidores,
# comercializadores, revendedores, "Otros" y N/D).
TIPOS_RETAIL = (
    "Bocas de expendio (venta por menor) Combustibles Líquidos + PRVE",
    "Bocas de expendio (venta por menor) Combustibles líquidos únicamente",
    "Bocas de expendio (venta por menor) Duales (líquidos + GLPA)",
    "Bocas de expendio (venta por menor) Duales (líquidos + GNC)",
    "Bocas de expendio (venta por menor) Sólo GNC",
    "Estación de servicio",
)

# Nombres de exhibición de las banderas (la SE conserva razones sociales)
BANDERA_ALIAS = {
    "SHELL C.A.P.S.A.": "SHELL",
    "ESSO PETROLERA ARGENTINA S.R.L": "ESSO",
    "YPF S.A.": "YPF",
    "OIL COMBUSTIBLES S.A.": "OIL COMBUSTIBLES",
    "DAPSA S.A.": "DAPSA",
    "SIN EMPRESA BANDERA": "BLANCA",
}
# Provincias: nombre en la SE → nombre en mapa_argentina.json
PROVINCIA_ALIAS = {
    "CAPITAL FEDERAL": "CIUDAD AUTONOMA DE BUENOS AIRES",
}

# Series del ranking que salen de Master data: id → (columna, nombre, fuente,
# familia, unidad). Son los productos del filtro Producto del tablero RANKING
# Actualizado que no vienen del relevamiento 1104 (esos los arma
# scripts/gasoil_productos.py): 32 series desde el 07/10/2026, antes eran las
# seis marcadas con (*). Los diez crudos salen de la hoja "Tabla precios (2)"
# del informe de regalías de crudo de la SE, en usd/m³ (el workbook los
# rotula usd/ton); si Master data queda atrás, los meses que falten se toman
# del informe (ver completar_con_regalias). Los cuatro precios de la Res. 963
# vienen en $/ton y se pasan a usd/ton con el TC del mes.
FUENTE_REGALIAS = "Informe de regalías de crudo (SE)"
PRODUCTOS_MASTER = {
    # crudos (usd/m³)
    "brent": ("BRENT", "Brent", FUENTE_REGALIAS, "crudo", "usd/m³"),  # (*)
    "wti": ("WTI", "WTI", FUENTE_REGALIAS, "crudo", "usd/m³"),  # (*)
    "canadon_seco": ("CAÑADON SECO", "Cañadón Seco", FUENTE_REGALIAS, "crudo", "usd/m³"),
    "escalante": ("ESCALANTE", "Escalante", FUENTE_REGALIAS, "crudo", "usd/m³"),
    "magallanes": ("MAGALLANES", "Magallanes", FUENTE_REGALIAS, "crudo", "usd/m³"),
    "maria_ines": ("MARÍA INÉS", "María Inés", FUENTE_REGALIAS, "crudo", "usd/m³"),
    "medanito": ("MEDANITO", "Medanito", FUENTE_REGALIAS, "crudo", "usd/m³"),
    "mendoza_norte": ("MENDOZA NORTE", "Mendoza Norte", FUENTE_REGALIAS, "crudo", "usd/m³"),
    "noroeste": ("NOROESTE", "Noroeste", FUENTE_REGALIAS, "crudo", "usd/m³"),
    "san_sebastian": ("SAN SEBASTIÁN", "San Sebastián", FUENTE_REGALIAS, "crudo", "usd/m³"),
    # diésel de referencia
    "diesel_usa": ("Diesel Diesel Consumer Prices USA   (usd/ton)", "Diesel USA al consumidor", "EIA", "diesel", "usd/ton"),  # (*)
    "diesel_nwe": ("Diesel Diesel cif Northwest Europe (prompt)   (usd/ton)", "Diesel CIF Noroeste de Europa", "F.O. Licht", "diesel", "usd/ton"),
    "diesel_nymex": ("Diesel Diesel USA NY Harbor No. 2 Heating Oil, Nymex   front month (usd/ton)", "Heating oil No. 2 Nymex, NY Harbor", "F.O. Licht", "diesel", "usd/ton"),
    "diesel_ulsd": ("New York Harbor Ultra-Low Sulfur No 2 Diesel Spot Price(usd/ton)", "ULSD spot NY Harbor", "EIA", "diesel", "usd/ton"),
    # biodiésel
    "fame_ara": ("Biodiesel FAME, CFPP -10 Europe, ARA fob", "Biodiesel FAME ARA fob", "F.O. Licht", "bio", "usd/ton"),  # (*)
    "pme_ara": ("Biodiesel PME, CFPP 10 Europe, ARA fob", "Biodiesel PME ARA fob", "F.O. Licht", "bio", "usd/ton"),
    "sme_arg": ("Biodiesel SME Americas, Argentina, Rosario fob (incl. export tax)", "Biodiesel SME Argentina fob Rosario", "F.O. Licht", "bio", "usd/ton"),
    "sme_usg": ("Biodiesel SME Americas, USA, Gulf Coast fob", "Biodiesel SME USA Golfo fob", "F.O. Licht", "bio", "usd/ton"),
    "jj_bio_fob": ("JJ Biodiesel Export Price SPOT FOB Rosario", "Biodiesel exportación spot FOB Rosario", "J.J. Hinrichsen", "bio", "usd/ton"),
    "bio_963_gi": ("GRANDE", "Biodiesel - Res. 963 grande integrada", "Secretaría de Energía", "bio", "usd/ton"),
    "bio_963_gni": ("GRANDE NO INTEGRADA", "Biodiesel - Res. 963 grande no integrada", "Secretaría de Energía", "bio", "usd/ton"),
    "bio_963_m": ("MEDIANA", "Biodiesel corte obligatorio", "Secretaría de Energía", "bio", "usd/ton"),  # (*) mediana 963, nombre de HDO 07/10/2026
    "bio_963_p": ("PEQUEÑA", "Biodiesel - Res. 963 pequeña", "Secretaría de Energía", "bio", "usd/ton"),
    # aceite de soja
    "aceite_fas": ("JJ Aceite FAS ROSARIO Promedio", "Aceite de soja FAS Rosario", "J.J. Hinrichsen", "aceite", "usd/ton"),  # (*)
    "aceite_fas_vendedor": ("JJ Aceite FAS ROSARIO VENDEDOR", "Aceite de soja FAS Rosario vendedor", "J.J. Hinrichsen", "aceite", "usd/ton"),
    "aceite_fas_minagri": ("FAS MinAgri", "Aceite de soja FAS MinAgri", "SAGyP", "aceite", "usd/ton"),
    "aceite_fob_sagyp": ("FOB SAGYPYA SPOT SBO", "Aceite de soja FOB oficial SAGyP", "SAGyP", "aceite", "usd/ton"),
    "aceite_upriver": ("Feedstocks Soy oil, crude South America, Up River(ARG) fob  (usd/ton)", "Aceite de soja Up River fob", "F.O. Licht", "aceite", "usd/ton"),
    # metanol y glicerina
    "metanol_usa": ("Chemicals Methanol Americas USA, Contract (Methanex)  (usd/ton)", "Metanol Methanex USA contrato", "F.O. Licht", "metanol", "usd/ton"),
    "metanol_eu": ("Chemicals Methanol Europe Contract (Methanex)  (usd/ton)", "Metanol Methanex Europa contrato", "F.O. Licht", "metanol", "usd/ton"),
    "metanol_ypf": ("Metanol YPF (usd/ton)", "Metanol YPF", "YPF", "metanol", "usd/ton"),
    "glicerina": ("Renewable Chemicals Glycerine Argentina 80%crude, Rosario, fob  (usd/ton)", "Glicerina cruda 80% Rosario fob", "F.O. Licht", "glicerina", "usd/ton"),
}
# Las series que el ranking mostraba desde el principio: a estas se les exige
# llegar hasta dos meses antes del último mes del relevamiento; las demás
# pueden terminar antes (el JSON guarda `hasta` y el sitio lo muestra).
PRODUCTOS_BASE = ("brent", "wti", "fame_ara", "bio_963_m", "aceite_fas")
CRUDOS = tuple(k for k, v in PRODUCTOS_MASTER.items() if v[3] == "crudo")
# Series de Master data que no van al ranking: alimentan la página Precios
# comparados (tablero ARG GO MARKET SIDE BY SIDE), en el bloque "comparados"
# de gasoil_ranking.json. El aceite FAS MINAGRI se calcula como el workbook
# (campo "ACEITE FAS MINAGRI"): FOB oficial de la SAGyP por (1 - retención
# del aceite), día a día y promediado por mes; es distinto del promedio de
# J.J. Hinrichsen que usa el ranking. El metanol YPF llega hasta donde
# Master data tiene dato (feb-2026 al 01/10/2026).
SERIES_COMPARADOS = {
    "aceite_minagri": ("FOB SAGYPYA SPOT SBO", "Aceite de soja FAS MINAGRI", "MINAGRI: FOB oficial menos retención"),
    "metanol_ypf": ("Metanol YPF (usd/ton)", "Metanol YPF", "YPF"),
}
RETENCION_ACEITE = "ARGENTINA  SBO Export tax"  # fracción (0,245 = 24,5%)
PRODUCTOS_GO = {
    "go2_surtidor": ("Gas oil grado 2 - surtidor", 2, "s"),
    "go2_sin_imp": ("Gas oil grado 2 - sin impuestos", 2, "n"),
    "go3_surtidor": ("Gas oil grado 3 - surtidor", 3, "s"),
    "go3_sin_imp": ("Gas oil grado 3 - sin impuestos", 3, "n"),
}


def mes_corto(f):
    """'2026-01' → 'ene 2026', como lo muestra el sitio."""
    nombres = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    return f"{nombres[int(f[5:7]) - 1]} {f[:4]}"


def fail(msg):
    sys.exit(f"\n✗ ERROR (gas oil): {msg}\nNo se escribió ningún archivo.")


def check(cond, msg):
    if not cond:
        fail(msg)


def ym(d):
    return f"{d.year:04d}-{d.month:02d}"


def meses_entre(desde, hasta):
    y, m = int(desde[:4]), int(desde[5:])
    out = []
    while True:
        f = f"{y:04d}-{m:02d}"
        out.append(f)
        if f >= hasta:
            return out
        m += 1
        if m > 12:
            y, m = y + 1, 1


class Hyper:
    def __init__(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="regen_gasoil_"))
        self.hp = HyperProcess(telemetry=Telemetry.DO_NOT_SEND_USAGE_DATA_TO_TABLEAU)

    def query(self, name, sql):
        local = self.tmp / f"{name}.hyper"
        if not local.exists():
            shutil.copy(SRC[name], local)
        with Connection(endpoint=self.hp.endpoint, database=str(local)) as conn:
            return conn.execute_list_query(sql)

    def close(self):
        self.hp.close()
        shutil.rmtree(self.tmp, ignore_errors=True)


class Indice:
    """Lista de valores con índice estable (para compactar los JSON)."""

    def __init__(self):
        self.valores = []
        self.pos = {}

    def __call__(self, v):
        if v not in self.pos:
            self.pos[v] = len(self.valores)
            self.valores.append(v)
        return self.pos[v]


def r2(x):
    return None if x is None else round(float(x), 2)


# ------------------------------------------------------------- precios 1104

def _sql_eess(filtro):
    """Precio medio y volumen de cada EESS-mes (el relevamiento trae el precio
    y el volumen en filas distintas de la misma estación)."""
    return f'''
      SELECT "Fecha" f, "Provincia" prov, "Bandera" band,
             "Canal Distribución" cd, "Canal de Comercialización" cc, "Tipo Negocio" tn,
             "CUIT" cuit, "Dirección" dir,
             AVG("Gas Oil Grado 2 - Precio Surtidor") s2,
             AVG("Gas Oil Grado 2 - Precio Con Impuestos") c2,
             AVG("Gas Oil Grado 2 - Precio Sin Impuestos") n2,
             SUM("Gas Oil Grado 2 - Volumen") v2,
             AVG("Gas Oil Grado 3 - Precio Surtidor") s3,
             AVG("Gas Oil Grado 3 - Precio Con Impuestos") c3,
             AVG("Gas Oil Grado 3 - Precio Sin Impuestos") n3,
             SUM("Gas Oil Grado 3 - Volumen") v3
      FROM {T}
      WHERE "Fecha" >= DATE '{DESDE}-01' AND {filtro}
      GROUP BY 1,2,3,4,5,6,7,8'''


def _sql_ponderado(sub, claves):
    """Agrega las EESS: volumen ponderador y precio ponderado por tipo."""
    def pond(p, v):
        return (f"SUM(CASE WHEN {p} IS NOT NULL AND {v} > 0 THEN {p}*{v} END)"
                f"/NULLIF(SUM(CASE WHEN {p} IS NOT NULL AND {v} > 0 THEN {v} END),0)")
    def peso(p, v):
        return f"SUM(CASE WHEN {p} IS NOT NULL AND {v} > 0 THEN {v} END)"
    return f'''
      SELECT {claves},
             {peso('s2','v2')} w2, {pond('s2','v2')} ps2, {pond('c2','v2')} pc2, {pond('n2','v2')} pn2,
             COUNT(CASE WHEN s2 IS NOT NULL THEN 1 END) e2,
             {peso('s3','v3')} w3, {pond('s3','v3')} ps3, {pond('c3','v3')} pc3, {pond('n3','v3')} pn3,
             {peso('c2','v2')} wc2, {peso('n2','v2')} wn2, {peso('c3','v3')} wc3, {peso('n3','v3')} wn3,
             SUM(v2) vt2, SUM(v3) vt3
      FROM ({sub}) e
      GROUP BY {claves}
      ORDER BY {claves}'''


RETAIL_COLS = ["mes", "prov", "band", "cd", "tn", "cc", "w2", "s2", "c2", "n2", "e2", "w3", "s3", "c3", "n3"]


def extraer_retail(hy, ix_mes, ix_prov, ix_band, ix_tn, ix_cc):
    """Cruce completo mes × provincia × bandera × canal distribución × tipo de
    negocio × canal comercialización, en columnas (compacto): base de los
    filtros de Precio surtidor. Precios en centavos de $/l (enteros, 0 = sin
    dato); volumen = m3 de las EESS con precio surtidor (ponderador)."""
    rows = hy.query("p1104", _sql_ponderado(_sql_eess("1=1"), "f, prov, band, cd, tn, cc"))
    cols = {c: [] for c in RETAIL_COLS}
    cent = lambda x: int(round(float(x) * 100)) if x else 0
    for (f, prov, band, cd, tn, cc, w2, ps2, pc2, pn2, e2, w3, ps3, pc3, pn3,
         wc2, wn2, wc3, wn3, vt2, vt3) in rows:
        if not (w2 or wc2 or wn2 or w3 or wc3 or wn3):
            continue
        cols["mes"].append(ix_mes(ym(f)))
        cols["prov"].append(ix_prov(PROVINCIA_ALIAS.get(prov, prov) or "N/D"))
        cols["band"].append(ix_band(BANDERA_ALIAS.get(band, band) or "BLANCA"))
        cols["cd"].append(0 if cd == "Minorista" else 1)
        cols["tn"].append(ix_tn(tn or "N/D"))
        cols["cc"].append(ix_cc(cc or "N/D"))
        # ponderador: volumen de las EESS con precio con impuestos (existe en
        # todos los canales; el surtidor solo al público)
        cols["w2"].append(int(wc2 or w2 or 0)); cols["s2"].append(cent(ps2)); cols["c2"].append(cent(pc2)); cols["n2"].append(cent(pn2))
        cols["e2"].append(int(e2 or 0))
        cols["w3"].append(int(wc3 or w3 or 0)); cols["s3"].append(cent(ps3)); cols["c3"].append(cent(pc3)); cols["n3"].append(cent(pn3))
    return cols


N_PARTES = 96  # particiones de los datos por boca (una por operador, hash del índice)
BOCA_COLS = ["mes", "boca", "op", "prov", "band", "cd", "tn", "cc", "w2", "s2", "c2", "n2", "e2", "w3", "s3", "c3", "n3"]
MES_COLS = ["boca", "op", "band", "cd", "tn", "cc", "w2", "s2", "c2", "n2", "w3", "s3", "c3", "n3"]


def extraer_bocas(hy, ix_mes, ix_prov, ix_band, ix_tn, ix_cc, geo):
    """Precio y volumen de cada boca (Nro Inscripción) por mes, más el índice
    de operadores y bocas. Devuelve (operadores, bocas, partes) donde partes
    es una lista de N_PARTES diccionarios columnares (BOCA_COLS)."""
    rows = hy.query("p1104", f'''
      SELECT f, boca, op, prov, band, cd, tn, cc, loc, dir,
             SUM(CASE WHEN s2 IS NOT NULL AND v2 > 0 THEN v2 END) w2,
             SUM(CASE WHEN s2 IS NOT NULL AND v2 > 0 THEN s2*v2 END)/NULLIF(SUM(CASE WHEN s2 IS NOT NULL AND v2 > 0 THEN v2 END),0) ps2,
             SUM(CASE WHEN c2 IS NOT NULL AND v2 > 0 THEN c2*v2 END)/NULLIF(SUM(CASE WHEN c2 IS NOT NULL AND v2 > 0 THEN v2 END),0) pc2,
             SUM(CASE WHEN n2 IS NOT NULL AND v2 > 0 THEN n2*v2 END)/NULLIF(SUM(CASE WHEN n2 IS NOT NULL AND v2 > 0 THEN v2 END),0) pn2,
             SUM(CASE WHEN c2 IS NOT NULL AND v2 > 0 THEN v2 END) wc2,
             SUM(CASE WHEN s3 IS NOT NULL AND v3 > 0 THEN v3 END) w3,
             SUM(CASE WHEN s3 IS NOT NULL AND v3 > 0 THEN s3*v3 END)/NULLIF(SUM(CASE WHEN s3 IS NOT NULL AND v3 > 0 THEN v3 END),0) ps3,
             SUM(CASE WHEN c3 IS NOT NULL AND v3 > 0 THEN c3*v3 END)/NULLIF(SUM(CASE WHEN c3 IS NOT NULL AND v3 > 0 THEN v3 END),0) pc3,
             SUM(CASE WHEN n3 IS NOT NULL AND v3 > 0 THEN n3*v3 END)/NULLIF(SUM(CASE WHEN n3 IS NOT NULL AND v3 > 0 THEN v3 END),0) pn3,
             SUM(CASE WHEN c3 IS NOT NULL AND v3 > 0 THEN v3 END) wc3
      FROM (
        SELECT "Fecha" f, "Nro Inscripción" boca, "Operador" op, "Provincia" prov, "Bandera" band,
               "Canal Distribución" cd, "Tipo Negocio" tn, "Canal de Comercialización" cc,
               "Localidad" loc, "Dirección" dir, "CUIT" cuit,
               AVG("Gas Oil Grado 2 - Precio Surtidor") s2, AVG("Gas Oil Grado 2 - Precio Con Impuestos") c2,
               AVG("Gas Oil Grado 2 - Precio Sin Impuestos") n2, SUM("Gas Oil Grado 2 - Volumen") v2,
               AVG("Gas Oil Grado 3 - Precio Surtidor") s3, AVG("Gas Oil Grado 3 - Precio Con Impuestos") c3,
               AVG("Gas Oil Grado 3 - Precio Sin Impuestos") n3, SUM("Gas Oil Grado 3 - Volumen") v3
        FROM {T} WHERE "Fecha" >= DATE '{DESDE}-01' AND "Nro Inscripción" IS NOT NULL
        GROUP BY 1,2,3,4,5,6,7,8,9,10,11
      ) e
      GROUP BY 1,2,3,4,5,6,7,8,9,10
      ORDER BY 1,2''')
    ix_op = Indice()
    bocas = {}   # id → [id, op, band, prov, localidad, direccion, lng, lat] (último mes visto)
    partes = [{c: [] for c in BOCA_COLS} for _ in range(N_PARTES)]
    meses = defaultdict(lambda: {c: [] for c in MES_COLS})  # fecha → columnas de las bocas relevadas ese mes
    cent = lambda x: int(round(float(x) * 100)) if x else 0
    n = 0
    for (f, boca, op, prov, band, cd, tn, cc, loc, dir_, w2, ps2, pc2, pn2, wc2, w3, ps3, pc3, pn3, wc3) in rows:
        if not (w2 or wc2 or w3 or wc3):
            continue
        boca = int(boca)
        o = ix_op(nfc_str(op) or "N/D")
        b = ix_band(BANDERA_ALIAS.get(band, band) or "BLANCA")
        pr = ix_prov(PROVINCIA_ALIAS.get(prov, prov) or "N/D")
        geo_pt = geo.get(boca)
        bocas[boca] = [boca, o, b, pr, (loc or "").title(), (dir_ or "").strip().title(),
                       geo_pt[0] if geo_pt else None, geo_pt[1] if geo_pt else None]
        P = partes[o % N_PARTES]
        P["mes"].append(ix_mes(ym(f))); P["boca"].append(boca); P["op"].append(o)
        P["prov"].append(pr); P["band"].append(b)
        P["cd"].append(0 if cd == "Minorista" else 1); P["tn"].append(ix_tn(tn or "N/D")); P["cc"].append(ix_cc(cc or "N/D"))
        P["w2"].append(int(wc2 or w2 or 0)); P["s2"].append(cent(ps2)); P["c2"].append(cent(pc2)); P["n2"].append(cent(pn2))
        P["e2"].append(1 if ps2 else 0)
        P["w3"].append(int(wc3 or w3 or 0)); P["s3"].append(cent(ps3)); P["c3"].append(cent(pc3)); P["n3"].append(cent(pn3))
        M = meses[ym(f)]
        M["boca"].append(boca); M["op"].append(o); M["band"].append(b)
        M["cd"].append(P["cd"][-1]); M["tn"].append(P["tn"][-1]); M["cc"].append(P["cc"][-1])
        for c in ("w2", "s2", "c2", "n2", "w3", "s3", "c3", "n3"):
            M[c].append(P[c][-1])
        n += 1
    print(f"  bocas: {n} filas boca-mes · {len(bocas)} bocas · {len(ix_op.valores)} operadores · "
          f"{sum(1 for b in bocas.values() if b[6] is not None)} con coordenadas")
    return ix_op.valores, [bocas[k] for k in sorted(bocas)], partes, meses


def nfc_str(s):
    import unicodedata
    return unicodedata.normalize("NFC", s).strip() if isinstance(s, str) else s


def extraer_geo(hy):
    """idempresa (= Nro Inscripción de la SE) → (lng, lat) de las EESS georreferenciadas."""
    rows = hy.query("eess", f'SELECT "idempresa", "geojson" FROM {T}')
    geo = {}
    for idem, gj in rows:
        try:
            lng, lat = json.loads(gj)["coordinates"]
            geo[int(idem)] = (round(lng, 4), round(lat, 4))
        except (TypeError, ValueError, KeyError):
            continue
    return geo


def extraer_canales(hy, ix_mes, ix_cc):
    """Todos los canales (minorista y mayorista), sin provincia ni bandera:
    base de la sección minorista/mayorista. Surtidor solo tiene sentido al
    público; el volumen ponderador es el de las EESS con precio con impuestos."""
    rows = hy.query("p1104", _sql_ponderado(_sql_eess("1=1"), "f, cd, cc"))
    filas = []
    for (f, cd, cc, w2, ps2, pc2, pn2, e2, w3, ps3, pc3, pn3, wc2, wn2, wc3, wn3, vt2, vt3) in rows:
        if not (wc2 or wn2 or wc3 or wn3):
            continue
        filas.append([
            ix_mes(ym(f)), 0 if cd == "Minorista" else 1, ix_cc(cc or "N/D"),
            int(wc2 or 0), r2(ps2), r2(pc2), r2(pn2),
            int(wc3 or 0), r2(ps3), r2(pc3), r2(pn3),
        ])
    return filas


def extraer_flujos(hy, ix_mes, ix_tn, ix_cc):
    """Volumen GO2+GO3 (m3) por mes, canal de distribución, tipo de negocio y
    canal de comercialización: los tres niveles del Sankey."""
    rows = hy.query("p1104", f'''
      SELECT "Fecha", "Canal Distribución", "Tipo Negocio", "Canal de Comercialización",
             SUM(COALESCE("Gas Oil Grado 2 - Volumen",0)), SUM(COALESCE("Gas Oil Grado 3 - Volumen",0))
      FROM {T} WHERE "Fecha" >= DATE '{DESDE}-01'
      GROUP BY 1,2,3,4 ORDER BY 1,2,3,4''')
    filas = []
    for f, cd, tn, cc, v2, v3 in rows:
        if (v2 or 0) + (v3 or 0) <= 0:
            continue
        filas.append([ix_mes(ym(f)), 0 if cd == "Minorista" else 1, ix_tn(tn or "N/D"), ix_cc(cc or "N/D"),
                      int(v2 or 0), int(v3 or 0)])
    return filas


def extraer_eess(hy, ix_prov, ix_band):
    rows = hy.query("eess", f'SELECT "empresabandera", "provincia", "localidad", "geojson" FROM {T}')
    puntos = []
    for band, prov, loc, geo in rows:
        try:
            lng, lat = json.loads(geo)["coordinates"]
        except (TypeError, ValueError, KeyError):
            continue
        b = BANDERA_ALIAS.get(band, band or "BLANCA")
        prov = PROVINCIA_ALIAS.get(prov, prov) or "N/D"  # 18% de las EESS vienen sin provincia
        puntos.append([round(lng, 4), round(lat, 4), ix_band(b), ix_prov(prov),
                       (loc or "").title()])
    return puntos


# ------------------------------------------------------------------ ranking

def extraer_master(hy):
    """Series mensuales de Master data (promedio de los valores del mes): TC,
    CPI, los productos del ranking y las series de Precios comparados.
    Una columna puede alimentar más de una serie (metanol YPF)."""
    series_cols = {"tc": "Exchange Rate Mean", "cpi": "Consumer Price Index - US"}
    series_cols.update({k: v[0] for k, v in PRODUCTOS_MASTER.items()})
    series_cols.update({k: v[0] for k, v in SERIES_COMPARADOS.items()})
    cols = list(dict.fromkeys(list(series_cols.values()) + [RETENCION_ACEITE]))
    rows = hy.query("master", f'''SELECT "Date", {", ".join(f'"{c}"' for c in cols)} FROM {T}
        WHERE "Date" >= DATE '{DESDE}-01' ORDER BY "Date"''')
    pos = {c: i + 1 for i, c in enumerate(cols)}
    acum = defaultdict(lambda: defaultdict(list))
    for r in rows:
        f = ym(r[0])
        retencion = r[pos[RETENCION_ACEITE]]
        for nombre, col in series_cols.items():
            val = r[pos[col]]
            if val is not None and val > 0:
                val = float(val)
                # Aceite FAS MINAGRI = FOB oficial × (1 - retención), como el workbook
                if nombre == "aceite_minagri":
                    if retencion is None:
                        continue
                    val *= 1 - float(retencion)
                # Diesel USA al consumidor: desde dic-2025 la columna trae
                # ceros y valores sueltos (≈3 o ≈17): datos rotos en Master
                # data, se descartan (la serie termina en nov-2025).
                if nombre == "diesel_usa" and val < 100:
                    continue
                acum[f][nombre].append(val)
    series = defaultdict(dict)
    for f, d in acum.items():
        for k, vals in d.items():
            series[k][f] = sum(vals) / len(vals)
    return series


def extraer_res963(master):
    """Precio del biodiésel Res. 963 por mes desde nov-2023: fórmula (Explora,
    columna "Fórmula" del Excel que carga HDO), publicado (la MEDIANA de Master
    data; si falta, la columna "Publicado" del Excel), cupo del mes y cupo de
    Explora (toneladas) y TC. Un mes con dos filas (sep-2025, dos cupos) se
    suma y su publicado del Excel se pondera por cupo."""
    try:
        import openpyxl
    except ImportError:
        sys.exit("Falta openpyxl:  pip3 install openpyxl")
    check(RES963.exists(), f"No se encuentra {RES963}")
    tmp = Path(tempfile.mkdtemp(prefix="regen_res963_"))
    try:
        local = tmp / "res963.xlsx"
        shutil.copy(RES963, local)
        wb = openpyxl.load_workbook(local, read_only=True, data_only=True)
        ws = wb.worksheets[0]
        filas = list(ws.iter_rows(values_only=True))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    cab = [str(c).strip() if c is not None else "" for c in filas[0]]
    col = {}
    for n in ("Date", "Fórmula", "Publicado", "Cupo", "Cupo Explora"):
        check(n in cab, f"Res. 963: falta la columna '{n}' en el Excel ({cab})")
        col[n] = cab.index(n)
    por_mes = {}
    for r in filas[1:]:
        d = r[col["Date"]]
        if not d or r[col["Fórmula"]] is None:
            continue
        f = ym(d)
        m = por_mes.setdefault(f, dict(formula=None, pub=[0.0, 0.0], cupo=0.0, cupo_explora=0.0))
        formula = float(r[col["Fórmula"]])
        check(m["formula"] is None or abs(m["formula"] - formula) < 1, f"Res. 963 {f}: dos fórmulas distintas")
        m["formula"] = formula
        cupo = float(r[col["Cupo"]] or 0)
        m["cupo"] += cupo
        m["cupo_explora"] += float(r[col["Cupo Explora"]] or 0)
        if r[col["Publicado"]] is not None and cupo:
            m["pub"][0] += float(r[col["Publicado"]]) * cupo
            m["pub"][1] += cupo
    out = []
    avisos = []
    del_excel = []
    for f in sorted(por_mes):
        m = por_mes[f]
        # Publicado: siempre la MEDIANA de Master data (regla de HDO, 01/10/2026); si
        # un mes no la tiene (el Excel va más adelante que Master data), el publicado
        # del Excel, ponderado por cupo si el mes tiene dos filas. La fórmula es
        # siempre la del Excel. Se avisa cuando las dos fuentes difieren.
        mediana = master["bio_963_m"].get(f)
        pub_xls = m["pub"][0] / m["pub"][1] if m["pub"][1] else None
        check(mediana or pub_xls, f"Res. 963 {f}: sin publicado ni en Master data ni en el Excel")
        publicado = mediana or pub_xls
        if mediana:
            if pub_xls and abs(pub_xls / mediana - 1) > 0.005:
                avisos.append(f"{f} (MEDIANA {mediana:,.0f}, Excel {pub_xls:,.0f})")
        else:
            del_excel.append(f)
        tc = master["tc"].get(f)
        check(tc, f"Res. 963 {f}: sin tipo de cambio")
        out.append(dict(fecha=f, formula=round(m["formula"]), publicado=round(publicado), publicado_de="mediana" if mediana else "excel",
                        cupo=round(m["cupo"]), cupo_explora=round(m["cupo_explora"]), tc=round(tc, 2)))
    check(len(out) >= 24, f"Res. 963: solo {len(out)} meses")
    if avisos:
        print("  ⚠ Res. 963: la MEDIANA de Master data (la que se usa) difiere del publicado del Excel en " + "; ".join(avisos))
    if del_excel:
        print(f"  ⚠ Res. 963: sin MEDIANA en Master data, publicado tomado del Excel en {', '.join(del_excel)}")
    return out


def extraer_regalias():
    """Crudos mensuales del informe de regalías de crudo (Brent, WTI y los
    ocho crudos locales), en la misma unidad que Master data, usd/m³ (la hoja
    es la fuente de esas columnas): {id: {fecha: valor}}. El año figura solo en la
    primera fila de cada año (columna "a") y se arrastra. No se usan las
    columnas AÑO y MES: son fórmulas, y si el archivo no se guardó desde Excel
    vienen sin resultado (así perdió el flujo de Prep todo 2026 el 23/09/2026).
    Devuelve {} si el informe no está o no se puede leer."""
    try:
        import openpyxl
    except ImportError:
        return {}
    if not REGALIAS.exists():
        return {}
    tmp = Path(tempfile.mkdtemp(prefix="regen_regalias_"))
    try:
        local = tmp / "regalias.xlsx"
        shutil.copy(REGALIAS, local)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")  # openpyxl avisa por los segmentadores del libro
            wb = openpyxl.load_workbook(local, read_only=True, data_only=True)
            if HOJA_REGALIAS not in wb.sheetnames:
                return {}
            filas = list(wb[HOJA_REGALIAS].iter_rows(values_only=True))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    limpio = lambda c: c.strip() if isinstance(c, str) else ""
    h = next((i for i, r in enumerate(filas[:40]) if r and "BRENT" in [limpio(c) for c in r]), None)
    if h is None:
        return {}
    enc = [limpio(c) for c in filas[h]]
    if not all(c in enc for c in ("a", "m", "WTI")):
        return {}
    ia, im = enc.index("a"), enc.index("m")
    # todos los crudos del catálogo que la hoja tenga (Brent y WTI siempre)
    cols = {k: enc.index(PRODUCTOS_MASTER[k][0]) for k in CRUDOS if PRODUCTOS_MASTER[k][0] in enc}
    es_num = lambda x: isinstance(x, (int, float)) and not isinstance(x, bool)
    out = {k: {} for k in cols}
    anio = None
    for r in filas[h + 1:]:
        if not r or len(r) <= max(ia, im, *cols.values()):
            continue
        if es_num(r[ia]):
            anio = int(r[ia])
        if anio is None or not es_num(r[im]) or not 1 <= r[im] <= 12:
            continue
        f = f"{anio:04d}-{int(r[im]):02d}"
        for k, i in cols.items():
            if es_num(r[i]) and r[i] > 0:
                out[k][f] = float(r[i])
    return out


def completar_con_regalias(master, regalias):
    """Agrega a cada crudo de Master data los meses posteriores a su último
    dato que el informe de regalías sí trae. No pisa nada de lo que Master
    data ya tiene. Devuelve {serie: [meses agregados]} y avisa si en los meses
    que comparten los dos los valores no coinciden."""
    agregados = {}
    for k in CRUDOS:
        serie = regalias.get(k, {})
        master.setdefault(k, {})
        ultimo = max(master[k]) if master.get(k) else ""
        distintos = [f for f in sorted(serie)[-36:] if f in master[k] and abs(serie[f] / master[k][f] - 1) > 0.005]
        if distintos:
            print(f"  ⚠ '{k}': Master data y el informe de regalías difieren en {', '.join(distintos[-6:])} "
                  f"(queda el valor de Master data)")
        nuevos = sorted(f for f in serie if f > ultimo and f >= DESDE)
        for f in nuevos:
            master[k][f] = serie[f]
        agregados[k] = nuevos
    return agregados


def extraer_importaciones(hy):
    """Serie mensual del gas oil importado (toneladas y precios CIF y FOB) para
    Minorista y mayorista, Volumen 1104 y Tablas SESCO. Sin CAMMESA, que importa
    para las usinas eléctricas (decisión HDO 01/10/2026, como la página
    Importaciones y el tablero de Tableau). Trae todos los meses hasta el
    último con algún despacho: los que no tienen importaciones de los demás
    van con 0 toneladas y sin precio, así los gráficos los muestran en cero."""
    rows = hy.query("imports", f'''
      SELECT "Fecha", SUM("Kgs. Netos")/1000, SUM("U$S CIF"), SUM("U$S FOB")
      FROM {T} WHERE "Fecha" >= DATE '{DESDE}-01' AND "Importador" <> '{CAMMESA}' GROUP BY 1 ORDER BY 1''')
    ultimo = hy.query("imports", f'SELECT MAX("Fecha") FROM {T}')[0][0]
    mensual = defaultdict(lambda: [0.0, 0.0, 0.0])
    for f, ton, cif, fob in rows:
        m = mensual[ym(f)]
        m[0] += ton or 0
        m[1] += cif or 0
        m[2] += fob or 0
    out = []
    for f in meses_entre(DESDE, ym(ultimo)):
        ton, cif, fob = mensual.get(f, (0.0, 0.0, 0.0))
        if ton <= 0:
            out.append(dict(fecha=f, ton=0, cif_usd_ton=None, fob_usd_ton=None))
            continue
        out.append(dict(fecha=f, ton=round(ton), cif_usd_ton=round(cif / ton, 1), fob_usd_ton=round(fob / ton, 1)))
    return out


def serie_pais(retail, meses, tipos_retail_idx, cc_publico):
    """Precio ponderado país por mes (minorista, al público, bocas de expendio):
    fecha → {s2, n2, s3, n3} en $/l. Alimenta el ranking."""
    acum = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0]))
    R = retail
    for i in range(len(R["mes"])):
        if R["cd"][i] != 0 or R["cc"][i] != cc_publico or R["tn"][i] not in tipos_retail_idx:
            continue
        f = meses[R["mes"][i]]
        for k, p, w in (("s2", R["s2"][i], R["w2"][i]), ("n2", R["n2"][i], R["w2"][i]),
                        ("s3", R["s3"][i], R["w3"][i]), ("n3", R["n3"][i], R["w3"][i])):
            if p and w:
                acum[f][k][0] += p / 100 * w
                acum[f][k][1] += w
    return {f: {k: v[0] / v[1] for k, v in d.items() if v[1]} for f, d in acum.items()}


# ---------------------------------------------------------------------- salida

def escribir(nombre, payload, fuentes, dry):
    payload["meta"] = dict(
        **payload.get("meta", {}),
        generado=datetime.now().strftime("%Y-%m-%d %H:%M"),
        fuentes=fuentes,
        nota="Generado por scripts/regenerate_gasoil.py - no editar a mano",
    )
    destino = OUT_DIR / nombre
    if dry:
        print(f"  [dry-run] {nombre}: {len(json.dumps(payload, ensure_ascii=False, separators=(',', ':')))//1024} KB")
        return
    destino.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  ✓ {nombre} ({destino.stat().st_size // 1024} KB)")


PUB_DIR = Path(__file__).resolve().parent.parent / "public" / "data"


def escribir_publico(nombre, payload, dry):
    payload["generado"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    texto = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if dry:
        print(f"  [dry-run] public/data/{nombre}: {len(texto)//1024} KB")
        return
    PUB_DIR.mkdir(parents=True, exist_ok=True)
    (PUB_DIR / nombre).write_text(texto, encoding="utf-8")
    print(f"  ✓ public/data/{nombre} ({len(texto) // 1024} KB)")


def mismas_filas(destino, nuevo):
    """True si el archivo columnar ya existe con las mismas filas, en cualquier
    orden. La base no devuelve las filas en un orden estable: sin este chequeo,
    regenerar sin cambios en la fuente reescribe los 295 archivos por boca y
    por mes (126 MB) y ensucia el repo con diferencias que no son de datos."""
    if not destino.exists():
        return False
    try:
        viejo = json.loads(destino.read_text(encoding="utf-8"))
    except ValueError:
        return False
    if list(viejo) != list(nuevo):
        return False
    return sorted(zip(*viejo.values())) == sorted(zip(*nuevo.values()))


def generar(dry=False):
    for k, p in SRC.items():
        check(p.exists(), f"Fuente '{k}' no encontrada: {p}")
    mapa = json.loads(MAPA.read_text(encoding="utf-8"))
    provincias_mapa = {p["nombre"] for p in mapa["provincias"]}

    print("Gas oil: leyendo fuentes…")
    hy = Hyper()
    try:
        ultimo = hy.query("p1104", f'SELECT MAX("Fecha") FROM {T}')[0][0]
        meses = meses_entre(DESDE, ym(ultimo))
        ix_mes = Indice()
        for f in meses:
            ix_mes(f)
        ix_prov, ix_band, ix_cc, ix_tn = Indice(), Indice(), Indice(), Indice()
        retail = extraer_retail(hy, ix_mes, ix_prov, ix_band, ix_tn, ix_cc)
        geo = extraer_geo(hy)
        operadores, bocas, partes, por_mes = extraer_bocas(hy, ix_mes, ix_prov, ix_band, ix_tn, ix_cc, geo)
        # después del cruce y las bocas, así los índices nuevos (tipos o canales
        # que solo tienen naftas o kerosene) quedan al final de las listas
        productos_1104 = extraer_productos(lambda sql: hy.query("p1104", sql), DESDE, ix_mes, ix_tn, ix_cc)
        canales = extraer_canales(hy, ix_mes, ix_cc)
        flujos = extraer_flujos(hy, ix_mes, ix_tn, ix_cc)
        eess = extraer_eess(hy, ix_prov, ix_band)
        master = extraer_master(hy)
        res963 = extraer_res963(master)
        importaciones = extraer_importaciones(hy)
        sesco, resumen_sesco = extraer_sesco(lambda sql: hy.query("sesco", sql))
        despachos, resumen_despachos = extraer_despachos(lambda sql: hy.query("imports", sql))
    finally:
        hy.close()
    print(f"  retail: {len(retail['mes'])} filas · canales: {len(canales)} · flujos: {len(flujos)} · "
          f"EESS: {len(eess)} · importaciones: {len(importaciones)} meses")
    print(f"  SESCO: {resumen_sesco}")
    print(f"  Importaciones: {resumen_despachos}")
    # El cruce por despacho, sin CAMMESA, tiene que sumar por mes lo mismo que la serie
    # mensual (misma base y misma exclusión; el cruce deja afuera los despachos de menos de 100 kg)
    ton_mes = defaultdict(float)
    for m, i, t in zip(despachos["mes"], despachos["imp"], despachos["ton"]):
        if i != despachos["cammesa"]:
            ton_mes[despachos["meses"][m]] += t
    for fila in importaciones:
        check(abs(ton_mes.get(fila["fecha"], 0) - fila["ton"]) <= 3,
              f"Importaciones {fila['fecha']}: el cruce por despacho suma {ton_mes.get(fila['fecha'], 0):,.0f} t "
              f"y la serie mensual {fila['ton']:,} t")
    # Cantidad de estaciones de cada celda del cruce, desde los datos por boca
    estaciones = contar_estaciones(retail, partes)
    check(estaciones["sin_celda"] == 0,
          f"Estaciones: {estaciones['sin_celda']} filas de boca sin celda en el cruce fino")
    print(f"  estaciones del último mes: {estaciones['por_mes'][2].get(len(meses) - 1, 0)} con grado 2 · "
          f"{estaciones['por_mes'][3].get(len(meses) - 1, 0)} con grado 3")
    # Brent y WTI: los meses que le falten a Master data salen del informe de regalías
    de_regalias = completar_con_regalias(master, extraer_regalias())
    for k, nuevos in de_regalias.items():
        if nuevos:
            print(f"  ⚠ Master data sin '{k}' desde {nuevos[0]}: {len(nuevos)} meses tomados del informe "
                  f"de regalías ({nuevos[0]} a {nuevos[-1]})")

    # ------------------------------------------------------------ validar
    ultimo_mes = meses[-1]
    tipos_retail_idx = {ix_tn.pos[t] for t in TIPOS_RETAIL if t in ix_tn.pos}
    check(len(tipos_retail_idx) == len(TIPOS_RETAIL), "Faltan tipos de negocio minoristas en el relevamiento")
    check("Al público" in ix_cc.pos, "Falta el canal 'Al público'")
    pais = serie_pais(retail, meses, tipos_retail_idx, ix_cc.pos["Al público"])
    check(ultimo_mes in pais and "s2" in pais[ultimo_mes], f"Sin precio surtidor país en {ultimo_mes}")
    p_ult = pais[ultimo_mes]["s2"]
    # Productos del relevamiento (ranking): con el recorte inicial del ranking,
    # el gas oil tiene que dar exactamente la serie país precalculada
    cc_pub = ix_cc.pos["Al público"]
    f_def = lambda i: (productos_1104["cd"][i] == 0 and productos_1104["cc"][i] == cc_pub
                       and productos_1104["tn"][i] in tipos_retail_idx)
    for prod, tipo, k in (("g2", "s", "s2"), ("g2", "n", "n2"), ("g3", "s", "s3"), ("g3", "n", "n3")):
        s = serie_filtrada(productos_1104, meses, prod, tipo, f_def)
        con_dato = [f for f in pais if k in pais[f]]
        peor = max((abs(s.get(f, 0) - pais[f][k]) for f in con_dato), default=0)
        # tolerancia: el precio de cada celda va con cuatro decimales de $/l
        check(peor < 1e-4 and all(f in s for f in con_dato),
              f"Productos 1104: '{prod}/{tipo}' no reproduce la serie país (diferencia {peor:.6f} $/l)")
    print(f"  ✓ productos 1104: {len(productos_1104['mes'])} celdas · el gas oil con el recorte del ranking "
          f"reproduce la serie país")
    # Cifra ancla: jul-2026 el GO2 surtidor ponderado por EESS dio 2.269 $/l
    # (Tableau, ponderando por provincia, 2.283). Chequeo de orden de magnitud.
    if ultimo_mes == "2026-07":
        check(abs(p_ult - 2269) < 15, f"GO2 surtidor jul-2026 = {p_ult:.0f} $/l, esperado ≈ 2.269")
    for prov in ix_prov.valores:
        if prov != "N/D":
            check(prov in provincias_mapa, f"Provincia '{prov}' no existe en mapa_argentina.json")
    # Brent y WTI llegan un mes atrás en Master data: se admite hasta 2 meses de rezago
    # (solo para las series de siempre; las demás pueden terminar antes y se avisa)
    for k in list(PRODUCTOS_BASE) + ["tc", "cpi"]:
        check(master.get(k) and max(master[k]) >= meses[-3],
              f"Master data: '{k}' sin dato desde {meses[-3]} (último: {max(master.get(k, ['-']))})")
    for k in PRODUCTOS_MASTER:
        check(master.get(k), f"Master data: '{k}' ({PRODUCTOS_MASTER[k][0]}) sin ningún dato desde {DESDE}")
    atrasadas = [f"{k} ({max(master[k])})" for k in PRODUCTOS_MASTER if k not in PRODUCTOS_BASE and max(master[k]) < meses[-3]]
    if atrasadas:
        print(f"  ⚠ Series de Master data que terminan antes de {meses[-3]}: {', '.join(atrasadas)}")
    tc_ult = master["tc"][ultimo_mes]
    check(500 < tc_ult < 5000, f"TC {ultimo_mes} = {tc_ult}: fuera de rango")
    # Serie mensual continua en retail
    presentes = set(pais)
    faltan = [f for f in meses if f not in presentes]
    check(len(faltan) <= 2 and ultimo_mes in presentes,
          f"Retail: {len(faltan)} meses sin relevamiento: {faltan[:6]}")
    if faltan:
        print(f"  ⚠ Retail sin relevamiento en {', '.join(faltan)} (la SE no publicó ese mes)")
    print(f"  ✓ GO2 surtidor país {ultimo_mes}: {p_ult:,.0f} $/l · TC {tc_ult:,.0f} · "
          f"{len(ix_prov.valores)} provincias · {len(ix_band.valores)} banderas")

    # ------------------------------------------------------------ ranking
    productos = []
    for pid, (col, nombre, fuente, familia, unidad) in PRODUCTOS_MASTER.items():
        serie = [[f, round(v, 2)] for f, v in sorted(master[pid].items()) if f >= DESDE]
        productos.append(dict(id=pid, nombre=nombre, fuente=fuente, familia=familia, unidad=unidad, serie=serie))
    for p in productos:
        if p["id"] == "diesel_usa":
            p["nota"] = "Master data trae la serie rota desde dic-2025: termina en nov-2025"
        if de_regalias.get(p["id"]):
            # La nota se muestra en el sitio junto a la fuente. El informe avisa
            # que sus dos últimos períodos son provisorios.
            nuevos = de_regalias[p["id"]]
            p["nota"] = (f"{mes_corto(nuevos[0])} a {mes_corto(nuevos[-1])} del informe (faltan en Master data); "
                         f"los dos últimos meses son provisorios")
        if p["id"].startswith("bio_963_"):
            # 963: precio en $/ton → usd/ton con el TC del mes
            p["serie"] = [[f, round(v / master["tc"][f], 2)] for f, v in p["serie"] if f in master["tc"]]
            p["nota"] = "precio SE en $/ton convertido con el TC mensual"
        p["desde"], p["hasta"] = p["serie"][0][0], p["serie"][-1][0]
    comparados = []
    for pid, (col, nombre, fuente) in SERIES_COMPARADOS.items():
        serie = [[f, round(v, 2)] for f, v in sorted(master.get(pid, {}).items()) if f >= DESDE]
        check(serie, f"Master data: '{col}' sin datos desde {DESDE}")
        comparados.append(dict(id=pid, nombre=nombre, fuente=fuente, unidad="usd/ton", serie=serie,
                               hasta=serie[-1][0]))
    for pid, (nombre, grado, tipo) in PRODUCTOS_GO.items():
        k = f"{tipo}{grado}"
        serie = []
        for f in meses:
            v = pais.get(f, {}).get(k)
            tc = master["tc"].get(f)
            if v and tc:
                serie.append([f, round(v / tc * 1000 / DENSIDAD_GO, 2)])
        productos.append(dict(id=pid, nombre=nombre, fuente="SE Res. 1104 (ponderado país)",
                              unidad="usd/ton", serie=serie))
    for p in productos:
        check(len(p["serie"]) > 12, f"Ranking: serie '{p['id']}' con {len(p['serie'])} meses")

    print("Gas oil: escribiendo…")
    escribir("gasoil_precios.json", dict(
        desde=DESDE, ultimo_mes=ultimo_mes, meses=meses,
        provincias=ix_prov.valores, banderas=ix_band.valores,
        canales_distribucion=["Minorista", "Mayorista"],
        canales_comercializacion=ix_cc.valores, tipos_negocio=ix_tn.valores,
        campos=dict(
            retail="ver public/data/gasoil_retail.json (columnar, cruce mes × provincia × bandera × canal dist × tipo negocio × canal com)",
            canales="[mes, canal_dist, canal_com, vol2, surt2, conimp2, sinimp2, vol3, surt3, conimp3, sinimp3] "
                    "· todos los tipos de negocio y banderas · vol = m3 de las EESS con precio con impuestos",
            flujos="[mes, canal_dist, tipo_negocio, canal_com, vol2, vol3] · m3",
            eess="[lng, lat, bandera, provincia, localidad]",
        ),
        canales=canales, flujos=flujos, eess=eess,
    ), ["Precio derivados petroleo 1104 minorista y mayorista new.hyper",
        "EESS Localidad departamento provincia.hyper"], dry)
    # El cruce fino va fuera del bundle (public/): la sección lo pide al abrirse
    escribir_publico("gasoil_retail.json", dict(
        columnas=RETAIL_COLS + COLS_ESTACIONES, filas=len(retail["mes"]),
        nota="precios en centavos de $/l (0 = sin dato); w = m3 ponderador; e2 = EESS con precio surtidor; "
             + NOTA_ESTACIONES,
        operadores=operadores,
        bocas_campos="[nro_inscripcion, operador, bandera, provincia, localidad, direccion, lng, lat]",
        bocas=bocas, partes=N_PARTES, partes_columnas=BOCA_COLS, mes_columnas=MES_COLS,
        **retail,
    ), dry)
    # Datos por boca y mes, particionados por operador (hash = índice % N_PARTES):
    # la sección pide una partición al elegir un operador o una estación.
    total = 0
    iguales = 0
    for k, P in enumerate(partes):
        texto = json.dumps(P, ensure_ascii=False, separators=(",", ":"))
        total += len(texto)
        destino = PUB_DIR / "gasoil_bocas" / f"{k}.json"
        if mismas_filas(destino, P):
            iguales += 1
        elif not dry:
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(texto, encoding="utf-8")
    print(f"  {'[dry-run] ' if dry else '✓ '}public/data/gasoil_bocas/0..{N_PARTES - 1}.json ({total // 1024} KB en total; "
          f"{iguales} con las mismas filas, no se reescriben)")
    # Bocas relevadas en cada mes (mapa de estaciones con precio y tooltip): un archivo por mes
    total = 0
    iguales = 0
    for f, M in por_mes.items():
        texto = json.dumps(M, ensure_ascii=False, separators=(",", ":"))
        total += len(texto)
        destino = PUB_DIR / "gasoil_mes" / f"{f}.json"
        if mismas_filas(destino, M):
            iguales += 1
        elif not dry:
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(texto, encoding="utf-8")
    print(f"  {'[dry-run] ' if dry else '✓ '}public/data/gasoil_mes/<mes>.json ({len(por_mes)} meses, {total // 1024} KB en total; "
          f"{iguales} con las mismas filas, no se reescriben)")

    # Relevamiento abierto por producto para el ranking, también fuera del bundle
    escribir_productos(productos_1104, meses, ix_tn.valores, ix_cc.valores, dry)
    # Ventas de las tablas SESCO (página Tablas SESCO), también fuera del bundle
    escribir_sesco(sesco, dry)
    # Despachos de importación (página Importaciones), también fuera del bundle
    escribir_despachos(despachos, dry)

    escribir("gasoil_ranking.json", dict(
        desde=DESDE, ultimo_mes=ultimo_mes, densidad_go=DENSIDAD_GO,
        productos=productos,
        tc=[[f, round(v, 4)] for f, v in sorted(master["tc"].items())],  # 4 decimales: en 2011 (TC 4,1) dos movían 0,1%
        cpi_us=[[f, round(v, 3)] for f, v in sorted(master["cpi"].items())],
        importaciones=importaciones, comparados=comparados, res963=res963,
    ), ["Master data database.hyper", "Go Imports.hyper", "Database Precio Formula 963.xlsx",
        "Precio derivados petroleo 1104 minorista y mayorista new.hyper"]
       + (["Informe Regalias CRUDO.xlsx"] if any(de_regalias.values()) else []), dry)


if __name__ == "__main__":
    check(VOL.exists(), "El volumen /Volumes/comun no está montado")
    generar(dry="--dry-run" in sys.argv)
    print("Gas oil: terminado.")
