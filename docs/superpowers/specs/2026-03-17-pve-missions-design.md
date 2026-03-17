# PvE Missions System — Design Spec

## Status
**Approved** — 2026-03-17

## Summary

A PvE mission layer for the ogame-clone project: mining asteroid belts and fighting pirates. Missions are dispatched via the existing fleet system, gated by a new "Mission Center" building, and displayed in a dedicated pool UI. Designed for casual-friendly progression with no secondary currency and no replacement of the core economy.

V1 ships **mining + combat PvE**. Exploration is deferred to V1.1.

---

## 1. Vision

"Small spatial opportunities within fleet range."

The Mission Center detects opportunities in the player's solar system (mineral deposits, pirate threats). The player sends fleets through the standard fleet system to act on them. Rewards are modest resource supplements and occasional bonus ships.

### Principles
- **Not a second game** — same ships, same fleet engine, same combat engine. No parallel currencies or mechanics.
- **Readable before all** — the player sees what they'll get (mining) or what they'll face (combat) before committing anything.
- **Casuals capture the essentials** — pool accumulation with cap ensures 3 logins/week is enough to benefit.
- **Anchored in the world** — missions point to real coordinates (belts at pos 8/16, pirates at system positions). It lives in the galaxy, not in an abstract menu.

### Universe Expansion: 16 Positions
The current universe is 15 positions per system. This feature **expands it to 16** to accommodate the outer asteroid belt. This is a prerequisite change that affects:
- `UNIVERSE_CONFIG.positions`: 15 -> 16
- Fleet router validation: `targetPosition` max 15 -> 16
- Galaxy service: slot array size 15 -> 16
- Galaxy view frontend: render 16 slots instead of 15
- Position 8 is a belt within the existing range; position 16 is a new slot.
- Neither position 8 nor 16 is colonizable — they are belt-only slots.

---

## 2. Gameplay Loops

### Mining (chill, regular)

```
Deposits generated in asteroid belts (pos 8 + 16)
    -> Mission Center displays available deposits
    -> Player sends prospector(s) + cargo to the belt
    -> Fleet arrives -> automatic extraction (qty = f(nb prospectors, center level))
    -> Fleet returns with resources
    -> Deposit depletes progressively (shared across system players)
    -> New deposits regenerate periodically
```

Predictable, zero risk, short travel (same system). A passive resource supplement.

### PvE Combat (active, rewarding)

```
Mission Center detects a pirate threat
    -> Pool shows: enemy composition + 3 tiers (easy/medium/hard) + rewards
    -> Player composes their fleet with full information
    -> Fleet arrives -> simulateCombat() executed (player = attacker, pirates = defender)
    -> Victory: loot (resources, sometimes bonus ships)
    -> Defeat: ship losses, no loot
    -> Mission consumed, new mission generated in pool
```

Risk is chosen, not imposed. Enemy composition is always visible before dispatch.

---

## 3. Asteroid Belts (Mining)

### Belt Placement
- **Position 8** (mid-system): smaller deposits, mostly minerai/silicium. Closer to most planets.
- **Position 16** (outer): larger deposits, more hydrogene. Rewards investment in fleet speed.
- Two belts per solar system, visible in the galaxy view.
- Not colonizable — special locations.

### Deposit Generation
- Each belt holds 3-5 active deposits at any time.
- A deposit = resource type (minerai, silicium, or hydrogene) + total extractable quantity.
- Depleted deposits regenerate after 4-8h (randomized).
- Deposits are **shared** — first come, first served across all players in the system.

### Extraction Mechanics
- Fleet must include at least 1 **Prospector** (existing ship) + cargo ships for transport.
- Extracted quantity = `baseExtraction * nbProspectors` (capped by fleet cargo capacity AND remaining deposit stock).
- `baseExtraction` scales with Mission Center level.
- Max 10 prospectors count per trip (prevents big-player monopolization).
- Extraction time at belt: 15 min base, reduced by ~1 min/center level (floor: 5 min).
- Total round-trip: ~20-30 min.

### Extraction Formula

