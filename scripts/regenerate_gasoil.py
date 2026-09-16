#!/usr/bin/env python3
"""
Regenera los JSON del mercado de gas oil (src/data/gasoil_*.json) desde las
bases del workbook Tableau 05 (MERCADO INTERNO GAS OIL VERSION ONLINE I).

Fuentes (requiere /Volumes/comun montado):
  - Precio derivados petroleo 1104 minorista y mayorista new.hyper
        relevamiento SE Res. 1104/2004: precio y volumen por EESS-mes, canal,
        bandera, provincia (fuente de Precio surtidor, Estructura y BTB BTC)
  - Master data database.hyper   Brent, WTI, TC, CPI US, FoLicht, 963, aceite
  - Go Imports.hyper             despachos de importación de gas oil (CIF)
  - EESS Localidad departamento provincia.hyper   estaciones georreferenciadas

Salidas:
  - gasoil_precios.json  retail (mes × provincia × bandera), canales
                         (mes × canal distribución × canal comercialización ×
                         bandera), flujos para el Sankey y EESS del mapa
  - gasoil_ranking.json  series mensuales en usd/ton para el ranking, tipo de
                         cambio, CPI US e importaciones

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
from collections import defaultdict
from datetime import datetime
from pathlib import Path

try:
    from tableauhyperapi import Connection, HyperProcess, Telemetry
except ImportError:
    sys.exit("Falta tableauhyperapi:  pip3 install tableauhyperapi")

VOL = Path("/Volumes/comun/01. TABLEAU")
DB = VOL / "EXP MKTS DATABASES/Revision Actual"
SRC = {
    "p1104": DB / "Precio derivados petroleo 1104 minorista y mayorista new.hyper",
    "master": DB / "Master data database.hyper",
    "imports": DB / "Go Imports.hyper",
    "eess": DB / "EESS Localidad departamento provincia.hyper",
}
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

# Series del ranking: id → (columna de Master data, nombre, fuente)
PRODUCTOS_MASTER = {
    "brent": ("BRENT", "Brent", "EIA"),
    "wti": ("WTI", "WTI", "EIA"),
    "diesel_usa": ("Diesel Diesel Consumer Prices USA   (usd/ton)", "Diesel USA al consumidor", "EIA"),
    "fame_ara": ("Biodiesel FAME, CFPP -10 Europe, ARA fob", "Biodiesel FAME ARA fob", "FoLicht"),
    "bio_963_m": ("MEDIANA", "Biodiesel Res. 963 - Mediana", "Secretaría de Energía"),
    "aceite_fas": ("JJ Aceite FAS ROSARIO Promedio", "Aceite de soja FAS Rosario", "J.J. Hinrichsen"),
}
PRODUCTOS_GO = {
    "go2_surtidor": ("Gas oil grado 2 - surtidor", 2, "s"),
    "go2_sin_imp": ("Gas oil grado 2 - sin impuestos", 2, "n"),
    "go3_surtidor": ("Gas oil grado 3 - surtidor", 3, "s"),
    "go3_sin_imp": ("Gas oil grado 3 - sin impuestos", 3, "n"),
}


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
    cols = ['"Date"', '"Exchange Rate Mean"', '"Consumer Price Index - US"'] + \
           [f'"{c}"' for c, _, _ in PRODUCTOS_MASTER.values()]
    rows = hy.query("master", f'''SELECT {", ".join(cols)} FROM {T}
        WHERE "Date" >= DATE '{DESDE}-01' ORDER BY "Date"''')
    acum = defaultdict(lambda: defaultdict(list))
    for r in rows:
        f = ym(r[0])
        for nombre, val in zip(["tc", "cpi"] + list(PRODUCTOS_MASTER), r[1:]):
            if val is not None and val > 0:
                val = float(val)
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


def extraer_importaciones(hy):
    rows = hy.query("imports", f'''
      SELECT "Fecha", SUM("Kgs. Netos")/1000, SUM("U$S CIF"), SUM("U$S FOB")
      FROM {T} WHERE "Fecha" >= DATE '{DESDE}-01' GROUP BY 1 ORDER BY 1''')
    mensual = defaultdict(lambda: [0.0, 0.0, 0.0])
    for f, ton, cif, fob in rows:
        m = mensual[ym(f)]
        m[0] += ton or 0
        m[1] += cif or 0
        m[2] += fob or 0
    out = []
    for f in sorted(mensual):
        ton, cif, fob = mensual[f]
        if ton <= 0:
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
        canales = extraer_canales(hy, ix_mes, ix_cc)
        flujos = extraer_flujos(hy, ix_mes, ix_tn, ix_cc)
        eess = extraer_eess(hy, ix_prov, ix_band)
        master = extraer_master(hy)
        importaciones = extraer_importaciones(hy)
    finally:
        hy.close()
    print(f"  retail: {len(retail['mes'])} filas · canales: {len(canales)} · flujos: {len(flujos)} · "
          f"EESS: {len(eess)} · importaciones: {len(importaciones)} meses")

    # ------------------------------------------------------------ validar
    ultimo_mes = meses[-1]
    tipos_retail_idx = {ix_tn.pos[t] for t in TIPOS_RETAIL if t in ix_tn.pos}
    check(len(tipos_retail_idx) == len(TIPOS_RETAIL), "Faltan tipos de negocio minoristas en el relevamiento")
    check("Al público" in ix_cc.pos, "Falta el canal 'Al público'")
    pais = serie_pais(retail, meses, tipos_retail_idx, ix_cc.pos["Al público"])
    check(ultimo_mes in pais and "s2" in pais[ultimo_mes], f"Sin precio surtidor país en {ultimo_mes}")
    p_ult = pais[ultimo_mes]["s2"]
    # Cifra ancla: jul-2026 el GO2 surtidor ponderado por EESS dio 2.269 $/l
    # (Tableau, ponderando por provincia, 2.283). Chequeo de orden de magnitud.
    if ultimo_mes == "2026-07":
        check(abs(p_ult - 2269) < 15, f"GO2 surtidor jul-2026 = {p_ult:.0f} $/l, esperado ≈ 2.269")
    for prov in ix_prov.valores:
        if prov != "N/D":
            check(prov in provincias_mapa, f"Provincia '{prov}' no existe en mapa_argentina.json")
    # Brent y WTI llegan un mes atrás en Master data: se admite hasta 2 meses de rezago
    for k in list(PRODUCTOS_MASTER) + ["tc", "cpi"]:
        if k == "diesel_usa":
            continue  # serie truncada a propósito (ver extraer_master)
        check(master.get(k) and max(master[k]) >= meses[-3],
              f"Master data: '{k}' sin dato desde {meses[-3]} (último: {max(master.get(k, ['-']))})")
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
    for pid, (col, nombre, fuente) in PRODUCTOS_MASTER.items():
        serie = [[f, round(v, 2)] for f, v in sorted(master[pid].items()) if f >= DESDE]
        productos.append(dict(id=pid, nombre=nombre, fuente=fuente, unidad="usd/ton", serie=serie))
    for p in productos:
        if p["id"] == "diesel_usa":
            p["nota"] = "Master data trae la serie rota desde dic-2025: termina en nov-2025"
        if p["id"] == "bio_963_m":
            # 963: precio en $/ton → usd/ton con el TC del mes
            p["serie"] = [[f, round(v / master["tc"][f], 2)] for f, v in p["serie"] if f in master["tc"]]
            p["nota"] = "precio SE en $/ton convertido con el TC mensual"
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
        check(len(p["serie"]) > 24, f"Ranking: serie '{p['id']}' con {len(p['serie'])} meses")

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
        columnas=RETAIL_COLS, filas=len(retail["mes"]),
        nota="precios en centavos de $/l (0 = sin dato); w = m3 ponderador; e2 = EESS con precio surtidor",
        operadores=operadores,
        bocas_campos="[nro_inscripcion, operador, bandera, provincia, localidad, direccion, lng, lat]",
        bocas=bocas, partes=N_PARTES, partes_columnas=BOCA_COLS, mes_columnas=MES_COLS,
        **retail,
    ), dry)
    # Datos por boca y mes, particionados por operador (hash = índice % N_PARTES):
    # la sección pide una partición al elegir un operador o una estación.
    total = 0
    for k, P in enumerate(partes):
        texto = json.dumps(P, ensure_ascii=False, separators=(",", ":"))
        total += len(texto)
        if not dry:
            (PUB_DIR / "gasoil_bocas").mkdir(parents=True, exist_ok=True)
            (PUB_DIR / "gasoil_bocas" / f"{k}.json").write_text(texto, encoding="utf-8")
    print(f"  {'[dry-run] ' if dry else '✓ '}public/data/gasoil_bocas/0..{N_PARTES - 1}.json ({total // 1024} KB en total)")
    # Bocas relevadas en cada mes (mapa de estaciones con precio y tooltip): un archivo por mes
    total = 0
    for f, M in por_mes.items():
        texto = json.dumps(M, ensure_ascii=False, separators=(",", ":"))
        total += len(texto)
        if not dry:
            (PUB_DIR / "gasoil_mes").mkdir(parents=True, exist_ok=True)
            (PUB_DIR / "gasoil_mes" / f"{f}.json").write_text(texto, encoding="utf-8")
    print(f"  {'[dry-run] ' if dry else '✓ '}public/data/gasoil_mes/<mes>.json ({len(por_mes)} meses, {total // 1024} KB en total)")

    escribir("gasoil_ranking.json", dict(
        desde=DESDE, ultimo_mes=ultimo_mes, densidad_go=DENSIDAD_GO,
        productos=productos,
        tc=[[f, round(v, 2)] for f, v in sorted(master["tc"].items())],
        cpi_us=[[f, round(v, 3)] for f, v in sorted(master["cpi"].items())],
        importaciones=importaciones,
    ), ["Master data database.hyper", "Go Imports.hyper",
        "Precio derivados petroleo 1104 minorista y mayorista new.hyper"], dry)


if __name__ == "__main__":
    check(VOL.exists(), "El volumen /Volumes/comun no está montado")
    generar(dry="--dry-run" in sys.argv)
    print("Gas oil: terminado.")
