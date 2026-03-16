import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createGameEventService } from './game-event.service.js';

const gameEventTypeEnum = z.enum(['building-done', 'research-done', 'shipyard-done', 'fleet-arrived', 'fleet-returned']);

export function createGameEventRouter(gameEventService: ReturnType<typeof createGameEventService>) {
  return router({
    recent: protectedProcedure
      .query(async ({ ctx }) => {
        return gameEventService.getRecent(ctx.userId!);
      }),

    unreadCount: protectedProcedure
      .query(async ({ ctx }) => {
        const count = await gameEventService.getUnreadCount(ctx.userId!);
        return { count };
      }),

    markAllRead: protectedProcedure
      .mutation(async ({ ctx }) => {
        const updated = await gameEventService.markAllRead(ctx.userId!);
        return { updated };
      }),

    byPlanet: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return gameEventService.getByPlanet(ctx.userId!, input.planetId);
      }),

    history: protectedProcedure
      .input(z.object({
        cursor: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        types: z.array(gameEventTypeEnum).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return gameEventService.getHistory(ctx.userId!, {
          cursor: input?.cursor,
          limit: input?.limit,
          types: input?.types,
        });
      }),
  });
}
