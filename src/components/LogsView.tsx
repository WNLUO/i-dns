import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useApp } from '../contexts/AppContext';
import { DnsLog } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { responsive, getPagePadding, getCardPadding } from '../utils/responsive';

interface LogItemProps {
  log: DnsLog;
}

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const LogItem: React.FC<LogItemProps> = ({ log }) => {
  const isBlocked = log.status === 'blocked';

  // Determine badge color and style based on content
  const getBadgeStyle = () => {
    if (log.category === '已拦截') {
      return { color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.15)' };
    } else if (log.category === '无记录') {
      // Domain exists but no A record - yellow
      return { color: '#eab308', bgColor: 'rgba(234, 179, 8, 0.15)' };
    } else if (log.category === '域名不存在') {
      // Domain does not exist (NXDOMAIN) - orange
      return { color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.15)' };
    } else if (log.category === '解析失败') {
      // DNS resolution failed - amber
      return { color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.15)' };
    } else {
      // IP address - use cyan/teal color
      return { color: '#06b6d4', bgColor: 'rgba(6, 182, 212, 0.15)' };
    }
  };

  const badgeStyle = getBadgeStyle();

  return (
    <View style={styles.logItem}>
      <Icon
        name={isBlocked ? 'shield' : 'check'}
        size={20}
        color={isBlocked ? '#ef4444' : '#10b981'}
      />
      <View style={styles.logContent}>
        <Text style={styles.logDomain} numberOfLines={1}>{log.domain}</Text>
        <View style={styles.logMeta}>
          <View style={[styles.categoryBadge, { backgroundColor: badgeStyle.bgColor }]}>
            <Text style={[styles.categoryText, { color: badgeStyle.color }]}>
              {log.category}
            </Text>
          </View>
          <Text style={styles.logTime}>{formatTimestamp(log.timestamp)}</Text>
        </View>
      </View>
      <View style={styles.latencyBadge}>
        <Icon name="activity" size={10} color="#06b6d4" />
        <Text style={styles.latencyText}>{log.latency}ms</Text>
      </View>
    </View>
  );
};

export const LogsView: React.FC = () => {
  // Hook顺序很重要！useContext hooks必须在最前面
  const insets = useSafeAreaInsets();
  const { logs, searchLogs, filterLogs } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'blocked' | 'allowed'>('all');

  const filters = [
    { id: 'all' as const, label: '全部', icon: 'list' },
    { id: 'blocked' as const, label: '已过滤', icon: 'shield' },
    { id: 'allowed' as const, label: '安全通过', icon: 'check-circle' },
  ];

  const filteredLogs = useMemo(() => {
    let result = logs;

    // 应用搜索过滤
    if (searchTerm.trim()) {
      result = searchLogs(searchTerm);
    }

    // 应用状态过滤
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
    <View style={styles.container}>
      {/* Header */}
      <View style={[
        styles.header,
        { paddingTop: Math.max(insets.top, 20) + responsive.spacing.lg }
      ]}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>活动日志</Text>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>实时</Text>
          </View>
        </View>

        {/* Stats Summary */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>总计</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#ef4444' }]}>{stats.blocked}</Text>
            <Text style={styles.statLabel}>过滤</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#10b981' }]}>{stats.allowed}</Text>
            <Text style={styles.statLabel}>安全</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Icon name="search" size={18} color="#64748b" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="搜索域名..."
            placeholderTextColor="#64748b"
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          {searchTerm.length > 0 && (
            <TouchableOpacity onPress={() => setSearchTerm('')} style={styles.clearButton}>
              <Icon name="x" size={16} color="#64748b" />
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
                  { backgroundColor: activeFilter === filter.id ? 'rgba(6, 182, 212, 0.2)' : 'rgba(51, 65, 85, 0.5)' },
                  activeFilter === filter.id && styles.filterChipActive,
                ]}
              >
                <Icon
                  name={filter.icon}
                  size={14}
                  color={activeFilter === filter.id ? '#06b6d4' : '#94a3b8'}
                />
                <Text
                  style={[
                    styles.filterText,
                    activeFilter === filter.id && styles.filterTextActive,
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
        renderItem={({ item }) => <LogItem log={item} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 20) + 100 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="inbox" size={48} color="#334155" />
            <Text style={styles.emptyText}>暂无日志记录</Text>
            <Text style={styles.emptyHint}>开始使用家庭守护后，活动记录会显示在这里</Text>
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
    paddingHorizontal: getPagePadding(),
    paddingBottom: responsive.spacing.lg,
    gap: responsive.spacing.lg,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: responsive.fontSize['5xl'],
    fontWeight: '700',
    color: '#fff',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ef4444',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#06b6d4',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#94a3b8',
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
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingLeft: 44,
    paddingRight: 44,
    fontSize: 14,
    color: '#fff',
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
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  filterChipActive: {
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  filterTextActive: {
    color: '#06b6d4',
  },
  listContent: {
    padding: 24,
    paddingTop: 8,
    gap: 8,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    gap: 12,
  },
  logContent: {
    flex: 1,
    gap: 6,
  },
  logDomain: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  logMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '600',
  },
  logTime: {
    fontSize: 11,
    color: '#64748b',
    fontVariant: ['tabular-nums'],
  },
  latencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  latencyText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#06b6d4',
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
    color: '#475569',
  },
  emptyHint: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 20,
  },
});
