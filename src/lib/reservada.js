// Área reservada - cómo pide la página sus datos.
//
// Los datos del área reservada no viajan con la página: se piden a /api/reservada con
// la credencial de la sesión, y el servidor decide si esa persona puede verlos
// (server/reservada/acceso.js). Acá solo se le muestra a cada uno en qué quedó.
//
//   const { estado, datos, error } = useReservada('crushing');
//
// `estado`:
//   'cargando'       todavía no llegó la respuesta;
//   'listo'          `datos` trae el conjunto;
//   'no_autorizado'  hay sesión, pero esa cuenta no figura entre las autorizadas;
//   'sin_datos'      la persona entra, pero el conjunto todavía no está cargado;
//   'error'          no se pudo leer (`error` dice por qué).

import { useEffect, useState } from 'react';
import { useCuenta } from './cuenta/Cuenta.jsx';

export function useReservada(que) {
  const cuenta = useCuenta();
  const [respuesta, setRespuesta] = useState({ estado: 'cargando', datos: null, error: null });
  const { puedeConsultar, cabeceras } = cuenta;
  const uid = cuenta.usuario?.uid ?? null;

  useEffect(() => {
    if (!puedeConsultar) return undefined;
    let vivo = true;
    setRespuesta({ estado: 'cargando', datos: null, error: null });
    (async () => {
      try {
        const r = await fetch(`/api/reservada?que=${encodeURIComponent(que)}`, { headers: await cabeceras() });
        const cuerpo = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (r.ok) setRespuesta({ estado: 'listo', datos: cuerpo, error: null });
        else if (r.status === 403 && cuerpo.codigo === 'no_autorizado') setRespuesta({ estado: 'no_autorizado', datos: null, error: cuerpo.error });
        else if (cuerpo.codigo === 'sin_datos') setRespuesta({ estado: 'sin_datos', datos: null, error: cuerpo.error });
        else setRespuesta({ estado: 'error', datos: null, error: cuerpo.error ?? 'No se pudieron leer los datos.' });
      } catch {
        if (vivo) setRespuesta({ estado: 'error', datos: null, error: 'No se pudieron leer los datos. Revisá la conexión.' });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [que, puedeConsultar, uid, cabeceras]);

  return respuesta;
}
