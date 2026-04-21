# Colonization reports redesign

## Overview

The four mission reports tied to colonization — `colonize`, `colonize_reinforce`, `colonization_raid`, and `abandon_return` — currently render with no or minimal visual treatment. Three of them have no dedicated detail component and fall through to a generic fleet summary. The goal is to give the whole family a consistent, visual, lightly-narrated treatment, and to extract two shared primitives that a later spec can reuse across the other seven report types.

**Scope boundary:** this spec redesigns colonization reports only. A follow-up spec (already agreed) migrates `CombatReportDetail`, `ExploreReportDetail`, `SpyReportDetail`, `RecycleReportDetail`, `TradeReportDetail`, `MineReportDetail`, `TransportReportDetail` onto the same primitives.

## Design decisions (locked in during brainstorming)

1. **Hero visual:** planet portrait (reuses `PlanetDot`) + coords label + bold title + optional italic lore line, on a radial-gradient background. Accent color comes from a `status` prop (`success` / `warning` / `danger` / `neutral`).
2. **Lore policy:** narrative line only on dramatic moments (landing success, no-garrison pillage, convoy lost). Routine reports stay terse.
3. **Explainer policy:** inline helper text appears only when a value is notable — high difficulty (≥4/5), no garrison, large progress penalty, debris left behind. Non-notable reports stay data-only.
4. **Raid combat detail:** simplified summary by default (FP attacker vs defender, outcome, losses). A "Voir le détail" toggle expands the existing `CombatReportDetail` component for the full round-by-round view.
5. **Code structure:** per-type components compose shared primitives. Two primitives extracted.
6. **Copy convention:** all player-facing text uses **vous**, never **tu**.

## Architecture

### New primitives

Both live in `apps/web/src/components/reports/shared/`.

#### `<ReportHero>`

```ts
interface ReportHeroProps {
  coords: { galaxy: number; system: number; position: number };
  title: string;
  statusLabel: string;
  status: 'success' | 'warning' | 'danger' | 'neutral';
  planetClassId?: string;       // resolved to <PlanetDot>
  icon?: React.ReactNode;       // overrides PlanetDot (asteroid cluster, pirate ship)
  lore?: string;                // italic narrative line when present
}
```

Layout: radial gradient background keyed off `status`. Left slot = `PlanetDot` (or `icon` when given). Right slot = small uppercase `statusLabel` in accent color, then `title` bold, then `lore` in muted italic. Coords shown as small monospace caption using `<CoordsLink>`.

Accent colors:
- `success` → emerald (`#10b981`)
- `warning` → amber (`#f59e0b`)
- `danger` → rose (`#f43f5e`)
- `neutral` → slate (`#64748b`)

#### `<ResourceDeltaCard>`

```ts
interface ResourceDeltaCardProps {
  title: string;
  cargo: { minerai?: number; silicium?: number; hydrogene?: number };
  variant: 'loss' | 'gain' | 'debris' | 'neutral';
  explainer?: string;
}
```

Behavior:
- Zero lines auto-hidden.
- Whole card returns `null` when all amounts are zero.
- `gain` prefixes amounts with `+`, `loss` with `−`. Colors: gain=emerald, loss=rose, debris=amber, neutral=muted.
- Uses existing `MineraiIcon` / `SiliciumIcon` / `HydrogeneIcon`.
- `explainer` renders as a small muted line under the amounts.

### New detail components

All live in `apps/web/src/components/reports/`.

| File | Handles | Outcomes |
|---|---|---|
| `ColonizeReportDetail.tsx` | `colonize` | landing success, asteroid belt, position occupied |
| `ColonizeReinforceReportDetail.tsx` | `colonize_reinforce` | delivered, aborted |
| `ColonizationRaidReportDetail.tsx` | `colonization_raid` | no-garrison pillage, combat won/draw/lost |
| `AbandonReportDetail.tsx` *(polish)* | `abandon_return` | homecoming, lost in transit |

### Router wiring

`apps/web/src/pages/ReportDetail.tsx` gains three new branches alongside the existing `abandon_return` branch:

```tsx
{report.missionType === 'colonize' && <ColonizeReportDetail result={result} fleet={fleet} gameConfig={gameConfig} coordinates={coords} />}
{report.missionType === 'colonize_reinforce' && <ColonizeReinforceReportDetail result={result} fleet={fleet} gameConfig={gameConfig} coordinates={coords} />}
{report.missionType === 'colonization_raid' && <ColonizationRaidReportDetail result={result} fleet={fleet} gameConfig={gameConfig} coordinates={coords} reportId={report.id} />}
```

When a dedicated colonization detail renders, the generic "Flotte envoyée" summary above (lines 155-170 of `ReportDetail.tsx`) is suppressed, since each component owns its own fleet rendering. Gate with `const hasOwnFleetView = ['colonize','colonize_reinforce','colonization_raid','abandon_return'].includes(report.missionType)`.

## Per-report content

All hero cards open with `<ReportHero>`. The table below specifies status/title/lore; body cards follow.

