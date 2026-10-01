#!/usr/bin/env python3
"""
Importaciones de gas oil por despacho aduanero, para la página Importaciones
del mercado de gas oil (/gas-oil/importaciones): réplica de los tableros GO
IMPORTS, GO IMPORTS II y GO IMPORTS III del workbook 05.

Fuente (requiere /Volumes/comun montado):
  - Go Imports.hyper   un registro por despacho de importación de gasoil
        (NCM 2710.19.21, destinación consumo): fecha, importador, país de
        origen, país de procedencia, kilos netos, U$S FOB, flete, seguro y
        U$S CIF, y las coordenadas (centroide) de cada país.

Salida:
  - public/data/gasoil_importaciones.json   cruce mes × importador × país de
        origen × país de procedencia, con toneladas, U$S CIF y U$S FOB.

Cálculos, los del workbook: toneladas = kilos netos / 1000; usd/ton =
CIF / toneladas (CIF, no FOB); m³ = toneladas / 0,845. El Tableau deja afuera
a CAMMESA con el filtro de importador: acá va en el cruce, con su índice en
`cammesa`, y la página arranca sin ella (decisión HDO 30/09/2026).

La base trae el país de origen a veces en castellano y a veces en inglés
(BRASIL y BRAZIL, MALASIA y MALAYSIA): se unifican y salen en castellano;
NORTH KOREA es Corea del Sur mal cargada (HDO, 01/10/2026).
Las coordenadas de cada país (centroide, para el mapa de flujos) son las de la
tabla PAISES de este script y no las de la base, que geocodifica mal algunos
nombres (RUSSIA como origen tiene las coordenadas del Reino Unido y JAPON las
de Italia); el generador avisa cuando la base ubica un país a más de 3° de la
tabla.
Los despachos de menos de 100 kg (muestras de laboratorio, frascos, bidones)
quedan afuera: no mueven el volumen y distorsionan el precio por tonelada.
Los lotes chicos pero reales (camiones por Pocitos, tambores) se quedan.

Lo llama regenerate_gasoil.py. Solo:

    python3 scripts/gasoil_importaciones.py [--dry-run]

No estima datos: si una validación falla, aborta.
"""

import json
import shutil
import sys
import tempfile
from collections import defaultdict
from datetime import datetime
from pathlib import Path

FUENTE = Path("/Volumes/comun/01. TABLEAU/EXP MKTS DATABASES/Revision Actual/Go Imports.hyper")
RAIZ = Path(__file__).resolve().parent.parent
PUB_DIR = RAIZ / "public" / "data"
SALIDA = "gasoil_importaciones.json"
T = '"Extract"."Extract"'
DENSIDAD_GO = 0.845   # ton/m³, la del workbook 05
MIN_KG = 100          # despachos de menos de 100 kg (muestras): afuera

