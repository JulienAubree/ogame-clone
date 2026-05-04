# Système d'XP Flagship — Spec

**Date :** 2026-05-04
**Sub-projet :** post-V4 hardening (refonte Anomalie & Flagship)
**Statut :** Design validé, à planifier
**Sprints précédents :**
- [`2026-05-02-flagship-modules-design.md`](2026-05-02-flagship-modules-design.md) — Modules livrés
- [`2026-05-03-talents-removal-design.md`](2026-05-03-talents-removal-design.md) — Talents supprimés
- [`2026-05-03-anomaly-v4-flagship-only-design.md`](2026-05-03-anomaly-v4-flagship-only-design.md) — Anomaly V4 livrée

---

## 1. Contexte

Après le déploiement V4 (anomaly flagship-only), un flagship rang 1 (stats baseline + 1 starter module) se fait rapidement découper en anomaly. Le pivot V4 a réduit drastiquement le player FP (1 vaisseau vs flotte de 5-50 ships avant), mais le scaling ennemi reste calibré pour l'ancien modèle.

**2 leviers en parallèle pour résoudre ce problème :**

1. **Tune universe_config** (patch léger, ~5 min) : abaisser `anomaly_enemy_base_ratio` de 0.7 à 0.5 pour rendre le early-game plus accessible
2. **Système d'XP flagship** (ce spec) : progression méta-game indépendante, donne un sentiment de progression long-terme + accroît graduellement le power gap pour les vétérans

Ce spec couvre uniquement le système XP. Le tune universe_config est appliqué dans la même PR mais documenté dans le plan d'implémentation, pas ici.

**Hors scope :**
- Per-hull XP separation (1 level par coque)
- XP from non-anomaly sources (pirates IG, asteroids — futur sub-projet 4/5 pourrait étendre)
- Prestige / rebirth system

---

## 2. Récap des décisions de design

| # | Axe | Choix |
|---|---|---|
| 1 | Rôle XP | Système indépendant + tunings parallèles |
| 2 | Source XP | Per-combat + bonus per-run (commit-on-grant, pas perdu en wipe) |
| 3 | Effets level | % multiplier additif sur weapons/shield/hull/baseArmor |
| 4 | Cap level | **60**, +5% per level → ×4 baseline au cap |
| 5 | Reset on hull change | Persistent (1 level toutes coques) |
| 6 | Calibration XP | Medium grind (~3 mois pour L60) — `xp_per_kill_fp = 0.10`, bonus = `depth × 100` |
| 7 | Migration | Fresh start L1 + 0 XP pour tous (incluant les 13 flagships existants) |

---

## 3. Architecture & flow général

### 3.1 Sources d'XP

- **Combat win (anomaly)** : à chaque combat survived dans `advance()`, le joueur gagne `xp = round(enemyFP × 0.10)` XP. Ex: combat depth 5 contre fleet FP 800 → +80 XP.
- **Run completion** : à `runComplete` (depth 20 atteint) ou `retreat` volontaire, bonus `xp = round(currentDepth × 100)` XP. Ex: retreat depth 10 → +1000 XP bonus.
- **Wipe** : pas de bonus per-run (cohérent avec wipe radical V4). MAIS l'XP gagnée par les combats survécus AVANT le wipe est déjà commitée — non rollback. Le joueur ne perd pas TOUTE son XP, juste le bonus depth final.

### 3.2 Effets du level

À un level L, le `levelMultiplier = 1 + L × 0.05` est appliqué sur les stats combat baseline du flagship :
- weapons, shield, hull, baseArmor : multipliés par le levelMultiplier
- shotCount, cargoCapacity, fuelConsumption, baseSpeed : NON multipliés (stats non-combat ou count entier)

Hull passive bonuses (bonus_weapons, bonus_armor) sont AUSSI multipliés (cohérent avec "le pilote progresse avec son vaisseau").

Hull passive bonus_shot_count : NON multiplié (count entier).

Modules effects (via `applyModulesToStats`) : appliqués SUR les stats déjà multipliées. Donc multiplicateur level ET module compose multiplicativement.

### 3.3 Cap level

Cap à 60. Au cap : `levelMultiplier = 1 + 60 × 0.05 = 4.0`. Stats baseline ×4.

