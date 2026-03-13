# Phase 3 : Recherche + Chantier Spatial — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter le système de recherche (9 technologies, file globale 1/joueur) et le chantier spatial (9 vaisseaux MVP + 7 défenses, queue séquentielle par planète avec construction unité par unité).

**Architecture:** Les recherches suivent le même pattern que les bâtiments (coûts exponentiels, prérequis, build_queue type='research', worker BullMQ). Le chantier est différent : queue séquentielle de batches, chaque unité construite individuellement avec `completed_count` qui track la progression. Les tables `planet_ships` et `planet_defenses` stockent les quantités (une ligne par planète, colonnes inline comme pour les bâtiments). Le `build_queue` existant supporte déjà les types 'research', 'ship', 'defense'.

**Tech Stack:** game-engine (constantes + formules coûts/temps/prérequis), Drizzle ORM (schema planet_ships, planet_defenses), BullMQ (workers research-completion, shipyard-completion), tRPC (routers research, shipyard), React (pages Recherche, Chantier, Défense)

---

## File Structure

### game-engine (constantes + formules)

| File | Responsabilité |
|------|---------------|
| `packages/game-engine/src/constants/research.ts` | Définitions des 9 technologies : id, nom, coûts base, facteur, prérequis |
| `packages/game-engine/src/constants/ships.ts` | Définitions des 9 vaisseaux MVP : id, nom, coûts, prérequis, stats de base |
| `packages/game-engine/src/constants/defenses.ts` | Définitions des 7 défenses MVP : id, nom, coûts, prérequis |
| `packages/game-engine/src/formulas/research-cost.ts` | `researchCost(techId, level)` + `researchTime(techId, level, labLevel)` |
| `packages/game-engine/src/formulas/research-cost.test.ts` | Tests coûts/temps recherche |
| `packages/game-engine/src/formulas/shipyard-cost.ts` | `shipCost(shipId)` + `shipTime(shipId, shipyardLevel)` + `defenseCost(defenseId)` + `defenseTime(defenseId, shipyardLevel)` |
| `packages/game-engine/src/formulas/shipyard-cost.test.ts` | Tests coûts/temps vaisseaux et défenses |
| `packages/game-engine/src/prerequisites/prerequisites.ts` | `checkResearchPrerequisites(techId, levels)` + `checkShipPrerequisites(shipId, levels)` + `checkDefensePrerequisites(defenseId, levels)` |
| `packages/game-engine/src/prerequisites/prerequisites.test.ts` | Tests prérequis |

### db (nouveaux schemas)

| File | Responsabilité |
|------|---------------|
| `packages/db/src/schema/planet-ships.ts` | Table `planet_ships` (planet_id PK, colonnes par vaisseau) |
| `packages/db/src/schema/planet-defenses.ts` | Table `planet_defenses` (planet_id PK, colonnes par défense) |

### api (modules research + shipyard + workers)

| File | Responsabilité |
|------|---------------|
| `apps/api/src/modules/research/research.service.ts` | listResearch, startResearch, cancelResearch, completeResearch |
| `apps/api/src/modules/research/research.router.ts` | tRPC router research (list, start, cancel) |
| `apps/api/src/modules/shipyard/shipyard.service.ts` | listShips, listDefenses, startBuild, cancelQueuedBatch, completeUnit |
| `apps/api/src/modules/shipyard/shipyard.router.ts` | tRPC router shipyard (ships, defenses, build, cancel) |
| `apps/api/src/workers/research-completion.worker.ts` | Worker qui complète une recherche |
| `apps/api/src/workers/shipyard-completion.worker.ts` | Worker qui complète une unité vaisseau/défense |

### web (pages frontend)

| File | Responsabilité |
|------|---------------|
| `apps/web/src/pages/Research.tsx` | Page Recherche (niveaux, coûts, upgrade, timer) |
| `apps/web/src/pages/Shipyard.tsx` | Page Chantier Spatial (vaisseaux, quantité, construction) |
| `apps/web/src/pages/Defense.tsx` | Page Défense (défenses, quantité, construction) |

---

## Chunk 1: Game Engine — Constantes Recherche + Vaisseaux + Défenses

### Task 1: Constantes des recherches

**Files:**
- Create: `packages/game-engine/src/constants/research.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
// packages/game-engine/src/constants/research.ts

export type ResearchId =
  | 'espionageTech'
  | 'computerTech'
  | 'energyTech'
  | 'combustion'
  | 'impulse'
  | 'hyperspaceDrive'
  | 'weapons'
  | 'shielding'
  | 'armor';

export interface ResearchDefinition {
  id: ResearchId;
  name: string;
  description: string;
  baseCost: { metal: number; crystal: number; deuterium: number };
  costFactor: number;
  /** Colonne correspondante dans la table user_research */
  levelColumn: string;
  prerequisites: {
    buildings?: { buildingId: string; level: number }[];
    research?: { researchId: ResearchId; level: number }[];
  };
}

export const RESEARCH: Record<ResearchId, ResearchDefinition> = {
  espionageTech: {
    id: 'espionageTech',
    name: 'Technologie Espionnage',
    description: 'Améliore les sondes d\'espionnage.',
    baseCost: { metal: 200, crystal: 1000, deuterium: 200 },
    costFactor: 2,
    levelColumn: 'espionageTech',
    prerequisites: { buildings: [{ buildingId: 'researchLab', level: 3 }] },
  },
  computerTech: {
    id: 'computerTech',
    name: 'Technologie Ordinateur',
    description: 'Augmente le nombre de flottes simultanées.',
    baseCost: { metal: 0, crystal: 400, deuterium: 600 },
    costFactor: 2,
    levelColumn: 'computerTech',
    prerequisites: { buildings: [{ buildingId: 'researchLab', level: 1 }] },
  },
  energyTech: {
    id: 'energyTech',
    name: 'Technologie Énergie',
    description: 'Recherche fondamentale en énergie.',
    baseCost: { metal: 0, crystal: 800, deuterium: 400 },
    costFactor: 2,
    levelColumn: 'energyTech',
    prerequisites: { buildings: [{ buildingId: 'researchLab', level: 1 }] },
  },
  combustion: {
    id: 'combustion',
    name: 'Réacteur à combustion',
    description: 'Propulsion de base pour les vaisseaux.',
    baseCost: { metal: 400, crystal: 0, deuterium: 600 },
    costFactor: 2,
    levelColumn: 'combustion',
    prerequisites: {
      buildings: [{ buildingId: 'researchLab', level: 1 }],
      research: [{ researchId: 'energyTech', level: 1 }],
    },
  },
  impulse: {
    id: 'impulse',
    name: 'Réacteur à impulsion',
    description: 'Propulsion avancée.',
    baseCost: { metal: 2000, crystal: 4000, deuterium: 600 },
    costFactor: 2,
    levelColumn: 'impulse',
    prerequisites: {
      buildings: [{ buildingId: 'researchLab', level: 2 }],
      research: [{ researchId: 'energyTech', level: 1 }],
    },
  },
  hyperspaceDrive: {
    id: 'hyperspaceDrive',
    name: 'Propulsion hyperespace',
    description: 'Propulsion la plus rapide.',
    baseCost: { metal: 10000, crystal: 20000, deuterium: 6000 },
    costFactor: 2,
    levelColumn: 'hyperspaceDrive',
    prerequisites: {
      buildings: [{ buildingId: 'researchLab', level: 7 }],
      research: [
        { researchId: 'energyTech', level: 5 },
        { researchId: 'shielding', level: 5 },
      ],
    },
  },
  weapons: {
    id: 'weapons',
    name: 'Technologie Armes',
    description: 'Augmente les dégâts de 10% par niveau.',
    baseCost: { metal: 800, crystal: 200, deuterium: 0 },
    costFactor: 2,
    levelColumn: 'weapons',
    prerequisites: { buildings: [{ buildingId: 'researchLab', level: 4 }] },
  },
  shielding: {
    id: 'shielding',
    name: 'Technologie Bouclier',
    description: 'Augmente les boucliers de 10% par niveau.',
    baseCost: { metal: 200, crystal: 600, deuterium: 0 },
    costFactor: 2,
    levelColumn: 'shielding',
    prerequisites: {
      buildings: [{ buildingId: 'researchLab', level: 6 }],
      research: [{ researchId: 'energyTech', level: 3 }],
    },
  },
  armor: {
    id: 'armor',
    name: 'Technologie Protection',
    description: 'Augmente la coque de 10% par niveau.',
    baseCost: { metal: 1000, crystal: 0, deuterium: 0 },
    costFactor: 2,
    levelColumn: 'armor',
    prerequisites: { buildings: [{ buildingId: 'researchLab', level: 2 }] },
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/game-engine/src/constants/research.ts
git commit -m "feat(game-engine): add research definitions constants"
```

---

### Task 2: Constantes des vaisseaux

