# Anomaly V4 — Flagship-Only — Spec

**Date :** 2026-05-03
**Sub-projet :** 3/5 de la refonte Anomalie & Flagship (selon roadmap `2026-05-02-flagship-only-anomaly-roadmap.md`)
**Statut :** Design validé, à planifier
**Sprints précédents :**
- [`2026-05-02-flagship-modules-design.md`](2026-05-02-flagship-modules-design.md) — Modules livrés
- [`2026-05-03-talents-removal-design.md`](2026-05-03-talents-removal-design.md) — Talents supprimés

---

## 1. Contexte

Le mode Anomalie actuel utilise le modèle « flotte complète vs flotte ennemie » : le joueur engage flagship + escorte (interceptors, frégates, etc.), le combat simule round-by-round. À grande échelle (joueurs avec dizaines de milliers de vaisseaux), la simulation **fait crasher le client** (JS bloqué — la transformation des résultats devient prohibitive). L'engine `simulateCombat` lui-même tient bien côté serveur, mais la sérialisation des rounds + le rendu front saturent.

**Pivot :** passer au modèle **flagship-only** — le joueur engage uniquement son vaisseau amiral, équipé de modules (sprint 1) qui définissent ses capacités. Pas d'escorte, pas de gestion de flotte, pas de risk de saturation côté client.

Les sprints précédents ont posé les fondations :
- **Modules** (1/5, livré 2026-05-02) — 9 slots flagship (5 communs + 3 rares + 1 épique), pool de 57 modules, drops via anomaly
- **Talents removal** (2/5, livré 2026-05-03) — système talents retiré, redistribué en passifs coque + stats baseline + bâtiments

Ce sprint 3/5 livre la refonte effective de l'anomaly mode pour exploiter ces fondations.

**Hors scope :**
- Sub-projet 4 (Pirates IG → loot modules) — séparé
- Sub-projet 5 (Missions explo refonte) — séparé
- Réécriture intégrale des 30 events désactivés — futur patch V5

---

## 2. Récap des décisions de design

