import {DnsLog, ChartDataPoint, Statistics, StatisticsCounters, BlockRateHistoryPoint} from '../types';
import * as storage from './storage';

// 计算统计数据
export const calculateStatistics = (logs: DnsLog[]): Statistics => {
  const totalRequests = logs.length;
  const blockedRequests = logs.filter(log => log.status === 'blocked').length;
  const allowedRequests = logs.filter(log => log.status === 'allowed').length;
  const blockRate =
    totalRequests > 0 ? (blockedRequests / totalRequests) * 100 : 0;

  // 计算平均延迟
  const totalLatency = logs.reduce((sum, log) => sum + log.latency, 0);
  const averageLatency = totalRequests > 0 ? totalLatency / totalRequests : 0;

  // 按类别统计 - 注意：category字段现在存储IP地址或状态文本
  // "已拦截" | "解析失败" | "无记录" | "域名不存在" | IP地址
  const blocked = logs.filter(log => log.status === 'blocked');
  const allowed = logs.filter(log => log.status === 'allowed');
  const failed = logs.filter(log =>
    log.category === '解析失败' || log.category === '无记录' || log.category === '域名不存在'
  );

  const categoryStats = {
    tracker: 0, // 保留字段以保持兼容性，但当前未实现域名分类
    ad: 0,
    content: 0,
    unknown: blocked.length, // 将所有拦截的域名归类为"未知"
  };

  // 生成图表数据
  const chartData = generateChartData(logs);

  return {
    totalRequests,
    blockedRequests,
    allowedRequests,
    blockRate,
    averageLatency,
    categoryStats,
    chartData,
  };
};

// 生成24小时图表数据（每4小时一个点，共6个点）
export const generateChartData = (logs: DnsLog[]): ChartDataPoint[] => {
  const now = new Date();
  const chartData: ChartDataPoint[] = [];
  const interval = 4; // 每4小时一个点

  // 生成过去24小时的时间点（每4小时一个点）
  for (let i = 24; i >= 0; i -= interval) {
    const hourDate = new Date(now);
    hourDate.setHours(now.getHours() - i, 0, 0, 0);
    const nextPeriod = new Date(hourDate);
    nextPeriod.setHours(hourDate.getHours() + interval);

    // 计算该时间段内的日志
    const logsInPeriod = logs.filter(log => {
      const logDate = new Date(log.timestamp);
      return logDate >= hourDate && logDate < nextPeriod;
    });

    const blocked = logsInPeriod.filter(log => log.status === 'blocked').length;
    const allowed = logsInPeriod.filter(log => log.status === 'allowed').length;

    chartData.push({
      time: formatChartTime(hourDate),
      blocked,
      allowed,
    });
  }

  return chartData;
};

// 格式化图表时间显示
const formatChartTime = (date: Date): string => {
  const hours = date.getHours();
  return `${hours.toString().padStart(2, '0')}:00`;
};

// 获取今日统计
export const getTodayStatistics = (logs: DnsLog[]): Statistics => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayLogs = logs.filter(log => {
    const logDate = new Date(log.timestamp);
    return logDate >= today;
  });

  return calculateStatistics(todayLogs);
};

// 获取指定时间范围的统计
export const getStatisticsForRange = (
  logs: DnsLog[],
  startDate: Date,
  endDate: Date,
): Statistics => {
  const rangeLogs = logs.filter(log => {
    const logDate = new Date(log.timestamp);
    return logDate >= startDate && logDate <= endDate;
  });

  return calculateStatistics(rangeLogs);
};

// 获取拦截分类统计（用于StatsView的分类展示）
// 注意：当前版本未实现域名分类功能，category字段存储的是IP地址或状态文本
export const getCategoryBreakdown = (logs: DnsLog[]) => {
  const blockedLogs = logs.filter(log => log.status === 'blocked');
  const total = blockedLogs.length;

  // 基于category字段的值进行简单分类
  const dnsBlocked = blockedLogs.filter(
    log => log.category === '已拦截',
  ).length; // VPN本地拦截
  const serverBlocked = blockedLogs.filter(
    log => log.category === '0.0.0.0' || log.category === '::' || log.category === '::0',
  ).length; // DoH服务器拦截

  const trackerCount = 0; // 未实现
  const adCount = 0; // 未实现
  const contentCount = 0; // 未实现
  const unknownCount = total; // 所有拦截的域名

  return [
    {
      name: '追踪器',
      count: trackerCount,
      percentage: total > 0 ? (trackerCount / total) * 100 : 0,
      color: '#f59e0b', // orange
    },
    {
      name: '广告',
      count: adCount,
      percentage: total > 0 ? (adCount / total) * 100 : 0,
      color: '#ef4444', // red
    },
    {
      name: '恶意内容',
      count: contentCount,
      percentage: total > 0 ? (contentCount / total) * 100 : 0,
      color: '#8b5cf6', // purple
    },
    {
      name: '已拦截',
      count: unknownCount,
      percentage: total > 0 ? (unknownCount / total) * 100 : 0,
      color: '#64748b', // slate
    },
  ];
};

