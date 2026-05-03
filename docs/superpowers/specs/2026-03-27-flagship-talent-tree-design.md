> 🗄️ **ARCHIVÉ** — Le système de Talents a été retiré le 2026-05-03. Voir [`2026-05-03-talents-removal-design.md`](2026-05-03-talents-removal-design.md) pour la migration.

---

# Arbre de talents du Flagship — Design Spec

**Date :** 2026-03-27
**Statut :** Valide
**Prerequis :** Phase 1 (Exilium + Flagship + Daily Quests) terminee

---

## 1. Vue d'ensemble

L'arbre de talents est le systeme de progression du vaisseau amiral. Le joueur depense de l'Exilium pour debloquer des talents qui ameliorent son flagship et impactent son gameplay global.

**Structure :** 3 branches thematiques, style WoW Classic — grille avec talents a rangs multiples, fleches de prerequis, tiers debloques par seuil de points investis.

**Architecture :** 100% data-driven. Les talents, effets, couts, prerequis et cooldowns sont definis dans la game config (seed). Le code fournit des handlers d'effets generiques. Ajouter/modifier/supprimer un talent = modifier la config, pas le code.

---

## 2. Branches

### 2.1 Combattant (rouge)

Puissance de feu et domination militaire. Mix de buffs de stats au flagship et d'utilitaires militaires.

| Tier | Position | Nom | Rangs | Type | Effet par rang | Prerequis |
|------|----------|-----|-------|------|----------------|-----------|
| 1 | gauche | Armes renforcees | 3 | stat | +2 weapons | - |
| 1 | centre | Blindage reactif | 3 | stat | +2 armor | - |
| 1 | droite | Boucliers amplifies | 3 | stat | +3 shield | - |
| 2 | gauche | Tirs multiples | 2 | stat | +1 shotCount | Armes renforcees |
| 2 | centre | Marche de guerre | 1 | global | +1 vaisseau militaire en construction simultanee | - |
| 2 | droite | Coque renforcee | 3 | stat | +5 hull | Boucliers amplifies |
| 3 | gauche | Garnison | 2 | planet | +10% defense planetaire | - |
| 3 | centre | Assaut coordonne | 1 | actif | +25% degats de toutes les flottes partant de la planete du flagship pendant 1h (CD 24h) | - |
| 3 | droite | Furie | 2 | stat | x1.25 degats flagship | Tirs multiples |
| 4 | gauche | Maitre d'armes | 1 | global | -15% temps construction vaisseaux militaires | Garnison |
| 4 | droite | Arsenal avance | 1 | planet | +20% puissance des defenses planetaires | - |
| 5 | centre | Suprematie (capstone) | 1 | capstone | +10% stats combat flagship par type de vaisseau different dans la flotte | Maitre d'armes |

**Cout total branche :** 9 + 12 + 15 + 8 + 5 = **49 Exilium**

### 2.2 Explorateur (turquoise)

Vitesse, mobilite et decouverte. Ameliore la propulsion du flagship et donne des bonus de mobilite globaux.

| Tier | Position | Nom | Rangs | Type | Effet par rang | Prerequis |
|------|----------|-----|-------|------|----------------|-----------|
| 1 | gauche | Reacteurs optimises | 3 | stat | +10% vitesse flagship | - |
| 1 | centre | Economiseur | 3 | stat | -1 conso carburant | - |
| 1 | droite | Scanners longue portee | 2 | global | +1 sonde espionnage envoyee | - |
| 2 | gauche | Propulsion impulsion | 1 | stat | Change propulsion flagship en impulsion | Reacteurs optimises |
| 2 | centre | Navigation stellaire | 3 | global | -5% temps trajet toutes flottes | - |
| 2 | droite | Centre de controle | 1 | planet | +1 slot flotte depuis cette planete | - |
| 3 | gauche | Cartographe | 2 | global | +10% reussite expeditions | Propulsion impulsion |
| 3 | centre | Hyperscan | 1 | actif | Revele les flottes en approche pendant 4h (CD 12h) | - |
| 3 | droite | Eclaireur | 1 | global | +1 slot de flotte global | Centre de controle |
| 4 | gauche | Hyperdrive | 1 | stat | Change propulsion flagship en hyperespace | Cartographe |
| 4 | droite | Saut d'urgence | 1 | actif | Rappel instantane d'une flotte en cours (CD 24h) | - |
| 5 | centre | Navigateur legendaire (capstone) | 1 | capstone | Toutes les flottes partant de la planete du flagship +15% vitesse | Hyperdrive |