| # | Axe | Choix |
|---|---|---|
| 1 | Combat | Garde `simulateCombat` existant, juste 1 ship côté joueur (flagship). Réutilise tout l'investissement engine. |
| 2 | Régen hull | 3 charges réparation par run × +30% hull, activables manuellement entre nodes |
| 3 | Game over | Wipe radical : flagship détruit = tout perdu (Exilium + loot + ressources) + flagship incapacité 30 min |
| 4 | Events seedés | Audit + désactivation sélective (~15-20 incompatibles désactivés, ~10-15 gardés actifs) |
| 5 | Drops Exilium | Aucun drop, run = puit Exilium pur (-5 par run engagée, irréversible) |
| 6 | Gating choix events | Mix `requiredHull` + `requiredResearch` (configurable par event) |
| 7a | Engage UI | Bouton simple « Engager (5 Exilium) » + intro narrative, plus de selecteur ships |
| 7b | Migration legacy | Forced retreat automatique de toutes les anomalies actives (refund Exilium + flotte rendue à la planète d'origine) |

---

## 3. Architecture & flow général

### 3.1 Engage

- Le joueur clique « Engager » sur la page anomaly
- Le serveur valide : flagship existe + status `active` + balance Exilium ≥ 5
- Spend 5 Exilium (`anomaly_entry_cost_exilium`)
- Set `flagship.status = 'in_mission'`
- Insert anomaly row avec `fleet = { flagship: { count: 1, hullPercent: 1.0 } }` exactement
- `repair_charges_current = repair_charges_max = 3` (default tunable)
- Pre-generate first enemy (logic existante via `generateAnomalyEnemy`)
- Snapshot du loadout modules dans `equipped_modules` (sprint 1)
- Reset `epic_charges_current = epic_charges_max` (sprint 1)

**Plus de validation/decrement de planet_ships** — pas d'escorte engagée.

### 3.2 Sequence de nodes

Identique au flow actuel :
- Combat node : `runAnomalyNode` → résultats → loot
- Event node : `resolveEvent` → choice → outcome
- Decision next node (combat vs event) via `combatsUntilNextEvent` counter

**Différences V4 :**
- `runAnomalyNode` ne gère qu'un seul ship côté joueur (le flagship)
- `resolveEvent` valide le gating `requiredHull` / `requiredResearch` du choix
- Charges réparation utilisables n'importe quand entre 2 nodes (sauf pendant un combat actif)

### 3.3 Hull tracking permanent

- `fleet.flagship.hullPercent` persiste entre nodes (déjà le cas)
- Diminué par les combats (calcul existant via `attackerSurvivors[flagship].hullPercent`)
- Augmenté par :
  - Charges réparation (manuel, +30% chacune)
  - Modules épiques (immédiat : `repair` ability)
  - Events (outcome `hullDelta` positif)
- Clamp à `[0.05, 1.0]` pendant la run (0.05 = quasi-mort, jamais 0 sauf sur wipe combat)

### 3.4 Fin de run — 3 cas

**Cas 1 : Wipe (flagship détruit en combat)**
- Status `wiped`, completed_at = now()
- `flagshipService.incapacitate(userId)` → status `incapacitated`, repair_ends_at = now() + 30 min
- **Tout perdu sur le run en cours** :
  - Exilium engagé : non remboursé
  - Loot ressources accumulé pendant le run : non rendu à la planète d'origine (perdu)
  - Combat report généré, anomaly row marquée wiped
- **Conservé (déjà acquis irreversiblement)** :
  - Modules déjà droppés sur les victoires précédentes du run (déjà committés en `flagship_module_inventory` à chaque grant — non rollback-able sans complexité injustifiée)
  - C'est cohérent avec la philosophie « le module est gagné dès le drop », pas « le module est conditionnel à la sortie »
- Pas de per-run final drop (réservé à retreat/runComplete)
- Pas de retour à la planète (le flagship est en réparation 30 min)

**Cas 2 : Retreat volontaire**
- Status `completed`, completed_at = now()
- Loot ressources rendu à la planète d'origine
- Modules drops déjà commités (per-combat drops + per-run final drop computed à ce moment)
- Exilium engagé **NON refundé** (la run a été utilisée, sortie volontaire = coût assumé)
- Flagship retourne à sa base d'attache (status `active`)

**Cas 3 : runComplete (depth 20 atteint avec flagship vivant)**
- Status `completed`, completed_at = now()
- Loot ressources rendu
- Per-run final drop max tier (1 rare + 1 épique selon sprint 1 logic)
- Exilium engagé **NON refundé**
- Flagship retour à base

---

## 4. DB schema

### 4.1 Migration `0070_anomaly_v4.sql`

```sql
-- Nouvelles colonnes pour les charges réparation
ALTER TABLE anomalies
  ADD COLUMN repair_charges_current SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN repair_charges_max     SMALLINT NOT NULL DEFAULT 3;

-- Universe config : tuning des charges
INSERT INTO universe_config (key, value) VALUES
  ('anomaly_repair_charges_per_run', 3),
  ('anomaly_repair_charge_hull_pct', 0.30)
ON CONFLICT (key) DO NOTHING;

-- Marker idempotence
INSERT INTO _migrations_state (key, value)
VALUES ('anomaly_v4_schema', 'done')
ON CONFLICT (key) DO UPDATE SET value = 'done', set_at = now();
```

### 4.2 Migration legacy — script TS séparé

Le forced retreat des anomalies actives nécessite des opérations complexes (boucle sur `fleet` jsonb pour rendre les ships d'escorte par type). Plus simple via un **script TS one-shot** (`apps/api/src/scripts/migrate-anomaly-v4.ts`) que pure SQL :

```ts
// Pseudo-code (détaillé dans le plan d'implémentation) :
1. SELECT anomalies WHERE status = 'active'
2. Pour chaque row :
   a. tx.update(anomalies).set({ status: 'completed', completed_at: now(), ... })
   b. Refund Exilium au user (balance + exilium_paid)
   c. Log dans exilium_log
   d. Crédit ressources sur la planète d'origine
   e. Boucle sur fleet (sauf flagship) : pour chaque {shipId: count}, increment planet_ships
   f. Boucle sur loot_ships : idem
   g. Flagship : status='active', planetId=originPlanetId
3. Set _migrations_state.anomaly_v4_migrated = 'done'
```

Idempotent via le marker. Re-run = no-op.

### 4.3 `anomaly-content.types.ts` extensions

**Schema `outcome`** :
```ts
const outcomeSchema = z.object({
  minerai: z.number().int().default(0),
  silicium: z.number().int().default(0),
  hydrogene: z.number().int().default(0),
  exilium: z.number().int().default(0),
  hullDelta: z.number().min(-1).max(1).default(0),
  shipsGain: shipDeltaSchema.default({}),  // KEPT for legacy events (now disabled)
  shipsLoss: shipDeltaSchema.default({}),  // KEPT for legacy events (now disabled)
  /** NEW V4 : si set, grant 1 module de la rareté demandée (random pick dans le pool de la coque flagship). */
  moduleDrop: z.enum(['common', 'rare', 'epic']).optional(),
});
```

**Schema `choice`** :
```ts
const choiceSchema = z.object({
  label: z.string().min(1).max(80),
  hidden: z.boolean().default(false),
  outcome: outcomeSchema.default({}),
  resolutionText: z.string().max(500).default(''),
  /** NEW V4 : restreint l'éligibilité à un hull spécifique. */
  requiredHull: z.enum(['combat', 'industrial', 'scientific']).optional(),
  /** NEW V4 : restreint l'éligibilité à un niveau de recherche. */
  requiredResearch: z.object({
    researchId: z.string(),
    minLevel: z.number().int().min(1),
  }).optional(),
});
```

Les champs `shipsGain` / `shipsLoss` restent dans le schema pour back-compat data (les events désactivés conservent leurs outcomes) mais l'engine côté server traite ces outcomes comme no-op pour les events `enabled=true`. Plus simple que de migrer la donnée.

---

## 5. Combat refondu

### 5.1 `anomaly.combat.ts` modifications

**`runAnomalyNode`** :

Le code actuel construit `playerShipCounts` à partir de `args.fleet` (qui contient flagship + escorte). En V4 :

```ts
// AVANT (lignes ~213-216)
const playerShipCounts: Record<string, number> = {};
for (const [shipId, entry] of Object.entries(args.fleet)) {
  if (entry.count > 0) playerShipCounts[shipId] = entry.count;
}

// APRÈS
const flagshipEntry = args.fleet['flagship'];
if (!flagshipEntry || flagshipEntry.count <= 0) {
  throw new Error('V4 anomaly: flagship missing or destroyed');
}
const playerShipCounts: Record<string, number> = { flagship: 1 };
```

**Logique targeting `capital`** : devient redondante (le flagship est forcément ciblé puisqu'il est le seul). Le code actuel force `categoryId = 'capital'` sur le flagship — on le garde, l'engine continue de fonctionner.

**`attackerSurvivors`** :
```ts
// AVANT : objet avec flagship + ships
// APRÈS : { flagship: { count: 0|1, hullPercent: X } }
const attackerSurvivors: Record<string, FleetEntry> = {};
const flagshipFinalCount = lastRound?.attackerShips['flagship'] ?? 0;
const hp = lastRound?.attackerHPByType?.['flagship'];
if (flagshipFinalCount > 0 && hp && hp.hullMax > 0) {
  attackerSurvivors['flagship'] = {
    count: 1,
    hullPercent: Math.max(0.05, hp.hullRemaining / hp.hullMax),
  };
}
// Si flagshipFinalCount = 0 → attackerSurvivors = {} → wipe
```

### 5.2 `anomaly.service.ts` modifications

**`engage`** :
- Retire la validation/sanitization du `input.ships` (garder l'input pour back-compat API mais l'ignorer)
- Retire la validation de planet_ships availability
- Retire le decrement de planet_ships
- `fleet = { flagship: { count: 1, hullPercent: 1.0 } }` exactement
- Init `repair_charges_current = repair_charges_max = config.anomaly_repair_charges_per_run` (default 3)

**`advance` outcomes** :

Réorganiser autour de 3 cas (vs 4 avant) :

```ts
const flagshipSurvived = !!result.attackerSurvivors['flagship'];
const wipe = !flagshipSurvived;  // En V4, flagship détruit = wipe (plus de "forced_retreat" partiel)

if (wipe) {
  // V4 wipe semantics :
  //  - status 'wiped'
  //  - Exilium engagé : non remboursé (perdu)
  //  - Loot ressources accumulé : non rendu à la planète (perdu — les rows
  //    `loot_minerai/silicium/hydrogene` sont juste laissés tels quels, jamais lus
  //    à nouveau)
  //  - Modules drops déjà obtenus sur les victoires précédentes : RESTENT en
  //    inventaire (committed à chaque grant, pas de rollback)
  //  - Pas de drop sur ce combat fatal (pas de roll dans le wipe branch)
  //  - Pas de per-run final drop (réservé à retreat/runComplete)
  //  - Flagship → incapacitated (30 min de réparation via flagshipService.incapacitate)
  status = 'wiped';
  await flagshipService.incapacitate(userId);
  return {
    outcome: 'wiped' as const,
    fleet: result.attackerSurvivors,  // = {} (flagship détruit)
    enemyFP: result.enemyFP,
    combatRounds: result.combatRounds,
    reportId: report.id,
    droppedModule: null,
    finalDrops: [],
  };
}

// Survived → continue ou runComplete (depth 20)
const newDepth = row.currentDepth + 1;
const runComplete = newDepth >= ANOMALY_MAX_DEPTH;

if (runComplete) {
  // Roll per-run final drops max tier
  // Credit loot to homeworld
  // Refund flagship
  status = 'completed';
  return { outcome: 'survived' as const, runComplete: true, ... };
}

// Normal survived : roll per-combat drop, continue
// ... existing logic
```

**`retreat` (volontaire)** : inchangé sauf retirer le refund Exilium (V4 : pas de refund).

```ts
// AVANT
if (row.exiliumPaid > 0) {
  await tx.update(userExilium).set({ balance: sql`... + ${row.exiliumPaid}`, ... });
  await tx.insert(exiliumLog).values({ ..., source: 'anomaly_retreat' });
}

// APRÈS V4
// (nothing — Exilium not refunded on voluntary retreat)
```

### 5.3 Logique drops (sprint 1 inchangé)

- **Per-combat drop** : 30% own commun + 5% other coque commun (sur `survived` branch)
- **Per-run final drop** : selon depth (1c → 1c+1r → 1r+épique chance → 1r+1épique)
- **Wipe** : pas de drops grantés (les `survived` précédents drops restent en inventaire — rolled back uniquement le drop du combat wipe-causing)

---

## 6. Charges réparation

### 6.1 Mutation `anomaly.useRepairCharge`

```ts
// anomaly.router.ts
useRepairCharge: protectedProcedure.mutation(({ ctx }) => {
  return anomalyService.useRepairCharge(ctx.userId!);
}),
```

### 6.2 Service `useRepairCharge`

```ts
async useRepairCharge(userId: string) {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}::text))`);

    const [active] = await tx.select().from(anomalies)
      .where(and(eq(anomalies.userId, userId), eq(anomalies.status, 'active')))
      .for('update').limit(1);
    if (!active) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucune anomalie active' });
    }
    if (active.repairChargesCurrent <= 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucune charge de réparation' });
    }

    const fleet = active.fleet as Record<string, { count: number; hullPercent: number }>;
    const currentHp = fleet.flagship?.hullPercent ?? 1.0;
    if (currentHp >= 1.0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Flagship à pleine santé' });
    }

    const config = await gameConfigService.getFullConfig();
    const repairPct = Number(config.universe.anomaly_repair_charge_hull_pct) || 0.30;
    const newHp = Math.min(1.0, currentHp + repairPct);

    const newFleet = {
      ...fleet,
      flagship: { count: 1, hullPercent: newHp },
    };

    await tx.update(anomalies).set({
      fleet: newFleet,
      repairChargesCurrent: sql`${anomalies.repairChargesCurrent} - 1`,
    }).where(eq(anomalies.id, active.id));

    return {
      newHullPercent: newHp,
      remainingCharges: active.repairChargesCurrent - 1,
    };
  });
}
```

### 6.3 UI bouton réparation

Dans le run view (web `Anomaly.tsx`) :

```tsx
{flagshipHullPercent < 1 && (
  <Button
    disabled={anomaly.repairChargesCurrent === 0 || repairMutation.isPending}
    onClick={() => repairMutation.mutate()}
  >
    🔧 Réparer ({anomaly.repairChargesCurrent}/{anomaly.repairChargesMax})
    {flagshipHullPercent < 1 && ` — +30% hull`}
  </Button>
)}
```

Toast on success : `🔧 Hull réparé : ${oldPct}% → ${newPct}% (charges: ${remaining}/3)`.

Pas de confirmation modale (action peu coûteuse cognitivement, max 3 fois par run).

---

## 7. Events refondus

### 7.1 Audit + désactivation

Script one-shot `apps/api/src/scripts/audit-anomaly-events.ts` :

```ts
// Pseudo-code
import { DEFAULT_ANOMALY_EVENTS } from '../modules/anomaly-content/anomaly-events.seed.js';

