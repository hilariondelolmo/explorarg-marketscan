# Handoff - página Márgenes (`/margenes`)

Actualizado: **2026-10-12, sesión 1**. **Publicado** por orden de HDO en el commit `75a66ad` (la pestaña Biodiésel completa, el generador y este handoff). Reglas: las de `CLAUDE.md` (commits y pushes solo con orden de HDO; guion corto; alinear antes de codear; con cada pedido, decir primero qué se entendió y de qué base salen los datos; verificar los números por fuera de la página y mostrarlos en imagen).

## Qué es

Pedido de HDO del 12/10/2026: la entrada deshabilitada "Biodiesel - Primas y Precios Relativos" del menú Dashboards desaparece y en su lugar va **"Márgenes - Biodiésel y gas oil"** (`/margenes`), una página con tres pestañas: **Biodiésel** (hecha), **Gas oil** y **Comparación** (en preparación, HDO las va a pedir después). Réplica de las hojas del workbook Tableau
`/Volumes/comun/01. TABLEAU/EXP MKT RESUMEN/EXPLORA MARKETSCAN/BIODIESEL MARKET/Revision actual/03 MARKET & INDUSTRY- MARGEN BIODIESEL.twb`
("Margenes BIO Inicio" y "CRACK SPREAD BIO INICIAL", dashboards MARGEN BRUTO GO2 GO3 (3) y CRACK SPREAD COMPARADO (2)); HDO pasó cuatro capturas.

Archivos: `src/pages/Margenes.jsx` (sub-nav con `SectionNav`, kicker "Márgenes"), `src/components/margenes/MargenesBiodiesel.jsx` (la página), `src/lib/margenes.js` (series, regla de la glicerina, unidades y cálculo), CSS en `src/components/gasoil/GasOil.css` (`.go-filtros-margenes`, `.go-crack-rotulo`), ruta en `src/App.jsx`, menú en `src/components/Nav.jsx`. Reutiliza `useCajas` y `Cajas` de `src/components/gasoil/relevamiento.jsx` y el estilo `go-seccion go-sesco` (control debajo del título).

## Página Biodiésel

- **Controles** (formato con el nombre arriba, como Precios comparados): Intervalo (desde / hasta, atajos 12 m / 24 m / 5 a / Todo; **abre en Todo, feb-2010 a sep-2026**), Presidencia (regla del sitio: diciembre del año que asume a noviembre del que termina, recortada a los meses de la página; se suelta al mover una fecha), Aceite (**FAS Minagri** / FAS JJ) y Unidad (ton / m³ / l / bbl / gal, abre en ton). Solo dólares corrientes, como el workbook. Debajo, la nota con los meses, la unidad, el aceite y de dónde salió la glicerina en el intervalo.
- **Cajas** (abren las cuatro): Resultado del período (tarjetas con el **promedio del intervalo** de biodiésel, aceite, margen y crack spread como número grande, y debajo el primer y el último mes con la variación; corrección de HDO del 12/10/2026: antes el número grande era el del último mes y elegir Milei o Todo daba los mismos cuatro números), Biodiésel y aceite FAS (las tres líneas: biodiésel, aceite y margen, con el valor al inicio y al final), Margen sobre aceite (el margen solo, con la línea punteada del promedio) y Crack spread 10:9:1 (tres paneles: usd por unidad con promedio, % del aceite con promedio y variación acumulada desde el primer mes; los meses con glicerina de Explora van sombreados).
- **Decisiones de HDO (12/10/2026):** meses completos desde feb-2010 (el workbook arranca el 13/03/2010 y marzo le queda parcial: sus primeros valores 558 y 293 son 566 y 286 con el mes entero); el margen en % del biodiésel **no va** en esta página, solo cuando se compare con el gas oil; el costo variable de producción queda afuera por ahora ("después vemos"); el nombre del menú.

## Datos y fórmulas (`src/lib/margenes.js`)

Todo sale de `src/data/gasoil_ranking.json` (Master data), en usd/ton:
- Biodiésel = precio mediana de la Res. 963 ($/ton) ÷ TC del mes: producto `bio_963_m` ("Biodiesel corte obligatorio" del Ranking).
- FAS Minagri = FOB oficial SAGyP × (1 - retención), día a día y promediado: `comparados.aceite_minagri` (la serie de Precios comparados).
- FAS JJ = `aceite_fas_vendedor` (J.J. Hinrichsen vendedor, desde mar-2023) y, antes, `aceite_fas` (promedio).
- **Glicerina**, por mes: Rosario cruda 80% fob de F.O. Licht (producto `glicerina`, 117 meses hasta may-2025) cuando cotiza; si no, USA 80% exw de F.O. Licht (`comparados.glicerina_usa`, nuevo, hasta jul-2022; llena 65 meses hasta jun-2022, como el workbook); si no, **el precio de venta de la glicerina 80% de Explora** (`comparados.glicerina_explora`, nuevo: decisión de HDO del 12/10/2026, desde jun-2025); después del último mes de Explora (ago-2026), ese precio repetido y rotulado provisorio (sep-2026).
- Margen = biodiésel - aceite. Crack spread 10:9:1 = 0,9 × biodiésel + 0,1 × glicerina - aceite (fórmula del workbook: diez de aceite dan nueve de biodiésel y una de glicerina). Crack % = crack ÷ aceite. Acumulado = (crack del mes - crack del primer mes) ÷ |crack del primer mes|.
- Unidades: cada precio pasa de usd/ton a usd/m³ con su densidad (biodiésel 0,885, aceite 0,92, glicerina 1,26, las del workbook) y de ahí a bbl (6,2898 por m³), l y gal (264,172). El workbook divide por 6,289: diferencia de 0,01%.