# Importador en la base → nombre en la página. Los ocho primeros son los alias
# del workbook 05; el resto, el nombre de la base abreviado.
CAMMESA = "COMPAÑIA ADMINIST DEL MERCADO MAYORISTA"
ALIAS = {
    CAMMESA: "CAMMESA",
    "YPF SOCIEDAD ANONIMA": "YPF S.A.",
    "RAIZEN ARGENTINA S.A.U.": "RAIZEN S.A.",
    "SHELL CIA ARGENTINA DE PETROLEO S A": "SHELL C.A.P.S.A.",
    "TRAFIGURA ARGENTINA SA": "TRAFIGURA S.A.",
    "PAN AMERICAN ENERGY LLC SUCURSAL ARGENTI": "AXION S.A.",
    "PETROIL PETROLEO Y DERIVADOS SA": "PETROIL SA",
    "REFINERIA DEL NORTE S A": "REFINOR",
    "ESSO PETROLERA ARGENTINA SOCIEDAD DE RES": "ESSO PETROLERA ARGENTINA",
    "PETROBRAS ENERGIA SOCIEDAD ANONIMA": "PETROBRAS ENERGÍA S.A.",
    "OIL S.A.": "OIL S.A.",
    "PETROLERA DEL CONOSUR SA": "PETROLERA DEL CONO SUR",
    "PAMPA ENERGIA S A": "PAMPA ENERGÍA S.A.",
    "ENERGIA ARGENTINA SOCIEDAD ANONIMA": "ENARSA",
    "REFI PAMPA S.A.": "REFI PAMPA S.A.",
    "MINERA ALUMBRERA LIMITED": "MINERA ALUMBRERA",
    "DIVERSE FUELS S.A.": "DIVERSE FUELS S.A.",
    "DESTILERIA ARGENTINA DE PETROLEO SA": "DAPSA",
    "FOX PETROL SA": "FOX PETROL S.A.",
    "TOTAL AUSTRAL SOCIEDAD ANONIMA SUCURSAL": "TOTAL AUSTRAL S.A.",
    "TOTAL ESPECIALIDADES ARGENTINA SOCIEDAD": "TOTAL ESPECIALIDADES ARGENTINA",
    "MILBERG Y ASOCIADOS SA": "MILBERG Y ASOCIADOS S.A.",
    "SGS ARGENTINA SA": "SGS ARGENTINA S.A.",
}
# Variantes del país de origen → nombre con que figura en el país de procedencia.
# "NORTH KOREA" es Corea del Sur mal cargada en la fuente (confirmado por HDO el
# 01/10/2026): no hay importaciones de gas oil norcoreano.
VARIANTE = {
    "BRASIL": "BRAZIL", "MALASIA": "MALAYSIA", "RUSSIAN FEDERATION": "RUSSIA", "BAHREIN": "BAHRAIN",
    "JAPON": "JAPAN", "REINO UNIDO": "UNITED KINGDOM", "LITUANIA": "LITHUANIA", "LIBIA": "LIBYA",
    "NORTH KOREA": "SOUTH KOREA",
}
# Nombre en la base → (nombre en castellano, código ISO 3166-1 alfa-2, latitud, longitud del centroide)
PAISES = {
    "UNITED STATES": ("Estados Unidos", "US", 37.09, -95.71), "RUSSIA": ("Rusia", "RU", 61.52, 105.32),
    "UNITED ARAB EMIRATES": ("Emiratos Árabes Unidos", "AE", 23.42, 53.85),
    "SAUDI ARABIA": ("Arabia Saudita", "SA", 23.89, 45.08), "INDIA": ("India", "IN", 20.59, 78.96),
    "NETHERLANDS": ("Países Bajos", "NL", 52.13, 5.29), "BELGIUM": ("Bélgica", "BE", 50.50, 4.47),
    "OMAN": ("Omán", "OM", 21.51, 55.92), "BRAZIL": ("Brasil", "BR", -14.24, -51.93),
    "CANADA": ("Canadá", "CA", 56.13, -106.35), "MALAYSIA": ("Malasia", "MY", 4.21, 101.98),
    "TOGO": ("Togo", "TG", 8.62, 0.82), "SINGAPORE": ("Singapur", "SG", 1.35, 103.82),
    "FRANCE": ("Francia", "FR", 46.23, 2.21), "BAHRAIN": ("Baréin", "BH", 25.93, 50.64),
    "QATAR": ("Qatar", "QA", 25.35, 51.18), "KUWAIT": ("Kuwait", "KW", 29.31, 47.48),
    "EGYPT": ("Egipto", "EG", 26.82, 30.80), "PORTUGAL": ("Portugal", "PT", 39.40, -8.22),
    "SOUTH KOREA": ("Corea del Sur", "KR", 35.91, 127.77), "GREECE": ("Grecia", "GR", 39.07, 21.82),
    "CHINA": ("China", "CN", 35.86, 104.20),
    "GERMANY": ("Alemania", "DE", 51.17, 10.45), "ITALY": ("Italia", "IT", 41.87, 12.57),
    "TUNISIA": ("Túnez", "TN", 33.89, 9.54), "JAPAN": ("Japón", "JP", 36.20, 138.25),
    "TAIWAN": ("Taiwán", "TW", 23.70, 120.96), "UNITED KINGDOM": ("Reino Unido", "GB", 55.38, -3.44),
    "ISRAEL": ("Israel", "IL", 31.05, 34.85), "INDONESIA": ("Indonesia", "ID", -0.79, 113.92),
    "DENMARK": ("Dinamarca", "DK", 56.26, 9.50), "CZECH REPUBLIC": ("República Checa", "CZ", 49.82, 15.47),
    "BAHAMAS": ("Bahamas", "BS", 25.03, -77.40), "LIBYA": ("Libia", "LY", 26.34, 17.23),
    "COLOMBIA": ("Colombia", "CO", 4.57, -74.30), "MALTA": ("Malta", "MT", 35.94, 14.38),
    "BELARUS": ("Bielorrusia", "BY", 53.71, 27.95), "SWEDEN": ("Suecia", "SE", 60.13, 18.64),
    "LITHUANIA": ("Lituania", "LT", 55.17, 23.88), "TRINIDAD AND TOBAGO": ("Trinidad y Tobago", "TT", 10.69, -61.22),
    "NIGERIA": ("Nigeria", "NG", 9.08, 8.68), "SOUTH AFRICA": ("Sudáfrica", "ZA", -30.56, 22.94),
    "SPAIN": ("España", "ES", 40.46, -3.75), "CHILE": ("Chile", "CL", -35.68, -71.54),
    "URUGUAY": ("Uruguay", "UY", -32.52, -55.77), "BENIN": ("Benín", "BJ", 9.31, 2.32),
    "MOZAMBIQUE": ("Mozambique", "MZ", -18.67, 35.53),
}
ARGENTINA = dict(nombre="Argentina", iso="AR", lat=-38.42, lng=-63.62)