const incompatible: string[] = [];
const compatible: string[] = [];

for (const event of DEFAULT_ANOMALY_EVENTS) {
  const hasShipChanges = event.choices.some(c =>
    Object.keys(c.outcome.shipsGain ?? {}).length > 0 ||
    Object.keys(c.outcome.shipsLoss ?? {}).length > 0
  );
  (hasShipChanges ? incompatible : compatible).push(event.id);
}

// Output : list incompatible/compatible IDs
// Apply : UPDATE anomaly_content row.events to set enabled=false on incompatible ids
//         OR modify the seed file's enabled flags + re-run seed
```

Application : le script génère le SQL UPDATE ciblant les events incompatibles dans `anomaly_content.events` jsonb (via `jsonb_set`), ou plus simple : modifie le seed file directement (plus durable car la donnée DB est rebuild à chaque seed).

**Recommandation** : modifier le seed file directement avec `enabled: false` sur les events incompatibles. Documenter ces events dans un commentaire « # à refondre en V5 ». Le seed est appliqué à chaque deploy.

### 7.2 Engine — gating des choix dans `resolveEvent`

```ts
async resolveEvent(userId, input) {
  // ... existing logic loads `event` and `choice` ...

  // NEW V4 : valider gating
  if (choice.requiredHull) {
    const [flagship] = await tx.select({ hullId: flagships.hullId })
      .from(flagships).where(eq(flagships.userId, userId)).limit(1);
    if (flagship?.hullId !== choice.requiredHull) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Choix réservé à la coque ${choice.requiredHull}`,
      });
    }
  }
  if (choice.requiredResearch) {
    const [research] = await tx.select({ level: userResearch.level })
      .from(userResearch).where(and(
        eq(userResearch.userId, userId),
        eq(userResearch.researchId, choice.requiredResearch.researchId),
      )).limit(1);
    if ((research?.level ?? 0) < choice.requiredResearch.minLevel) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Recherche ${choice.requiredResearch.researchId} niveau ${choice.requiredResearch.minLevel} requis`,
      });
    }
  }

  // ... existing outcome application ...

  // NEW V4 : moduleDrop outcome
  if (choice.outcome.moduleDrop) {
    const [flagship] = await tx.select({ id: flagships.id, hullId: flagships.hullId })
      .from(flagships).where(eq(flagships.userId, userId)).limit(1);
    if (flagship) {
      // Reuse modulesService logic — pick a random module of the requested rarity
      // from the flagship's hull pool
      const moduleId = await modulesService.rollByRarity(
        tx,
        flagship.hullId ?? DEFAULT_HULL_ID,
        choice.outcome.moduleDrop,
      );
      if (moduleId) {
        await modulesService.grantModule(flagship.id, moduleId, tx);
        // Inject in returned outcome for UI display
      }
    }
  }
}
```

`modulesService.rollByRarity` est une **nouvelle méthode** à ajouter (extension du service modules). Pseudocode :

```ts
async rollByRarity(executor: Database, hullId: string, rarity: 'common' | 'rare' | 'epic'): Promise<string | null> {
  const pool = await getPool(executor);
  const cands = pool.filter(m => m.hullId === hullId && m.rarity === rarity);
  if (cands.length === 0) return null;
  return cands[Math.floor(Math.random() * cands.length)].id;
}
```

### 7.3 UI — gris-out des choix non éligibles

Dans `AnomalyEventCard.tsx` :
- Pre-fetch `flagship.hullId` + `userResearch` (déjà disponibles via `trpc.flagship.get` + `trpc.research.list`)
- Pour chaque `choice` :
  - Si `choice.requiredHull && flagship.hullId !== choice.requiredHull` → grayed-out + tooltip
  - Si `choice.requiredResearch && userResearch[id]?.level < minLevel` → grayed-out + tooltip
  - Click handler : disabled si non éligible

---

## 8. Loot & Exilium (récap)

| Mécanisme | Statut V4 |
|---|---|
| Drop modules per-combat (30% own + 5% other) | ✅ Inchangé (sprint 1) |
| Drop modules per-run final (selon depth) | ✅ Inchangé (sprint 1) |
| Drop ressources per-node (lootMinerai/Silicium/Hydrogene) | ✅ Inchangé |
| Drop Exilium per-node | ❌ AUCUN (Q5 décision D) |
| Bonus Exilium fin de run | ❌ AUCUN |
| Refund Exilium engagé sur retreat volontaire | ❌ NON (V4 : retreat = coût assumé) |
| Refund Exilium engagé sur runComplete | ❌ NON |
| Refund Exilium engagé sur wipe | ❌ NON |
| Recovery enemy ships (loot_ships) | ❌ SUPPRIMÉ — n'a plus de sens flagship-only (pas de planète d'attache où injecter), juste loot ressources |

**Conséquence économique** : chaque run engagée coûte 5 Exilium net, qu'elle soit réussie ou non. La motivation économique du joueur devient : modules + ressources (qui sont les vrais loot).

---

## 9. UI changes

### 9.1 `AnomalyEngageModal.tsx`

**Avant** : modal lourde avec selecteur de ships (interceptors, frégates, etc.) + sliders pour les counts + preview FP.

**Après** :
```
┌──────────────────────────────────┐
│ Engager une anomalie             │
├──────────────────────────────────┤
│ [Image coque flagship]            │
│                                   │
│ Coque : ${hullName}               │
│ Hull : ${hull} • Bouclier : ${shield} • ... │
│                                   │
│ Premier ennemi : ${enemyFP} FP    │
│ Charges réparation : 3/3 par run  │
│                                   │
│ Coût : 5 Exilium                  │
│                                   │
│  [Annuler]  [Engager]             │
└──────────────────────────────────┘
```

Suppression : selecteur ships, validation availability, slider counts.

### 9.2 `Anomaly.tsx` run view

Ajouts au hero existant :
- Indicateur "Charges réparation X/3" à côté de l'indicateur "Charges épiques X/3"
- Bouton "🔧 Réparer (+30%)" — disabled si 0 charges OU hull == 1.0

Le reste du run view (depth indicator, hull bar, combat preview, advance button, retreat button) reste identique.

### 9.3 `AnomalyCombatPreview.tsx`

Adapter le rendu pour 1 ship côté joueur (1 colonne ally vs N colonnes enemy). Probablement déjà géré via les types génériques mais à vérifier en implémentation.

### 9.4 `AnomalyEventCard.tsx`

Ajout du gris-out + tooltip pour les choix non éligibles (cf §7.3). Affichage de l'icône module à côté du choix si `outcome.moduleDrop` est set.

### 9.5 Combat reports

Le rendu du report (`ReportDetail.tsx` ou similaire) doit gérer le cas "1 ship côté ally". Probablement déjà OK mais à smoke tester.

---

## 10. Tests

### 10.1 Backend

- **Engage flagship-only** : vérifier que `fleet = { flagship: { count: 1, hullPercent: 1.0 } }` exactement, repair_charges initialisés
- **`useRepairCharge`** :
  - Happy path : -1 charge, +30% hull
  - Erreur si 0 charges
  - Erreur si hull == 1.0
  - Erreur si pas d'anomaly active
  - Clamp à 1.0 (charge gaspillée si déjà à 75% → +30% = 105% → clamp 1.0)
- **`advance` wipe** : flagship détruit → status 'wiped', tout perdu, flagship incapacité
- **`advance` survived** : flagship survit → loot OK, charges intactes, drops OK
- **`runComplete`** : depth 20 atteint → bonus drops max tier
- **`resolveEvent` gating** :
  - Choix avec `requiredHull` matching → OK
  - Choix avec `requiredHull` mismatching → erreur
  - Choix avec `requiredResearch` niveau OK → OK
  - Choix avec `requiredResearch` niveau insuffisant → erreur
- **`resolveEvent` moduleDrop** : choix avec `moduleDrop: 'common'` → grant un module commun de la coque

### 10.2 Frontend

- Smoke test : engager une anomaly, valider que la modal n'a pas de selecteur, que le coût 5 Exilium est affiché
- Smoke test : utiliser une charge réparation, vérifier que le hull bar monte
- Smoke test : voir un event avec un choix grisé (requiredHull non matching), vérifier le tooltip

---

## 11. Estimation

| Phase | Effort |
|---|---|
| DB migration 0070 + script TS forced retreat | 2h |
| Backend `engage` simplifié + `advance` wipe-only | 2h |
| Backend `useRepairCharge` mutation + service + tests | 1.5h |
| Backend events extension (moduleDrop, requiredHull, requiredResearch) | 1.5h |
| Audit + désactivation events (script + apply) | 1h |
| Frontend `AnomalyEngageModal` simplifié | 1h |
| Frontend run view : bouton repair charges + indicateur | 1.5h |
| Frontend combat preview/report adapter | 1h |
| Frontend events : grayed-out choix non éligibles | 1h |
| Tests + lint + smoke + push + deploy + annonce | 1.5h |
| **Total** | **~14h** |

---

## 12. Hors scope (différé)

- **Sub-projet 4** (Pirates IG → loot modules communs) — séparé
- **Sub-projet 5** (Missions explo refonte ou suppression) — séparé
- **Réécriture intégrale des 30 events désactivés** — futur patch V5 (avec gating richer, moduleDrop outcomes pour beaucoup d'entre eux)
- **Re-balance fine du tuning** (charges count, regen rate, drop rates, depth thresholds) — observation post-deploy + adjustments via universe_config (déjà tunable)
- **Game over alternatif** (escape pod / second chance) — pas dans V4, peut-être patch ultérieur si frustration trop forte
- **`flagshipCooldowns.talent_id` rename → `ability_id`** — cosmetic, défèré sprint séparé

---

## 13. Rollout & risques

### 13.1 Ordre de déploiement

**Mono-PR** pour éviter état intermédiaire cassé (front qui appelle l'ancien engage avec selecteur, back qui le refuse) :
1. Migration SQL 0070 + script TS migration
2. Backend `anomaly.service.ts` + `anomaly.combat.ts` refactor
3. Backend `useRepairCharge` mutation
4. Backend events extension + audit script
5. Frontend `AnomalyEngageModal` + run view + events grayed-out
6. Tests + lint + typecheck verts
7. Push + deploy
8. Smoke test prod
9. Annonce in-game

### 13.2 Risques

| Risque | Mitigation |
|---|---|
| Migration legacy casse les anomalies en cours | Dry-run sur staging d'abord, le script TS est idempotent via marker |
| Combat report front mal adapté pour 1 ship ally | Smoke test prod immédiat, fix rapide si visuel cassé |
| Charges réparation activées en plein combat (race condition) | Advisory lock + select FOR UPDATE sur l'anomaly row, vérification status |
| Wipe trop punitif → frustration joueurs | Tuning via universe_config (changer `anomaly_entry_cost_exilium`, augmenter `anomaly_repair_charges_per_run`) — pas de redeploy nécessaire |
| Events désactivés cassent la fréquence narrative | Le `combats_until_next_event` counter peut piocher dans un pool plus restreint, mais avec ~10-15 events actifs le pool reste suffisant pour ~6 événements par run profondeur 20 |
| Module rolls dans events biaisent l'économie modules | Rate limit naturel (les events sont rares + les outcomes moduleDrop sont optionnels par event — admin choisit où les placer) |

### 13.3 Tunables universe_config

Ajoutés en V4 :
- `anomaly_repair_charges_per_run` (default 3) — nombre de charges à l'engage
- `anomaly_repair_charge_hull_pct` (default 0.30) — % hull restauré par charge

Existants tunables :
- `anomaly_entry_cost_exilium` (default 5)
- `anomaly_node_travel_seconds` (default 600)
- `anomaly_loot_base` / `anomaly_loot_growth`
- `anomaly_enemy_base_ratio` / `anomaly_difficulty_growth` / `anomaly_enemy_max_ratio`
