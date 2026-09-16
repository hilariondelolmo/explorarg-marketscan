# Handoff - página Mercado de Gas Oil (`/gas-oil`)

Actualizado: **2026-09-16, sesión 2 (tarde)**, con los cambios de la apertura común **sin commitear**. Último commit en `main`: `1a1190c` (página completa, publicado por Vercel).
Reglas: las de `CLAUDE.md` (commits y pushes solo con orden de HDO; guion corto; alinear antes de codear).

## Qué es

Réplica en React de cuatro tableros del workbook Tableau
`/Volumes/comun/01. TABLEAU/EXP MKT RESUMEN/EXPLORA MARKETSCAN/BIODIESEL MARKET/Revision actual/05 MARKET & INDUSTRY- MERCADO INTERNO GAS OIL VERSION ONLINE I.twb`
(decisión HDO 16/09/2026, "por ahora hasta ahí"):

| Sección | Ruta | Tablero Tableau | Componente | Datos |
|---|---|---|---|---|
| Precio surtidor | `/gas-oil` | PRECIO SURTIDOR DASHBOARD (2) | `src/components/gasoil/PrecioSurtidor.jsx` | relevamiento fino (`public/data`) |
| Estructura del mercado | `/gas-oil/estructura` | MARKET STRUCTURE | `EstructuraMercado.jsx` (Sankey recharts, en volumen) | relevamiento fino |
| Ranking de precios | `/gas-oil/ranking` | RANKING Actualizado | `RankingPrecios.jsx` (carrera de barras con Play) | `gasoil_ranking.json` (bundle) |
| Minorista y mayorista | `/gas-oil/canales` | ARG GO MARKET BTB BTC | `MinoristaMayorista.jsx` | relevamiento fino + importaciones |

Página: `src/pages/GasOil.jsx` (sub-nav con `SectionNav`, kicker "Mercado Gas Oil"; las tres secciones con `encabezadoPropio` dibujan su encabezado dentro del bloque fijo). Librería: `src/lib/gasoil.js`. Estilos: `src/components/gasoil/GasOil.css`. Mapa: `MapaProvincias.jsx` (SVG propio, misma proyección que el mapa de plantas).

**Módulo compartido `src/components/gasoil/relevamiento.jsx`** (sesión 2): `useRelevamiento` (estado de los ocho filtros, carga del retail y de la partición por operador, predicados `fMes/fCanal/fBand/fProv/fBase`, etiquetas), `FiltrosRelevamiento` (la fila de filtros), `Cajas` + `useCajas` (fila de cajas al mismo nivel), `BloqueFijo` (encabezado + filtros + cajas dentro de `.go-sticky`), `TiposDropdown`, `Tarjeta`, `TooltipSerie`. Precio surtidor, Estructura y Minorista y mayorista usan literalmente el mismo código para el bloque fijo; solo cambia el modo del hook:
- `modo: 'surtidor'` (Precio surtidor): arranca en minorista, 6 tipos de bocas/estación, al público y precio surtidor; al cambiar canal de distribución ajusta tipos y canal de comercialización como el workbook.
- `modo: 'abierto'` (Estructura, Minorista y mayorista): arranca con todo el mercado (ambos canales, todos los tipos y canales, **precio sin impuestos**) y cada filtro se mueve solo.
- En todos los modos, el precio surtidor solo existe al público: al salir de ese canal el tipo de precio salta a "con impuestos".

**Revisión con HDO: Precio surtidor revisada y aprobada (4 rondas). Estructura y Minorista y mayorista tienen la apertura nueva sin revisar. Ranking de precios quedó como estaba, por pedido explícito de HDO ("no en ranking de precios, insisto").**

## Datos

Generador: `python3 scripts/regenerate_gasoil.py [--dry-run]` (usar el python de miniforge, único con `tableauhyperapi`; requiere `/Volumes/comun`). `regenerate_data.py` lo llama al final, así el lanzador `Iniciar/Marketscan - Regenerar datos.command` regenera todo.

Fuentes (todas en `EXP MKTS DATABASES/Revision Actual/`): `Precio derivados petroleo 1104 minorista y mayorista new.hyper` (relevamiento SE Res. 1104/2004, 6 M filas, 2004-12→2026-07; precio y volumen de cada boca vienen en filas distintas), `Master data database.hyper` (Brent, WTI, TC, CPI US, FoLicht, precios 963, aceite FAS), `Go Imports.hyper` (importaciones de gas oil, CIF), `EESS Localidad departamento provincia.hyper` (padrón geo; `idempresa` = `Nro Inscripción` de la SE).

