import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { formatNumber, formatLatency } from '../utils/responsive';
import { useApp } from '../contexts/AppContext';
import { useThemeColors } from '../styles/theme';

export const HomeView: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { isConnected, setIsConnected, todayStatistics, latestLatency } = useApp();
  const colors = useThemeColors();
  const { isTablet, isLandscape, width, pagePadding, responsiveValue, scaleWidth } = useResponsiveLayout();

  const [scaleAnim] = useState(new Animated.Value(1));
  const [pulseAnim] = useState(new Animated.Value(1));

  // Determine layout mode
  const isSplitLayout = isLandscape; // Tablet landscape or phone landscape
  const isTabletPortrait = isTablet && !isLandscape;

  useEffect(() => {
    if (isConnected) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isConnected]);

  const handlePress = async () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      await setIsConnected(!isConnected);
    } catch (error) {
      console.error('Failed to toggle connection:', error);
    }
  };

  const StatusCard = () => (
    <View style={[styles.statusCard, { backgroundColor: colors.background.elevated, borderColor: colors.border.default }]}>
      <View style={styles.statusHeader}>
        <View style={[
          styles.statusDot,
          { backgroundColor: isConnected ? colors.status.active : colors.status.inactive }
        ]} />
        <Text style={[styles.statusLabel, { color: colors.text.secondary }]} numberOfLines={1}>守护状态</Text>
      </View>

      <View style={styles.statusBody}>
        <Text style={[styles.statusValue, { color: colors.text.primary, fontSize: responsiveValue({ default: 24, tablet: 28 }) }]} numberOfLines={1}>
          {isConnected ? '守护中' : '已停止'}
        </Text>
        <View style={styles.statusLatency}>
          <Text style={[styles.latencyNumber, { color: colors.info, fontSize: responsiveValue({ default: 20, tablet: 24 }) }]} numberOfLines={1}>
            {isConnected && latestLatency > 0
              ? (() => {
                const latency = formatLatency(latestLatency);
                return `${latency.value}${latency.unit}`;
              })()
              : '--'}
          </Text>
          <Text style={[styles.latencyLabel, { color: colors.text.tertiary }]} numberOfLines={1}>延迟</Text>
        </View>
      </View>
    </View>
  );

  const ControlButton = () => {
    // Cap button size for tablet to avoid looking too large
    const rawButtonSize = responsiveValue({
      default: scaleWidth(140),
      tablet: scaleWidth(160),
    });
    const buttonSize = Math.min(rawButtonSize, 180);

    return (
      <View style={styles.controlSection}>
        <View style={[styles.buttonWrapper, { width: buttonSize * 1.4, height: buttonSize * 1.4 }]}>
          {/* Breathing Ring */}
          {isConnected && (
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  backgroundColor: colors.info,
                  transform: [{ scale: pulseAnim }],
                  opacity: pulseAnim.interpolate({
                    inputRange: [1, 1.1],
                    outputRange: [0.3, 0],
                  }),
                },
              ]}
            />
          )}

          {/* Main Button */}
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <TouchableOpacity
              onPress={handlePress}
              activeOpacity={0.9}
              style={[styles.mainButtonContainer, { shadowColor: colors.info }]}
            >
              <LinearGradient
                colors={isConnected ? [colors.info, colors.icon.active] : [colors.background.tertiary, colors.background.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.mainButton, {
                  width: buttonSize,
                  height: buttonSize,
                  borderRadius: buttonSize / 2
                }]}
              >
                <Icon
                  name={isConnected ? 'shield' : 'shield-off'}
                  size={buttonSize * 0.45}
                  color={isConnected ? colors.text.inverse : colors.text.disabled}
                />
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>

        <Text style={[styles.buttonHint, { color: colors.text.secondary }]}>
          {isConnected ? '点击关闭守护' : '点击开启守护'}
        </Text>
      </View>
    );
  };

  const DashboardStats = () => (
    <View style={styles.dashboardGrid}>
      {/* Blocked */}
      <View style={[styles.dashboardCard, { backgroundColor: colors.background.elevated, borderColor: colors.border.default }]}>
        <View style={[styles.dashboardIcon, { backgroundColor: colors.background.secondary }]}>
          <Icon name="x-circle" size={24} color={colors.status.error} />
        </View>
        <View>
          <Text style={[styles.dashboardValue, { color: colors.text.primary }]}>
            {formatNumber(todayStatistics.blockedRequests)}
          </Text>
          <Text style={[styles.dashboardLabel, { color: colors.text.secondary }]}>已过滤</Text>
        </View>
      </View>

      {/* Allowed */}
      <View style={[styles.dashboardCard, { backgroundColor: colors.background.elevated, borderColor: colors.border.default }]}>
        <View style={[styles.dashboardIcon, { backgroundColor: colors.background.secondary }]}>
          <Icon name="check-circle" size={24} color={colors.status.active} />
        </View>
        <View>
          <Text style={[styles.dashboardValue, { color: colors.text.primary }]}>
            {formatNumber(todayStatistics.allowedRequests)}
          </Text>
          <Text style={[styles.dashboardLabel, { color: colors.text.secondary }]}>安全访问</Text>
        </View>
      </View>

      {/* Total Requests */}
      <View style={[styles.dashboardCard, { backgroundColor: colors.background.elevated, borderColor: colors.border.default }]}>
        <View style={[styles.dashboardIcon, { backgroundColor: colors.background.secondary }]}>
          <Icon name="activity" size={24} color={colors.info} />
        </View>
        <View>
          <Text style={[styles.dashboardValue, { color: colors.text.primary }]}>
            {formatNumber(todayStatistics.totalRequests)}
          </Text>
          <Text style={[styles.dashboardLabel, { color: colors.text.secondary }]}>总请求数</Text>
        </View>
      </View>

      {/* Block Rate */}
      <View style={[styles.dashboardCard, { backgroundColor: colors.background.elevated, borderColor: colors.border.default }]}>
        <View style={[styles.dashboardIcon, { backgroundColor: colors.background.secondary }]}>
          <Icon name="pie-chart" size={24} color={colors.status.warning} />
        </View>
        <View>
          <Text style={[styles.dashboardValue, { color: colors.text.primary }]}>
            {todayStatistics.blockRate.toFixed(1)}%
          </Text>
          <Text style={[styles.dashboardLabel, { color: colors.text.secondary }]}>拦截率</Text>
        </View>
      </View>
    </View>
  );

  const TraditionalStats = () => (
    <View style={styles.statsSection}>
      <Text style={[styles.sectionTitle, { color: colors.text.tertiary }]}>今日统计</Text>
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: colors.background.elevated, borderColor: colors.border.default }]}>
          <View style={[styles.iconContainer, { backgroundColor: colors.background.secondary }]}>
            <Icon name="x-circle" size={24} color={colors.status.error} />
          </View>
          <View>
            <Text style={[styles.statNumber, { color: colors.text.primary }]} numberOfLines={1}>
              {formatNumber(todayStatistics.blockedRequests)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.text.secondary }]} numberOfLines={1}>已过滤</Text>
          </View>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.background.elevated, borderColor: colors.border.default }]}>
          <View style={[styles.iconContainer, { backgroundColor: colors.background.secondary }]}>
            <Icon name="check-circle" size={24} color={colors.status.active} />
          </View>
          <View>
            <Text style={[styles.statNumber, { color: colors.text.primary }]} numberOfLines={1}>
              {formatNumber(todayStatistics.allowedRequests)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.text.secondary }]} numberOfLines={1}>安全访问</Text>
          </View>
        </View>
      </View>

      <View style={[styles.networkCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
        <View style={styles.networkInfo}>
          <Text style={[styles.networkValue, { color: colors.text.primary }]} numberOfLines={1}>
            {formatNumber(todayStatistics.totalRequests)}
          </Text>
          <Text style={[styles.networkLabel, { color: colors.text.secondary }]} numberOfLines={1}>总请求数</Text>
        </View>
        <View style={[styles.networkDivider, { backgroundColor: colors.border.default }]} />
        <View style={styles.networkInfo}>
          <Text style={[styles.networkValue, { color: colors.text.primary }]} numberOfLines={1}>
            {todayStatistics.blockRate.toFixed(1)}%
          </Text>
          <Text style={[styles.networkLabel, { color: colors.text.secondary }]} numberOfLines={1}>拦截率</Text>
        </View>
      </View>
    </View>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(insets.top, 20) + 16,
          paddingBottom: Math.max(insets.bottom, 20) + 100,
          paddingHorizontal: pagePadding
        }
      ]}
      showsVerticalScrollIndicator={false}
    >
      {isSplitLayout ? (
        // Landscape Dashboard
        <View style={styles.splitLayout}>
          <View style={styles.leftColumn}>
            <StatusCard />
            {/* Spacer between Status and Button */}
            <View style={{ height: 32 }} />
            <ControlButton />
          </View>
          <View style={styles.rightColumn}>
            <Text style={[styles.sectionTitle, { color: colors.text.tertiary, marginBottom: 16 }]}>实时监控</Text>
            <DashboardStats />
          </View>
        </View>
      ) : isTabletPortrait ? (
        // Tablet Portrait Dashboard
        <View style={styles.tabletLayout}>
          <StatusCard />
          <View style={{ marginVertical: 40 }}>
            <ControlButton />
          </View>
          <Text style={[styles.sectionTitle, { color: colors.text.tertiary, marginBottom: 16 }]}>实时监控</Text>
          <DashboardStats />
        </View>
      ) : (
        // Phone Layout (Traditional)
        <>
          <StatusCard />
          <ControlButton />
          <TraditionalStats />
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
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
    alignItems: 'center', // Center vertically
  },
  leftColumn: {
    flex: 0.48,
    justifyContent: 'center', // Center content vertically
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
    shadowOffset: { width: 0, height: 4 },
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
    shadowOffset: { width: 0, height: 8 },
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
  // Dashboard Specific Styles
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  dashboardCard: {
    width: '47%', // Slightly less than 50% to account for gap
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
  // Traditional (Phone) Styles
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
    shadowOffset: { width: 0, height: 2 },
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
