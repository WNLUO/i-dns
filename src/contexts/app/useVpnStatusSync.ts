import {useEffect, useRef, RefObject} from 'react';
import type {Dispatch, SetStateAction} from 'react';
import {AppState, AppStateStatus} from 'react-native';
import * as storage from '../../services/storage';
import vpnService from '../../services/vpnService';

export const useVpnStatusSync = (
  setIsConnectedState: Dispatch<SetStateAction<boolean>>,
  isConnectedRef: RefObject<boolean>,
  latestLatency: number,
  setLatestLatency: Dispatch<SetStateAction<number>>,
) => {
  const lastVPNStatusRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!vpnService.isAvailable()) {
      console.warn('VPN service not available, skipping status monitoring');
      return;
    }

    console.log('Setting up VPN status monitoring and AppState listener');

    const unsubscribePermissionResult = vpnService.onVPNPermissionResult(async result => {
      console.log('========================================');
      console.log('🔐 VPN permission result received:', result);
      console.log('========================================');

      if (result.success) {
        console.log('✅ VPN started successfully after permission grant');
        try {
          await storage.saveConnectionState(true);
          setIsConnectedState(true);
          console.log('✅ VPN setup completed (local DNS processing mode)');
        } catch (error) {
          console.error('❌ Failed to complete VPN setup:', error);
        }
      } else {
        console.error('❌ VPN permission denied:', result.error);
        try {
          await storage.saveConnectionState(false);
          setIsConnectedState(false);
        } catch (error) {
          console.error('Failed to save disconnected state:', error);
        }
      }
    });

    const unsubscribeVPNStatus = vpnService.onVPNStatusChanged(async (connected: boolean) => {
      if (lastVPNStatusRef.current === connected) {
        return;
      }
      lastVPNStatusRef.current = connected;

      console.log('========================================');
      console.log('📡 VPN status changed event received');
      console.log(`New VPN Status: ${connected ? 'Connected' : 'Disconnected'}`);
      console.log(`Current UI State (ref): ${isConnectedRef.current ? 'Connected' : 'Disconnected'}`);
      console.log('========================================');

      if (connected !== isConnectedRef.current) {
        console.log('⚠️ Status mismatch detected, syncing UI...');
        try {
          await storage.saveConnectionState(connected);
          setIsConnectedState(connected);
          console.log('✅ UI state synced successfully');
        } catch (error) {
          console.error('❌ Failed to sync connection state:', error);
        }
      } else {
        console.log('✓ Status already in sync');
      }
    });

    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      console.log('========================================');
      console.log('📱 App state changed:', nextAppState);
      console.log('========================================');

      if (nextAppState === 'active') {
        console.log('🔄 App became active, verifying VPN status...');

        try {
          const actualStatus = await vpnService.getStatus();
          console.log(`Actual VPN Status: ${actualStatus ? 'Connected' : 'Disconnected'}`);

          const currentUIState = isConnectedRef.current;
          console.log(`UI State (ref): ${currentUIState ? 'Connected' : 'Disconnected'}`);

          if (actualStatus !== currentUIState) {
            console.log('⚠️ Status mismatch detected after returning to foreground');
            console.log(`Correcting UI: ${currentUIState} → ${actualStatus}`);

            await storage.saveConnectionState(actualStatus);
            setIsConnectedState(actualStatus);
            console.log('✅ UI state synced to actual VPN status');

            if (currentUIState && !actualStatus) {
              console.log('========================================');
              console.log('🔄 Auto-reconnect triggered');
              console.log('Reason: VPN was terminated while in background');
              console.log('========================================');

              try {
                await vpnService.start();
                console.log('✅ VPN reconnected successfully');
                await storage.saveConnectionState(true);
                setIsConnectedState(true);
              } catch (error) {
                console.error('❌ Failed to reconnect VPN:', error);
              }
            }
          } else {
            console.log('✓ VPN status is in sync, no action needed');
          }

          if (actualStatus && latestLatency === 0) {
            try {
              const currentLogs = await storage.getLogs();
              const recentAllowedLog = currentLogs.find(
                log => log.status === 'allowed' && log.latency > 0,
              );
              if (recentAllowedLog) {
                setLatestLatency(recentAllowedLog.latency);
                console.log(`✓ Restored latest latency: ${recentAllowedLog.latency}ms`);
              }
            } catch (error) {
              console.error('❌ Failed to restore latency:', error);
            }
          }
        } catch (error) {
          console.error('❌ Error during status verification:', error);
        }
      }
    });

    return () => {
      console.log('Cleaning up VPN status monitoring and AppState listener');
      unsubscribePermissionResult();
      unsubscribeVPNStatus();
      subscription.remove();
    };
  }, []);
};
