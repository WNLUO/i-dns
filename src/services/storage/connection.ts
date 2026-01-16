import AsyncStorage from '@react-native-async-storage/async-storage';
import {STORAGE_KEYS} from './keys';

export const getConnectionState = async (): Promise<boolean> => {
  try {
    const state = await AsyncStorage.getItem(STORAGE_KEYS.CONNECTION_STATE);
    return state === 'true';
  } catch (error) {
    console.error('Failed to load connection state:', error);
    return false;
  }
};

export const saveConnectionState = async (
  isConnected: boolean,
): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.CONNECTION_STATE,
      isConnected.toString(),
    );
  } catch (error) {
    console.error('Failed to save connection state:', error);
    throw error;
  }
};
