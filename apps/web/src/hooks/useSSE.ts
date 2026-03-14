import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/auth.store';

type SSEHandler = (event: { type: string; payload: Record<string, unknown> }) => void;

export function useSSE(onEvent: SSEHandler) {
  const token = useAuthStore((s) => s.accessToken);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!token) return;

    const es = new EventSource(`/sse?token=${token}`);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        onEventRef.current(data);
      } catch {
        /* ignore parse errors */
      }
    };

    return () => es.close();
  }, [token]);
}