`baseExtraction = 2000 + 800 * (centerLevel - 1)`

| Center Level | baseExtraction per prospector |
|-------------|------------------------------|
| 1 | 2,000 |
| 2 | 2,800 |
| 3 | 3,600 |
| 5 | 5,200 |
| 7 | 6,800 |
| 10 | 9,200 |

Total extracted = `min(baseExtraction * min(nbProspectors, 10), fleetCargoCapacity, depositRemaining)`

These values are calibrated for the Prospector's 10,000 cargo capacity: a single prospector at level 1 extracts 2,000 units (well within its cargo). Multiple prospectors require additional cargo ships only when extraction exceeds total fleet cargo.

### Extraction Phase Implementation
The fleet system has two phases (outbound/return). Rather than adding a third "extracting" phase, the extraction time is implemented as a **delayed return**: the fleet-arrival worker schedules the return with `departureTime = arrivalTime + extractionDuration`. During this delay, the fleet is visible as "Extracting..." in the movements view (frontend display logic, no schema change).

Extraction duration: `max(5, 15 - centerLevel) minutes`.

### Deposit Concurrency
Shared deposits require atomic extraction. Use an atomic SQL update:
```sql
UPDATE asteroid_belts SET deposits = jsonb_set(
  deposits, '{<index>,remainingQuantity}',
  to_jsonb(GREATEST(0, (deposits-><index>->>'remainingQuantity')::numeric - <extracted>))
) WHERE galaxy = $1 AND system = $2 AND position = $3
  AND (deposits-><index>->>'remainingQuantity')::numeric >= <extracted>
RETURNING deposits-><index>->>'remainingQuantity' as new_remaining
```
If the WHERE clause fails (deposit already depleted), the fleet returns empty. This is a simple, race-condition-free approach.

### Prospector Ship
Already implemented in codebase. Actual stats from code:
- Cost: 3,000 minerai, 1,000 silicium, 500 hydrogene
- Cargo capacity: 10,000
- Base speed: 3,000 (combustion drive)
- Combat stats: weapons 5, shield 10, armor 5,000 (non-combatant)
- Current prerequisites: Shipyard lv1

**Required changes for PvE system:**
- Update prerequisites in `ship_prerequisites` seed: add Mission Center lv1, change Shipyard to lv2
- Update `SHIPS` constant in `game-engine/constants/ships.ts` to match

---

## 4. PvE Combat (Pirates)

### Pirate Generation
- Pirates are instanced per player (not shared like belts).
- Composition adapts to the **Mission Center level**, not the player's fleet strength.
- Pirates exist as missions in the pool, not as persistent entities in the galaxy.

### 3 Difficulty Tiers

| Tier | Pirate Composition | Reward | Expected Losses |
|------|-------------------|--------|-----------------|
| Easy | Light fighters, few cruisers | ~1h production equivalent | Near zero if properly equipped |
| Medium | Mixed fleet (cruisers, battleships) | ~3h production equivalent + 30% chance of 1-3 bonus light fighters | 5-15% of sent fleet |
| Hard | Heavy fleet (battleships) | ~6-8h production equivalent + 20% chance of 1-2 cruisers or 1 battleship | 15-30% even with good composition |

### Pirate Coordinates
Pirates are placed at a **random position (1-16, excluding 8 and 16)** within the player's system. The coordinates are generated when the mission is created and stored in `pve_missions.parameters`. Pirates do not occupy a real planet slot — the target position is virtual (like a fleet target with no `targetPlanetId`).

### Combat Resolution
- Uses existing `simulateCombat()` — player = attacker, pirates = defender.
- Pirates have **fixed tech levels** that scale with tier, independent of player techs.
- Victory: loot loaded as cargo, bonus ships stored in fleet event metadata and credited on return.
- Defeat: ship losses applied, no loot, mission consumed.
- **Draw** (6 rounds, both sides have survivors): treated as defeat — ship losses applied, no loot, mission consumed. The player keeps surviving ships but gets nothing. This incentivizes bringing a decisive force.

