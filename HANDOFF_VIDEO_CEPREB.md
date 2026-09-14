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
| `scripts/generar_locucion_elevenlabs.py` (nuevo, 13/09) | Genera b00..b12 con la voz Fernando de ElevenLabs (clave en `~/.cache/explorarg/elevenlabs.key`). |
| `docs/2026.09.11 Guion de audio - video Pero sos boludo.md` | Guion de locución con tiempos (el nombre del archivo quedó viejo: "Pero sos boludo" ya NO es el nombre de nada; renombrar cuando HDO defina título). |
| `docs/2026.09.10 Infografia ... .pdf` (5 archivos) | Copias de las versiones entregadas de la infografía (HDO las guardó ahí). |
| `CLAUDE.md` (mod.) | Menciona la infografía y este handoff. |

Entregables finales copiados a `output/entregas/` (carpeta ignorada por git):
`Infografia biodiesel - documento completo v5 (36 hojas).pdf`,
`La Argentina segun CEPREB - v6 (sin audio).mp4`, `... v6 con voz sintetica de prueba.mp4`,
`La Argentina segun CEPREB - v7 (sin audio).mp4` y `... v7 (Fernando).mp4` (13/09, 3 min 10 s).

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
- Video completo: `VENV/bin/python scripts/generar_video_mapa.py [--out ruta.mp4] [--nucleos N] [--hasta SEG] [--desde SEG]`
  → `output/video/mapa_elaboradoras.mp4`. 1920×1080, 30 fps. Desde el 14/09 rinde
  **en paralelo** (por defecto todos los núcleos menos uno; cuadros idénticos, verificado
  por MD5): el video completo de 7:23 tarda ~5,5 min en la M2 Max (28 min con `--nucleos 1`).
  `--hasta` corta para revisar un parcial; `--desde` rinde solo la cola (pegar con ffmpeg
  `trim=end_frame` + `concat`, ver `~/.cache/explorarg/render_v8_cola.sh`). Correrlo en
  segundo plano (`nohup` + monitor) y avisar a HDO.
- Locución: `VENV/bin/python scripts/mezclar_locucion.py --solo-tiempos`
  imprime los tiempos de cada bloque (los toma del propio generador);
  `... video_mudo.mp4 salida.mp4` mezcla la voz sintética de prueba
  (`say -v Paulina`, es_MX; no hay voz argentina); `--voz carpeta/` mezcla
  bloques grabados b00..b12; `--musica pista.mp3 --nivel 0.18` agrega fondo.
- Fuentes: Inter variable en `~/Library/Fonts/` (ejes tamaño óptico + peso).
  Icono `public/brand/explorarg-icon.png`.

### 4.2 Datos y reglas del video