Salidas:
- `src/data/gasoil_precios.json` (740 KB en disco): meses, provincias, banderas, canales, tipos de negocio, y tres bloques que **ya nadie lee** (`canales`, `flujos`, `eess`, 737 KB): la lib los importa por nombre y Rollup los deja fuera del bundle. Candidatos a sacar del generador.
- `src/data/gasoil_ranking.json` (60 KB): series usd/ton del ranking, TC, CPI US, importaciones.
- `public/data/gasoil_retail.json` (8,3 MB, fuera del bundle, fetch al abrir cualquiera de las tres secciones, una sola vez por carga de página): cruce columnar mes × provincia × bandera × canal dist × tipo negocio × canal com (170 k filas, precios en centavos de $/l, `e2` = bocas con precio surtidor) + índice `operadores` (5.333) y `bocas` (7.310; 4.677 con coordenadas).
- `public/data/gasoil_bocas/0..95.json` (66 MB): filas boca-mes particionadas por operador (índice % 96). Se pide una al elegir operador o estación, en las tres secciones.
- `public/data/gasoil_mes/<YYYY-MM>.json` (58 MB, 199 archivos): bocas relevadas de cada mes, para el mapa de estaciones (solo Precio surtidor).

Total `public/data`: **132 MB, ya commiteado y descargable por cualquiera** (Vercel lo sirve como estático y el repo es público; HDO lo sabe desde la sesión 2). HDO no decidió si recortar (opción: detalle por boca solo desde 2015, mitad del peso).

## Decisiones de cálculo (avisadas a HDO, sin objeción todavía)

- Precio ponderado = Σ(precio boca × volumen boca) / Σ volumen boca. El workbook pondera por provincia: jul-2026 GO2 surtidor 2.269 $/l acá vs 2.283 en Tableau (0,6%).
- Precio surtidor solo existe "al público"; al elegir mayorista u otro canal, el tipo de precio salta solo a "con impuestos" (lógica "precio final" del workbook).
- usd/ton = $/l ÷ TC mensual × 1000 ÷ 0,845 (densidad gas oil del workbook; sus hojas BTB usan 0,885, la del biodiésel).
- Gas oil fósil (neto de biodiésel) = (precio sin imp − mezcla real × precio bio) / (1 − mezcla), con precio Res. 963 categoría **mediana** (`evidencia.json`): supuesto a validar con HDO.
- Ranking: base default ene-2024 (parámetro "Fecha Final" del workbook); valores constantes deflactados con CPI US en ambas monedas, como el workbook; si falta el dato del mes toma hasta 3 meses atrás (lo indica).
- Diesel USA en Master data está roto desde dic-2025 (ceros y valores sueltos): serie cortada en nov-2025. Brent/WTI llegan a jun-2026.
- Retail sin relevamiento en 2017-01 (la SE no publicó): el generador lo admite y avisa.
- Volúmenes de Estructura = suma de m³ de las filas filtradas (con o sin precio); volúmenes de las tablas de precio (bandera en surtidor, canal en minorista y mayorista) = solo filas con precio, como el ponderador.

## Precio surtidor - estado aprobado por HDO

- Fila única de 8 filtros con título arriba alineado al borde del control: Mes, Tipo de precio, Canal de distribución (desplegable), Tipo de negocio (multi, default 6 tipos bocas/estación), Canal de comercialización (default Al público), Bandera, Operador (input con datalist de 5.333), Provincia. Grilla `fr` a todo el ancho.
- Bloque fijo (`.go-sticky`, static ≤720 px): encabezado + filtros + fila de cuatro cajas al mismo nivel: **Resultado del relevamiento** (ex Indicadores), **Gráficos de precios** (abierto al entrar), **Bocas y precio por bandera**, **Distribución geográfica**. Detalle de dos líneas como máximo por caja. Los cuerpos abren debajo, en ese orden.
- Mapas verticales lado a lado: provincias (color = GO2; tooltip con período, GR2, GR3, ponderado, bocas, volumen; **sin etiquetas de precio**, HDO las sacó) y estaciones (solo bocas relevadas del mes; tooltip como Tableau). Clic en provincia: el mapa de estaciones se acerca a ella; clic en estación: queda solo esa (fija su operador); clic afuera: suelta.
- Gráficos GO2 y GO3 con Mensual/Anual y 12 m/5 a/10 a/Todo; anual = ponderado del año, usd con TC promedio del año, "variación interanual".
- Sesión 2: migrado al módulo compartido sin cambiar cálculo ni marcado (verificado: mismos valores por defecto, 2.269/2.463 $/l y 3.609 bocas en jul-2026; operador AUTOMOVIL CLUB ARGENTINO 127 bocas).

## Estructura del mercado - apertura nueva (sesión 2, sin revisar)

