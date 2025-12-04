import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { scaleWidth } from '../utils/responsive';

interface DnsProviderLogoProps {
  providerId: string;
  size?: number;
}

const PROVIDER_CONFIGS: Record<string, { letter: string; bg: string; color: string }> = {
  adguard: {
    letter: 'A',
    bg: '#68BC71',
    color: '#FFFFFF',
  },
  cloudflare: {
    letter: 'C',
    bg: '#F6821F',
    color: '#FFFFFF',
  },
  google: {
    letter: 'G',
    bg: '#4285F4',
    color: '#FFFFFF',
  },
  nextdns: {
    letter: 'N',
    bg: '#6366F1',
    color: '#FFFFFF',
  },
};

export const DnsProviderLogo: React.FC<DnsProviderLogoProps> = ({ providerId, size = 24 }) => {
  const config = PROVIDER_CONFIGS[providerId] || {
    letter: '?',
    bg: '#64748b',
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
