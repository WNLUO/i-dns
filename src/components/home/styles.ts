import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  splitLayout: {
    flexDirection: 'row',
    gap: 32,
    flex: 1,
    alignItems: 'center',
  },
  leftColumn: {
    flex: 0.48,
    justifyContent: 'center',
  },
  rightColumn: {
    flex: 0.52,
    justifyContent: 'center',
  },
  tabletLayout: {
    flex: 1,
    justifyContent: 'center',
  },
  statusCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  statusBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  statusValue: {
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  statusLatency: {
    alignItems: 'flex-end',
  },
  latencyNumber: {
    fontWeight: '600',
  },
  latencyLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  controlSection: {
    marginBottom: 24,
    alignItems: 'center',
    width: '100%',
  },
  buttonWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 16,
  },
  pulseRing: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 9999,
    zIndex: -1,
  },
  mainButtonContainer: {
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  mainButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonHint: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  dashboardCard: {
    width: '47%',
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  dashboardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardValue: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  dashboardLabel: {
    fontSize: 13,
  },
  statsSection: {
    marginBottom: 24,
    width: '100%',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    marginTop: 16,
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  networkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  networkInfo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  networkValue: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  networkLabel: {
    fontSize: 11,
  },
  networkDivider: {
    width: 1,
    height: 32,
  },
});
