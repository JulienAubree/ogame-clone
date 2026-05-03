import { publicProcedure, router } from '../../trpc/router.js';
import type { createAdminProcedure } from '../../trpc/router.js';
import type { createHomepageService } from './homepage.service.js';
import { homepageContentSchema } from './homepage.types.js';

export function createHomepageRouter(
  service: ReturnType<typeof createHomepageService>,
  adminProcedure: ReturnType<typeof createAdminProcedure>,
) {
  const adminRouter = router({
    update: adminProcedure
      .input(homepageContentSchema)
      .mutation(({ input }) => service.updateContent(input)),

    reset: adminProcedure.mutation(() => service.resetContent()),
  });

  return router({
    /** Public read — used by the landing page. */
    get: publicProcedure.query(() => service.getContent()),
    admin: adminRouter,
  });
}
