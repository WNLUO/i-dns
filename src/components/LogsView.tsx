import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useApp } from '../contexts/AppContext';
import { DnsLog } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { responsive, formatLatency } from '../utils/responsive';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useThemeColors } from '../styles/theme';

interface LogItemProps {
  log: DnsLog;
  colors: any;
}

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

// Memoize LogItem to prevent unnecessary re-renders
const LogItem: React.FC<LogItemProps> = React.memo(({ log, colors }) => {
  const isBlocked = log.status === 'blocked';

  // Determine badge color and style based on content
  const getBadgeStyle = () => {
    // For status badges in dark mode, we might want slightly darker backgrounds
    // but preserving the 'color' essence.
    // We can use opacity on the color for background.
    if (log.category === '已拦截') {
      return { color: colors.status.error, bgColor: colors.status.error + '20' }; // 20 hex = ~12% opacity
    } else if (log.category === '无记录') {
      return { color: colors.status.warning, bgColor: colors.status.warning + '20' };
    } else if (log.category === '域名不存在') {
      return { color: '#f97316', bgColor: '#f9731620' }; // Orange
    } else if (log.category === '解析失败') {
      return { color: colors.status.warning, bgColor: colors.status.warning + '20' };
    } else {
      return { color: colors.info, bgColor: colors.info + '20' };
    }
  };

  const badgeStyle = getBadgeStyle();
  const latency = formatLatency(log.latency);

  return (
    <View style={[styles.logItem, { backgroundColor: colors.background.elevated, borderColor: colors.border.default }]}>
      <Icon
        name={isBlocked ? 'shield' : 'check'}
        size={20}
        color={isBlocked ? colors.status.error : colors.status.active}
      />
      <View style={styles.logContent}>
        <Text style={[styles.logDomain, { color: colors.text.primary }]} numberOfLines={1}>{log.domain}</Text>
        <View style={[styles.categoryBadge, { backgroundColor: badgeStyle.bgColor }]}>
          <Text style={[styles.categoryText, { color: badgeStyle.color }]}>
            {log.category}
          </Text>
        </View>
      </View>
      <View style={styles.rightColumn}>
        <View style={[styles.latencyBadge, { backgroundColor: colors.info + '10' }]}>
          <Icon name="activity" size={10} color={colors.info} />
          <Text style={[styles.latencyText, { color: colors.info }]}>{latency.value}{latency.unit}</Text>
        </View>
        <Text style={[styles.logTime, { color: colors.text.tertiary }]}>{formatTimestamp(log.timestamp)}</Text>
      </View>
    </View>
  );
});

export const LogsView: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { logs, searchLogs, filterLogs } = useApp();
  const colors = useThemeColors();
  const { pagePadding } = useResponsiveLayout();

  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'blocked' | 'allowed'>('all');

  const filters = [
    { id: 'all' as const, label: '全部', icon: 'list' },
    { id: 'blocked' as const, label: '已过滤', icon: 'shield' },
    { id: 'allowed' as const, label: '安全通过', icon: 'check-circle' },
  ];

  const filteredLogs = useMemo(() => {
    let result = logs;

    if (searchTerm.trim()) {
      result = searchLogs(searchTerm);
    }

    if (activeFilter !== 'all') {
      result = result.filter(log => log.status === activeFilter);
    }

    return result;
  }, [logs, searchTerm, activeFilter, searchLogs]);

  const stats = useMemo(() => {
    const blocked = logs.filter(log => log.status === 'blocked').length;
    const allowed = logs.filter(log => log.status === 'allowed').length;
    return { blocked, allowed, total: logs.length };
  }, [logs]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={[
        styles.header,
        {
          paddingTop: Math.max(insets.top, 20) + responsive.spacing.lg,
          paddingHorizontal: pagePadding,
          backgroundColor: colors.background.primary,
          borderBottomColor: colors.border.subtle
        }
      ]}>
        <View style={styles.headerTop}>
          <Text style={[styles.title, { color: colors.text.primary }]}>活动日志</Text>
          <View style={[styles.liveIndicator, { backgroundColor: colors.status.error + '10' }]}>
            <View style={[styles.liveDot, { backgroundColor: colors.status.error }]} />
            <Text style={[styles.liveText, { color: colors.status.error }]}>实时</Text>
          </View>
        </View>

        {/* Stats Summary */}
        <View style={[styles.statsRow, { backgroundColor: colors.background.elevated, borderColor: colors.border.default }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.status.error }]}>{stats.blocked}</Text>
            <Text style={[styles.statLabel, { color: colors.text.secondary }]}>过滤</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border.default }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.status.active }]}>{stats.allowed}</Text>
            <Text style={[styles.statLabel, { color: colors.text.secondary }]}>安全</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Icon name="search" size={18} color={colors.text.tertiary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { backgroundColor: colors.background.secondary, color: colors.text.primary }]}
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

        {/* Filter Chips */}
        <View style={styles.filterRow}>
          {filters.map(filter => (
            <TouchableOpacity
              key={filter.id}
              onPress={() => setActiveFilter(filter.id)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: activeFilter === filter.id ? colors.background.tertiary : colors.background.secondary,
                    borderColor: activeFilter === filter.id ? colors.border.focus : 'transparent'
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
                    { color: activeFilter === filter.id ? colors.info : colors.text.secondary }
                  ]}
                >
                  {filter.label}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Logs List */}
      <FlatList
        data={filteredLogs}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <LogItem log={item} colors={colors} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 20) + 100 }]}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={15}
        windowSize={21}
        getItemLayout={(data, index) => ({
          length: 72,
          offset: 72 * index,
          index,
        })}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="inbox" size={48} color={colors.text.disabled} />
            <Text style={[styles.emptyText, { color: colors.text.secondary }]}>暂无日志记录</Text>
            <Text style={[styles.emptyHint, { color: colors.text.tertiary }]}>开始使用家庭守护后，活动记录会显示在这里</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    // paddingHorizontal set dynamically
    paddingBottom: responsive.spacing.lg,
    gap: responsive.spacing.lg,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: responsive.fontSize['4xl'],
    fontWeight: '700',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 32,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
  },
  searchContainer: {
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: 16,
    top: 14,
    zIndex: 1,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 16,
    paddingVertical: 12,
    paddingLeft: 44,
    paddingRight: 44,
    fontSize: 14,
  },
  clearButton: {
    position: 'absolute',
    right: 16,
    top: 14,
    zIndex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterTextActive: {
    // handled inline
  },
  listContent: {
    padding: 24,
    paddingTop: 8,
    gap: 8,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    gap: 12,
  },
  logContent: {
    flex: 1,
    gap: 6,
  },
  logDomain: {
    fontSize: 14,
    fontWeight: '600',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '600',
  },
  rightColumn: {
    alignItems: 'flex-end',
    gap: 6,
  },
  logTime: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  latencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  latencyText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 20,
  },
});