**Files:**
- Create: `packages/game-engine/src/constants/ships.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
// packages/game-engine/src/constants/ships.ts

export type ShipId =
  | 'smallCargo'
  | 'largeCargo'
  | 'lightFighter'
  | 'heavyFighter'
  | 'cruiser'
  | 'battleship'
  | 'espionageProbe'
  | 'colonyShip'
  | 'recycler';

export interface ShipDefinition {
  id: ShipId;
  name: string;
  description: string;
  cost: { metal: number; crystal: number; deuterium: number };
  /** Colonne correspondante dans la table planet_ships */
  countColumn: string;
  prerequisites: {
    buildings?: { buildingId: string; level: number }[];
    research?: { researchId: string; level: number }[];
  };
}

export const SHIPS: Record<ShipId, ShipDefinition> = {
  smallCargo: {
    id: 'smallCargo',
    name: 'Petit transporteur',
    description: 'Transport léger de ressources.',
    cost: { metal: 2000, crystal: 2000, deuterium: 0 },
    countColumn: 'smallCargo',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 2 }],
      research: [{ researchId: 'combustion', level: 2 }],
    },
  },
  largeCargo: {
    id: 'largeCargo',
    name: 'Grand transporteur',
    description: 'Transport lourd de ressources.',
    cost: { metal: 6000, crystal: 6000, deuterium: 0 },
    countColumn: 'largeCargo',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 4 }],
      research: [{ researchId: 'combustion', level: 6 }],
    },
  },
  lightFighter: {
    id: 'lightFighter',
    name: 'Chasseur léger',
    description: 'Vaisseau de combat de base.',
    cost: { metal: 3000, crystal: 1000, deuterium: 0 },
    countColumn: 'lightFighter',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 1 }],
      research: [{ researchId: 'combustion', level: 1 }],
    },
  },
  heavyFighter: {
    id: 'heavyFighter',
    name: 'Chasseur lourd',
    description: 'Vaisseau de combat amélioré.',
    cost: { metal: 6000, crystal: 4000, deuterium: 0 },
    countColumn: 'heavyFighter',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 3 }],
      research: [
        { researchId: 'armor', level: 2 },
        { researchId: 'impulse', level: 2 },
      ],
    },
  },
  cruiser: {
    id: 'cruiser',
    name: 'Croiseur',
    description: 'Vaisseau de guerre polyvalent.',
    cost: { metal: 20000, crystal: 7000, deuterium: 2000 },
    countColumn: 'cruiser',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 5 }],
      research: [
        { researchId: 'impulse', level: 4 },
        { researchId: 'weapons', level: 3 },
      ],
    },
  },
  battleship: {
    id: 'battleship',
    name: 'Vaisseau de bataille',
    description: 'Puissant navire de guerre.',
    cost: { metal: 45000, crystal: 15000, deuterium: 0 },
    countColumn: 'battleship',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 7 }],
      research: [{ researchId: 'hyperspaceDrive', level: 4 }],
    },
  },
  espionageProbe: {
    id: 'espionageProbe',
    name: 'Sonde d\'espionnage',
    description: 'Sonde rapide pour espionner.',
    cost: { metal: 0, crystal: 1000, deuterium: 0 },
    countColumn: 'espionageProbe',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 3 }],
      research: [
        { researchId: 'combustion', level: 3 },
        { researchId: 'espionageTech', level: 2 },
      ],
    },
  },
  colonyShip: {
    id: 'colonyShip',
    name: 'Vaisseau de colonisation',
    description: 'Colonise de nouvelles planètes.',
    cost: { metal: 10000, crystal: 20000, deuterium: 10000 },
    countColumn: 'colonyShip',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 4 }],
      research: [{ researchId: 'impulse', level: 3 }],
    },
  },
  recycler: {
    id: 'recycler',
    name: 'Recycleur',
    description: 'Collecte les champs de débris.',
    cost: { metal: 10000, crystal: 6000, deuterium: 2000 },
    countColumn: 'recycler',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 4 }],
      research: [
        { researchId: 'combustion', level: 6 },
        { researchId: 'shielding', level: 2 },
      ],
    },
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/game-engine/src/constants/ships.ts
git commit -m "feat(game-engine): add ship definitions constants"
```

---

### Task 3: Constantes des défenses

**Files:**
- Create: `packages/game-engine/src/constants/defenses.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
// packages/game-engine/src/constants/defenses.ts

export type DefenseId =
  | 'rocketLauncher'
  | 'lightLaser'
  | 'heavyLaser'
  | 'gaussCannon'
  | 'plasmaTurret'
  | 'smallShield'
  | 'largeShield';

export interface DefenseDefinition {
  id: DefenseId;
  name: string;
  description: string;
  cost: { metal: number; crystal: number; deuterium: number };
  /** Colonne correspondante dans la table planet_defenses */
  countColumn: string;
  /** max 1 pour boucliers */
  maxPerPlanet?: number;
  prerequisites: {
    buildings?: { buildingId: string; level: number }[];
    research?: { researchId: string; level: number }[];
  };
}

export const DEFENSES: Record<DefenseId, DefenseDefinition> = {
  rocketLauncher: {
    id: 'rocketLauncher',
    name: 'Lanceur de missiles',
    description: 'Défense de base, peu coûteuse.',
    cost: { metal: 2000, crystal: 0, deuterium: 0 },
    countColumn: 'rocketLauncher',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 1 }],
    },
  },
  lightLaser: {
    id: 'lightLaser',
    name: 'Artillerie laser légère',
    description: 'Défense laser de base.',
    cost: { metal: 1500, crystal: 500, deuterium: 0 },
    countColumn: 'lightLaser',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 2 }],
      research: [{ researchId: 'energyTech', level: 1 }],
    },
  },
  heavyLaser: {
    id: 'heavyLaser',
    name: 'Artillerie laser lourde',
    description: 'Défense laser puissante.',
    cost: { metal: 6000, crystal: 2000, deuterium: 0 },
    countColumn: 'heavyLaser',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 4 }],
      research: [
        { researchId: 'energyTech', level: 3 },
        { researchId: 'shielding', level: 1 },
      ],
    },
  },
  gaussCannon: {
    id: 'gaussCannon',
    name: 'Canon de Gauss',
    description: 'Défense balistique puissante.',
    cost: { metal: 20000, crystal: 15000, deuterium: 2000 },
    countColumn: 'gaussCannon',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 6 }],
      research: [
        { researchId: 'energyTech', level: 6 },
        { researchId: 'weapons', level: 3 },
        { researchId: 'shielding', level: 1 },
      ],
    },
  },
  plasmaTurret: {
    id: 'plasmaTurret',
    name: 'Artillerie à ions',
    description: 'Défense plasma dévastatrice.',
    cost: { metal: 50000, crystal: 50000, deuterium: 30000 },
    countColumn: 'plasmaTurret',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 8 }],
      research: [
        { researchId: 'energyTech', level: 8 },
        { researchId: 'weapons', level: 7 },
      ],
    },
  },
  smallShield: {
    id: 'smallShield',
    name: 'Petit bouclier',
    description: 'Bouclier planétaire de base.',
    cost: { metal: 10000, crystal: 10000, deuterium: 0 },
    countColumn: 'smallShield',
    maxPerPlanet: 1,
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 1 }],
      research: [{ researchId: 'shielding', level: 2 }],
    },
  },
  largeShield: {
    id: 'largeShield',
    name: 'Grand bouclier',
    description: 'Bouclier planétaire avancé.',
    cost: { metal: 50000, crystal: 50000, deuterium: 0 },
    countColumn: 'largeShield',
    maxPerPlanet: 1,
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 4 }],
      research: [{ researchId: 'shielding', level: 6 }],
    },
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/game-engine/src/constants/defenses.ts
git commit -m "feat(game-engine): add defense definitions constants"
```

---

## Chunk 2: Game Engine — Formules Coûts/Temps + Prérequis

### Task 4: Formules coûts et temps de recherche

**Files:**
- Create: `packages/game-engine/src/formulas/research-cost.ts`
- Create: `packages/game-engine/src/formulas/research-cost.test.ts`

- [ ] **Step 1: Écrire les tests**

```typescript
// packages/game-engine/src/formulas/research-cost.test.ts
import { describe, it, expect } from 'vitest';
import { researchCost, researchTime } from './research-cost.js';

describe('researchCost', () => {
  it('espionage tech level 1 costs 200/1000/200', () => {
    const cost = researchCost('espionageTech', 1);
    expect(cost).toEqual({ metal: 200, crystal: 1000, deuterium: 200 });
  });

  it('espionage tech level 4 costs base * 2^3', () => {
    const cost = researchCost('espionageTech', 4);
    // 200*8=1600, 1000*8=8000, 200*8=1600
    expect(cost).toEqual({ metal: 1600, crystal: 8000, deuterium: 1600 });
  });

  it('weapons tech level 1', () => {
    const cost = researchCost('weapons', 1);
    expect(cost).toEqual({ metal: 800, crystal: 200, deuterium: 0 });
  });

  it('computer tech level 3', () => {
    const cost = researchCost('computerTech', 3);
    // 0*4=0, 400*4=1600, 600*4=2400
    expect(cost).toEqual({ metal: 0, crystal: 1600, deuterium: 2400 });
  });
});

describe('researchTime', () => {
  it('espionage tech level 1, lab 3', () => {
    // (200+1000) / (1000 * (1 + 3)) * 3600 = 1200/4000*3600 = 1080s
    const time = researchTime('espionageTech', 1, 3);
    expect(time).toBe(1080);
  });

  it('weapons tech level 1, lab 4', () => {
    // (800+200) / (1000 * (1 + 4)) * 3600 = 1000/5000*3600 = 720s
    const time = researchTime('weapons', 1, 4);
    expect(time).toBe(720);
  });

  it('espionage tech level 4, lab 3', () => {
    // cost: 1600+8000 = 9600
    // 9600 / (1000 * 4) * 3600 = 8640s
    const time = researchTime('espionageTech', 4, 3);
    expect(time).toBe(8640);
  });

  it('minimum time is 1 second', () => {
    const time = researchTime('computerTech', 1, 1000);
    expect(time).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Lancer les tests — vérifier qu'ils échouent**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --run
```
Expected: FAIL — `researchCost` not found

