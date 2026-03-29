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

    getMyProfile: protectedProcedure
      .query(async ({ ctx }) => {
        return userService.getMyProfile(ctx.userId!);
      }),

    getProfile: protectedProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return userService.getProfile(input.userId, ctx.userId!);
      }),

    updateProfile: protectedProcedure
      .input(z.object({
        bio: z.string().max(500).nullable().optional(),
        avatarId: z.string().max(128).nullable().optional(),
        playstyle: z.enum(['miner', 'warrior', 'explorer']).nullable().optional(),
        seekingAlliance: z.boolean().optional(),
        profileVisibility: z.record(z.string(), z.boolean()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await userService.updateProfile(ctx.userId!, input);
      }),

    listAvatars: protectedProcedure
      .query(async () => {
        return userService.listAvatars();
      }),
  });
}
