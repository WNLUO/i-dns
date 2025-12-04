// 数字滚动动画组件
import React, { useEffect, useRef, useState } from 'react';
import { Text, Animated, TextStyle } from 'react-native';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  formatValue?: (value: number) => string;
  style?: TextStyle;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  duration = 500,
  formatValue = (v) => Math.floor(v).toLocaleString(),
  style,
}) => {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [displayText, setDisplayText] = useState(formatValue(0));

  useEffect(() => {
    animatedValue.setValue(0);

    const listener = animatedValue.addListener(({ value: v }) => {
      setDisplayText(formatValue(v));
    });

    Animated.timing(animatedValue, {
      toValue: value,
      duration,
      useNativeDriver: false,
    }).start();

    return () => {
      animatedValue.removeListener(listener);
    };
  }, [value, duration, formatValue, animatedValue]);

  return <Text style={style}>{displayText}</Text>;
};
