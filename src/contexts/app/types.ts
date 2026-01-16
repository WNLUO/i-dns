import {AppSettings, DnsLog, DomainRule, Statistics} from '../../types';

export interface AppContextType {
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
