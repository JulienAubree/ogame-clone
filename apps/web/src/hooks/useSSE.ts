import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth.store';

type SSEHandler = (event: { type: string; payload: Record<string, unknown> }) => void;

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

// EventSource cannot set custom headers, so we exchange the JWT for a
// short-lived single-use ticket and put that in the URL instead. This keeps
// the long-lived access token out of server access logs.
async function fetchSseTicket(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('/trpc/auth.getSseToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ json: {} }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.result?.data?.json?.token ?? null;
  } catch {
    return null;
  }
}

export function useSSE(onEvent: SSEHandler) {
  const token = useAuthStore((s) => s.accessToken);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const esRef = useRef<EventSource | null>(null);
  const retryDelay = useRef(INITIAL_RETRY_MS);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Invalidates in-flight ticket fetches when the hook reconnects or unmounts.
  const generationRef = useRef(0);

  const connect = useCallback(async () => {
    if (!token) return;

    esRef.current?.close();
    esRef.current = null;
    clearTimeout(retryTimer.current);

    const generation = ++generationRef.current;

    const ticket = await fetchSseTicket(token);
    if (generation !== generationRef.current) return;

    const scheduleRetry = () => {
      const delay = retryDelay.current;
      retryDelay.current = Math.min(delay * 2, MAX_RETRY_MS);
      retryTimer.current = setTimeout(() => {
        void connect();
      }, delay);
    };

    if (!ticket) {
      scheduleRetry();
      return;
    }

    const es = new EventSource(`/sse?token=${ticket}`);
    esRef.current = es;

    es.onopen = () => {
      retryDelay.current = INITIAL_RETRY_MS;
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        onEventRef.current(data);
      } catch {
        /* ignore parse errors */
      }
    };

    es.onerror = () => {
      es.close();
      if (esRef.current === es) esRef.current = null;
      scheduleRetry();
    };
  }, [token]);

  useEffect(() => {
    void connect();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !esRef.current) {
        retryDelay.current = INITIAL_RETRY_MS;
        void connect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      generationRef.current++;
      esRef.current?.close();
      esRef.current = null;
      clearTimeout(retryTimer.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [connect]);
}
