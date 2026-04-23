# Chantier spatial — redesign

Bring `Shipyard.tsx` to the same design language as `Market.tsx` (hero banner, KPI tiles, glass cards, filter chips). Pure presentation refactor: all tRPC queries, mutations and business logic are preserved.

## Scope

- Only ships. Defenses live on a separate Arsenal page and are out of scope here.
- Categories shown: `ship_transport`, `ship_utilitaire` (combat ships are built at the Command Center, filtered out in the existing code).

## Page structure

### 1. Hero banner

Full-bleed block at the top of the page, identical pattern to `Market.tsx`:

- Background: `getAssetUrl('buildings', 'shipyard')`, `object-cover opacity-40 blur-sm scale-110`, with a cyan/slate gradient overlay and bottom fade to `background`.
- Left: building thumb (`getAssetUrl('buildings', 'shipyard', 'thumb')`), circular, `border-2 border-primary/30`, `80×80` mobile / `96×96` desktop. Click opens the help overlay (hover shows a help "?" icon like Market).
- Right:
  - H1: **Chantier spatial**
  - Subtitle: `Niveau {N} · {parallelSlots} slot{s} parallèle{s}` where `parallelSlots` follows the same derivation as today (shipyard building level).
  - Paragraph (desktop only, `hidden lg:block`): "Assemblez les vaisseaux industriels de votre empire : transporteurs, prospecteurs, récupérateurs. Chaque niveau du chantier débloque un slot de production parallèle."

Vouvoiement is kept throughout.

### 2. KPI tiles