def fail(msg):
    sys.exit(f"\n✗ ERROR (importaciones): {msg}\nNo se escribió el archivo.")


def check(cond, msg):
    if not cond:
        fail(msg)


def pais(nombre):
    n = (nombre or "").strip().upper()
    n = VARIANTE.get(n, n)
    check(n in PAISES, f"País desconocido en la base: '{nombre}' (agregarlo a PAISES)")
    return n


def ym(f):
    return f"{f.year:04d}-{f.month:02d}"


def extraer_despachos(consulta):
    """Arma el cruce. `consulta(sql)` devuelve las filas de la base."""
    filas = consulta(f'''
      SELECT "Fecha", "Importador", "País de Origen", "Pais de Procedencia",
             SUM("Kgs. Netos"), SUM("U$S CIF"), SUM("U$S FOB"), COUNT(*)
      FROM {T} WHERE COALESCE("Kgs. Netos", 0) >= {MIN_KG}
      GROUP BY 1, 2, 3, 4''')
    # Dónde ubica la base a cada nombre crudo, para avisar si no coincide con PAISES
    ubicacion = consulta(f'''
      SELECT "País de Origen", "latitude ORIGEN", "longitude ORIGEN" FROM {T} GROUP BY 1, 2, 3
      UNION ALL
      SELECT "Pais de Procedencia", "latitude PROCEDENCIA", "longitude PROCEDENCIA" FROM {T} GROUP BY 1, 2, 3''')
    chicos = consulta(f'SELECT COUNT(*), COALESCE(SUM("Kgs. Netos"), 0), COALESCE(SUM("U$S CIF"), 0) FROM {T} '
                      f'WHERE COALESCE("Kgs. Netos", 0) < {MIN_KG}')[0]
    # Se agrupa de nuevo acá: al unificar los nombres de país pueden caer dos filas en la misma celda
    celdas = defaultdict(lambda: [0.0, 0.0, 0.0, 0])
    for fecha, imp, ori, pro, kg, cif, fob, n in filas:
        check(fecha and imp and ori and pro, f"Despacho sin fecha, importador u origen en {fecha}")
        check(imp.strip() in ALIAS, f"Importador desconocido: '{imp}' (agregarlo a ALIAS)")
        acum = celdas[(ym(fecha), imp.strip(), pais(ori), pais(pro))]
        acum[0] += float(kg) / 1000
        acum[1] += float(cif or 0)
        acum[2] += float(fob or 0)
        acum[3] += n
    avisos = []
    for crudo, lat, lng in sorted({tuple(u) for u in ubicacion}, key=lambda u: u[0] or ""):
        if lat is None or lng is None:
            continue
        n = pais(crudo)
        if abs(float(lat) - PAISES[n][2]) > 3 or abs(float(lng) - PAISES[n][3]) > 3:
            avisos.append(f"{crudo} ({float(lat):.1f}, {float(lng):.1f})")
    if avisos:
        print("  aviso: la base ubica mal estos nombres (se usan las coordenadas de PAISES): " + "; ".join(avisos))

    meses = sorted({k[0] for k in celdas})
    importadores = sorted({k[1] for k in celdas}, key=lambda i: ALIAS[i])
    nombres = sorted({k[2] for k in celdas} | {k[3] for k in celdas}, key=lambda n: PAISES[n][0])
    ix = [{v: i for i, v in enumerate(lista)} for lista in (meses, importadores, nombres, nombres)]
    # Orden fijo (mes, importador, origen, procedencia) para que el archivo no cambie entre corridas
    orden = sorted((tuple(ix[d][k[d]] for d in range(4)), vals) for k, vals in celdas.items())
    dims = dict(mes=[], imp=[], ori=[], pro=[], ton=[], cif=[], fob=[], n=[])
    for (m, i, o, p), (ton, cif, fob, n) in orden:
        dims["mes"].append(m)
        dims["imp"].append(i)
        dims["ori"].append(o)
        dims["pro"].append(p)
        dims["ton"].append(round(ton, 4))
        dims["cif"].append(round(cif))
        dims["fob"].append(round(fob))
        dims["n"].append(n)

    # ------------------------------------------------------------ validar
    check(CAMMESA in ix[1], "CAMMESA no está en la base")
    # El cruce tiene que sumar lo mismo que la base (sin los despachos chicos)
    total = consulta(f'SELECT SUM("Kgs. Netos") / 1000, SUM("U$S CIF"), SUM("U$S FOB"), COUNT(*) FROM {T} '
                     f'WHERE COALESCE("Kgs. Netos", 0) >= {MIN_KG}')[0]
    for col, t, tol in (("ton", total[0], 0.01), ("cif", total[1], 1), ("fob", total[2], 1), ("n", total[3], 0)):
        suma = sum(dims[col])
        check(abs(suma - float(t)) <= tol + 1e-6 * abs(float(t)),
              f"'{col}': el cruce suma {suma:,.1f} y la base {float(t):,.1f}")
    # Los despachos excluidos tienen que ser marginales: menos de 5 t en toda la serie
    check(float(chicos[1]) / 1000 < 5, f"Los despachos de menos de {MIN_KG} kg suman {float(chicos[1]) / 1000:,.1f} t")
    # Cifra ancla, la del tablero GO IMPORTS: 2021 sin CAMMESA = 1.581.938 t y 646 usd/ton (CIF)
    i_cam = ix[1][CAMMESA]
    ton21 = sum(t for m, i, t in zip(dims["mes"], dims["imp"], dims["ton"]) if meses[m][:4] == "2021" and i != i_cam)
    cif21 = sum(c for m, i, c in zip(dims["mes"], dims["imp"], dims["cif"]) if meses[m][:4] == "2021" and i != i_cam)
    check(abs(ton21 - 1581938) < 1, f"2021 sin CAMMESA = {ton21:,.0f} t, esperado 1.581.938")
    check(abs(cif21 / ton21 - 646) < 0.5, f"2021 sin CAMMESA = {cif21 / ton21:,.1f} usd/ton, esperado 646")
    ult = ix[0][meses[-1]]
    ton_ult = sum(t for m, t in zip(dims["mes"], dims["ton"]) if m == ult)
    check(ton_ult > 0, f"Sin importaciones en {meses[-1]}")

    paises = [dict(nombre=PAISES[n][0], iso=PAISES[n][1], lat=PAISES[n][2], lng=PAISES[n][3]) for n in nombres]
    resumen = (f"{len(dims['mes'])} filas · {sum(dims['n'])} despachos · {meses[0]} a {meses[-1]} · "
               f"{len(importadores)} importadores · {len(paises)} países · 2021 sin CAMMESA {ton21:,.0f} t · "
               f"{meses[-1]}: {ton_ult:,.0f} t · afuera {chicos[0]} despachos de menos de {MIN_KG} kg "
               f"({float(chicos[1]) / 1000:,.1f} t)")
    return dict(
        fuente="Despachos de importación de gasoil (NCM 2710.19.21) por aduana",
        nota="cruce mes × importador × país de origen × país de procedencia (índices a las listas); ton = kilos "
             "netos / 1000; cif y fob en U$S; n = despachos. Precio = cif / ton (usd/ton); m³ = ton / densidad_go. "
             f"Sin los despachos de menos de {MIN_KG} kg",
        ultimo_mes=meses[-1], meses=meses, densidad_go=DENSIDAD_GO,
        importadores=[dict(nombre=ALIAS[i], base=i) for i in importadores], cammesa=i_cam,
        paises=paises, destino=ARGENTINA,
        excluidos=dict(despachos=chicos[0], ton=round(float(chicos[1]) / 1000, 3), cif=round(float(chicos[2]))),
        filas=len(dims["mes"]), **dims,
    ), resumen


def escribir_despachos(payload, dry):
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
    tmp = Path(tempfile.mkdtemp(prefix="regen_imports_"))
    try:
        local = tmp / "imports.hyper"
        shutil.copy(FUENTE, local)
        with HyperProcess(telemetry=Telemetry.DO_NOT_SEND_USAGE_DATA_TO_TABLEAU) as hp:
            with Connection(endpoint=hp.endpoint, database=str(local)) as conn:
                payload, resumen = extraer_despachos(conn.execute_list_query)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"  Importaciones: {resumen}")
    escribir_despachos(payload, dry)


if __name__ == "__main__":
    main(dry="--dry-run" in sys.argv)
    print("Importaciones: terminado.")
