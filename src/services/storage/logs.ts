import AsyncStorage from '@react-native-async-storage/async-storage';
import {DnsLog, LogRetentionPeriod} from '../../types';
import {STORAGE_KEYS} from './keys';

export const getLogs = async (): Promise<DnsLog[]> => {
  try {
    const logsJson = await AsyncStorage.getItem(STORAGE_KEYS.LOGS);
    if (logsJson) {
      return JSON.parse(logsJson);
    }
    return [];
  } catch (error) {
    console.error('Failed to load logs:', error);
    return [];
  }
};

export const saveLogs = async (logs: DnsLog[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
  } catch (error) {
    console.error('Failed to save logs:', error);
    throw error;
  }
};

export const addLog = async (log: DnsLog): Promise<void> => {
  try {
    const logs = await getLogs();
    logs.unshift(log);
    await saveLogs(logs);
  } catch (error) {
    console.error('Failed to add log:', error);
    throw error;
  }
};

export const clearLogs = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify([]));
  } catch (error) {
    console.error('Failed to clear logs:', error);
    throw error;
  }
};

export const cleanupOldLogs = async (
  retentionPeriod: LogRetentionPeriod,
): Promise<void> => {
  try {
    if (retentionPeriod === 'forever') {
      return;
    }

    const logs = await getLogs();
    const now = Date.now();
    const retentionMs = getRetentionMilliseconds(retentionPeriod);

    const filteredLogs = logs.filter(log => {
      const logTime = new Date(log.timestamp).getTime();
      return now - logTime < retentionMs;
    });

    await saveLogs(filteredLogs);
  } catch (error) {
    console.error('Failed to cleanup old logs:', error);
  }
};

const getRetentionMilliseconds = (period: LogRetentionPeriod): number => {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  switch (period) {
    case '1day':
      return MS_PER_DAY;
    case '3days':
      return 3 * MS_PER_DAY;
    case '7days':
      return 7 * MS_PER_DAY;
    case '30days':
      return 30 * MS_PER_DAY;
    case 'forever':
      return Infinity;
  }
};
