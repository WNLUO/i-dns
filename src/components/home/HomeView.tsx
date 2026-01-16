import React, {useEffect, useState} from 'react';
import {View, Text, Animated, ScrollView} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useResponsiveLayout} from '../../hooks/useResponsiveLayout';
import {useApp} from '../../contexts/AppContext';
import {useThemeColors} from '../../styles/theme';
import {StatusCard} from './StatusCard';
import {ControlButton} from './ControlButton';
import {DashboardStats} from './DashboardStats';
import {TraditionalStats} from './TraditionalStats';
import {styles} from './styles';

export const HomeView: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {isConnected, setIsConnected, todayStatistics, latestLatency} = useApp();
  const colors = useThemeColors();
  const {isTablet, isLandscape, pagePadding, responsiveValue, scaleWidth} = useResponsiveLayout();

  const [scaleAnim] = useState(new Animated.Value(1));
  const [pulseAnim] = useState(new Animated.Value(1));

  const isSplitLayout = isLandscape;
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
        ]),
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

  const rawButtonSize = responsiveValue({
    default: scaleWidth(140),
    tablet: scaleWidth(160),
  });
  const buttonSize = Math.min(rawButtonSize, 180);

  return (
    <ScrollView
      style={[styles.container, {backgroundColor: colors.background.primary}]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(insets.top, 20) + 16,
          paddingBottom: Math.max(insets.bottom, 20) + 100,
          paddingHorizontal: pagePadding,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {isSplitLayout ? (
        <View style={styles.splitLayout}>
          <View style={styles.leftColumn}>
            <StatusCard
              isConnected={isConnected}
              latestLatency={latestLatency}
              colors={colors}
              responsiveValue={responsiveValue}
            />
            <View style={{height: 32}} />
            <ControlButton
              isConnected={isConnected}
              colors={colors}
              buttonSize={buttonSize}
              scaleAnim={scaleAnim}
              pulseAnim={pulseAnim}
              onPress={handlePress}
            />
          </View>
          <View style={styles.rightColumn}>
            <View style={{marginBottom: 16}}>
              <Text style={[styles.sectionTitle, {color: colors.text.tertiary}]}>实时监控</Text>
            </View>
            <DashboardStats todayStatistics={todayStatistics} colors={colors} />
          </View>
        </View>
      ) : isTabletPortrait ? (
        <View style={styles.tabletLayout}>
          <StatusCard
            isConnected={isConnected}
            latestLatency={latestLatency}
            colors={colors}
            responsiveValue={responsiveValue}
          />
          <View style={{marginVertical: 40}}>
            <ControlButton
              isConnected={isConnected}
              colors={colors}
              buttonSize={buttonSize}
              scaleAnim={scaleAnim}
              pulseAnim={pulseAnim}
              onPress={handlePress}
            />
          </View>
          <View style={{marginBottom: 16}}>
            <Text style={[styles.sectionTitle, {color: colors.text.tertiary}]}>实时监控</Text>
          </View>
          <DashboardStats todayStatistics={todayStatistics} colors={colors} />
        </View>
      ) : (
        <>
          <StatusCard
            isConnected={isConnected}
            latestLatency={latestLatency}
            colors={colors}
            responsiveValue={responsiveValue}
          />
          <ControlButton
            isConnected={isConnected}
            colors={colors}
            buttonSize={buttonSize}
            scaleAnim={scaleAnim}
            pulseAnim={pulseAnim}
            onPress={handlePress}
          />
          <TraditionalStats todayStatistics={todayStatistics} colors={colors} />
        </>
      )}
    </ScrollView>
  );
};