- [ ] **Step 3: Implémenter**

```typescript
// packages/game-engine/src/formulas/research-cost.ts
import { RESEARCH } from '../constants/research.js';
import type { ResearchId } from '../constants/research.js';
import type { ResourceCost } from './building-cost.js';

/**
 * Cost to research a tech at a given level.
 * Formula: baseCost * costFactor^(level-1)
 */
export function researchCost(researchId: ResearchId, level: number): ResourceCost {
  const def = RESEARCH[researchId];
  const factor = Math.pow(def.costFactor, level - 1);
  return {
    metal: Math.floor(def.baseCost.metal * factor),
    crystal: Math.floor(def.baseCost.crystal * factor),
    deuterium: Math.floor(def.baseCost.deuterium * factor),
  };
}

/**
 * Research time in seconds.
 * Formula: (metalCost + crystalCost) / (1000 * (1 + labLevel)) * 3600
 * Minimum 1 second.
 */
export function researchTime(researchId: ResearchId, level: number, labLevel: number): number {
  const cost = researchCost(researchId, level);
  const seconds = Math.floor(((cost.metal + cost.crystal) / (1000 * (1 + labLevel))) * 3600);
  return Math.max(1, seconds);
}
```

- [ ] **Step 4: Lancer les tests — vérifier que tout passe**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --run
```
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/formulas/research-cost.ts packages/game-engine/src/formulas/research-cost.test.ts
git commit -m "feat(game-engine): add research cost and time formulas with tests"
```

---

### Task 5: Formules coûts et temps vaisseaux/défenses

**Files:**
- Create: `packages/game-engine/src/formulas/shipyard-cost.ts`
- Create: `packages/game-engine/src/formulas/shipyard-cost.test.ts`

- [ ] **Step 1: Écrire les tests**

```typescript
// packages/game-engine/src/formulas/shipyard-cost.test.ts
import { describe, it, expect } from 'vitest';
import { shipCost, shipTime, defenseCost, defenseTime } from './shipyard-cost.js';

describe('shipCost', () => {
  it('light fighter costs 3000/1000/0', () => {
    expect(shipCost('lightFighter')).toEqual({ metal: 3000, crystal: 1000, deuterium: 0 });
  });

  it('cruiser costs 20000/7000/2000', () => {
    expect(shipCost('cruiser')).toEqual({ metal: 20000, crystal: 7000, deuterium: 2000 });
  });
});

describe('shipTime', () => {
  it('light fighter, shipyard 1 = (3000+1000)/(2500*(1+1))*3600 = 2880s', () => {
    expect(shipTime('lightFighter', 1)).toBe(2880);
  });

  it('light fighter, shipyard 5 = (4000)/(2500*6)*3600 = 960s', () => {
    expect(shipTime('lightFighter', 5)).toBe(960);
  });

  it('cruiser, shipyard 5 = (27000)/(2500*6)*3600 = 6480s', () => {
    expect(shipTime('cruiser', 5)).toBe(6480);
  });

  it('minimum time is 1 second', () => {
    expect(shipTime('espionageProbe', 1000)).toBeGreaterThanOrEqual(1);
  });
});

describe('defenseCost', () => {
  it('rocket launcher costs 2000/0/0', () => {
    expect(defenseCost('rocketLauncher')).toEqual({ metal: 2000, crystal: 0, deuterium: 0 });
  });

  it('gauss cannon costs 20000/15000/2000', () => {
    expect(defenseCost('gaussCannon')).toEqual({ metal: 20000, crystal: 15000, deuterium: 2000 });
  });
});

describe('defenseTime', () => {
  it('rocket launcher, shipyard 1 = (2000)/(2500*2)*3600 = 1440s', () => {
    expect(defenseTime('rocketLauncher', 1)).toBe(1440);
  });

  it('gauss cannon, shipyard 6 = (35000)/(2500*7)*3600 = 7200s', () => {
    expect(defenseTime('gaussCannon', 6)).toBe(7200);
  });
});
```

- [ ] **Step 2: Lancer les tests — vérifier qu'ils échouent**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --run
```

- [ ] **Step 3: Implémenter**

```typescript
// packages/game-engine/src/formulas/shipyard-cost.ts
import { SHIPS } from '../constants/ships.js';
import { DEFENSES } from '../constants/defenses.js';
import type { ShipId } from '../constants/ships.js';
import type { DefenseId } from '../constants/defenses.js';
import type { ResourceCost } from './building-cost.js';

/** Ship cost is fixed (not level-based). */
export function shipCost(shipId: ShipId): ResourceCost {
  return { ...SHIPS[shipId].cost };
}

/**
 * Ship construction time per unit in seconds.
 * Formula: (metalCost + crystalCost) / (2500 * (1 + shipyardLevel)) * 3600
 * Minimum 1 second.
 */
export function shipTime(shipId: ShipId, shipyardLevel: number): number {
  const cost = SHIPS[shipId].cost;
  const seconds = Math.floor(((cost.metal + cost.crystal) / (2500 * (1 + shipyardLevel))) * 3600);
  return Math.max(1, seconds);
}

/** Defense cost is fixed (not level-based). */
export function defenseCost(defenseId: DefenseId): ResourceCost {
  return { ...DEFENSES[defenseId].cost };
}

/**
 * Defense construction time per unit in seconds.
 * Same formula as ships.
 */
export function defenseTime(defenseId: DefenseId, shipyardLevel: number): number {
  const cost = DEFENSES[defenseId].cost;
  const seconds = Math.floor(((cost.metal + cost.crystal) / (2500 * (1 + shipyardLevel))) * 3600);
  return Math.max(1, seconds);
}
```

- [ ] **Step 4: Lancer les tests — vérifier que tout passe**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --run
```

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/formulas/shipyard-cost.ts packages/game-engine/src/formulas/shipyard-cost.test.ts
git commit -m "feat(game-engine): add ship and defense cost/time formulas with tests"
```

---

### Task 6: Système de prérequis

**Files:**
- Create: `packages/game-engine/src/prerequisites/prerequisites.ts`
- Create: `packages/game-engine/src/prerequisites/prerequisites.test.ts`

- [ ] **Step 1: Écrire les tests**

```typescript
// packages/game-engine/src/prerequisites/prerequisites.test.ts
import { describe, it, expect } from 'vitest';
import { checkResearchPrerequisites, checkShipPrerequisites, checkDefensePrerequisites } from './prerequisites.js';

