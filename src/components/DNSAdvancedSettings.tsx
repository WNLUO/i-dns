import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { AppSettings, DnsProtocol } from '../types';
import { DNS_PROVIDERS, DNS_SERVER_MAP } from '../constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { responsive, getPagePadding } from '../utils/responsive';

interface DNSAdvancedSettingsProps {
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  onBack: () => void;
}

export const DNSAdvancedSettings: React.FC<DNSAdvancedSettingsProps> = ({
  settings,
  onUpdateSettings,
  onBack
}) => {
  const insets = useSafeAreaInsets();

  const availableFallbacks = DNS_PROVIDERS.filter(
    p => p.id !== settings.selectedDnsProvider
  );

  const toggleFallback = (providerId: string) => {
    const currentList = settings.customFallbackList || [];
    const newList = currentList.includes(providerId)
      ? currentList.filter(id => id !== providerId)
      : [...currentList, providerId];
    onUpdateSettings({ customFallbackList: newList });
  };

  const moveFallbackUp = (index: number) => {
    if (index === 0) return;
    const newList = [...(settings.customFallbackList || [])];
    [newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];
    onUpdateSettings({ customFallbackList: newList });
  };

  const moveFallbackDown = (index: number) => {
    const list = settings.customFallbackList || [];
    if (index === list.length - 1) return;
    const newList = [...list];
    [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
    onUpdateSettings({ customFallbackList: newList });
  };

  const removeFallback = (providerId: string) => {
    const newList = (settings.customFallbackList || []).filter(id => id !== providerId);
    onUpdateSettings({ customFallbackList: newList });
  };

  const getProviderName = (providerId: string) => {
    return DNS_PROVIDERS.find(p => p.id === providerId)?.name || providerId;
  };

  const getAvailableProtocols = (providerId: string): DnsProtocol[] => {
    const config = DNS_SERVER_MAP[providerId];
    if (!config) return [];

    const protocols: DnsProtocol[] = [];
    if (config.doh) protocols.push('doh');
    if (config.dot) protocols.push('dot');
    if (config.udp) protocols.push('udp');
    return protocols;
  };

  const selectedProviderProtocols = getAvailableProtocols(settings.selectedDnsProvider);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(insets.top, 20) + responsive.spacing.lg,
          paddingBottom: Math.max(insets.bottom, 20) + 100,
        }
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Icon name="chevron-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>DNS 高级设置</Text>
      </View>

      {/* 协议选择 */}
      {selectedProviderProtocols.length > 1 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="radio" size={18} color="#06b6d4" />
            <Text style={styles.sectionTitle}>协议选择</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>当前DNS支持的协议</Text>
            <View style={styles.protocolOptions}>
              {selectedProviderProtocols.map(protocol => {
                const isSelected = settings.selectedProtocol === protocol ||
                  (!settings.selectedProtocol && protocol === 'doh');
                return (
                  <TouchableOpacity
                    key={protocol}
                    onPress={() => onUpdateSettings({ selectedProtocol: protocol })}
                    activeOpacity={0.7}
                    style={[
                      styles.protocolOption,
                      isSelected && styles.protocolOptionSelected
                    ]}
                  >
                    <Text style={[
                      styles.protocolLabel,
                      isSelected && styles.protocolLabelSelected
                    ]}>
                      {protocol.toUpperCase()}
                    </Text>
                    {isSelected && (
                      <Icon name="check" size={14} color="#06b6d4" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.protocolDesc}>
              DoH: 加密DNS，隐私最佳 | DoT: 加密DNS，使用853端口 | UDP: 传统DNS，速度快
            </Text>
          </View>
        </View>
      )}

      {/* 自动故障转移 */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="shuffle" size={18} color="#10b981" />
          <Text style={styles.sectionTitle}>故障转移</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>自动故障转移</Text>
              <Text style={styles.settingDesc}>主DNS失败时自动切换到备用DNS</Text>
            </View>
            <Switch
              value={settings.autoFallback}
              onValueChange={(value) => onUpdateSettings({ autoFallback: value })}
              trackColor={{ false: '#334155', true: '#06b6d4' }}
              thumbColor="#fff"
            />
          </View>

          {settings.autoFallback && (
            <>
              <View style={styles.divider} />

              <Text style={styles.fallbackLabel}>备用DNS列表（按优先级）</Text>

              {(settings.customFallbackList || []).length > 0 ? (
                <View style={styles.fallbackList}>
                  {settings.customFallbackList!.map((providerId, index) => (
                    <View key={providerId} style={styles.fallbackItem}>
                      <Text style={styles.fallbackIndex}>{index + 1}.</Text>
                      <Text style={styles.fallbackName}>{getProviderName(providerId)}</Text>

                      <View style={styles.fallbackActions}>
                        <TouchableOpacity
                          onPress={() => moveFallbackUp(index)}
                          disabled={index === 0}
                          style={styles.actionButton}
                        >
                          <Icon
                            name="chevron-up"
                            size={16}
                            color={index === 0 ? '#475569' : '#94a3b8'}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => moveFallbackDown(index)}
                          disabled={index === settings.customFallbackList!.length - 1}
                          style={styles.actionButton}
                        >
                          <Icon
                            name="chevron-down"
                            size={16}
                            color={index === settings.customFallbackList!.length - 1 ? '#475569' : '#94a3b8'}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => removeFallback(providerId)}
                          style={styles.actionButton}
                        >
                          <Icon name="x" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyFallback}>暂无备用DNS，将使用系统默认配置</Text>
              )}

              <View style={styles.addFallbackSection}>
                <Text style={styles.addFallbackLabel}>添加备用DNS</Text>
                {availableFallbacks.map(provider => (
                  <TouchableOpacity
                    key={provider.id}
                    onPress={() => toggleFallback(provider.id)}
                    activeOpacity={0.7}
                    style={styles.addFallbackItem}
                    disabled={(settings.customFallbackList || []).includes(provider.id)}
                  >
                    <Text style={[
                      styles.addFallbackName,
                      (settings.customFallbackList || []).includes(provider.id) && styles.addFallbackNameDisabled
                    ]}>
                      {provider.name}
                    </Text>
                    {(settings.customFallbackList || []).includes(provider.id) ? (
                      <Icon name="check" size={16} color="#06b6d4" />
                    ) : (
                      <Icon name="plus" size={16} color="#94a3b8" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>
      </View>

      {/* 健康检查 */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="activity" size={18} color="#f59e0b" />
          <Text style={styles.sectionTitle}>健康检查</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>检查间隔</Text>
          <View style={styles.intervalOptions}>
            {[
              { value: 300, label: '5分钟' },
              { value: 600, label: '10分钟' },
              { value: 1800, label: '30分钟' },
              { value: 0, label: '关闭' }
            ].map(option => {
              const isSelected = settings.healthCheckInterval === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => onUpdateSettings({ healthCheckInterval: option.value })}
                  activeOpacity={0.7}
                  style={[
                    styles.intervalOption,
                    isSelected && styles.intervalOptionSelected
                  ]}
                >
                  <Text style={[
                    styles.intervalLabel,
                    isSelected && styles.intervalLabelSelected
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.intervalDesc}>定期检测DNS服务器的可用性和延迟</Text>
        </View>
      </View>

      {/* 智能优选 */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="zap" size={18} color="#8b5cf6" />
          <Text style={styles.sectionTitle}>智能优选</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>智能选择最优DNS</Text>
              <Text style={styles.settingDesc}>自动选择延迟最低的DNS服务器</Text>
            </View>
            <Switch
              value={settings.smartSelection}
              onValueChange={(value) => onUpdateSettings({ smartSelection: value })}
              trackColor={{ false: '#334155', true: '#8b5cf6' }}
              thumbColor="#fff"
            />
          </View>
          {settings.smartSelection && (
            <Text style={styles.smartSelectionWarning}>
              ⚠️ 启用后将忽略手动选择的DNS，自动使用性能最佳的服务器
            </Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: getPagePadding(),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: responsive.spacing['2xl'],
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: responsive.fontSize['3xl'],
    fontWeight: '700',
    color: '#fff',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  card: {
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  settingDesc: {
    fontSize: 12,
    color: '#94a3b8',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginVertical: 16,
  },
  protocolOptions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  protocolOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(51, 65, 85, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    gap: 6,
  },
  protocolOptionSelected: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  protocolLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  protocolLabelSelected: {
    color: '#06b6d4',
  },
  protocolDesc: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 16,
  },
  fallbackLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  fallbackList: {
    gap: 8,
    marginBottom: 16,
  },
  fallbackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(51, 65, 85, 0.3)',
    gap: 8,
  },
  fallbackIndex: {
    fontSize: 13,
    fontWeight: '600',
    color: '#06b6d4',
    width: 20,
  },
  fallbackName: {
    flex: 1,
    fontSize: 13,
    color: '#fff',
  },
  fallbackActions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionButton: {
    padding: 4,
  },
  emptyFallback: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 16,
  },
  addFallbackSection: {
    gap: 6,
  },
  addFallbackLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 4,
  },
  addFallbackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(51, 65, 85, 0.3)',
  },
  addFallbackName: {
    fontSize: 13,
    color: '#fff',
  },
  addFallbackNameDisabled: {
    color: '#64748b',
  },
  intervalOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  intervalOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(51, 65, 85, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  intervalOptionSelected: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  intervalLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94a3b8',
  },
  intervalLabelSelected: {
    color: '#f59e0b',
  },
  intervalDesc: {
    fontSize: 11,
    color: '#64748b',
  },
  smartSelectionWarning: {
    marginTop: 12,
    fontSize: 11,
    color: '#f59e0b',
    lineHeight: 16,
  },
});
