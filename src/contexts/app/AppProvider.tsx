import React, {useEffect, useRef, useState} from 'react';
import {AppSettings, DnsLog, DomainRule, Statistics} from '../../types';
import * as storage from '../../services/storage';
import {getStatisticsFromCounters, getTodayStatisticsFromCounters} from '../../services/statistics';
import vpnService from '../../services/vpnService';
import {AppContext} from './context';
import {AppContextType} from './types';
import {useDnsRequestListener} from './useDnsRequestListener';
import {useRulesSync} from './useRulesSync';
import {useVpnStatusSync} from './useVpnStatusSync';

export const AppProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [settings, setSettings] = useState<AppSettings>({
    autoStart: false,
    childProtectionMode: false,
    notificationsEnabled: true,
    dnssecEnabled: false,
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

  const isConnectedRef = useRef(isConnected);

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    const updateStats = async () => {
      const stats = await getStatisticsFromCounters(logs);
      const todayStats = await getTodayStatisticsFromCounters(logs);
      setStatistics(stats);
      setTodayStatistics(todayStats);
    };
    updateStats();
  }, [logs]);

  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      cleanupOldLogs();
    }, 60 * 60 * 1000);

    return () => clearInterval(cleanupInterval);
  }, [settings.logRetentionPeriod]);

  useDnsRequestListener(setLogs, setLatestLatency);
  useRulesSync(blacklist, whitelist, settings.childProtectionMode);
  useVpnStatusSync(setIsConnectedState, isConnectedRef, latestLatency, setLatestLatency);

  useEffect(() => {
    vpnService.setEdnsDoEnabled(settings.dnssecEnabled).catch(error => {
      console.error('Failed to update EDNS DO setting:', error);
    });
  }, [settings.dnssecEnabled]);

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
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw error;
    }
  };

  const setIsConnected = async (connected: boolean) => {
    try {
      if (connected) {
        if (vpnService.isAvailable()) {
          try {
            const result = await vpnService.start();
            console.log('VPN start result:', result);

            if (result && result.requiresPermission) {
              console.log('⏳ VPN permission request initiated, waiting for user response...');
              await storage.saveConnectionState(false);
              setIsConnectedState(false);
              return;
            }

            if (!result || !result.success) {
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
        if (vpnService.isAvailable()) {
          try {
            await vpnService.stop();
            console.log('VPN service stopped');
          } catch (error) {
            console.error('Failed to stop VPN:', error);
            throw error;
          }
        }
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
