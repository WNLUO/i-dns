import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { DnsProvider, DnsHealthCheck } from '../types';
import { DnsProviderLogo } from './DnsProviderLogo';
import { useThemeColors } from '../styles/theme';

interface DNSProviderCardProps {
  provider: DnsProvider;
  isSelected: boolean;
  onSelect: () => void;
  healthCheck?: DnsHealthCheck;
  compact?: boolean; // 紧凑模式（网格布局）
}

export const DNSProviderCard: React.FC<DNSProviderCardProps> = ({
  provider,
  isSelected,
  onSelect,
  healthCheck,
  compact = false
}) => {
  const colors = useThemeColors();

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'healthy': return colors.status.active;
      case 'slow': return colors.status.warning;
      case 'timeout': return colors.status.error;
      default: return colors.text.tertiary;
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'healthy': return '🟢';
      case 'slow': return '🟡';
      case 'timeout': return '🔴';
      default: return '⚪';
    }
  };

  const getLatencyText = (latency?: number) => {
    if (!latency || latency < 0) return '未检测';
    if (latency > 5000) return '超时';
    return `${latency}ms`;
  };

  if (compact) {
    // 网格布局 - 紧凑模式
    return (
      <TouchableOpacity
        onPress={onSelect}
        activeOpacity={0.7}
        style={[
          styles.compactCard,
          { backgroundColor: colors.background.elevated, borderColor: colors.border.default },
          isSelected && { backgroundColor: colors.background.tertiary, borderColor: colors.border.focus }
        ]}
      >
        <DnsProviderLogo providerId={provider.id} size={40} />
        <Text style={[styles.compactName, { color: colors.text.primary }]} numberOfLines={1}>
          {provider.name}
        </Text>
        {!isSelected && healthCheck && (
          <View style={styles.compactStatus}>
            <Text style={[styles.compactLatency, { color: colors.text.secondary }]}>
              {getLatencyText(healthCheck.latency)}
            </Text>
            <Text style={styles.statusEmoji}>
              {getStatusIcon(healthCheck.status)}
            </Text>
          </View>
        )}
        {isSelected && (
          <View style={[styles.compactCheckmark, { backgroundColor: colors.info + '20' }]}>
            <Icon name="check" size={14} color={colors.info} />
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // 列表布局 - 完整模式
  return (
    <TouchableOpacity
      onPress={onSelect}
      activeOpacity={0.7}
      style={[
        styles.card,
        { backgroundColor: colors.background.elevated, borderColor: colors.border.default },
        isSelected && { backgroundColor: colors.background.tertiary, borderColor: colors.border.focus }
      ]}
    >
      <DnsProviderLogo providerId={provider.id} size={48} />

      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.text.primary }]}>{provider.name}</Text>
        <Text style={[styles.description, { color: colors.text.secondary }]} numberOfLines={1}>
          {provider.description}
        </Text>

        {!isSelected && healthCheck && (
          <View style={styles.healthRow}>
            <Text style={[styles.latency, { color: getStatusColor(healthCheck.status) }]}>
              延迟: {getLatencyText(healthCheck.latency)}
            </Text>
            <Text style={styles.statusEmoji}>
              {getStatusIcon(healthCheck.status)}
            </Text>
          </View>
        )}

        {provider.features && provider.features.length > 0 && (
          <View style={styles.features}>
            {provider.features.slice(0, 3).map((feature, index) => (
              <View key={index} style={[styles.featureTag, { backgroundColor: colors.background.secondary }]}>
                <Text style={[styles.featureText, { color: colors.text.secondary }]}>{feature}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {isSelected && (
        <Icon name="check-circle" size={22} color={colors.info} />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  // 列表模式样式
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
  },
  regionBadge: {
    fontSize: 14,
  },
  description: {
    fontSize: 12,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  latency: {
    fontSize: 11,
    fontWeight: '500',
  },
  statusEmoji: {
    fontSize: 10,
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  featureTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  featureText: {
    fontSize: 10,
  },

  // 紧凑模式样式
  compactCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 110,
    position: 'relative',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  compactCardSelected: {
    // handled inline
  },
  compactName: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  compactStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  compactLatency: {
    fontSize: 10,
  },
  compactCheckmark: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
