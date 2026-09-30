# Handoff - página Mercado de Gas Oil (`/gas-oil`)

Actualizado: **2026-09-30, cierre de la sesión 5**. **Todo lo hecho está publicado** por orden de HDO. Commits en `main`: `1a1190c` (página completa), `43ecdb8` (apertura común), `3174b52` (Sankey de cuatro tótems), `5880704` (filtro Provincia), `f418e70` (filtros en pantallas angostas), `9f5844c` (el clic del Sankey filtra), `c24713a` (generador: estaciones, Brent y WTI desde regalías, sin reescrituras), `1096089` (datos regenerados el 30/09), `674d943` (pestañas, menú Precio / Volumen y página de volumen) y `ec2993f` (sesión 5: Tablas SESCO, corte por gestión, Sankey resaltar / filtrar).
Reglas: las de `CLAUDE.md` (commits y pushes solo con orden de HDO; guion corto; alinear antes de codear).

## Cómo retomar

La página Tablas SESCO está hecha y publicada (ver su sección, abajo). HDO estaba pasando pedidos "de a uno" al cierre de la sesión 5 ("tengo más aún"): la sesión 6 arranca esperando el siguiente. Antes de codear, decirle qué se entendió y de qué base salen los datos (regla de HDO para esta página).

**Esperan una definición de HDO:**
1. Confirmar las cinco empresas históricas que se vincularon a mano para el corte por empresa (`EMPRESA_BIO_EXTRA` en `scripts/gasoil_sesco.py`): Oil S.A. = Oil Combustibles, Petrolera del Cono Sur = Petrolera del Conosur, Petroil Petróleo y Derivados = Petroil, Enarsa y Energía Derivados del Petróleo. Las diez mezcladoras de siempre salen del mapa del tablero de biodiésel.
2. Si los títulos de las páginas de la pestaña Ventas ("Mercado minorista y mayorista", "Volumen minorista y mayorista") también cambian; el 30/09 solo se cambió el nombre de la pestaña.
3. Si el Sankey abre en Resaltar o en Filtrar (hoy Filtrar).
4. Eje de las estaciones relevadas en los gráficos de volumen: pidió "el eje de la izquierda" y así quedó, con el volumen a la derecha. Falta que lo vea.
3. Si quiere la apertura Mensual / Anual también en la página de precios de Minorista y mayorista. Hay que definir cómo se promedian el gas oil fósil y el CIF.
4. Título de la página de Resolución 1104: sigue "Volumen minorista y mayorista". Con dos fuentes de volumen quizás convenga que nombre la fuente.
5. Rótulo de Brent y WTI en el Ranking: dice "usd/ton" y fuente "EIA", pero los valores salen del informe de regalías de crudo de la SE, cuya hoja dice "USD/m3". No cambia los porcentajes de variación.
6. Correr el flujo `Master data database` en Tableau Prep: sus tableros de Tableau siguen sin Brent y WTI de 2026. El sitio ya no lo necesita.
7. URL de ferozo del libro 05 para la pestaña "Ver en Tableau".
8. Peso de `public/data` (132 MB, público).

El primer prompt para el chat nuevo está al final de este documento.

## Qué es

Réplica en React de cuatro tableros del workbook Tableau
`/Volumes/comun/01. TABLEAU/EXP MKT RESUMEN/EXPLORA MARKETSCAN/BIODIESEL MARKET/Revision actual/05 MARKET & INDUSTRY- MERCADO INTERNO GAS OIL VERSION ONLINE I.twb`
(decisión HDO 16/09/2026, "por ahora hasta ahí"):

| Sección | Ruta | Tablero Tableau | Componente | Datos |
|---|---|---|---|---|
| Estructura Mercado | `/gas-oil` | MARKET STRUCTURE | `src/components/gasoil/EstructuraMercado.jsx` (Sankey recharts, en volumen) | relevamiento fino (`public/data`) |
| Ventas (menú): Precio | `/gas-oil/canales` | ARG GO MARKET BTB BTC | `MinoristaMayorista.jsx` | relevamiento fino + importaciones |
| Ventas (menú): Volumen, Resolución 1104 | `/gas-oil/canales-volumen` | no tiene, es la de precios en m³ | `MinoristaMayoristaVolumen.jsx` | relevamiento fino + importaciones |
| Ventas (menú): Volumen, Tablas SESCO | `/gas-oil/canales-sesco` | - | `TablasSesco.jsx` ("Ventas de combustibles") | tablas SESCO (`public/data/gasoil_sesco.json`) + biodiésel del tablero |
| Precio surtidor | `/gas-oil/surtidor` | PRECIO SURTIDOR DASHBOARD (2) | `PrecioSurtidor.jsx` | relevamiento fino |
| Ranking precios | `/gas-oil/ranking` | RANKING Actualizado | `RankingPrecios.jsx` (carrera de barras con Play) | `gasoil_ranking.json` (bundle) |

Orden y nombres de las pestañas definidos por HDO el 29/09/2026 (la pestaña "Minorista y mayorista" pasó a llamarse "Ventas" el 30/09); antes era Precio surtidor / Estructura del mercado / Ranking de precios / Minorista y mayorista, con Precio surtidor en `/gas-oil`. La primera pestaña es la que abre al entrar. La dirección vieja `/gas-oil/estructura` redirige a `/gas-oil`. Los títulos de cada página no cambiaron, solo los nombres de las pestañas. En el resto de este documento las secciones se siguen nombrando como antes ("Estructura del mercado", "Ranking de precios").

Página: `src/pages/GasOil.jsx` (sub-nav con `SectionNav`, kicker "Mercado Gas Oil"; las tres secciones con `encabezadoPropio` dibujan su encabezado dentro del bloque fijo). Librería: `src/lib/gasoil.js`. Estilos: `src/components/gasoil/GasOil.css`. Mapa: `MapaProvincias.jsx` (SVG propio, misma proyección que el mapa de plantas).