- Solo las **23 elaboradoras no integradas en operación** (HDO: "esto es
  solamente para las no integradas"; las integradas muelen su propio aceite).
  Eran 22 hasta el 14/09: Colalao del Valle S.A. (Bojanich, 18.000 t/año) no
  tenía coordenadas en el maestro. HDO la ubicó en el Parque Industrial
  COMIRSA II (Calle 24 s/n), Ramallo: se agregaron `COORDENADAS_OVERRIDE` y
  `LOCALIDAD_OVERRIDE` en `scripts/regenerate_data.py` (mismo punto que Bio
  Ramallo / Refinar Bio / Biocorba, -33,4010 / -60,1430; COMIRSA II no está en
  OSM, HDO puede afinar el punto), se parcharon `capacidad.json` y
  `empresas.json` y se calcularon sus rutas (`calcular_rutas.py --solo-faltantes`
  en los tres modos: 114,9 km a PGSM). En el registro hay 29 plantas en
  operación (6 integradas + 23). La parada de Ramallo pasa a 5 plantas Bojanich
  (218.000 t/año, 30,3 veces); el rótulo del mapa va de a dos nombres por renglón.
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

### 4.3 Línea de tiempo (v8, 14/09/2026)

**Se calcula sola.** `generar_video_mapa.py` lee `output/video/voz_hdo/eleven/duraciones.json`
(lo escribe el generador de locución, o `--medir`) y arma cada escena como
duración efectiva del bloque (hasta donde termina de hablar, sin el silencio final del mp3: `duracion_efectiva()` del generador de locución) + `AIRE` (0,3 s). Si un bloque regenerado es más corto que el
rendido, se puede fijar su valor viejo en `duraciones.json` y solo remezclar. Constantes derivadas: `PRESENTACION_FIN`,
`INTRO_FIN`, `T1`, `T2`, `T2B`, `T3`, `T4`, `PARADA_INICIOS` / `PARADA_DURS` (cada
parada dura lo que dura su bloque, mínimo 8 s), `T5`, `DURACION` (401,7 s en la v8 final: textos medios/cortos de los cuadros 1 y 2, conclusión del 8, velocidad 1,1, aire 0,3). La tarjeta
del cuadro 1 escalona sus elementos al 62 % y al 93 % del bloque 0. Los tiempos
vigentes: `scripts/mezclar_locucion.py --solo-tiempos`; el guion completo con pantalla
y locución: `docs/2026.09.14 Guion - video La Argentina segun CEPREB v8.md`.
`--hasta SEG` renderiza un parcial para revisar.

| Cuadro | Escena | Qué pasa |
|---|---|---|
| 1 | Presentación (47 s) | "Nueva sección en explorarg.com" · "Lo que no entra en cinco minutos" · a los 37 s las tres líneas del método · a los 56 s "Primera entrega · La Argentina según CEPREB". Sin nombre ni cargo de HDO (pedido expreso). |
| 2 | La afirmación (18 s) | Frases apiladas: la afirmación desde el inicio del debate, Rosario → PGSM ("Chicago"), fuente de los comunicados, "afirmada, nunca demostrada", "pensemos qué significa", "¿Qué Argentina configura esta afirmación?". |
| 3 | Elaboradoras no integradas (38 s) | Las 23 plantas + listado (capacidad, cumplimiento desde 2010). |
| 4 | La Argentina según CEPREB (41 s) | Punto en PGSM, 23 rutas, listado por km. |
| 5 | Cuadros I y II (34 s) | Distancia vs. cumplimiento; 6 plantas resaltadas. |
| 6 | La Argentina real (32 s) | 54 aceiteras + tabla por provincia (nueva, 14/09). |
| 7 | Zoom (2:15) | Ramallo (5 Bojanich), Bahía Blanca, Junín, Alvear, General Pico, Catriló: cada parada con su duración; rótulo de a dos nombres por renglón. **Ojo: el orden real es Bahía Blanca antes que Junín** (la v7 tenía las voces cruzadas). |
| 8 | Resumen y remate (63 s) | Tabla de las 23 por grupo; cierre dictado por HDO: veredicto de la tabla; "cinco minutos bastan para formular dos afirmaciones (a) y (b)"; demostrar que el transporte depende de la distancia al proveedor con molienda disponible, no al puerto, exige más tiempo. |

### 4.4 Revisión cuadro por cuadro: TERMINADA el 14/09/2026

Los ocho cuadros fueron aprobados por HDO con la regla de [feedback-video-locucion-nexo]
(pantalla = hechos, voz = lo que no está escrito + nexo). Textos de HDO: cuadro 1
completo (título "Lo que no entra en cinco minutos" y locución sobre el sesgo de
autoridad y los cinco minutos), locución de los cuadros 2, 3 y 4, y el remate del 8.
Los demás son propuestas de Claude aprobadas. Cada parada del zoom nombra a la
empresa (pedido HDO). Versión rendida: v8 (`output/entregas/La Argentina segun
CEPREB - v8 (Fernando).mp4`). Si HDO cambia un texto: regenerar solo ese bloque,
`--hasta` para revisar, render completo al final.

### 4.5 Historial de versiones (para no rehacer lo ya decidido)

v1 mapa + 3 escenas (10/09) · v2 apertura con la afirmación de CEPREB · v3
escena de zoom (nombre primero, luego grupo y localidad; 7 s por parada) ·
v4 solo no integradas, listado en escena 1, radio marcado desde el centro
(HDO rechazó la barra de escala abajo) · v5 tarjeta inicial + cuadro resumen
final + guion de audio + voz sintética (tiempos estirados: escena 2 a 19 s,
paradas a 10 s) · v6 escena de los Cuadros I y II con cumplimiento desde
2010 · v7 (13/09) voz Fernando, tarjeta corta · v8 (14/09) revisión cuadro por
cuadro completa, 23 plantas, tabla por provincia, paradas por duración, remate de HDO.

### 4.6 Locución: la voz es Fernando (ElevenLabs), 13/09/2026

HDO rechazó todo lo sintético local antes de llegar a ElevenLabs: las voces
neuronales de Microsoft vía `edge-tts` (Tomás/Elena es-AR, Mateo/Valentina
es-UY: "pésimas todas") y cuatro clones locales de su propia voz con
Chatterbox (`~/.cache/explorarg/venv-voz`) y Qwen3-TTS
(`~/.cache/explorarg/venv-qwen`, scripts en `~/.cache/explorarg/qwen/`): copian
el timbre pero el acento sale de España. **No volver a proponer voces locales.**
Muestras de HDO y resultados en `output/video/voz_hdo/`.

**Decisión final:** voz de biblioteca "Fernando - Warm, Confident Narrator"
(voice_id `nJQVs11nHR9UflbVG2og`, es-AR, ya está en las voces de la cuenta de
HDO), modelo **`eleven_turbo_v2_5` con `language_code="es"`**, estabilidad 0,7,
similitud 0,85, estilo 0, **velocidad 1,1** (HDO 14/09: "que hable algo más rápido"; el efecto es aproximado, ~7 % menos). Con `eleven_multilingual_v2` y con `eleven_v3` la
misma voz sonaba a español de España (HDO: "¿por qué carajo habla como un
español?"); turbo v2.5 con idioma forzado sostiene el acento. Pruebas en
`output/video/voz_hdo/eleven/pruebas/`.

- Generar: `~/.cache/explorarg/venv-video/bin/python scripts/generar_locucion_elevenlabs.py --voz nJQVs11nHR9UflbVG2og [--solo 0,3]`
  → `output/video/voz_hdo/eleven/b00..b12.mp3` (unos 1.950 caracteres por
  juego completo; el plan de HDO alcanza de sobra). Imprime por bloque si la
  toma entra en su escena. Los textos salen de `BLOQUES` del mezclador;
  `PARA_TTS` reescribe "27.640" y "CEPREB" para que los lea bien.
- Mezclar: `... scripts/mezclar_locucion.py video_mudo.mp4 salida.mp4 --voz output/video/voz_hdo/eleven/`.
- Clave de API: `~/.cache/explorarg/elevenlabs.key` (permisos Text to Speech +
  Voices). Nunca en el chat ni en el repo. Claude no crea cuentas ni usa
  contraseñas: HDO pegó sus credenciales en el chat el 13/09 y se le pidió
  cambiarlas.
- Si HDO cambia un texto: regenerar solo ese bloque con `--solo N`, chequear
  que entre (si "SE PASA", estirar la constante de esa escena) y volver a
  mezclar; el render del video mudo solo hace falta si cambia la imagen o los
  tiempos.

### 4.7 Sección del sitio: "Lo que no entra en 5 minutos" (14/09/2026)

HDO eligió el nombre (con el dígito 5) y pidió que viva **dentro de Reforma Ley
27.640**. Implementación: ruta `/cinco-minutos` (`src/App.jsx`), entrada al final
de `SECCIONES_REFORMA` (`src/lib/reforma.js`) y de `RUTAS_REFORMA` (`Nav.jsx`),
página `src/pages/CincoMinutos.jsx` + `.css` (cabecera al estilo de las páginas de
la reforma, una `<article>` por entrega con video, transcripción desplegable,
fuentes y enlaces). Contenido en `src/content/cinco-minutos.json` (bajada,
transcripción de los 13 bloques, fuentes, relacionados): para una entrega nueva se
agrega un objeto a `entregas`. Video: `public/video/cinco-minutos/la-argentina-segun-cepreb.mp4`
es la copia web (1080p, crf 30, 11,7 MB) de la reexportación de HDO
`output/video/Lo que no entra en 5 minutos.mp4` (90 MB, 6:40, no va al repo);
póster a los 45 s. HDO pidió que la ficha del video no diga "locución sintética" (14/09).

## 5. Pendientes y decisiones abiertas

1. Revisión cuadro por cuadro terminada (14/09). Nombre de la sección: "Lo que no
   entra en cinco minutos". Falta que HDO vea el v8 completo rendido.
2. Remate final: dictado por HDO el 14/09 (bloque 12).
3. Guion definitivo: `docs/2026.09.14 Guion - video La Argentina segun CEPREB v8.md` (el de la v6 quedó renombrado como superado).
4. Punto del puerto PGSM: validar con HDO (coordenadas en `puertos.json`).
5. Locución: resuelta con Fernando (ElevenLabs), ver 4.6. Si HDO cambia de
   idea y graba, la mezcla es la misma con `--voz carpeta/`.
6. Música: sin pistas con licencia en la máquina; sugeridas YouTube Audio
   Library, Pixabay Music, Free Music Archive.
7. Infografía: revisión hoja por hoja pendiente (solo la hoja 2 fue revisada).
   **Regenerar el PDF**: con Colalao del Valle ubicada pasa a 29 hojas por
   empresa (37 en total) y cambian la hoja 2 (Bojanich 8 plantas), la portada y el
   ranking. Los datos ya están; falta `python3 scripts/generar_infografia.py`.
8. Commit: cuando HDO lo ordene. Sin commitear al 13/09 a la noche: la
   tarjeta corta y los tiempos nuevos del generador, el bloque 0 del mezclador,
   `scripts/generar_locucion_elevenlabs.py` y este handoff. `output/` queda fuera.

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
