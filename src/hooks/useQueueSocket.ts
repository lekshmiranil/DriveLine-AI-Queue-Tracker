import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientSocketMessage, ServerSocketMessage, TestingCenter } from '../types/queue';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting';

interface UseQueueSocketReturn {
  centers: TestingCenter[];
  connectionState: ConnectionState;
  lastError: string | null;
  clearError: () => void;
  now: number;
  sendAction: (msg: ClientSocketMessage) => boolean;
  lastIssuedAck: { centerId: string; tokenNumber: number; timestamp: number } | null;
}

export function useQueueSocket(): UseQueueSocketReturn {
  const [centers, setCenters] = useState<TestingCenter[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [lastError, setLastError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [lastIssuedAck, setLastIssuedAck] = useState<{
    centerId: string;
    tokenNumber: number;
    timestamp: number;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const attemptRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(true);

  const clearError = useCallback(() => setLastError(null), []);

  // Tick local clock every second for active booth elapsed timers (display only)
  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Fetch initial snapshot over HTTP immediately while WebSocket connects
  useEffect(() => {
    let cancelled = false;
    fetch('/api/centers')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load centers'))))
      .then((data: { centers: TestingCenter[] }) => {
        if (!cancelled && Array.isArray(data.centers)) {
          setCenters((prev) => (prev.length === 0 ? data.centers : prev));
        }
      })
      .catch(() => {
        // WebSocket connect will populate or show reconnecting state
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        attemptRef.current = 0;
        setConnectionState('connected');
        setLastError(null);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data) as ServerSocketMessage;
          if (msg.type === 'state:sync') {
            setCenters(msg.centers);
          } else if (msg.type === 'token:issued_ack') {
            setLastIssuedAck({
              centerId: msg.centerId,
              tokenNumber: msg.tokenNumber,
              timestamp: Date.now(),
            });
          } else if (msg.type === 'action:error') {
            setLastError(msg.message);
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnectionState('reconnecting');
        const delay = Math.min(8000, 800 * Math.pow(1.6, attemptRef.current));
        attemptRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, []);

  const sendAction = useCallback((msg: ClientSocketMessage): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setLastError('Connection interrupted. Reconnecting to live board...');
      return false;
    }
    ws.send(JSON.stringify(msg));
    return true;
  }, []);

  return {
    centers,
    connectionState,
    lastError,
    clearError,
    now,
    sendAction,
    lastIssuedAck,
  };
}
