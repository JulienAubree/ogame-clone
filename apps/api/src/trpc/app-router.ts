import { router, publicProcedure } from './router.js';
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
import { buildingCompletionQueue, researchCompletionQueue, shipyardCompletionQueue } from '../queues/queue.js';
import type { Database } from '@ogame-clone/db';

export function buildAppRouter(db: Database) {
  const authService = createAuthService(db);
  const planetService = createPlanetService(db);
  const resourceService = createResourceService(db);
  const buildingService = createBuildingService(db, resourceService, buildingCompletionQueue);
  const researchService = createResearchService(db, resourceService, researchCompletionQueue);
  const shipyardService = createShipyardService(db, resourceService, shipyardCompletionQueue);

  const authRouter = createAuthRouter(authService, planetService);
  const planetRouter = createPlanetRouter(planetService);
  const resourceRouter = createResourceRouter(resourceService, planetService);
  const buildingRouter = createBuildingRouter(buildingService);
  const researchRouter = createResearchRouter(researchService);
  const shipyardRouter = createShipyardRouter(shipyardService);

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
  });
}

export type AppRouter = ReturnType<typeof buildAppRouter>;
