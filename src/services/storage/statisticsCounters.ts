import AsyncStorage from '@react-native-async-storage/async-storage';
import {DailyStats, DnsLog, StatisticsCounters} from '../../types';
import {STORAGE_KEYS} from './keys';
import {getLogs} from './logs';

export const getStatisticsCounters = async (): Promise<StatisticsCounters> => {
  try {
    const countersJson = await AsyncStorage.getItem(STORAGE_KEYS.STATISTICS_COUNTERS);
    if (countersJson) {
      return JSON.parse(countersJson);
    }
    return {
      totalRequests: 0,
      blockedRequests: 0,
      allowedRequests: 0,
      totalLatency: 0,
      dailyStats: {},
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Failed to load statistics counters:', error);
    return {
      totalRequests: 0,
      blockedRequests: 0,
      allowedRequests: 0,
      totalLatency: 0,
      dailyStats: {},
      lastUpdated: new Date().toISOString(),
    };
  }
};

export const saveStatisticsCounters = async (
  counters: StatisticsCounters,
): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.STATISTICS_COUNTERS,
      JSON.stringify(counters),
    );
  } catch (error) {
    console.error('Failed to save statistics counters:', error);
    throw error;
  }
};

export const incrementStatistics = async (log: DnsLog): Promise<void> => {
  try {
    const counters = await getStatisticsCounters();
    const date = new Date(log.timestamp).toISOString().split('T')[0];

    counters.totalRequests += 1;
    if (log.status === 'blocked') {
      counters.blockedRequests += 1;
    } else {
      counters.allowedRequests += 1;
    }
    if (log.latency > 0) {
      counters.totalLatency += log.latency;
    }

    if (!counters.dailyStats[date]) {
      counters.dailyStats[date] = {
        date,
        totalRequests: 0,
        blockedRequests: 0,
        allowedRequests: 0,
        totalLatency: 0,
      };
    }
    const dailyStat = counters.dailyStats[date];
    dailyStat.totalRequests += 1;
    if (log.status === 'blocked') {
      dailyStat.blockedRequests += 1;
    } else {
      dailyStat.allowedRequests += 1;
    }
    if (log.latency > 0) {
      dailyStat.totalLatency += log.latency;
    }

    counters.lastUpdated = new Date().toISOString();
    await saveStatisticsCounters(counters);
  } catch (error) {
    console.error('Failed to increment statistics:', error);
    throw error;
  }
};

export const clearStatisticsCounters = async (): Promise<void> => {
  try {
    const emptyCounters: StatisticsCounters = {
      totalRequests: 0,
      blockedRequests: 0,
      allowedRequests: 0,
      totalLatency: 0,
      dailyStats: {},
      lastUpdated: new Date().toISOString(),
    };
    await saveStatisticsCounters(emptyCounters);
  } catch (error) {
    console.error('Failed to clear statistics counters:', error);
    throw error;
  }
};

export const initializeStatisticsFromLogs = async (): Promise<void> => {
  try {
    const logs = await getLogs();
    const counters: StatisticsCounters = {
      totalRequests: 0,
      blockedRequests: 0,
      allowedRequests: 0,
      totalLatency: 0,
      dailyStats: {},
      lastUpdated: new Date().toISOString(),
    };

    logs.forEach(log => {
      const date = new Date(log.timestamp).toISOString().split('T')[0];

      counters.totalRequests += 1;
      if (log.status === 'blocked') {
        counters.blockedRequests += 1;
      } else {
        counters.allowedRequests += 1;
      }
      if (log.latency > 0) {
        counters.totalLatency += log.latency;
      }

      if (!counters.dailyStats[date]) {
        counters.dailyStats[date] = {
          date,
          totalRequests: 0,
          blockedRequests: 0,
          allowedRequests: 0,
          totalLatency: 0,
        };
      }
      const dailyStat = counters.dailyStats[date];
      dailyStat.totalRequests += 1;
      if (log.status === 'blocked') {
        dailyStat.blockedRequests += 1;
      } else {
        dailyStat.allowedRequests += 1;
      }
      if (log.latency > 0) {
        dailyStat.totalLatency += log.latency;
      }
    });

    await saveStatisticsCounters(counters);
    console.log('✅ Statistics initialized from logs:', counters.totalRequests);
  } catch (error) {
    console.error('Failed to initialize statistics from logs:', error);
    throw error;
  }
};

export const cleanupOldDailyStats = async (): Promise<void> => {
  try {
    const counters = await getStatisticsCounters();
    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    const filteredDailyStats: {[date: string]: DailyStats} = {};
    Object.entries(counters.dailyStats).forEach(([date, stats]) => {
      const statsDate = new Date(date).getTime();
      if (now - statsDate < THIRTY_DAYS_MS) {
        filteredDailyStats[date] = stats;
      }
    });

    counters.dailyStats = filteredDailyStats;
    counters.lastUpdated = new Date().toISOString();
    await saveStatisticsCounters(counters);
  } catch (error) {
    console.error('Failed to cleanup old daily stats:', error);
  }
};
