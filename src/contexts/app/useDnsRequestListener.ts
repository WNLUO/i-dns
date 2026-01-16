import {useEffect, useRef} from 'react';
import type {Dispatch, SetStateAction} from 'react';
import {DnsLog} from '../../types';
import * as storage from '../../services/storage';
import vpnService, {DNSRequestEvent} from '../../services/vpnService';

export const useDnsRequestListener = (
  setLogs: Dispatch<SetStateAction<DnsLog[]>>,
  setLatestLatency: Dispatch<SetStateAction<number>>,
) => {
  const requestCounterRef = useRef(0);
  const logBufferRef = useRef<DnsLog[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recentLogsMapRef = useRef(new Map<string, DnsLog>());
  const isFlushingRef = useRef(false);

  useEffect(() => {
    if (!vpnService.isAvailable()) {
      return;
    }

    const flushLogs = async () => {
      if (isFlushingRef.current) {
        return;
      }

      if (logBufferRef.current.length === 0) {
        return;
      }

      isFlushingRef.current = true;
      const logsToSave = [...logBufferRef.current];
      logBufferRef.current = [];

      try {
        const currentLogs = await storage.getLogs();
        const updatedLogs = [...logsToSave, ...currentLogs].slice(0, 10000);

        storage.saveLogs(updatedLogs).catch(error => {
          console.error('Background log save failed:', error);
        });

        setLogs(prevLogs => {
          const combined = [...logsToSave, ...prevLogs];
          return combined.slice(0, 1000);
        });
      } catch (error) {
        console.error('Failed to flush logs:', error);
      } finally {
        isFlushingRef.current = false;
      }
    };

    const unsubscribe = vpnService.onDNSRequest((event: DNSRequestEvent) => {
      const timestamp = new Date(event.timestamp);
      const dedupeKey = `${event.domain}-${Math.floor(timestamp.getTime() / 1000)}`;

      if (recentLogsMapRef.current.has(dedupeKey)) {
        return;
      }

      const log: DnsLog = {
        id: `${Date.now()}-${++requestCounterRef.current}`,
        domain: event.domain,
        timestamp: event.timestamp,
        status: event.status,
        category: event.category,
        latency: event.latency,
      };

      if (event.latency > 0 && event.status === 'allowed') {
        setLatestLatency(event.latency);
      }

      storage.incrementStatistics(log).catch(error => {
        console.error('Failed to increment statistics:', error);
      });

      logBufferRef.current.push(log);

      recentLogsMapRef.current.set(dedupeKey, log);
      setTimeout(() => recentLogsMapRef.current.delete(dedupeKey), 2000);

      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      if (logBufferRef.current.length >= 10) {
        flushLogs();
      } else {
        flushTimerRef.current = setTimeout(() => {
          flushLogs();
        }, 300);
      }
    });

    return () => {
      unsubscribe();
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
      }
      if (logBufferRef.current.length > 0) {
        flushLogs();
      }
    };
  }, []);
};