### Fuel Cost
PvE missions consume fuel normally via the fleet system (same `fuelConsumption()` formula). Since all missions are intra-system, fuel cost is negligible but non-zero. No exceptions — consistency with the fleet system.

### Fleet Recall
- **Mining fleet (outbound):** can be recalled normally, returns without resources.
- **Mining fleet (extracting/returning):** cannot be recalled during extraction delay (fleet is committed). Standard return-phase behavior applies.
- **Pirate combat fleet (outbound):** can be recalled normally, mission remains available in pool.
- **Pirate combat fleet (returning):** standard return behavior, cannot be recalled.

### Insufficient Cargo on Combat Victory
If the player wins but has insufficient cargo capacity for all loot, loot is **capped to cargo capacity** (consistent with PvP attack loot behavior). Excess loot is lost. Bonus ships are not affected by cargo (they are delivered separately via metadata).

### Pirate Templates
- 8-10 archetypes covering varied compositions (shield-heavy, swarm, heavy hitters, mixed...).
- Each archetype has 3 tier variants (easy/medium/hard scaling).
- Stored in `pirate_templates` table, seeded at launch.
- Varied compositions prevent single-fleet-comp optimization.

---

## 5. Mission Center Building

### Progression Table

| Level | Unlocks | Pool Size | Effect |
|-------|---------|-----------|--------|
| 1 | Mining (belt pos 8), Prospector buildable | 3 | Base extraction |
| 2 | Mining (belt pos 16) | 3 | +extraction per prospector |
| 3 | PvE Combat (easy tier) | 4 | First pirate missions |
| 4 | PvE Combat (medium tier) | 4 | Tougher pirates |
| 5 | — | 5 | +extraction, better combat rewards |
| 6 | PvE Combat (hard tier) | 5 | Endgame PvE access |
| 7+ | Continuous scaling | 6 (cap) | Better deposits, richer pirates, more frequent bonus ships |

### Prerequisites
- Shipyard level 3
- Research Lab level 1

Intentionally low — PvE should be accessible early to serve as a fleet tutorial for casuals.

### Tutorial Disguise
- Lv 1-2: player learns mining (no risk, simple send-fleet-to-belt mechanic).
- Lv 3: introduction of risk via easy pirate tier (learn to read enemy composition).
- Lv 4+: deeper engagement with meaningful fleet composition decisions.

---

## 6. Pool & Accumulation

### Pool Mechanics
- **Visible pool size:** 3 to 6 missions depending on Mission Center level.
- **Accumulation cap:** 2x pool size (6 to 12 missions stored max).
- **Refresh rate:** ~1 new mission every 4h (independent of consumption).
- **When cap is reached:** oldest missions are replaced (FIFO).
- **No FOMO:** never show "missions lost" counter or "pool full" notification.

### Player Profiles

| Profile | Missions/day | Value captured vs max |
|---------|-------------|----------------------|
| Hardcore (4-6 logins/day) | 5-6 | 100% |
| Regular (2 logins/day) | 2-3 | ~60% |
| Casual (1 login/2 days) | 4-6 in one batch (accumulated stock) | ~50% |

---

## 7. Rewards Calibration

### Mining Rewards

| Center Level | Extraction per prospector (base) | Typical deposit pos 8 | Typical deposit pos 16 |
|-------------|--------------------------------|----------------------|----------------------|
| 1 | 2,000 units | 30,000 minerai/silicium | — |
| 3 | 3,600 units | 50,000 minerai/silicium | 30,000 hydrogene |
| 5 | 5,200 units | 75,000 minerai/silicium | 50,000 hydrogene |
| 7+ | 6,800 units | 120,000 minerai/silicium | 80,000 hydrogene |

Deposits are sized for **3-5 extraction trips** before depletion (at typical prospector counts). With the Prospector's 10,000 cargo capacity, a single prospector at level 1 extracts 2,000 per trip from a 30,000 deposit = 15 solo trips, or 3 trips with 5 prospectors.

Mining rewards = **10-20% of the player's hourly mine production** at the equivalent game stage. Supplement, never replacement.

