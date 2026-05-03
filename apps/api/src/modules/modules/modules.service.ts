import { and, eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import {
  flagships, flagshipModuleInventory, moduleDefinitions,
} from '@exilium/db';
import type { Database } from '@exilium/db';
import { parseLoadout, getMaxCharges, type ModuleDefinitionLite } from '@exilium/game-engine';
import {
  moduleDefinitionSchema, hullSlotSchema,
  type ModuleDefinition, type ModuleLoadoutDb,
} from './modules.types.js';

type SlotType = 'epic' | 'rare' | 'common';

/** Fixed lengths enforced by hullSlotSchema. Kept here so the tolerant pad-on-read
 *  helper below stays in sync if we ever expand a slot. */
const RARE_LEN = 3;
const COMMON_LEN = 5;

/** Pad legacy variable-length arrays with explicit `null` placeholders so they
 *  satisfy the new fixed-length schema. Tolerates both shorter rows (legacy
 *  Task 8 starter pack) and longer-than-expected rows (defensive — truncated
 *  to the max). */
function padToLen<T>(arr: readonly (T | null | undefined)[] | undefined, len: number): (T | null)[] {
  const out: (T | null)[] = Array.from({ length: len }, () => null);
  if (!arr) return out;
  for (let i = 0; i < Math.min(arr.length, len); i++) {
    const v = arr[i];
    out[i] = v === undefined ? null : v;
  }
  return out;
}

/** Pad-on-read coercion. Read raw JSONB → produce a schema-valid loadout. */
function coerceLoadout(raw: unknown): ModuleLoadoutDb {
  if (!raw || typeof raw !== 'object') return {};
  const out: ModuleLoadoutDb = {};
  for (const [hullId, slot] of Object.entries(raw as Record<string, unknown>)) {
    if (!slot || typeof slot !== 'object') continue;
    const s = slot as { epic?: string | null; rare?: unknown; common?: unknown };
    out[hullId as keyof ModuleLoadoutDb] = {
      epic: typeof s.epic === 'string' ? s.epic : s.epic === null ? null : null,
      rare: padToLen(Array.isArray(s.rare) ? (s.rare as (string | null | undefined)[]) : [], RARE_LEN),
      common: padToLen(Array.isArray(s.common) ? (s.common as (string | null | undefined)[]) : [], COMMON_LEN),
    };
  }
  return out;
}

export function createModulesService(db: Database) {
  /** Fetch all enabled modules for use as the engine pool. Pass a transaction
   *  executor (`tx`) when called inside an equip/unequip flow so the pool is
   *  read against the same transactional snapshot — prevents races with
   *  concurrent admin disables. */
  async function getPool(executor: Database = db): Promise<ModuleDefinitionLite[]> {
    const rows = await executor.select().from(moduleDefinitions).where(eq(moduleDefinitions.enabled, true));
    return rows.map((r) => ({
      id: r.id,
      hullId: r.hullId,
      rarity: r.rarity as 'common' | 'rare' | 'epic',
      enabled: r.enabled,
      effect: r.effect as ModuleDefinitionLite['effect'],
    }));
  }

  return {
    /** Public: list of all enabled modules (for inventory display, lookups). */
    async listAll(): Promise<ModuleDefinition[]> {
      const rows = await db.select().from(moduleDefinitions).orderBy(moduleDefinitions.hullId, moduleDefinitions.rarity, moduleDefinitions.name);
      // Tolerant parse: skip rows that no longer satisfy the current Zod
      // schema (e.g. legacy `last_round` trigger removed from the engine).
      // Without this, a single malformed row makes the whole admin /modules
      // page 500 — the rest of the catalog should still be reachable.
      const out: ModuleDefinition[] = [];
      for (const r of rows) {
        const parsed = moduleDefinitionSchema.safeParse(r);
        if (parsed.success) {
          out.push(parsed.data);
        } else {
          console.warn(`[modules.listAll] skipping malformed row id=${(r as { id?: string }).id ?? '?'}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
        }
      }
      return out;
    },

    /** Returns the player's inventory grouped by hull/rarity. */
    async getInventory(userId: string) {
      const [flagship] = await db.select({ id: flagships.id }).from(flagships).where(eq(flagships.userId, userId)).limit(1);
      if (!flagship) return { items: [] };
      const rows = await db.select({
        moduleId: flagshipModuleInventory.moduleId,
        count: flagshipModuleInventory.count,
        hullId: moduleDefinitions.hullId,
        rarity: moduleDefinitions.rarity,
        name: moduleDefinitions.name,
        description: moduleDefinitions.description,
        image: moduleDefinitions.image,
        enabled: moduleDefinitions.enabled,
        effect: moduleDefinitions.effect,
      })
        .from(flagshipModuleInventory)
        .innerJoin(moduleDefinitions, eq(moduleDefinitions.id, flagshipModuleInventory.moduleId))
        .where(eq(flagshipModuleInventory.flagshipId, flagship.id));
      return { items: rows };
    },

    /** Returns the loadout for a given hull. */
    async getLoadout(userId: string, hullId: string) {
      const [flagship] = await db.select({ loadout: flagships.moduleLoadout, current: flagships.epicChargesCurrent, max: flagships.epicChargesMax })
        .from(flagships).where(eq(flagships.userId, userId)).limit(1);
      if (!flagship) throw new TRPCError({ code: 'NOT_FOUND', message: 'Flagship introuvable' });
      // Pad-on-read: legacy rows may have variable-length arrays. Coerce to
      // fixed length with explicit nulls so the schema validates and the
      // front receives a stable shape.
      const loadout = coerceLoadout(flagship.loadout);
      const empty = { epic: null, rare: padToLen([], RARE_LEN), common: padToLen([], COMMON_LEN) } as const;
      return {
        hullId,
        slot: loadout[hullId as keyof typeof loadout] ?? empty,
        epicChargesCurrent: flagship.current,
        epicChargesMax: flagship.max,
      };
    },

    /**
     * Equip a module in a slot. Validates rarity, hull, ownership,
     * not-already-equipped, not-in-mission. Atomic via transaction.
     */
    async equip(userId: string, input: { hullId: string; slotType: SlotType; slotIndex: number; moduleId: string }) {
      return await db.transaction(async (tx) => {
        const [flagship] = await tx.select().from(flagships).where(eq(flagships.userId, userId)).for('update').limit(1);
        if (!flagship) throw new TRPCError({ code: 'NOT_FOUND', message: 'Flagship introuvable' });
        if (flagship.status === 'in_mission') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Loadout verrouillé : flagship en mission' });
        }

        const [moduleDef] = await tx.select().from(moduleDefinitions).where(eq(moduleDefinitions.id, input.moduleId)).limit(1);
        if (!moduleDef || !moduleDef.enabled) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Module "${input.moduleId}" introuvable ou désactivé` });
        }
        if (moduleDef.hullId !== input.hullId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Module incompatible avec la coque ${input.hullId}` });
        }
        if (moduleDef.rarity !== input.slotType) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Module rareté ${moduleDef.rarity} ne va pas dans slot ${input.slotType}` });
        }

        const [inv] = await tx.select({ count: flagshipModuleInventory.count }).from(flagshipModuleInventory)
          .where(and(
            eq(flagshipModuleInventory.flagshipId, flagship.id),
            eq(flagshipModuleInventory.moduleId, input.moduleId),
          )).limit(1);
        if (!inv || inv.count < 1) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Module non possédé' });
        }

        // Pad-on-read: legacy rows may have variable-length arrays without
        // null placeholders. Always normalize first so subsequent index ops
        // are safe (no sparse-array trap on JSON.stringify).
        const loadout = coerceLoadout(flagship.moduleLoadout);
        const slot = loadout[input.hullId as keyof ModuleLoadoutDb] ?? {
          epic: null,
          rare: padToLen([], RARE_LEN),
          common: padToLen([], COMMON_LEN),
        };

        // Reject if already equipped in another slot of same hull (no double-equip even with duplicates).
        // Filter out nulls so they don't accidentally count as "equipped".
        const allEquipped = [
          ...(slot.epic ? [slot.epic] : []),
          ...slot.rare.filter((x): x is string => typeof x === 'string'),
          ...slot.common.filter((x): x is string => typeof x === 'string'),
        ];
        if (allEquipped.includes(input.moduleId)) {
          // Allow if it's THIS exact slot being overridden (same module already there)
          const existing = input.slotType === 'epic'
            ? slot.epic
            : input.slotType === 'rare'
              ? slot.rare[input.slotIndex]
              : slot.common[input.slotIndex];
          if (existing !== input.moduleId) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Module déjà équipé dans un autre slot' });
          }
        }

        // Apply slot mutation. Always copy from the (already-padded) slot so
        // assigning at an index never creates a sparse hole.
        const newSlot = { ...slot, rare: [...slot.rare], common: [...slot.common] };
        if (input.slotType === 'epic') {
          newSlot.epic = input.moduleId;
        } else if (input.slotType === 'rare') {
          if (input.slotIndex < 0 || input.slotIndex > RARE_LEN - 1) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: `slotIndex doit être 0..${RARE_LEN - 1} pour rare` });
          }
          newSlot.rare[input.slotIndex] = input.moduleId;
        } else {
          if (input.slotIndex < 0 || input.slotIndex > COMMON_LEN - 1) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: `slotIndex doit être 0..${COMMON_LEN - 1} pour common` });
          }
          newSlot.common[input.slotIndex] = input.moduleId;
        }

        const newLoadout = { ...loadout, [input.hullId]: newSlot };

        // Recompute epic_charges_max from new equipped modules
        const pool = await getPool(tx as unknown as Database);
        const equipped = parseLoadout(newLoadout, input.hullId, pool).equipped;
        const newMax = getMaxCharges(equipped);

        await tx.update(flagships).set({
          moduleLoadout: newLoadout,
          epicChargesMax: newMax,
        }).where(eq(flagships.id, flagship.id));

        return { loadout: newLoadout, epicChargesMax: newMax };
      });
    },

    /** Remove a module from a slot. */
    async unequip(userId: string, input: { hullId: string; slotType: SlotType; slotIndex: number }) {
      return await db.transaction(async (tx) => {
        const [flagship] = await tx.select().from(flagships).where(eq(flagships.userId, userId)).for('update').limit(1);
        if (!flagship) throw new TRPCError({ code: 'NOT_FOUND', message: 'Flagship introuvable' });
        if (flagship.status === 'in_mission') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Loadout verrouillé : flagship en mission' });
        }

        // Pad-on-read: legacy rows may have variable-length arrays.
        const loadout = coerceLoadout(flagship.moduleLoadout);
        const slot = loadout[input.hullId as keyof ModuleLoadoutDb] ?? {
          epic: null,
          rare: padToLen([], RARE_LEN),
          common: padToLen([], COMMON_LEN),
        };
        // Replace `delete arr[i]` (which creates a sparse array) with explicit
        // `arr[i] = null` so JSON.stringify doesn't emit `null` placeholders
        // that the schema then rejects.
        const newSlot = { ...slot, rare: [...slot.rare], common: [...slot.common] };
        if (input.slotType === 'epic') {
          newSlot.epic = null;
        } else if (input.slotType === 'rare') {
          if (input.slotIndex < 0 || input.slotIndex > RARE_LEN - 1) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: `slotIndex doit être 0..${RARE_LEN - 1} pour rare` });
          }
          newSlot.rare[input.slotIndex] = null;
        } else {
          if (input.slotIndex < 0 || input.slotIndex > COMMON_LEN - 1) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: `slotIndex doit être 0..${COMMON_LEN - 1} pour common` });
          }
          newSlot.common[input.slotIndex] = null;
        }

        const newLoadout = { ...loadout, [input.hullId]: newSlot };
        const pool = await getPool(tx as unknown as Database);
        const equipped = parseLoadout(newLoadout, input.hullId, pool).equipped;
        const newMax = getMaxCharges(equipped);

        await tx.update(flagships).set({
          moduleLoadout: newLoadout,
          epicChargesMax: newMax,
        }).where(eq(flagships.id, flagship.id));

        return { loadout: newLoadout, epicChargesMax: newMax };
      });
    },

    /**
     * Roll a per-combat module drop for a flagship after a combat win.
     * Returns the granted module id (with hull side info) or null.
     * Caller is responsible for inserting into flagship_module_inventory.
     *
     * Pass `executor` (a tx) when called inside an anomaly transaction so the
     * pool is read against the same snapshot — prevents racing with an admin
     * disable mid-combat.
     */
    async rollPerCombatDrop(args: { flagshipHullId: string; rng?: () => number; executor?: Database }): Promise<string | null> {
      const rng = args.rng ?? Math.random;
      const roll = rng();
      const pool = await getPool(args.executor ?? db);
      const otherHulls = ['combat', 'scientific', 'industrial'].filter((h) => h !== args.flagshipHullId);

      if (roll < 0.30) {
        // 30% : commun de la coque du flagship
        const candidates = pool.filter((m) => m.hullId === args.flagshipHullId && m.rarity === 'common');
        if (candidates.length === 0) return null;
        return candidates[Math.floor(rng() * candidates.length)].id;
      } else if (roll < 0.35) {
        // 5% : commun d'une autre coque (uniforme parmi les 2 autres)
        const otherHull = otherHulls[Math.floor(rng() * otherHulls.length)];
        const candidates = pool.filter((m) => m.hullId === otherHull && m.rarity === 'common');
        if (candidates.length === 0) return null;
        return candidates[Math.floor(rng() * candidates.length)].id;
      }
      // 65% : rien
      return null;
    },

    /**
     * Roll the per-run final drop based on depth reached. Returns array of
     * granted module ids (could be empty). Caller inserts to inventory.
     *
     * Pass `executor` (a tx) when called inside an anomaly transaction so the
     * pool is read against the same snapshot.
     */
    async rollPerRunFinalDrop(args: { flagshipHullId: string; depth: number; rng?: () => number; executor?: Database }): Promise<string[]> {
      const rng = args.rng ?? Math.random;
      const pool = await getPool(args.executor ?? db);
      const own = (rarity: 'common' | 'rare' | 'epic') => pool.filter((m) => m.hullId === args.flagshipHullId && m.rarity === rarity);

      const out: string[] = [];
      const drawOne = (rarity: 'common' | 'rare' | 'epic') => {
        const cands = own(rarity);
        if (cands.length > 0) out.push(cands[Math.floor(rng() * cands.length)].id);
      };

      if (args.depth >= 13) {
        drawOne('rare');
        drawOne('epic');
      } else if (args.depth >= 8) {
        drawOne('rare');
        if (rng() < 0.30) drawOne('epic');
      } else if (args.depth >= 4) {
        drawOne('rare');
      } else if (args.depth >= 1) {
        drawOne('common');
      }
      return out;
    },

    /**
     * Insert (or count++) a module in a flagship's inventory.
     *
     * Pass `executor` (a tx) when called inside a transaction so the write
     * commits/rolls back atomically with the surrounding anomaly mutation.
     * Without it, a tx rollback (e.g. CONFLICT WHERE-guard) would leave the
     * inventory write committed → duplicate-drop exploit.
     */
    async grantModule(flagshipId: string, moduleId: string, executor: Database = db) {
      await executor.insert(flagshipModuleInventory).values({
        flagshipId, moduleId, count: 1,
      }).onConflictDoUpdate({
        target: [flagshipModuleInventory.flagshipId, flagshipModuleInventory.moduleId],
        set: { count: sql`${flagshipModuleInventory.count} + 1` },
      });
    },

    /**
     * Admin: upsert a module definition. Validates Zod, replaces enabled state.
     */
    async adminUpsert(input: ModuleDefinition) {
      const parsed = moduleDefinitionSchema.parse(input);
      await db.insert(moduleDefinitions).values(parsed).onConflictDoUpdate({
        target: moduleDefinitions.id,
        set: {
          hullId: parsed.hullId,
          rarity: parsed.rarity,
          name: parsed.name,
          description: parsed.description,
          image: parsed.image,
          enabled: parsed.enabled,
          effect: parsed.effect,
        },
      });
      return parsed;
    },

    async adminDelete(id: string) {
      await db.delete(moduleDefinitions).where(eq(moduleDefinitions.id, id));
    },

    /** Internal helper for tests + scripts. */
    _getPool: getPool,
    _SLOT_TYPES: ['epic', 'rare', 'common'] as const,
  };
}

export type ModulesService = ReturnType<typeof createModulesService>;
export { hullSlotSchema };
