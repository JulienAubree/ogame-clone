import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  buildingDefinitions,
  buildingPrerequisites,
  researchDefinitions,
  researchPrerequisites,
  shipDefinitions,
  shipPrerequisites,
  defenseDefinitions,
  defensePrerequisites,
  rapidFire,
  productionConfig,
  universeConfig,
} from './schema/game-config.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://ogame:ogame@localhost:5432/ogame';
const client = postgres(DATABASE_URL);
const db = drizzle(client);

// ── Building data ──

const BUILDINGS = [
  { id: 'metalMine', name: 'Mine de métal', description: 'Produit du métal, ressource de base.', baseCostMetal: 60, baseCostCrystal: 15, baseCostDeuterium: 0, costFactor: 1.5, baseTime: 60, levelColumn: 'metalMineLevel', sortOrder: 0, prerequisites: [] as { buildingId: string; level: number }[] },
  { id: 'crystalMine', name: 'Mine de cristal', description: 'Produit du cristal.', baseCostMetal: 48, baseCostCrystal: 24, baseCostDeuterium: 0, costFactor: 1.6, baseTime: 60, levelColumn: 'crystalMineLevel', sortOrder: 1, prerequisites: [] },
  { id: 'deutSynth', name: 'Synthétiseur de deutérium', description: 'Produit du deutérium.', baseCostMetal: 225, baseCostCrystal: 75, baseCostDeuterium: 0, costFactor: 1.5, baseTime: 60, levelColumn: 'deutSynthLevel', sortOrder: 2, prerequisites: [] },
  { id: 'solarPlant', name: 'Centrale solaire', description: "Produit de l'énergie.", baseCostMetal: 75, baseCostCrystal: 30, baseCostDeuterium: 0, costFactor: 1.5, baseTime: 60, levelColumn: 'solarPlantLevel', sortOrder: 3, prerequisites: [] },
  { id: 'robotics', name: 'Usine de robots', description: 'Réduit le temps de construction.', baseCostMetal: 400, baseCostCrystal: 120, baseCostDeuterium: 200, costFactor: 2, baseTime: 60, levelColumn: 'roboticsLevel', sortOrder: 4, prerequisites: [] },
  { id: 'shipyard', name: 'Chantier spatial', description: 'Construit vaisseaux et défenses.', baseCostMetal: 400, baseCostCrystal: 200, baseCostDeuterium: 100, costFactor: 2, baseTime: 60, levelColumn: 'shipyardLevel', sortOrder: 5, prerequisites: [{ buildingId: 'robotics', level: 2 }] },
  { id: 'researchLab', name: 'Laboratoire de recherche', description: 'Permet les recherches.', baseCostMetal: 200, baseCostCrystal: 400, baseCostDeuterium: 200, costFactor: 2, baseTime: 60, levelColumn: 'researchLabLevel', sortOrder: 6, prerequisites: [] },
  { id: 'storageMetal', name: 'Hangar de métal', description: 'Augmente le stockage de métal.', baseCostMetal: 1000, baseCostCrystal: 0, baseCostDeuterium: 0, costFactor: 2, baseTime: 60, levelColumn: 'storageMetalLevel', sortOrder: 7, prerequisites: [] },
  { id: 'storageCrystal', name: 'Hangar de cristal', description: 'Augmente le stockage de cristal.', baseCostMetal: 1000, baseCostCrystal: 500, baseCostDeuterium: 0, costFactor: 2, baseTime: 60, levelColumn: 'storageCrystalLevel', sortOrder: 8, prerequisites: [] },
  { id: 'storageDeut', name: 'Réservoir de deutérium', description: 'Augmente le stockage de deutérium.', baseCostMetal: 1000, baseCostCrystal: 1000, baseCostDeuterium: 0, costFactor: 2, baseTime: 60, levelColumn: 'storageDeutLevel', sortOrder: 9, prerequisites: [] },
];

// ── Research data ──

