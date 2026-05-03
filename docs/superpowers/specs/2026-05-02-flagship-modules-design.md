# Système de modules du Vaisseau Amiral — Design

> **Sous-projet 1/5** de la refonte Anomalie & Flagship. Voir `docs/proposals/2026-05-02-flagship-only-anomaly-roadmap.md` pour l'overview.

**Status :** validé 2026-05-02 — spec en attente de revue user avant plan d'implémentation.

## 1. Concept

Le système de talents du flagship (arbre + ranks + dépense Exilium) est remplacé par un **système de modules à slots**. Le flagship équipe **9 modules** par coque, avec 3 raretés et des effets allant des stats passives à une capacité active à charges. Les modules sont **lootés via les anomalies** (et plus tard via pirates IG), formant la fondation du loot loop de l'Anomalie V4.

**Pourquoi maintenant**
- L'Anomalie V4 (sub-projet 2) abandonne le combat avec flotte complète (pour cause de crash JS à dizaines de milliers de vaisseaux). Le flagship-only nécessite un système d'équipement digestible.
- L'arbre de talents actuel est figé, peu engageant. Le passage à des modules lootables crée un loop endgame plus riche.

## 2. Mécaniques cœur

### 2.1 Slots & raretés

Chaque coque a **9 slots** :
- **5 slots commun** : effets passifs additifs sur des stats (dmg, hull, shield, cargo, speed, regen…). Magnitude par module : `+5%` à `+10%`.
- **3 slots rare** : effets situationnels ou stats moyennes. Magnitude `+15%` à `+25%`. Exemples conditionnels : `1er round +50% dmg`, `sous 30% hull → +20% shield regen`.
- **1 slot épique** : capacité active à charges (voir §2.4).

### 2.2 Stacking

**Additif simple.** Deux modules `+8% dmg` = `+16% dmg`. Lisible, prévisible. Pas de soft cap en V1 — la limite naturelle vient du nombre de slots.

Un loadout complet (5 communs + 3 rares + 1 épique) procure ≈ **+80-100%** sur diverses stats + 3 effets conditionnels + 1 capacité active. Le flagship équipé est sérieusement plus fort que nu, sans rendre le flagship nu inutilisable pour les anomalies low-depth.

### 2.3 Liaison à la coque

**Pool 100% dédié par coque.** Chaque coque a son propre pool de modules. Un module `combat` ne peut pas être équipé sur une coque `scientific`.

- `combat` → modules attaque + bonus généralistes (HP, défense)
- `scientific` → modules recherche/scan + bonus généralistes
- `industrial` → modules cargo/minage/explo + bonus généralistes

Le pool de chaque coque mélange thématique (~70% des modules) + bonus généralistes (~30%) pour éviter qu'un joueur "scientifique" se retrouve sans option défensive viable.

Switcher de coque = changer tout le loadout (les modules de l'ancienne coque restent dans l'inventaire). Chaque coque garde son loadout actif persisté.

### 2.4 Capacité épique à charges

Le slot épique débloque une **capacité active**.

- **Démarrage de run** : 1 charge
- **Cap** : 3 charges
- **Sources de regen** :
  - Certains events anomaly (à concevoir dans la pool de 30 events V3 existants — refonte des outcomes nécessaire)
  - 1-2 modules rares spécifiques offrent `+1 charge` au démarrage ou `+0.5 charge tous les 3 combats`
- **Coût** : 1 charge par activation
- **Déclenchement** : bouton dédié sur la carte de preview du prochain combat, avant de cliquer "Lancer le combat". Une seule activation par combat possible.

Exemples d'épiques (à itérer en implémentation) :
- *Réparation d'urgence* (combat) : +50% hull immédiat
- *Surcharge tactique* (combat) : +100% dmg ce combat
- *Scan profond* (scientific) : révèle l'event suivant + ses outcomes cachés
- *Saut quantique* (industrial) : skip le prochain combat sans pertes ni loot

### 2.5 Pool size V1

| Coque | Communs | Rares | Épiques | Total |
|---|---:|---:|---:|---:|
| combat | 10 | 6 | 3 | 19 |
| scientific | 10 | 6 | 3 | 19 |
| industrial | 10 | 6 | 3 | 19 |
| **TOTAL** | **30** | **18** | **9** | **57** |

