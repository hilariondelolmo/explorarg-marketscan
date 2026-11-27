#!/usr/bin/env python3
"""Arma los datos de la herramienta de crushing integrado (área reservada del sitio).

    python3 scripts/regenerate_crushing.py [--dry-run]

Lo que escribe NO va al repositorio, que es público: queda en
~/.cache/explorarg/reservada/crushing.json y lo entrega api/reservada.js solo a quien está
logueado y autorizado. Para publicarlo hay que subirlo aparte (scripts/reservada_subir.mjs).

De dónde sale cada dato (una fila por día hábil):

  poroto, harina, aceite   FOB oficial de la Secretaría de Agricultura (Ley 21.453), de la
                           base que arma scripts/fob_oficiales_soja.py en
                           ~/Explora_projects/_fuentes/fob_oficiales_soja/. Posición más
                           cercana y, aparte, la del mes siguiente.
  retenciones              ~/Explora_projects/_fuentes/fob_oficiales_soja/retenciones_complejo_soja.csv
                           (una fila por cambio de alícuota, con su norma). Para el tramo
                           de 2018-2019, en que la alícuota dependía del tipo de cambio, la
                           efectiva de cada día sale de Master data.
  aceite FAS               Master data: FAS MinAgri y J.J. Hinrichsen (comprador, vendedor
                           y promedio).
  biodiésel FOB            Master data: J.J. Hinrichsen, exportación spot FOB Rosario.
  series privadas          las que declare ~/Explora_projects/_fuentes/crushing/series_privadas.json
                           (uso interno: otros precios del biodiésel). Ni ese archivo ni sus
                           nombres están en el repositorio. Si no está, no se agregan.
  biodiésel local          precio oficial de la Res. 963 (mediana), en usd/t, de
                           src/data/gasoil_ranking.json: un valor por mes.
  metanol, glicerina       Master data (Metanol YPF) y src/data/gasoil_ranking.json
                           (glicerina 80% de Explora): un valor por mes.
  parámetros               ~/Explora_projects/_fuentes/crushing/parametros_crushing.json:
                           rendimientos y costos del modelo. Son los de la planilla de HDO.
"""
import csv
import datetime as dt
import json
import shutil
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FUENTES = RAIZ.parent / "_fuentes"
BASE_FOB = FUENTES / "fob_oficiales_soja"
CRUDO = BASE_FOB / "crudo" / "fob_oficiales_crudo.jsonl"
RETENCIONES = BASE_FOB / "retenciones_complejo_soja.csv"
PARAMETROS = FUENTES / "crushing" / "parametros_crushing.json"
PRIVADAS = FUENTES / "crushing" / "series_privadas.json"
MASTER = Path("/Volumes/comun/01. TABLEAU/EXP MKTS DATABASES/Revision Actual/Master data database.hyper")
SALIDA = Path.home() / ".cache" / "explorarg" / "reservada" / "crushing.json"
DESDE = "2010-01-01"

# Posición arancelaria que se toma de cada producto (la de granel)
POSICIONES = {
    "poroto": "12019000190C",  # Habas de soja, las demás, a granel
    "harina": "23040010100B",  # Pellets y harina de soja, de extracción
    "aceite": "15071000100Q",  # Aceite de soja en bruto, a granel
}

# Columnas de Master data: campo -> columna
COLUMNAS_MASTER = {
    "aceite_fob_master": "FOB SAGYPYA SPOT SBO",
    "fas_minagri": "FAS MinAgri",
    "fas_jj_comprador": "JJ Aceite FAS ROSARIO COMPRADOR",
    "fas_jj_vendedor": "JJ Aceite FAS ROSARIO VENDEDOR",
    "fas_jj": "JJ Aceite FAS ROSARIO Promedio",
    "bio_fob_jj": "JJ Biodiesel Export Price SPOT FOB Rosario",
    "dex_aceite_master": "ARGENTINA  SBO Export tax",
    "dex_bio_master": "ARGENTINA  SME Export Tax",
    "metanol_ypf": "Metanol YPF (usd/ton)",
}

# Los campos de las series privadas, si las hay, se agregan al final (leer_privadas)
CAMPOS = [
    "fecha",
    "poroto", "harina", "aceite",
    "poroto_sig", "harina_sig", "aceite_sig",
    "dex_poroto", "dex_harina", "dex_aceite", "dex_bio",
    "fas_minagri", "fas_jj_comprador", "fas_jj_vendedor", "fas_jj",
    "bio_fob_jj",
    "bio_oficial", "metanol_ypf", "glicerina_explora",
]

avisos = []


def aviso(texto):
    avisos.append(texto)
    print("  ⚠ " + texto)


def r(x, n=2):
    return None if x is None else round(float(x), n)


# ------------------------------------------------------------------ FOB oficiales

