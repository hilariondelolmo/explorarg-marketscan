import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// En producción las funciones de /api las sirve Vercel. En desarrollo, este
// plugin sirve las que hacen falta para probar acá, con el mismo archivo:
// hoy, solo /api/poligrafo (el traductor con IA del Polígrafo).
const API_LOCAL = { '/api/poligrafo': '/api/poligrafo.js', '/api/analista': '/api/analista.js', '/api/cuenta': '/api/cuenta.js', '/api/admin': '/api/admin.js', '/api/compra': '/api/compra.js', '/api/pago-mp': '/api/pago-mp.js', '/api/registro': '/api/registro.js' };

function leerCuerpo(req, max = 20_000) {
  return new Promise((resolve) => {
    let datos = '';
    req.on('data', (d) => {
      datos += d;
      if (datos.length > max) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(datos || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function apiLocal() {
  return {
    name: 'explorarg-api-local',
    configureServer(server) {
      for (const [ruta, archivo] of Object.entries(API_LOCAL)) {
        server.middlewares.use(ruta, async (req, res) => {
          // los mismos atajos que Vercel le agrega a req y res
          res.status = (codigo) => {
            res.statusCode = codigo;
            return res;
          };
          res.json = (obj) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(obj));
          };
          try {
            req.body = await leerCuerpo(req);
            const modulo = await server.ssrLoadModule(archivo);
            await modulo.default(req, res);
          } catch (e) {
            console.error(`[api-local] ${ruta}:`, e);
            if (!res.writableEnded) res.status(500).json({ error: 'Error en la función local.' });
          }
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // Las variables del servidor (sin prefijo VITE_) no llegan solas a process.env:
  // se pasan las que usan las funciones locales, si están en .env.local.
  const env = loadEnv(mode, process.cwd(), '');
  for (const k of ['ANTHROPIC_API_KEY', 'POLIGRAFO_MOTOR', 'POLIGRAFO_MODELO', 'POLIGRAFO_MODELO_LOCAL', 'POLIGRAFO_ESFUERZO', 'POLIGRAFO_CLAUDE_BIN', 'ANALISTA_MODELO', 'ANALISTA_MODELO_LOCAL', 'FIREBASE_PROJECT_ID', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_API_KEY', 'FIREBASE_CLAVE_SERVICIO', 'CUENTAS_COLECCION', 'CUENTAS_ADMIN', 'CUENTAS_PRECIOS', 'CUENTAS_BIENVENIDA', 'MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET', 'SITIO_URL', 'DOLAR_FIJO']) {
    if (env[k] && !process.env[k]) process.env[k] = env[k];
  }
  // `vite --mode cuentas`: el sitio local con registro e ingreso, contra el emulador de
  // Firebase (configuraciones "cuentas-emulador" y "marketscan-con-cuentas" de
  // .claude/launch.json). Sin ese modo y sin proyecto configurado, las cuentas quedan
  // apagadas y el prototipo local anda abierto, como siempre.
  if (mode === 'cuentas') {
    process.env.FIREBASE_PROJECT_ID = 'demo-explorarg';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    // En el emulador el administrador es un mail de mentira, nunca el de verdad
    process.env.CUENTAS_ADMIN = 'admin@explorarg.test';
  }

  return {
    plugins: [react(), apiLocal()],
    server: {
      port: Number(process.env.PORT) || 5173, // el harness de preview asigna PORT si 5173 está tomado
    },
    base: '/', // raíz absoluta: requerido por BrowserRouter en producción (Vercel)
    build: {
      outDir: 'dist',
      assetsInlineLimit: 8192, // inline fonts pequeños
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-charts': ['recharts'],
          },
        },
      },
    },
  };
});
