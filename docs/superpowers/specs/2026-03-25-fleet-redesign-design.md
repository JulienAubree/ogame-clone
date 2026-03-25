# Fleet UI Redesign — Design Spec

## Problem

The current fleet UI is confusing for newcomers. Two pages (Fleet.tsx for sending, Movements.tsx for tracking) mix multiple concerns: stationed ships, active movements, mission selection, and ship composition are not clearly separated. There are no ship images, and the interface relies heavily on text.

## Goals

- Clearly separate fleet information into distinct, focused pages
- Add a central dashboard as the entry point for all fleet operations
- Make the UI more visual (ship images, mission icons, category grouping)
- Guide newcomers with better information hierarchy and contextual help
- Make hostile fleet alerts immediately visible and prominent

## Navigation Structure

### Routes

| Page | Route | Purpose |
|------|-------|---------|
| Fleet Dashboard | `/fleet` | Central hub with summaries and quick access |
| Stationed Fleet | `/fleet/stationed` | Ship inventory with quick-send actions |
| Send Fleet | `/fleet/send` | Improved send form (current Fleet.tsx) |
| Movements | `/fleet/movements` | Own movements + inbound fleets |

PvE Missions remain at `/missions` (separate page, linked from dashboard).

### Menu

"Flotte" in the main sidebar leads to `/fleet` (dashboard). The current separate "Fleet" and "Movements" entries are replaced by this single entry.

### Breadcrumb

A **generic `Breadcrumb` component** (not fleet-specific) is used across all fleet sub-pages and designed for reuse across the entire site.

- Takes an array of `{ label: string, path: string }` segments
- Dashboard shows no breadcrumb (root level)
- Sub-pages: `Flotte > Flotte stationnee`, `Flotte > Envoyer une flotte`, `Flotte > Mouvements`
- Current page is non-clickable, parent segments are clickable links

## Page Designs

### 1. Fleet Dashboard (`/fleet`)

**Layout: two columns with action bar.**

**Top: Hostile Alert Banner (conditional)**
- Full-width banner, only visible when hostile inbound fleets are detected
- Red gradient background with pulsing dot animation
- SVG warning icon
- Lists each incoming attack: target planet + countdown timer
- "See details" button linking to `/fleet/movements`

**Header Row:**
- Fleet slots badge (used / max)
- PvE missions badge (count + link to `/missions`)
- Spacer
- Primary CTA button: "Envoyer une flotte" → `/fleet/send`

**Left Column: Stationed Fleet**
- Header: "Flotte stationnee" + "Voir tout →" link to `/fleet/stationed`
- Ships displayed in a grid (3 columns), grouped by category:
  - **Combat** (red): lightFighter, heavyFighter, cruiser, battleship
  - **Transport** (blue): smallCargo, largeCargo
  - **Utilitaire** (green): prospector, explorer, espionageProbe, colonyShip, recycler, solarSatellite
- Each category has an SVG icon + colored uppercase label
- Each ship card: GameImage (48x48) + name + quantity
- Only ships with count > 0 are shown

**Right Column: Active Movements**
- Header: "Mouvements actifs (N)" + "Voir tout →" link to `/fleet/movements`
- Each movement is a compact card:
  - Left colored border matching mission type
  - SVG mission icon + mission name + phase badge
  - Countdown timer (right-aligned)
  - Route: origin → target coordinates
  - Mini ship thumbnails (GameImage 20x20) with counts
  - Progress bar (standard) or stepper (mining missions with 4 phases)
- Shows the 3-5 most recent/urgent movements

### 2. Stationed Fleet (`/fleet/stationed`)

**New page — does not exist yet.**

**Layout:**
- Breadcrumb: `Flotte > Flotte stationnee`
- Same category grouping as dashboard but larger:
  - Bigger ship images
  - Ship stats visible (speed, cargo capacity, firepower)
  - Per-ship checkbox + quantity input for selection
  - "Select all" per category
- Sticky bottom bar: "Envoyer les vaisseaux selectionnes" → navigates to `/fleet/send` with selected ships pre-filled as URL params or state
- Click on a ship opens `EntityDetailOverlay` (existing component)
- Empty state: message encouraging building ships with link to Shipyard

### 3. Send Fleet (`/fleet/send`)

**Replaces current Fleet.tsx — same form, better visual organization.**

**Breadcrumb:** `Flotte > Envoyer une flotte`

**Pre-fill:** If navigated from stationed fleet page, selected ships are pre-populated.

**Form sections (top to bottom):**

1. **Mission Selection** — Current MissionSelector with improvements:
   - SVG icons for each mission type
   - Short help text under each mission button (e.g., "Transport resources to an allied planet")
   - Lock behavior for PvE/Trade modes unchanged

