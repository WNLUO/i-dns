import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { DnsProvider, DnsHealthCheck } from '../types';
import { DnsProviderLogo } from './DnsProviderLogo';

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
  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'healthy': return '#10b981';
      case 'slow': return '#f59e0b';
      case 'timeout': return '#ef4444';
      default: return '#64748b';
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
          isSelected && styles.compactCardSelected
        ]}
      >
        <DnsProviderLogo providerId={provider.id} size={40} />
        <Text style={styles.compactName} numberOfLines={1}>
          {provider.name}
        </Text>
        {!isSelected && healthCheck && (
          <View style={styles.compactStatus}>
            <Text style={styles.compactLatency}>
              {getLatencyText(healthCheck.latency)}
            </Text>
            <Text style={styles.statusEmoji}>
              {getStatusIcon(healthCheck.status)}
            </Text>
          </View>
        )}
        {isSelected && (
          <View style={styles.compactCheckmark}>
            <Icon name="check" size={14} color="#06b6d4" />
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
        isSelected && styles.cardSelected
      ]}
    >
      <DnsProviderLogo providerId={provider.id} size={48} />

      <View style={styles.info}>
        <Text style={styles.name}>{provider.name}</Text>
        <Text style={styles.description} numberOfLines={1}>
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
              <View key={index} style={styles.featureTag}>
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {isSelected && (
        <Icon name="check-circle" size={22} color="#06b6d4" />
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
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  cardSelected: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: 'rgba(6, 182, 212, 0.3)',
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
    color: '#fff',
  },
  regionBadge: {
    fontSize: 14,
  },
  description: {
    fontSize: 12,
    color: '#94a3b8',
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
    backgroundColor: 'rgba(100, 116, 139, 0.3)',
  },
  featureText: {
    fontSize: 10,
    color: '#94a3b8',
  },

  // 紧凑模式样式
  compactCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    minHeight: 110,
    position: 'relative',
  },
  compactCardSelected: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  compactName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
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
    color: '#94a3b8',
  },
  compactCheckmark: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(6, 182, 212, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
