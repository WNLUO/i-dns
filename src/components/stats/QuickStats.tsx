import React from 'react';
import {View, Text} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {Statistics} from '../../types';
import {formatLatency, formatNumber} from '../../utils/responsive';
import {styles} from './styles';

interface QuickStatsProps {
  statistics: Statistics;
  colors: any;
}

export const QuickStats: React.FC<QuickStatsProps> = ({statistics, colors}) => (
  <View style={styles.quickStats}>
    <View style={[styles.quickStatItem, {backgroundColor: `${colors.status.error}10`, borderColor: `${colors.status.error}40`}]}>
      <Icon name="shield-off" size={24} color={colors.status.error} />
      <Text style={[styles.quickStatNumber, {color: colors.status.error}]}
      >
        {formatNumber(statistics.blockedRequests)}
      </Text>
      <Text style={[styles.quickStatLabel, {color: colors.text.secondary}]}>已拦截</Text>
    </View>

    <View style={[styles.quickStatItem, {backgroundColor: `${colors.status.active}10`, borderColor: `${colors.status.active}40`}]}>
      <Icon name="check-circle" size={24} color={colors.status.active} />
      <Text style={[styles.quickStatNumber, {color: colors.status.active}]}
      >
        {formatNumber(statistics.allowedRequests)}
      </Text>
      <Text style={[styles.quickStatLabel, {color: colors.text.secondary}]}>安全访问</Text>
    </View>

    <View style={[styles.quickStatItem, {backgroundColor: `${colors.info}10`, borderColor: `${colors.info}40`}]}>
      <Icon name="clock" size={24} color={colors.info} />
      <Text style={[styles.quickStatNumber, {color: colors.info}]}
      >
        {statistics.averageLatency > 0
          ? (() => {
              const latency = formatLatency(statistics.averageLatency);
              return `${latency.value}${latency.unit}`;
            })()
          : '--'}
      </Text>
      <Text style={[styles.quickStatLabel, {color: colors.text.secondary}]}>平均延迟</Text>
    </View>
  </View>
);
