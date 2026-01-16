import React, {useMemo} from 'react';
import {View, Text, Dimensions} from 'react-native';
import {LineChart} from 'react-native-chart-kit';
import Icon from 'react-native-vector-icons/Feather';
import {Statistics} from '../../types';
import {CircularProgress} from '../CircularProgress';
import {formatNumber} from '../../utils/responsive';
import {styles} from './styles';

interface ProtectionRateCardProps {
  statistics: Statistics;
  colors: any;
}

export const ProtectionRateCard: React.FC<ProtectionRateCardProps> = ({statistics, colors}) => {
  const screenWidth = Dimensions.get('window').width;

  // 计算7日平均拦截率
  const weeklyAverageRate = useMemo(() => {
    if (!statistics.blockRateHistory || statistics.blockRateHistory.length === 0) {
      return 0;
    }
    const validDays = statistics.blockRateHistory.filter(d => d.totalRequests > 0);
    if (validDays.length === 0) return 0;
    const sum = validDays.reduce((acc, d) => acc + d.blockRate, 0);
    return sum / validDays.length;
  }, [statistics.blockRateHistory]);

  // 计算趋势（今日vs 7日平均）
  const trend = useMemo(() => {
    const diff = statistics.blockRate - weeklyAverageRate;
    return {
      value: Math.abs(diff),
      isUp: diff > 0,
    };
  }, [statistics.blockRate, weeklyAverageRate]);

  // 准备图表数据
  const chartData = useMemo(() => {
    if (!statistics.blockRateHistory || statistics.blockRateHistory.length === 0) {
      return {
        labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
        datasets: [{data: [0, 0, 0, 0, 0, 0, 0]}],
      };
    }

    const labels = statistics.blockRateHistory.map(d => {
      const date = new Date(d.date);
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return weekdays[date.getDay()];
    });

    const data = statistics.blockRateHistory.map(d => d.blockRate);

    return {
      labels,
      datasets: [{data}],
    };
  }, [statistics.blockRateHistory]);

  const chartConfig = {
    backgroundColor: colors.background.elevated,
    backgroundGradientFrom: colors.background.elevated,
    backgroundGradientTo: colors.background.elevated,
    decimalPlaces: 1,
    color: (opacity = 1) => `rgba(6, 182, 212, ${opacity})`,
    labelColor: () => colors.text.tertiary,
    style: {borderRadius: 12},
    propsForDots: {r: '4', strokeWidth: '2', stroke: colors.info},
    propsForBackgroundLines: {
      strokeDasharray: '',
      stroke: colors.border.subtle,
      strokeWidth: 1,
    },
    fillShadowGradientFrom: colors.info,
    fillShadowGradientFromOpacity: 0.3,
    fillShadowGradientTo: colors.info,
    fillShadowGradientToOpacity: 0.05,
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, {color: colors.text.primary}]}>守护效率</Text>

      <View style={[styles.circleCard, {backgroundColor: colors.background.elevated, borderColor: colors.border.default}]}>
        {/* 主要拦截率展示 */}
        <CircularProgress
          percentage={Math.round(statistics.blockRate)}
          radius={70}
          strokeWidth={12}
          color={colors.info}
          backgroundColor={colors.background.tertiary}
        />
        <Text style={[styles.circleTitle, {color: colors.text.primary}]}>整体拦截评分</Text>
        <Text style={[styles.circleDesc, {color: colors.text.secondary}]}>
          已成功拦截 {statistics.blockRate.toFixed(1)}% 的潜在威胁，为您的家庭提供安全的上网环境
        </Text>

        {/* 对比指标 */}
        <View style={styles.comparisonContainer}>
          <View style={styles.comparisonItem}>
            <Text style={[styles.comparisonLabel, {color: colors.text.secondary}]}>7日平均</Text>
            <Text style={[styles.comparisonValue, {color: colors.text.primary}]}>
              {weeklyAverageRate.toFixed(1)}%
            </Text>
          </View>

          <View style={[styles.comparisonDivider, {backgroundColor: colors.border.default}]} />

          <View style={styles.comparisonItem}>
            <Text style={[styles.comparisonLabel, {color: colors.text.secondary}]}>趋势</Text>
            <View style={styles.trendRow}>
              <Icon
                name={trend.isUp ? 'trending-up' : 'trending-down'}
                size={16}
                color={trend.isUp ? colors.status.active : colors.status.error}
              />
              <Text style={[styles.comparisonValue, {
                color: trend.isUp ? colors.status.active : colors.status.error,
                marginLeft: 4,
              }]}>
                {trend.value.toFixed(1)}%
              </Text>
            </View>
          </View>
        </View>

        {/* 7日趋势图 */}
        <View style={styles.trendChartContainer}>
          <Text style={[styles.chartTitle, {color: colors.text.primary}]}>7日拦截率趋势</Text>
          <LineChart
            data={chartData}
            width={screenWidth - 80}
            height={160}
            chartConfig={chartConfig}
            bezier
            style={styles.miniChart}
            withInnerLines={true}
            withOuterLines={false}
            withVerticalLabels={true}
            withHorizontalLabels={true}
            fromZero
            segments={4}
            yAxisSuffix="%"
          />
        </View>

        {/* 详细分类统计 */}
        <View style={styles.detailStats}>
          <Text style={[styles.detailStatsTitle, {color: colors.text.primary}]}>详细统计</Text>

          <View style={styles.detailStatsRow}>
            <View style={styles.detailStatItem}>
              <View style={styles.detailStatHeader}>
                <Icon name="shield-off" size={18} color={colors.status.error} />
                <Text style={[styles.detailStatLabel, {color: colors.text.secondary}]}>已拦截</Text>
              </View>
              <Text style={[styles.detailStatValue, {color: colors.text.primary}]}>
                {formatNumber(statistics.blockedRequests)}
              </Text>
              <View style={[styles.progressBar, {backgroundColor: colors.background.tertiary}]}>
                <View style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.status.error,
                    width: `${statistics.totalRequests > 0 ? (statistics.blockedRequests / statistics.totalRequests) * 100 : 0}%`,
                  },
                ]} />
              </View>
            </View>

            <View style={styles.detailStatItem}>
              <View style={styles.detailStatHeader}>
                <Icon name="check-circle" size={18} color={colors.status.active} />
                <Text style={[styles.detailStatLabel, {color: colors.text.secondary}]}>安全访问</Text>
              </View>
              <Text style={[styles.detailStatValue, {color: colors.text.primary}]}>
                {formatNumber(statistics.allowedRequests)}
              </Text>
              <View style={[styles.progressBar, {backgroundColor: colors.background.tertiary}]}>
                <View style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.status.active,
                    width: `${statistics.totalRequests > 0 ? (statistics.allowedRequests / statistics.totalRequests) * 100 : 0}%`,
                  },
                ]} />
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};
