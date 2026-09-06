# Biodiesel Argentina · Tablero Interactivo

[![CI](https://img.shields.io/badge/ci-passing-green)](.) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Proyecto React + Vite del tablero interactivo sobre el mercado argentino de biodiesel. Datos mensuales 2008-2026, marco legal con 17 hitos enlazados a documentos oficiales, y 25 análisis propios embebidos.

## Demo

> Agregar URL cuando esté desplegado.

## Stack técnico

- **React 18** — framework UI
- **Vite 5** — bundler, dev server, build
- **Recharts 2** — charts
- Sin dependencias de CSS (estilos nativos con variables CSS, sin Tailwind)

## Requisitos

- Node.js 18 o superior (se recomienda usar `.nvmrc`: `nvm use`)
- npm (incluido con Node.js)

## Desarrollo local

```bash
npm install
npm run dev          # http://localhost:5173
```

## Build de producción

```bash
npm run build        # genera dist/
npm run preview      # previsualiza el build en http://localhost:4173
```

## Estructura

```
explorarg-marketscan/
├── .github/
│   ├── workflows/                  # CI activa
│   └── workflows-templates/        # Templates de deploy (mover a workflows/ para activar)
├── public/                         # Assets estáticos (fonts opcionales)
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── components/                 # Componentes React + CSS colocados
│   │   └── charts/                 # Charts con Recharts
│   ├── data/                       # JSON con datos del dashboard
│   ├── hooks/
│   ├── lib/
│   └── styles/
├── index.html                      # HTML raíz Vite
├── vite.config.js
├── package.json
└── README.md
```

## Datos

Los 4 archivos JSON en `src/data/` consolidan:

- `dashboard.json` — KPIs, series mensuales y anuales, ventas por empresa/petrolera/provincia
- `timeline.json` — 17 eventos del marco legal con URLs oficiales
- `articles.json` — metadata de 25 artículos
- `article-content.json` — HTML de análisis sintetizado por artículo

Se regeneran con un script Python que procesa el dataset oficial de la Secretaría de Energía.

## Despliegue

### GitHub Pages (gratis, subdominio github.io)

1. Mover `.github/workflows-templates/deploy-pages.yml` a `.github/workflows/`.
2. En `vite.config.js` cambiar `base: './'` por `base: '/NOMBRE-DEL-REPO/'`.
3. GitHub → Settings → Pages → Source: **GitHub Actions**.
4. Push a main. Deploy automático.

URL resultante: `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`

### Vercel

```bash
npm i -g vercel
vercel              # follow prompts, link al repo
vercel --prod       # deploy a producción
```

O conectar el repo desde vercel.com → Add New → Import Git Repository. Vercel detecta Vite automáticamente.

### Netlify

Conectar el repo desde app.netlify.com → Add new site → Import an existing project. Configuración:
- Build command: `npm run build`
- Publish directory: `dist`

### Cloudflare Pages

Igual que Netlify, detección automática de Vite.

### Dominio propio

Los tres hostings (Vercel, Netlify, Cloudflare Pages) permiten configurar dominio propio gratis. Apuntar un CNAME desde el DNS al hostname del hosting.

## Fuentes tipográficas (opcional)

El tablero usa **SF Pro Display** con fallback al stack nativo. Para auto-hospedar las fuentes:

1. Descargar SF Pro de https://developer.apple.com/fonts/ (Apple ID gratuito).
2. Convertir `.otf` a `.woff2` en https://transfonter.org.
3. Colocar los 6 archivos en `public/fonts/`:
   - `SFProDisplay-Regular.woff2`
   - `SFProDisplay-RegularItalic.woff2`
   - `SFProDisplay-Medium.woff2`
   - `SFProDisplay-Semibold.woff2`
   - `SFProDisplay-SemiboldItalic.woff2`
   - `SFProDisplay-Bold.woff2`

**Importante**: `.gitignore` excluye `public/fonts/*.woff2` porque la licencia de Apple restringe redistribución. Cada colaborador baja las fuentes localmente.

## Contribuir

Ver [CONTRIBUTING.md](CONTRIBUTING.md).

## Licencia

Código bajo [MIT](LICENSE). Los análisis editoriales embebidos son propiedad de Hilarión Del Olmo / Explora S.A.
