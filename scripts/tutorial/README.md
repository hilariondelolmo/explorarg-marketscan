# Tutoriales en video del sitio

Pedido de HDO (01/10/2026): un video por página que muestre cómo se navega y qué hace cada control, grabado como si alguien usara la página, con la voz de Fernando (ElevenLabs) explicando. El primero es Mercado de Gas Oil.

Tres piezas, todas en esta carpeta, con salidas en `output/tutorial/<id>/` (ignorado por git):

1. **Guion** `guiones/<id>.json`: la lista de pasos. Cada paso tiene `texto` (lo que dice la voz, literal) y `acciones` (lo que hace el cursor: clic, mover, elegir, resaltar, scroll). El guion es a la vez el texto para HDO y la receta del video: cambiar una frase o un orden es editar este archivo y volver a grabar.
2. **Voz** `locucion.py`: manda cada texto a ElevenLabs (Fernando, turbo v2.5, idioma es, velocidad 1,1, la misma receta del video CEPREB) y deja `voz/<paso>.mp3` más `duraciones.json` con los segundos de cada bloque. Clave en `~/.cache/explorarg/elevenlabs.key`. `PARA_TTS` reescribe lo que la voz leería mal (963, 1104, SESCO, CIF) sin tocar el guion.
3. **Grabador** `grabar.mjs`: abre la página publicada con el Chrome de la máquina (Playwright, sin ventana, 1920×1080), dibuja un cursor que sigue al mouse, un destello en cada clic, recuadros ámbar sobre el control que se explica, una placa de apertura y cierre y un rótulo con el capítulo. Cada paso dura lo que dura su voz más 0,35 s de aire. Deja `video.webm`, `tiempos.json` (dónde arranca cada paso) y `capturas/<paso>.png`.
4. **Armado** `armar.py`: recorta el video, pega cada mp3 en el tiempo de su paso y exporta `tutorial_<id>_1080p.mp4` y `_720p.mp4`, más `guion.md` (minuto, qué se ve y texto de cada paso).

## Flujo

```bash
cd scripts/tutorial && npm install                      # una vez: Playwright (usa el Chrome instalado, no baja navegador)
python3 scripts/tutorial/locucion.py guiones/gasoil.json --listar     # ver los textos como los recibe la API
python3 scripts/tutorial/locucion.py guiones/gasoil.json              # generar la voz (o --solo p03,p07 tras cambiar un texto)
node scripts/tutorial/grabar.mjs guiones/gasoil.json --rapido         # probar los selectores sin esperar la voz (1-2 min)
node scripts/tutorial/grabar.mjs guiones/gasoil.json                  # grabación real, con las duraciones de la voz (~9 min)
python3 scripts/tutorial/armar.py gasoil                              # mp4 1080p y 720p + guion.md
```

`--desde p14 --hasta p16` graba un tramo (arranca en la página de `paginas` del guion). `--mudo` estima las duraciones por el largo del texto (borrador sin voz). `--ventana` abre Chrome con ventana para mirar.

## Decisiones y límites

- **Se graba contra el sitio publicado en Vercel** (`https://biodiesel-argentina-dashboard.vercel.app`, el proyecto conserva el nombre viejo). Al 01/10/2026 `explorarg.com` todavía apunta al Wix y devuelve 404 en `/gas-oil`.
- Se graba el contenido de la página, no la barra de direcciones del navegador.
- Los `<select>` nativos (Mes, Canal de distribución, Bandera) no muestran la lista desplegada en la grabación, porque Chrome la dibuja fuera de la página: el video muestra el cursor sobre el control y el valor cambiando. Los desplegables propios del sitio (Tipo de negocio, Provincia, menús de pestañas) sí se ven.
- La locución es nexo, no lectura de la pantalla: dice para qué sirve cada control y qué conviene mirar (regla de HDO del 13/09/2026). No cita cifras, porque cambian cada mes.
- Sincronía: el video crudo arranca al crear la página; `tiempos.json` guarda el desfase medido (`offset`) y el segundo en que empieza el tutorial (`videoDesde`). La voz de cada paso entra 0,15 s después de que empiezan sus acciones.
