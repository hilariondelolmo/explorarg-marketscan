// Cuentas de explorarg.com - el rechazo que la página le muestra a la persona.
//
// Vive en su propio archivo porque lo usan cuenta.js y precios.js (que se importan entre sí).

/** Un rechazo que la página le muestra a la persona (sin saldo, demasiados intentos, sin base, sin precios). */
export class ErrorDeCuenta extends Error {
  constructor(estadoHttp, codigo, mensaje, extra = {}) {
    super(mensaje);
    this.estadoHttp = estadoHttp;
    this.codigo = codigo;
    this.extra = extra;
  }
}
