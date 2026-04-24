import { eq, and } from 'drizzle-orm';
import { fleetEvents, planets, users } from '@exilium/db';
import type { Database } from '@exilium/db';
import type Redis from 'ioredis';
import { publishNotification } from '../../notification/notification.publisher.js';
import type { GameConfigService } from '../../admin/game-config.service.js';

export interface ProcessDetectionDeps {
  db: Database;
  gameConfigService: GameConfigService;
  redis: Redis;
}

/**
 * Fire the "hostile inbound detected" event for the defender when the fleet's
 * detection timer (scheduled in sendFleet) elapses. Only fleets still in their
 * outbound phase are actionable — if the attacker recalled or the phase moved,
 * the notification is silently dropped.
 *
 * Payload visibility is tier-based off the detection score:
 *   tier 1+ : origin coords
 *   tier 2+ : total ship count
 *   tier 4+ : attacker username
 */
export function createProcessDetection(deps: ProcessDetectionDeps) {
  const { db, gameConfigService, redis } = deps;

  return async function processDetection(fleetEventId: string, defenderId: string) {
    const [event] = await db
      .select()
      .from(fleetEvents)
      .where(and(eq(fleetEvents.id, fleetEventId), eq(fleetEvents.status, 'active'), eq(fleetEvents.phase, 'outbound')))
      .limit(1);

    if (!event) return null;

    await db
      .update(fleetEvents)
      .set({ detectedAt: new Date() })
      .where(eq(fleetEvents.id, fleetEventId));

    const config = await gameConfigService.getFullConfig();
    const scoreThresholds: number[] = JSON.parse(String(config.universe.attack_detection_score_thresholds ?? '[0,1,3,5,7]'));

    let tier = 0;
    const score = event.detectionScore ?? 0;
    for (let i = scoreThresholds.length - 1; i >= 0; i--) {
      if (score >= scoreThresholds[i]) { tier = i; break; }
    }

    const payload: Record<string, unknown> = {
      tier,
      arrivalTime: event.arrivalTime.toISOString(),
      targetCoords: `${event.targetGalaxy}:${event.targetSystem}:${event.targetPosition}`,
      mission: event.mission,
      missionLabel: config.missions[event.mission]?.label ?? event.mission,
    };

    if (tier >= 1 && event.originPlanetId) {
      const [originPlanet] = await db
        .select({ galaxy: planets.galaxy, system: planets.system, position: planets.position })
        .from(planets)
        .where(eq(planets.id, event.originPlanetId))
        .limit(1);
      if (originPlanet) {
        payload.originCoords = `${originPlanet.galaxy}:${originPlanet.system}:${originPlanet.position}`;
      }
    }

    if (tier >= 2) {
      const ships = event.ships as Record<string, number>;
      payload.shipCount = Object.values(ships).reduce((sum, n) => sum + n, 0);
    }

    if (tier >= 4) {
      const [attacker] = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, event.userId))
        .limit(1);
      payload.attackerName = attacker?.username ?? null;
    }

    publishNotification(redis, defenderId, {
      type: 'fleet-hostile-inbound',
      payload,
    });

    return { detected: true };
  };
}
