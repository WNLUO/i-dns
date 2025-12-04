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
export const semantic = {
  success: colors.emerald400,
  warning: colors.orange500,
  danger: colors.red500,
  info: colors.blue400,

  background: {
    primary: colors.slate950,
    secondary: colors.slate900,
    tertiary: colors.slate800,
    elevated: colors.slate700,
  },

  text: {
    primary: colors.white,
    secondary: colors.slate300,
    tertiary: colors.slate400,
    disabled: colors.slate600,
  },

  border: {
    default: colors.slate700,
    focus: colors.emerald500,
    error: colors.red500,
  },
};

// 渐变定义
export const gradients = {
  emeraldGlow: [colors.emerald400, colors.emerald500, colors.emerald600],
  dangerGlow: [colors.red400, colors.red500, colors.red600],
  blueAurora: [colors.blue400, colors.blue500, colors.blue600],
  purpleAurora: [colors.purple400, colors.purple500, '#8b5cf6'],

  background: {
    radial: [colors.blue900 + '33', 'transparent', colors.emerald600 + '33'],
    card: [colors.slate800 + 'CC', colors.slate800 + '99'],
  },
};

// 透明度辅助函数
export const alpha = (color: string, opacity: number): string => {
  const hex = Math.round(opacity * 255).toString(16).padStart(2, '0');
  return color + hex;
};