57 modules à concevoir + écrire pour V1. Chaque module : id stable, nom, flavor text, effet typé (Zod), image admin-uploadable.

## 3. Loot & économie

### 3.1 Acquisition pendant la run anomaly

**Per-combat won** (drop commun continu) :
- 30% chance : 1 module commun de TON pool de coque
- 5% chance : 1 module commun d'AUTRE coque (rare drop cross-coque)
- 65% chance : rien

**Per-run terminée vivant** (succès OU retreat) — bonus final scalé par profondeur atteinte :
| Depth | Bonus final |
|---|---|
| 1-3 | 1 commun |
| 4-7 | 1 rare |
| 8-12 | 1 rare + 30% chance épique |
| 13+ | 1 rare + 1 épique garanti |

**Wipe** : aucun loot final (les drops per-combat déjà attribués restent acquis).

### 3.2 Permanence

Les modules sont des **collectibles permanents**. Une fois loot → inventaire à vie. Duplicates possibles mais sans usage en V1 (futur : système de fusion/upgrade).

### 3.3 Sources futures (hors-scope V1)

- **Pirates IG** (sub-projet 4) : 1% drop commun par pirate killed en PvE missions
- **Events spéciaux** : certains events anomaly peuvent récompenser un module spécifique au lieu de stats

## 4. Équipement

- **Hors anomaly** : libre, instantané, gratuit depuis l'écran flagship
- **Pendant la run anomaly** : verrouillé. Le loadout snapshot est figé à l'engage et appliqué tel quel jusqu'au retour.
- **Validation** : un module ne peut être équipé que dans un slot de sa rareté (commun → slot commun, etc.) et de sa coque (modules combat → coque combat).

## 5. UI

### 5.1 Page `/flagship`

L'onglet "Talents" disparaît, remplacé par **"Modules"**.

**Layout fiche d'équipement RPG** :
- **Colonne gauche** (~360px) : silhouette du flagship avec 9 slots disposés
  - 1 slot épique au centre (gros, illuminé)
  - 3 slots rares en triangle autour
  - 5 slots communs en couronne externe
  - Slots vides : encart pointillé avec icône "+"
  - Slots équipés : icône module + tooltip survol (nom + effet)
- **Colonne droite** (flex) : inventaire filtrable
  - Filtres : rareté, statut (équipé/disponible/dupe), recherche texte
  - Chaque ligne : icône + nom + effet abrégé + bouton "Équiper" (slot auto-targeted) ou "Détails"
  - Tri par rareté décroissante puis nom

**Modal détail module** au clic : nom + flavor text + effet exact + slot visé + duplicates count.

### 5.2 Page `/anomalies`

(Sera refondue dans sub-projet 2.) Côté V1 modules :
- Mention en lecture du loadout actif (icônes des 9 modules dans le hero)
- L'engage modal supprimera la sélection de flotte (juste "confirmer l'engagement avec ce loadout ?")

### 5.3 Notifications de loot pendant la run

Toast simple violet en bas-droit : `✨ +1 module : Plaque blindée standard (commun)`. Auto-dismiss 4s. Pas de modal interrupt (perte de fluidité).

### 5.4 Modal "Butin de fin de run"

À l'arrivée (après retreat/succès) :
- Apparaît automatiquement
- Grille des modules loot pendant la run + module(s) bonus final mis en avant
- Ressources/Exilium récupérés (déjà existant)
- CTA "Voir mes modules" → `/flagship`

### 5.5 Admin `/admin/modules`

Pattern master/detail (réutiliser celui de `/admin/anomalies`) :
- **Rail gauche** : 3 sections (combat / scientific / industrial), chaque section liste les modules groupés par rareté
- **Detail droite** : éditeur — id, nom, rareté, effet (formulaire JSON validé Zod), image (`ModuleImageSlot`), flavor text, toggle enabled
- Save inline avec error feedback (pattern post-fix Anomalies admin)

## 6. Data model

### 6.1 Tables nouvelles

