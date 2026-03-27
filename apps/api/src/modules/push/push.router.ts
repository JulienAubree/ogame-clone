import { z } from 'zod';
import { router, protectedProcedure } from '../../trpc/router.js';
import type { createPushService } from './push.service.js';

export function createPushRouter(pushService: ReturnType<typeof createPushService>) {
  return router({
    getPublicKey: protectedProcedure.query(() => {
      return { publicKey: pushService.getPublicKey() };
    }),

    subscribe: protectedProcedure
      .input(z.object({
        endpoint: z.string().url(),
        keys: z.object({
          p256dh: z.string(),
          auth: z.string(),
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        await pushService.subscribe(ctx.userId, input);
        return { ok: true };
      }),

    unsubscribe: protectedProcedure
      .input(z.object({ endpoint: z.string().url() }))
      .mutation(async ({ ctx, input }) => {
        await pushService.unsubscribe(ctx.userId, input.endpoint);
        return { ok: true };
      }),

    getPreferences: protectedProcedure.query(async ({ ctx }) => {
      return pushService.getPreferences(ctx.userId);
    }),

    updatePreferences: protectedProcedure
      .input(z.object({
        building: z.boolean().optional(),
        research: z.boolean().optional(),
        shipyard: z.boolean().optional(),
        fleet: z.boolean().optional(),
        combat: z.boolean().optional(),
        message: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await pushService.updatePreferences(ctx.userId, input);
        return { ok: true };
      }),
  });
}
