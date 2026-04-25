import { z } from 'zod';
import { optionalInt } from '../../lib/zod-schemas.js';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createMarketService } from './market.service.js';

export function createMarketRouter(marketService: ReturnType<typeof createMarketService>) {
  return router({
    list: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        resourceType: z.enum(['minerai', 'silicium', 'hydrogene']).optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }))
      .query(async ({ ctx, input }) => {
        return marketService.listOffers(ctx.userId!, input.planetId, {
          resourceType: input.resourceType,
          cursor: input.cursor,
          limit: input.limit,
        });
      }),

    myOffers: protectedProcedure
      .query(async ({ ctx }) => {
        return marketService.myOffers(ctx.userId!);
      }),

    createOffer: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        resourceType: z.enum(['minerai', 'silicium', 'hydrogene']),
        quantity: z.number().min(1),
        priceMinerai: z.number().min(0).default(0),
        priceSilicium: z.number().min(0).default(0),
        priceHydrogene: z.number().min(0).default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        return marketService.createOffer(ctx.userId!, input.planetId, input);
      }),

    cancelOffer: protectedProcedure
      .input(z.object({ offerId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        return marketService.cancelOffer(ctx.userId!, input.offerId);
      }),

    // ── Report offer endpoints ────────────────────────────────────────

    listReports: protectedProcedure
      .input(z.object({
        galaxy: optionalInt,
        system: optionalInt,
        minRarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return marketService.listReportOffers(ctx.userId!, input);
      }),

    createReportOffer: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        reportId: z.string().uuid(),
        priceMinerai: z.number().min(0).default(0),
        priceSilicium: z.number().min(0).default(0),
        priceHydrogene: z.number().min(0).default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        return marketService.createReportOffer(ctx.userId!, input.planetId, input);
      }),

    cancelReportOffer: protectedProcedure
      .input(z.object({ reportId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        return marketService.cancelReportOffer(ctx.userId!, input.reportId);
      }),
  });
}
