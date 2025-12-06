import { useWindowDimensions, Platform, PixelRatio } from 'react-native';

// Design base dimensions (iPhone 14 Pro)
const BASE_WIDTH = 393;
const BASE_HEIGHT = 852;

export const useResponsiveLayout = () => {
    const { width, height } = useWindowDimensions();

    const isLandscape = width > height;

    // A simple heuristic for Tablet: smallest dimension >= 600
    const smallestDimension = Math.min(width, height);
    const isTablet = smallestDimension >= 600;

    const isSmallDevice = width < 375;
    const isMediumDevice = width >= 375 && width < 414;
    const isLargeDevice = width >= 414;

    /**
     * Scale based on width (dynamic)
     */
    const scaleWidth = (size: number) => {
        return (width / BASE_WIDTH) * size;
    };

    /**
     * Scale based on height (dynamic)
     */
    const scaleHeight = (size: number) => {
        return (height / BASE_HEIGHT) * size;
    };

    /**
     * Scale font size
     */
    const scaleFont = (size: number) => {
        // Use smallest dimension for font scaling to avoid huge text in landscape
        const scale = smallestDimension / BASE_WIDTH;
        const newSize = size * scale;

        if (Platform.OS === 'ios') {
            return Math.round(PixelRatio.roundToNearestPixel(newSize));
        } else {
            return Math.round(PixelRatio.roundToNearestPixel(newSize)) - 2;
        }
    };

    /**
     * Scale spacing with a cap
     */
    const scaleSpacing = (size: number) => {
        const scale = Math.min(width / BASE_WIDTH, 1.5);
        return size * scale;
    };

    /**
     * Return a value based on the current breakpoint configuration
     */
    const responsiveValue = <T>(config: {
        small?: T;
        medium?: T;
        large?: T;
        tablet?: T;
        landscape?: T;
        default: T;
    }): T => {
        if (isLandscape && config.landscape !== undefined) return config.landscape;
        if (isTablet && config.tablet !== undefined) return config.tablet;
        if (isLargeDevice && config.large !== undefined) return config.large;
        if (isMediumDevice && config.medium !== undefined) return config.medium;
        if (isSmallDevice && config.small !== undefined) return config.small;
        return config.default;
    };

    return {
        width,
        height,
        isLandscape,
        isTablet,
        isSmallDevice,
        isMediumDevice,
        isLargeDevice,
        scaleWidth,
        scaleHeight,
        scaleFont,
        scaleSpacing,
        responsiveValue,
        // Common dynamic values
        pagePadding: responsiveValue({ tablet: 32, landscape: 48, default: 24 }),
        cardPadding: responsiveValue({ tablet: 24, default: 16 }),
    };
};