**Módulo compartido `src/components/gasoil/relevamiento.jsx`** (sesión 2): `useRelevamiento` (estado de los ocho filtros, carga del retail y de la partición por operador, predicados `fMes/fCanal/fBand/fProv/fBase`, etiquetas), `FiltrosRelevamiento` (la fila de filtros), `Cajas` + `useCajas` (fila de cajas al mismo nivel), `BloqueFijo` (encabezado + filtros + cajas dentro de `.go-sticky`), `DropdownMulti` (desplegable con casillas de Tipo de negocio y de Provincia; ex `TiposDropdown`), `Tarjeta`, `TooltipSerie`. Precio surtidor, Estructura y Minorista y mayorista usan literalmente el mismo código para el bloque fijo; solo cambia el modo del hook:
- `modo: 'surtidor'` (Precio surtidor): arranca en minorista, 6 tipos de bocas/estación, al público y precio surtidor; al cambiar canal de distribución ajusta tipos y canal de comercialización como el workbook.
- `modo: 'abierto'` (Estructura, Minorista y mayorista): arranca con todo el mercado (ambos canales, todos los tipos y canales, **precio sin impuestos**) y cada filtro se mueve solo.
- En todos los modos, el precio surtidor solo existe al público: al salir de ese canal el tipo de precio salta a "con impuestos".

**Revisión con HDO:** Precio surtidor fue revisada y aprobada en cuatro rondas (sesión 1). En la sesión 4 HDO usó las demás y pidió cambios puntuales, todos hechos y publicados: filtro Provincia, clic del Sankey, orden de pestañas, menú Precio / Volumen, página de volumen. No hubo una revisión completa por grabación de Estructura ni de la página de precios de Minorista y mayorista. Ranking de precios quedó como estaba, por pedido explícito de HDO ("no en ranking de precios, insisto").

## Datos

Generador: `python3 scripts/regenerate_gasoil.py [--dry-run]` (usar el python de miniforge, único con `tableauhyperapi`; requiere `/Volumes/comun`). `regenerate_data.py` lo llama al final, así el lanzador `Iniciar/Marketscan - Regenerar datos.command` regenera todo (biodiésel y gas oil; no commitea ni publica). Tres cosas del generador desde la sesión 4: llama a `scripts/gasoil_estaciones.py` para agregar al cruce fino la cantidad de estaciones de cada celda; si a Master data le faltan meses de Brent o WTI los toma del informe de regalías; y no reescribe los archivos por boca y por mes cuando traen las mismas filas.

Fuentes (todas en `EXP MKTS DATABASES/Revision Actual/`): `Mercado Argentino Derivados Petroleo Table.hyper` (tablas SESCO, ver la sección de Tablas SESCO), `Precio derivados petroleo 1104 minorista y mayorista new.hyper` (relevamiento SE Res. 1104/2004, 6 M filas, 2004-12→2026-07; precio y volumen de cada boca vienen en filas distintas), `Master data database.hyper` (Brent, WTI, TC, CPI US, FoLicht, precios 963, aceite FAS), `Go Imports.hyper` (importaciones de gas oil, CIF), `EESS Localidad departamento provincia.hyper` (padrón geo; `idempresa` = `Nro Inscripción` de la SE). Fuera de esa carpeta: `EXP MKTSCAN - DATASOURCES/Revision Actual/Informe Regalias CRUDO.xlsx`, hoja "Tabla precios (2)", de donde el flujo de Prep saca las columnas BRENT y WTI de Master data y de donde el generador completa los meses que falten.

Salidas:
- `src/data/gasoil_precios.json` (740 KB en disco): meses, provincias, banderas, canales, tipos de negocio, y tres bloques que **ya nadie lee** (`canales`, `flujos`, `eess`, 737 KB): la lib los importa por nombre y Rollup los deja fuera del bundle. Candidatos a sacar del generador.
- `src/data/gasoil_ranking.json` (60 KB): series usd/ton del ranking, TC, CPI US, importaciones.
- `public/data/gasoil_retail.json` (10,1 MB desde el 29/09/2026 por las cuatro columnas de estaciones, antes 8,3 MB; fuera del bundle, fetch al abrir cualquiera de las tres secciones, una sola vez por carga de página): cruce columnar mes × provincia × bandera × canal dist × tipo negocio × canal com (170 k filas, precios en centavos de $/l, `e2` = bocas con precio surtidor) + índice `operadores` (5.333) y `bocas` (7.310; 4.677 con coordenadas).
- `public/data/gasoil_bocas/0..95.json` (66 MB): filas boca-mes particionadas por operador (índice % 96). Se pide una al elegir operador o estación, en las tres secciones.
- `public/data/gasoil_mes/<YYYY-MM>.json` (58 MB, 199 archivos): bocas relevadas de cada mes, para el mapa de estaciones (solo Precio surtidor).
- `public/data/gasoil_sesco.json` (5,2 MB, `scripts/gasoil_sesco.py`): ventas SESCO, cruce mes × provincia × empresa × sector con los valores de cada producto solo donde hay venta (`valores[id] = { i: fila, v: cantidad }`), 111.008 filas, 199 meses, 69 empresas, 12 sectores, 36 productos. Orden fijo: no cambia entre corridas.

Total `public/data`: **137 MB, ya commiteado y descargable por cualquiera** (Vercel lo sirve como estático y el repo es público; HDO lo sabe desde la sesión 2). HDO no decidió si recortar (opción: detalle por boca solo desde 2015, mitad del peso).

## Decisiones de cálculo (avisadas a HDO, sin objeción todavía)

- Precio ponderado = Σ(precio boca × volumen boca) / Σ volumen boca. El workbook pondera por provincia: jul-2026 GO2 surtidor 2.269 $/l acá vs 2.283 en Tableau (0,6%).
- Precio surtidor solo existe "al público"; al elegir mayorista u otro canal, el tipo de precio salta solo a "con impuestos" (lógica "precio final" del workbook).
- usd/ton = $/l ÷ TC mensual × 1000 ÷ 0,845 (densidad gas oil del workbook; sus hojas BTB usan 0,885, la del biodiésel).
- Gas oil fósil (neto de biodiésel) = (precio sin imp − mezcla real × precio bio) / (1 − mezcla), con precio Res. 963 categoría **mediana** (`evidencia.json`): supuesto a validar con HDO.
- Ranking: base default ene-2024 (parámetro "Fecha Final" del workbook); valores constantes deflactados con CPI US en ambas monedas, como el workbook; si falta el dato del mes toma hasta 3 meses atrás (lo indica).
- Diesel USA en Master data está roto desde dic-2025 (ceros y valores sueltos): serie cortada en nov-2025. Brent y WTI llegan a ago-2026; de ene a ago-2026 salen del informe de regalías (los dos últimos meses son provisorios: ago repite el valor de jul).
- Retail sin relevamiento en 2017-01 (la SE no publicó): el generador lo admite y avisa.
- Volumen: el cruce fino solo trae las bocas que informaron algún precio (el generador descarta las filas sin precio; `w` = m³ de las bocas con precio con impuestos). **No es el total del mercado.** Estructura y la página de volumen suman todas las filas filtradas; las tablas de precio (bandera en surtidor, canal en minorista y mayorista) suman solo las que tienen el tipo de precio elegido, como el ponderador.

