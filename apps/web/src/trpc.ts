import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink, TRPCClientError } from '@trpc/client';
import type { AppRouter } from '@ogame-clone/api/trpc';

export const trpc = createTRPCReact<AppRouter>();

let refreshPromise: Promise<boolean> | null = null;

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
    return true;
  } catch {
    return false;
  }
}

function refreshOnUnauthorized() {
  return (refreshPromise ??= tryRefreshToken().finally(() => {
    refreshPromise = null;
  }));
}

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: '/trpc',
        headers: () => {
          const token = localStorage.getItem('accessToken');
          return token ? { authorization: `Bearer ${token}` } : {};
        },
        async fetch(url, options) {
          let res = await fetch(url, options);

          if (res.status === 401) {
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