describe('checkResearchPrerequisites', () => {
  it('espionage tech requires research lab 3', () => {
    const result = checkResearchPrerequisites('espionageTech', { researchLabLevel: 2 }, {});
    expect(result.met).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('espionage tech passes with lab 3', () => {
    const result = checkResearchPrerequisites('espionageTech', { researchLabLevel: 3 }, {});
    expect(result.met).toBe(true);
  });

  it('combustion requires energy tech 1 + lab 1', () => {
    const result = checkResearchPrerequisites('combustion', { researchLabLevel: 1 }, { energyTech: 0 });
    expect(result.met).toBe(false);
  });

  it('combustion passes with energy tech 1 + lab 1', () => {
    const result = checkResearchPrerequisites('combustion', { researchLabLevel: 1 }, { energyTech: 1 });
    expect(result.met).toBe(true);
  });
});

describe('checkShipPrerequisites', () => {
  it('light fighter requires shipyard 1 + combustion 1', () => {
    const result = checkShipPrerequisites('lightFighter', { shipyardLevel: 0 }, {});
    expect(result.met).toBe(false);
  });

  it('light fighter passes', () => {
    const result = checkShipPrerequisites('lightFighter', { shipyardLevel: 1 }, { combustion: 1 });
    expect(result.met).toBe(true);
  });

  it('cruiser needs shipyard 5 + impulse 4 + weapons 3', () => {
    const result = checkShipPrerequisites('cruiser', { shipyardLevel: 5 }, { impulse: 3, weapons: 3 });
    expect(result.met).toBe(false);
  });

  it('cruiser passes', () => {
    const result = checkShipPrerequisites('cruiser', { shipyardLevel: 5 }, { impulse: 4, weapons: 3 });
    expect(result.met).toBe(true);
  });
});

describe('checkDefensePrerequisites', () => {
  it('rocket launcher requires shipyard 1', () => {
    const result = checkDefensePrerequisites('rocketLauncher', { shipyardLevel: 0 }, {});
    expect(result.met).toBe(false);
  });

  it('rocket launcher passes', () => {
    const result = checkDefensePrerequisites('rocketLauncher', { shipyardLevel: 1 }, {});
    expect(result.met).toBe(true);
  });

  it('gauss cannon needs shipyard 6 + energy 6 + weapons 3 + shielding 1', () => {
    const result = checkDefensePrerequisites('gaussCannon', { shipyardLevel: 6 }, { energyTech: 6, weapons: 2, shielding: 1 });
    expect(result.met).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer les tests — vérifier qu'ils échouent**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --run
```

- [ ] **Step 3: Implémenter**

```typescript
// packages/game-engine/src/prerequisites/prerequisites.ts
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

/** Building levels relevant for prerequisites */
interface BuildingLevels {
  [key: string]: number;
}

/** Research levels relevant for prerequisites */
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
```

- [ ] **Step 4: Lancer les tests — vérifier que tout passe**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --run
```

- [ ] **Step 5: Mettre à jour l'index game-engine**

Ajouter dans `packages/game-engine/src/index.ts` :
```typescript
export * from './constants/research.js';
export * from './constants/ships.js';
export * from './constants/defenses.js';
export * from './formulas/research-cost.js';
export * from './formulas/shipyard-cost.js';
export * from './prerequisites/prerequisites.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine/src/prerequisites/ packages/game-engine/src/index.ts
git commit -m "feat(game-engine): add prerequisite system for research, ships, and defenses"
```

---

## Chunk 3: Schema DB + Modules API Research/Shipyard

### Task 7: Schema planet_ships et planet_defenses

**Files:**
- Create: `packages/db/src/schema/planet-ships.ts`
- Create: `packages/db/src/schema/planet-defenses.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Créer planet_ships**

```typescript
// packages/db/src/schema/planet-ships.ts
import { pgTable, uuid, integer } from 'drizzle-orm/pg-core';
import { planets } from './planets.js';

export const planetShips = pgTable('planet_ships', {
  planetId: uuid('planet_id')
    .primaryKey()
    .references(() => planets.id, { onDelete: 'cascade' }),
  smallCargo: integer('small_cargo').notNull().default(0),
  largeCargo: integer('large_cargo').notNull().default(0),
  lightFighter: integer('light_fighter').notNull().default(0),
  heavyFighter: integer('heavy_fighter').notNull().default(0),
  cruiser: integer('cruiser').notNull().default(0),
  battleship: integer('battleship').notNull().default(0),
  espionageProbe: integer('espionage_probe').notNull().default(0),
  colonyShip: integer('colony_ship').notNull().default(0),
  recycler: integer('recycler').notNull().default(0),
});
```

- [ ] **Step 2: Créer planet_defenses**

```typescript
// packages/db/src/schema/planet-defenses.ts
import { pgTable, uuid, integer } from 'drizzle-orm/pg-core';
import { planets } from './planets.js';

export const planetDefenses = pgTable('planet_defenses', {
  planetId: uuid('planet_id')
    .primaryKey()
    .references(() => planets.id, { onDelete: 'cascade' }),
  rocketLauncher: integer('rocket_launcher').notNull().default(0),
  lightLaser: integer('light_laser').notNull().default(0),
  heavyLaser: integer('heavy_laser').notNull().default(0),
  gaussCannon: integer('gauss_cannon').notNull().default(0),
  plasmaTurret: integer('plasma_turret').notNull().default(0),
  smallShield: integer('small_shield').notNull().default(0),
  largeShield: integer('large_shield').notNull().default(0),
});
```

- [ ] **Step 3: Mettre à jour l'index DB**

Ajouter dans `packages/db/src/schema/index.ts` :
```typescript
export * from './planet-ships.js';
export * from './planet-defenses.js';
```

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/planet-ships.ts packages/db/src/schema/planet-defenses.ts packages/db/src/schema/index.ts
git commit -m "feat(db): add planet_ships and planet_defenses schemas"
```

---

### Task 8: Module research service

**Files:**
- Create: `apps/api/src/modules/research/research.service.ts`

- [ ] **Step 1: Implémenter**

```typescript
// apps/api/src/modules/research/research.service.ts
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, userResearch, buildQueue } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import {
  RESEARCH,
  researchCost,
  researchTime,
  checkResearchPrerequisites,
  type ResearchId,
} from '@ogame-clone/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { Queue } from 'bullmq';

const RESEARCH_LEVEL_COLUMNS: Record<ResearchId, keyof typeof userResearch.$inferSelect> = {
  espionageTech: 'espionageTech',
  computerTech: 'computerTech',
  energyTech: 'energyTech',
  combustion: 'combustion',
  impulse: 'impulse',
  hyperspaceDrive: 'hyperspaceDrive',
  weapons: 'weapons',
  shielding: 'shielding',
  armor: 'armor',
};

export function createResearchService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  researchQueue: Queue,
) {
  return {
    async listResearch(userId: string, planetId: string) {
      const planet = await this.getOwnedPlanet(userId, planetId);
      const research = await this.getOrCreateResearch(userId);

      // Check if there's an active research (global, 1 per user)
      const [activeResearch] = await db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.userId, userId),
            eq(buildQueue.type, 'research'),
            eq(buildQueue.status, 'active'),
          ),
        )
        .limit(1);

      return Object.values(RESEARCH).map((def) => {
        const currentLevel = (research[RESEARCH_LEVEL_COLUMNS[def.id]] ?? 0) as number;
        const nextLevel = currentLevel + 1;
        const cost = researchCost(def.id, nextLevel);
        const time = researchTime(def.id, nextLevel, planet.researchLabLevel);

        const buildingLevels: Record<string, number> = {
          researchLabLevel: planet.researchLabLevel,
          shipyardLevel: planet.shipyardLevel,
        };
        const researchLevels: Record<string, number> = {};
        for (const [key, col] of Object.entries(RESEARCH_LEVEL_COLUMNS)) {
          researchLevels[key] = (research[col] ?? 0) as number;
        }
        const prereqCheck = checkResearchPrerequisites(def.id, buildingLevels, researchLevels);

        return {
          id: def.id,
          name: def.name,
          description: def.description,
          currentLevel,
          nextLevelCost: cost,
          nextLevelTime: time,
          prerequisitesMet: prereqCheck.met,
          missingPrerequisites: prereqCheck.missing,
          isResearching: activeResearch?.itemId === def.id,
          researchEndTime: activeResearch?.itemId === def.id ? activeResearch.endTime.toISOString() : null,
        };
      });
    },

    async startResearch(userId: string, planetId: string, researchId: ResearchId) {
      const planet = await this.getOwnedPlanet(userId, planetId);
      const research = await this.getOrCreateResearch(userId);

      // Check no active research for this user (global queue)
      const [activeResearch] = await db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.userId, userId),
            eq(buildQueue.type, 'research'),
            eq(buildQueue.status, 'active'),
          ),
        )
        .limit(1);

      if (activeResearch) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Recherche déjà en cours' });
      }

      // Check prerequisites
      const buildingLevels: Record<string, number> = {
        researchLabLevel: planet.researchLabLevel,
        shipyardLevel: planet.shipyardLevel,
      };
      const researchLevels: Record<string, number> = {};
      for (const [key, col] of Object.entries(RESEARCH_LEVEL_COLUMNS)) {
        researchLevels[key] = (research[col] ?? 0) as number;
      }
      const prereqCheck = checkResearchPrerequisites(researchId, buildingLevels, researchLevels);
      if (!prereqCheck.met) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Prérequis non remplis: ${prereqCheck.missing.join(', ')}` });
      }

      const currentLevel = (research[RESEARCH_LEVEL_COLUMNS[researchId]] ?? 0) as number;
      const nextLevel = currentLevel + 1;
      const cost = researchCost(researchId, nextLevel);
      const time = researchTime(researchId, nextLevel, planet.researchLabLevel);

      // Spend resources from the planet where the lab is
      await resourceService.spendResources(planetId, userId, cost);

      const now = new Date();
      const endTime = new Date(now.getTime() + time * 1000);

      const [entry] = await db
        .insert(buildQueue)
        .values({
          planetId,
          userId,
          type: 'research',
          itemId: researchId,
          startTime: now,
          endTime,
          status: 'active',
        })
        .returning();

      await researchQueue.add(
        'complete',
        { buildQueueId: entry.id },
        { delay: time * 1000, jobId: `research-${entry.id}` },
      );

      return { entry, endTime: endTime.toISOString(), researchTime: time };
    },

    async cancelResearch(userId: string) {
      const [activeResearch] = await db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.userId, userId),
            eq(buildQueue.type, 'research'),
            eq(buildQueue.status, 'active'),
          ),
        )
        .limit(1);

      if (!activeResearch) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucune recherche en cours' });
      }

      const research = await this.getOrCreateResearch(userId);
      const researchId = activeResearch.itemId as ResearchId;
      const currentLevel = (research[RESEARCH_LEVEL_COLUMNS[researchId]] ?? 0) as number;
      const cost = researchCost(researchId, currentLevel + 1);

      // Refund to the planet where research was started
      const [planet] = await db
        .select()
        .from(planets)
        .where(eq(planets.id, activeResearch.planetId))
        .limit(1);

      if (planet) {
        await db
          .update(planets)
          .set({
            metal: String(Number(planet.metal) + cost.metal),
            crystal: String(Number(planet.crystal) + cost.crystal),
            deuterium: String(Number(planet.deuterium) + cost.deuterium),
          })
          .where(eq(planets.id, planet.id));
      }

      await researchQueue.remove(`research-${activeResearch.id}`);
      await db.delete(buildQueue).where(eq(buildQueue.id, activeResearch.id));

      return { cancelled: true };
    },

    async completeResearch(buildQueueId: string) {
      const [entry] = await db
        .select()
        .from(buildQueue)
        .where(and(eq(buildQueue.id, buildQueueId), eq(buildQueue.status, 'active')))
        .limit(1);

      if (!entry) return null;

      const researchId = entry.itemId as ResearchId;
      const columnKey = RESEARCH_LEVEL_COLUMNS[researchId];
      const research = await this.getOrCreateResearch(entry.userId);
      const newLevel = ((research[columnKey] ?? 0) as number) + 1;

      await db
        .update(userResearch)
        .set({ [columnKey]: newLevel })
        .where(eq(userResearch.userId, entry.userId));

      await db
        .update(buildQueue)
        .set({ status: 'completed' })
        .where(eq(buildQueue.id, buildQueueId));

      return { researchId, newLevel };
    },

    async getOrCreateResearch(userId: string) {
      const [existing] = await db
        .select()
        .from(userResearch)
        .where(eq(userResearch.userId, userId))
        .limit(1);

      if (existing) return existing;

      const [created] = await db
        .insert(userResearch)
        .values({ userId })
        .returning();

      return created;
    },

    async getOwnedPlanet(userId: string, planetId: string) {
      const [planet] = await db
        .select()
        .from(planets)
        .where(and(eq(planets.id, planetId), eq(planets.userId, userId)))
        .limit(1);

      if (!planet) throw new TRPCError({ code: 'NOT_FOUND' });
      return planet;
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/research/research.service.ts
git commit -m "feat(api): add research service"
```

---

### Task 9: Module research router

**Files:**
- Create: `apps/api/src/modules/research/research.router.ts`

- [ ] **Step 1: Créer le router**

```typescript
// apps/api/src/modules/research/research.router.ts
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createResearchService } from './research.service.js';
import type { ResearchId } from '@ogame-clone/game-engine';

