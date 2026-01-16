import AsyncStorage from '@react-native-async-storage/async-storage';
import {DomainRule} from '../../types';
import {STORAGE_KEYS} from './keys';

export const getBlacklist = async (): Promise<DomainRule[]> => {
  try {
    const blacklistJson = await AsyncStorage.getItem(STORAGE_KEYS.BLACKLIST);
    if (blacklistJson) {
      return JSON.parse(blacklistJson);
    }
    return [];
  } catch (error) {
    console.error('Failed to load blacklist:', error);
    return [];
  }
};

export const saveBlacklist = async (rules: DomainRule[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.BLACKLIST, JSON.stringify(rules));
  } catch (error) {
    console.error('Failed to save blacklist:', error);
    throw error;
  }
};

export const addBlacklistRule = async (rule: DomainRule): Promise<void> => {
  try {
    const blacklist = await getBlacklist();
    blacklist.push(rule);
    await saveBlacklist(blacklist);
  } catch (error) {
    console.error('Failed to add blacklist rule:', error);
    throw error;
  }
};

export const removeBlacklistRule = async (ruleId: string): Promise<void> => {
  try {
    const blacklist = await getBlacklist();
    const filtered = blacklist.filter(rule => rule.id !== ruleId);
    await saveBlacklist(filtered);
  } catch (error) {
    console.error('Failed to remove blacklist rule:', error);
    throw error;
  }
};

export const getWhitelist = async (): Promise<DomainRule[]> => {
  try {
    const whitelistJson = await AsyncStorage.getItem(STORAGE_KEYS.WHITELIST);
    if (whitelistJson) {
      return JSON.parse(whitelistJson);
    }
    return [];
  } catch (error) {
    console.error('Failed to load whitelist:', error);
    return [];
  }
};

export const saveWhitelist = async (rules: DomainRule[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.WHITELIST, JSON.stringify(rules));
  } catch (error) {
    console.error('Failed to save whitelist:', error);
    throw error;
  }
};

export const addWhitelistRule = async (rule: DomainRule): Promise<void> => {
  try {
    const whitelist = await getWhitelist();
    whitelist.push(rule);
    await saveWhitelist(whitelist);
  } catch (error) {
    console.error('Failed to add whitelist rule:', error);
    throw error;
  }
};

export const removeWhitelistRule = async (ruleId: string): Promise<void> => {
  try {
    const whitelist = await getWhitelist();
    const filtered = whitelist.filter(rule => rule.id !== ruleId);
    await saveWhitelist(filtered);
  } catch (error) {
    console.error('Failed to remove whitelist rule:', error);
    throw error;
  }
};
