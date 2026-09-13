# Handoff · Infografía A3 del mercado + video "La Argentina según CEPREB"

Traspaso de la sesión del 10 al 13 de septiembre de 2026 (HDO + Claude) para
seguir en una conversación nueva dentro de `explorarg-marketscan`. Dos piezas:
la **infografía A3** (36 hojas, ruta `/infografia`) y el **video** del mapa
de elaboradoras y aceiteras (guion, generador, locución). **Nada está
commiteado: HDO decide los commits y Vercel publica cada push a `main`.**

Las notas de memoria de Claude ya tienen el resumen de las decisiones
(`project_infografia_biodiesel.md`, `project_video_mapa_cepreb.md`,
`project_mapa_plantas.md`); este archivo es el detalle operativo.

## 1. Reglas de trabajo con HDO (no romper)

- Alinear el enfoque antes de codear; HDO dicta por voz, a veces con
  transcripción defectuosa: confirmar la interpretación cuando haya duda.
- Guion corto "-", nunca raya larga. Rigor con los números: todo sale de
  `src/data/*.json` (datos de la Secretaría de Energía) y se cita de ahí.
- Revisión **cuadro por cuadro**: se muestra un cuadro del video con su imagen,
  el texto en pantalla y la locución; HDO aprueba o corrige; recién ahí se
  pasa al siguiente. No avanzar sin aprobación.
- Commits y pushes solo con orden explícita.

## 2. Estado del repo (working tree, sin commit)

Último commit publicado: `d8ef6d9 feat(empresa): los KPIs siguen el rango
elegido`. Todo lo siguiente está sin commitear:

| Archivo | Qué es |
|---|---|
| `src/lib/plantas.js` (nuevo) | Datos y geometría del mapa de plantas (proyección Mercator, plantas por sector, encuadres, distancias, rutas, PUERTOS). Extraído de MapaPlantas.jsx; lo usan el mapa interactivo, la infografía y el mapa estático. |
| `src/components/mercado/MapaPlantas.jsx` (mod.) | Ahora importa de `lib/plantas.js`. Comportamiento verificado igual. |
| `src/components/mercado/MapaEstatico.jsx` (nuevo) | Mapa SVG sin interacción para piezas impresas (círculo de radio, rutas, puntos, etiquetas). |
| `src/components/mercado/kpiHelpers.jsx` (mod.) | `sumaSerie`, `ventanaActiva`, `acumular`, `mesesEntre` compartidos con la ficha. |
| `src/components/mercado/EmpresaFicha.jsx` (mod.) | Usa los helpers compartidos (los KPIs por rango ya se publicaron en d8ef6d9). |
| `src/pages/Infografia.jsx` + `.css` (nuevos) | La infografía A3 (36 hojas). Ruta `/infografia` en `src/App.jsx`. |
| `src/data/puertos.json` (nuevo) | Puerto General San Martín como destino de exportación: punto de referencia la ciudad-puerto (-32,7167; -60,7333). **HDO no validó el punto**; si quiere otra terminal, cambiar y recalcular rutas. |
| `src/data/rutas_puertos.json` (nuevo) | 28 rutas OSRM planta → PGSM (`python3 scripts/calcular_rutas.py --puertos`). |
| `scripts/calcular_rutas.py` (mod.) | Flag `--puertos`. |
| `scripts/generar_infografia.py` (nuevo) | PDF de la infografía con Chrome headless. |
| `scripts/generar_video_mapa.py` (nuevo) | Generador del video (Pillow + ffmpeg). |
| `scripts/mezclar_locucion.py` (nuevo) | Mezcla la locución (sintética de prueba o grabada) sobre el video mudo. |
| `docs/2026.09.11 Guion de audio - video Pero sos boludo.md` | Guion de locución con tiempos (el nombre del archivo quedó viejo: "Pero sos boludo" ya NO es el nombre de nada; renombrar cuando HDO defina título). |
| `docs/2026.09.10 Infografia ... .pdf` (5 archivos) | Copias de las versiones entregadas de la infografía (HDO las guardó ahí). |
| `CLAUDE.md` (mod.) | Menciona la infografía y este handoff. |

Entregables finales copiados a `output/entregas/` (carpeta ignorada por git):
`Infografia biodiesel - documento completo v5 (36 hojas).pdf`,
`La Argentina segun CEPREB - v6 (sin audio).mp4` y `... v6 con voz sintetica de prueba.mp4`.

## 3. Infografía A3 (`/infografia`)

