import { SHIP_STATS } from '@ogame-clone/game-engine';

export type Mission = 'transport' | 'station' | 'spy' | 'attack' | 'colonize' | 'recycle' | 'mine' | 'pirate';

const COMBAT_SHIPS = ['lightFighter', 'heavyFighter', 'cruiser', 'battleship'] as const;

interface MissionConfig {
  label: string;
  hint: string;
  buttonLabel: string;
  dangerous: boolean;
  /** Ships that MUST be selected (at least 1). null = no requirement. */
  requiredShips: readonly string[] | null;
  /** If true, ONLY requiredShips can be sent (no optionals). */
  exclusive: boolean;
  /** Ships shown in "Recommended" section when there are no requiredShips. */
  recommendedShips: readonly string[] | null;
  /** Requires a pveMissionId (can only be launched from Missions page). */
  requiresPveMission: boolean;
}

export const MISSION_CONFIG: Record<Mission, MissionConfig> = {
  transport: {
    label: 'Transport',
    hint: 'Envoyez des ressources vers une planète alliée',
    buttonLabel: 'Envoyer',
    dangerous: false,
    requiredShips: null,
    exclusive: false,
    recommendedShips: ['smallCargo', 'largeCargo'],
    requiresPveMission: false,
  },
  station: {
    label: 'Stationner',
    hint: 'Stationnez votre flotte sur une planète alliée',
    buttonLabel: 'Envoyer',
    dangerous: false,
    requiredShips: null,
    exclusive: false,
    recommendedShips: null,
    requiresPveMission: false,
  },
  spy: {
    label: 'Espionner',
    hint: "Envoyez des sondes d'espionnage",
    buttonLabel: 'Espionner',
    dangerous: false,
    requiredShips: ['espionageProbe'],
    exclusive: true,
    recommendedShips: null,
    requiresPveMission: false,
  },
  attack: {
    label: 'Attaque',
    hint: 'Attaquez une planète ennemie',
    buttonLabel: 'Attaquer',
    dangerous: true,
    requiredShips: [...COMBAT_SHIPS],
    exclusive: false,
    recommendedShips: null,
    requiresPveMission: false,
  },
  colonize: {
    label: 'Coloniser',
    hint: 'Colonisez une position vide',
    buttonLabel: 'Coloniser',
    dangerous: true,
    requiredShips: ['colonyShip'],
    exclusive: true,
    recommendedShips: null,
    requiresPveMission: false,
  },
  recycle: {
    label: 'Recycler',
    hint: 'Récupérez les débris en orbite',
    buttonLabel: 'Recycler',
    dangerous: false,
    requiredShips: ['recycler'],
    exclusive: true,
    recommendedShips: null,
    requiresPveMission: false,
  },
  mine: {
    label: 'Miner',
    hint: "Envoyez des prospecteurs sur une ceinture d'astéroïdes",
    buttonLabel: 'Envoyer',
    dangerous: false,
    requiredShips: ['prospector'],
    exclusive: false,
    recommendedShips: null,
    requiresPveMission: false,
  },
  pirate: {
    label: 'Pirate',
    hint: 'Attaquez un repaire pirate',
    buttonLabel: 'Attaquer',
    dangerous: true,
    requiredShips: [...COMBAT_SHIPS],
    exclusive: false,
    recommendedShips: null,
    requiresPveMission: true,
  },
};

export type ShipCategory = 'required' | 'optional' | 'disabled';

/**
 * Compute total cargo capacity for a fleet composition.
 */
export function getCargoCapacity(selectedShips: Record<string, number>): number {
  return Object.entries(selectedShips).reduce((sum, [id, count]) => {
    const stats = SHIP_STATS[id as keyof typeof SHIP_STATS];
    return sum + (stats ? stats.cargoCapacity * count : 0);
  }, 0);
}

/**
 * Categorize a ship for a given mission.
 * @param shipId - The ship identifier
 * @param shipCount - Number available on the planet
 * @param mission - The selected mission type
 */
export function categorizeShip(
  shipId: string,
  shipCount: number,
  mission: Mission,
): ShipCategory {
  const config = MISSION_CONFIG[mission];

  if (shipCount === 0) return 'disabled';

  if (config.exclusive && config.requiredShips) {
    return config.requiredShips.includes(shipId) ? 'required' : 'disabled';
  }

  if (config.requiredShips?.includes(shipId)) return 'required';

  // Recommended ships reuse the 'required' category so they appear in the highlighted
  // section at the top. The FleetComposition component displays the section header as
  // "★ Recommandés" (not "★ Requis") when config.requiredShips is null.
  if (config.recommendedShips?.includes(shipId)) return 'required';

  return 'optional';
}
