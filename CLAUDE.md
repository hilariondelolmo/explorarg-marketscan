# explorarg-marketscan - sitio explorarg.com

Reemplazo del sitio Wix de Explora: tablero del mercado de biodiésel, marco legal, propuesta de ley S-0809/2026, análisis del dictamen, láminas A3. React 18 + Vite, sin framework de CSS. Repo GitHub `explorarg-marketscan` (público, ex biodiesel-argentina-dashboard; el proyecto Vercel conserva el nombre viejo) con Vercel: **cada push a `main` publica**.

- Dev: `npm run dev` en el puerto 5273 (`.claude/launch.json`, lanzador en `~/Explora_projects/Iniciar/Marketscan.command`).
- Páginas en `src/pages/`, contenido HTML generado en `src/content/`, datos en `src/data/`.
- Datos de los tableros: `python3 scripts/regenerate_data.py` regenera `src/data/*.json` desde los hypers y el Excel maestro de `/Volumes/comun` (lanzador `~/Explora_projects/Iniciar/Marketscan - Regenerar datos.command`, acepta `--dry-run`). Deja los cambios sin commitear. Al final llama a `scripts/regenerate_gasoil.py` (mercado de gas oil, `/gas-oil`, JSON `gasoil_*.json`); también corre solo.
- `scripts/` (Python y Node) generan el HTML de la propuesta, láminas, booklets, DOCX y la infografía A3 del mercado (`/infografia`, `python3 scripts/generar_infografia.py`). Salidas en `output/` (ignorado) y descargables en `descargas/` y `public/docs/`.
- Detalle fino de la etapa actual: `HANDOFF_claude_code.md` (ignorado por git), `HANDOFF_LAMINAS_A3.md`, `HANDOFF_VIDEO_CEPREB.md` (infografía A3 + video del mapa, sesión 10-13/09/2026) y `HANDOFF_GAS_OIL.md` (página `/gas-oil`, sesión 16/09/2026: estado, datos, decisiones de cálculo, pendientes y método de revisión por video). También `HANDOFF_MEDIA_SANCION.md` (ignorado por git; sesión 18/09/2026: media sanción de biocombustibles del 17/9, comparación con el S-809, marcador de ganadores y perdedores e infografía "El reglamento no elige al campeón", con el primer prompt para retomar).
- Reglas: las de `~/Explora_projects/CLAUDE.md`. Commits y pushes los decide HDO. Guion corto, nunca raya larga.