const RESEARCH = [
  { id: 'espionageTech', name: 'Technologie Espionnage', description: "Améliore les sondes d'espionnage.", baseCostMetal: 200, baseCostCrystal: 1000, baseCostDeuterium: 200, costFactor: 2, levelColumn: 'espionageTech', sortOrder: 0, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 3 }], research: [] as { researchId: string; level: number }[] } },
  { id: 'computerTech', name: 'Technologie Ordinateur', description: 'Augmente le nombre de flottes simultanées.', baseCostMetal: 0, baseCostCrystal: 400, baseCostDeuterium: 600, costFactor: 2, levelColumn: 'computerTech', sortOrder: 1, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 1 }], research: [] } },
  { id: 'energyTech', name: 'Technologie Énergie', description: 'Recherche fondamentale en énergie.', baseCostMetal: 0, baseCostCrystal: 800, baseCostDeuterium: 400, costFactor: 2, levelColumn: 'energyTech', sortOrder: 2, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 1 }], research: [] } },
  { id: 'combustion', name: 'Réacteur à combustion', description: 'Propulsion de base pour les vaisseaux.', baseCostMetal: 400, baseCostCrystal: 0, baseCostDeuterium: 600, costFactor: 2, levelColumn: 'combustion', sortOrder: 3, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 1 }], research: [{ researchId: 'energyTech', level: 1 }] } },
  { id: 'impulse', name: 'Réacteur à impulsion', description: 'Propulsion avancée.', baseCostMetal: 2000, baseCostCrystal: 4000, baseCostDeuterium: 600, costFactor: 2, levelColumn: 'impulse', sortOrder: 4, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 2 }], research: [{ researchId: 'energyTech', level: 1 }] } },
  { id: 'hyperspaceDrive', name: 'Propulsion hyperespace', description: 'Propulsion la plus rapide.', baseCostMetal: 10000, baseCostCrystal: 20000, baseCostDeuterium: 6000, costFactor: 2, levelColumn: 'hyperspaceDrive', sortOrder: 5, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 7 }], research: [{ researchId: 'energyTech', level: 5 }, { researchId: 'shielding', level: 5 }] } },
  { id: 'weapons', name: 'Technologie Armes', description: 'Augmente les dégâts de 10% par niveau.', baseCostMetal: 800, baseCostCrystal: 200, baseCostDeuterium: 0, costFactor: 2, levelColumn: 'weapons', sortOrder: 6, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 4 }], research: [] } },
  { id: 'shielding', name: 'Technologie Bouclier', description: 'Augmente les boucliers de 10% par niveau.', baseCostMetal: 200, baseCostCrystal: 600, baseCostDeuterium: 0, costFactor: 2, levelColumn: 'shielding', sortOrder: 7, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 6 }], research: [{ researchId: 'energyTech', level: 3 }] } },
  { id: 'armor', name: 'Technologie Protection', description: 'Augmente la coque de 10% par niveau.', baseCostMetal: 1000, baseCostCrystal: 0, baseCostDeuterium: 0, costFactor: 2, levelColumn: 'armor', sortOrder: 8, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 2 }], research: [] } },
];

// ── Ship data (merged: ships + combat-stats + ship-stats) ──

