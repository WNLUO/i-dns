import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { DNS_PROVIDERS, LOG_RETENTION_OPTIONS } from '../constants';
import { useApp } from '../contexts/AppContext';
import { exportLogsAsJSON, exportLogsAsCSV } from '../services/exportService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { responsive, getCardPadding, getPagePadding } from '../utils/responsive';
import { DnsProviderLogo } from './DnsProviderLogo';

const ToggleSwitch: React.FC<{ value: boolean; onToggle: () => void }> = ({ value, onToggle }) => {
  const translateX = useRef(new Animated.Value(value ? 22 : 2)).current;
  const bgColorAnim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: value ? 22 : 2,
        useNativeDriver: true,
        friction: 8,
      }),
      Animated.timing(bgColorAnim, {
        toValue: value ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  }, [value]);

  const backgroundColor = bgColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(51, 65, 85, 0.5)', 'rgba(6, 182, 212, 0.3)'],
  });

  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.8}>
      <Animated.View style={[styles.toggle, { backgroundColor }]}>
        <Animated.View
          style={[
            styles.toggleThumb,
            {
              transform: [{ translateX }],
              backgroundColor: value ? '#06b6d4' : '#64748b',
            },
          ]}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

interface SettingsViewProps {
  onNavigate?: (page: 'user-agreement' | 'privacy-policy' | 'child-protection' | 'tutorial') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onNavigate }) => {
  // Hook顺序很重要！useContext hooks必须在最前面
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, logs, clearLogs } = useApp();

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
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>设置</Text>
        <Text style={styles.subtitle}>个性化您的家庭网络守护体验</Text>
      </View>

      {/* DNS Providers Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="server" size={18} color="#06b6d4" />
          <Text style={styles.sectionTitle}>DNS 服务商</Text>
        </View>

        <View style={styles.providersContainer}>
          {DNS_PROVIDERS.map((provider, index) => {
            const isSelected = settings.selectedDnsProvider === provider.id;
            return (
              <TouchableOpacity
                key={provider.id}
                onPress={() => updateSettings({ selectedDnsProvider: provider.id })}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.providerCard,
                    { backgroundColor: isSelected ? 'rgba(6, 182, 212, 0.15)' : 'rgba(15, 23, 42, 0.5)' },
                    isSelected && styles.providerCardActive,
                  ]}
                >
                  <DnsProviderLogo providerId={provider.id} size={48} />
                  <View style={styles.providerInfo}>
                    <Text style={styles.providerName}>{provider.name}</Text>
                    <Text style={styles.providerDesc}>{provider.description}</Text>
                  </View>
                  {isSelected && (
                    <Icon name="check-circle" size={22} color="#06b6d4" />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* General Settings */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="sliders" size={18} color="#8b5cf6" />
          <Text style={styles.sectionTitle}>常规设置</Text>
        </View>

        <View style={styles.settingsCard}>
          <View style={styles.settingItem}>
            <Icon name="power" size={20} color="#10b981" />
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>开机自动启动</Text>
              <Text style={styles.settingDesc}>系统启动时自动开启守护</Text>
            </View>
            <ToggleSwitch
              value={settings.autoStart}
              onToggle={() => updateSettings({ autoStart: !settings.autoStart })}
            />
          </View>

          <View style={styles.settingDivider} />

          <View style={styles.settingItem}>
            <Icon name="shield" size={20} color="#3b82f6" />
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>儿童保护模式</Text>
              <Text style={styles.settingDesc}>过滤不适宜内容，守护儿童上网安全</Text>
            </View>
            <ToggleSwitch
              value={settings.childProtectionMode}
              onToggle={() => updateSettings({ childProtectionMode: !settings.childProtectionMode })}
            />
          </View>

          <View style={styles.settingDivider} />

          <View style={styles.settingItem}>
            <Icon name="bell" size={20} color="#8b5cf6" />
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>通知提醒</Text>
              <Text style={styles.settingDesc}>接收重要提示</Text>
            </View>
            <ToggleSwitch
              value={settings.notificationsEnabled}
              onToggle={() => updateSettings({ notificationsEnabled: !settings.notificationsEnabled })}
            />
          </View>
        </View>
      </View>

      {/* Data Settings */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="database" size={18} color="#10b981" />
          <Text style={styles.sectionTitle}>数据管理</Text>
        </View>

        <View style={styles.settingsCard}>
          <Text style={styles.dataLabel}>日志保留时间</Text>
          <View style={styles.retentionOptions}>
            {LOG_RETENTION_OPTIONS.map((option) => {
              const isSelected = settings.logRetentionPeriod === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => updateSettings({ logRetentionPeriod: option.value })}
                  activeOpacity={0.7}
                  style={[
                    styles.retentionOption,
                    isSelected && styles.retentionOptionSelected,
                  ]}
                >
                  <Text style={[
                    styles.retentionLabel,
                    isSelected && styles.retentionLabelSelected,
                  ]}>
                    {option.label}
                  </Text>
                  {isSelected && (
                    <Icon name="check" size={16} color="#06b6d4" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.retentionDesc}>
            {LOG_RETENTION_OPTIONS.find(opt => opt.value === settings.logRetentionPeriod)?.description}
          </Text>

          <View style={styles.settingDivider} />

          <TouchableOpacity
            onPress={async () => {
              Alert.alert(
                '清除日志',
                '确定要清除所有日志记录吗？此操作无法撤销。',
                [
                  { text: '取消', style: 'cancel' },
                  {
                    text: '确定',
                    style: 'destructive',
                    onPress: () => clearLogs(),
                  },
                ]
              );
            }}
            activeOpacity={0.7}
          >
            <View style={styles.settingItem}>
              <Icon name="trash-2" size={20} color="#ef4444" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>清除所有日志</Text>
                <Text style={styles.settingDesc}>已保存 {logs.length} 条记录</Text>
              </View>
              <Icon name="chevron-right" size={20} color="#64748b" />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Advanced Options */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="settings" size={18} color="#f59e0b" />
          <Text style={styles.sectionTitle}>高级选项</Text>
        </View>

        <View style={styles.advancedOptions}>
          <TouchableOpacity
            onPress={async () => {
              Alert.alert(
                '导出日志',
                '选择导出格式',
                [
                  { text: '取消', style: 'cancel' },
                  {
                    text: 'JSON',
                    onPress: async () => {
                      try {
                        await exportLogsAsJSON(logs);
                      } catch (error) {
                        Alert.alert('导出失败', '无法导出日志数据');
                      }
                    },
                  },
                  {
                    text: 'CSV',
                    onPress: async () => {
                      try {
                        await exportLogsAsCSV(logs);
                      } catch (error) {
                        Alert.alert('导出失败', '无法导出日志数据');
                      }
                    },
                  },
                ]
              );
            }}
            activeOpacity={0.7}
          >
            <View style={styles.advancedItem}>
              <Icon name="download" size={24} color="#06b6d4" />
              <Text style={styles.advancedText}>导出日志数据</Text>
              <Icon name="chevron-right" size={20} color="#64748b" />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* About Section */}
      <View style={styles.section}>
        <View style={styles.aboutCard}>
          <Icon name="info" size={24} color="#06b6d4" />
          <View style={styles.aboutInfo}>
            <Text style={styles.aboutTitle}>iDNS 家庭守护</Text>
            <Text style={styles.aboutVersion}>版本 1.0.0</Text>
          </View>
        </View>

        {/* Legal Links */}
        <View style={styles.legalSection}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onNavigate?.('user-agreement')}
          >
            <View style={styles.legalItem}>
              <Text style={styles.legalText}>用户协议</Text>
              <Icon name="chevron-right" size={18} color="#64748b" />
            </View>
          </TouchableOpacity>

          <View style={styles.legalDivider} />

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onNavigate?.('privacy-policy')}
          >
            <View style={styles.legalItem}>
              <Text style={styles.legalText}>隐私政策</Text>
              <Icon name="chevron-right" size={18} color="#64748b" />
            </View>
          </TouchableOpacity>

          <View style={styles.legalDivider} />

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onNavigate?.('child-protection')}
          >
            <View style={styles.legalItem}>
              <Text style={styles.legalText}>儿童个人信息保护规则</Text>
              <Icon name="chevron-right" size={18} color="#64748b" />
            </View>
          </TouchableOpacity>

          <View style={styles.legalDivider} />

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onNavigate?.('tutorial')}
          >
            <View style={styles.legalItem}>
              <Text style={styles.legalText}>使用教程</Text>
              <Icon name="chevron-right" size={18} color="#64748b" />
            </View>
          </TouchableOpacity>
        </View>

        {/* ICP Filing Info */}
        <View style={styles.icpCard}>
          <Text style={styles.icpText}>
            {/* TODO: 请在此填入您的ICP备案号 */}
            备案号：京ICP备XXXXXXXX号-1
          </Text>
          <Text style={styles.icpSubtext}>
            工信部备案管理系统
          </Text>
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
    marginBottom: responsive.spacing['2xl'],
  },
  title: {
    fontSize: responsive.fontSize['5xl'],
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: responsive.fontSize.base,
    color: '#94a3b8',
  },
  section: {
    marginBottom: 32,
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
  providersContainer: {
    gap: 12,
  },
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    gap: 12,
  },
  providerCardActive: {
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  providerDesc: {
    fontSize: 12,
    color: '#94a3b8',
  },
  settingsCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 12,
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  settingDesc: {
    fontSize: 12,
    color: '#94a3b8',
  },
  settingDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginVertical: 12,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  advancedOptions: {
    gap: 12,
  },
  advancedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    gap: 12,
  },
  advancedText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  aboutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    gap: 16,
  },
  aboutInfo: {
    flex: 1,
  },
  aboutTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  aboutVersion: {
    fontSize: 13,
    color: '#94a3b8',
  },
  legalSection: {
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginTop: 12,
    overflow: 'hidden',
  },
  legalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  legalText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  legalDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  icpCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    alignItems: 'center',
  },
  icpText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 4,
  },
  icpSubtext: {
    fontSize: 10,
    color: '#475569',
    textAlign: 'center',
  },
  dataLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  retentionOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  retentionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(51, 65, 85, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    gap: 6,
  },
  retentionOptionSelected: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  retentionLabel: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
  },
  retentionLabelSelected: {
    color: '#06b6d4',
  },
  retentionDesc: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
});
