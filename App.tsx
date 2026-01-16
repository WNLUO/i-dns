/**
 * @format
 */

import React, { useEffect, useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AppProvider, useApp } from './src/contexts/AppContext';
import { useThemeColors } from './src/styles/theme';
import { HomeView } from './src/components/home/HomeView';
import { StatsView } from './src/components/stats/StatsView';
import { LogsView } from './src/components/logs/LogsView';
import { SettingsView } from './src/components/settings/SettingsView';
import { UserAgreementView } from './src/components/UserAgreementView';
import { PrivacyPolicyView } from './src/components/PrivacyPolicyView';
import { ChildProtectionRulesView } from './src/components/ChildProtectionRulesView';
import { FirstLaunchModal } from './src/components/FirstLaunchModal';
import { TutorialView } from './src/components/TutorialView';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Feather';

type LegalPage = 'user-agreement' | 'privacy-policy' | 'child-protection' | 'tutorial' | null;

const Tab = createBottomTabNavigator();

// Settings Screen Wrapper to handle Modal state locally
const SettingsScreen = () => {
  const [showLegalPage, setShowLegalPage] = useState<LegalPage>(null);
  const colors = useThemeColors();

  return (
    <>
      <SettingsView onNavigate={setShowLegalPage} />
      <Modal
        visible={!!showLegalPage}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLegalPage(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background.modal }]}>
          {showLegalPage === 'child-protection' && <ChildProtectionRulesView onClose={() => setShowLegalPage(null)} />}
          {showLegalPage === 'tutorial' && <TutorialView onClose={() => setShowLegalPage(null)} />}
          {showLegalPage === 'privacy-policy' && <PrivacyPolicyView onClose={() => setShowLegalPage(null)} />}
          {showLegalPage === 'user-agreement' && <UserAgreementView onClose={() => setShowLegalPage(null)} />}
        </View>
      </Modal>
    </>
  );
};

const NavigationRoot = () => {
  const [showFirstLaunch, setShowFirstLaunch] = useState(false);
  const [showLegalPage, setShowLegalPage] = useState<LegalPage>(null);
  const colors = useThemeColors();
  const isDarkMode = useColorScheme() === 'dark';

  useEffect(() => {
    checkFirstLaunch();
  }, []);

  const checkFirstLaunch = async () => {
    try {
      const hasLaunched = await AsyncStorage.getItem('@has_launched');
      if (!hasLaunched) {
        setShowFirstLaunch(true);
      }
    } catch (error) {
      console.error('Error checking first launch:', error);
    }
  };

  const handleFirstLaunchAccept = async () => {
    try {
      await AsyncStorage.setItem('@has_launched', 'true');
      setShowFirstLaunch(false);
    } catch (error) {
      console.error('Error saving first launch:', error);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.primary }}>
      <StatusBar
        barStyle={isDarkMode ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />
      <NavigationContainer theme={isDarkMode ? DarkTheme : DefaultTheme}>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: colors.icon.active,
            tabBarInactiveTintColor: colors.icon.inactive,
            tabBarStyle: {
              backgroundColor: colors.background.elevated,
              borderTopColor: colors.border.default,
              borderTopWidth: 0.5,
              elevation: 8,
            },
            tabBarLabelStyle: {
              fontSize: 10,
              fontWeight: '500',
              marginBottom: 4,
            },
            tabBarIconStyle: {
              marginTop: 4,
            }
          })}
        >
          <Tab.Screen
            name="Home"
            component={HomeView}
            options={{
              tabBarLabel: '守护',
              tabBarIcon: ({ color, size }) => (
                <Icon name="shield" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="Stats"
            component={StatsView}
            options={{
              tabBarLabel: '统计',
              tabBarIcon: ({ color, size }) => (
                <Icon name="pie-chart" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="Logs"
            component={LogsView}
            options={{
              tabBarLabel: '日志',
              tabBarIcon: ({ color, size }) => (
                <Icon name="list" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              tabBarLabel: '设置',
              tabBarIcon: ({ color, size }) => (
                <Icon name="settings" size={size} color={color} />
              ),
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>

      {/* First Launch Modal - Global Overlay */}
      <FirstLaunchModal
        visible={showFirstLaunch}
        onAccept={handleFirstLaunchAccept}
        onViewAgreement={() => setShowLegalPage('user-agreement')}
        onViewPrivacy={() => setShowLegalPage('privacy-policy')}
      />

      {/* Legal Page Modal for First Launch context */}
      <Modal
        visible={!!showLegalPage}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLegalPage(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background.modal }]}>
          {showLegalPage === 'privacy-policy' && <PrivacyPolicyView onClose={() => setShowLegalPage(null)} />}
          {showLegalPage === 'user-agreement' && <UserAgreementView onClose={() => setShowLegalPage(null)} />}
        </View>
      </Modal>
    </View>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <NavigationRoot />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
});

export default App;