const SHIPS = [
  { id: 'smallCargo', name: 'Petit transporteur', description: 'Transport léger de ressources.', costMetal: 2000, costCrystal: 2000, costDeuterium: 0, countColumn: 'smallCargo', baseSpeed: 5000, fuelConsumption: 10, cargoCapacity: 5000, driveType: 'combustion', weapons: 5, shield: 10, armor: 4000, sortOrder: 0, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 2 }], research: [{ researchId: 'combustion', level: 2 }] } },
  { id: 'largeCargo', name: 'Grand transporteur', description: 'Transport lourd de ressources.', costMetal: 6000, costCrystal: 6000, costDeuterium: 0, countColumn: 'largeCargo', baseSpeed: 7500, fuelConsumption: 50, cargoCapacity: 25000, driveType: 'combustion', weapons: 5, shield: 25, armor: 12000, sortOrder: 1, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 4 }], research: [{ researchId: 'combustion', level: 6 }] } },
  { id: 'lightFighter', name: 'Chasseur léger', description: 'Vaisseau de combat de base.', costMetal: 3000, costCrystal: 1000, costDeuterium: 0, countColumn: 'lightFighter', baseSpeed: 12500, fuelConsumption: 20, cargoCapacity: 50, driveType: 'combustion', weapons: 50, shield: 10, armor: 4000, sortOrder: 2, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 1 }], research: [{ researchId: 'combustion', level: 1 }] } },
  { id: 'heavyFighter', name: 'Chasseur lourd', description: 'Vaisseau de combat amélioré.', costMetal: 6000, costCrystal: 4000, costDeuterium: 0, countColumn: 'heavyFighter', baseSpeed: 10000, fuelConsumption: 75, cargoCapacity: 100, driveType: 'impulse', weapons: 150, shield: 25, armor: 10000, sortOrder: 3, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 3 }], research: [{ researchId: 'armor', level: 2 }, { researchId: 'impulse', level: 2 }] } },
  { id: 'cruiser', name: 'Croiseur', description: 'Vaisseau de guerre polyvalent.', costMetal: 20000, costCrystal: 7000, costDeuterium: 2000, countColumn: 'cruiser', baseSpeed: 15000, fuelConsumption: 300, cargoCapacity: 800, driveType: 'impulse', weapons: 400, shield: 50, armor: 27000, sortOrder: 4, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 5 }], research: [{ researchId: 'impulse', level: 4 }, { researchId: 'weapons', level: 3 }] } },
  { id: 'battleship', name: 'Vaisseau de bataille', description: 'Puissant navire de guerre.', costMetal: 45000, costCrystal: 15000, costDeuterium: 0, countColumn: 'battleship', baseSpeed: 10000, fuelConsumption: 500, cargoCapacity: 1500, driveType: 'hyperspaceDrive', weapons: 1000, shield: 200, armor: 60000, sortOrder: 5, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 7 }], research: [{ researchId: 'hyperspaceDrive', level: 4 }] } },
  { id: 'espionageProbe', name: "Sonde d'espionnage", description: 'Sonde rapide pour espionner.', costMetal: 0, costCrystal: 1000, costDeuterium: 0, countColumn: 'espionageProbe', baseSpeed: 100000000, fuelConsumption: 1, cargoCapacity: 0, driveType: 'combustion', weapons: 0, shield: 0, armor: 1000, sortOrder: 6, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 3 }], research: [{ researchId: 'combustion', level: 3 }, { researchId: 'espionageTech', level: 2 }] } },
  { id: 'colonyShip', name: 'Vaisseau de colonisation', description: 'Colonise de nouvelles planètes.', costMetal: 10000, costCrystal: 20000, costDeuterium: 10000, countColumn: 'colonyShip', baseSpeed: 2500, fuelConsumption: 1000, cargoCapacity: 7500, driveType: 'impulse', weapons: 50, shield: 100, armor: 30000, sortOrder: 7, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 4 }], research: [{ researchId: 'impulse', level: 3 }] } },
  { id: 'recycler', name: 'Recycleur', description: 'Collecte les champs de débris.', costMetal: 10000, costCrystal: 6000, costDeuterium: 2000, countColumn: 'recycler', baseSpeed: 2000, fuelConsumption: 300, cargoCapacity: 20000, driveType: 'combustion', weapons: 1, shield: 10, armor: 16000, sortOrder: 8, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 4 }], research: [{ researchId: 'combustion', level: 6 }, { researchId: 'shielding', level: 2 }] } },
];

// ── Defense data (merged: defenses + combat-stats) ──

const DEFENSES = [
  { id: 'rocketLauncher', name: 'Lanceur de missiles', description: 'Défense de base, peu coûteuse.', costMetal: 2000, costCrystal: 0, costDeuterium: 0, countColumn: 'rocketLauncher', weapons: 80, shield: 20, armor: 2000, maxPerPlanet: null, sortOrder: 0, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 1 }], research: [] as { researchId: string; level: number }[] } },
  { id: 'lightLaser', name: 'Artillerie laser légère', description: 'Défense laser de base.', costMetal: 1500, costCrystal: 500, costDeuterium: 0, countColumn: 'lightLaser', weapons: 100, shield: 25, armor: 2000, maxPerPlanet: null, sortOrder: 1, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 2 }], research: [{ researchId: 'energyTech', level: 1 }] } },
  { id: 'heavyLaser', name: 'Artillerie laser lourde', description: 'Défense laser puissante.', costMetal: 6000, costCrystal: 2000, costDeuterium: 0, countColumn: 'heavyLaser', weapons: 250, shield: 100, armor: 8000, maxPerPlanet: null, sortOrder: 2, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 4 }], research: [{ researchId: 'energyTech', level: 3 }, { researchId: 'shielding', level: 1 }] } },
  { id: 'gaussCannon', name: 'Canon de Gauss', description: 'Défense balistique puissante.', costMetal: 20000, costCrystal: 15000, costDeuterium: 2000, countColumn: 'gaussCannon', weapons: 1100, shield: 200, armor: 35000, maxPerPlanet: null, sortOrder: 3, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 6 }], research: [{ researchId: 'energyTech', level: 6 }, { researchId: 'weapons', level: 3 }, { researchId: 'shielding', level: 1 }] } },
  { id: 'plasmaTurret', name: 'Artillerie à ions', description: 'Défense plasma dévastatrice.', costMetal: 50000, costCrystal: 50000, costDeuterium: 30000, countColumn: 'plasmaTurret', weapons: 3000, shield: 300, armor: 100000, maxPerPlanet: null, sortOrder: 4, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 8 }], research: [{ researchId: 'energyTech', level: 8 }, { researchId: 'weapons', level: 7 }] } },
  { id: 'smallShield', name: 'Petit bouclier', description: 'Bouclier planétaire de base.', costMetal: 10000, costCrystal: 10000, costDeuterium: 0, countColumn: 'smallShield', weapons: 1, shield: 2000, armor: 2000, maxPerPlanet: 1, sortOrder: 5, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 1 }], research: [{ researchId: 'shielding', level: 2 }] } },
  { id: 'largeShield', name: 'Grand bouclier', description: 'Bouclier planétaire avancé.', costMetal: 50000, costCrystal: 50000, costDeuterium: 0, countColumn: 'largeShield', weapons: 1, shield: 10000, armor: 10000, maxPerPlanet: 1, sortOrder: 6, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 4 }], research: [{ researchId: 'shielding', level: 6 }] } },
];

