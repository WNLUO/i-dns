import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppSettings} from '../../types';
import {STORAGE_KEYS} from './keys';
import {DEFAULT_SETTINGS} from './defaults';

export const getSettings = async (): Promise<AppSettings> => {
  try {
    const settingsJson = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (settingsJson) {
      const parsed = JSON.parse(settingsJson);
      return {...DEFAULT_SETTINGS, ...parsed};
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Failed to load settings:', error);
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = async (settings: AppSettings): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings:', error);
    throw error;
  }
};

export const updateSettings = async (
  updates: Partial<AppSettings>,
): Promise<AppSettings> => {
  try {
    const currentSettings = await getSettings();
    const newSettings = {...currentSettings, ...updates};
    await saveSettings(newSettings);
    return newSettings;
  } catch (error) {
    console.error('Failed to update settings:', error);
    throw error;
  }
};