**Cout total branche :** 8 + 10 + 12 + 8 + 5 = **43 Exilium**

### 2.3 Negociant (or)

Cargo, commerce et economie. Ameliore la capacite du flagship et booste la production et le commerce.

| Tier | Position | Nom | Rangs | Type | Effet par rang | Prerequis |
|------|----------|-----|-------|------|----------------|-----------|
| 1 | gauche | Soute etendue | 3 | stat | +100 cargo flagship | - |
| 1 | centre | Negociateur | 2 | global | -5% frais marche | - |
| 1 | droite | Logisticien | 3 | planet | +5% capacite stockage | - |
| 2 | gauche | Convoi blinde | 2 | stat | +5 hull flagship | Soute etendue |
| 2 | centre | Reseau commercial | 1 | global | +1 offre simultanee marche | Negociateur |
| 2 | droite | Prospecteur | 3 | planet | +3% production mines | Logisticien |
| 3 | gauche | Contrebandier | 1 | global | 30% du cargo de toutes les flottes du joueur est protege du pillage | Convoi blinde |
| 3 | centre | Overclock minier | 1 | actif | +50% production mines pendant 2h (CD 24h) | Prospecteur |
| 3 | droite | Maitre des hangars | 2 | global | +10% cargo toutes flottes | - |
| 4 | gauche | Boom economique | 1 | actif | +25% production ressources planete pendant 4h (CD 48h) | Overclock minier |
| 4 | droite | Magnat | 1 | global | Transactions marche sans frais | Reseau commercial |
| 5 | centre | Empire commercial (capstone) | 1 | capstone | +5% production ressources sur toutes les planetes | Boom economique |

**Cout total branche :** 8 + 12 + 12 + 8 + 5 = **45 Exilium**

---

## 3. Types de talents

### 3.1 Stat (`modify_stat`)

Modifie directement une stat du flagship (weapons, shield, hull, armor, shotCount, speed, cargo, fuelConsumption, driveType). Toujours actif tant que le talent est debloque.

### 3.2 Passif global (`global_bonus`)

Bonus permanent au joueur, actif en permanence quel que soit l'etat du flagship (en mission, incapacite, etc.). Exemples : frais marche, slots de flotte, temps de construction.

### 3.3 Passif planetaire (`planet_bonus`)

Bonus applique uniquement a la planete ou le flagship est stationne (status `active`). Cesse immediatement quand le flagship quitte la planete (envoi en mission). Exemples : production mines, stockage, defense.

### 3.4 Actif (`timed_buff`)

Capacite activable depuis la page du flagship. Chaque actif a :
- **Duree d'effet** — combien de temps le buff est actif
- **Cooldown** — temps avant de pouvoir reactiver
- **Contrainte** — le flagship doit etre stationne (`active`) sur une planete pour activer

Une fois active, l'effet **persiste** meme si le flagship quitte la planete en mission. Le cooldown demarre a l'activation, pas a l'expiration.

### 3.5 Capstone

Talent ultime de la branche (tier 5, rang unique). Effet puissant qui definit l'identite de la branche. Peut etre de n'importe quel sous-type (stat, global, planet, actif).

---

## 4. Progression

### 4.1 Investissement libre

Le joueur peut investir dans toutes les branches simultanement. Pas de verrouillage exclusif. La rarete de l'Exilium force naturellement la priorisation.

### 4.2 Conditions de deblocage

Chaque tier requiert un nombre minimum de **points investis dans la branche** (pas de rangs, de points = somme des rangs achetes dans la branche) :

| Tier | Points requis |
|------|---------------|
| 1 | 0 |
| 2 | 5 |
| 3 | 10 |
| 4 | 15 |
| 5 | 20 |

En plus du seuil de tier, certains talents ont des **prerequis individuels** (un talent specifique doit etre debloque a au moins 1 rang). Ces prerequis sont visualises par des fleches dans l'UI.

### 4.3 Respec

