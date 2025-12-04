/**
 * @format
 */

import React, { useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { AppProvider } from './src/contexts/AppContext';
import { NavBar } from './src/components/NavBar';
import { HomeView } from './src/components/HomeView';
import { StatsView } from './src/components/StatsView';
import { LogsView } from './src/components/LogsView';
import { SettingsView } from './src/components/SettingsView';
import { Tab } from './src/types';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');

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
            {activeTab === 'settings' && <SettingsView />}
          </View>

          {/* Bottom Navigation */}
          <NavBar activeTab={activeTab} onTabChange={setActiveTab} />
        </View>
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
});

export default App;
