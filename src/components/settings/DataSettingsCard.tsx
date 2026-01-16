import React from 'react';
import {Alert, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {LOG_RETENTION_OPTIONS} from '../../constants';
import {AppSettings} from '../../types';
import {styles} from './styles';

interface DataSettingsCardProps {
  colors: any;
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  clearLogs: () => Promise<void>;
}

export const DataSettingsCard: React.FC<DataSettingsCardProps> = ({
  colors,
  settings,
  updateSettings,
  clearLogs,
}) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Icon name="database" size={18} color={colors.status.active} />
      <Text style={[styles.sectionTitle, {color: colors.text.primary}]}>数据管理</Text>
    </View>

    <View style={[styles.settingsCard, {backgroundColor: colors.background.elevated, borderColor: colors.border.default}]}>
      <Text style={[styles.dataLabel, {color: colors.text.primary}]}>日志保留时间</Text>
      <View style={styles.retentionOptions}>
        {LOG_RETENTION_OPTIONS.map(option => {
          const isSelected = settings.logRetentionPeriod === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => updateSettings({logRetentionPeriod: option.value})}
              activeOpacity={0.7}
              style={[
                styles.retentionOption,
                {backgroundColor: colors.background.secondary},
                isSelected && {backgroundColor: colors.background.tertiary, borderColor: colors.border.focus},
              ]}
            >
              <Text
                style={[
                  styles.retentionLabel,
                  {color: colors.text.secondary},
                  isSelected && {color: colors.info},
                ]}
              >
                {option.label}
              </Text>
              {isSelected && <Icon name="check" size={16} color={colors.info} />}
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={[styles.retentionDesc, {color: colors.text.tertiary}]}
      >
        {LOG_RETENTION_OPTIONS.find(opt => opt.value === settings.logRetentionPeriod)?.description}
      </Text>

      <View style={[styles.settingDivider, {backgroundColor: colors.border.default}]} />

      <TouchableOpacity
        onPress={async () => {
          Alert.alert('清除日志', '确定要清除所有日志记录吗？此操作无法撤销。', [
            {text: '取消', style: 'cancel'},
            {
              text: '确定',
              style: 'destructive',
              onPress: () => clearLogs(),
            },
          ]);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.settingItem}>
          <Icon name="trash-2" size={20} color={colors.status.error} />
          <View style={styles.settingInfo}>
            <Text style={[styles.settingTitleRed, {color: colors.status.error}]}>清除所有日志</Text>
          </View>
          <Icon name="chevron-right" size={20} color={colors.text.tertiary} />
        </View>
      </TouchableOpacity>
    </View>
  </View>
);