Combiné modules max-équipés (~+50% via passifs coque + ~+25%×3 rares + 1 épique) : un L60 max-équipé est ~5-6× plus fort qu'un L1 nu.

### 3.4 Migration legacy

13 flagships existants en prod : démarrent à `level = 1, xp = 0`. Pas de backfill rétroactif (Q7 décision A).

---

## 4. DB schema

### 4.1 Migration `0071_flagship_xp.sql`

```sql
-- Flagship XP system (2026-05-04)
ALTER TABLE flagships
  ADD COLUMN IF NOT EXISTS xp    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level SMALLINT NOT NULL DEFAULT 1;

-- Universe config tunables
INSERT INTO universe_config (key, value) VALUES
  ('flagship_xp_per_kill_fp_factor',    '0.10'::jsonb),
  ('flagship_xp_per_depth_bonus',       '100'::jsonb),
  ('flagship_xp_level_multiplier_pct',  '0.05'::jsonb),
  ('flagship_max_level',                '60'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Marker idempotence
INSERT INTO _migrations_state (key, value)
VALUES ('flagship_xp_init', 'done')
ON CONFLICT (key) DO UPDATE SET value = 'done', set_at = now();
```

### 4.2 Drizzle schema

Modifier `packages/db/src/schema/flagships.ts` — ajouter 2 colonnes dans le block (avant `createdAt`) :

```ts
  /** Flagship XP system (2026-05-04) : XP cumulée. */
  xp:    integer('xp').notNull().default(0),
  /** Level dérivé de xp via `xpToLevel` formula, persisté pour query rapide. */
  level: smallint('level').notNull().default(1),
```

### 4.3 Tune universe_config (parallèle)

Aussi dans 0071 OU dans une migration `0072_anomaly_difficulty_tune.sql` séparée :

```sql
-- Adoucir le early-game V4 pour les flagships rang 1
UPDATE universe_config
SET value = '0.5'::jsonb
WHERE key = 'anomaly_enemy_base_ratio';
```

(Décision plan : intégré dans 0071 pour simplicité.)

---

## 5. Engine formulas (pure)

Nouveau fichier `packages/game-engine/src/formulas/flagship-xp.ts` :

```ts
/**
 * Pure formulas for the Flagship XP system (2026-05-04).
 * All input/output are plain data — no DB, no I/O.
 */

export interface XpConfig {
  /** XP per enemy FP killed (default 0.10). */
  perKillFpFactor: number;
  /** XP bonus per depth atteinte en fin de run (default 100). */
  perDepthBonus: number;
  /** Multiplier % par level (default 0.05 = +5%/level). */
  levelMultiplierPct: number;
  /** Cap level (default 60). */
  maxLevel: number;
}

export const DEFAULT_XP_CONFIG: XpConfig = {
  perKillFpFactor: 0.10,
  perDepthBonus: 100,
  levelMultiplierPct: 0.05,
  maxLevel: 60,
};

/**
 * XP cumulative requise pour ATTEINDRE le level L (depuis L1).
 * Formule quadratic : 100 × (L-1) × L / 2.
 *  - L1 = 0 (starting)
 *  - L2 = 100
 *  - L5 = 1000
 *  - L10 = 4500
 *  - L20 = 19000
 *  - L60 = 177000
 */
export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(100 * (level - 1) * level / 2);
}

/** Inverse : à partir d'un XP cumulé, retourne le level atteint (capped). */
export function xpToLevel(xp: number, maxLevel: number): number {
  for (let L = maxLevel; L >= 1; L--) {
    if (xpRequiredForLevel(L) <= xp) return L;
  }
  return 1;
}

/** Multiplier appliqué aux stats combat à un level donné. */
export function levelMultiplier(level: number, pctPerLevel: number): number {
  return 1 + level * pctPerLevel;
}

/** XP gagnée à un combat win (basé sur le FP total des ennemis tués). */
export function xpFromCombat(enemyFP: number, config: XpConfig): number {
  return Math.round(enemyFP * config.perKillFpFactor);
}

/** XP bonus en fin de run (basé sur la profondeur atteinte). */
export function xpFromRunDepth(depth: number, config: XpConfig): number {
  return Math.round(depth * config.perDepthBonus);
}
```

