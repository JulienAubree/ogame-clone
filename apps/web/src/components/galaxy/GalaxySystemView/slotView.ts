/**
 * Slot view normalizer.
 *
 * Pure function — no React, no DOM. Takes one raw entry from
 * `galaxy.service.ts`'s `slots` array (which can be a PlanetSlot, BeltSlot,
 * EmptySlot, or `null`) and narrows it into a discriminated union the UI can
 * render without re-checking API shapes at every call site.
 *
 * Discovery rule: only EmptySlot carries `isDiscovered`. PlanetSlots are
 * always "known". Undiscovered empty positions collapse into the generic
 * `undiscovered` kind (same visual as a defensive `null`).
 */

import type { Blason } from '@exilium/shared';

export type Relation = 'mine' | 'ally' | 'enemy';

export interface BiomeView {
  id: string;
  name: string;
  rarity: string;
  effects: unknown;
}

export type SlotView =
  | {
      kind: 'planet';
      position: number;
      planetClassId: string | null;
      planetImageIndex: number | null;
      relation: Relation;
      planetId: string;
      planetName: string;
      userId: string;
      username: string | null;
      allianceId: string | null;
      allianceTag: string | null;
      ownerAllianceBlason: Blason | null;
      biomes: BiomeView[];
      debris?: { minerai: number; silicium: number };
      status: string;
    }
  | {
      kind: 'empty-discovered';
      position: number;
      planetClassId: string;
      biomes: BiomeView[];
      totalBiomeCount: number;
      undiscoveredCount: number;
    }
  | { kind: 'undiscovered'; position: number }
  | { kind: 'belt'; position: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asBiomes(value: unknown): BiomeView[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((b) => ({
    id: String(b.id ?? ''),
    name: String(b.name ?? ''),
    rarity: String(b.rarity ?? ''),
    effects: b.effects,
  }));
}

export function toSlotView(
  rawSlot: unknown,
  index: number,
  ctx: { currentUserId: string | null; myAllianceId: string | null },
): SlotView {
  const position = index + 1;

  // Defensive: treat null as undiscovered.
  if (rawSlot == null || !isRecord(rawSlot)) {
    return { kind: 'undiscovered', position };
  }

  const slotPosition = typeof rawSlot.position === 'number' ? rawSlot.position : position;

  // Belt
  if (rawSlot.type === 'belt') {
    return { kind: 'belt', position: slotPosition };
  }

  // Empty
  if (rawSlot.type === 'empty') {
    const isDiscovered = rawSlot.isDiscovered === true;
    const planetClassId =
      typeof rawSlot.planetClassId === 'string' ? rawSlot.planetClassId : null;

    if (isDiscovered && planetClassId) {
      return {
        kind: 'empty-discovered',
        position: slotPosition,
        planetClassId,
        biomes: asBiomes(rawSlot.biomes),
        totalBiomeCount:
          typeof rawSlot.totalBiomeCount === 'number' ? rawSlot.totalBiomeCount : 0,
        undiscoveredCount:
          typeof rawSlot.undiscoveredCount === 'number' ? rawSlot.undiscoveredCount : 0,
      };
    }
    return { kind: 'undiscovered', position: slotPosition };
  }

  // Otherwise: PlanetSlot
  const planetId =
    typeof rawSlot.planetId === 'string' && rawSlot.planetId.length > 0
      ? rawSlot.planetId
      : null;
  const userId =
    typeof rawSlot.userId === 'string' && rawSlot.userId.length > 0
      ? rawSlot.userId
      : null;
  if (!planetId || !userId) {
    return { kind: 'undiscovered', position: slotPosition };
  }

  const allianceId = typeof rawSlot.allianceId === 'string' ? rawSlot.allianceId : null;

  const planetImageIndex =
    typeof rawSlot.planetImageIndex === 'number' ? rawSlot.planetImageIndex : null;

  let relation: Relation = 'enemy';
  if (ctx.currentUserId && userId === ctx.currentUserId) {
    relation = 'mine';
  } else if (allianceId && ctx.myAllianceId && allianceId === ctx.myAllianceId) {
    relation = 'ally';
  }

  const debrisRaw = rawSlot.debris;
  const debris =
    isRecord(debrisRaw) &&
    typeof debrisRaw.minerai === 'number' &&
    typeof debrisRaw.silicium === 'number'
      ? { minerai: debrisRaw.minerai, silicium: debrisRaw.silicium }
      : undefined;

  const blasonShape = typeof rawSlot.blasonShape === 'string' ? rawSlot.blasonShape : null;
  const blasonIcon = typeof rawSlot.blasonIcon === 'string' ? rawSlot.blasonIcon : null;
  const blasonColor1 = typeof rawSlot.blasonColor1 === 'string' ? rawSlot.blasonColor1 : null;
  const blasonColor2 = typeof rawSlot.blasonColor2 === 'string' ? rawSlot.blasonColor2 : null;
  const ownerAllianceBlason: Blason | null =
    blasonShape && blasonIcon && blasonColor1 && blasonColor2
      ? {
          shape: blasonShape as Blason['shape'],
          icon: blasonIcon as Blason['icon'],
          color1: blasonColor1,
          color2: blasonColor2,
        }
      : null;

  return {
    kind: 'planet',
    position: slotPosition,
    planetId,
    planetName: typeof rawSlot.planetName === 'string' ? rawSlot.planetName : '',
    planetClassId:
      typeof rawSlot.planetClassId === 'string' ? rawSlot.planetClassId : null,
    planetImageIndex,
    relation,
    userId,
    username: typeof rawSlot.username === 'string' ? rawSlot.username : null,
    allianceId,
    allianceTag: typeof rawSlot.allianceTag === 'string' ? rawSlot.allianceTag : null,
    ownerAllianceBlason,
    biomes: asBiomes(rawSlot.biomes),
    debris,
    status: typeof rawSlot.status === 'string' ? rawSlot.status : 'active',
  };
}

/**
 * Identity today, but gives the call site a semantic name
 * (`<PlanetDot aura={relationToAura(view.relation)} />`) and a single place
 * to evolve if relations diverge from aura colors later (e.g. neutral/pirate).
 */
export function relationToAura(relation: Relation): 'mine' | 'ally' | 'enemy' {
  return relation;
}
