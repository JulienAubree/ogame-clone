import { router, publicProcedure, createAdminProcedure } from './router.js';
import { createAuthRouter } from '../modules/auth/auth.router.js';
import { createAuthService } from '../modules/auth/auth.service.js';
import { createPlanetService } from '../modules/planet/planet.service.js';
import { createPlanetRouter } from '../modules/planet/planet.router.js';
import { createResourceService } from '../modules/resource/resource.service.js';
import { createResourceRouter } from '../modules/resource/resource.router.js';
import { createBuildingService } from '../modules/building/building.service.js';
import { createBuildingRouter } from '../modules/building/building.router.js';
import { createResearchService } from '../modules/research/research.service.js';
import { createResearchRouter } from '../modules/research/research.router.js';
import { createShipyardService } from '../modules/shipyard/shipyard.service.js';
import { createShipyardRouter } from '../modules/shipyard/shipyard.router.js';
import { buildCompletionQueue, fleetQueue, marketQueue } from '../queues/queues.js';
import { createGalaxyService } from '../modules/galaxy/galaxy.service.js';
import { createGalaxyRouter } from '../modules/galaxy/galaxy.router.js';
import { createFleetService } from '../modules/fleet/fleet.service.js';
import { createFleetRouter } from '../modules/fleet/fleet.router.js';
import { createContactService } from '../modules/fleet/contact.service.js';
import { createMessageService } from '../modules/message/message.service.js';
import { createMessageRouter } from '../modules/message/message.router.js';
import { createRankingService } from '../modules/ranking/ranking.service.js';
import { createRankingRouter } from '../modules/ranking/ranking.router.js';
import { createAllianceService } from '../modules/alliance/alliance.service.js';
import { createAllianceRouter } from '../modules/alliance/alliance.router.js';
import { createGameConfigService } from '../modules/admin/game-config.service.js';
import { createGameConfigRouter } from '../modules/admin/game-config.router.js';
import { createPlayerAdminService } from '../modules/admin/player-admin.service.js';
import { createPlayerAdminRouter } from '../modules/admin/player-admin.router.js';
import { createGameEventService } from '../modules/game-event/game-event.service.js';
import { createGameEventRouter } from '../modules/game-event/game-event.router.js';
import { createAsteroidBeltService } from '../modules/pve/asteroid-belt.service.js';
import { createPirateService } from '../modules/pve/pirate.service.js';
import { createPveService } from '../modules/pve/pve.service.js';
import { createPveRouter } from '../modules/pve/pve.router.js';
import { createTutorialService } from '../modules/tutorial/tutorial.service.js';
import { createTutorialRouter } from '../modules/tutorial/tutorial.router.js';
import { createReportService } from '../modules/report/report.service.js';
import { createReportRouter } from '../modules/report/report.router.js';
import { createUserService } from '../modules/user/user.service.js';
import { createUserRouter } from '../modules/user/user.router.js';
import { createFriendService } from '../modules/friend/friend.service.js';
import { createFriendRouter } from '../modules/friend/friend.router.js';
import { createMarketService } from '../modules/market/market.service.js';
import { createMarketRouter } from '../modules/market/market.router.js';
import { createPushService } from '../modules/push/push.service.js';
import { createPushRouter } from '../modules/push/push.router.js';
import { createExiliumService } from '../modules/exilium/exilium.service.js';
import { createExiliumRouter } from '../modules/exilium/exilium.router.js';
import { createFlagshipService } from '../modules/flagship/flagship.service.js';
import { createFlagshipRouter } from '../modules/flagship/flagship.router.js';
import { createDailyQuestService } from '../modules/daily-quest/daily-quest.service.js';
import { createDailyQuestRouter } from '../modules/daily-quest/daily-quest.router.js';
import { env } from '../config/env.js';
import type { Database } from '@exilium/db';
import type Redis from 'ioredis';

