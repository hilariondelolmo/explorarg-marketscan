// Cuentas de explorarg.com - dónde se guarda la cuenta corriente.
//
// Dos bases con la misma forma de uso:
//
//   firestore   La de verdad: Cloud Firestore, en el proyecto de Firebase del sitio.
//               Una ficha por persona en la colección "usuarios" y, adentro, sus
//               movimientos y sus consultas.
//   memoria     Para probar: vive mientras corre el programa y después se pierde.
//               La usan los controles (scripts/cuentas_prueba.mjs) y el sitio
//               local con el emulador (vite --mode cuentas).
//
// Lo que ofrecen las dos:
//
//   base.transaccion(uid, async (t) => { ... })   todo o nada, y de a uno por persona:
//       await t.usuario()                la ficha, o null si todavía no existe
//       t.guardarUsuario(datos)          la reemplaza
//       await t.movimiento(id)           un movimiento, o null
//       t.agregarMovimiento(datos)       devuelve el id del movimiento nuevo
//       t.cambiarMovimiento(id, cambios)
//     Regla de Firestore: dentro de una transacción, primero todas las lecturas
//     y después las escrituras.
//   base.guardarConsulta(uid, datos)     devuelve el id
//   base.movimientos(uid, max)           los más nuevos primero
//   base.consultas(uid, max)             las más nuevas primero
//   base.consulta(uid, id)               una consulta guardada, o null
//   base.borrarUsuario(uid)              solo para los controles
//   Para la venta de tokens (server/pagos/):
//       t.ponerMovimiento(id, datos)     dentro de la transacción: un movimiento con el id que se le
//                                        da (el del pago), para que un mismo pago no se acredite dos veces
//   base.guardarCompra(uid, datos)       una orden de compra (lo que la persona eligió comprar); devuelve el id
//   base.compra(uid, id)                 la orden, o null
//   base.cambiarCompra(uid, id, cambios)
//   base.ajuste(clave)                   un dato del sitio que no es de nadie (la última cotización del dólar), o null
//   base.guardarAjuste(clave, datos)
//   base.borrarAjuste(clave)             solo para los controles
//   Para el panel de administrador (todas las cuentas juntas; cada fila trae su `uid`):
//   base.usuarios()                      las fichas de todas las personas
//   base.todasLasConsultas()             las consultas guardadas de todos
//   base.todosLosMovimientos()           los movimientos de todos
//
// Las fechas se guardan como texto ISO (2026-11-22T21:40:00.000Z): se ordenan
// solas y valen igual en las dos bases.

import { randomUUID } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { app, estadoCuentas, hayLlave } from './firebase.js';

// ------------------------------------------------------------------ memoria

export function baseEnMemoria() {
  const personas = new Map(); // uid -> { usuario, movimientos: Map, consultas: [], compras: Map }
  const colas = new Map(); // uid -> la promesa de la última transacción (van de a una)
  const ajustes = new Map(); // clave -> datos
  const de = (uid) => {
    if (!personas.has(uid)) personas.set(uid, { usuario: null, movimientos: new Map(), consultas: [], compras: new Map() });
    return personas.get(uid);
  };
  const copia = (x) => (x === null || x === undefined ? null : structuredClone(x));
  const porFecha = (a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0);

  return {
    tipo: 'memoria',
    transaccion(uid, hacer) {
      const correr = async () => {
        const p = de(uid);
        // se trabaja sobre una copia: si `hacer` tira un error, no queda nada a medias
        const borrador = { usuario: copia(p.usuario), movimientos: new Map([...p.movimientos].map(([k, v]) => [k, copia(v)])) };
        const resultado = await hacer({
          usuario: async () => copia(borrador.usuario),
          guardarUsuario: (datos) => {
            borrador.usuario = copia(datos);
          },
          movimiento: async (id) => copia(borrador.movimientos.get(id)),
          agregarMovimiento: (datos) => {
            const id = randomUUID();
            borrador.movimientos.set(id, copia(datos));
            return id;
          },
          cambiarMovimiento: (id, cambios) => {
            borrador.movimientos.set(id, { ...borrador.movimientos.get(id), ...copia(cambios) });
          },
          ponerMovimiento: (id, datos) => {
            borrador.movimientos.set(id, copia(datos));
          },
        });
        p.usuario = borrador.usuario;
        p.movimientos = borrador.movimientos;
        return resultado;
      };
      const turno = (colas.get(uid) ?? Promise.resolve()).then(correr, correr);
      colas.set(uid, turno.catch(() => {}));
      return turno;
    },
    async guardarConsulta(uid, datos) {
      const id = randomUUID();
      de(uid).consultas.push({ id, ...copia(datos) });
      return id;
    },
    async movimientos(uid, max = 50) {
      return [...de(uid).movimientos].map(([id, m]) => ({ id, ...copia(m) })).sort(porFecha).slice(0, max);
    },
    async consultas(uid, max = 50) {
      return de(uid).consultas.map(copia).sort(porFecha).slice(0, max);
    },
    async consulta(uid, id) {
      return copia(de(uid).consultas.find((c) => c.id === id)) ?? null;
    },
    async borrarUsuario(uid) {
      personas.delete(uid);
    },
    async guardarCompra(uid, datos) {
      const id = randomUUID();
      de(uid).compras.set(id, copia(datos));
      return id;
    },
    async compra(uid, id) {
      const c = de(uid).compras.get(id);
      return c ? { id, ...copia(c) } : null;
    },
    async cambiarCompra(uid, id, cambios) {
      const p = de(uid);
      if (p.compras.has(id)) p.compras.set(id, { ...p.compras.get(id), ...copia(cambios) });
    },
    async ajuste(clave) {
      return copia(ajustes.get(clave)) ?? null;
    },
    async guardarAjuste(clave, datos) {
      ajustes.set(clave, copia(datos));
    },
    async borrarAjuste(clave) {
      ajustes.delete(clave);
    },
    async usuarios() {
      return [...personas].filter(([, p]) => p.usuario).map(([uid, p]) => ({ uid, ...copia(p.usuario) }));
    },
    async todasLasConsultas() {
      return [...personas].flatMap(([uid, p]) => p.consultas.map((c) => ({ uid, ...copia(c) })));
    },
    async todosLosMovimientos() {
      return [...personas].flatMap(([uid, p]) => [...p.movimientos].map(([id, m]) => ({ uid, id, ...copia(m) })));
    },
  };
}

