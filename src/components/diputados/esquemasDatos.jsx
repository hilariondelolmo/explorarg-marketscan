import { useEffect, useMemo, useState } from 'react';
import petroleras from '../../data/petroleras.json';
import corte from '../../data/corte.json';
import RankingCumplimiento from '../gestion/RankingCumplimiento.jsx';
import PreciosComparados from '../gasoil/PreciosComparados.jsx';
import { cargarImportaciones, ULTIMO_MES } from '../../lib/gasoil.js';
import { fmt } from '../../lib/format.js';
import { Esq, Barras, Cifras } from './esquemas.jsx';

/**
 * Esquemas de "Los números de hoy" que toman los datos vivos del sitio
 * (pedido de HDO, 19/10/2026): el cumplimiento del corte por mezcladora, las
 * importaciones de gas oil y los precios comparados de la página de Gas Oil.
 * A diferencia de las cifras del artículo, estos cuadros se mueven cuando se
 * regeneran los datos (scripts/regenerate_data.py y regenerate_gasoil.py).
 */

const DENSIDAD_BIO = corte.densidad_bio;
const OBLIG = new Map(corte.mensual.map((m) => [m.fecha, m.obligatorio]));
const GO_M3 = new Map(corte.mensual.map((m) => [m.fecha, m.go_m3]));
const { desde: DESDE_12, hasta: HASTA_12 } = petroleras.periodo_12m;
const en12 = (f) => f >= DESDE_12 && f <= HASTA_12;
const rotulo12 = `${fmt.monthShort(DESDE_12)} a ${fmt.monthShort(HASTA_12)}`;

/* ── Cumplimiento del corte por mezcladora, últimos doce meses ──
   Misma cuenta que la página Cumplimiento Corte (PetrolerasCumplimiento.jsx):
   bio recibido de elaboradoras (m³) sobre el gas oil grado 2 y 3 vendido por
   cada petrolera (sin bunker ni usinas) por el corte obligatorio de cada mes;
   solo las petroleras con cupo asignado en el período (las revendedoras
   compran gas oil ya cortado). */
function cumplimientoPorMezcladora() {
  const ventana = petroleras.go_mensual.filter((r) => en12(r.fecha) && OBLIG.get(r.fecha) != null);
  const fechas = new Set(ventana.map((r) => r.fecha));
  const requerido = new Map();
  for (const row of ventana) {
    for (const [pet, go] of Object.entries(row)) {
      if (pet === 'fecha') continue;
      requerido.set(pet, (requerido.get(pet) || 0) + go * OBLIG.get(row.fecha));
    }
  }
  const recibido = new Map();
  for (const row of petroleras.mensual) {
    if (!fechas.has(row.fecha)) continue;
    for (const [pet, ton] of Object.entries(row)) {
      if (pet === 'fecha' || !ton) continue;
      recibido.set(pet, (recibido.get(pet) || 0) + ton / DENSIDAD_BIO);
    }
  }
  const conCupo = new Set(petroleras.cumplimiento.filter((r) => fechas.has(r.fecha) && (r.cupo || 0) > 0).map((r) => r.petrolera));
  const goTotal = [...requerido.values()].reduce((a, b) => a + b, 0);
  return [...requerido.entries()]
    .filter(([pet, req]) => req > 1000 && conCupo.has(pet))
    .map(([pet, req]) => ({
      nombre: pet,
      valor: ((recibido.get(pet) || 0) / req) * 100,
      detalle: `${fmt.pct((req / goTotal) * 100)} del gas oil que lleva corte`,
    }))
    .sort((a, b) => b.valor - a.valor);
}

export function CumplimientoMezcladoras({ texto }) {
  const items = useMemo(cumplimientoPorMezcladora, []);
  return (
    <Esq
      titulo="Cumplimiento del corte por mezcladora, últimos doce meses."
      texto={texto}
      nota={`${rotulo12}. Cumplimiento = biodiésel comprado a las elaboradoras sobre el biodiésel que exigían sus ventas de gas oil grado 2 y 3 (sin bunker ni usinas) al corte obligatorio de cada mes. Solo las petroleras con cupo asignado: las revendedoras compran gas oil ya cortado. Fuente: Secretaría de Energía, elaboración explorarg.com.`}
    >
      <RankingCumplimiento items={items} />
    </Esq>
  );
}

/* ── Importaciones de gas oil ── Despachos de importación por año, sin CAMMESA
   (que importa para las usinas), y los últimos doce meses contra el gas oil
   vendido en el país (grados 2 y 3, sin bunker ni usinas, el mismo denominador
   del corte real). */