### Combat Rewards
- **Always:** resources (minerai, silicium, hydrogene) proportional to tier.
- **Sometimes (medium/hard):** 1-3 bonus ships of types the player can already build.
- **Never:** exclusive currency, exclusive ships, pay-to-win boosts.

### Risk (combat only)
- **Easy:** zero losses with recommended fleet. Designed with comfortable margin.
- **Medium:** 5-15% fleet losses with correct composition. Bad composition = heavy losses.
- **Hard:** 15-30% expected losses even with good composition. Bad composition = defeat.

Enemy composition visible before dispatch transforms risk into **calculation, not lottery**.

---

## 8. Pitfalls & Mitigations

| Pitfall | Rule |
|---------|------|
| PvE cannibalizes economy | Rewards = 10-20% max of production at same stage. If players neglect mines, rewards are too high. |
| PvE makes PvP useless | Hard PvE = ~6-8h production. Successful PvP raid = much more. PvE is safe, PvP is profitable. |
| Ship bonus inflation | Rare (20-30%), small quantities (1-3 units), only ships player can already build. Never PvE-exclusive ships. |
| Big player belt farming | Max 10 prospectors count per trip. Big players must do multiple round-trips like everyone. |
| Pool creates FOMO | Accumulation with cap. No "missions lost" counter. Pool fills silently. |
| Predictable pirates | 8-10 varied archetypes (shield-heavy, swarm, heavy hitters...). Each mission requires reading. |
| Mandatory building | Low prerequisites but modest early rewards. Delaying construction = no significant disadvantage. |
| Belt griefing (tiny extractions) | Minimum 1 prospector required per mining mission. The extraction formula (`baseExtraction * nbProspectors`) means even 1 prospector extracts a meaningful amount. No need for an additional minimum threshold — the prospector requirement is the gate. |
| Multiple fleets to same deposit | If a player sends fleet A then fleet B to the same deposit, and fleet A depletes it, fleet B's atomic UPDATE fails and it returns empty. The UI shows current `remainingQuantity` but does not prevent dispatch — the player accepts the race risk. This is simple and consistent. |
| Reward calibration drift | Log PvE reward totals per player via the existing `game_events` table (eventType: 'pve_mining_reward' / 'pve_combat_reward', details JSONB with amounts). Enables post-launch verification of the 10-20% target. |

---

## 9. Technical Scope

### Universe Expansion (Prerequisite)

**`UNIVERSE_CONFIG`** (`apps/api/src/modules/universe/universe.config.ts`):
- Change `positions: 15` to `positions: 16`

**Fleet router** (`apps/api/src/modules/fleet/fleet.router.ts`):
- Update `targetPosition` validation: `.max(15)` -> `.max(16)`
- Add `'mine'` and `'pirate'` to `missionTypes` const
- Add `'prospector'` and `'explorer'` to `shipIds` const (pre-existing omission)

**Fleet service** (`apps/api/src/modules/fleet/fleet.service.ts`):
- Update `SendFleetInput.mission` type to include `'mine' | 'pirate'`
- Allow `targetPlanetId` to be null for mine/pirate missions (belts and pirates are not planets)
- Add `'mine'` and `'pirate'` cases in `processArrival` that delegate to `pve.service` methods

**Galaxy service** (`apps/api/src/modules/galaxy/galaxy.service.ts`):
- Expand slot array from 15 to 16
- Positions 8 and 16: render as belt type instead of empty/planet

**Planet generation:**
- Positions 8 and 16 must be excluded from colonization (cannot place planets there)

### New Database Tables

**`asteroid_belts`**
- id (uuid, PK)
- galaxy (smallint), system (smallint), position (smallint: 8 or 16)
- Unique constraint on (galaxy, system, position)
- Created **lazily**: when the first player in a system builds a Mission Center, or when the galaxy view for that system is first loaded by a player with a Mission Center. Not pre-generated for all 4,491× 2 systems.