## Precio surtidor - estado aprobado por HDO

- Fila única de 8 filtros con título arriba alineado al borde del control: Mes, Tipo de precio, Canal de distribución (desplegable), Tipo de negocio (multi, default 6 tipos bocas/estación), Canal de comercialización (default Al público), Bandera, Operador (input con datalist de 5.333), Provincia. Grilla `fr` a todo el ancho.
- Bloque fijo (`.go-sticky`, static ≤1100 px desde el 29/09/2026; antes ≤720 px): encabezado + filtros + fila de cuatro cajas al mismo nivel: **Resultado del relevamiento** (ex Indicadores), **Gráficos de precios** (abierto al entrar), **Bocas y precio por bandera**, **Distribución geográfica**. Detalle de dos líneas como máximo por caja. Los cuerpos abren debajo, en ese orden.
- Mapas verticales lado a lado: provincias (color = GO2; tooltip con período, GR2, GR3, ponderado, bocas, volumen; **sin etiquetas de precio**, HDO las sacó) y estaciones (solo bocas relevadas del mes; tooltip como Tableau). Clic en provincia: el mapa de estaciones se acerca a ella; clic en estación: queda solo esa (fija su operador); clic afuera: suelta.
- Gráficos GO2 y GO3 con Mensual/Anual y 12 m/5 a/10 a/Todo; anual = ponderado del año, usd con TC promedio del año, "variación interanual".
- Sesión 2: migrado al módulo compartido sin cambiar cálculo ni marcado (verificado: mismos valores por defecto, 2.269/2.463 $/l y 3.609 bocas en jul-2026; operador AUTOMOVIL CLUB ARGENTINO 127 bocas).

## Estructura del mercado - apertura común (sesión 2) y Sankey de cuatro tótems (sesiones 3 y 4)

- Mismo bloque fijo y mismos 8 filtros, modo abierto (todo el mercado, precio sin impuestos). Cajas: **Resultado del relevamiento** (volumen relevado, % minorista, % al público, % grado 3), **Diagrama de flujos** (abierto al entrar; el selector Grados 2 y 3 / Grado 2 / Grado 3 en el encabezado del gráfico), **Por canal de comercialización** y **Por tipo de negocio** (m³, participación y precio ponderado GO2/GO3 del tipo de precio elegido).
- El Sankey y las tarjetas responden a los 8 filtros (con operador o estación, sus bocas). Cada tabla ignora el filtro de su propio nivel, como la tabla por bandera de Precio surtidor: clic en una fila filtra ese canal o tipo en el resto de la sección; otro clic lo suelta.
- Control: jul-2026 sin filtros da 824.846 m³, 72,6% minorista, 65,5% al público, igual que los flujos precalculados de la versión anterior.

