# Mission Fleet Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show on the Missions page when a fleet is already en route to a deposit/pirate mission, and disable the pirate attack button when a fleet is already sent.

**Architecture:** Add `fleet.movements` query to Missions.tsx, build a lookup map by `pveMissionId`, render an inline indicator per mission card with phase label + timer. Single file change.

**Tech Stack:** React 19, tRPC, Tailwind CSS

---

## File Structure

- Modify: `apps/web/src/pages/Missions.tsx` — add fleet movements query + indicator rendering

---

### Task 1: Add fleet movement indicator to Missions page

**Files:**
- Modify: `apps/web/src/pages/Missions.tsx`

- [ ] **Step 1: Add fleet movements query and build lookup map**

After line 23 (`const { data, isLoading } = trpc.pve.getMissions.useQuery();`), add:

```typescript
const { data: movements } = trpc.fleet.movements.useQuery();
```

After `const pirateMissions = missions.filter(...)` (line 45), add:

```typescript
// Build lookup: pveMissionId → active fleet events
const fleetsByMission = new Map<string, typeof movements>();
if (movements) {
  for (const m of movements) {
    if (m.pveMissionId) {
      const existing = fleetsByMission.get(m.pveMissionId);
      if (existing) {
        existing.push(m);
      } else {
        fleetsByMission.set(m.pveMissionId, [m]);
      }
    }
  }
}

const PHASE_LABELS: Record<string, string> = {
  outbound: 'En vol',
  prospecting: 'Prospection',
  mining: 'Extraction',
  return: 'Retour',
};
```

- [ ] **Step 2: Add indicator to mining mission cards**

Inside the mining mission card (the `<div key={mission.id} className="glass-card p-4 space-y-3">` block), after the "Ressources estimées" section (after the closing `</div>` of the `space-y-1` div at line 143) and before the `<div className="flex gap-2">` buttons div, insert:

```tsx
{/* Fleet en route indicator */}
{fleetsByMission.get(mission.id)?.map((fleet) => (
  <div
    key={fleet.id}
    className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5"
  >
    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
    <span className="text-[11px] text-blue-300">
      {PHASE_LABELS[fleet.phase] ?? fleet.phase}
    </span>
    <Timer
      endTime={new Date(fleet.arrivalTime)}
      onComplete={() => utils.fleet.movements.invalidate()}
      className="text-[11px] text-blue-400"
    />
  </div>
))}
```

- [ ] **Step 3: Add indicator to pirate mission cards + disable button**

Inside the pirate mission card, after the rewards section (after the closing `</div>` of the `space-y-1` div at line 278) and before the `<Button>` at line 280, insert the indicator:

```tsx
{/* Fleet en route indicator */}
{fleetsByMission.get(mission.id)?.map((fleet) => (
  <div
    key={fleet.id}
    className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-2.5 py-1.5"
  >
    <div className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse shrink-0" />
    <span className="text-[11px] text-rose-300">
      {PHASE_LABELS[fleet.phase] ?? fleet.phase}
    </span>
    <Timer
      endTime={new Date(fleet.arrivalTime)}
      onComplete={() => utils.fleet.movements.invalidate()}
      className="text-[11px] text-rose-400"
    />
  </div>
))}
```

Then modify the existing pirate "Attaquer" Button to be disabled when a fleet is active:

Replace the existing `<Button>` block (line 280-285):
```tsx
<Button
  size="sm"
  className="w-full bg-rose-600 hover:bg-rose-700 text-white"
  onClick={() => navigate(`/fleet/send?mission=pirate&galaxy=${params.galaxy}&system=${params.system}&position=${params.position}&pveMissionId=${mission.id}`)}
>
  Attaquer
</Button>
```

With:
```tsx
<Button
  size="sm"
  className="w-full bg-rose-600 hover:bg-rose-700 text-white"
  onClick={() => navigate(`/fleet/send?mission=pirate&galaxy=${params.galaxy}&system=${params.system}&position=${params.position}&pveMissionId=${mission.id}`)}
  disabled={!!fleetsByMission.get(mission.id)?.length}
>
  {fleetsByMission.get(mission.id)?.length ? 'Flotte en route' : 'Attaquer'}
</Button>
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/web typecheck`
Expected: PASS

- [ ] **Step 5: Commit and push**

```bash
git add apps/web/src/pages/Missions.tsx
git commit -m "feat(web): show fleet-in-route indicator on mission cards"
git push origin main
```
