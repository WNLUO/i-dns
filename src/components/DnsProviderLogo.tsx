import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { scaleWidth } from '../utils/responsive';

interface DnsProviderLogoProps {
  providerId: string;
  size?: number;
}

const PROVIDER_CONFIGS: Record<string, { letter: string; bg: string; color: string }> = {
  idns: {
    letter: 'I',
    bg: '#06b6d4',
    color: '#FFFFFF',
  },
};

export const DnsProviderLogo: React.FC<DnsProviderLogoProps> = ({ providerId, size = 24 }) => {
  // 只支持 I-DNS，其他情况使用默认配置
  const config = PROVIDER_CONFIGS[providerId] || {
    letter: 'I',
    bg: '#06b6d4',
    color: '#FFFFFF',
  };

  return (
    <View
      style={[
        styles.container,
        {
          width: scaleWidth(size),
          height: scaleWidth(size),
          borderRadius: scaleWidth(size / 2),
          backgroundColor: config.bg,
        },
      ]}
    >
      <Text
        style={[
          styles.letter,
          {
            fontSize: size * 0.5,
            color: config.color,
          },
        ]}
      >
        {config.letter}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontWeight: '700',
  },
});
