# Overview Page Redesign — Design Spec

## Goal

Redesign the Overview page (`apps/web/src/pages/Overview.tsx`) from a plain text-list layout to an immersive, visually polished dashboard with hero planet image, enriched activity cards, circular storage gauges, stationary fleet/defense panels, and quick-action shortcuts.

## Design Decisions

All decisions were validated via interactive mockup (see `.superpowers/brainstorm/` for HTML mockups).

- **Direction**: Hero immersif + cartes enrichies (planet as the visual star)
- **Layout**: Main column (2fr) + sidebar (1fr) on desktop, single column on mobile
- **Activity cards**: Mini-cards with SVG icon, gradient progress bar, timer below
- **Production/storage**: Circular SVG gauges showing fill percentage + rate/h
- **Hero overlay**: Planet name (renamable), coordinates, temperature, diameter — no planet type/bonuses
- **New sections**: Stationary fleet, planetary defenses, quick actions panel
- **Icons**: All existing SVG icons from `lib/icons.tsx` and `components/common/ResourceIcons.tsx` — no emojis

## Architecture

The redesign is **purely frontend** — no new API queries needed. All data comes from existing tRPC queries:

| Section | Query | Key fields |
|---------|-------|------------|
| Hero (name, coords, temp, diameter) | `planet.list` | `name`, `galaxy`, `system`, `position`, `minTemp`, `maxTemp`, `diameter`, `planetImageIndex`, `planetClassId` |
| Activities | `building.list`, `research.list`, `shipyard.queue` | `isUpgrading`, `upgradeEndTime`, `isResearching`, `researchEndTime`, `endTime` |
| Fleet movements | `fleet.movements` | `mission`, `targetGalaxy/System/Position`, `arrivalTime`, `phase` |
| Events | `gameEvent.byPlanet` | `type`, `createdAt`, event text |
| Production & storage | `resource.production` | `minerai/silicium/hydrogene`, `rates.{resource}PerHour`, `rates.storage{Resource}Capacity` |
| Planet info (cases, energy) | `resource.production` + `planet.list` | `maxFields`, `rates.energyProduced`, `rates.energyConsumed` |
| Stationary fleet | `shipyard.ships` | `id`, `name`, `count` |
| Defenses | `shipyard.defenses` | `id`, `name`, `count` |

## Components

### Modified file: `apps/web/src/pages/Overview.tsx`

This is the only file that changes. The page already imports and queries all the needed data except `shipyard.ships` and `shipyard.defenses` — those two queries need to be added.

### Layout structure

```
<page>
  <PageHeader title="Vue d'ensemble" />

  <HeroSection>                          // full-width, rounded, planet image background
    gradient overlay
    bottom-left: name (renamable) + coords
    bottom-right: temperature + diameter
  </HeroSection>

  <Grid cols="2fr 1fr" on desktop, "1fr" on mobile>

    <MainColumn>
      <ActivitiesCard>                   // glass-card, only shown if hasActivity
        icon: HistoryIcon
        items: building, research, shipyard queue
        each item: icon-wrap (colored bg) + name + level + gradient progress bar + timer
      </ActivitiesCard>

      <FleetMovementsCard>               // glass-card, only shown if movements exist
        icon: MovementsIcon
        items: mission badge + target coords + timer
        dot color: blue=outgoing, green=returning
      </FleetMovementsCard>

      <RecentEventsCard>                 // glass-card, always shown
        icon: MissionsIcon (list icon)
        items: colored dot + event text + relative time
      </RecentEventsCard>

      <StationaryFleetCard>              // glass-card, only shown if any ship count > 0
        icon: FleetIcon
        2-column grid of unit-name + count
        only show ships with count > 0
      </StationaryFleetCard>

      <PlanetaryDefensesCard>            // glass-card, only shown if any defense count > 0
        icon: DefenseIcon
        2-column grid of unit-name + count
        only show defenses with count > 0
      </PlanetaryDefensesCard>
    </MainColumn>

    <Sidebar>
      <ProductionStorageCard>            // glass-card
        3 circular SVG gauges side by side
        each gauge: background circle (resource color 20% opacity) + progress arc (solid color)
        percentage = current / storageCapacity * 100
        label: resource name + rate/h below
      </ProductionStorageCard>

      <PlanetInfoCard>                   // glass-card
        icon: OverviewIcon
        rows: Cases used/max (progress bar — used = sum of all building currentLevel from building.list), Energy (produced/consumed from rates), Diameter, Temperature
      </PlanetInfoCard>

      <QuickActionsCard>                 // glass-card
        icon: MoreIcon
        2-column grid of buttons: Batiments, Recherche, Chantier, Defenses, Flotte, Galaxie
        each button: SVG icon + label, navigates to corresponding route
      </QuickActionsCard>
    </Sidebar>

  </Grid>
</page>
```