export function buildAppRouter(db: Database, redis: Redis) {
  const adminProcedure = createAdminProcedure(db);

  const gameConfigService = createGameConfigService(db);
  const exiliumService = createExiliumService(db, gameConfigService);
  const dailyQuestService = createDailyQuestService(db, exiliumService, gameConfigService, redis);
  const authService = createAuthService(db);
  const planetService = createPlanetService(db, gameConfigService, env.ASSETS_DIR);
  const resourceService = createResourceService(db, gameConfigService, dailyQuestService);
  const buildingService = createBuildingService(db, resourceService, buildCompletionQueue, gameConfigService);
  const researchService = createResearchService(db, resourceService, buildCompletionQueue, gameConfigService);
  const shipyardService = createShipyardService(db, resourceService, buildCompletionQueue, gameConfigService);
  const galaxyService = createGalaxyService(db, gameConfigService);
  const pushService = createPushService(db);
  const messageService = createMessageService(db, redis, pushService);
  const rankingService = createRankingService(db, gameConfigService);
  const asteroidBeltService = createAsteroidBeltService(db);
  const pirateService = createPirateService(db, gameConfigService);
  const pveService = createPveService(db, asteroidBeltService, pirateService, gameConfigService);
  const reportService = createReportService(db);
  const userService = createUserService(db, env.ASSETS_DIR);
  const gameEventService = createGameEventService(db);
  const friendService = createFriendService(db, redis, gameEventService);
  const flagshipService = createFlagshipService(db, exiliumService, gameConfigService);
  const fleetService = createFleetService(db, resourceService, fleetQueue, messageService, gameConfigService, redis, pveService, asteroidBeltService, pirateService, reportService, exiliumService, dailyQuestService, flagshipService);
  const allianceService = createAllianceService(db, messageService);
  const contactService = createContactService(db, friendService, allianceService);
  const playerAdminService = createPlayerAdminService(db);
  const tutorialService = createTutorialService(db, pveService);
  const marketService = createMarketService(db, resourceService, gameConfigService, marketQueue, redis, dailyQuestService, exiliumService);

  const authRouter = createAuthRouter(authService, planetService);
  const planetRouter = createPlanetRouter(planetService);
  const resourceRouter = createResourceRouter(resourceService, planetService, db, gameConfigService);
  const buildingRouter = createBuildingRouter(buildingService);
  const researchRouter = createResearchRouter(researchService);
  const shipyardRouter = createShipyardRouter(shipyardService);
  const galaxyRouter = createGalaxyRouter(galaxyService);
  const fleetRouter = createFleetRouter(fleetService, contactService);
  const messageRouter = createMessageRouter(messageService);
  const rankingRouter = createRankingRouter(rankingService);
  const allianceRouter = createAllianceRouter(allianceService);
  const gameConfigRouter = createGameConfigRouter(gameConfigService, adminProcedure);
  const playerAdminRouter = createPlayerAdminRouter(playerAdminService, adminProcedure);
  const gameEventRouter = createGameEventRouter(gameEventService);
  const pveRouter = createPveRouter(pveService, asteroidBeltService, gameConfigService);
  const tutorialRouter = createTutorialRouter(tutorialService);
  const reportRouter = createReportRouter(reportService);
  const userRouter = createUserRouter(userService);
  const friendRouter = createFriendRouter(friendService);
  const marketRouter = createMarketRouter(marketService);
  const pushRouter = createPushRouter(pushService);
  const exiliumRouter = createExiliumRouter(exiliumService);
  const flagshipRouter = createFlagshipRouter(flagshipService, tutorialService);
  const dailyQuestRouter = createDailyQuestRouter(dailyQuestService);

  return router({
    health: publicProcedure.query(() => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })),
    auth: authRouter,
    planet: planetRouter,
    resource: resourceRouter,
    building: buildingRouter,
    research: researchRouter,
    shipyard: shipyardRouter,
    galaxy: galaxyRouter,
    fleet: fleetRouter,
    message: messageRouter,
    ranking: rankingRouter,
    alliance: allianceRouter,
    gameConfig: gameConfigRouter,
    playerAdmin: playerAdminRouter,
    gameEvent: gameEventRouter,
    pve: pveRouter,
    tutorial: tutorialRouter,
    report: reportRouter,
    user: userRouter,
    friend: friendRouter,
    market: marketRouter,
    push: pushRouter,
    exilium: exiliumRouter,
    flagship: flagshipRouter,
    dailyQuest: dailyQuestRouter,
  });
}

export type AppRouter = ReturnType<typeof buildAppRouter>;
