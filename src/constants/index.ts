import { LogRetentionPeriod } from '../types';

// 本地DNS处理模式 - 不使用任何外部DNS服务商
// 所有DNS查询都在本地进行过滤处理，然后通过系统DNS解析

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