**`asteroid_deposits`** (normalized — one row per deposit, not JSONB)
- id (uuid, PK)
- beltId (FK to asteroid_belts)
- resourceType (varchar: 'minerai' | 'silicium' | 'hydrogene')
- totalQuantity (numeric)
- remainingQuantity (numeric)
- regeneratesAt (timestamp, nullable — set when deposit is depleted)
- Index on (beltId, remainingQuantity) for efficient queries
- Atomic extraction: `UPDATE asteroid_deposits SET remainingQuantity = GREATEST(0, remainingQuantity - $1) WHERE id = $2 AND remainingQuantity >= $1 RETURNING remainingQuantity`

**`pve_missions`**
- id (uuid, PK)
- userId (FK to users)
- missionType (varchar: 'mine' | 'pirate')
- parameters (JSONB — coordinates, depositId for mine, templateId+tier for pirate)
- rewards (JSONB — expected resources, bonus ship chances)
- difficultyTier (varchar, nullable: 'easy' | 'medium' | 'hard' — combat only)
- status (varchar: 'available' | 'in_progress' | 'completed' | 'expired')
- createdAt (timestamp)
- expiresAt (timestamp, nullable)
- Index on (userId, status) for pool queries and scalable cron
- **Rule:** missions with `status = 'in_progress'` are never expired or deleted (fleet may be in transit)

**`pirate_templates`**
- id (varchar, PK)
- name (varchar)
- tier (varchar: 'easy' | 'medium' | 'hard')
- ships (JSONB — Record<string, number>)
- techs (JSONB — {weapons, shielding, armor})
- rewards (JSONB — {minerai, silicium, hydrogene, bonusShips: [{shipId, count, chance}]})
- centerLevelMin (int), centerLevelMax (int)
- Seeded via migration, editable in DB. 8-10 archetypes × 3 tiers.

### Schema Changes

**`fleet_mission` enum:** add `'mine'` and `'pirate'` values via migration.

**`fleet_events` table:** add optional `pveMissionId` (uuid, FK to `pve_missions`, nullable) for linking fleet events to PvE missions.

**`building_definitions` seed:** add `missionCenter` building with prerequisites (shipyard 3, researchLab 1).

**`ship_prerequisites` seed:** update `prospector` prerequisites to require missionCenter lv1, shipyard lv2.

**`game-engine` constants:**
- `SHIPS.prospector.prerequisites`: add `missionCenter` level 1, update shipyard to level 2
- `BuildingId` type (if used): add `'missionCenter'`

### New Backend Components

**`src/modules/pve/`** — new module:
- `pve.router.ts` — tRPC router (getMissions, getAsteroidBelt, getAsteroidDeposits)
- `pve.service.ts` — mission pool logic (generation, accumulation, expiration, FIFO replacement)
- `asteroid-belt.service.ts` — belt/deposit management (lazy creation, extraction, regeneration)
- `pirate.service.ts` — pirate template selection, combat resolution wrapper, reward calculation

**Integration with fleet module:**
- `processArrival` in `fleet.service.ts` adds two new cases (`'mine'`, `'pirate'`) that call into `pve.service` / `pirate.service` / `asteroid-belt.service`. This follows the existing dispatch pattern (if/else on `event.mission`).
- For mining: PvE service calculates extraction, calls asteroid-belt service for atomic deduction, loads cargo, schedules delayed return.
- For pirate: PvE service loads template, calls `simulateCombat()`, determines loot, stores bonus ships in fleet event metadata.
- `processReturn` adds handling for bonus ships: reads metadata, credits ships to `planetShips`.

**Workers:**
- New cron `mission-refresh` (~30 min interval): generates missions in player pools, regenerates depleted deposits. Uses index on `pve_missions(userId, status)` and processes in batches (100 players/batch) for scalability.
- Extend `fleet-arrival` worker: handle `mine` and `pirate` via delegation to PvE module.
- Extend `fleet-return` worker: credit bonus ships from metadata for PvE returns.

**Queues:** No new queues needed — reuses existing `fleet-arrival-queue` and `fleet-return-queue`.

### New Frontend Components

**New page: `Missions.tsx`**
- Displays mission pool (mining + combat missions)
- Each mission card shows: type, coordinates, expected rewards, pirate composition (if combat), difficulty tier selector (if combat)
- "Send fleet" button redirects to fleet dispatch with pre-filled parameters

