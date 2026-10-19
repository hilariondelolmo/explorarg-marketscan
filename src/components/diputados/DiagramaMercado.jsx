/**
 * "La no integrada compra el aceite al competidor y vende al que tiene el 60%":
 * esquema del mercado del artículo del 13/10/2026, rehecho nativo (SVG).
 * Usa la paleta del artículo de Reforma (ReformaLey.css mapea estos mismos
 * colores al tema oscuro por selector de atributo): cajas grises, la no
 * integrada resaltada en violeta.
 */
const GRIS = { fill: '#F1EFE8', stroke: '#5F5E5A', titulo: '#444441', texto: '#5F5E5A' };
const VIOLETA = { fill: '#EEEDFE', stroke: '#534AB7', titulo: '#3C3489', texto: '#534AB7' };

const CAJAS = [
  { x: 40, y: 90, pal: GRIS, titulo: 'Aceiteras integradas', l1: '6 plantas · 2,6 Mt de capacidad', l2: 'muelen su poroto y exportan' },
  { x: 710, y: 90, pal: GRIS, titulo: 'Exportación', l1: '239.000 t en los últimos 12 meses', l2: '968.000 t en 2022' },
  { x: 40, y: 310, pal: VIOLETA, titulo: 'No integradas', l1: '24 plantas · 1,3 Mt · 5 provincias', l2: 'compran todo el aceite', resaltada: true },
  { x: 710, y: 310, pal: GRIS, titulo: 'Mezcladores', l1: 'YPF 60% · cuatro suman 99%', l2: 'petroleras obligadas a mezclar' },
  { x: 40, y: 530, pal: GRIS, titulo: 'Secretaría de Energía', l1: 'reparte el cupo y fija el precio', l2: 'fija el corte, no lo hace cumplir' },
  { x: 710, y: 530, pal: GRIS, titulo: 'Surtidor', l1: 'corte obligatorio 7,5%', l2: 'corte real 6,2% · cumplimiento 83%' },
];
const ANCHO = 430;
const ALTO = 120;
const FLECHA = { stroke: '#5F5E5A', strokeWidth: 1.6, fill: 'none', markerEnd: 'url(#dm-flecha)' };

export default function DiagramaMercado({ sinTitulo = false }) {
  return (
    <svg
      className="dip-diagrama"
      viewBox={sinTitulo ? '0 70 1180 620' : '0 0 1180 690'}
      role="img"
      aria-label="Esquema del mercado: las aceiteras integradas exportan el biodiésel y venden el aceite de soja a las no integradas; las no integradas venden biodiésel para el corte a los mezcladores; la Secretaría de Energía les asigna cupo y precio y fija el corte; los mezcladores llevan el gas oil con biodiésel al surtidor."
    >
      <defs>
        <marker id="dm-flecha" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M2 1L8 5L2 9" fill="none" stroke="#5F5E5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      {!sinTitulo && (
        <text x={20} y={40} fontSize={24} fontWeight={650} fill="#444441">
          La no integrada compra el aceite al competidor y vende al que tiene el 60%
        </text>
      )}

      {CAJAS.map((c) => (
        <g key={c.titulo}>
          <rect x={c.x} y={c.y} width={ANCHO} height={ALTO} rx={10} fill={c.pal.fill} stroke={c.pal.stroke} strokeWidth={c.resaltada ? 2.2 : 1} />
          <text x={c.x + ANCHO / 2} y={c.y + 44} fontSize={22} fontWeight={650} textAnchor="middle" fill={c.pal.titulo}>{c.titulo}</text>
          <text x={c.x + ANCHO / 2} y={c.y + 74} fontSize={17} textAnchor="middle" fill={c.pal.texto}>{c.l1}</text>
          <text x={c.x + ANCHO / 2} y={c.y + 100} fontSize={17} textAnchor="middle" fill={c.pal.texto}>{c.l2}</text>
        </g>
      ))}

      {/* Aceiteras → Exportación */}
      <line x1={470} y1={150} x2={702} y2={150} {...FLECHA} />
      <text x={590} y={140} fontSize={17} textAnchor="middle" fill="#5F5E5A">exportan el biodiésel</text>

      {/* Aceiteras → No integradas */}
      <line x1={255} y1={210} x2={255} y2={302} {...FLECHA} />
      <text x={272} y={262} fontSize={17} fill="#5F5E5A">aceite de soja: el 76% del costo</text>

      {/* No integradas → Mezcladores */}
      <line x1={470} y1={370} x2={702} y2={370} {...FLECHA} />
      <text x={590} y={360} fontSize={17} textAnchor="middle" fill="#5F5E5A">biodiésel para el corte</text>

      {/* Secretaría → No integradas */}
      <line x1={255} y1={530} x2={255} y2={438} {...FLECHA} />
      <text x={272} y={490} fontSize={17} fill="#5F5E5A">cupo y precio</text>

      {/* Secretaría → Mezcladores (fija el corte) */}
      <path d="M470 590 L650 590 L650 400 L702 400" {...FLECHA} />
      <text x={560} y={578} fontSize={17} textAnchor="middle" fill="#5F5E5A">fija el corte: 7,5%</text>

      {/* Mezcladores → Surtidor */}
      <line x1={925} y1={430} x2={925} y2={522} {...FLECHA} />
      <text x={942} y={482} fontSize={17} fill="#5F5E5A">gas oil con biodiésel</text>
    </svg>
  );
}