// 生成拦截率历史数据（最近7天）
export const generateBlockRateHistory = async (): Promise<BlockRateHistoryPoint[]> => {
  try {
    const counters = await storage.getStatisticsCounters();
    const history: BlockRateHistoryPoint[] = [];
    const today = new Date();

    // 生成最近7天的数据
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

      const dailyStat = counters.dailyStats[dateStr];
      if (dailyStat && dailyStat.totalRequests > 0) {
        const blockRate = (dailyStat.blockedRequests / dailyStat.totalRequests) * 100;
        history.push({
          date: dateStr,
          blockRate,
          totalRequests: dailyStat.totalRequests,
          blockedRequests: dailyStat.blockedRequests,
        });
      } else {
        // 如果该日期没有数据，填充0
        history.push({
          date: dateStr,
          blockRate: 0,
          totalRequests: 0,
          blockedRequests: 0,
        });
      }
    }

    return history;
  } catch (error) {
    console.error('Failed to generate block rate history:', error);
    return [];
  }
};

// ===== 基于计数器的统计方法 =====

// 从计数器获取全局统计
export const getStatisticsFromCounters = async (logs: DnsLog[]): Promise<Statistics> => {
  try {
    const counters = await storage.getStatisticsCounters();

    // 计算平均延迟
    const averageLatency = counters.totalRequests > 0
      ? counters.totalLatency / counters.totalRequests
      : 0;

    // 计算拦截率
    const blockRate = counters.totalRequests > 0
      ? (counters.blockedRequests / counters.totalRequests) * 100
      : 0;

    // 图表数据仍然从日志计算（只需要最近24小时）
    const chartData = generateChartData(logs);

    // 生成拦截率历史数据
    const blockRateHistory = await generateBlockRateHistory();

    return {
      totalRequests: counters.totalRequests,
      blockedRequests: counters.blockedRequests,
      allowedRequests: counters.allowedRequests,
      blockRate,
      averageLatency,
      categoryStats: {
        tracker: 0,
        ad: 0,
        content: 0,
        unknown: counters.blockedRequests,
      },
      chartData,
      blockRateHistory,
    };
  } catch (error) {
    console.error('Failed to get statistics from counters:', error);
    // 降级到基于日志的计算
    return calculateStatistics(logs);
  }
};

// 从计数器获取今日统计
export const getTodayStatisticsFromCounters = async (logs: DnsLog[]): Promise<Statistics> => {
  try {
    const counters = await storage.getStatisticsCounters();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const todayStats = counters.dailyStats[today];

    if (!todayStats) {
      // 如果没有今日统计，返回空数据
      return {
        totalRequests: 0,
        blockedRequests: 0,
        allowedRequests: 0,
        blockRate: 0,
        averageLatency: 0,
        categoryStats: {
          tracker: 0,
          ad: 0,
          content: 0,
          unknown: 0,
        },
        chartData: [],
      };
    }

    // 计算平均延迟
    const averageLatency = todayStats.totalRequests > 0
      ? todayStats.totalLatency / todayStats.totalRequests
      : 0;

    // 计算拦截率
    const blockRate = todayStats.totalRequests > 0
      ? (todayStats.blockedRequests / todayStats.totalRequests) * 100
      : 0;

    // 图表数据从日志计算（只显示今日的）
    const today_date = new Date();
    today_date.setHours(0, 0, 0, 0);
    const todayLogs = logs.filter(log => {
      const logDate = new Date(log.timestamp);
      return logDate >= today_date;
    });
    const chartData = generateChartData(todayLogs);

    return {
      totalRequests: todayStats.totalRequests,
      blockedRequests: todayStats.blockedRequests,
      allowedRequests: todayStats.allowedRequests,
      blockRate,
      averageLatency,
      categoryStats: {
        tracker: 0,
        ad: 0,
        content: 0,
        unknown: todayStats.blockedRequests,
      },
      chartData,
    };
  } catch (error) {
    console.error('Failed to get today statistics from counters:', error);
    // 降级到基于日志的计算
    return getTodayStatistics(logs);
  }
};
