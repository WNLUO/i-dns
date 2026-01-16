import React from 'react';
import {View, Text, FlatList} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import {DnsLog} from '../../types';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {LogItem} from './LogItem';
import {styles} from './styles';

interface LogsListProps {
  logs: DnsLog[];
  colors: any;
}

export const LogsList: React.FC<LogsListProps> = ({logs, colors}) => {
  const insets = useSafeAreaInsets();

  return (
    <FlatList
      data={logs}
      keyExtractor={item => item.id}
      renderItem={({item}) => <LogItem log={item} colors={colors} />}
      contentContainerStyle={[
        styles.listContent,
        {paddingBottom: Math.max(insets.bottom, 20) + 100},
      ]}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={50}
      initialNumToRender={15}
      windowSize={21}
      getItemLayout={(data, index) => ({
        length: 72,
        offset: 72 * index,
        index,
      })}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Icon name="inbox" size={48} color={colors.text.disabled} />
          <Text style={[styles.emptyText, {color: colors.text.secondary}]}>暂无日志记录</Text>
          <Text style={[styles.emptyHint, {color: colors.text.tertiary}]}
          >
            开始使用家庭守护后，活动记录会显示在这里
          </Text>
        </View>
      }
    />
  );
};
