import React, {createContext, useContext, useState, useEffect, ReactNode} from 'react';
import {
  AppSettings,
  DnsLog,
  DomainRule,
  Statistics,
  LogRetentionPeriod,
} from '../types';
import * as storage from '../services/storage';
import {calculateStatistics, getTodayStatistics} from '../services/statistics';
import vpnService, { DNSRequestEvent } from '../services/vpnService';
import filterRulesService from '../services/filterRules';

interface AppContextType {
  // 设置相关
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;

  // 连接状态
  isConnected: boolean;
  setIsConnected: (connected: boolean) => Promise<void>;

  // 日志相关
  logs: DnsLog[];
  addLog: (log: DnsLog) => Promise<void>;
  clearLogs: () => Promise<void>;
  searchLogs: (query: string) => DnsLog[];
  filterLogs: (status?: 'allowed' | 'blocked') => DnsLog[];

  // 统计相关
  statistics: Statistics;
  todayStatistics: Statistics;

  // 黑名单相关
  blacklist: DomainRule[];
  addBlacklistRule: (domain: string, note?: string) => Promise<void>;
  removeBlacklistRule: (ruleId: string) => Promise<void>;

  // 白名单相关
  whitelist: DomainRule[];
  addWhitelistRule: (domain: string, note?: string) => Promise<void>;
  removeWhitelistRule: (ruleId: string) => Promise<void>;

  // 加载状态
  isLoading: boolean;

