// 过滤器芯片组件
import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, alpha } from '../styles/colors';
import { borderRadius, spacing } from '../styles/theme';

interface FilterChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
}

export const FilterChip: React.FC<FilterChipProps> = ({ label, active, onPress }) => {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: alpha(colors.slate700, 0.5),
    borderWidth: 1,
    borderColor: alpha(colors.slate600, 0.5),
  },
  chipActive: {
    backgroundColor: alpha(colors.emerald500, 0.2),
    borderColor: colors.emerald500,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.slate400,
  },
  labelActive: {
    color: colors.emerald400,
  },
});
