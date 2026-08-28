# Handoff · Láminas A3 de la Propuesta S-0809/2026

Traspaso de la sesión del 25/08/2026 (HDO + Claude). Serie de láminas A3
apaisadas, una por artículo fundamentado de la propuesta de ley de
biocombustibles, revisadas página por página con HDO. **Nada está
commiteado: HDO decide los commits (Vercel publica cada push).**

## Qué es y dónde vive

- **Ruta** `/impreso-a3` — [src/pages/ImpresoA3.jsx](src/pages/ImpresoA3.jsx)
  y [src/pages/ImpresoA3.css](src/pages/ImpresoA3.css). Registrada en App.jsx.
- Cada lámina: cabecera (número gigante Sinkin 800, título Inter 800 21pt,
  bajada tomada del cuadro de correspondencia del informe, kicker y folio)
  + tres franjas de **ancho fijo**: el artículo (148mm, 2 columnas,
  modificaciones en rojo subrayado) · normas que viola el proyecto oficial
  (violeta, 86mm) + justificación (rojo) · respaldo en datos (verde, resto).
- El contenido sale del mismo blob de la web
  (`src/content/propuesta-s80926pl.html`); los gráficos son los componentes
  Recharts reales montados por portal sobre los `.pl-chart`. La lámina
  fuerza tema claro.
- Los 25 artículos sin informe van en una lámina final de texto corrido.
- **PDF**: `python3 scripts/generar_laminas_a3.py` →
  `output/pdf/propuesta_laminas_a3.pdf` (A3 apaisado 1:1). El script usa el
  dev server que encuentre (5273/5173/5297, detección por HTTP — el server
  puede escuchar sólo IPv6) o levanta uno propio.

## Mecánica interna (ImpresoA3.jsx)

- `parsearLaminas()` parsea el blob una vez. Pre-procesos globales ahí:
  la infografía de integradas se **muda del popup del 5 al 6**, y la
  oración "La facultad abierta de reducir el corte…" se muda del respaldo
  del 12 al cierre de su justificación.
- **`AJUSTES_DATOS`**: un handler por artículo con los retoques pedidos por
  HDO (reordenar piezas, `remove()` de charts, marcar `a3-span` /
  `a3-figura-grande` / `a3-pagina-propia`, partir párrafos por frase).
  TODO retoque por lámina va acá, nunca en el contenido fuente.
- **Derrame**: las franjas son fijas; a los ~500ms (con los charts ya
  montados) se mide el DOM y lo que excede cada franja pasa a una hoja
  `· continuación` con la misma grilla (`derramarLamina`), con segunda
  pasada si la continuación también excede. `a3-figura-grande` = derrama
  siempre a la continuación compartida; `a3-pagina-propia` = hoja exclusiva.
  `.a3-grupo` = piezas que viajan juntas (p.ej. párrafo + cuadro de
  eficacia del 12).
- `PETROLERAS_14`: lista blanca de filas del cuadro "Ventas de gas oil y
  compras de biodiesel" (se filtra post-montaje, antes de medir).

## Reglas acordadas con HDO (no romper)

1. **Anchos de franja idénticos en todas las láminas**; el artículo siempre
   a 2 columnas.
2. **Los textos del respaldo en datos SIEMPRE en una sola columna** (regla
   global en CSS: `.a3-datos-cuerpo > p { grid-column: 1 / -1 }`).
3. **Jamás achicar la letra** para hacer entrar contenido — sólo espaciados
   y reubicaciones; si no entra, derrama o se elimina la pieza (lo decide
   HDO).
4. La línea vertical separa el artículo del análisis (no las dos columnas
   del texto legal), centrada en el canal y arrancando a la altura del
   texto.
5. Títulos de lámina en Inter 800 (index.html carga el peso 800).
6. Las eliminaciones (gráficos, párrafos, filas) son **sólo de la lámina**;
   la web queda intacta.

## Flujo de trabajo con HDO

Pedido por chat (a veces varios seguidos, a veces corrige el anterior) →
editar `AJUSTES_DATOS`/CSS → regenerar el PDF → rasterizar la página tocada
(`/opt/homebrew/bin/pdftoppm -png -r 90 -f N -l N …`) → **verificar
visualmente la imagen** (nunca afirmar sin mirar; medir con PIL si hace
falta) → enviar imagen + PDF **versionado** con SendUserFile.

- **Versionado**: cada entrega va como `laminas_a3_vNN.pdf` (scratchpad).
  Va por la **v33**. HDO acumula copias homónimas en Descargas y a veces
  reclama sobre versiones viejas: ante un pedido de "eliminar X que sigue
  ahí", verificar PRIMERO contra el PDF vigente (conteo de páginas /
  pdftotext) antes de tocar código.
- Estilos del sitio que se cuelan en la lámina (ya neutralizados en
  ImpresoA3.css; ante huecos o líneas fantasma sospechar de éstos):
  `section { padding: 5rem; border-top }`, `.gestion-cards { margin-bottom: 2rem }`,
  `.mh-cuadro { margin-top }`, ancho mínimo de tarjetas. Ojo con la
  especificidad del reset `.a3-lamina section`.
- No adelantarse a decisiones editoriales (qué pieza se elimina o cede
  lugar): proponer y esperar; HDO revierte lo no pedido.

## Estado al cierre

- Revisadas en detalle: láminas 3°, 5°, 6°, 10, 12, 13, 14, 15 y 20 +
  reglas globales que alcanzan a todas.
- Entregado para imprimir: `laminas_a3_hasta_art36_v33.pdf` (19 páginas,
  artículos 3°→36, en el scratchpad de la sesión anterior — regenerable
  recortando las páginas 1-19 del PDF completo con pdfseparate/pdfunite).
- El PDF completo tiene 28 páginas.

## Pendientes

- Revisar con HDO: láminas **38, 39 (dos hojas), 40, 41, 42 (dos hojas)**
  y la **lámina final del articulado restante** (p20→p28 del PDF).
- HDO quiere retocar textos él mismo: fuentes = docx → blob (generador en
  scripts/); bajadas = cuadro de correspondencia del informe.
- Cuando HDO lo pida: commit (mensaje estilo repo, p.ej.
  `feat(propuesta-s0809): láminas A3 por artículo con revisión HDO`).