- **Generar PDF:** `python3 scripts/generar_infografia.py [--puerto 5273] [--empresa "EXPLORA S.A."] [--out ruta.pdf]`
  (usa el dev server que encuentre en 5273/5173/5297 o levanta uno; Chrome
  headless con `--window-size=1700,1200` para que los charts midan a escala 1).
  Filtros de la ruta para probar: `?empresa=NOMBRE`, `?grupo=NOMBRE`,
  `?solo=portada|resumen|ranking|empresas|grupos`.
- **Estructura (36 hojas, A3 apaisada, folio global):** 1 portada (KPIs del
  mercado, serie mensual, mapa e índice de las 28 plantas en operación) ·
  2 resumen de proveedores de aceite por grupo económico (solo las 22 no
  integradas) · 3-30 una hoja por elaboradora en operación (28, alfabético) ·
  31-35 una por grupo económico (Bojanich, Bolzán, Cremer, Essential Energy,
  Pucciariello) · 36 ranking de distancias (puerto, refinería más cercana,
  La Plata, Dock Sud, Campana, Luján de Cuyo, Bahía Blanca).
- **Hoja por empresa:** cabecera (categoría, grupo, localidad, capacidad,
  cámara, desde cuándo), 6 KPIs de últimos 12 meses (producción, ventas al
  corte, cumplimiento, exportaciones, participación, uso de capacidad),
  evolución mensual desde el inicio, panel de aceiteras dentro del radio
  (mapa + lista por km de ruta + cobertura en veces) y panel de refinerías +
  puerto (mapa país + lista por km de ruta).
- **Decisiones de HDO:** A3 apaisada; mapa dibujado (nada de satelital);
  puntos grandes para biodiesel y algo menores para aceiteras (escalas por
  sector, `rPx`); radios `RADIO_POR_EMPRESA` = 120 km Pampa Bio, 160 Enresa,
  250 Diaser (el resto 100); hoja 2 solo no integradas, coberturas siempre en
  verde (sin semáforo), letra 9pt, fila total clara; firma "por Hilarión del
  Olmo - Presidente - Explora S.A." en la cabecera de todas las hojas;
  "Provincia de Buenos Aires" se escribe "Buenos Aires".
- **Supuestos:** aceite anual = molienda × 19 % × 300 días; cobertura =
  aceite anual del radio / capacidad de biodiesel (1 t aceite ≈ 1 t
  biodiesel); radio en línea recta, km por ruta (OSRM).
- **Estado:** v5 enviada el 11/09. HDO devolvió correcciones solo sobre la
  hoja 2 (aplicadas). Las demás hojas no tuvieron revisión detallada todavía.

## 4. Video "La Argentina según CEPREB"

### 4.1 Entorno y comandos

- Python con pillow + imageio-ffmpeg (no hay ffmpeg ni rsvg en la máquina):
  `~/.cache/explorarg/venv-video/bin/python` (ya creado; si falta:
  `python3 -m venv ~/.cache/explorarg/venv-video && ~/.cache/explorarg/venv-video/bin/pip install pillow imageio-ffmpeg`).
- Cuadros clave: `VENV/bin/python scripts/generar_video_mapa.py --preview --t 24,60,90`
  → `output/video/preview_XXX.Xs.png` (segundos exactos del video). Es la
  herramienta para la revisión cuadro por cuadro: rápida (1 s).
- Video completo: `VENV/bin/python scripts/generar_video_mapa.py [--out ruta.mp4]`
  → `output/video/mapa_elaboradoras.mp4`. 1920×1080, 30 fps, ~0,13 s por
  cuadro: **un video de 3 min tarda unos 8-10 minutos**; correrlo en segundo
  plano y avisar a HDO.
- Locución: `VENV/bin/python scripts/mezclar_locucion.py --solo-tiempos`
  imprime los tiempos de cada bloque (los toma del propio generador);
  `... video_mudo.mp4 salida.mp4` mezcla la voz sintética de prueba
  (`say -v Paulina`, es_MX; no hay voz argentina); `--voz carpeta/` mezcla
  bloques grabados b00..b12; `--musica pista.mp3 --nivel 0.18` agrega fondo.
- Fuentes: Inter variable en `~/Library/Fonts/` (ejes tamaño óptico + peso).
  Icono `public/brand/explorarg-icon.png`.

### 4.2 Datos y reglas del video

