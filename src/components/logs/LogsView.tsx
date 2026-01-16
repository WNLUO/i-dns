import React, {useMemo, useState} from 'react';
import {View} from 'react-native';
import {useApp} from '../../contexts/AppContext';
import {useResponsiveLayout} from '../../hooks/useResponsiveLayout';
import {useThemeColors} from '../../styles/theme';
import {LogsHeader} from './LogsHeader';
import {LogsList} from './LogsList';
import {styles} from './styles';

export const LogsView: React.FC = () => {
  const {logs, searchLogs} = useApp();
  const colors = useThemeColors();
  const {pagePadding} = useResponsiveLayout();

  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'blocked' | 'allowed'>('all');

  const filteredLogs = useMemo(() => {
    let result = logs;

    if (searchTerm.trim()) {
      result = searchLogs(searchTerm);
    }

    if (activeFilter !== 'all') {
      result = result.filter(log => log.status === activeFilter);
    }

    return result;
  }, [logs, searchTerm, activeFilter, searchLogs]);

  const stats = useMemo(() => {
    const blocked = logs.filter(log => log.status === 'blocked').length;
    const allowed = logs.filter(log => log.status === 'allowed').length;
    return {blocked, allowed, total: logs.length};
  }, [logs]);

  return (
    <View style={[styles.container, {backgroundColor: colors.background.primary}]}>
      <LogsHeader
        colors={colors}
        pagePadding={pagePadding}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        blocked={stats.blocked}
        allowed={stats.allowed}
      />
      <LogsList logs={filteredLogs} colors={colors} />
    </View>
  );
};
