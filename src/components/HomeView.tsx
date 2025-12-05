import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { responsive, getPagePadding, scaleWidth, scaleHeight, responsiveValue, formatNumber, formatLatency } from '../utils/responsive';
import { useApp } from '../contexts/AppContext';

export const HomeView: React.FC = () => {
  // Hook顺序很重要！useSafeAreaInsets使用useContext，必须在所有其他hooks之前
  const insets = useSafeAreaInsets();
  const { isConnected, setIsConnected, todayStatistics, latestLatency } = useApp();

  const [scaleAnim] = useState(new Animated.Value(1));
  const [glowAnim] = useState(new Animated.Value(0));
  const [rotateAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (isConnected) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 8000,
          useNativeDriver: true,
        })
      ).start();
    } else {
      glowAnim.setValue(0);
      rotateAnim.setValue(0);
    }
  }, [isConnected]);

  const handlePress = async () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.92,
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

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(insets.top, 20) + responsive.spacing.lg,
          paddingBottom: Math.max(insets.bottom, 20) + 100,
        }
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Status Card */}
      <View style={styles.statusCard}>
        <View style={[
          styles.statusDot,
          { backgroundColor: isConnected ? '#10b981' : '#475569' }
        ]} />
        <View style={styles.statusInfo}>
          <Text style={styles.statusLabel} numberOfLines={1}>守护状态</Text>
          <Text style={styles.statusValue} numberOfLines={1}>
            {isConnected ? '守护中' : '已停止'}
          </Text>
        </View>
        <View style={styles.statusLatency}>
          <Text style={styles.latencyNumber} numberOfLines={1}>
            {isConnected && latestLatency > 0
              ? (() => {
                  const latency = formatLatency(latestLatency);
                  return `${latency.value}${latency.unit}`;
                })()
              : '--'}
          </Text>
          <Text style={styles.latencyLabel} numberOfLines={1}>延迟</Text>
        </View>
      </View>

      {/* Main Control Button */}
      <View style={styles.controlSection}>
        <View style={styles.buttonWrapper}>
          {/* Animated Glow Effect */}
          {isConnected && (
            <Animated.View
              style={[
                styles.glowRing,
                {
                  opacity: glowOpacity,
                  transform: [{ scale: glowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.15],
                  })}],
                },
              ]}
            >
              <LinearGradient
                colors={['#06b6d4', '#8b5cf6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.glowGradient}
              />
            </Animated.View>
          )}

          {/* Rotating Border */}
          {isConnected && (
            <Animated.View
              style={[
                styles.rotatingBorder,
                { transform: [{ rotate }] },
              ]}
            >
              <LinearGradient
                colors={['#06b6d4', '#8b5cf6', '#06b6d4']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.rotatingGradient}
              />
            </Animated.View>
          )}

          {/* Main Button */}
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <TouchableOpacity
              onPress={handlePress}
              activeOpacity={0.9}
            >
              <View
                style={styles.mainButtonShadow}
              >
                <LinearGradient
                  colors={isConnected ? ['#0ea5e9', '#8b5cf6'] : ['#334155', '#1e293b']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.mainButton}
                >
                  <Icon
                    name={isConnected ? 'shield' : 'shield-off'}
                    size={responsiveValue({
                      small: 48,
                      medium: 56,
                      large: 64,
                      tablet: 72,
                      default: 64,
                    })}
                    color={isConnected ? '#fff' : '#64748b'}
                  />
                </LinearGradient>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>

        <Text style={styles.buttonHint}>
          {isConnected ? '点击关闭守护' : '点击开启守护'}
        </Text>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsSection}>
        <Text style={styles.sectionTitle}>今日统计</Text>

        <View style={styles.statsGrid}>
          {/* Blocked Requests */}
          <View style={styles.statCard}>
            <Icon name="x-circle" size={32} color="#ef4444" />
            <Text style={styles.statNumber} numberOfLines={1}>
              {formatNumber(todayStatistics.blockedRequests)}
            </Text>
            <Text style={styles.statLabel} numberOfLines={1}>已过滤</Text>
          </View>

          {/* Allowed Requests */}
          <View style={styles.statCard}>
            <Icon name="check-circle" size={32} color="#10b981" />
            <Text style={styles.statNumber} numberOfLines={1}>
              {formatNumber(todayStatistics.allowedRequests)}
            </Text>
            <Text style={styles.statLabel} numberOfLines={1}>安全访问</Text>
          </View>
        </View>

        {/* Network Stats */}
        <View style={styles.networkCard}>
          <View style={styles.networkInfo}>
            <Text style={styles.networkValue} numberOfLines={1}>
              {formatNumber(todayStatistics.totalRequests)}
            </Text>
            <Text style={styles.networkLabel} numberOfLines={1}>总请求数</Text>
          </View>
          <View style={styles.networkDivider} />
          <View style={styles.networkInfo}>
            <Text style={styles.networkValue} numberOfLines={1}>
              {todayStatistics.blockRate.toFixed(1)}%
            </Text>
            <Text style={styles.networkLabel} numberOfLines={1}>拦截率</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: getPagePadding(),
    // paddingTop 在 contentContainerStyle 中动态设置（包含安全区域）
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderRadius: responsive.borderRadius.xl,
    padding: responsive.spacing.lg,
    marginBottom: responsive.spacing['3xl'],
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: responsive.spacing.md,
  },
  statusDot: {
    width: scaleWidth(12),
    height: scaleWidth(12),
    borderRadius: scaleWidth(6),
    flexShrink: 0,
  },
  statusInfo: {
    flex: 1,
  },
  statusLabel: {
    fontSize: responsive.fontSize.sm,
    color: '#94a3b8',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: responsive.fontSize.xl,
    fontWeight: '700',
    color: '#fff',
  },
  statusLatency: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  latencyNumber: {
    fontSize: responsive.fontSize['2xl'],
    fontWeight: '700',
    color: '#06b6d4',
  },
  latencyLabel: {
    fontSize: responsive.fontSize.xs,
    color: '#64748b',
    marginTop: 4,
  },
  controlSection: {
    marginBottom: responsive.spacing['3xl'],
  },
  sectionTitle: {
    fontSize: responsive.fontSize.sm,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: responsive.spacing.lg,
  },
  buttonWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    height: scaleHeight(220),
    position: 'relative',
  },
  glowRing: {
    position: 'absolute',
    width: responsiveValue({
      small: scaleWidth(180),
      medium: scaleWidth(190),
      large: scaleWidth(200),
      tablet: scaleWidth(220),
      default: scaleWidth(200),
    }),
    height: responsiveValue({
      small: scaleWidth(180),
      medium: scaleWidth(190),
      large: scaleWidth(200),
      tablet: scaleWidth(220),
      default: scaleWidth(200),
    }),
    borderRadius: responsiveValue({
      small: scaleWidth(90),
      medium: scaleWidth(95),
      large: scaleWidth(100),
      tablet: scaleWidth(110),
      default: scaleWidth(100),
    }),
    overflow: 'hidden',
  },
  glowGradient: {
    flex: 1,
    opacity: 0.3,
  },
  rotatingBorder: {
    position: 'absolute',
    width: responsiveValue({
      small: scaleWidth(160),
      medium: scaleWidth(170),
      large: scaleWidth(180),
      tablet: scaleWidth(200),
      default: scaleWidth(180),
    }),
    height: responsiveValue({
      small: scaleWidth(160),
      medium: scaleWidth(170),
      large: scaleWidth(180),
      tablet: scaleWidth(200),
      default: scaleWidth(180),
    }),
    borderRadius: responsiveValue({
      small: scaleWidth(80),
      medium: scaleWidth(85),
      large: scaleWidth(90),
      tablet: scaleWidth(100),
      default: scaleWidth(90),
    }),
    padding: 2,
    overflow: 'hidden',
  },
  rotatingGradient: {
    flex: 1,
    borderRadius: responsiveValue({
      small: scaleWidth(80),
      medium: scaleWidth(85),
      large: scaleWidth(90),
      tablet: scaleWidth(100),
      default: scaleWidth(90),
    }),
  },
  mainButtonShadow: {
    width: responsiveValue({
      small: scaleWidth(140),
      medium: scaleWidth(150),
      large: scaleWidth(160),
      tablet: scaleWidth(180),
      default: scaleWidth(160),
    }),
    height: responsiveValue({
      small: scaleWidth(140),
      medium: scaleWidth(150),
      large: scaleWidth(160),
      tablet: scaleWidth(180),
      default: scaleWidth(160),
    }),
    borderRadius: responsiveValue({
      small: scaleWidth(70),
      medium: scaleWidth(75),
      large: scaleWidth(80),
      tablet: scaleWidth(90),
      default: scaleWidth(80),
    }),
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
    backgroundColor: 'transparent',
  },
  mainButton: {
    width: '100%',
    height: '100%',
    borderRadius: responsiveValue({
      small: scaleWidth(70),
      medium: scaleWidth(75),
      large: scaleWidth(80),
      tablet: scaleWidth(90),
      default: scaleWidth(80),
    }),
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonHint: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: responsive.fontSize.base,
    marginTop: responsive.spacing.lg,
  },
  statsSection: {
    marginBottom: responsive.spacing['3xl'],
  },
  statsGrid: {
    flexDirection: 'row',
    gap: responsive.spacing.md,
    marginBottom: responsive.spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    borderRadius: responsive.borderRadius.lg,
    padding: responsive.spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    gap: responsive.spacing.sm,
  },
  statNumber: {
    fontSize: responsive.fontSize['3xl'],
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: responsive.fontSize.sm,
    color: '#94a3b8',
  },
  networkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    borderRadius: responsive.borderRadius.lg,
    padding: responsive.spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    gap: responsive.spacing.md,
  },
  networkInfo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  networkValue: {
    fontSize: responsive.fontSize.xl,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
    textAlign: 'center',
  },
  networkLabel: {
    fontSize: responsive.fontSize.xs,
    color: '#94a3b8',
    textAlign: 'center',
  },
  networkDivider: {
    width: 1,
    height: scaleHeight(40),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
});
