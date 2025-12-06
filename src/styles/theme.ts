import { useColorScheme } from 'react-native';
import { lightColors, darkColors, ThemeColors } from './colors';

export const useThemeColors = (): ThemeColors => {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? darkColors : lightColors;
};

export const colors = {
  // Slate palette
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

  // Emerald palette
  emerald500: '#10b981',
  emerald400: '#34d399',
  emerald300: '#6ee7b7',

  // Red palette
  red500: '#ef4444',
  red400: '#f87171',

  // Blue palette
  blue900: '#1e3a8a',
  blue500: '#3b82f6',
  blue400: '#60a5fa',
  blue300: '#93c5fd',

  // Orange palette
  orange500: '#f97316',

  // Purple palette
  purple500: '#a855f7',

  // White & Black
  white: '#ffffff',
  black: '#000000',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const borderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
};