const researchIds = [
  'espionageTech', 'computerTech', 'energyTech',
  'combustion', 'impulse', 'hyperspaceDrive',
  'weapons', 'shielding', 'armor',
] as const;

export function createResearchRouter(researchService: ReturnType<typeof createResearchService>) {
  return router({
    list: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return researchService.listResearch(ctx.userId!, input.planetId);
      }),

    start: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        researchId: z.enum(researchIds),
      }))
      .mutation(async ({ ctx, input }) => {
        return researchService.startResearch(ctx.userId!, input.planetId, input.researchId as ResearchId);
      }),

    cancel: protectedProcedure
      .mutation(async ({ ctx }) => {
        return researchService.cancelResearch(ctx.userId!);
      }),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/research/research.router.ts
git commit -m "feat(api): add research router"
```

---

### Task 10: Module shipyard service

**Files:**
- Create: `apps/api/src/modules/shipyard/shipyard.service.ts`

- [ ] **Step 1: Implémenter**

Ce service gère la queue séquentielle du chantier. Les vaisseaux/défenses sont construits un par un. `completed_count` track la progression.

```typescript
// apps/api/src/modules/shipyard/shipyard.service.ts
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, planetDefenses, buildQueue } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import {
  SHIPS,
  DEFENSES,
  shipCost,
  shipTime,
  defenseCost,
  defenseTime,
  checkShipPrerequisites,
  checkDefensePrerequisites,
  type ShipId,
  type DefenseId,
} from '@ogame-clone/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { Queue } from 'bullmq';

