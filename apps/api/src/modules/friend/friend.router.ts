import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createFriendService } from './friend.service.js';

export function createFriendRouter(friendService: ReturnType<typeof createFriendService>) {
  return router({
    list: protectedProcedure
      .query(async ({ ctx }) => friendService.list(ctx.userId!)),

    pendingReceived: protectedProcedure
      .query(async ({ ctx }) => friendService.pendingReceived(ctx.userId!)),

    pendingSent: protectedProcedure
      .query(async ({ ctx }) => friendService.pendingSent(ctx.userId!)),

    request: protectedProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => friendService.request(ctx.userId!, input.userId)),

    accept: protectedProcedure
      .input(z.object({ friendshipId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => friendService.accept(input.friendshipId, ctx.userId!)),

    decline: protectedProcedure
      .input(z.object({ friendshipId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => friendService.decline(input.friendshipId, ctx.userId!)),

    cancel: protectedProcedure
      .input(z.object({ friendshipId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => friendService.cancel(input.friendshipId, ctx.userId!)),

    remove: protectedProcedure
      .input(z.object({ friendshipId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => friendService.remove(input.friendshipId, ctx.userId!)),
  });
}
