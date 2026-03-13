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
import { buildingCompletionQueue, researchCompletionQueue, shipyardCompletionQueue, fleetArrivalQueue, fleetReturnQueue } from '../queues/queue.js';
import { createGalaxyService } from '../modules/galaxy/galaxy.service.js';
import { createGalaxyRouter } from '../modules/galaxy/galaxy.router.js';
import { createFleetService } from '../modules/fleet/fleet.service.js';
import { createFleetRouter } from '../modules/fleet/fleet.router.js';
import { UNIVERSE_CONFIG } from '../modules/universe/universe.config.js';
import type { Database } from '@ogame-clone/db';

export function buildAppRouter(db: Database) {
  const authService = createAuthService(db);
  const planetService = createPlanetService(db);
  const resourceService = createResourceService(db);
  const buildingService = createBuildingService(db, resourceService, buildingCompletionQueue);
  const researchService = createResearchService(db, resourceService, researchCompletionQueue);
  const shipyardService = createShipyardService(db, resourceService, shipyardCompletionQueue);
  const galaxyService = createGalaxyService(db);
  const fleetService = createFleetService(db, resourceService, fleetArrivalQueue, fleetReturnQueue, UNIVERSE_CONFIG.speed);

  const authRouter = createAuthRouter(authService, planetService);
  const planetRouter = createPlanetRouter(planetService);
  const resourceRouter = createResourceRouter(resourceService, planetService);
  const buildingRouter = createBuildingRouter(buildingService);
  const researchRouter = createResearchRouter(researchService);
  const shipyardRouter = createShipyardRouter(shipyardService);
  const galaxyRouter = createGalaxyRouter(galaxyService);
  const fleetRouter = createFleetRouter(fleetService);

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
  });
}

export type AppRouter = ReturnType<typeof buildAppRouter>;