export function createShipyardService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  shipyardQueue: Queue,
) {
  return {
    async listShips(userId: string, planetId: string) {
      const planet = await this.getOwnedPlanet(userId, planetId);
      const ships = await this.getOrCreateShips(planetId);
      const research = await this.getResearchLevels(userId);

      const buildingLevels: Record<string, number> = {
        shipyardLevel: planet.shipyardLevel,
        roboticsLevel: planet.roboticsLevel,
      };

      return Object.values(SHIPS).map((def) => {
        const count = (ships[def.countColumn as keyof typeof ships] ?? 0) as number;
        const prereqCheck = checkShipPrerequisites(def.id, buildingLevels, research);
        const cost = shipCost(def.id);
        const time = shipTime(def.id, planet.shipyardLevel);

        return {
          id: def.id,
          name: def.name,
          description: def.description,
          count,
          cost,
          timePerUnit: time,
          prerequisitesMet: prereqCheck.met,
          missingPrerequisites: prereqCheck.missing,
        };
      });
    },

    async listDefenses(userId: string, planetId: string) {
      const planet = await this.getOwnedPlanet(userId, planetId);
      const defenses = await this.getOrCreateDefenses(planetId);
      const research = await this.getResearchLevels(userId);

      const buildingLevels: Record<string, number> = {
        shipyardLevel: planet.shipyardLevel,
        roboticsLevel: planet.roboticsLevel,
      };

      return Object.values(DEFENSES).map((def) => {
        const count = (defenses[def.countColumn as keyof typeof defenses] ?? 0) as number;
        const prereqCheck = checkDefensePrerequisites(def.id, buildingLevels, research);
        const cost = defenseCost(def.id);
        const time = defenseTime(def.id, planet.shipyardLevel);

        return {
          id: def.id,
          name: def.name,
          description: def.description,
          count,
          cost,
          timePerUnit: time,
          maxPerPlanet: def.maxPerPlanet,
          prerequisitesMet: prereqCheck.met,
          missingPrerequisites: prereqCheck.missing,
        };
      });
    },

    async getShipyardQueue(planetId: string) {
      return db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.planetId, planetId),
            eq(buildQueue.status, 'active'),
          ),
        )
        .then((rows) => rows.filter((r) => r.type === 'ship' || r.type === 'defense'));
    },

    /**
     * Start building ships or defenses.
     * Adds a batch to the queue. If no active batch, schedules the first unit immediately.
     */
    async startBuild(
      userId: string,
      planetId: string,
      type: 'ship' | 'defense',
      itemId: string,
      quantity: number,
    ) {
      const planet = await this.getOwnedPlanet(userId, planetId);

      // Calculate total cost
      const unitCost = type === 'ship'
        ? shipCost(itemId as ShipId)
        : defenseCost(itemId as DefenseId);

      const totalCost = {
        metal: unitCost.metal * quantity,
        crystal: unitCost.crystal * quantity,
        deuterium: unitCost.deuterium * quantity,
      };

      // Check max per planet for defenses (shields)
      if (type === 'defense') {
        const def = DEFENSES[itemId as DefenseId];
        if (def.maxPerPlanet) {
          const defenses = await this.getOrCreateDefenses(planetId);
          const current = (defenses[def.countColumn as keyof typeof defenses] ?? 0) as number;
          if (current + quantity > def.maxPerPlanet) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Maximum ${def.maxPerPlanet} ${def.name} par planète`,
            });
          }
        }
      }

      // Spend total resources
      await resourceService.spendResources(planetId, userId, totalCost);

      // Check if there's already an active shipyard batch
      const existingActive = await this.getShipyardQueue(planetId);
      const hasActive = existingActive.some((e) => e.status === 'active');

      const unitTime = type === 'ship'
        ? shipTime(itemId as ShipId, planet.shipyardLevel)
        : defenseTime(itemId as DefenseId, planet.shipyardLevel);

      const now = new Date();
      const status = hasActive ? 'queued' : 'active';
      const startTime = hasActive ? now : now; // queued batches start when previous finishes
      const endTime = hasActive
        ? new Date(now.getTime() + unitTime * 1000) // placeholder, recalculated when activated
        : new Date(now.getTime() + unitTime * 1000);

      const [entry] = await db
        .insert(buildQueue)
        .values({
          planetId,
          userId,
          type,
          itemId,
          quantity,
          completedCount: 0,
          startTime,
          endTime,
          status,
        })
        .returning();

      // If this is the first/only active batch, schedule the first unit
      if (!hasActive) {
        await shipyardQueue.add(
          'complete-unit',
          { buildQueueId: entry.id },
          { delay: unitTime * 1000, jobId: `shipyard-${entry.id}-1` },
        );
      }

      return { entry, unitTime };
    },

    /**
     * Complete one unit in the shipyard queue.
     * Called by the worker. Increments completed_count, adds unit to planet.
     * Schedules next unit or activates next batch.
     */
    async completeUnit(buildQueueId: string) {
      const [entry] = await db
        .select()
        .from(buildQueue)
        .where(and(eq(buildQueue.id, buildQueueId), eq(buildQueue.status, 'active')))
        .limit(1);

      if (!entry) return null;

      const newCompletedCount = entry.completedCount + 1;

      // Add the unit to the planet
      if (entry.type === 'ship') {
        const ships = await this.getOrCreateShips(entry.planetId);
        const col = SHIPS[entry.itemId as ShipId].countColumn;
        const current = (ships[col as keyof typeof ships] ?? 0) as number;
        await db
          .update(planetShips)
          .set({ [col]: current + 1 })
          .where(eq(planetShips.planetId, entry.planetId));
      } else {
        const defenses = await this.getOrCreateDefenses(entry.planetId);
        const col = DEFENSES[entry.itemId as DefenseId].countColumn;
        const current = (defenses[col as keyof typeof defenses] ?? 0) as number;
        await db
          .update(planetDefenses)
          .set({ [col]: current + 1 })
          .where(eq(planetDefenses.planetId, entry.planetId));
      }

      if (newCompletedCount >= entry.quantity) {
        // Batch complete
        await db
          .update(buildQueue)
          .set({ completedCount: newCompletedCount, status: 'completed' })
          .where(eq(buildQueue.id, buildQueueId));

        // Activate next queued batch if any
        await this.activateNextBatch(entry.planetId);

        return { completed: true, itemId: entry.itemId, totalCompleted: newCompletedCount };
      }

      // More units to build — update count, schedule next
      const now = new Date();
      const [planet] = await db.select().from(planets).where(eq(planets.id, entry.planetId)).limit(1);
      const unitTime = entry.type === 'ship'
        ? shipTime(entry.itemId as ShipId, planet?.shipyardLevel ?? 0)
        : defenseTime(entry.itemId as DefenseId, planet?.shipyardLevel ?? 0);

      await db
        .update(buildQueue)
        .set({
          completedCount: newCompletedCount,
          endTime: new Date(now.getTime() + unitTime * 1000),
        })
        .where(eq(buildQueue.id, buildQueueId));

      await shipyardQueue.add(
        'complete-unit',
        { buildQueueId: entry.id },
        { delay: unitTime * 1000, jobId: `shipyard-${entry.id}-${newCompletedCount + 1}` },
      );

      return { completed: false, itemId: entry.itemId, totalCompleted: newCompletedCount };
    },

    async activateNextBatch(planetId: string) {
      // Find the next queued batch for this planet
      const [nextBatch] = await db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.planetId, planetId),
            eq(buildQueue.status, 'queued'),
          ),
        )
        .limit(1);

      if (!nextBatch) return;

      const [planet] = await db.select().from(planets).where(eq(planets.id, planetId)).limit(1);
      const unitTime = nextBatch.type === 'ship'
        ? shipTime(nextBatch.itemId as ShipId, planet?.shipyardLevel ?? 0)
        : defenseTime(nextBatch.itemId as DefenseId, planet?.shipyardLevel ?? 0);

      const now = new Date();
      await db
        .update(buildQueue)
        .set({
          status: 'active',
          startTime: now,
          endTime: new Date(now.getTime() + unitTime * 1000),
        })
        .where(eq(buildQueue.id, nextBatch.id));

      await shipyardQueue.add(
        'complete-unit',
        { buildQueueId: nextBatch.id },
        { delay: unitTime * 1000, jobId: `shipyard-${nextBatch.id}-1` },
      );
    },

    async cancelQueuedBatch(userId: string, planetId: string, batchId: string) {
      const [entry] = await db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.id, batchId),
            eq(buildQueue.userId, userId),
            eq(buildQueue.planetId, planetId),
            eq(buildQueue.status, 'queued'),
          ),
        )
        .limit(1);

      if (!entry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Batch non trouvé ou non annulable (en cours)' });
      }

      // Refund total cost for remaining units
      const unitCost = entry.type === 'ship'
        ? shipCost(entry.itemId as ShipId)
        : defenseCost(entry.itemId as DefenseId);
      const remaining = entry.quantity - entry.completedCount;
      const refund = {
        metal: unitCost.metal * remaining,
        crystal: unitCost.crystal * remaining,
        deuterium: unitCost.deuterium * remaining,
      };

      const [planet] = await db.select().from(planets).where(eq(planets.id, planetId)).limit(1);
      if (planet) {
        await db
          .update(planets)
          .set({
            metal: String(Number(planet.metal) + refund.metal),
            crystal: String(Number(planet.crystal) + refund.crystal),
            deuterium: String(Number(planet.deuterium) + refund.deuterium),
          })
          .where(eq(planets.id, planetId));
      }

      await db.delete(buildQueue).where(eq(buildQueue.id, batchId));

      return { cancelled: true };
    },

    async getOrCreateShips(planetId: string) {
      const [existing] = await db.select().from(planetShips).where(eq(planetShips.planetId, planetId)).limit(1);
      if (existing) return existing;
      const [created] = await db.insert(planetShips).values({ planetId }).returning();
      return created;
    },

    async getOrCreateDefenses(planetId: string) {
      const [existing] = await db.select().from(planetDefenses).where(eq(planetDefenses.planetId, planetId)).limit(1);
      if (existing) return existing;
      const [created] = await db.insert(planetDefenses).values({ planetId }).returning();
      return created;
    },

    async getResearchLevels(userId: string) {
      const [research] = await db.select().from(userResearch).where(eq(userResearch.userId, userId)).limit(1);
      const levels: Record<string, number> = {};
      if (research) {
        for (const key of Object.keys(research)) {
          if (key !== 'userId') levels[key] = research[key as keyof typeof research] as number;
        }
      }
      return levels;
    },

    async getOwnedPlanet(userId: string, planetId: string) {
      const [planet] = await db.select().from(planets).where(and(eq(planets.id, planetId), eq(planets.userId, userId))).limit(1);
      if (!planet) throw new TRPCError({ code: 'NOT_FOUND' });
      return planet;
    },
  };
}
```

Note : on importe `userResearch` depuis `@ogame-clone/db` — il est déjà exporté via `schema/index.ts`.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/shipyard/shipyard.service.ts
git commit -m "feat(api): add shipyard service with sequential queue"
```

---

### Task 11: Module shipyard router

**Files:**
- Create: `apps/api/src/modules/shipyard/shipyard.router.ts`

- [ ] **Step 1: Créer le router**

```typescript
// apps/api/src/modules/shipyard/shipyard.router.ts
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createShipyardService } from './shipyard.service.js';

const shipIds = [
  'smallCargo', 'largeCargo', 'lightFighter', 'heavyFighter',
  'cruiser', 'battleship', 'espionageProbe', 'colonyShip', 'recycler',
] as const;

const defenseIds = [
  'rocketLauncher', 'lightLaser', 'heavyLaser',
  'gaussCannon', 'plasmaTurret', 'smallShield', 'largeShield',
] as const;

export function createShipyardRouter(shipyardService: ReturnType<typeof createShipyardService>) {
  return router({
    ships: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return shipyardService.listShips(ctx.userId!, input.planetId);
      }),

    defenses: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return shipyardService.listDefenses(ctx.userId!, input.planetId);
      }),

    queue: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return shipyardService.getShipyardQueue(input.planetId);
      }),

    buildShip: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        shipId: z.enum(shipIds),
        quantity: z.number().int().min(1).max(9999),
      }))
      .mutation(async ({ ctx, input }) => {
        return shipyardService.startBuild(ctx.userId!, input.planetId, 'ship', input.shipId, input.quantity);
      }),

    buildDefense: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        defenseId: z.enum(defenseIds),
        quantity: z.number().int().min(1).max(9999),
      }))
      .mutation(async ({ ctx, input }) => {
        return shipyardService.startBuild(ctx.userId!, input.planetId, 'defense', input.defenseId, input.quantity);
      }),

    cancelBatch: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        batchId: z.string().uuid(),
      }))
      .mutation(async ({ ctx, input }) => {
        return shipyardService.cancelQueuedBatch(ctx.userId!, input.planetId, input.batchId);
      }),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/shipyard/shipyard.router.ts
git commit -m "feat(api): add shipyard router"
```

---

### Task 12: Wire routers + queues + workers

**Files:**
- Modify: `apps/api/src/queues/queue.ts`
- Modify: `apps/api/src/trpc/app-router.ts`
- Create: `apps/api/src/workers/research-completion.worker.ts`
- Create: `apps/api/src/workers/shipyard-completion.worker.ts`
- Modify: `apps/api/src/workers/worker.ts`
- Modify: `apps/api/src/cron/event-catchup.ts`

- [ ] **Step 1: Ajouter les queues**

Dans `apps/api/src/queues/queue.ts`, ajouter :
```typescript
export const researchCompletionQueue = new Queue('research-completion', { connection });
export const shipyardCompletionQueue = new Queue('shipyard-completion', { connection });
```

- [ ] **Step 2: Mettre à jour app-router.ts**

Ajouter les imports research + shipyard, instancier services/routers, ajouter au router :
```typescript
import { createResearchService } from '../modules/research/research.service.js';
import { createResearchRouter } from '../modules/research/research.router.js';
import { createShipyardService } from '../modules/shipyard/shipyard.service.js';
import { createShipyardRouter } from '../modules/shipyard/shipyard.router.js';
import { researchCompletionQueue, shipyardCompletionQueue } from '../queues/queue.js';