def posicion_cercana_y_siguiente(filas, dia):
    """De las posiciones de un producto en un día: (precio de la más cercana, precio de la
    que cubre el mes siguiente). Cada fila: [mes desde, año desde, mes hasta, año hasta, precio]."""
    if not filas:
        return None, None
    orden = sorted(filas, key=lambda f: (f[1], f[0]))
    cercana = orden[0][4]
    y, m = (dia.year + 1, 1) if dia.month == 12 else (dia.year, dia.month + 1)
    clave = y * 12 + m
    sig = next((f[4] for f in orden if f[1] * 12 + f[0] <= clave <= f[3] * 12 + f[2]), None)
    return cercana, sig


def leer_fob():
    if not CRUDO.exists():
        sys.exit(f"Falta la base de FOB oficiales: {CRUDO}\nCorré primero: python3 scripts/fob_oficiales_soja.py")
    dias = {}
    for ln in CRUDO.open(encoding="utf-8"):
        d = json.loads(ln)
        if not d["filas"]:
            continue  # feriado: sin circular
        dia = dt.date.fromisoformat(d["dia"])
        fila = {}
        for prod, pos in POSICIONES.items():
            c, s = posicion_cercana_y_siguiente([f[1:] for f in d["filas"] if f[0] == pos], dia)
            fila[prod], fila[prod + "_sig"] = c, s
        dias[d["dia"]] = fila
    return dias


# ------------------------------------------------------------------ retenciones

def leer_retenciones():
    """{producto: [(desde, alícuota o None, regla)]}, ordenado por fecha. Una alícuota vacía
    con regla 'master' manda a tomar la efectiva del día de Master data."""
    tramos = {"poroto": [], "harina": [], "aceite": [], "bio": []}
    if not RETENCIONES.exists():
        aviso(f"sin tabla de retenciones ({RETENCIONES.name}): poroto y harina quedan sin retención")
        return tramos
    with RETENCIONES.open(encoding="utf-8-sig", newline="") as f:
        for fila in csv.DictReader(f):
            prod = fila["producto"].strip()
            if prod not in tramos:
                continue
            ali = fila["alicuota"].strip()
            tramos[prod].append((fila["desde"].strip(), float(ali) if ali else None, fila.get("regla", "").strip()))
    for prod in tramos:
        tramos[prod].sort()
    return tramos


def retencion(tramos, dia_iso):
    actual = None
    for desde, ali, regla in tramos:
        if desde <= dia_iso:
            actual = (ali, regla)
        else:
            break
    return actual or (None, "")


# ------------------------------------------------------------------ Master data

def leer_master():
    try:
        from tableauhyperapi import Connection, HyperProcess, Telemetry
    except ImportError:
        sys.exit("Falta tableauhyperapi:  pip3 install tableauhyperapi")
    if not MASTER.exists():
        sys.exit(f"No encuentro Master data: {MASTER}\n¿Está montado /Volumes/comun?")
    tmp = Path(tempfile.mkdtemp(prefix="regen_crushing_"))
    try:
        local = tmp / "master.hyper"
        shutil.copy(MASTER, local)  # nunca se abre el original
        cols = ", ".join(f'"{c}"' for c in COLUMNAS_MASTER.values())
        with HyperProcess(telemetry=Telemetry.DO_NOT_SEND_USAGE_DATA_TO_TABLEAU) as hp:
            with Connection(endpoint=hp.endpoint, database=str(local)) as con:
                filas = con.execute_list_query(
                    f'SELECT "Date", {cols} FROM "Extract"."Extract" WHERE "Date" >= DATE\'{DESDE}\' ORDER BY "Date"'
                )
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    claves = list(COLUMNAS_MASTER)
    return {str(f[0])[:10]: dict(zip(claves, f[1:])) for f in filas}


# ------------------------------------------------------------------ series privadas (uso interno)

