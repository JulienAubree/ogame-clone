import type { Database } from '@exilium/db';
import { createRankingService } from '../modules/ranking/ranking.service.js';
import type { GameConfigService } from '../modules/admin/game-config.service.js';

export async function rankingUpdate(db: Database, gameConfigService: GameConfigService) {
  const rankingService = createRankingService(db, gameConfigService);
  await rankingService.recalculateAll();
}
