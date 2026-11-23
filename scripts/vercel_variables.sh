#!/bin/bash
# Carga en Vercel las variables del Agente Explorarg que ya están en esta Mac.
#
#   bash scripts/vercel_variables.sh            simulacro: revisa todo y no carga nada
#   bash scripts/vercel_variables.sh --cargar   carga las que falten (las que ya están no se tocan)
#
# Son siete: los cuatro datos de la app de Firebase, el mail del administrador y la
# configuración de precios del Agente (salen de .env.local) y la llave del servidor de
# Firebase (~/.cache/explorarg/firebase-servicio.json).
# Los valores van de esta Mac a Vercel sin mostrarse en pantalla y sin pasar por ningún
# otro lado. Se cargan solo en Producción.
#
# Cargar una variable no publica nada: vale recién en el próximo deploy.
#
# Las otras tres se cargan a mano en la página de Vercel, porque nacen en otra página:
#   ANTHROPIC_API_KEY   la clave de la API de Anthropic
#   MP_ACCESS_TOKEN     el Access Token de PRODUCCIÓN de Mercado Pago (no el de prueba)
#   MP_WEBHOOK_SECRET   la clave secreta de los avisos de Mercado Pago
#
# Este archivo no tiene ningún valor adentro: solo nombres.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

MODO="${1:-}"
AMBIENTE="production"
ENV_LOCAL=".env.local"
LLAVE="${FIREBASE_CLAVE_SERVICIO:-$HOME/.cache/explorarg/firebase-servicio.json}"

# nombre:tipo. "config" se puede volver a leer en Vercel (son datos públicos, viajan al
# navegador); "secret" queda oculto para siempre una vez guardado.
DE_ENV_LOCAL=(
  "VITE_FIREBASE_API_KEY:config"
  "VITE_FIREBASE_AUTH_DOMAIN:config"
  "VITE_FIREBASE_PROJECT_ID:config"
  "VITE_FIREBASE_APP_ID:config"
  "CUENTAS_ADMIN:secret"
  "CUENTAS_PRECIOS:secret"
)
A_MANO=(ANTHROPIC_API_KEY MP_ACCESS_TOKEN MP_WEBHOOK_SECRET)

# el valor de una variable de .env.local, sin el salto de línea del final
valor() { { grep -m1 "^$1=" "$ENV_LOCAL" 2>/dev/null || true; } | cut -d= -f2- | tr -d '\r\n'; }

if [ "$MODO" != "" ] && [ "$MODO" != "--cargar" ]; then
  echo "No entiendo \"$MODO\". Sin nada es simulacro; con --cargar, carga."
  exit 2
fi

echo
if [ "$MODO" = "--cargar" ]; then echo "CARGA de las variables del Agente en Vercel"; else echo "SIMULACRO: se revisa todo y no se carga nada"; fi
echo

# ------------------------------------------------------------------ que esté todo para empezar
if ! command -v vercel >/dev/null 2>&1; then echo "No encuentro el programa de Vercel (vercel) en esta Mac."; exit 1; fi
if [ ! -f .vercel/project.json ]; then echo "Esta carpeta no está enlazada con el proyecto de Vercel (falta .vercel/project.json)."; exit 1; fi
if [ ! -f "$ENV_LOCAL" ]; then echo "No encuentro $ENV_LOCAL."; exit 1; fi
if ! vercel whoami >/dev/null 2>&1; then echo "La sesión de Vercel no está iniciada en esta Mac. Corré: vercel login"; exit 1; fi
PROYECTO="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(".vercel/project.json", "utf8")).projectName ?? "?")' 2>/dev/null)"
echo "Proyecto de Vercel: ${PROYECTO:-?} · ambiente: Producción"
echo

