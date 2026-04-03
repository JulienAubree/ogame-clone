import { eq } from 'drizzle-orm';
import { userExilium, tutorialProgress } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { createExiliumService } from '../exilium/exilium.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import { DAILY_QUEST_REGISTRY, QUEST_IDS } from './quest-registry.js';
import type { QuestEvent } from './quest-registry.js';
import type Redis from 'ioredis';
import { publishNotification } from '../notification/notification.publisher.js';

interface DailyQuestState {
  generated_at: string;
  quests: Array<{
    id: string;
    status: 'pending' | 'completed' | 'expired';
    completed_at?: string;
    progress?: number;
  }>;
}

function getUtcDayStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Tirer `count` quetes au hasard, en excluant `exclude` (Fisher-Yates) */
function drawQuests(count: number, exclude: string[]): string[] {
  const pool = QUEST_IDS.filter(id => !exclude.includes(id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export function createDailyQuestService(
  db: Database,
  exiliumService: ReturnType<typeof createExiliumService>,
  gameConfigService: GameConfigService,
  redis: Redis,
) {
  return {
    /**
     * Retourne les quetes du jour pour le joueur.
     * Genere les quetes si elles n'existent pas encore.
     */
    async getQuests(userId: string): Promise<DailyQuestState> {
      // Block daily quest generation during onboarding
      const [progress] = await db.select({ isComplete: tutorialProgress.isComplete })
        .from(tutorialProgress).where(eq(tutorialProgress.userId, userId)).limit(1);
      if (!progress || !progress.isComplete) {
        return { generated_at: new Date().toISOString(), quests: [] };
      }

      const record = await exiliumService.getOrCreate(userId);
      const dayStart = getUtcDayStart();

      const existingState = record.dailyQuests as DailyQuestState | null;

      // Si on a deja des quetes pour aujourd'hui, les retourner
      if (existingState && new Date(existingState.generated_at) >= dayStart) {
        return existingState;
      }

      // Generation lazy : tirer 3 quetes en excluant celles de la veille
      const config = await gameConfigService.getFullConfig();
      const questCount = Number(config.universe['daily_quest_count']) || 3;
      const previousIds = existingState?.quests.map(q => q.id) ?? [];
      const drawn = drawQuests(questCount, previousIds);

      const newState: DailyQuestState = {
        generated_at: dayStart.toISOString(),
        quests: drawn.map(id => ({ id, status: 'pending' as const })),
      };

      await db
        .update(userExilium)
        .set({ dailyQuests: newState, updatedAt: new Date() })
        .where(eq(userExilium.userId, userId));

      return newState;
    },

    /**
     * Traiter un evenement et verifier si une quete journaliere est completee.
     */
    async processEvent(event: QuestEvent) {
      const record = await exiliumService.getOrCreate(event.userId);
      const dayStart = getUtcDayStart();

      // Verifier si deja complete aujourd'hui
      if (record.lastDailyAt && record.lastDailyAt >= dayStart) {
        return null; // Deja complete pour aujourd'hui
      }

      const state = record.dailyQuests as DailyQuestState | null;
      if (!state || new Date(state.generated_at) < dayStart) {
        return null; // Pas de quetes generees pour aujourd'hui
      }

      // Chercher une quete pending qui matche l'evenement
      const config = await gameConfigService.getFullConfig();

      for (const quest of state.quests) {
        if (quest.status !== 'pending') continue;

        const def = DAILY_QUEST_REGISTRY[quest.id];
        if (!def) continue;

        // L'evenement correspond-il a cette quete ?
        if (!def.events.includes(event.type)) continue;

        // Accumulation : additionner le champ au progress de la journee
        let checkEvent = event;
        if (def.accumulate) {
          const increment = Number(event.payload[def.accumulate]) || 0;
          quest.progress = (quest.progress || 0) + increment;
          checkEvent = { ...event, payload: { ...event.payload, [def.accumulate]: quest.progress } };
        }

        // La condition est-elle remplie ?
        if (!def.check(checkEvent, config.universe)) {
          // Persister le progress meme si le seuil n'est pas atteint
          if (def.accumulate) {
            const progressState: DailyQuestState = {
              ...state,
              quests: state.quests.map(q =>
                q.id === quest.id ? { ...q, progress: quest.progress } : q,
              ),
            };
            await db
              .update(userExilium)
              .set({ dailyQuests: progressState, updatedAt: new Date() })
              .where(eq(userExilium.userId, event.userId));
          }
          continue;
        }

        // Completion ! Transaction atomique
        const reward = Number(config.universe['exilium_daily_quest_reward']) || 1;

        await db.transaction(async (tx) => {
          // Verrouiller pour eviter les race conditions
          const [locked] = await tx
            .select({ lastDailyAt: userExilium.lastDailyAt })
            .from(userExilium)
            .where(eq(userExilium.userId, event.userId))
            .for('update');

          if (locked?.lastDailyAt && locked.lastDailyAt >= dayStart) {
            return; // Race condition : deja complete entre-temps
          }

          // Marquer la quete completee, les autres expirees
          const updatedQuests = state.quests.map(q => {
            if (q.id === quest.id) {
              return { ...q, status: 'completed' as const, completed_at: new Date().toISOString() };
            }
            if (q.status === 'pending') {
              return { ...q, status: 'expired' as const };
            }
            return q;
          });

          const updatedState: DailyQuestState = {
            ...state,
            quests: updatedQuests,
          };

          await tx
            .update(userExilium)
            .set({
              dailyQuests: updatedState,
              lastDailyAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(userExilium.userId, event.userId));
        });

        // Crediter l'Exilium (hors transaction pour ne pas bloquer si ca echoue)
        await exiliumService.earn(event.userId, reward, 'daily_quest', { questId: quest.id });

        // Notification (fire-and-forget)
        publishNotification(redis, event.userId, {
          type: 'daily-quest-completed',
          payload: {
            questId: quest.id,
            questName: def.name,
            reward,
          },
        }).catch((e) => console.warn('[notification] send failed:', e));

        return { questId: quest.id, questName: def.name, reward };
      }

      return null;
    },
  };
}
