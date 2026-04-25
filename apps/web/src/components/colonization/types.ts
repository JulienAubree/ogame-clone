/**
 * Types partagés par les sous-composants de la page Colonization.
 * On duplique manuellement la shape retournée par
 * `colonization.service.getStatus` plutôt que d'importer depuis `@trpc/server`
 * (pas dispo côté web). À garder synchronisé avec le service serveur.
 */

export interface ColonizationStatus {
  // Process record (from DB)
  id: string;
  planetId: string;
  userId: string;
  status: string;
  progress: number;
  difficultyFactor: number;
  outpostEstablished: boolean;
  startedAt: string | Date;
  lastTickAt: string | Date | null;
  lastConvoySupplyAt: string | Date | null;
  // Computed
  basePassiveRate: number;
  effectivePassiveRate: number;
  estimatedCompletionHours: number;
  consumptionMineraiPerHour: number;
  consumptionSiliciumPerHour: number;
  currentMinerai: number;
  currentSilicium: number;
  currentHydrogene: number;
  hoursUntilStockout: number | null;
  stockSufficient: boolean;
  stationedShips: Record<string, number>;
  stationedFP: number;
  ipcLevel: number;
  outpostThresholdMinerai: number;
  outpostThresholdSilicium: number;
  gracePeriodEndsAt: string | Date;
  outpostTimeoutAt: string | Date;
  inGracePeriod: boolean;
  garrisonBonusActive: boolean;
  garrisonBonusValue: number;
  garrisonFpThreshold: number;
  convoyBonusActive: boolean;
  convoyBonusValue: number;
  convoyBonusEndsAt: string | Date | null;
  convoyWindowHours: number;
  totalRateBonus: number;
  bonusCap: number;
}

export interface PlanetSummary {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  planetClassId: string | null;
  planetImageIndex: number | null;
}

export interface PlanetCoords {
  galaxy: number;
  system: number;
  position: number;
}

export interface InboundFleet {
  id: string;
  hostile?: boolean;
  mission: string;
  arrivalTime: string;
  ships: Record<string, number>;
  mineraiCargo?: number | string | null;
  siliciumCargo?: number | string | null;
  hydrogeneCargo?: number | string | null;
  originPlanetName?: string | null;
  detectionTier?: number | null;
  shipCount?: number | null;
  senderUsername?: string | null;
  targetGalaxy?: number;
  targetSystem?: number;
  targetPosition?: number;
}

/** Game config (loose type — used to pass to getShipName). */
export interface GameConfigLike {
  ships?: Record<string, { name: string }>;
  buildings?: Record<string, { name: string }>;
  research?: Record<string, { name: string }>;
  defenses?: Record<string, { name: string }>;
}
