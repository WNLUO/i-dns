import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { LOG_RETENTION_OPTIONS } from '../constants';
import { useApp } from '../contexts/AppContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { responsive } from '../utils/responsive';
import { useThemeColors } from '../styles/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

interface SettingsViewProps {
  onNavigate?: (page: 'user-agreement' | 'privacy-policy' | 'child-protection' | 'tutorial') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onNavigate }) => {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, clearLogs } = useApp();
  const colors = useThemeColors();
  const { pagePadding } = useResponsiveLayout();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(insets.top, 20) + responsive.spacing.lg,
          paddingBottom: Math.max(insets.bottom, 20) + 100,
          paddingHorizontal: pagePadding
        }
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text.primary }]}>设置</Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>个性化您的家庭网络守护体验</Text>
      </View>

      {/* 本地DNS处理模式说明 */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="shield" size={18} color={colors.info} />
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>DNS 保护</Text>
        </View>
        <View style={[styles.settingsCard, { backgroundColor: colors.background.elevated, borderColor: colors.border.default }]}>
          <Text style={[styles.dataLabel, { color: colors.text.primary }]}>本地DNS处理模式</Text>
          <Text style={[styles.retentionDesc, { color: colors.text.secondary }]}>
            所有DNS查询都在本地进行过滤处理，通过黑白名单保护您的家庭网络安全。
          </Text>
        </View>
      </View>

      {/* Data Settings */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="database" size={18} color={colors.status.active} />
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>数据管理</Text>
        </View>

        <View style={[styles.settingsCard, { backgroundColor: colors.background.elevated, borderColor: colors.border.default }]}>
          <Text style={[styles.dataLabel, { color: colors.text.primary }]}>日志保留时间</Text>
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
                    { backgroundColor: colors.background.secondary },
                    isSelected && { backgroundColor: isSelected ? colors.background.tertiary : colors.background.secondary, borderColor: isSelected ? colors.border.focus : 'transparent' },
                    isSelected && styles.retentionOptionSelected, // Still keep inline overriding
                    isSelected && { backgroundColor: colors.background.tertiary, borderColor: colors.border.focus } // Ensure override
                  ]}
                >
                  <Text style={[
                    styles.retentionLabel,
                    { color: colors.text.secondary },
                    isSelected && { color: colors.info },
                  ]}>
                    {option.label}
                  </Text>
                  {isSelected && (
                    <Icon name="check" size={16} color={colors.info} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.retentionDesc, { color: colors.text.tertiary }]}>
            {LOG_RETENTION_OPTIONS.find(opt => opt.value === settings.logRetentionPeriod)?.description}
          </Text>

          <View style={[styles.settingDivider, { backgroundColor: colors.border.default }]} />

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
              <Icon name="trash-2" size={20} color={colors.status.error} />
              <View style={styles.settingInfo}>
                <Text style={[styles.settingTitleRed, { color: colors.status.error }]}>清除所有日志</Text>
              </View>
              <Icon name="chevron-right" size={20} color={colors.text.tertiary} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Legal Links Section */}
      <View style={styles.section}>
        <View style={[styles.legalSection, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onNavigate?.('user-agreement')}
          >
            <View style={styles.legalItem}>
              <Text style={[styles.legalText, { color: colors.text.primary }]}>用户协议</Text>
              <Icon name="chevron-right" size={18} color={colors.text.tertiary} />
            </View>
          </TouchableOpacity>

          <View style={[styles.legalDivider, { backgroundColor: colors.border.default }]} />

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onNavigate?.('privacy-policy')}
          >
            <View style={styles.legalItem}>
              <Text style={[styles.legalText, { color: colors.text.primary }]}>隐私政策</Text>
              <Icon name="chevron-right" size={18} color={colors.text.tertiary} />
            </View>
          </TouchableOpacity>

          <View style={[styles.legalDivider, { backgroundColor: colors.border.default }]} />

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onNavigate?.('child-protection')}
          >
            <View style={styles.legalItem}>
              <Text style={[styles.legalText, { color: colors.text.primary }]}>儿童个人信息保护规则</Text>
              <Icon name="chevron-right" size={18} color={colors.text.tertiary} />
            </View>
          </TouchableOpacity>

          <View style={[styles.legalDivider, { backgroundColor: colors.border.default }]} />

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onNavigate?.('tutorial')}
          >
            <View style={styles.legalItem}>
              <Text style={[styles.legalText, { color: colors.text.primary }]}>使用教程</Text>
              <Icon name="chevron-right" size={18} color={colors.text.tertiary} />
            </View>
          </TouchableOpacity>
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
    // padding set dynamically
  },
  header: {
    marginBottom: responsive.spacing['2xl'],
  },
  title: {
    fontSize: responsive.fontSize['4xl'],
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: responsive.fontSize.base,
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
  },
  settingsCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000', // Use generic black for shadow, as system handles opacity usually, or rely on elevation
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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
    marginBottom: 2,
  },
  settingTitleRed: {
    fontSize: 15,
    fontWeight: '600',
  },
  settingDesc: {
    fontSize: 12,
  },
  settingDivider: {
    height: 1,
    marginVertical: 12,
  },
  legalSection: {
    borderRadius: 16,
    borderWidth: 1,
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
    fontWeight: '500',
  },
  legalDivider: {
    height: 1,
  },
  dataLabel: {
    fontSize: 14,
    fontWeight: '600',
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
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 6,
  },
  retentionOptionSelected: {
    // handled inline
  },
  retentionLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  retentionLabelSelected: {
    // handled inline
  },
  retentionDesc: {
    fontSize: 12,
    marginBottom: 8,
  },
});
