/**
 * One-shot audit script for V4 anomaly events.
 *
 * Scans DEFAULT_ANOMALY_EVENTS and reports which events have outcomes
 * incompatible with flagship-only mode (shipsGain / shipsLoss). Outputs
 * a list to stdout — the engineer manually edits the seed file to set
 * `enabled: false` on the incompatible events.
 *
 * Usage:
 *   pnpm --filter @exilium/api exec tsx apps/api/src/scripts/audit-anomaly-events.ts
 */
import { DEFAULT_ANOMALY_EVENTS } from '../modules/anomaly-content/anomaly-events.seed.js';

const incompatible: string[] = [];
const compatible: string[] = [];

for (const event of DEFAULT_ANOMALY_EVENTS) {
  const hasShipChanges = event.choices.some((c) => {
    const out = c.outcome ?? {};
    const gain = out.shipsGain ?? {};
    const loss = out.shipsLoss ?? {};
    return Object.keys(gain).length > 0 || Object.keys(loss).length > 0;
  });
  (hasShipChanges ? incompatible : compatible).push(event.id);
}

console.log(`Total events: ${DEFAULT_ANOMALY_EVENTS.length}`);
console.log(`\nCompatible (${compatible.length}) — keep enabled:`);
for (const id of compatible) console.log(`  ✓ ${id}`);
console.log(`\nIncompatible (${incompatible.length}) — set enabled: false in seed:`);
for (const id of incompatible) console.log(`  ✗ ${id}`);
