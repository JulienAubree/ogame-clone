import { initTRPC, TRPCError } from '@trpc/server';
import { jwtVerify } from 'jose';
import type { Context } from './context.js';
import { env } from '../config/env.js';

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const authHeader = ctx.req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  try {
    const token = authHeader.slice(7);
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return next({
      ctx: { ...ctx, userId: payload.userId as string },
    });
  } catch {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
});
