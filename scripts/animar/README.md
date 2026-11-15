# Láminas animadas para los videos (scripts/animar)

Pedido de HDO del 9/11/2026: tomar un video ya hecho (láminas fijas + voz de Fernando) y hacerlo animado, con la misma
información. Primer uso: el video corto «Lo que dijeron y lo que dicen los datos» (`output/video-frases/animado.py`).

## Qué hace

Cada lámina de los videos es una maqueta HTML con bloques marcados con `data-paso="N"`. Los scripts de cada serie sacaban una foto
fija por paso con Chrome y las encadenaban con fundidos. Acá la lámina se construye: los bloques del paso entran a su hora (la del
guion, sin tocar la línea de tiempo ni las voces), las barras crecen hasta su valor, las cifras cuentan desde cero con su formato, el
sello del veredicto cae y los resaltados de los textos legales se pintan. Sobrio y corto: en cada paso todo termina de moverse en
uno o dos segundos y el texto queda quieto mientras habla la voz.

- `motor.js`: se inyecta en la maqueta con `window.__PLAN`. `preparar()` descubre las unidades (qué aparece en cada paso y en qué orden,
  con escalonado de hasta tres niveles: bloque, tarjetas, filas), las barras (`.barra`, `.barra > i`, `.b`, `.quita`, `.lleno`, `.hueco`),
  los números (`.heroe`, `.v`, `.val`, `.total`, etiquetas de barras, `.sello b`) y los resaltes (`.ley p b`). `render(T)` deja la lámina
  como está en el segundo T: función pura de T, sin reloj. Con T >= duración la lámina es idéntica a la maqueta quieta.
- `grabar.mjs`: Playwright con el Chrome local (canal `chrome`, el mismo del grabador de tutoriales en `scripts/tutorial`, de donde toma
  `node_modules`). Saca un PNG por cuadro (30 fps, 1920x1080) solo en los tramos donde algo se mueve; el resto se sostiene con duraciones
  en `frames.txt` para el concat de ffmpeg. Unos 45 ms por cuadro: una lámina de 50 s sale en unos 10 s.
- `animar.py`: arma el HTML (velos de entrada: la imagen anterior o blanco; velo blanco de salida), llama al grabador, codifica con la
  misma receta x264 de los videos y cachea por firma (maqueta + plan + motor + grabador).

## Plan de una lámina

```python
plan = dict(W=1920, H=1080, fps=30, dur=51.3,
            pasos=[dict(t=0.1, sel=['[data-paso="1"]', '[data-paso="2"]']), dict(t=23.35, sel='resto')],   # "resto" = todo lo que no es de pasos posteriores
            entrada="anterior", png_anterior="/ruta/ultimo_cuadro_anterior.png", t_entrada=0.5,
            salida_blanco=False, t_salida=0.8)
animar.segmento(src_html, dir_maqueta, plan, out_mp4, ffmpeg, X264, tmp, "01_o01")
```

## Para usarlo en otra serie

Copiar el molde de `output/video-frases/animado.py`: importar el script de la serie, redirigir sus carpetas de segmentos y temporales a
una carpeta nueva, construir el plan de cada lámina desde su `linea_de_tiempo()` (los tiempos de los pasos ya están ahí) y reusar sus
clips, voces y `armar_audio`. El resultado dura exactamente lo mismo que el video de láminas fijas.

## Para revisar una lámina

```bash
~/.cache/explorarg/venv-video/bin/python output/video-frases/animado.py prueba o01 --t 0.6,1.2,1+0.5,fin-0.4
```
Deja los cuadros en `video-anim/tmp/<segmento>/` y las muestras pedidas en `video-anim/muestras/` (`k+0.5` = medio segundo después de
que arranca el paso k).
