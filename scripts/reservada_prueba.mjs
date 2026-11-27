// Banco de prueba del área reservada: quién entra y quién no. Sin datos reales.
//
//   node scripts/reservada_prueba.mjs
//
// Controla la regla de server/reservada/acceso.js (la lista de CUENTAS_RESERVADA, los
// dominios y los administradores) y la función api/reservada.js con las cuentas apagadas
// y con el sitio publicado sin configurar. Los mails son de mentira. Lo que necesita una
// credencial de verdad se prueba con el emulador (vite --mode cuentas), a mano.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let fallas = 0;
function control(nombre, obtenido, esperado) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallas += 1;
  console.log(`${ok ? '  ok ' : 'FALLA'}  ${nombre}${ok ? '' : `\n         obtenido: ${JSON.stringify(obtenido)}\n         esperado: ${JSON.stringify(esperado)}`}`);
}

const VARIABLES = ['VERCEL', 'FIREBASE_PROJECT_ID', 'VITE_FIREBASE_PROJECT_ID', 'FIREBASE_AUTH_EMULATOR_HOST', 'CUENTAS_ADMIN', 'CUENTAS_RESERVADA', 'RESERVADA_CARPETA'];
function conEntorno(valores) {
  for (const k of VARIABLES) delete process.env[k];
  Object.assign(process.env, valores);
}

const { puedeEntrar, autorizados } = await import('../server/reservada/acceso.js');
const { default: reservada } = await import('../api/reservada.js');

console.log('\nregla: quién entra');
conEntorno({ CUENTAS_ADMIN: 'jefe@explorarg.test', CUENTAS_RESERVADA: 'Ana@Ejemplo.test, @empresa.test ; beto@otra.test' });
control('la lista se lee sin mayúsculas ni espacios', autorizados(), ['ana@ejemplo.test', '@empresa.test', 'beto@otra.test']);
control('un mail de la lista entra', puedeEntrar({ uid: '1', email: 'ana@ejemplo.test' }), true);
control('... aunque la sesión lo traiga con mayúsculas', puedeEntrar({ uid: '1', email: 'ANA@ejemplo.test' }), true);
control('un mail del dominio autorizado entra', puedeEntrar({ uid: '2', email: 'cualquiera@empresa.test' }), true);
control('un dominio parecido no entra', puedeEntrar({ uid: '3', email: 'alguien@noempresa.test.falso' }), false);
control('un subdominio pegado al final no engaña a la regla', puedeEntrar({ uid: '3', email: 'alguien@otraempresa.test' }), false);
control('quien administra el sitio entra siempre', puedeEntrar({ uid: '4', email: 'jefe@explorarg.test' }), true);
control('una cuenta cualquiera no entra', puedeEntrar({ uid: '5', email: 'visitante@gmail.test' }), false);
control('sin mail no entra', puedeEntrar({ uid: '6', email: null }), false);
control('la copia local sin cuentas anda abierta', puedeEntrar({ uid: 'local', local: true }), true);
conEntorno({ CUENTAS_ADMIN: 'jefe@explorarg.test' });
control('con la lista vacía entran solo los administradores', [puedeEntrar({ uid: '1', email: 'ana@ejemplo.test' }), puedeEntrar({ uid: '4', email: 'jefe@explorarg.test' })], [false, true]);

/** Llama a la función como la llama Vercel y devuelve [estado, cuerpo]. */
async function llamar(direccion, cabeceras = {}) {
  let estado = 200;
  let cuerpo = null;
  const res = {
    setHeader() {},
    status(c) {
      estado = c;
      return res;
    },
    json(o) {
      cuerpo = o;
    },
  };
  await reservada({ method: 'GET', url: direccion, headers: cabeceras }, res);
  return [estado, cuerpo];
}

console.log('\nfunción: los datos salen solo después del candado');
const carpeta = mkdtempSync(path.join(os.tmpdir(), 'reservada-prueba-'));
try {
  writeFileSync(path.join(carpeta, 'crushing.json'), JSON.stringify({ meta: { nota: 'de prueba' }, filas: [] }));
  conEntorno({ RESERVADA_CARPETA: carpeta });
  control('copia local sin cuentas: dice que la persona entra', await llamar('/api/reservada'), [200, { autorizado: true, conjuntos: ['crushing'] }]);
  control('copia local sin cuentas: entrega el conjunto', await llamar('/api/reservada?que=crushing'), [200, { meta: { nota: 'de prueba' }, filas: [] }]);
  control('un conjunto que no existe no se sirve', (await llamar('/api/reservada?que=../../secreto'))[0], 503);
  conEntorno({ RESERVADA_CARPETA: path.join(carpeta, 'vacia') });
  control('sin el archivo de datos: avisa que no están cargados', (await llamar('/api/reservada?que=crushing'))[1]?.codigo, 'sin_datos');
  conEntorno({ VERCEL: '1', RESERVADA_CARPETA: carpeta });
  control('publicado y sin configurar: se niega todo', (await llamar('/api/reservada?que=crushing', { authorization: 'Bearer lo-que-sea' }))[0], 503);
  conEntorno({ FIREBASE_PROJECT_ID: 'demo-explorarg', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', RESERVADA_CARPETA: carpeta });
  control('con cuentas y sin credencial: 401, y no entrega nada', await llamar('/api/reservada?que=crushing'), [401, { error: 'Para consultar hay que ingresar a explorarg.com.', codigo: 'sin_ingreso' }]);
} finally {
  rmSync(carpeta, { recursive: true, force: true });
}

console.log(fallas ? `\n${fallas} control(es) con FALLA` : '\nTodos los controles pasan.');
process.exit(fallas ? 1 : 0);
