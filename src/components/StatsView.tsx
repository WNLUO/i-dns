import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import Icon from 'react-native-vector-icons/Feather';
import { CircularProgress } from './CircularProgress';
import { useApp } from '../contexts/AppContext';
import { getCategoryBreakdown } from '../services/statistics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { responsive, getCardPadding, getPagePadding, screenWidth } from '../utils/responsive';

export const StatsView: React.FC = () => {
  // Hook顺序很重要！useContext hooks必须在最前面
  const insets = useSafeAreaInsets();
  const { statistics, logs } = useApp();

  const [selectedPeriod] = useState('today');

  const categoryBreakdown = useMemo(() => getCategoryBreakdown(logs), [logs]);

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
          color: (opacity = 1) => `rgba(6, 182, 212, ${opacity})`,
          strokeWidth: 3,
        },
      ],
    };
  }, [statistics.chartData]);

  const chartConfig = {
    backgroundColor: 'transparent',
    backgroundGradientFrom: 'transparent',
    backgroundGradientTo: 'transparent',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(6, 182, 212, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: '0',
    },
    propsForBackgroundLines: {
      strokeDasharray: '',
      stroke: 'rgba(255, 255, 255, 0.05)',
      strokeWidth: 1,
    },
    fillShadowGradientFrom: '#06b6d4',
    fillShadowGradientFromOpacity: 0.3,
    fillShadowGradientTo: '#8b5cf6',
    fillShadowGradientToOpacity: 0.05,
  };

  const categories = categoryBreakdown.map(cat => ({
    name: cat.name,
    value: cat.percentage,
    color: cat.color,
    icon: cat.name === '追踪器' ? 'eye-off' :
          cat.name === '广告' ? 'alert-circle' :
          cat.name === '恶意内容' ? 'shield' : 'filter',
  }));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(insets.top, 20) + responsive.spacing.lg,
          paddingBottom: Math.max(insets.bottom, 20) + 100,
        }
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>数据统计</Text>
        <Text style={styles.subtitle}>全面了解家庭守护效果</Text>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>
            {statistics.totalRequests.toLocaleString()}
          </Text>
          <Text style={styles.summaryLabel}>总请求数</Text>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}>
          <Text style={styles.summaryNumber}>
            {statistics.blockRate.toFixed(1)}%
          </Text>
          <Text style={styles.summaryLabel}>拦截率</Text>
        </View>
      </View>

      {/* Chart Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>请求趋势</Text>
          <View style={styles.periodBadge}>
            <Text style={styles.periodText}>过去24小时</Text>
          </View>
        </View>

        <View style={styles.chartCard}>
          <LineChart
            data={chartData}
            width={screenWidth - 72}
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

      {/* Category Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>拦截分类</Text>

        <View style={styles.categoriesGrid}>
          {categories.map((category, index) => (
            <View key={index} style={styles.categoryCard}>
              <Icon name={category.icon} size={24} color={category.color} />
              <View style={styles.categoryInfo}>
                <Text style={styles.categoryName}>{category.name}</Text>
                <View style={styles.categoryStats}>
                  <Text style={styles.categoryPercent}>{category.value}%</Text>
                  <View style={styles.categoryBar}>
                    <View
                      style={[
                        styles.categoryBarFill,
                        { width: `${category.value}%`, backgroundColor: category.color },
                      ]}
                    />
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Protection Rate Circle */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>守护效率</Text>

        <View style={styles.circleCard}>
          <CircularProgress
            percentage={Math.round(statistics.blockRate)}
            size={140}
            strokeWidth={12}
            color="#06b6d4"
            backgroundColor="rgba(255, 255, 255, 0.1)"
          />
          <Text style={styles.circleTitle}>整体拦截评分</Text>
          <Text style={styles.circleDesc}>
            已成功拦截 {statistics.blockRate.toFixed(1)}% 的潜在威胁，为您的家庭提供安全的上网环境
          </Text>
        </View>
      </View>

      {/* Quick Stats */}
      <View style={styles.quickStats}>
        <View style={styles.quickStatItem}>
          <Icon name="shield-off" size={24} color="#10b981" />
          <Text style={styles.quickStatNumber}>
            {statistics.blockedRequests.toLocaleString()}
          </Text>
          <Text style={styles.quickStatLabel}>已拦截</Text>
        </View>

        <View style={[styles.quickStatItem, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
          <Icon name="check-circle" size={24} color="#3b82f6" />
          <Text style={styles.quickStatNumber}>
            {statistics.allowedRequests.toLocaleString()}
          </Text>
          <Text style={styles.quickStatLabel}>安全访问</Text>
        </View>

        <View style={[styles.quickStatItem, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}>
          <Icon name="clock" size={24} color="#8b5cf6" />
          <Text style={styles.quickStatNumber}>
            {statistics.averageLatency > 0 ? `${Math.round(statistics.averageLatency)}ms` : '--'}
          </Text>
          <Text style={styles.quickStatLabel}>平均延迟</Text>
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
    padding: getPagePadding(),
  },
  header: {
    marginBottom: responsive.spacing['2xl'],
  },
  title: {
    fontSize: responsive.fontSize['5xl'],
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: responsive.fontSize.base,
    color: '#94a3b8',
    marginBottom: responsive.spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  summaryNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 8,
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
    color: '#fff',
  },
  periodBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  periodText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#06b6d4',
  },
  chartCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
  },
  chart: {
    marginVertical: 0,
    borderRadius: 16,
  },
  categoriesGrid: {
    gap: 12,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  categoryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryPercent: {
    fontSize: 16,
    fontWeight: '700',
    color: '#06b6d4',
    minWidth: 40,
  },
  categoryBar: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  categoryBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  circleCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    gap: 16,
  },
  circleTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  circleDesc: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
  },
  quickStats: {
    flexDirection: 'row',
    gap: 12,
  },
  quickStatItem: {
    flex: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    gap: 8,
  },
  quickStatNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  quickStatLabel: {
    fontSize: 11,
    color: '#94a3b8',
  },
});
