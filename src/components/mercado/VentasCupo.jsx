import ComprasCupo from './ComprasCupo.jsx';

/**
 * Ventas al cupo por elaboradora (/mercado/ventas-cupo): el mismo tablero de
 * Compras al cupo visto desde quien vende (dashboard EXPLORA QS SELLER del
 * libro Tableau 02). La tabla abre por grupo económico, con sus petroleras
 * y, desplegado, sus elaboradoras; el treemap y las tortas del mapa se
 * colorean por petrolera.
 */
export default function VentasCupo(props) {
  return <ComprasCupo {...props} vista="ventas" />;
}
