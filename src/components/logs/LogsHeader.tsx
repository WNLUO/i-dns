import React from 'react';
import {View, Text, TextInput, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {responsive} from '../../utils/responsive';
import {styles} from './styles';

interface LogsHeaderProps {
  colors: any;
  pagePadding: number;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  activeFilter: 'all' | 'blocked' | 'allowed';
  setActiveFilter: (value: 'all' | 'blocked' | 'allowed') => void;
  blocked: number;
  allowed: number;
}

const filters = [
  {id: 'all' as const, label: '全部', icon: 'list'},
  {id: 'blocked' as const, label: '已过滤', icon: 'shield'},
  {id: 'allowed' as const, label: '安全通过', icon: 'check-circle'},
];

export const LogsHeader: React.FC<LogsHeaderProps> = ({
  colors,
  pagePadding,
  searchTerm,
  setSearchTerm,
  activeFilter,
  setActiveFilter,
  blocked,
  allowed,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: Math.max(insets.top, 20) + responsive.spacing.lg,
          paddingHorizontal: pagePadding,
          backgroundColor: colors.background.primary,
          borderBottomColor: colors.border.subtle,
        },
      ]}
    >
      <View style={styles.headerTop}>
        <Text style={[styles.title, {color: colors.text.primary}]}>活动日志</Text>
        <View style={[styles.liveIndicator, {backgroundColor: `${colors.status.error}10`}]}>
          <View style={[styles.liveDot, {backgroundColor: colors.status.error}]} />
          <Text style={[styles.liveText, {color: colors.status.error}]}>实时</Text>
        </View>
      </View>

      <View style={[styles.statsRow, {backgroundColor: colors.background.elevated, borderColor: colors.border.default}]}
      >
        <View style={styles.statItem}>
          <Text style={[styles.statValue, {color: colors.status.error}]}>{blocked}</Text>
          <Text style={[styles.statLabel, {color: colors.text.secondary}]}>过滤</Text>
        </View>
        <View style={[styles.statDivider, {backgroundColor: colors.border.default}]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, {color: colors.status.active}]}>{allowed}</Text>
          <Text style={[styles.statLabel, {color: colors.text.secondary}]}>安全</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Icon name="search" size={18} color={colors.text.tertiary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, {backgroundColor: colors.background.secondary, color: colors.text.primary}]}
          placeholder="搜索域名...(只支持最近1000条记录)"
          placeholderTextColor={colors.text.tertiary}
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
        {searchTerm.length > 0 && (
          <TouchableOpacity onPress={() => setSearchTerm('')} style={styles.clearButton}>
            <Icon name="x" size={16} color={colors.text.tertiary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        {filters.map(filter => (
          <TouchableOpacity key={filter.id} onPress={() => setActiveFilter(filter.id)} activeOpacity={0.7}>
            <View
              style={[
                styles.filterChip,
                {
                  backgroundColor:
                    activeFilter === filter.id ? colors.background.tertiary : colors.background.secondary,
                  borderColor: activeFilter === filter.id ? colors.border.focus : 'transparent',
                },
              ]}
            >
              <Icon
                name={filter.icon}
                size={14}
                color={activeFilter === filter.id ? colors.info : colors.text.tertiary}
              />
              <Text
                style={[
                  styles.filterText,
                  {color: activeFilter === filter.id ? colors.info : colors.text.secondary},
                ]}
              >
                {filter.label}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};
