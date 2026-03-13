import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';

export interface Context {
  userId: string | null;
  req: CreateFastifyContextOptions['req'];
  res: CreateFastifyContextOptions['res'];
}

export function createContext({ req, res }: CreateFastifyContextOptions): Context {
  return {
    userId: null,
    req,
    res,
  };
}
