// Cuentas de explorarg.com - el panel de administrador.
//
// Lo ve solo quien administra el sitio (HDO): todas las cuentas, lo que consumió cada una,
// lo que se cobró contra lo que costó, las frases que el Polígrafo no pudo comprobar, las
// consultas que no se cobraron y las compras de tokens. Acá sí se habla en dólares (a los usuarios, nunca).
//
// QUIÉN ES ADMINISTRADOR. La variable CUENTAS_ADMIN trae el mail (o los mails, separados
// por coma) de quien puede ver este panel. Va en .env.local de esta Mac y en las variables
// de Vercel; no va en el repositorio, que es público. El mail llega comprobado por Google,
// o confirmado y con el registro autorizado (sesion.js), así que nadie se lo puede inventar. Sin la variable, nadie
// es administrador.
//
// Este archivo no sabe si la base es Firestore o la de prueba: usa lo que ofrece base.js.

import { METRICAS, TIPOS } from '../../src/lib/analista/catalogo.js';
import { CREDITO_INICIAL, HERRAMIENTAS, POR_DOLAR } from '../../src/lib/cuenta/config.js';

export const administradores = () =>
  String(process.env.CUENTAS_ADMIN ?? '')
    .split(/[\s,;]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

/** ¿Esta sesión es de quien administra el sitio? Con las cuentas apagadas no hay administrador. */
export const esAdmin = (sesion) => Boolean(sesion?.email) && !sesion.local && administradores().includes(String(sesion.email).toLowerCase());

// por qué no se cobró una consulta
const MOTIVOS = {
  fallo: 'Falló la consulta',
  sin_respuesta: 'Quedó sin respuesta',
  no_se_puede: 'No se pudo responder con los datos del sitio',
  sin_afirmaciones: 'No se encontró ninguna afirmación en el texto',
};

const porFechaDesc = (a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0);
const suma = (xs, f) => xs.reduce((s, x) => s + (f(x) ?? 0), 0);
// los dólares, con seis decimales: alcanza para ver el costo de una consulta barata
const usd = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : null);

/** Qué armó el Analista, en pocas palabras ("Ranking: Ventas al cupo"), leído de la consulta guardada. */
function resumenDelAnalista(c) {
  try {
    const q = JSON.parse(c.respuestaJson ?? '{}').consulta;
    // las guardadas antes de los menús de selección múltiple traen un solo tipo y una sola medida
    const tipos = q?.tipos ?? (q?.tipo ? [q.tipo] : []);
    if (!tipos.length) return '';
    const medidas = (q.metricas ?? (q.metrica ? [q.metrica] : [])).map((k) => METRICAS[k]?.nombre ?? k);
    return `${tipos.map((t) => TIPOS[t]?.etiqueta ?? t).join(' + ')}${medidas.length ? `: ${medidas.join(' + ')}` : ''}`;
  } catch {
    return '';
  }
}

/**
 * Todo lo que muestra el panel de administrador.
 *
 * `veredictoDe(consulta)`: para las consultas del Polígrafo guardadas antes de que se
 * anotara el veredicto, lo calcula con los datos de hoy (lo pasa api/admin.js; puede
 * devolver null). Las que ya lo traen no lo usan.
 *
 * Devuelve { generado, totales, cuentas, consultas, indeterminadas, sinCobrar, compras }.
 */
