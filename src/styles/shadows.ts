// 统一的阴影系统
import { ViewStyle } from 'react-native';

export interface ShadowStyle {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  } as ShadowStyle,

  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  } as ShadowStyle,

  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  } as ShadowStyle,

  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 5,
  } as ShadowStyle,

  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 8,
  } as ShadowStyle,

  // 彩色阴影
  colored: (color: string, intensity: 'sm' | 'md' | 'lg' = 'md'): ShadowStyle => {
    const configs = {
      sm: { offset: 4, opacity: 0.2, radius: 8, elevation: 3 },
      md: { offset: 8, opacity: 0.3, radius: 16, elevation: 5 },
      lg: { offset: 12, opacity: 0.4, radius: 24, elevation: 8 },
    };

    const config = configs[intensity];

    return {
      shadowColor: color,
      shadowOffset: { width: 0, height: config.offset },
      shadowOpacity: config.opacity,
      shadowRadius: config.radius,
      elevation: config.elevation,
    };
  },

  // 内阴影效果（通过叠加实现）
  inner: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 0, // 内阴影不需要 elevation
  } as ShadowStyle,
};

// 卡片阴影变体
export const cardShadows = {
  default: shadows.sm,
  elevated: shadows.md,
  floating: shadows.lg,
  pressed: shadows.none,
};