2. **Destination** — Current CoordinateInput (galaxy/system/position)
   - PveMissionBanner shown if PvE mode

3. **Fleet Composition** — Current FleetComposition with improvements:
   - Ship images (GameImage) instead of text-only
   - Ships grouped by category (Combat / Transport / Utilitaire)
   - Required/optional/disabled states visually distinct
   - Quantity input + MAX button per ship

4. **Cargo** — 3 resource inputs (minerai/silicium/hydrogene)
   - Visual capacity gauge bar

5. **Summary & Send** — Sticky FleetSummaryBar at bottom:
   - Ship count, fuel cost, travel duration
   - Mining stats (if mine mission)
   - Cargo usage vs capacity
   - Send button (destructive variant for dangerous missions)
   - Confirmation dialog for dangerous missions

**Logic unchanged:** validation, estimation API call, slot checking, PvE/Trade modes.

### 4. Movements (`/fleet/movements`)

**Replaces current Movements.tsx — same data, clearer separation.**

**Breadcrumb:** `Flotte > Mouvements`

**Section 1: Inbound Fleets (top, conditional)**
- Full-width hostile alert banner (same as dashboard) for attacks
- Peaceful inbound fleets (transport, station) in neutral-styled cards below
- Detection tier masking system unchanged (tiers 0-4)
- Expandable cards for full details

**Section 2: My Movements (below)**
- MovementCards with visual improvements:
  - SVG mission icons
  - Mini ship image thumbnails
  - Mining stepper for mine missions
  - Standard progress bar for others
- Recall button on each card (when phase allows)
- Expandable for details: schedules, ship table, cargo breakdown, origin
- Auto-refresh via SSE timers unchanged

## Shared Visual Changes

### Ship Images
- The `GameImage` component already supports `category="ships"` with fallback (colored letter)
- Ship images directory (`public/assets/ships/`) exists but is empty
- All ship references use GameImage — images will appear automatically when added
- Three sizes used: icon (20x20 in movement cards), thumb (44x48 in dashboard grid), full (larger in stationed page)

### Mission Icons
- Replace emoji usage with existing SVG icons from `icons.tsx`
- Each mission type has a consistent color:
  - Transport: blue (#3b82f6)
  - Attack: red (#e74c3c)
  - Spy: purple
  - Mine: green (#2ecc71)
  - Colonize: teal
  - Recycle: orange
  - Station: blue-gray

### Ship Categories
Uses existing game config categories:
- `ship_combat` — Combat (red)
- `ship_transport` — Transport (blue)
- `ship_utilitaire` — Utilitaire (green)

Each category has a colored SVG icon and uppercase label.

## Data & API

**No backend changes required.** All data is already available:
- `fleet.slots` — slot count
- `fleet.movements` — own movements
- `fleet.inbound` — inbound fleets
- `fleet.estimate` — fuel/duration estimation
- `fleet.send` — send fleet
- `fleet.recall` — recall fleet
- `shipyard.ships` — ship inventory (used for stationed fleet)
- `resource.production` — resources (for cargo validation)
- Game config categories — ship categories

The stationed fleet page uses the existing `shipyard.ships` query which already returns ship counts per planet.

## Components

### New Components
- `Breadcrumb` — Generic breadcrumb, reusable site-wide. Props: `segments: { label: string, path: string }[]`
- `FleetDashboard` — Dashboard page component
- `StationedFleet` — Stationed fleet page component
- `HostileAlertBanner` — Full-width hostile fleet alert (used on dashboard + movements)
- `ShipCategoryGrid` — Ship grid grouped by category (used on dashboard + stationed + send)
- `MovementCardCompact` — Compact movement card for dashboard

### Modified Components
- `MissionSelector` — Add SVG icons + help text
- `FleetComposition` — Add ship images + category grouping
- `MovementCard` (in Movements.tsx) — Add ship images + SVG mission icons
- `InboundFleetCard` (in Movements.tsx) — Integrate with HostileAlertBanner

### Removed/Replaced
- Direct "Fleet" and "Movements" sidebar entries → single "Flotte" entry to dashboard

## Mobile Considerations

- Dashboard: columns stack vertically (fleet on top, movements below)
- Stationed fleet: grid switches from 3 to 2 columns
- Send form: already mobile-friendly, no layout changes needed
- Hostile banner: text wraps, timer stays visible
- Breadcrumb: truncates middle segments if too long

## Out of Scope

- Ship image asset creation (uses existing GameImage fallback)
- Backend/API changes
- PvE Missions page redesign
- Combat simulation changes
- New mission types
