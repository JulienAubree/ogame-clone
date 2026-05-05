import { z } from 'zod';
import { nonNegativeInt } from '../../lib/zod-schemas.js';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createFeedbackService } from './feedback.service.js';
import type { createAdminProcedure } from '../../trpc/router.js';

export function createFeedbackRouter(
  feedbackService: ReturnType<typeof createFeedbackService>,
  adminProcedure: ReturnType<typeof createAdminProcedure>,
) {
  const adminRouter = router({
    list: adminProcedure
      .input(z.object({
        type: z.enum(['bug', 'idea', 'feedback']).optional(),
        status: z.enum(['new', 'in_progress', 'resolved', 'rejected']).optional(),
        offset: nonNegativeInt.default(0),
        limit: z.number().int().min(1).max(100).default(30),
      }).optional())
      .query(async ({ input }) => {
        return feedbackService.adminList(input);
      }),

    export: adminProcedure
      .input(z.object({
        type: z.enum(['bug', 'idea', 'feedback']).optional(),
        status: z.enum(['new', 'in_progress', 'resolved', 'rejected']).optional(),
      }).optional())
      .query(async ({ input }) => {
        return feedbackService.adminExport(input);
      }),

    updateStatus: adminProcedure
      .input(z.object({
        id: z.string().uuid(),
        status: z.enum(['new', 'in_progress', 'resolved', 'rejected']),
        adminNote: z.string().max(2000).optional(),
      }))
      .mutation(async ({ input }) => {
        return feedbackService.updateStatus(input.id, input.status, input.adminNote);
      }),

    delete: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input }) => {
        return feedbackService.deleteFeedback(input.id);
      }),

    deleteComment: adminProcedure
      .input(z.object({ commentId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        return feedbackService.deleteComment(input.commentId);
      }),
  });

  return router({
    list: protectedProcedure
      .input(z.object({
        type: z.enum(['bug', 'idea', 'feedback']).optional(),
        status: z.enum(['new', 'in_progress', 'resolved', 'rejected']).optional(),
        excludeResolved: z.boolean().optional(),
        sort: z.enum(['recent', 'popular']).default('recent'),
        cursor: z.string().uuid().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return feedbackService.list({ ...input, userId: ctx.userId! });
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return feedbackService.getById(input.id, ctx.userId!);
      }),

    create: protectedProcedure
      .input(z.object({
        type: z.enum(['bug', 'idea', 'feedback']),
        title: z.string().min(1).max(200),
        description: z.string().min(1).max(2000),
        /** Page path the user was on (e.g. "/empire", "/missions"). Optional. */
        pagePath: z.string().max(500).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return feedbackService.create(ctx.userId!, input);
      }),

    vote: protectedProcedure
      .input(z.object({ feedbackId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        return feedbackService.vote(ctx.userId!, input.feedbackId);
      }),

    comment: protectedProcedure
      .input(z.object({
        feedbackId: z.string().uuid(),
        content: z.string().min(1).max(2000),
      }))
      .mutation(async ({ ctx, input }) => {
        return feedbackService.comment(ctx.userId!, input.feedbackId, input.content);
      }),

    myList: protectedProcedure
      .input(z.object({
        cursor: z.string().uuid().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return feedbackService.myList(ctx.userId!, input?.cursor);
      }),

    admin: adminRouter,
  });
}