**Hero left-slot rule:** only `colonize` landing success uses the real planet portrait via `<PlanetDot>` — we look up `planetClassId` with `trpc.planet.byId.useQuery({ id: planetId })` and fall back to the `icon` override while the query is loading. Every other outcome uses a small inline SVG via the `icon` prop (coloured to match the hero accent) — no async lookup, no cross-component data fetching. The five inline SVGs to implement:

| Usage | Sketch |
|---|---|
| Asteroid belt | Three irregular rock ovals clustered |
| Position occupied | Planet silhouette with a small "lock" glyph |
| Reinforce delivered | Cargo crate with a downward arrow |
| Reinforce aborted | Empty dock outline with a question mark |
| Colonization raid | Small skull over a ship silhouette |
| Abandon homecoming | Docking silhouette (ship + port) |
| Abandon lost | Fractured ship outline |

Keep each under 25 lines of inline JSX, using the same stroke-based style as the existing `ResourceIcons`.

### `colonize`

**Landing success** — payload `{ success: true, colonizing: true, planetId, difficulty }`

- Hero: `status=success`, title = `"Nouvelle colonie"` (do not attempt a name lookup — a colony just created has the default name `"Colonie"` and the player will rename it), `statusLabel="Débarquement réussi"`.
- Lore: *"Les premiers modules s'enfoncent dans le régolithe. Le drapeau de votre empire flotte au-dessus d'un monde encore sauvage."*
- Body:
  1. **Colonie en construction** — progress bar + ETA + button "Suivre l'avancement" → `/colonization/:planetId`.
  2. **Difficulté du monde** — 1-5 stars rendered from `difficulty`. Explainer shown only when `difficulty >= 4`: *"Colonisation longue, raids plus fréquents."*
  3. **Flotte débarquée** — inline ship grid using `getShipName`.

**Asteroid belt** — payload `{ success: false, reason: 'asteroid_belt' }`

- Hero: `status=neutral`, `icon` = asteroid cluster SVG (new tiny SVG), title = "Position inhabitable", `statusLabel="Ceinture d'astéroïdes"`.
- Lore: *"Le vaisseau colonial n'a trouvé qu'un champ de poussières et de roches."*
- Body:
  1. **Raison** — "Ceinture d'astéroïdes. Un recycleur peut exploiter le champ."
  2. **Flotte rappelée** — ship grid (the fleet is returning; arrival generates a separate transport-return report).

**Position occupied** — payload `{ success: false, reason: 'occupied' }`

- Hero: `status=warning`, title = "Position déjà colonisée", `statusLabel="Arrivée annulée"`.
- Lore: none.
- Body:
  1. **Raison** — "Une colonie occupe déjà cette position."
  2. **Flotte rappelée** — ship grid.

### `colonize_reinforce`

**Delivered** — payload `{ stationed: Record<shipId,count>, deposited: { minerai, silicium, hydrogene } }`

- Hero: `status=success`, title = `"Renforts livrés"` (no planet-name lookup — keep it static; the coords line under the title already carries the location), `statusLabel="Colonisation en cours"`.
- Lore: none (routine).
- Body:
  1. `<ResourceDeltaCard variant="gain" title="Cargo livré" cargo={deposited} />`.
  2. **Ships intégrés à la garnison** — ship grid of `stationed`.
  3. Link: "Voir l'avancement de la colonisation" → `/colonization/:planetId` (resolved from coords via existing planet lookup).

**Aborted** — payload `{ aborted: true, reason: 'no_colonizing_planet' }`

- Hero: `status=warning`, title = "Mission annulée", `statusLabel="Cible non trouvée"`.
- Lore: *"À l'arrivée, plus rien à défendre."*
- Body:
  1. **Raison** — "La colonisation est terminée ou a été abandonnée."
  2. Info line: "La flotte et son cargo reviennent à leur planète d'origine." (no delta card — the return arrival is its own report)

### `colonization_raid`

Shared body ordering: combat summary (when applicable) → pillage → progress penalty → pirate fleet.

**No garrison** — payload `{ outcome: 'attacker', hasGarrison: false, pirateFleet, progressPenalty, pillaged }`

- Hero: `status=danger`, title = "Pillage sans résistance", `statusLabel="Raid pirate"`.
- Lore: *"Les pirates ont pillé le chantier. Votre embryon de colonie saigne."*
- Body:
  1. `<ResourceDeltaCard variant="loss" title="Pillé" cargo={pillaged} />`.
  2. **Progression perdue** — shows `−progressPenalty%`. Explainer: *"Déployez une garnison pour limiter les prochains pillages."*
  3. **Flotte pirate** — ship grid.

**Combat variants** — payload shape from `buildCombatReportData(...)` plus `{ pillage?, progressPenalty, raidType: 'colonization_raid' }`

