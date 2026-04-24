import type { APIRequestContext } from '@playwright/test';

/**
 * Lightweight tRPC-over-HTTP client for staging E2E tests. We don't import
 * @trpc/client here because it adds server-side type resolution headaches —
 * and these tests only need to ping the wire format.
 *
 * Query (GET, batched):   /trpc/<procedure>?batch=1&input=<urlencoded JSON>
 * Mutation (POST):        /trpc/<procedure>  body: {"0": <input>}
 * Batch responses:        [{ result: { data } } | { error: {...} }]
 *
 * Usage:
 *   const trpc = makeTRPC(request, token);
 *   const planets = await trpc.query('planet.list');
 *   const evt = await trpc.mutate('fleet.send', { ... });
 */
export function makeTRPC(request: APIRequestContext, token?: string) {
  const authHeader = token ? { authorization: `Bearer ${token}` } : {};

  async function unwrap(res: import('@playwright/test').APIResponse): Promise<unknown> {
    const body = (await res.json()) as Array<{ result?: { data: unknown }; error?: { message: string; data?: unknown } }>;
    const entry = body[0];
    if (!entry) throw new Error(`tRPC empty response (HTTP ${res.status()})`);
    if (entry.error) {
      throw new Error(`tRPC error: ${entry.error.message} — ${JSON.stringify(entry.error.data ?? {})}`);
    }
    return entry.result?.data;
  }

  return {
    async query<T = unknown>(procedure: string, input: unknown = {}): Promise<T> {
      const payload = encodeURIComponent(JSON.stringify({ 0: input }));
      const url = `/trpc/${procedure}?batch=1&input=${payload}`;
      const res = await request.get(url, { headers: authHeader });
      if (!res.ok()) {
        throw new Error(`tRPC ${procedure} HTTP ${res.status()}: ${(await res.text()).slice(0, 300)}`);
      }
      return (await unwrap(res)) as T;
    },

    async mutate<T = unknown>(procedure: string, input: unknown = {}): Promise<T> {
      const url = `/trpc/${procedure}?batch=1`;
      const res = await request.post(url, {
        headers: authHeader,
        data: { 0: input },
      });
      if (!res.ok()) {
        throw new Error(`tRPC ${procedure} HTTP ${res.status()}: ${(await res.text()).slice(0, 300)}`);
      }
      return (await unwrap(res)) as T;
    },
  };
}

export async function login(request: APIRequestContext, email: string, password: string): Promise<string> {
  const trpc = makeTRPC(request);
  const result = await trpc.mutate<{ accessToken: string; user: { isAdmin: boolean; username: string } }>(
    'auth.login',
    { email, password },
  );
  return result.accessToken;
}
