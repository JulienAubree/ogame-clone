/**
 * Shared types for the galaxy system DetailPanel and its 5 modes.
 *
 * Pure types — no React, no runtime. The modes receive a `DetailPanelContext`
 * (ambient data about the viewer + system) and a `DetailPanelActions` bag
 * (callbacks the parent wires to navigation/mutations).
 */

import type { SlotView } from '../slotView';

export type DetailSelection =
  | { kind: 'system' }
  | { kind: 'slot'; position: number };

export interface PlanetTypeMeta {
  id: string;
  name: string;
}

export interface DetailPanelContext {
  galaxy: number;
  system: number;
  planetTypes: PlanetTypeMeta[];
  hasColonizer: boolean;
  hasExplorer: boolean;
  hasSpy: boolean;
  hasCombatShip: boolean;
  hasRecycler: boolean;
  hasMiner: boolean;
  /** Mining mission keyed by belt position. */
  beltMissions: Record<number, { id: string }>;
  myCapitalPosition: number | null;
  /** Whether the player can create a vendable report for the selected position. */
  canCreateReport: boolean;
  canCreateReportReason: string | null;
}

export interface DetailPanelActions {
  onColonize: (position: number) => void;
  onExplore: (position: number) => void;
  onSpy: (position: number) => void;
  onAttack: (position: number) => void;
  onMine: (position: number, missionId: string) => void;
  onRecycle: (position: number) => void;
  onMessage: (userId: string, username: string) => void;
  onCenterCapital: () => void;
  onManagePlanet: (planetId: string) => void;
  onViewColonization: (planetId: string) => void;
  onCreateReport: (position: number) => void;
}

/** Convenience re-export so mode files can import from one place. */
export type { SlotView };