  // 刷新数据
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{children: ReactNode}> = ({children}) => {
  const [settings, setSettings] = useState<AppSettings>({
    selectedDnsProvider: 'adguard',
    autoStart: false,
    childProtectionMode: false,
    notificationsEnabled: true,
    logRetentionPeriod: '7days',
  });
  const [isConnected, setIsConnectedState] = useState(false);
  const [logs, setLogs] = useState<DnsLog[]>([]);
  const [blacklist, setBlacklist] = useState<DomainRule[]>([]);
  const [whitelist, setWhitelist] = useState<DomainRule[]>([]);
  const [statistics, setStatistics] = useState<Statistics>({
    totalRequests: 0,
    blockedRequests: 0,
    allowedRequests: 0,
    blockRate: 0,
    averageLatency: 0,
    categoryStats: {tracker: 0, ad: 0, content: 0, unknown: 0},
    chartData: [],
  });
  const [todayStatistics, setTodayStatistics] = useState<Statistics>({
    totalRequests: 0,
    blockedRequests: 0,
    allowedRequests: 0,
    blockRate: 0,
    averageLatency: 0,
    categoryStats: {tracker: 0, ad: 0, content: 0, unknown: 0},
    chartData: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  // 初始化数据
  useEffect(() => {
    loadInitialData();
  }, []);

  // 当日志变化时重新计算统计数据
  useEffect(() => {
    const stats = calculateStatistics(logs);
    const todayStats = getTodayStatistics(logs);
    setStatistics(stats);
    setTodayStatistics(todayStats);
  }, [logs]);

  // 定期清理过期日志
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      cleanupOldLogs();
    }, 60 * 60 * 1000); // 每小时清理一次

    return () => clearInterval(cleanupInterval);
  }, [settings.logRetentionPeriod]);

  // VPN DNS 请求监听
  useEffect(() => {
    if (!vpnService.isAvailable()) {
      return;
    }

    // 监听 DNS 请求事件
    const unsubscribe = vpnService.onDNSRequest((event: DNSRequestEvent) => {
      // 创建日志记录
      const log: DnsLog = {
        id: Date.now().toString(),
        domain: event.domain,
        timestamp: event.timestamp,
        status: event.status,
        category: event.category,
        latency: event.latency,
      };

      // 添加到日志
      addLog(log).catch(error => {
        console.error('Failed to add DNS log:', error);
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 同步黑白名单到过滤规则服务和 VPN 服务
  useEffect(() => {
    // 更新过滤规则服务
    const blacklistDomains = blacklist.map(rule => rule.domain);
    const whitelistDomains = whitelist.map(rule => rule.domain);
    filterRulesService.loadCustomRules(blacklistDomains, whitelistDomains);

    // 如果 VPN 可用，同步到 VPN 服务
    if (vpnService.isAvailable()) {
      // 这里可以批量更新 VPN 的黑白名单
      // 由于目前 VPN 接口是单个添加，这里仅作示意
    }
  }, [blacklist, whitelist]);

  // 同步儿童保护模式
  useEffect(() => {
    filterRulesService.setChildProtectionMode(settings.childProtectionMode);
  }, [settings.childProtectionMode]);

  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      const [
        loadedSettings,
        loadedLogs,
        loadedBlacklist,
        loadedWhitelist,
        connectionState,
      ] = await Promise.all([
        storage.getSettings(),
        storage.getLogs(),
        storage.getBlacklist(),
        storage.getWhitelist(),
        storage.getConnectionState(),
      ]);

      setSettings(loadedSettings);
      setLogs(loadedLogs);
      setBlacklist(loadedBlacklist);
      setWhitelist(loadedWhitelist);
      setIsConnectedState(connectionState);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = async (updates: Partial<AppSettings>) => {
    try {
      const newSettings = await storage.updateSettings(updates);
      setSettings(newSettings);
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw error;
    }
  };

  const setIsConnected = async (connected: boolean) => {
    try {
      if (connected) {
        // 启动 VPN（如果可用）
        if (vpnService.isAvailable()) {
          try {
            await vpnService.start();
            console.log('VPN service started');
          } catch (error) {
            console.warn('VPN service not available, running in simulation mode');
          }
        }
      } else {
        // 停止 VPN
        if (vpnService.isAvailable()) {
          try {
            await vpnService.stop();
            console.log('VPN service stopped');
          } catch (error) {
            console.error('Failed to stop VPN:', error);
          }
        }
      }

      await storage.saveConnectionState(connected);
      setIsConnectedState(connected);
    } catch (error) {
      console.error('Failed to save connection state:', error);
      throw error;
    }
  };

  const addLog = async (log: DnsLog) => {
    try {
      await storage.addLog(log);
      setLogs(prevLogs => [log, ...prevLogs]);
    } catch (error) {
      console.error('Failed to add log:', error);
      throw error;
    }
  };

  const clearLogs = async () => {
    try {
      await storage.clearLogs();
      setLogs([]);
    } catch (error) {
      console.error('Failed to clear logs:', error);
      throw error;
    }
  };

  const searchLogs = (query: string): DnsLog[] => {
    if (!query.trim()) {
      return logs;
    }
    const lowerQuery = query.toLowerCase();
    return logs.filter(log => log.domain.toLowerCase().includes(lowerQuery));
  };

  const filterLogs = (status?: 'allowed' | 'blocked'): DnsLog[] => {
    if (!status) {
      return logs;
    }
    return logs.filter(log => log.status === status);
  };

  const addBlacklistRule = async (domain: string, note?: string) => {
    try {
      const rule: DomainRule = {
        id: Date.now().toString(),
        domain,
        type: 'blacklist',
        addedAt: new Date().toISOString(),
        note,
      };
      await storage.addBlacklistRule(rule);
      setBlacklist(prevList => [...prevList, rule]);
    } catch (error) {
      console.error('Failed to add blacklist rule:', error);
      throw error;
    }
  };

  const removeBlacklistRule = async (ruleId: string) => {
    try {
      await storage.removeBlacklistRule(ruleId);
      setBlacklist(prevList => prevList.filter(rule => rule.id !== ruleId));
    } catch (error) {
      console.error('Failed to remove blacklist rule:', error);
      throw error;
    }
  };

  const addWhitelistRule = async (domain: string, note?: string) => {
    try {
      const rule: DomainRule = {
        id: Date.now().toString(),
        domain,
        type: 'whitelist',
        addedAt: new Date().toISOString(),
        note,
      };
      await storage.addWhitelistRule(rule);
      setWhitelist(prevList => [...prevList, rule]);
    } catch (error) {
      console.error('Failed to add whitelist rule:', error);
      throw error;
    }
  };

  const removeWhitelistRule = async (ruleId: string) => {
    try {
      await storage.removeWhitelistRule(ruleId);
      setWhitelist(prevList => prevList.filter(rule => rule.id !== ruleId));
    } catch (error) {
      console.error('Failed to remove whitelist rule:', error);
      throw error;
    }
  };

  const cleanupOldLogs = async () => {
    try {
      await storage.cleanupOldLogs(settings.logRetentionPeriod);
      const updatedLogs = await storage.getLogs();
      setLogs(updatedLogs);
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  };

  const refreshData = async () => {
    await loadInitialData();
  };

  const value: AppContextType = {
    settings,
    updateSettings,
    isConnected,
    setIsConnected,
    logs,
    addLog,
    clearLogs,
    searchLogs,
    filterLogs,
    statistics,
    todayStatistics,
    blacklist,
    addBlacklistRule,
    removeBlacklistRule,
    whitelist,
    addWhitelistRule,
    removeWhitelistRule,
    isLoading,
    refreshData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
