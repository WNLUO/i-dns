import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { AppSettings, DnsProtocol } from '../types';
import { DNS_PROVIDERS, DNS_SERVER_MAP } from '../constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { responsive } from '../utils/responsive';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useThemeColors } from '../styles/theme';

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
  const colors = useThemeColors();
  const { pagePadding } = useResponsiveLayout();

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
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + responsive.spacing.lg, paddingHorizontal: pagePadding }]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Icon name="chevron-left" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text.primary }]}>DNS 高级设置</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, 20) + 20,
            paddingHorizontal: pagePadding
          }
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 协议选择 */}
        {selectedProviderProtocols.length > 1 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="radio" size={18} color={colors.info} />
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>协议选择</Text>
            </View>

            <View style={[styles.card, { backgroundColor: colors.background.elevated, borderColor: colors.border.default }]}>
              <Text style={[styles.cardLabel, { color: colors.text.primary }]}>当前DNS支持的协议</Text>
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
                        { backgroundColor: colors.background.secondary },
                        isSelected && { backgroundColor: colors.background.tertiary, borderColor: colors.border.focus }
                      ]}
                    >
                      <Text style={[
                        styles.protocolLabel,
                        { color: colors.text.secondary },
                        isSelected && { color: colors.info }
                      ]}>
                        {protocol.toUpperCase()}
                      </Text>
                      {isSelected && (
                        <Icon name="check" size={14} color={colors.info} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={[styles.protocolDesc, { color: colors.text.tertiary }]}>
                DoH: 加密DNS，隐私最佳 | DoT: 加密DNS，使用853端口 | UDP: 传统DNS，速度快
              </Text>
            </View>
          </View>
        )}

        {/* 自动故障转移 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="shuffle" size={18} color={colors.status.active} />
            <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>故障转移</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.background.elevated, borderColor: colors.border.default }]}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingLabel, { color: colors.text.primary }]}>自动故障转移</Text>
                <Text style={[styles.settingDesc, { color: colors.text.secondary }]}>主DNS失败时自动切换到备用DNS</Text>
              </View>
              <Switch
                value={settings.autoFallback}
                onValueChange={(value) => onUpdateSettings({ autoFallback: value })}
                trackColor={{ false: colors.background.input, true: colors.info }}
                thumbColor="#fff"
              />
            </View>

            {settings.autoFallback && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border.default }]} />

                <Text style={[styles.fallbackLabel, { color: colors.text.primary }]}>备用DNS列表（按优先级）</Text>

                {(settings.customFallbackList || []).length > 0 ? (
                  <View style={styles.fallbackList}>
                    {settings.customFallbackList!.map((providerId, index) => (
                      <View key={providerId} style={[styles.fallbackItem, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <Text style={[styles.fallbackIndex, { color: colors.info }]}>{index + 1}.</Text>
                        <Text style={[styles.fallbackName, { color: colors.text.primary }]}>{getProviderName(providerId)}</Text>

                        <View style={styles.fallbackActions}>
                          <TouchableOpacity
                            onPress={() => moveFallbackUp(index)}
                            disabled={index === 0}
                            style={styles.actionButton}
                          >
                            <Icon
                              name="chevron-up"
                              size={16}
                              color={index === 0 ? colors.text.disabled : colors.text.secondary}
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
                              color={index === settings.customFallbackList!.length - 1 ? colors.text.disabled : colors.text.secondary}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => removeFallback(providerId)}
                            style={styles.actionButton}
                          >
                            <Icon name="x" size={16} color={colors.status.error} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.emptyFallback, { color: colors.text.tertiary }]}>暂无备用DNS，将使用系统默认配置</Text>
                )}

                <View style={styles.addFallbackSection}>
                  <Text style={[styles.addFallbackLabel, { color: colors.text.secondary }]}>添加备用DNS</Text>
                  {availableFallbacks.map(provider => (
                    <TouchableOpacity
                      key={provider.id}
                      onPress={() => toggleFallback(provider.id)}
                      activeOpacity={0.7}
                      style={[styles.addFallbackItem, { backgroundColor: colors.background.secondary }]}
                      disabled={(settings.customFallbackList || []).includes(provider.id)}
                    >
                      <Text style={[
                        styles.addFallbackName,
                        { color: colors.text.primary },
                        (settings.customFallbackList || []).includes(provider.id) && { color: colors.text.disabled }
                      ]}>
                        {provider.name}
                      </Text>
                      {(settings.customFallbackList || []).includes(provider.id) ? (
                        <Icon name="check" size={16} color={colors.info} />
                      ) : (
                        <Icon name="plus" size={16} color={colors.text.tertiary} />
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
            <Icon name="activity" size={18} color={colors.status.warning} />
            <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>健康检查</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.background.elevated, borderColor: colors.border.default }]}>
            <Text style={[styles.cardLabel, { color: colors.text.primary }]}>检查间隔</Text>
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
                      { backgroundColor: colors.background.secondary },
                      isSelected && { backgroundColor: colors.status.warning + '20', borderColor: colors.status.warning }
                    ]}
                  >
                    <Text style={[
                      styles.intervalLabel,
                      { color: colors.text.secondary },
                      isSelected && { color: colors.status.warning }
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.intervalDesc, { color: colors.text.secondary }]}>定期检测DNS服务器的可用性和延迟</Text>
          </View>
        </View>

        {/* 智能优选 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="zap" size={18} color="#8b5cf6" />
            <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>智能优选</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.background.elevated, borderColor: colors.border.default }]}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingLabel, { color: colors.text.primary }]}>智能选择最优DNS</Text>
                <Text style={[styles.settingDesc, { color: colors.text.secondary }]}>自动选择延迟最低的DNS服务器</Text>
              </View>
              <Switch
                value={settings.smartSelection}
                onValueChange={(value) => onUpdateSettings({ smartSelection: value })}
                trackColor={{ false: colors.background.input, true: '#8b5cf6' }}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    // padding set dynamically
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
  },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
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
    marginBottom: 2,
  },
  settingDesc: {
    fontSize: 12,
  },
  divider: {
    height: 1,
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
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 6,
  },
  protocolLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  protocolDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  fallbackLabel: {
    fontSize: 13,
    fontWeight: '600',
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
    borderWidth: 1,
    gap: 8,
  },
  fallbackIndex: {
    fontSize: 13,
    fontWeight: '600',
    width: 20,
  },
  fallbackName: {
    flex: 1,
    fontSize: 13,
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
    textAlign: 'center',
    paddingVertical: 16,
  },
  addFallbackSection: {
    gap: 6,
  },
  addFallbackLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  addFallbackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 8,
  },
  addFallbackName: {
    fontSize: 13,
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
    borderWidth: 1,
    borderColor: 'transparent',
  },
  intervalLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  intervalDesc: {
    fontSize: 11,
  },
  smartSelectionWarning: {
    marginTop: 12,
    fontSize: 11,
    color: '#f59e0b',
    lineHeight: 16,
  },
});