// ------------------------------------------------------------------ firestore

export function baseFirestore(coleccion = process.env.CUENTAS_COLECCION || 'usuarios') {
  const db = getFirestore(app());
  const ficha = (uid) => db.collection(coleccion).doc(uid);
  const lista = async (ref, max) => (await ref.orderBy('fecha', 'desc').limit(max).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  // Lo de todas las personas de una vez (panel de administrador). La búsqueda trae las
  // subcolecciones con ese nombre de toda la base: se dejan solo las de esta colección
  // (así las de prueba, "pruebas_usuarios", no se mezclan con las de verdad).
  const deTodos = async (nombre) =>
    (await db.collectionGroup(nombre).get()).docs
      .filter((d) => d.ref.parent.parent?.parent.id === coleccion)
      .map((d) => ({ uid: d.ref.parent.parent.id, id: d.id, ...d.data() }));

  return {
    tipo: 'firestore',
    transaccion(uid, hacer) {
      return db.runTransaction((tx) =>
        hacer({
          usuario: async () => (await tx.get(ficha(uid))).data() ?? null,
          guardarUsuario: (datos) => {
            tx.set(ficha(uid), datos);
          },
          movimiento: async (id) => (await tx.get(ficha(uid).collection('movimientos').doc(id))).data() ?? null,
          agregarMovimiento: (datos) => {
            const ref = ficha(uid).collection('movimientos').doc();
            tx.set(ref, datos);
            return ref.id;
          },
          cambiarMovimiento: (id, cambios) => {
            tx.update(ficha(uid).collection('movimientos').doc(id), cambios);
          },
          ponerMovimiento: (id, datos) => {
            tx.set(ficha(uid).collection('movimientos').doc(id), datos);
          },
        })
      );
    },
    async guardarConsulta(uid, datos) {
      // a JSON plano: Firestore no acepta valores sin definir
      const ref = await ficha(uid).collection('consultas').add(JSON.parse(JSON.stringify(datos)));
      return ref.id;
    },
    movimientos: (uid, max = 50) => lista(ficha(uid).collection('movimientos'), max),
    consultas: (uid, max = 50) => lista(ficha(uid).collection('consultas'), max),
    async consulta(uid, id) {
      const d = await ficha(uid).collection('consultas').doc(id).get();
      return d.exists ? { id: d.id, ...d.data() } : null;
    },
    async borrarUsuario(uid) {
      await db.recursiveDelete(ficha(uid));
    },
    async guardarCompra(uid, datos) {
      const ref = await ficha(uid).collection('compras').add(JSON.parse(JSON.stringify(datos)));
      return ref.id;
    },
    async compra(uid, id) {
      const d = await ficha(uid).collection('compras').doc(id).get();
      return d.exists ? { id: d.id, ...d.data() } : null;
    },
    async cambiarCompra(uid, id, cambios) {
      await ficha(uid).collection('compras').doc(id).set(JSON.parse(JSON.stringify(cambios)), { merge: true });
    },
    // Los datos que no son de ninguna persona van en una colección hermana ("usuarios_ajustes")
    async ajuste(clave) {
      return (await db.collection(`${coleccion}_ajustes`).doc(clave).get()).data() ?? null;
    },
    async guardarAjuste(clave, datos) {
      await db.collection(`${coleccion}_ajustes`).doc(clave).set(JSON.parse(JSON.stringify(datos)));
    },
    async borrarAjuste(clave) {
      await db.collection(`${coleccion}_ajustes`).doc(clave).delete();
    },
    usuarios: async () => (await db.collection(coleccion).get()).docs.map((d) => ({ uid: d.id, ...d.data() })),
    todasLasConsultas: () => deTodos('consultas'),
    todosLosMovimientos: () => deTodos('movimientos'),
  };
}

// ------------------------------------------------------------------ cuál se usa

let abierta = null;

/**
 * La base que corresponde a como está configurado el sitio, o null si no hay
 * (cuentas reales pero sin la llave del servidor: no se puede cobrar, así que
 * tampoco se puede consultar).
 */
export function abrirBase() {
  if (abierta) return abierta;
  const estado = estadoCuentas();
  if (estado === 'emulador') abierta = baseEnMemoria();
  else if (estado === 'real' && hayLlave()) abierta = baseFirestore();
  return abierta;
}
