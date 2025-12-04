import { Dimensions, PixelRatio, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// 设计稿基准尺寸（iPhone 14 Pro）
const BASE_WIDTH = 393;
const BASE_HEIGHT = 852;

// 判断设备类型
export const isSmallDevice = SCREEN_WIDTH < 375;
export const isMediumDevice = SCREEN_WIDTH >= 375 && SCREEN_WIDTH < 414;
export const isLargeDevice = SCREEN_WIDTH >= 414;
export const isTablet = SCREEN_WIDTH >= 768;

// 屏幕尺寸
export const screenWidth = SCREEN_WIDTH;
export const screenHeight = SCREEN_HEIGHT;

/**
 * 根据设计稿宽度等比缩放
 */
export const scaleWidth = (size: number): number => {
  return (SCREEN_WIDTH / BASE_WIDTH) * size;
};

/**
 * 根据设计稿高度等比缩放
 */
export const scaleHeight = (size: number): number => {
  return (SCREEN_HEIGHT / BASE_HEIGHT) * size;
};

/**
 * 字体大小缩放（基于宽度）
 */
export const scaleFont = (size: number): number => {
  const scale = SCREEN_WIDTH / BASE_WIDTH;
  const newSize = size * scale;

  if (Platform.OS === 'ios') {
    return Math.round(PixelRatio.roundToNearestPixel(newSize));
  } else {
    return Math.round(PixelRatio.roundToNearestPixel(newSize)) - 2;
  }
};

/**
 * 间距缩放（使用较小的缩放比例以避免过大间距）
 */
export const scaleSpacing = (size: number): number => {
  const scale = Math.min(SCREEN_WIDTH / BASE_WIDTH, 1.2);
  return size * scale;
};

/**
 * 响应式样式工具
 */
export const responsive = {
  // 字体大小
  fontSize: {
    xs: scaleFont(10),
    sm: scaleFont(12),
    base: scaleFont(14),
    lg: scaleFont(16),
    xl: scaleFont(18),
    '2xl': scaleFont(20),
    '3xl': scaleFont(24),
    '4xl': scaleFont(28),
    '5xl': scaleFont(32),
  },

  // 间距
  spacing: {
    xs: scaleSpacing(4),
    sm: scaleSpacing(8),
    md: scaleSpacing(12),
    lg: scaleSpacing(16),
    xl: scaleSpacing(20),
    '2xl': scaleSpacing(24),
    '3xl': scaleSpacing(32),
  },

  // 圆角
  borderRadius: {
    sm: scaleSpacing(8),
    md: scaleSpacing(12),
    lg: scaleSpacing(16),
    xl: scaleSpacing(20),
    '2xl': scaleSpacing(24),
    full: 9999,
  },

  // 图标大小
  iconSize: {
    xs: scaleWidth(16),
    sm: scaleWidth(20),
    md: scaleWidth(24),
    lg: scaleWidth(32),
    xl: scaleWidth(40),
  },

  // 容器宽度
  container: {
    maxWidth: isTablet ? 768 : SCREEN_WIDTH - scaleSpacing(48),
  },
};

/**
 * 根据屏幕尺寸返回不同的值
 */
export const responsiveValue = <T,>(config: {
  small?: T;
  medium?: T;
  large?: T;
  tablet?: T;
  default: T;
}): T => {
  if (isTablet && config.tablet) return config.tablet;
  if (isLargeDevice && config.large) return config.large;
  if (isMediumDevice && config.medium) return config.medium;
  if (isSmallDevice && config.small) return config.small;
  return config.default;
};

/**
 * 获取安全的卡片padding
 */
export const getCardPadding = (): number => {
  return responsiveValue({
    small: scaleSpacing(16),
    medium: scaleSpacing(20),
    large: scaleSpacing(24),
    tablet: scaleSpacing(28),
    default: scaleSpacing(20),
  });
};

/**
 * 获取安全的页面padding
 */
export const getPagePadding = (): number => {
  return responsiveValue({
    small: scaleSpacing(16),
    medium: scaleSpacing(20),
    large: scaleSpacing(24),
    tablet: scaleSpacing(32),
    default: scaleSpacing(24),
  });
};