---

## 6. Backend service

### 6.1 `flagshipService.grantXp` (nouvelle méthode)

```ts
/**
 * Grant XP to the flagship + recompute level. Idempotent for amount = 0.
 * Wrapped in transaction with advisory lock for concurrent safety.
 */
async grantXp(userId: string, amount: number): Promise<{
  newXp: number;
  oldLevel: number;
  newLevel: number;
  levelUp: boolean;
}> {
  if (amount <= 0) return { newXp: 0, oldLevel: 1, newLevel: 1, levelUp: false };

  const config = await gameConfigService.getFullConfig();
  const maxLevel = Number(config.universe.flagship_max_level) || 60;

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}::text))`);

    const [flagship] = await tx.select({ id: flagships.id, xp: flagships.xp, level: flagships.level })
      .from(flagships).where(eq(flagships.userId, userId)).for('update').limit(1);
    if (!flagship) {
      return { newXp: 0, oldLevel: 1, newLevel: 1, levelUp: false };
    }

    const oldLevel = flagship.level;
    const newXp = flagship.xp + amount;
    const newLevel = xpToLevel(newXp, maxLevel);

    await tx.update(flagships).set({
      xp: newXp,
      level: newLevel,
      updatedAt: new Date(),
    }).where(eq(flagships.id, flagship.id));

    return { newXp, oldLevel, newLevel, levelUp: newLevel > oldLevel };
  });
}
```

### 6.2 `flagshipService.get()` — apply level multiplier

Modifier le calcul `effectiveStats` (post-Talents-removal version) :

```ts
const levelMult = levelMultiplier(flagship.level, 0.05);

const effectiveStats = {
  weapons:         Math.round(flagship.weapons * levelMult),
  shield:          Math.round(flagship.shield * levelMult),
  hull:            Math.round(flagship.hull * levelMult),
  baseArmor:       Math.round(flagship.baseArmor * levelMult),
  shotCount:       flagship.shotCount,        // pas multiplié
  cargoCapacity:   flagship.cargoCapacity,    // pas multiplié
  fuelConsumption: flagship.fuelConsumption,  // pas multiplié
  baseSpeed:       flagship.baseSpeed,        // pas multiplié
  driveType:       flagship.driveType,
};

// Apply hull combat bonuses (only when stationed) — multiplied too
if (hullConfig && flagship.status === 'active') {
  effectiveStats.weapons   += Math.round((hullConfig.passiveBonuses.bonus_weapons   ?? 0) * levelMult);
  effectiveStats.baseArmor += Math.round((hullConfig.passiveBonuses.bonus_armor     ?? 0) * levelMult);
  effectiveStats.shotCount += (hullConfig.passiveBonuses.bonus_shot_count ?? 0);  // pas multiplié
}
```

Read `flagship.level` and `flagship.xp` in the original DB select (already covered by `select()` without explicit columns, but verify).

The return shape adds `xp` and `level` (already in the row spread).

### 6.3 `anomalyService` integration

**`advance` — survived branch** :

Avant le `return`, après les drops modules + report :
```ts
// XP grant per-combat
const xpConfig: XpConfig = {
  perKillFpFactor: Number(config.universe.flagship_xp_per_kill_fp_factor) || 0.10,
  perDepthBonus: Number(config.universe.flagship_xp_per_depth_bonus) || 100,
  levelMultiplierPct: Number(config.universe.flagship_xp_level_multiplier_pct) || 0.05,
  maxLevel: Number(config.universe.flagship_max_level) || 60,
};
const xpGained = xpFromCombat(result.enemyFP, xpConfig);
const xpResult = await flagshipService.grantXp(userId, xpGained);
```

Add to the survived return :
```ts
return {
  outcome: 'survived' as const,
  // ... existing fields ...
  xpGained,
  levelUp: xpResult.levelUp ? { newLevel: xpResult.newLevel, oldLevel: xpResult.oldLevel } : null,
};
```

**`runComplete` branch** (within survived when newDepth >= MAX_DEPTH) :
```ts
// XP per-combat (final win)
const xpGainedCombat = xpFromCombat(result.enemyFP, xpConfig);
// XP bonus per-run (depth final)
const xpGainedDepth = xpFromRunDepth(newDepth, xpConfig);
const xpResult = await flagshipService.grantXp(userId, xpGainedCombat + xpGainedDepth);
// return shape : xpGained = xpGainedCombat + xpGainedDepth
```

**`retreat` branch (voluntary)** :
```ts
const xpGainedDepth = xpFromRunDepth(row.currentDepth, xpConfig);
const xpResult = await flagshipService.grantXp(userId, xpGainedDepth);
return {
  ok: true,
  xpGained: xpGainedDepth,
  levelUp: xpResult.levelUp ? { newLevel: xpResult.newLevel, oldLevel: xpResult.oldLevel } : null,
};
```

**`wipe` branch** : NO XP grant per-run (cohérent avec wipe radical). Les combats survécus AVANT le wipe ont déjà été commit dans leurs survived branches. Le wipe return shape inclut tout de même `xpGained: 0, levelUp: null` pour cohérence du shape.

---

## 7. Frontend

### 7.1 `FlagshipIdentityCard.tsx` — badge level + XP bar

Ajouter un bloc compact dans la card :

```tsx
import { Star } from 'lucide-react';
import { xpRequiredForLevel } from '@exilium/game-engine';

