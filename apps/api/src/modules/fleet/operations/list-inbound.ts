import { eq, and, inArray, ne, or, sql } from 'drizzle-orm';
import { planets, fleetEvents, users, allianceMembers, alliances } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { GameConfigService } from '../../admin/game-config.service.js';

export interface ListInboundDeps {
  db: Database;
  gameConfigService: GameConfigService;
}

/**
 * Return fleets inbound to the user's planets. Peaceful missions are listed
 * in full; hostile ones only appear after being detected and their details
 * are masked according to detection tier (ship counts, sender identity,
 * origin coords revealed progressively). Spy missions are never surfaced.
 */
export function createListInboundFleets(deps: ListInboundDeps) {
  const { db, gameConfigService } = deps;

  return async function listInboundFleets(userId: string) {
    const config = await gameConfigService.getFullConfig();

    const userPlanets = await db
      .select({ id: planets.id })
      .from(planets)
      .where(eq(planets.userId, userId));

    if (userPlanets.length === 0) return [];
    const planetIds = userPlanets.map((p) => p.id);

    const inboundSelect = {
      id: fleetEvents.id,
      userId: fleetEvents.userId,
      originPlanetId: fleetEvents.originPlanetId,
      targetPlanetId: fleetEvents.targetPlanetId,
      targetGalaxy: fleetEvents.targetGalaxy,
      targetSystem: fleetEvents.targetSystem,
      targetPosition: fleetEvents.targetPosition,
      mission: fleetEvents.mission,
      phase: fleetEvents.phase,
      departureTime: fleetEvents.departureTime,
      arrivalTime: fleetEvents.arrivalTime,
      mineraiCargo: fleetEvents.mineraiCargo,
      siliciumCargo: fleetEvents.siliciumCargo,
      hydrogeneCargo: fleetEvents.hydrogeneCargo,
      ships: fleetEvents.ships,
      detectionScore: fleetEvents.detectionScore,
      senderUsername: users.username,
      allianceTag: alliances.tag,
      targetPlanetName: sql<string>`(SELECT name FROM planets WHERE id = ${fleetEvents.targetPlanetId})`.as('target_planet_name'),
      originPlanetName: sql<string>`(SELECT name FROM planets WHERE id = ${fleetEvents.originPlanetId})`.as('origin_planet_name'),
      originGalaxy: sql<number>`(SELECT galaxy FROM planets WHERE id = ${fleetEvents.originPlanetId})`.as('origin_galaxy'),
      originSystem: sql<number>`(SELECT system FROM planets WHERE id = ${fleetEvents.originPlanetId})`.as('origin_system'),
      originPosition: sql<number>`(SELECT position FROM planets WHERE id = ${fleetEvents.originPlanetId})`.as('origin_position'),
    };

    const baseJoin = () =>
      db
        .select(inboundSelect)
        .from(fleetEvents)
        .innerJoin(users, eq(users.id, fleetEvents.userId))
        .leftJoin(allianceMembers, eq(allianceMembers.userId, fleetEvents.userId))
        .leftJoin(alliances, eq(alliances.id, allianceMembers.allianceId));

    const peacefulMissions = Object.entries(config.missions)
      .filter(([, m]) => !m.dangerous)
      .map(([id]) => id);

    // Spy missions stay invisible in the inbound list even when detected.
    const dangerousMissions = Object.entries(config.missions)
      .filter(([id, m]) => m.dangerous && id !== 'spy')
      .map(([id]) => id);

    const peacefulFleets = peacefulMissions.length > 0
      ? await baseJoin().where(
          and(
            inArray(fleetEvents.targetPlanetId, planetIds),
            eq(fleetEvents.status, 'active'),
            eq(fleetEvents.phase, 'outbound'),
            ne(fleetEvents.userId, userId),
            sql`${fleetEvents.mission}::text IN (${sql.join(peacefulMissions.map((m) => sql`${m}`), sql`, `)})`,
          ),
        )
      : [];

    // Hostile inbound: standard attackers (other user + detected) OR pirate
    // raids auto-generated against the colonizer (userId = victim by design,
    // but the fleet is hostile — surface it regardless of ownership).
    const hostileRaw = dangerousMissions.length > 0
      ? await baseJoin().where(
          and(
            inArray(fleetEvents.targetPlanetId, planetIds),
            eq(fleetEvents.status, 'active'),
            eq(fleetEvents.phase, 'outbound'),
            sql`${fleetEvents.mission}::text IN (${sql.join(dangerousMissions.map((m) => sql`${m}`), sql`, `)})`,
            or(
              and(
                ne(fleetEvents.userId, userId),
                sql`${fleetEvents.detectedAt} IS NOT NULL`,
              ),
              eq(fleetEvents.mission, 'colonization_raid'),
            ),
          ),
        )
      : [];

    // Tier-based visibility masking for hostile fleets. Score thresholds are
    // configurable via universe_config; higher tiers reveal more details.
    const { scoreThresholds } = config.attackDetection;

    const hostileFleets = hostileRaw.map((f) => {
      let tier = 0;
      const score = f.detectionScore ?? 0;
      for (let i = scoreThresholds.length - 1; i >= 0; i--) {
        if (score >= scoreThresholds[i]) { tier = i; break; }
      }

      const ships = f.ships as Record<string, number>;
      const totalShips = Object.values(ships).reduce((sum, n) => sum + n, 0);

      // Pirate raids use the victim's userId for ownership but are system-
      // generated. Force-mask sender/origin so the UI never surfaces the
      // player's own identity as the attacker.
      const isRaid = f.mission === 'colonization_raid';

      return {
        id: f.id,
        userId: f.userId,
        originPlanetId: isRaid ? null : f.originPlanetId,
        targetPlanetId: f.targetPlanetId,
        targetPlanetName: f.targetPlanetName,
        targetGalaxy: f.targetGalaxy,
        targetSystem: f.targetSystem,
        targetPosition: f.targetPosition,
        mission: f.mission,
        phase: f.phase,
        departureTime: f.departureTime,
        arrivalTime: f.arrivalTime,
        mineraiCargo: '0' as string,
        siliciumCargo: '0' as string,
        hydrogeneCargo: '0' as string,
        ships: tier >= 3 ? f.ships : {},
        detectionScore: f.detectionScore,
        senderUsername: isRaid ? 'Pirates' : (tier >= 4 ? f.senderUsername : null),
        allianceTag: isRaid ? null : (tier >= 4 ? f.allianceTag : null),
        originPlanetName: isRaid ? null : (tier >= 1 ? f.originPlanetName : null),
        originGalaxy: isRaid ? 0 : (tier >= 1 ? f.originGalaxy : 0),
        originSystem: isRaid ? 0 : (tier >= 1 ? f.originSystem : 0),
        originPosition: isRaid ? 0 : (tier >= 1 ? f.originPosition : 0),
        hostile: true as const,
        detectionTier: tier,
        shipCount: tier >= 2 ? totalShips : (null as number | null),
      };
    });

    return [
      ...peacefulFleets.map((f) => ({
        ...f,
        hostile: false as const,
        detectionTier: null as number | null,
        shipCount: null as number | null,
      })),
      ...hostileFleets,
    ];
  };
}
