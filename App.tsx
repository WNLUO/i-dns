/**
 * @format
 */

import React, { useState, useEffect } from 'react';
import {
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
  Modal,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from './src/contexts/AppContext';
import { useThemeColors } from './src/styles/theme';
import { NavBar } from './src/components/NavBar';
import { HomeView } from './src/components/HomeView';
import { StatsView } from './src/components/StatsView';
import { LogsView } from './src/components/LogsView';
import { SettingsView } from './src/components/SettingsView';
import { UserAgreementView } from './src/components/UserAgreementView';
import { PrivacyPolicyView } from './src/components/PrivacyPolicyView';
import { ChildProtectionRulesView } from './src/components/ChildProtectionRulesView';
import { FirstLaunchModal } from './src/components/FirstLaunchModal';
import { TutorialView } from './src/components/TutorialView';
import { Tab } from './src/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

type LegalPage = 'user-agreement' | 'privacy-policy' | 'child-protection' | 'tutorial' | null;

const AppContent = () => {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [showLegalPage, setShowLegalPage] = useState<LegalPage>(null);
  const [showFirstLaunch, setShowFirstLaunch] = useState(false);

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
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <StatusBar
        barStyle={isDarkMode ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />

      {/* Main Content */}
      <View style={styles.content}>
        {activeTab === 'home' && <HomeView />}
        {activeTab === 'stats' && <StatsView />}
        {activeTab === 'logs' && <LogsView />}
        {activeTab === 'settings' && <SettingsView onNavigate={setShowLegalPage} />}
      </View>

      {/* Bottom Navigation */}
      <NavBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* First Launch Modal */}
      <FirstLaunchModal
        visible={showFirstLaunch}
        onAccept={handleFirstLaunchAccept}
        onViewAgreement={() => setShowLegalPage('user-agreement')}
        onViewPrivacy={() => setShowLegalPage('privacy-policy')}
      />

      {/* Legal Page Modal */}
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
    </View>
  );
};

function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  modalContainer: {
    flex: 1,
  },
});

export default App;
