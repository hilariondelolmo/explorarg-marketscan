# Explorarg_Marketscan - sitio explorarg.com

Reemplazo del sitio Wix de Explora: tablero del mercado de biodiésel, marco legal, propuesta de ley S-0809/2026, análisis del dictamen, láminas A3. React 18 + Vite, sin framework de CSS. Repo GitHub `biodiesel-argentina-dashboard` (público) con Vercel: **cada push a `main` publica**.

- Dev: `npm run dev` en el puerto 5273 (`.claude/launch.json`, lanzador en `~/Explora_projects/Iniciar/Marketscan.command`).
- Páginas en `src/pages/`, contenido HTML generado en `src/content/`, datos en `src/data/`.
- `scripts/` (Python y Node) generan el HTML de la propuesta, láminas, booklets y DOCX. Salidas en `output/` (ignorado) y descargables en `descargas/` y `public/docs/`.
- Detalle fino de la etapa actual: `HANDOFF_claude_code.md` (ignorado por git) y `HANDOFF_LAMINAS_A3.md`.
- Reglas: las de `~/Explora_projects/CLAUDE.md`. Commits y pushes los decide HDO. Guion corto, nunca raya larga.