// Inside FlagshipIdentityCard component, near other stat displays :
const maxLevel = 60;  // could read from gameConfig but hardcoded is fine for V1
const nextLevelXp = flagship.level >= maxLevel ? flagship.xp : xpRequiredForLevel(flagship.level + 1);
const currentLevelXp = xpRequiredForLevel(flagship.level);
const xpProgress = flagship.level >= maxLevel
  ? 1
  : (flagship.xp - currentLevelXp) / (nextLevelXp - currentLevelXp);

<div className="flex items-center gap-3 text-sm border-t border-panel-border pt-3 mt-3">
  <div className="flex items-center gap-1.5">
    <Star className="h-4 w-4 text-yellow-400" />
    <span className="font-bold">Niveau {flagship.level}</span>
    <span className="text-gray-500">/ {maxLevel}</span>
  </div>
  <div className="flex-1">
    <div className="h-1.5 bg-panel-light/50 rounded-full overflow-hidden">
      <div className="h-full bg-yellow-400/80" style={{ width: `${Math.round(xpProgress * 100)}%` }} />
    </div>
    <div className="text-xs text-gray-500 mt-0.5">
      {flagship.level >= maxLevel
        ? `${flagship.xp.toLocaleString()} XP (max)`
        : `${flagship.xp.toLocaleString()} / ${nextLevelXp.toLocaleString()} XP`
      }
    </div>
  </div>
</div>
```

### 7.2 `Anomaly.tsx` — toasts XP gain + levelUp

Dans `advanceMutation.onSuccess` (après les autres toasts existants) :
```tsx
if (data.xpGained && data.xpGained > 0) {
  addToast(`✨ +${data.xpGained} XP`, 'success');
}
if (data.levelUp) {
  addToast(`🌟 NIVEAU ${data.levelUp.newLevel} atteint !`, 'success');
}
```

Dans `retreatMutation.onSuccess` : idem.

### 7.3 `AnomalyEngageModal.tsx` — afficher level dans la stats card

Ajouter une ligne dans le bloc stats preview :
```tsx
<div className="flex justify-between">
  <span className="text-gray-500 flex items-center gap-1.5"><Star className="h-3 w-3" /> Niveau pilote</span>
  <span>{flagship.level} (×{(1 + flagship.level * 0.05).toFixed(2)})</span>