For all three (won / draw / lost):
- Hero: `status=success` (won) / `warning` (draw) / `danger` (lost). Title and status label per outcome:
  - Won: "Raid repoussé" · "Garnison victorieuse". Lore: *"Les pirates ont battu en retraite."*
  - Draw: "Raid contenu" · "Égalité". Lore: none.
  - Lost: "Garnison défaite" · "Raid pirate". Lore: *"Les défenseurs ont tenu, puis cédé."*
- Body:
  1. **Résumé combat** — small card with three rows: (a) `FP pirates · FP garnison` with a thin horizontal ratio bar, (b) round count + outcome label, (c) "Pertes garnison" as an inline compact ship grid (all non-zero entries, comma-separated). Under the card, a `[Voir le détail]` toggle that expands into the existing `<CombatReportDetail>` component inline (controlled by local `useState` on the raid detail component).
  2. `<ResourceDeltaCard variant="loss" title="Pillé" cargo={pillage} />` — only when `outcome === 'attacker'`.
  3. **Progression perdue** — shows `−progressPenalty%`. Explainer shown only when penalty > 0: *"La colonisation a reculé."* For draws, add: *"Pénalité réduite de moitié grâce à la résistance."*

### `abandon_return` (polish pass)

**Homecoming** — payload `{ destination, delivered, overflow }`

- Hero: `status=success`, title = `destination.name` (present in payload), `statusLabel="Convoi rapatrié"`. Uses the "Abandon homecoming" inline SVG from the Hero left-slot rule.
- Lore: *"Le convoi s'amarre au port spatial. Le monde qu'il a quitté n'existe plus."*
- Body:
  1. **Arrivée sur** — destination planet card with `<CoordsLink>`.
  2. **Ships rapatriés** — ship grid of `delivered.ships`.
  3. `<ResourceDeltaCard variant="gain" title="Ressources livrées" cargo={delivered.cargo} />`.
  4. `<ResourceDeltaCard variant="debris" title="Champ de débris laissé" cargo={overflow} />` — only when overflow > 0. Explainer: *"Recyclable par votre flotte sur l'ancienne position."*

**Lost in transit** — payload `{ aborted: true, reason, shipsLost, cargoLost }`

- Hero: `status=danger`, title = "Convoi perdu", `statusLabel="Retour échoué"`.
- Lore: *"La planète de destination s'est effondrée avant l'arrivée. Le convoi erre dans le vide, sans port d'attache."*
- Body:
  1. **Raison** — human-readable mapping of `reason`. Known values today: `destination_gone` → "La destination n'existe plus.". Unknown values fall back to the raw string.
  2. **Ships perdus** — ship grid of `shipsLost`.
  3. `<ResourceDeltaCard variant="loss" title="Ressources perdues" cargo={cargoLost} />`.

## Icons and illustrations

- **PlanetDot** (existing) — used for `colonize` landing success only (see Hero left-slot rule above).
- **Inline hero icons** — seven new per-outcome SVGs listed in the Hero left-slot rule, each placed in the component that consumes it (not extracted to a shared file — they are single-use).
- **Star icon** — for difficulty rating. Use a small filled-star SVG inline in `ColonizeReportDetail.tsx` (1-5 filled vs outlined).

Zero emojis anywhere in the copy or UI (per existing project convention).

## Backend work

None. All four report payloads already carry the data needed above. No handler or schema changes.

## File manifest

**New files:**
- `apps/web/src/components/reports/shared/ReportHero.tsx`
- `apps/web/src/components/reports/shared/ResourceDeltaCard.tsx`
- `apps/web/src/components/reports/ColonizeReportDetail.tsx`
- `apps/web/src/components/reports/ColonizeReinforceReportDetail.tsx`
- `apps/web/src/components/reports/ColonizationRaidReportDetail.tsx`

**Modified files:**
- `apps/web/src/components/reports/AbandonReportDetail.tsx` — replace current JSX with the new layout, use primitives.
- `apps/web/src/pages/ReportDetail.tsx` — add three branches, suppress generic fleet summary for the 4 colonization types.

## Testing

**Manual:**
- Trigger each of the 9 outcomes above in a dev session and verify the report renders correctly.
  - `colonize` success / asteroid / occupied
  - `colonize_reinforce` delivered / aborted
  - `colonization_raid` no-garrison / won / draw / lost
  - `abandon_return` homecoming / lost
- Verify hero accent colors, lore presence/absence, explainer gating, expand behavior on raid combat.

**Type safety:**
- `pnpm -F @exilium/web typecheck` passes.

**No new unit tests:** these are pure presentational components reading already-validated payloads. Visual verification is sufficient.

## Rollout

Single PR. Feature flag not needed — the new components simply replace the generic fallback rendering for these mission types. Existing reports in the DB already carry the required payload shapes, so historical reports get the new look retroactively.

## Out of scope

- Migrating the seven non-colonization report types (combat, explore, spy, recycle, trade, mine, transport) onto the new primitives — covered by the follow-up spec.
- Any backend payload changes (including ExploreReportDetail alignment).
- Extracting a shared ship grid component.
- Animations or transitions on report open.
