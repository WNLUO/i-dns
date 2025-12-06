import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { DnsProvider, DnsHealthCheck } from '../types';
import { DNS_PROVIDERS } from '../constants';
import { DNSProviderCard } from './DNSProviderCard';
import dnsHealthCheck from '../services/dnsHealthCheck';
import { useThemeColors } from '../styles/theme';

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
  const colors = useThemeColors();

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
          <Icon name="server" size={18} color={colors.info} />
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>DNS 服务商</Text>
        </View>

        <View style={styles.collapsedContainer}>
          <Text style={[styles.currentLabel, { color: colors.text.secondary }]}>当前使用</Text>

          {selectedProvider && (
            <DNSProviderCard
              provider={selectedProvider}
              isSelected={true}
              onSelect={() => { }}
              healthCheck={healthData.get(selectedProviderId)}
              compact={false}
            />
          )}

          <TouchableOpacity
            onPress={() => setExpanded(true)}
            activeOpacity={0.7}
            style={[styles.expandButton, { backgroundColor: colors.background.tertiary, borderColor: colors.border.focus }]}
          >
            <Icon name="repeat" size={18} color={colors.info} />
            <Text style={[styles.expandButtonText, { color: colors.info }]}>切换到其他DNS服务商</Text>
            <Icon name="chevron-right" size={18} color={colors.info} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // 展开状态：显示所有DNS服务商
  return (
    <View style={styles.container}>
      <View style={[styles.expandedHeader, { borderBottomColor: colors.border.subtle }]}>
        <TouchableOpacity onPress={() => setExpanded(false)} style={styles.backButton}>
          <Icon name="chevron-left" size={20} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.expandedTitle, { color: colors.text.primary }]}>选择DNS服务商</Text>
        <TouchableOpacity onPress={performHealthCheck} disabled={isChecking}>
          {isChecking ? (
            <ActivityIndicator size="small" color={colors.info} />
          ) : (
            <Icon name="refresh-cw" size={20} color={colors.info} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* 国内优化服务商 */}
        {chinaProviders.length > 0 && (
          <View style={styles.section}>
            <View style={styles.categoryHeader}>
              <Text style={[styles.categoryTitle, { color: colors.text.primary }]}>国内优化 🇨🇳</Text>
              <Text style={[styles.categorySubtitle, { color: colors.text.secondary }]}>针对国内网络优化</Text>
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
              <Text style={[styles.categoryTitle, { color: colors.text.primary }]}>国际服务 🌍</Text>
              <Text style={[styles.categorySubtitle, { color: colors.text.secondary }]}>全球通用DNS服务</Text>
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
            style={[styles.advancedButton, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
          >
            <Icon name="settings" size={18} color={colors.text.secondary} />
            <Text style={[styles.advancedButtonText, { color: colors.text.secondary }]}>高级设置</Text>
            <Icon name="chevron-right" size={18} color={colors.text.tertiary} />
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
  },

  // 折叠状态样式
  collapsedContainer: {
    gap: 12,
  },
  currentLabel: {
    fontSize: 13,
    marginBottom: 4,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  expandButtonText: {
    fontSize: 14,
    fontWeight: '600',
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
  },
  backButton: {
    padding: 4,
  },
  expandedTitle: {
    fontSize: 18,
    fontWeight: '700',
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
    marginBottom: 2,
  },
  categorySubtitle: {
    fontSize: 12,
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
    borderWidth: 1,
    marginTop: 8,
  },
  advancedButtonText: {
    fontSize: 14,
    flex: 1,
  },
  bottomPadding: {
    height: 20,
  },
});
