import { DnsProvider, LogRetentionPeriod } from '../types';

// DNS 服务商配置 - 只保留 I-DNS
export const DNS_PROVIDERS: DnsProvider[] = [
  { id: 'idns', name: 'I-DNS', description: '自定义儿童上网保护策略', icon: 'settings' },
];

// DNS 服务商配置映射（包括DoH支持）
export const DNS_SERVER_MAP: Record<string, { type: 'udp' | 'doh', server: string }> = {
  'idns': { type: 'doh', server: 'https://i-dns.wnluo.com/dns-query' },
};

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
