// 字体系统
import { TextStyle } from 'react-native';
import { colors } from './colors';

export const fontSize = {
  xs: 10,
  sm: 11,
  base: 12,
  md: 14,
  lg: 16,
  xl: 18,
  '2xl': 20,
  '3xl': 24,
  '4xl': 28,
  '5xl': 32,
  '6xl': 40,
};

export const fontWeight = {
  regular: '400' as TextStyle['fontWeight'],
  medium: '500' as TextStyle['fontWeight'],
  semibold: '600' as TextStyle['fontWeight'],
  bold: '700' as TextStyle['fontWeight'],
};

export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
};

// 预设文字样式
export const textStyles = {
  h1: {
    fontSize: fontSize['4xl'],
    fontWeight: fontWeight.bold,
    color: colors.white,
    lineHeight: fontSize['4xl'] * lineHeight.tight,
  } as TextStyle,

  h2: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    color: colors.white,
    lineHeight: fontSize['3xl'] * lineHeight.tight,
  } as TextStyle,

  h3: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    color: colors.white,
    lineHeight: fontSize.xl * lineHeight.normal,
  } as TextStyle,

  body: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.regular,
    color: colors.slate300,
    lineHeight: fontSize.md * lineHeight.normal,
  } as TextStyle,

  bodyBold: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.white,
    lineHeight: fontSize.md * lineHeight.normal,
  } as TextStyle,

  caption: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    color: colors.slate400,
    lineHeight: fontSize.sm * lineHeight.normal,
  } as TextStyle,

  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.slate500,
    lineHeight: fontSize.xs * lineHeight.normal,
    textTransform: 'uppercase' as TextStyle['textTransform'],
    letterSpacing: 1,
  } as TextStyle,
};
