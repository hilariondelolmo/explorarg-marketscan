#!/usr/bin/env python3
"""Trae al sitio la serie mensual del ICL y del ICO2 del gas oil (pedido de HDO del 15/11/2026, para el área «Del dicho al dato»: la cuenta del surtidor
y del fisco de los episodios 15, 17, 18 y 20 necesita los impuestos que paga el gas oil fósil y no paga el biodiésel).

La serie vive en otro proyecto de Explora, `~/Explora_projects/extraccion-icl-ico2` (repo privado): `actualizar_icl_ico2.py` baja el PDF de la DNIAF
(Secretaría de Hacienda, «Impuestos sobre los Combustibles Líquidos y al Dióxido de Carbono - Evolución de los montos fijos en pesos») y regenera
`ICL ICO2 - Serie completa.xlsx`, una fila por mes desde marzo de 2018, en $/m³. Este script lee ese libro y escribe `src/data/icl_ico2.json`, en
pesos por litro, solo con el gas oil (grado 2 y grado 3 pagan lo mismo):

    "gasoil": [[fecha, ICL no exento, ICL exento, ICO2], ...]

"No exento" es la tarifa general del gas oil; "exento", la reducida de las zonas con tratamiento diferencial. El ICO2 no distingue.

Uso:  python3 scripts/regenerate_icl_ico2.py            (escribe el JSON)
      python3 scripts/regenerate_icl_ico2.py --dry-run  (solo muestra los últimos meses)

El ICL y el ICO2 se ajustan en enero, abril, julio y octubre (y con postergaciones, cualquier mes): correr primero `actualizar_icl_ico2.py` en el otro
proyecto y después este. No lo llama `regenerate_data.py`. No commitea: publicar lo decide HDO.
"""
from __future__ import annotations
import sys, json
from datetime import datetime
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LIBRO = Path.home() / "Explora_projects" / "extraccion-icl-ico2" / "ICL ICO2 - Serie completa.xlsx"
SALIDA = REPO / "src" / "data" / "icl_ico2.json"
COLUMNAS = {  # encabezado del libro -> clave
    "Gas Oil Grado 2 (Común) ICL NO EXENTO": "icl",
    "Gas Oil Grado 2 (Común) ICL EXENTO": "icl_exento",
    "Gas Oil Grado 2 (Común) ICO2 NO EXENTO": "ico2",
}
OTRAS = {  # se leen solo para comprobar que el libro sigue como se lo conoce
    "Gas Oil Grado 3 (Ultra) ICL NO EXENTO": "icl",
    "Gas Oil Grado 3 (Ultra) ICL EXENTO": "icl_exento",
    "Gas Oil Grado 3 (Ultra) ICO2 NO EXENTO": "ico2",
    "Gas Oil Grado 2 (Común) ICO2 EXENTO": "ico2",
}


def main():
    try:
        import openpyxl
    except ImportError:
        sys.exit("Falta openpyxl: pip install openpyxl")
    if not LIBRO.exists():
        sys.exit(f"No está {LIBRO}")
    ws = openpyxl.load_workbook(LIBRO, data_only=True, read_only=True).worksheets[0]
    filas = list(ws.iter_rows(values_only=True))
    encabezado = [str(c).strip() if c is not None else "" for c in filas[0]]
    assert encabezado[0] == "Date", encabezado[0]
    col = {k: encabezado.index(k) for k in list(COLUMNAS) + list(OTRAS)}

    serie = []
    for f in filas[1:]:
        if f[0] is None:
            continue
        fecha = f[0].strftime("%Y-%m")
        v = {clave: f[col[k]] for k, clave in COLUMNAS.items()}
        for k, clave in OTRAS.items():      # grado 3 = grado 2, y el ICO2 no distingue exento de no exento
            assert f[col[k]] == v[clave], f"{fecha}: «{k}» ({f[col[k]]}) no coincide con el grado 2 ({v[clave]}); revisar antes de usar la serie"
        serie.append([fecha, round(v["icl"] / 1000, 3), round(v["icl_exento"] / 1000, 3), round(v["ico2"] / 1000, 3)])   # $/m³ -> $/l
    fechas = [s[0] for s in serie]
    assert fechas == sorted(set(fechas)), "meses repetidos o desordenados en el libro"

    datos = dict(
        desde=fechas[0], ultimo_mes=fechas[-1], unidad="$/l", campos=["fecha", "icl", "icl_exento", "ico2"], gasoil=serie,
        meta=dict(generado=datetime.now().strftime("%Y-%m-%d %H:%M"), fuentes=[LIBRO.name, "DNIAF, Secretaría de Hacienda: montos fijos del ICL y del ICO2"],
                  nota="Generado por scripts/regenerate_icl_ico2.py desde el proyecto extraccion-icl-ico2 - no editar a mano"),
    )
    print(f"{'mes':8} {'ICL':>9} {'ICL exento':>11} {'ICO2':>8} {'ICL+ICO2':>9}")
    for fecha, icl, exento, ico2 in serie[-9:]:
        print(f"{fecha:8} {icl:9.3f} {exento:11.3f} {ico2:8.3f} {icl + ico2:9.2f}")
    if "--dry-run" in sys.argv:
        print(f"\n(simulacro: no se escribió {SALIDA.relative_to(REPO)})")
        return
    SALIDA.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")).replace('],["', '],\n["') + "\n", encoding="utf-8")
    print(f"\n{SALIDA.relative_to(REPO)} · {len(serie)} meses, {fechas[0]} a {fechas[-1]}")


if __name__ == "__main__":
    main()
