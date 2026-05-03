# Suppression du système Talents — Spec

**Date :** 2026-05-03
**Sub-projet :** 2/5 (refonte Anomalie & Flagship)
**Statut :** Design validé, à planifier
**Sprint précédent :** [`2026-05-02-flagship-modules-design.md`](2026-05-02-flagship-modules-design.md) — système Modules livré

---

## 1. Contexte

Le sprint précédent a livré le système **Modules** (9 slots par coque, 57 modules lootés via anomalies, charges épiques). Il couvre les stats de combat du flagship (damage / hull / shield / armor) et les abilities actives.

Le système **Talents** existe en parallèle :
- 3 branches (Militaire, Industriel, Scientifique) × 19 talents
- Investissement Exilium par rang (1-3 rangs par talent)
- Effets répartis : combat, production, gameplay global, bonus planétaires
- 30 call sites consomment `talentService.computeTalentContext()` pour appliquer les bonus

La coexistence des deux systèmes crée :
- **Redondances** avec les passifs coque (mil_build_time -10% vs combat hull -20%)
- **Charge cognitive** joueur (deux progressions parallèles)
- **Code dupliqué** (modules + talents stockent des bonus de stats)

**Objectif :** Retirer le système Talents en redistribuant intelligemment les 19 effets vers les systèmes existants (modules, passifs coque, stats baseline, bâtiments) sans perte de pouvoir joueur.

**Hors scope :** Création de nouveaux modules. Le pool reste à 57. Aucune nouvelle mécanique.

---

## 2. Mapping des 19 talents

| # | Talent | Effet actuel (max) | Devient | Justification |
|---|---|---|---|---|
| 1 | mil_weapons | +6 weapons (rang 3) | **Modules combat existants** (% damage) | déjà couvert |
| 2 | mil_armor | +6 armor (rang 3) | **Modules combat existants** (% armor) | déjà couvert |
| 3 | mil_shield | +9 shield (rang 3) | **Modules combat existants** (% shield) | déjà couvert |
| 4 | mil_build_time | -10% build militaire | **Supprimé** | doublon coque combat -20% |
| 5 | mil_repair | -45% temps réparation flagship | **Passif coque combat** : `repair_time_reduction: 0.45` | thématique combat = guerrier auto-réparé |
| 6 | mil_parallel_build | +1 slot militaire parallèle | **commandCenter ≥10 sur planète flagship** | progression bâtiment naturelle |
| 7 | ind_cargo | +3000 cargo | **Stat baseline** : `cargoCapacity` 5000 → 8000 | tout le monde gagne, simple |
| 8 | ind_speed | +30% speed | **Stat baseline** : `baseSpeed` 10000 → 13000 | idem |
| 9 | ind_hull | +15 hull | **Modules industrial existants** (% hull) | déjà couvert |
| 10 | ind_build_time | -10% build industriel | **Supprimé** | doublon coque industrial -20% |
| 11 | ind_mining_speed | +45% minage | **Passif coque industrial** : `mining_speed_bonus: 0.45` | thématique mineur |
| 12 | ind_prospect_speed | +45% prospection | **Passif coque industrial** : `prospection_speed_bonus: 0.45` | thématique mineur |
| 13 | ind_parallel_build | +1 slot industriel parallèle | **shipyard ≥10 sur planète flagship** | progression bâtiment naturelle |
| 14 | sci_fuel | -3 fuel | **Stat baseline** : `fuelConsumption` 75 → 72 | tout le monde gagne, simple |
| 15 | sci_shots | +3 shots | **Stat baseline** : `shotCount` 2 → 5 | `shot_count` n'est pas dans `StatKey` modules — promu en baseline |
| 16 | sci_shield | +6 shield | **Modules scientific existants** (% shield) | déjà couvert |
| 17 | sci_research_time | -10% recherche | **Supprimé** | doublon coque scientific -20% |
| 18 | sci_energy | +6% énergie (planète flagship) | **Supprimé** | effet trop niche, refund Task 8 déjà fait |
| 19 | sci_shield_boost | +2 niveaux bouclier (planète flagship) | **Supprimé** | effet trop niche, refund Task 8 déjà fait |

### Impact joueur

