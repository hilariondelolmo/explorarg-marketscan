# HANDOFF - Compras al cupo (`/mercado/compras-cupo`) y Ventas al cupo (`/mercado/ventas-cupo`)

Sesión del 12/10/2026. Réplica en el sitio del dashboard **EXPLORA QS BUYER (3)**
("Domestic quota sales - buyers") del libro Tableau
`02 MARKET & INDUSTRY- MERCADO INTERNO BIODIESEL.twb` (solapa 9 del story
publicado en ferozo; HDO pidió no embeber el Tableau por ahora). Encargo en el
video `~/Explora_projects/Detalle de ventas - compras al cupo.mp4` (transcripción
y fotogramas al lado del archivo).

## Cómo retomar

1. Pararse en `~/Explora_projects/explorarg-marketscan`, `npm run dev` (puerto 5273)
   y abrir `http://localhost:5273/mercado/compras-cupo`.
2. Leer este archivo y el componente `src/components/mercado/ComprasCupo.jsx`
   (el comentario de cabecera resume las decisiones).
3. Primer prompt sugerido: "Retomo Compras al cupo (HANDOFF_COMPRAS_CUPO.md).
   Estado: publicada en d1dc1b6 con dos tandas de devolución aplicadas.
   Pendientes: lo que HDO pida sobre la página, el tutorial en video y la
   nota sobre Patagonia"." 

## Ventas al cupo por elaboradora (misma sesión, después de publicar Compras)

