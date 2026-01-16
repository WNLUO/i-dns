import {StyleSheet} from 'react-native';
import {responsive} from '../../utils/responsive';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {},
  header: {
    marginBottom: responsive.spacing['2xl'],
  },
  title: {
    fontSize: responsive.fontSize['4xl'],
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: responsive.fontSize.base,
    marginBottom: responsive.spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#64748b',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryNumber: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  periodBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  periodText: {
    fontSize: 11,
    fontWeight: '600',
  },
  chartCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#64748b',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  chart: {
    marginVertical: 0,
    borderRadius: 16,
  },
  circleCard: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#64748b',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  circleTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  circleDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  quickStats: {
    flexDirection: 'row',
    gap: 12,
  },
  quickStatItem: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    gap: 8,
  },
  quickStatNumber: {
    fontSize: 20,
    fontWeight: '700',
  },
  quickStatLabel: {
    fontSize: 11,
  },
  // 守护效率卡片新增样式
  comparisonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 16,
  },
  comparisonItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  comparisonLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  comparisonValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  comparisonDivider: {
    width: 1,
    height: 40,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendChartContainer: {
    width: '100%',
    marginTop: 8,
    gap: 12,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  miniChart: {
    marginVertical: 0,
    borderRadius: 12,
  },
  detailStats: {
    width: '100%',
    marginTop: 16,
    gap: 12,
  },
  detailStatsTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  detailStatsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  detailStatItem: {
    flex: 1,
    gap: 8,
  },
  detailStatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailStatLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  detailStatValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  progressBar: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
});