Three `KpiTile` cards (same component shape as Market's internal `KpiTile`), in a `grid grid-cols-3 gap-3`:

| Label                 | Value                                                     | Color           |
| --------------------- | --------------------------------------------------------- | --------------- |
| Vaisseaux stationnés  | `sum(ship.count)` across all ships on this planet         | `text-cyan-400`   |
| En construction       | `sum(entry.quantity - (entry.completedCount ?? 0))` over queue | `text-amber-400`  |
| Slots actifs          | `{activeBatches} / {parallelSlots}`                       | `text-emerald-400` |

Tiles are non-clickable (unlike Market's), since they describe local state rather than navigation targets.

### 3. Construction queue (glass-card)

Shown only when `shipQueue.length > 0`. Keeps every existing behaviour:

- Parallel slots badge (`x{N} parallele`) when more than one active batch.
- Queue end ETA top-right (existing computation preserved verbatim).
- Per-entry row:
  - Left accent border: `border-l-orange-500` when active, `border-l-muted-foreground/30` when queued.
  - Remaining count + ship name (`{remaining}x {name}`).
  - `-1` button (when `remaining > 1`) → `reduceMutation`.
  - `Annuler` button → `ConfirmDialog` with current copy.
  - Active row shows the `Timer` component; queued row shows "En attente".

Visual polish only: restyled header (clock SVG + "File de construction"), softer row container (no change to logic).

### 4. Role filter chips

One pill group placed between queue and ship grid, same styling as Market's type filter (`bg-card/30 rounded-lg p-0.5 border border-border/20 w-fit`):

- `Tout` — grid-of-squares SVG (default)
- `Transport` — cargo/truck SVG
- `Utilitaire` — pickaxe SVG (covers mining + recycling roles)

Active state: `bg-primary/10 text-primary`. Inactive: `text-muted-foreground hover:text-foreground`.

Default selection: `Tout`. Filter state is local to the page (no URL param needed; matches the simplicity of the current page).

### 5. Ship grid (glass-card)

One glass-card wrapping the filtered content. When `filter === 'all'`, each category is rendered as a subsection with a small uppercase header plus its role SVG (mirrors Market's `Ressources` / `Planètes` subsections). When a specific category is selected, no subsection header is shown.

Desktop card (replaces the current `retro-card`):

- 130px image header, `object-cover`, subtle gradient from `card` at the bottom.
- Top-right `x{count}` badge.
- Top-right "Objectif" badge + amber ring when `tutorialTargetId === ship.id` (preserved).
- Body:
  - Ship name (semibold, truncate).
  - `ResourceCost` with `currentMinerai/Silicium/Hydrogene` (red/green semantics preserved).
  - Duration line with a clock SVG.
  - If `!prerequisitesMet`: `PrerequisiteList` (missingOnly).
  - Else: `QuantityStepper` + `Construire` button (full width).
- Click on the card (outside controls) opens the existing `EntityDetailOverlay` with `ShipDetailContent`. Stops propagation on controls is preserved.

Mobile row (replaces the current compact button):

- 48×48 ship thumbnail + name + `x{count}` on the right.
- Cost + duration row underneath.
- Inline `QuantityStepper` + `OK` button when `prerequisitesMet`.
- Tutorial highlight preserved.

Locked ships (`!ship.prerequisitesMet`) display at 50% opacity and show only the prerequisite list instead of build controls, matching current behaviour.

### 6. Locked state

If `buildings` is loaded and `shipyardLevel < 1`, render Market's locked pattern (full-bleed centered block with muted icon, title, one-line explainer, link to `/buildings`). Copy:

- Title: "Chantier spatial"
- Body: "Construisez le Chantier spatial pour assembler les vaisseaux industriels de votre empire."
- CTA: "Aller aux bâtiments"

### 7. Help overlay

`EntityDetailOverlay` triggered by the hero thumb. Sections:

1. Hero image (shipyard asset) with level/slots overlay at the bottom.
2. **Catégories** — Transport (cargo, transporters) and Utilitaire (prospecteurs, récupérateurs).
3. **Slots parallèles** — Each shipyard level unlocks one additional parallel build slot.
4. **File d'attente** — Ships queue and build sequentially within each slot; batches can be reduced (`-1`) or cancelled.
5. **Annulation** — Cancelling a batch refunds proportionally to remaining time, capped at 70%. Already-built ships are kept.

## Component split

`Shipyard.tsx` becomes a thin orchestrator (~150 lines). New sibling components under `apps/web/src/components/shipyard/`:

- `ShipyardHero.tsx` — banner + help-overlay trigger
- `ShipyardKpis.tsx` — three KPI tiles
- `ShipyardQueue.tsx` — queue section (takes queue + mutations as props)
- `ShipyardRoleFilter.tsx` — pill group, owns the list of filter chips
- `ShipCard.tsx` — desktop card
- `ShipMobileRow.tsx` — mobile row
- `ShipyardHelp.tsx` — help overlay content

Each component receives already-resolved data and callbacks — no direct tRPC calls inside leaf components (matches `market/*.tsx` conventions).

`KpiTile` from `Market.tsx` is currently file-private; extract it to `apps/web/src/components/common/KpiTile.tsx` so both pages can share it. Market imports from the new location; behaviour unchanged (the `onClick` prop remains optional so the shipyard can use it without navigation).

## Data contract (unchanged)

All existing tRPC hooks are kept:

- `trpc.building.list` — for `shipyardLevel` and prerequisites
- `trpc.shipyard.ships` — ship list with `count`, `cost`, `timePerUnit`, `prerequisitesMet`
- `trpc.shipyard.queue` — active + queued batches
- `trpc.resource.production` — resources + rates for `useResourceCounter`
- `trpc.research.list` — research levels for prerequisite resolution
- `trpc.shipyard.buildShip`, `trpc.shipyard.cancelBatch`, `trpc.shipyard.reduceQuantity` — mutations (identical invalidations)

Parallel-slots derivation stays as in the existing queue-handling block.

## Out of scope

- Changing shipyard mechanics (slot count formula, refund cap, build time).
- URL parameters for filter state.
- Analytics or tutorial rework beyond keeping the existing `tutorialTargetId` highlight.
- Arsenal / Command Center pages (can be redesigned with the same pattern later, but not in this spec).

## Acceptance criteria

1. Visual parity with Market's design language: hero, KPIs, glass-card, filter chips.
2. All existing behaviours preserved: build, queue, reduce, cancel, detail overlay, tutorial highlight, locked state.
3. Mobile and desktop layouts both look polished; no horizontal overflow.
4. No regressions on build flow (cost → quantity → mutation → invalidations).
5. Filter chips switch between Tout / Transport / Utilitaire without refetching; category SVGs render correctly.
6. No emojis anywhere in UI; French copy uses vouvoiement.