- **Tout le monde gagne immédiatement** : +3 shots, +3000 cargo, +30% speed, -3 fuel sur tous les flagships, plus selon coque +45% mining/prospection ou -45% repair time.
- **Aucun nouveau module à looter** (pool reste à 57, l'engine modules est inchangé).
- **`parallel_build`** redevient accessible via la progression bâtiment standard (commandCenter / shipyard niveau 10).
- **Aucun re-refund Exilium** (l'edge case réinvestissement post-Task-8 est assumé marginal sur 13 flagships actifs).

---

## 3. Migration DB — `0069_talents_archive.sql`

```sql
-- 1. Archive les 4 tables talents (rename, données préservées pour audit)
ALTER TABLE flagship_talents              RENAME TO flagship_talents_archive;
ALTER TABLE talent_definitions            RENAME TO talent_definitions_archive;
ALTER TABLE talent_branch_definitions     RENAME TO talent_branch_definitions_archive;
ALTER TABLE flagship_cooldowns            RENAME TO flagship_cooldowns_archive;

-- 2. Stats baseline relevées sur tous les flagships existants
-- GREATEST/LEAST protège ceux qui auraient déjà des valeurs supérieures
UPDATE flagships SET
  cargo_capacity   = GREATEST(cargo_capacity, 8000),
  base_speed       = GREATEST(base_speed, 13000),
  fuel_consumption = LEAST(fuel_consumption, 72),
  shot_count       = GREATEST(shot_count, 5);

-- 3. Cleanup universe_config (clés liées aux talents)
DELETE FROM universe_config
WHERE key IN (
  'talent_cost_tier_1', 'talent_cost_tier_2', 'talent_cost_tier_3',
  'talent_cost_tier_4', 'talent_cost_tier_5',
  'talent_tier_2_threshold', 'talent_tier_3_threshold',
  'talent_tier_4_threshold', 'talent_tier_5_threshold',
  'talent_respec_ratio', 'talent_full_reset_cost'
);

-- 4. Marker idempotence
INSERT INTO _migrations_state (key, value)
VALUES ('flagship_talents_archived', 'done')
ON CONFLICT (key) DO UPDATE SET value = 'done', set_at = now();
```

**Notes :**
- `flagship_cooldowns` est archivé même si vide en pratique (aucun talent timed_buff seedé).
- Les tables _archive perdent les FK contraintes (Drizzle ne les déclare plus). Postgres garde les contraintes existantes au rename, donc `flagship_talents_archive.flagship_id` reste FK vers `flagships.id ON DELETE CASCADE` — comportement souhaité (l'archive disparaît avec le flagship, c'est juste une trace).
- La migration `0068` (sprint Modules) avait ajouté `_migrations_state.flagship_modules_refund` — la même table sert pour ce nouveau marker.

---

## 4. Mise à jour des coques

Modifier `packages/db/src/seed-game-config.ts` (`HULLS` array) :

```ts
{
  id: 'combat',
  passiveBonuses: {
    combat_build_time_reduction: 0.20,
    repair_time_reduction:       0.45,    // NEW (ex mil_repair max)
    bonus_armor: 6,
    bonus_shot_count: 2,
    bonus_weapons: 8,
  },
  bonusLabels: [
    '+6 blindage',
    '+2 attaques',
    '+8 armes',
    '-20% temps construction vaisseaux militaires',
    '-45% temps de réparation du flagship',  // NEW
  ],
  // ... reste inchangé
},
{
  id: 'industrial',
  passiveBonuses: {
    industrial_build_time_reduction: 0.20,
    mining_speed_bonus:              0.45,  // NEW (ex ind_mining_speed max)
    prospection_speed_bonus:         0.45,  // NEW (ex ind_prospect_speed max)
  },
  bonusLabels: [
    '-20% temps construction vaisseaux industriels',
    '+45% vitesse de minage',                  // NEW
    '+45% vitesse de prospection',             // NEW
    'Permet le minage et recyclage',
  ],
  // ... reste inchangé
},
{
  id: 'scientific',
  // INCHANGÉ — sci_research_time supprimé en doublon, sci_energy/shield_boost supprimés
},
```

---

## 5. Mécanisme parallel_build via bâtiments

Nouveau mécanisme : « slot bonus de bâtiment conditionné à la présence du flagship ». Implémenté dans le code consommateur des slots de queue.

### 5.1 Logique cible

```ts
function getParallelBuildSlots(planet, flagship, type: 'military' | 'industrial'): number {
  let slots = 1; // baseline 1 slot
  if (flagship && flagship.planetId === planet.id) {
    if (type === 'military'   && planet.commandCenterLevel >= 10) slots += 1;
    if (type === 'industrial' && planet.shipyardLevel      >= 10) slots += 1;
  }
  return slots;
}
```

### 5.2 Présence du flagship

- **Critère :** `flagship.planetId === planet.id` (base d'attache).
- **Pendant mission anomaly :** `flagship.status` passe à `in_mission` mais `planetId` reste = base d'attache (vérifié dans `flagship.service.ts` setInMission). **→ Le bonus reste actif.**
- **Pendant un déménagement (refit hull change) :** statut différent. **À tester en implémentation** : le slot bonus doit-il sauter ? Décision par défaut : **rester actif tant que `planetId` correspond, peu importe le statut** — cohérent avec « le flagship améliore sa planète d'attache ».

### 5.3 Localisation du code

À identifier précisément en implémentation. Pistes :
- `apps/api/src/modules/shipyard/shipyard.service.ts` — gère la queue de construction des vaisseaux
- `apps/api/src/modules/building/building.service.ts` — gère la queue des bâtiments (sans rapport ?)

Le talent actuel `military_parallel_build` / `industrial_parallel_build` est consommé via `computeTalentContext` qui retourne ces clés. Donc on peut (a) injecter ces mêmes clés dans le wrapper modifié `computeTalentContext` (cf §6), ou (b) laisser le code consommateur lire directement les niveaux de bâtiment.

**Choix recommandé : (a)** — minimum de changement, le code consommateur n'est pas touché.

```ts
// Dans le nouveau computeTalentContext (cf §6)
if (planetId && flagship.planetId === planetId) {
  const planetBuildings = await db.select(...).where(...);
  const cmdLevel = planetBuildings.find(pb => pb.buildingId === 'commandCenter')?.level ?? 0;
  const shyLevel = planetBuildings.find(pb => pb.buildingId === 'shipyard')?.level ?? 0;
  if (cmdLevel >= 10) ctx.military_parallel_build = (ctx.military_parallel_build ?? 0) + 1;
  if (shyLevel >= 10) ctx.industrial_parallel_build = (ctx.industrial_parallel_build ?? 0) + 1;
}
```

### 5.4 Indicateur UI

Sur la page bâtiment (commandCenter / shipyard), afficher un badge à partir du niveau 10 :
> **+1 slot construction parallèle** (actif si flagship attaché à cette planète)

Décor visuel uniquement, le calcul reste backend.

---

## 6. Refactor backend — `talentService` devient un thin wrapper

### 6.1 Stratégie

Garder l'API publique de `talentService.computeTalentContext(userId, planetId?)` (signature et type de retour identiques) pour ne PAS toucher aux 30 call sites consommateurs. Changer uniquement l'implémentation interne.

### 6.2 Code cible (remplace l'actuelle `computeTalentContext`)

```ts
async computeTalentContext(userId: string, planetId?: string): Promise<Record<string, number>> {
  // Plus de lecture de flagship_talents_archive — on retourne uniquement
  // les bonus coque + bâtiment.
  const [flagship] = await db
    .select({ id: flagships.id, planetId: flagships.planetId, status: flagships.status, hullId: flagships.hullId })
    .from(flagships)
    .where(eq(flagships.userId, userId))
    .limit(1);
  if (!flagship) return {};

  const config = await gameConfigService.getFullConfig();
  const ctx: Record<string, number> = {};

  // 1. Passifs coque (toujours actifs, pas conditionnés à la planète)
  if (flagship.hullId) {
    const hullConfig = config.hulls[flagship.hullId];
    if (hullConfig) {
      for (const [key, value] of Object.entries(hullConfig.passiveBonuses)) {
        // Conserver le préfixe `hull_` pour les bonus de réduction temps
        // (utilisé par les consumers existants comme `hull_combat_build_time_reduction`)
        if (key.endsWith('_time_reduction') || key.endsWith('_build_time_reduction')) {
          ctx[`hull_${key}`] = value as number;
        }
        // Bonus mining/prospection/repair NEW : exposés sans préfixe pour
        // remplacement direct des anciennes clés talent.
        if (key === 'mining_speed_bonus')      ctx['mining_speed']        = value as number;
        if (key === 'prospection_speed_bonus') ctx['prospection_speed']   = value as number;
        if (key === 'repair_time_reduction')   ctx['flagship_repair_time'] = value as number;
      }
    }
  }

  // 2. Parallel build via bâtiments (planète flagship uniquement)
  if (planetId && flagship.planetId === planetId) {
    const pbRows = await db
      .select({ buildingId: planetBuildings.buildingId, level: planetBuildings.level })
      .from(planetBuildings)
      .where(eq(planetBuildings.planetId, planetId));
    const cmdLevel = pbRows.find(pb => pb.buildingId === 'commandCenter')?.level ?? 0;
    const shyLevel = pbRows.find(pb => pb.buildingId === 'shipyard')?.level ?? 0;
    if (cmdLevel >= 10) ctx['military_parallel_build']   = (ctx['military_parallel_build']   ?? 0) + 1;
    if (shyLevel >= 10) ctx['industrial_parallel_build'] = (ctx['industrial_parallel_build'] ?? 0) + 1;
  }

  return ctx;
}
```

### 6.3 Méthodes à supprimer

| Méthode | Raison |
|---|---|
| `list` | UI talent supprimée |
| `invest` | UI talent supprimée |
| `respec` | UI talent supprimée |
| `resetAll` | UI talent supprimée |
| `activate` | Aucun talent timed_buff existant, mécanisme inutile |
| `getActiveBuffs` | Plus de timed_buff |
| `getStatBonuses` | Stats baseline déjà relevées via SQL UPDATE |
| `getGlobalBonuses` / `getPlanetBonuses` | Logique réabsorbée dans `computeTalentContext` |

**Le service ne garde QUE `computeTalentContext`.**

### 6.4 Renommage cosmétique

À faire dans une PR séparée plus tard (hors scope ce sprint pour limiter le diff) : renommer `talentService` en `flagshipBonusService` et `computeTalentContext` en `computeFlagshipBonusContext` via search/replace exhaustif.

### 6.5 Routes tRPC

Suppression complète :
- `talent: talentRouter` dans `app-router.ts`
- Fichier `apps/api/src/modules/flagship/talent.router.ts`

### 6.6 `gameConfigService`

Modifier `getFullConfig()` pour ne plus charger `config.talents` ni `config.talentBranches` (les tables ont été archivées, donc plus de données utiles). Solution : retourner `{}` et `[]` en valeurs vides constantes, garder les types pour compat ascendante.

### 6.7 `flagshipService.ts:122-123` — calcul stats effectives

```ts
// AVANT
const talentData = await talentService.list(userId);
const statBonuses = talentService.getStatBonuses(talentData.ranks, config.talents);

// APRÈS
const statBonuses = {}; // Plus de bonus runtime — stats baseline déjà relevées
```

Ou supprimer carrément l'addition `+ statBonuses` du calcul. À ajuster selon la suite du code.

### 6.8 Audit exhaustif des consumers

Avant push, lancer :
```bash
grep -rn "talentService\.\|talent\.list\|talent\.invest\|talent\.respec\|talent\.activate\|talent\.resetAll" /opt/exilium/apps/api/src
```
Vérifier que seul `computeTalentContext` reste utilisé. Toute autre référence = à nettoyer.

---

## 7. Refactor frontend

### 7.1 Web (`apps/web/src/`)

| Fichier | Action |
|---|---|
| `pages/FlagshipTalents.tsx` | **DELETE** |
| `components/flagship/TalentTree.tsx` | **DELETE** (avec ses sous-composants éventuels) |
| `pages/FlagshipProfile.tsx` | Supprimer ligne 36 (`trpc.talent.list.useQuery`) + ligne `<TalentTree showGuide />` (déjà sous `<ModulesTab>`) |
| `components/flagship/HullAbilitiesPanel.tsx` | Supprimer `trpc.talent.list.useQuery` + l'invalidation. Refactorer `cooldownData={talentData?.cooldowns?.[ability.id]}` — si les cooldowns d'abilities de coque (mine/recycle/scan) doivent persister, créer un nouveau mécanisme dédié (table `flagship_hull_cooldowns` ou stockage dans `flagships` row). **À trancher en implémentation** : si le scan_mission cooldown n'est pas réellement utilisé en prod (probable, vu que c'est lié au talent.list qui ne retourne pas ces ids), supprimer le param `cooldownData` |
| `router.tsx` | Supprimer route `/flagship/talents` |

### 7.2 Admin (`apps/admin/src/`)

| Fichier | Action |
|---|---|
| `pages/Talents.tsx` | **DELETE** |
| `pages/talents/` (dossier complet) | **DELETE** (`BranchCard.tsx`, `helpers.ts`, etc.) |
| `pages/player-detail/TalentsSection.tsx` | **DELETE** |
| `pages/PlayerDetail.tsx` | Supprimer import + render de `<TalentsSection>` |
| `pages/GameplayKeys.tsx` | Auditer pour supprimer toute option `'talent'` dans les listes de keys configurables |
| `components/layout/AdminLayout.tsx` | Supprimer entrée nav « Talents » |
| `router.tsx` | Supprimer route `/admin/talents` |

⚠️ Le dossier `pages/talents/` contient des fichiers nommés `FlagshipImagePool.tsx`, `HullConfigSection.tsx`, `HullEditModal.tsx` — vérifier s'ils sont **utilisés ailleurs** avant suppression. Si `HullEditModal` sert à éditer les coques (pas les talents), il doit être déplacé vers un dossier `pages/hulls/` ou `pages/flagship/`.

### 7.3 Pas de notification one-shot pour les joueurs

Le sprint Modules a déjà fait l'annonce générale. Ajouter une seconde annonce courte au moment du deploy :
> « Le système de talents est officiellement retiré. Vos bonus sont automatiquement appliqués (passifs coque, stats baseline relevées, slots de construction parallèle débloqués via centre de commandement / chantier spatial niveau 10). »

---

## 8. Tests

### 8.1 Suppressions

- `apps/api/src/modules/flagship/__tests__/talent.service.test.ts` (s'il existe)
- Tests web touchant TalentTree

### 8.2 Ajouts

#### 8.2.1 Tests `getParallelBuildSlots` (intégration)

```ts
describe('parallel_build via buildings', () => {
  it('returns +1 mil slot when commandCenter ≥10 and flagship attached', async () => {
    // Setup: planet avec commandCenter level 10, flagship.planetId === planet.id
    const ctx = await talentService.computeTalentContext(userId, planet.id);
    expect(ctx.military_parallel_build).toBe(1);
  });

  it('returns 0 mil slot when commandCenter <10', async () => {
    // commandCenter level 9
    const ctx = await talentService.computeTalentContext(userId, planet.id);
    expect(ctx.military_parallel_build).toBeUndefined();
  });

  it('returns 0 mil slot when flagship on another planet', async () => {
    // commandCenter ≥10 mais flagship.planetId !== planet.id
    const ctx = await talentService.computeTalentContext(userId, planet.id);
    expect(ctx.military_parallel_build).toBeUndefined();
  });

  it('returns +1 ind slot when shipyard ≥10 and flagship attached', async () => {
    // Idem pour shipyard
  });
});
```

#### 8.2.2 Tests passifs coque appliqués

```ts
describe('hull passives via computeTalentContext', () => {
  it('industrial hull returns +45% mining', async () => {
    const ctx = await talentService.computeTalentContext(userId);
    expect(ctx.mining_speed).toBe(0.45);
  });

  it('combat hull returns -45% repair time', async () => {
    const ctx = await talentService.computeTalentContext(userId);
    expect(ctx.flagship_repair_time).toBe(0.45);
  });

  it('industrial hull does NOT return repair_time', async () => {
    // Coque industrial n'a pas repair_time_reduction
    const ctx = await talentService.computeTalentContext(userId);
    expect(ctx.flagship_repair_time).toBeUndefined();
  });
});
```

#### 8.2.3 Tests stats baseline

```ts
describe('flagship baseline stats post-migration', () => {
  it('newly created flagship has elevated baseline', async () => {
    const flagship = await flagshipService.create(userId, planetId);
    expect(flagship.cargoCapacity).toBe(8000);
    expect(flagship.baseSpeed).toBe(13000);
    expect(flagship.fuelConsumption).toBe(72);
    expect(flagship.shotCount).toBe(5);
  });
});
```

(Le test « migration UPDATE existing flagships » est testé manuellement en smoke prod, pas en unitaire.)

---

## 9. Cleanup documentation

Ajouter un bandeau « 🗄️ ARCHIVÉ — système retiré le 2026-05-03, voir [`2026-05-03-talents-removal-design.md`](2026-05-03-talents-removal-design.md) » en tête de :

- `docs/processes/talent-creation-process.md`
- `docs/superpowers/specs/2026-03-27-flagship-talent-tree-design.md`
- `docs/superpowers/specs/2026-03-28-talent-effect-system-design.md`
- `docs/superpowers/specs/2026-04-03-sci-energy-talent-design.md`
- `docs/superpowers/plans/2026-03-27-phase2-flagship-talents.md`

Pas de suppression — historique préservé pour audit / contexte futur.

---

## 10. Rollout & risques

### 10.1 Ordre

**Une seule PR / un seul deploy** pour éviter un état intermédiaire cassé (back qui renvoie 404 sur talent.* alors que le front les appelle encore).

Étapes côté code :
1. Migration SQL `0069_talents_archive.sql`
2. Backend : refactor `talentService` (computeTalentContext seul) + suppression talent.router + cleanup flagshipService + cleanup gameConfigService
3. Frontend web : delete FlagshipTalents.tsx + TalentTree.tsx + cleanup FlagshipProfile/HullAbilitiesPanel
4. Frontend admin : delete Talents.tsx + dossier talents/ + cleanup PlayerDetail + nav
5. Tests : delete obsolètes + add nouveaux
6. Doc cleanup
7. Lint + typecheck verts → commit unique
8. Push main → deploy.sh
9. Smoke prod : ouvrir `/flagship`, vérifier disparition TalentTree, vérifier mining bonus actif sur joueur industrial, vérifier slot bonus sur planète avec commandCenter ≥10
10. Annonce in-game

### 10.2 Risques

| Risque | Mitigation |
|---|---|
| Consumer `talentService` oublié → erreur runtime | Grep exhaustif post-refactor : `grep -rn "talentService\." /opt/exilium/apps/api/src` doit ne retourner QUE `computeTalentContext` |
| Front qui appelle `trpc.talent.*` post-deploy → erreur tRPC | Grep exhaustif : `grep -rn "trpc\.talent\." /opt/exilium/apps/{web,admin}/src` doit retourner 0 résultat |
| Bonus de coque mal câblé (le SUM mining_speed devient 0 en prod) | Tests d'intégration §8.2.2 + smoke test prod sur joueur industrial |
| `flagship_cooldowns_archive` rename casse une migration future | Marker `_migrations_state.flagship_talents_archived` permet de re-run le SQL idempotent |
| Stats baseline UPDATE écrase une stat custom (joueur ayant > baseline déjà) | `GREATEST/LEAST` protège ce cas |
| Joueur ayant réinvesti son Exilium post-Task-8 dans un talent → perd la mise sans refund | Assumé marginal sur 13 flagships actifs en quelques jours. Si plainte, refund manuel |
| HullAbilitiesPanel cooldownData devient cassé → cooldown UI absent sur scan_mission | Si réellement utilisé : créer mécanisme dédié ; sinon supprimer le param |

### 10.3 Rollback

En cas de problème majeur post-deploy :
- Les 4 tables `_archive` permettent de restaurer les data via `ALTER TABLE _archive RENAME TO ...` inverse
- Le code talentService backup en git permet revert via `git revert <sha>` + redeploy
- Stats baseline restent (pas de rollback nécessaire — gain joueur préservé)
- Aucune perte data joueur car aucun DROP

---

## 11. Estimation

| Phase | Effort estimé |
|---|---|
| Migration DB + universe_config cleanup | 0.5h |
| Backend refactor talentService thin wrapper + audit consumers | 3h |
| Backend cleanup flagshipService + gameConfigService + tests | 1.5h |
| Frontend web (FlagshipTalents/TalentTree/HullAbilitiesPanel) | 2h |
| Frontend admin (Talents page + PlayerDetail + nav) | 1.5h |
| Tests unitaires + intégration | 1.5h |
| Doc cleanup | 0.5h |
| Lint/typecheck/smoke + push + annonce | 1h |
| **Total** | **~11.5h** |

---

## 12. Hors scope (différé)

- **Renommage cosmétique** `talentService → flagshipBonusService` (à faire dans une PR séparée plus tard, ne change pas le comportement)
- **Suppression définitive** des tables `_archive` (peut se faire dans 2-3 sprints quand l'audit historique n'est plus utile)
- **Création de nouveaux modules non-combat** (pool reste à 57)
- **Refactor du système de cooldowns hull abilities** (si finalement on en a besoin — à valider en implémentation que le scan_mission cooldown est utilisé)
