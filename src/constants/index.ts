import { DnsProvider, LogRetentionPeriod } from '../types';

// DNS 服务商配置
export const DNS_PROVIDERS: DnsProvider[] = [
  { id: 'adguard', name: 'AdGuard DNS', description: '家庭保护，过滤广告与恶意内容', icon: 'shield' },
  { id: 'cloudflare', name: 'Cloudflare Family', description: '家庭友好的安全DNS (1.1.1.3)', icon: 'zap' },
  { id: 'google', name: 'Google DNS', description: '稳定可靠 (8.8.8.8)', icon: 'search' },
  { id: 'nextdns', name: 'NextDNS', description: '自定义儿童上网保护策略', icon: 'settings' },
];

// 日志保留时间选项配置
export const LOG_RETENTION_OPTIONS: Array<{
  value: LogRetentionPeriod;
  label: string;
  description: string;
}> = [
  { value: '1day', label: '1天', description: '保留最近1天的日志' },
  { value: '3days', label: '3天', description: '保留最近3天的日志' },
  { value: '7days', label: '7天', description: '保留最近7天的日志（推荐）' },
  { value: '30days', label: '30天', description: '保留最近30天的日志' },
  { value: 'forever', label: '永久', description: '永久保留所有日志' },
];
