import React from 'react';
import {View, Text} from 'react-native';
import {LineChart} from 'react-native-chart-kit';
import {styles} from './styles';

interface TrendChartProps {
  colors: any;
  width: number;
  pagePadding: number;
  cardPadding: number;
  chartData: {labels: string[]; datasets: Array<{data: number[]; color: (opacity?: number) => string; strokeWidth: number}>};
}

export const TrendChart: React.FC<TrendChartProps> = ({
  colors,
  width,
  pagePadding,
  cardPadding,
  chartData,
}) => {
  const chartConfig = {
    backgroundColor: colors.background.elevated,
    backgroundGradientFrom: colors.background.elevated,
    backgroundGradientTo: colors.background.elevated,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
    labelColor: () => colors.text.secondary,
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: '0',
    },
    propsForBackgroundLines: {
      strokeDasharray: '',
      stroke: colors.border.subtle,
      strokeWidth: 1,
    },
    fillShadowGradientFrom: '#3b82f6',
    fillShadowGradientFromOpacity: 0.2,
    fillShadowGradientTo: '#3b82f6',
    fillShadowGradientToOpacity: 0.05,
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, {color: colors.text.primary}]}>请求趋势</Text>
        <View style={[styles.periodBadge, {backgroundColor: colors.background.secondary}]}
        >
          <Text style={[styles.periodText, {color: colors.text.secondary}]}>过去24小时</Text>
        </View>
      </View>

      <View
        style={[
          styles.chartCard,
          {backgroundColor: colors.background.elevated, borderColor: colors.border.default, padding: cardPadding},
        ]}
      >
        <LineChart
          data={chartData}
          width={width - pagePadding * 2 - cardPadding * 2 - 2}
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
  );
};
