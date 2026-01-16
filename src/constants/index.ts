import { LogRetentionPeriod } from '../types';

// DoH (DNS over HTTPS) 模式
// 使用加密的 HTTPS 协议连接到 i-dns.wnluo.com 进行 DNS 查询
// 提供隐私保护、防止 DNS 劫持、智能过滤等功能

// DoH 服务器配置
export const DOH_SERVER_URL = 'https://i-dns.wnluo.com/dns-query';

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
