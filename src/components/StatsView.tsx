import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import Icon from 'react-native-vector-icons/Feather';
import { CircularProgress } from './CircularProgress';
import { useApp } from '../contexts/AppContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { responsive, formatNumber, formatLatency } from '../utils/responsive';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useThemeColors } from '../styles/theme';

export const StatsView: React.FC = () => {
  // Hook顺序很重要！useContext hooks必须在最前面
  const insets = useSafeAreaInsets();
  const { statistics, logs } = useApp();
  const colors = useThemeColors();
  const { width, pagePadding, cardPadding } = useResponsiveLayout();

  const [selectedPeriod] = useState('today');

  const chartData = useMemo(() => {
    const hasData = statistics.chartData.length > 0;
    return {
      labels: hasData
        ? statistics.chartData.map(d => d.time)
        : ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
      datasets: [
        {
          data: hasData
            ? statistics.chartData.map(d => d.allowed + d.blocked)
            : [0, 0, 0, 0, 0, 0],
          color: (opacity = 1) => `rgba(6, 182, 212, ${opacity})`, // cyan-500
          strokeWidth: 3,
        },
      ],
    };
  }, [statistics.chartData]);

  const chartConfig = {
    backgroundColor: colors.background.elevated, // dynamic
    backgroundGradientFrom: colors.background.elevated, // dynamic
    backgroundGradientTo: colors.background.elevated, // dynamic
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`, // blue-500
    labelColor: (opacity = 1) => colors.text.secondary, // dynamic
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: '0',
    },
    propsForBackgroundLines: {
      strokeDasharray: '',
      stroke: colors.border.subtle, // dynamic slate-200 like
      strokeWidth: 1,
    },
    fillShadowGradientFrom: '#3b82f6',
    fillShadowGradientFromOpacity: 0.2, // Could adjust based on theme if needed, but 0.2 is fine
    fillShadowGradientTo: '#3b82f6',
    fillShadowGradientToOpacity: 0.05,
  };

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
        <Text style={[styles.title, { color: colors.text.primary }]}>数据统计</Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>全面了解家庭守护效果</Text>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: colors.background.elevated, borderColor: colors.border.default }]}>
          <Text style={[styles.summaryNumber, { color: colors.text.primary }]}>
            {formatNumber(statistics.totalRequests)}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.text.secondary }]}>总请求数</Text>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: colors.background.elevated, borderColor: colors.border.default }]}>
          <Text style={[styles.summaryNumber, { color: colors.text.primary }]}>
            {statistics.blockRate.toFixed(1)}%
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.text.secondary }]}>拦截率</Text>
        </View>
      </View>

      {/* Chart Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>请求趋势</Text>
          <View style={[styles.periodBadge, { backgroundColor: colors.background.secondary }]}>
            <Text style={[styles.periodText, { color: colors.text.secondary }]}>过去24小时</Text>
          </View>
        </View>

        <View
          style={[styles.chartCard, {
            backgroundColor: colors.background.elevated,
            borderColor: colors.border.default,
            padding: cardPadding
          }]}
          onLayout={(event) => {
            // Optional: could measure width here for even more precision
          }}
        >
          <LineChart
            data={chartData}
            width={width - (pagePadding * 2) - (cardPadding * 2) - 2} // Exact calculation: Screen - PagePadding - CardPadding - Border
            height={220}
            chartConfig={chartConfig}
            bezier
            style={styles.chart}
            withInnerLines={true}
            withOuterLines={false}
            withVerticalLabels={true}
            withHorizontalLabels={true}
            fromZero
            segments={4}
          />
        </View>
      </View>

      {/* Protection Rate Circle */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>守护效率</Text>

        <View style={[styles.circleCard, { backgroundColor: colors.background.elevated, borderColor: colors.border.default }]}>
          <CircularProgress
            percentage={Math.round(statistics.blockRate)}
            radius={70}
            strokeWidth={12}
            color={colors.info}
            backgroundColor={colors.background.tertiary} // dynamic track color
          />
          <Text style={[styles.circleTitle, { color: colors.text.primary }]}>整体拦截评分</Text>
          <Text style={[styles.circleDesc, { color: colors.text.secondary }]}>
            已成功拦截 {statistics.blockRate.toFixed(1)}% 的潜在威胁，为您的家庭提供安全的上网环境
          </Text>
        </View>
      </View>

      {/* Quick Stats */}
      <View style={styles.quickStats}>
        <View style={[styles.quickStatItem, { backgroundColor: colors.status.error + '10', borderColor: colors.status.error + '40' }]}>
          <Icon name="shield-off" size={24} color={colors.status.error} />
          <Text style={[styles.quickStatNumber, { color: colors.status.error }]}>
            {formatNumber(statistics.blockedRequests)}
          </Text>
          <Text style={[styles.quickStatLabel, { color: colors.text.secondary }]}>已拦截</Text>
        </View>

        <View style={[styles.quickStatItem, { backgroundColor: colors.status.active + '10', borderColor: colors.status.active + '40' }]}>
          <Icon name="check-circle" size={24} color={colors.status.active} />
          <Text style={[styles.quickStatNumber, { color: colors.status.active }]}>
            {formatNumber(statistics.allowedRequests)}
          </Text>
          <Text style={[styles.quickStatLabel, { color: colors.text.secondary }]}>安全访问</Text>
        </View>

        <View style={[styles.quickStatItem, { backgroundColor: colors.info + '10', borderColor: colors.info + '40' }]}>
          <Icon name="clock" size={24} color={colors.info} />
          <Text style={[styles.quickStatNumber, { color: colors.info }]}>
            {statistics.averageLatency > 0
              ? (() => {
                const latency = formatLatency(statistics.averageLatency);
                return `${latency.value}${latency.unit}`;
              })()
              : '--'}
          </Text>
          <Text style={[styles.quickStatLabel, { color: colors.text.secondary }]}>平均延迟</Text>
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
    // padding set dynamically via hook
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
    marginBottom: responsive.spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryNumber: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  summaryTrend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryTrendText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#06b6d4',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  periodBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  periodText: {
    fontSize: 11,
    fontWeight: '600',
  },
  chartCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  chart: {
    marginVertical: 0,
    borderRadius: 16,
  },
  circleCard: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  circleTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  circleDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  quickStats: {
    flexDirection: 'row',
    gap: 12,
  },
  quickStatItem: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    gap: 8,
  },
  quickStatNumber: {
    fontSize: 20,
    fontWeight: '700',
  },
  quickStatLabel: {
    fontSize: 11,
  },
});
