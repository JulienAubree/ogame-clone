import { ilike, ne, and, or, eq, count } from 'drizzle-orm';
import { users, planets, rankings, allianceMembers, alliances, friendships } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { readdirSync } from 'fs';
import { join } from 'path';
import { TRPCError } from '@trpc/server';

export function createUserService(db: Database, assetsDir: string) {
  const service = {
    async searchUsers(currentUserId: string, query: string) {
      const escaped = query.replace(/[%_]/g, '\\$&');
      return db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(and(
          ilike(users.username, `%${escaped}%`),
          ne(users.id, currentUserId),
        ))
        .limit(10);
    },

    async getMyProfile(userId: string) {
      const [user] = await db.select({
        id: users.id,
        username: users.username,
        bio: users.bio,
        avatarId: users.avatarId,
        playstyle: users.playstyle,
        seekingAlliance: users.seekingAlliance,
        theme: users.theme,
        profileVisibility: users.profileVisibility,
        createdAt: users.createdAt,
      }).from(users).where(eq(users.id, userId)).limit(1);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });

      const stats = await service.getPlayerStats(userId);
      return { ...user, ...stats };
    },

    async getProfile(userId: string, currentUserId: string) {
      const [user] = await db.select({
        id: users.id,
        username: users.username,
        bio: users.bio,
        avatarId: users.avatarId,
        playstyle: users.playstyle,
        seekingAlliance: users.seekingAlliance,
        profileVisibility: users.profileVisibility,
        createdAt: users.createdAt,
      }).from(users).where(eq(users.id, userId)).limit(1);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });

      const visibility = (user.profileVisibility ?? { bio: true, playstyle: true, stats: true }) as Record<string, boolean>;
      const stats = await service.getPlayerStats(userId);
      const friendship = await service.getFriendshipStatus(userId, currentUserId);

      return {
        id: user.id,
        username: user.username,
        avatarId: user.avatarId,
        bio: (visibility.bio !== false) ? user.bio : null,
        playstyle: (visibility.playstyle !== false) ? user.playstyle : null,
        seekingAlliance: (visibility.playstyle !== false) ? user.seekingAlliance : null, // grouped with playstyle visibility
        stats: (visibility.stats !== false) ? stats : null,
        friendshipStatus: friendship.status,
        friendshipId: friendship.friendshipId,
      };
    },

    async updateProfile(userId: string, data: {
      bio?: string | null;
      avatarId?: string | null;
      playstyle?: 'miner' | 'warrior' | 'explorer' | null;
      seekingAlliance?: boolean;
      theme?: string;
      profileVisibility?: Record<string, boolean>;
    }) {
      if (data.avatarId !== undefined && data.avatarId !== null) {
        const avatars = service.listAvatars();
        if (!avatars.includes(data.avatarId)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Avatar invalide' });
        }
      }
      if (data.bio !== undefined && data.bio !== null && data.bio.length > 500) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Bio trop longue (max 500)' });
      }

      const update: Record<string, unknown> = {};
      if (data.bio !== undefined) update.bio = data.bio;
      if (data.avatarId !== undefined) update.avatarId = data.avatarId;
      if (data.playstyle !== undefined) update.playstyle = data.playstyle;
      if (data.seekingAlliance !== undefined) update.seekingAlliance = data.seekingAlliance;
      if (data.theme !== undefined) update.theme = data.theme;
      if (data.profileVisibility !== undefined) update.profileVisibility = data.profileVisibility;

      if (Object.keys(update).length > 0) {
        await db.update(users).set(update).where(eq(users.id, userId));
      }
    },

    listAvatars(): string[] {
      try {
        const dir = join(assetsDir, 'avatars');
        return readdirSync(dir)
          .filter(f => f.endsWith('.webp'))
          .map(f => f.replace('.webp', ''));
      } catch {
        return [];
      }
    },

    async getPlayerStats(userId: string) {
      const [ranking] = await db.select({
        rank: rankings.rank,
        totalPoints: rankings.totalPoints,
      }).from(rankings).where(eq(rankings.userId, userId)).limit(1);

      const [planetCount] = await db.select({
        count: count(),
      }).from(planets).where(eq(planets.userId, userId));

      const [membership] = await db.select({
        allianceName: alliances.name,
      }).from(allianceMembers)
        .innerJoin(alliances, eq(allianceMembers.allianceId, alliances.id))
        .where(eq(allianceMembers.userId, userId))
        .limit(1);

      return {
        rank: ranking?.rank ?? null,
        totalPoints: ranking?.totalPoints ?? 0,
        planetCount: planetCount?.count ?? 0,
        allianceName: membership?.allianceName ?? null,
      };
    },

    async getFriendshipStatus(targetUserId: string, currentUserId: string): Promise<{ status: 'none' | 'pending_sent' | 'pending_received' | 'friends'; friendshipId: string | null }> {
      const [fs] = await db.select()
        .from(friendships)
        .where(or(
          and(eq(friendships.requesterId, currentUserId), eq(friendships.addresseeId, targetUserId)),
          and(eq(friendships.requesterId, targetUserId), eq(friendships.addresseeId, currentUserId)),
        ))
        .limit(1);

      if (!fs) return { status: 'none', friendshipId: null };
      if (fs.status === 'accepted') return { status: 'friends', friendshipId: fs.id };
      if (fs.requesterId === currentUserId) return { status: 'pending_sent', friendshipId: fs.id };
      return { status: 'pending_received', friendshipId: fs.id };
    },
  };

  return service;
}