// ── Rapid fire data ──

const RAPID_FIRE_DATA = [
  { attackerId: 'smallCargo', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'largeCargo', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'lightFighter', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'heavyFighter', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'heavyFighter', targetId: 'smallCargo', value: 3 },
  { attackerId: 'cruiser', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'cruiser', targetId: 'lightFighter', value: 6 },
  { attackerId: 'cruiser', targetId: 'smallCargo', value: 3 },
  { attackerId: 'cruiser', targetId: 'rocketLauncher', value: 10 },
  { attackerId: 'battleship', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'battleship', targetId: 'lightFighter', value: 4 },
  { attackerId: 'battleship', targetId: 'smallCargo', value: 4 },
  { attackerId: 'battleship', targetId: 'largeCargo', value: 4 },
  { attackerId: 'colonyShip', targetId: 'espionageProbe', value: 5 },
];

// ── Production config data ──

const PRODUCTION_CONFIG = [
  { id: 'metalMine', baseProduction: 30, exponentBase: 1.1, energyConsumption: 10, storageBase: null },
  { id: 'crystalMine', baseProduction: 20, exponentBase: 1.1, energyConsumption: 10, storageBase: null },
  { id: 'deutSynth', baseProduction: 10, exponentBase: 1.1, energyConsumption: 20, storageBase: null },
  { id: 'solarPlant', baseProduction: 20, exponentBase: 1.1, energyConsumption: null, storageBase: null },
  { id: 'storage', baseProduction: 5000, exponentBase: 1.1, energyConsumption: null, storageBase: 5000 },
];

// ── Universe config data ──

const UNIVERSE_CONFIG = [
  { key: 'name', value: 'Universe 1' },
  { key: 'speed', value: 1 },
  { key: 'galaxies', value: 9 },
  { key: 'systems', value: 499 },
  { key: 'positions', value: 15 },
  { key: 'maxPlanetsPerPlayer', value: 9 },
  { key: 'debrisRatio', value: 0.3 },
  { key: 'lootRatio', value: 0.5 },
];

