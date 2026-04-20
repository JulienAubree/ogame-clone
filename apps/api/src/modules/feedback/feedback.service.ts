import { eq, and, ne, desc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { feedbacks, feedbackVotes, feedbackComments, users } from '@exilium/db';
import type { Database } from '@exilium/db';
import type Redis from 'ioredis';
import { enforceRateLimit } from '../../lib/rate-limit.js';

const FEEDBACK_CREATE_LIMIT = 5;
const FEEDBACK_CREATE_WINDOW_SECONDS = 3600;
const FEEDBACK_COMMENT_LIMIT = 20;
const FEEDBACK_COMMENT_WINDOW_SECONDS = 3600;

export function createFeedbackService(db: Database, redis: Redis) {
  return {
    async list(options?: {
      type?: 'bug' | 'idea' | 'feedback';
      status?: 'new' | 'in_progress' | 'resolved' | 'rejected';
      sort?: 'recent' | 'popular';
      cursor?: string;
      limit?: number;
      userId?: string;
      excludeResolved?: boolean;
    }) {
      const limit = options?.limit ?? 20;
      const sort = options?.sort ?? 'recent';

      const conditions = [];
      if (options?.type) conditions.push(eq(feedbacks.type, options.type));
      if (options?.status) conditions.push(eq(feedbacks.status, options.status));
      if (options?.excludeResolved) conditions.push(ne(feedbacks.status, 'resolved'));
      if (options?.cursor) {
        conditions.push(sql`${feedbacks.createdAt} < (SELECT created_at FROM feedbacks WHERE id = ${options.cursor})`);
      }

      const orderBy = sort === 'popular'
        ? [desc(feedbacks.upvoteCount), desc(feedbacks.createdAt)]
        : [desc(feedbacks.createdAt)];

      const rows = await db
        .select({
          id: feedbacks.id,
          userId: feedbacks.userId,
          username: users.username,
          type: feedbacks.type,
          title: feedbacks.title,
          description: feedbacks.description,
          status: feedbacks.status,
          upvoteCount: feedbacks.upvoteCount,
          commentCount: feedbacks.commentCount,
          createdAt: feedbacks.createdAt,
        })
        .from(feedbacks)
        .leftJoin(users, eq(users.id, feedbacks.userId))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(...orderBy)
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1].id : undefined;

      let votedIds: Set<string> = new Set();
      if (options?.userId && items.length > 0) {
        const votes = await db
          .select({ feedbackId: feedbackVotes.feedbackId })
          .from(feedbackVotes)
          .where(and(
            eq(feedbackVotes.userId, options.userId),
            sql`${feedbackVotes.feedbackId} IN (${sql.join(items.map(i => sql`${i.id}`), sql`, `)})`,
          ));
        votedIds = new Set(votes.map(v => v.feedbackId));
      }

      return {
        items: items.map(item => ({
          ...item,
          description: item.description ? item.description.slice(0, 280) : null,
          hasVoted: votedIds.has(item.id),
        })),
        nextCursor,
      };
    },

    async getById(id: string, userId?: string) {
      const [feedback] = await db
        .select({
          id: feedbacks.id,
          userId: feedbacks.userId,
          username: users.username,
          type: feedbacks.type,
          title: feedbacks.title,
          description: feedbacks.description,
          status: feedbacks.status,
          upvoteCount: feedbacks.upvoteCount,
          commentCount: feedbacks.commentCount,
          createdAt: feedbacks.createdAt,
          updatedAt: feedbacks.updatedAt,
        })
        .from(feedbacks)
        .leftJoin(users, eq(users.id, feedbacks.userId))
        .where(eq(feedbacks.id, id))
        .limit(1);

      if (!feedback) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Feedback introuvable' });
      }

      let hasVoted = false;
      if (userId) {
        const [vote] = await db
          .select({ id: feedbackVotes.id })
          .from(feedbackVotes)
          .where(and(eq(feedbackVotes.feedbackId, id), eq(feedbackVotes.userId, userId)))
          .limit(1);
        hasVoted = !!vote;
      }

      const comments = await db
        .select({
          id: feedbackComments.id,
          userId: feedbackComments.userId,
          username: users.username,
          content: feedbackComments.content,
          isAdmin: feedbackComments.isAdmin,
          createdAt: feedbackComments.createdAt,
        })
        .from(feedbackComments)
        .leftJoin(users, eq(users.id, feedbackComments.userId))
        .where(eq(feedbackComments.feedbackId, id))
        .orderBy(feedbackComments.createdAt);

      return { ...feedback, hasVoted, comments };
    },

    async create(userId: string, input: { type: 'bug' | 'idea' | 'feedback'; title: string; description: string }) {
      await enforceRateLimit(redis, {
        key: `ratelimit:feedback:create:${userId}`,
        limit: FEEDBACK_CREATE_LIMIT,
        windowSeconds: FEEDBACK_CREATE_WINDOW_SECONDS,
      });
      const [created] = await db
        .insert(feedbacks)
        .values({
          userId,
          type: input.type,
          title: input.title,
          description: input.description,
        })
        .returning();

      return created;
    },

    async vote(userId: string, feedbackId: string) {
      const [feedback] = await db
        .select({ id: feedbacks.id })
        .from(feedbacks)
        .where(eq(feedbacks.id, feedbackId))
        .limit(1);

      if (!feedback) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Feedback introuvable' });
      }

      const [existing] = await db
        .select({ id: feedbackVotes.id })
        .from(feedbackVotes)
        .where(and(eq(feedbackVotes.feedbackId, feedbackId), eq(feedbackVotes.userId, userId)))
        .limit(1);

      if (existing) {
        await db.delete(feedbackVotes).where(eq(feedbackVotes.id, existing.id));
        await db.update(feedbacks).set({
          upvoteCount: sql`${feedbacks.upvoteCount} - 1`,
          updatedAt: new Date(),
        }).where(eq(feedbacks.id, feedbackId));
        return { voted: false };
      } else {
        await db.insert(feedbackVotes).values({ feedbackId, userId });
        await db.update(feedbacks).set({
          upvoteCount: sql`${feedbacks.upvoteCount} + 1`,
          updatedAt: new Date(),
        }).where(eq(feedbacks.id, feedbackId));
        return { voted: true };
      }
    },

    async comment(userId: string, feedbackId: string, content: string, isAdmin: boolean = false) {
      if (!isAdmin) {
        await enforceRateLimit(redis, {
          key: `ratelimit:feedback:comment:${userId}`,
          limit: FEEDBACK_COMMENT_LIMIT,
          windowSeconds: FEEDBACK_COMMENT_WINDOW_SECONDS,
        });
      }
      const [feedback] = await db
        .select({ id: feedbacks.id })
        .from(feedbacks)
        .where(eq(feedbacks.id, feedbackId))
        .limit(1);

      if (!feedback) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Feedback introuvable' });
      }

      const [comment] = await db
        .insert(feedbackComments)
        .values({ feedbackId, userId, content, isAdmin })
        .returning();

      await db.update(feedbacks).set({
        commentCount: sql`${feedbacks.commentCount} + 1`,
        updatedAt: new Date(),
      }).where(eq(feedbacks.id, feedbackId));

      return comment;
    },

    async myList(userId: string, cursor?: string) {
      const conditions = [eq(feedbacks.userId, userId)];
      if (cursor) {
        conditions.push(sql`${feedbacks.createdAt} < (SELECT created_at FROM feedbacks WHERE id = ${cursor})`);
      }

      const limit = 20;
      const rows = await db
        .select({
          id: feedbacks.id,
          type: feedbacks.type,
          title: feedbacks.title,
          status: feedbacks.status,
          upvoteCount: feedbacks.upvoteCount,
          commentCount: feedbacks.commentCount,
          createdAt: feedbacks.createdAt,
        })
        .from(feedbacks)
        .where(and(...conditions))
        .orderBy(desc(feedbacks.createdAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      return {
        items,
        nextCursor: hasMore ? items[items.length - 1].id : undefined,
      };
    },

    async updateStatus(id: string, status: 'new' | 'in_progress' | 'resolved' | 'rejected', adminNote?: string) {
      const updates: Record<string, unknown> = { status, updatedAt: new Date() };
      if (adminNote !== undefined) updates.adminNote = adminNote;

      await db.update(feedbacks).set(updates).where(eq(feedbacks.id, id));
      return { success: true };
    },

    async deleteFeedback(id: string) {
      await db.delete(feedbacks).where(eq(feedbacks.id, id));
      return { success: true };
    },

    async deleteComment(commentId: string) {
      const [comment] = await db
        .select({ feedbackId: feedbackComments.feedbackId })
        .from(feedbackComments)
        .where(eq(feedbackComments.id, commentId))
        .limit(1);

      if (!comment) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Commentaire introuvable' });
      }

      await db.delete(feedbackComments).where(eq(feedbackComments.id, commentId));
      await db.update(feedbacks).set({
        commentCount: sql`${feedbacks.commentCount} - 1`,
        updatedAt: new Date(),
      }).where(eq(feedbacks.id, comment.feedbackId));

      return { success: true };
    },

    async adminExport(options?: {
      type?: 'bug' | 'idea' | 'feedback';
      status?: 'new' | 'in_progress' | 'resolved' | 'rejected';
    }) {
      const conditions = [];
      if (options?.type) conditions.push(eq(feedbacks.type, options.type));
      if (options?.status) conditions.push(eq(feedbacks.status, options.status));

      return db
        .select({
          id: feedbacks.id,
          username: users.username,
          type: feedbacks.type,
          title: feedbacks.title,
          description: feedbacks.description,
          status: feedbacks.status,
          upvoteCount: feedbacks.upvoteCount,
          commentCount: feedbacks.commentCount,
          adminNote: feedbacks.adminNote,
          createdAt: feedbacks.createdAt,
        })
        .from(feedbacks)
        .leftJoin(users, eq(users.id, feedbacks.userId))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(feedbacks.createdAt));
    },

    async adminList(options?: {
      type?: 'bug' | 'idea' | 'feedback';
      status?: 'new' | 'in_progress' | 'resolved' | 'rejected';
      offset?: number;
      limit?: number;
    }) {
      const limit = options?.limit ?? 30;
      const offset = options?.offset ?? 0;

      const conditions = [];
      if (options?.type) conditions.push(eq(feedbacks.type, options.type));
      if (options?.status) conditions.push(eq(feedbacks.status, options.status));

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(feedbacks)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const rows = await db
        .select({
          id: feedbacks.id,
          userId: feedbacks.userId,
          username: users.username,
          type: feedbacks.type,
          title: feedbacks.title,
          status: feedbacks.status,
          upvoteCount: feedbacks.upvoteCount,
          commentCount: feedbacks.commentCount,
          adminNote: feedbacks.adminNote,
          createdAt: feedbacks.createdAt,
        })
        .from(feedbacks)
        .leftJoin(users, eq(users.id, feedbacks.userId))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(feedbacks.createdAt))
        .limit(limit)
        .offset(offset);

      const statusCounts = await db
        .select({
          status: feedbacks.status,
          count: sql<number>`count(*)::int`,
        })
        .from(feedbacks)
        .groupBy(feedbacks.status);

      return {
        items: rows,
        total: countResult?.count ?? 0,
        statusCounts: Object.fromEntries(statusCounts.map(s => [s.status, s.count])),
      };
    },
  };
}