- Solo las **22 elaboradoras no integradas en operación** (HDO: "esto es
  solamente para las no integradas"; las integradas muelen su propio aceite).
- **Cumplimiento del cupo = acumulado desde 2010** (ventas al corte / cupo de
  toda la serie), no últimos 12 meses (HDO lo pidió expresamente).
- Distancias al puerto: km por ruta de `rutas_puertos.json`. Aceiteras: las
  54 de `plantas_aceite.json` (Tartagal y L. N. Alem quedan fuera del cuadro
  y se anotan al pie del mapa).
- Encuadre del país: 28° S a 39,4° S centrado en -62,3 (el de apertura del
  mapa interactivo). Mapa dibujado, sin satelital.
- CEPREB = cámara de las no integradas regionales (23 empresas del
  registro). Su afirmación, tal como la dictó HDO: "El costo de la materia
  prima queda determinado por la distancia a Puerto General San Martín".

### 4.3 Línea de tiempo actual (v7 en construcción, `generar_video_mapa.py`)

Constantes: `PRESENTACION_FIN = 30`, `INTRO_DESFASE = 29,4`, `INTRO_FIN`,
`T1`, `T2`, `T2B`, `T3`, `T4`, `PARADA_T0`, `PARADA_DUR = 10`, `T5`,
`DURACION` (hoy 194 s). Los tiempos vigentes de cada bloque los imprime `scripts/mezclar_locucion.py --solo-tiempos`; la tabla de tiempos del guion en `docs/` quedó con los valores de la v6 y hay que refrescarla cuando HDO apruebe los cuadros. Cambiar una constante corre todo lo posterior.

| Cuadro | Escena | Tiempo | Qué pasa |
|---|---|---|---|
| 1 | Presentación | 0:00-0:30 | Nombre y cargo, título "Privilegios o libertad: el Congreso decide", bajada "La reforma de la Ley 27.640 de biocombustibles", 3 bloques (`PRESENTACION`). Mapa atenuado. |
| 2 | Apertura | 0:30-0:42 | Cuatro frases apiladas (`INTRO`): "¿Pensaste alguna vez / en las implicancias de la afirmación que CEPREB repite? / «El costo de la materia prima...» / ¿Cómo sería la Argentina si eso fuera cierto?" |
| 3 | 1 · Elaboradoras no integradas | T1 (0:43) | El mapa se enciende; las 22 plantas aparecen de mayor a menor capacidad; listado en dos columnas con capacidad y cumplimiento desde 2010. |
| 4 | 2 · La Argentina según CEPREB | T2 (0:54) | Un solo punto ámbar en PGSM con ondas y rótulo; listado de las 22 de la más lejana a la más cercana con km por ruta; en el mapa cada recorrido. |
| 5 | 3 · Cuadro I y II | T2B (1:13) | Cuadro por distancia vs. cuadro por cumplimiento acumulado, unidos planta a planta; a los 8 s se resaltan en verde Pampa Bio, Diaser y Enresa (lejos y cumplen) y en ámbar Cremer, Latinbio y Diferoil (cerca y no); en el mapa se iluminan sus recorridos. Inspirado en los "Cuadro I / Cuadro II" de HDO. |
| 6 | 4 · La Argentina real | T3 (1:37) | Las 54 aceiteras entran como anillos ámbar sobre los puntos verdes. |
| 7 | 5 · Zoom planta por planta | PARADA_T0 (1:50) | 6 paradas de 10 s: Ramallo (4 plantas Bojanich), Junín (Biobin), Bahía Blanca (Biobahía), Alvear (Diferoil), General Pico (Pampa Bio, 120 km), Catriló (Enresa, 160 km). Círculo de radio, línea desde el centro con "100 km" (o 120/160), nombre de la empresa junto al punto, panel con nombre / "Grupo económico: X" / localidad, 4 cifras y lista de aceiteras. |
| 8 | 6 · Resumen y remate | T5 (2:50) | El mapa vuelve al país y aparece el cuadro de las 22 por grupo (radio, aceiteras, molienda, aceite, cobertura), como la hoja 2 de la infografía. Remate: texto de la locución (propuesta, HDO no lo dictó todavía). |

### 4.4 Revisión cuadro por cuadro: dónde quedó

- **Cuadro 1 (presentación):** reformulado el 13/09 sobre la nota de HDO en
  Clarín ("Privilegios o libertad: el Congreso decide", 23/10/2025, rev.7 en
  `~/Desktop/01. Notas, articulos/Articulos opinion/`; Clarín bloquea el
  acceso web, leerla con `textutil -convert txt -stdout`). "Pero sos boludo"
  quedó descartado como nombre de sección. Bloques actuales:
  1. *El punto de partida*: "La Ley 27.640 partió al sector en tres
     compartimentos estancos y benefició a unos en detrimento de otros: las
     integradas exportadoras recibieron US$ 2.040 millones por diferencial de
     retenciones y cuatro petroleras mezcladoras ganaron US$ 920 millones por
     incumplir el corte. A las no integradas, en cambio, se les prohibió
     exportar, se las topeó en 50 kt/año, no recibieron subsidio alguno y se
     las sometió a operar en quebranto con un precio político."
     (HDO rechazó la versión anterior "tres privilegios desiguales": las no
     integradas no recibieron ningún privilegio.)
  2. *Qué se está tratando*: "El Senado debate el proyecto oficial
     S-0809/2026, que deroga la 27.640: corte al 10%, precio por acuerdo
     entre partes y una franja para las no integradas que baja de 7,5% a 3%.
     El dictamen se firmó el 3 de septiembre; la sesión del 10 se cayó."
  3. *Lo que cada uno pide*: "Integradas, no integradas regionales (CEPREB),
     petroleras y Gobierno tiran de la cuerda para llevar agua a su molino.
     La salida es una ley que desactive los privilegios y abra la
     competencia. Empezamos por la afirmación de CEPREB."
  Locución propuesta en `scripts/mezclar_locucion.py` (bloque 0). **Pendiente
  de aprobación de HDO** (última imagen enviada: `output/video/preview_024.0s.png`).
- **Cuadros 2 a 8:** sin revisar. Los textos vigentes están en el guion de
  `docs/` y en `BLOQUES` del mezclador. El remate del cuadro 8 es propuesta.
- HDO podría pedir que la presentación cite el tamaño del sector: usar las
  cifras actuales (22 no integradas, 1.277.200 t/año) y no las de la nota
  (8 integradas / 25 no integradas, octubre 2025).

### 4.5 Historial de versiones (para no rehacer lo ya decidido)

v1 mapa + 3 escenas (10/09) · v2 apertura con la afirmación de CEPREB · v3
escena de zoom (nombre primero, luego grupo y localidad; 7 s por parada) ·
v4 solo no integradas, listado en escena 1, radio marcado desde el centro
(HDO rechazó la barra de escala abajo) · v5 tarjeta inicial + cuadro resumen
final + guion de audio + voz sintética (tiempos estirados: escena 2 a 19 s,
paradas a 10 s) · v6 escena de los Cuadros I y II con cumplimiento desde
2010 · v7 (en curso) cuadro 1 con la reforma de la Ley 27.640.

## 5. Pendientes y decisiones abiertas

1. Aprobación del cuadro 1; después cuadros 2 a 8 uno por uno.
2. Remate final (escena 6): HDO dijo que lo dictaría; hoy es propuesta.
3. Nombre del video / de la sección: sin definir (renombrar el guion).
4. Punto del puerto PGSM: validar con HDO (coordenadas en `puertos.json`).
5. Locución real de HDO: cuando grabe, mezclar con `--voz` o `--audio`.
6. Música: sin pistas con licencia en la máquina; sugeridas YouTube Audio
   Library, Pixabay Music, Free Music Archive.
7. Infografía: revisión hoja por hoja pendiente (solo la hoja 2 fue revisada).
8. Commit: cuando HDO lo ordene, sugerir dos commits (infografía + mapa
   compartido; video + guion). `output/` queda fuera.

## 6. Trampas conocidas

- El scratchpad de Claude es por sesión: no dejar nada importante ahí
  (por eso el mezclador vive en `scripts/` y el venv en `~/.cache/explorarg/`).
- Chrome print-to-PDF: si la miniatura de un mapa parece "blanca" es un
  artefacto de reducción; verificar sobre el PDF a 200 dpi antes de tocar.
- Dev server: `npm run dev` en 5273; si el puerto está ocupado Vite asigna
  otro (`--puerto N` en generar_infografia.py). Usar preview_start del
  Browser pane, no Bash.
- `computer:wait` del Browser pane falla si la pestaña activa es un PDF
  local; usar `javascript_tool` con `tabId` y un `setTimeout` interno.
- Pillow: `envolver()` corta líneas por ancho; los títulos largos se
  desbordan del panel si no se envuelven (ya corregido en el cuadro 1).
