import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createAnnouncementService } from './announcement.service.js';
import type { createAdminProcedure } from '../../trpc/router.js';

const variantSchema = z.enum(['info', 'warning', 'success']);

export function createAnnouncementRouter(
  announcementService: ReturnType<typeof createAnnouncementService>,
  adminProcedure: ReturnType<typeof createAdminProcedure>,
) {
  const adminRouter = router({
    list: adminProcedure.query(() => announcementService.adminList()),

    create: adminProcedure
      .input(z.object({
        message: z.string().min(1).max(280),
        variant: variantSchema,
        changelogId: z.string().uuid().optional(),
        activate: z.boolean().default(false),
      }))
      .mutation(({ input }) => announcementService.adminCreate(input)),

    update: adminProcedure
      .input(z.object({
        id: z.string().uuid(),
        message: z.string().min(1).max(280).optional(),
        variant: variantSchema.optional(),
        changelogId: z.string().uuid().nullable().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...rest } = input;
        return announcementService.adminUpdate(id, rest);
      }),

    setActive: adminProcedure
      .input(z.object({ id: z.string().uuid(), active: z.boolean() }))
      .mutation(({ input }) => announcementService.adminSetActive(input.id, input.active)),

    delete: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(({ input }) => announcementService.adminDelete(input.id)),
  });

  return router({
    active: protectedProcedure.query(() => announcementService.getActive()),
    admin: adminRouter,
  });
}
