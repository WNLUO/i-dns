// 扩展的色彩系统
export const colors = {
  // Slate palette (保持原有)
  slate950: '#020617',
  slate900: '#0f172a',
  slate800: '#1e293b',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748b',
  slate400: '#94a3b8',
  slate300: '#cbd5e1',
  slate200: '#e2e8f0',
  slate100: '#f1f5f9',
  slate50: '#f8fafc',

  // Emerald palette (扩展)
  emerald600: '#059669',
  emerald500: '#10b981',
  emerald400: '#34d399',
  emerald300: '#6ee7b7',
  emerald200: '#a7f3d0',

  // Red palette (扩展)
  red600: '#dc2626',
  red500: '#ef4444',
  red400: '#f87171',
  red300: '#fca5a5',

  // Orange palette
  orange500: '#f97316',
  orange400: '#fb923c',

  // Blue palette (扩展)
  blue900: '#1e3a8a',
  blue600: '#2563eb',
  blue500: '#3b82f6',
  blue400: '#60a5fa',
  blue300: '#93c5fd',

  // Purple palette
  purple500: '#a855f7',
  purple400: '#c084fc',

  // Yellow palette
  yellow500: '#eab308',
  yellow400: '#facc15',

  // White & Black
  white: '#ffffff',
  black: '#000000',
};

// 语义化颜色
export type ThemeColors = typeof lightColors;

export const lightColors = {
  success: colors.emerald500,
  warning: colors.orange500,
  danger: colors.red500,
  info: colors.blue500,

  background: {
    primary: colors.white,      // Main background
    secondary: colors.slate50,  // Secondary background
    tertiary: colors.slate100,  // Subtle highlights
    elevated: colors.white,     // Cards
    modal: colors.white,
    input: colors.slate100,
  },

  text: {
    primary: colors.slate900,   // Main text
    secondary: colors.slate500, // Secondary text
    tertiary: colors.slate400,  // Muted text
    disabled: colors.slate300,
    inverse: colors.white,
  },

  border: {
    default: colors.slate200,   // Default borders
    focus: colors.blue500,
    error: colors.red500,
    subtle: colors.slate100,
  },

  icon: {
    primary: colors.slate900,
    secondary: colors.slate500,
    active: colors.blue600,
    inactive: colors.slate400,
  },

  status: {
    active: colors.emerald500,
    inactive: colors.slate400,
    warning: colors.orange500,
    error: colors.red500,
  }
};

export const darkColors: ThemeColors = {
  success: colors.emerald400,
  warning: colors.orange400,
  danger: colors.red400,
  info: colors.blue400,

  background: {
    primary: colors.slate950,   // Main background
    secondary: colors.slate900, // Secondary background
    tertiary: colors.slate800,  // Subtle highlights
    elevated: colors.slate900,  // Cards
    modal: colors.slate900,
    input: colors.slate800,
  },

  text: {
    primary: colors.slate50,    // Main text
    secondary: colors.slate400, // Secondary text
    tertiary: colors.slate500,  // Muted text
    disabled: colors.slate600,
    inverse: colors.slate950,
  },

  border: {
    default: colors.slate800,   // Default borders
    focus: colors.blue400,
    error: colors.red400,
    subtle: colors.slate800,
  },

  icon: {
    primary: colors.slate50,
    secondary: colors.slate400,
    active: colors.blue400,
    inactive: colors.slate600,
  },

  status: {
    active: colors.emerald400,
    inactive: colors.slate600,
    warning: colors.orange400,
    error: colors.red400,
  }
};

// 渐变定义
export const gradients = {
  // Softer glows for light mode
  emeraldGlow: [colors.emerald300, colors.emerald400],
  dangerGlow: [colors.red300, colors.red400],
  blueAurora: [colors.blue300, colors.blue400],

  // Minimalist gradients
  primaryButton: [colors.slate800, colors.slate900], // Dark button on light bg

  background: {
    // Very subtle gradient or just white
    light: [colors.white, colors.slate50],
  },
};

// 透明度辅助函数
export const alpha = (color: string, opacity: number): string => {
  const hex = Math.round(opacity * 255).toString(16).padStart(2, '0');
  return color + hex;
};
