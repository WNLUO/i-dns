export interface DnsLog {
  id: string;
  domain: string;
  timestamp: string;
  status: 'allowed' | 'blocked';
  category: string;  // Now stores resolved IP address, "已拦截", or "解析失败"
  latency: number;
}

export interface ChartDataPoint {
  time: string;
  blocked: number;
  allowed: number;
}

export interface DnsProvider {
  id: string;
  name: string;
  description: string;
  icon: string; // Feather icon name (e.g., 'shield', 'zap', 'search')
}

export type Tab = 'home' | 'stats' | 'logs' | 'settings';

// 日志保留时间选项
export type LogRetentionPeriod = '1day' | '3days' | '7days' | '30days' | 'forever';

// 域名规则（黑白名单）
export interface DomainRule {
  id: string;
  domain: string;
  type: 'blacklist' | 'whitelist';
  addedAt: string;
  note?: string;
}

// 应用设置
export interface AppSettings {
  selectedDnsProvider: string; // DNS服务商ID
  autoStart: boolean; // 开机自启
  childProtectionMode: boolean; // 儿童保护模式
  notificationsEnabled: boolean; // 通知提醒
  logRetentionPeriod: LogRetentionPeriod; // 日志保留时间
}

// 统计数据
export interface Statistics {
  totalRequests: number;
  blockedRequests: number;
  allowedRequests: number;
  blockRate: number; // 拦截率百分比
  averageLatency: number; // 平均延迟（ms）
  categoryStats: {
    tracker: number;
    ad: number;
    content: number;
    unknown: number;
  };
  chartData: ChartDataPoint[];
}

// 每日统计数据
export interface DailyStats {
  date: string; // YYYY-MM-DD
  totalRequests: number;
  blockedRequests: number;
  allowedRequests: number;
  totalLatency: number; // 累计延迟，用于计算平均值
}

// 持久化的统计计数器
export interface StatisticsCounters {
  // 全局累计统计
  totalRequests: number;
  blockedRequests: number;
  allowedRequests: number;
  totalLatency: number; // 累计延迟

  // 按日期存储的统计
  dailyStats: {
    [date: string]: DailyStats;
  };

  // 最后更新时间
  lastUpdated: string;
}