# lo que ya está cargado en Vercel (solo los nombres; Vercel no muestra los valores)
LISTA="$(vercel env ls "$AMBIENTE" 2>&1)"
if [ $? -ne 0 ]; then echo "No pude leer las variables de Vercel:"; printf '%s\n' "$LISTA" | tail -2; exit 1; fi
YA="$(printf '%s\n' "$LISTA" | awk '{print $1}')"
esta() { printf '%s\n' "$YA" | grep -qx "$1"; }

# ------------------------------------------------------------------ la llave de Firebase
LLAVE_BIEN="no"
if [ -f "$LLAVE" ]; then
  if PROY="$(valor VITE_FIREBASE_PROJECT_ID)" node -e '
      const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      process.exit(d.type === "service_account" && d.private_key && d.project_id === process.env.PROY ? 0 : 3);
    ' "$LLAVE" 2>/dev/null; then
    LLAVE_BIEN="si"
  fi
fi

# ------------------------------------------------------------------ una por una
FALLAS=0
FALTAN=0
CARGADAS=0

subir() { # nombre, tipo; el valor llega por la entrada estándar y no se muestra
  local bandera="--sensitive" salida
  [ "$2" = "config" ] && bandera="--no-sensitive"
  if salida="$(vercel env add "$1" "$AMBIENTE" "$bandera" 2>&1)"; then
    echo "  cargada              $1"
    CARGADAS=$((CARGADAS + 1))
  else
    echo "  NO SE PUDO CARGAR    $1: $(printf '%s\n' "$salida" | grep -v '^$' | tail -1)"
    FALLAS=$((FALLAS + 1))
  fi
}

for par in "${DE_ENV_LOCAL[@]}"; do
  nombre="${par%%:*}"
  tipo="${par##*:}"
  if esta "$nombre"; then
    echo "  ya está en Vercel    $nombre (no se toca)"
  elif [ -z "$(valor "$nombre")" ]; then
    echo "  FALTA en esta Mac    $nombre (no está en $ENV_LOCAL)"
    FALTAN=$((FALTAN + 1))
  elif [ "$MODO" = "--cargar" ]; then
    subir "$nombre" "$tipo" < <(valor "$nombre")
  else
    echo "  lista para cargar    $nombre"
  fi
done

if esta FIREBASE_SERVICE_ACCOUNT; then
  echo "  ya está en Vercel    FIREBASE_SERVICE_ACCOUNT (no se toca)"
elif [ "$LLAVE_BIEN" != "si" ]; then
  echo "  FALTA en esta Mac    FIREBASE_SERVICE_ACCOUNT (la llave no está, no se puede leer o es de otro proyecto)"
  FALTAN=$((FALTAN + 1))
elif [ "$MODO" = "--cargar" ]; then
  subir FIREBASE_SERVICE_ACCOUNT secret < "$LLAVE"
else
  echo "  lista para cargar    FIREBASE_SERVICE_ACCOUNT (la llave del servidor; es del proyecto correcto)"
fi

# ------------------------------------------------------------------ las que van a mano
echo
echo "Se cargan a mano en la página de Vercel:"
if [ "$MODO" = "--cargar" ] && [ "$CARGADAS" -gt 0 ]; then YA="$(vercel env ls "$AMBIENTE" 2>&1 | awk '{print $1}')"; fi
for nombre in "${A_MANO[@]}"; do
  if esta "$nombre"; then echo "  ya está en Vercel    $nombre"; else echo "  todavía falta        $nombre"; fi
done

echo
if [ "$FALLAS" -gt 0 ] || [ "$FALTAN" -gt 0 ]; then
  echo "Quedaron cosas sin resolver: $FALLAS que no se pudieron cargar y $FALTAN que faltan en esta Mac."
  exit 1
fi
if [ "$MODO" = "--cargar" ]; then
  echo "Listo: se cargaron $CARGADAS. No se publicó nada: valen desde el próximo deploy."
else
  echo "Simulacro sin problemas. Para cargar de verdad: bash scripts/vercel_variables.sh --cargar"
fi