async function seed() {
  console.log('Seeding game config...');

  // 1. Building definitions (upsert)
  for (const b of BUILDINGS) {
    const { prerequisites: _bp, ...row } = b;
    await db.insert(buildingDefinitions).values(row)
      .onConflictDoUpdate({ target: buildingDefinitions.id, set: { ...row } });
  }
  console.log(`  ✓ ${BUILDINGS.length} building definitions`);

  // 2. Building prerequisites (delete + re-insert for simplicity)
  await db.delete(buildingPrerequisites);
  const bPrereqs = BUILDINGS.flatMap(b =>
    b.prerequisites.map(p => ({
      buildingId: b.id,
      requiredBuildingId: p.buildingId,
      requiredLevel: p.level,
    }))
  );
  if (bPrereqs.length > 0) {
    await db.insert(buildingPrerequisites).values(bPrereqs);
  }
  console.log(`  ✓ ${bPrereqs.length} building prerequisites`);

  // 3. Research definitions
  for (const r of RESEARCH) {
    const { prerequisites: _rp, ...row } = r;
    await db.insert(researchDefinitions).values(row)
      .onConflictDoUpdate({ target: researchDefinitions.id, set: { ...row } });
  }
  console.log(`  ✓ ${RESEARCH.length} research definitions`);

  // 4. Research prerequisites
  await db.delete(researchPrerequisites);
  const rPrereqs: { researchId: string; requiredBuildingId: string | null; requiredResearchId: string | null; requiredLevel: number }[] = [];
  for (const r of RESEARCH) {
    for (const b of r.prerequisites.buildings) {
      rPrereqs.push({ researchId: r.id, requiredBuildingId: b.buildingId, requiredResearchId: null, requiredLevel: b.level });
    }
    for (const res of r.prerequisites.research) {
      rPrereqs.push({ researchId: r.id, requiredBuildingId: null, requiredResearchId: res.researchId, requiredLevel: res.level });
    }
  }
  if (rPrereqs.length > 0) {
    await db.insert(researchPrerequisites).values(rPrereqs);
  }
  console.log(`  ✓ ${rPrereqs.length} research prerequisites`);

  // 5. Ship definitions
  for (const s of SHIPS) {
    const { prerequisites: _sp, ...row } = s;
    await db.insert(shipDefinitions).values(row)
      .onConflictDoUpdate({ target: shipDefinitions.id, set: { ...row } });
  }
  console.log(`  ✓ ${SHIPS.length} ship definitions`);

  // 6. Ship prerequisites
  await db.delete(shipPrerequisites);
  const sPrereqs: { shipId: string; requiredBuildingId: string | null; requiredResearchId: string | null; requiredLevel: number }[] = [];
  for (const s of SHIPS) {
    for (const b of s.prerequisites.buildings) {
      sPrereqs.push({ shipId: s.id, requiredBuildingId: b.buildingId, requiredResearchId: null, requiredLevel: b.level });
    }
    for (const r of s.prerequisites.research) {
      sPrereqs.push({ shipId: s.id, requiredBuildingId: null, requiredResearchId: r.researchId, requiredLevel: r.level });
    }
  }
  if (sPrereqs.length > 0) {
    await db.insert(shipPrerequisites).values(sPrereqs);
  }
  console.log(`  ✓ ${sPrereqs.length} ship prerequisites`);

  // 7. Defense definitions
  for (const d of DEFENSES) {
    const { prerequisites: _dp, ...row } = d;
    await db.insert(defenseDefinitions).values(row)
      .onConflictDoUpdate({ target: defenseDefinitions.id, set: { ...row } });
  }
  console.log(`  ✓ ${DEFENSES.length} defense definitions`);

  // 8. Defense prerequisites
  await db.delete(defensePrerequisites);
  const dPrereqs: { defenseId: string; requiredBuildingId: string | null; requiredResearchId: string | null; requiredLevel: number }[] = [];
  for (const d of DEFENSES) {
    for (const b of d.prerequisites.buildings) {
      dPrereqs.push({ defenseId: d.id, requiredBuildingId: b.buildingId, requiredResearchId: null, requiredLevel: b.level });
    }
    for (const r of d.prerequisites.research) {
      dPrereqs.push({ defenseId: d.id, requiredBuildingId: null, requiredResearchId: r.researchId, requiredLevel: r.level });
    }
  }
  if (dPrereqs.length > 0) {
    await db.insert(defensePrerequisites).values(dPrereqs);
  }
  console.log(`  ✓ ${dPrereqs.length} defense prerequisites`);

  // 9. Rapid fire
  await db.delete(rapidFire);
  if (RAPID_FIRE_DATA.length > 0) {
    await db.insert(rapidFire).values(RAPID_FIRE_DATA);
  }
  console.log(`  ✓ ${RAPID_FIRE_DATA.length} rapid fire entries`);

  // 10. Production config
  for (const p of PRODUCTION_CONFIG) {
    await db.insert(productionConfig).values(p)
      .onConflictDoUpdate({ target: productionConfig.id, set: { ...p } });
  }
  console.log(`  ✓ ${PRODUCTION_CONFIG.length} production configs`);

  // 11. Universe config
  for (const u of UNIVERSE_CONFIG) {
    await db.insert(universeConfig).values(u)
      .onConflictDoUpdate({ target: universeConfig.key, set: { value: u.value } });
  }
  console.log(`  ✓ ${UNIVERSE_CONFIG.length} universe config entries`);

  console.log('Seed complete!');
  await client.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
