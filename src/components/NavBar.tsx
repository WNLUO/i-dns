import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
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
}> = ({ item, isActive, onPress }) => {
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
      style={styles.navButton}
      activeOpacity={0.7}
    >
      <Animated.View
        style={[
          styles.navContent,
          {
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        {isActive && (
          <LinearGradient
            colors={['rgba(6, 182, 212, 0.2)', 'rgba(139, 92, 246, 0.2)']}
            style={styles.activeBackground}
          />
        )}
        <Icon
          name={item.icon}
          size={responsiveValue({
            small: 20,
            medium: 22,
            large: 24,
            tablet: 26,
            default: 22,
          })}
          color={isActive ? '#06b6d4' : '#94a3b8'}
        />
        <Text style={[styles.label, isActive && styles.labelActive]}>
          {item.label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

export const NavBar: React.FC<NavBarProps> = ({ activeTab, onTabChange }) => {
  const insets = useSafeAreaInsets();

  const navItems: NavItem[] = [
    { id: 'home', icon: 'home', label: '首页' },
    { id: 'stats', icon: 'bar-chart-2', label: '统计' },
    { id: 'logs', icon: 'list', label: '日志' },
    { id: 'settings', icon: 'settings', label: '设置' },
  ];

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      {Platform.OS === 'ios' ? (
        <BlurView
          style={StyleSheet.absoluteFill}
          blurType="dark"
          blurAmount={30}
          reducedTransparencyFallbackColor="#0f172a"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.androidBackground]} />
      )}

      <View style={styles.content}>
        {navItems.map((item) => (
          <NavTabButton
            key={item.id}
            item={item}
            isActive={activeTab === item.id}
            onPress={() => onTabChange(item.id)}
          />
        ))}
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
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: responsive.spacing.sm,
    paddingHorizontal: responsive.spacing.md,
    zIndex: 100,
    elevation: 100,
  },
  androidBackground: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    maxWidth: responsiveValue({
      small: scaleWidth(360),
      medium: scaleWidth(400),
      large: scaleWidth(480),
      tablet: scaleWidth(600),
      default: scaleWidth(480),
    }),
    alignSelf: 'center',
    width: '100%',
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: responsive.spacing.sm,
  },
  navContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: responsive.spacing.md,
    paddingVertical: responsive.spacing.sm,
    borderRadius: responsive.borderRadius.md,
    position: 'relative',
  },
  activeBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: responsive.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
  },
  label: {
    fontSize: responsive.fontSize.xs,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 4,
  },
  labelActive: {
    color: '#06b6d4',
  },
});
