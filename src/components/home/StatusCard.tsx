import React from 'react';
import {View, Text} from 'react-native';
import {formatLatency} from '../../utils/responsive';
import {styles} from './styles';

interface StatusCardProps {
  isConnected: boolean;
  latestLatency: number;
  colors: any;
  responsiveValue: (values: {default: number; tablet: number}) => number;
}

export const StatusCard: React.FC<StatusCardProps> = ({
  isConnected,
  latestLatency,
  colors,
  responsiveValue,
}) => (
  <View style={[styles.statusCard, {backgroundColor: colors.background.elevated, borderColor: colors.border.default}]}>
    <View style={styles.statusHeader}>
      <View
        style={[
          styles.statusDot,
          {backgroundColor: isConnected ? colors.status.active : colors.status.inactive},
        ]}
      />
      <Text style={[styles.statusLabel, {color: colors.text.secondary}]} numberOfLines={1}>
        守护状态
      </Text>
    </View>

    <View style={styles.statusBody}>
      <Text
        style={[
          styles.statusValue,
          {color: colors.text.primary, fontSize: responsiveValue({default: 24, tablet: 28})},
        ]}
        numberOfLines={1}
      >
        {isConnected ? '守护中' : '已停止'}
      </Text>
      <View style={styles.statusLatency}>
        <Text
          style={[
            styles.latencyNumber,
            {color: colors.info, fontSize: responsiveValue({default: 20, tablet: 24})},
          ]}
          numberOfLines={1}
        >
          {isConnected && latestLatency > 0
            ? (() => {
                const latency = formatLatency(latestLatency);
                return `${latency.value}${latency.unit}`;
              })()
            : '--'}
        </Text>
        <Text style={[styles.latencyLabel, {color: colors.text.tertiary}]} numberOfLines={1}>
          延迟
        </Text>
      </View>
    </View>
  </View>
);
