import React from 'react';
import {ScrollView, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useApp} from '../../contexts/AppContext';
import {useResponsiveLayout} from '../../hooks/useResponsiveLayout';
import {responsive} from '../../utils/responsive';
import {useThemeColors} from '../../styles/theme';
import {DnsProtectionCard} from './DnsProtectionCard';
import {DataSettingsCard} from './DataSettingsCard';
import {LegalLinks} from './LegalLinks';
import {styles} from './styles';

interface SettingsViewProps {
  onNavigate?: (page: 'user-agreement' | 'privacy-policy' | 'child-protection' | 'tutorial') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({onNavigate}) => {
  const insets = useSafeAreaInsets();
  const {settings, updateSettings, clearLogs} = useApp();
  const colors = useThemeColors();
  const {pagePadding} = useResponsiveLayout();

  return (
    <ScrollView
      style={[styles.container, {backgroundColor: colors.background.primary}]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(insets.top, 20) + responsive.spacing.lg,
          paddingBottom: Math.max(insets.bottom, 20) + 100,
          paddingHorizontal: pagePadding,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={[styles.title, {color: colors.text.primary}]}>设置</Text>
        <Text style={[styles.subtitle, {color: colors.text.secondary}]}>个性化您的家庭网络守护体验</Text>
      </View>

      <DnsProtectionCard
        colors={colors}
        dnssecEnabled={settings.dnssecEnabled}
        onToggleDnssec={(enabled) => updateSettings({dnssecEnabled: enabled})}
      />
      <DataSettingsCard
        colors={colors}
        settings={settings}
        updateSettings={updateSettings}
        clearLogs={clearLogs}
      />
      <LegalLinks colors={colors} onNavigate={onNavigate} />
    </ScrollView>
  );
};
