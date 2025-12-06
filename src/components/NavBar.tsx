import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform, useColorScheme } from 'react-native';
import { useThemeColors } from '../styles/theme';
import { BlurView } from '@react-native-community/blur';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { Tab } from '../types';
import { responsive, scaleWidth, responsiveValue } from '../utils/responsive';

interface NavBarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

interface NavItem {
  id: Tab;
  icon: string;
  label: string;
}

const NavTabButton: React.FC<{
  item: NavItem;
  isActive: boolean;
  onPress: () => void;
  colors: any;
}> = ({ item, isActive, onPress, colors }) => {
  const scaleAnim = useRef(new Animated.Value(isActive ? 1 : 0.95)).current;
  const opacityAnim = useRef(new Animated.Value(isActive ? 1 : 0.6)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: isActive ? 1 : 0.95,
        useNativeDriver: true,
        friction: 7,
      }),
      Animated.timing(opacityAnim, {
        toValue: isActive ? 1 : 0.6,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isActive]);

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.tabContainer}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
    >
      <Animated.View
        style={[
          styles.iconContainer,
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {isActive && (
          <View style={[styles.activeBackground, { backgroundColor: colors.background.tertiary }]} />
        )}
        <Icon
          name={item.icon}
          size={24}
          color={isActive ? colors.icon.active : colors.icon.inactive}
        />
      </Animated.View>
      <Text style={[
        styles.label,
        { color: isActive ? colors.text.primary : colors.text.tertiary, opacity: isActive ? 1 : 0.8 }
      ]}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );
};

export const NavBar: React.FC<NavBarProps> = ({ activeTab, onTabChange }) => {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const isDarkMode = useColorScheme() === 'dark';

  const tabs: NavItem[] = [
    { id: 'home', icon: 'shield', label: '守护' },
    { id: 'stats', icon: 'pie-chart', label: '统计' },
    { id: 'logs', icon: 'list', label: '日志' },
    { id: 'settings', icon: 'settings', label: '设置' },
  ];

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 20) }]}>
      {/* Background Blur */}
      {Platform.OS === 'ios' ? (
        <BlurView
          style={StyleSheet.absoluteFill}
          blurType={isDarkMode ? 'dark' : 'light'}
          blurAmount={20}
          reducedTransparencyFallbackColor={colors.background.elevated}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.androidBackground, { backgroundColor: colors.background.elevated }]} />
      )}

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {tabs.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <NavTabButton
              key={item.id}
              item={item}
              isActive={isActive}
              onPress={() => onTabChange(item.id)}
              colors={colors}
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(148, 163, 184, 0.1)', // slate-400 alpha 0.1
  },
  androidBackground: {
    // backgroundColor handled dynamically
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.1)',
  },
  tabsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
  },
  tabContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  activeBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 4,
  },
  labelActive: {
    // handled dynamically
  },
  navButton: { // Keep for back-compat if referenced elsewhere in previous broken code
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  navContent: { // Keep for back-compat
    alignItems: 'center',
    justifyContent: 'center',
  },
});