export function ImportacionesGasoil({ texto }) {
  const [D, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    cargarImportaciones().then(setD).catch((e) => setError(e.message));
  }, []);
  const datos = useMemo(() => {
    if (!D) return null;
    const porAnio = new Map();
    let ult12 = 0;
    for (let r = 0; r < D.filas; r++) {
      if (D.imp[r] === D.cammesa) continue;
      const f = D.meses[D.mes[r]];
      const a = f.slice(0, 4);
      porAnio.set(a, (porAnio.get(a) || 0) + D.ton[r]);
      if (en12(f)) ult12 += D.ton[r];
    }
    const anios = [...porAnio.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const goM3 = [...GO_M3.entries()].filter(([f]) => en12(f)).reduce((s, [, v]) => s + (v || 0), 0);
    const share = goM3 ? ((ult12 / D.densidad_go) / goM3) * 100 : null;
    const ultimoAnio = D.ultimo_mes.slice(0, 4);
    const ultimoMesN = Number(D.ultimo_mes.slice(5, 7));
    return { anios, ult12, share, ultimoAnio, ultimoMesN, max: Math.max(...anios.map(([, t]) => t)) };
  }, [D]);
  return (
    <Esq
      titulo="Las importaciones de gas oil."
      texto={texto}
      nota={`Despachos de importación de gas oil por año, en toneladas, sin CAMMESA (que importa para las usinas eléctricas). Último mes: ${fmt.monthShort(ULTIMO_MES)}. Fuente: despachos de importación por aduana, elaboración explorarg.com.`}
    >
      {error && <p className="esq-pie">{error}</p>}
      {!datos && !error && <p className="esq-pie">Cargando los despachos de importación…</p>}
      {datos && (
        <>
          <Cifras
            items={[
              { valor: `${fmt.int(datos.ult12)} t`, texto: `de gas oil importado en los últimos doce meses (${rotulo12})` },
              { valor: datos.share != null ? fmt.pct(datos.share) : '-', texto: 'del gas oil vendido en el país en esos doce meses (grados 2 y 3, sin bunker ni usinas)' },
            ]}
          />
          <div className="esq-separador" />
          <Barras
            max={datos.max}
            filas={datos.anios.map(([a, t]) => ({
              label: a === datos.ultimoAnio && datos.ultimoMesN < 12 ? `${a} (hasta ${fmt.monthOnly(D.ultimo_mes)})` : a,
              valor: t,
              texto: `${fmt.int(t)} t`,
            }))}
          />
        </>
      )}
    </Esq>
  );
}

/* ── Precios comparados ── Los seis gráficos y el comparativo de la página de
   Gas Oil (Biodiésel vs. gas oil, Precios comparados), con los valores que
   fijó HDO: precio sin impuestos, minorista y mayorista, todos los tipos de
   negocio y canales de comercialización, ponderado por volumen, sin la Zona
   Fría, febrero de 2010 al último mes, en dólares corrientes por tonelada. */
export function PreciosComparadosEsq({ texto }) {
  return (
    <Esq
      titulo="Precios comparados: gas oil y biodiésel, sin impuestos."
      texto={texto}
      nota={`Precios sin impuestos, de todos los canales de distribución (minorista y mayorista), todos los tipos de negocio y todos los canales de comercialización, ponderados por volumen y sin la Zona Fría. Febrero de 2010 a ${fmt.monthShort(ULTIMO_MES)}, en dólares corrientes por tonelada. Gas oil grado 2 y 3: relevamiento Res. 1104; gas oil importado: CIF de los despachos, sin CAMMESA; Brent: informe de regalías de la Secretaría de Energía; biodiésel: precio Res. 963 (mediana); aceite de soja: FAS MINAGRI. Cada gráfico se abre en grande con un clic. El último gráfico compara el biodiésel con el gas oil grado 2 y 3 sin impuestos; las barras del eje derecho son la diferencia del mes en %.`}
    >
      <PreciosComparados
        embebido
        inicial={{ desde: '2010-02', hasta: ULTIMO_MES, unidadId: 'ton', moneda: 'usd', constantes: false, goComp: 'g23', sinZonaFria: true }}
        panelesIds={['go2', 'go3', 'imp', 'brent', 'bio', 'aceite']}
      />
    </Esq>
  );
}

/* ── Cupo por grupo económico ── Cupo asignado en los últimos doce meses
   (septiembre de 2025 a agosto de 2026, empresas.json) a las 24 no integradas
   que vendieron al corte, sumado por grupo, contra su capacidad (capacidad.json).
   Cupos por planta: Bahía Energía = Bio Ramallo 43.695 + Biobahía 43.695 +
   Biobin 43.695 + Diferoil 41.956 + Biobal 19.151 + Biocorba 19.151 + Refinar
   19.151 + Colalao 15.741; Cremer y Rosario Bio 2 × 43.695; Bolzan 43.695 +
   12.596; Unitec Bio 43.471; Explora y Diaser 43.695; las otras siete (Aripar,
   Enresa, Pampa Bio, AOM, ERA, Doble L, Agro M y G) 207.627 en total. */
const CUPOS = [
  ['Grupo Bahía Energía', 348000, 246235, 'ocho sociedades'],
  ['Las otras 7 plantas', 241200, 207627, 'una planta cada una'],
  ['Grupo Cremer', 100000, 87390, 'dos plantas'],
  ['Grupo Rosario Bio', 100000, 87390, 'dos plantas'],
  ['Grupo Bolzan', 60800, 56291, 'dos plantas'],
  ['Explora', 120000, 43695, 'una planta'],
  ['Diaser', 96000, 43695, 'una planta'],
  ['Unitec Bio', 240000, 43471, 'una planta'],
];

export function CupoPorGrupo({ texto }) {
  return (
    <Esq
      titulo="El cupo se reparte por igual, 43.695 toneladas en doce meses para casi todas las plantas."
      texto={texto}
      nota="A los grupos económicos se les reparte esa cantidad por cada una de sus plantas. Las únicas que sufren la restricción son Unitec Bio, Explora y Diaser: con una sola planta de 240.000, 120.000 y 96.000 toneladas, reciben el mismo cupo que una planta de 50.000. Cupo asignado de septiembre de 2025 a agosto de 2026 (en color) sobre la capacidad registrada (en gris). Fuente: Secretaría de Energía, elaboración explorarg.com."
    >
      <Barras
        max={348000}
        filas={CUPOS.map(([label, capacidad, cupo, detalle]) => ({
          label,
          valor: capacidad,
          tono: 'suave',
          capa: { hasta: cupo },
          texto: `cupo ${fmt.int(cupo)} t · capacidad ${fmt.int(capacidad)} t · ${detalle}`,
        }))}
      />
      <div className="esq-leyenda">
        <span><i className="esq-muestra" /> Cupo asignado en doce meses</span>
        <span><i className="esq-muestra suave" /> Capacidad registrada</span>
      </div>
    </Esq>
  );
}