| Action | Cout |
|--------|------|
| Respec individuel (un talent) | 50% de l'Exilium investi dans ce talent (arrondi sup) |
| Full reset (tout l'arbre) | 50 Exilium |

Le respec d'un talent rembourse 0 Exilium — c'est un cout sec. Si un talent en T2 a ete achete 3/3 (cout = 6 Exilium), le respec coute 3 Exilium.

Le respec d'un talent qui est prerequis d'un autre talent force aussi le respec du talent dependant (cascade).

---

## 5. Economie

### 5.1 Cout par rang

| Tier | Cout par rang |
|------|---------------|
| 1 | 1 Exilium |
| 2 | 2 Exilium |
| 3 | 3 Exilium |
| 4 | 4 Exilium |
| 5 | 5 Exilium |

### 5.2 Totaux

| Branche | Rangs | Cout total |
|---------|-------|------------|
| Combattant | 23 | 49 Exilium |
| Explorateur | 20 | 43 Exilium |
| Negociant | 21 | 45 Exilium |
| **Total** | **64** | **137 Exilium** |

### 5.3 Rythme de progression

| Profil joueur | Exilium/semaine | Temps pour tout debloquer |
|---------------|-----------------|---------------------------|
| Casual (~5/sem) | 5 | ~27 semaines (~7 mois) |
| Actif (~9/sem) | 9 | ~15 semaines (~4 mois) |
| Hardcore (~10/sem) | 10 | ~14 semaines (~3.5 mois) |

Tous les couts sont **parametrables** dans la game config. Si la progression est trop rapide, augmenter le cout par rang ou ajouter des talents.

---

## 6. Comportement du flagship en mission

| Type de talent | Flagship `active` | Flagship `in_mission` | Flagship `incapacitated` |
|----------------|-------------------|-----------------------|--------------------------|
| Stat | Actif | Actif | Actif (stats pretes au retour) |
| Passif global | Actif | Actif | Actif |
| Passif planetaire | Actif sur la planete | Inactif | Inactif |
| Actif (non lance) | Activable | Non activable | Non activable |
| Actif (deja lance) | En cours | Continue jusqu'a expiration | Continue jusqu'a expiration |

---

## 7. Architecture technique

### 7.1 Stockage

**Game config (seed) :** definition de tous les talents.

```typescript
// Structure d'un talent dans la config
interface TalentDefinition {
  id: string;                    // ex: 'combat_weapons'
  branch: 'combattant' | 'explorateur' | 'negociant';
  tier: 1 | 2 | 3 | 4 | 5;
  position: 'left' | 'center' | 'right';
  name: string;                  // nom affiche
  description: string;           // description affichee
  maxRanks: number;              // 1, 2, 3 ou 5
  prerequisiteId?: string;       // id du talent prerequis (fleche)
  effectType: 'modify_stat' | 'global_bonus' | 'planet_bonus' | 'timed_buff' | 'unlock';
  effectParams: Record<string, unknown>;
  // Pour modify_stat: { stat: 'weapons', perRank: 2 }
  // Pour global_bonus: { key: 'market_fee_reduction', perRank: 0.05 }
  // Pour planet_bonus: { key: 'mine_production', perRank: 0.03 }
  // Pour timed_buff: { key: 'mine_overclock', multiplier: 1.5, durationSeconds: 7200, cooldownSeconds: 86400 }
  // Pour unlock: { key: 'drive_impulse' }
}
```

**Table `flagship_talents` (nouvelle) :** stocke les rangs investis par le joueur.

```sql
CREATE TABLE flagship_talents (
  flagship_id UUID NOT NULL REFERENCES flagships(id) ON DELETE CASCADE,
  talent_id   VARCHAR(64) NOT NULL,
  current_rank INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (flagship_id, talent_id),
  CHECK (current_rank >= 0)
);
```

**Table `flagship_cooldowns` (nouvelle) :** stocke les timers des actifs.

```sql
CREATE TABLE flagship_cooldowns (
  flagship_id   UUID NOT NULL REFERENCES flagships(id) ON DELETE CASCADE,
  talent_id     VARCHAR(64) NOT NULL,
  activated_at  TIMESTAMPTZ NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  cooldown_ends TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (flagship_id, talent_id)
);
```

### 7.2 Handlers d'effets

Le code contient des handlers generiques, references par `effectType` :

| Handler | Responsabilite |
|---------|---------------|
| `modify_stat` | Au chargement du flagship, applique les bonus aux stats de base |
| `global_bonus` | Expose les bonus via un service de query, consomme par les systemes concernes |
| `planet_bonus` | Idem mais filtre par `flagship.planetId === planetId && flagship.status === 'active'` |
| `timed_buff` | Gere l'activation, verifie le cooldown, cree le record dans `flagship_cooldowns`, expose l'etat actif |

### 7.3 Lecture des bonus

Les systemes existants (fleet, market, resource, shipyard, combat) doivent consulter les bonus du talent tree quand ils effectuent leurs calculs. Pattern : le `talentService` expose des methodes comme :

```typescript
getStatBonuses(flagshipId): Record<string, number>
getGlobalBonuses(userId): Record<string, number>
getPlanetBonuses(userId, planetId): Record<string, number>
getActiveBuffs(flagshipId): ActiveBuff[]
activateBuff(flagshipId, talentId): void
```

Les systemes consommateurs appellent ces methodes et appliquent les bonus. Les handlers ne connaissent pas les talents specifiques — ils lisent la config.

### 7.4 API

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `flagship.talents.list` | Retourne l'arbre complet (config + rangs du joueur) |
| POST | `flagship.talents.invest` | Investir 1 rang dans un talent (depense Exilium) |
| POST | `flagship.talents.respec` | Respec un talent (cascade les dependants) |
| POST | `flagship.talents.resetAll` | Full reset (50 Exilium) |
| POST | `flagship.talents.activate` | Activer un buff temporaire |
| GET | `flagship.talents.cooldowns` | Etat des cooldowns actifs |

### 7.5 Frontend

- **Page Flagship** : affiche l'arbre en 3 colonnes (branches), avec fleches SVG pour les prerequis
- **Noeud de talent** : affiche icone, nom, rang actuel/max, cout du prochain rang, tooltip avec description
- **Actifs** : boutons d'activation avec timer de cooldown, dans la page flagship
- **Indicateurs planete** : dans le header de la planete, petit badge indiquant les bonus planetaires actifs du flagship

---

## 8. Parametres game config

Tous les nombres sont configurables :

| Parametre | Cle | Defaut |
|-----------|-----|--------|
| Cout par rang tier 1 | `talent_cost_tier_1` | 1 |
| Cout par rang tier 2 | `talent_cost_tier_2` | 2 |
| Cout par rang tier 3 | `talent_cost_tier_3` | 3 |
| Cout par rang tier 4 | `talent_cost_tier_4` | 4 |
| Cout par rang tier 5 | `talent_cost_tier_5` | 5 |
| Seuil tier 2 | `talent_tier_2_threshold` | 5 |
| Seuil tier 3 | `talent_tier_3_threshold` | 10 |
| Seuil tier 4 | `talent_tier_4_threshold` | 15 |
| Seuil tier 5 | `talent_tier_5_threshold` | 20 |
| Ratio respec individuel | `talent_respec_ratio` | 0.5 |
| Cout full reset | `talent_full_reset_cost` | 50 |

Les talents eux-memes (noms, effets, rangs, prerequis, positions) sont aussi dans la config, pas dans le code.

---

## 9. Resume des decisions

| Sujet | Decision |
|-------|----------|
| Structure | 3 branches thematiques, style WoW Classic |
| Branches | Combattant, Explorateur, Negociant |
| Grille | 5 tiers, 3 colonnes, ~10 noeuds/branche |
| Rangs | Talents a rangs multiples (1/1 a 3/3) |
| Progression | Libre entre branches, seuil de points par tier + prerequis individuels (fleches) |
| Cout | Progressif par tier (1 a 5 Exilium/rang) |
| Total | ~137 Exilium, ~4 mois joueur actif |
| Types d'effets | Stat, passif global, passif planetaire, actif (cooldown) |
| En mission | Stats + globaux restent, planetaires cessent, actifs lances persistent |
| Respec | Individuel 50% cout, full reset 50 Exilium, cascade prerequis |
| Architecture | 100% data-driven, handlers generiques, config dans le seed |