Encargo en el video `~/Explora_projects/Ventas al cupo.mp4` (transcripción y
fotogramas al lado): "exactamente lo mismo, desde el punto de vista del
vendedor", réplica del dashboard **EXPLORA QS SELLER** del libro 02. Es el
mismo componente `ComprasCupo.jsx` con `vista="ventas"` (`VentasCupo.jsx` es
un envoltorio), pestaña "Ventas al cupo" después de "Compras al cupo".
Diferencias:
- **Tabla**: una fila por grupo económico (toneladas y participación en el
  total del período) y, con la flecha, sus elaboradoras (segundo nivel).
  Sin petroleras en la tabla (HDO, 12/10/2026: "lo único que tiene que haber
  es grupo económico / elaboradora; las petroleras se ven en el treemap y el
  mapa"). Clic en grupo, elaboradora, período o celda acota los gráficos.
- **Treemap** "A quién le vendió cada uno": baldosa = grupo económico (o la
  elaboradora elegida) × petrolera, agrupado y coloreado por petrolera;
  porcentajes = parte de las ventas del vendedor a esa petrolera · parte de
  las compras de la petrolera que vino de ese vendedor.
- **Mapa**: gajos por petrolera. **Tablas gemelas**: la derecha por petrolera.
- **Colores por petrolera**: `COLORES_PETROLERA` en coloresComprasCupo.js
  (doce fijos, validados en claro y oscuro con el mismo buscador, matices
  cercanos a las banderas del sitio: YPF azul, Raizen oliva, Axion violeta,
  Trafigura rojo…), grises para las chicas.
- Estado: verificada en Chrome (claro, oscuro, interacciones) y **publicada
  en el commit `1cacca3`** (12/10/2026, push a main → Vercel).

## Estado de Compras al cupo

**Publicada en el commit `d1dc1b6` (12/10/2026, push a main → Vercel).**

- Pestaña **Compras al cupo** en el grupo "Detalle de ventas" de `/mercado`,
  después de "por Grupo Económico / Empresa" (`src/pages/Mercado.jsx`,
  sección `compras-cupo`, `encabezadoPropio`).
- Verificada en Chrome (escritorio claro y oscuro, celular 390 px, Playwright
  sobre el Chrome local, sin errores de consola), en el navegador de la app y
  en Safari del simulador de iOS (iPhone 15 Pro). `npm run build` pasa.

## Qué hay en la página

Fila de filtros fija al scrollear (`.mz-controles-sticky`): **Año** (último
año con datos por defecto), **Presidencia** (dic a nov de cada mandato,
recortado a los meses con datos, como en Gas Oil; elegir uno suelta al otro),
**Provincia**, **Categoría** (integrada / no integrada / comercializadora),
**Cámara** y **Grupo económico** (desplegables de casillas; se guardan los
valores destildados, así lo nuevo entra tildado).

Disposición (devoluciones de HDO del 12/10/2026): la tabla a todo el ancho;
debajo, el treemap (55 %) y el mapa (45 %) lado a lado con los títulos a la
misma altura; al pie
un solo "Ver como tabla" que abre las dos tablas gemelas lado a lado; sin
leyenda de colores (los nombres van en las baldosas).

1. **Tabla petrolera × columna**: filas = petroleras con más de 10 t en el
   período, ordenadas por total. Con un año, columnas año > trimestre > mes;
   con una presidencia, año > semestre (S1 / S2), así el mandato entero
   entra en la tabla (pedido HDO). Más la columna Total. Celda = toneladas y
   participación de la petrolera en la columna. Clic en petrolera,
   año, trimestre, mes o celda acota el treemap y el mapa (otro clic suelta;
   botón "✕ ver todo"). El elegido va en turquesa (`--accent-brand`).
2. **Mapa** "De qué provincias sale": SVG propio (mapa_argentina.json, misma
   proyección que Plantas), una torta por provincia (tamaño = participación
   de la provincia, gajos = grupos), rótulo con nombre, t y % en un cartel
   claro (cajita del color del fondo, casi opaca, borde fino, texto en
   tinta): el borde blanco no se leía y el bloque negro resultaba invasivo
   (HDO). Al pasar por un gajo
   se ve ese grupo solo; al pasar por la provincia, fuera de la torta, se ven
   todos sus grupos. Anclas de las tortas en `ANCLA_TORTA`; encuadre
   automático a las provincias con ventas. (HDO probó una vista de barras
   por provincia y la descartó: eliminada.)
3. **Treemap** "Quién le vendió a quién" (55 % del ancho): baldosa =
   elaboradora × petrolera, agrupadas por grupo económico (color fijo por
   grupo), tamaño = toneladas. Etiqueta: grupo - empresa / petrolera / t /
   `a% · b%` con a = parte de las ventas de la empresa que fue a esa
   petrolera y b = parte de las compras de la petrolera que vino de esa
   empresa (decisión HDO; en el Tableau el segundo porcentaje daba siempre
   100%). Tooltip. Layout squarified propio (sin Recharts).
4. **Ver como tabla** (al pie): las dos tablas gemelas, "Quién le vendió a
   quién" y "De qué provincias sale", lado a lado.

## Datos

- `src/data/compras_cupo.json` (170 KB), generado por
  `scripts/regenerate_data.py` (`agregar_compras_cupo`): `meses`, `empresas`,
  `petroleras` y `ventas = [[mes, empresa, petrolera, ton] …]` con índices
  sobre las tres listas (9.726 ventas, 2008-01 a 2026-08). Los atributos de
  cada elaboradora (categoría, grupo, provincia, cámara) salen de
  `empresas.json`, así que taxonomía y alias son los del sitio (Grupo
  Pucciariello, Grupo Bolzán, Diferoil y Colalao dentro de Bojanich, ENRESA,
  RAIZEN (ex SHELL), ESSO/AXION partidas en 2018-03, Patagonia INTEGRADA).
- Fuente: columnas por petrolera de `Detalle Biodiesel Argentina.hyper`
  (la misma apertura que la hoja "Detalle de BIODIESEL OIL CO" del Excel
  maestro que usa el Tableau). La suma por petrolera coincide mes a mes con
  las ventas de cupo (QUOTA SALES, que ya traen el COTAB de jun-nov 2022: la
  fuente no abre el COTAB por petrolera, se avisa al pie cuando el período
  lo toca).
- Controles del pipeline: se omiten las empresa-mes con apertura por
  petrolera pero sin ventas de cupo (Cargill abr-2017, 10.894 t en la columna
  Diverse Fuels, y Cofco ene-2023, 270 t: errores de carga del maestro; la
  hoja OIL CO del Tableau tampoco los tiene); unas 30 empresa-mes de
  2010-2011 difieren en pocas toneladas (se informan como advertencia, los
  totales mensuales cierran); aborta si un empresa-mes difiere más de 10% y
  500 t o si un mes no cierra.
- Al regenerar, los demás JSON solo cambian el sello `meta.generado` (y un
  redondeo de 0,1 t en `petroleras.json` / `go_sectores.json`); en esta
  sesión se devolvieron a HEAD para que el diff quede en lo nuevo.

## Verificación contra el Tableau (video, año 2026)

Coinciden celda por celda (YPF ene 36.454 / 57%, total ene 63.801…) salvo
**Petrolera Degab S.A.**, que el Tableau deja afuera: su pivot de OIL
COMPANIES no incluye la columna `PETROLERA DEGAB S.A.` (son 316 t en 2026;
los totales del Tableau quedan 30-66 t por debajo cada mes). Avisado a HDO.

## Colores

`src/components/mercado/coloresComprasCupo.js`: un color fijo por grupo
(dieciséis, claro y oscuro) buscados en OKLCH con la matemática del
validador de la guía dataviz (`buscar.mjs` en el scratchpad de la sesión) y
validados en los dos temas; matices análogos a los del Tableau (Bojanich
azul, Cremer verde, Rosario Bio dorado, Bolzán naranja, AOM violeta…). Los
grupos sin color propio (los que dejaron de operar) van en grises. La
identidad fina la lleva siempre la etiqueta.

## Pendientes

- Nueva devolución de HDO sobre la página (aplicadas dos tandas: barras
  eliminadas, un solo "Ver como tabla", sin leyenda, mapa gajo a gajo; tabla
  a todo el ancho con treemap y mapa debajo, rótulos del mapa en cajita,
  semestres en Presidencia).
- Decidir si se avisa en la página que Patagonia cuenta como integrada (en el
  Tableau figura como grande no integrada; con "Todas" las categorías el
  resultado es el mismo).
- Tutorial en video de la pestaña (scripts/tutorial) cuando HDO la apruebe.
- Corregir en el Tableau el pivot sin Petrolera Degab (lo decide HDO).
