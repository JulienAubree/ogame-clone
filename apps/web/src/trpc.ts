import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@ogame-clone/api/trpc';

export const trpc = createTRPCReact<AppRouter>();

let refreshPromise: Promise<boolean> | null = null;
let refreshFailed = false;
let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function getTokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function scheduleProactiveRefresh() {
  if (proactiveRefreshTimer) clearTimeout(proactiveRefreshTimer);

  const token = localStorage.getItem('accessToken');
  if (!token) return;

  const expiry = getTokenExpiry(token);
  if (!expiry) return;

  // Refresh 5 minutes before expiry, minimum 10 seconds from now
  const refreshAt = Math.max(expiry - 5 * 60 * 1000, Date.now() + 10_000);
  const delay = refreshAt - Date.now();

  if (delay <= 0) return;

  proactiveRefreshTimer = setTimeout(async () => {
    const success = await tryRefreshToken();
    if (success) {
      scheduleProactiveRefresh();
    }
  }, delay);
}

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;

  try {
    const res = await fetch('/trpc/auth.refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: { refreshToken } }),
    });

    if (!res.ok) return false;

    const json = await res.json();
    const result = json?.result?.data?.json;
    if (!result?.accessToken || !result?.refreshToken) return false;

    localStorage.setItem('accessToken', result.accessToken);
    localStorage.setItem('refreshToken', result.refreshToken);
    refreshFailed = false;
    return true;
  } catch {
    return false;
  }
}

function forceLogout() {
  if (proactiveRefreshTimer) clearTimeout(proactiveRefreshTimer);
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  // Redirect to login only if not already there
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

function refreshOnUnauthorized(): Promise<boolean> {
  // If refresh already failed this session, don't retry — force logout
  if (refreshFailed) {
    forceLogout();
    return Promise.resolve(false);
  }

  return (refreshPromise ??= tryRefreshToken().then((success) => {
    if (!success) {
      refreshFailed = true;
      forceLogout();
    } else {
      scheduleProactiveRefresh();
    }
    return success;
  }).finally(() => {
    refreshPromise = null;
  }));
}

// Reset the failed flag when a new login succeeds (called externally)
export function resetRefreshState() {
  refreshFailed = false;
  scheduleProactiveRefresh();
}

// On page load: if token is already expired, refresh immediately before queries fire
let startupRefreshPromise: Promise<void> | null = null;

function refreshExpiredTokenOnStartup() {
  const token = localStorage.getItem('accessToken');
  if (!token) return;
  const expiry = getTokenExpiry(token);
  if (expiry && expiry <= Date.now()) {
    startupRefreshPromise = tryRefreshToken().then((success) => {
      startupRefreshPromise = null;
      if (success) scheduleProactiveRefresh();
      else forceLogout();
    });
  } else {
    scheduleProactiveRefresh();
  }
}

refreshExpiredTokenOnStartup();

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: '/trpc',
        maxURLLength: 2000,
        headers: () => {
          const token = localStorage.getItem('accessToken');
          return token ? { authorization: `Bearer ${token}` } : {};
        },
        async fetch(url, options) {
          // Wait for startup token refresh if in progress (avoids 401 → retry round trip)
          if (startupRefreshPromise) await startupRefreshPromise;

          let res = await fetch(url, options);

          if (res.status === 401) {
            // Don't intercept auth endpoints
            const urlStr = typeof url === 'string' ? url : url.toString();
            if (urlStr.includes('auth.login') || urlStr.includes('auth.register')) {
              return res;
            }

            const refreshed = await refreshOnUnauthorized();
            if (refreshed) {
              const newToken = localStorage.getItem('accessToken');
              const newHeaders = new Headers(options?.headers);
              newHeaders.set('authorization', `Bearer ${newToken}`);
              res = await fetch(url, { ...options, headers: newHeaders });
            }
          }

          return res;
        },
      }),
    ],
  });
}