```sql
CREATE TABLE module_definitions (
  id           VARCHAR(64) PRIMARY KEY,
  hull_id      VARCHAR(32) NOT NULL,
  rarity       VARCHAR(16) NOT NULL,        -- 'common' | 'rare' | 'epic'
  name         VARCHAR(80) NOT NULL,
  description  TEXT NOT NULL,
  image        VARCHAR(500) NOT NULL DEFAULT '',
  enabled      BOOLEAN NOT NULL DEFAULT true,
  effect       JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_modules_hull_rarity ON module_definitions(hull_id, rarity);

CREATE TABLE flagship_module_inventory (
  flagship_id  UUID NOT NULL REFERENCES flagships(id) ON DELETE CASCADE,
  module_id    VARCHAR(64) NOT NULL REFERENCES module_definitions(id) ON DELETE CASCADE,
  count        SMALLINT NOT NULL DEFAULT 1 CHECK (count > 0),
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (flagship_id, module_id)
);
```

### 6.2 Modifications existantes

```sql
ALTER TABLE flagships
  ADD COLUMN module_loadout JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN epic_charges_current SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN epic_charges_max SMALLINT NOT NULL DEFAULT 1;

-- Drop legacy talents (refund script execute first, see §7)
DROP TABLE flagship_talents;
DROP TABLE talent_definitions;
```

### 6.3 Shape `module_loadout`

```ts
{
  combat:     { epic: 'mod-id' | null, rare: ['a','b','c'], common: ['1','2','3','4','5'] },
  scientific: { epic: ..., rare: [...], common: [...] },
  industrial: { epic: ..., rare: [...], common: [...] }
}
```

Slots vides = `null` (épique) ou tableau partiel (rare/common). Tableaux strictement de longueur ≤ 3 (rares) et ≤ 5 (communs).

### 6.4 Shape `effect` (JSONB)

```ts
type ModuleEffect =
  | { type: 'stat'; stat: 'damage' | 'hull' | 'shield' | 'cargo' | 'speed' | 'regen'; value: number }
  | { type: 'conditional'; trigger: 'first_round' | 'low_hull' | 'enemy_fp_above';
      threshold?: number; effect: { stat: string; value: number } }
  | { type: 'active'; ability: 'repair' | 'shield_burst' | 'overcharge' | 'scan' | 'skip' | 'damage_burst';
      magnitude: number };
```

Validation Zod stricte côté API (admin save + service equip). Effets non typés rejetés.

## 7. Migration

Script unique exécuté lors du déploiement (`packages/db/drizzle/0068_modules_init.sql`) :

1. **Créer les nouvelles tables** (`module_definitions`, `flagship_module_inventory`) + colonnes flagships.
2. **Refund Exilium** : pour chaque flagship, calculer `SUM(rank × cost_per_rank)` (la table `talent_definitions` actuelle expose le coût par rank). Crédit dans `user_exilium.balance` + log dans `exilium_log` source `talent_refund`.
3. **Seed les 57 modules** dans `module_definitions` via le code (fichier `default-modules.seed.ts`, parsé une fois et inséré).
4. **Starter pack** : pour chaque flagship, INSERT 1 module commun "starter" lié à la coque actuelle dans `flagship_module_inventory`. 3 starters à pré-définir dans le seed (un par coque).
5. **Drop legacy** : `DROP TABLE flagship_talents; DROP TABLE talent_definitions;`.

Le script est **idempotent** côté re-run (utilise `IF NOT EXISTS` et `ON CONFLICT`).

## 8. Architecture code

### 8.1 Game engine (`@exilium/game-engine`)

Nouveau module `formulas/modules.ts` :
- `parseLoadout(loadout, modulePool) → EquippedModules` : valide + résout les ids vers définitions complètes
- `applyModulesToStats(baseStats, modules) → ModifiedStats` : applique les effets stat additifs et conditionnels (selon contexte combat)
- `getMaxCharges(modules) → number` : somme des bonus charges du loadout
- `resolveActiveAbility(abilityId, magnitude, fleetState) → AppliedEffect` : applique une capacité épique

Tests unitaires : 15-20 cas couvrant chaque type d'effet, conditionnels, charges, edge cases.

### 8.2 API (`apps/api/src/modules/modules/`)

```
modules/
├── modules.types.ts       # Zod schemas + DEFAULT_MODULES seed
├── modules.service.ts     # equip/unequip, listInventory, dropRolls (per-combat + per-run)
├── modules.router.ts      # tRPC router
└── default-modules.seed.ts # 57 modules + 3 starters
```