// Dans buildAppRouter:
const researchService = createResearchService(db, resourceService, researchCompletionQueue);
const shipyardService = createShipyardService(db, resourceService, shipyardCompletionQueue);
const researchRouter = createResearchRouter(researchService);
const shipyardRouter = createShipyardRouter(shipyardService);

// Dans le router:
research: researchRouter,
shipyard: shipyardRouter,
```

- [ ] **Step 3: Créer research-completion worker**

```typescript
// apps/api/src/workers/research-completion.worker.ts
import { Worker } from 'bullmq';
import { createDb } from '@ogame-clone/db';
import { createResourceService } from '../modules/resource/resource.service.js';
import { createResearchService } from '../modules/research/research.service.js';
import { researchCompletionQueue } from '../queues/queue.js';
import { env } from '../config/env.js';

export function startResearchCompletionWorker(db: ReturnType<typeof createDb>) {
  const resourceService = createResourceService(db);
  const researchService = createResearchService(db, resourceService, researchCompletionQueue);

  const worker = new Worker(
    'research-completion',
    async (job) => {
      const { buildQueueId } = job.data as { buildQueueId: string };
      console.log(`[research-completion] Processing job ${job.id}`);
      const result = await researchService.completeResearch(buildQueueId);
      if (result) {
        console.log(`[research-completion] ${result.researchId} upgraded to level ${result.newLevel}`);
      }
    },
    { connection: { url: env.REDIS_URL }, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[research-completion] Job ${job?.id} failed:`, err);
  });

  return worker;
}
```

- [ ] **Step 4: Créer shipyard-completion worker**

```typescript
// apps/api/src/workers/shipyard-completion.worker.ts
import { Worker } from 'bullmq';
import { createDb } from '@ogame-clone/db';
import { createResourceService } from '../modules/resource/resource.service.js';
import { createShipyardService } from '../modules/shipyard/shipyard.service.js';
import { shipyardCompletionQueue } from '../queues/queue.js';
import { env } from '../config/env.js';

export function startShipyardCompletionWorker(db: ReturnType<typeof createDb>) {
  const resourceService = createResourceService(db);
  const shipyardService = createShipyardService(db, resourceService, shipyardCompletionQueue);

  const worker = new Worker(
    'shipyard-completion',
    async (job) => {
      const { buildQueueId } = job.data as { buildQueueId: string };
      console.log(`[shipyard-completion] Processing job ${job.id}`);
      const result = await shipyardService.completeUnit(buildQueueId);
      if (result) {
        console.log(`[shipyard-completion] ${result.itemId}: ${result.totalCompleted} completed, done=${result.completed}`);
      }
    },
    { connection: { url: env.REDIS_URL }, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[shipyard-completion] Job ${job?.id} failed:`, err);
  });

  return worker;
}
```

- [ ] **Step 5: Mettre à jour worker.ts**

Ajouter les imports et démarrer les nouveaux workers :
```typescript
import { startResearchCompletionWorker } from './research-completion.worker.js';
import { startShipyardCompletionWorker } from './shipyard-completion.worker.js';

// Après startBuildingCompletionWorker(db):
startResearchCompletionWorker(db);
console.log('[worker] Research completion worker started');
startShipyardCompletionWorker(db);
console.log('[worker] Shipyard completion worker started');
```

- [ ] **Step 6: Mettre à jour event-catchup.ts**

Ajouter le rattrapage pour les types 'research', 'ship', 'defense' en plus de 'building'. Importer les queues supplémentaires et scanner toutes les entrées expirées :

```typescript
// Dans event-catchup.ts, ajouter imports:
import { researchCompletionQueue } from '../queues/queue.js';
import { shipyardCompletionQueue } from '../queues/queue.js';

// Remplacer le filtre eq(buildQueue.type, 'building') par un scan de tous les types actifs expirés.
// Pour chaque entrée, router vers la bonne queue selon entry.type.
```

Code complet :
```typescript
import { lte, eq, and } from 'drizzle-orm';
import { buildQueue } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { buildingCompletionQueue } from '../queues/queue.js';
import { researchCompletionQueue } from '../queues/queue.js';
import { shipyardCompletionQueue } from '../queues/queue.js';

export async function eventCatchup(db: Database) {
  const now = new Date();

  const expiredEntries = await db
    .select()
    .from(buildQueue)
    .where(and(eq(buildQueue.status, 'active'), lte(buildQueue.endTime, now)));

  for (const entry of expiredEntries) {
    let queue;
    let jobId: string;

    if (entry.type === 'building') {
      queue = buildingCompletionQueue;
      jobId = `building-${entry.id}`;
    } else if (entry.type === 'research') {
      queue = researchCompletionQueue;
      jobId = `research-${entry.id}`;
    } else {
      queue = shipyardCompletionQueue;
      jobId = `shipyard-${entry.id}-${entry.completedCount + 1}`;
    }

    const existingJob = await queue.getJob(jobId);
    if (!existingJob) {
      console.log(`[event-catchup] Re-queuing expired ${entry.type} ${entry.id}`);
      await queue.add('complete', { buildQueueId: entry.id }, { jobId });
    }
  }

  if (expiredEntries.length > 0) {
    console.log(`[event-catchup] Found ${expiredEntries.length} expired entries`);
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/queues/queue.ts apps/api/src/trpc/app-router.ts apps/api/src/workers/ apps/api/src/cron/event-catchup.ts
git commit -m "feat(api): wire research and shipyard routers, queues, workers, and event catchup"
```

---

## Chunk 4: Frontend — Pages Recherche, Chantier, Défense

### Task 13: Page Recherche

**Files:**
- Create: `apps/web/src/pages/Research.tsx`
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: Créer la page**

```tsx
// apps/web/src/pages/Research.tsx
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ResourceCost } from '@/components/common/ResourceCost';
import { Timer } from '@/components/common/Timer';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h > 0 ? `${h}h` : '', m > 0 ? `${m}m` : '', `${s}s`].filter(Boolean).join(' ');
}

