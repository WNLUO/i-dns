import React from 'react';
import {View, Text, Switch} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {styles} from './styles';

interface DnsProtectionCardProps {
  colors: any;
  dnssecEnabled: boolean;
  onToggleDnssec: (enabled: boolean) => void;
}

export const DnsProtectionCard: React.FC<DnsProtectionCardProps> = ({
  colors,
  dnssecEnabled,
  onToggleDnssec,
}) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Icon name="shield" size={18} color={colors.info} />
      <Text style={[styles.sectionTitle, {color: colors.text.primary}]}>DNS 保护</Text>
    </View>
    <View style={[styles.settingsCard, {backgroundColor: colors.background.elevated, borderColor: colors.border.default}]}>
      <Text style={[styles.dataLabel, {color: colors.text.primary}]}>DoH 加密模式</Text>
      <Text style={[styles.retentionDesc, {color: colors.text.secondary}]}
      >
        使用 DNS over HTTPS 协议，通过加密的 HTTPS 连接到 i-dns.wnluo.com 进行 DNS 查询，提供隐私保护和智能过滤。
      </Text>
      <View style={{marginTop: 8, flexDirection: 'row', alignItems: 'center'}}>
        <Icon name="lock" size={12} color={colors.success} style={{marginRight: 4}} />
        <Text style={[styles.retentionDesc, {color: colors.success, fontSize: 11}]}>
          HTTPS 加密传输 • 隐私保护 • 防止 DNS 劫持
        </Text>
      </View>

      <View style={[styles.settingDivider, {backgroundColor: colors.border.default}]} />

      <View style={styles.settingSwitchRow}>
        <View style={styles.settingTextBlock}>
          <Text style={[styles.settingSwitchTitle, {color: colors.text.primary}]}>DNSSEC 验证</Text>
          <Text style={[styles.settingSwitchDesc, {color: colors.text.secondary}]}>
            启用 EDNS DO 位，请求 DNSSEC 相关记录
          </Text>
        </View>
        <Switch
          value={dnssecEnabled}
          onValueChange={onToggleDnssec}
          trackColor={{false: colors.border.default, true: colors.info}}
          thumbColor={dnssecEnabled ? colors.background.primary : colors.background.secondary}
        />
      </View>
    </View>
  </View>
);
