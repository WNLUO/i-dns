import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import {DnsLog} from '../types';

// 导出日志为 JSON 格式
export const exportLogsAsJSON = async (logs: DnsLog[]): Promise<void> => {
  try {
    const jsonContent = JSON.stringify(logs, null, 2);
    const fileName = `idns_logs_${getFormattedDate()}.json`;
    const filePath = `${RNFS.DocumentDirectoryPath}/${fileName}`;

    await RNFS.writeFile(filePath, jsonContent, 'utf8');

    await Share.open({
      title: '导出日志',
      url: `file://${filePath}`,
      type: 'application/json',
      subject: 'iDNS 日志数据',
    });
  } catch (error) {
    console.error('Failed to export logs as JSON:', error);
    throw error;
  }
};

// 导出日志为 CSV 格式
export const exportLogsAsCSV = async (logs: DnsLog[]): Promise<void> => {
  try {
    const csvContent = convertLogsToCSV(logs);
    const fileName = `idns_logs_${getFormattedDate()}.csv`;
    const filePath = `${RNFS.DocumentDirectoryPath}/${fileName}`;

    await RNFS.writeFile(filePath, csvContent, 'utf8');

    await Share.open({
      title: '导出日志',
      url: `file://${filePath}`,
      type: 'text/csv',
      subject: 'iDNS 日志数据',
    });
  } catch (error) {
    console.error('Failed to export logs as CSV:', error);
    throw error;
  }
};

// 将日志转换为 CSV 格式
const convertLogsToCSV = (logs: DnsLog[]): string => {
  const headers = ['ID', '域名', '时间', '状态', '类别', '延迟(ms)'];
  const headerRow = headers.join(',');

  const dataRows = logs.map(log => {
    return [
      log.id,
      `"${log.domain}"`, // 使用引号包裹域名，防止逗号问题
      log.timestamp,
      log.status,
      log.category,
      log.latency,
    ].join(',');
  });

  return [headerRow, ...dataRows].join('\n');
};

// 导出日志为文本格式
export const exportLogsAsTXT = async (logs: DnsLog[]): Promise<void> => {
  try {
    const txtContent = convertLogsToText(logs);
    const fileName = `idns_logs_${getFormattedDate()}.txt`;
    const filePath = `${RNFS.DocumentDirectoryPath}/${fileName}`;

    await RNFS.writeFile(filePath, txtContent, 'utf8');

    await Share.open({
      title: '导出日志',
      url: `file://${filePath}`,
      type: 'text/plain',
      subject: 'iDNS 日志数据',
    });
  } catch (error) {
    console.error('Failed to export logs as TXT:', error);
    throw error;
  }
};

// 将日志转换为文本格式
const convertLogsToText = (logs: DnsLog[]): string => {
  const header = `iDNS 日志报告
生成时间: ${new Date().toLocaleString('zh-CN')}
总记录数: ${logs.length}
${'='.repeat(60)}

`;

  const logEntries = logs
    .map(log => {
      return `[${log.timestamp}]
域名: ${log.domain}
状态: ${log.status === 'blocked' ? '已拦截' : '已放行'}
类别: ${getCategoryName(log.category)}
延迟: ${log.latency}ms
${'-'.repeat(60)}`;
    })
    .join('\n');

  return header + logEntries;
};

// 获取类别中文名称
const getCategoryName = (category: string): string => {
  const categoryMap: {[key: string]: string} = {
    tracker: '追踪器',
    ad: '广告',
    content: '恶意内容',
    unknown: '其他',
  };
  return categoryMap[category] || category;
};

// 获取格式化的日期（用于文件名）
const getFormattedDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}`;
};

// 导出统计报告
export const exportStatisticsReport = async (
  logs: DnsLog[],
): Promise<void> => {
  try {
    const report = generateStatisticsReport(logs);
    const fileName = `idns_report_${getFormattedDate()}.txt`;
    const filePath = `${RNFS.DocumentDirectoryPath}/${fileName}`;

    await RNFS.writeFile(filePath, report, 'utf8');

    await Share.open({
      title: '导出统计报告',
      url: `file://${filePath}`,
      type: 'text/plain',
      subject: 'iDNS 统计报告',
    });
  } catch (error) {
    console.error('Failed to export statistics report:', error);
    throw error;
  }
};

// 生成统计报告
const generateStatisticsReport = (logs: DnsLog[]): string => {
  const total = logs.length;
  const blocked = logs.filter(log => log.status === 'blocked').length;
  const allowed = logs.filter(log => log.status === 'allowed').length;
  const blockRate = total > 0 ? ((blocked / total) * 100).toFixed(2) : '0';

  const categoryStats = {
    tracker: logs.filter(log => log.category === 'tracker').length,
    ad: logs.filter(log => log.category === 'ad').length,
    content: logs.filter(log => log.category === 'content').length,
    unknown: logs.filter(log => log.category === 'unknown').length,
  };

  const totalLatency = logs.reduce((sum, log) => sum + log.latency, 0);
  const avgLatency = total > 0 ? (totalLatency / total).toFixed(2) : '0';

  return `iDNS 统计报告
${'='.repeat(60)}
生成时间: ${new Date().toLocaleString('zh-CN')}

【总体统计】
总请求数: ${total}
已拦截: ${blocked} (${blockRate}%)
已放行: ${allowed}
平均延迟: ${avgLatency}ms

【拦截分类】
追踪器: ${categoryStats.tracker}
广告: ${categoryStats.ad}
恶意内容: ${categoryStats.content}
其他: ${categoryStats.unknown}

【时间范围】
最早记录: ${logs.length > 0 ? logs[logs.length - 1].timestamp : 'N/A'}
最新记录: ${logs.length > 0 ? logs[0].timestamp : 'N/A'}

${'='.repeat(60)}
由 iDNS 家庭守护生成
`;
};
