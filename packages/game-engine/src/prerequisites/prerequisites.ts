import { RESEARCH } from '../constants/research.js';
import { SHIPS } from '../constants/ships.js';
import { DEFENSES } from '../constants/defenses.js';
import type { ResearchId } from '../constants/research.js';
import type { ShipId } from '../constants/ships.js';
import type { DefenseId } from '../constants/defenses.js';

export interface PrerequisiteResult {
  met: boolean;
  missing: string[];
}

interface BuildingLevels {
  [key: string]: number;
}

interface ResearchLevels {
  [key: string]: number;
}

function checkPrereqs(
  prereqs: { buildings?: { buildingId: string; level: number }[]; research?: { researchId: string; level: number }[] },
  buildingLevels: BuildingLevels,
  researchLevels: ResearchLevels,
): PrerequisiteResult {
  const missing: string[] = [];

  if (prereqs.buildings) {
    for (const req of prereqs.buildings) {
      const columnKey = req.buildingId + 'Level';
      const current = buildingLevels[columnKey] ?? 0;
      if (current < req.level) {
        missing.push(`${req.buildingId} level ${req.level} (current: ${current})`);
      }
    }
  }

  if (prereqs.research) {
    for (const req of prereqs.research) {
      const current = researchLevels[req.researchId] ?? 0;
      if (current < req.level) {
        missing.push(`${req.researchId} level ${req.level} (current: ${current})`);
      }
    }
  }

  return { met: missing.length === 0, missing };
}

export function checkResearchPrerequisites(
  researchId: ResearchId,
  buildingLevels: BuildingLevels,
  researchLevels: ResearchLevels,
): PrerequisiteResult {
  return checkPrereqs(RESEARCH[researchId].prerequisites, buildingLevels, researchLevels);
}

export function checkShipPrerequisites(
  shipId: ShipId,
  buildingLevels: BuildingLevels,
  researchLevels: ResearchLevels,
): PrerequisiteResult {
  return checkPrereqs(SHIPS[shipId].prerequisites, buildingLevels, researchLevels);
}

export function checkDefensePrerequisites(
  defenseId: DefenseId,
  buildingLevels: BuildingLevels,
  researchLevels: ResearchLevels,
): PrerequisiteResult {
  return checkPrereqs(DEFENSES[defenseId].prerequisites, buildingLevels, researchLevels);
}
