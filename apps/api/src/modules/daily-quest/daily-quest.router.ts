import { protectedProcedure, router } from '../../trpc/router.js';
import type { createDailyQuestService } from './daily-quest.service.js';
import { DAILY_QUEST_REGISTRY } from './quest-registry.js';

export function createDailyQuestRouter(dailyQuestService: ReturnType<typeof createDailyQuestService>) {
  return router({
    getQuests: protectedProcedure
      .query(async ({ ctx }) => {
        const state = await dailyQuestService.getQuests(ctx.userId!);
        // Enrichir avec les noms/descriptions du registre
        return {
          ...state,
          quests: state.quests.map(q => {
            const def = DAILY_QUEST_REGISTRY[q.id];
            return {
              ...q,
              name: def?.name ?? q.id,
              description: def?.description ?? '',
            };
          }),
        };
      }),
  });
}