</div>
```

---

## 8. Tests

### 8.1 Engine (`flagship-xp.test.ts`)

- `xpRequiredForLevel` :
  - L1 = 0
  - L2 = 100
  - L5 = 1000
  - L10 = 4500
  - L20 = 19 000
  - L60 = 177 000
- `xpToLevel(xp, maxLevel)` :
  - 0 → 1
  - 99 → 1
  - 100 → 2
  - 4500 → 10
  - 999999 → 60 (capped)
- `levelMultiplier(L, 0.05)` :
  - L0 = 1.0
  - L20 = 2.0
  - L60 = 4.0
- `xpFromCombat(enemyFP=1000, config)` = 100 (avec factor 0.10)
- `xpFromRunDepth(depth=10, config)` = 1000 (avec bonus 100)

~10 tests purs.

### 8.2 Service (`flagshipService.grantXp`)

- Happy path : grant 100 XP → newXp=100, newLevel=2, levelUp=true
- No-op on amount=0 : returns `{ newXp: 0, ... }` sans toucher la DB
- Cap respect : grant 999999 → level capped to 60
- No flagship : returns levelUp=false (no-op)
- Atomicité : 2 grants concurrents → résultat cohérent (advisory lock)

~5 tests.

---

## 9. Estimation

| Phase | Effort |
|---|---|
| DB migration 0071 + Drizzle schema | 0.5h |
| Engine formulas + 10 tests | 1.5h |
| Backend `grantXp` service + tests | 1h |
| Backend `flagshipService.get` multiplier integration | 0.5h |
| Backend `anomalyService` advance/retreat XP grant | 1h |
| Frontend FlagshipIdentityCard badge level + XP bar | 1h |
| Frontend Anomaly toasts XP/levelUp | 0.5h |
| Frontend AnomalyEngageModal level display | 0.3h |
| Tunings universe_config (parallèle) `anomaly_enemy_base_ratio: 0.5` | 0.2h |
| Tests + lint + smoke + push + deploy + annonce | 1.5h |
| **Total** | **~8h** |

Sprint mono-PR. Sprint plus court que les précédents (V4 = 14h, Talents removal = 11.5h, Modules = 14h+).

---

## 10. Hors scope

- **Per-hull XP separation** (Q5 décision A : persistent — laissé volontairement simple)
- **XP from non-anomaly sources** (pirate raids, asteroid mining, fleet missions) — sub-projet 4/5 pourrait étendre via la même `flagshipService.grantXp` API
- **Prestige / rebirth system** (reset level pour bonus permanent) — futur lointain si besoin
- **PvP balance impact** : niveau 60 vs niveau 1 = ×4 stats. À surveiller post-deploy mais pas un blocker (les modules + flagship sont déjà déséquilibrants en PvP)
- **Backfill XP rétroactif** (Q7 décision A : fresh start)

---

## 11. Rollout & risques

### 11.1 Ordre de déploiement (mono-PR)
1. Migration 0071 (schema + universe_config init + tune `anomaly_enemy_base_ratio`)
2. Engine formulas + tests
3. Backend `grantXp` service + tests
4. Backend `flagshipService.get` multiplier integration
5. Backend `anomalyService` advance/retreat XP grant
6. Frontend FlagshipIdentityCard + Anomaly toasts + EngageModal level display
7. Lint + tests verts → commit + push + deploy
8. Smoke test prod
9. Annonce in-game

### 11.2 Risques

| Risque | Mitigation |
|---|---|
| Calibration XP trop slow → frustration | Tunable via `flagship_xp_per_kill_fp_factor` + `flagship_xp_per_depth_bonus` sans redeploy |
| Effet level multiplier trop puissant en PvP | Tunable via `flagship_xp_level_multiplier_pct` sans redeploy ; cap level baissable aussi via `flagship_max_level` |
| Anomaly enemy scaling cassé après tune base_ratio (combat trop facile) | Test smoke prod immédiat ; ajustement rollback en 1 SQL update si besoin |
| Race conditions sur grantXp (advance concurrent) | Advisory lock + select FOR UPDATE |
| `effectiveStats` rendering bug front (nombres énormes) | `Math.round` + cap level 60 borne max ×4 → max raisonnable (weapons 12 × 4 = 48, hull 30 × 4 = 120) |
| Joueur frustré "j'ai déjà fait 50 anomalies sans XP" (no backfill) | Annonce explicite "le système démarre maintenant pour tout le monde". Si plainte significative, backfill SQL one-shot toujours possible post-deploy |

### 11.3 Tunables universe_config

Ajoutés en V4-XP :
- `flagship_xp_per_kill_fp_factor` (default 0.10)
- `flagship_xp_per_depth_bonus` (default 100)
- `flagship_xp_level_multiplier_pct` (default 0.05)
- `flagship_max_level` (default 60)

Modifié en V4-XP (parallèle) :
- `anomaly_enemy_base_ratio` 0.7 → 0.5 (early-game accessibility)
