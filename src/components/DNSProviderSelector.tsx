import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { DnsProvider, DnsHealthCheck } from '../types';
import { DNS_PROVIDERS } from '../constants';
import { DNSProviderCard } from './DNSProviderCard';
import dnsHealthCheck from '../services/dnsHealthCheck';

interface DNSProviderSelectorProps {
  selectedProviderId: string;
  onSelectProvider: (providerId: string) => void;
  onAdvancedSettings?: () => void;
}

export const DNSProviderSelector: React.FC<DNSProviderSelectorProps> = ({
  selectedProviderId,
  onSelectProvider,
  onAdvancedSettings
}) => {
  const [expanded, setExpanded] = useState(false);
  const [healthData, setHealthData] = useState<Map<string, DnsHealthCheck>>(new Map());
  const [isChecking, setIsChecking] = useState(false);

  const selectedProvider = DNS_PROVIDERS.find(p => p.id === selectedProviderId);
  const chinaProviders = DNS_PROVIDERS.filter(p => p.region === 'china');
  const globalProviders = DNS_PROVIDERS.filter(p => p.region === 'global');

  // 初始化时检查所有DNS健康状态
  useEffect(() => {
    performHealthCheck();
  }, []);

  const performHealthCheck = async () => {
    setIsChecking(true);
    try {
      const results = await dnsHealthCheck.checkAllProviders();
      setHealthData(new Map(results));
    } catch (error) {
      console.error('Health check failed:', error);
    } finally {
      setIsChecking(false);
    }
  };

  const handleSelectProvider = (providerId: string) => {
    onSelectProvider(providerId);
    setExpanded(false);
  };

  if (!expanded) {
    // 折叠状态：仅显示当前选中的DNS
    return (
      <View style={styles.container}>
        <View style={styles.sectionHeader}>
          <Icon name="server" size={18} color="#06b6d4" />
          <Text style={styles.sectionTitle}>DNS 服务商</Text>
        </View>

        <View style={styles.collapsedContainer}>
          <Text style={styles.currentLabel}>当前使用</Text>

          {selectedProvider && (
            <DNSProviderCard
              provider={selectedProvider}
              isSelected={true}
              onSelect={() => {}}
              healthCheck={healthData.get(selectedProviderId)}
              compact={false}
            />
          )}

          <TouchableOpacity
            onPress={() => setExpanded(true)}
            activeOpacity={0.7}
            style={styles.expandButton}
          >
            <Icon name="repeat" size={18} color="#06b6d4" />
            <Text style={styles.expandButtonText}>切换到其他DNS服务商</Text>
            <Icon name="chevron-right" size={18} color="#06b6d4" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // 展开状态：显示所有DNS服务商
  return (
    <View style={styles.container}>
      <View style={styles.expandedHeader}>
        <TouchableOpacity onPress={() => setExpanded(false)} style={styles.backButton}>
          <Icon name="chevron-left" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.expandedTitle}>选择DNS服务商</Text>
        <TouchableOpacity onPress={performHealthCheck} disabled={isChecking}>
          {isChecking ? (
            <ActivityIndicator size="small" color="#06b6d4" />
          ) : (
            <Icon name="refresh-cw" size={20} color="#06b6d4" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* 国内优化服务商 */}
        {chinaProviders.length > 0 && (
          <View style={styles.section}>
            <View style={styles.categoryHeader}>
              <Text style={styles.categoryTitle}>国内优化 🇨🇳</Text>
              <Text style={styles.categorySubtitle}>针对国内网络优化</Text>
            </View>

            <View style={styles.gridContainer}>
              {chinaProviders.map(provider => (
                <View key={provider.id} style={styles.gridItem}>
                  <DNSProviderCard
                    provider={provider}
                    isSelected={provider.id === selectedProviderId}
                    onSelect={() => handleSelectProvider(provider.id)}
                    healthCheck={healthData.get(provider.id)}
                    compact={true}
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 国际服务商 */}
        {globalProviders.length > 0 && (
          <View style={styles.section}>
            <View style={styles.categoryHeader}>
              <Text style={styles.categoryTitle}>国际服务 🌍</Text>
              <Text style={styles.categorySubtitle}>全球通用DNS服务</Text>
            </View>

            <View style={styles.gridContainer}>
              {globalProviders.map(provider => (
                <View key={provider.id} style={styles.gridItem}>
                  <DNSProviderCard
                    provider={provider}
                    isSelected={provider.id === selectedProviderId}
                    onSelect={() => handleSelectProvider(provider.id)}
                    healthCheck={healthData.get(provider.id)}
                    compact={true}
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 高级设置按钮 */}
        {onAdvancedSettings && (
          <TouchableOpacity
            onPress={onAdvancedSettings}
            activeOpacity={0.7}
            style={styles.advancedButton}
          >
            <Icon name="settings" size={18} color="#94a3b8" />
            <Text style={styles.advancedButtonText}>高级设置</Text>
            <Icon name="chevron-right" size={18} color="#64748b" />
          </TouchableOpacity>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },

  // 折叠状态样式
  collapsedContainer: {
    gap: 12,
  },
  currentLabel: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 4,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
  },
  expandButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#06b6d4',
    flex: 1,
  },

  // 展开状态样式
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  backButton: {
    padding: 4,
  },
  expandedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  scrollView: {
    maxHeight: 500,
  },
  section: {
    marginBottom: 24,
  },
  categoryHeader: {
    marginBottom: 12,
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  categorySubtitle: {
    fontSize: 12,
    color: '#64748b',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    width: '31%', // 3列布局
  },
  advancedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginTop: 8,
  },
  advancedButtonText: {
    fontSize: 14,
    color: '#94a3b8',
    flex: 1,
  },
  bottomPadding: {
    height: 20,
  },
});
