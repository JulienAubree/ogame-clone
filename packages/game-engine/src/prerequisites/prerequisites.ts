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

export interface PrerequisiteDef {
  buildings?: { buildingId: string; level: number }[];
  research?: { researchId: string; level: number }[];
}

function checkPrereqs(
  prereqs: PrerequisiteDef,
  buildingLevels: BuildingLevels,
  researchLevels: ResearchLevels,
): PrerequisiteResult {
  const missing: string[] = [];

  if (prereqs.buildings) {
    for (const req of prereqs.buildings) {
      const current = buildingLevels[req.buildingId] ?? 0;
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
  prereqs: PrerequisiteDef,
  buildingLevels: BuildingLevels,
  researchLevels: ResearchLevels,
): PrerequisiteResult {
  return checkPrereqs(prereqs, buildingLevels, researchLevels);
}

export function checkShipPrerequisites(
  prereqs: PrerequisiteDef,
  buildingLevels: BuildingLevels,
  researchLevels: ResearchLevels,
): PrerequisiteResult {
  return checkPrereqs(prereqs, buildingLevels, researchLevels);
}

export function checkDefensePrerequisites(
  prereqs: PrerequisiteDef,
  buildingLevels: BuildingLevels,
  researchLevels: ResearchLevels,
): PrerequisiteResult {
  return checkPrereqs(prereqs, buildingLevels, researchLevels);
}
