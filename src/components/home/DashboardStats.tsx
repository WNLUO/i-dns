import React from 'react';
import {View, Text} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {Statistics} from '../../types';
import {formatNumber} from '../../utils/responsive';
import {styles} from './styles';

interface DashboardStatsProps {
  todayStatistics: Statistics;
  colors: any;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({todayStatistics, colors}) => (
  <View style={styles.dashboardGrid}>
    <View style={[styles.dashboardCard, {backgroundColor: colors.background.elevated, borderColor: colors.border.default}]}>
      <View style={[styles.dashboardIcon, {backgroundColor: colors.background.secondary}]}>
        <Icon name="x-circle" size={24} color={colors.status.error} />
      </View>
      <View>
        <Text style={[styles.dashboardValue, {color: colors.text.primary}]}>
          {formatNumber(todayStatistics.blockedRequests)}
        </Text>
        <Text style={[styles.dashboardLabel, {color: colors.text.secondary}]}>已过滤</Text>
      </View>
    </View>

    <View style={[styles.dashboardCard, {backgroundColor: colors.background.elevated, borderColor: colors.border.default}]}>
      <View style={[styles.dashboardIcon, {backgroundColor: colors.background.secondary}]}>
        <Icon name="check-circle" size={24} color={colors.status.active} />
      </View>
      <View>
        <Text style={[styles.dashboardValue, {color: colors.text.primary}]}>
          {formatNumber(todayStatistics.allowedRequests)}
        </Text>
        <Text style={[styles.dashboardLabel, {color: colors.text.secondary}]}>安全访问</Text>
      </View>
    </View>

    <View style={[styles.dashboardCard, {backgroundColor: colors.background.elevated, borderColor: colors.border.default}]}>
      <View style={[styles.dashboardIcon, {backgroundColor: colors.background.secondary}]}>
        <Icon name="activity" size={24} color={colors.info} />
      </View>
      <View>
        <Text style={[styles.dashboardValue, {color: colors.text.primary}]}>
          {formatNumber(todayStatistics.totalRequests)}
        </Text>
        <Text style={[styles.dashboardLabel, {color: colors.text.secondary}]}>总请求数</Text>
      </View>
    </View>

    <View style={[styles.dashboardCard, {backgroundColor: colors.background.elevated, borderColor: colors.border.default}]}>
      <View style={[styles.dashboardIcon, {backgroundColor: colors.background.secondary}]}>
        <Icon name="pie-chart" size={24} color={colors.status.warning} />
      </View>
      <View>
        <Text style={[styles.dashboardValue, {color: colors.text.primary}]}>
          {todayStatistics.blockRate.toFixed(1)}%
        </Text>
        <Text style={[styles.dashboardLabel, {color: colors.text.secondary}]}>拦截率</Text>
      </View>
    </View>
  </View>
);
