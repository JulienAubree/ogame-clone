import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://ogame:ogame@localhost:5432/ogame';
const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client);

async function migrate() {
  console.log('Starting building reorganization migration...');

  await db.execute(sql`BEGIN`);

  try {
    // Step 1: Replace shipyard with commandCenter (insert new, migrate refs, delete old)
    console.log('  Step 1: Replacing shipyard → commandCenter...');

    // Insert commandCenter as a copy of shipyard
    await db.execute(sql`
      INSERT INTO building_definitions (id, name, description, base_cost_minerai, base_cost_silicium, base_cost_hydrogene, cost_factor, base_time, category_id, sort_order)
      SELECT 'commandCenter', 'Centre de commandement', 'Débloque et construit les vaisseaux militaires.', base_cost_minerai, base_cost_silicium, base_cost_hydrogene, cost_factor, base_time, category_id, sort_order
      FROM building_definitions WHERE id = 'shipyard'
    `);

    // Migrate all FK references from shipyard → commandCenter
    await db.execute(sql`UPDATE building_prerequisites SET building_id = 'commandCenter' WHERE building_id = 'shipyard'`);
    await db.execute(sql`UPDATE building_prerequisites SET required_building_id = 'commandCenter' WHERE required_building_id = 'shipyard'`);
    await db.execute(sql`UPDATE ship_prerequisites SET required_building_id = 'commandCenter' WHERE required_building_id = 'shipyard'`);
    await db.execute(sql`UPDATE defense_prerequisites SET required_building_id = 'commandCenter' WHERE required_building_id = 'shipyard'`);
    await db.execute(sql`UPDATE research_prerequisites SET required_building_id = 'commandCenter' WHERE required_building_id = 'shipyard'`);
    await db.execute(sql`UPDATE build_queue SET item_id = 'commandCenter' WHERE item_id = 'shipyard' AND type = 'building'`);

    // Delete old shipyard (no more references to it)
    await db.execute(sql`DELETE FROM building_definitions WHERE id = 'shipyard'`);


    // Step 2: Create planetBuildings table
    console.log('  Step 2: Creating planet_buildings table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS planet_buildings (
        planet_id UUID NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
        building_id VARCHAR(64) NOT NULL,
        level SMALLINT NOT NULL DEFAULT 0,
        PRIMARY KEY (planet_id, building_id)
      )
    `);

    // Step 3: Migrate data from planets columns → planetBuildings
    console.log('  Step 3: Migrating building levels to planet_buildings...');
    const buildingMappings = [
      { buildingId: 'mineraiMine', column: 'minerai_mine_level' },
      { buildingId: 'siliciumMine', column: 'silicium_mine_level' },
      { buildingId: 'hydrogeneSynth', column: 'hydrogene_synth_level' },
      { buildingId: 'solarPlant', column: 'solar_plant_level' },
      { buildingId: 'robotics', column: 'robotics_level' },
      { buildingId: 'commandCenter', column: 'shipyard_level' },
      { buildingId: 'researchLab', column: 'research_lab_level' },
      { buildingId: 'storageMinerai', column: 'storage_minerai_level' },
      { buildingId: 'storageSilicium', column: 'storage_silicium_level' },
      { buildingId: 'storageHydrogene', column: 'storage_hydrogene_level' },
    ];

    for (const { buildingId, column } of buildingMappings) {
      await db.execute(sql.raw(`
        INSERT INTO planet_buildings (planet_id, building_id, level)
        SELECT id, '${buildingId}', ${column} FROM planets
      `));
    }

    // Step 3b: Remove levelColumn from buildingDefinitions
    console.log('  Step 3b: Removing level_column from building_definitions...');
    await db.execute(sql`ALTER TABLE building_definitions DROP COLUMN IF EXISTS level_column`);

    // Step 3c: Add new columns to buildingDefinitions
    console.log('  Step 3c: Adding new columns to building_definitions...');
    await db.execute(sql`ALTER TABLE building_definitions ADD COLUMN IF NOT EXISTS build_time_reduction_factor REAL`);
    await db.execute(sql`ALTER TABLE building_definitions ADD COLUMN IF NOT EXISTS reduces_time_for_category VARCHAR(64) REFERENCES entity_categories(id) ON DELETE SET NULL`);

    // Step 4: Add new entity categories for build time reduction
    console.log('  Step 4: Adding build time reduction categories...');
    await db.execute(sql`INSERT INTO entity_categories (id, entity_type, name, sort_order) VALUES ('build_industrial', 'build', 'Vaisseaux industriels', 0) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO entity_categories (id, entity_type, name, sort_order) VALUES ('build_military', 'build', 'Vaisseaux militaires', 1) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO entity_categories (id, entity_type, name, sort_order) VALUES ('build_defense', 'build', 'Défenses', 2) ON CONFLICT (id) DO NOTHING`);

    // Insert new buildings
    console.log('  Step 4b: Creating new buildings (shipyard, arsenal)...');
    await db.execute(sql`
      INSERT INTO building_definitions (id, name, description, base_cost_minerai, base_cost_silicium, base_cost_hydrogene, cost_factor, base_time, category_id, sort_order, build_time_reduction_factor, reduces_time_for_category)
      VALUES ('shipyard', 'Chantier spatial', 'Débloque et construit les vaisseaux industriels.', 400, 200, 100, 2, 60, 'building_defense', 5, 1.0, 'build_industrial')
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO building_definitions (id, name, description, base_cost_minerai, base_cost_silicium, base_cost_hydrogene, cost_factor, base_time, category_id, sort_order, build_time_reduction_factor, reduces_time_for_category)
      VALUES ('arsenal', 'Arsenal planétaire', 'Débloque et construit les défenses planétaires.', 400, 200, 100, 2, 60, 'building_defense', 6, 1.0, 'build_defense')
      ON CONFLICT (id) DO NOTHING
    `);

    // Update commandCenter with new fields
    await db.execute(sql`UPDATE building_definitions SET sort_order = 7, build_time_reduction_factor = 1.0, reduces_time_for_category = 'build_military' WHERE id = 'commandCenter'`);

    // Insert shipyard and arsenal at level 0 for all existing planets
    await db.execute(sql`
      INSERT INTO planet_buildings (planet_id, building_id, level)
      SELECT id, 'shipyard', 0 FROM planets
      ON CONFLICT DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO planet_buildings (planet_id, building_id, level)
      SELECT id, 'arsenal', 0 FROM planets
      ON CONFLICT DO NOTHING
    `);

    // Step 5: Update prerequisites
    console.log('  Step 5: Updating prerequisites...');

    // Industrial ships: smallCargo, largeCargo, espionageProbe, colonyShip, recycler → shipyard
    await db.execute(sql`UPDATE ship_prerequisites SET required_building_id = 'shipyard' WHERE ship_id IN ('smallCargo', 'largeCargo', 'espionageProbe', 'colonyShip', 'recycler') AND required_building_id = 'commandCenter'`);

    // All defenses → arsenal
    await db.execute(sql`UPDATE defense_prerequisites SET required_building_id = 'arsenal' WHERE required_building_id = 'commandCenter'`);

    // Building prerequisites: commandCenter requires robotics 4 + shipyard 2
    await db.execute(sql`UPDATE building_prerequisites SET required_level = 4 WHERE building_id = 'commandCenter' AND required_building_id = 'robotics'`);
    await db.execute(sql`
      INSERT INTO building_prerequisites (building_id, required_building_id, required_level)
      VALUES ('commandCenter', 'shipyard', 2)
      ON CONFLICT DO NOTHING
    `);

    // New shipyard requires robotics 1
    await db.execute(sql`
      INSERT INTO building_prerequisites (building_id, required_building_id, required_level)
      VALUES ('shipyard', 'robotics', 1)
      ON CONFLICT DO NOTHING
    `);

    // Arsenal requires robotics 2
    await db.execute(sql`
      INSERT INTO building_prerequisites (building_id, required_building_id, required_level)
      VALUES ('arsenal', 'robotics', 2)
      ON CONFLICT DO NOTHING
    `);

    // Step 6: Drop old columns from planets
    console.log('  Step 6: Dropping old level columns from planets...');
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS minerai_mine_level`);
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS silicium_mine_level`);
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS hydrogene_synth_level`);
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS solar_plant_level`);
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS robotics_level`);
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS shipyard_level`);
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS research_lab_level`);
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS storage_minerai_level`);
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS storage_silicium_level`);
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS storage_hydrogene_level`);

    // Add prospector and explorer to planet_ships
    await db.execute(sql`ALTER TABLE planet_ships ADD COLUMN IF NOT EXISTS prospector INTEGER NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE planet_ships ADD COLUMN IF NOT EXISTS explorer INTEGER NOT NULL DEFAULT 0`);

    await db.execute(sql`COMMIT`);
    console.log('Migration complete!');
  } catch (err) {
    await db.execute(sql`ROLLBACK`);
    console.error('Migration failed, rolled back:', err);
    throw err;
  }

  await client.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
