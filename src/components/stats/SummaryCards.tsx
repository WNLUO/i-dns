import React from 'react';
import {View, Text} from 'react-native';
import {Statistics} from '../../types';
import {formatNumber} from '../../utils/responsive';
import {styles} from './styles';

interface SummaryCardsProps {
  statistics: Statistics;
  colors: any;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({statistics, colors}) => (
  <View style={styles.summaryRow}>
    <View style={[styles.summaryCard, {backgroundColor: colors.background.elevated, borderColor: colors.border.default}]}
    >
      <Text style={[styles.summaryNumber, {color: colors.text.primary}]}
      >
        {formatNumber(statistics.totalRequests)}
      </Text>
      <Text style={[styles.summaryLabel, {color: colors.text.secondary}]}
      >
        总请求数
      </Text>
    </View>

    <View style={[styles.summaryCard, {backgroundColor: colors.background.elevated, borderColor: colors.border.default}]}
    >
      <Text style={[styles.summaryNumber, {color: colors.text.primary}]}
      >
        {statistics.blockRate.toFixed(1)}%
      </Text>
      <Text style={[styles.summaryLabel, {color: colors.text.secondary}]}
      >
        拦截率
      </Text>
    </View>
  </View>
);
