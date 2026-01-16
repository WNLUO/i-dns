import React from 'react';
import {View, Text} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {DnsLog} from '../../types';
import {formatLatency} from '../../utils/responsive';
import {styles} from './styles';

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

export const LogItem: React.FC<LogItemProps> = React.memo(({log, colors}) => {
  const isBlocked = log.status === 'blocked';

  const getBadgeStyle = () => {
    if (log.category === '已拦截') {
      return {color: colors.status.error, bgColor: `${colors.status.error}20`};
    }
    if (log.category === '无记录') {
      return {color: colors.status.warning, bgColor: `${colors.status.warning}20`};
    }
    if (log.category === '域名不存在') {
      return {color: '#f97316', bgColor: '#f9731620'};
    }
    if (log.category === '解析失败') {
      return {color: colors.status.warning, bgColor: `${colors.status.warning}20`};
    }
    return {color: colors.info, bgColor: `${colors.info}20`};
  };

  const badgeStyle = getBadgeStyle();
  const latency = formatLatency(log.latency);

  return (
    <View style={[styles.logItem, {backgroundColor: colors.background.elevated, borderColor: colors.border.default}]}>
      <Icon
        name={isBlocked ? 'shield' : 'check'}
        size={20}
        color={isBlocked ? colors.status.error : colors.status.active}
      />
      <View style={styles.logContent}>
        <Text style={[styles.logDomain, {color: colors.text.primary}]} numberOfLines={1}>
          {log.domain}
        </Text>
        <View style={[styles.categoryBadge, {backgroundColor: badgeStyle.bgColor}]}
        >
          <Text style={[styles.categoryText, {color: badgeStyle.color}]}>{log.category}</Text>
        </View>
      </View>
      <View style={styles.rightColumn}>
        <View style={[styles.latencyBadge, {backgroundColor: `${colors.info}10`}]}>
          <Icon name="activity" size={10} color={colors.info} />
          <Text style={[styles.latencyText, {color: colors.info}]}>
            {latency.value}{latency.unit}
          </Text>
        </View>
        <Text style={[styles.logTime, {color: colors.text.tertiary}]}>
          {formatTimestamp(log.timestamp)}
        </Text>
      </View>
    </View>
  );
});
