import { eq, and, asc } from 'drizzle-orm';
import { tutorialProgress, planets, planetBuildings, planetShips, tutorialQuestDefinitions, userResearch, fleetEvents, pveMissions } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import type { createPveService } from '../pve/pve.service.js';

export interface TutorialQuest {
  id: string;
  order: number;
  title: string;
  narrativeText: string;
  condition: {
    type: 'building_level' | 'ship_count' | 'mission_complete' | 'research_level' | 'fleet_return';
    targetId: string;
    targetValue: number;
  };
  reward: { minerai: number; silicium: number; hydrogene: number };
}

export interface CompletedQuestEntry {
  questId: string;
  completedAt: string;
}

export function createTutorialService(db: Database, pveService?: ReturnType<typeof createPveService>) {
  async function loadQuests(): Promise<TutorialQuest[]> {
    const rows = await db
      .select()
      .from(tutorialQuestDefinitions)
      .orderBy(asc(tutorialQuestDefinitions.order));
    return rows.map(r => ({
      id: r.id,
      order: r.order,
      title: r.title,
      narrativeText: r.narrativeText,
      condition: {
        type: r.conditionType as TutorialQuest['condition']['type'],
        targetId: r.conditionTargetId,
        targetValue: r.conditionTargetValue,
      },
      reward: {
        minerai: r.rewardMinerai,
        silicium: r.rewardSilicium,
        hydrogene: r.rewardHydrogene,
      },
    }));
  }

  return {
    async getOrCreateProgress(userId: string) {
      const [existing] = await db
        .select()
        .from(tutorialProgress)
        .where(eq(tutorialProgress.userId, userId))
        .limit(1);

      if (existing) return existing;

      const [created] = await db
        .insert(tutorialProgress)
        .values({ userId })
        .returning();
      return created;
    },

    async getCurrent(userId: string) {
      // Catch-up loop: auto-complete quests that are already satisfied
      let catchUpResult = await this.checkCompletion(userId);
      while (catchUpResult) {
        catchUpResult = await this.checkCompletion(userId);
      }

      const progress = await this.getOrCreateProgress(userId);

      // Get player's first planet coords
      const [planet] = await db
        .select({ galaxy: planets.galaxy, system: planets.system })
        .from(planets)
        .where(eq(planets.userId, userId))
        .limit(1);
      const playerCoords = planet ? { galaxy: planet.galaxy, system: planet.system } : null;

      // Extract tutorialMiningMissionId from metadata
      const metadata = progress.metadata as { tutorialMiningMissionId?: string } | null;
      const tutorialMiningMissionId = metadata?.tutorialMiningMissionId ?? null;

      if (progress.isComplete) {
        return { isComplete: true, quest: null, completedQuests: progress.completedQuests as CompletedQuestEntry[], playerCoords, tutorialMiningMissionId: null };
      }

      const quests = await loadQuests();
      const quest = quests.find(q => q.id === progress.currentQuestId);
      return {
        isComplete: false,
        quest: quest ?? null,
        completedQuests: progress.completedQuests as CompletedQuestEntry[],
        playerCoords,
        tutorialMiningMissionId,
      };
    },

    async checkAndComplete(userId: string, event: {
      type: TutorialQuest['condition']['type'];
      targetId: string;
      targetValue: number;
    }) {
      const progress = await this.getOrCreateProgress(userId);
      if (progress.isComplete) return null;

      const quests = await loadQuests();
      const quest = quests.find(q => q.id === progress.currentQuestId);
      if (!quest) return null;

      // Check if the event matches the quest condition
      if (quest.condition.type !== event.type) return null;
      if (quest.condition.targetId !== 'any' && quest.condition.targetId !== event.targetId) return null;
      if (event.targetValue < quest.condition.targetValue) return null;

      // Quest is complete — award resources and advance
      const completedQuests = (progress.completedQuests as CompletedQuestEntry[]) || [];
      completedQuests.push({ questId: quest.id, completedAt: new Date().toISOString() });

      const nextQuest = quests.find(q => q.order === quest.order + 1);

      // Award resources to user's first planet
      const [planet] = await db
        .select()
        .from(planets)
        .where(eq(planets.userId, userId))
        .limit(1);

      if (planet) {
        await db
          .update(planets)
          .set({
            minerai: String(Number(planet.minerai) + quest.reward.minerai),
            silicium: String(Number(planet.silicium) + quest.reward.silicium),
            hydrogene: String(Number(planet.hydrogene) + quest.reward.hydrogene),
          })
          .where(eq(planets.id, planet.id));
      }

      // Update progress
      await db
        .update(tutorialProgress)
        .set({
          currentQuestId: nextQuest ? nextQuest.id : quest.id,
          completedQuests,
          isComplete: !nextQuest,
          updatedAt: new Date(),
        })
        .where(eq(tutorialProgress.id, progress.id));

      // Generate tutorial PvE mining mission when quest_14 (prospector built) is completed
      if (quest.id === 'quest_14' && pveService && planet) {
        try {
          await pveService.generateMiningMission(userId, planet.galaxy, planet.system, 1);
          // Query the PvE mission that was just created to store its ID
          const missions = await pveService.getMissions(userId);
          const tutorialMission = missions.find(m =>
            (m.parameters as { position?: number })?.position === 8
          );
          if (tutorialMission) {
            await db
              .update(tutorialProgress)
              .set({ metadata: { tutorialMiningMissionId: tutorialMission.id } })
              .where(eq(tutorialProgress.id, progress.id));
          }
        } catch {
          // Fallback: mission generation failed, quest 15 still works via normal PvE flow
        }
      }

      // Clean metadata when quest_15 is completed
      if (quest.id === 'quest_15') {
        await db
          .update(tutorialProgress)
          .set({ metadata: null })
          .where(eq(tutorialProgress.id, progress.id));
      }

      return {
        completedQuest: quest,
        reward: quest.reward,
        nextQuest: nextQuest ?? null,
        tutorialComplete: !nextQuest,
      };
    },

    async checkCompletion(userId: string) {
      const progress = await this.getOrCreateProgress(userId);
      if (progress.isComplete) return null;

      const quests = await loadQuests();
      const quest = quests.find(q => q.id === progress.currentQuestId);
      if (!quest) return null;

      // Check if current quest condition is met
      let conditionMet = false;

      if (quest.condition.type === 'building_level') {
        const levels = await db
          .select({ level: planetBuildings.level })
          .from(planetBuildings)
          .innerJoin(planets, eq(planets.id, planetBuildings.planetId))
          .where(
            and(
              eq(planets.userId, userId),
              eq(planetBuildings.buildingId, quest.condition.targetId),
            ),
          )
          .limit(1);

        conditionMet = (levels[0]?.level ?? 0) >= quest.condition.targetValue;
      } else if (quest.condition.type === 'ship_count') {
        const col = quest.condition.targetId;
        const ships = await db
          .select()
          .from(planetShips)
          .innerJoin(planets, eq(planets.id, planetShips.planetId))
          .where(eq(planets.userId, userId));

        const totalCount = ships.reduce((sum, row) => {
          return sum + ((row.planet_ships[col as keyof typeof row.planet_ships] ?? 0) as number);
        }, 0);

        conditionMet = totalCount >= quest.condition.targetValue;
      } else if (quest.condition.type === 'research_level') {
        const [research] = await db
          .select()
          .from(userResearch)
          .where(eq(userResearch.userId, userId))
          .limit(1);

        if (research) {
          const level = (research[quest.condition.targetId as keyof typeof research] ?? 0) as number;
          conditionMet = level >= quest.condition.targetValue;
        }
      } else if (quest.condition.type === 'fleet_return') {
        const [completedFleet] = await db
          .select({ id: fleetEvents.id })
          .from(fleetEvents)
          .where(
            and(
              eq(fleetEvents.userId, userId),
              eq(fleetEvents.status, 'completed'),
            ),
          )
          .limit(1);

        conditionMet = !!completedFleet;
      } else if (quest.condition.type === 'mission_complete') {
        const [completedMission] = await db
          .select({ id: pveMissions.id })
          .from(pveMissions)
          .where(
            and(
              eq(pveMissions.userId, userId),
              eq(pveMissions.missionType, quest.condition.targetId),
              eq(pveMissions.status, 'completed'),
            ),
          )
          .limit(1);

        conditionMet = !!completedMission;
      }

      if (!conditionMet) return null;

      return this.checkAndComplete(userId, {
        type: quest.condition.type,
        targetId: quest.condition.targetId,
        targetValue: quest.condition.targetValue,
      });
    },
  };
}
