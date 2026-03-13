import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@ogame-clone/api/trpc';

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: '/trpc',
        headers: () => {
          const token = localStorage.getItem('accessToken');
          return token ? { authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
