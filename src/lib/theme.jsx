import { createContext, useContext, useEffect, useState } from 'react';

/**
 * Sistema de temas del sitio: claro (default, estilo Tablero v16 de
 * portal-explora) y oscuro (paleta original del dashboard).
 *
 * Los tokens de layout viven en CSS (global.css: :root + [data-theme]).
 * Este módulo provee el tema activo y la paleta equivalente para los
 * charts de Recharts, que no resuelven variables CSS en sus atributos SVG.
 */

const ThemeContext = createContext({ theme: 'light', toggle: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('explorarg-tema') || 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('explorarg-tema', theme);
    } catch {
      /* modo privado */
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Paletas de charts por tema. Misma semántica, tonos según fondo. */
export const PALETAS = {
  light: {
    bio: '#4d8b31',        // verde biodiesel
    oil: '#b45309',        // ámbar gas oil / exportaciones
    warn: '#eab308',       // amarillo semáforo (tono "medio")
    exp: '#1e3a8a',        // azul marino cupo / primario
    expDim: '#b9c7e4',
    neutral: '#6b7280',    // gris comercializadoras / acumulados
    alert: '#dc2626',      // rojo déficit
    ink: '#1a1a1a',        // series destacadas (cumplimiento)
    celeste: '#0ea5e9',    // gestiones: presidencias del FPV / FDT
    violeta: '#7c3aed',    // gestiones: presidencia de LLA (Cambiemos usa warn)
    grid: '#e5e2dc',
    axis: '#d1cdc7',
    tick: '#6b7280',
    cursor: 'rgba(0, 0, 0, 0.04)',
    cursorLinea: '#d1cdc7',
    bioFill: 'rgba(77, 139, 49, 0.18)',
    bioFillFuerte: 'rgba(77, 139, 49, 0.45)',
    oilFill: 'rgba(180, 83, 9, 0.16)',
    oilFillFuerte: 'rgba(180, 83, 9, 0.4)',
    expFill: 'rgba(30, 58, 138, 0.12)',
    neutralFill: 'rgba(107, 114, 128, 0.3)',
    alertFill: 'rgba(220, 38, 38, 0.22)',
    banda: 'rgba(107, 114, 128, 0.08)',
    bandaSuave: 'rgba(107, 114, 128, 0.02)',
  },
  dark: {
    bio: '#7FB069',
    oil: '#D4A574',
    warn: '#F2C744',
    exp: '#4A8FA8',
    expDim: '#2F5668',
    neutral: '#8B9AAB',
    alert: '#C67B5C',
    ink: '#E8ECF0',
    celeste: '#5BB8E6',
    violeta: '#A78BFA',
    grid: '#1E2832',
    axis: '#2A3340',
    tick: '#6B7680',
    cursor: 'rgba(255, 255, 255, 0.04)',
    cursorLinea: '#2A3340',
    bioFill: 'rgba(127, 176, 105, 0.14)',
    bioFillFuerte: 'rgba(127, 176, 105, 0.55)',
    oilFill: 'rgba(212, 165, 116, 0.25)',
    oilFillFuerte: 'rgba(212, 165, 116, 0.5)',
    expFill: 'rgba(74, 143, 168, 0.12)',
    neutralFill: 'rgba(139, 154, 171, 0.45)',
    alertFill: 'rgba(198, 123, 92, 0.3)',
    banda: 'rgba(139, 154, 171, 0.07)',
    bandaSuave: 'rgba(139, 154, 171, 0.015)',
  },
};

export function useChartColors() {
  const { theme } = useTheme();
  return PALETAS[theme];
}
