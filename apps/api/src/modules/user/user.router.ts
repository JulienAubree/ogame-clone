import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createUserService } from './user.service.js';

export function createUserRouter(userService: ReturnType<typeof createUserService>) {
  return router({
    search: protectedProcedure
      .input(z.object({ query: z.string().min(2).max(64) }))
      .query(async ({ ctx, input }) => {
        return userService.searchUsers(ctx.userId!, input.query);
      }),
  });
}