export default function Research() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();

  const { data: techs, isLoading } = trpc.research.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: resourceData } = trpc.resource.production.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const resources = useResourceCounter(
    resourceData
      ? {
          metal: resourceData.metal,
          crystal: resourceData.crystal,
          deuterium: resourceData.deuterium,
          resourcesUpdatedAt: resourceData.resourcesUpdatedAt,
          metalPerHour: resourceData.rates.metalPerHour,
          crystalPerHour: resourceData.rates.crystalPerHour,
          deutPerHour: resourceData.rates.deutPerHour,
          storageMetalCapacity: resourceData.rates.storageMetalCapacity,
          storageCrystalCapacity: resourceData.rates.storageCrystalCapacity,
          storageDeutCapacity: resourceData.rates.storageDeutCapacity,
        }
      : undefined,
  );

  const startMutation = trpc.research.start.useMutation({
    onSuccess: () => {
      utils.research.list.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
    },
  });

  const cancelMutation = trpc.research.cancel.useMutation({
    onSuccess: () => {
      utils.research.list.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
    },
  });

  if (isLoading || !techs) {
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
  }

  const isAnyResearching = techs.some((t) => t.isResearching);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Recherche</h1>

      <div className="grid gap-4 md:grid-cols-2">
        {techs.map((tech) => {
          const canAfford =
            resources.metal >= tech.nextLevelCost.metal &&
            resources.crystal >= tech.nextLevelCost.crystal &&
            resources.deuterium >= tech.nextLevelCost.deuterium;

          return (
            <Card key={tech.id} className={!tech.prerequisitesMet ? 'opacity-50' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{tech.name}</CardTitle>
                  <Badge variant="secondary">Niv. {tech.currentLevel}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{tech.description}</p>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    Coût niveau {tech.currentLevel + 1} :
                  </div>
                  <ResourceCost
                    metal={tech.nextLevelCost.metal}
                    crystal={tech.nextLevelCost.crystal}
                    deuterium={tech.nextLevelCost.deuterium}
                    currentMetal={resources.metal}
                    currentCrystal={resources.crystal}
                    currentDeuterium={resources.deuterium}
                  />
                  <div className="text-xs text-muted-foreground">
                    Durée : {formatDuration(tech.nextLevelTime)}
                  </div>
                </div>

                {!tech.prerequisitesMet && (
                  <p className="text-xs text-destructive">
                    Prérequis manquants
                  </p>
                )}

                {tech.isResearching && tech.researchEndTime ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-primary">En recherche...</span>
                      <Timer
                        endTime={new Date(tech.researchEndTime)}
                        onComplete={() => {
                          utils.research.list.invalidate({ planetId: planetId! });
                        }}
                      />
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelMutation.isPending}
                    >
                      Annuler
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() =>
                      startMutation.mutate({ planetId: planetId!, researchId: tech.id })
                    }
                    disabled={!canAfford || !tech.prerequisitesMet || isAnyResearching || startMutation.isPending}
                  >
                    Rechercher niv. {tech.currentLevel + 1}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Ajouter la route**

Dans `apps/web/src/router.tsx`, ajouter dans les children de `/` :
```tsx
{
  path: 'research',
  lazy: () => import('./pages/Research').then((m) => ({ Component: m.default })),
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/Research.tsx apps/web/src/router.tsx
git commit -m "feat(web): add Research page"
```

---

### Task 14: Page Chantier Spatial

**Files:**
- Create: `apps/web/src/pages/Shipyard.tsx`
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: Créer la page**

```tsx
// apps/web/src/pages/Shipyard.tsx
import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResourceCost } from '@/components/common/ResourceCost';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h > 0 ? `${h}h` : '', m > 0 ? `${m}m` : '', `${s}s`].filter(Boolean).join(' ');
}

export default function Shipyard() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const { data: ships, isLoading } = trpc.shipyard.ships.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: resourceData } = trpc.resource.production.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const resources = useResourceCounter(
    resourceData
      ? {
          metal: resourceData.metal,
          crystal: resourceData.crystal,
          deuterium: resourceData.deuterium,
          resourcesUpdatedAt: resourceData.resourcesUpdatedAt,
          metalPerHour: resourceData.rates.metalPerHour,
          crystalPerHour: resourceData.rates.crystalPerHour,
          deutPerHour: resourceData.rates.deutPerHour,
          storageMetalCapacity: resourceData.rates.storageMetalCapacity,
          storageCrystalCapacity: resourceData.rates.storageCrystalCapacity,
          storageDeutCapacity: resourceData.rates.storageDeutCapacity,
        }
      : undefined,
  );

  const buildMutation = trpc.shipyard.buildShip.useMutation({
    onSuccess: () => {
      utils.shipyard.ships.invalidate({ planetId: planetId! });
      utils.shipyard.queue.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
    },
  });

  if (isLoading || !ships) {
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Chantier spatial</h1>

      <div className="grid gap-4 md:grid-cols-2">
        {ships.map((ship) => {
          const qty = quantities[ship.id] || 1;
          const totalCost = {
            metal: ship.cost.metal * qty,
            crystal: ship.cost.crystal * qty,
            deuterium: ship.cost.deuterium * qty,
          };
          const canAfford =
            resources.metal >= totalCost.metal &&
            resources.crystal >= totalCost.crystal &&
            resources.deuterium >= totalCost.deuterium;

          return (
            <Card key={ship.id} className={!ship.prerequisitesMet ? 'opacity-50' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{ship.name}</CardTitle>
                  <span className="text-sm text-muted-foreground">x{ship.count}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{ship.description}</p>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Coût par unité :</div>
                  <ResourceCost
                    metal={ship.cost.metal}
                    crystal={ship.cost.crystal}
                    deuterium={ship.cost.deuterium}
                  />
                  <div className="text-xs text-muted-foreground">
                    Durée par unité : {formatDuration(ship.timePerUnit)}
                  </div>
                </div>

                {!ship.prerequisitesMet && (
                  <p className="text-xs text-destructive">Prérequis manquants</p>
                )}

                {ship.prerequisitesMet && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={9999}
                      value={qty}
                      onChange={(e) =>
                        setQuantities({ ...quantities, [ship.id]: Math.max(1, Number(e.target.value) || 1) })
                      }
                      className="w-20"
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        buildMutation.mutate({ planetId: planetId!, shipId: ship.id, quantity: qty })
                      }
                      disabled={!canAfford || buildMutation.isPending}
                    >
                      Construire
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Ajouter la route**

```tsx
{
  path: 'shipyard',
  lazy: () => import('./pages/Shipyard').then((m) => ({ Component: m.default })),
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/Shipyard.tsx apps/web/src/router.tsx
git commit -m "feat(web): add Shipyard page"
```

---

### Task 15: Page Défense

**Files:**
- Create: `apps/web/src/pages/Defense.tsx`
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: Créer la page**

```tsx
// apps/web/src/pages/Defense.tsx
import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResourceCost } from '@/components/common/ResourceCost';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h > 0 ? `${h}h` : '', m > 0 ? `${m}m` : '', `${s}s`].filter(Boolean).join(' ');
}

export default function Defense() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const { data: defenses, isLoading } = trpc.shipyard.defenses.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: resourceData } = trpc.resource.production.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const resources = useResourceCounter(
    resourceData
      ? {
          metal: resourceData.metal,
          crystal: resourceData.crystal,
          deuterium: resourceData.deuterium,
          resourcesUpdatedAt: resourceData.resourcesUpdatedAt,
          metalPerHour: resourceData.rates.metalPerHour,
          crystalPerHour: resourceData.rates.crystalPerHour,
          deutPerHour: resourceData.rates.deutPerHour,
          storageMetalCapacity: resourceData.rates.storageMetalCapacity,
          storageCrystalCapacity: resourceData.rates.storageCrystalCapacity,
          storageDeutCapacity: resourceData.rates.storageDeutCapacity,
        }
      : undefined,
  );

  const buildMutation = trpc.shipyard.buildDefense.useMutation({
    onSuccess: () => {
      utils.shipyard.defenses.invalidate({ planetId: planetId! });
      utils.shipyard.queue.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
    },
  });

  if (isLoading || !defenses) {
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Défense</h1>

      <div className="grid gap-4 md:grid-cols-2">
        {defenses.map((defense) => {
          const qty = quantities[defense.id] || 1;
          const maxQty = defense.maxPerPlanet
            ? Math.max(0, defense.maxPerPlanet - defense.count)
            : 9999;
          const effectiveQty = Math.min(qty, maxQty);
          const totalCost = {
            metal: defense.cost.metal * effectiveQty,
            crystal: defense.cost.crystal * effectiveQty,
            deuterium: defense.cost.deuterium * effectiveQty,
          };
          const canAfford =
            resources.metal >= totalCost.metal &&
            resources.crystal >= totalCost.crystal &&
            resources.deuterium >= totalCost.deuterium;

          return (
            <Card key={defense.id} className={!defense.prerequisitesMet ? 'opacity-50' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{defense.name}</CardTitle>
                  <span className="text-sm text-muted-foreground">
                    x{defense.count}
                    {defense.maxPerPlanet ? ` / ${defense.maxPerPlanet}` : ''}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{defense.description}</p>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Coût par unité :</div>
                  <ResourceCost
                    metal={defense.cost.metal}
                    crystal={defense.cost.crystal}
                    deuterium={defense.cost.deuterium}
                  />
                  <div className="text-xs text-muted-foreground">
                    Durée par unité : {formatDuration(defense.timePerUnit)}
                  </div>
                </div>

                {!defense.prerequisitesMet && (
                  <p className="text-xs text-destructive">Prérequis manquants</p>
                )}

                {defense.prerequisitesMet && maxQty > 0 && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={maxQty}
                      value={effectiveQty}
                      onChange={(e) =>
                        setQuantities({
                          ...quantities,
                          [defense.id]: Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)),
                        })
                      }
                      className="w-20"
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        buildMutation.mutate({
                          planetId: planetId!,
                          defenseId: defense.id,
                          quantity: effectiveQty,
                        })
                      }
                      disabled={!canAfford || buildMutation.isPending || effectiveQty === 0}
                    >
                      Construire
                    </Button>
                  </div>
                )}

                {defense.maxPerPlanet && defense.count >= defense.maxPerPlanet && (
                  <p className="text-xs text-muted-foreground">Maximum atteint</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Ajouter la route**

```tsx
{
  path: 'defense',
  lazy: () => import('./pages/Defense').then((m) => ({ Component: m.default })),
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/Defense.tsx apps/web/src/router.tsx
git commit -m "feat(web): add Defense page"
```

---

## Chunk 5: Typecheck + Lint + Test

### Task 16: Vérification finale

- [ ] **Step 1: Turbo typecheck**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm turbo typecheck
```
Expected: PASS

- [ ] **Step 2: Turbo lint**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm turbo lint
```
Expected: PASS (fix any issues)

- [ ] **Step 3: Turbo test**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm turbo test
```
Expected: ALL PASS — tous les tests existants + research-cost + shipyard-cost + prerequisites

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve typecheck and lint issues from Phase 3"
```

---

## Verification Checklist

1. `pnpm turbo typecheck` — pas d'erreur TS
2. `pnpm turbo test` — tous les tests passent (49 existants + ~20 nouveaux)
3. `pnpm turbo lint` — pas d'erreur lint
4. API répond à `trpc.research.list/start/cancel`
5. API répond à `trpc.shipyard.ships/defenses/buildShip/buildDefense/cancelBatch`
6. Workers research-completion et shipyard-completion démarrent sans erreur
7. Event catchup rattrape les 3 types (building, research, ship/defense)
8. Page Recherche affiche technologies, prérequis, coûts, timer
9. Page Chantier affiche vaisseaux, quantité, construction batch
10. Page Défense affiche défenses, max par planète (boucliers), construction
