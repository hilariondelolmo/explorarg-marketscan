#!/usr/bin/env python3
"""Arma la tabla de datos técnicos del sitio: src/data/datos_tecnicos.json.

    python3 scripts/poligrafo_tecnicos.py

Poderes caloríficos y reducción de emisiones de los combustibles, para que el
Polígrafo pueda contrastar afirmaciones como "el bioetanol es más barato que
la nafta" (un litro de bioetanol no rinde lo mismo que uno de nafta).

Fuente: Directiva (UE) 2018/2001 del Parlamento Europeo y del Consejo (la
directiva europea de energías renovables), anexo III (contenido energético de
los combustibles) y anexo V, parte A (reducción de emisiones de los
biocarburantes). El extracto oficial en español está en
scripts/poligrafo/fuentes/ue_directiva_2018_2001_anexos.txt, bajado de
publications.europa.eu/resource/celex/32018L2001.

Los valores no se tipean: se leen del extracto. Para sumar un combustible,
agregarlo a COMBUSTIBLES o a PROCESOS con el nombre con que figura en el anexo.
No editar el JSON a mano.
"""
import json
import re
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FUENTE = RAIZ / "scripts" / "poligrafo" / "fuentes" / "ue_directiva_2018_2001_anexos.txt"
SALIDA = RAIZ / "src" / "data" / "datos_tecnicos.json"

# id, nombre de uso en la Argentina, comienzo del nombre oficial en el anexo III
COMBUSTIBLES = [
    ("nafta", "Nafta", "Gasolina"),
    ("bioetanol", "Bioetanol", "Etanol procedente de fuentes renovables"),
    ("gasoil", "Gas oil", "Gasóleo"),
    ("biodiesel", "Biodiésel", "Biodiésel - éster metílico de ácidos grasos"),
    ("hvo", "Aceite vegetal hidrotratado (HVO)", "Aceite hidrotratado procedente de biomasa (tratado termoquímicamente con hidrógeno), utilizado en sustitución del gasóleo"),
]

# id, nombre de uso, nombre oficial exacto en el anexo V, parte A
PROCESOS = [
    ("biodiesel_soja", "Biodiésel de soja", "Biodiésel de soja"),
    ("biodiesel_aceite_usado", "Biodiésel de aceite de cocina usado", "Biodiésel de aceite de cocina usado"),
    ("biodiesel_grasas", "Biodiésel de grasas animales", "Biodiésel procedente de grasas animales fundidas (**)"),
    ("hvo_soja", "Aceite vegetal hidrotratado de soja", "Aceite vegetal hidrotratado de soja"),
    ("bioetanol_cana", "Bioetanol de caña de azúcar", "Etanol de caña de azúcar"),
    ("bioetanol_maiz_caldera", "Bioetanol de maíz (gas natural, caldera convencional)", "Etanol de maíz (gas natural como combustible de proceso en caldera convencional)"),
    ("bioetanol_maiz_cogeneracion", "Bioetanol de maíz (gas natural, cogeneración)", "Etanol de maíz (gas natural como combustible de proceso en instalaciones de cogeneración (*))"),
]


def numero(txt):
    return float(re.sub(r"[^\d,.-]", "", txt).replace(",", "."))


def main():
    lineas = [re.sub(r"[ \t ]+", " ", l).strip() for l in FUENTE.read_text(encoding="utf-8").splitlines()]
    lineas = [l for l in lineas if l]
    i3 = lineas.index("ANEXO III")
    i5 = lineas.index("ANEXO V")
    anexo3, anexo5 = lineas[i3:i5], lineas[i5:]

    contenido = []
    for ident, nombre, oficial in COMBUSTIBLES:
        # primero la fila con ese nombre exacto ("Gasolina", no "Gasolina Fischer-Tropsch")
        hallados = [k for k, l in enumerate(anexo3) if l == oficial] or [k for k, l in enumerate(anexo3) if l.startswith(oficial)]
        assert len(hallados) == 1, f"{oficial}: {len(hallados)} filas en el anexo III"
        k = hallados[0]
        contenido.append({
            "id": ident, "nombre": nombre, "nombre_oficial": anexo3[k],
            "mj_kg": numero(anexo3[k + 1]), "mj_l": numero(anexo3[k + 2]),
        })

    reduccion = []
    for ident, nombre, oficial in PROCESOS:
        hallados = [k for k, l in enumerate(anexo5) if l == oficial]
        assert len(hallados) == 1, f"{oficial}: {len(hallados)} filas en el anexo V"
        k = hallados[0]
        assert anexo5[k + 1].endswith("%") and anexo5[k + 2].endswith("%"), oficial
        reduccion.append({
            "id": ident, "nombre": nombre, "nombre_oficial": oficial,
            "tipico": numero(anexo5[k + 1]), "defecto": numero(anexo5[k + 2]),
        })

    m = re.search(r"combustible fósil de referencia E F\(t\) será (\d+) g CO 2 eq/MJ", " ".join(anexo5))
    assert m, "no encontré el valor del combustible fósil de referencia"

    datos = {
        "meta": {
            "generado": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "nota": "Generado por scripts/poligrafo_tecnicos.py - no editar a mano",
            "fuente": "Directiva (UE) 2018/2001 del Parlamento Europeo y del Consejo, del 11/12/2018 (energías renovables), anexos III y V",
            "url": "https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:32018L2001",
        },
        "contenido_energetico": contenido,
        "reduccion_emisiones": reduccion,
        "fosil_referencia_g_co2eq_mj": float(m.group(1)),
    }
    SALIDA.write_text(json.dumps(datos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{SALIDA.relative_to(RAIZ)}")
    for c in contenido:
        print(f"  {c['nombre']:36} {c['mj_kg']:>5g} MJ/kg  {c['mj_l']:>5g} MJ/l")
    for r in reduccion:
        print(f"  {r['nombre']:52} típico {r['tipico']:g}%  por defecto {r['defecto']:g}%")
    print(f"  combustible fósil de referencia: {datos['fosil_referencia_g_co2eq_mj']:g} g CO2eq/MJ")


if __name__ == "__main__":
    main()
