import { eq, and, ne, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { announcements, changelogs } from '@exilium/db';
import type { Database } from '@exilium/db';

type Variant = 'info' | 'warning' | 'success';

export function createAnnouncementService(db: Database) {
  return {
    async getActive() {
      const [row] = await db
        .select({
          id: announcements.id,
          message: announcements.message,
          variant: announcements.variant,
          changelogId: announcements.changelogId,
          createdAt: announcements.createdAt,
          updatedAt: announcements.updatedAt,
        })
        .from(announcements)
        .where(eq(announcements.active, true))
        .limit(1);

      return row ?? null;
    },

    async adminList() {
      return db
        .select()
        .from(announcements)
        .orderBy(desc(announcements.createdAt));
    },

    async adminCreate(input: {
      message: string;
      variant: Variant;
      changelogId?: string;
      activate?: boolean;
    }) {
      if (input.changelogId) {
        const [changelog] = await db
          .select({ id: changelogs.id })
          .from(changelogs)
          .where(eq(changelogs.id, input.changelogId))
          .limit(1);

        if (!changelog) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Changelog introuvable' });
        }
      }

      const activate = !!input.activate;

      return db.transaction(async (tx) => {
        if (activate) {
          await tx
            .update(announcements)
            .set({ active: false, updatedAt: new Date() })
            .where(eq(announcements.active, true));
        }

        const [inserted] = await tx
          .insert(announcements)
          .values({
            message: input.message,
            variant: input.variant,
            changelogId: input.changelogId ?? null,
            active: activate,
          })
          .returning();

        return inserted;
      });
    },

    async adminUpdate(
      id: string,
      input: {
        message?: string;
        variant?: Variant;
        changelogId?: string | null;
      },
    ) {
      const [existing] = await db
        .select({ id: announcements.id })
        .from(announcements)
        .where(eq(announcements.id, id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Annonce introuvable' });
      }

      if (typeof input.changelogId === 'string') {
        const [changelog] = await db
          .select({ id: changelogs.id })
          .from(changelogs)
          .where(eq(changelogs.id, input.changelogId))
          .limit(1);

        if (!changelog) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Changelog introuvable' });
        }
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.message !== undefined) updates.message = input.message;
      if (input.variant !== undefined) updates.variant = input.variant;
      if (input.changelogId !== undefined) updates.changelogId = input.changelogId;

      const [updated] = await db
        .update(announcements)
        .set(updates)
        .where(eq(announcements.id, id))
        .returning();

      return updated;
    },

    async adminSetActive(id: string, active: boolean) {
      const [existing] = await db
        .select({ id: announcements.id })
        .from(announcements)
        .where(eq(announcements.id, id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Annonce introuvable' });
      }

      if (active) {
        return db.transaction(async (tx) => {
          await tx
            .update(announcements)
            .set({ active: false, updatedAt: new Date() })
            .where(and(eq(announcements.active, true), ne(announcements.id, id)));

          const [updated] = await tx
            .update(announcements)
            .set({ active: true, updatedAt: new Date() })
            .where(eq(announcements.id, id))
            .returning();

          return updated;
        });
      }

      const [updated] = await db
        .update(announcements)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(announcements.id, id))
        .returning();

      return updated;
    },

    async adminDelete(id: string) {
      await db.delete(announcements).where(eq(announcements.id, id));
      return { success: true };
    },
  };
}
