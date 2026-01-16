export {STORAGE_KEYS} from './keys';
export {DEFAULT_SETTINGS} from './defaults';

export {getSettings, saveSettings, updateSettings} from './settings';
export {getLogs, saveLogs, addLog, clearLogs, cleanupOldLogs} from './logs';
export {
  getBlacklist,
  saveBlacklist,
  addBlacklistRule,
  removeBlacklistRule,
  getWhitelist,
  saveWhitelist,
  addWhitelistRule,
  removeWhitelistRule,
} from './rules';
export {getConnectionState, saveConnectionState} from './connection';
export {
  getStatisticsCounters,
  saveStatisticsCounters,
  incrementStatistics,
  clearStatisticsCounters,
  initializeStatisticsFromLogs,
  cleanupOldDailyStats,
} from './statisticsCounters';
export {clearAllData} from './allData';