**Galaxy view extension:**
- 16 positions instead of 15
- Positions 8 and 16 show asteroid belt icons (not planet slots)
- Tooltip shows active deposits (count, resource types) for players with Mission Center

**Fleet dispatch extension:**
- Support `mine` and `pirate` mission types
- Pre-fill from mission pool selection
- Allow dispatch without `targetPlanetId` for PvE targets

**Movements view extension:**
- Mining fleets in extraction delay show "Extracting..." status

### Technical Flow

**Mining:**
```
Pool shows deposit -> player clicks "Send"
-> Fleet dispatch (mission=mine, target=belt pos 8 or 16, pveMissionId)
-> Fleet departs (fleet_events, mission=mine, targetPlanetId=null)
-> fleet-arrival worker:
   - Delegate to pve.service.processMiningArrival()
   - Calculate extraction: min(baseExtraction * min(nbProspectors, 10), cargoCapacity, depositRemaining)
   - Atomic UPDATE on asteroid_deposits (returns new remaining, or fails if depleted -> fleet returns empty)
   - Load extracted resources as cargo
   - Schedule return: arrivalTime + extractionDuration (delayed return, no new phase)
   - Mark pve_mission as completed
-> fleet-return worker: credit resources to planet (standard cargo handling)
```

**PvE Combat:**
```
Pool shows pirate mission -> player selects tier -> clicks "Send"
-> Fleet dispatch (mission=pirate, target=pirate coordinates, pveMissionId)
-> Fleet departs (fleet_events, mission=pirate, targetPlanetId=null)
-> fleet-arrival worker:
   - Delegate to pirate.service.processPirateArrival()
   - Load pirate template for selected tier
   - Run simulateCombat(player fleet, pirate fleet, playerTechs, pirateTechs, ...)
   - Victory: calculate loot (cap to cargo capacity), store bonus ships in event metadata
   - Defeat/Draw: apply losses, no loot
   - Set phase=return
   - Mark pve_mission as completed
-> fleet-return worker:
   - Credit cargo resources to planet (standard)
   - Read bonus ships from metadata, credit to planetShips
```

**Mission Refresh Cron:**
```
Every ~30 min: batch-process players with Mission Center
-> For each player: if pool count (status=available) < accumulation cap:
   - Generate mission (weighted random: ~60% mining, ~40% combat)
   - Mining: pick a belt with available deposits in player's system
   - Combat: select pirate template matching center level + random tier
   - If cap is reached by existing missions, skip (FIFO replacement only happens when NEW mission is generated and pool is at cap -> delete oldest available mission)
-> For each depleted deposit (remainingQuantity = 0) where regeneratesAt < now():
   - Generate new deposit (random resource type + quantity based on belt position)
```

---

## 10. Out of Scope (V1)

- **Exploration system** (scout ship, procedural content, merchants, anomalies) -> V1.1
- **Belt events** (rare deposits, pirates guarding belts, competition features) -> V1.2
- **Specialization branches** for Mission Center -> V1.3
- **Multi-step missions** (chain objectives) -> V1.3
- **PvE ranking** -> V1.3
- **Temporary buff rewards** (production bonuses, speed bonuses)
- **Admin UI for pirate templates** (seeded via migration, editable in DB)
- **Inter-system PvE missions** (all missions stay within player's solar system)

---

## 11. Future Evolution Paths

### V1.1 — Exploration
New Scout ship sends exploration missions. Discovers temporary content: wrecks (recyclable debris), pirate signals (bonus combat missions), anomalies (temporary production buffs), itinerant merchants (favorable resource exchange rates). Deserves its own design cycle.

### V1.2 — Belt Events & Competition
Rare exceptional deposits (3-5x normal size) trigger races between system players. Pirates guard some deposits (combat before mining). Belt activity history creates social context.

### V1.3 — Progression Depth
Mission Center specialization branches at level 8+ (advanced prospecting vs tactical center). Multi-step scripted missions (spy -> attack -> recycle). Optional PvE ranking column in existing leaderboard.
