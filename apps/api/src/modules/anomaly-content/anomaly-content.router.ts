import { protectedProcedure, router } from '../../trpc/router.js';
import type { createAdminProcedure } from '../../trpc/router.js';
import type { createAnomalyContentService } from './anomaly-content.service.js';
import { anomalyContentSchema } from './anomaly-content.types.js';

export function createAnomalyContentRouter(
  service: ReturnType<typeof createAnomalyContentService>,
  adminProcedure: ReturnType<typeof createAdminProcedure>,
) {
  const adminRouter = router({
    update: adminProcedure
      .input(anomalyContentSchema)
      .mutation(({ input }) => service.updateContent(input)),

    reset: adminProcedure.mutation(() => service.resetContent()),
  });

  return router({
    /** Authenticated read — anomaly content is read by the in-game UI. */
    get: protectedProcedure.query(() => service.getContent()),
    admin: adminRouter,
  });
}
