import { useEffect, useState } from 'react';

/**
 * Verify actual connectivity with a HEAD request.
 * navigator.onLine is unreliable on some desktop setups (VPN, multiple
 * network interfaces, etc.) — it can report false while requests work fine.
 */
async function checkConnectivity(): Promise<boolean> {
  if (navigator.onLine) return true;
  try {
    const res = await fetch('/health', { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    checkConnectivity().then(setIsOnline);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      checkConnectivity().then(setIsOnline);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
