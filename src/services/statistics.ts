import {DnsLog, ChartDataPoint, Statistics} from '../types';

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

  // 按类别统计
  const categoryStats = {
    tracker: logs.filter(log => log.category === 'tracker').length,
    ad: logs.filter(log => log.category === 'ad').length,
    content: logs.filter(log => log.category === 'content').length,
    unknown: logs.filter(log => log.category === 'unknown').length,
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
export const getCategoryBreakdown = (logs: DnsLog[]) => {
  const blockedLogs = logs.filter(log => log.status === 'blocked');
  const total = blockedLogs.length;

  const trackerCount = blockedLogs.filter(
    log => log.category === 'tracker',
  ).length;
  const adCount = blockedLogs.filter(log => log.category === 'ad').length;
  const contentCount = blockedLogs.filter(
    log => log.category === 'content',
  ).length;
  const unknownCount = blockedLogs.filter(
    log => log.category === 'unknown',
  ).length;

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
      name: '其他',
      count: unknownCount,
      percentage: total > 0 ? (unknownCount / total) * 100 : 0,
      color: '#64748b', // slate
    },
  ];
};