def leer_privadas():
    """Las series de uso interno que declara series_privadas.json: ({día: {campo: valor}},
    [{id, uso, rotulo, fuente}], [palabras que los datos no pueden nombrar]). Sin ese
    archivo, nada. Acá no se nombra ninguna fuente: los nombres, los archivos y las columnas
    están en ese archivo, fuera del repositorio.

    Lo que se declara de cada serie (id, rótulo y fuente) viaja a la página con los datos:
    dice qué precio es, no de quién. El nombre del archivo leído se avisa por consola y no
    se guarda."""
    if not PRIVADAS.exists():
        return {}, [], []
    config = json.loads(PRIVADAS.read_text(encoding="utf-8"))

    def revision(p):
        cola = p.stem.rsplit("rev", 1)
        return int(cola[1]) if len(cola) == 2 and cola[1].isdigit() else 0

    dias, declaradas = {}, []
    for serie in config.get("series", []):
        carpeta = (PRIVADAS.parent / serie["carpeta"]).resolve()
        archivos = sorted(carpeta.glob(serie["patron"])) if carpeta.exists() else []
        if not archivos:
            aviso(f"serie privada sin archivo ({serie['patron']}): sus columnas quedan vacías")
            continue
        archivo = max(archivos, key=revision)
        with archivo.open(encoding="utf-8-sig", newline="") as f:
            for fila in csv.DictReader(f):
                dia = fila[serie["columna_fecha"]]
                for campo in serie["campos"]:
                    v = fila.get(campo["columna"], "").strip()
                    if v:
                        dias.setdefault(dia, {})[campo["id"]] = float(v)
        print(f"  serie privada leída de: {archivo.name}")
        for campo in serie["campos"]:
            declaradas.append({"id": campo["id"], "uso": campo["uso"], "rotulo": campo["rotulo"], "fuente": campo["fuente"]})
    return dias, declaradas, [str(p).lower() for p in config.get("no_nombrar", [])]


# ------------------------------------------------------------------ sitio (mensuales)

def leer_sitio():
    g = json.loads((RAIZ / "src" / "data" / "gasoil_ranking.json").read_text(encoding="utf-8"))
    prod = {p["id"]: dict(p["serie"]) for p in g["productos"]}
    comp = {c["id"]: dict(c["serie"]) for c in g["comparados"]}
    return {"bio_oficial": prod.get("bio_963_m", {}), "glicerina_explora": comp.get("glicerina_explora", {})}


# ------------------------------------------------------------------ armado

