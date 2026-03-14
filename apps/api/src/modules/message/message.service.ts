import { eq, and, desc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { messages, users } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import type Redis from 'ioredis';
import { publishNotification } from '../notification/notification.publisher.js';

export function createMessageService(db: Database, redis: Redis) {
  return {
    async sendMessage(senderId: string, recipientUsername: string, subject: string, body: string) {
      const [recipient] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, recipientUsername))
        .limit(1);

      if (!recipient) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Joueur introuvable' });
      }

      if (recipient.id === senderId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vous ne pouvez pas vous envoyer un message' });
      }

      const [msg] = await db
        .insert(messages)
        .values({
          senderId,
          recipientId: recipient.id,
          type: 'player',
          subject,
          body,
        })
        .returning();

      const [sender] = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, senderId))
        .limit(1);

      publishNotification(redis, recipient.id, {
        type: 'new-message',
        payload: { messageId: msg.id, type: 'player', subject, senderUsername: sender?.username ?? null },
      });

      return msg;
    },

    async createSystemMessage(
      recipientId: string,
      type: 'system' | 'colonization' | 'espionage' | 'combat' | 'alliance',
      subject: string,
      body: string,
    ) {
      const [msg] = await db
        .insert(messages)
        .values({
          senderId: null,
          recipientId,
          type,
          subject,
          body,
        })
        .returning();

      publishNotification(redis, recipientId, {
        type: 'new-message',
        payload: { messageId: msg.id, type, subject, senderUsername: null },
      });

      return msg;
    },

    async listMessages(
      userId: string,
      options?: { page?: number; limit?: number; type?: 'system' | 'colonization' | 'player' | 'espionage' | 'combat' | 'alliance' },
    ) {
      const page = options?.page ?? 1;
      const limit = options?.limit ?? 20;
      const offset = (page - 1) * limit;

      const conditions = [eq(messages.recipientId, userId)];
      if (options?.type) {
        conditions.push(eq(messages.type, options.type));
      }

      return db
        .select({
          id: messages.id,
          senderId: messages.senderId,
          senderUsername: users.username,
          type: messages.type,
          subject: messages.subject,
          read: messages.read,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .leftJoin(users, eq(users.id, messages.senderId))
        .where(and(...conditions))
        .orderBy(desc(messages.createdAt))
        .limit(limit)
        .offset(offset);
    },

    async getMessage(userId: string, messageId: string) {
      const [msg] = await db
        .select({
          id: messages.id,
          senderId: messages.senderId,
          senderUsername: users.username,
          recipientId: messages.recipientId,
          type: messages.type,
          subject: messages.subject,
          body: messages.body,
          read: messages.read,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .leftJoin(users, eq(users.id, messages.senderId))
        .where(and(eq(messages.id, messageId), eq(messages.recipientId, userId)))
        .limit(1);

      if (!msg) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Message introuvable' });
      }

      if (!msg.read) {
        await db
          .update(messages)
          .set({ read: true })
          .where(eq(messages.id, messageId));
      }

      return { ...msg, read: true };
    },

    async markAsRead(userId: string, messageId: string) {
      await db
        .update(messages)
        .set({ read: true })
        .where(and(eq(messages.id, messageId), eq(messages.recipientId, userId)));

      return { success: true };
    },

    async deleteMessage(userId: string, messageId: string) {
      await db
        .delete(messages)
        .where(and(eq(messages.id, messageId), eq(messages.recipientId, userId)));

      return { success: true };
    },

    async countUnread(userId: string) {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(and(eq(messages.recipientId, userId), eq(messages.read, false)));

      return result?.count ?? 0;
    },
  };
}
