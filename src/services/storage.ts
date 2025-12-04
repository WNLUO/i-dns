import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppSettings,
  DnsLog,
  DomainRule,
  LogRetentionPeriod,
} from '../types';

// 存储键常量
const STORAGE_KEYS = {
  SETTINGS: '@iDNS:settings',
  LOGS: '@iDNS:logs',
  BLACKLIST: '@iDNS:blacklist',
  WHITELIST: '@iDNS:whitelist',
  CONNECTION_STATE: '@iDNS:connectionState',
} as const;

// 默认设置
const DEFAULT_SETTINGS: AppSettings = {
  selectedDnsProvider: 'idns',
  autoStart: false,
  childProtectionMode: false,
  notificationsEnabled: true,
  logRetentionPeriod: '7days',
};

// ===== 设置相关 =====

export const getSettings = async (): Promise<AppSettings> => {
  try {
    const settingsJson = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (settingsJson) {
      return JSON.parse(settingsJson);
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Failed to load settings:', error);
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = async (settings: AppSettings): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings:', error);
    throw error;
  }
};

export const updateSettings = async (
  updates: Partial<AppSettings>,
): Promise<AppSettings> => {
  try {
    const currentSettings = await getSettings();
    const newSettings = {...currentSettings, ...updates};
    await saveSettings(newSettings);
    return newSettings;
  } catch (error) {
    console.error('Failed to update settings:', error);
    throw error;
  }
};

// ===== 日志相关 =====

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
    logs.unshift(log); // 新日志添加到开头
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

// 清理过期日志
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

// 将保留时间转换为毫秒
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

// ===== 黑名单相关 =====

export const getBlacklist = async (): Promise<DomainRule[]> => {
  try {
    const blacklistJson = await AsyncStorage.getItem(STORAGE_KEYS.BLACKLIST);
    if (blacklistJson) {
      return JSON.parse(blacklistJson);
    }
    return [];
  } catch (error) {
    console.error('Failed to load blacklist:', error);
    return [];
  }
};

export const saveBlacklist = async (rules: DomainRule[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.BLACKLIST, JSON.stringify(rules));
  } catch (error) {
    console.error('Failed to save blacklist:', error);
    throw error;
  }
};

export const addBlacklistRule = async (rule: DomainRule): Promise<void> => {
  try {
    const blacklist = await getBlacklist();
    blacklist.push(rule);
    await saveBlacklist(blacklist);
  } catch (error) {
    console.error('Failed to add blacklist rule:', error);
    throw error;
  }
};

export const removeBlacklistRule = async (ruleId: string): Promise<void> => {
  try {
    const blacklist = await getBlacklist();
    const filtered = blacklist.filter(rule => rule.id !== ruleId);
    await saveBlacklist(filtered);
  } catch (error) {
    console.error('Failed to remove blacklist rule:', error);
    throw error;
  }
};

// ===== 白名单相关 =====

export const getWhitelist = async (): Promise<DomainRule[]> => {
  try {
    const whitelistJson = await AsyncStorage.getItem(STORAGE_KEYS.WHITELIST);
    if (whitelistJson) {
      return JSON.parse(whitelistJson);
    }
    return [];
  } catch (error) {
    console.error('Failed to load whitelist:', error);
    return [];
  }
};

export const saveWhitelist = async (rules: DomainRule[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.WHITELIST, JSON.stringify(rules));
  } catch (error) {
    console.error('Failed to save whitelist:', error);
    throw error;
  }
};

export const addWhitelistRule = async (rule: DomainRule): Promise<void> => {
  try {
    const whitelist = await getWhitelist();
    whitelist.push(rule);
    await saveWhitelist(whitelist);
  } catch (error) {
    console.error('Failed to add whitelist rule:', error);
    throw error;
  }
};

export const removeWhitelistRule = async (ruleId: string): Promise<void> => {
  try {
    const whitelist = await getWhitelist();
    const filtered = whitelist.filter(rule => rule.id !== ruleId);
    await saveWhitelist(filtered);
  } catch (error) {
    console.error('Failed to remove whitelist rule:', error);
    throw error;
  }
};

// ===== 连接状态相关 =====

export const getConnectionState = async (): Promise<boolean> => {
  try {
    const state = await AsyncStorage.getItem(STORAGE_KEYS.CONNECTION_STATE);
    return state === 'true';
  } catch (error) {
    console.error('Failed to load connection state:', error);
    return false;
  }
};

export const saveConnectionState = async (
  isConnected: boolean,
): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.CONNECTION_STATE,
      isConnected.toString(),
    );
  } catch (error) {
    console.error('Failed to save connection state:', error);
    throw error;
  }
};

// ===== 清除所有数据 =====

export const clearAllData = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
  } catch (error) {
    console.error('Failed to clear all data:', error);
    throw error;
  }
};
