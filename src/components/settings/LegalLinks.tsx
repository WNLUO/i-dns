import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {styles} from './styles';

interface LegalLinksProps {
  colors: any;
  onNavigate?: (page: 'user-agreement' | 'privacy-policy' | 'child-protection' | 'tutorial') => void;
}

export const LegalLinks: React.FC<LegalLinksProps> = ({colors, onNavigate}) => (
  <View style={styles.section}>
    <View style={[styles.legalSection, {backgroundColor: colors.background.secondary, borderColor: colors.border.default}]}
    >
      <TouchableOpacity activeOpacity={0.7} onPress={() => onNavigate?.('user-agreement')}>
        <View style={styles.legalItem}>
          <Text style={[styles.legalText, {color: colors.text.primary}]}>用户协议</Text>
          <Icon name="chevron-right" size={18} color={colors.text.tertiary} />
        </View>
      </TouchableOpacity>

      <View style={[styles.legalDivider, {backgroundColor: colors.border.default}]} />

      <TouchableOpacity activeOpacity={0.7} onPress={() => onNavigate?.('privacy-policy')}>
        <View style={styles.legalItem}>
          <Text style={[styles.legalText, {color: colors.text.primary}]}>隐私政策</Text>
          <Icon name="chevron-right" size={18} color={colors.text.tertiary} />
        </View>
      </TouchableOpacity>

      <View style={[styles.legalDivider, {backgroundColor: colors.border.default}]} />

      <TouchableOpacity activeOpacity={0.7} onPress={() => onNavigate?.('child-protection')}>
        <View style={styles.legalItem}>
          <Text style={[styles.legalText, {color: colors.text.primary}]}>儿童个人信息保护规则</Text>
          <Icon name="chevron-right" size={18} color={colors.text.tertiary} />
        </View>
      </TouchableOpacity>

      <View style={[styles.legalDivider, {backgroundColor: colors.border.default}]} />

      <TouchableOpacity activeOpacity={0.7} onPress={() => onNavigate?.('tutorial')}>
        <View style={styles.legalItem}>
          <Text style={[styles.legalText, {color: colors.text.primary}]}>使用教程</Text>
          <Icon name="chevron-right" size={18} color={colors.text.tertiary} />
        </View>
      </TouchableOpacity>
    </View>
  </View>
);