## Circular Gauge Component

Inline in Overview.tsx (no separate component file — used only here).

```tsx
function ResourceGauge({ current, capacity, rate, label, color }: {
  current: number;
  capacity: number;
  rate: number;
  label: string;
  color: string;
}) {
  const pct = capacity > 0 ? Math.min(100, Math.round((current / capacity) * 100)) : 0;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="text-center">
      <div className="relative w-[66px] h-[66px] flex items-center justify-center">
        <svg className="absolute top-0 left-0 -rotate-90" width={66} height={66}>
          <circle cx={33} cy={33} r={radius} fill="none" stroke={color} strokeWidth={3} opacity={0.2} />
          <circle cx={33} cy={33} r={radius} fill="none" stroke={color} strokeWidth={3}
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
        <span className="text-xs font-semibold" style={{ color }}>{pct}%</span>
      </div>
      <div className="text-[10px] mt-1 font-medium" style={{ color }}>{label}</div>
      <div className="text-[10px] text-muted-foreground">+{Math.floor(rate).toLocaleString('fr-FR')}/h</div>
    </div>
  );
}
```

## Styling

All styling uses existing Tailwind classes and the `glass-card` class already in the project. New visual patterns:

- **Activity icon wraps**: 36x36 rounded-md with colored bg (blue=build, purple=research, orange=shipyard)
- **Gradient progress bars**: 4px height, track with `linear-gradient` from darker to lighter shade
- **Fleet dots**: 8px circles with `box-shadow` glow. Color by `phase` field: `'outbound'` = blue, `'return'` = green, any other phase (e.g. `'prospecting'`, `'mining'`) = blue (default outgoing)
- **Unit grids**: 2-column grid, items with subtle `bg-muted/30` background
- **Quick action buttons**: `bg-muted/30 border border-border/50 rounded-lg` with hover state

## Hero Section

- Full-width, `rounded-xl overflow-hidden`, height `h-40 lg:h-56`
- Planet image as `object-cover` background (existing `getPlanetImageUrl`)
- Gradient overlay: `bg-gradient-to-t from-card via-transparent to-transparent`
- Bottom content: flex justify-between, left=name+coords, right=temp+diameter
- Name: `text-xl lg:text-2xl font-bold text-white`, clickable to rename (non-renamed planets only)
- Coords: `text-sm text-muted-foreground`
- Fallback when no planet image: solid gradient background (existing behavior)

## Data Flow

No new API endpoints. New queries added to the page:

```tsx
// Already exist in Overview.tsx:
const { data: planets } = trpc.planet.list.useQuery();
const { data: resourceData } = trpc.resource.production.useQuery({ planetId });
const { data: buildings } = trpc.building.list.useQuery({ planetId });
const { data: techs } = trpc.research.list.useQuery({ planetId });
const { data: queue } = trpc.shipyard.queue.useQuery({ planetId });
const { data: allMovements } = trpc.fleet.movements.useQuery();
const { data: recentEvents } = trpc.gameEvent.byPlanet.useQuery({ planetId });

// New — add to Overview.tsx:
const { data: ships } = trpc.shipyard.ships.useQuery({ planetId }, { enabled: !!planetId });
const { data: defenses } = trpc.shipyard.defenses.useQuery({ planetId }, { enabled: !!planetId });
```

## Conditional Rendering

- **Activities card**: shown only if `hasActivity` (same logic as current)
- **Fleet movements card**: shown only if `fleetMovements.length > 0`
- **Stationary fleet card**: shown only if any ship has `count > 0`
- **Planetary defenses card**: shown only if any defense has `count > 0`
- **Events card**: always shown (with empty state text)
- **Production, planet info, quick actions**: always shown

## Mobile Responsiveness

- Layout switches from `lg:grid-cols-[2fr_1fr]` to single column on mobile
- Hero height: `h-40` mobile, `lg:h-56` desktop
- All cards stack vertically on mobile
- Unit grids remain 2 columns even on mobile (items are compact enough)
- Quick actions grid remains 2 columns on mobile
- Circular gauges use flexbox `justify-around` — works at any width

## Out of Scope

- No new API routes or backend changes
- No new component files — everything lives in `Overview.tsx`
- No changes to other pages
- No planet type or bonus display in the hero (explicitly removed per user request)
