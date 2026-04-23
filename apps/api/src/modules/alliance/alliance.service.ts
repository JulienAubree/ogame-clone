import { eq, and, ilike, or, sql, asc, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { alliances, allianceMembers, allianceInvitations, allianceApplications, users, rankings } from '@exilium/db';
import type { Database } from '@exilium/db';
import type Redis from 'ioredis';
import type { Blason } from '@exilium/shared';
import { publishNotification } from '../notification/notification.publisher.js';
import type { AllianceLogService } from './alliance-log.service.js';

async function fetchUsername(db: Database, userId: string): Promise<string> {
  const [u] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.username ?? 'inconnu';
}

async function getMembership(db: Database, userId: string) {
  const [membership] = await db
    .select({
      id: allianceMembers.id,
      allianceId: allianceMembers.allianceId,
      role: allianceMembers.role,
    })
    .from(allianceMembers)
    .where(eq(allianceMembers.userId, userId))
    .limit(1);
  return membership ?? null;
}

async function requireRole(db: Database, userId: string, roles: string[]) {
  const membership = await getMembership(db, userId);
  if (!membership) throw new TRPCError({ code: 'FORBIDDEN', message: 'Vous n\'êtes pas dans une alliance.' });
  if (!roles.includes(membership.role)) throw new TRPCError({ code: 'FORBIDDEN', message: 'Vous n\'avez pas la permission.' });
  return membership;
}

export function createAllianceService(db: Database, redis?: Redis, allianceLogService?: AllianceLogService) {
  return {
    async create(userId: string, params: { name: string; tag: string; blason: Blason; motto: string | null }) {
      const existing = await getMembership(db, userId);
      if (existing) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vous êtes déjà dans une alliance.' });

      const { blason, motto } = params;
      const [alliance] = await db.insert(alliances).values({
        name: params.name,
        tag: params.tag.toUpperCase(),
        founderId: userId,
        blasonShape: blason.shape,
        blasonIcon: blason.icon,
        blasonColor1: blason.color1,
        blasonColor2: blason.color2,
        motto,
      }).returning();
      await db.insert(allianceMembers).values({ allianceId: alliance.id, userId, role: 'founder' });
      return alliance;
    },

    async update(userId: string, description: string) {
      const membership = await requireRole(db, userId, ['founder', 'officer']);
      await db.update(alliances).set({ description }).where(eq(alliances.id, membership.allianceId));
      return { success: true };
    },

    async updateBlason(userId: string, params: { blason: Blason; motto: string | null }) {
      const membership = await requireRole(db, userId, ['founder']);
      await db.update(alliances).set({
        blasonShape: params.blason.shape,
        blasonIcon: params.blason.icon,
        blasonColor1: params.blason.color1,
        blasonColor2: params.blason.color2,
        motto: params.motto,
      }).where(eq(alliances.id, membership.allianceId));
      return { success: true };
    },

    async leave(userId: string) {
      const membership = await getMembership(db, userId);
      if (!membership) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vous n\'êtes pas dans une alliance.' });

      const members = await db.select().from(allianceMembers).where(eq(allianceMembers.allianceId, membership.allianceId));

      const memberName = await fetchUsername(db, userId);
      const allianceIdForLog = membership.allianceId;
      const willDissolve = members.length === 1;

      if (willDissolve) {
        await db.delete(alliances).where(eq(alliances.id, membership.allianceId));
        return { dissolved: true };
      }

      if (membership.role === 'founder') {
        const successor = members
          .filter((m) => m.userId !== userId)
          .sort((a, b) => {
            if (a.role === 'officer' && b.role !== 'officer') return -1;
            if (b.role === 'officer' && a.role !== 'officer') return 1;
            return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
          })[0];

        await db.update(allianceMembers).set({ role: 'founder' }).where(eq(allianceMembers.id, successor.id));
        await db.update(alliances).set({ founderId: successor.userId }).where(eq(alliances.id, membership.allianceId));
      }

      await db.delete(allianceMembers).where(eq(allianceMembers.id, membership.id));

      if (allianceLogService) {
        await allianceLogService.add({
          allianceId: allianceIdForLog,
          visibility: 'all',
          payload: { type: 'member.left', memberId: userId, memberName },
        });
      }

      return { dissolved: false };
    },

    async kick(userId: string, targetUserId: string) {
      const membership = await requireRole(db, userId, ['founder', 'officer']);

      const [target] = await db
        .select()
        .from(allianceMembers)
        .where(and(eq(allianceMembers.allianceId, membership.allianceId), eq(allianceMembers.userId, targetUserId)))
        .limit(1);

      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Membre introuvable.' });
      if (target.role === 'founder') throw new TRPCError({ code: 'FORBIDDEN', message: 'Impossible d\'expulser le fondateur.' });
      if (target.role === 'officer' && membership.role !== 'founder') throw new TRPCError({ code: 'FORBIDDEN', message: 'Seul le fondateur peut expulser un officier.' });

      await db.delete(allianceMembers).where(eq(allianceMembers.id, target.id));

      if (allianceLogService) {
        const byName = await fetchUsername(db, userId);
        const memberName = await fetchUsername(db, targetUserId);
        await allianceLogService.add({
          allianceId: membership.allianceId,
          visibility: 'officers',
          payload: {
            type: 'member.kicked',
            memberId: targetUserId,
            memberName,
            byId: userId,
            byName,
          },
        });
      }

      return { success: true };
    },

    async setRole(userId: string, targetUserId: string, role: 'officer' | 'member') {
      await requireRole(db, userId, ['founder']);

      const membership = await getMembership(db, userId);
      const [target] = await db
        .select()
        .from(allianceMembers)
        .where(and(eq(allianceMembers.allianceId, membership!.allianceId), eq(allianceMembers.userId, targetUserId)))
        .limit(1);

      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Membre introuvable.' });
      if (target.userId === userId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vous ne pouvez pas changer votre propre rôle.' });

      const oldRole = target.role;
      const newRole = role;

      await db.update(allianceMembers).set({ role }).where(eq(allianceMembers.id, target.id));

      if (allianceLogService && oldRole !== newRole) {
        const byName = await fetchUsername(db, userId);
        const memberName = await fetchUsername(db, targetUserId);
        if (oldRole === 'member' && newRole === 'officer') {
          await allianceLogService.add({
            allianceId: membership!.allianceId,
            visibility: 'all',
            payload: {
              type: 'member.promoted',
              memberId: targetUserId,
              memberName,
              byId: userId,
              byName,
              fromRole: 'member',
              toRole: 'officer',
            },
          });
        } else if (oldRole === 'officer' && newRole === 'member') {
          await allianceLogService.add({
            allianceId: membership!.allianceId,
            visibility: 'all',
            payload: {
              type: 'member.demoted',
              memberId: targetUserId,
              memberName,
              byId: userId,
              byName,
              fromRole: 'officer',
              toRole: 'member',
            },
          });
        }
      }

      return { success: true };
    },

    async invite(userId: string, targetUsername: string) {
      const membership = await requireRole(db, userId, ['founder', 'officer']);

      const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.username, targetUsername)).limit(1);
      if (!targetUser) throw new TRPCError({ code: 'NOT_FOUND', message: 'Joueur introuvable.' });

      const targetMembership = await getMembership(db, targetUser.id);
      if (targetMembership) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ce joueur est déjà dans une alliance.' });

      const [existingInvite] = await db
        .select()
        .from(allianceInvitations)
        .where(and(
          eq(allianceInvitations.allianceId, membership.allianceId),
          eq(allianceInvitations.invitedUserId, targetUser.id),
          eq(allianceInvitations.status, 'pending'),
        ))
        .limit(1);

      if (existingInvite) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Une invitation est déjà en attente pour ce joueur.' });

      const [alliance] = await db.select({ name: alliances.name, tag: alliances.tag }).from(alliances).where(eq(alliances.id, membership.allianceId)).limit(1);
      await db.insert(allianceInvitations).values({ allianceId: membership.allianceId, invitedUserId: targetUser.id, invitedByUserId: userId });
      if (redis) {
        publishNotification(redis, targetUser.id, {
          type: 'alliance-activity',
          payload: { action: 'invitation', allianceTag: alliance.tag, allianceName: alliance.name },
        });
      }
      return { success: true };
    },

    async respondInvitation(userId: string, invitationId: string, accept: boolean) {
      const [invitation] = await db.select().from(allianceInvitations).where(and(eq(allianceInvitations.id, invitationId), eq(allianceInvitations.invitedUserId, userId))).limit(1);
      if (!invitation || invitation.status !== 'pending') throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation introuvable.' });

      if (accept) {
        const existing = await getMembership(db, userId);
        if (existing) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vous êtes déjà dans une alliance.' });
        await db.insert(allianceMembers).values({ allianceId: invitation.allianceId, userId, role: 'member' });
        const memberName = await fetchUsername(db, userId);
        if (allianceLogService) {
          await allianceLogService.add({
            allianceId: invitation.allianceId,
            visibility: 'all',
            payload: {
              type: 'member.joined',
              memberId: userId,
              memberName,
              via: 'invitation',
            },
          });
        }
      }

      await db.update(allianceInvitations).set({ status: accept ? 'accepted' : 'declined' }).where(eq(allianceInvitations.id, invitationId));
      return { success: true };
    },

    async apply(userId: string, allianceId: string) {
      const existing = await getMembership(db, userId);
      if (existing) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vous êtes déjà dans une alliance.' });

      const [alliance] = await db.select().from(alliances).where(eq(alliances.id, allianceId)).limit(1);
      if (!alliance) throw new TRPCError({ code: 'NOT_FOUND', message: 'Alliance introuvable.' });

      const [existingApp] = await db
        .select()
        .from(allianceApplications)
        .where(and(eq(allianceApplications.allianceId, allianceId), eq(allianceApplications.applicantUserId, userId), eq(allianceApplications.status, 'pending')))
        .limit(1);

      if (existingApp) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vous avez déjà une candidature en attente.' });

      await db.insert(allianceApplications).values({ allianceId, applicantUserId: userId });

      const leaders = await db
        .select({ userId: allianceMembers.userId })
        .from(allianceMembers)
        .where(and(eq(allianceMembers.allianceId, allianceId), or(eq(allianceMembers.role, 'founder'), eq(allianceMembers.role, 'officer'))));

      const [applicant] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
      for (const leader of leaders) {
        if (redis) {
          publishNotification(redis, leader.userId, {
            type: 'alliance-activity',
            payload: { action: 'application', allianceTag: alliance.tag, applicantUsername: applicant.username },
          });
        }
      }

      return { success: true };
    },

    async respondApplication(userId: string, applicationId: string, accept: boolean) {
      await requireRole(db, userId, ['founder', 'officer']);
      const membership = await getMembership(db, userId);

      const [application] = await db.select().from(allianceApplications).where(and(eq(allianceApplications.id, applicationId), eq(allianceApplications.allianceId, membership!.allianceId))).limit(1);
      if (!application || application.status !== 'pending') throw new TRPCError({ code: 'NOT_FOUND', message: 'Candidature introuvable.' });

      if (accept) {
        const existingMembership = await getMembership(db, application.applicantUserId);
        if (existingMembership) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ce joueur est déjà dans une alliance.' });
        await db.insert(allianceMembers).values({ allianceId: membership!.allianceId, userId: application.applicantUserId, role: 'member' });
        const memberName = await fetchUsername(db, application.applicantUserId);
        if (allianceLogService) {
          await allianceLogService.add({
            allianceId: membership!.allianceId,
            visibility: 'all',
            payload: {
              type: 'member.joined',
              memberId: application.applicantUserId,
              memberName,
              via: 'application',
            },
          });
        }
      }

      await db.update(allianceApplications).set({ status: accept ? 'accepted' : 'declined' }).where(eq(allianceApplications.id, applicationId));
      return { success: true };
    },

    async get(allianceId: string) {
      const [alliance] = await db.select().from(alliances).where(eq(alliances.id, allianceId)).limit(1);
      if (!alliance) throw new TRPCError({ code: 'NOT_FOUND', message: 'Alliance introuvable.' });

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(allianceMembers)
        .where(eq(allianceMembers.allianceId, allianceId));

      return { ...alliance, memberCount: countResult.count };
    },

    async myAlliance(userId: string) {
      const membership = await getMembership(db, userId);
      if (!membership) return null;

      const [alliance] = await db.select().from(alliances).where(eq(alliances.id, membership.allianceId)).limit(1);
      const members = await db
        .select({
          userId: allianceMembers.userId,
          username: users.username,
          role: allianceMembers.role,
          joinedAt: allianceMembers.joinedAt,
        })
        .from(allianceMembers)
        .innerJoin(users, eq(users.id, allianceMembers.userId))
        .where(eq(allianceMembers.allianceId, membership.allianceId))
        .orderBy(asc(allianceMembers.joinedAt));

      return { ...alliance, myRole: membership.role, members };
    },

    async myInvitations(userId: string) {
      return db
        .select({
          id: allianceInvitations.id,
          allianceName: alliances.name,
          allianceTag: alliances.tag,
          invitedByUsername: users.username,
          createdAt: allianceInvitations.createdAt,
        })
        .from(allianceInvitations)
        .innerJoin(alliances, eq(alliances.id, allianceInvitations.allianceId))
        .innerJoin(users, eq(users.id, allianceInvitations.invitedByUserId))
        .where(and(eq(allianceInvitations.invitedUserId, userId), eq(allianceInvitations.status, 'pending')));
    },

    async applications(userId: string) {
      const membership = await requireRole(db, userId, ['founder', 'officer']);

      return db
        .select({
          id: allianceApplications.id,
          applicantUsername: users.username,
          createdAt: allianceApplications.createdAt,
        })
        .from(allianceApplications)
        .innerJoin(users, eq(users.id, allianceApplications.applicantUserId))
        .where(and(eq(allianceApplications.allianceId, membership.allianceId), eq(allianceApplications.status, 'pending')));
    },

    async ranking(page: number = 1) {
      const limit = 20;
      const offset = (page - 1) * limit;

      const rows = await db
        .select({
          allianceId: alliances.id,
          name: alliances.name,
          tag: alliances.tag,
          blasonShape: alliances.blasonShape,
          blasonIcon: alliances.blasonIcon,
          blasonColor1: alliances.blasonColor1,
          blasonColor2: alliances.blasonColor2,
          memberCount: sql<number>`count(${allianceMembers.userId})::int`,
          totalPoints: sql<number>`coalesce(sum(${rankings.totalPoints}), 0)::int`,
        })
        .from(alliances)
        .innerJoin(allianceMembers, eq(allianceMembers.allianceId, alliances.id))
        .leftJoin(rankings, eq(rankings.userId, allianceMembers.userId))
        .groupBy(alliances.id, alliances.name, alliances.tag, alliances.blasonShape, alliances.blasonIcon, alliances.blasonColor1, alliances.blasonColor2)
        .orderBy(desc(sql`coalesce(sum(${rankings.totalPoints}), 0)`))
        .limit(limit)
        .offset(offset);

      return rows.map((row) => ({
        allianceId: row.allianceId,
        name: row.name,
        tag: row.tag,
        memberCount: row.memberCount,
        totalPoints: row.totalPoints,
        blason: {
          shape: row.blasonShape as Blason['shape'],
          icon: row.blasonIcon as Blason['icon'],
          color1: row.blasonColor1,
          color2: row.blasonColor2,
        } satisfies Blason,
      }));
    },

    async search(query: string) {
      return db
        .select({
          id: alliances.id,
          name: alliances.name,
          tag: alliances.tag,
          memberCount: sql<number>`count(${allianceMembers.userId})::int`,
        })
        .from(alliances)
        .innerJoin(allianceMembers, eq(allianceMembers.allianceId, alliances.id))
        .where(or(ilike(alliances.name, `%${query}%`), ilike(alliances.tag, `%${query}%`)))
        .groupBy(alliances.id, alliances.name, alliances.tag)
        .limit(20);
    },
  };
}
