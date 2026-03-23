import {
  BUILDINGS, type BuildingId,
  RESEARCH, type ResearchId,
  SHIPS, type ShipId,
  DEFENSES, type DefenseId,
} from '@ogame-clone/game-engine';

/**
 * Centralized name resolver — never returns a raw ID.
 * Priority: gameConfig (DB) > game-engine constants > hardcoded fallback map.
 */

interface GameConfigLike {
  buildings?: Record<string, { name: string }>;
  research?: Record<string, { name: string }>;
  ships?: Record<string, { name: string }>;
  defenses?: Record<string, { name: string }>;
}


export function getBuildingName(id: string, config?: GameConfigLike | null): string {
  return config?.buildings?.[id]?.name
    ?? BUILDINGS[id as BuildingId]?.name
    ?? id.replace(/([A-Z])/g, ' $1').trim();
}

export function getResearchName(id: string, config?: GameConfigLike | null): string {
  return config?.research?.[id]?.name
    ?? RESEARCH[id as ResearchId]?.name
    ?? id.replace(/([A-Z])/g, ' $1').trim();
}

export function getShipName(id: string, config?: GameConfigLike | null): string {
  return config?.ships?.[id]?.name
    ?? SHIPS[id as ShipId]?.name
    ?? id.replace(/([A-Z])/g, ' $1').trim();
}

export function getDefenseName(id: string, config?: GameConfigLike | null): string {
  return config?.defenses?.[id]?.name
    ?? DEFENSES[id as DefenseId]?.name
    ?? id.replace(/([A-Z])/g, ' $1').trim();
}

export function getUnitName(id: string, config?: GameConfigLike | null): string {
  return config?.ships?.[id]?.name
    ?? config?.defenses?.[id]?.name
    ?? SHIPS[id as ShipId]?.name
    ?? DEFENSES[id as DefenseId]?.name
    ?? id.replace(/([A-Z])/g, ' $1').trim();
}

export function getEntityName(id: string, config?: GameConfigLike | null): string {
  return config?.buildings?.[id]?.name
    ?? config?.research?.[id]?.name
    ?? config?.ships?.[id]?.name
    ?? config?.defenses?.[id]?.name
    ?? BUILDINGS[id as BuildingId]?.name
    ?? RESEARCH[id as ResearchId]?.name
    ?? SHIPS[id as ShipId]?.name
    ?? DEFENSES[id as DefenseId]?.name
    ?? id.replace(/([A-Z])/g, ' $1').trim();
}