export async function panelDeAdministrador(base, { veredictoDe = null, ahora = new Date() } = {}) {
  const [usuarios, todas, movimientos] = await Promise.all([base.usuarios(), base.todasLasConsultas(), base.todosLosMovimientos()]);
  const mailDe = new Map(usuarios.map((u) => [u.uid, u.email ?? '']));

  // ---- las consultas que se cobraron
  const consultas = todas
    .map((c) => {
      const esPoligrafo = c.herramienta === 'poligrafo';
      let veredicto = esPoligrafo ? (c.veredicto ?? null) : null;
      let calculadoHoy = false;
      if (esPoligrafo && !veredicto && veredictoDe) {
        veredicto = veredictoDe(c) ?? null;
        calculadoHoy = Boolean(veredicto);
      }
      const precio = c.precio ?? 0;
      // las primeras consultas (22/11/2026) guardaron el costo con otro nombre
      const costo = usd(c.costoParaExploraUsd ?? c.costoUsd);
      return {
        id: c.id,
        uid: c.uid,
        email: mailDe.get(c.uid) ?? '',
        fecha: c.fecha,
        herramienta: c.herramienta,
        pedido: c.pedido ?? '',
        contexto: c.contexto ?? '',
        // el resultado, en una palabra: el veredicto del Polígrafo o qué armó el Analista
        resultado: esPoligrafo ? (veredicto?.estado ?? '') : resumenDelAnalista(c),
        veredicto,
        calculadoHoy,
        primera: c.primera ?? null,
        motor: c.motor ?? '',
        modelo: c.modelo ?? '',
        // tokens del modelo de IA (no son los tokens de explorarg)
        entrada: c.uso?.entrada ?? null,
        entradaDeCache: c.uso?.entradaDeCache ?? null,
        entradaACache: c.uso?.entradaACache ?? null,
        salida: c.uso?.salida ?? null,
        // tokens de explorarg
        estimado: c.estimado ?? null,
        precio,
        cobradoUsd: usd(precio / POR_DOLAR),
        costoListaUsd: usd(c.costoListaUsd),
        costoExploraUsd: costo,
        diferenciaUsd: costo === null ? null : usd(precio / POR_DOLAR - costo),
      };
    })
    .sort(porFechaDesc);

  // ---- las frases que el Polígrafo no pudo comprobar: una fila por afirmación
  const indeterminadas = consultas.flatMap((c) =>
    (c.veredicto?.afirmaciones ?? [])
      .filter((a) => a.estado === 'INDETERMINADO')
      .map((a) => ({
        consultaId: c.id,
        fecha: c.fecha,
        email: c.email,
        pedido: c.pedido,
        resultadoDeLaFrase: c.veredicto.estado,
        afirmacion: a.cita ?? '',
        motivo: a.motivo ?? '',
        calculadoHoy: c.calculadoHoy,
      }))
  );

  // ---- las consultas que no se cobraron (fallaron o no se pudieron responder)
  const sinCobrar = movimientos
    .filter((m) => m.tipo === 'consulta' && m.estado === 'anulada')
    .map((m) => ({
      id: m.id,
      uid: m.uid,
      email: mailDe.get(m.uid) ?? '',
      fecha: m.fecha,
      herramienta: m.herramienta ?? '',
      motivo: m.motivo ?? '',
      motivoTxt: MOTIVOS[m.motivo] ?? m.motivo ?? '',
      pedido: m.pedido ?? '',
      motor: m.motor ?? '',
      modelo: m.modelo ?? '',
      costoExploraUsd: usd(m.costoParaExploraUsd),
    }))
    .sort(porFechaDesc);

  // ---- las compras de tokens (y las que después se anularon)
  const anuladas = new Set(movimientos.filter((m) => m.tipo === 'devolucion_compra').map((m) => `${m.uid}|${m.medio}|${m.pagoId}`));
  const compras = movimientos
    .filter((m) => m.tipo === 'compra')
    .map((m) => ({
      id: m.id,
      uid: m.uid,
      email: mailDe.get(m.uid) ?? '',
      fecha: m.fecha,
      tokens: m.monto ?? 0,
      pesos: m.pesos ?? null,
      dolar: m.dolar ?? null,
      medio: m.medio ?? '',
      pagoId: m.pagoId ?? '',
      // el pago se devolvió o el comprador lo desconoció: los tokens se sacaron
      anulada: anuladas.has(`${m.uid}|${m.medio}|${m.pagoId}`),
    }))
    .sort(porFechaDesc);
  const vigentes = compras.filter((c) => !c.anulada);

  // ---- una fila por cuenta
  const cuentas = usuarios
    .map((u) => {
      const suyas = consultas.filter((c) => c.uid === u.uid);
      const suyasSinCobrar = sinCobrar.filter((m) => m.uid === u.uid);
      const gastado = u.gastado ?? 0;
      const costo = suma(suyas, (c) => c.costoExploraUsd) + suma(suyasSinCobrar, (m) => m.costoExploraUsd);
      const bienvenida = movimientos.find((m) => m.uid === u.uid && m.tipo === 'credito_inicial')?.monto ?? CREDITO_INICIAL;
      return {
        uid: u.uid,
        email: u.email ?? '',
        nombre: u.nombre ?? '',
        creada: u.creada ?? '',
        saldo: u.saldo ?? 0,
        bienvenida,
        comprado: u.comprado ?? 0,
        consultas: u.consultas ?? suyas.length,
        gastado,
        porHerramienta: Object.fromEntries(
          Object.keys(HERRAMIENTAS).map((h) => {
            const deEsa = suyas.filter((c) => c.herramienta === h);
            return [h, { consultas: deEsa.length, gastado: suma(deEsa, (c) => c.precio) }];
          })
        ),
        sinCobrar: suyasSinCobrar.length,
        cobradoUsd: usd(gastado / POR_DOLAR),
        costoExploraUsd: usd(costo),
        ultimaConsulta: suyas[0]?.fecha ?? '',
      };
    })
    .sort((a, b) => b.gastado - a.gastado || (a.creada < b.creada ? 1 : -1));

  const gastado = suma(cuentas, (c) => c.gastado);
  const costoExploraUsd = usd(suma(cuentas, (c) => c.costoExploraUsd));
  const totales = {
    cuentas: cuentas.length,
    bienvenida: suma(cuentas, (c) => c.bienvenida),
    comprado: suma(cuentas, (c) => c.comprado),
    compras: vigentes.length,
    comprasAnuladas: compras.length - vigentes.length,
    // lo que entró por la venta de tokens, en pesos (sin las compras anuladas)
    vendidoPesos: suma(vigentes, (c) => c.pesos),
    gastado,
    saldo: suma(cuentas, (c) => c.saldo),
    consultas: consultas.length,
    sinCobrar: sinCobrar.length,
    indeterminadas: indeterminadas.length,
    frasesConIndeterminado: new Set(indeterminadas.map((x) => x.consultaId)).size,
    cobradoUsd: usd(gastado / POR_DOLAR),
    costoExploraUsd,
    diferenciaUsd: usd(gastado / POR_DOLAR - costoExploraUsd),
  };

  return { generado: ahora.toISOString(), totales, cuentas, consultas, indeterminadas, sinCobrar, compras };
}
