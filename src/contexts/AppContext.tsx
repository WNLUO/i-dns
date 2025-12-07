import React, {createContext, useContext, useState, useEffect, useRef, ReactNode} from 'react';
import {
  AppSettings,
  DnsLog,
  DomainRule,
  Statistics,
  LogRetentionPeriod,
} from '../types';
import {AppState, AppStateStatus} from 'react-native';
import * as storage from '../services/storage';
import {calculateStatistics, getTodayStatistics, getStatisticsFromCounters, getTodayStatisticsFromCounters} from '../services/statistics';
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

  // 实时延迟
  latestLatency: number;

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
  // 简化的设置 - 本地DNS处理模式
  const [settings, setSettings] = useState<AppSettings>({
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
  const [latestLatency, setLatestLatency] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  // 日志批处理相关的 refs - 必须在顶层声明
  const requestCounterRef = useRef(0);
  const logBufferRef = useRef<DnsLog[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recentLogsMapRef = useRef(new Map<string, DnsLog>());
  const isFlushingRef = useRef(false);

  // 使用 ref 存储最新的 isConnected 状态,避免闭包陷阱
  const isConnectedRef = useRef(isConnected);

  // VPN状态防抖
  const lastVPNStatusRef = useRef<boolean | null>(null);

  // 同步 isConnected 到 ref
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  // 初始化数据
  useEffect(() => {
    loadInitialData();
  }, []);

  // 本地DNS处理模式 - 不需要健康检查

  // 当日志变化时重新计算统计数据（使用计数器）
  useEffect(() => {
    const updateStats = async () => {
      const stats = await getStatisticsFromCounters(logs);
      const todayStats = await getTodayStatisticsFromCounters(logs);
      setStatistics(stats);
      setTodayStatistics(todayStats);
    };
    updateStats();
  }, [logs]);

  // 定期清理过期日志
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      cleanupOldLogs();
    }, 60 * 60 * 1000); // 每小时清理一次

    return () => clearInterval(cleanupInterval);
  }, [settings.logRetentionPeriod]);

  // VPN DNS 请求监听 - 使用 useRef 避免闭包问题
  useEffect(() => {
    if (!vpnService.isAvailable()) {
      return;
    }

    // 批量写入日志到存储
    const flushLogs = async () => {
      // 防止并发flush
      if (isFlushingRef.current) {
        return;
      }

      if (logBufferRef.current.length === 0) {
        return;
      }

      isFlushingRef.current = true;
      const logsToSave = [...logBufferRef.current];
      logBufferRef.current = []; // 清空缓冲区

      try {
        // 批量更新存储 - 在后台异步执行
        const currentLogs = await storage.getLogs();
        const updatedLogs = [...logsToSave, ...currentLogs].slice(0, 10000);

        // 不等待存储完成,先更新UI
        storage.saveLogs(updatedLogs).catch(error => {
          console.error('Background log save failed:', error);
        });

        // 立即更新UI状态
        setLogs(prevLogs => {
          const combined = [...logsToSave, ...prevLogs];
          return combined.slice(0, 1000);
        });
      } catch (error) {
        console.error('Failed to flush logs:', error);
      } finally {
        isFlushingRef.current = false;
      }
    };

    // 监听 DNS 请求事件
    const unsubscribe = vpnService.onDNSRequest((event: DNSRequestEvent) => {
      // 去重键: 域名 + 时间戳(秒级)
      const timestamp = new Date(event.timestamp);
      const dedupeKey = `${event.domain}-${Math.floor(timestamp.getTime() / 1000)}`;

      // 检查是否是重复请求
      if (recentLogsMapRef.current.has(dedupeKey)) {
        return;
      }

      // 创建日志记录
      const log: DnsLog = {
        id: `${Date.now()}-${++requestCounterRef.current}`,
        domain: event.domain,
        timestamp: event.timestamp,
        status: event.status,
        category: event.category,
        latency: event.latency,
      };

      // 更新实时延迟 - 只有当延迟 > 0 且为允许的请求时才更新
      if (event.latency > 0 && event.status === 'allowed') {
        setLatestLatency(event.latency);
      }

      // 增量更新统计计数器（异步，不阻塞UI）
      storage.incrementStatistics(log).catch(error => {
        console.error('Failed to increment statistics:', error);
      });

      // 添加到缓冲区
      logBufferRef.current.push(log);

      // 记录到去重映射(保留2秒)
      recentLogsMapRef.current.set(dedupeKey, log);
      setTimeout(() => recentLogsMapRef.current.delete(dedupeKey), 2000);

      // 清空现有定时器
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      // 如果缓冲区达到批量大小,立即写入
      // 减小批量大小到10,避免一次处理过多导致阻塞
      if (logBufferRef.current.length >= 10) {
        flushLogs();
      } else {
        // 延迟300ms批量写入,更快响应
        flushTimerRef.current = setTimeout(() => {
          flushLogs();
        }, 300);
      }
    });

    // 清理函数
    return () => {
      unsubscribe();
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
      }
      // 确保剩余日志被写入
      if (logBufferRef.current.length > 0) {
        flushLogs();
      }
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

  // VPN 状态监听和后台恢复逻辑
  useEffect(() => {
    if (!vpnService.isAvailable()) {
      console.warn('VPN service not available, skipping status monitoring');
      return;
    }

    console.log('Setting up VPN status monitoring and AppState listener');

    // 1. 监听 VPN 权限请求结果 (Android)
    const unsubscribePermissionResult = vpnService.onVPNPermissionResult(async (result) => {
      console.log('========================================');
      console.log('🔐 VPN permission result received:', result);
      console.log('========================================');

      if (result.success) {
        console.log('✅ VPN started successfully after permission grant');
        // 权限授予成功，VPN已启动，更新状态
        try {
          await storage.saveConnectionState(true);
          setIsConnectedState(true);
          console.log('✅ VPN setup completed (local DNS processing mode)');
        } catch (error) {
          console.error('❌ Failed to complete VPN setup:', error);
        }
      } else {
        console.error('❌ VPN permission denied:', result.error);
        // 权限被拒绝，确保状态为断开
        try {
          await storage.saveConnectionState(false);
          setIsConnectedState(false);
        } catch (error) {
          console.error('Failed to save disconnected state:', error);
        }
      }
    });

    // 2. 监听 VPN 状态变化
    const unsubscribeVPNStatus = vpnService.onVPNStatusChanged(async (connected: boolean) => {
      // 防抖：如果状态相同，跳过处理
      if (lastVPNStatusRef.current === connected) {
        return;
      }
      lastVPNStatusRef.current = connected;

      console.log('========================================');
      console.log('📡 VPN status changed event received');
      console.log(`New VPN Status: ${connected ? 'Connected' : 'Disconnected'}`);
      console.log(`Current UI State (ref): ${isConnectedRef.current ? 'Connected' : 'Disconnected'}`);
      console.log('========================================');

      // 使用 ref 读取最新状态
      if (connected !== isConnectedRef.current) {
        console.log('⚠️ Status mismatch detected, syncing UI...');
        try {
          await storage.saveConnectionState(connected);
          setIsConnectedState(connected);
          console.log('✅ UI state synced successfully');
        } catch (error) {
          console.error('❌ Failed to sync connection state:', error);
        }
      } else {
        console.log('✓ Status already in sync');
      }
    });

    // 2. 监听应用状态变化 (后台/前台切换)
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      console.log('========================================');
      console.log('📱 App state changed:', nextAppState);
      console.log('========================================');

      if (nextAppState === 'active') {
        console.log('🔄 App became active, verifying VPN status...');

        try {
          // 检查实际VPN状态
          const actualStatus = await vpnService.getStatus();
          console.log(`Actual VPN Status: ${actualStatus ? 'Connected' : 'Disconnected'}`);

          // 使用 ref 读取最新状态,避免闭包陷阱
          const currentUIState = isConnectedRef.current;
          console.log(`UI State (ref): ${currentUIState ? 'Connected' : 'Disconnected'}`);

          // 如果状态不匹配,同步UI
          if (actualStatus !== currentUIState) {
            console.log('⚠️ Status mismatch detected after returning to foreground');
            console.log(`Correcting UI: ${currentUIState} → ${actualStatus}`);

            await storage.saveConnectionState(actualStatus);
            setIsConnectedState(actualStatus);
            console.log('✅ UI state synced to actual VPN status');

            // 如果UI显示连接但实际断开,说明VPN被系统终止了,尝试重连
            if (currentUIState && !actualStatus) {
              console.log('========================================');
              console.log('🔄 Auto-reconnect triggered');
              console.log('Reason: VPN was terminated while in background');
              console.log('========================================');

              try {
                await vpnService.start();
                console.log('✅ VPN reconnected successfully');
                // 再次更新状态为连接
                await storage.saveConnectionState(true);
                setIsConnectedState(true);
              } catch (error) {
                console.error('❌ Failed to reconnect VPN:', error);
                // 保持断开状态
              }
            }
          } else {
            console.log('✓ VPN status is in sync, no action needed');
          }

          // 如果VPN连接中且当前没有延迟显示，从最近的日志中获取最新延迟
          if (actualStatus && latestLatency === 0) {
            try {
              const currentLogs = await storage.getLogs();
              const recentAllowedLog = currentLogs.find(
                log => log.status === 'allowed' && log.latency > 0
              );
              if (recentAllowedLog) {
                setLatestLatency(recentAllowedLog.latency);
                console.log(`✓ Restored latest latency: ${recentAllowedLog.latency}ms`);
              }
            } catch (error) {
              console.error('❌ Failed to restore latency:', error);
            }
          }
        } catch (error) {
          console.error('❌ Error during status verification:', error);
        }
      }
    });

    // Cleanup
    return () => {
      console.log('Cleaning up VPN status monitoring and AppState listener');
      unsubscribePermissionResult();
      unsubscribeVPNStatus();
      subscription.remove();
    };
  }, []); // 空依赖数组 - 只初始化一次,避免无限循环

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

      // 检查是否需要初始化统计计数器
      const counters = await storage.getStatisticsCounters();
      if (counters.totalRequests === 0 && loadedLogs.length > 0) {
        console.log('🔄 Initializing statistics from existing logs...');
        await storage.initializeStatisticsFromLogs();
        console.log('✅ Statistics initialized');
      }
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
      // 本地DNS处理模式 - 设置更新不需要额外操作
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
            const result = await vpnService.start();
            console.log('VPN start result:', result);

            // 检查是否需要权限
            if (result.requiresPermission) {
              console.log('⏳ VPN permission request initiated, waiting for user response...');
              // 权限请求已发起，状态会通过 VPNPermissionResult 事件更新
              // 暂时不更新状态，等待权限结果
              return;
            }

            // 如果不需要权限但启动失败
            if (!result.success) {
              console.error('❌ VPN failed to start immediately');
              throw new Error('Failed to start VPN');
            }

            console.log('✅ VPN service started successfully (local DNS processing mode)');
          } catch (error) {
            console.error('VPN start error:', error);
            throw error;
          }
        } else {
          console.warn('VPN service is not available (DNSVPNModule not found)');
          throw new Error('VPN module not available. Please rebuild the app.');
        }
      } else {
        // 停止 VPN
        if (vpnService.isAvailable()) {
          try {
            await vpnService.stop();
            console.log('VPN service stopped');
          } catch (error) {
            console.error('Failed to stop VPN:', error);
            throw error;
          }
        }
        // 清除实时延迟
        setLatestLatency(0);
      }

      await storage.saveConnectionState(connected);
      setIsConnectedState(connected);
    } catch (error) {
      console.error('Failed in setIsConnected:', error);
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
      // 同时清除统计计数器
      await storage.clearStatisticsCounters();
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
        id: `blacklist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
        id: `whitelist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
    latestLatency,
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
