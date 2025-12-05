/**
 * @format
 */

import React, { useState, useEffect } from 'react';
import { StatusBar, StyleSheet, View, Modal, TouchableOpacity, ScrollView, Text as RNText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppProvider } from './src/contexts/AppContext';
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

type LegalPage = 'user-agreement' | 'privacy-policy' | 'child-protection' | 'tutorial' | null;

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [showLegalPage, setShowLegalPage] = useState<LegalPage>(null);
  const [showFirstLaunch, setShowFirstLaunch] = useState(false);

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
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        <View style={styles.container}>
          {/* Enhanced Background Gradients */}
          <LinearGradient
            colors={['#1e3a8a33', 'transparent', '#059669']}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
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
        </View>

        {/* First Launch Modal */}
        <FirstLaunchModal
          visible={showFirstLaunch}
          onAccept={handleFirstLaunchAccept}
          onViewAgreement={() => setShowLegalPage('user-agreement')}
          onViewPrivacy={() => setShowLegalPage('privacy-policy')}
        />

        {/* Legal Document Modals */}
        <Modal
          visible={showLegalPage !== null}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setShowLegalPage(null)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowLegalPage(null)}
              >
                <RNText style={styles.closeButtonText}>← 返回</RNText>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {showLegalPage === 'user-agreement' && <UserAgreementView />}
              {showLegalPage === 'privacy-policy' && <PrivacyPolicyView />}
              {showLegalPage === 'child-protection' && <ChildProtectionRulesView />}
              {showLegalPage === 'tutorial' && <TutorialView />}
            </ScrollView>
          </View>
        </Modal>
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    flex: 1,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  modalHeader: {
    padding: 16,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
  },
});

export default App;
