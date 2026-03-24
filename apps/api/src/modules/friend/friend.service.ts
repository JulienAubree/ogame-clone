import { eq, and, or } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { friendships, users } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';

export function createFriendService(db: Database) {
  return {
    async list(userId: string) {
      const rows = await db.select({
        friendshipId: friendships.id,
        friendUserId: users.id,
        username: users.username,
        avatarId: users.avatarId,
      }).from(friendships)
        .innerJoin(users, or(
          and(eq(friendships.requesterId, userId), eq(users.id, friendships.addresseeId)),
          and(eq(friendships.addresseeId, userId), eq(users.id, friendships.requesterId)),
        ))
        .where(and(
          eq(friendships.status, 'accepted'),
          or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
        ));

      return rows.map(r => ({
        friendshipId: r.friendshipId,
        userId: r.friendUserId,
        username: r.username,
        avatarId: r.avatarId,
      }));
    },

    async pendingReceived(userId: string) {
      return db.select({
        friendshipId: friendships.id,
        userId: users.id,
        username: users.username,
        avatarId: users.avatarId,
        createdAt: friendships.createdAt,
      }).from(friendships)
        .innerJoin(users, eq(users.id, friendships.requesterId))
        .where(and(
          eq(friendships.addresseeId, userId),
          eq(friendships.status, 'pending'),
        ));
    },

    async pendingSent(userId: string) {
      return db.select({
        friendshipId: friendships.id,
        userId: users.id,
        username: users.username,
        avatarId: users.avatarId,
        createdAt: friendships.createdAt,
      }).from(friendships)
        .innerJoin(users, eq(users.id, friendships.addresseeId))
        .where(and(
          eq(friendships.requesterId, userId),
          eq(friendships.status, 'pending'),
        ));
    },

    async request(requesterId: string, addresseeId: string) {
      if (requesterId === addresseeId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Auto-demande impossible' });
      }

      const [existing] = await db.select()
        .from(friendships)
        .where(or(
          and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, addresseeId)),
          and(eq(friendships.requesterId, addresseeId), eq(friendships.addresseeId, requesterId)),
        ))
        .limit(1);

      if (existing) {
        if (existing.status === 'accepted') throw new TRPCError({ code: 'CONFLICT', message: 'Deja amis' });
        throw new TRPCError({ code: 'CONFLICT', message: 'Demande deja existante' });
      }

      const [row] = await db.insert(friendships).values({
        requesterId,
        addresseeId,
      }).returning();

      return row;
    },

    async accept(friendshipId: string, userId: string) {
      const [fs] = await db.select().from(friendships).where(eq(friendships.id, friendshipId)).limit(1);
      if (!fs) throw new TRPCError({ code: 'NOT_FOUND' });
      if (fs.addresseeId !== userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (fs.status !== 'pending') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Demande non en attente' });

      await db.update(friendships)
        .set({ status: 'accepted', updatedAt: new Date() })
        .where(eq(friendships.id, friendshipId));
    },

    async decline(friendshipId: string, userId: string) {
      const [fs] = await db.select().from(friendships).where(eq(friendships.id, friendshipId)).limit(1);
      if (!fs) throw new TRPCError({ code: 'NOT_FOUND' });
      if (fs.addresseeId !== userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (fs.status !== 'pending') throw new TRPCError({ code: 'BAD_REQUEST' });

      await db.delete(friendships).where(eq(friendships.id, friendshipId));
    },

    async cancel(friendshipId: string, userId: string) {
      const [fs] = await db.select().from(friendships).where(eq(friendships.id, friendshipId)).limit(1);
      if (!fs) throw new TRPCError({ code: 'NOT_FOUND' });
      if (fs.requesterId !== userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (fs.status !== 'pending') throw new TRPCError({ code: 'BAD_REQUEST' });

      await db.delete(friendships).where(eq(friendships.id, friendshipId));
    },

    async remove(friendshipId: string, userId: string) {
      const [fs] = await db.select().from(friendships).where(eq(friendships.id, friendshipId)).limit(1);
      if (!fs) throw new TRPCError({ code: 'NOT_FOUND' });
      if (fs.requesterId !== userId && fs.addresseeId !== userId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      await db.delete(friendships).where(eq(friendships.id, friendshipId));
    },
  };
}
