import React from 'react';
import {View, Text} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {Statistics} from '../../types';
import {formatNumber} from '../../utils/responsive';
import {styles} from './styles';

interface TraditionalStatsProps {
  todayStatistics: Statistics;
  colors: any;
}

export const TraditionalStats: React.FC<TraditionalStatsProps> = ({todayStatistics, colors}) => (
  <View style={styles.statsSection}>
    <Text style={[styles.sectionTitle, {color: colors.text.tertiary}]}>今日统计</Text>
    <View style={styles.statsGrid}>
      <View style={[styles.statCard, {backgroundColor: colors.background.elevated, borderColor: colors.border.default}]}>
        <View style={[styles.iconContainer, {backgroundColor: colors.background.secondary}]}>
          <Icon name="x-circle" size={24} color={colors.status.error} />
        </View>
        <View>
          <Text style={[styles.statNumber, {color: colors.text.primary}]} numberOfLines={1}>
            {formatNumber(todayStatistics.blockedRequests)}
          </Text>
          <Text style={[styles.statLabel, {color: colors.text.secondary}]} numberOfLines={1}>
            已过滤
          </Text>
        </View>
      </View>
      <View style={[styles.statCard, {backgroundColor: colors.background.elevated, borderColor: colors.border.default}]}>
        <View style={[styles.iconContainer, {backgroundColor: colors.background.secondary}]}>
          <Icon name="check-circle" size={24} color={colors.status.active} />
        </View>
        <View>
          <Text style={[styles.statNumber, {color: colors.text.primary}]} numberOfLines={1}>
            {formatNumber(todayStatistics.allowedRequests)}
          </Text>
          <Text style={[styles.statLabel, {color: colors.text.secondary}]} numberOfLines={1}>
            安全访问
          </Text>
        </View>
      </View>
    </View>

    <View style={[styles.networkCard, {backgroundColor: colors.background.secondary, borderColor: colors.border.default}]}>
      <View style={styles.networkInfo}>
        <Text style={[styles.networkValue, {color: colors.text.primary}]} numberOfLines={1}>
          {formatNumber(todayStatistics.totalRequests)}
        </Text>
        <Text style={[styles.networkLabel, {color: colors.text.secondary}]} numberOfLines={1}>
          总请求数
        </Text>
      </View>
      <View style={[styles.networkDivider, {backgroundColor: colors.border.default}]} />
      <View style={styles.networkInfo}>
        <Text style={[styles.networkValue, {color: colors.text.primary}]} numberOfLines={1}>
          {todayStatistics.blockRate.toFixed(1)}%
        </Text>
        <Text style={[styles.networkLabel, {color: colors.text.secondary}]} numberOfLines={1}>
          拦截率
        </Text>
      </View>
    </View>
  </View>
);
