import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { flagships, flagshipCooldowns } from '@exilium/db';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { SpyHandler } from './spy.handler.js';

const SCAN_COOLDOWN_ID = 'scan_mission';

export class ScanHandler implements MissionHandler {
  private spyHandler = new SpyHandler();

  async validateFleet(input: SendFleetInput, _config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
    const userId = input.userId!;

    // Verify flagship is in fleet
    if (!input.ships['flagship'] || input.ships['flagship'] <= 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'La mission de scan necessite le vaisseau amiral' });
    }

    // Verify hull has scan ability
    const [flagship] = await ctx.db.select({ id: flagships.id, hullId: flagships.hullId, status: flagships.status })
      .from(flagships).where(eq(flagships.userId, userId)).limit(1);
    if (!flagship) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vaisseau amiral introuvable' });

    const fullConfig = await ctx.gameConfigService.getFullConfig();
    const hullConfig = flagship.hullId ? fullConfig.hulls[flagship.hullId] : null;
    const scanAbility = (hullConfig?.abilities ?? []).find((a: any) => a.id === 'scan_mission' && a.type === 'active');
    if (!scanAbility) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Votre coque ne dispose pas de la capacite de scan' });
    }

    // Check cooldown
    const [cooldown] = await ctx.db.select().from(flagshipCooldowns)
      .where(and(
        eq(flagshipCooldowns.flagshipId, flagship.id),
        eq(flagshipCooldowns.talentId, SCAN_COOLDOWN_ID),
      )).limit(1);

    if (cooldown && cooldown.cooldownEnds && new Date() < cooldown.cooldownEnds) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Scan en cooldown' });
    }

    // Start cooldown from ability config
    const cooldownSeconds = (scanAbility as any).cooldownSeconds ?? 1800;
    const now = new Date();
    const cooldownEnds = new Date(now.getTime() + cooldownSeconds * 1000);

    await ctx.db.insert(flagshipCooldowns).values({
      flagshipId: flagship.id,
      talentId: SCAN_COOLDOWN_ID,
      activatedAt: now,
      expiresAt: now,
      cooldownEnds,
    }).onConflictDoUpdate({
      target: [flagshipCooldowns.flagshipId, flagshipCooldowns.talentId],
      set: { activatedAt: now, expiresAt: now, cooldownEnds },
    });
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    // Create a modified event with a virtual spy probe
    const modifiedEvent = {
      ...fleetEvent,
      ships: { espionageProbe: 1 },
      metadata: {
        ...(fleetEvent.metadata as Record<string, unknown> ?? {}),
        scanMission: true,
        espionageBonus: 2,
      },
    };

    // Delegate spy logic
    const result = await this.spyHandler.processArrival(modifiedEvent, ctx);

    // Probe is always destroyed — don't return ships
    return {
      ...result,
      scheduleReturn: true,
      shipsAfterArrival: {},
      cargo: { minerai: 0, silicium: 0, hydrogene: 0 },
    };
  }
}
