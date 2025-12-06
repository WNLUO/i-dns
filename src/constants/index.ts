import { DnsProvider, DnsServerConfig, LogRetentionPeriod } from '../types';

// DNS 服务商配置
export const DNS_PROVIDERS: DnsProvider[] = [
  // 自有服务
  {
    id: 'idns',
    name: 'I-DNS',
    description: '自定义儿童上网保护策略',
    icon: 'shield',
    region: 'global',
    protocols: ['doh'],
    features: ['儿童保护', '自定义规则', '云端同步']
  },

  // 国内服务商
  {
    id: 'dnspod',
    name: '腾讯DNS',
    description: '国内首家支持ECS，稳定快速',
    icon: 'zap',
    region: 'china',
    protocols: ['doh', 'dot', 'udp'],
    features: ['EDNS', 'IPv6', 'BGP Anycast']
  },
  {
    id: 'alidns',
    name: '阿里DNS',
    description: '全国CDN网络，智能解析',
    icon: 'globe',
    region: 'china',
    protocols: ['doh', 'dot', 'udp'],
    features: ['EDNS', 'IPv6', 'CDN加速']
  },
  {
    id: 'baidu',
    name: '百度DNS',
    description: '快速稳定，智能拦截恶意网站',
    icon: 'search',
    region: 'china',
    protocols: ['udp'],
    features: ['IPv6', '恶意拦截']
  },
  {
    id: '114dns',
    name: '114DNS',
    description: '纯净无劫持，高解析成功率',
    icon: 'check-circle',
    region: 'china',
    protocols: ['udp'],
    features: ['纯净', '防劫持']
  },
  {
    id: '360dns',
    name: '360DNS',
    description: '安全防护，反钓鱼网站',
    icon: 'lock',
    region: 'china',
    protocols: ['doh', 'dot', 'udp'],
    features: ['安全防护', '反钓鱼']
  },

  // 国际服务商
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: '全球最快的DNS服务',
    icon: 'cloud',
    region: 'global',
    protocols: ['doh', 'udp'],
    features: ['隐私保护', '全球CDN']
  },
  {
    id: 'google',
    name: 'Google DNS',
    description: '稳定可靠的公共DNS',
    icon: 'globe',
    region: 'global',
    protocols: ['doh', 'udp'],
    features: ['稳定', 'IPv6']
  }
];

// DNS 服务商配置映射 (仅使用UDP，DoH已移除)
export const DNS_SERVER_MAP: Record<string, DnsServerConfig> = {
  'idns': {
    udp: '94.140.14.14',  // AdGuard DNS Family Protection
    priority: 1,
    fallback: 'google',
    supportsEDNS: true
  },
  'google': {
    udp: '8.8.8.8',
    priority: 1,
    fallback: 'cloudflare',
    supportsEDNS: true
  },
  'cloudflare': {
    udp: '1.1.1.1',
    priority: 1,
    fallback: 'opendns',
    supportsEDNS: true
  },
  'opendns': {
    udp: '208.67.222.222',
    priority: 2,
    fallback: '114dns',
    supportsEDNS: true
  },
  '114dns': {
    udp: '114.114.114.114',
    priority: 2,
    fallback: '360dns',
    supportsEDNS: false
  },
  '360dns': {
    doh: 'https://doh.360.cn',
    dot: 'dot.360.cn',
    udp: '101.226.4.6',
    priority: 2,
    fallback: 'cloudflare',
    supportsEDNS: false
  },
  'cloudflare': {
    doh: 'https://cloudflare-dns.com/dns-query',
    udp: '1.1.1.1',
    priority: 3,
    fallback: 'google',
    supportsEDNS: true
  },
  'google': {
    doh: 'https://dns.google/dns-query',
    udp: '8.8.8.8',
    priority: 3,
    supportsEDNS: true
  }
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