- Mismo bloque fijo y mismos 8 filtros, modo abierto (todo el mercado, precio sin impuestos). Cajas: **Resultado del relevamiento** (volumen relevado, % minorista, % al público, % grado 3), **Diagrama de flujos** (abierto al entrar; el selector Grados 2 y 3 / Grado 2 / Grado 3 pasó al encabezado del gráfico), **Por canal de comercialización** y **Por tipo de negocio** (m³, participación y precio ponderado GO2/GO3 del tipo de precio elegido).
- El Sankey y las tarjetas responden a los 8 filtros (con operador o estación, sus bocas). Cada tabla ignora el filtro de su propio nivel, como la tabla por bandera de Precio surtidor: clic en una fila filtra ese canal o tipo en el resto de la sección; otro clic lo suelta.
- Nombres de tipos de boca abreviados solo en las etiquetas del Sankey ("Bocas · Duales (líquidos + GNC)"), para que no queden dos etiquetas iguales al truncar.
- Control: jul-2026 sin filtros da 824.846 m³, 72,6% minorista, 65,5% al público, igual que los flujos precalculados de la versión anterior.

## Minorista y mayorista - apertura nueva (sesión 2, sin revisar)

- Mismo bloque fijo y mismos 8 filtros, modo abierto. Cajas: **Resultado del relevamiento** (con Ambos: GO2 y GO3 minorista y mayorista con variación contra el mes anterior; con un solo canal: GO2, GO3, gas oil fósil o volumen, e importado CIF del mes), **Gráficos de precios** (abierto al entrar: GO2 y GO3 con una línea por canal de distribución; con precio sin impuestos, línea punteada del gas oil fósil por canal; rango 12 m/5 a/10 a/Todo en el encabezado), **Gas oil importado** (CIF y toneladas; no responde a los filtros del relevamiento), **Precio por canal** (mes elegido, canal de distribución × canal de comercialización, ignora los filtros de canal; clic filtra, otro clic suelta).
- Se sacaron las series de variación acumulada de los gráficos (con dos canales quedaban cuatro líneas más); la comparación minorista vs mayorista es el contenido del tablero BTB BTC.
- Control: jul-2026 sin impuestos GO2 minorista 1.629, mayorista 1.562; GO3 1.794 / 1.619 $/l; total 1.607 / 1.765; importado CIF 987 usd/ton, 100.193 t.

## Decisiones de la sesión 2 a validar con HDO

1. Defaults del modo abierto: ambos canales, todos los tipos y canales, precio **sin impuestos** en $/l (en el commit anterior Minorista y mayorista arrancaba en surtidor, minorista, al público).
2. Estructura: el selector de grado vive en el encabezado del Sankey, no en la fila de filtros; las tablas ignoran su propio nivel.
3. Minorista y mayorista: dos líneas (minorista y mayorista) por gráfico en lugar de precio + variación acumulada; gas oil fósil como punteado por canal; la tabla por canal ignora los filtros de canal.
4. Ranking de precios queda sin el bloque fijo (HDO lo pidió así).

## Pendientes

1. Revisión con HDO de Estructura y Minorista y mayorista con la apertura nueva (método por grabación).
2. Pestaña "Ver en Tableau" en `/gas-oil`: falta la URL de ferozo del libro 05 ("después te la paso").
3. Decidir el peso de `public/data` (132 MB, público).
4. Tooltip de estación cerca del borde superior queda tapado por el bloque fijo: abrirlo hacia abajo.
5. Validar el precio 963 usado en "gas oil fósil" y la densidad 0,845.
6. Sacar del generador los bloques `canales`, `flujos` y `eess` de `gasoil_precios.json` (ya no se leen; 737 KB en git en cada regeneración). Requiere `/Volumes/comun` para regenerar.
7. En `docs/` hay archivos sin trackear de sesiones anteriores (PDF infografía, transcripciones Senado, video CEPREB v8): HDO no dijo si entran.
8. Chunk `GasOil` 125 KB (37 KB gz); el resto va por fetch.

## Método de revisión por video (funciona bien)

HDO graba su pantalla con voz (`Cmd+Shift+5`, micrófono en Opciones) y deja el .mov en `docs/`. Transcribir con Whisper local:
`~/Explora_projects/_herramientas/whisper/.venv/bin/python ~/Explora_projects/_herramientas/whisper/transcribir.py "docs/<archivo>.mov" --fotogramas 10`
(ojo: el nombre de macOS trae un espacio especial antes de "AM"; resolverlo con glob o copiar a `docs/grabacion_<fecha>.mov`). Deja `<nombre>.transcripcion.md` y `<nombre>.fotogramas/` (leer los PNG con Read). `docs/*.mov` y `docs/grabacion_*` están en `.gitignore`. Lanzador: `Iniciar/Transcribir grabacion.command`.

## Verificación

Dev: `Iniciar/Marketscan.command` (puerto 5273; si está ocupado, Vite toma otro) → http://localhost:5273/gas-oil. Build: `npx vite build`. Para probar con datos: esperar la carga del retail (8 MB); operador de prueba: "AUTOMOVIL CLUB ARGENTINO" (134 estaciones, 127 con precio en jul-2026).
Ojo en dev: el recargador en caliente de Vite tira "Maximum call stack size exceeded" (react-refresh recorre los 5.333 `<option>` del datalist de operadores) después de editar un archivo de la página; es solo de desarrollo, no afecta el build: recargar la página después de editar.