**Sankey (`SankeyMercado.jsx` + `coloresSankey.js`, grabación de HDO `docs/grabacion_2026-09-17_0140.*` mostrando su tablero MARKET STRUCTURE):**
- Cuatro tótems como el Tableau: **Bandera → Canal de distribución → Tipo de negocio → Canal de comercialización**, con cabecera arriba de cada columna, nodos anchos (14% del ancho, entre 64 y 170 px) con la etiqueta y el volumen adentro, orden alfabético por columna ("Otros" al final; recharts con `sort={false}`), menores al 1% agrupados en "Otras banderas / Otros tipos de negocio / Otros canales".
- Ancho = volumen (HDO: "está claro que estas líneas van a tener volumen y no precio"); el precio ponderado GO2 y GO3 del tipo de precio elegido va en el tooltip de nodos y flujos ("para saber cómo salieron los precios") y en las tablas.
- Colores: banderas con la paleta de marcas del mapa de estaciones; minorista ámbar, mayorista azul; tipos y canales en familias de un tono (retail ámbar, mayorista/transporte azul, agro verde, resto gris) con dos tonos por familia alternados por orden alfabético de la lista maestra (estables entre meses y filtros). Los flujos salen con el color del nodo de origen, como en el Tableau. Validado con el validador de la skill dataviz: en modo claro los pares vecinos pasan (el azul marino #1e3a8a del sitio queda fuera de la banda de luminosidad, es color de marca); en modo oscuro la paleta pastel del sitio deja algunos pares por debajo del umbral; la identidad fina la lleva siempre la etiqueta.
- Interacción (HDO: "la elección de cualquiera de las categorías dentro de un tótem marca en dónde vienen"): pasar el mouse por un nodo o un flujo apaga lo que no pasa por ahí e ilumina, en cada flujo, la parte proporcional que sí pasa (como los sub-ribbons del Tableau). **El clic en un nodo filtra (pedido de HDO del 29/09/2026, publicado ese día con el commit `feat(gas-oil): el clic en un nodo del Sankey filtra`):** antes dejaba la marca fija y HDO lo corrigió, porque al hacer clic en YPF quería ver aguas abajo solo el volumen de YPF y no el del mercado. Ahora el clic pasa la categoría al filtro de arriba de su tótem (Bandera, Canal de distribución, Tipo de negocio o Canal de comercialización), así que el diagrama, las tarjetas y las tablas quedan solo con lo que pasa por ese nodo, y el nodo queda con borde; otro clic lo suelta. HDO eligió que en el tótem del nodo elegido quede solo ese nodo (las demás categorías desaparecen mientras dura el filtro). Se pueden combinar clics en tótems distintos. Los nodos agrupados ("Otras banderas", "Otros tipos de negocio", "Otros canales") no filtran (`filtrable: false`, cursor normal). En `SankeyMercado.jsx` el clic avisa con `onNodo` y los nodos que son filtro llegan en `elegidos`; la lógica vive en `elegirNodo` de `EstructuraMercado.jsx`. Controles jul-2026 calculados por fuera y verificados: clic en YPF 379.250 m³ (Minorista 316.835, Mayorista 62.415, Al público 303.559, Agro 44.395); clic en Minorista 598.981 m³ (YPF 316.835, SHELL 121.717, AXION 66.071); YPF y Minorista 316.835 m³; clic en Agro 120.174 m³ (Mayorista 94.902, Minorista 25.272).
- Nombres de tipos de boca abreviados solo en las etiquetas del Sankey ("Bocas · Duales (líquidos + GNC)").
- Datos: celdas (bandera, cd, tn, cc) con volumen y sumas de precio; nodos con `celdas: Set`, enlaces con `celdas: Map(celda → m³)` para calcular la parte iluminada. Con los 8 filtros abiertos, jul-2026: 22 nodos, 60 enlaces.
- Ojo para probar con la herramienta del navegador de Claude: sus eventos de puntero no entran al SVG de recharts (ni por coordenadas ni por referencia); verificar disparando `mouseover`/`click` por DOM sobre `.recharts-sankey-nodes > .recharts-layer`. Con mouse real funciona.

## Minorista y mayorista, página de precios (sesión 2)

- Mismo bloque fijo y mismos 8 filtros, modo abierto. Cajas: **Resultado del relevamiento** (con Ambos: GO2 y GO3 minorista y mayorista con variación contra el mes anterior; con un solo canal: GO2, GO3, gas oil fósil o volumen, e importado CIF del mes), **Gráficos de precios** (abierto al entrar: GO2 y GO3 con una línea por canal de distribución; con precio sin impuestos, línea punteada del gas oil fósil por canal; rango 12 m/5 a/10 a/Todo en el encabezado), **Gas oil importado** (CIF y toneladas; no responde a los filtros del relevamiento), **Precio por canal** (mes elegido, canal de distribución × canal de comercialización, ignora los filtros de canal; clic filtra, otro clic suelta).
- Se sacaron las series de variación acumulada de los gráficos (con dos canales quedaban cuatro líneas más); la comparación minorista vs mayorista es el contenido del tablero BTB BTC.
- Control: jul-2026 sin impuestos GO2 minorista 1.629, mayorista 1.562; GO3 1.794 / 1.619 $/l; total 1.607 / 1.765; importado CIF 987 usd/ton, 100.193 t.

## Filtro Provincia multi-selección (sesión 4, 29/09/2026)

Pedido de HDO: en Precio surtidor, Estructura del mercado y Minorista y mayorista el filtro Provincia es un desplegable con casillas para tildar varias, no una sola. Ranking de precios no se toca.

- **Arranca con las 24 tildadas (todo el país)**, así que los números al entrar son los de siempre. Primero HDO había pedido arrancar sin cinco provincias y en la misma sesión lo cambió por esto.
- **Botones del desplegable, definidos por HDO: Todas / Sin Zona Fría / Ninguna.** "Sin Zona Fría" deja tildadas todas menos Neuquén, Río Negro, Chubut, Santa Cruz y Tierra del Fuego (19 de 24); vive en `SIN_ZONA_FRIA` (`relevamiento.jsx`). Cuando la selección es exactamente esa, el botón, los subtítulos y las tarjetas dicen "Sin Zona Fría".
- Con las 24 tildadas no hay filtro (todo el país). 'N/D' no está en el desplegable: no tiene volumen en toda la serie.
- Estado en `useRelevamiento`: `provincias` (Set de nombres), `cambiarProvincias`, `conProvincias` (hay filtro), `provIdx` (Set de índices o null, va en `claves`), `fProv`, `elegirProvincia` (clic del mapa), `baseProv` (la última selección prearmada que quedó tildada: Todas o Sin Zona Fría). Etiquetas: `etiquetaProvincias` (los nombres unidos con " + " hasta tres, "N provincias" si son más), `resumenProvincias` (texto del botón) y `ambitoProv` (el ámbito de los valores que sí responden al filtro).
- Desplegable: mismo componente que Tipo de negocio (`DropdownMulti`, con `acciones` = lista de selecciones prearmadas), panel `.go-prov-panel` de dos columnas que abre hacia la izquierda (es la última columna de la fila).
- Precio surtidor: las tarjetas "País" siguen siendo el país entero (ignoran el filtro) y las otras dos muestran el ponderado de la selección (con todas tildadas, bocas y volumen como siempre); el resumen de la caja y el total de la tabla por bandera siguen la selección. Mapa de provincias: las no elegidas quedan apagadas y **la escala de color se calcula solo con las elegidas**; borde marcado solo cuando hay una sola. Mapa de estaciones: encuadra el conjunto elegido.
- Clic en el mapa: desde la base (Todas o Sin Zona Fría) deja solo esa provincia; con una selección propia la suma o la saca; sacar la última o clic afuera vuelve a la base.
- Estructura y Minorista y mayorista: la tarjeta de volumen aclara la selección; en Minorista y mayorista con un solo canal las tarjetas dicen el ámbito real en lugar de "País" (antes decían "País" aunque hubiera provincia elegida).

Controles de jul-2026, calculados por fuera con Python sobre `gasoil_retail.json` y verificados en la página:

| Selección | Surtidor GO2 / GO3 ($/l) · bocas | Estructura m³ · minorista · al público | Sin impuestos minorista GO2 / GO3 | Sin impuestos mayorista GO2 / GO3 |
|---|---|---|---|---|
| Todas (24), al entrar | 2.269 / 2.463 · 3.609 | 824.846 · 72,6% · 65,5% | 1.629 / 1.794 | 1.562 / 1.619 |
| Sin Zona Fría (19) | 2.274 / 2.459 · 3.369 | 760.079 · 72,0% · 64,4% | 1.624 / 1.779 | 1.556 / 1.597 |
| Córdoba + Santa Fe | 2.291 / 2.474 · 815 | 207.090 · 67,0% · 54,8% | 1.639 / 1.788 | 1.514 / 1.516 |

## Minorista y mayorista: menú Precio / Volumen y página de volumen (29/09/2026)

Pedido de HDO: la pestaña Minorista y mayorista despliega un menú con **Precio** (la página de siempre) y **Volumen** (página nueva, "exactamente igual a la actual de precios solo que debe mostrar volúmenes", sin el filtro de tipo de precio). HDO aprobó el planteo antes de codear, con estos textos: título "Volumen minorista y mayorista" y bajada "Volumen de gas oil grado 2 y grado 3 vendido por el canal minorista y por el mayorista, con los mismos filtros que el precio en surtidor, y el gas oil importado."

- **Menú:** `SectionNav` acepta secciones con `menu: [{ id, label, ... }]`; esa pestaña es un botón que abre el menú (`PestanaMenu`) y no navega. El menú va en un portal sobre `<body>` con `position: fixed`, porque la fila de pestañas scrollea en horizontal (lo recortaría) y Safari ancla los fixed al `backdrop-filter` de la barra. Se cierra al elegir, al tocar afuera, con Escape y al scrollear. La pestaña queda marcada en las dos páginas. En `GasOil.jsx` cada ítem del menú es una página (`PAGINAS = SECTIONS.flatMap(...)`). Las otras nueve páginas que usan `SectionNav` no cambian (verificado en Mercado, Matriz, Gestión y Reforma).
- **Segundo nivel del menú (pedido de HDO del 29/09/2026):** "Volumen" no navega, despliega dentro del mismo panel sus dos páginas: **Resolución 1104** (la página de volumen, `/gas-oil/canales-volumen`) y **Tablas SESCO** (`/gas-oil/canales-sesco`, página vacía con el cartel "En preparación"). En `GasOil.jsx` un ítem del menú puede traer su propio `menu`; `PestanaMenu` abre con el grupo de la página actual ya desplegado. **HDO tiene que decir qué se muestra en Tablas SESCO**; hasta entonces no hay datos ni generador para esa fuente.
- **Qué volumen:** el que declararon las bocas y comercializadores que informaron precio en el mes, en m³ (`sumarCol` en `src/lib/gasoil.js`), el mismo de Estructura del mercado. **No es el total del mercado**: el generador deja afuera las filas sin ningún precio (`w` = volumen de las bocas con precio con impuestos), y el volumen baja cuando informan menos bocas. Corrección del 29/09/2026: al principio se le dijo a HDO "todo el volumen declarado, con o sin precio", y no es así. El total de mercado sale de las tablas SESCO.
- **Cajas:** Resultado del relevamiento (con Ambos: GO2 y GO3 minorista y mayorista en m³ con variación contra el mes anterior; con un canal: GO2, GO3, total e importado en toneladas), Gráficos de volumen (abierto al entrar; una línea por canal, eje desde cero, sin gas oil fósil), Gas oil importado (solo toneladas, en barras) y Volumen por canal (m³ de GO2, GO3, total y participación; clic en una fila filtra). En los meses con relevamiento un canal sin ventas vale 0; en los meses sin relevamiento no hay punto.
- **Filtros:** `BloqueFijo` y `FiltrosRelevamiento` aceptan `sinTipoPrecio`; la fila pasa a siete columnas (`.go-filtros-7`, dentro de `@media (min-width: 1101px)` para no pisar los cortes angostos). Con siete filtros y dos columnas, Tipo de negocio y Provincia caen a la izquierda y sus paneles abren hacia la derecha. `Tarjeta` acepta `sufijo` para la unidad.
- **Apertura por mes o por año (pedido de HDO del 29/09/2026):** en los tres gráficos, antes de los botones 12 m / 5 a / 10 a / Todo, va el selector Mensual / Anual, como en Precio surtidor. El año suma todos sus meses relevados; el rango solo define desde qué año se muestra. El año en curso va marcado ("2026*" en el eje, "* 2026: ene a jul" en la leyenda y en el tooltip) porque está incompleto. Las tarjetas y la tabla siguen siendo del mes elegido. Controles anuales calculados por fuera y verificados: GO2 minorista 2022 5.601.181 m³, 2025 4.145.922, 2026 (ene a jul) 2.377.898; GO3 minorista 2025 2.619.340; importado 2022 4.138.990 t, 2025 1.132.765 t. La página de precios no tiene esta apertura: no se pidió y el anual de precios necesita definir cómo se promedia el gas oil fósil y el CIF.
- **Estaciones relevadas en los gráficos (pedido de HDO del 29/09/2026, para entender los pozos del volumen):** cada gráfico de grado trae en barras grises la cantidad de estaciones relevadas del mes, sobre el **eje izquierdo** (así lo pidió HDO); el volumen pasó al eje derecho. Estación relevada = boca distinta con volumen de ese grado, contada una sola vez. En la apertura anual va el promedio mensual del año. Responde a los mismos filtros que el volumen; con operador o estación se cuenta directo sobre los datos por boca.
- **De dónde sale el conteo:** `scripts/gasoil_estaciones.py` agrega cuatro columnas al cruce fino (`public/data/gasoil_retail.json`, que pasó de 8,7 a 10,1 MB): `q2` y `q3` = bocas con volumen en la celda (se usan con un canal de comercialización elegido); `p2` y `p3` = lo mismo contando cada boca una sola vez por mes, en la celda donde más vende (se usan con todos los canales: 506 de las 4.228 bocas de jul-2026 venden por más de un canal). `regenerate_gasoil.py` lo llama antes de escribir el cruce; solo, recalcula las columnas sobre los archivos ya generados sin necesitar `/Volumes/comun`. Validado contra un conteo directo de bocas distintas en los archivos por mes (total, minorista, mayorista, YPF y solo al público, en cinco meses): coincide en todos. **La columna `e2` no sirve para contar estaciones**: sumada entre celdas da 5.060 en jul-2026 contra 4.228 bocas distintas.
- Controles de estaciones (GO2 / GO3): jul-2026 4.019 / 3.939; jun-2026 3.922 / 3.853; dic-2024 3.944 / 3.814; ene-2025 669 / 616; solo al público jul-2026 3.597 / 3.677; Sin Zona Fría jul-2026 3.765 / 3.663; Automóvil Club Argentino jul-2026 127 / 137 y ene-2025 0 (no informó); promedio mensual 2025 3.738,7 / 3.665,2.
- Como los volúmenes son totales, con provincias elegidas las tarjetas y el resumen de la caja lo dicen ("Minorista · grado 2 · Sin Zona Fría").
- De paso: en la página de precios la última fecha del eje quedaba cortada 2 px; se amplió el margen derecho de esos gráficos.

Controles de jul-2026 calculados por fuera con Python y verificados en la página: GO2 minorista 364.828 m³ (-3,9% contra jun), GO2 mayorista 179.341 (+4,0%), GO3 minorista 234.153 (-7,9%), GO3 mayorista 46.524 (-3,1%), total 824.846 (igual a Estructura); solo minorista 598.981 (-5,5%); Sin Zona Fría 339.544 / 171.061 / 207.632 / 41.842; importado 100.193 t (-31,3%); tabla de 20 filas, Minorista al público 310.888 + 223.333 = 534.221 (64,8%).

**Meses incompletos en la fuente:** en volumen se ven como pozos y las barras de estaciones los explican. Ene-2025: 330.107 m³ contra 859.503 de dic-2024 y 817.111 de feb-2025, con 690 bocas distintas contra 4.117 y 4.047. Ene-2017: 213.037 m³ contra 1.112.066 (la SE no publicó el minorista). Mar y abr-2026 vienen con menos bocas (3.211 y 3.088 contra unas 4.100). En precios casi no se nota porque el ponderado sigue siendo representativo. Ojo: en el primer aviso a HDO se le dijeron 1.147 bocas contra unas 5.000; esas cifras salían de sumar `e2` y contaban de más.

## Tablas SESCO (sesión 5, 30/09/2026): `/gas-oil/canales-sesco`, "Ventas de combustibles"

Definida por HDO en la sesión 5, de a un pedido por vez, y publicada en `ec2993f`. Componente `src/components/gasoil/TablasSesco.jsx` (con su propio bloque fijo; no usa `useRelevamiento`), generador `scripts/gasoil_sesco.py` (lo llama `regenerate_gasoil.py`; solo, necesita `/Volumes/comun`).

- **Fuente:** `Mercado Argentino Derivados Petroleo Table.hyper`, que sale de la tabla dinámica de la SE "Ventas, (excluye ventas a empresas del sector)" (`TD_Ventas_mercado.xlsx`): son ventas netas de transferencias entre empresas del sector. Unidades de la SE, leídas de la tabla dinámica: m³ los líquidos; toneladas asfaltos, butano, coque, fuel oil, grasas, mezclas IFO y propano; miles de m³ los gases. Quedan afuera los crudos ("Cuenca ...", "Crudo importado"). Cifra ancla: jul-2026 gas oil grado 2 + 3 de todos los sectores = 1.260.883 m³ (el generador aborta si no da).
- **Apertura (la misma que Resolución 1104, opción A de HDO):** minorista = sector Al Público, mayorista = los demás. Siete filtros: Mes, Producto (casillas, abre con gas oil grado 2 y 3), Canal de distribución, Sector (casillas; abre **sin** Bunker Cabotaje, Bunker Internacional ni Usinas Eléctricas, botones Todos / Sin bunker ni usinas / Ninguno), Empresa (casillas), Provincia (como en las otras páginas) y Unidad (m³ / ton / bbl / gal: solo la siguen el gas oil, con densidad 0,845, y el biodiésel, 0,885; 6,2898 bbl y 264,172 gal por m³; los demás productos quedan en su unidad y solo se suman los de la misma unidad).
- **Cajas (cinco):** Resultado del mes (tarjetas), Corte obligatorio vs. real, Gráficos de volumen, Gas oil importado y Tablas de volumen. Abren todas menos la del importado.
- **Tarjetas:** dos filas de cuatro: Minorista y Mayorista de GO GR2 y de GO GR3; GO Import, GO Total · GR2 + GR3, Biodiésel y Corte real (con el cumplimiento adentro). Selector Mes / Año: por mes trae además el acumulado del año y los últimos 12 meses, cada uno contra el mismo tramo de un año antes; por año, el año del mes elegido (en curso: enero al último mes) contra los mismos meses del año anterior. Números en Km³ / MMm³ (o Kton, MMbbl, MMgal); el entero al pasar el mouse. Rótulos cortos pedidos por HDO: GO GR2, GO GR3, S/Zona Fría, GO Import. Sin recuadro exterior.
- **Corte real y cumplimiento (definición de HDO, con vuelta atrás incluida):** corte = biodiésel vendido para el corte / gas oil grado 2 + 3 del país sin bunker ni usinas, en m³, **sin sumar el importado y con la Zona Fría adentro** (HDO pidió sacarla y lo revirtió el mismo día por el art. 11 de la Res. SE 689/2022: lo exceptuado se compensa en otras regiones; sin Zona Fría 2025 daría 6,60% en vez del 5,79% publicado). Cumplimiento = corte real / corte obligatorio; para un período, el obligatorio de cada mes ponderado por su gas oil. El biodiésel sale de `corte.json` (país) y de `petroleras.json` (compras por petrolera) del tablero de biodiésel, vía `BIO_MENSUAL`, `BIO_PETROLERAS` y `CORTE_OBLIGATORIO` en `src/lib/gasoil.js`. El corte sigue solo al filtro de empresa (nombres SESCO → nombres del biodiésel en `empresa_bio` del JSON); con provincia, sector o canal filtrados, la tarjeta avisa que no los sigue. En 21 meses la suma por petrolera no da igual al total país (abr-2017, 12.310 m³; el resto menos de 50): con "Todas" se usa el total país.
- **Gráficos:** uno por producto (hasta cuatro; con más, solo la suma) y el de la suma con la línea Total además de minorista y mayorista; Mensual / Anual y 12 m / 5 a / 10 a / Todo. Gas oil importado en barras, en la unidad elegida. En todos los gráficos de esta página el control va debajo del título, a la izquierda (`.go-sesco .chart-card-header`).
- **Tablas:** por sector, por empresa, por provincia (mes elegido; clic en una fila deja solo esa categoría, otro clic vuelve a la base) y por período (misma serie que los gráficos, minorista / mayorista / total por producto).
- **Controles verificados contra la base con Python** (jul-2026, sin bunker ni usinas, todas las empresas): GO2 minorista 369.136 / mayorista 446.438; GO3 240.773 / 98.167; total 1.154.514; todos los sectores 1.260.883; Sin Zona Fría 1.014.066; YPF 662.058; Córdoba + Santa Fe 278.288; naftas 2 + 3 788.272; importado 100.193 t = 118.572 m³; biodiésel 82.424 m³; corte 7,14% y cumplimiento 95,19%; acumulado ene a jul 2026 8.018.326 m³, corte 6,83%, cumplimiento 91,11%; 12 meses 13.845.769 m³, 6,05%, 81,06%; año 2025 13.579.693 m³, 5,79%, 77,68%; YPF jul-2026 corte 7,62%, cumplimiento 101,60%. En toneladas el total de jul-2026 da 975.565, en bbl 7.261.664, en gal 304.990.340. Scripts de control en el scratchpad de la sesión (`sesco_controles*.py`), no en el repo.

## Corte obligatorio vs. corte real (`src/components/gestion/CorteRealChart.jsx`, sesión 5)

Es el gráfico de Gestión y cupo, ahora reutilizado en Tablas SESCO con `datos` (serie de las empresas elegidas) y `detalle`; sin props sigue mostrando `corte.json`. Lo agregado el 30/09 aplica a las dos páginas:

- Con "Gestiones": tres filas arriba del gráfico alineadas con el área de trazado (presidente, secretario/a de Energía, subsecretario del área de hidrocarburos; `SECRETARIOS`, `SUBSECRETARIOS` y `funcionarioDe` en `src/lib/gestiones.js`, con el egreso más alto tratado como "en funciones"). Clic en cualquiera (o en la zona de un presidente dentro del gráfico) deja solo su período; otro clic o "Ver todo el período" vuelve. Nombres: completo, apellido o iniciales según entre; el tooltip trae cargo, nombramiento, fechas y promedios. Vista anual: cada año se asigna al funcionario de junio (las gestiones cortas no aparecen ahí).
- La fila de presidentes lleva el color de la presidencia como fondo muy claro: celeste FPV y FDT, amarillo Cambiemos, violeta LLA (`COLOR_PRESIDENCIA`; `celeste` y `violeta` nuevos en la paleta de `theme.jsx`). HDO no quiere líneas de color en las filas.
- "Promedio": corte real promedio de cada presidencia (biodiésel / gas oil de todo el período) en punteado con el color de la presidencia; con un funcionario elegido, el de su gestión. "Cumplimiento": lo mismo con el cumplimiento promedio (biodiésel / mandato del período), punteado fino sobre el eje derecho, sin la línea del 100%. HDO: "el cumplimiento es siempre el promedio del cumplimiento de la gestión de que se trate". Controles (todas las empresas): CFK 7,20% y 92,3%; Macri 9,37% y 93,7%; A. Fernández 4,91% y 65,2%; Milei 6,18% y 82,6%; Aranguren 9,58% y 95,8%; Popik 9,53% y 95,3%.
- El eje izquierdo llega a 12% y crece de a 3 puntos si una empresa mezcló más.

## Sankey: Resaltar / Filtrar (sesión 5)

Selector "Clic: Resaltar | Filtrar" junto al de grados (abre en Filtrar). Resaltar deja fija la marca del mouse como en Tableau: el mercado sigue entero, cada nodo muestra cuánto de su volumen pasa por lo elegido (m³ y % del nodo; en nodos angostos solo el %), el nodo fijo va con borde punteado y el mouse no cambia nada hasta otro clic (corrección de HDO). Filtrar es lo del 29/09. Los flujos también se clickean: en Resaltar fijan su recorrido; en Filtrar pasan sus dos puntas a los filtros. `SankeyMercado` recibe `modo`, `celdaVol` y `onEnlace`; el tooltip agrega "En la marca". Controles con YPF resaltada en jul-2026: Minorista 316.835 de 598.981 (52,9%), Mayorista 62.415 de 225.865 (27,6%), Agro 44.395 de 120.174 (36,9%), Al público 303.559 de 540.566 (56,2%).

## Decisiones de las sesiones 2 y 3 a validar con HDO

1. Defaults del modo abierto: ambos canales, todos los tipos y canales, precio **sin impuestos** en $/l (en el commit `1a1190c` Minorista y mayorista arrancaba en surtidor, minorista, al público).
2. Estructura: el selector de grado vive en el encabezado del Sankey, no en la fila de filtros (en el Tableau "Producto" es un filtro arriba, pero ahí incluye crudos y aceites que HDO descartó: "el crudo medanito va a ser cualquier cosa"); las tablas ignoran su propio nivel.
3. Sankey: colores por familia de un tono (no la paleta de 20 colores del Tableau) y el resaltado por proporción de cada flujo; alto fijo de 620 px.
4. Minorista y mayorista: dos líneas (minorista y mayorista) por gráfico en lugar de precio + variación acumulada; gas oil fósil como punteado por canal; la tabla por canal ignora los filtros de canal.
5. Ranking de precios queda sin el bloque fijo (HDO lo pidió así).

## Pendientes técnicos (sin apuro)

Las definiciones que esperan a HDO están arriba, en "Cómo retomar".

1. Tooltip de estación cerca del borde superior queda tapado por el bloque fijo: abrirlo hacia abajo.
2. Validar con HDO el precio 963 usado en "gas oil fósil" (categoría mediana) y la densidad 0,845.
3. Sacar del generador los bloques `canales`, `flujos` y `eess` de `gasoil_precios.json` (ya no se leen; 737 KB en git en cada regeneración).
4. Hacer estable el orden del índice de bocas del generador (ver "El generador no es estable entre corridas", abajo).
5. El Excel de regalías lo actualiza un programa que escribe AÑO y MES como fórmulas sin resultado guardado: cada vez que agregue filas, Prep las va a descartar hasta que alguien abra y guarde el archivo en Excel. Arreglo de raíz: que el programa escriba el año y el mes como valores. HDO está avisado; no se tocó.
6. En `docs/` hay archivos sin trackear de sesiones anteriores (PDF infografía, transcripciones Senado, video CEPREB v8), y `.gitignore`, `CLAUDE.md` y el docx de la locución v8 tienen cambios sin commitear de otras sesiones: HDO no dijo si entran.
7. Chunk `GasOil` 171 KB (51 KB gz); el resto va por fetch.
8. Al pasar de un año, `corte.json` y `petroleras.json` (tablero de biodiésel) tienen que llegar al mismo mes que SESCO; si el biodiésel se queda atrás, las tarjetas de biodiésel y corte de ese mes muestran "-".

## Sesión 4 (29 y 30/09/2026): qué se hizo y por qué

Todo publicado. El detalle de cada página está en su sección; acá queda lo que no entra en ninguna.

- **Filtro Provincia multi-selección.** HDO vio la primera versión ("está perfecto"), pidió el arranque con todas y los botones Todas / Sin Zona Fría / Ninguna, y ordenó publicar. Quedaron avisadas y sin objeción: tarjetas "País" + selección en Precio surtidor, escala de color del mapa solo con las elegidas, mapa de estaciones acercado a la selección y clic en el mapa con vuelta a la base.
- **Filtros en pantallas angostas.** Una regla repetida de `.go-filtros` en el bloque "Operador: caja de búsqueda con lista" de `GasOil.css` pisaba las `@media` de 1100 y 720 px y los ocho filtros quedaban apretados en una fila. Se sacó la regla: hasta 1100 px son dos filas de cuatro filtros y hasta 720 px cuatro filas de dos; arriba de 1100 px la fila única no cambia. El panel de Tipo de negocio abre hacia la izquierda hasta 1100 px (queda en la última columna) y hasta 720 px los paneles no pasan del ancho de la pantalla y sus textos bajan de línea. Medido en 1440, 1100, 1000, 721, 720 y 390 px en las tres secciones, sin scroll horizontal. **El bloque fijo (`.go-sticky`) queda pegado solo desde 1101 px** (antes, desde 721): con los filtros en dos filas medía entre 435 y 470 px y dejaba unos 270 px para el contenido en una pantalla de 800 de alto; HDO aprobó soltarlo hasta 1100 px, donde ahora se va con la página y quedan unos 700 px. Los desplegables siguen pintándose por encima del contenido con el bloque suelto.
- **Sankey, clic que filtra.** Detalle en la sección del Sankey.
- **Pestañas, menú Precio / Volumen y página de volumen.** Detalle en sus secciones. Falta el contenido de Tablas SESCO.
- **Meses incompletos en la fuente.** Resuelto con las barras de estaciones relevadas y la nota al pie de la página de volumen.
- **Brent y WTI de 2026 (resuelto y publicado el 30/09/2026).** El 29/09 el generador abortaba con "Master data: 'brent' sin dato desde 2026-05 (último: 2025-12)". Causa: las columnas BRENT y WTI de `Master data database.hyper` salen de la hoja "Tabla precios (2)" de `EXP MKTSCAN - DATASOURCES/Revision Actual/Informe Regalias CRUDO.xlsx`, y el flujo de Prep arma la fecha con `MAKEDATE([AÑO],[MES],1)`. AÑO y MES son fórmulas; en la versión del 7/9 las ocho filas de 2026 no tenían el resultado guardado (el archivo lo había escrito un programa, no Excel), así que el flujo del 23/9 descartó todo 2026. HDO guardó el Excel desde Excel el 30/9 (ya trae los valores) pero no corrió el flujo de Master data, y autorizó a tomar del informe los meses que falten. Hecho en `regenerate_gasoil.py`: `extraer_regalias()` lee Brent y WTI del informe usando las columnas "a" y "m" (valores, no fórmulas) y `completar_con_regalias()` agrega solo los meses posteriores al último dato de Master data, sin pisar nada; el ranking muestra la nota "ene 2026 a ago 2026 del informe de regalías de crudo de la SE; los dos últimos meses son provisorios". Cuando HDO corra el flujo de Master data, la base va a traer esos meses y el generador deja de usar el informe solo.
- **Regeneración del 30/09/2026 (publicada ese día por orden de HDO).** Se corrió `scripts/regenerate_data.py` completo. Biodiésel: sin cambios de contenido, salvo `evidencia.json` (retenciones de sep y oct-2026, 22,5%) y tres valores que cambian 0,1 por redondeo en `petroleras.json` y `go_sectores.json`. Gas oil: `gasoil_ranking.json` con Brent y WTI hasta ago-2026 y junio corregido (Brent 648,21 → 526,70; WTI 610,60 → 507,37), más TC, CPI, 963 y aceite al día. **Cambia el ranking publicado:** con base ene-2024 y mes jul-2026, Brent pasa de +20,3% (tomaba jun-2026 provisorio) a -2,7%, y WTI de +21,6% a -1,0%; el resto de las filas queda igual. Se le avisó a HDO antes de publicar y ordenó subirlo.
- **El generador no es estable entre corridas** (la base no devuelve las filas en el mismo orden): con la misma fuente, los 295 archivos por boca y por mes salían con las mismas filas en otro orden, 57 de las 170.504 celdas del cruce cambian 1 centavo por redondeo y 16 de las 7.310 bocas (sin coordenadas, con varias localidades) cambian de localidad en el índice. Para no ensuciar el repo con 126 MB que no son datos, el generador ahora no reescribe un archivo por boca o por mes si trae las mismas filas (`mismas_filas`); los del 30/09 se restauraron desde git tras verificar los 295.

## Método de revisión por video (funciona bien)

HDO graba su pantalla con voz (`Cmd+Shift+5`, micrófono en Opciones) y deja el .mov en `docs/`. Transcribir con Whisper local:
`~/Explora_projects/_herramientas/whisper/.venv/bin/python ~/Explora_projects/_herramientas/whisper/transcribir.py "docs/<archivo>.mov" --fotogramas 10`
(ojo: el nombre de macOS trae un espacio especial antes de "AM"; resolverlo con glob o copiar a `docs/grabacion_<fecha>.mov`). Deja `<nombre>.transcripcion.md` y `<nombre>.fotogramas/` (leer los PNG con Read). `docs/*.mov` y `docs/grabacion_*` están en `.gitignore`. Lanzador: `Iniciar/Transcribir grabacion.command`.

## Verificación

Dev: `Iniciar/Marketscan.command` (puerto 5273; si está ocupado, Vite toma otro) → http://localhost:5273/gas-oil (abre Estructura Mercado; Precio surtidor está en `/gas-oil/surtidor`). Build: `npx vite build`. Para probar con datos: esperar la carga del retail (10 MB); operador de prueba: "AUTOMOVIL CLUB ARGENTINO" (134 estaciones, 127 con precio en jul-2026).
Ojo en dev: el recargador en caliente de Vite tira "Maximum call stack size exceeded" (react-refresh recorre los 5.333 `<option>` del datalist de operadores) después de editar un archivo de la página; es solo de desarrollo, no afecta el build: recargar la página después de editar.

**Capturas a un ancho fijo.** El panel del navegador de Claude escala mal cuando emula un ancho mayor que el propio. Para sacar capturas a 1440, 1000 o 390 px y leer valores de la página sirve `~/.cache/explorarg/captura-web/captura.mjs` (Chrome sin ventana por CDP, fuera del repo):
`node --experimental-websocket ~/.cache/explorarg/captura-web/captura.mjs <url> <salida.png> <archivo.js> [ancho] [alto]`
El archivo .js es una expresión `(async () => { ... })()` que se corre en la página antes de la captura (abrir un menú, hacer clic en un nodo, leer tarjetas); lo que devuelve se imprime como JSON. Ojo en zsh: las variables no se parten en palabras, pasar ancho y alto como argumentos separados.

**Números de control.** Conviene calcularlos por fuera con Python sobre `public/data/gasoil_retail.json` antes de tocar la página y compararlos después; es lo que pide HDO ("rigor con los números"). Las tablas de control de este documento son de jul-2026.

## Primer prompt para retomar

```
Retomamos la página Mercado de Gas Oil (/gas-oil) del sitio explorarg-marketscan.

Antes de hacer nada, leé completo HANDOFF_GAS_OIL.md, que está en la raíz del repo. Ahí está el estado, los datos, las decisiones de cálculo, los números de control y lo que quedó pendiente. Está todo publicado al 30/09/2026 (último commit de gas oil: ec2993f, sesión 5: Tablas SESCO, corte por gestión y Sankey resaltar / filtrar).

Te voy a seguir pasando pedidos de a uno, sobre Tablas SESCO, el Sankey de Estructura o lo que surja. Con cada uno, primero decime qué entendiste y de qué base saldrían los datos, y recién después codeá.

Reglas de siempre: commits y pushes solo cuando yo lo ordene; guion corto, nunca raya larga; verificá los números contra un cálculo hecho por fuera de la página y mostrame el resultado en imagen.
```
