# Adding a new fleet mission

This checklist documents every place that needs to change when adding a new mission type to the game. The mission system intentionally keeps explicit mappings (worker handlers, phase types) for debuggability — there is no auto-discovery, so each step matters.

## Why so many places?

- **PG enum** (`fleet_mission`) gives a database-level constraint
- **TS enum** (`MissionType`) gives compile-time safety in the API and frontend
- **Mission definition row** (`mission_definitions`) provides UI metadata (label, color, hint, requirements)
- **Handler class** owns the business logic (validation + arrival processing)
- **Service registration** wires the handler into the dispatch system
- **Worker registration** (only if phased) makes the BullMQ jobs callable
- **Catchup mapping** (only if phased) recovers stuck fleets after a restart

The good news: most steps are 1-2 lines. The bad news: forget one and the mission silently breaks (it won't appear, won't validate, or fleets get stuck).

## Checklist

### 1. Add to enums

- [ ] Add the new value to `fleetMissionEnum` in `packages/db/src/schema/fleet-events.ts`
- [ ] Add to `MissionType` enum in `packages/shared/src/types/missions.ts`
- [ ] Create a migration SQL file in `packages/db/drizzle/00XX_add_<mission>_mission.sql`:

  ```sql
  ALTER TYPE "fleet_mission" ADD VALUE IF NOT EXISTS '<mission>';
  ```

### 2. Seed the mission definition

- [ ] Add an entry to `MISSION_DEFINITIONS` in `packages/db/src/seed-game-config.ts`:

  ```typescript
  {
    id: '<mission>',
    label: 'Label affiche',
    hint: 'Description courte',
    buttonLabel: 'Action',
    color: '#06b6d4',
    sortOrder: 11,
    dangerous: false,
    requiredShipRoles: ['<role>'] as string[] | null,
    exclusive: true,
    recommendedShipRoles: ['<role>'] as string[] | null,
    requiresPveMission: false,
  }
  ```

  - `requiresPveMission: false` -> selectable in the manual fleet send UI
  - `requiresPveMission: true` -> only triggered from a PvE flow (not in the selector)

### 3. Implement the handler

- [ ] Create `apps/api/src/modules/fleet/handlers/<mission>.handler.ts`
- [ ] Implement `MissionHandler` (single-step) or `PhasedMissionHandler` (multi-step)
- [ ] `validateFleet`: check ship requirements, target validity
- [ ] `processArrival`: do the work, return `{ scheduleReturn, cargo, reportId }` or `{ schedulePhase, ... }` for phased
- [ ] If phased: implement `processPhase(phaseName, ...)` for each intermediate step

### 4. Register the handler

- [ ] Import the handler in `apps/api/src/modules/fleet/fleet.service.ts`
- [ ] Add to the `handlers` record:

  ```typescript
  <mission>: new <Mission>Handler(),
  ```

### 5. (Phased missions only) Wire up phase jobs

If the handler uses `schedulePhase` to queue intermediate work:

- [ ] Add the phase to `fleetPhaseEnum` in `packages/db/src/schema/fleet-events.ts` if it's a new one (e.g., `'exploring'`). If you reuse an existing phase, skip this.
- [ ] Add a migration for the new phase value (same pattern as enum migration above)
- [ ] Add a `processXxxDone` method on the service that calls `processPhaseDispatch`:

  ```typescript
  async processExploreDone(fleetEventId: string): Promise<FleetCompletionResult> {
    await this.processPhaseDispatch(fleetEventId, '<job-name>', '<expected-phase>');
    return null;
  }
  ```

- [ ] Register the handler in `apps/api/src/workers/fleet.worker.ts`:

  ```typescript
  '<job-name>': (id) => fleetService.processXxxDone(id),
  ```

- [ ] Add the phase -> job name mapping in `apps/api/src/cron/event-catchup.ts`:

  ```typescript
  '<phase>': '<job-name>',
  ```

  This is what recovers stuck fleets after a server restart.

### 6. (Optional) UI customization

The `MissionSelector` already discovers missions dynamically from `gameConfig.missions` -- no change needed unless `requiresPveMission` is `true`.

The `MissionIcon` component reads colors from `gameConfig.missions[id].color`, but the SVG path is hardcoded in a switch. Add a new `case '<mission>'` block with your icon path.

If your mission introduces a **new phase**, also:

- [ ] Add a label to `UI_LABELS` in the seed: `{ key: 'phase.<phase>', label: '...' }`
- [ ] Add a `PHASE_STYLE` entry in `apps/web/src/components/fleet/MovementCard.tsx`

### 7. Deploy

- [ ] Run the migration: `psql ... -f packages/db/drizzle/00XX_*.sql`
- [ ] Run the seed: `npx tsx packages/db/src/seed-game-config.ts`
- [ ] Restart the API so the worker picks up the new handler
- [ ] Verify the mission appears in the fleet send UI and that fleets complete normally

## What is intentionally hardcoded (and why)

- **PG enum + TS enum**: provide database constraints and compile-time safety. The cost of editing two files is worth the safety.
- **Worker `handlers` record**: explicit dispatch is more debuggable than reflection. Adding a line is cheap.
- **MissionIcon SVG paths**: icons are code, not data. Storing SVG paths in the DB would be over-engineering.

## What is intentionally dynamic

- **MissionSelector list**: derived from `gameConfig.missions` filtered by `requiresPveMission`. New missions appear automatically.
- **Mission colors and labels**: come from the DB via `gameConfig.missions[id]`.
- **Phase labels**: come from the DB via `gameConfig.labels['phase.X']`.
- **Phase type union**: derived from `fleetPhaseEnum.enumValues` so adding a phase value to the enum updates the type automatically.