Routes tRPC :
- `module.inventory.list` — modules possédés (groupés par coque/rareté)
- `module.loadout.get(hullId)` — loadout actif de la coque
- `module.loadout.equip({ hullId, slotType, slotIndex, moduleId })` — validation + persist
- `module.loadout.unequip({ hullId, slotType, slotIndex })`
- `module.admin.list` / `module.admin.upsert` / `module.admin.delete` — CRUD admin

Modifs **`anomaly.service.ts`** :
- Snapshot du loadout à l'engage (stocké sur la row anomaly pour cohérence pendant la run)
- Combat resolution : `applyModulesToStats(flagshipStats, equippedModules)` avant la simulation
- Per-combat : roll de drop, INSERT inventory si win
- Per-run final : roll de drop, INSERT inventory au retreat/succès
- Refonte des 30 events V3 : remplacer les outcomes "ships gain/loss" par "module commun bonus" ou "+ charge épique"

### 8.3 Front

```
apps/web/src/components/flagship/
├── ModuleLoadoutGrid.tsx       # silhouette + 9 slots
├── ModuleInventoryPanel.tsx    # liste filtrable + équipe
├── ModuleSlot.tsx              # 1 slot (vide ou occupé)
└── ModuleDetailModal.tsx       # détail au clic

apps/web/src/components/anomaly/
└── AnomalyLootSummaryModal.tsx # butin fin de run

apps/web/src/pages/Flagship.tsx # remove TalentsTab, add ModulesTab
```

```
apps/admin/src/pages/Modules.tsx                    # master/detail
apps/admin/src/components/ui/ModuleImageSlot.tsx    # upload pattern (hérite AnomalyImageSlot)
```

## 9. Tests

- **Engine** : 15-20 tests sur `applyModulesToStats`, conditionnels, charges, edge cases (loadout vide, modules duplicate)
- **Service** :
  - Equip validation (rareté/coque/slot) — 5-8 tests
  - Drop rolls (mock RNG, vérifier proba) — 4-6 tests
  - Migration script (refund correct, idempotence) — 3-5 tests
- **Front** : tests E2E lourds skippés en V1 (pattern existant), juste smoke tests sur `/flagship` rendering.

## 10. Edge cases

- **Joueur change de coque pendant qu'il a un loadout actif** : le loadout actuel reste persisté pour cette coque, le loadout de la nouvelle coque est chargé (vide au début).
- **Module supprimé en admin pendant qu'il est équipé** : au prochain `loadout.get`, on retire silencieusement l'id manquant (slot redevient vide).
- **Drop d'un module duplicate** : `count++` dans `flagship_module_inventory`. UI affiche `×2` à côté du module dupliqué. Ne sert à rien en V1, prep pour fusion future.
- **Charge épique > cap** : clampé silencieusement à `epic_charges_max`.
- **Joueur sans flagship encore créé** : système de modules indisponible. UI affiche un message d'incitation à débloquer le flagship.
- **Wipe en anomaly** : pas de loot final, mais les drops per-combat déjà acquis restent (insérés au fil de la run).

## 11. Migration & rollout

- **Pré-déploiement** : script de simulation du refund (sur staging) pour vérifier que les sommes Exilium calculées sont raisonnables.
- **Déploiement** : migration unique. Workers reload PM2 → cache flushed.
- **Communication** : announcement via `announcements` table : "Le système de talents a évolué. Votre Exilium a été remboursé. Consultez la nouvelle page Modules."

## 12. Hors-scope V1

- Système de fusion / upgrade de modules (consume duplicates → upgrade)
- Modules avec effets multi-stats ou multi-effets
- Set bonuses (équiper 3 modules de la même catégorie → bonus extra)
- Modules d'autres coques **équipables** (V1 : juste collectibles, équipement bloqué)
- Sources alternatives de loot (pirates IG = sub-projet 4)
- Réécriture des 30 events V3 anomaly pour outcomes module-aware (à faire dans sub-projet 2 Anomaly V4)
- 4e coque "espionnage" (futur, ajoute son pool de 19 modules)

## 13. Dépendances vers les autres sous-projets

- **Sub-projet 2 (Anomaly V4)** consomme les modules : combat resolution doit lire le loadout, drop rolls intégrés.
- **Sub-projet 3 (Tech tree)** : potentiellement gating de certains modules par techs débloquées (à valider, pas requis V1).
- **Sub-projet 4 (Pirates loot)** : étend les sources d'acquisition.