**Generador (`scripts/regenerate_gasoil.py`):** `SERIES_COMPARADOS` suma `glicerina_usa` (columna "Glycerine  USA min. 80% crude, exw  (usd/ton)" de Master data) y `extraer_glicerina_explora()` lee `~/Explora_projects/Explora_Reporte_Gestion/data/excel/Explora_ReporteGestion_Tableau_ready.xlsx` (hoja COMERCIAL_long, escenario REAL, granularidad MES, cuenta "PRECIO DE VENTA > Glicerina 80%", ponderado de Local y Exportación, usd/ton; los meses en 0 quedan afuera; 55 meses, feb-2022 a ago-2026) y lo agrega al bloque `comparados`; el Excel va en `meta.fuentes`. Si falta el Excel, el generador aborta. La regeneración del 12/10/2026 solo agregó esas dos series: el resto de `gasoil_ranking.json` quedó igual (verificado clave por clave contra git) y los otros archivos se restauraron desde git (solo cambiaba la fecha).

**Aviso dado a HDO (12/10/2026) sobre la glicerina de Explora:** no es el mismo precio que el de F.O. Licht. En los 37 meses en que las dos coinciden (feb-2022 a may-2025) Explora promedia 210 usd/ton contra 334 (69%), y en 2024 trae meses de 42, 49 y 66. En el empalme, may-2025 440 (F.O. Licht) y jun-2025 185 (Explora): el crack spread baja unos 25 usd/ton ese mes. HDO lo aceptó ("de acuerdo"). El workbook, en esos meses, toma el precio de Rosario de 25 meses antes (campo "CRSB Glic Ros II", `LOOKUP(..., -25)`): así reproduce sus 253 y 39%; no se copió. Alternativa pública si alguna vez se quiere otra fuente: el precio FOB implícito de las exportaciones de glicerol en bruto (NCM 1520.00.10) del INDEC (`https://comex.indec.gob.ar/files/zips/exports_<año>_M.zip`, por mes y posición, con dólares FOB y kilos) o de ARCA (`informacionAgregada`, zips mensuales hasta sep-2026). No hay ninguna cotización pública de glicerina cruda FOB Rosario.

## Controles (calculados por fuera con `control_margenes.py` en el scratchpad de la sesión, desde `gasoil_ranking.json`; iguales en la página, leídos por DOM con `captura.mjs`)

- Todo, FAS Minagri, usd/ton: feb-2010 biodiésel 855, aceite 566, margen 289; sep-2026 1.336, 936, 400; promedios del período biodiésel 992, aceite 668 (+56,3% y +65,5% entre el primer y el último mes) y margen 325; crack spread sep-2026 308 (32,9% del aceite), acumulado +41%, promedios 254 y 39,3%. Contra las capturas de HDO (desde el 13/03/2010 y con el LOOKUP de la glicerina): 852 / 558 / 293 al inicio, 1.336 / 936 / 400 al final, promedio del crack 253 y 39%.
- Todo, FAS JJ: 599 → 999, margen 256 → 337, promedio 262 (la captura dice 261); crack 246 (24,6%), promedios 190,7 y 27,5%, acumulado +33%.
- Milei (dic-2023 a sep-2026) con FAS Minagri: promedios biodiésel 1.135, aceite 767, margen 368, crack 290 (39,6%). Con FAS JJ: 1.134 → 1.336, 948 → 999, margen 186,5 → 337, promedios biodiésel 1.135, aceite 852 y margen 283; crack 95,1 → 246, promedios 205 y 24,7%, acumulado +158%.
- Macri (dic-2015 a nov-2019), FAS Minagri: 655 → 645, 465 → 524, margen 190,2 → 121,3, promedio 261; crack 137,7 → 72,7 (13,9%), promedios 203 y 39,2%, acumulado -47%.
- Todo en usd/bbl: 120,3 → 188,0, 82,7 → 136,9, margen 37,6 → 51,1, promedio 41,9; crack 40,7 (29,7%), promedios 33,7 y 35,7%, acumulado +43%.
- Sin scroll horizontal a 390 px (los años del eje van uno por medio hasta 720 px); modo oscuro verificado; `npx vite build` pasa.

## Pendientes

1. Pestañas **Gas oil** y **Comparación** (HDO las pide después; en el workbook: hojas MARGEN BRUTO GO2 / GO3 INICIO, CRACK SPREAD INICIO con ratio 2:1:1 / 3:2:1 / 5:3:2 y costo variable de refinación; el margen en % del biodiésel va recién en la comparación).
2. Costo variable de producción del biodiésel (parámetro del workbook, 160 usd/ton con FAS Minagri y 115 con FAS JJ): HDO dijo "después vemos".
3. Cuando el Reporte de Gestión cargue sep-2026, regenerar: la glicerina de Explora deja de ser provisoria en ese mes.
4. `CLAUDE.md` todavía no nombra este handoff (tiene cambios sin commitear de otra sesión).

## Primer prompt para retomar

```
Retomamos la página Márgenes (/margenes) del sitio explorarg-marketscan. Antes de hacer nada, leé completo HANDOFF_MARGENES.md, en la raíz del repo: ahí están la estructura de la página Biodiésel, las fuentes (Master data y el precio de venta de la glicerina de Explora del Reporte de Gestión), las fórmulas del crack spread 10:9:1, los números de control y lo pendiente (pestañas Gas oil y Comparación). Te voy a pasar pedidos de a uno; con cada uno, primero decime qué entendiste y de qué base saldrían los datos, y recién después codeá. Commits y pushes solo cuando yo lo ordene; guion corto; verificá los números por fuera de la página y mostrámelos en imagen.
```
