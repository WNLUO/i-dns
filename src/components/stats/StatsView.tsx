import React, {useMemo, useState} from 'react';
import {ScrollView, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useApp} from '../../contexts/AppContext';
import {useResponsiveLayout} from '../../hooks/useResponsiveLayout';
import {responsive} from '../../utils/responsive';
import {useThemeColors} from '../../styles/theme';
import {SummaryCards} from './SummaryCards';
import {TrendChart} from './TrendChart';
import {ProtectionRateCard} from './ProtectionRateCard';
import {QuickStats} from './QuickStats';
import {styles} from './styles';

export const StatsView: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {statistics} = useApp();
  const colors = useThemeColors();
  const {width, pagePadding, cardPadding} = useResponsiveLayout();

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
          color: (opacity = 1) => `rgba(6, 182, 212, ${opacity})`,
          strokeWidth: 3,
        },
      ],
    };
  }, [statistics.chartData, selectedPeriod]);

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
        <Text style={[styles.title, {color: colors.text.primary}]}>数据统计</Text>
        <Text style={[styles.subtitle, {color: colors.text.secondary}]}>全面了解家庭守护效果</Text>
      </View>

      <SummaryCards statistics={statistics} colors={colors} />
      <TrendChart
        colors={colors}
        width={width}
        pagePadding={pagePadding}
        cardPadding={cardPadding}
        chartData={chartData}
      />
      <ProtectionRateCard statistics={statistics} colors={colors} />
      <QuickStats statistics={statistics} colors={colors} />
    </ScrollView>
  );
};
