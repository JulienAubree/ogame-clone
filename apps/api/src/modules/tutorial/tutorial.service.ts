import { eq, and, asc, sql } from 'drizzle-orm';
import { tutorialProgress, tutorialChapters, planets, planetBuildings, planetShips, planetDefenses, tutorialQuestDefinitions, userResearch, fleetEvents, pveMissions, flagships } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { createPveService } from '../pve/pve.service.js';

export interface TutorialQuest {
  id: string;
  order: number;
  title: string;
  narrativeText: string;
  chapterId: string;
  journalEntry: string;
  objectiveLabel: string;
  condition: {
    type: 'building_level' | 'ship_count' | 'mission_complete' | 'research_level' | 'fleet_return' | 'flagship_named' | 'defense_count';
    targetId: string;
    targetValue: number;
  };
  reward: { minerai: number; silicium: number; hydrogene: number };
}

export interface CompletedQuestEntry {
  questId: string;
  completedAt: string;
}

export function createTutorialService(
  db: Database,
  pveService?: ReturnType<typeof createPveService>,
  exiliumService?: { earn(userId: string, amount: number, source: string, details?: unknown): Promise<void> },
) {
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
      chapterId: r.chapterId,
      journalEntry: r.journalEntry,
      objectiveLabel: r.objectiveLabel,
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

  async function loadChapters() {
    return db.select().from(tutorialChapters).orderBy(asc(tutorialChapters.order));
  }

  /** Query the actual current progress value toward a quest condition */
  async function getCurrentProgress(userId: string, condition: TutorialQuest['condition']): Promise<number> {
    if (condition.type === 'building_level') {
      const levels = await db
        .select({ level: planetBuildings.level })
        .from(planetBuildings)
        .innerJoin(planets, eq(planets.id, planetBuildings.planetId))
        .where(
          and(
            eq(planets.userId, userId),
            eq(planetBuildings.buildingId, condition.targetId),
          ),
        )
        .limit(1);
      return levels[0]?.level ?? 0;

    } else if (condition.type === 'research_level') {
      const [research] = await db
        .select()
        .from(userResearch)
        .where(eq(userResearch.userId, userId))
        .limit(1);
      if (research) {
        return (research[condition.targetId as keyof typeof research] ?? 0) as number;
      }
      return 0;

    } else if (condition.type === 'ship_count') {
      const col = condition.targetId;
      const ships = await db
        .select()
        .from(planetShips)
        .innerJoin(planets, eq(planets.id, planetShips.planetId))
        .where(eq(planets.userId, userId));
      return ships.reduce((sum, row) => {
        return sum + ((row.planet_ships[col as keyof typeof row.planet_ships] ?? 0) as number);
      }, 0);

    } else if (condition.type === 'defense_count') {
      const col = condition.targetId;
      const defenses = await db
        .select()
        .from(planetDefenses)
        .innerJoin(planets, eq(planets.id, planetDefenses.planetId))
        .where(eq(planets.userId, userId));
      return defenses.reduce((sum, row) => {
        return sum + ((row.planet_defenses[col as keyof typeof row.planet_defenses] ?? 0) as number);
      }, 0);

    } else if (condition.type === 'fleet_return') {
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
      return completedFleet ? 1 : 0;

    } else if (condition.type === 'mission_complete') {
      const [completedMission] = await db
        .select({ id: pveMissions.id })
        .from(pveMissions)
        .where(
          and(
            eq(pveMissions.userId, userId),
            eq(pveMissions.missionType, condition.targetId),
            eq(pveMissions.status, 'completed'),
          ),
        )
        .limit(1);
      return completedMission ? 1 : 0;

    } else if (condition.type === 'flagship_named') {
      const [flagship] = await db
        .select({ id: flagships.id })
        .from(flagships)
        .where(eq(flagships.userId, userId))
        .limit(1);
      return flagship ? 1 : 0;
    }

    return 0;
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
      // Single check: if quest condition is met, set pendingCompletion
      await this.checkCompletion(userId);

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
        return {
          isComplete: true,
          quest: null,
          completedQuests: progress.completedQuests as CompletedQuestEntry[],
          playerCoords,
          tutorialMiningMissionId: null,
          pendingCompletion: false,
          chapter: null,
          currentProgress: 0,
          targetValue: 0,
          objectiveLabel: null,
          journalEntry: null,
        };
      }

      const quests = await loadQuests();
      const quest = quests.find(q => q.id === progress.currentQuestId);
      if (!quest) {
        return {
          isComplete: false,
          quest: null,
          completedQuests: progress.completedQuests as CompletedQuestEntry[],
          playerCoords,
          tutorialMiningMissionId,
          pendingCompletion: false,
          chapter: null,
          currentProgress: 0,
          targetValue: 0,
          objectiveLabel: null,
          journalEntry: null,
        };
      }

      // Load chapter info
      const chapters = await loadChapters();
      const chapter = chapters.find(c => c.id === quest.chapterId);
      const questsInChapter = quests.filter(q => q.chapterId === quest.chapterId);
      const completedQuests = (progress.completedQuests as CompletedQuestEntry[]) || [];
      const completedInChapter = questsInChapter.filter(q =>
        completedQuests.some(cq => cq.questId === q.id),
      ).length;

      // Get current progress toward objective
      const currentProgress = await getCurrentProgress(userId, quest.condition);

      return {
        isComplete: false,
        quest,
        completedQuests,
        playerCoords,
        tutorialMiningMissionId,
        pendingCompletion: progress.pendingCompletion,
        chapter: chapter ? {
          id: chapter.id,
          title: chapter.title,
          journalIntro: chapter.journalIntro,
          questCount: questsInChapter.length,
          completedInChapter,
        } : null,
        currentProgress,
        targetValue: quest.condition.targetValue,
        objectiveLabel: quest.objectiveLabel,
        journalEntry: quest.journalEntry,
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

      // Condition met: set pendingCompletion instead of auto-completing
      if (!progress.pendingCompletion) {
        await db
          .update(tutorialProgress)
          .set({ pendingCompletion: true, updatedAt: new Date() })
          .where(eq(tutorialProgress.id, progress.id));
      }

      return { pendingCompletion: true, questId: quest.id };
    },

    async checkCompletion(userId: string) {
      const progress = await this.getOrCreateProgress(userId);
      if (progress.isComplete) return null;

      const quests = await loadQuests();
      const quest = quests.find(q => q.id === progress.currentQuestId);
      if (!quest) return null;

      // If already pending, no need to re-check
      if (progress.pendingCompletion) return true;

      // Check if current quest condition is met
      const currentValue = await getCurrentProgress(userId, quest.condition);
      const conditionMet = currentValue >= quest.condition.targetValue;

      if (!conditionMet) return null;

      // Condition met: set pendingCompletion
      await db
        .update(tutorialProgress)
        .set({ pendingCompletion: true, updatedAt: new Date() })
        .where(eq(tutorialProgress.id, progress.id));

      return true;
    },

    async completeCurrentQuest(userId: string) {
      const progress = await this.getOrCreateProgress(userId);
      if (progress.isComplete) return { error: 'tutorial_already_complete' };
      if (!progress.pendingCompletion) return { error: 'quest_not_ready' };

      const quests = await loadQuests();
      const chapters = await loadChapters();
      const quest = quests.find(q => q.id === progress.currentQuestId);
      if (!quest) return { error: 'quest_not_found' };

      const chapter = chapters.find(c => c.id === quest.chapterId);

      // Award quest resources to user's first planet
      const [planet] = await db
        .select()
        .from(planets)
        .where(eq(planets.userId, userId))
        .limit(1);

      if (planet && (quest.reward.minerai > 0 || quest.reward.silicium > 0 || quest.reward.hydrogene > 0)) {
        await db
          .update(planets)
          .set({
            minerai: String(Number(planet.minerai) + quest.reward.minerai),
            silicium: String(Number(planet.silicium) + quest.reward.silicium),
            hydrogene: String(Number(planet.hydrogene) + quest.reward.hydrogene),
          })
          .where(eq(planets.id, planet.id));
      }

      // Update completed quests
      const completedQuests = (progress.completedQuests as CompletedQuestEntry[]) || [];
      completedQuests.push({ questId: quest.id, completedAt: new Date().toISOString() });

      // Check if this is the last quest of the chapter
      const questsInChapter = quests.filter(q => q.chapterId === quest.chapterId);
      const completedInChapter = questsInChapter.filter(q =>
        completedQuests.some(cq => cq.questId === q.id),
      ).length;
      const isLastQuestOfChapter = completedInChapter >= questsInChapter.length;

      let chapterReward = null;
      if (isLastQuestOfChapter && chapter && planet) {
        // Award chapter resource rewards
        if (chapter.rewardMinerai > 0 || chapter.rewardSilicium > 0 || chapter.rewardHydrogene > 0) {
          // Re-read planet to get fresh values after quest reward
          const [freshPlanet] = await db
            .select()
            .from(planets)
            .where(eq(planets.id, planet.id))
            .limit(1);
          if (freshPlanet) {
            await db
              .update(planets)
              .set({
                minerai: String(Number(freshPlanet.minerai) + chapter.rewardMinerai),
                silicium: String(Number(freshPlanet.silicium) + chapter.rewardSilicium),
                hydrogene: String(Number(freshPlanet.hydrogene) + chapter.rewardHydrogene),
              })
              .where(eq(planets.id, planet.id));
          }
        }

        // Award chapter unit rewards
        const rewardUnits = (chapter.rewardUnits ?? []) as Array<{ shipId: string; quantity: number }>;
        for (const unit of rewardUnits) {
          if (unit.quantity > 0) {
            // Ensure planetShips row exists
            await db
              .insert(planetShips)
              .values({ planetId: planet.id })
              .onConflictDoNothing();

            // Atomic increment — safe under concurrent completions
            const col = unit.shipId as keyof typeof planetShips;
            await db
              .update(planetShips)
              .set({ [unit.shipId]: sql`${planetShips[col]} + ${unit.quantity}` })
              .where(eq(planetShips.planetId, planet.id));
          }
        }

        // Award chapter Exilium
        if (chapter.rewardExilium > 0 && exiliumService) {
          await exiliumService.earn(userId, chapter.rewardExilium, 'tutorial');
        }

        chapterReward = {
          minerai: chapter.rewardMinerai,
          silicium: chapter.rewardSilicium,
          hydrogene: chapter.rewardHydrogene,
          exilium: chapter.rewardExilium,
          units: rewardUnits,
        };
      }

      // Advance to next quest
      const nextQuest = quests.find(q => q.order === quest.order + 1);
      const tutorialComplete = !nextQuest;

      await db
        .update(tutorialProgress)
        .set({
          currentQuestId: nextQuest ? nextQuest.id : quest.id,
          completedQuests,
          isComplete: tutorialComplete,
          pendingCompletion: false,
          updatedAt: new Date(),
        })
        .where(eq(tutorialProgress.id, progress.id));

      // Generate tutorial PvE mining mission when quest_15 (prospector built) is completed
      if (quest.id === 'quest_15' && pveService && planet) {
        try {
          await pveService.generateDiscoveredMission(userId, planet.galaxy, planet.system, 1);
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

      // Clean metadata when quest_16 (mining mission) is completed
      if (quest.id === 'quest_16') {
        await db
          .update(tutorialProgress)
          .set({ metadata: null })
          .where(eq(tutorialProgress.id, progress.id));
      }

      // Check if the NEW quest is already satisfied -> set pendingCompletion
      if (nextQuest) {
        const nextValue = await getCurrentProgress(userId, nextQuest.condition);
        if (nextValue >= nextQuest.condition.targetValue) {
          await db
            .update(tutorialProgress)
            .set({ pendingCompletion: true, updatedAt: new Date() })
            .where(eq(tutorialProgress.id, progress.id));
        }
      }

      // Return updated state (same shape as getCurrent)
      return this.getCurrent(userId).then(state => ({
        ...state,
        completedQuest: quest,
        questReward: quest.reward,
        chapterReward,
        tutorialComplete,
      }));
    },
  };
}
