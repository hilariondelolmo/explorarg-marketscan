// Arma los ejemplos "ya analizados" del Polígrafo con episodios de «Del dicho al dato».
//
//   node scripts/poligrafo_ejemplos.mjs            episodios 1 a 10
//   node scripts/poligrafo_ejemplos.mjs 11 14      del 11 al 14
//
// Los episodios que ya estaban en el archivo y quedan fuera del rango pedido se
// conservan tal cual: se puede rehacer uno solo sin tocar los demás.
//
// Necesita el sitio levantado en local (puerto 5273): cada episodio se manda a
// /api/poligrafo, igual que si alguien lo escribiera en la página, y la forma
// lógica que devuelve la IA se guarda en src/data/poligrafo_ejemplos.json.
// Así el ejemplo se abre sin volver a consultar a la IA. Los números y los
// sellos no se guardan: los calcula la página cada vez, con los datos del día.
//
// Volver a correrlo cuando cambien la consigna, los textos legales o la ficha.
// No editar el JSON a mano.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = process.env.POLIGRAFO_API || 'http://localhost:5273/api/poligrafo';
const SALIDA = path.join(raiz, 'src/data/poligrafo_ejemplos.json');

// Quién lo dijo, cuándo y sobre qué: lo que el Polígrafo recibe como contexto.
// González habló el 3/6/2026, antes del dictamen; la serie contrasta lo que dijo
// con el texto que después tuvo media sanción, y acá se hace igual.
const CONTEXTO = {
  B: 'Senadora Patricia Bullrich, cierre del debate en el Senado del proyecto de ley de biocombustibles (la media sanción), 17/9/2026. Defiende el proyecto.',
  G: 'Lic. Daniel González, por el Poder Ejecutivo nacional, en el plenario de comisiones del Senado, 3/6/2026. Habla del proyecto de ley de biocombustibles S-809/26, que el Ejecutivo apoya y que después tuvo media sanción del Senado.',
  I: 'Gustavo Idígoras, presidente de CIARA (la cámara de la industria aceitera), en el programa UpRiver, 4/11/2026. Habla del proyecto de ley de biocombustibles que tuvo media sanción del Senado el 17/9/2026 y de las empresas integradas.',
};

const serie = JSON.parse(readFileSync(path.join(raiz, 'src/data/dicho_dato.json'), 'utf8'));
const desde = Number(process.argv[2] || 1);
const hasta = Number(process.argv[3] || 10);

const limpiar = (dicho) =>
  (Array.isArray(dicho) ? dicho.join(' ') : String(dicho))
    .replace(/[«»]/g, '')
    .replace(/\(\.\.\.\)\s*/g, '')
    .replace(/\[([^\]]*)\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

async function analizar(ep) {
  const enunciado = limpiar(ep.dicho);
  const contexto = CONTEXTO[ep.orador];
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enunciado, contexto }),
  });
  const cuerpo = await r.json();
  if (!r.ok) throw new Error(`episodio ${ep.n}: ${cuerpo.error ?? r.status}`);
  console.log(`  episodio ${ep.n}: ${cuerpo.analisis.afirmaciones.length} afirmaciones (${cuerpo.modelo})`);
  return {
    id: `dicho-dato-${ep.n}`,
    titulo: `${ep.n}. ${ep.cita}`,
    enunciado,
    contexto,
    episodio: { n: ep.n, sello: ep.veredicto, ruta: `/del-dicho-al-dato/${ep.n}` },
    modelo: cuerpo.modelo,
    analisis: cuerpo.analisis,
  };
}

const elegidos = serie.episodios.filter((e) => e.n >= desde && e.n <= hasta);
const sinContexto = elegidos.filter((e) => !CONTEXTO[e.orador]);
if (sinContexto.length) {
  console.error(`Sin contexto definido para los episodios ${sinContexto.map((e) => e.n).join(', ')}: agregalo en CONTEXTO.`);
  process.exit(1);
}

console.log(`Analizando los episodios ${desde} a ${hasta} contra ${API}`);
const nuevos = [];
for (let i = 0; i < elegidos.length; i += 4) {
  nuevos.push(...(await Promise.all(elegidos.slice(i, i + 4).map(analizar))));
}

// se conservan los que ya estaban y no se rehicieron, y todo queda en orden de episodio
const previos = existsSync(SALIDA) ? JSON.parse(readFileSync(SALIDA, 'utf8')).ejemplos : [];
const ejemplos = [...previos.filter((p) => !nuevos.some((n) => n.id === p.id)), ...nuevos].sort(
  (a, b) => a.episodio.n - b.episodio.n
);

writeFileSync(
  SALIDA,
  `${JSON.stringify(
    {
      meta: {
        generado: new Date().toISOString().slice(0, 16).replace('T', ' '),
        nota: 'Generado por scripts/poligrafo_ejemplos.mjs - no editar a mano',
      },
      ejemplos,
    },
    null,
    1
  )}\n`
);
console.log(`${path.relative(raiz, SALIDA)}: ${ejemplos.length} ejemplos`);