def main():
    simulacro = "--dry-run" in sys.argv
    print("Crushing integrado: datos del área reservada" + (" (simulacro)" if simulacro else ""))

    if not PARAMETROS.exists():
        sys.exit(f"Faltan los parámetros del modelo: {PARAMETROS}")
    parametros = json.loads(PARAMETROS.read_text(encoding="utf-8"))

    fob = leer_fob()
    tramos = leer_retenciones()
    master = leer_master()
    privadas, declaradas, no_nombrar = leer_privadas()
    campos = CAMPOS + [x["id"] for x in declaradas]
    sitio = leer_sitio()

    # El metanol de YPF es un precio por mes (viene cargado el día 1): vale para todo el mes
    metanol_mes = {}
    for dia in sorted(master):
        if master[dia].get("metanol_ypf") is not None:
            metanol_mes[dia[:7]] = master[dia]["metanol_ypf"]

    filas = []
    difer_aceite = []
    difer_retencion = []
    sin_tabla = not any(tramos.values())
    ultima = {"dex_aceite_master": None, "dex_bio_master": None}  # el último valor de Master data, para los días que le faltan
    for dia in sorted(fob):
        if dia < DESDE:
            continue
        f, m, q = fob[dia], master.get(dia, {}), privadas.get(dia, {})
        mes = dia[:7]
        for k in ultima:
            if m.get(k) is not None:
                ultima[k] = float(m[k])
        dex = {}
        for prod in ("poroto", "harina", "aceite", "bio"):
            ali, regla = retencion(tramos[prod], dia)
            de_master = ultima["dex_bio_master" if prod == "bio" else "dex_aceite_master"]
            if regla == "master":
                # 2018-2019: alícuota base más 12% con tope de 4 pesos por dólar. La de cada día es la de
                # Master data, que hace esa cuenta con el tipo de cambio (la misma para poroto, harina y aceite)
                ali = de_master
            elif regla == "master_efectiva":
                # biodiésel, alícuota móvil: Master data trae la efectiva sobre FOB; la nominal es e / (1 - e)
                ali = None if de_master is None else de_master / (1 - de_master)
            elif regla == "sin_dato":
                ali = None
            elif prod == "aceite" and ali is not None and m.get("dex_aceite_master") is not None and abs(ali - float(m["dex_aceite_master"])) > 0.0005:
                # control cruzado: la tabla de retenciones contra la columna de Master data
                difer_retencion.append((dia, ali, float(m["dex_aceite_master"])))
            dex[prod] = ali
        if sin_tabla:
            dex["aceite"] = ultima["dex_aceite_master"]
        # control cruzado: el FOB oficial del aceite de la Secretaría contra el de Master data
        if f["aceite"] is not None and m.get("aceite_fob_master") is not None and abs(f["aceite"] - float(m["aceite_fob_master"])) > 0.5:
            difer_aceite.append((dia, f["aceite"], float(m["aceite_fob_master"])))
        filas.append([
            dia,
            r(f["poroto"]), r(f["harina"]), r(f["aceite"]),
            r(f["poroto_sig"]), r(f["harina_sig"]), r(f["aceite_sig"]),
            r(dex["poroto"], 5), r(dex["harina"], 5), r(dex["aceite"], 5), r(dex["bio"], 5),
            r(m.get("fas_minagri")), r(m.get("fas_jj_comprador")), r(m.get("fas_jj_vendedor")), r(m.get("fas_jj")),
            r(m.get("bio_fob_jj")),
            r(sitio["bio_oficial"].get(mes)), r(metanol_mes.get(mes)), r(sitio["glicerina_explora"].get(mes)),
        ] + [r(q.get(x["id"])) for x in declaradas])

    if not filas:
        sys.exit("No quedó ninguna fila: revisar la base de FOB oficiales.")

    # ------------------------------------------------------------ controles
    def ultimo(campo):
        i = campos.index(campo)
        return next(((f[0], f[i]) for f in reversed(filas) if f[i] is not None), (None, None))

    print(f"  {len(filas)} días, {filas[0][0]} a {filas[-1][0]}")
    for campo in campos[1:]:
        n = sum(1 for f in filas if f[campos.index(campo)] is not None)
        dia, v = ultimo(campo)
        print(f"    {campo:18s} {n:5d} días con dato · último {dia}: {v}")
        if n == 0:
            aviso(f"'{campo}' quedó sin ningún dato")
    con_los_dos = sum(1 for d in fob if fob[d]["aceite"] is not None and master.get(d, {}).get("aceite_fob_master") is not None)
    print(f"  control del aceite contra Master data: {con_los_dos} días con los dos, {len(difer_aceite)} con diferencia de más de 0,5 usd/t")
    if difer_aceite:
        aviso(f"FOB oficial del aceite distinto en la Secretaría y en Master data en {len(difer_aceite)} días (los últimos: " + "; ".join(f"{d} {a:g} contra {b:g}" for d, a, b in difer_aceite[-4:]) + ")")
    if difer_retencion:
        # se resumen por tramos de días seguidos con la misma diferencia
        tramos_dif, previo = [], None
        for dia, tabla, mast in difer_retencion:
            if previo and previo[3] == (tabla, mast):
                previo[1], previo[2] = dia, previo[2] + 1
            else:
                previo = [dia, dia, 1, (tabla, mast)]
                tramos_dif.append(previo)
        print(f"  retención del aceite: la tabla y Master data difieren en {len(difer_retencion)} días")
        for desde, hasta, n, (tabla, mast) in tramos_dif:
            print(f"    {desde} a {hasta} ({n} días): tabla {tabla:.2%}, Master data {mast:.2%}")
    sin_fob = [c for c in ("poroto", "harina", "aceite") if ultimo(c)[0] != filas[-1][0]]
    if sin_fob:
        aviso(f"el último día no trae FOB de: {', '.join(sin_fob)}")

    datos = {
        "meta": {
            "generado": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "nota": "Generado por scripts/regenerate_crushing.py - no editar a mano. Uso interno: no publicar.",
            "desde": filas[0][0],
            "hasta": filas[-1][0],
            "fuentes": {
                "fob": "Secretaría de Agricultura, precios FOB oficiales (Ley 21.453), posición más cercana",
                "fas_minagri": "Master data: FAS MinAgri (FOB oficial menos retención)",
                "fas_jj": "Master data: J.J. Hinrichsen, aceite FAS Rosario",
                "bio_fob_jj": "Master data: J.J. Hinrichsen, biodiésel exportación spot FOB Rosario",
                "bio_oficial": "Secretaría de Energía, Res. 963: precio de la mediana, en usd/t con el tipo de cambio del mes",
                "metanol_ypf": "Master data: Metanol YPF",
                "glicerina_explora": "Explora, Reporte de Gestión: precio de venta de la glicerina 80%",
                "retenciones": "tabla de retenciones del complejo soja (norma por norma)",
            },
            "avisos": avisos,
        },
        "parametros": parametros,
        # las series de uso interno: qué son y cómo se llaman, para que la página las ofrezca
        "privadas": declaradas,
        "campos": campos,
        "filas": filas,
    }
    texto = json.dumps(datos, ensure_ascii=False, separators=(",", ":"))
    print(f"  {len(texto) / 1024:.0f} KB")
    # Estos datos viajan a la página: no pueden nombrar lo que series_privadas.json pide no
    # nombrar ("no_nombrar"). Si aparece alguna de esas palabras, no se escribe nada.
    nombradas = [p for p in no_nombrar if p in texto.lower()]
    if nombradas:
        sys.exit(f"Los datos nombran lo que no hay que nombrar ({', '.join(nombradas)}): no se escribió nada. "
                 f"Revisar 'id', 'rotulo' y 'fuente' en {PRIVADAS.name}.")
    if simulacro:
        print("Simulacro: no se escribió nada.")
        return
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(texto, encoding="utf-8")
    print(f"Escrito: {SALIDA}")


if __name__ == "__main__":
    main()
