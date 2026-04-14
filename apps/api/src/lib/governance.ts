import { eq } from 'drizzle-orm';
import { planets, planetBuildings } from '@exilium/db';
import { calculateGovernancePenalty } from '@exilium/game-engine';
import type { Database } from '@exilium/db';

export async function getGovernancePenalty(
  db: Database,
  userId: string,
  planetClassId: string | null,
  config: { universe: Record<string, unknown> },
) {
  // Homeworld is exempt from governance penalties
  if (planetClassId === 'homeworld') {
    return { overextend: 0, harvestMalus: 0, constructionMalus: 0 };
  }

  // Count active colonies (active planets - 1 for homeworld)
  const userPlanets = await db.select({ id: planets.id, status: planets.status })
    .from(planets).where(eq(planets.userId, userId));
  const colonyCount = Math.max(0, userPlanets.filter(p => p.status === 'active').length - 1);

  // Find Imperial Power Center level on any of user's planets
  const allIpc = await db.select({ planetId: planetBuildings.planetId, level: planetBuildings.level })
    .from(planetBuildings)
    .where(eq(planetBuildings.buildingId, 'imperialPowerCenter'));
  const userPlanetIds = new Set(userPlanets.map(p => p.id));
  const ipc = allIpc.find(b => userPlanetIds.has(b.planetId));
  const capacity = 1 + (ipc?.level ?? 0);

  const harvestPenalties = (config.universe.governance_penalty_harvest as number[]) ?? [0.15, 0.35, 0.60];
  const constructionPenalties = (config.universe.governance_penalty_construction as number[]) ?? [0.15, 0.35, 0.60];

  return calculateGovernancePenalty(colonyCount, capacity, harvestPenalties, constructionPenalties);
}
