import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@ogame-clone/api/trpc';

export const trpc = createTRPCReact<AppRouter>();

let refreshPromise: Promise<boolean> | null = null;
let refreshFailed = false;

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('admin_refreshToken');
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

    localStorage.setItem('admin_accessToken', result.accessToken);
    localStorage.setItem('admin_refreshToken', result.refreshToken);
    refreshFailed = false;
    return true;
  } catch {
    return false;
  }
}

function forceLogout() {
  localStorage.removeItem('admin_accessToken');
  localStorage.removeItem('admin_refreshToken');
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

function refreshOnUnauthorized(): Promise<boolean> {
  if (refreshFailed) {
    forceLogout();
    return Promise.resolve(false);
  }

  return (refreshPromise ??= tryRefreshToken().then((success) => {
    if (!success) {
      refreshFailed = true;
      forceLogout();
    }
    return success;
  }).finally(() => {
    refreshPromise = null;
  }));
}

export function resetRefreshState() {
  refreshFailed = false;
}

/**
 * Fetch with automatic token refresh on 401.
 * Use this for REST calls outside tRPC (e.g., file uploads).
 */
export async function fetchWithAuth(url: string, options?: RequestInit): Promise<Response> {
  const token = localStorage.getItem('admin_accessToken');
  const headers = new Headers(options?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    const refreshed = await refreshOnUnauthorized();
    if (refreshed) {
      const newToken = localStorage.getItem('admin_accessToken');
      headers.set('Authorization', `Bearer ${newToken}`);
      res = await fetch(url, { ...options, headers });
    }
  }

  return res;
}

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: '/trpc',
        headers: () => {
          const token = localStorage.getItem('admin_accessToken');
          return token ? { authorization: `Bearer ${token}` } : {};
        },
        async fetch(url, options) {
          let res = await fetch(url, options);

          if (res.status === 401) {
            const urlStr = typeof url === 'string' ? url : url.toString();
            if (urlStr.includes('auth.login') || urlStr.includes('auth.register')) {
              return res;
            }

            const refreshed = await refreshOnUnauthorized();
            if (refreshed) {
              const newToken = localStorage.getItem('admin_accessToken');
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
